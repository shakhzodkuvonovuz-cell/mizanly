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
            userXP: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            xPHistory: { create: jest.fn(), findMany: jest.fn() },
            achievement: { findMany: jest.fn(), findUnique: jest.fn() },
            userAchievement: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
            challenge: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
            challengeParticipant: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            series: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
            seriesEpisode: { create: jest.fn(), findFirst: jest.fn() },
            seriesFollower: { create: jest.fn(), delete: jest.fn() },
            profileCustomization: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
            comment: { groupBy: jest.fn() },
            user: { findMany: jest.fn() },
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
    prisma = module.get(PrismaService) as any;
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

      prisma.userStreak.findUnique.mockResolvedValue({
        id: 's1', currentDays: 5, longestDays: 10, lastActiveDate: yesterday,
      });
      prisma.userStreak.update.mockResolvedValue({ currentDays: 6, longestDays: 10 });

      const result = await service.updateStreak('user-1', 'posting');
      expect(prisma.userStreak.update).toHaveBeenCalled();
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

      const result = await service.getXP('user-1');
      expect(result.progressToNext).toBeDefined();
      expect(result.nextLevelXP).toBeGreaterThan(200);
    });
  });

  describe('awardXP', () => {
    it('should increase XP and update level', async () => {
      prisma.userXP.findUnique.mockResolvedValue({ id: 'xp-1', userId: 'user-1', totalXP: 90, level: 1 });
      prisma.xPHistory.create.mockResolvedValue({});
      prisma.userXP.update.mockResolvedValue({ totalXP: 100, level: 2 });

      const result = await service.awardXP('user-1', 'post_created');
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
});
