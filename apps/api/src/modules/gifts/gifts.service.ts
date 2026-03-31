import {
  Injectable,
  BadRequestException,
  NotFoundException,
  NotImplementedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CoinTransactionType } from '@prisma/client';

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

/**
 * Single source of truth for diamond/coin conversion rates.
 * 100 diamonds = $0.70 USD → 1 diamond = $0.007 USD
 * Creators receive 70% of coin cost as diamonds.
 */
const DIAMOND_TO_USD = 0.007; // 1 diamond = $0.007
const DIAMONDS_PER_USD_CENT = 100 / 70; // for converting diamonds → cents
const MIN_CASHOUT_DIAMONDS = 100;
const DIAMOND_RATE = 0.7; // Creator receives 70% of coin cost as diamonds

// BALANCE TRUTH: CoinBalance table is the SOLE source of truth for coin/diamond balances.
// The legacy User.coinBalance field was REMOVED from the schema in Session 7.
// All coin operations go through CoinBalance — no split, no ambiguity.

@Injectable()
export class GiftsService {
  private readonly logger = new Logger(GiftsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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
        type: 'PURCHASE',
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

    // Validate receiver exists and is active
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, isBanned: true, isDeactivated: true },
    });
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }
    if (receiver.isBanned || receiver.isDeactivated) {
      throw new BadRequestException('Receiver account is not available');
    }

    const diamondsEarned = Math.floor(catalogItem.coins * DIAMOND_RATE);

    const giftRecord = await this.prisma.$transaction(async (tx) => {
      const deducted = await tx.coinBalance.updateMany({
        where: { userId: senderId, coins: { gte: catalogItem.coins } },
        data: { coins: { decrement: catalogItem.coins } },
      });

      if (deducted.count === 0) {
        throw new BadRequestException('Insufficient coins');
      }

      // Application-level guard: verify balance never went negative
      const senderBalance = await tx.coinBalance.findUnique({ where: { userId: senderId } });
      if (senderBalance && senderBalance.coins < 0) {
        throw new BadRequestException('Balance integrity violation — transaction rolled back');
      }

      const gift = await tx.giftRecord.create({
        data: {
          senderId,
          receiverId,
          giftType,
          coinCost: catalogItem.coins,
          contentId: contentId || null,
          contentType: contentType || null,
        },
      });

      await tx.coinBalance.upsert({
        where: { userId: receiverId },
        update: { diamonds: { increment: diamondsEarned } },
        create: { userId: receiverId, coins: 0, diamonds: diamondsEarned },
      });

      await tx.coinTransaction.create({
        data: {
          userId: senderId,
          type: 'GIFT_SENT',
          amount: -catalogItem.coins,
          description: `Sent ${catalogItem.name} to user`,
        },
      });

      await tx.coinTransaction.create({
        data: {
          userId: receiverId,
          type: 'GIFT_RECEIVED',
          amount: diamondsEarned,
          description: `Received ${catalogItem.name} (+${diamondsEarned} diamonds)`,
        },
      });

      return gift;
    });

    // Notify receiver they received a gift
    this.notifications.create({
      userId: receiverId,
      actorId: senderId,
      type: 'SYSTEM',
      title: 'Gift received!',
      body: `Someone sent you a ${catalogItem.name}! (+${diamondsEarned} diamonds)`,
    }).catch(err => this.logger.warn('Failed to create gift notification', err instanceof Error ? err.message : err));

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

    // Return GiftRecord entries (sent + received) with user details,
    // plus CoinTransaction entries for purchases/cashouts
    const [giftsSent, giftsReceived, transactions] = await Promise.all([
      this.prisma.giftRecord.findMany({
        where: { senderId: userId },
        include: {
          receiver: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.giftRecord.findMany({
        where: { receiverId: userId },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coinTransaction.findMany({
        where: {
          userId,
          type: { in: ['PURCHASE', 'CASHOUT'] },
        },
        take: limit + 1,
        ...(cursor
          ? {
              cursor: { id: cursor },
              skip: 1,
            }
          : {}),
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const hasMore = transactions.length > limit;
    const txItems = hasMore ? transactions.slice(0, limit) : transactions;

    return {
      data: {
        giftsSent: giftsSent.map((g) => {
          const catalogItem = GIFT_CATALOG.find((c) => c.type === g.giftType);
          const receiver = 'receiver' in g ? g.receiver as { displayName: string | null; username: string } | null : null;
          return {
            id: g.id,
            giftType: g.giftType,
            giftName: catalogItem?.name || g.giftType,
            coins: g.coinCost,
            receiverId: g.receiverId,
            receiverName: receiver?.displayName || receiver?.username || null,
            createdAt: g.createdAt,
          };
        }),
        giftsReceived: giftsReceived.map((g) => {
          const catalogItem = GIFT_CATALOG.find((c) => c.type === g.giftType);
          const sender = 'sender' in g ? g.sender as { displayName: string | null; username: string } | null : null;
          return {
            id: g.id,
            giftType: g.giftType,
            giftName: catalogItem?.name || g.giftType,
            coins: g.coinCost,
            senderId: g.senderId,
            senderName: sender?.displayName || sender?.username || null,
            createdAt: g.createdAt,
          };
        }),
        transactions: txItems,
      },
      meta: {
        cursor: hasMore ? txItems[txItems.length - 1].id : null,
        hasMore,
      },
    };
  }

  async cashout(userId: string, diamonds: number): Promise<CashoutResult> {
    throw new NotImplementedException('Cashout requires Stripe Connect payout integration. Coming soon.');

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
    if (!balance || balance!.diamonds < diamonds) {
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

    // Application-level guard: verify balance never went negative
    const postBalance = await this.prisma.coinBalance.findUnique({ where: { userId } });
    const postDiamonds = postBalance?.diamonds ?? 0;
    if (postDiamonds < 0) {
      // This should never happen due to the conditional update, but guard against race conditions
      await this.prisma.coinBalance.update({
        where: { userId },
        data: { diamonds: { increment: diamonds } },
      });
      throw new BadRequestException('Balance integrity violation — cashout reversed');
    }

    await this.prisma.coinTransaction.create({
      data: {
        userId,
        type: 'CASHOUT',
        amount: -diamonds,
        description: `Cashed out ${diamonds} diamonds for $${usdAmount.toFixed(2)}`,
      },
    });

    return {
      diamondsDeducted: diamonds,
      usdAmount,
      remainingDiamonds: postDiamonds,
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
