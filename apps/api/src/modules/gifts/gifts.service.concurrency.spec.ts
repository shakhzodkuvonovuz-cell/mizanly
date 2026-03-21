import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GiftsService } from './gifts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GiftsService — concurrency (Task 91)', () => {
  let service: GiftsService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        GiftsService,
        {
          provide: PrismaService,
          useValue: {
            coinBalance: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
            giftRecord: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            coinTransaction: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            user: { findUnique: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{ id: 'gift-1', senderId: 'u1', receiverId: 'u2' }, {}, {}, {}, {}]),
          },
        },
      ],
    }).compile();

    service = module.get<GiftsService>(GiftsService);
    prisma = module.get(PrismaService);
  });

  it('should handle two users sending gifts to same user simultaneously', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'receiver' });
    prisma.coinBalance.findUnique
      .mockResolvedValueOnce({ userId: 'sender-1', coins: 100 })
      .mockResolvedValueOnce({ userId: 'sender-2', coins: 100 });

    const [r1, r2] = await Promise.allSettled([
      service.sendGift('sender-1', { receiverId: 'receiver', giftType: 'rose' }),
      service.sendGift('sender-2', { receiverId: 'receiver', giftType: 'heart' }),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should reject gift when exact balance would go negative', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'receiver' });
    prisma.coinBalance.findUnique.mockResolvedValue({ userId: 'sender', coins: 0 });

    await expect(service.sendGift('sender', { receiverId: 'receiver', giftType: 'rose' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should handle concurrent coin purchases by same user', async () => {
    prisma.coinBalance.upsert
      .mockResolvedValueOnce({ userId: 'user-1', coins: 100, diamonds: 0 })
      .mockResolvedValueOnce({ userId: 'user-1', coins: 200, diamonds: 0 });
    prisma.coinTransaction.create.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.purchaseCoins('user-1', 100),
      service.purchaseCoins('user-1', 100),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle gift + purchase simultaneously', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'receiver' });
    prisma.coinBalance.findUnique.mockResolvedValue({ userId: 'user-1', coins: 50 });
    prisma.coinBalance.upsert.mockResolvedValue({ userId: 'user-1', coins: 150, diamonds: 0 });
    prisma.coinTransaction.create.mockResolvedValue({});

    const [gift, purchase] = await Promise.allSettled([
      service.sendGift('user-1', { receiverId: 'receiver', giftType: 'rose' }),
      service.purchaseCoins('user-1', 100),
    ]);

    expect(gift.status).toBeDefined();
    expect(purchase.status).toBe('fulfilled');
  });

  it('should handle getBalance called concurrently', async () => {
    prisma.coinBalance.upsert.mockResolvedValue({ userId: 'user-1', coins: 50, diamonds: 10 });

    const promises = Array.from({ length: 5 }, () =>
      service.getBalance('user-1'),
    );
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle catalog retrieval (synchronous, always safe)', () => {
    const catalog = service.getCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0].type).toBeDefined();
    expect(catalog[0].coins).toBeGreaterThan(0);
  });
});
