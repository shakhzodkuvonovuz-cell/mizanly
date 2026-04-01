import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../config/prisma.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('Payments')
@Controller('payments/webhooks')
@SkipThrottle()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private paymentsService: PaymentsService,
    private config: ConfigService,
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY') || '';
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    });
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
  }

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook handler (payment_intent.succeeded, invoice.paid, etc.)' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available');
    }

    if (!this.webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not configured');
      throw new BadRequestException('Webhook secret not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err: unknown) {
      this.logger.warn('Invalid Stripe webhook signature', err instanceof Error ? err.message : 'Unknown error');
      throw new BadRequestException('Invalid webhook signature');
    }

    // Idempotency: check if this event ID has already been processed (Redis first, DB fallback)
    const dedupeKey = `stripe_webhook:${event.id}`;
    const alreadyProcessed = await this.redis.get(dedupeKey);
    if (alreadyProcessed) {
      this.logger.debug(`Stripe webhook ${event.id} already processed (Redis) — skipping`);
      return { received: true, deduplicated: true };
    }
    // DB fallback: Redis may have been flushed
    const dbEvent = await this.prisma.processedWebhookEvent.findUnique({
      where: { eventId: event.id },
    });
    if (dbEvent) {
      // Re-populate Redis from DB so future retries are fast
      await this.redis.setex(dedupeKey, 604800, '1').catch((e) => this.logger.debug('Webhook dedup cache failed', e?.message));
      this.logger.debug(`Stripe webhook ${event.id} already processed (DB) — skipping`);
      return { received: true, deduplicated: true };
    }
    this.logger.log(`Stripe webhook received: ${event.type}`);

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await this.paymentsService.handlePaymentIntentSucceeded(paymentIntent);
          break;
        }
        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await this.paymentsService.handlePaymentIntentFailed(paymentIntent);
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          await this.paymentsService.handleInvoicePaid(invoice);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await this.paymentsService.handleInvoicePaymentFailed(invoice);
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.paymentsService.handleSubscriptionDeleted(subscription);
          break;
        }
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.paymentsService.handleSubscriptionUpdated(subscription);
          break;
        }
        case 'charge.dispute.created': {
          const dispute = event.data.object as unknown as Record<string, unknown>;
          await this.paymentsService.handleDisputeCreated(dispute);
          break;
        }
        case 'payment_method.attached': {
          this.logger.debug(`Payment method attached: ${(event.data.object as Stripe.PaymentMethod).id}`);
          break;
        }
        default:
          this.logger.warn(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Stripe webhook handler failed for ${event.type} (${event.id})`, error);

      // Deterministic errors (bad data, not found, validation) will fail identically on every retry.
      // Return 200 to stop Stripe's 3-day retry loop. Log for investigation.
      const isDeterministic = error instanceof HttpException
        && (error instanceof BadRequestException
        || error instanceof NotFoundException
        || error instanceof ForbiddenException);
      if (isDeterministic) {
        this.logger.warn(`Deterministic webhook error for ${event.id} — returning 200 to stop retries`);
        // Mark as processed to prevent future retries
        await this.prisma.processedWebhookEvent.create({
          data: { eventId: event.id },
        }).catch((e) => this.logger.debug('Webhook dedup cache failed', e?.message));
        return { received: true, error: 'deterministic_failure' };
      }

      throw error;
    }

    // Mark as processed ONLY after handler succeeds — write to both Redis (fast) AND DB (durable)
    try {
      await this.redis.setex(dedupeKey, 604800, '1');
    } catch (redisErr) {
      this.logger.error(`Failed to set webhook dedup key in Redis: ${dedupeKey}`, redisErr);
    }
    try {
      await this.prisma.processedWebhookEvent.create({
        data: { eventId: event.id },
      });
    } catch (dbErr) {
      // Unique constraint violation is fine (already exists), other errors are logged
      if (!(dbErr instanceof Error && dbErr.message.includes('Unique constraint'))) {
        this.logger.error(`Failed to persist webhook dedup to DB: ${event.id}`, dbErr);
      }
    }

    return { received: true };
  }
}
