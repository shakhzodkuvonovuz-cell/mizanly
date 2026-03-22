import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import Stripe from 'stripe';
import Redis from 'ioredis';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;
  private readonly stripeAvailable: boolean;

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripeAvailable = !!secretKey;
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not set — payment operations will fail');
    }
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2026-02-25.clover',
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
    // 30-day TTL — payment intents are short-lived
    await this.redis.setex(`payment_intent:${paymentIntentId}`, 60 * 60 * 24 * 30, tipId);
  }

  /**
   * Store mapping between Stripe subscription and our subscription ID (both directions)
   */
  private async storeSubscriptionMapping(stripeSubscriptionId: string, subscriptionId: string) {
    // 1-year TTL — subscriptions are long-lived, must survive multiple renewal cycles
    const ONE_YEAR = 60 * 60 * 24 * 365;
    await this.redis.setex(`subscription:${stripeSubscriptionId}`, ONE_YEAR, subscriptionId);
    await this.redis.setex(`subscription:internal:${subscriptionId}`, ONE_YEAR, stripeSubscriptionId);
  }

  /**
   * Get internal subscription ID from Stripe subscription ID
   */
  private async getInternalSubscriptionId(stripeSubscriptionId: string): Promise<string | null> {
    return await this.redis.get(`subscription:${stripeSubscriptionId}`);
  }

  /**
   * Get Stripe subscription ID from internal subscription ID
   */
  private async getStripeSubscriptionId(internalSubscriptionId: string): Promise<string | null> {
    return await this.redis.get(`subscription:internal:${internalSubscriptionId}`);
  }

  // ==================== Public Endpoints ====================

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

    // Verify receiver exists
    const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
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
        platformFee: amount * 0.10, // 10% platform fee
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

    // Create Stripe product for this tier, then create subscription
    let subscription: Stripe.Subscription;
    try {
      const product = await this.stripe.products.create({
        name: tier.name,
        metadata: { tierId, mizanlyTierId: tierId },
      });

      subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price_data: {
            currency: tier.currency.toLowerCase(),
            product: product.id,
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
        this.logger.warn(`No tip found for payment intent ${paymentIntent.id} (Redis + DB fallback failed)`);
        return;
      }
    }

    // Update tip status to completed
    await this.prisma.tip.update({
      where: { id: tipId },
      data: {
        status: 'completed',
        message: JSON.stringify({
          stripePaymentIntentId: paymentIntent.id,
          status: 'completed',
          chargedAt: new Date().toISOString(),
        }),
      },
    });

    // Clean up mapping after success (optional)
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

    const dbSubscriptionId = await this.redis.get(`subscription:${subscriptionId}`);
    if (!dbSubscriptionId) {
      this.logger.warn(`No subscription found for failed invoice on Stripe subscription ${subscriptionId}`);
      return;
    }

    // Mark subscription as past_due — user needs to update payment method
    await this.prisma.membershipSubscription.update({
      where: { id: dbSubscriptionId },
      data: { status: 'past_due' },
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

    // If we can find the tip associated with this payment intent, mark it as disputed
    if (paymentIntentId) {
      const tipId = await this.redis.get(`payment_intent:${paymentIntentId}`);
      if (tipId) {
        await this.prisma.tip.update({
          where: { id: tipId },
          data: {
            status: 'disputed',
            message: JSON.stringify({
              stripePaymentIntentId: paymentIntentId,
              status: 'disputed',
              disputeReason: reason,
              disputedAt: new Date().toISOString(),
            }),
          },
        });
      }
    }
  }
}