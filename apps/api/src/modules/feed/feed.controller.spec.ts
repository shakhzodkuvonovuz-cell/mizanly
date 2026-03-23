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
      expect(mockPersonalizedFeed.getPersonalizedFeed).toHaveBeenCalledWith(undefined, 'saf', undefined, 20, undefined, undefined);
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

  describe('getTrending', () => {
    it('should pass userId and capped limit to service', async () => {
      mockService.getTrendingFeed.mockResolvedValue({ data: [], meta: { hasMore: false } });
      await controller.getTrending('user-1', undefined, '100');
      expect(mockService.getTrendingFeed).toHaveBeenCalledWith(undefined, 50, 'user-1');
    });

    it('should default limit to 20 and pass undefined userId', async () => {
      mockService.getTrendingFeed.mockResolvedValue({ data: [], meta: { hasMore: false } });
      await controller.getTrending(undefined);
      expect(mockService.getTrendingFeed).toHaveBeenCalledWith(undefined, 20, undefined);
    });
  });

  describe('getFeatured', () => {
    it('should pass userId and capped limit to service', async () => {
      mockService.getFeaturedFeed.mockResolvedValue({ data: [], meta: { hasMore: false } });
      await controller.getFeatured('user-1', undefined, '999');
      expect(mockService.getFeaturedFeed).toHaveBeenCalledWith(undefined, 50, 'user-1');
    });
  });

  describe('featurePost', () => {
    it('should pass userId to service for admin check', async () => {
      mockService.featurePost.mockResolvedValue({ id: 'p1', isFeatured: true });
      await controller.featurePost('admin-1', 'p1', { featured: true } as any);
      expect(mockService.featurePost).toHaveBeenCalledWith('p1', true, 'admin-1');
    });
  });

  describe('dismiss — contentType validation', () => {
    it('should reject invalid contentType', async () => {
      await expect(controller.dismiss('user-1', 'invalid', 'id-1')).rejects.toThrow('Invalid contentType');
    });

    it('should accept valid contentType', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('user-1', 'post', 'id-1');
      expect(mockService.dismiss).toHaveBeenCalled();
    });
  });

  describe('getNearby — lat/lng validation', () => {
    it('should clamp lat/lng to valid range', async () => {
      mockService.getNearbyContent.mockResolvedValue({ data: [], meta: { hasMore: false } });
      await controller.getNearby(undefined, '999', '-999', '1000');
      expect(mockService.getNearbyContent).toHaveBeenCalledWith(90, -180, 500, undefined, undefined);
    });
  });

  describe('getPersonalized — space validation', () => {
    it('should default to saf for invalid space', async () => {
      mockPersonalizedFeed.getPersonalizedFeed.mockResolvedValue({ data: [], meta: { hasMore: false } });
      await controller.getPersonalized(undefined, 'invalid' as any);
      expect(mockPersonalizedFeed.getPersonalizedFeed).toHaveBeenCalledWith(undefined, 'saf', undefined, 20, undefined, undefined);
    });
  });
});
