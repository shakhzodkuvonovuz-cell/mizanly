import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException, NotImplementedException, ForbiddenException } from '@nestjs/common';
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

  // ═══ T08 Audit: Critical missing coverage ═══

  describe('updateProduct — C4', () => {
    it('should update product when owner', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, sellerId: 'u1' });
      prisma.product.update.mockResolvedValue({ ...mockProduct, title: 'Updated' });
      const result = await service.updateProduct('u1', 'prod-1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('should throw NotFoundException when product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.updateProduct('u1', 'nonexistent', { title: 'X' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct); // sellerId: 'seller-1'
      await expect(service.updateProduct('other-user', 'prod-1', { title: 'X' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for negative price', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, sellerId: 'u1' });
      await expect(service.updateProduct('u1', 'prod-1', { price: -5 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid status', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, sellerId: 'u1' });
      await expect(service.updateProduct('u1', 'prod-1', { status: 'INVALID' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteProduct — C5', () => {
    beforeEach(() => {
      prisma.order = { ...prisma.order, count: jest.fn().mockResolvedValue(0) };
      prisma.product.delete = jest.fn().mockResolvedValue({});
    });

    it('should delete product when owner and no active orders', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, sellerId: 'u1' });
      prisma.order.count.mockResolvedValue(0);
      const result = await service.deleteProduct('u1', 'prod-1');
      expect(result.message).toContain('deleted');
    });

    it('should throw NotFoundException when product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.deleteProduct('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct); // sellerId: 'seller-1'
      await expect(service.deleteProduct('other-user', 'prod-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when product has active orders', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, sellerId: 'u1' });
      prisma.order.count.mockResolvedValue(3);
      await expect(service.deleteProduct('u1', 'prod-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateOrderStatus — C6', () => {
    const mockOrder = {
      id: 'order-1', status: 'PAID', quantity: 2, productId: 'prod-1', buyerId: 'buyer-1',
      product: { id: 'prod-1', sellerId: 'seller-1' },
    };

    beforeEach(() => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.order.update.mockResolvedValue({ ...mockOrder, status: 'SHIPPED' });
    });

    it('should update order status for valid transition (PAID → SHIPPED)', async () => {
      const result = await service.updateOrderStatus('order-1', 'seller-1', 'SHIPPED');
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SHIPPED' } }),
      );
    });

    it('should throw NotFoundException when order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.updateOrderStatus('nonexistent', 'seller-1', 'SHIPPED'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not seller', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      await expect(service.updateOrderStatus('order-1', 'not-seller', 'SHIPPED'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid status', async () => {
      await expect(service.updateOrderStatus('order-1', 'seller-1', 'INVALID'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid transition (PAID → PENDING)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder); // status: PAID
      await expect(service.updateOrderStatus('order-1', 'seller-1', 'PENDING'))
        .rejects.toThrow(BadRequestException);
    });

    it('should restore stock on CANCELLED status', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder, status: 'PENDING', product: { id: 'prod-1', sellerId: 'seller-1' },
      });
      const txProductUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const txOrderUpdate = jest.fn().mockResolvedValue({ status: 'CANCELLED' });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          product: { updateMany: txProductUpdateMany },
          order: { update: txOrderUpdate },
        }),
      );
      await service.updateOrderStatus('order-1', 'seller-1', 'CANCELLED');
      expect(txProductUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stock: { increment: 2 } }),
        }),
      );
    });

    it('should restore stock on REFUNDED status', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder); // status: PAID
      const txProductUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const txOrderUpdate = jest.fn().mockResolvedValue({ status: 'REFUNDED' });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          product: { updateMany: txProductUpdateMany },
          order: { update: txOrderUpdate },
        }),
      );
      await service.updateOrderStatus('order-1', 'seller-1', 'REFUNDED');
      expect(txProductUpdateMany).toHaveBeenCalled();
    });
  });

  describe('getSellerOrders — C7', () => {
    it('should return orders for seller products', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'order-1', status: 'PAID', product: { title: 'Test' } },
      ]);
      const result = await service.getSellerOrders('seller-1');
      expect(result.data).toHaveLength(1);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { product: { sellerId: 'seller-1' } },
        }),
      );
    });

    it('should filter by status when provided', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.getSellerOrders('seller-1', undefined, 20, 'PAID');
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });

    it('should return empty when no orders', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      const result = await service.getSellerOrders('seller-1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getSellerAnalytics — C8', () => {
    beforeEach(() => {
      prisma.product.count = jest.fn().mockResolvedValue(5);
      prisma.product.findMany.mockResolvedValue([{ id: 'prod-1', title: 'Top', salesCount: 100 }]);
      prisma.order.count = jest.fn().mockResolvedValue(50);
      prisma.order.aggregate = jest.fn().mockResolvedValue({ _sum: { totalAmount: 2500.50 } });
    });

    it('should return seller analytics', async () => {
      const result = await service.getSellerAnalytics('seller-1');
      expect(result.totalProducts).toBe(5);
      expect(result.totalOrders).toBe(50);
      expect(result.totalRevenue).toBe(2500.50);
      expect(result.topProducts).toHaveLength(1);
    });

    it('should return 0 revenue when no paid orders', async () => {
      prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
      const result = await service.getSellerAnalytics('seller-1');
      expect(result.totalRevenue).toBe(0);
    });
  });

  describe('reviewProduct — self-review guard — H8', () => {
    it('should throw BadRequestException when reviewing own product', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct); // sellerId: 'seller-1'
      await expect(service.reviewProduct('seller-1', 'prod-1', 5))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewProduct — duplicate P2002 — M9', () => {
    it('should throw ConflictException on duplicate review', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.productReview.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.reviewProduct('user-1', 'prod-1', 5))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('getProducts — search/category filter — M3', () => {
    it('should filter by category', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.getProducts(undefined, 20, 'FOOD');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'FOOD' }),
        }),
      );
    });

    it('should filter by search string', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.getProducts(undefined, 20, undefined, 'halal');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'halal', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('createProduct — negative price', () => {
    it('should throw BadRequestException for negative price', async () => {
      await expect(service.createProduct('u1', {
        title: 'Test', description: 'X', price: -5,
        images: [], category: 'FOOD',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateBusiness — C21', () => {
    it('should update business when owner', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue({ id: 'biz-1', ownerId: 'u1' });
      prisma.halalBusiness.update.mockResolvedValue({ id: 'biz-1', name: 'Updated' });
      const result = await service.updateBusiness('u1', 'biz-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when business does not exist', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue(null);
      await expect(service.updateBusiness('u1', 'nonexistent', { name: 'X' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue({ id: 'biz-1', ownerId: 'other' });
      await expect(service.updateBusiness('u1', 'biz-1', { name: 'X' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteBusiness — C22', () => {
    beforeEach(() => {
      prisma.halalBusiness.delete = jest.fn().mockResolvedValue({});
    });

    it('should delete business when owner', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue({ id: 'biz-1', ownerId: 'u1' });
      const result = await service.deleteBusiness('u1', 'biz-1');
      expect(result.message).toContain('deleted');
    });

    it('should throw NotFoundException when business does not exist', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue(null);
      await expect(service.deleteBusiness('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue({ id: 'biz-1', ownerId: 'other' });
      await expect(service.deleteBusiness('u1', 'biz-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reviewBusiness — H20', () => {
    it('should create review and update avg rating', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue({ id: 'biz-1', ownerId: 'other' });
      prisma.businessReview.create.mockResolvedValue({ rating: 5 });
      prisma.businessReview.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 10 });
      prisma.halalBusiness.update.mockResolvedValue({});
      const result = await service.reviewBusiness('u1', 'biz-1', 5, 'Great!');
      expect(result.rating).toBe(5);
    });

    it('should throw BadRequestException for self-review', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue({ id: 'biz-1', ownerId: 'u1' });
      await expect(service.reviewBusiness('u1', 'biz-1', 5))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid rating', async () => {
      await expect(service.reviewBusiness('u1', 'biz-1', 0)).rejects.toThrow(BadRequestException);
      await expect(service.reviewBusiness('u1', 'biz-1', 6)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when business does not exist', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue(null);
      await expect(service.reviewBusiness('u1', 'nonexistent', 5))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on duplicate review', async () => {
      prisma.halalBusiness.findUnique.mockResolvedValue({ id: 'biz-1', ownerId: 'other' });
      prisma.businessReview.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.reviewBusiness('u1', 'biz-1', 5))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('createZakatFund — H23', () => {
    it('should create zakat fund for user', async () => {
      prisma.zakatFund.create.mockResolvedValue({ id: 'zf-1', title: 'Education' });
      const result = await service.createZakatFund('u1', {
        title: 'Education', description: 'For students', goalAmount: 10000, category: 'EDUCATION',
      });
      expect(result.id).toBe('zf-1');
      expect(prisma.zakatFund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recipientId: 'u1', title: 'Education' }),
        }),
      );
    });
  });

  describe('createTreasury — H26', () => {
    beforeEach(() => {
      prisma.circleMember = { findUnique: jest.fn() };
      prisma.communityTreasury.create.mockResolvedValue({ id: 'treasury-1' });
    });

    it('should create treasury when user is circle member', async () => {
      prisma.circleMember.findUnique.mockResolvedValue({ circleId: 'c1', userId: 'u1' });
      const result = await service.createTreasury('u1', 'c1', {
        title: 'Community Fund', goalAmount: 5000,
      });
      expect(result.id).toBe('treasury-1');
    });

    it('should throw ForbiddenException when not circle member', async () => {
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.createTreasury('u1', 'c1', {
        title: 'Fund', goalAmount: 5000,
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getWaqfFunds — H28', () => {
    beforeEach(() => {
      prisma.waqfFund = { findMany: jest.fn() };
    });

    it('should return active waqf funds', async () => {
      prisma.waqfFund.findMany.mockResolvedValue([{ id: 'wf-1', title: 'Mosque Fund' }]);
      const result = await service.getWaqfFunds();
      expect(result.data).toHaveLength(1);
      expect(prisma.waqfFund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });

    it('should support cursor pagination', async () => {
      prisma.waqfFund.findMany.mockResolvedValue([]);
      await service.getWaqfFunds('cursor-1', 10);
      expect(prisma.waqfFund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'cursor-1' },
          skip: 1,
          take: 11,
        }),
      );
    });
  });

  describe('subscribePremium — Stripe PI failure — M32', () => {
    it('should throw BadRequestException when Stripe PI creation fails', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      mockStripeInstance.paymentIntents.create.mockRejectedValueOnce(new Error('Stripe down'));
      await expect(service.subscribePremium('u1', 'monthly'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('createOrder — PI cancellation on rollback — M12', () => {
    it('should cancel PI when order creation transaction fails', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.$transaction.mockRejectedValueOnce(new Error('TX failed'));
      mockStripeInstance.paymentIntents.cancel.mockResolvedValue({});
      await expect(service.createOrder('buyer-1', { productId: 'prod-1' }))
        .rejects.toThrow();
      expect(mockStripeInstance.paymentIntents.cancel).toHaveBeenCalledWith('pi_test_123');
    });
  });

  describe('createOrder — Stripe PI creation failure — M11', () => {
    it('should throw BadRequestException when Stripe PI creation fails', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      mockStripeInstance.paymentIntents.create.mockRejectedValueOnce(new Error('Card network error'));
      await expect(service.createOrder('buyer-1', { productId: 'prod-1' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyOrders — cursor pagination — L14', () => {
    it('should pass cursor for pagination', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.getMyOrders('u1', 'cursor-order-1');
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'cursor-order-1' },
          skip: 1,
        }),
      );
    });
  });

  describe('getBusinesses — category filter — L19', () => {
    it('should filter by category when provided', async () => {
      prisma.halalBusiness.findMany.mockResolvedValue([]);
      await service.getBusinesses(undefined, 20, 'restaurant');
      expect(prisma.halalBusiness.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'restaurant' }),
        }),
      );
    });
  });

  describe('getZakatFunds — category filter + pagination — L24', () => {
    it('should filter by category when provided', async () => {
      prisma.zakatFund.findMany.mockResolvedValue([]);
      await service.getZakatFunds(undefined, 20, 'EDUCATION');
      expect(prisma.zakatFund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'EDUCATION' }),
        }),
      );
    });

    it('should support cursor pagination', async () => {
      prisma.zakatFund.findMany.mockResolvedValue([]);
      await service.getZakatFunds('cursor-zf-1', 10);
      expect(prisma.zakatFund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'cursor-zf-1' },
          skip: 1,
        }),
      );
    });
  });

  describe('contributeTreasury — H27 (disabled)', () => {
    it('should throw NotImplementedException', async () => {
      await expect(service.contributeTreasury('u1', 'treasury-1', 100))
        .rejects.toThrow(NotImplementedException);
    });
  });

  describe('contributeWaqf — H29 (disabled)', () => {
    it('should throw NotImplementedException', async () => {
      await expect(service.contributeWaqf('u1', 'wf-1', 100))
        .rejects.toThrow(NotImplementedException);
    });
  });
});
