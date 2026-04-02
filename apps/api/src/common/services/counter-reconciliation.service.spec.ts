import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { CounterReconciliationService } from './counter-reconciliation.service';

// Mock Sentry
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Mock cron-lock to always acquire
jest.mock('../utils/cron-lock', () => ({
  acquireCronLock: jest.fn().mockResolvedValue(true),
}));

describe('CounterReconciliationService', () => {
  let service: CounterReconciliationService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CounterReconciliationService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([]),
            $executeRaw: jest.fn().mockResolvedValue(0),
            coinBalance: {
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<CounterReconciliationService>(CounterReconciliationService);
    prisma = module.get(PrismaService);
  });

  // --- R2 Tab4 Part 2: Verify SQL executes without error (K03 regression) ---

  describe('reconcilePostCounts', () => {
    it('should execute both likesCount and commentsCount queries', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const result = await service.reconcilePostCounts();
      expect(result).toBe(0);
      // Two $queryRaw calls: one for likes, one for comments
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('should call $executeRaw when drifted rows found', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'post-1', actual: BigInt(5) }]) // drifted likes
        .mockResolvedValueOnce([]); // no drifted comments
      prisma.$executeRaw.mockResolvedValue(1);
      const result = await service.reconcilePostCounts();
      expect(result).toBe(1);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('reconcileReelCounts', () => {
    it('should execute both likesCount and commentsCount queries', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const result = await service.reconcileReelCounts();
      expect(result).toBe(0);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('reconcileHashtagCounts', () => {
    it('should execute query without SQL error', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const result = await service.reconcileHashtagCounts();
      expect(result).toBe(0);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should update when drifted hashtag found', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'hash-1', name: 'ramadan', actual: BigInt(42) }]);
      prisma.$executeRaw.mockResolvedValue(1);
      const result = await service.reconcileHashtagCounts();
      expect(result).toBe(1);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('reconcileVideoCounts', () => {
    it('should execute both likesCount and commentsCount queries', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const result = await service.reconcileVideoCounts();
      expect(result).toBe(0);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('reconcileUserFollowCounts', () => {
    it('should return 0 when no drifted followers found', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const result = await service.reconcileUserFollowCounts();
      expect(result).toBe(0);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should fix both followers and following when drifted', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'u1', actual: BigInt(10), stored: 5 }]) // drifted followers
        .mockResolvedValueOnce([{ id: 'u1', actual: BigInt(3) }]); // drifted following
      prisma.$executeRaw.mockResolvedValue(1);
      const result = await service.reconcileUserFollowCounts();
      expect(result).toBe(2); // 1 drifted followers + 1 drifted following
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('reconcileCoinBalances', () => {
    it('should detect and reset negative balances', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'u1', coins: -50, diamonds: 10 },
      ]);
      prisma.coinBalance.update.mockResolvedValue({});
      const result = await service.reconcileCoinBalances();
      expect(result).toBe(1);
      expect(prisma.coinBalance.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { coins: 0 },
      });
    });

    it('should return 0 when no negative balances', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([]);
      const result = await service.reconcileCoinBalances();
      expect(result).toBe(0);
    });
  });

  // ── T12 gap: reconcileUserPostCounts ──

  describe('reconcileUserPostCounts', () => {
    it('should return 0 when no drift', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.reconcileUserPostCounts()).toBe(0);
    });

    it('should fix drifted postsCount', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'u1', actual: BigInt(15) }]);
      prisma.$executeRaw.mockResolvedValue(1);
      expect(await service.reconcileUserPostCounts()).toBe(1);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should capture exception on error', async () => {
      const Sentry = require('@sentry/node');
      prisma.$queryRaw.mockRejectedValue(new Error('DB error'));
      expect(await service.reconcileUserPostCounts()).toBe(0);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ── T12 gap: reconcilePostSavesCounts ──

  describe('reconcilePostSavesCounts', () => {
    it('should return 0 when no drift', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.reconcilePostSavesCounts()).toBe(0);
    });

    it('should fix drifted savesCount', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'p1', actual: BigInt(5) }]);
      prisma.$executeRaw.mockResolvedValue(1);
      expect(await service.reconcilePostSavesCounts()).toBe(1);
    });
  });

  // ── T12 gap: reconcilePostSharesCounts ──

  describe('reconcilePostSharesCounts', () => {
    it('should return 0 when no drift', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.reconcilePostSharesCounts()).toBe(0);
    });

    it('should fix drifted sharesCount', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'p1', actual: BigInt(3) }]);
      prisma.$executeRaw.mockResolvedValue(1);
      expect(await service.reconcilePostSharesCounts()).toBe(1);
    });
  });

  // ── T12 gap: reconcileUnreadCounts ──

  describe('reconcileUnreadCounts', () => {
    it('should return 0 when no drift', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.reconcileUnreadCounts()).toBe(0);
    });

    it('should fix drifted unread counts one by one', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { conversationId: 'conv-1', userId: 'u1', actual: BigInt(5) },
        { conversationId: 'conv-2', userId: 'u2', actual: BigInt(3) },
      ]);
      prisma.$executeRaw.mockResolvedValue(1);
      expect(await service.reconcileUnreadCounts()).toBe(2);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('should capture exception on error', async () => {
      const Sentry = require('@sentry/node');
      prisma.$queryRaw.mockRejectedValue(new Error('timeout'));
      expect(await service.reconcileUnreadCounts()).toBe(0);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ── T12 gap: reconcileUserContentCounts ──

  describe('reconcileUserContentCounts', () => {
    it('should fix drifted threads and reels counts', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'u1', actual: BigInt(5) }]) // threads
        .mockResolvedValueOnce([{ id: 'u2', actual: BigInt(3) }]); // reels
      prisma.$executeRaw.mockResolvedValue(1);
      expect(await service.reconcileUserContentCounts()).toBe(2);
    });

    it('should return 0 when no drift', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.reconcileUserContentCounts()).toBe(0);
    });
  });

  // ── T12 gap: reconcileThreadCounts ──

  describe('reconcileThreadCounts', () => {
    it('should fix drifted thread likes and replies', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([]) // likes OK
        .mockResolvedValueOnce([{ id: 't1', actual: BigInt(7) }]); // replies
      prisma.$executeRaw.mockResolvedValue(1);
      expect(await service.reconcileThreadCounts()).toBe(1);
    });
  });

  // ── T12 gap: coinBalance both negative ──

  describe('reconcileCoinBalances (extended)', () => {
    it('should reset both coins and diamonds when both negative', async () => {
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'u3', coins: -5, diamonds: -10 },
      ]);
      prisma.coinBalance.update.mockResolvedValue({});
      await service.reconcileCoinBalances();
      expect(prisma.coinBalance.update).toHaveBeenCalledWith({
        where: { userId: 'u3' },
        data: { coins: 0, diamonds: 0 },
      });
    });

    it('should capture Sentry message per reset', async () => {
      const Sentry = require('@sentry/node');
      prisma.coinBalance.findMany.mockResolvedValue([
        { userId: 'u1', coins: -1, diamonds: 0 },
      ]);
      prisma.coinBalance.update.mockResolvedValue({});
      await service.reconcileCoinBalances();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Negative CoinBalance reset'),
        'error',
      );
    });

    it('should handle error gracefully', async () => {
      const Sentry = require('@sentry/node');
      prisma.coinBalance.findMany.mockRejectedValue(new Error('DB down'));
      expect(await service.reconcileCoinBalances()).toBe(0);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ── T12 gap: reconcilePostCounts error ──

  describe('reconcilePostCounts (error handling)', () => {
    it('should capture exception and return 0 on error', async () => {
      const Sentry = require('@sentry/node');
      prisma.$queryRaw.mockRejectedValue(new Error('timeout'));
      expect(await service.reconcilePostCounts()).toBe(0);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  describe('reconcileAll', () => {
    it('should invoke all reconciliation methods and return aggregated result', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.coinBalance.findMany.mockResolvedValue([]);
      const result = await service.reconcileAll();
      expect(result.reconciled).toBeDefined();
      expect(result.reconciled.followCounts).toBe(0);
      expect(result.reconciled.postCounts).toBe(0);
      expect(result.reconciled.userPostCounts).toBe(0);
      expect(result.reconciled.userContentCounts).toBe(0);
      expect(result.reconciled.postSavesCounts).toBe(0);
      expect(result.reconciled.postSharesCounts).toBe(0);
      expect(result.reconciled.reelCounts).toBe(0);
      expect(result.reconciled.threadCounts).toBe(0);
      expect(result.reconciled.videoCounts).toBe(0);
      expect(result.reconciled.hashtagCounts).toBe(0);
      expect(result.reconciled.unreadCounts).toBe(0);
      expect(result.reconciled.coinBalances).toBe(0);
    });
  });
});
