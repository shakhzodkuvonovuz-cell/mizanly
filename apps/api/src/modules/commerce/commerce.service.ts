import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };

@Injectable()
export class CommerceService {
  constructor(private prisma: PrismaService) {}

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
      data: { sellerId: userId, ...dto, currency: dto.currency || 'USD', stock: dto.stock || 1 },
      include: { seller: { select: USER_SELECT } },
    });
  }

  async getProducts(cursor?: string, limit = 20, category?: string, search?: string) {
    limit = Math.min(Math.max(limit, 1), 50);
    const where: Record<string, unknown> = { status: 'active' };
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
    if (dto.status && !['active', 'draft', 'archived'].includes(dto.status)) {
      throw new BadRequestException('Invalid product status');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: dto,
      include: { seller: { select: USER_SELECT } },
    });
  }

  async deleteProduct(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId !== userId) throw new ForbiddenException('Not the product owner');

    // Check for active orders
    const activeOrders = await this.prisma.order.count({
      where: { productId, status: { in: ['pending', 'paid', 'shipped'] } },
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
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== 'active') throw new BadRequestException('Product not available');
    if (product.sellerId === userId) throw new BadRequestException('Cannot buy your own product');

    const qty = dto.quantity || 1;
    if (qty < 1 || qty > 100) throw new BadRequestException('Invalid quantity');
    if (product.stock < qty) throw new BadRequestException('Not enough stock');

    const installments = dto.installments || 1;
    if (installments < 1 || installments > 4) throw new BadRequestException('Installments must be 1-4');

    // Use a transaction to atomically check stock and create order
    // This prevents overselling under concurrent orders
    return this.prisma.$transaction(async (tx) => {
      // Atomically decrement stock only if sufficient
      const updated = await tx.product.updateMany({
        where: { id: dto.productId, stock: { gte: qty }, status: 'active' },
        data: { stock: { decrement: qty }, salesCount: { increment: qty } },
      });

      if (updated.count === 0) {
        throw new BadRequestException('Product unavailable or insufficient stock');
      }

      const order = await tx.order.create({
        data: {
          buyerId: userId,
          productId: dto.productId,
          quantity: qty,
          totalAmount: Number(product.price) * qty,
          currency: product.currency,
          installments,
          shippingAddress: dto.shippingAddress,
        },
        include: { product: true },
      });

      return order;
    });
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

  async updateOrderStatus(orderId: string, sellerId: string, status: string) {
    const VALID_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!VALID_STATUSES.includes(status)) throw new BadRequestException('Invalid order status');

    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
    if (!order) throw new NotFoundException();
    if (order.product.sellerId !== sellerId) throw new ForbiddenException();

    // Validate status transitions
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending: ['paid', 'cancelled'],
      paid: ['shipped', 'refunded'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: [],
      refunded: [],
    };
    if (!VALID_TRANSITIONS[order.status]?.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${status}`);
    }

    // Restore stock and decrement salesCount on cancellation/refund
    if ((status === 'cancelled' || status === 'refunded') && order.status !== 'cancelled' && order.status !== 'refunded') {
      await this.prisma.product.updateMany({
        where: { id: order.productId, salesCount: { gt: 0 } },
        data: { stock: { increment: order.quantity }, salesCount: { decrement: order.quantity } },
      });
    }

    return this.prisma.order.update({ where: { id: orderId }, data: { status } });
  }

  // ── Halal Business Directory ────────────────────────────

  async createBusiness(userId: string, dto: {
    name: string; description?: string; category: string; address?: string;
    lat?: number; lng?: number; phone?: string; website?: string;
    avatarUrl?: string; coverUrl?: string; isMuslimOwned?: boolean; halalCertUrl?: string;
  }) {
    return this.prisma.halalBusiness.create({
      data: { ownerId: userId, ...dto },
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
      data: dto,
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
      data: { recipientId: userId, ...dto, currency: dto.currency || 'USD' },
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
    if (!dto.amount || dto.amount <= 0 || dto.amount > 1_000_000) {
      throw new BadRequestException('Invalid donation amount');
    }

    const fund = await this.prisma.zakatFund.findUnique({ where: { id: fundId } });
    if (!fund || fund.status !== 'active') throw new NotFoundException('Fund not found or closed');

    // Prevent self-donation (fund creator donating to own fund)
    if (fund.recipientId === userId) {
      throw new BadRequestException('Cannot donate to your own zakat fund');
    }

    // Create donation as pending — fund amounts should only be updated
    // after payment is confirmed via Stripe webhook
    const donation = await this.prisma.zakatDonation.create({
      data: { fundId, donorId: userId, amount: dto.amount, isAnonymous: dto.isAnonymous || false },
    });

    return donation;
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
    if (!amount || amount <= 0 || amount > 1_000_000) {
      throw new BadRequestException('Invalid contribution amount');
    }
    const treasury = await this.prisma.communityTreasury.findUnique({
      where: { id: treasuryId },
      select: { id: true, status: true, circleId: true, goalAmount: true, raisedAmount: true },
    });
    if (!treasury || treasury.status !== 'active') throw new NotFoundException();

    // Verify user is a member of the circle
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: treasury.circleId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You must be a member of the circle to contribute');
    }

    // Check if fund goal has already been reached
    if (Number(treasury.raisedAmount) >= Number(treasury.goalAmount)) {
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
    if (!amount || amount <= 0 || amount > 1_000_000) {
      throw new BadRequestException('Invalid contribution amount');
    }

    const fund = await this.prisma.waqfFund.findUnique({ where: { id: fundId } });
    if (!fund || !fund.isActive) throw new NotFoundException('Waqf fund not found or closed');

    // Prevent self-contribution
    if (fund.createdById === userId) {
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
    return { isPremium: sub?.status === 'active', subscription: sub };
  }

  async subscribePremium(userId: string, plan: string) {
    const existing = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    if (existing?.status === 'active') throw new ConflictException('Already subscribed');

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (plan === 'yearly' ? 12 : 1));

    // Premium created as pending — should be activated via payment webhook
    return this.prisma.premiumSubscription.upsert({
      where: { userId },
      create: { userId, plan, status: 'pending', endDate },
      update: { plan, status: 'pending', endDate },
    });
  }

  async cancelPremium(userId: string) {
    const sub = await this.prisma.premiumSubscription.findUnique({ where: { userId } });
    if (!sub) throw new NotFoundException();
    return this.prisma.premiumSubscription.update({
      where: { userId },
      data: { autoRenew: false, status: 'cancelled' },
    });
  }
}
