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

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY environment variable is not set');
    }
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2026-02-25.clover',
    });
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
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.displayName || user.username,
      metadata: { userId, mizanlyUserId: userId },
    });

    // Store in Redis with 30-day expiry
    await this.redis.setex(redisKey, 60 * 60 * 24 * 30, customer.id);
    return customer.id;
  }

  /**
   * Store mapping between Stripe payment intent and our tip ID
   */
  private async storePaymentIntentMapping(paymentIntentId: string, tipId: string) {
    await this.redis.setex(`payment_intent:${paymentIntentId}`, 60 * 60 * 24 * 7, tipId);
  }

  /**
   * Store mapping between Stripe subscription and our subscription ID (both directions)
   */
  private async storeSubscriptionMapping(stripeSubscriptionId: string, subscriptionId: string) {
    await this.redis.setex(`subscription:${stripeSubscriptionId}`, 60 * 60 * 24 * 30, subscriptionId);
    await this.redis.setex(`subscription:internal:${subscriptionId}`, 60 * 60 * 24 * 30, stripeSubscriptionId);
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
    const paymentIntent = await this.stripe.paymentIntents.create({
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

    // Attach payment method to customer (if not already)
    await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

    // Set as default payment method
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Create Stripe product for this tier, then create subscription
    const product = await this.stripe.products.create({
      name: tier.name,
      metadata: { tierId, mizanlyTierId: tierId },
    });

    const subscription = await this.stripe.subscriptions.create({
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

    // Create or update our subscription record
    const existing = await this.prisma.membershipSubscription.findUnique({
      where: { tierId_userId: { tierId, userId } },
    });
    let dbSubscription;
    if (existing) {
      dbSubscription = await this.prisma.membershipSubscription.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          startDate: new Date(),
          endDate: null,
        },
      });
    } else {
      dbSubscription = await this.prisma.membershipSubscription.create({
        data: {
          tierId,
          userId,
          status: 'active',
          startDate: new Date(),
          endDate: null,
        },
      });
    }

    // Store mapping
    await this.storeSubscriptionMapping(subscription.id, dbSubscription.id);

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent = (latestInvoice as unknown as { payment_intent?: Stripe.PaymentIntent | null })?.payment_intent ?? null;

    const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
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
      await this.stripe.subscriptions.cancel(stripeSubscriptionId);
    }

    // Update our record
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
  }

  async attachPaymentMethod(userId: string, paymentMethodId: string) {
    const customerId = await this.getOrCreateStripeCustomer(userId);
    await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    return { success: true };
  }

  // ==================== Webhook Handlers ====================

  async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const tipId = await this.redis.get(`payment_intent:${paymentIntent.id}`);
    if (!tipId) {
      this.logger.warn(`No tip found for payment intent ${paymentIntent.id}`);
      return;
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
    const subscriptionId = String((invoice as unknown as { subscription?: string }).subscription ?? '');
    if (!subscriptionId) return;

    const dbSubscriptionId = await this.redis.get(`subscription:${subscriptionId}`);
    if (!dbSubscriptionId) {
      this.logger.warn(`No subscription found for Stripe subscription ${subscriptionId}`);
      return;
    }

    // Update subscription end date (extend by one period)
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
    const endDate = periodEnd ? new Date(periodEnd * 1000) : new Date();

    await this.prisma.membershipSubscription.update({
      where: { id: dbSubscriptionId },
      data: { endDate },
    });
  }

  async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const dbSubscriptionId = await this.redis.get(`subscription:${subscription.id}`);
    if (!dbSubscriptionId) {
      this.logger.warn(`No subscription found for deleted Stripe subscription ${subscription.id}`);
      return;
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

  async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
    // No action needed, but we can log
    this.logger.debug(`Payment method attached: ${paymentMethod.id}`);
  }
}