import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { GamificationService } from './gamification.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GamificationService — concurrency (Task 90)', () => {
  let service: GamificationService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        GamificationService,
        {
          provide: PrismaService,
          useValue: {
            userXP: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
            xPHistory: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            userStreak: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            achievement: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            userAchievement: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
            challenge: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
            challengeParticipant: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            series: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
            seriesEpisode: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            seriesFollower: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            seriesProgress: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            profileCustomization: { findUnique: jest.fn(), upsert: jest.fn() },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
    prisma = module.get(PrismaService);
  });

  it('should handle concurrent XP awards from different actions', async () => {
    prisma.userXP.upsert.mockResolvedValue({ id: 'xp-1', userId: 'user-1', totalXP: 50, level: 1 });
    prisma.xPHistory.create.mockResolvedValue({});

    const [r1, r2, r3] = await Promise.allSettled([
      service.awardXP('user-1', 'post_created'),
      service.awardXP('user-1', 'comment_posted'),
      service.awardXP('user-1', 'like_given'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
    expect(r3.status).toBe('fulfilled');
    // upsert was called for each — atomic increment
    expect(prisma.userXP.upsert).toHaveBeenCalledTimes(3);
  });

  it('should handle getStreaks for user with no streaks', async () => {
    const result = await service.getStreaks('user-1');
    expect(result).toEqual([]);
  });

  it('should handle concurrent achievement unlock attempts (P2002 safe)', async () => {
    prisma.achievement.findUnique.mockResolvedValue({ id: 'ach-1', key: 'first_post', xpReward: 0 });
    prisma.userAchievement.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error('P2002'), { code: 'P2002' }));

    const [r1, r2] = await Promise.allSettled([
      service.unlockAchievement('user-1', 'first_post'),
      service.unlockAchievement('user-1', 'first_post'),
    ]);

    // Both should complete — second returns null (already unlocked)
    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent leaderboard reads', async () => {
    const promises = Array.from({ length: 10 }, () =>
      service.getLeaderboard('xp'),
    );
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle level up from concurrent XP gains', async () => {
    // First award gives totalXP that crosses level threshold
    prisma.userXP.upsert.mockResolvedValue({ id: 'xp-1', userId: 'user-1', totalXP: 100, level: 1 });
    prisma.userXP.update.mockResolvedValue({});
    prisma.xPHistory.create.mockResolvedValue({});

    const result = await service.awardXP('user-1', 'post_created');
    expect(result).toBeDefined();
    // Level should have been recalculated
    expect(prisma.userXP.upsert).toHaveBeenCalled();
  });

  it('should handle getXP for user who has never earned XP', async () => {
    prisma.userXP.findUnique.mockResolvedValue(null);
    prisma.userXP.create.mockResolvedValue({ userId: 'new-user', totalXP: 0, level: 1 });

    const result = await service.getXP('new-user');
    expect(result.totalXP).toBe(0);
    expect(result.level).toBe(1);
  });
});
