import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
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
    return this.prisma.product.create({
      data: { sellerId: userId, ...dto, currency: dto.currency || 'USD', stock: dto.stock || 1 },
      include: { seller: { select: USER_SELECT } },
    });
  }

  async getProducts(cursor?: string, limit = 20, category?: string, search?: string) {
    const where: Record<string, unknown> = { status: 'active' };
    if (category) where.category = category;
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (cursor) where.id = { lt: cursor };

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
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

  async reviewProduct(userId: string, productId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be 1-5');
    const review = await this.prisma.productReview.create({
      data: { productId, userId, rating, comment },
    });
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
    if (product.stock < qty) throw new BadRequestException('Not enough stock');

    const installments = dto.installments || 1;
    if (installments < 1 || installments > 4) throw new BadRequestException('Installments must be 1-4');

    const order = await this.prisma.order.create({
      data: {
        buyerId: userId,
        productId: dto.productId,
        quantity: qty,
        totalAmount: product.price * qty,
        currency: product.currency,
        installments,
        shippingAddress: dto.shippingAddress,
      },
      include: { product: true },
    });

    // Reduce stock
    await this.prisma.product.update({
      where: { id: dto.productId },
      data: { stock: { decrement: qty } },
    });

    return order;
  }

  async getMyOrders(userId: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { buyerId: userId };
    if (cursor) where.id = { lt: cursor };

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { product: { select: { id: true, title: true, images: true, price: true } } },
    });

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();
    return { data: orders, meta: { cursor: orders[orders.length - 1]?.id || null, hasMore } };
  }

  async updateOrderStatus(orderId: string, sellerId: string, status: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
    if (!order) throw new NotFoundException();
    if (order.product.sellerId !== sellerId) throw new ForbiddenException();
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
    if (cursor) where.id = { lt: cursor };

    const businesses = await this.prisma.halalBusiness.findMany({
      where,
      orderBy: { rating: 'desc' },
      take: limit + 1,
      include: { owner: { select: USER_SELECT } },
    });

    const hasMore = businesses.length > limit;
    if (hasMore) businesses.pop();
    return { data: businesses, meta: { cursor: businesses[businesses.length - 1]?.id || null, hasMore } };
  }

  async reviewBusiness(userId: string, businessId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be 1-5');
    const review = await this.prisma.businessReview.create({
      data: { businessId, userId, rating, comment },
    });
    const agg = await this.prisma.businessReview.aggregate({ where: { businessId }, _avg: { rating: true }, _count: true });
    await this.prisma.halalBusiness.update({
      where: { id: businessId },
      data: { rating: agg._avg.rating || 0, reviewCount: agg._count },
    });
    return review;
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
    const where: Record<string, unknown> = { status: 'active' };
    if (category) where.category = category;
    if (cursor) where.id = { lt: cursor };

    const funds = await this.prisma.zakatFund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { recipient: { select: USER_SELECT }, _count: { select: { donations: true } } },
    });

    const hasMore = funds.length > limit;
    if (hasMore) funds.pop();
    return { data: funds, meta: { cursor: funds[funds.length - 1]?.id || null, hasMore } };
  }

  async donateZakat(userId: string, fundId: string, dto: { amount: number; isAnonymous?: boolean }) {
    const fund = await this.prisma.zakatFund.findUnique({ where: { id: fundId } });
    if (!fund || fund.status !== 'active') throw new NotFoundException('Fund not found or closed');

    const donation = await this.prisma.zakatDonation.create({
      data: { fundId, donorId: userId, amount: dto.amount, isAnonymous: dto.isAnonymous || false },
    });

    await this.prisma.zakatFund.update({
      where: { id: fundId },
      data: { raisedAmount: { increment: dto.amount } },
    });

    // Check if goal reached
    const updated = await this.prisma.zakatFund.findUnique({ where: { id: fundId } });
    if (updated && updated.raisedAmount >= updated.goalAmount) {
      await this.prisma.zakatFund.update({ where: { id: fundId }, data: { status: 'completed' } });
    }

    return donation;
  }

  // ── Community Treasury ──────────────────────────────────

  async createTreasury(userId: string, circleId: string, dto: {
    title: string; description?: string; goalAmount: number; currency?: string;
  }) {
    return this.prisma.communityTreasury.create({
      data: { circleId, createdById: userId, ...dto, currency: dto.currency || 'USD' },
    });
  }

  async contributeTreasury(userId: string, treasuryId: string, amount: number) {
    const treasury = await this.prisma.communityTreasury.findUnique({ where: { id: treasuryId } });
    if (!treasury || treasury.status !== 'active') throw new NotFoundException();

    await this.prisma.treasuryContribution.create({
      data: { treasuryId, userId, amount },
    });

    await this.prisma.communityTreasury.update({
      where: { id: treasuryId },
      data: { raisedAmount: { increment: amount } },
    });

    return { success: true };
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

    return this.prisma.premiumSubscription.upsert({
      where: { userId },
      create: { userId, plan, status: 'active', endDate },
      update: { plan, status: 'active', endDate, autoRenew: true },
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
