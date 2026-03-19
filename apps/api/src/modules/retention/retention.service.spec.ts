import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { RetentionService } from './retention.service';

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        {
          provide: PrismaService,
          useValue: {
            reel: { findUnique: jest.fn() },
            streak: { findMany: jest.fn().mockResolvedValue([]) },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            post: { count: jest.fn().mockResolvedValue(0) },
          },
        },
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    service = module.get<RetentionService>(RetentionService);
    prisma = module.get(PrismaService) as any;
  });

  describe('checkReelViewMilestone', () => {
    it('should return milestone string when threshold crossed', async () => {
      prisma.reel.findUnique.mockResolvedValue({ userId: 'u1', viewsCount: 150 });
      redis.get.mockResolvedValue(null);

      const result = await service.checkReelViewMilestone('reel-1');
      expect(result).toBe('100');
    });

    it('should return 1K for 1000+ views', async () => {
      prisma.reel.findUnique.mockResolvedValue({ userId: 'u1', viewsCount: 1500 });
      redis.get.mockResolvedValueOnce('1') // 100 already sent
          .mockResolvedValueOnce(null);    // 1K not sent

      const result = await service.checkReelViewMilestone('reel-1');
      expect(result).toBe('1K');
    });

    it('should return null when milestone already notified', async () => {
      prisma.reel.findUnique.mockResolvedValue({ userId: 'u1', viewsCount: 150 });
      redis.get.mockResolvedValue('1'); // Already sent

      const result = await service.checkReelViewMilestone('reel-1');
      expect(result).toBeNull();
    });

    it('should return null for non-existent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      const result = await service.checkReelViewMilestone('missing');
      expect(result).toBeNull();
    });

    it('should return null when below any milestone', async () => {
      prisma.reel.findUnique.mockResolvedValue({ userId: 'u1', viewsCount: 50 });
      const result = await service.checkReelViewMilestone('reel-1');
      expect(result).toBeNull();
    });
  });

  describe('getUsersWithExpiringStreaks', () => {
    it('should return users with streaks at risk', async () => {
      prisma.streak.findMany.mockResolvedValue([
        { userId: 'u1', currentStreak: 5 },
      ]);
      redis.get.mockResolvedValue(null);

      const result = await service.getUsersWithExpiringStreaks();
      expect(result).toHaveLength(1);
      expect(result[0].currentStreak).toBe(5);
    });

    it('should skip already-warned users', async () => {
      prisma.streak.findMany.mockResolvedValue([
        { userId: 'u1', currentStreak: 5 },
      ]);
      redis.get.mockResolvedValue('1'); // Already warned

      const result = await service.getUsersWithExpiringStreaks();
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no streaks at risk', async () => {
      prisma.streak.findMany.mockResolvedValue([]);
      const result = await service.getUsersWithExpiringStreaks();
      expect(result).toEqual([]);
    });
  });

  describe('isInJummahGracePeriod', () => {
    it('should return boolean', () => {
      const result = service.isInJummahGracePeriod();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('trackSessionDepth', () => {
    it('should store session data in Redis', async () => {
      await service.trackSessionDepth('user-1', {
        scrollDepth: 500, timeSpentMs: 30000, interactionCount: 5, space: 'saf',
      });
      expect(redis.lpush).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
    });

    it('should set 7 day TTL on session data', async () => {
      await service.trackSessionDepth('user-1', {
        scrollDepth: 100, timeSpentMs: 5000, interactionCount: 1, space: 'bakra',
      });
      expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 604800);
    });
  });

  describe('getSocialFomoTargets', () => {
    it('should find inactive users with active friends', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      prisma.post.count.mockResolvedValue(5);
      redis.get.mockResolvedValue(null);

      const result = await service.getSocialFomoTargets();
      expect(result).toHaveLength(1);
    });

    it('should skip users already notified today', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      redis.get.mockResolvedValue('1');

      const result = await service.getSocialFomoTargets();
      expect(result).toHaveLength(0);
    });
  });
});
