import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: jest.Mocked<PaymentsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        ...globalMockProviders,
        {
          provide: PaymentsService,
          useValue: {
            createPaymentIntent: jest.fn(),
            createSubscription: jest.fn(),
            cancelSubscription: jest.fn(),
            listPaymentMethods: jest.fn(),
            attachPaymentMethod: jest.fn(),
            createCoinPurchaseIntent: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(PaymentsController);
    service = module.get(PaymentsService) as jest.Mocked<PaymentsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createPaymentIntent', () => {
    it('should call paymentsService.createPaymentIntent with userId, receiverId, amount, currency', async () => {
      service.createPaymentIntent.mockResolvedValue({ clientSecret: 'pi_secret' } as any);

      const result = await controller.createPaymentIntent(userId, { receiverId: 'user-456', amount: 500, currency: 'usd' } as any);

      expect(service.createPaymentIntent).toHaveBeenCalledWith(userId, 'user-456', 500, 'usd');
      expect(result).toEqual(expect.objectContaining({ clientSecret: 'pi_secret' }));
    });
  });

  describe('createSubscription', () => {
    it('should call paymentsService.createSubscription with userId, tierId, paymentMethodId', async () => {
      service.createSubscription.mockResolvedValue({ subscriptionId: 'sub-1' } as any);

      await controller.createSubscription(userId, { tierId: 'tier-1', paymentMethodId: 'pm-1' } as any);

      expect(service.createSubscription).toHaveBeenCalledWith(userId, 'tier-1', 'pm-1');
    });
  });

  describe('cancelSubscription', () => {
    it('should call paymentsService.cancelSubscription with userId and subscriptionId', async () => {
      service.cancelSubscription.mockResolvedValue({ cancelled: true } as any);

      await controller.cancelSubscription(userId, { subscriptionId: 'sub-1' } as any);

      expect(service.cancelSubscription).toHaveBeenCalledWith(userId, 'sub-1');
    });
  });

  describe('listPaymentMethods', () => {
    it('should call paymentsService.listPaymentMethods with userId', async () => {
      service.listPaymentMethods.mockResolvedValue([{ id: 'pm-1', brand: 'visa' }] as any);

      const result = await controller.listPaymentMethods(userId);

      expect(service.listPaymentMethods).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('attachPaymentMethod', () => {
    it('should call paymentsService.attachPaymentMethod with userId and paymentMethodId', async () => {
      service.attachPaymentMethod.mockResolvedValue({ attached: true } as any);

      await controller.attachPaymentMethod(userId, { paymentMethodId: 'pm-1' } as any);

      expect(service.attachPaymentMethod).toHaveBeenCalledWith(userId, 'pm-1');
    });
  });

  // ═══ T08 Audit: Missing controller test ═══

  describe('createCoinPurchaseIntent — C1 controller', () => {
    it('should delegate to paymentsService.createCoinPurchaseIntent with userId and coinAmount', async () => {
      service.createCoinPurchaseIntent.mockResolvedValue({ clientSecret: 'pi_secret', coinAmount: 500, priceInCents: 495 } as any);

      const result = await controller.createCoinPurchaseIntent(userId, { coinAmount: 500 } as any);

      expect(service.createCoinPurchaseIntent).toHaveBeenCalledWith(userId, 500);
      expect(result).toEqual(expect.objectContaining({ clientSecret: 'pi_secret', coinAmount: 500 }));
    });
  });
});
