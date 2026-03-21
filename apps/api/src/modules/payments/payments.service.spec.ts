import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PaymentsService } from './payments.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock Stripe entirely — we don't make real API calls in tests
const mockStripeInstance = {
  customers: {
    create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
    update: jest.fn().mockResolvedValue({}),
  },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'secret_test' }),
  },
  paymentMethods: {
    list: jest.fn().mockResolvedValue({ data: [{ id: 'pm_1', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2027 } }] }),
    attach: jest.fn().mockResolvedValue({}),
  },
  products: {
    create: jest.fn().mockResolvedValue({ id: 'prod_test' }),
  },
  subscriptions: {
    create: jest.fn().mockResolvedValue({
      id: 'sub_test', status: 'active',
      latest_invoice: { payment_intent: { client_secret: 'sub_secret' } },
      current_period_end: Math.floor(Date.now() / 1000) + 2592000,
    }),
    cancel: jest.fn().mockResolvedValue({}),
    retrieve: jest.fn().mockResolvedValue({ current_period_end: Math.floor(Date.now() / 1000) + 2592000 }),
  },
};
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripeInstance),
}));

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'test@test.com', username: 'test', displayName: 'Test' }) },
            tip: { create: jest.fn().mockResolvedValue({ id: 'tip-1' }), update: jest.fn() },
            membershipTier: { findUnique: jest.fn() },
            membershipSubscription: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
          },
        },
      ],
    }).compile();
    service = module.get(PaymentsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent for tip', async () => {
      redis.get.mockResolvedValue(null); // No cached customer
      redis.setex.mockResolvedValue('OK');
      const result = await service.createPaymentIntent('u1', 'u2', 10, 'USD');
      expect(result.clientSecret).toBe('secret_test');
      expect(result.amount).toBe(10);
      expect(result.tipId).toBe('tip-1');
    });

    it('should throw for zero amount', async () => {
      await expect(service.createPaymentIntent('u1', 'u2', 0, 'USD')).rejects.toThrow(BadRequestException);
    });

    it('should throw for self-tip', async () => {
      await expect(service.createPaymentIntent('u1', 'u1', 10, 'USD')).rejects.toThrow(BadRequestException);
    });

    it('should throw if receiver not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'test@test.com' }); // sender for customer
      prisma.user.findUnique.mockResolvedValueOnce(null); // receiver not found
      // The receiver check happens before customer creation
      // Actually the order is: validate amount → validate not self → verify receiver → get customer
      // Let's mock properly
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.createPaymentIntent('u1', 'u2', 10, 'USD')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSubscription', () => {
    it('should create subscription for tier', async () => {
      redis.get.mockResolvedValue('cus_cached'); // Cached customer
      prisma.membershipTier.findUnique.mockResolvedValue({ id: 'tier1', price: 10, currency: 'USD', isActive: true, userId: 'creator' });
      prisma.membershipSubscription.findUnique.mockResolvedValue(null);
      prisma.membershipSubscription.create.mockResolvedValue({ id: 'sub-db-1' });
      redis.setex.mockResolvedValue('OK');
      const result = await service.createSubscription('u1', 'tier1', 'pm_test');
      expect(result.subscriptionId).toBe('sub_test');
      expect(result.status).toBe('active');
    });

    it('should throw for non-existent tier', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue(null);
      await expect(service.createSubscription('u1', 'tier1', 'pm_test')).rejects.toThrow(NotFoundException);
    });

    it('should throw for inactive tier', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue({ id: 'tier1', isActive: false });
      await expect(service.createSubscription('u1', 'tier1', 'pm_test')).rejects.toThrow(BadRequestException);
    });

    it('should throw for subscribing to own tier', async () => {
      prisma.membershipTier.findUnique.mockResolvedValue({ id: 'tier1', isActive: true, userId: 'u1' });
      await expect(service.createSubscription('u1', 'tier1', 'pm_test')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription by internal ID', async () => {
      redis.get.mockResolvedValue('sub_stripe_test'); // Stripe subscription ID from mapping
      prisma.membershipSubscription.findFirst.mockResolvedValue({ id: 'sub-db-1', userId: 'u1' });
      prisma.membershipSubscription.update.mockResolvedValue({});
      redis.del.mockResolvedValue(1);
      const result = await service.cancelSubscription('u1', 'sub-db-1');
      expect(result.message).toContain('cancelled');
    });

    it('should throw if subscription not found', async () => {
      redis.get.mockResolvedValue(null);
      prisma.membershipSubscription.findFirst.mockResolvedValue(null);
      await expect(service.cancelSubscription('u1', 'sub-db-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPaymentMethods', () => {
    it('should return payment methods', async () => {
      redis.get.mockResolvedValue('cus_cached');
      const result = await service.listPaymentMethods('u1');
      expect(result).toHaveLength(1);
      expect(result[0].brand).toBe('visa');
      expect(result[0].last4).toBe('4242');
    });
  });

  describe('handlePaymentIntentSucceeded', () => {
    it('should update tip status to completed', async () => {
      redis.get.mockResolvedValue('tip-1');
      prisma.tip.update.mockResolvedValue({});
      redis.del.mockResolvedValue(1);
      await service.handlePaymentIntentSucceeded({ id: 'pi_test' } as any);
      expect(prisma.tip.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tip-1' }, data: expect.objectContaining({ status: 'completed' }) }),
      );
    });

    it('should log warning if no tip found', async () => {
      redis.get.mockResolvedValue(null);
      // Should not throw — just logs warning
      await service.handlePaymentIntentSucceeded({ id: 'pi_unknown' } as any);
      expect(prisma.tip.update).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionDeleted', () => {
    it('should mark subscription cancelled and cleanup Redis', async () => {
      redis.get.mockResolvedValue('sub-internal-1');
      prisma.membershipSubscription.update.mockResolvedValue({});
      redis.del.mockResolvedValue(1);

      await service.handleSubscriptionDeleted({ id: 'sub_stripe_1' } as any);

      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-internal-1' },
        data: { status: 'cancelled', endDate: expect.any(Date) },
      });
      expect(redis.del).toHaveBeenCalled();
    });

    it('should skip gracefully when no internal subscription mapped', async () => {
      redis.get.mockResolvedValue(null);
      await service.handleSubscriptionDeleted({ id: 'sub_unknown' } as any);
      expect(prisma.membershipSubscription.update).not.toHaveBeenCalled();
    });
  });

  describe('handlePaymentMethodAttached', () => {
    it('should not throw — logs only', async () => {
      await expect(
        service.handlePaymentMethodAttached({ id: 'pm_123' } as any),
      ).resolves.not.toThrow();
    });
  });

  describe('createSubscription — pending status', () => {
    it('should create subscription with pending status (not active)', async () => {
      redis.get.mockResolvedValue('cus_cached');
      prisma.membershipTier.findUnique.mockResolvedValue({ id: 'tier1', price: 10, currency: 'USD', isActive: true, userId: 'creator' });
      prisma.membershipSubscription.findUnique.mockResolvedValue(null);
      prisma.membershipSubscription.create.mockResolvedValue({ id: 'sub-db-1' });
      redis.setex.mockResolvedValue('OK');
      await service.createSubscription('u1', 'tier1', 'pm_test');
      expect(prisma.membershipSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
      );
    });
  });

  describe('cancelSubscription — cancel_pending on Stripe failure', () => {
    it('should return cancel_pending when Stripe cancel fails', async () => {
      redis.get.mockResolvedValue('sub-db-1'); // Redis mapping exists
      prisma.membershipSubscription.findFirst.mockResolvedValue({ id: 'sub-db-1', userId: 'u1' });
      prisma.membershipSubscription.update.mockResolvedValue({});
      redis.del.mockResolvedValue(1);
      // Mock Stripe cancel failure
      mockStripeInstance.subscriptions.cancel.mockRejectedValueOnce(new Error('Stripe error'));
      const result = await service.cancelSubscription('u1', 'sub_failing');
      expect(result.message).toContain('pending');
      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'cancel_pending' }) }),
      );
    });
  });

  describe('attachPaymentMethod — error handling', () => {
    it('should throw BadRequestException when Stripe fails', async () => {
      redis.get.mockResolvedValue('cus_cached');
      mockStripeInstance.paymentMethods.attach.mockRejectedValueOnce(new Error('Card declined'));
      await expect(service.attachPaymentMethod('u1', 'pm_bad')).rejects.toThrow(BadRequestException);
    });
  });

  describe('listPaymentMethods — error handling', () => {
    it('should throw BadRequestException when Stripe API fails', async () => {
      redis.get.mockResolvedValue('cus_cached');
      mockStripeInstance.paymentMethods.list.mockRejectedValueOnce(new Error('API error'));
      await expect(service.listPaymentMethods('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('handlePaymentIntentSucceeded — DB fallback', () => {
    it('should fall back to DB when Redis mapping missing', async () => {
      redis.get.mockResolvedValue(null);
      prisma.tip.findFirst = jest.fn().mockResolvedValue({ id: 'tip-fallback' });
      prisma.tip.update.mockResolvedValue({});
      redis.del.mockResolvedValue(1);
      await service.handlePaymentIntentSucceeded({
        id: 'pi_test', metadata: { senderId: 'u1' },
      } as any);
      expect(prisma.tip.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tip-fallback' } }),
      );
    });
  });

  describe('handleInvoicePaid — try/catch on retrieve', () => {
    it('should still mark active when Stripe retrieve fails', async () => {
      redis.get.mockResolvedValue('sub-db-1');
      mockStripeInstance.subscriptions.retrieve.mockRejectedValueOnce(new Error('Not found'));
      prisma.membershipSubscription.update.mockResolvedValue({});
      await service.handleInvoicePaid({ subscription: 'sub_test' } as any);
      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }),
      );
    });
  });
});
