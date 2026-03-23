import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GamificationService } from './gamification.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GamificationService', () => {
  let service: GamificationService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        GamificationService,
        {
          provide: PrismaService,
          useValue: {
            userStreak: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
            userXP: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
            xPHistory: { create: jest.fn(), findMany: jest.fn() },
            achievement: { findMany: jest.fn(), findUnique: jest.fn() },
            userAchievement: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
            challenge: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            challengeParticipant: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            series: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
            seriesEpisode: { create: jest.fn(), findFirst: jest.fn() },
            seriesFollower: { create: jest.fn(), delete: jest.fn() },
            seriesProgress: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), upsert: jest.fn() },
            profileCustomization: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
            comment: { groupBy: jest.fn() },
            user: { findMany: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
    prisma = module.get(PrismaService) as any;

    // Configure $transaction to handle both interactive (fn) and batch (array) modes
    prisma.$transaction.mockImplementation((fnOrArray: unknown) => {
      if (typeof fnOrArray === 'function') {
        return (fnOrArray as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(fnOrArray as Promise<unknown>[]);
    });
  });

  describe('getStreaks', () => {
    it('should return user streaks sorted by currentDays', async () => {
      prisma.userStreak.findMany.mockResolvedValue([
        { id: 's1', streakType: 'posting', currentDays: 10 },
        { id: 's2', streakType: 'quran', currentDays: 5 },
      ]);
      const result = await service.getStreaks('user-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('updateStreak', () => {
    it('should create new streak when none exists', async () => {
      prisma.userStreak.findUnique.mockResolvedValue(null);
      prisma.userStreak.create.mockResolvedValue({ id: 's1', currentDays: 1, longestDays: 1 });

      const result = await service.updateStreak('user-1', 'posting');
      expect(result.currentDays).toBe(1);
    });

    it('should increment streak for consecutive days', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      prisma.userStreak.findUnique
        .mockResolvedValueOnce({ id: 's1', currentDays: 5, longestDays: 10, lastActiveDate: yesterday })
        .mockResolvedValueOnce({ id: 's1', currentDays: 6, longestDays: 10, lastActiveDate: new Date() });
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.updateStreak('user-1', 'posting');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should reset streak when more than 1 day gap', async () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 3);

      prisma.userStreak.findUnique.mockResolvedValue({
        id: 's1', currentDays: 5, longestDays: 10, lastActiveDate: twoDaysAgo,
      });
      prisma.userStreak.update.mockResolvedValue({ currentDays: 1 });

      const result = await service.updateStreak('user-1', 'posting');
      expect(prisma.userStreak.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentDays: 1 }),
        }),
      );
    });
  });

  describe('getXP', () => {
    it('should create XP record if none exists', async () => {
      prisma.userXP.findUnique.mockResolvedValue(null);
      prisma.userXP.create.mockResolvedValue({ id: 'xp-1', userId: 'user-1', totalXP: 0, level: 1 });

      const result = await service.getXP('user-1');
      expect(result.totalXP).toBe(0);
      expect(result.level).toBe(1);
    });

    it('should calculate progress to next level', async () => {
      prisma.userXP.findUnique.mockResolvedValue({ id: 'xp-1', userId: 'user-1', totalXP: 200, level: 2 });

      const result = await service.getXP('user-1') as any;
      expect(result.progressToNext).toBeDefined();
      expect(result.nextLevelXP).toBeGreaterThan(200);
    });
  });

  describe('awardXP', () => {
    it('should increase XP and update level', async () => {
      prisma.userXP.upsert.mockResolvedValue({ userId: 'user-1', totalXP: 100, level: 1 });
      prisma.userXP.update.mockResolvedValue({ totalXP: 100, level: 2 });
      prisma.xPHistory.create.mockResolvedValue({});

      await service.awardXP('user-1', 'post_created');
      expect(prisma.userXP.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: { totalXP: { increment: 10 } },
        }),
      );
      expect(prisma.xPHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10, reason: 'post_created' }),
        }),
      );
    });
  });

  describe('joinChallenge', () => {
    it('should join an active challenge', async () => {
      prisma.challenge.findUnique.mockResolvedValue({
        id: 'ch-1', isActive: true, endDate: new Date(Date.now() + 86400000),
      });
      prisma.challengeParticipant.create.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.joinChallenge('user-1', 'ch-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException for non-existent challenge', async () => {
      prisma.challenge.findUnique.mockResolvedValue(null);
      await expect(service.joinChallenge('user-1', 'ch-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for ended challenge', async () => {
      prisma.challenge.findUnique.mockResolvedValue({
        id: 'ch-1', isActive: true, endDate: new Date(Date.now() - 86400000),
      });
      await expect(service.joinChallenge('user-1', 'ch-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLeaderboard', () => {
    it('should return XP leaderboard', async () => {
      prisma.userXP.findMany.mockResolvedValue([
        { totalXP: 1000, user: { id: 'u1', username: 'top' } },
      ]);

      const result = await service.getLeaderboard('xp');
      expect(result).toHaveLength(1);
    });

    it('should return empty for unknown leaderboard type', async () => {
      const result = await service.getLeaderboard('unknown');
      expect(result).toEqual([]);
    });
  });

  describe('profileCustomization', () => {
    it('should create default customization when none exists', async () => {
      prisma.profileCustomization.findUnique.mockResolvedValue(null);
      prisma.profileCustomization.create.mockResolvedValue({
        id: 'pc-1', userId: 'user-1', layoutStyle: 'default',
      });

      const result = await service.getProfileCustomization('user-1');
      expect(result.layoutStyle).toBe('default');
    });

    it('should upsert profile customization', async () => {
      prisma.profileCustomization.upsert.mockResolvedValue({
        id: 'pc-1', accentColor: '#FF5733', layoutStyle: 'grid',
      });

      const result = await service.updateProfileCustomization('user-1', {
        accentColor: '#FF5733', layoutStyle: 'grid',
      });
      expect(result.accentColor).toBe('#FF5733');
    });
  });

  // ═══════════════════════════════════════════════════════
  // getXPHistory
  // ═══════════════════════════════════════════════════════

  describe('getXPHistory', () => {
    it('should return XP history entries', async () => {
      prisma.userXP.findUnique.mockResolvedValue({ id: 'xp-1', userId: 'user-1' });
      prisma.xPHistory.findMany.mockResolvedValue([
        { id: 'h1', amount: 10, reason: 'post_created', createdAt: new Date() },
      ]);

      const result = await service.getXPHistory('user-1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty when no XP record exists', async () => {
      prisma.userXP.findUnique.mockResolvedValue(null);
      const result = await service.getXPHistory('user-1');
      expect(result.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Achievements
  // ═══════════════════════════════════════════════════════

  describe('getAchievements', () => {
    it('should return all achievements with unlock status', async () => {
      prisma.achievement.findMany.mockResolvedValue([
        { id: 'ach-1', key: 'first_post', name: 'First Post', category: 'content', xpReward: 50 },
        { id: 'ach-2', key: 'first_follow', name: 'First Follow', category: 'social', xpReward: 25 },
      ]);
      prisma.userAchievement.findMany.mockResolvedValue([
        { achievementId: 'ach-1', unlockedAt: new Date() },
      ]);

      const result = await service.getAchievements('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].unlocked).toBe(true);
      expect(result[1].unlocked).toBe(false);
    });
  });

  describe('unlockAchievement', () => {
    it('should unlock achievement and award XP', async () => {
      prisma.achievement.findUnique.mockResolvedValue({ id: 'ach-1', key: 'first_post', xpReward: 50 });
      prisma.userAchievement.create.mockResolvedValue({});
      prisma.userXP.findUnique.mockResolvedValue({ id: 'xp-1', userId: 'user-1', totalXP: 0 });
      prisma.userXP.upsert.mockResolvedValue({ totalXP: 50 });
      prisma.xPHistory.create.mockResolvedValue({});

      const result = await service.unlockAchievement('user-1', 'first_post');
      expect(result).toBeDefined();
      expect(result?.key).toBe('first_post');
    });

    it('should return null for nonexistent achievement', async () => {
      prisma.achievement.findUnique.mockResolvedValue(null);
      const result = await service.unlockAchievement('user-1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════
  // Challenges
  // ═══════════════════════════════════════════════════════

  describe('getChallenges', () => {
    it('should return challenges with pagination', async () => {
      prisma.challenge.findMany.mockResolvedValue([
        { id: 'ch-1', title: 'Post Daily', category: 'content' },
      ]);

      const result = await service.getChallenges();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('createChallenge', () => {
    it('should create challenge', async () => {
      prisma.challenge.create.mockResolvedValue({
        id: 'ch-1', title: '7 Day Streak', userId: 'user-1',
      });

      const result = await service.createChallenge('user-1', {
        title: '7 Day Streak', description: 'Post 7 days in a row',
        challengeType: 'DAILY', category: 'fitness', targetCount: 7, xpReward: 200,
        startDate: '2026-03-20', endDate: '2026-03-27',
      });
      expect(result.title).toBe('7 Day Streak');
    });
  });

  describe('getMyChallenges', () => {
    it('should return user challenges', async () => {
      prisma.challengeParticipant.findMany.mockResolvedValue([
        { challenge: { id: 'ch-1', title: 'Post Daily' }, progress: 3 },
      ]);

      const result = await service.getMyChallenges('user-1');
      expect(result).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // updateChallengeProgress — server-side validation
  // ═══════════════════════════════════════════════════════

  describe('updateChallengeProgress', () => {
    const mockParticipant = {
      challengeId: 'ch-1',
      userId: 'user-1',
      progress: 3,
      completed: false,
      completedAt: null,
      challenge: {
        id: 'ch-1',
        title: 'Post Daily',
        targetCount: 7,
        xpReward: 100,
        createdById: 'creator-1',
        endDate: new Date(Date.now() + 86400000), // tomorrow
      },
    };

    it('should increment progress by 1', async () => {
      prisma.challengeParticipant.findUnique.mockResolvedValue(mockParticipant);
      prisma.challengeParticipant.update.mockResolvedValue({ ...mockParticipant, progress: 4 });

      const result = await service.updateChallengeProgress('user-1', 'ch-1', 1);
      expect(prisma.challengeParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ progress: 4 }),
        }),
      );
      expect(result.progress).toBe(4);
    });

    it('should reject negative progress', async () => {
      prisma.challengeParticipant.findUnique.mockResolvedValue(mockParticipant);
      await expect(service.updateChallengeProgress('user-1', 'ch-1', -1))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject progress increment greater than 1', async () => {
      prisma.challengeParticipant.findUnique.mockResolvedValue(mockParticipant);
      await expect(service.updateChallengeProgress('user-1', 'ch-1', 5))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject if challenge already completed', async () => {
      prisma.challengeParticipant.findUnique.mockResolvedValue({
        ...mockParticipant,
        completed: true,
      });
      await expect(service.updateChallengeProgress('user-1', 'ch-1', 1))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject if challenge has ended', async () => {
      prisma.challengeParticipant.findUnique.mockResolvedValue({
        ...mockParticipant,
        challenge: {
          ...mockParticipant.challenge,
          endDate: new Date(Date.now() - 86400000), // yesterday
        },
      });
      await expect(service.updateChallengeProgress('user-1', 'ch-1', 1))
        .rejects.toThrow(BadRequestException);
    });

    it('should cap progress at targetCount', async () => {
      const almostDone = { ...mockParticipant, progress: 6 };
      prisma.challengeParticipant.findUnique.mockResolvedValue(almostDone);
      prisma.challengeParticipant.update.mockResolvedValue({ ...almostDone, progress: 7, completed: true });
      prisma.userXP.upsert.mockResolvedValue({ totalXP: 100 });
      prisma.xPHistory.create.mockResolvedValue({});

      await service.updateChallengeProgress('user-1', 'ch-1', 1);
      expect(prisma.challengeParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ progress: 7, completed: true }),
        }),
      );
    });

    it('should award XP on challenge completion', async () => {
      const almostDone = { ...mockParticipant, progress: 6 };
      prisma.challengeParticipant.findUnique.mockResolvedValue(almostDone);
      prisma.challengeParticipant.update.mockResolvedValue({ ...almostDone, progress: 7, completed: true });
      prisma.userXP.upsert.mockResolvedValue({ id: 'xp-1', totalXP: 150, level: 2 });
      prisma.xPHistory.create.mockResolvedValue({});

      await service.updateChallengeProgress('user-1', 'ch-1', 1);
      expect(prisma.userXP.upsert).toHaveBeenCalled();
    });

    it('should throw NotFoundException if not participating', async () => {
      prisma.challengeParticipant.findUnique.mockResolvedValue(null);
      await expect(service.updateChallengeProgress('user-1', 'ch-1', 1))
        .rejects.toThrow(NotFoundException);
    });

    it('should accept 0 progress (no-op increment)', async () => {
      prisma.challengeParticipant.findUnique.mockResolvedValue(mockParticipant);
      prisma.challengeParticipant.update.mockResolvedValue({ ...mockParticipant, progress: 3 });

      const result = await service.updateChallengeProgress('user-1', 'ch-1', 0);
      expect(prisma.challengeParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ progress: 3 }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  // Series
  // ═══════════════════════════════════════════════════════

  describe('createSeries', () => {
    it('should create series', async () => {
      prisma.series.create.mockResolvedValue({ id: 's-1', title: 'Learn Arabic', userId: 'user-1' });

      const result = await service.createSeries('user-1', {
        title: 'Learn Arabic', description: 'A beginner series',
      });
      expect(result.title).toBe('Learn Arabic');
    });
  });

  describe('getSeries', () => {
    it('should return series with episodes', async () => {
      prisma.series.findUnique.mockResolvedValue({
        id: 's-1', title: 'Learn Arabic', episodes: [{ id: 'ep-1' }],
      });

      const result = await service.getSeries('s-1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when series not found', async () => {
      prisma.series.findUnique.mockResolvedValue(null);
      await expect(service.getSeries('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getContinueWatching', () => {
    it('should return empty array when no progress', async () => {
      prisma.seriesProgress.findMany.mockResolvedValue([]);
      const result = await service.getContinueWatching('user-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('getDiscoverSeries', () => {
    it('should return discoverable series sorted by followers', async () => {
      prisma.series.findMany.mockResolvedValue([
        { id: 's-1', title: 'Top Series', _count: { followers: 100 } },
      ]);

      const result = await service.getDiscoverSeries();
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual(expect.objectContaining({ hasMore: false }));
    });

    it('should return empty data when no series exist', async () => {
      prisma.series.findMany.mockResolvedValue([]);
      const result = await service.getDiscoverSeries();
      expect(result.data).toEqual([]);
    });
  });
});
