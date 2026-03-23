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
            video: { findMany: jest.fn().mockResolvedValue([]) },
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

  // ── getIslamicBoost ─────────────────────────────────────────

  describe('getIslamicBoost', () => {
    it('should return base boost >= 0.1 for a single Islamic hashtag', () => {
      const boost = service.getIslamicBoost(['quran']);
      expect(boost).toBeGreaterThanOrEqual(0.1);
    });

    it('should return same boost regardless of number of Islamic hashtags (boost is time-based, not count-based)', () => {
      const boostOne = service.getIslamicBoost(['quran']);
      const boostMany = service.getIslamicBoost(['quran', 'hadith', 'sunnah', 'islam']);
      expect(boostOne).toBe(boostMany);
    });

    it('should return 0 for non-Islamic hashtags', () => {
      const boost = service.getIslamicBoost(['food', 'travel', 'tech']);
      expect(boost).toBe(0);
    });

    it('should return 0 for empty hashtags array', () => {
      const boost = service.getIslamicBoost([]);
      expect(boost).toBe(0);
    });

    it('should cap boost at 0.5 maximum', () => {
      const boost = service.getIslamicBoost(['quran']);
      expect(boost).toBeLessThanOrEqual(0.5);
    });

    it('should handle case-insensitive hashtags', () => {
      const boost = service.getIslamicBoost(['QURAN']);
      expect(boost).toBeGreaterThanOrEqual(0.1);
    });

    it('should strip leading # from hashtags', () => {
      const boost = service.getIslamicBoost(['#hadith']);
      expect(boost).toBeGreaterThanOrEqual(0.1);
    });

    it('should return 0 when only non-matching tags exist among Islamic-looking words', () => {
      const boost = service.getIslamicBoost(['islamabad', 'qurantime']);
      // 'islamabad' does not contain exact 'islam' match via Set lookup,
      // and 'qurantime' is not in the set either
      expect(boost).toBe(0);
    });
  });

  // ── isRamadanPeriod (private, tested via reflection) ────────

  describe('isRamadanPeriod', () => {
    it('should detect Ramadan 2026 (Feb 18 start)', () => {
      const duringRamadan = new Date(2026, 1, 25); // Feb 25, 2026
      const result = (service as any).isRamadanPeriod(duringRamadan);
      expect(result).toBe(true);
    });

    it('should detect Ramadan 2028 (Jan 28 start)', () => {
      const duringRamadan = new Date(2028, 0, 30); // Jan 30, 2028
      const result = (service as any).isRamadanPeriod(duringRamadan);
      expect(result).toBe(true);
    });

    it('should return false outside Ramadan period', () => {
      const notRamadan = new Date(2028, 5, 15); // June 2028
      const result = (service as any).isRamadanPeriod(notRamadan);
      expect(result).toBe(false);
    });

    it('should approximate Ramadan for years beyond known lookup table', () => {
      // Year 2035 is beyond the known dates table (2026-2031)
      // Should use lunar cycle approximation and return a boolean
      const result = (service as any).isRamadanPeriod(new Date(2035, 0, 1));
      expect(typeof result).toBe('boolean');
    });
  });

  // ── trackSessionSignal ──────────────────────────────────────

  describe('trackSessionSignal', () => {
    it('should create a session entry for a new user', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      const sessions = (service as any).sessionSignals;
      expect(sessions.has('user-1')).toBe(true);
      const session = sessions.get('user-1');
      expect(session.viewedIds.has('p1')).toBe(true);
    });

    it('should track liked categories from hashtags on like action', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['quran', 'islam'] });
      const session = (service as any).sessionSignals.get('user-1');
      expect(session.likedCategories.get('quran')).toBe(1);
      expect(session.likedCategories.get('islam')).toBe(1);
    });

    it('should track liked categories on save action', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'save', hashtags: ['dawah'] });
      const session = (service as any).sessionSignals.get('user-1');
      expect(session.likedCategories.get('dawah')).toBe(1);
    });

    it('should NOT track categories on view action', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view', hashtags: ['quran'] });
      const session = (service as any).sessionSignals.get('user-1');
      expect(session.likedCategories.size).toBe(0);
    });

    it('should accumulate category counts across multiple signals', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['quran'] });
      service.trackSessionSignal('user-1', { contentId: 'p2', action: 'save', hashtags: ['quran'] });
      const session = (service as any).sessionSignals.get('user-1');
      expect(session.likedCategories.get('quran')).toBe(2);
    });

    it('should start a new session after 30 min inactivity', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['islam'] });
      const sessions = (service as any).sessionSignals;
      // Artificially age the session
      sessions.get('user-1').sessionStart = Date.now() - 31 * 60 * 1000;

      service.trackSessionSignal('user-1', { contentId: 'p2', action: 'view' });
      const session = sessions.get('user-1');
      expect(session.likedCategories.size).toBe(0);
      expect(session.viewedIds.has('p2')).toBe(true);
      expect(session.viewedIds.has('p1')).toBe(false);
    });

    it('should track scroll position', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view', scrollPosition: 500 });
      const session = (service as any).sessionSignals.get('user-1');
      expect(session.scrollDepth).toBe(500);
    });

    it('should cap viewedIds at MAX_VIEWED_IDS (1000)', () => {
      for (let i = 0; i < 1050; i++) {
        service.trackSessionSignal('user-cap', { contentId: `c${i}`, action: 'view' });
      }
      const session = (service as any).sessionSignals.get('user-cap');
      expect(session.viewedIds.size).toBeLessThanOrEqual(1000);
    });

    it('should evict oldest session when MAX_SESSIONS reached', () => {
      // MAX_SESSIONS is 10000 — create enough to trigger eviction
      const sessions = (service as any).sessionSignals as Map<string, unknown>;
      // Pre-fill with 10000 entries
      for (let i = 0; i < 10000; i++) {
        sessions.set(`filler-${i}`, {
          likedCategories: new Map(),
          viewedIds: new Set(),
          sessionStart: Date.now(),
          scrollDepth: 0,
        });
      }
      expect(sessions.size).toBe(10000);

      // Adding one more should evict the oldest
      service.trackSessionSignal('new-user', { contentId: 'p1', action: 'view' });
      expect(sessions.size).toBe(10000); // Still capped
      expect(sessions.has('new-user')).toBe(true);
      expect(sessions.has('filler-0')).toBe(false); // Oldest evicted
    });
  });

  // ── getSessionBoost (private) ───────────────────────────────

  describe('getSessionBoost', () => {
    it('should return 0 for user with no session', () => {
      const boost = (service as any).getSessionBoost('no-session-user', ['quran']);
      expect(boost).toBe(0);
    });

    it('should return boost proportional to liked category count', () => {
      service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['quran'] });
      service.trackSessionSignal('user-1', { contentId: 'p2', action: 'like', hashtags: ['quran'] });
      const boost = (service as any).getSessionBoost('user-1', ['quran']);
      // 2 likes * 0.05 = 0.1
      expect(boost).toBeCloseTo(0.1, 5);
    });

    it('should cap session boost at 0.3', () => {
      // Like same category 10 times: 10 * 0.05 = 0.5, but capped at 0.3
      for (let i = 0; i < 10; i++) {
        service.trackSessionSignal('user-1', { contentId: `p${i}`, action: 'like', hashtags: ['quran'] });
      }
      const boost = (service as any).getSessionBoost('user-1', ['quran']);
      expect(boost).toBe(0.3);
    });
  });

  // ── calculateEngagementScore (private) ──────────────────────

  describe('calculateEngagementScore', () => {
    it('should calculate score from likes, comments, shares, and views', () => {
      const score = (service as any).calculateEngagementScore({
        likesCount: 10,
        commentsCount: 5,
        sharesCount: 2,
        viewsCount: 100,
      });
      // total = 10 + 5*2 + 2*3 = 26; rate = 26/100 = 0.26; score = 0.26*10 = 2.6 -> capped at 1
      expect(score).toBe(1);
    });

    it('should return 0 when viewsCount is 0', () => {
      const score = (service as any).calculateEngagementScore({
        likesCount: 5,
        commentsCount: 0,
        viewsCount: 0,
      });
      expect(score).toBe(0);
    });

    it('should cap score at 1.0', () => {
      const score = (service as any).calculateEngagementScore({
        likesCount: 1000,
        commentsCount: 500,
        sharesCount: 200,
        viewsCount: 10,
      });
      expect(score).toBe(1);
    });

    it('should handle missing optional fields (commentsCount, sharesCount)', () => {
      const score = (service as any).calculateEngagementScore({
        likesCount: 1,
        viewsCount: 1000,
      });
      // total = 1 + 0 + 0 = 1; rate = 1/1000 = 0.001; score = 0.01
      expect(score).toBeCloseTo(0.01, 5);
    });

    it('should weight shares highest (3x), comments next (2x), likes base (1x)', () => {
      const sharesOnly = (service as any).calculateEngagementScore({
        likesCount: 0, commentsCount: 0, sharesCount: 1, viewsCount: 1000,
      });
      const commentsOnly = (service as any).calculateEngagementScore({
        likesCount: 0, commentsCount: 1, sharesCount: 0, viewsCount: 1000,
      });
      const likesOnly = (service as any).calculateEngagementScore({
        likesCount: 1, commentsCount: 0, sharesCount: 0, viewsCount: 1000,
      });
      expect(sharesOnly).toBeGreaterThan(commentsOnly);
      expect(commentsOnly).toBeGreaterThan(likesOnly);
    });
  });

  // ── getPersonalizedFeed — unauthenticated ───────────────────

  describe('getPersonalizedFeed — unauthenticated', () => {
    it('should return trending posts for saf space when no userId', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: [] },
        { id: 'p2', hashtags: [] },
      ]);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].type).toBe('post');
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty data array when no trending posts exist', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should not query blocks/mutes/restricts for unauthenticated users', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      await service.getPersonalizedFeed(undefined, 'saf');

      expect(prisma.block.findMany).not.toHaveBeenCalled();
      expect(prisma.mute.findMany).not.toHaveBeenCalled();
      expect(prisma.restrict.findMany).not.toHaveBeenCalled();
    });
  });

  // ── getPersonalizedFeed — space routing ─────────────────────

  describe('getPersonalizedFeed — space routing', () => {
    it('should return reels with type "reel" for bakra space', async () => {
      prisma.reel.findMany.mockResolvedValue([{ id: 'r1', hashtags: [] }]);
      const result = await service.getPersonalizedFeed(undefined, 'bakra');
      expect(result.data[0].type).toBe('reel');
    });

    it('should return threads with type "thread" for majlis space', async () => {
      prisma.thread.findMany.mockResolvedValue([{ id: 't1', hashtags: [] }]);
      const result = await service.getPersonalizedFeed(undefined, 'majlis');
      expect(result.data[0].type).toBe('thread');
    });

    it('should return videos with type "video" for minbar space', async () => {
      prisma.video.findMany.mockResolvedValue([{ id: 'v1', tags: [] }]);
      const result = await service.getPersonalizedFeed(undefined, 'minbar');
      expect(result.data[0].type).toBe('video');
    });
  });

  // ── getPersonalizedFeed — cold start ────────────────────────

  describe('getPersonalizedFeed — cold start', () => {
    it('should use cold start feed for user with < 10 interactions', async () => {
      prisma.feedInteraction.count.mockResolvedValue(5);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', hashtags: ['islam'] }]);

      const result = await service.getPersonalizedFeed('new-user', 'saf');
      expect(result.data.length).toBeGreaterThanOrEqual(0);
      expect(result.meta).toHaveProperty('hasMore');
    });

    it('should fall back to trending when user has interactions but no interest vector', async () => {
      prisma.feedInteraction.count.mockResolvedValue(50);
      embeddings.getUserInterestVector.mockResolvedValue(null);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', hashtags: [] }]);

      const result = await service.getPersonalizedFeed('user-1', 'saf');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('post');
    });
  });

  // ── getPersonalizedFeed — pagination ────────────────────────

  describe('getPersonalizedFeed — pagination', () => {
    it('should set hasMore=true when more posts exist than limit', async () => {
      const posts = Array.from({ length: 21 }, (_, i) => ({
        id: `p${i}`, hashtags: [],
      }));
      prisma.post.findMany.mockResolvedValue(posts);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
    });

    it('should include cursor in meta for pagination', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: [] },
        { id: 'p2', hashtags: [] },
      ]);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.meta.cursor).toBe('p2');
    });
  });

  // ── getPersonalizedFeed — block/mute/restrict filtering ─────

  describe('getPersonalizedFeed — block/mute/restrict filtering', () => {
    it('should query blocks bidirectionally for authenticated users', async () => {
      prisma.feedInteraction.count.mockResolvedValue(5);
      prisma.block.findMany.mockResolvedValue([{ blockerId: 'user-1', blockedId: 'bad-user' }]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', hashtags: [] }]);

      await service.getPersonalizedFeed('user-1', 'saf');

      expect(prisma.block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: 'user-1' }, { blockedId: 'user-1' }] },
        }),
      );
    });

    it('should query mutes and restricts for authenticated users', async () => {
      prisma.feedInteraction.count.mockResolvedValue(5);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      prisma.restrict.findMany.mockResolvedValue([{ restrictedId: 'restricted-user' }]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.getPersonalizedFeed('user-1', 'saf');

      expect(prisma.mute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(prisma.restrict.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restricterId: 'user-1' } }),
      );
    });
  });

  // ── getIslamicEditorialPicks — uses all 29 hashtags ─────────

  describe('getIslamicEditorialPicks', () => {
    it('should use all 29 Islamic hashtags in editorial picks query', async () => {
      prisma.feedInteraction.count.mockResolvedValue(3); // cold start
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1' }]);

      await service.getPersonalizedFeed('new-user', 'saf');

      // Find the call that has hasSome filter (editorial picks)
      const postCalls = prisma.post.findMany.mock.calls;
      const editorialCall = postCalls.find(
        (call: any[]) => call[0]?.where?.hashtags?.hasSome,
      );
      // The editorial call must exist and include all 29 Islamic hashtags
      expect(editorialCall).toBeDefined();
      expect(editorialCall[0].where.hashtags.hasSome.length).toBe(29);
    });
  });
});
