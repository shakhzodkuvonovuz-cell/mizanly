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
  let redis: Record<string, jest.Mock>;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

    redis = {
      set: jest.fn().mockResolvedValue('OK'), // SET NX succeeds by default
      del: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      processedWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        ...globalMockProviders,
        {
          provide: PaymentsService,
          useValue: {
            handlePaymentIntentSucceeded: jest.fn(),
            handlePaymentIntentFailed: jest.fn(),
            handleInvoicePaid: jest.fn(),
            handleInvoicePaymentFailed: jest.fn(),
            handleSubscriptionDeleted: jest.fn(),
            handleSubscriptionUpdated: jest.fn(),
            handleDisputeCreated: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: 'REDIS',
          useValue: redis,
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
        { provide: PrismaService, useValue: prisma },
        { provide: 'REDIS', useValue: redis },
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
      id: 'evt_success_1',
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
      id: 'evt_inv_1',
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
      id: 'evt_sub_del',
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
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_fail_1',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_failed_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handlePaymentIntentFailed).toHaveBeenCalledWith({ id: 'pi_failed_1' });
    expect(result).toEqual({ received: true });
  });

  it('should handle invoice.payment_failed event — C7', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_fail',
      type: 'invoice.payment_failed',
      data: { object: { id: 'inv_fail_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handleInvoicePaymentFailed).toHaveBeenCalledWith({ id: 'inv_fail_1' });
    expect(result).toEqual({ received: true });
  });

  it('should handle customer.subscription.updated event — C9', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_update',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_updated_1', status: 'active' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handleSubscriptionUpdated).toHaveBeenCalledWith({ id: 'sub_updated_1', status: 'active' });
    expect(result).toEqual({ received: true });
  });

  it('should handle charge.dispute.created event — H10', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_dispute',
      type: 'charge.dispute.created',
      data: { object: { payment_intent: 'pi_disputed', reason: 'fraudulent', amount: 1000 } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handleDisputeCreated).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_disputed' }),
    );
    expect(result).toEqual({ received: true });
  });

  // ═══ Atomic idempotency (SET NX) tests ═══

  it('should reject duplicate events via atomic SET NX — returns deduplicated', async () => {
    // SET NX returns null when key already exists (concurrent/duplicate delivery)
    redis.set.mockResolvedValue(null);

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

  it('should call SET NX with correct key format and 48h TTL', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_claim_test',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_claim' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    await controller.handleStripeWebhook(req, 'valid-sig');

    expect(redis.set).toHaveBeenCalledWith(
      'stripe:event:evt_claim_test',
      '1',
      'EX',
      172800, // 48 hours
      'NX',
    );
  });

  it('should process first-time event when SET NX succeeds', async () => {
    redis.set.mockResolvedValue('OK'); // SET NX succeeds

    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_first',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_first' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(service.handlePaymentIntentSucceeded).toHaveBeenCalledWith({ id: 'pi_first' });
    expect(result).toEqual({ received: true });
  });

  it('should deduplicate via DB fallback when Redis was flushed but DB has record', async () => {
    redis.set.mockResolvedValue('OK'); // SET NX succeeds (Redis was flushed)
    prisma.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: 'evt_db_dupe' }); // DB has it

    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_db_dupe',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_db' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(result).toEqual({ received: true, deduplicated: true });
    expect(service.handlePaymentIntentSucceeded).not.toHaveBeenCalled();
  });

  it('should persist to DB after successful handler execution', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_persist',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_persist' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    await controller.handleStripeWebhook(req, 'valid-sig');

    expect(prisma.processedWebhookEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt_persist' },
    });
  });

  it('should release Redis claim on non-deterministic handler error', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_transient_err',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_err' } },
    });

    // Handler throws a non-deterministic error (e.g., DB timeout)
    service.handlePaymentIntentSucceeded.mockRejectedValue(new Error('DB connection timeout'));

    const req = { rawBody: Buffer.from('body') } as any;
    await expect(controller.handleStripeWebhook(req, 'valid-sig')).rejects.toThrow('DB connection timeout');

    // Redis claim should be released so Stripe retry can succeed
    expect(redis.del).toHaveBeenCalledWith('stripe:event:evt_transient_err');
  });

  it('should log debug for payment_method.attached — L11', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_pm_attach',
      type: 'payment_method.attached',
      data: { object: { id: 'pm_attached_1' } },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    // Should not throw, should return received
    expect(result).toEqual({ received: true });
  });

  it('should log warning for unhandled event type ��� L12', async () => {
    const stripe = (controller as any).stripe;
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_unknown',
      type: 'some.unknown.event',
      data: { object: {} },
    });

    const req = { rawBody: Buffer.from('body') } as any;
    const result = await controller.handleStripeWebhook(req, 'valid-sig');

    expect(result).toEqual({ received: true });
  });
});
