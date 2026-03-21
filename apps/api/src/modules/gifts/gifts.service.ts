import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

export interface GiftCatalogItem {
  type: string;
  name: string;
  coins: number;
  animation: string;
}

interface SendGiftData {
  receiverId: string;
  giftType: string;
  contentId?: string;
  contentType?: string;
}

export interface CashoutResult {
  diamondsDeducted: number;
  usdAmount: number;
  remainingDiamonds: number;
}

const GIFT_CATALOG: GiftCatalogItem[] = [
  { type: 'rose', name: 'Rose', coins: 1, animation: 'float' },
  { type: 'heart', name: 'Heart', coins: 5, animation: 'pulse' },
  { type: 'star', name: 'Star', coins: 10, animation: 'spin' },
  { type: 'crescent', name: 'Crescent Moon', coins: 50, animation: 'glow' },
  { type: 'mosque', name: 'Mosque', coins: 100, animation: 'rise' },
  { type: 'diamond', name: 'Diamond', coins: 500, animation: 'sparkle' },
  { type: 'crown', name: 'Crown', coins: 1000, animation: 'drop' },
  { type: 'galaxy', name: 'Galaxy', coins: 5000, animation: 'explode' },
];

// Conversion rate: 100 diamonds = $0.70
const DIAMONDS_PER_USD_CENT = 100 / 70;
const MIN_CASHOUT_DIAMONDS = 100;

// Creator receives 70% of coin cost as diamonds
const DIAMOND_RATE = 0.7;

@Injectable()
export class GiftsService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
    const balance = await this.prisma.coinBalance.upsert({
      where: { userId },
      update: {},
      create: { userId, coins: 0, diamonds: 0 },
    });

    return {
      coins: balance.coins,
      diamonds: balance.diamonds,
    };
  }

  async purchaseCoins(userId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer');
    }
    if (amount > 100000) {
      throw new BadRequestException('Maximum purchase is 100,000 coins');
    }

    // Coins are NOT credited here. They must be credited via Stripe webhook
    // after payment confirmation. This method creates a pending transaction record.
    const transaction = await this.prisma.coinTransaction.create({
      data: {
        userId,
        type: 'purchase',
        amount,
        description: `Coin purchase pending payment (${amount} coins)`,
      },
    });

    const balance = await this.prisma.coinBalance.upsert({
      where: { userId },
      update: {},
      create: { userId, coins: 0, diamonds: 0 },
    });

    return {
      coins: balance.coins,
      diamonds: balance.diamonds,
      pendingPurchase: amount,
      transactionId: transaction.id,
    };
  }

  async sendGift(senderId: string, data: SendGiftData) {
    const { receiverId, giftType, contentId, contentType } = data;

    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send a gift to yourself');
    }

    // Validate gift type exists in catalog
    const catalogItem = GIFT_CATALOG.find((g) => g.type === giftType);
    if (!catalogItem) {
      throw new NotFoundException(`Gift type "${giftType}" not found in catalog`);
    }

    // Validate receiver exists
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    const diamondsEarned = Math.floor(catalogItem.coins * DIAMOND_RATE);

    // Use conditional updateMany with gte guard to prevent race conditions
    // (same pattern as cashout — atomic balance check + decrement)
    const deducted = await this.prisma.coinBalance.updateMany({
      where: { userId: senderId, coins: { gte: catalogItem.coins } },
      data: { coins: { decrement: catalogItem.coins } },
    });

    if (deducted.count === 0) {
      throw new BadRequestException('Insufficient coins');
    }

    // Execute remaining operations in a transaction
    const [giftRecord] = await this.prisma.$transaction([
      this.prisma.giftRecord.create({
        data: {
          senderId,
          receiverId,
          giftType,
          coinCost: catalogItem.coins,
          contentId: contentId || null,
          contentType: contentType || null,
        },
      }),
      this.prisma.coinBalance.upsert({
        where: { userId: receiverId },
        update: { diamonds: { increment: diamondsEarned } },
        create: { userId: receiverId, coins: 0, diamonds: diamondsEarned },
      }),
      this.prisma.coinTransaction.create({
        data: {
          userId: senderId,
          type: 'gift_sent',
          amount: -catalogItem.coins,
          description: `Sent ${catalogItem.name} to user`,
        },
      }),
      this.prisma.coinTransaction.create({
        data: {
          userId: receiverId,
          type: 'gift_received',
          amount: diamondsEarned,
          description: `Received ${catalogItem.name} (+${diamondsEarned} diamonds)`,
        },
      }),
    ]);

    return {
      gift: giftRecord,
      giftName: catalogItem.name,
      animation: catalogItem.animation,
      coinCost: catalogItem.coins,
      diamondsEarned,
    };
  }

  getCatalog(): GiftCatalogItem[] {
    return GIFT_CATALOG;
  }

  async getHistory(userId: string, cursor?: string, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 50);
    const transactions = await this.prisma.coinTransaction.findMany({
      where: { userId },
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
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async cashout(userId: string, diamonds: number): Promise<CashoutResult> {
    if (!Number.isInteger(diamonds) || diamonds <= 0) {
      throw new BadRequestException('Diamonds must be a positive integer');
    }

    if (diamonds < MIN_CASHOUT_DIAMONDS) {
      throw new BadRequestException(
        `Minimum cashout is ${MIN_CASHOUT_DIAMONDS} diamonds`,
      );
    }

    const balance = await this.prisma.coinBalance.findUnique({
      where: { userId },
    });
    if (!balance || balance.diamonds < diamonds) {
      throw new BadRequestException('Insufficient diamonds');
    }

    // 100 diamonds = $0.70
    const usdCents = Math.floor(diamonds / DIAMONDS_PER_USD_CENT);
    const usdAmount = usdCents / 100;

    // Use conditional update to prevent going negative in a race condition
    const updated = await this.prisma.coinBalance.updateMany({
      where: { userId, diamonds: { gte: diamonds } },
      data: { diamonds: { decrement: diamonds } },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Insufficient diamonds');
    }

    await this.prisma.coinTransaction.create({
      data: {
        userId,
        type: 'cashout',
        amount: -diamonds,
        description: `Cashed out ${diamonds} diamonds for $${usdAmount.toFixed(2)}`,
      },
    });

    // Re-read balance to get the actual post-update value
    const updatedBalance = await this.prisma.coinBalance.findUnique({
      where: { userId },
    });

    return {
      diamondsDeducted: diamonds,
      usdAmount,
      remainingDiamonds: updatedBalance?.diamonds ?? 0,
    };
  }

  async getReceivedGifts(userId: string) {
    const gifts = await this.prisma.giftRecord.groupBy({
      by: ['giftType'],
      where: { receiverId: userId },
      _count: { giftType: true },
      _sum: { coinCost: true },
    });

    const enriched = gifts.map((g) => {
      const catalogItem = GIFT_CATALOG.find((c) => c.type === g.giftType);
      return {
        giftType: g.giftType,
        giftName: catalogItem?.name || g.giftType,
        animation: catalogItem?.animation || 'float',
        count: g._count.giftType,
        totalCoinValue: g._sum.coinCost || 0,
      };
    });

    // Sort by total value descending
    enriched.sort((a, b) => b.totalCoinValue - a.totalCoinValue);

    return { data: enriched };
  }
}
