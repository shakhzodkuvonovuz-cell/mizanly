import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GamificationController', () => {
  let controller: GamificationController;
  let service: jest.Mocked<GamificationService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GamificationController],
      providers: [
        ...globalMockProviders,
        {
          provide: GamificationService,
          useValue: {
            getStreaks: jest.fn(),
            updateStreak: jest.fn(),
            getXP: jest.fn(),
            getXPHistory: jest.fn(),
            getAchievements: jest.fn(),
            getLeaderboard: jest.fn(),
            getChallenges: jest.fn(),
            createChallenge: jest.fn(),
            joinChallenge: jest.fn(),
            updateChallengeProgress: jest.fn(),
            getMyChallenges: jest.fn(),
            createSeries: jest.fn(),
            getDiscoverSeries: jest.fn(),
            getSeries: jest.fn(),
            addEpisode: jest.fn(),
            followSeries: jest.fn(),
            unfollowSeries: jest.fn(),
            updateSeriesProgress: jest.fn(),
            getSeriesProgress: jest.fn(),
            getContinueWatching: jest.fn(),
            getProfileCustomization: jest.fn(),
            updateProfileCustomization: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(GamificationController);
    service = module.get(GamificationService) as jest.Mocked<GamificationService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getStreaks', () => {
    it('should call gamificationService.getStreaks with userId', async () => {
      service.getStreaks.mockResolvedValue([{ type: 'posting', currentDays: 5 }] as any);

      const result = await controller.getStreaks(userId);

      expect(service.getStreaks).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('updateStreak', () => {
    it('should call gamificationService.updateStreak with valid type', async () => {
      service.updateStreak.mockResolvedValue({ currentDays: 6 } as any);

      const result = await controller.updateStreak(userId, 'posting');

      expect(service.updateStreak).toHaveBeenCalledWith(userId, 'posting');
      expect(result).toEqual({ currentDays: 6 });
    });

    it('should throw BadRequestException for invalid streak type', () => {
      expect(() => controller.updateStreak(userId, 'invalid_type')).toThrow(BadRequestException);
    });
  });

  describe('getXP', () => {
    it('should call gamificationService.getXP with userId', async () => {
      service.getXP.mockResolvedValue({ totalXP: 500, level: 5 } as any);

      const result = await controller.getXP(userId);

      expect(service.getXP).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ totalXP: 500 }));
    });
  });

  describe('getAchievements', () => {
    it('should call gamificationService.getAchievements with userId', async () => {
      service.getAchievements.mockResolvedValue([{ id: 'ach-1', name: 'First Post' }] as any);

      const result = await controller.getAchievements(userId);

      expect(service.getAchievements).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('getLeaderboard', () => {
    it('should call gamificationService.getLeaderboard with type and parsed limit', async () => {
      service.getLeaderboard.mockResolvedValue([{ userId, xp: 500, rank: 1 }] as any);

      await controller.getLeaderboard('xp', '10');

      expect(service.getLeaderboard).toHaveBeenCalledWith('xp', 10);
    });
  });

  describe('joinChallenge', () => {
    it('should call gamificationService.joinChallenge with userId and id', async () => {
      service.joinChallenge.mockResolvedValue({ joined: true } as any);

      const result = await controller.joinChallenge(userId, 'ch-1');

      expect(service.joinChallenge).toHaveBeenCalledWith(userId, 'ch-1');
      expect(result).toEqual({ joined: true });
    });
  });

  describe('createSeries', () => {
    it('should call gamificationService.createSeries with userId and dto', async () => {
      const dto = { title: 'Islamic History', category: 'education' };
      service.createSeries.mockResolvedValue({ id: 'series-1' } as any);

      const result = await controller.createSeries(userId, dto as any);

      expect(service.createSeries).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'series-1' }));
    });
  });

  describe('followSeries', () => {
    it('should call gamificationService.followSeries with userId and id', async () => {
      service.followSeries.mockResolvedValue({ following: true } as any);

      await controller.followSeries(userId, 'series-1');

      expect(service.followSeries).toHaveBeenCalledWith(userId, 'series-1');
    });
  });

  describe('getContinueWatching', () => {
    it('should call gamificationService.getContinueWatching with userId', async () => {
      service.getContinueWatching.mockResolvedValue([{ seriesId: 'series-1', episode: 3 }] as any);

      const result = await controller.continueWatching(userId);

      expect(service.getContinueWatching).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('getProfileCustomization', () => {
    it('should call gamificationService.getProfileCustomization with userId', async () => {
      service.getProfileCustomization.mockResolvedValue({ theme: 'gold', badge: 'scholar' } as any);

      const result = await controller.getProfileCustomization(userId);

      expect(service.getProfileCustomization).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ theme: 'gold' }));
    });
  });
});
