import { Test, TestingModule } from '@nestjs/testing';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedTransparencyService } from './feed-transparency.service';
import { PersonalizedFeedService } from './personalized-feed.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FeedController', () => {
  let controller: FeedController;
  let service: FeedService;

  const mockService = {
    dismiss: jest.fn(),
    getPersonalized: jest.fn(),
    getExplore: jest.fn(),
    reportNotInterested: jest.fn(),
    recalculateScores: jest.fn(),
    logInteraction: jest.fn(),
    undismiss: jest.fn(),
    getDismissed: jest.fn().mockResolvedValue([]),
    getTrendingFeed: jest.fn().mockResolvedValue({ data: [], meta: { hasMore: false } }),
    getFeaturedFeed: jest.fn().mockResolvedValue({ data: [], meta: { hasMore: false } }),
    getSuggestedUsers: jest.fn().mockResolvedValue([]),
    featurePost: jest.fn().mockResolvedValue({ id: 'p1', isFeatured: true }),
    getNearbyContent: jest.fn().mockResolvedValue({ data: [], meta: { hasMore: false } }),
  };

  const mockTransparency = {
    explainPost: jest.fn().mockResolvedValue({ reasons: ['Popular post'] }),
    explainThread: jest.fn().mockResolvedValue({ reasons: ['Trending'] }),
    explainFeed: jest.fn(),
    enhancedSearch: jest.fn().mockResolvedValue({ data: [], meta: { hasMore: false } }),
  };

  const mockPersonalizedFeed = {
    getPersonalizedFeed: jest.fn().mockResolvedValue({ data: [], meta: { hasMore: false } }),
    trackSessionSignal: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [
        ...globalMockProviders,
        { provide: FeedService, useValue: mockService },
        { provide: FeedTransparencyService, useValue: mockTransparency },
        { provide: PersonalizedFeedService, useValue: mockPersonalizedFeed },
      ],
    }).compile();

    controller = module.get<FeedController>(FeedController);
    service = module.get<FeedService>(FeedService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(FeedController);
  });

  describe('log', () => {
    it('should call service.logInteraction', async () => {
      const dto = { postId: 'post-1', space: 'saf' };
      mockService.logInteraction.mockResolvedValue({ logged: true });
      await controller.log('user-1', dto as any);
      expect(service.logInteraction).toHaveBeenCalledWith('user-1', dto);
    });

    it('should handle interaction with viewDuration', async () => {
      const dto = { postId: 'post-1', space: 'saf', viewDurationMs: 5000 };
      mockService.logInteraction.mockResolvedValue({ logged: true });
      await controller.log('user-1', dto as any);
      expect(service.logInteraction).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('dismiss', () => {
    it('should call service.dismiss', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('user-1', 'post', 'post-1');
      expect(service.dismiss).toHaveBeenCalledWith('user-1', 'post-1', 'post');
    });

    it('should handle dismiss with reel type', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('user-1', 'reel', 'reel-1');
      expect(service.dismiss).toHaveBeenCalledWith('user-1', 'reel-1', 'reel');
    });
  });

  describe('undismiss', () => {
    it('should call service.undismiss', async () => {
      mockService.undismiss.mockResolvedValue({ undismissed: true });
      await controller.undismiss('user-1', 'post', 'post-1');
      expect(service.undismiss).toHaveBeenCalledWith('user-1', 'post-1', 'post');
    });
  });

  describe('getPersonalized', () => {
    it('should call personalizedFeed.getPersonalizedFeed', async () => {
      mockPersonalizedFeed.getPersonalizedFeed.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      const result = await controller.getPersonalized(undefined, 'saf');
      expect(mockPersonalizedFeed.getPersonalizedFeed).toHaveBeenCalledWith(undefined, 'saf', undefined, 20);
      expect(result.data).toEqual([]);
    });
  });

  describe('trackSessionSignal', () => {
    it('should call personalizedFeed.trackSessionSignal and return success', async () => {
      const body = { contentId: 'p1', action: 'like' as const };
      const result = await controller.trackSessionSignal('user-1', body);
      expect(mockPersonalizedFeed.trackSessionSignal).toHaveBeenCalledWith('user-1', body);
      expect(result).toEqual({ success: true });
    });
  });

  describe('explainPost', () => {
    it('should call transparency.explainPost', async () => {
      mockTransparency.explainPost.mockResolvedValue({ reasons: ['Recommended for you'] });
      const result = await controller.explainPost('user-1', 'post-1');
      expect(mockTransparency.explainPost).toHaveBeenCalledWith('user-1', 'post-1');
      expect(result.reasons).toContain('Recommended for you');
    });
  });
});
