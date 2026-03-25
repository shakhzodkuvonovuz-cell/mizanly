import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductCategory, HalalCategory, ZakatCategory, VolunteerCategory, OrderStatus, ProductStatus, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
  private stripe: Stripe;
  private readonly stripeAvailable: boolean;

  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripeAvailable = !!secretKey;
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not set — order payment processing will fail');
    }
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    });
  }

  private ensureStripeAvailable(): void {
    if (!this.stripeAvailable) {
      throw new BadRequestException('Payment service is not configured');
    }
  }

  // ── Products / Marketplace ──────────────────────────────

  async createProduct(userId: string, dto: {
    title: string; description: string; price: number; currency?: string;
    images: string[]; category: string; isHalal?: boolean; isMuslimOwned?: boolean;
    stock?: number; tags?: string[]; location?: string; shippingInfo?: string; halalCertUrl?: string;
  }) {
    if (dto.price <= 0) {
      throw new BadRequestException('Price must be positive');
    }
    return this.prisma.product.create({
      data: { sellerId: userId, ...dto, category: dto.category as ProductCategory, currency: dto.currency || 'USD', stock: dto.stock || 1 },
      include: { seller: { select: USER_SELECT } },
    });
  }

  async getProducts(cursor?: string, limit = 20, category?: string, search?: string) {
    limit = Math.min(Math.max(limit, 1), 50);
    const where: Record<string, unknown> = { status: ProductStatus.ACTIVE };
    if (category) where.category = category;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { seller: { select: USER_SELECT } },
    });

    const hasMore = products.length > limit;
    if (hasMore) products.pop();
    return { data: products, meta: { cursor: products[products.length - 1]?.id || null, hasMore } };
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { seller: { select: USER_SELECT }, reviews: { take: 10, orderBy: { createdAt: 'desc' }, include: { user: { select: USER_SELECT } } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(userId: string, productId: string, dto: {
    title?: string; description?: string; price?: number; images?: string[];
    category?: string; isHalal?: boolean; isMuslimOwned?: boolean; stock?: number;
    tags?: string[]; location?: string; shippingInfo?: string; halalCertUrl?: string; status?: string;
  }) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId !== userId) throw new ForbiddenException('Not the product owner');

    if (dto.price !== undefined && dto.price <= 0) {
      throw new BadRequestException('Price must be positive');
    }
    if (dto.status && !['ACTIVE', 'DRAFT', 'SOLD_OUT', 'REMOVED'].includes(dto.status)) {
      throw new BadRequestException('Invalid product status');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { ...dto, category: dto.category as ProductCategory | undefined, status: dto.status as ProductStatus | undefined },
      include: { seller: { select: USER_SELECT } },
    });
  }

  async deleteProduct(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId !== userId) throw new ForbiddenException('Not the product owner');

    // Check for active orders
    const activeOrders = await this.prisma.order.count({
      where: { productId, status: { in: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SHIPPED] } },
    });
    if (activeOrders > 0) {
      throw new BadRequestException('Cannot delete product with active orders');
    }

    await this.prisma.product.delete({ where: { id: productId } });
    return { message: 'Product deleted successfully' };
  }

  async reviewProduct(userId: string, productId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be 1-5');

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId === userId) throw new BadRequestException('Cannot review your own product');

    let review;
    try {
      review = await this.prisma.productReview.create({
        data: { productId, userId, rating, comment },
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('Already reviewed this product');
      }
      throw err;
    }

    // Update average rating
    const agg = await this.prisma.productReview.aggregate({ where: { productId }, _avg: { rating: true }, _count: true });
    await this.prisma.product.update({
      where: { id: productId },
      data: { rating: agg._avg.rating || 0, reviewCount: agg._count },
    });
    return review;
  }

  // ── Orders / Checkout ───────────────────────────────────

  async createOrder(userId: string, dto: { productId: string; quantity?: number; installments?: number; shippingAddress?: string }) {
    this.ensureStripeAvailable();

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== ProductStatus.ACTIVE) throw new BadRequestException('Product not available');
    if (product.sellerId === userId) throw new BadRequestException('Cannot buy your own product');

    const qty = dto.quantity || 1;
    if (qty < 1 || qty > 100) throw new BadRequestException('Invalid quantity');
    if (product.stock < qty) throw new BadRequestException('Not enough stock');

    const installments = dto.installments || 1;
    if (installments < 1 || installments > 4) throw new BadRequestException('Installments must be 1-4');

    const totalAmount = Number(product.price) * qty;
    const currency = product.currency || 'USD';

    // Create Stripe PaymentIntent before the order
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(totalAmount * 100), // convert to cents
        currency: currency.toLowerCase(),
        metadata: {
          orderId: 'pending', // will update after order creation
          productId: product.id,
          buyerId: userId,
          sellerId: product.sellerId,
          type: 'marketplace_order',
        },
        automatic_payment_methods: { enabled: true },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stripe PaymentIntent creation failed for order: ${msg}`);
      throw new BadRequestException('Payment processing failed — please try again');
    }

    // Use a transaction to atomically check stock and create order
    // This prevents overselling under concurrent orders
    let order: { id: string; totalAmount: unknown; currency: string; status: string; stripePaymentId: string | null; product: unknown; [key: string]: unknown };
    try {
      order = await this.prisma.$transaction(async (tx) => {
        // Atomically decrement stock only if sufficient
        const updated = await tx.product.updateMany({
          where: { id: dto.productId, stock: { gte: qty }, status: ProductStatus.ACTIVE },
          data: { stock: { decrement: qty }, salesCount: { increment: qty } },
        });

        if (updated.count === 0) {
          throw new BadRequestException('Product unavailable or insufficient stock');
        }

        return tx.order.create({
          data: {
            buyerId: userId,
            productId: dto.productId,
            quantity: qty,
            totalAmount,
            currency,
            installments,
            shippingAddress: dto.shippingAddress,
            stripePaymentId: paymentIntent.id,
            status: OrderStatus.PENDING,
          },
          include: { product: true },
        });
      });
    } catch (error: unknown) {
      // If order creation fails, cancel the PaymentIntent to avoid orphaned intents
      try {
        await this.stripe.paymentIntents.cancel(paymentIntent.id);
      } catch (cancelErr: unknown) {
        const cancelMsg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
        this.logger.warn(`Failed to cancel orphaned PaymentIntent ${paymentIntent.id}: ${cancelMsg}`);
      }
      throw error;
    }

    // Update PaymentIntent metadata with the real orderId so webhook can find it
    try {
      await this.stripe.paymentIntents.update(paymentIntent.id, {
        metadata: { ...paymentIntent.metadata, orderId: order.id },
      });
    } catch {
      // Non-critical: order still exists, webhook can fall back to querying by stripePaymentId
      this.logger.warn(`Failed to update PI ${paymentIntent.id} metadata with orderId ${order.id}`);
    }

    // Notify seller about the new order (outside transaction, fire-and-forget)
    this.notificationsService.create({
      userId: product.sellerId,
      actorId: userId,
      type: 'SYSTEM',
      title: 'New order',
      body: `You received a new order for "${product.title}"`,
    }).catch(err => this.logger.warn('Order notification failed', err.message));

    return { order, clientSecret: paymentIntent.client_secret };
  }

  async getMyOrders(userId: string, cursor?: string, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 50);

    const orders = await this.prisma.order.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { product: { select: { id: true, title: true, images: true, price: true } } },
    });

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();
    return { data: orders, meta: { cursor: orders[orders.length - 1]?.id || null, hasMore } };
  }

  async getSellerOrders(sellerId: string, cursor?: string, limit = 20, status?: string) {
    limit = Math.min(Math.max(limit, 1), 50);
    const where: Record<string, unknown> = { product: { sellerId } };
    if (status) where.status = status;

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        product: { select: { id: true, title: true, images: true, price: true } },
        buyer: { select: USER_SELECT },
      },
    });

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();
    return { data: orders, meta: { cursor: orders[orders.length - 1]?.id || null, hasMore } };
  }

  /**
   * Finding #134: Seller analytics — total sales, revenue, top products.
   */
  async getSellerAnalytics(sellerId: string) {
    const [products, orderCount, totalRevenue] = await Promise.all([
      this.prisma.product.findMany({
        where: { sellerId, status: 'ACTIVE' },
        select: { id: true, title: true, salesCount: true, price: true, rating: true, images: true },
        orderBy: { salesCount: 'desc' },
        take: 10,
      }),
      this.prisma.order.count({ where: { product: { sellerId } } }),
      this.prisma.order.aggregate({
        where: { product: { sellerId }, status: 'PAID' },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalProducts: products.length,
      totalOrders: orderCount,
      totalRevenue: Number(totalRevenue._sum.totalAmount ?? 0),
      topProducts: products.slice(0, 5),
    };
  }

  async updateOrderStatus(orderId: string, sellerId: string, status: string) {
    const VALID_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
    if (!VALID_STATUSES.includes(status)) throw new BadRequestException('Invalid order status');

    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
    if (!order) throw new NotFoundException();
    if (order.product.sellerId !== sellerId) throw new ForbiddenException();

    // Validate status transitions
    const VALID_TRANSITIONS: Record<string, string[]> = {
      PENDING: ['PAID', 'CANCELLED'],
      PAID: ['SHIPPED', 'REFUNDED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: [],
      CANCELLED: [],
      REFUNDED: [],
    };
    if (!VALID_TRANSITIONS[order.status]?.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${status}`);
    }

    // Restore stock and decrement salesCount on cancellation/refund
    if ((status === 'CANCELLED' || status === 'REFUNDED') && order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.REFUNDED) {
      await this.prisma.product.updateMany({
        where: { id: order.productId, salesCount: { gt: 0 } },
        data: { stock: { increment: order.quantity }, salesCount: { decrement: order.quantity } },
      });
    }

    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { status: status as OrderStatus } });

    // Notify the buyer about order status change (skip if buyer was deleted)
    if (order.buyerId) {
      this.notificationsService.create({
        userId: order.buyerId,
        actorId: sellerId,
        type: 'SYSTEM',
        title: 'Order updated',
        body: `Your order status changed to "${status}"`,
      }).catch(err => this.logger.warn('Order status notification failed', err.message));
    }

    return updated;
  }

  // ── Halal Business Directory ────────────────────────────

  async createBusiness(userId: string, dto: {
    name: string; description?: string; category: string; address?: string;
    lat?: number; lng?: number; phone?: string; website?: string;
    avatarUrl?: string; coverUrl?: string; isMuslimOwned?: boolean; halalCertUrl?: string;
  }) {
    return this.prisma.halalBusiness.create({
      data: { ownerId: userId, ...dto, category: dto.category as HalalCategory },
    });
  }

  async getBusinesses(cursor?: string, limit = 20, category?: string, lat?: number, lng?: number) {
    const where: Record<string, unknown> = {};
    if (category) where.category = category;

    const businesses = await this.prisma.halalBusiness.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { owner: { select: USER_SELECT } },
    });

    const hasMore = businesses.length > limit;
    if (hasMore) businesses.pop();
    return { data: businesses, meta: { cursor: businesses[businesses.length - 1]?.id || null, hasMore } };
  }

  async reviewBusiness(userId: string, businessId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be 1-5');

    const business = await this.prisma.halalBusiness.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerId === userId) throw new BadRequestException('Cannot review your own business');

    let review;
    try {
      review = await this.prisma.businessReview.create({
        data: { businessId, userId, rating, comment },
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('Already reviewed this business');
      }
      throw err;
    }

    const agg = await this.prisma.businessReview.aggregate({ where: { businessId }, _avg: { rating: true }, _count: true });
    await this.prisma.halalBusiness.update({
      where: { id: businessId },
      data: { rating: agg._avg.rating || 0, reviewCount: agg._count },
    });
    return review;
  }

  async updateBusiness(userId: string, businessId: string, dto: {
    name?: string; description?: string; category?: string; address?: string;
    lat?: number; lng?: number; phone?: string; website?: string;
    avatarUrl?: string; coverUrl?: string; isMuslimOwned?: boolean; halalCertUrl?: string;
  }) {
    const business = await this.prisma.halalBusiness.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerId !== userId) throw new ForbiddenException('Not the business owner');

    return this.prisma.halalBusiness.update({
      where: { id: businessId },
      data: { ...dto, category: dto.category as HalalCategory | undefined },
      include: { owner: { select: USER_SELECT } },
    });
  }

  async deleteBusiness(userId: string, businessId: string) {
    const business = await this.prisma.halalBusiness.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerId !== userId) throw new ForbiddenException('Not the business owner');

    await this.prisma.halalBusiness.delete({ where: { id: businessId } });
    return { message: 'Business deleted successfully' };
  }

  // ── Zakat ───────────────────────────────────────────────

  async createZakatFund(userId: string, dto: {
    title: string; description: string; goalAmount: number; category: string; currency?: string;
  }) {
    return this.prisma.zakatFund.create({
      data: { recipientId: userId, ...dto, category: dto.category as ZakatCategory, currency: dto.currency || 'USD' },
    });
  }

  async getZakatFunds(cursor?: string, limit = 20, category?: string) {
    limit = Math.min(Math.max(limit, 1), 50);
    const where: Record<string, unknown> = { status: 'active' };
    if (category) where.category = category;

    const funds = await this.prisma.zakatFund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { recipient: { select: USER_SELECT }, _count: { select: { donations: true } } },
    });

    const hasMore = funds.length > limit;
    if (hasMore) funds.pop();
    return { data: funds, meta: { cursor: funds[funds.length - 1]?.id || null, hasMore } };
  }

  async donateZakat(userId: string, fundId: string, dto: { amount: number; isAnonymous?: boolean }) {
    throw new BadRequestException('Zakat donations require payment integration. Coming soon.');

    if (!dto.amount || dto.amount <= 0 || dto.amount > 1_000_000) {
      throw new BadRequestException('Invalid donation amount');
    }

    const fund = await this.prisma.zakatFund.findUnique({ where: { id: fundId } });
    if (!fund || fund!.status !== 'active') throw new NotFoundException('Fund not found or closed');

    // Prevent self-donation (fund creator donating to own fund)
    if (fund!.recipientId === userId) {
      throw new BadRequestException('Cannot donate to your own zakat fund');
    }

    // Use transaction to atomically create donation + update raisedAmount
    return this.prisma.$transaction(async (tx) => {
      const donation = await tx.zakatDonation.create({
        data: { fundId, donorId: userId, amount: dto.amount, isAnonymous: dto.isAnonymous || false },
      });

      const updated = await tx.zakatFund.update({
        where: { id: fundId },
        data: { raisedAmount: { increment: dto.amount } },
      });

      // Auto-complete if goal reached
      if (Number(updated.raisedAmount) >= Number(updated.goalAmount)) {
        await tx.zakatFund.update({
          where: { id: fundId },
          data: { status: 'completed' },
        });
      }

      return donation;
    });
  }

  // ── Community Treasury ──────────────────────────────────

  async createTreasury(userId: string, circleId: string, dto: {
    title: string; description?: string; goalAmount: number; currency?: string;
  }) {
    // Verify user is a member of the circle
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You must be a member of the circle to create a treasury');
    }

    return this.prisma.communityTreasury.create({
      data: { circleId, createdById: userId, ...dto, currency: dto.currency || 'USD' },
    });
  }

  async contributeTreasury(userId: string, treasuryId: string, amount: number) {
    throw new BadRequestException('Treasury contributions require payment integration. Coming soon.');

    if (!amount || amount <= 0 || amount > 1_000_000) {
      throw new BadRequestException('Invalid contribution amount');
    }
    const treasury = await this.prisma.communityTreasury.findUnique({
      where: { id: treasuryId },
      select: { id: true, status: true, circleId: true, goalAmount: true, raisedAmount: true },
    });
    if (!treasury || treasury!.status !== 'active') throw new NotFoundException();

    // Verify user is a member of the circle
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: treasury!.circleId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You must be a member of the circle to contribute');
    }

    // Check if fund goal has already been reached
    if (Number(treasury!.raisedAmount) >= Number(treasury!.goalAmount)) {
      throw new BadRequestException('Treasury goal has already been reached');
    }

    // Use transaction to prevent race condition on raisedAmount
    return this.prisma.$transaction(async (tx) => {
      // Re-check treasury status atomically
      const current = await tx.communityTreasury.findUnique({
        where: { id: treasuryId },
        select: { status: true, raisedAmount: true, goalAmount: true },
      });
      if (!current || current.status !== 'active') {
        throw new BadRequestException('Treasury is no longer active');
      }

      await tx.treasuryContribution.create({
        data: { treasuryId, userId, amount },
      });

      // Update raised amount atomically
      const updated = await tx.communityTreasury.update({
        where: { id: treasuryId },
        data: { raisedAmount: { increment: amount } },
      });

      // Auto-complete if goal reached
      if (Number(updated.raisedAmount) >= Number(updated.goalAmount)) {
        await tx.communityTreasury.update({
          where: { id: treasuryId },
          data: { status: 'completed' },
        });
      }

      return { success: true };
    });
  }

  // ── Waqf (Endowment) ───────────────────────────────────

  async getWaqfFunds(cursor?: string, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 50);

    const funds = await this.prisma.waqfFund.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { creator: { select: USER_SELECT } },
    });

    const hasMore = funds.length > limit;
    if (hasMore) funds.pop();
    return { data: funds, meta: { cursor: funds[funds.length - 1]?.id || null, hasMore } };
  }

  async contributeWaqf(userId: string, fundId: string, amount: number) {
    throw new BadRequestException('Waqf contributions require payment integration. Coming soon.');

    if (!amount || amount <= 0 || amount > 1_000_000) {
      throw new BadRequestException('Invalid contribution amount');
    }

    const fund = await this.prisma.waqfFund.findUnique({ where: { id: fundId } });
    if (!fund || !fund!.isActive) throw new NotFoundException('Waqf fund not found or closed');

    // Prevent self-contribution
    if (fund!.createdById === userId) {
      throw new BadRequestException('Cannot contribute to your own waqf fund');
    }

    // Use transaction to atomically update raisedAmount
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.waqfFund.findUnique({
        where: { id: fundId },
        select: { isActive: true, raisedAmount: true, goalAmount: true },
      });
      if (!current || !current.isActive) {
        throw new BadRequestException('Waqf fund is no longer active');
      }

      const updated = await tx.waqfFund.update({
        where: { id: fundId },
        data: { raisedAmount: { increment: amount } },
      });

      // Auto-complete if goal reached
      if (Number(updated.raisedAmount) >= Number(updated.goalAmount)) {
        await tx.waqfFund.update({
          where: { id: fundId },
          data: { isActive: false },
        });
      }

      return { success: true, raisedAmount: Number(updated.raisedAmount) };
    });
  }

  // ── Premium Subscription ────────────────────────────────

  async getPremiumStatus(userId: string) {
    const sub = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    return { isPremium: sub?.status === SubscriptionStatus.ACTIVE, subscription: sub };
  }

  async subscribePremium(userId: string, plan: string) {
    const existing = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    if (existing?.status === SubscriptionStatus.ACTIVE) throw new ConflictException('Already subscribed');

    // Calculate price based on plan
    const priceUsd = plan === 'yearly' ? 4999 : 499; // cents

    // Create Stripe PaymentIntent for premium
    let clientSecret: string | null = null;
    if (this.stripeAvailable) {
      try {
        const paymentIntent = await this.stripe.paymentIntents.create({
          amount: priceUsd,
          currency: 'usd',
          metadata: {
            userId,
            plan: plan.toUpperCase(),
            type: 'premium_subscription',
          },
          automatic_payment_methods: { enabled: true },
        });
        clientSecret = paymentIntent.client_secret;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Stripe PaymentIntent creation failed for premium: ${msg}`);
        throw new BadRequestException('Payment processing failed — please try again');
      }
    }

    // Premium created as PENDING — activated via payment webhook only
    const sub = await this.prisma.premiumSubscription.upsert({
      where: { userId },
      create: { userId, plan: plan.toUpperCase() as SubscriptionPlan, status: SubscriptionStatus.PENDING },
      update: { plan: plan.toUpperCase() as SubscriptionPlan, status: SubscriptionStatus.PENDING },
    });

    return { ...sub, clientSecret };
  }

  async cancelPremium(userId: string) {
    const sub = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    if (!sub) throw new NotFoundException();
    return this.prisma.premiumSubscription.update({
      where: { userId },
      data: { autoRenew: false, status: SubscriptionStatus.CANCELLED },
    });
  }
}
