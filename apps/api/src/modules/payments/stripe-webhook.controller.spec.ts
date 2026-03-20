import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentsService } from './payments.service';
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
            handlePaymentMethodAttached: jest.fn(),
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
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const req = { rawBody: Buffer.from('body') } as any;

    await expect(controller.handleStripeWebhook(req, 'sig')).rejects.toThrow(BadRequestException);
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
