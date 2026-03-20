import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface UpdateTierData {
  name?: string;
  price?: number;
  benefits?: string[];
  level?: string;
  isActive?: boolean;
}

@Injectable()
export class MonetizationService {
  constructor(private prisma: PrismaService) {}

  async sendTip(senderId: string, receiverId: string, amount: number, message?: string) {
    // Validate amount
    if (amount <= 0 || amount > 10000) {
      throw new BadRequestException('Tip amount must be between $0.01 and $10,000');
    }
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot tip yourself');
    }

    // Verify receiver exists
    const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    const platformFee = amount * 0.10; // 10% platform fee
    const netAmount = amount - platformFee;

    const tip = await this.prisma.tip.create({
      data: {
        senderId,
        receiverId,
        amount,
        currency: 'USD',
        message,
        platformFee,
        status: 'completed',
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
    const [totalEarned, totalSent, topSupporters] = await Promise.all([
      // Total earned (net amount after fees)
      this.prisma.tip.aggregate({
        where: { receiverId: userId },
        _sum: { amount: true },
      }),
      // Total sent
      this.prisma.tip.aggregate({
        where: { senderId: userId },
        _sum: { amount: true },
      }),
      // Top supporters (by total amount sent to this user)
      this.prisma.tip.groupBy({
        by: ['senderId'],
        where: { receiverId: userId },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
    ]);

    // Fetch sender details for top supporters
    const supporterDetails = await Promise.all(
      topSupporters.map(async (supporter) => {
        const user = await this.prisma.user.findUnique({
          where: { id: supporter.senderId },
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        });
        return {
          user,
          totalAmount: Number(supporter._sum.amount || 0),
        };
      }),
    );

    return {
      totalEarned: Number(totalEarned._sum.amount || 0),
      totalSent: Number(totalSent._sum.amount || 0),
      topSupporters: supporterDetails,
    };
  }

  async createTier(userId: string, name: string, price: number, benefits: string[], level?: string) {
    if (price <= 0 || price > 10000) {
      throw new BadRequestException('Price must be between $0.01 and $10,000');
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
    if (dto.price !== undefined && (dto.price <= 0 || dto.price > 10000)) {
      throw new BadRequestException('Price must be between $0.01 and $10,000');
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

    const subscription = await this.prisma.membershipSubscription.upsert({
      where: { tierId_userId: { tierId, userId } },
      update: { status: 'active', startDate: new Date() },
      create: {
        tierId,
        userId,
        status: 'active',
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