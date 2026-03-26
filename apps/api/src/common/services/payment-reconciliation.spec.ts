import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import * as Sentry from '@sentry/node';

// Mock Sentry
jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

// Mock Stripe
const mockStripeInstance = {
  paymentIntents: {
    retrieve: jest.fn(),
  },
  subscriptions: {
    retrieve: jest.fn(),
  },
};
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripeInstance),
}));

describe('PaymentReconciliationService', () => {
  let service: PaymentReconciliationService;
  let prisma: any;
  let redis: any;

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReconciliationService,
        {
          provide: PrismaService,
          useValue: {
            tip: {
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            order: {
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            product: {
              update: jest.fn().mockResolvedValue({}),
            },
            premiumSubscription: {
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            membershipSubscription: {
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            coinBalance: {
              findMany: jest.fn().mockResolvedValue([]),
              upsert: jest.fn().mockResolvedValue({}),
            },
            coinTransaction: {
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<any>) => {
              // Execute the transaction callback with the prisma mock itself
              return fn(prisma);
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'STRIPE_SECRET_KEY') return 'sk_test_mock';
              return null;
            }),
          },
        },
        {
          provide: 'REDIS',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get(PaymentReconciliationService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS');
  });

  // ─── Tips ──────────────────────────────────────────────────────────────────

  describe('reconcileTips', () => {
    it('should return 0 when no stuck tips exist', async () => {
      prisma.tip.findMany.mockResolvedValue([]);
      const result = await service.reconcileTips();
      expect(result).toBe(0);
    });

    it('should complete a stuck pending tip when PI succeeded', async () => {
      const stuckTip = {
        id: 'tip-1',
        stripePaymentId: 'pi_succeeded',
        receiverId: 'user-receiver',
        amount: 10,
        platformFee: 1,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.tip.findMany.mockResolvedValue([stuckTip]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_succeeded',
        status: 'succeeded',
      });

      const result = await service.reconcileTips();

      expect(result).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.tip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tip-1' },
          data: { status: 'completed' },
        }),
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('tip tip-1 completed'),
        'info',
      );
    });

    it('should credit diamonds to receiver when completing tip', async () => {
      const stuckTip = {
        id: 'tip-2',
        stripePaymentId: 'pi_succeeded_2',
        receiverId: 'user-recv-2',
        amount: 10,
        platformFee: 1,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.tip.findMany.mockResolvedValue([stuckTip]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_succeeded_2',
        status: 'succeeded',
      });

      await service.reconcileTips();

      // Net amount = 10 - 1 = 9, diamonds = floor(9 / 0.007) = 1285
      expect(prisma.coinBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-recv-2' },
          update: { diamonds: { increment: 1285 } },
          create: { userId: 'user-recv-2', coins: 0, diamonds: 1285 },
        }),
      );
    });

    it('should mark tip as failed when PI is cancelled', async () => {
      const stuckTip = {
        id: 'tip-3',
        stripePaymentId: 'pi_cancelled',
        receiverId: 'user-recv',
        amount: 5,
        platformFee: 0.5,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.tip.findMany.mockResolvedValue([stuckTip]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_cancelled',
        status: 'canceled',
      });

      const result = await service.reconcileTips();

      expect(result).toBe(1);
      expect(prisma.tip.update).toHaveBeenCalledWith({
        where: { id: 'tip-3' },
        data: { status: 'failed' },
      });
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('marked as failed'),
        'info',
      );
    });

    it('should mark tip as failed when PI requires_payment_method', async () => {
      const stuckTip = {
        id: 'tip-4',
        stripePaymentId: 'pi_rpm',
        receiverId: 'user-recv',
        amount: 5,
        platformFee: 0.5,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.tip.findMany.mockResolvedValue([stuckTip]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_rpm',
        status: 'requires_payment_method',
      });

      const result = await service.reconcileTips();

      expect(result).toBe(1);
      expect(prisma.tip.update).toHaveBeenCalledWith({
        where: { id: 'tip-4' },
        data: { status: 'failed' },
      });
    });

    it('should skip tips with PI still processing', async () => {
      const stuckTip = {
        id: 'tip-5',
        stripePaymentId: 'pi_processing',
        receiverId: 'user-recv',
        amount: 5,
        platformFee: 0.5,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.tip.findMany.mockResolvedValue([stuckTip]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_processing',
        status: 'processing',
      });

      const result = await service.reconcileTips();

      expect(result).toBe(0);
      expect(prisma.tip.update).not.toHaveBeenCalled();
    });

    it('should mark tip as failed when no stripePaymentId', async () => {
      const stuckTip = {
        id: 'tip-orphan',
        stripePaymentId: null,
        receiverId: 'user-recv',
        amount: 5,
        platformFee: 0.5,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.tip.findMany.mockResolvedValue([stuckTip]);

      const result = await service.reconcileTips();

      expect(result).toBe(1);
      expect(prisma.tip.update).toHaveBeenCalledWith({
        where: { id: 'tip-orphan' },
        data: { status: 'failed' },
      });
    });

    it('should continue processing other tips if Stripe errors on one', async () => {
      const tips = [
        { id: 'tip-err', stripePaymentId: 'pi_error', receiverId: 'r1', amount: 5, platformFee: 0.5, createdAt: twentyFiveHoursAgo },
        { id: 'tip-ok', stripePaymentId: null, receiverId: 'r2', amount: 5, platformFee: 0.5, createdAt: twentyFiveHoursAgo },
      ];
      prisma.tip.findMany.mockResolvedValue(tips);
      mockStripeInstance.paymentIntents.retrieve.mockRejectedValue(new Error('Stripe down'));

      const result = await service.reconcileTips();

      // tip-ok has no stripePaymentId so it should be marked as failed
      // tip-err should be skipped due to Stripe error
      expect(result).toBe(1);
      expect(prisma.tip.update).toHaveBeenCalledWith({
        where: { id: 'tip-ok' },
        data: { status: 'failed' },
      });
    });
  });

  // ─── Orders ────────────────────────────────────────────────────────────────

  describe('reconcileOrders', () => {
    it('should return 0 when no stuck orders exist', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      const result = await service.reconcileOrders();
      expect(result).toBe(0);
    });

    it('should mark order as PAID when PI succeeded', async () => {
      const stuckOrder = {
        id: 'order-1',
        stripePaymentId: 'pi_order_ok',
        productId: 'prod-1',
        quantity: 2,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.order.findMany.mockResolvedValue([stuckOrder]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_order_ok',
        status: 'succeeded',
      });

      const result = await service.reconcileOrders();

      expect(result).toBe(1);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: 'PAID' },
      });
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('order order-1 marked as PAID'),
        'info',
      );
    });

    it('should cancel order and restore stock when PI is cancelled', async () => {
      const stuckOrder = {
        id: 'order-2',
        stripePaymentId: 'pi_order_cancel',
        productId: 'prod-2',
        quantity: 3,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.order.findMany.mockResolvedValue([stuckOrder]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_order_cancel',
        status: 'canceled',
      });

      const result = await service.reconcileOrders();

      expect(result).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-2' },
          data: { status: 'CANCELLED' },
        }),
      );
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-2' },
          data: { stock: { increment: 3 } },
        }),
      );
    });

    it('should cancel order and restore stock when no stripePaymentId', async () => {
      const stuckOrder = {
        id: 'order-3',
        stripePaymentId: null,
        productId: 'prod-3',
        quantity: 1,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.order.findMany.mockResolvedValue([stuckOrder]);

      const result = await service.reconcileOrders();

      expect(result).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-3' },
          data: { status: 'CANCELLED' },
        }),
      );
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-3' },
          data: { stock: { increment: 1 } },
        }),
      );
    });

    it('should skip orders with PI still processing', async () => {
      const stuckOrder = {
        id: 'order-4',
        stripePaymentId: 'pi_order_proc',
        productId: 'prod-4',
        quantity: 1,
        createdAt: twentyFiveHoursAgo,
      };
      prisma.order.findMany.mockResolvedValue([stuckOrder]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_order_proc',
        status: 'processing',
      });

      const result = await service.reconcileOrders();
      expect(result).toBe(0);
    });
  });

  // ─── Premium Subscriptions ─────────────────────────────────────────────────

  describe('reconcilePremiumSubscriptions', () => {
    it('should return 0 when no stuck premium subscriptions exist', async () => {
      prisma.premiumSubscription.findMany.mockResolvedValue([]);
      const result = await service.reconcilePremiumSubscriptions();
      expect(result).toBe(0);
    });

    it('should activate premium when PI succeeded', async () => {
      const stuckSub = {
        id: 'prem-1',
        userId: 'user-prem-1',
        stripeSubId: 'pi_prem_ok',
        plan: 'MONTHLY',
        createdAt: twentyFiveHoursAgo,
      };
      prisma.premiumSubscription.findMany.mockResolvedValue([stuckSub]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_prem_ok',
        status: 'succeeded',
      });

      const result = await service.reconcilePremiumSubscriptions();

      expect(result).toBe(1);
      expect(prisma.premiumSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prem-1' },
          data: expect.objectContaining({
            status: 'ACTIVE',
            endDate: expect.any(Date),
          }),
        }),
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('activated'),
        'info',
      );
    });

    it('should set correct endDate for YEARLY plan', async () => {
      const stuckSub = {
        id: 'prem-y',
        userId: 'user-prem-y',
        stripeSubId: 'pi_prem_yearly',
        plan: 'YEARLY',
        createdAt: twentyFiveHoursAgo,
      };
      prisma.premiumSubscription.findMany.mockResolvedValue([stuckSub]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_prem_yearly',
        status: 'succeeded',
      });

      await service.reconcilePremiumSubscriptions();

      const updateCall = prisma.premiumSubscription.update.mock.calls[0][0];
      const endDate = updateCall.data.endDate as Date;
      const now = new Date();
      // End date should be ~12 months from now
      const monthsDiff = (endDate.getFullYear() - now.getFullYear()) * 12 + (endDate.getMonth() - now.getMonth());
      expect(monthsDiff).toBeGreaterThanOrEqual(11);
      expect(monthsDiff).toBeLessThanOrEqual(12);
    });

    it('should cancel premium when PI is cancelled', async () => {
      const stuckSub = {
        id: 'prem-2',
        userId: 'user-prem-2',
        stripeSubId: 'pi_prem_fail',
        plan: 'MONTHLY',
        createdAt: twentyFiveHoursAgo,
      };
      prisma.premiumSubscription.findMany.mockResolvedValue([stuckSub]);
      mockStripeInstance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_prem_fail',
        status: 'canceled',
      });

      const result = await service.reconcilePremiumSubscriptions();

      expect(result).toBe(1);
      expect(prisma.premiumSubscription.update).toHaveBeenCalledWith({
        where: { id: 'prem-2' },
        data: { status: 'CANCELLED' },
      });
    });

    it('should cancel premium when no stripeSubId', async () => {
      const stuckSub = {
        id: 'prem-orphan',
        userId: 'user-prem-orphan',
        stripeSubId: null,
        plan: 'MONTHLY',
        createdAt: twentyFiveHoursAgo,
      };
      prisma.premiumSubscription.findMany.mockResolvedValue([stuckSub]);

      const result = await service.reconcilePremiumSubscriptions();

      expect(result).toBe(1);
      expect(prisma.premiumSubscription.update).toHaveBeenCalledWith({
        where: { id: 'prem-orphan' },
        data: { status: 'CANCELLED' },
      });
    });
  });

  // ─── Membership Subscriptions ──────────────────────────────────────────────

  describe('reconcileMembershipSubscriptions', () => {
    it('should return 0 when no expired-active memberships exist', async () => {
      prisma.membershipSubscription.findMany.mockResolvedValue([]);
      const result = await service.reconcileMembershipSubscriptions();
      expect(result).toBe(0);
    });

    it('should mark as cancelled when Stripe sub is cancelled', async () => {
      const expiredSub = {
        id: 'mem-1',
        userId: 'user-mem-1',
        tierId: 'tier-1',
        endDate: oneHourAgo,
      };
      prisma.membershipSubscription.findMany.mockResolvedValue([expiredSub]);
      redis.get.mockResolvedValue('sub_stripe_1');
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe_1',
        status: 'canceled',
      });

      const result = await service.reconcileMembershipSubscriptions();

      expect(result).toBe(1);
      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith({
        where: { id: 'mem-1' },
        data: { status: 'cancelled' },
      });
    });

    it('should extend endDate when Stripe sub is still active with later period', async () => {
      const expiredSub = {
        id: 'mem-2',
        userId: 'user-mem-2',
        tierId: 'tier-2',
        endDate: oneHourAgo,
      };
      prisma.membershipSubscription.findMany.mockResolvedValue([expiredSub]);
      redis.get.mockResolvedValue('sub_stripe_2');

      const futurePeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe_2',
        status: 'active',
        current_period_end: futurePeriodEnd,
      });

      const result = await service.reconcileMembershipSubscriptions();

      expect(result).toBe(1);
      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith({
        where: { id: 'mem-2' },
        data: {
          endDate: new Date(futurePeriodEnd * 1000),
          status: 'active',
        },
      });
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('endDate extended'),
        'info',
      );
    });

    it('should map Stripe past_due status correctly', async () => {
      const expiredSub = {
        id: 'mem-pd',
        userId: 'user-pd',
        tierId: 'tier-pd',
        endDate: oneHourAgo,
      };
      prisma.membershipSubscription.findMany.mockResolvedValue([expiredSub]);
      redis.get.mockResolvedValue('sub_stripe_pd');

      const futurePeriodEnd = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe_pd',
        status: 'past_due',
        current_period_end: futurePeriodEnd,
      });

      await service.reconcileMembershipSubscriptions();

      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith({
        where: { id: 'mem-pd' },
        data: {
          endDate: new Date(futurePeriodEnd * 1000),
          status: 'past_due',
        },
      });
    });

    it('should mark as expired when no Redis mapping exists', async () => {
      const expiredSub = {
        id: 'mem-3',
        userId: 'user-mem-3',
        tierId: 'tier-3',
        endDate: oneHourAgo,
      };
      prisma.membershipSubscription.findMany.mockResolvedValue([expiredSub]);
      redis.get.mockResolvedValue(null); // No Redis mapping

      const result = await service.reconcileMembershipSubscriptions();

      expect(result).toBe(1);
      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith({
        where: { id: 'mem-3' },
        data: { status: 'expired' },
      });
    });

    it('should mark as expired when Stripe lookup throws', async () => {
      const expiredSub = {
        id: 'mem-4',
        userId: 'user-mem-4',
        tierId: 'tier-4',
        endDate: oneHourAgo,
      };
      prisma.membershipSubscription.findMany.mockResolvedValue([expiredSub]);
      redis.get.mockResolvedValue('sub_stripe_deleted');
      mockStripeInstance.subscriptions.retrieve.mockRejectedValue(
        new Error('No such subscription'),
      );

      const result = await service.reconcileMembershipSubscriptions();

      expect(result).toBe(1);
      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith({
        where: { id: 'mem-4' },
        data: { status: 'expired' },
      });
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Stripe lookup failed'),
        'warning',
      );
    });

    it('should mark as expired for Stripe sub with unhandled status', async () => {
      const expiredSub = {
        id: 'mem-5',
        userId: 'user-mem-5',
        tierId: 'tier-5',
        endDate: oneHourAgo,
      };
      prisma.membershipSubscription.findMany.mockResolvedValue([expiredSub]);
      redis.get.mockResolvedValue('sub_stripe_paused');
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe_paused',
        status: 'paused',
      });

      const result = await service.reconcileMembershipSubscriptions();

      expect(result).toBe(1);
      expect(prisma.membershipSubscription.update).toHaveBeenCalledWith({
        where: { id: 'mem-5' },
        data: { status: 'expired' },
      });
    });
  });

  // ─── Coin Balance Audit ────────────────────────────────────────────────────

  describe('auditCoinBalances', () => {
    it('should return 0 when no balances exist', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([]);
      const result = await service.auditCoinBalances();
      expect(result).toBe(0);
    });

    it('should report no discrepancies when balance matches transactions', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'user-bal-1', coins: 500, diamonds: 100 },
      ]);
      // 4 aggregate calls per user: coin-in, coin-out, diamond-in, diamond-out
      prisma.coinTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 600 } })   // coin incoming
        .mockResolvedValueOnce({ _sum: { amount: -100 } })  // coin outgoing
        .mockResolvedValueOnce({ _sum: { amount: 100 } })   // diamond incoming
        .mockResolvedValueOnce({ _sum: { amount: 0 } });    // diamond outgoing

      const result = await service.auditCoinBalances();

      expect(result).toBe(0);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('should flag discrepancy when balance does not match transactions', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'user-bad', coins: 1000, diamonds: 50 },
      ]);
      prisma.coinTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500 } })   // coin incoming
        .mockResolvedValueOnce({ _sum: { amount: -100 } })  // coin outgoing
        .mockResolvedValueOnce({ _sum: { amount: 50 } })    // diamond incoming (matches)
        .mockResolvedValueOnce({ _sum: { amount: 0 } });    // diamond outgoing
      // Expected coins = 500 + (-100) = 400, stored = 1000 -> discrepancy

      const result = await service.auditCoinBalances();

      expect(result).toBe(1);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Coin balance discrepancy: userId=user-bad, stored=1000, expected=400'),
        'warning',
      );
    });

    it('should handle multiple balances and report all discrepancies', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'user-ok', coins: 100, diamonds: 0 },
        { userId: 'user-bad1', coins: 500, diamonds: 0 },
        { userId: 'user-bad2', coins: 200, diamonds: 0 },
      ]);
      // user-ok: coin-in=150, coin-out=-50 -> expected=100 (matches). diamonds match (0=0)
      prisma.coinTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 150 } })
        .mockResolvedValueOnce({ _sum: { amount: -50 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        // user-bad1: coin-in=200, coin-out=0 -> expected=200 (mismatch, stored=500)
        .mockResolvedValueOnce({ _sum: { amount: 200 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        // user-bad2: coin-in=300, coin-out=-50 -> expected=250 (mismatch, stored=200)
        .mockResolvedValueOnce({ _sum: { amount: 300 } })
        .mockResolvedValueOnce({ _sum: { amount: -50 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });

      const result = await service.auditCoinBalances();

      expect(result).toBe(2);
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(2);
    });

    it('should not auto-fix discrepancies (only log)', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'user-nofix', coins: 999, diamonds: 0 },
      ]);
      prisma.coinTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });

      await service.auditCoinBalances();

      // Should NOT call coinBalance.update — only logging, no auto-fix
      expect(prisma.coinBalance.upsert).not.toHaveBeenCalled();
    });

    it('should handle null _sum.amount from aggregate', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'user-null', coins: 5, diamonds: 0 },
      ]);
      // No transactions at all
      prisma.coinTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      const result = await service.auditCoinBalances();

      // Expected coins = 0 + 0 = 0, stored = 5 -> discrepancy
      expect(result).toBe(1);
    });

    it('should flag diamond discrepancy separately from coin discrepancy', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'user-diamond-bad', coins: 0, diamonds: 500 },
      ]);
      prisma.coinTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 0 } })    // coin incoming (matches)
        .mockResolvedValueOnce({ _sum: { amount: 0 } })    // coin outgoing
        .mockResolvedValueOnce({ _sum: { amount: 200 } })  // diamond incoming
        .mockResolvedValueOnce({ _sum: { amount: 0 } });   // diamond outgoing
      // Expected diamonds = 200, stored = 500 -> discrepancy

      const result = await service.auditCoinBalances();

      expect(result).toBe(1);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Diamond balance discrepancy: userId=user-diamond-bad, stored=500, expected=200'),
        'warning',
      );
    });
  });

  // ─── reconcileAll ──────────────────────────────────────────────────────────

  describe('reconcileAll', () => {
    it('should call all reconciliation methods and return summary', async () => {
      // All methods will return 0 since no stuck items
      const result = await service.reconcileAll();

      expect(result).toEqual({
        tips: 0,
        orders: 0,
        premiumSubscriptions: 0,
        membershipSubscriptions: 0,
        coinBalanceDiscrepancies: 0,
      });
    });

    it('should continue even if one method fails', async () => {
      // Make tips throw
      prisma.tip.findMany.mockRejectedValue(new Error('DB error'));

      const result = await service.reconcileAll();

      // Tips returns 0 (error caught), rest return 0 normally
      expect(result.tips).toBe(0);
      expect(result.orders).toBe(0);
      expect(result.premiumSubscriptions).toBe(0);
      expect(result.membershipSubscriptions).toBe(0);
      expect(result.coinBalanceDiscrepancies).toBe(0);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
