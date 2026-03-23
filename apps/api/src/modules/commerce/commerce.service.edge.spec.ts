import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommerceService } from './commerce.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock Stripe entirely — no real API calls in tests
const mockStripeInstanceEdge = {
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_test_edge_123',
      client_secret: 'pi_test_edge_123_secret_abc',
    }),
    update: jest.fn().mockResolvedValue({}),
    cancel: jest.fn().mockResolvedValue({}),
  },
};
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripeInstanceEdge),
}));

describe('CommerceService — edge cases', () => {
  let service: CommerceService;
  let prisma: any;

  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CommerceService,
        {
          provide: PrismaService,
          useValue: {
            product: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            productReview: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            order: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            halalBusiness: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            businessReview: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            zakatFund: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            zakatDonation: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            communityTreasury: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            treasuryContribution: { create: jest.fn() },
            premiumSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CommerceService>(CommerceService);
    prisma = module.get(PrismaService);
  });

  describe('createProduct — edge cases', () => {
    it('should accept Arabic product title', async () => {
      prisma.product.create.mockResolvedValue({ id: 'prod-1', title: 'حلال عطور', price: 25 });

      const result = await service.createProduct(userId, {
        title: 'حلال عطور',
        price: 25,
        description: 'عطور حلال',
        category: 'BEAUTY',
      } as any);

      expect(result.title).toBe('حلال عطور');
    });

    it('should reject negative price', async () => {
      await expect(service.createProduct(userId, {
        title: 'Test Product',
        price: -1,
        description: 'test',
        category: 'OTHER',
      } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getProducts — edge cases', () => {
    it('should return empty array when no products exist', async () => {
      const result = await service.getProducts();
      expect(result.data).toEqual([]);
    });
  });

  describe('createOrder — edge cases', () => {
    it('should reject order for non-existent product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.createOrder(userId, {
        productId: 'nonexistent',
        quantity: 1,
      } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPremiumStatus — edge cases', () => {
    it('should return non-premium status for user without subscription', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);

      const result = await service.getPremiumStatus(userId);
      expect(result.isPremium).toBe(false);
    });
  });

  describe('cancelPremium — edge cases', () => {
    it('should throw when user has no premium subscription', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);

      await expect(service.cancelPremium(userId))
        .rejects.toThrow(NotFoundException);
    });
  });
});
