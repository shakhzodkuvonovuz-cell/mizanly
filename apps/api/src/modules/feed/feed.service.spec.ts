import { Test } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FeedService', () => {
  let service: FeedService;
  let prisma: Record<string, any>;
  let redis: Record<string, any>;
  beforeEach(async () => {
    prisma = { feedInteraction: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() }, feedDismissal: { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() }, $queryRawUnsafe: jest.fn().mockResolvedValue([]), $queryRaw: jest.fn().mockResolvedValue([]) };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({}),
      hset: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue([]),
    };
    const module = await Test.createTestingModule({ providers: [
        ...globalMockProviders,FeedService, { provide: PrismaService, useValue: prisma }, { provide: 'REDIS', useValue: redis }] }).compile();
    service = module.get(FeedService);
  });
  it('logs interaction', async () => {
    prisma.feedInteraction.upsert.mockResolvedValue({ id: 'fi1' });
    await service.logInteraction('u1', { postId: 'p1', space: 'SAF', viewed: true });
    expect(prisma.feedInteraction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_postId: { userId: 'u1', postId: 'p1' } },
    }));
  });
  it('dismisses content', async () => {
    prisma.feedDismissal.upsert.mockResolvedValue({});
    await service.dismiss('u1', 'p1', 'post');
    expect(prisma.feedDismissal.upsert).toHaveBeenCalled();
  });
  it('returns dismissed IDs', async () => {
    prisma.feedDismissal.findMany.mockResolvedValue([{ contentId: 'p1' }]);
    const ids = await service.getDismissedIds('u1', 'post');
    expect(ids).toEqual(['p1']);
  });

  describe('getNearbyContent', () => {
    beforeEach(() => {
      (prisma as any).post = {
        findMany: jest.fn(),
      };
    });

    it('should return location-tagged posts', async () => {
      const mockPosts = [
        { id: 'p1', content: 'Near me', locationName: 'Mosque Street', createdAt: new Date(), user: { id: 'u1', username: 'user1' } },
        { id: 'p2', content: 'Nearby cafe', locationName: 'Halal Cafe', createdAt: new Date(), user: { id: 'u2', username: 'user2' } },
      ];
      (prisma as any).post.findMany.mockResolvedValue(mockPosts);

      const result = await service.getNearbyContent(40.7128, -74.006, 25);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
      expect((prisma as any).post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationName: { not: null } }),
          take: 21,
        }),
      );
    });

    it('should paginate with cursor', async () => {
      // Need 21 posts so hasMore = posts.length(21) > limit(20) = true
      const twentyOnePosts = Array.from({ length: 21 }, (_, i) => ({
        id: `p${i}`,
        content: `Post ${i}`,
        locationName: `Location ${i}`,
        createdAt: new Date(Date.now() - i * 60000),
        user: { id: 'u1', username: 'user1' },
      }));
      (prisma as any).post.findMany.mockResolvedValue(twentyOnePosts);

      const result = await service.getNearbyContent(40.7128, -74.006, 25);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBeDefined();
    });

    it('should return empty data when no posts found', async () => {
      (prisma as any).post.findMany.mockResolvedValue([]);

      const result = await service.getNearbyContent(0, 0, 10);
      expect(result.data).toHaveLength(0);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('logInteraction — update existing', () => {
    it('should upsert with only defined update fields', async () => {
      prisma.feedInteraction.upsert.mockResolvedValue({ id: 'fi-existing', liked: true });
      await service.logInteraction('u1', { postId: 'p1', space: 'SAF', liked: true });
      expect(prisma.feedInteraction.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId_postId: { userId: 'u1', postId: 'p1' } },
        update: { liked: true },
      }));
    });
  });

  describe('undismiss', () => {
    it('should undismiss content', async () => {
      prisma.feedDismissal.delete = jest.fn().mockResolvedValue({});
      const result = await service.undismiss('u1', 'p1', 'post');
      expect(result).toEqual({ undismissed: true });
    });
  });

  describe('getUserInterests', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should compute interest scores by space and hashtag', async () => {
      prisma.feedInteraction.findMany = jest.fn().mockResolvedValue([
        { space: 'SAF', viewDurationMs: 30000, liked: true, commented: false, shared: false, saved: false, postId: 'p1' },
        { space: 'SAF', viewDurationMs: 10000, liked: false, commented: true, shared: false, saved: false, postId: 'p2' },
        { space: 'MAJLIS', viewDurationMs: 5000, liked: false, commented: false, shared: true, saved: false, postId: 'p3' },
      ]);
      (prisma as any).post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: ['quran'] },
        { id: 'p2', hashtags: ['islam'] },
        { id: 'p3', hashtags: [] },
      ]);
      const result = await service.getUserInterests('u1');
      expect(result.bySpace.SAF).toBeGreaterThan(0);
      expect(result.bySpace.MAJLIS).toBeGreaterThan(0);
      expect(result.byHashtag.quran).toBeGreaterThan(0);
    });

    it('should return empty scores for no interactions', async () => {
      prisma.feedInteraction.findMany = jest.fn().mockResolvedValue([]);
      const result = await service.getUserInterests('u1');
      expect(result.bySpace).toEqual({});
      expect(result.byHashtag).toEqual({});
    });
  });

  describe('getContentFilter', () => {
    beforeEach(() => {
      (prisma as any).contentFilterSetting = { findUnique: jest.fn() };
    });

    it('should return content filter settings', async () => {
      (prisma as any).contentFilterSetting.findUnique.mockResolvedValue({ userId: 'u1', hideMusic: true, strictnessLevel: 'strict' });
      const result = await service.getContentFilter('u1');
      expect(result.hideMusic).toBe(true);
    });

    it('should return null when no settings', async () => {
      (prisma as any).contentFilterSetting.findUnique.mockResolvedValue(null);
      const result = await service.getContentFilter('u1');
      expect(result).toBeNull();
    });
  });

  describe('featurePost', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn(), update: jest.fn() };
      (prisma as any).user = { findUnique: jest.fn(), findMany: jest.fn() };
    });

    it('should feature a post when admin', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      (prisma as any).post.update.mockResolvedValue({ id: 'p1', isFeatured: true, featuredAt: new Date() });
      const result = await service.featurePost('p1', true, 'admin-1');
      expect(result.isFeatured).toBe(true);
    });

    it('should unfeature a post when admin', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      (prisma as any).post.update.mockResolvedValue({ id: 'p1', isFeatured: false, featuredAt: null });
      const result = await service.featurePost('p1', false, 'admin-1');
      expect(result.isFeatured).toBe(false);
    });

    it('should reject non-admin', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.featurePost('p1', true, 'user-1')).rejects.toThrow('Admin access required');
    });
  });

  describe('getUserFollowingCount', () => {
    beforeEach(() => {
      (prisma as any).follow = { count: jest.fn() };
    });

    it('should return follow count', async () => {
      (prisma as any).follow.count.mockResolvedValue(42);
      const result = await service.getUserFollowingCount('u1');
      expect(result).toBe(42);
    });
  });

  describe('getTrendingFeed — block/mute/restrict filtering', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).restrict = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).contentFilterSetting = { findUnique: jest.fn().mockResolvedValue(null) };
      prisma.feedDismissal = { ...prisma.feedDismissal, findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should filter blocked/muted/restricted users when authenticated', async () => {
      (prisma as any).block.findMany.mockResolvedValue([
        { blockerId: 'u1', blockedId: 'bad-user' },
      ]);
      (prisma as any).mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      (prisma as any).restrict.findMany.mockResolvedValue([{ restrictedId: 'restricted-user' }]);

      await service.getTrendingFeed(undefined, 20, 'u1');

      expect((prisma as any).block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: 'u1' }, { blockedId: 'u1' }] },
        }),
      );
      expect((prisma as any).restrict.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restricterId: 'u1' },
        }),
      );
      expect((prisma as any).post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.objectContaining({
              id: { notIn: expect.arrayContaining(['bad-user', 'muted-user', 'restricted-user']) },
            }),
          }),
        }),
      );
    });

    it('should not filter when no userId', async () => {
      await service.getTrendingFeed(undefined, 20);
      expect((prisma as any).block.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFeaturedFeed — block/mute/restrict + scheduledAt', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).restrict = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.feedDismissal = { ...prisma.feedDismissal, findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should include scheduledAt OR filter and filter blocked users when authenticated', async () => {
      (prisma as any).block.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'blocked1' }]);
      (prisma as any).mute.findMany.mockResolvedValue([]);
      (prisma as any).restrict.findMany.mockResolvedValue([]);

      await service.getFeaturedFeed(undefined, 20, 'u1');

      expect((prisma as any).post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ scheduledAt: null }),
            ]),
            user: expect.objectContaining({
              id: { notIn: ['blocked1'] },
            }),
          }),
        }),
      );
    });
  });

  describe('featurePost — admin guard', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn(), update: jest.fn() };
      (prisma as any).user = { findUnique: jest.fn(), findMany: jest.fn() };
    });

    it('should allow admin to feature a post', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      (prisma as any).post.update.mockResolvedValue({ id: 'p1', isFeatured: true, featuredAt: new Date() });

      const result = await service.featurePost('p1', true, 'admin-user');
      expect(result.isFeatured).toBe(true);
    });

    it('should reject non-admin users', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.featurePost('p1', true, 'regular-user')).rejects.toThrow('Admin access required');
      expect((prisma as any).post.update).not.toHaveBeenCalled();
    });
  });

  describe('getSuggestedUsers — block/mute/restrict filtering', () => {
    beforeEach(() => {
      (prisma as any).user = { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() };
      (prisma as any).follow = { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).restrict = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should exclude blocked/muted/restricted users from suggestions', async () => {
      (prisma as any).block.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'bad1' }]);
      (prisma as any).mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      (prisma as any).restrict.findMany.mockResolvedValue([{ restrictedId: 'restricted1' }]);
      (prisma as any).follow.findMany.mockResolvedValue([]);

      await service.getSuggestedUsers('u1', 5);

      expect((prisma as any).user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: expect.arrayContaining(['u1', 'bad1', 'muted1', 'restricted1']) },
          }),
        }),
      );
    });
  });

  describe('getFrequentCreators — block/mute/restrict filtering', () => {
    beforeEach(() => {
      (prisma as any).feedInteraction = {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      };
      (prisma as any).user = { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).restrict = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should exclude blocked creators from frequent list', async () => {
      // Mock interactions with a blocked creator
      (prisma as any).feedInteraction.findMany.mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          post: { userId: 'blocked-creator' },
        })),
      );
      (prisma as any).block.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'blocked-creator' }]);
      (prisma as any).mute.findMany.mockResolvedValue([]);

      const result = await service.getFrequentCreators('u1');
      expect(result).toEqual([]);
    });
  });

  describe('getTrendingFeed — cursor-based pagination', () => {
    const makePost = (id: string, likes: number, comments: number, shares: number, saves: number, minutesAgo: number): Record<string, unknown> => ({
      id,
      postType: 'IMAGE',
      content: `Post ${id}`,
      visibility: 'PUBLIC',
      mediaUrls: [],
      mediaTypes: [],
      thumbnailUrl: null,
      mediaWidth: null,
      mediaHeight: null,
      hashtags: [],
      mentions: [],
      locationName: null,
      likesCount: likes,
      commentsCount: comments,
      sharesCount: shares,
      savesCount: saves,
      viewsCount: 0,
      hideLikesCount: false,
      commentsDisabled: false,
      isSensitive: false,
      isFeatured: false,
      blurhash: null,
      isRemoved: false,
      createdAt: new Date(Date.now() - minutesAgo * 60000),
      updatedAt: new Date(),
      user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
      circle: null,
    });

    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).restrict = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).contentFilterSetting = { findUnique: jest.fn().mockResolvedValue(null) };
      prisma.feedDismissal = { ...prisma.feedDismissal, findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should return keyset cursor (score:id:ts) instead of offset', async () => {
      const posts = [
        makePost('p1', 100, 50, 20, 10, 60),  // High engagement, 1hr old
        makePost('p2', 10, 5, 2, 1, 30),       // Lower engagement, 30min old
        makePost('p3', 5, 2, 1, 0, 120),       // Low engagement, 2hr old
      ];
      (prisma as any).post.findMany.mockResolvedValue(posts);

      const result = await service.getTrendingFeed(undefined, 2);

      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(2);
      // Cursor should be score:id:timestamp format
      expect(result.meta.cursor).toMatch(/^[\d.]+:.+:\d+$/);
    });

    it('should paginate using score:id cursor without refetching previous items', async () => {
      const posts = [
        makePost('p1', 100, 50, 20, 10, 60),
        makePost('p2', 50, 25, 10, 5, 120),
        makePost('p3', 10, 5, 2, 1, 30),
      ];
      (prisma as any).post.findMany.mockResolvedValue(posts);

      // Get first page
      const page1 = await service.getTrendingFeed(undefined, 2);
      expect(page1.data).toHaveLength(2);
      expect(page1.meta.cursor).toBeDefined();

      // Get second page using cursor
      const page2 = await service.getTrendingFeed(page1.meta.cursor, 2);
      expect(page2.data).toHaveLength(1);
      expect(page2.meta.hasMore).toBe(false);

      // No duplicate items between pages
      const page1Ids = page1.data.map((p: any) => p.id);
      const page2Ids = page2.data.map((p: any) => p.id);
      expect(page1Ids.filter((id: string) => page2Ids.includes(id))).toHaveLength(0);
    });

    it('should return empty result for cursor past end', async () => {
      (prisma as any).post.findMany.mockResolvedValue([
        makePost('p1', 10, 5, 2, 1, 60),
      ]);

      // Use a very low score cursor to skip all items
      const result = await service.getTrendingFeed('0.00001:zzz:1711180800000', 20);
      expect(result.data).toHaveLength(0);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getTrendingFeed — Redis cache', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).restrict = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).contentFilterSetting = { findUnique: jest.fn().mockResolvedValue(null) };
      prisma.feedDismissal = { ...prisma.feedDismissal, findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should return cached result for unauthenticated requests', async () => {
      const cachedResult = { data: [{ id: 'cached-1' }], meta: { hasMore: false } };
      redis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await service.getTrendingFeed(undefined, 20);
      expect(result).toEqual(cachedResult);
      expect((prisma as any).post.findMany).not.toHaveBeenCalled();
    });

    it('should write to cache after computing trending feed for unauthenticated users', async () => {
      redis.get.mockResolvedValue(null);
      (prisma as any).post.findMany.mockResolvedValue([]);

      await service.getTrendingFeed(undefined, 20);

      expect(redis.set).toHaveBeenCalledWith(
        'trending_feed:first:20',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should NOT cache trending feed for authenticated users', async () => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).restrict = { findMany: jest.fn().mockResolvedValue([]) };

      await service.getTrendingFeed(undefined, 20, 'u1');

      // redis.get may be called for excluded_users cache, but NOT for trending cache key
      const getCalls = redis.get.mock.calls.map((c: string[]) => c[0]);
      const trendingCacheCall = getCalls.find((key: string) => key.startsWith('trending_feed:'));
      expect(trendingCacheCall).toBeUndefined();
    });

    it('should include cursor in cache key', async () => {
      redis.get.mockResolvedValue(null);
      (prisma as any).post.findMany.mockResolvedValue([]);

      await service.getTrendingFeed('5.5:p1:1711180800000', 20);

      expect(redis.get).toHaveBeenCalledWith('trending_feed:5.5:p1:1711180800000:20');
      expect(redis.set).toHaveBeenCalledWith(
        'trending_feed:5.5:p1:1711180800000:20',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should fall through to recompute on corrupted cache', async () => {
      redis.get.mockResolvedValue('not-valid-json{');
      (prisma as any).post.findMany.mockResolvedValue([]);

      const result = await service.getTrendingFeed(undefined, 20);
      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
      expect((prisma as any).post.findMany).toHaveBeenCalled();
    });
  });
});