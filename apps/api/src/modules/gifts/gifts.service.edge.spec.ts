import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GiftsService } from './gifts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GiftsService — edge cases', () => {
  let service: GiftsService;
  let prisma: any;

  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        GiftsService,
        {
          provide: PrismaService,
          useValue: {
            coinBalance: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
            },
            giftRecord: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            coinTransaction: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            user: { findUnique: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GiftsService>(GiftsService);
    prisma = module.get(PrismaService);
  });

  describe('sendGift — edge cases', () => {
    it('should reject self-gift (senderId === receiverId)', async () => {
      await expect(service.sendGift(userId, {
        receiverId: userId,
        giftType: 'rose',
      })).rejects.toThrow(BadRequestException);
    });

    it('should reject insufficient coins', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'other-user' });
      prisma.coinBalance.findUnique.mockResolvedValue({ userId, coins: 0, diamonds: 0 });

      await expect(service.sendGift(userId, {
        receiverId: 'other-user',
        giftType: 'rose', // costs 1 coin
      })).rejects.toThrow(BadRequestException);
    });

    it('should reject non-existent gift type', async () => {
      await expect(service.sendGift(userId, {
        receiverId: 'other-user',
        giftType: 'nonexistent',
      })).rejects.toThrow(NotFoundException);
    });

    it('should reject sending to non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.sendGift(userId, {
        receiverId: 'nonexistent',
        giftType: 'rose',
      })).rejects.toThrow(NotFoundException);
    });
  });

  describe('purchaseCoins — edge cases', () => {
    it('should reject amount = 0', async () => {
      await expect(service.purchaseCoins(userId, 0))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject negative amount', async () => {
      await expect(service.purchaseCoins(userId, -1))
        .rejects.toThrow(BadRequestException);
    });
  });
});
