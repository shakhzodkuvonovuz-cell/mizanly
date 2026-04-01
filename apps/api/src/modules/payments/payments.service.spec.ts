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
    search: jest.fn().mockResolvedValue({ data: [] }),
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
            tip: { create: jest.fn().mockResolvedValue({ id: 'tip-1' }), update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null) },
            membershipTier: { findUnique: jest.fn() },
            membershipSubscription: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
            coinTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
            premiumSubscription: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
            paymentMapping: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
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

  describe('handlePaymentIntentSucceeded — routing', () => {
    it('should route coin_purchase to handleCoinPurchaseSucceeded', async () => {
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
        fn({
          coinBalance: { upsert: jest.fn().mockResolvedValue({}) },
          coinTransaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }),
      );
      await service.handlePaymentIntentSucceeded({
        id: 'pi_coin', metadata: { type: 'coin_purchase', userId: 'u1', coinAmount: '500' },
      } as any);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should route marketplace_order to handleMarketplaceOrderSucceeded', async () => {
      prisma.order = {
        findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ product: { title: 'Test' }, buyerId: 'u1' }),
      };
      await service.handlePaymentIntentSucceeded({
        id: 'pi_order', metadata: { type: 'marketplace_order', orderId: 'pending', sellerId: 'seller-1' },
      } as any);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
      );
    });

    it('should route premium_subscription to handlePremiumPaymentSucceeded', async () => {
      prisma.premiumSubscription = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'prem-1', status: 'ACTIVE' }),
      };
      await service.handlePaymentIntentSucceeded({
        id: 'pi_premium', metadata: { type: 'premium_subscription', userId: 'u1', plan: 'MONTHLY' },
      } as any);
      expect(prisma.premiumSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'ACTIVE' }),
          update: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('should default to tip handler (legacy) when no type in metadata', async () => {
      redis.get.mockResolvedValue('tip-1');
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: { update: jest.fn().mockResolvedValue({ receiverId: 'u2', senderId: 'u1', amount: 10, platformFee: 1 }) },
          coinBalance: { upsert: jest.fn().mockResolvedValue({}) },
          coinTransaction: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
      prisma.user.findUnique.mockResolvedValue({ username: 'sender' });
      redis.del.mockResolvedValue(1);
      await service.handlePaymentIntentSucceeded({ id: 'pi_test', metadata: {} } as any);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should credit receiver diamonds on tip completion (Bug 16)', async () => {
      redis.get.mockResolvedValue('tip-1');
      const mockUpsert = jest.fn().mockResolvedValue({});
      const mockTxCreate = jest.fn().mockResolvedValue({});
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: { update: jest.fn().mockResolvedValue({ receiverId: 'u2', senderId: 'u1', amount: 10, platformFee: 1 }) },
          coinBalance: { upsert: mockUpsert },
          coinTransaction: { create: mockTxCreate },
        }),
      );
      prisma.user.findUnique.mockResolvedValue({ username: 'sender' });
      redis.del.mockResolvedValue(1);
      await service.handlePaymentIntentSucceeded({ id: 'pi_tip', metadata: {} } as any);
      // Net amount = 10 - 1 = 9, diamonds = floor(9 / 0.007) = 1285
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u2' },
          update: { diamonds: { increment: 1285 } },
          create: expect.objectContaining({ userId: 'u2', diamonds: 1285 }),
        }),
      );
      // Verify CoinTransaction audit trail created (B08#1 fix)
      expect(mockTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u2', type: 'TIP_RECEIVED', amount: 1285 }),
        }),
      );
    });

    it('should log warning if no tip found (legacy path)', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      redis.get.mockResolvedValue(null);
      await service.handlePaymentIntentSucceeded({ id: 'pi_unknown', metadata: {} } as any);
      expect(loggerSpy).toHaveBeenCalled();
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

  describe('handlePaymentIntentSucceeded — DB fallback (tip)', () => {
    it('should fall back to DB when Redis mapping missing for tip', async () => {
      redis.get.mockResolvedValue(null);
      prisma.tip = { ...prisma.tip, findFirst: jest.fn().mockResolvedValue({ id: 'tip-fallback' }), findUnique: jest.fn().mockResolvedValue({ status: 'pending' }) };
      const mockTipUpdate = jest.fn().mockResolvedValue({ receiverId: 'u2', senderId: 'u1', amount: 5, platformFee: 0.5 });
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: { update: mockTipUpdate },
          coinBalance: { upsert: jest.fn().mockResolvedValue({}) },
          coinTransaction: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
      prisma.user.findUnique.mockResolvedValue({ username: 'sender' });
      redis.del.mockResolvedValue(1);
      await service.handlePaymentIntentSucceeded({
        id: 'pi_test', metadata: { senderId: 'u1' },
      } as any);
      expect(prisma.$transaction).toHaveBeenCalled();
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

  // --- R2 Tab4 Part 2: Dispute handler tests (X03-#7) ---

  describe('handleDisputeCreated', () => {
    const disputeBase = { payment_intent: 'pi_disputed_1', reason: 'fraudulent', amount: 1000 };

    it('should find tip via Redis and reverse diamonds', async () => {
      redis.get.mockResolvedValue('tip-d1');
      const mockTipFindUnique = jest.fn().mockResolvedValue({ status: 'completed' });
      const mockTipUpdate = jest.fn().mockResolvedValue({ receiverId: 'u2', amount: 10, platformFee: 1 });
      const mockCoinUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const mockCoinTxCreate = jest.fn().mockResolvedValue({});
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: { findUnique: mockTipFindUnique, update: mockTipUpdate },
          coinBalance: { updateMany: mockCoinUpdateMany },
          coinTransaction: { create: mockCoinTxCreate },
        }),
      );
      await service.handleDisputeCreated(disputeBase);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockCoinUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u2', diamonds: expect.objectContaining({ gte: expect.any(Number) }) }),
          data: expect.objectContaining({ diamonds: expect.objectContaining({ decrement: expect.any(Number) }) }),
        }),
      );
      // netAmount = 10 - 1 = 9, diamonds = Math.floor(9 / 0.007) = 1285, reversed = -1285
      expect(mockCoinTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u2', amount: -1285 }),
        }),
      );
    });

    it('should fallback to PaymentMapping when Redis misses', async () => {
      redis.get.mockResolvedValue(null);
      prisma.paymentMapping.findUnique.mockResolvedValue({ internalId: 'tip-from-mapping' });
      const mockTipFindUnique = jest.fn().mockResolvedValue({ status: 'completed' });
      const mockTipUpdate = jest.fn().mockResolvedValue({ receiverId: 'u2', amount: 5, platformFee: 0.5 });
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: { findUnique: mockTipFindUnique, update: mockTipUpdate },
          coinBalance: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          coinTransaction: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
      await service.handleDisputeCreated(disputeBase);
      expect(prisma.paymentMapping.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { stripeId: 'pi_disputed_1' } }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should fallback to Tip.stripePaymentId when Redis and PaymentMapping miss', async () => {
      redis.get.mockResolvedValue(null);
      prisma.paymentMapping.findUnique.mockResolvedValue(null);
      prisma.tip.findFirst.mockResolvedValue({ id: 'tip-from-pi-search' });
      const mockTipFindUnique = jest.fn().mockResolvedValue({ status: 'completed' });
      const mockTipUpdate = jest.fn().mockResolvedValue({ receiverId: 'u2', amount: 5, platformFee: 0.5 });
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: { findUnique: mockTipFindUnique, update: mockTipUpdate },
          coinBalance: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          coinTransaction: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
      await service.handleDisputeCreated(disputeBase);
      expect(prisma.tip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { stripePaymentId: 'pi_disputed_1' } }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should skip reversal when no tip found across all 3 lookups', async () => {
      redis.get.mockResolvedValue(null);
      prisma.paymentMapping.findUnique.mockResolvedValue(null);
      prisma.tip.findFirst.mockResolvedValue(null);
      prisma.$transaction = jest.fn();
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      await service.handleDisputeCreated(disputeBase);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('No tip found'));
    });

    it('should skip reversal when tip already disputed (idempotency)', async () => {
      redis.get.mockResolvedValue('tip-already-disputed');
      const mockTipFindUnique = jest.fn().mockResolvedValue({ status: 'disputed' });
      const mockTipUpdate = jest.fn();
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: { findUnique: mockTipFindUnique, update: mockTipUpdate },
          coinBalance: { updateMany: jest.fn() },
          coinTransaction: { create: jest.fn() },
        }),
      );
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      await service.handleDisputeCreated(disputeBase);
      expect(mockTipFindUnique).toHaveBeenCalled();
      expect(mockTipUpdate).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('already disputed'));
    });

    it('should not go below 0 diamonds — uses conditional decrement', async () => {
      redis.get.mockResolvedValue('tip-d2');
      const mockCoinUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tip: {
            findUnique: jest.fn().mockResolvedValue({ status: 'completed' }),
            update: jest.fn().mockResolvedValue({ receiverId: 'u2', amount: 100, platformFee: 10 }),
          },
          coinBalance: { updateMany: mockCoinUpdateMany },
          coinTransaction: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
      await service.handleDisputeCreated(disputeBase);
      // Verify the where clause includes gte condition
      expect(mockCoinUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ diamonds: expect.objectContaining({ gte: expect.any(Number) }) }),
        }),
      );
    });

    it('should return early when paymentIntentId is empty', async () => {
      prisma.$transaction = jest.fn();
      await service.handleDisputeCreated({ payment_intent: '', reason: 'test', amount: 0 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // --- R2 Tab4 Part 2: Premium endDate extension tests (X03-#16) ---

  describe('handlePremiumPaymentSucceeded — endDate extension', () => {
    it('should extend premium from current endDate, not from now', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      prisma.premiumSubscription = {
        findUnique: jest.fn().mockResolvedValue({ endDate: futureDate }),
        upsert: jest.fn().mockResolvedValue({ id: 'prem-1', status: 'ACTIVE' }),
      };
      await service.handlePaymentIntentSucceeded({
        id: 'pi_extend', metadata: { type: 'premium_subscription', userId: 'u1', plan: 'MONTHLY' },
      } as any);
      const upsertCall = prisma.premiumSubscription.upsert.mock.calls[0][0];
      const newEndDate = new Date(upsertCall.create.endDate);
      // Should be ~60 days from now (30 existing + 30 extension), not 30
      const daysFromNow = (newEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysFromNow).toBeGreaterThan(55); // ~60 days, allowing 5 days tolerance
    });

    it('should extend expired premium from now (not from past endDate)', async () => {
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      prisma.premiumSubscription = {
        findUnique: jest.fn().mockResolvedValue({ endDate: pastDate }),
        upsert: jest.fn().mockResolvedValue({ id: 'prem-1', status: 'ACTIVE' }),
      };
      await service.handlePaymentIntentSucceeded({
        id: 'pi_renew', metadata: { type: 'premium_subscription', userId: 'u1', plan: 'MONTHLY' },
      } as any);
      const upsertCall = prisma.premiumSubscription.upsert.mock.calls[0][0];
      const newEndDate = new Date(upsertCall.create.endDate);
      const daysFromNow = (newEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysFromNow).toBeGreaterThan(25); // ~30 days from now
      expect(daysFromNow).toBeLessThan(35);
    });
  });
});
