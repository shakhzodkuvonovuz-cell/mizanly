import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../config/prisma.service';
import { GiftsService } from './gifts.service';
import { NOTIFICATION_REQUESTED } from '../../common/events/notification.events';
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
            $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
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
    it('should throw NotImplementedException (cashout not yet available)', async () => {
      await expect(service.cashout('u1', 200)).rejects.toThrow(NotImplementedException);
    });

    it('should throw NotImplementedException for any input (dead code after throw)', async () => {
      await expect(service.cashout('u1', 50)).rejects.toThrow(NotImplementedException);
      await expect(service.cashout('u1', 100)).rejects.toThrow(NotImplementedException);
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

  // ═══ T08 Audit: Missing gifts coverage ═══

  describe('purchaseCoins — max 100K guard — M3', () => {
    it('should throw for amount > 100,000', async () => {
      await expect(service.purchaseCoins('u1', 100001)).rejects.toThrow(BadRequestException);
    });

    it('should accept exactly 100,000', async () => {
      prisma.coinTransaction.create.mockResolvedValue({ id: 'tx-1' });
      prisma.coinBalance.upsert.mockResolvedValue({ coins: 0, diamonds: 0 });
      const result = await service.purchaseCoins('u1', 100000);
      expect(result.pendingPurchase).toBe(100000);
    });
  });

  describe('sendGift — negative balance integrity guard — M5', () => {
    it('should throw when balance goes negative after deduction', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'receiver', isBanned: false, isDeactivated: false });
      // $transaction passes tx=prisma, so updateMany/findUnique are on prisma itself
      prisma.coinBalance.updateMany.mockResolvedValue({ count: 1 }); // deduction succeeds
      prisma.coinBalance.findUnique.mockResolvedValue({ coins: -5 }); // but balance is negative!

      await expect(service.sendGift('sender', {
        receiverId: 'receiver', giftType: 'rose',
      })).rejects.toThrow('Balance integrity violation');
    });
  });

  describe('getHistory — limit clamping — L8', () => {
    it('should clamp limit to minimum 1', async () => {
      prisma.giftRecord.findMany.mockResolvedValue([]);
      prisma.coinTransaction.findMany.mockResolvedValue([]);
      await service.getHistory('u1', undefined, 0);
      expect(prisma.giftRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });

    it('should clamp limit to maximum 50', async () => {
      prisma.giftRecord.findMany.mockResolvedValue([]);
      prisma.coinTransaction.findMany.mockResolvedValue([]);
      await service.getHistory('u1', undefined, 999);
      expect(prisma.giftRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });

  describe('sendGift — notification body uses "Someone" — L#55', () => {
    it('should fire notification with "Someone" as sender name', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'receiver', isBanned: false, isDeactivated: false });
      prisma.coinBalance.updateMany.mockResolvedValue({ count: 1 });
      prisma.coinBalance.findUnique.mockResolvedValue({ coins: 100 }); // positive
      prisma.giftRecord.create.mockResolvedValue({ id: 'gift-1' });
      prisma.coinBalance.upsert.mockResolvedValue({});
      prisma.coinTransaction.create.mockResolvedValue({});

      const emitter = (service as any).eventEmitter;

      await service.sendGift('sender', { receiverId: 'receiver', giftType: 'rose' });
      expect(emitter.emit).toHaveBeenCalledWith(
        NOTIFICATION_REQUESTED,
        expect.objectContaining({
          body: expect.stringContaining('Someone'),
        }),
      );
    });
  });
});
