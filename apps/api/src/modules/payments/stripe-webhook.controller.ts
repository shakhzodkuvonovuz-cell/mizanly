import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
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

    // Idempotency: check if this event ID has already been processed
    const dedupeKey = `stripe_webhook:${event.id}`;
    const alreadyProcessed = await this.redis.get(dedupeKey);
    if (alreadyProcessed) {
      this.logger.debug(`Stripe webhook ${event.id} already processed — skipping`);
      return { received: true, deduplicated: true };
    }
    // Mark as processed with 7-day TTL (Stripe retries for up to 3 days)
    await this.redis.setex(dedupeKey, 604800, '1');

    this.logger.log(`Stripe webhook received: ${event.type}`);

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
        // Informational only — no action needed
        this.logger.debug(`Payment method attached: ${(event.data.object as Stripe.PaymentMethod).id}`);
        break;
      }
      default:
        this.logger.warn(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }
}
