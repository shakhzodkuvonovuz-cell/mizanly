import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { CounterReconciliationService } from './counter-reconciliation.service';

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

  describe('reconcileAll', () => {
    it('should invoke all reconciliation methods', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.coinBalance.findMany.mockResolvedValue([]);
      const result = await service.reconcileAll();
      expect(result.reconciled).toBeDefined();
      expect(result.reconciled.followCounts).toBeDefined();
      expect(result.reconciled.postCounts).toBeDefined();
      expect(result.reconciled.reelCounts).toBeDefined();
      expect(result.reconciled.videoCounts).toBeDefined();
      expect(result.reconciled.hashtagCounts).toBeDefined();
      expect(result.reconciled.coinBalances).toBeDefined();
    });
  });
});
