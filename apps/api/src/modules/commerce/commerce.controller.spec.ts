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
            reviewProduct: jest.fn(),
            createOrder: jest.fn(),
            getMyOrders: jest.fn(),
            updateOrderStatus: jest.fn(),
            createBusiness: jest.fn(),
            getBusinesses: jest.fn(),
            reviewBusiness: jest.fn(),
            createZakatFund: jest.fn(),
            getZakatFunds: jest.fn(),
            donateZakat: jest.fn(),
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
      service.createOrder.mockResolvedValue({ id: 'order-1' } as any);

      const result = await controller.createOrder(userId, dto as any);

      expect(service.createOrder).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'order-1' }));
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
});
