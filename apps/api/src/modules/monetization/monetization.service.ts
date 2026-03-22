import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface UpdateTierData {
  name?: string;
  price?: number;
  benefits?: string[];
  level?: string;
  isActive?: boolean;
}

// Single source of truth for platform fee rates
const PLATFORM_FEE_RATE = 0.10; // 10% platform fee on tips
const MIN_TIP_AMOUNT = 0.50; // Minimum $0.50 (Stripe minimum for card payments)
const MAX_TIP_AMOUNT = 10000;

@Injectable()
export class MonetizationService {
  private readonly logger = new Logger(MonetizationService.name);

  constructor(private prisma: PrismaService) {}

  async sendTip(senderId: string, receiverId: string, amount: number, message?: string) {
    // Validate amount — enforce real minimum ($0.50 is typical Stripe minimum)
    if (amount < MIN_TIP_AMOUNT || amount > MAX_TIP_AMOUNT) {
      throw new BadRequestException(`Tip amount must be between $${MIN_TIP_AMOUNT.toFixed(2)} and $${MAX_TIP_AMOUNT.toLocaleString()}`);
    }
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot tip yourself');
    }

    // Verify receiver exists
    const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    // Use precise math: round to 2 decimal places to avoid floating point drift
    const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
    const netAmount = Math.round((amount - platformFee) * 100) / 100;

    // Tip is created as pending — should be confirmed via payment webhook
    const tip = await this.prisma.tip.create({
      data: {
        senderId,
        receiverId,
        amount,
        currency: 'USD',
        message,
        platformFee,
        status: 'pending',
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Update user balance or stats (if we had a balance field)
    // For now, just return the tip

    return tip;
  }

  async getSentTips(userId: string, cursor?: string, limit = 20) {
    const tips = await this.prisma.tip.findMany({
      where: { senderId: userId },
      include: {
        receiver: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = tips.length > limit;
    const items = hasMore ? tips.slice(0, limit) : tips;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getReceivedTips(userId: string, cursor?: string, limit = 20) {
    const tips = await this.prisma.tip.findMany({
      where: { receiverId: userId },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = tips.length > limit;
    const items = hasMore ? tips.slice(0, limit) : tips;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getTipStats(userId: string) {
    const [totalGross, totalFees, totalSent, topSupporters] = await Promise.all([
      // Total gross earned
      this.prisma.tip.aggregate({
        where: { receiverId: userId, status: 'completed' },
        _sum: { amount: true },
      }),
      // Total platform fees deducted
      this.prisma.tip.aggregate({
        where: { receiverId: userId, status: 'completed' },
        _sum: { platformFee: true },
      }),
      // Total sent
      this.prisma.tip.aggregate({
        where: { senderId: userId, status: 'completed' },
        _sum: { amount: true },
      }),
      // Top supporters (by total amount sent to this user)
      this.prisma.tip.groupBy({
        by: ['senderId'],
        where: { receiverId: userId, status: 'completed' },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
    ]);

    // Batch fetch sender details for top supporters (single query instead of N+1)
    const senderIds = topSupporters.map((s) => s.senderId);
    const users = senderIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const supporterDetails = topSupporters.map((supporter) => ({
      user: userMap.get(supporter.senderId) || null,
      totalAmount: Number(supporter._sum.amount || 0),
    }));

    const grossEarned = Number(totalGross._sum.amount || 0);
    const totalPlatformFees = Number(totalFees._sum.platformFee || 0);

    return {
      totalEarned: Math.round((grossEarned - totalPlatformFees) * 100) / 100,
      totalGross: grossEarned,
      totalPlatformFees,
      totalSent: Number(totalSent._sum.amount || 0),
      topSupporters: supporterDetails,
    };
  }

  async createTier(userId: string, name: string, price: number, benefits: string[], level?: string) {
    if (price < 0.50 || price > 10000) {
      throw new BadRequestException('Price must be between $0.50 and $10,000');
    }
    if (!name.trim()) {
      throw new BadRequestException('Tier name is required');
    }

    const tier = await this.prisma.membershipTier.create({
      data: {
        userId,
        name,
        price,
        currency: 'USD',
        benefits,
        level: level || 'bronze',
        isActive: true,
      },
    });

    return tier;
  }

  async getUserTiers(userId: string) {
    const tiers = await this.prisma.membershipTier.findMany({
      where: { userId, isActive: true },
      orderBy: { price: 'asc' },
      take: 50,
    });
    return { data: tiers };
  }

  async updateTier(tierId: string, userId: string, dto: UpdateTierData) {
    const tier = await this.prisma.membershipTier.findUnique({ where: { id: tierId } });
    if (!tier) {
      throw new NotFoundException('Tier not found');
    }
    if (tier.userId !== userId) {
      throw new ForbiddenException('You are not the owner of this tier');
    }

    // Validate price if provided
    if (dto.price !== undefined && (dto.price < 0.50 || dto.price > 10000)) {
      throw new BadRequestException('Price must be between $0.50 and $10,000');
    }

    const updated = await this.prisma.membershipTier.update({
      where: { id: tierId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.benefits !== undefined && { benefits: dto.benefits }),
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return updated;
  }

  async deleteTier(tierId: string, userId: string) {
    const tier = await this.prisma.membershipTier.findUnique({ where: { id: tierId } });
    if (!tier) {
      throw new NotFoundException('Tier not found');
    }
    if (tier.userId !== userId) {
      throw new ForbiddenException('You are not the owner of this tier');
    }

    // Check if there are active subscriptions
    const subscriptionCount = await this.prisma.membershipSubscription.count({
      where: { tierId, status: 'active' },
    });
    if (subscriptionCount > 0) {
      throw new BadRequestException('Cannot delete tier with active subscriptions');
    }

    await this.prisma.membershipTier.delete({ where: { id: tierId } });
    return { message: 'Tier deleted successfully' };
  }

  async toggleTier(tierId: string, userId: string) {
    const tier = await this.prisma.membershipTier.findUnique({ where: { id: tierId } });
    if (!tier) {
      throw new NotFoundException('Tier not found');
    }
    if (tier.userId !== userId) {
      throw new ForbiddenException('You are not the owner of this tier');
    }

    const updated = await this.prisma.membershipTier.update({
      where: { id: tierId },
      data: { isActive: !tier.isActive },
    });

    return { isActive: updated.isActive };
  }

  async subscribe(tierId: string, userId: string) {
    const tier = await this.prisma.membershipTier.findUnique({ where: { id: tierId } });
    if (!tier) {
      throw new NotFoundException('Tier not found');
    }
    if (!tier.isActive) {
      throw new BadRequestException('Tier is not active');
    }
    if (tier.userId === userId) {
      throw new BadRequestException('Cannot subscribe to your own tier');
    }

    // Check for existing active subscription
    const existing = await this.prisma.membershipSubscription.findUnique({
      where: { tierId_userId: { tierId, userId } },
    });
    if (existing && existing.status === 'active') {
      throw new BadRequestException('Already subscribed to this tier');
    }

    // Subscription created as pending — should be activated via payment webhook
    const subscription = await this.prisma.membershipSubscription.upsert({
      where: { tierId_userId: { tierId, userId } },
      update: { status: 'pending', startDate: new Date() },
      create: {
        tierId,
        userId,
        status: 'pending',
        startDate: new Date(),
      },
    });

    return subscription;
  }

  async unsubscribe(tierId: string, userId: string) {
    const subscription = await this.prisma.membershipSubscription.findUnique({
      where: { tierId_userId: { tierId, userId } },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    if (subscription.status !== 'active') {
      throw new BadRequestException('Subscription is not active');
    }

    const updated = await this.prisma.membershipSubscription.update({
      where: { tierId_userId: { tierId, userId } },
      data: { status: 'cancelled', endDate: new Date() },
    });

    return { message: 'Unsubscribed successfully' };
  }

  async getSubscribers(userId: string, cursor?: string, limit = 20) {
    // Find all tiers belonging to this user
    const tiers = await this.prisma.membershipTier.findMany({
      where: { userId },
      select: { id: true },
      take: 50,
    });
    const tierIds = tiers.map((t) => t.id);
    if (tierIds.length === 0) {
      return { data: [], meta: { cursor: null, hasMore: false } };
    }

    const subscriptions = await this.prisma.membershipSubscription.findMany({
      where: {
        tierId: { in: tierIds },
        status: 'active',
      },
      include: {
        tier: { select: { id: true, name: true, price: true } },
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = subscriptions.length > limit;
    const items = hasMore ? subscriptions.slice(0, limit) : subscriptions;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }
}