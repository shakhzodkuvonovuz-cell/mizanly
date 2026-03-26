import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

interface UpdateTierData {
  name?: string;
  price?: number;
  benefits?: string[];
  level?: string;
  isActive?: boolean;
}

export interface CashoutRequestDto {
  amount: number; // diamonds to cash out
  payoutSpeed: 'instant' | 'standard';
  paymentMethodId: string;
}

// Single source of truth for platform fee rates
const PLATFORM_FEE_RATE = 0.10; // 10% platform fee on tips
const MIN_TIP_AMOUNT = 0.50; // Minimum $0.50 (Stripe minimum for card payments)
const MAX_TIP_AMOUNT = 10000;

// Single source of truth for diamond-to-USD conversion
// 1 diamond = $0.007 USD (100 diamonds = $0.70)
// Must be kept in sync with gifts.service.ts DIAMOND_TO_USD
const DIAMOND_TO_USD = 0.007;
const DIAMONDS_PER_USD_CENT = 100 / 70;
const MIN_CASHOUT_DIAMONDS = 100;

// Valid tier levels
const VALID_TIER_LEVELS = ['bronze', 'silver', 'gold', 'platinum'] as const;

@Injectable()
export class MonetizationService {
  private readonly logger = new Logger(MonetizationService.name);

  constructor(private prisma: PrismaService) {}

  async sendTip(senderId: string, receiverId: string, amount: number, message?: string) {
    throw new BadRequestException('Tips require payment integration. Coming soon.');

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

    // Use Decimal for precise financial math — avoids floating point drift
    const decAmount = new Decimal(amount);
    const decFee = decAmount.mul(PLATFORM_FEE_RATE).toDecimalPlaces(2);

    // Tip is created as pending — should be confirmed via payment webhook
    const tip = await this.prisma.tip.create({
      data: {
        senderId,
        receiverId,
        amount: decAmount.toNumber(),
        currency: 'USD',
        message,
        platformFee: decFee.toNumber(),
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
    const senderIds = topSupporters.map((s) => s.senderId).filter((id): id is string => id !== null);
    const users = senderIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const supporterDetails = topSupporters.map((supporter) => ({
      user: supporter.senderId ? userMap.get(supporter.senderId) ?? null : null,
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

    // Validate level against allowed values
    const tierLevel = level || 'bronze';
    if (!VALID_TIER_LEVELS.includes(tierLevel as typeof VALID_TIER_LEVELS[number])) {
      throw new BadRequestException(`Tier level must be one of: ${VALID_TIER_LEVELS.join(', ')}`);
    }

    const tier = await this.prisma.membershipTier.create({
      data: {
        userId,
        name,
        price,
        currency: 'USD',
        benefits,
        level: tierLevel,
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

    // Check for existing active subscription — also check expiry
    const existing = await this.prisma.membershipSubscription.findUnique({
      where: { tierId_userId: { tierId, userId } },
    });
    if (existing && existing.status === 'active') {
      // Check if subscription has expired (endDate in the past)
      if (existing.endDate && new Date(existing.endDate) < new Date()) {
        // Expired — mark as expired and allow re-subscription
        await this.prisma.membershipSubscription.update({
          where: { id: existing.id },
          data: { status: 'expired' },
        });
      } else {
        throw new BadRequestException('Already subscribed to this tier');
      }
    }

    // Calculate endDate — 30 days from now (should be updated by payment webhook)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    // Subscription created as pending — should be activated via payment webhook
    const subscription = await this.prisma.membershipSubscription.upsert({
      where: { tierId_userId: { tierId, userId } },
      update: { status: 'pending', startDate: new Date(), endDate },
      create: {
        tierId,
        userId,
        status: 'pending',
        startDate: new Date(),
        endDate,
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

  // ── Wallet Endpoints ──
  // These endpoints serve the mobile cashout screen (/monetization/wallet/*)

  async getWalletBalance(userId: string) {
    const balance = await this.prisma.coinBalance.upsert({
      where: { userId },
      update: {},
      create: { userId, coins: 0, diamonds: 0 },
    });

    return {
      diamonds: balance.diamonds,
      usdEquivalent: Math.round(balance.diamonds * DIAMOND_TO_USD * 100) / 100,
      diamondToUsdRate: DIAMOND_TO_USD,
    };
  }

  async getPaymentMethods(userId: string) {
    // Payment methods are managed via Stripe Connect
    // For now, check if user has a Stripe Connect account and return
    // a placeholder — real payment method fetching requires Stripe API calls
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeConnectAccountId: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If user has Stripe Connect set up, return it as a payment method
    // In production, this would call Stripe API to list external accounts
    if (user.stripeConnectAccountId) {
      return [
        {
          id: user.stripeConnectAccountId,
          type: 'stripe' as const,
          label: 'Stripe Account',
          lastFour: '****',
          isDefault: true,
        },
      ];
    }

    return [];
  }

  async requestCashout(userId: string, dto: CashoutRequestDto) {
    throw new BadRequestException('Cashout is temporarily unavailable. Stripe payout integration coming soon.');

    const { amount: diamonds, payoutSpeed, paymentMethodId } = dto;

    if (!Number.isInteger(diamonds) || diamonds <= 0) {
      throw new BadRequestException('Diamonds must be a positive integer');
    }

    if (diamonds < MIN_CASHOUT_DIAMONDS) {
      throw new BadRequestException(
        `Minimum cashout is ${MIN_CASHOUT_DIAMONDS} diamonds`,
      );
    }

    if (!paymentMethodId || !paymentMethodId.trim()) {
      throw new BadRequestException('Payment method is required');
    }

    if (payoutSpeed !== 'instant' && payoutSpeed !== 'standard') {
      throw new BadRequestException('Payout speed must be "instant" or "standard"');
    }

    const balance = await this.prisma.coinBalance.findUnique({
      where: { userId },
    });
    if (!balance || balance!.diamonds < diamonds) {
      throw new BadRequestException('Insufficient diamonds');
    }

    // Convert diamonds to USD: 100 diamonds = $0.70
    const usdCents = Math.floor(diamonds / DIAMONDS_PER_USD_CENT);
    const usdAmount = usdCents / 100;

    // Use conditional update to prevent race condition (atomic check + decrement)
    const updated = await this.prisma.coinBalance.updateMany({
      where: { userId, diamonds: { gte: diamonds } },
      data: { diamonds: { decrement: diamonds } },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Insufficient diamonds');
    }

    // Record the cashout transaction
    await this.prisma.coinTransaction.create({
      data: {
        userId,
        type: 'CASHOUT',
        amount: -diamonds,
        description: `Cashed out ${diamonds} diamonds for $${usdAmount.toFixed(2)} (${payoutSpeed})`,
      },
    });

    this.logger.log(`User ${userId} cashed out ${diamonds} diamonds ($${usdAmount.toFixed(2)}, ${payoutSpeed})`);

    return { success: true };
  }

  async getPayoutHistory(userId: string, cursor?: string, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 50);

    const transactions = await this.prisma.coinTransaction.findMany({
      where: {
        userId,
        type: 'CASHOUT',
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

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;

    return {
      data: items.map((tx) => ({
        id: tx.id,
        amount: Math.abs(tx.amount) * DIAMOND_TO_USD,
        currency: tx.currency,
        status: 'completed' as const,
        createdAt: tx.createdAt.toISOString(),
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }
}