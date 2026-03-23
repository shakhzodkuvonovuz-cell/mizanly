import { Test, TestingModule } from '@nestjs/testing';
import { MonetizationController } from './monetization.controller';
import { MonetizationService } from './monetization.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MonetizationController', () => {
  let controller: MonetizationController;
  let service: jest.Mocked<MonetizationService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonetizationController],
      providers: [
        ...globalMockProviders,
        {
          provide: MonetizationService,
          useValue: {
            sendTip: jest.fn(),
            getSentTips: jest.fn(),
            getReceivedTips: jest.fn(),
            getTipStats: jest.fn(),
            createTier: jest.fn(),
            getUserTiers: jest.fn(),
            updateTier: jest.fn(),
            deleteTier: jest.fn(),
            toggleTier: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            getSubscribers: jest.fn(),
            getWalletBalance: jest.fn(),
            getPaymentMethods: jest.fn(),
            requestCashout: jest.fn(),
            getPayoutHistory: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(MonetizationController);
    service = module.get(MonetizationService) as jest.Mocked<MonetizationService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendTip', () => {
    it('should call monetizationService.sendTip with senderId, receiverId, amount, and message', async () => {
      service.sendTip.mockResolvedValue({ id: 'tip-1', amount: 5 } as any);

      const result = await controller.sendTip(userId, { receiverId: 'user-456', amount: 5, message: 'Great post!' } as any);

      expect(service.sendTip).toHaveBeenCalledWith(userId, 'user-456', 5, 'Great post!');
      expect(result).toEqual(expect.objectContaining({ amount: 5 }));
    });
  });

  describe('getSentTips', () => {
    it('should call monetizationService.getSentTips with userId and cursor', async () => {
      service.getSentTips.mockResolvedValue({ data: [] } as any);

      await controller.getSentTips(userId, 'cursor-1');

      expect(service.getSentTips).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('getReceivedTips', () => {
    it('should call monetizationService.getReceivedTips with userId and cursor', async () => {
      service.getReceivedTips.mockResolvedValue({ data: [] } as any);

      await controller.getReceivedTips(userId, 'cursor-1');

      expect(service.getReceivedTips).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('getTipStats', () => {
    it('should call monetizationService.getTipStats with userId', async () => {
      service.getTipStats.mockResolvedValue({ totalSent: 50, totalReceived: 200 } as any);

      const result = await controller.getTipStats(userId);

      expect(service.getTipStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ totalSent: 50 }));
    });
  });

  describe('createTier', () => {
    it('should call monetizationService.createTier with userId, name, price, benefits, level', async () => {
      const dto = { name: 'Gold', price: 10, benefits: ['Badge', 'Early access'], level: 'gold' };
      service.createTier.mockResolvedValue({ id: 'tier-1' } as any);

      const result = await controller.createTier(userId, dto as any);

      expect(service.createTier).toHaveBeenCalledWith(userId, 'Gold', 10, ['Badge', 'Early access'], 'gold');
      expect(result).toEqual(expect.objectContaining({ id: 'tier-1' }));
    });
  });

  describe('getUserTiers', () => {
    it('should call monetizationService.getUserTiers with userId param', async () => {
      service.getUserTiers.mockResolvedValue([{ id: 'tier-1', name: 'Gold' }] as any);

      const result = await controller.getUserTiers('user-456');

      expect(service.getUserTiers).toHaveBeenCalledWith('user-456');
      expect(result).toHaveLength(1);
    });
  });

  describe('updateTier', () => {
    it('should call monetizationService.updateTier with tierId, userId, and dto', async () => {
      const dto = { name: 'Platinum', price: 20 };
      service.updateTier.mockResolvedValue({ id: 'tier-1', name: 'Platinum' } as any);

      await controller.updateTier('tier-1', userId, dto as any);

      expect(service.updateTier).toHaveBeenCalledWith('tier-1', userId, dto);
    });
  });

  describe('deleteTier', () => {
    it('should call monetizationService.deleteTier with tierId and userId', async () => {
      service.deleteTier.mockResolvedValue({ deleted: true } as any);

      await controller.deleteTier('tier-1', userId);

      expect(service.deleteTier).toHaveBeenCalledWith('tier-1', userId);
    });
  });

  describe('toggleTier', () => {
    it('should call monetizationService.toggleTier with tierId and userId', async () => {
      service.toggleTier.mockResolvedValue({ isActive: false } as any);

      await controller.toggleTier('tier-1', userId);

      expect(service.toggleTier).toHaveBeenCalledWith('tier-1', userId);
    });
  });

  describe('subscribe', () => {
    it('should call monetizationService.subscribe with tierId and userId', async () => {
      service.subscribe.mockResolvedValue({ subscribed: true } as any);

      await controller.subscribe(userId, 'tier-1');

      expect(service.subscribe).toHaveBeenCalledWith('tier-1', userId);
    });
  });

  describe('unsubscribe', () => {
    it('should call monetizationService.unsubscribe with tierId and userId', async () => {
      service.unsubscribe.mockResolvedValue({ unsubscribed: true } as any);

      await controller.unsubscribe(userId, 'tier-1');

      expect(service.unsubscribe).toHaveBeenCalledWith('tier-1', userId);
    });
  });

  describe('getSubscribers', () => {
    it('should call monetizationService.getSubscribers with userId and cursor', async () => {
      service.getSubscribers.mockResolvedValue({ data: [] } as any);

      await controller.getSubscribers(userId, 'cursor-1');

      expect(service.getSubscribers).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('getWalletBalance', () => {
    it('should call monetizationService.getWalletBalance with userId', async () => {
      service.getWalletBalance.mockResolvedValue({
        diamonds: 1000,
        usdEquivalent: 7.00,
        diamondToUsdRate: 0.007,
      } as any);

      const result = await controller.getWalletBalance(userId);

      expect(service.getWalletBalance).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ diamonds: 1000 }));
    });
  });

  describe('getPaymentMethods', () => {
    it('should call monetizationService.getPaymentMethods with userId', async () => {
      service.getPaymentMethods.mockResolvedValue([
        { id: 'acct_123', type: 'stripe', label: 'Stripe Account', lastFour: '****', isDefault: true },
      ] as any);

      const result = await controller.getPaymentMethods(userId);

      expect(service.getPaymentMethods).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('requestCashout', () => {
    it('should call monetizationService.requestCashout with userId and dto', async () => {
      const dto = { amount: 200, payoutSpeed: 'standard' as const, paymentMethodId: 'acct_123' };
      service.requestCashout.mockResolvedValue({ success: true } as any);

      const result = await controller.requestCashout(userId, dto as any);

      expect(service.requestCashout).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('getPayoutHistory', () => {
    it('should call monetizationService.getPayoutHistory with userId and cursor', async () => {
      service.getPayoutHistory.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.getPayoutHistory(userId, 'cursor-1');

      expect(service.getPayoutHistory).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });
});
