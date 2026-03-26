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
});
