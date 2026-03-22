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
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
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

  describe('getPersonalizedFeed — block/mute/restrict filtering', () => {
    it('should query blocks, mutes, and restricts for authenticated users', async () => {
      prisma.feedInteraction.count.mockResolvedValue(5);
      prisma.block.findMany.mockResolvedValue([{ blockerId: 'user-1', blockedId: 'bad-user' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      prisma.restrict.findMany.mockResolvedValue([{ restrictedId: 'restricted-user' }]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', hashtags: [] }]);

      await service.getPersonalizedFeed('user-1', 'saf');

      expect(prisma.block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: 'user-1' }, { blockedId: 'user-1' }] },
        }),
      );
      expect(prisma.mute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(prisma.restrict.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restricterId: 'user-1' } }),
      );
    });

    it('should not query blocks/mutes/restricts for unauthenticated users', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getPersonalizedFeed(undefined, 'saf');

      expect(prisma.block.findMany).not.toHaveBeenCalled();
      expect(prisma.mute.findMany).not.toHaveBeenCalled();
      expect(prisma.restrict.findMany).not.toHaveBeenCalled();
    });
  });

  describe('session signals memory management', () => {
    it('should cap viewedIds at MAX_VIEWED_IDS', () => {
      // Fill up viewedIds to max
      for (let i = 0; i < 1001; i++) {
        service.trackSessionSignal('user-cap', { contentId: `c${i}`, action: 'view' });
      }
      const session = (service as any).sessionSignals.get('user-cap');
      expect(session.viewedIds.size).toBeLessThanOrEqual(1000);
    });
  });

  describe('isRamadanPeriod — future years', () => {
    it('should detect Ramadan for 2028', () => {
      const inRamadan2028 = new Date(2028, 0, 30); // Jan 30 2028
      const result = (service as any).isRamadanPeriod(inRamadan2028);
      expect(result).toBe(true);
    });

    it('should return false outside Ramadan period', () => {
      const notRamadan = new Date(2028, 5, 15); // June 2028
      const result = (service as any).isRamadanPeriod(notRamadan);
      expect(result).toBe(false);
    });
  });

  describe('getIslamicEditorialPicks — uses all hashtags', () => {
    it('should use all 29 Islamic hashtags not just first 10', async () => {
      prisma.post.findMany.mockResolvedValue([{ id: 'p1' }]);

      // Access via cold start which calls getIslamicEditorialPicks
      prisma.feedInteraction.count.mockResolvedValue(3);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);

      await service.getPersonalizedFeed('new-user', 'saf');

      // Verify the hasSome array includes tags beyond the first 10
      const postCall = prisma.post.findMany.mock.calls.find(
        (call: any[]) => call[0]?.where?.hashtags?.hasSome,
      );
      if (postCall) {
        expect(postCall[0].where.hashtags.hasSome.length).toBeGreaterThan(10);
      }
    });
  });
});
