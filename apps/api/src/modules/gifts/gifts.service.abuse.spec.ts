import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GiftsService } from './gifts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GiftsService — abuse vectors (Task 98)', () => {
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
            coinBalance: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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

  it('should reject self-gift (senderId === receiverId)', async () => {
    await expect(service.sendGift('user-1', { receiverId: 'user-1', giftType: 'rose' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject gift with amount exceeding balance', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
    prisma.coinBalance.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.sendGift('user-1', { receiverId: 'user-2', giftType: 'rose' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject gift to non-existent user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.sendGift('user-1', { receiverId: 'nonexistent', giftType: 'rose' }))
      .rejects.toThrow(NotFoundException);
  });

  it('should reject purchase of 0 coins', async () => {
    await expect(service.purchaseCoins('user-1', 0)).rejects.toThrow(BadRequestException);
  });

  it('should reject purchase of negative coins', async () => {
    await expect(service.purchaseCoins('user-1', -100)).rejects.toThrow(BadRequestException);
  });

  it('should reject non-integer coin purchase', async () => {
    await expect(service.purchaseCoins('user-1', 1.5)).rejects.toThrow(BadRequestException);
  });

  it('should reject non-existent gift type', async () => {
    await expect(service.sendGift('user-1', { receiverId: 'user-2', giftType: 'nonexistent' }))
      .rejects.toThrow(NotFoundException);
  });

  it('should reject gift when sender has no balance record', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
    prisma.coinBalance.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.sendGift('user-1', { receiverId: 'user-2', giftType: 'rose' }))
      .rejects.toThrow(BadRequestException);
  });
});
