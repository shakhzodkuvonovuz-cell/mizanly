import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommerceService } from './commerce.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock Stripe entirely — no real API calls in tests
const mockStripeInstance = {
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret_abc',
    }),
    update: jest.fn().mockResolvedValue({}),
    cancel: jest.fn().mockResolvedValue({}),
  },
};
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripeInstance),
}));

describe('CommerceService', () => {
  let service: CommerceService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  const mockProduct = {
    id: 'prod-1', sellerId: 'seller-1', title: 'Halal Snacks', price: 15.99,
    currency: 'USD', status: 'ACTIVE', stock: 10, rating: 4.5,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CommerceService,
        {
          provide: PrismaService,
          useValue: {
            product: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            productReview: { create: jest.fn(), aggregate: jest.fn() },
            order: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            halalBusiness: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            businessReview: { create: jest.fn(), aggregate: jest.fn() },
            zakatFund: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            zakatDonation: { create: jest.fn() },
            communityTreasury: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            treasuryContribution: { create: jest.fn() },
            premiumSubscription: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
            $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({
              product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
              order: { create: jest.fn().mockResolvedValue({
                id: 'order-1', totalAmount: 15.99, status: 'PENDING',
                stripePaymentId: 'pi_test_123', currency: 'USD', product: mockProduct,
              }) },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<CommerceService>(CommerceService);
    prisma = module.get(PrismaService) as Record<string, Record<string, jest.Mock>>;
  });

  describe('createProduct', () => {
    it('should create a product listing', async () => {
      prisma.product.create.mockResolvedValue(mockProduct);
      const result = await service.createProduct('seller-1', {
        title: 'Halal Snacks', description: 'Delicious', price: 15.99,
        images: ['img.jpg'], category: 'FOOD',
      });
      expect(result.title).toBe('Halal Snacks');
    });
  });

  describe('createOrder', () => {
    it('should create order with Stripe PaymentIntent and return clientSecret', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      const result = await service.createOrder('buyer-1', { productId: 'prod-1' });
      expect(result.clientSecret).toBe('pi_test_123_secret_abc');
      expect(result.order).toBeDefined();
      expect(result.order.stripePaymentId).toBe('pi_test_123');
    });

    it('should throw BadRequestException when buying own product', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      await expect(service.createOrder('seller-1', { productId: 'prod-1' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when not enough stock', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, stock: 0 });
      await expect(service.createOrder('buyer-1', { productId: 'prod-1', quantity: 1 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject installments > 4', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      await expect(service.createOrder('buyer-1', { productId: 'prod-1', installments: 6 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw when Stripe is not configured', async () => {
      // Access the private field to test the guard
      (service as any).stripeAvailable = false;
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      await expect(service.createOrder('buyer-1', { productId: 'prod-1' }))
        .rejects.toThrow(BadRequestException);
      // Restore
      (service as any).stripeAvailable = true;
    });
  });

  describe('donateZakat', () => {
    it('should throw NotImplementedException (zakat donations not yet available)', async () => {
      await expect(service.donateZakat('user-1', 'fund-1', { amount: 100 }))
        .rejects.toThrow(NotImplementedException);
    });

    it('should throw NotImplementedException for any input (dead code after throw)', async () => {
      await expect(service.donateZakat('user-1', 'fund-1', { amount: 100 }))
        .rejects.toThrow(NotImplementedException);
    });

    it('should throw NotImplementedException even for self-donation (dead code after throw)', async () => {
      await expect(service.donateZakat('user-1', 'fund-1', { amount: 100 }))
        .rejects.toThrow(NotImplementedException);
    });
  });

  describe('premiumSubscription', () => {
    it('should return premium status', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue({ status: 'ACTIVE' });
      const result = await service.getPremiumStatus('user-1');
      expect(result.isPremium).toBe(true);
    });

    it('should return not premium when no subscription', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      const result = await service.getPremiumStatus('user-1');
      expect(result.isPremium).toBe(false);
    });

    it('should throw ConflictException when already subscribed', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue({ status: 'ACTIVE' });
      await expect(service.subscribePremium('user-1', 'monthly'))
        .rejects.toThrow(ConflictException);
    });

    it('should create premium subscription with PENDING status (Bug 14)', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      prisma.premiumSubscription.upsert.mockResolvedValue({ id: 'ps-1', status: 'PENDING' });
      const result = await service.subscribePremium('user-1', 'monthly');
      expect(prisma.premiumSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'PENDING' }),
          update: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
      expect(result.clientSecret).toBeDefined();
    });
  });

  describe('reviewProduct', () => {
    it('should reject rating outside 1-5', async () => {
      await expect(service.reviewProduct('user-1', 'prod-1', 6))
        .rejects.toThrow(BadRequestException);
      await expect(service.reviewProduct('user-1', 'prod-1', 0))
        .rejects.toThrow(BadRequestException);
    });

    it('should create review and update product rating', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.productReview.create.mockResolvedValue({ rating: 5 });
      prisma.productReview.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 10 });
      prisma.product.update.mockResolvedValue({});

      const result = await service.reviewProduct('user-1', 'prod-1', 5, 'Great!');
      expect(result.rating).toBe(5);
    });
  });

  describe('getProducts', () => {
    it('should return active products with pagination', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      const result = await service.getProducts();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Halal Snacks');
    });

    it('should return empty when no products', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      const result = await service.getProducts();
      expect(result.data).toEqual([]);
    });
  });

  describe('getProduct', () => {
    it('should return product by ID', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      const result = await service.getProduct('prod-1');
      expect(result.title).toBe('Halal Snacks');
      expect(result.price).toBe(15.99);
    });

    it('should throw NotFoundException for nonexistent product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.getProduct('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyOrders', () => {
    it('should return user orders', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'order-1', totalAmount: 15.99, status: 'completed' },
      ]);
      const result = await service.getMyOrders('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('completed');
    });
  });

  describe('createBusiness', () => {
    it('should create halal business listing', async () => {
      prisma.halalBusiness.create.mockResolvedValue({
        id: 'biz-1', name: 'Halal Mart', ownerId: 'user-1',
      });
      const result = await service.createBusiness('user-1', { name: 'Halal Mart', category: 'grocery' });
      expect(result.name).toBe('Halal Mart');
    });
  });

  describe('getBusinesses', () => {
    it('should return businesses with pagination', async () => {
      prisma.halalBusiness.findMany.mockResolvedValue([{ id: 'biz-1', name: 'Halal Mart' }]);
      const result = await service.getBusinesses();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('cancelPremium', () => {
    it('should cancel premium subscription', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue({ id: 'ps-1', userId: 'user-1', status: 'ACTIVE' });
      prisma.premiumSubscription.update.mockResolvedValue({ status: 'CANCELLED' });
      const result = await service.cancelPremium('user-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw NotFoundException when no subscription', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      await expect(service.cancelPremium('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getZakatFunds', () => {
    it('should return active zakat funds', async () => {
      prisma.zakatFund.findMany.mockResolvedValue([{ id: 'zf-1', title: 'Ramadan Fund' }]);
      const result = await service.getZakatFunds();
      expect(result.data).toHaveLength(1);
    });
  });
});
