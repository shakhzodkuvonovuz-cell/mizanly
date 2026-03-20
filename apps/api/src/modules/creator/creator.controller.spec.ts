import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreatorController } from './creator.controller';
import { CreatorService } from './creator.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CreatorController', () => {
  let controller: CreatorController;
  let service: jest.Mocked<CreatorService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreatorController],
      providers: [
        ...globalMockProviders,
        {
          provide: CreatorService,
          useValue: {
            getPostInsights: jest.fn(),
            getReelInsights: jest.fn(),
            getDashboardOverview: jest.fn(),
            getAudienceDemographics: jest.fn(),
            getContentPerformance: jest.fn(),
            getGrowthTrends: jest.fn(),
            getRevenueSummary: jest.fn(),
            askAI: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(CreatorController);
    service = module.get(CreatorService) as jest.Mocked<CreatorService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getPostInsights', () => {
    it('should call creatorService.getPostInsights with postId and userId', async () => {
      const mockInsights = { views: 1000, likes: 50, shares: 10 };
      service.getPostInsights.mockResolvedValue(mockInsights as any);

      const result = await controller.getPostInsights('post-1', userId);

      expect(service.getPostInsights).toHaveBeenCalledWith('post-1', userId);
      expect(result).toEqual(mockInsights);
    });

    it('should propagate ForbiddenException for non-owner', async () => {
      service.getPostInsights.mockRejectedValue(new ForbiddenException('Not your post'));

      await expect(controller.getPostInsights('post-1', 'other')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReelInsights', () => {
    it('should call creatorService.getReelInsights with reelId and userId', async () => {
      service.getReelInsights.mockResolvedValue({ views: 5000, likes: 200 } as any);

      const result = await controller.getReelInsights('reel-1', userId);

      expect(service.getReelInsights).toHaveBeenCalledWith('reel-1', userId);
      expect(result).toEqual(expect.objectContaining({ views: 5000 }));
    });
  });

  describe('getDashboardOverview', () => {
    it('should call creatorService.getDashboardOverview with userId', async () => {
      const mockOverview = { totalViews: 10000, totalFollowers: 500 };
      service.getDashboardOverview.mockResolvedValue(mockOverview as any);

      const result = await controller.getDashboardOverview(userId);

      expect(service.getDashboardOverview).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockOverview);
    });
  });

  describe('getAudienceDemographics', () => {
    it('should call creatorService.getAudienceDemographics with userId', async () => {
      service.getAudienceDemographics.mockResolvedValue({ topCountries: ['US', 'UK'] } as any);

      const result = await controller.getAudienceDemographics(userId);

      expect(service.getAudienceDemographics).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ topCountries: expect.any(Array) }));
    });
  });

  describe('getContentPerformance', () => {
    it('should call creatorService.getContentPerformance with userId', async () => {
      service.getContentPerformance.mockResolvedValue({ topPosts: [] } as any);

      await controller.getContentPerformance(userId);

      expect(service.getContentPerformance).toHaveBeenCalledWith(userId);
    });
  });

  describe('getGrowthTrends', () => {
    it('should call creatorService.getGrowthTrends with userId', async () => {
      service.getGrowthTrends.mockResolvedValue({ days: [], followerGrowth: 50 } as any);

      await controller.getGrowthTrends(userId);

      expect(service.getGrowthTrends).toHaveBeenCalledWith(userId);
    });
  });

  describe('getRevenueSummary', () => {
    it('should call creatorService.getRevenueSummary with userId', async () => {
      service.getRevenueSummary.mockResolvedValue({ totalRevenue: 150.00, tips: 100, memberships: 50 } as any);

      const result = await controller.getRevenueSummary(userId);

      expect(service.getRevenueSummary).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ totalRevenue: 150.00 }));
    });
  });

  describe('askAI', () => {
    it('should call creatorService.askAI with userId and question', async () => {
      service.askAI.mockResolvedValue({ answer: 'Your best posting time is 6pm' } as any);

      const result = await controller.askAI(userId, { question: 'When should I post?' });

      expect(service.askAI).toHaveBeenCalledWith(userId, 'When should I post?');
      expect(result).toEqual(expect.objectContaining({ answer: expect.any(String) }));
    });
  });
});
