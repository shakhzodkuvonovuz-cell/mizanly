import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GiftsService } from './gifts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GiftsService', () => {
  let service: GiftsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        GiftsService,
        {
          provide: PrismaService,
          useValue: {
            coinBalance: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            coinTransaction: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            giftRecord: { create: jest.fn(), groupBy: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'receiver' }) },
            $transaction: jest.fn().mockResolvedValue([{ id: 'gift-1', senderId: 's', receiverId: 'r', giftType: 'rose', coinCost: 1 }]),
          },
        },
      ],
    }).compile();
    service = module.get(GiftsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getBalance', () => {
    it('should return coin and diamond balance', async () => {
      prisma.coinBalance.upsert.mockResolvedValue({ coins: 100, diamonds: 50 });
      const result = await service.getBalance('u1');
      expect(result.coins).toBe(100);
      expect(result.diamonds).toBe(50);
    });
  });

  describe('purchaseCoins', () => {
    it('should create pending purchase without crediting coins', async () => {
      prisma.coinTransaction.create.mockResolvedValue({ id: 'tx-1' });
      prisma.coinBalance.upsert.mockResolvedValue({ coins: 0, diamonds: 0 });
      const result = await service.purchaseCoins('u1', 200);
      expect(result.pendingPurchase).toBe(200);
      expect(result.coins).toBe(0);
    });

    it('should throw on non-positive amount', async () => {
      await expect(service.purchaseCoins('u1', 0)).rejects.toThrow(BadRequestException);
      await expect(service.purchaseCoins('u1', -5)).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendGift', () => {
    it('should send a gift and deduct coins', async () => {
      prisma.coinBalance.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.sendGift('sender', { receiverId: 'receiver', giftType: 'star' });
      expect(result.giftName).toBe('Star');
      expect(result.coinCost).toBe(10);
      expect(result.diamondsEarned).toBe(7); // Math.floor(10 * 0.7)
    });

    it('should throw when sending to self', async () => {
      await expect(service.sendGift('u1', { receiverId: 'u1', giftType: 'rose' })).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid gift type', async () => {
      await expect(service.sendGift('u1', { receiverId: 'u2', giftType: 'nonexistent' })).rejects.toThrow(NotFoundException);
    });

    it('should throw for insufficient coins', async () => {
      prisma.coinBalance.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.sendGift('u1', { receiverId: 'u2', giftType: 'crown' })).rejects.toThrow(BadRequestException);
    });

    it('should throw when receiver not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.coinBalance.findUnique.mockResolvedValue({ coins: 1000 });
      await expect(service.sendGift('u1', { receiverId: 'u2', giftType: 'rose' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCatalog', () => {
    it('should return gift catalog', () => {
      const catalog = service.getCatalog();
      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog[0]).toHaveProperty('type');
      expect(catalog[0]).toHaveProperty('coins');
    });
  });

  describe('getHistory', () => {
    it('should return gift records and transactions', async () => {
      prisma.giftRecord.findMany
        .mockResolvedValueOnce([{ id: 'g1', giftType: 'rose', coinCost: 1, receiverId: 'r1', senderId: 'u1', createdAt: new Date(), receiver: { displayName: 'Rec', username: 'rec' } }])
        .mockResolvedValueOnce([]);
      prisma.coinTransaction.findMany.mockResolvedValue([{ id: 'tx1', type: 'purchase', amount: 100 }]);
      const result = await service.getHistory('u1');
      expect(result.data.giftsSent).toHaveLength(1);
      expect(result.data.giftsSent[0].giftName).toBe('Rose');
      expect(result.data.giftsSent[0].receiverName).toBe('Rec');
      expect(result.data.transactions).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty data when no history', async () => {
      prisma.giftRecord.findMany.mockResolvedValue([]);
      prisma.coinTransaction.findMany.mockResolvedValue([]);
      const result = await service.getHistory('u1');
      expect(result.data.giftsSent).toHaveLength(0);
      expect(result.data.giftsReceived).toHaveLength(0);
      expect(result.data.transactions).toHaveLength(0);
    });
  });

  describe('cashout', () => {
    it('should convert diamonds to USD', async () => {
      prisma.coinBalance.findUnique
        .mockResolvedValueOnce({ diamonds: 500 })  // initial balance check
        .mockResolvedValueOnce({ diamonds: 300 });  // post-update re-read
      prisma.coinBalance.updateMany.mockResolvedValue({ count: 1 });
      prisma.coinTransaction.create.mockResolvedValue({});
      const result = await service.cashout('u1', 200);
      expect(result.diamondsDeducted).toBe(200);
      expect(result.usdAmount).toBeGreaterThan(0);
      expect(result.remainingDiamonds).toBe(300);
    });

    it('should throw for minimum cashout', async () => {
      await expect(service.cashout('u1', 50)).rejects.toThrow(BadRequestException);
    });

    it('should throw for insufficient diamonds', async () => {
      prisma.coinBalance.findUnique.mockResolvedValue({ diamonds: 10 });
      await expect(service.cashout('u1', 100)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReceivedGifts', () => {
    it('should return aggregated received gifts', async () => {
      prisma.giftRecord.groupBy.mockResolvedValue([
        { giftType: 'rose', _count: { giftType: 5 }, _sum: { coinCost: 5 } },
      ]);
      const result = await service.getReceivedGifts('u1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].giftName).toBe('Rose');
      expect(result.data[0].count).toBe(5);
    });
  });
});
