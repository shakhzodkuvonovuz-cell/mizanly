import { Test, TestingModule } from '@nestjs/testing';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommerceController', () => {
  let controller: CommerceController;
  let service: jest.Mocked<CommerceService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommerceController],
      providers: [
        ...globalMockProviders,
        {
          provide: CommerceService,
          useValue: {
            createProduct: jest.fn(),
            getProducts: jest.fn(),
            getProduct: jest.fn(),
            updateProduct: jest.fn(),
            deleteProduct: jest.fn(),
            reviewProduct: jest.fn(),
            createOrder: jest.fn(),
            getMyOrders: jest.fn(),
            getSellerOrders: jest.fn(),
            updateOrderStatus: jest.fn(),
            getSellerAnalytics: jest.fn(),
            createBusiness: jest.fn(),
            getBusinesses: jest.fn(),
            updateBusiness: jest.fn(),
            deleteBusiness: jest.fn(),
            reviewBusiness: jest.fn(),
            createZakatFund: jest.fn(),
            getZakatFunds: jest.fn(),
            donateZakat: jest.fn(),
            getWaqfFunds: jest.fn(),
            contributeWaqf: jest.fn(),
            createTreasury: jest.fn(),
            contributeTreasury: jest.fn(),
            getPremiumStatus: jest.fn(),
            subscribePremium: jest.fn(),
            cancelPremium: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(CommerceController);
    service = module.get(CommerceService) as jest.Mocked<CommerceService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createProduct', () => {
    it('should call commerceService.createProduct with userId and dto', async () => {
      const dto = { title: 'Islamic Art Print', price: 29.99 };
      service.createProduct.mockResolvedValue({ id: 'prod-1', ...dto } as any);

      const result = await controller.createProduct(userId, dto as any);

      expect(service.createProduct).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ title: 'Islamic Art Print' }));
    });
  });

  describe('getProducts', () => {
    it('should call commerceService.getProducts with parsed params', async () => {
      service.getProducts.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.getProducts('cursor-1', '10', 'books', 'quran');

      expect(service.getProducts).toHaveBeenCalledWith('cursor-1', 10, 'books', 'quran');
    });
  });

  describe('getProduct', () => {
    it('should call commerceService.getProduct with id', async () => {
      service.getProduct.mockResolvedValue({ id: 'prod-1', title: 'Test' } as any);

      const result = await controller.getProduct('prod-1');

      expect(service.getProduct).toHaveBeenCalledWith('prod-1');
      expect(result).toEqual(expect.objectContaining({ id: 'prod-1' }));
    });
  });

  describe('reviewProduct', () => {
    it('should call commerceService.reviewProduct with all params', async () => {
      service.reviewProduct.mockResolvedValue({ id: 'rev-1' } as any);

      await controller.reviewProduct(userId, 'prod-1', { rating: 5, comment: 'Great!' } as any);

      expect(service.reviewProduct).toHaveBeenCalledWith(userId, 'prod-1', 5, 'Great!');
    });
  });

  describe('createOrder', () => {
    it('should call commerceService.createOrder with userId and dto', async () => {
      const dto = { productId: 'prod-1', quantity: 2 };
      service.createOrder.mockResolvedValue({
        order: { id: 'order-1', stripePaymentId: 'pi_test_123', status: 'PENDING' },
        clientSecret: 'pi_test_123_secret_abc',
      } as any);

      const result = await controller.createOrder(userId, dto as any);

      expect(service.createOrder).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ clientSecret: 'pi_test_123_secret_abc' }));
      expect((result as any).order.stripePaymentId).toBe('pi_test_123');
    });
  });

  describe('getMyOrders', () => {
    it('should call commerceService.getMyOrders with userId and cursor', async () => {
      service.getMyOrders.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.getMyOrders(userId, 'cursor-1');

      expect(service.getMyOrders).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('getBusinesses', () => {
    it('should call commerceService.getBusinesses with parsed lat/lng', async () => {
      service.getBusinesses.mockResolvedValue({ data: [] } as any);

      await controller.getBusinesses('cursor-1', 'restaurant', '40.7128', '-74.006');

      expect(service.getBusinesses).toHaveBeenCalledWith('cursor-1', undefined, 'restaurant', 40.7128, -74.006);
    });
  });

  describe('createZakatFund', () => {
    it('should call commerceService.createZakatFund with userId and dto', async () => {
      const dto = { name: 'Education Fund', targetAmount: 10000 };
      service.createZakatFund.mockResolvedValue({ id: 'zf-1' } as any);

      const result = await controller.createZakatFund(userId, dto as any);

      expect(service.createZakatFund).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'zf-1' }));
    });
  });

  describe('getPremiumStatus', () => {
    it('should call commerceService.getPremiumStatus with userId', async () => {
      service.getPremiumStatus.mockResolvedValue({ isPremium: true, plan: 'GOLD' } as any);

      const result = await controller.getPremiumStatus(userId);

      expect(service.getPremiumStatus).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ isPremium: true }));
    });
  });

  describe('subscribePremium', () => {
    it('should call commerceService.subscribePremium with userId and plan', async () => {
      service.subscribePremium.mockResolvedValue({ subscribed: true } as any);

      const result = await controller.subscribePremium(userId, { plan: 'GOLD' } as any);

      expect(service.subscribePremium).toHaveBeenCalledWith(userId, 'GOLD');
      expect(result).toEqual({ subscribed: true });
    });
  });

  describe('cancelPremium', () => {
    it('should call commerceService.cancelPremium with userId', async () => {
      service.cancelPremium.mockResolvedValue({ cancelled: true } as any);

      const result = await controller.cancelPremium(userId);

      expect(service.cancelPremium).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ cancelled: true });
    });
  });

  // ═══ T08 Audit: Missing controller delegation tests ═══

  describe('updateProduct — C9a', () => {
    it('should delegate to commerceService.updateProduct', async () => {
      service.updateProduct.mockResolvedValue({ id: 'prod-1', title: 'Updated' } as any);
      const result = await controller.updateProduct(userId, 'prod-1', { title: 'Updated' } as any);
      expect(service.updateProduct).toHaveBeenCalledWith(userId, 'prod-1', { title: 'Updated' });
      expect(result).toEqual(expect.objectContaining({ title: 'Updated' }));
    });
  });

  describe('deleteProduct — C9b', () => {
    it('should delegate to commerceService.deleteProduct', async () => {
      service.deleteProduct.mockResolvedValue({ message: 'Deleted' } as any);
      const result = await controller.deleteProduct(userId, 'prod-1');
      expect(service.deleteProduct).toHaveBeenCalledWith(userId, 'prod-1');
      expect(result).toEqual(expect.objectContaining({ message: 'Deleted' }));
    });
  });

  describe('getSellerOrders — C9c', () => {
    it('should delegate to commerceService.getSellerOrders with status filter', async () => {
      service.getSellerOrders.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.getSellerOrders(userId, 'cursor-1', 'PAID');
      expect(service.getSellerOrders).toHaveBeenCalledWith(userId, 'cursor-1', undefined, 'PAID');
    });
  });

  describe('updateOrderStatus — C9d', () => {
    it('should delegate to commerceService.updateOrderStatus', async () => {
      service.updateOrderStatus.mockResolvedValue({ status: 'SHIPPED' } as any);
      await controller.updateOrderStatus(userId, 'order-1', { status: 'SHIPPED' } as any);
      expect(service.updateOrderStatus).toHaveBeenCalledWith('order-1', userId, 'SHIPPED');
    });
  });

  describe('getSellerAnalytics — C9e', () => {
    it('should delegate to commerceService.getSellerAnalytics', async () => {
      service.getSellerAnalytics.mockResolvedValue({ totalRevenue: 5000 } as any);
      const result = await controller.getSellerAnalytics(userId);
      expect(service.getSellerAnalytics).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ totalRevenue: 5000 }));
    });
  });

  describe('createBusiness — H12', () => {
    it('should delegate to commerceService.createBusiness', async () => {
      service.createBusiness.mockResolvedValue({ id: 'biz-1' } as any);
      const dto = { name: 'Halal Mart', category: 'restaurant' };
      await controller.createBusiness(userId, dto as any);
      expect(service.createBusiness).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('updateBusiness — C14a', () => {
    it('should delegate to commerceService.updateBusiness', async () => {
      service.updateBusiness.mockResolvedValue({ id: 'biz-1', name: 'Updated' } as any);
      await controller.updateBusiness(userId, 'biz-1', { name: 'Updated' } as any);
      expect(service.updateBusiness).toHaveBeenCalledWith(userId, 'biz-1', { name: 'Updated' });
    });
  });

  describe('deleteBusiness — C14b', () => {
    it('should delegate to commerceService.deleteBusiness', async () => {
      service.deleteBusiness.mockResolvedValue({ message: 'Deleted' } as any);
      await controller.deleteBusiness(userId, 'biz-1');
      expect(service.deleteBusiness).toHaveBeenCalledWith(userId, 'biz-1');
    });
  });

  describe('reviewBusiness — H16', () => {
    it('should delegate to commerceService.reviewBusiness', async () => {
      service.reviewBusiness.mockResolvedValue({ id: 'rev-1' } as any);
      await controller.reviewBusiness(userId, 'biz-1', { rating: 5, comment: 'Great' } as any);
      expect(service.reviewBusiness).toHaveBeenCalledWith(userId, 'biz-1', 5, 'Great');
    });
  });

  describe('getZakatFunds — H18', () => {
    it('should delegate to commerceService.getZakatFunds', async () => {
      service.getZakatFunds.mockResolvedValue({ data: [] } as any);
      await controller.getZakatFunds('cursor-1', 'EDUCATION');
      expect(service.getZakatFunds).toHaveBeenCalledWith('cursor-1', undefined, 'EDUCATION');
    });
  });

  describe('donateZakat — H19', () => {
    it('should delegate to commerceService.donateZakat', async () => {
      service.donateZakat.mockResolvedValue({ id: 'donation-1' } as any);
      await controller.donateZakat(userId, 'fund-1', { amount: 100 } as any);
      expect(service.donateZakat).toHaveBeenCalledWith(userId, 'fund-1', { amount: 100 });
    });
  });

  describe('getWaqfFunds — H20a', () => {
    it('should delegate to commerceService.getWaqfFunds', async () => {
      service.getWaqfFunds.mockResolvedValue({ data: [] } as any);
      await controller.getWaqfFunds('cursor-1');
      expect(service.getWaqfFunds).toHaveBeenCalledWith('cursor-1');
    });
  });

  describe('contributeWaqf — H21a', () => {
    it('should delegate to commerceService.contributeWaqf', async () => {
      service.contributeWaqf.mockResolvedValue({ raisedAmount: 500 } as any);
      await controller.contributeWaqf(userId, 'wf-1', { amount: 500 } as any);
      expect(service.contributeWaqf).toHaveBeenCalledWith(userId, 'wf-1', 500);
    });
  });

  describe('createTreasury — H22a', () => {
    it('should delegate to commerceService.createTreasury', async () => {
      service.createTreasury.mockResolvedValue({ id: 'treasury-1' } as any);
      const dto = { circleId: 'c1', title: 'Fund', goalAmount: 5000 };
      await controller.createTreasury(userId, dto as any);
      expect(service.createTreasury).toHaveBeenCalledWith(userId, 'c1', dto);
    });
  });

  describe('contributeTreasury — H23a', () => {
    it('should delegate to commerceService.contributeTreasury', async () => {
      service.contributeTreasury.mockResolvedValue(undefined as any);
      await controller.contributeTreasury(userId, 'treasury-1', { amount: 100 } as any);
      expect(service.contributeTreasury).toHaveBeenCalledWith(userId, 'treasury-1', 100);
    });
  });
});
