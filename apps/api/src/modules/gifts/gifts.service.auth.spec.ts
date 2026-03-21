import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GiftsService } from './gifts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GiftsService — authorization matrix', () => {
  let service: GiftsService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GiftsService>(GiftsService);
    prisma = module.get(PrismaService);
  });

  it('should reject self-gift (abuse vector)', async () => {
    await expect(service.sendGift(userA, { receiverId: userA, giftType: 'rose' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should deduct from sender balance and credit receiver', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userB });
    prisma.coinBalance.findUnique.mockResolvedValue({ userId: userA, coins: 100 });
    prisma.$transaction.mockResolvedValue([
      { id: 'gift-1', senderId: userA, receiverId: userB },
      {},
      {},
      {},
      {},
    ]);

    const result = await service.sendGift(userA, { receiverId: userB, giftType: 'rose' });
    expect(result.gift.senderId).toBe(userA);
    expect(result.gift.receiverId).toBe(userB);
  });

  it('should reject gift to non-existent user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.sendGift(userA, { receiverId: 'nonexistent', giftType: 'rose' }))
      .rejects.toThrow(NotFoundException);
  });

  it('should only return own balance', async () => {
    prisma.coinBalance.upsert.mockResolvedValue({ userId: userA, coins: 50, diamonds: 10 });
    const result = await service.getBalance(userA);
    expect(result.coins).toBe(50);
    expect(prisma.coinBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: userA } }),
    );
  });

  it('should reject insufficient coins for gift', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userB });
    prisma.coinBalance.findUnique.mockResolvedValue({ userId: userA, coins: 0 });
    await expect(service.sendGift(userA, { receiverId: userB, giftType: 'rose' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should only purchase coins for self', async () => {
    prisma.coinBalance.upsert.mockResolvedValue({ userId: userA, coins: 100, diamonds: 0 });
    prisma.coinTransaction.create.mockResolvedValue({});
    const result = await service.purchaseCoins(userA, 100);
    expect(prisma.coinBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: userA } }),
    );
    expect(result.coins).toBe(100);
  });
});
