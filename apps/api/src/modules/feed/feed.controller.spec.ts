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

  // ═══ T10 Audit: Missing controller tests ═══

  describe('getCommunityTrending — #28 H', () => {
    it('should delegate to feed.getCommunityTrending', async () => {
      (mockService as any).getCommunityTrending = jest.fn().mockResolvedValue([{ id: 'p1' }]);
      const result = await controller.getCommunityTrending('user-1');
      expect((mockService as any).getCommunityTrending).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'p1' }]);
    });
  });

  describe('getOnThisDay — #29 H', () => {
    it('should delegate to feed.getOnThisDay', async () => {
      (mockService as any).getOnThisDay = jest.fn().mockResolvedValue([{ id: 'memory1' }]);
      const result = await controller.getOnThisDay('user-1');
      expect((mockService as any).getOnThisDay).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'memory1' }]);
    });
  });

  describe('resetAlgorithm — #30 H', () => {
    it('should delegate to feed.resetAlgorithm', async () => {
      (mockService as any).resetAlgorithm = jest.fn().mockResolvedValue({ reset: true });
      const result = await controller.resetAlgorithm('user-1');
      expect((mockService as any).resetAlgorithm).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ reset: true });
    });
  });

  describe('getSuggestedUsers — #31 H', () => {
    it('should delegate to feed.getSuggestedUsers with default limit', async () => {
      mockService.getSuggestedUsers.mockResolvedValue([{ id: 'u2' }] as any);
      const result = await controller.getSuggestedUsers('user-1');
      expect(mockService.getSuggestedUsers).toHaveBeenCalledWith('user-1', 5);
      expect(result).toEqual([{ id: 'u2' }]);
    });

    it('should cap limit at 50', async () => {
      mockService.getSuggestedUsers.mockResolvedValue([] as any);
      await controller.getSuggestedUsers('user-1', '999');
      expect(mockService.getSuggestedUsers).toHaveBeenCalledWith('user-1', 50);
    });
  });

  describe('getFrequentCreators — #32 H', () => {
    it('should delegate to feed.getFrequentCreators', async () => {
      (mockService as any).getFrequentCreators = jest.fn().mockResolvedValue([{ id: 'creator1' }]);
      const result = await controller.getFrequentCreators('user-1');
      expect((mockService as any).getFrequentCreators).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'creator1' }]);
    });
  });

  describe('explainThread — #33 M', () => {
    it('should delegate to transparency.explainThread', async () => {
      mockTransparency.explainThread.mockResolvedValue({ reasons: ['Trending thread'] });
      const result = await controller.explainThread('user-1', 'thread-1');
      expect(mockTransparency.explainThread).toHaveBeenCalledWith('user-1', 'thread-1');
      expect(result.reasons).toContain('Trending thread');
    });
  });

  describe('enhancedSearch — #34 M', () => {
    it('should delegate to transparency.enhancedSearch with parsed limit', async () => {
      mockTransparency.enhancedSearch.mockResolvedValue({ data: [{ id: 'p1' }], meta: { hasMore: false } });
      const result = await controller.enhancedSearch('user-1', 'islam', 'cursor1', '30');
      expect(mockTransparency.enhancedSearch).toHaveBeenCalledWith('islam', 'cursor1', 30, 'user-1');
      expect(result.data).toHaveLength(1);
    });

    it('should cap limit to 50', async () => {
      mockTransparency.enhancedSearch.mockResolvedValue({ data: [], meta: { hasMore: false } });
      await controller.enhancedSearch(undefined, 'test', undefined, '999');
      expect(mockTransparency.enhancedSearch).toHaveBeenCalledWith('test', undefined, 50, undefined);
    });

    it('should default limit to 20', async () => {
      mockTransparency.enhancedSearch.mockResolvedValue({ data: [], meta: { hasMore: false } });
      await controller.enhancedSearch(undefined, 'test');
      expect(mockTransparency.enhancedSearch).toHaveBeenCalledWith('test', undefined, 20, undefined);
    });
  });
});
