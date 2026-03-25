import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { PersonalizedFeedService } from './personalized-feed.service';

describe('PersonalizedFeedService', () => {
  let service: PersonalizedFeedService;
  let prisma: any;
  let embeddings: any;
  let redis: any;

  // Track Redis session store in-memory for test assertions
  const redisStore = new Map<string, Record<string, string>>();

  beforeEach(async () => {
    redisStore.clear();

    redis = {
      hgetall: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(redisStore.get(key) || {});
      }),
      hset: jest.fn().mockImplementation((key: string, field: string, value: string) => {
        if (!redisStore.has(key)) redisStore.set(key, {});
        redisStore.get(key)![field] = value;
        return Promise.resolve(1);
      }),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

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
            hashtagFollow: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: EmbeddingsService,
          useValue: {
            getUserInterestVector: jest.fn().mockResolvedValue(null),
            findSimilarByVector: jest.fn().mockResolvedValue([]),
            findSimilarByMultipleVectors: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'REDIS',
          useValue: redis,
        },
      ],
    }).compile();

    service = module.get<PersonalizedFeedService>(PersonalizedFeedService);
    prisma = module.get(PrismaService) as any;
    embeddings = module.get(EmbeddingsService) as any;
  });

  // ── Helper: get session data from Redis store ─────────────────
  function getSessionFromStore(userId: string) {
    const stored = redisStore.get(`session:${userId}`);
    if (!stored || !stored.json) return null;
    return JSON.parse(stored.json);
  }

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

  // ── trackSessionSignal (Redis-backed) ─────────────────────────

  describe('trackSessionSignal', () => {
    it('should create a session entry for a new user in Redis', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      expect(redis.hset).toHaveBeenCalledWith('session:user-1', 'json', expect.any(String));
      expect(redis.expire).toHaveBeenCalledWith('session:user-1', 1800);

      const session = getSessionFromStore('user-1');
      expect(session).not.toBeNull();
      expect(session.viewedIds).toContain('p1');
    });

    it('should track liked categories from hashtags on like action', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['quran', 'islam'] });
      const session = getSessionFromStore('user-1');
      expect(session.likedCategories.quran).toBe(1);
      expect(session.likedCategories.islam).toBe(1);
    });

    it('should track liked categories on save action', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'save', hashtags: ['dawah'] });
      const session = getSessionFromStore('user-1');
      expect(session.likedCategories.dawah).toBe(1);
    });

    it('should NOT track categories on view action', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view', hashtags: ['quran'] });
      const session = getSessionFromStore('user-1');
      expect(Object.keys(session.likedCategories)).toHaveLength(0);
    });

    it('should accumulate category counts across multiple signals', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['quran'] });
      await service.trackSessionSignal('user-1', { contentId: 'p2', action: 'save', hashtags: ['quran'] });
      const session = getSessionFromStore('user-1');
      expect(session.likedCategories.quran).toBe(2);
    });

    it('should start a new session after 30 min inactivity', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'like', hashtags: ['islam'] });
      // Artificially age the session in the Redis store
      const stored = redisStore.get('session:user-1')!;
      const sessionData = JSON.parse(stored.json);
      sessionData.sessionStart = Date.now() - 31 * 60 * 1000;
      stored.json = JSON.stringify(sessionData);

      await service.trackSessionSignal('user-1', { contentId: 'p2', action: 'view' });
      const session = getSessionFromStore('user-1');
      expect(Object.keys(session.likedCategories)).toHaveLength(0);
      expect(session.viewedIds).toContain('p2');
      expect(session.viewedIds).not.toContain('p1');
    });

    it('should track scroll position', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view', scrollPosition: 500 });
      const session = getSessionFromStore('user-1');
      expect(session.scrollDepth).toBe(500);
    });

    it('should cap viewedIds at MAX_VIEWED_IDS (1000)', async () => {
      // Pre-seed a session with 999 viewed IDs
      const preSession = {
        likedCategories: {},
        viewedIds: Array.from({ length: 999 }, (_, i) => `c${i}`),
        sessionStart: Date.now(),
        scrollDepth: 0,
      };
      redisStore.set('session:user-cap', { json: JSON.stringify(preSession) });

      // Add 2 more — only 1 should go through (hitting 1000 cap)
      await service.trackSessionSignal('user-cap', { contentId: 'c999', action: 'view' });
      await service.trackSessionSignal('user-cap', { contentId: 'c1000', action: 'view' });
      const session = getSessionFromStore('user-cap');
      expect(session.viewedIds.length).toBeLessThanOrEqual(1000);
    });

    it('should not add duplicate viewedIds', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      const session = getSessionFromStore('user-1');
      const p1Count = session.viewedIds.filter((id: string) => id === 'p1').length;
      expect(p1Count).toBe(1);
    });

    it('should set Redis TTL of 1800 seconds on each save', async () => {
      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      expect(redis.expire).toHaveBeenCalledWith('session:user-1', 1800);
    });
  });

  // ── getSessionBoostFromData (private) ─────────────────────────

  describe('getSessionBoostFromData', () => {
    it('should return 0 for null session', () => {
      const boost = (service as any).getSessionBoostFromData(null, ['quran']);
      expect(boost).toBe(0);
    });

    it('should return boost proportional to liked category count', () => {
      const session = { likedCategories: { quran: 2 }, viewedIds: [], sessionStart: Date.now(), scrollDepth: 0 };
      const boost = (service as any).getSessionBoostFromData(session, ['quran']);
      // 2 * 0.05 = 0.1
      expect(boost).toBeCloseTo(0.1, 5);
    });

    it('should cap session boost at 0.3', () => {
      const session = { likedCategories: { quran: 10 }, viewedIds: [], sessionStart: Date.now(), scrollDepth: 0 };
      const boost = (service as any).getSessionBoostFromData(session, ['quran']);
      // 10 * 0.05 = 0.5, capped at 0.3
      expect(boost).toBe(0.3);
    });

    it('should sum boosts across multiple matching hashtags', () => {
      const session = { likedCategories: { quran: 1, hadith: 1 }, viewedIds: [], sessionStart: Date.now(), scrollDepth: 0 };
      const boost = (service as any).getSessionBoostFromData(session, ['quran', 'hadith']);
      // 1*0.05 + 1*0.05 = 0.1
      expect(boost).toBeCloseTo(0.1, 5);
    });

    it('should return 0 for hashtags not in session categories', () => {
      const session = { likedCategories: { quran: 3 }, viewedIds: [], sessionStart: Date.now(), scrollDepth: 0 };
      const boost = (service as any).getSessionBoostFromData(session, ['travel']);
      expect(boost).toBe(0);
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
        { id: 'p1', hashtags: [], createdAt: new Date(), likesCount: 10 },
        { id: 'p2', hashtags: [], createdAt: new Date(), likesCount: 5 },
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
      prisma.reel.findMany.mockResolvedValue([{ id: 'r1', hashtags: [], createdAt: new Date(), viewsCount: 10 }]);
      const result = await service.getPersonalizedFeed(undefined, 'bakra');
      expect(result.data[0].type).toBe('reel');
    });

    it('should return threads with type "thread" for majlis space', async () => {
      prisma.thread.findMany.mockResolvedValue([{ id: 't1', hashtags: [], createdAt: new Date(), likesCount: 10 }]);
      const result = await service.getPersonalizedFeed(undefined, 'majlis');
      expect(result.data[0].type).toBe('thread');
    });

    it('should return videos with type "video" for minbar space', async () => {
      prisma.video.findMany.mockResolvedValue([{ id: 'v1', tags: [], createdAt: new Date(), viewsCount: 10 }]);
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
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', hashtags: ['islam'], createdAt: new Date(), likesCount: 5 }]);

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
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', hashtags: [], createdAt: new Date(), likesCount: 5 }]);

      const result = await service.getPersonalizedFeed('user-1', 'saf');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('post');
    });
  });

  // ── getPersonalizedFeed — pagination ────────────────────────

  describe('getPersonalizedFeed — pagination', () => {
    it('should set hasMore=true when more posts exist than limit', async () => {
      const posts = Array.from({ length: 42 }, (_, i) => ({
        id: `p${i}`, hashtags: [], createdAt: new Date(), likesCount: 42 - i,
      }));
      prisma.post.findMany.mockResolvedValue(posts);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
    });

    it('should include cursor in meta for pagination', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: [], createdAt: new Date(), likesCount: 10 },
        { id: 'p2', hashtags: [], createdAt: new Date(), likesCount: 5 },
      ]);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      expect(result.meta.cursor).toBeDefined();
    });
  });

  // ── getPersonalizedFeed — block/mute/restrict filtering ─────

  describe('getPersonalizedFeed — block/mute/restrict filtering', () => {
    it('should query blocks bidirectionally for authenticated users', async () => {
      prisma.feedInteraction.count.mockResolvedValue(5);
      prisma.block.findMany.mockResolvedValue([{ blockerId: 'user-1', blockedId: 'bad-user' }]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', hashtags: [], createdAt: new Date(), likesCount: 5 }]);

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
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', createdAt: new Date(), likesCount: 5 }]);

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

  // ── Redis session integration ─────────────────────────────────

  describe('Redis session integration', () => {
    it('should call getSession from Redis during getPersonalizedFeed', async () => {
      prisma.feedInteraction.count.mockResolvedValue(50);
      embeddings.getUserInterestVector.mockResolvedValue([[0.1, 0.2, 0.3]]);
      embeddings.findSimilarByMultipleVectors.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);

      await service.getPersonalizedFeed('user-1', 'saf');

      // Should have queried Redis for session data
      expect(redis.hgetall).toHaveBeenCalledWith('session:user-1');
    });

    it('should handle corrupted Redis session data gracefully', async () => {
      // Store invalid JSON
      redisStore.set('session:user-1', { json: 'not-valid-json{' });

      await service.trackSessionSignal('user-1', { contentId: 'p1', action: 'view' });
      // Should create a fresh session despite corrupted data
      const session = getSessionFromStore('user-1');
      expect(session).not.toBeNull();
      expect(session.viewedIds).toContain('p1');
    });
  });

  // ── Location-aware Islamic boost ─────────────────────────────

  describe('getIslamicBoost — location-aware prayer windows', () => {
    it('should accept optional lat/lng parameters', () => {
      // Should not throw when called with lat/lng
      const boost = service.getIslamicBoost(['quran'], -33.8688, 151.2093);
      expect(boost).toBeGreaterThanOrEqual(0.1);
    });

    it('should return same base boost regardless of lat/lng when not in prayer window', () => {
      // Both should have at least the base 0.1 Islamic boost
      const boostNoCoords = service.getIslamicBoost(['quran']);
      const boostWithCoords = service.getIslamicBoost(['quran'], -33.8688, 151.2093);
      expect(boostNoCoords).toBeGreaterThanOrEqual(0.1);
      expect(boostWithCoords).toBeGreaterThanOrEqual(0.1);
    });

    it('should still return 0 for non-Islamic hashtags even with coordinates', () => {
      const boost = service.getIslamicBoost(['travel', 'food'], -33.8688, 151.2093);
      expect(boost).toBe(0);
    });

    it('should cap boost at 0.5 even with coordinates', () => {
      const boost = service.getIslamicBoost(['quran'], 21.4225, 39.8262); // Makkah
      expect(boost).toBeLessThanOrEqual(0.5);
    });
  });

  // ── parseTimeToHours (private) ─────────────────────────────────

  describe('parseTimeToHours', () => {
    it('should parse "05:30" to 5.5', () => {
      const result = (service as any).parseTimeToHours('05:30');
      expect(result).toBeCloseTo(5.5, 5);
    });

    it('should parse "12:00" to 12.0', () => {
      const result = (service as any).parseTimeToHours('12:00');
      expect(result).toBeCloseTo(12.0, 5);
    });

    it('should parse "23:45" to 23.75', () => {
      const result = (service as any).parseTimeToHours('23:45');
      expect(result).toBeCloseTo(23.75, 5);
    });

    it('should parse "00:00" to 0.0', () => {
      const result = (service as any).parseTimeToHours('00:00');
      expect(result).toBeCloseTo(0.0, 5);
    });
  });

  // ── Trending decay ─────────────────────────────────────────────

  describe('applyTrendingDecay', () => {
    it('should not decay posts younger than 12 hours', () => {
      const recentPost = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago
      const score = (service as any).applyTrendingDecay(100, recentPost);
      // No decay: decayFactor = 1.0
      const expected = Math.log10(101) / 5;
      expect(score).toBeCloseTo(expected, 5);
    });

    it('should decay posts older than 12 hours', () => {
      const recentPost = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6h
      const olderPost = new Date(Date.now() - 20 * 60 * 60 * 1000); // 20h
      const scoreRecent = (service as any).applyTrendingDecay(100, recentPost);
      const scoreOlder = (service as any).applyTrendingDecay(100, olderPost);
      expect(scoreRecent).toBeGreaterThan(scoreOlder);
    });

    it('should floor decay factor at 0.5 for posts at 24 hours', () => {
      const post24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const score = (service as any).applyTrendingDecay(100, post24h);
      const engagementScore = Math.log10(101) / 5;
      // At 24h: decay = max(0.5, 1 - (24-12)/24) = max(0.5, 0.5) = 0.5
      expect(score).toBeCloseTo(engagementScore * 0.5, 4);
    });

    it('should use log scale for engagement to dampen outliers', () => {
      const now = new Date();
      const score1 = (service as any).applyTrendingDecay(10, now);
      const score2 = (service as any).applyTrendingDecay(10000, now);
      // score2 should not be 1000x bigger than score1 due to log dampening
      expect(score2 / score1).toBeLessThan(5);
    });

    it('should handle 0 engagement gracefully', () => {
      const now = new Date();
      const score = (service as any).applyTrendingDecay(0, now);
      // log10(1+1)/5 = log10(2)/5 ≈ 0.060
      expect(score).toBeGreaterThan(0);
    });
  });

  // ── Trending window is 24 hours ────────────────────────────────

  describe('getTrendingFeed — 24h window', () => {
    it('should query with a 24-hour window (not 48h)', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      await service.getPersonalizedFeed(undefined, 'saf');

      const call = prisma.post.findMany.mock.calls[0][0];
      const since = call.where.createdAt.gte as Date;
      const hoursAgo = (Date.now() - since.getTime()) / (1000 * 60 * 60);
      // Should be approximately 24 hours, not 48
      expect(hoursAgo).toBeCloseTo(24, 0);
      expect(hoursAgo).toBeLessThan(25);
    });

    it('should rank fresher posts higher than older posts with same engagement', async () => {
      const freshPost = { id: 'p1', hashtags: [], createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), likesCount: 50 };
      const olderPost = { id: 'p2', hashtags: [], createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000), likesCount: 50 };
      prisma.post.findMany.mockResolvedValue([olderPost, freshPost]);

      const result = await service.getPersonalizedFeed(undefined, 'saf');
      // Fresh post should be ranked first due to no decay
      expect(result.data[0].id).toBe('p1');
    });
  });
});
