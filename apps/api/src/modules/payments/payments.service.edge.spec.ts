import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PaymentsService } from './payments.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock Stripe entirely
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
    paymentIntents: { create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'sec' }) },
    paymentMethods: { list: jest.fn().mockResolvedValue({ data: [] }), attach: jest.fn() },
    subscriptions: { create: jest.fn(), cancel: jest.fn(), retrieve: jest.fn() },
    products: { create: jest.fn().mockResolvedValue({ id: 'prod_test' }) },
  })),
}));

describe('PaymentsService — edge cases', () => {
  let service: PaymentsService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn() },
            tip: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
            membershipTier: { findUnique: jest.fn() },
            membershipSubscription: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get(PrismaService);
  });

  it('should reject payment intent with amount = 0', async () => {
    await expect(service.createPaymentIntent(userId, 'receiver-1', 0, 'usd'))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject payment intent with negative amount', async () => {
    await expect(service.createPaymentIntent(userId, 'receiver-1', -100, 'usd'))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject payment intent to yourself', async () => {
    await expect(service.createPaymentIntent(userId, userId, 10, 'usd'))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for non-existent receiver', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.createPaymentIntent(userId, 'nonexistent', 10, 'usd'))
      .rejects.toThrow(NotFoundException);
  });

  it('should reject subscription to non-existent tier', async () => {
    prisma.membershipTier.findUnique.mockResolvedValue(null);
    await expect(service.createSubscription(userId, 'nonexistent', 'pm-1'))
      .rejects.toThrow(NotFoundException);
  });

  it('should handle listPaymentMethods call', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com', username: 'test', displayName: 'Test' });
    const result = await service.listPaymentMethods(userId);
    expect(result).toBeDefined();
  });
});
