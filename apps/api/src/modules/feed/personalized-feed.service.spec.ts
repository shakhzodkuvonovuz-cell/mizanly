import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { PersonalizedFeedService } from './personalized-feed.service';

describe('PersonalizedFeedService', () => {
  let service: PersonalizedFeedService;
  let prisma: any;
  let embeddings: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalizedFeedService,
        {
          provide: PrismaService,
          useValue: {
            post: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
            reel: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            feedInteraction: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            postReaction: { findMany: jest.fn().mockResolvedValue([]) },
            savedPost: { findMany: jest.fn().mockResolvedValue([]) },
            user: { findUnique: jest.fn() },
          },
        },
        {
          provide: EmbeddingsService,
          useValue: {
            getUserInterestVector: jest.fn().mockResolvedValue(null),
            findSimilarByVector: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<PersonalizedFeedService>(PersonalizedFeedService);
    prisma = module.get(PrismaService) as any;
    embeddings = module.get(EmbeddingsService) as any;
  });

  describe('trackSessionSignal', () => {
    it('should create a new session for first signal', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      // No throw = success (internal state tracked)
    });

    it('should track multiple signals in same session', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      service.trackSessionSignal('user-1', { contentId: 'p2', action: 'like', hashtags: ['islam'] });
      // No throw = success
    });

    it('should start new session after 30 min inactivity', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      // Simulate time passage by accessing internal state
      const sessionMap = (service as any).sessionSignals;
      const session = sessionMap.get('user-1');
      if (session) session.sessionStart = Date.now() - 31 * 60 * 1000;

      service.trackSessionSignal('user-1', { contentId: 'p2', action: 'view' });
      // New session created
    });

    it('should track skip action', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'skip' });
    });

    it('should track share action', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'share' });
    });
  });

  describe('getPersonalizedFeed — unauthenticated', () => {
    it('should return trending feed when no userId', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: [] },
        { id: 'p2', hashtags: [] },
      ]);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.data).toHaveLength(2);
      expect(result.meta).toHaveProperty('hasMore');
    });

    it('should return empty data when no trending posts', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getPersonalizedFeed — cold start', () => {
    it('should use cold start feed for user with < 10 interactions', async () => {
      prisma.feedInteraction.count.mockResolvedValue(5);
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: ['islam'] },
      ]);

      const result = await service.getPersonalizedFeed('new-user', 'saf');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    it('should fall back to trending when no interest vector', async () => {
      prisma.feedInteraction.count.mockResolvedValue(50);
      embeddings.getUserInterestVector.mockResolvedValue(null);
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: [] },
      ]);

      const result = await service.getPersonalizedFeed('user-1', 'saf');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getPersonalizedFeed — bakra/majlis spaces', () => {
    it('should return reels for bakra space', async () => {
      prisma.reel.findMany.mockResolvedValue([
        { id: 'r1', hashtags: [] },
      ]);
      const result = await service.getPersonalizedFeed(undefined, 'bakra');
      expect(result.data[0].type).toBe('reel');
    });

    it('should return threads for majlis space', async () => {
      prisma.thread.findMany.mockResolvedValue([
        { id: 't1', hashtags: [] },
      ]);
      const result = await service.getPersonalizedFeed(undefined, 'majlis');
      expect(result.data[0].type).toBe('thread');
    });
  });

  describe('getIslamicBoost', () => {
    it('should return base boost for Islamic hashtags', () => {
      const boost = service.getIslamicBoost(['quran', 'hadith']);
      expect(boost).toBeGreaterThanOrEqual(0.1);
    });

    it('should return 0 for non-Islamic hashtags', () => {
      const boost = service.getIslamicBoost(['food', 'travel', 'tech']);
      expect(boost).toBe(0);
    });

    it('should return 0 for empty hashtags', () => {
      const boost = service.getIslamicBoost([]);
      expect(boost).toBe(0);
    });

    it('should cap boost at 0.5', () => {
      const boost = service.getIslamicBoost(['quran']);
      expect(boost).toBeLessThanOrEqual(0.5);
    });
  });

  describe('trackSessionSignal', () => {
    it('should create a new session for first signal', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      // Verify session exists via internal state
      const sessions = (service as any).sessionSignals;
      expect(sessions.has('user-1')).toBe(true);
    });

    it('should track liked categories from hashtags', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['quran', 'islam'] });
      const sessions = (service as any).sessionSignals;
      const session = sessions.get('user-1');
      expect(session.likedCategories.get('quran')).toBe(1);
      expect(session.likedCategories.get('islam')).toBe(1);
    });

    it('should accumulate category counts on multiple likes', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['quran'] });
      service.trackSessionSignal('user-1', { contentId: 'p2', action: 'save', hashtags: ['quran'] });
      const session = (service as any).sessionSignals.get('user-1');
      expect(session.likedCategories.get('quran')).toBe(2);
    });

    it('should start new session after 30 min inactivity', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['islam'] });
      const sessions = (service as any).sessionSignals;
      sessions.get('user-1').sessionStart = Date.now() - 31 * 60 * 1000;

      service.trackSessionSignal('user-1', { contentId: 'p2', action: 'view' });
      const session = sessions.get('user-1');
      // New session: old liked categories are gone
      expect(session.likedCategories.size).toBe(0);
      expect(session.viewedIds.has('p2')).toBe(true);
    });

    it('should track scroll position', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view', scrollPosition: 500 });
      const session = (service as any).sessionSignals.get('user-1');
      expect(session.scrollDepth).toBe(500);
    });
  });

  describe('getPersonalizedFeed — hasMore pagination', () => {
    it('should set hasMore true when trending has extra items', async () => {
      const posts = Array.from({ length: 21 }, (_, i) => ({
        id: `p${i}`, hashtags: [],
      }));
      prisma.post.findMany.mockResolvedValue(posts);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
    });
  });
});
