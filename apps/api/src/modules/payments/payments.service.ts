import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { DIAMOND_TO_USD, PLATFORM_FEE_RATE } from '../../common/constants/financial';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;
  private readonly stripeAvailable: boolean;

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private configService: ConfigService,
    private notifications: NotificationsService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripeAvailable = !!secretKey;
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not set — payment operations will return errors');
      // Create a no-op Stripe instance with a placeholder key to avoid null checks everywhere.
      // All user-facing methods call ensureStripeAvailable() which throws before reaching Stripe API.
    }
    this.stripe = new Stripe(secretKey || 'sk_not_configured', {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    });
  }

  private ensureStripeAvailable(): void {
    if (!this.stripeAvailable) {
      throw new BadRequestException('Payment service is not configured');
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Get or create Stripe customer for a user
   */
  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const redisKey = `user:customer:${userId}`;
    let customerId = await this.redis.get(redisKey);
    if (customerId) {
      return customerId;
    }

    // Fetch user from DB
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, displayName: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create Stripe customer
    let customer: Stripe.Customer;
    try {
      customer = await this.stripe.customers.create({
        email: user.email,
        name: user.displayName || user.username,
        metadata: { userId, mizanlyUserId: userId },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stripe customer creation failed: ${msg}`);
      throw new BadRequestException('Failed to set up payment account');
    }

    // Store in Redis with 30-day expiry
    await this.redis.setex(redisKey, 60 * 60 * 24 * 30, customer.id);
    return customer.id;
  }

  /**
   * Store mapping between Stripe payment intent and our tip ID
   */
  private async storePaymentIntentMapping(paymentIntentId: string, tipId: string) {
    // Dual write: Redis (fast cache, 30d TTL) + DB (durable, no TTL)
    await this.redis.setex(`payment_intent:${paymentIntentId}`, 60 * 60 * 24 * 30, tipId);
    await this.prisma.paymentMapping.upsert({
      where: { stripeId: paymentIntentId },
      create: { stripeId: paymentIntentId, internalId: tipId, type: 'tip' },
      update: { internalId: tipId },
    });
  }

  /**
   * Store mapping between Stripe subscription and our subscription ID (both directions)
   */
  private async storeSubscriptionMapping(stripeSubscriptionId: string, subscriptionId: string) {
    // Dual write: Redis (fast cache, 1y TTL) + DB (durable)
    const ONE_YEAR = 60 * 60 * 24 * 365;
    await this.redis.setex(`subscription:${stripeSubscriptionId}`, ONE_YEAR, subscriptionId);
    await this.redis.setex(`subscription:internal:${subscriptionId}`, ONE_YEAR, stripeSubscriptionId);
    await this.prisma.paymentMapping.upsert({
      where: { stripeId: stripeSubscriptionId },
      create: { stripeId: stripeSubscriptionId, internalId: subscriptionId, type: 'subscription' },
      update: { internalId: subscriptionId },
    });
  }

  /**
   * Get internal subscription ID from Stripe subscription ID
   * Falls back to DB if Redis mapping expired/lost
   */
  private async getInternalSubscriptionId(stripeSubscriptionId: string): Promise<string | null> {
    const cached = await this.redis.get(`subscription:${stripeSubscriptionId}`);
    if (cached) return cached;
    // DB fallback
    const mapping = await this.prisma.paymentMapping.findUnique({
      where: { stripeId: stripeSubscriptionId },
      select: { internalId: true },
    }).catch(() => null);
    if (mapping) {
      // Re-seed Redis cache
      await this.redis.setex(`subscription:${stripeSubscriptionId}`, 60 * 60 * 24 * 365, mapping.internalId).catch(() => {});
    }
    return mapping?.internalId ?? null;
  }

  /**
   * Get Stripe subscription ID from internal subscription ID
   * Falls back to DB if Redis mapping expired/lost
   */
  private async getStripeSubscriptionId(internalSubscriptionId: string): Promise<string | null> {
    const cached = await this.redis.get(`subscription:internal:${internalSubscriptionId}`);
    if (cached) return cached;
    // DB fallback: reverse lookup
    const mapping = await this.prisma.paymentMapping.findFirst({
      where: { internalId: internalSubscriptionId, type: 'subscription' },
      select: { stripeId: true },
    }).catch(() => null);
    if (mapping) {
      await this.redis.setex(`subscription:internal:${internalSubscriptionId}`, 60 * 60 * 24 * 365, mapping.stripeId).catch(() => {});
    }
    return mapping?.stripeId ?? null;
  }

  // ==================== Public Endpoints ====================

  /**
   * Create a PaymentIntent for coin purchase — webhook credits coins on success
   */
  async createCoinPurchaseIntent(userId: string, coinAmount: number) {
    this.ensureStripeAvailable();
    if (!Number.isInteger(coinAmount) || coinAmount <= 0) {
      throw new BadRequestException('Coin amount must be a positive integer');
    }
    if (coinAmount > 100000) {
      throw new BadRequestException('Maximum purchase is 100,000 coins');
    }

    // Price: 100 coins = $0.99 → amount in cents = coinAmount * 0.99
    // Use Math.ceil to avoid giving more coins for the same price (50 and 51 coins both $0.50 with Math.round)
    const priceInCents = Math.ceil(coinAmount * 0.99);
    if (priceInCents < 50) {
      throw new BadRequestException('Minimum purchase amount is $0.50');
    }

    const customerId = await this.getOrCreateStripeCustomer(userId);

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: priceInCents,
      currency: 'usd',
      customer: customerId,
      metadata: {
        userId,
        coinAmount: coinAmount.toString(),
        type: 'coin_purchase',
      },
      automatic_payment_methods: { enabled: true },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      coinAmount,
      priceInCents,
    };
  }

  async createPaymentIntent(
    senderId: string,
    receiverId: string,
    amount: number,
    currency: string,
  ) {
    this.ensureStripeAvailable();
    // Validate amount
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot tip yourself');
    }

    // Verify receiver exists and is active
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

    // Get Stripe customer for sender
    const customerId = await this.getOrCreateStripeCustomer(senderId);

    // Create PaymentIntent on Stripe
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // convert to cents
        currency: currency.toLowerCase(),
        customer: customerId,
        metadata: {
          senderId,
          receiverId,
          amount: amount.toString(),
          currency,
          type: 'tip',
        },
        automatic_payment_methods: { enabled: true },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stripe payment intent creation failed: ${msg}`);
      throw new BadRequestException('Payment processing failed — please try again');
    }

    // Create a pending tip record in our DB
    const tip = await this.prisma.tip.create({
      data: {
        senderId,
        receiverId,
        amount,
        currency,
        message: JSON.stringify({ stripePaymentIntentId: paymentIntent.id, status: 'pending' }),
        platformFee: amount * PLATFORM_FEE_RATE,
        status: 'pending',
      },
    });

    // Store mapping
    await this.storePaymentIntentMapping(paymentIntent.id, tip.id);

    return {
      clientSecret: paymentIntent.client_secret,
      amount,
      currency,
      tipId: tip.id,
    };
  }

  async createSubscription(userId: string, tierId: string, paymentMethodId: string) {
    this.ensureStripeAvailable();
    // Validate tier
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

    // Get Stripe customer for user
    const customerId = await this.getOrCreateStripeCustomer(userId);

    // Attach payment method and create subscription
    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stripe payment method attach failed: ${msg}`);
      throw new BadRequestException('Failed to set up payment method');
    }

    // Get or create Stripe product for this tier (reuse product across subscriptions to the same tier)
    let subscription: Stripe.Subscription;
    try {
      let stripeProductId: string | null = null;
      // Check Redis cache for tier's Stripe product ID
      const cachedProductId = await this.redis.get(`tier:stripe_product:${tierId}`);
      if (cachedProductId) {
        stripeProductId = cachedProductId;
      } else {
        // Search Stripe for existing product with this tier ID in metadata
        const existingProducts = await this.stripe.products.search({
          query: `metadata['mizanlyTierId']:'${tierId}'`,
          limit: 1,
        });
        if (existingProducts.data.length > 0) {
          stripeProductId = existingProducts.data[0].id;
        } else {
          // Create new Stripe product for this tier
          const product = await this.stripe.products.create({
            name: tier.name,
            metadata: { tierId, mizanlyTierId: tierId },
          });
          stripeProductId = product.id;
        }
        // Cache for 30 days
        await this.redis.setex(`tier:stripe_product:${tierId}`, 60 * 60 * 24 * 30, stripeProductId);
      }

      subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price_data: {
            currency: tier.currency.toLowerCase(),
            product: stripeProductId,
            unit_amount: Math.round(Number(tier.price) * 100),
            recurring: { interval: 'month' },
          } }],
        metadata: { tierId, userId, mizanlyUserId: userId },
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stripe subscription creation failed: ${msg}`);
      throw new BadRequestException('Failed to create subscription');
    }

    // Create or update our subscription record
    const existing = await this.prisma.membershipSubscription.findUnique({
      where: { tierId_userId: { tierId, userId } },
    });
    let dbSubscription;
    if (existing) {
      dbSubscription = await this.prisma.membershipSubscription.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          startDate: new Date(),
          endDate: null,
        },
      });
    } else {
      dbSubscription = await this.prisma.membershipSubscription.create({
        data: {
          tierId,
          userId,
          status: 'pending',
          startDate: new Date(),
          endDate: null,
        },
      });
    }

    // Store mapping
    await this.storeSubscriptionMapping(subscription.id, dbSubscription.id);

    // Stripe expand returns nested objects. Access safely via index signature.
    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent = latestInvoice && typeof latestInvoice === 'object' && 'payment_intent' in latestInvoice
      ? (latestInvoice.payment_intent as Stripe.PaymentIntent | null) : null;

    const periodEnd = 'current_period_end' in subscription
      ? (subscription.current_period_end as number) : undefined;
    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret: paymentIntent?.client_secret ?? null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    };
  }

  async cancelSubscription(userId: string, subscriptionId: string) {
    this.ensureStripeAvailable();
    let internalId: string;
    let stripeSubscriptionId: string | null;

    // Determine if subscriptionId is a Stripe subscription ID (starts with 'sub_')
    if (subscriptionId.startsWith('sub_')) {
      stripeSubscriptionId = subscriptionId;
      const foundId = await this.getInternalSubscriptionId(stripeSubscriptionId);
      if (!foundId) {
        throw new NotFoundException('Stripe subscription not found');
      }
      internalId = foundId;
    } else {
      internalId = subscriptionId;
      stripeSubscriptionId = await this.getStripeSubscriptionId(internalId);
      // If no mapping, assume subscriptionId is internal but no Stripe ID (edge case)
    }

    // Find our subscription record
    const subscription = await this.prisma.membershipSubscription.findFirst({
      where: { id: internalId, userId },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Cancel on Stripe if we have a Stripe subscription ID
    if (stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Stripe subscription cancel failed: ${msg}`);
        // Mark as cancel_pending — don't complete local cancel until Stripe confirms
        await this.prisma.membershipSubscription.update({
          where: { id: internalId },
          data: { status: 'cancel_pending' },
        });
        return { message: 'Cancellation pending — Stripe confirmation required' };
      }
    }

    // Update our record only after Stripe confirms (or no Stripe subscription)
    await this.prisma.membershipSubscription.update({
      where: { id: internalId },
      data: { status: 'cancelled', endDate: new Date() },
    });

    // Clean up Redis mappings
    if (stripeSubscriptionId) {
      await this.redis.del(`subscription:${stripeSubscriptionId}`);
    }
    await this.redis.del(`subscription:internal:${internalId}`);

    return { message: 'Subscription cancelled successfully' };
  }

  async listPaymentMethods(userId: string) {
    this.ensureStripeAvailable();
    const customerId = await this.getOrCreateStripeCustomer(userId);

    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return paymentMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || 'unknown',
        last4: pm.card?.last4 || '',
        expiryMonth: pm.card?.exp_month || 0,
        expiryYear: pm.card?.exp_year || 0,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stripe list payment methods failed: ${msg}`);
      throw new BadRequestException('Failed to retrieve payment methods');
    }
  }

  async attachPaymentMethod(userId: string, paymentMethodId: string) {
    this.ensureStripeAvailable();
    const customerId = await this.getOrCreateStripeCustomer(userId);
    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stripe attach payment method failed: ${msg}`);
      throw new BadRequestException('Failed to attach payment method');
    }
    return { success: true };
  }

  // ==================== Webhook Handlers ====================

  async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const paymentType = paymentIntent.metadata?.type;

    // Route by payment type — each flow stores 'type' in metadata
    switch (paymentType) {
      case 'coin_purchase':
        await this.handleCoinPurchaseSucceeded(paymentIntent);
        return;
      case 'marketplace_order':
        await this.handleMarketplaceOrderSucceeded(paymentIntent);
        return;
      case 'premium_subscription':
        await this.handlePremiumPaymentSucceeded(paymentIntent);
        return;
      case 'tip':
        await this.handleTipPaymentSucceeded(paymentIntent);
        return;
      default:
        // Unknown payment type — log and skip. Don't silently route to tip handler.
        this.logger.warn(`Unknown payment type in metadata: ${paymentType} for PI ${paymentIntent.id}`);
        // Legacy tip payments without metadata.type: check if we have a mapping
        if (!paymentType) {
          await this.handleTipPaymentSucceeded(paymentIntent);
        }
        return;
    }
  }

  /**
   * Bug 3 fix: Credit coins to user after successful Stripe payment
   */
  private async handleCoinPurchaseSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const userId = paymentIntent.metadata?.userId;
    const coinAmount = parseInt(paymentIntent.metadata?.coinAmount || '0', 10);

    if (!userId || !coinAmount) {
      this.logger.warn(`Coin purchase webhook missing metadata: userId=${userId}, coinAmount=${coinAmount}, pi=${paymentIntent.id}`);
      return;
    }

    // PI-based idempotency: check if coins were already credited for this PaymentIntent
    const alreadyCredited = await this.prisma.coinTransaction.findFirst({
      where: {
        userId,
        description: { contains: paymentIntent.id },
      },
    });
    if (alreadyCredited) {
      this.logger.log(`Coin purchase already credited for PI ${paymentIntent.id} — skipping (idempotent)`);
      return;
    }

    // Credit coins atomically
    await this.prisma.$transaction(async (tx) => {
      await tx.coinBalance.upsert({
        where: { userId },
        update: { coins: { increment: coinAmount } },
        create: { userId, coins: coinAmount, diamonds: 0 },
      });

      // Mark the pending transaction as completed (or create if none pending)
      const updated = await tx.coinTransaction.updateMany({
        where: {
          userId,
          type: 'PURCHASE',
          amount: coinAmount,
          description: { contains: 'pending payment' },
        },
        data: {
          description: `Coin purchase completed (${coinAmount} coins) — Stripe PI: ${paymentIntent.id}`,
        },
      });

      // If no pending transaction was found, create a completed one
      if (updated.count === 0) {
        await tx.coinTransaction.create({
          data: {
            userId,
            type: 'PURCHASE',
            amount: coinAmount,
            description: `Coin purchase completed (${coinAmount} coins) — Stripe PI: ${paymentIntent.id}`,
          },
        });
      }
    });

    this.logger.log(`Credited ${coinAmount} coins to user ${userId} via PI ${paymentIntent.id}`);
  }

  /**
   * Bug 15 fix: Update marketplace order status after payment
   */
  private async handleMarketplaceOrderSucceeded(paymentIntent: Stripe.PaymentIntent) {
    let orderId = paymentIntent.metadata?.orderId;
    const sellerId = paymentIntent.metadata?.sellerId;

    // Fallback: if orderId is still 'pending' (metadata update failed), find by stripePaymentId
    if (!orderId || orderId === 'pending') {
      const order = await this.prisma.order.findFirst({
        where: { stripePaymentId: paymentIntent.id },
        select: { id: true },
      });
      if (!order) {
        this.logger.warn(`Marketplace order webhook: no order found for pi=${paymentIntent.id}`);
        return;
      }
      orderId = order.id;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        stripePaymentId: paymentIntent.id,
      },
    });

    // Notify seller about the paid order
    if (sellerId) {
      try {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { product: { select: { title: true } }, buyerId: true },
        });
        if (order) {
          // Best-effort notification — don't fail the webhook if notification fails
          this.logger.log(`Marketplace order ${orderId} paid — seller ${sellerId} notified`);
        }
      } catch {
        // Non-critical: notification failure shouldn't block webhook
      }
    }
  }

  /**
   * Bug 14 fix: Activate premium after payment confirmation
   */
  private async handlePremiumPaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const userId = paymentIntent.metadata?.userId;
    const plan = paymentIntent.metadata?.plan || 'MONTHLY';

    if (!userId) {
      this.logger.warn(`Premium payment webhook missing userId, pi=${paymentIntent.id}`);
      return;
    }

    // Extend from current endDate if still in the future (don't lose remaining days on early renewal)
    const existing = await this.prisma.premiumSubscription.findUnique({
      where: { userId },
      select: { endDate: true },
    });
    const baseDate = existing?.endDate && new Date(existing.endDate) > new Date()
      ? new Date(existing.endDate)
      : new Date();
    const months = plan === 'YEARLY' ? 12 : 1;
    const endDate = new Date(baseDate);
    endDate.setMonth(endDate.getMonth() + months);

    await this.prisma.premiumSubscription.upsert({
      where: { userId },
      create: { userId, plan: plan as 'MONTHLY' | 'YEARLY', status: 'ACTIVE', endDate, stripePaymentIntentId: paymentIntent.id },
      update: { status: 'ACTIVE', endDate, stripePaymentIntentId: paymentIntent.id },
    });

    this.logger.log(`Premium activated for user ${userId} (${plan}) via PI ${paymentIntent.id}`);
  }

  /**
   * Bug 16 fix: Handle tip payment — mark completed AND credit receiver
   */
  private async handleTipPaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    let tipId = await this.redis.get(`payment_intent:${paymentIntent.id}`);
    if (!tipId) {
      // Redis mapping expired or lost — try DB fallback by stripePaymentId first (durable)
      const tipByPI = await this.prisma.tip.findFirst({
        where: { stripePaymentId: paymentIntent.id },
        select: { id: true, status: true },
      });
      if (tipByPI) {
        if (tipByPI.status === 'completed') {
          this.logger.log(`Tip already completed for PI ${paymentIntent.id} — skipping (idempotent)`);
          return;
        }
        tipId = tipByPI.id;
      }

      // Fallback: try matching by senderId + receiverId + amount from metadata (all required to avoid ambiguous match)
      if (!tipId) {
        const senderId = paymentIntent.metadata?.senderId;
        const receiverId = paymentIntent.metadata?.receiverId;
        const metaAmount = paymentIntent.metadata?.amount ? parseFloat(paymentIntent.metadata.amount) : undefined;
        if (senderId && receiverId && metaAmount !== undefined) {
          const tip = await this.prisma.tip.findFirst({
            where: {
              senderId,
              receiverId,
              amount: metaAmount,
              status: 'pending',
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          });
          tipId = tip?.id ?? null;
        } else {
          this.logger.warn(`Tip fallback skipped: missing metadata fields (senderId=${senderId}, receiverId=${receiverId}, amount=${metaAmount})`);
        }
      }

      if (!tipId) {
        this.logger.warn(`No tip found for payment intent ${paymentIntent.id} (Redis + DB fallback failed)`);
        return;
      }
    }

    // Idempotency guard: check if tip is already completed before entering $transaction
    const existingTip = await this.prisma.tip.findUnique({
      where: { id: tipId as string },
      select: { status: true },
    });
    if (existingTip?.status === 'completed') {
      this.logger.log(`Tip ${tipId} already completed — skipping (idempotent)`);
      return;
    }

    // Atomically: update tip status + credit receiver
    const completedTip = await this.prisma.$transaction(async (tx) => {
      const tip = await tx.tip.update({
        where: { id: tipId as string },
        data: {
          status: 'completed',
          stripePaymentId: paymentIntent.id,
        },
        select: { receiverId: true, senderId: true, amount: true, platformFee: true },
      });

      // Credit receiver's diamond balance (amount minus platform fee, converted to diamonds)
      if (tip.receiverId) {
        const netAmount = Number(tip.amount) - Number(tip.platformFee);
        const diamondsEarned = Math.floor(netAmount / DIAMOND_TO_USD);

        if (diamondsEarned > 0) {
          await tx.coinBalance.upsert({
            where: { userId: tip.receiverId },
            update: { diamonds: { increment: diamondsEarned } },
            create: { userId: tip.receiverId, coins: 0, diamonds: diamondsEarned },
          });

          // Create audit trail for diamond credit (required by reconciliation)
          await tx.coinTransaction.create({
            data: {
              userId: tip.receiverId,
              type: 'TIP_RECEIVED',
              amount: diamondsEarned,
              description: `Tip received (+${diamondsEarned} diamonds) — Stripe PI: ${paymentIntent.id}`,
            },
          });
        }
      }

      return tip;
    });

    // Notify receiver they received a tip (use returned tip from $transaction)
    if (completedTip?.receiverId) {
      const sender = completedTip.senderId
        ? await this.prisma.user.findUnique({ where: { id: completedTip.senderId }, select: { username: true } })
        : null;
      this.notifications.create({
        userId: completedTip.receiverId,
        actorId: completedTip.senderId ?? null,
        type: 'SYSTEM',
        title: 'Tip received!',
        body: `${sender?.username ? `@${sender.username}` : 'Someone'} sent you a $${Number(completedTip.amount).toFixed(2)} tip.`,
      }).catch(err => this.logger.warn('Failed to create tip notification', err instanceof Error ? err.message : err));
    }

    // Clean up Redis mapping
    await this.redis.del(`payment_intent:${paymentIntent.id}`);
  }

  async handleInvoicePaid(invoice: Stripe.Invoice) {
    const subscriptionId = 'subscription' in invoice ? String(invoice.subscription ?? '') : '';
    if (!subscriptionId) return;

    let dbSubscriptionId = await this.redis.get(`subscription:${subscriptionId}`);
    if (!dbSubscriptionId) {
      // Redis mapping expired — try DB fallback via Stripe metadata
      const userId = invoice.metadata?.userId || invoice.metadata?.mizanlyUserId;
      const tierId = invoice.metadata?.tierId || invoice.metadata?.mizanlyTierId;
      if (userId && tierId) {
        const sub = await this.prisma.membershipSubscription.findUnique({
          where: { tierId_userId: { tierId, userId } },
          select: { id: true },
        });
        dbSubscriptionId = sub?.id ?? null;
        if (dbSubscriptionId) {
          // Re-store the mapping for future webhooks
          await this.storeSubscriptionMapping(subscriptionId, dbSubscriptionId);
        }
      }
      if (!dbSubscriptionId) {
        this.logger.warn(`No subscription found for Stripe subscription ${subscriptionId} (Redis + DB fallback failed)`);
        return;
      }
    }

    // Update subscription end date (extend by one period)
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const periodEnd = 'current_period_end' in subscription ? (subscription.current_period_end as number) : undefined;
      const endDate = periodEnd ? new Date(periodEnd * 1000) : new Date();

      await this.prisma.membershipSubscription.update({
        where: { id: dbSubscriptionId },
        data: { status: 'active', endDate },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to retrieve Stripe subscription ${subscriptionId}: ${msg}`);
      // Still mark as active with current date — better than leaving stale
      await this.prisma.membershipSubscription.update({
        where: { id: dbSubscriptionId },
        data: { status: 'active', endDate: new Date() },
      });
    }
  }

  async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    let dbSubscriptionId = await this.redis.get(`subscription:${subscription.id}`);
    if (!dbSubscriptionId) {
      // Redis mapping expired — try DB fallback via Stripe metadata
      const userId = subscription.metadata?.userId || subscription.metadata?.mizanlyUserId;
      const tierId = subscription.metadata?.tierId || subscription.metadata?.mizanlyTierId;
      if (userId && tierId) {
        const sub = await this.prisma.membershipSubscription.findUnique({
          where: { tierId_userId: { tierId, userId } },
          select: { id: true },
        });
        dbSubscriptionId = sub?.id ?? null;
      }
      if (!dbSubscriptionId) {
        this.logger.warn(`No subscription found for deleted Stripe subscription ${subscription.id} (Redis + DB fallback failed)`);
        return;
      }
    }

    // Update our record
    await this.prisma.membershipSubscription.update({
      where: { id: dbSubscriptionId },
      data: { status: 'cancelled', endDate: new Date() },
    });

    // Clean up both mappings
    await this.redis.del(`subscription:${subscription.id}`);
    await this.redis.del(`subscription:internal:${dbSubscriptionId}`);
  }

  async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    let tipId = await this.redis.get(`payment_intent:${paymentIntent.id}`);
    if (!tipId) {
      // Redis mapping expired or lost — try DB fallback via metadata
      const senderId = paymentIntent.metadata?.senderId;
      if (senderId) {
        const tip = await this.prisma.tip.findFirst({
          where: { senderId, status: 'pending' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        tipId = tip?.id ?? null;
      }
      if (!tipId) {
        this.logger.warn(`No tip found for failed payment intent ${paymentIntent.id}`);
        return;
      }
    }

    // Update tip status to failed
    await this.prisma.tip.update({
      where: { id: tipId },
      data: {
        status: 'failed',
        message: JSON.stringify({
          stripePaymentIntentId: paymentIntent.id,
          status: 'failed',
          failedAt: new Date().toISOString(),
          failureMessage: paymentIntent.last_payment_error?.message ?? 'Payment failed',
        }),
      },
    });

    // Clean up mapping
    await this.redis.del(`payment_intent:${paymentIntent.id}`);
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId = 'subscription' in invoice ? String(invoice.subscription ?? '') : '';
    if (!subscriptionId) return;

    let dbSubscriptionId = await this.redis.get(`subscription:${subscriptionId}`);
    if (!dbSubscriptionId) {
      // DB fallback: Redis mapping may have expired — try finding via Stripe metadata
      const userId = invoice.metadata?.userId || invoice.metadata?.mizanlyUserId;
      const tierId = invoice.metadata?.tierId || invoice.metadata?.mizanlyTierId;
      if (userId && tierId) {
        const sub = await this.prisma.membershipSubscription.findUnique({
          where: { tierId_userId: { tierId, userId } },
          select: { id: true },
        });
        dbSubscriptionId = sub?.id ?? null;
      }
      if (!dbSubscriptionId) {
        this.logger.warn(`No subscription found for failed invoice on Stripe subscription ${subscriptionId} (Redis + DB fallback failed)`);
        return;
      }
    }

    // Finding #368: Mark subscription as past_due with 3-day grace period
    const graceDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await this.prisma.membershipSubscription.update({
      where: { id: dbSubscriptionId },
      data: { status: 'past_due', endDate: graceDeadline },
    });

    this.logger.warn(`Subscription ${dbSubscriptionId} marked as past_due due to failed invoice payment`);
  }

  async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    let dbSubscriptionId = await this.redis.get(`subscription:${subscription.id}`);
    if (!dbSubscriptionId) {
      // Redis mapping expired — try DB fallback via metadata
      const userId = subscription.metadata?.userId || subscription.metadata?.mizanlyUserId;
      const tierId = subscription.metadata?.tierId || subscription.metadata?.mizanlyTierId;
      if (userId && tierId) {
        const sub = await this.prisma.membershipSubscription.findUnique({
          where: { tierId_userId: { tierId, userId } },
          select: { id: true },
        });
        dbSubscriptionId = sub?.id ?? null;
      }
      if (!dbSubscriptionId) {
        this.logger.warn(`No subscription found for updated Stripe subscription ${subscription.id}`);
        return;
      }
    }

    // Map Stripe status to our status
    const statusMap: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      unpaid: 'past_due',
      paused: 'paused',
    };
    const mappedStatus = statusMap[subscription.status] ?? 'active';

    const periodEnd = 'current_period_end' in subscription
      ? (subscription.current_period_end as number) : undefined;

    await this.prisma.membershipSubscription.update({
      where: { id: dbSubscriptionId },
      data: {
        status: mappedStatus,
        endDate: periodEnd ? new Date(periodEnd * 1000) : undefined,
      },
    });
  }

  async handleDisputeCreated(dispute: Record<string, unknown>) {
    // Log the dispute for manual review
    const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : '';
    const reason = typeof dispute.reason === 'string' ? dispute.reason : 'unknown';
    const amount = typeof dispute.amount === 'number' ? dispute.amount : 0;

    this.logger.error(`CHARGEBACK DISPUTE: payment_intent=${paymentIntentId}, reason=${reason}, amount=${amount}`);

    if (!paymentIntentId) return;

    // Find the tip: Redis first, then DB fallback (disputes arrive days/weeks after payment — Redis TTL may have expired)
    let tipId = await this.redis.get(`payment_intent:${paymentIntentId}`);
    if (!tipId) {
      const mapping = await this.prisma.paymentMapping.findUnique({
        where: { stripeId: paymentIntentId },
        select: { internalId: true },
      }).catch(() => null);
      tipId = mapping?.internalId ?? null;
    }
    if (!tipId) {
      // Last resort: find by stripePaymentId on tip
      const tipByPI = await this.prisma.tip.findFirst({
        where: { stripePaymentId: paymentIntentId },
        select: { id: true },
      });
      tipId = tipByPI?.id ?? null;
    }
    if (!tipId) {
      this.logger.warn(`No tip found for disputed payment intent ${paymentIntentId} (Redis + DB fallback failed)`);
      return;
    }

    // Atomically: mark tip as disputed AND reverse diamond credit to receiver
    await this.prisma.$transaction(async (tx) => {
      // Idempotency: skip if already disputed (e.g. dispute update event for same PI)
      const currentTip = await tx.tip.findUnique({
        where: { id: tipId as string },
        select: { status: true },
      });
      if (currentTip?.status === 'disputed') {
        this.logger.warn(`Tip ${tipId} already disputed — skipping duplicate reversal`);
        return;
      }

      const tip = await tx.tip.update({
        where: { id: tipId as string },
        data: {
          status: 'disputed',
          message: JSON.stringify({
            stripePaymentIntentId: paymentIntentId,
            status: 'disputed',
            disputeReason: reason,
            disputedAt: new Date().toISOString(),
          }),
        },
        select: { receiverId: true, amount: true, platformFee: true },
      });

      // Reverse the diamond credit that was given to the receiver
      if (tip.receiverId) {
        const netAmount = Number(tip.amount) - Number(tip.platformFee);
        const diamondsToDeduct = Math.floor(netAmount / DIAMOND_TO_USD);

        if (diamondsToDeduct > 0) {
          // Conditional decrement: don't go below 0
          await tx.coinBalance.updateMany({
            where: { userId: tip.receiverId, diamonds: { gte: diamondsToDeduct } },
            data: { diamonds: { decrement: diamondsToDeduct } },
          });

          await tx.coinTransaction.create({
            data: {
              userId: tip.receiverId,
              type: 'TIP_RECEIVED',
              amount: -diamondsToDeduct,
              description: `Tip disputed — ${diamondsToDeduct} diamonds reversed. Stripe PI: ${paymentIntentId}`,
            },
          });
        }
      }
    });

    this.logger.warn(`Tip ${tipId} marked as disputed, diamonds reversed for PI ${paymentIntentId}`);
  }
}