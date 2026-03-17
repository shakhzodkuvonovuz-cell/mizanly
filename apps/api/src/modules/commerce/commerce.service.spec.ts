import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommerceService } from './commerce.service';

describe('CommerceService', () => {
  let service: CommerceService;
  let prisma: any;

  const mockProduct = {
    id: 'prod-1', sellerId: 'seller-1', title: 'Halal Snacks', price: 15.99,
    currency: 'USD', status: 'active', stock: 10, rating: 4.5,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommerceService,
        {
          provide: PrismaService,
          useValue: {
            product: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            productReview: { create: jest.fn(), aggregate: jest.fn() },
            order: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            halalBusiness: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
            businessReview: { create: jest.fn(), aggregate: jest.fn() },
            zakatFund: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            zakatDonation: { create: jest.fn() },
            communityTreasury: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            treasuryContribution: { create: jest.fn() },
            premiumSubscription: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<CommerceService>(CommerceService);
    prisma = module.get(PrismaService) as any;
  });

  describe('createProduct', () => {
    it('should create a product listing', async () => {
      prisma.product.create.mockResolvedValue(mockProduct);
      const result = await service.createProduct('seller-1', {
        title: 'Halal Snacks', description: 'Delicious', price: 15.99,
        images: ['img.jpg'], category: 'food',
      });
      expect(result.title).toBe('Halal Snacks');
    });
  });

  describe('createOrder', () => {
    it('should create an order for available product', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.order.create.mockResolvedValue({
        id: 'order-1', totalAmount: 15.99, status: 'pending',
      });
      prisma.product.update.mockResolvedValue({});

      const result = await service.createOrder('buyer-1', { productId: 'prod-1' });
      expect(result.totalAmount).toBe(15.99);
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
  });

  describe('donateZakat', () => {
    it('should donate to an active fund', async () => {
      prisma.zakatFund.findUnique.mockResolvedValue({
        id: 'fund-1', status: 'active', goalAmount: 1000, raisedAmount: 400,
      });
      prisma.zakatDonation.create.mockResolvedValue({ id: 'don-1', amount: 100 });
      prisma.zakatFund.update.mockResolvedValue({ raisedAmount: 500 });

      const result = await service.donateZakat('user-1', 'fund-1', { amount: 100 });
      expect(result.amount).toBe(100);
    });

    it('should throw NotFoundException for closed fund', async () => {
      prisma.zakatFund.findUnique.mockResolvedValue({ id: 'fund-1', status: 'closed' });
      await expect(service.donateZakat('user-1', 'fund-1', { amount: 100 }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('premiumSubscription', () => {
    it('should return premium status', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue({ status: 'active' });
      const result = await service.getPremiumStatus('user-1');
      expect(result.isPremium).toBe(true);
    });

    it('should return not premium when no subscription', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      const result = await service.getPremiumStatus('user-1');
      expect(result.isPremium).toBe(false);
    });

    it('should throw ConflictException when already subscribed', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue({ status: 'active' });
      await expect(service.subscribePremium('user-1', 'monthly'))
        .rejects.toThrow(ConflictException);
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
      prisma.productReview.create.mockResolvedValue({ rating: 5 });
      prisma.productReview.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 10 });
      prisma.product.update.mockResolvedValue({});

      const result = await service.reviewProduct('user-1', 'prod-1', 5, 'Great!');
      expect(result.rating).toBe(5);
    });
  });
});
