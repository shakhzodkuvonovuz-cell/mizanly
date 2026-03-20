import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService } from '../modules/gamification/gamification.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

/**
 * Integration: Gamification
 * Award XP → Check level → Get streak → Update streak → Get achievements
 */
describe('Integration: Gamification', () => {
  let gamificationService: GamificationService;
  let prisma: any;

  beforeEach(async () => {
    // Use yesterday's date so streak update sees a 1-day gap and continues
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const prismaValue: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      userXP: {
        findUnique: jest.fn().mockResolvedValue({ id: 'xp-rec-1', userId: 'user-1', totalXP: 0, level: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'xp-rec-1', userId: 'user-1', totalXP: 50, level: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'xp-rec-1', userId: 'user-1', totalXP: 0, level: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'xp-rec-1', userId: 'user-1', totalXP: 50, level: 1 }),
      },
      xPHistory: {
        create: jest.fn().mockResolvedValue({ id: 'xph-1', userXPId: 'xp-rec-1', amount: 50, reason: 'post_created' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      userStreak: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', streakType: 'daily_login', currentDays: 3, longestDays: 7, lastActiveDate: yesterday }),
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-1', streakType: 'daily_login', currentDays: 3, longestDays: 7 }),
        findMany: jest.fn().mockResolvedValue([
          { userId: 'user-1', streakType: 'daily_login', currentDays: 3, longestDays: 7, lastActiveDate: yesterday },
        ]),
        create: jest.fn().mockResolvedValue({ userId: 'user-1', currentDays: 1, longestDays: 1, lastActiveDate: new Date() }),
        upsert: jest.fn().mockResolvedValue({ currentDays: 4, longestDays: 7 }),
        update: jest.fn().mockResolvedValue({ currentDays: 4, longestDays: 7 }),
      },
      achievement: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ach-1', name: 'First Post', description: 'Create your first post', xpReward: 50, icon: 'star' },
        ]),
      },
      userAchievement: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      challenge: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      challengeParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      dailyTaskCompletion: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      level: {
        findFirst: jest.fn().mockResolvedValue({ level: 1, minXP: 0, maxXP: 100, title: 'Newcomer' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaderboardEntry: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        GamificationService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    gamificationService = module.get(GamificationService);
    prisma = module.get(PrismaService) as any;
  });

  it('should award XP for an action', async () => {
    const result = await gamificationService.awardXP('user-1', 'post_created');
    expect(result).toHaveProperty('totalXP');
    expect(prisma.xPHistory.create).toHaveBeenCalled();
  });

  it('should get user streaks', async () => {
    const result = await gamificationService.getStreaks('user-1');
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('currentDays', 3);
  });

  it('should update streak', async () => {
    const result = await gamificationService.updateStreak('user-1', 'daily_login');
    expect(result).toHaveProperty('currentDays');
  });

  it('should get XP balance', async () => {
    const result = await gamificationService.getXP('user-1');
    expect(result).toHaveProperty('totalXP');
    expect(result).toHaveProperty('level');
  });

  it('should get available achievements', async () => {
    const result = await gamificationService.getAchievements('user-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
