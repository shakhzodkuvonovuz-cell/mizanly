import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GamificationService } from './gamification.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GamificationService — edge cases', () => {
  let service: GamificationService;
  let prisma: any;

  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        GamificationService,
        {
          provide: PrismaService,
          useValue: {
            userXP: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              upsert: jest.fn(),
            },
            xPHistory: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            userStreak: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            achievement: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            userAchievement: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
            challenge: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
            challengeParticipant: {
              create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(),
            },
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

  describe('awardXP — edge cases', () => {
    it('should reject customAmount=0 (returns current XP without awarding)', async () => {
      prisma.userXP.findUnique.mockResolvedValue({ id: 'xp-1', userId, totalXP: 100, level: 2 });

      const result = await service.awardXP(userId, 'unknown_reason', 0);
      expect(result).toBeDefined();
      expect(prisma.userXP.upsert).not.toHaveBeenCalled();
    });

    it('should reject negative customAmount (returns current XP without awarding)', async () => {
      prisma.userXP.findUnique.mockResolvedValue({ id: 'xp-1', userId, totalXP: 100, level: 2 });

      const result = await service.awardXP(userId, 'test', -100);
      expect(result).toBeDefined();
      expect(prisma.userXP.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getStreaks — edge cases', () => {
    it('should return empty array for user who has never posted', async () => {
      prisma.userStreak.findMany.mockResolvedValue([]);

      const result = await service.getStreaks(userId);
      expect(result).toEqual([]);
    });
  });

  describe('getLeaderboard — edge cases', () => {
    it('should return empty array when no users have XP', async () => {
      prisma.userXP.findMany.mockResolvedValue([]);

      const result = await service.getLeaderboard('xp');
      expect(result).toEqual([]);
    });
  });

  describe('unlockAchievement — edge cases', () => {
    it('should handle already-unlocked achievement (P2002 unique constraint)', async () => {
      prisma.achievement.findUnique.mockResolvedValue({ id: 'ach-1', key: 'first_post', name: 'First Post', xpReward: 0 });
      // Simulate P2002 unique constraint violation (already unlocked)
      const p2002Error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      prisma.userAchievement.create.mockRejectedValue(p2002Error);

      const result = await service.unlockAchievement(userId, 'first_post');
      // Should return null (already unlocked), not throw
      expect(result).toBeNull();
    });
  });

  describe('joinChallenge — edge cases', () => {
    it('should throw BadRequestException when challenge has ended', async () => {
      prisma.challenge.findUnique.mockResolvedValue({
        id: 'challenge-1',
        isActive: true,
        endDate: new Date(Date.now() - 86400000), // ended yesterday
      });

      await expect(service.joinChallenge(userId, 'challenge-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when challenge is not active', async () => {
      prisma.challenge.findUnique.mockResolvedValue({
        id: 'challenge-1',
        isActive: false,
        endDate: new Date(Date.now() + 86400000), // future date
      });

      await expect(service.joinChallenge(userId, 'challenge-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when challenge does not exist', async () => {
      prisma.challenge.findUnique.mockResolvedValue(null);

      await expect(service.joinChallenge(userId, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
