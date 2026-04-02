import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock Stripe — default import needs __esModule + default
jest.mock('stripe', () => {
  const mockStripe = jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
  return { __esModule: true, default: mockStripe };
});

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let service: jest.Mocked<PaymentsService>;

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        ...globalMockProviders,
        {
          provide: PaymentsService,
          useValue: {
            handlePaymentIntentSucceeded: jest.fn(),
            handleInvoicePaid: jest.fn(),
            handleSubscriptionDeleted: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn().mockResolvedValue('OK'),
          },
        },
      ],
    }).compile();

    controller = module.get(StripeWebhookController);
    service = module.get(PaymentsService) as jest.Mocked<PaymentsService>;
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw BadRequestException when rawBody is missing', async () => {
    const req = { rawBody: undefined } as any;

    await expect(controller.handleStripeWebhook(req, 'sig')).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when webhook secret is not configured', async () => {
    // Create a controller with no webhook secret configured
    const module2 = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: PaymentsService, useValue: service },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
        { provide: PrismaService, useValue: { processedWebhookEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn().mockResolvedValue('OK') } },
      ],
    }).compile();
    const ctrl2 = module2.get(StripeWebhookController);
    const req = { rawBody: Buffer.from('body') } as any;

    await expect(ctrl2.handleStripeWebhook(req, 'sig')).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException on invalid signature', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const req = { rawBody: Buffer.from('body') } as any;

    await expect(controller.handleStripeWebhook(req, 'bad-sig')).rejects.toThrow(BadRequestException);
  });

  it('should handle payment_intent.succeeded event', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handlePaymentIntentSucceeded).toHaveBeenCalledWith({ id: 'pi_1' });
    expect(result).toEqual({ received: true });
  });

  it('should handle invoice.paid event', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: { object: { id: 'inv_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handleInvoicePaid).toHaveBeenCalledWith({ id: 'inv_1' });
    expect(result).toEqual({ received: true });
  });

  it('should handle customer.subscription.deleted event', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handleSubscriptionDeleted).toHaveBeenCalledWith({ id: 'sub_1' });
    expect(result).toEqual({ received: true });
  });

  // ═══ T08 Audit: Missing webhook event branches ═══

  it('should handle payment_intent.payment_failed event — C5', async () => {
    (service as any).handlePaymentIntentFailed = jest.fn();
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_fail_1',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_failed_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect((service as any).handlePaymentIntentFailed).toHaveBeenCalledWith({ id: 'pi_failed_1' });
    expect(result).toEqual({ received: true });
  });

  it('should handle invoice.payment_failed event — C7', async () => {
    (service as any).handleInvoicePaymentFailed = jest.fn();
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_fail',
      type: 'invoice.payment_failed',
      data: { object: { id: 'inv_fail_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect((service as any).handleInvoicePaymentFailed).toHaveBeenCalledWith({ id: 'inv_fail_1' });
    expect(result).toEqual({ received: true });
  });

  it('should handle customer.subscription.updated event — C9', async () => {
    (service as any).handleSubscriptionUpdated = jest.fn();
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_update',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_updated_1', status: 'active' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect((service as any).handleSubscriptionUpdated).toHaveBeenCalledWith({ id: 'sub_updated_1', status: 'active' });
    expect(result).toEqual({ received: true });
  });

  it('should handle charge.dispute.created event — H10', async () => {
    (service as any).handleDisputeCreated = jest.fn();
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_dispute',
      type: 'charge.dispute.created',
      data: { object: { payment_intent: 'pi_disputed', reason: 'fraudulent', amount: 1000 } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect((service as any).handleDisputeCreated).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_disputed' }),
    );
    expect(result).toEqual({ received: true });
  });

  it('should deduplicate already-processed events via Redis — H13', async () => {
    const redis = (controller as any).redis;
    redis.get.mockResolvedValue('1'); // Already processed

    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_dupe',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_dupe' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(result).toEqual({ received: true, deduplicated: true });
    expect(service.handlePaymentIntentSucceeded).not.toHaveBeenCalled();
  });
});
