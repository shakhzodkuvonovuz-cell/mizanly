import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { PostVisibility, ReelStatus } from '@prisma/client';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let prisma: any;
  let mockEmbeddingsService: any;

  beforeEach(async () => {
    mockEmbeddingsService = {
      getUserInterestVector: jest.fn().mockResolvedValue(null),
      findSimilarByVector: jest.fn().mockResolvedValue([]),
      findSimilarByMultipleVectors: jest.fn().mockResolvedValue([]),
      generateEmbedding: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        RecommendationsService,
        { provide: EmbeddingsService, useValue: mockEmbeddingsService },
        {
          provide: PrismaService,
          useValue: {
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn().mockResolvedValue([]) },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            post: { findMany: jest.fn().mockResolvedValue([]) },
            reel: { findMany: jest.fn().mockResolvedValue([]) },
            channel: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findMany: jest.fn().mockResolvedValue([]) },
            feedInteraction: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── suggestedPeople ─────────────────────────────────────────

  describe('suggestedPeople', () => {
    it('should return popular users sorted by followersCount when no userId', async () => {
      const mockUsers = [
        { id: 'user1', username: 'user1', displayName: 'User One', avatarUrl: 'url1', isVerified: true, bio: 'bio', followersCount: 100 },
        { id: 'user2', username: 'user2', displayName: 'User Two', avatarUrl: 'url2', isVerified: false, bio: 'bio', followersCount: 50 },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.suggestedPeople(undefined, 20);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { isDeactivated: false, isPrivate: false },
        orderBy: { followersCount: 'desc' },
        take: 20,
      }));
      expect(result).toEqual([
        { ...mockUsers[0], mutualFollowers: 0 },
        { ...mockUsers[1], mutualFollowers: 0 },
      ]);
    });

    it('should add mutualFollowers:0 to each user when unauthenticated', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'u1', displayName: 'U1', avatarUrl: '', isVerified: false, bio: '', followersCount: 10 },
      ]);

      const result = await service.suggestedPeople(undefined, 5);
      expect(result[0].mutualFollowers).toBe(0);
    });

    it('should use friends-of-friends algorithm for authenticated users', async () => {
      const userId = 'user123';
      prisma.block.findMany.mockResolvedValue([{ blockerId: userId, blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      // First follow call: myFollowing
      prisma.follow.findMany.mockResolvedValueOnce([
        { followingId: 'followed1' },
        { followingId: 'followed2' },
      ]);
      // Second follow call: friends-of-friends
      prisma.follow.findMany.mockResolvedValueOnce([
        { followingId: 'suggested1' },
        { followingId: 'suggested1' },
        { followingId: 'suggested2' },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'suggested1', username: 's1', displayName: 'S1', avatarUrl: '', isVerified: false, bio: '' },
        { id: 'suggested2', username: 's2', displayName: 'S2', avatarUrl: '', isVerified: false, bio: '' },
      ]);

      const result = await service.suggestedPeople(userId, 20);

      // suggested1 has 2 mutual connections, suggested2 has 1
      expect(result[0].mutualFollowers).toBe(2);
      expect(result[1].mutualFollowers).toBe(1);
    });

    it('should exclude blocked and muted users bidirectionally', async () => {
      const userId = 'user123';
      prisma.block.findMany.mockResolvedValue([{ blockerId: userId, blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      prisma.follow.findMany.mockResolvedValueOnce([]); // myFollowing
      prisma.follow.findMany.mockResolvedValueOnce([]); // fofFollows
      prisma.user.findMany.mockResolvedValue([]);

      await service.suggestedPeople(userId, 20);

      expect(prisma.block.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }));
      expect(prisma.mute.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId },
        select: { mutedId: true },
      }));
    });

    it('should return empty array when user has no following and no fof suggestions', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.follow.findMany.mockResolvedValueOnce([]); // myFollowing
      prisma.follow.findMany.mockResolvedValueOnce([]); // fofFollows
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.suggestedPeople('user123', 20);
      expect(result).toEqual([]);
    });
  });

  // ── suggestedPosts ──────────────────────────────────────────

  describe('suggestedPosts', () => {
    it('should return high-engagement posts from last 48 hours', async () => {
      const mockPosts = [
        {
          id: 'post1', postType: 'TEXT', content: 'Hello', visibility: PostVisibility.PUBLIC,
          mediaUrls: [], mediaTypes: [], likesCount: 10, commentsCount: 5, sharesCount: 2,
          createdAt: new Date(), user: { id: 'user1', username: 'user1' },
        },
      ];
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.suggestedPosts(undefined, 20);

      // mainCount = 20 - ceil(20*0.15) = 20 - 3 = 17
      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          isRemoved: false,
          visibility: PostVisibility.PUBLIC,
          OR: expect.arrayContaining([expect.objectContaining({ scheduledAt: null })]),
          createdAt: { gte: expect.any(Date) },
        }),
        orderBy: [
          { likesCount: 'desc' },
          { commentsCount: 'desc' },
          { sharesCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 17,
      }));
      // Result includes main posts (exploration returns [] from mock)
      expect(result).toEqual(mockPosts);
    });

    it('should exclude blocked and muted users when userId provided', async () => {
      const userId = 'user123';
      prisma.block.findMany.mockResolvedValue([{ blockerId: userId, blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.suggestedPosts(userId, 20);

      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: userId },
          user: { id: { notIn: ['blocked1', 'muted1'] }, isDeactivated: false, isPrivate: false },
        }),
      }));
    });

    it('should return empty array when no posts found', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.suggestedPosts(undefined, 20);
      expect(result).toEqual([]);
    });

    it('should exclude own posts when authenticated', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.suggestedPosts('me', 20);

      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: 'me' },
        }),
      }));
    });

    it('should attempt pgvector ranking before fallback for authenticated users', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.suggestedPosts('user1', 20);

      // Should try to get user interest vector (part of multiStageRank)
      expect(mockEmbeddingsService.getUserInterestVector).toHaveBeenCalledWith('user1');
    });

    it('should fall back to engagement sort when pgvector returns no results', async () => {
      const userId = 'user1';
      mockEmbeddingsService.getUserInterestVector.mockResolvedValue(null);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1' }]);

      const result = await service.suggestedPosts(userId, 20);

      // Falls back because getUserInterestVector returns null; includes main + exploration (empty)
      expect(result).toEqual([{ id: 'p1' }]);
    });

    it('should reserve 15% of slots for exploration and use mainCount for primary query', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      await service.suggestedPosts(undefined, 20);

      // First call is the main query, mainCount = 20 - ceil(20*0.15) = 17
      const mainCall = prisma.post.findMany.mock.calls[0][0];
      expect(mainCall.take).toBe(17);

      // Second call is exploration query
      const explorationCall = prisma.post.findMany.mock.calls[1][0];
      expect(explorationCall.take).toBe(3); // ceil(20 * 0.15) = 3
      expect(explorationCall.where.viewsCount).toEqual({ lt: 100 });
      expect(explorationCall.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('should query exploration posts with <100 views and <6 hours old', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      await service.suggestedPosts(undefined, 20);

      // Second call is the exploration query
      const explorationCall = prisma.post.findMany.mock.calls[1][0];
      expect(explorationCall.where.viewsCount).toEqual({ lt: 100 });
      expect(explorationCall.where.isRemoved).toBe(false);
      expect(explorationCall.where.visibility).toBe(PostVisibility.PUBLIC);
      expect(explorationCall.orderBy).toEqual({ createdAt: 'desc' });

      // Verify the freshCutoff is approximately 6 hours ago
      const cutoff = explorationCall.where.createdAt.gte as Date;
      const ageHours = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60);
      expect(ageHours).toBeGreaterThan(5.9);
      expect(ageHours).toBeLessThan(6.1);
    });

    it('should interleave exploration posts at every ~7th position', async () => {
      const mainPosts = Array.from({ length: 17 }, (_, i) => ({ id: `main-${i}` }));
      const explorationPosts = [{ id: 'explore-0' }, { id: 'explore-1' }, { id: 'explore-2' }];

      prisma.post.findMany
        .mockResolvedValueOnce(mainPosts) // main query
        .mockResolvedValueOnce(explorationPosts); // exploration query

      const result = await service.suggestedPosts(undefined, 20);

      // Total = 17 main + 3 exploration = 20
      expect(result.length).toBe(20);
      // explore-0 inserted at min((0+1)*7, 17) = 7
      expect(result[7]).toEqual({ id: 'explore-0' });
      // explore-1 inserted at min((1+1)*7, 18) = 14
      expect(result[14]).toEqual({ id: 'explore-1' });
      // explore-2 inserted at min((2+1)*7, 19) = 19
      expect(result[19]).toEqual({ id: 'explore-2' });
    });

    it('should not duplicate exploration posts already in main results', async () => {
      const mainPosts = [{ id: 'shared-id' }, { id: 'main-1' }];
      const explorationPosts = [{ id: 'shared-id' }, { id: 'explore-unique' }];

      prisma.post.findMany
        .mockResolvedValueOnce(mainPosts)
        .mockResolvedValueOnce(explorationPosts);

      const result = await service.suggestedPosts(undefined, 20);

      // shared-id should only appear once
      const sharedCount = result.filter((p: any) => p.id === 'shared-id').length;
      expect(sharedCount).toBe(1);
      // explore-unique should be present
      expect(result.some((p: any) => p.id === 'explore-unique')).toBe(true);
    });
  });

  // ── suggestedReels ──────────────────────────────────────────

  describe('suggestedReels', () => {
    it('should return engagement-ranked reels with correct ordering', async () => {
      const mockReels = [
        {
          id: 'reel1', videoUrl: 'url', thumbnailUrl: 'thumb', duration: 15, caption: 'test',
          status: ReelStatus.READY, likesCount: 100, commentsCount: 20, sharesCount: 5,
          viewsCount: 1000, createdAt: new Date(), user: { id: 'user1', username: 'user1' },
        },
      ];
      prisma.reel.findMany.mockResolvedValue(mockReels);

      const result = await service.suggestedReels(undefined, 20);

      // mainCount = 20 - ceil(20*0.15) = 17
      expect(prisma.reel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          isRemoved: false,
          status: ReelStatus.READY,
          OR: expect.arrayContaining([expect.objectContaining({ scheduledAt: null })]),
          createdAt: { gte: expect.any(Date) },
        }),
        orderBy: [
          { viewsCount: 'desc' },
          { likesCount: 'desc' },
          { commentsCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 17,
      }));
      expect(result).toEqual(mockReels);
    });

    it('should exclude blocked and muted users when userId provided', async () => {
      const userId = 'user123';
      prisma.block.findMany.mockResolvedValue([{ blockerId: userId, blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      prisma.reel.findMany.mockResolvedValue([]);

      await service.suggestedReels(userId, 20);

      expect(prisma.reel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: userId },
          user: { id: { notIn: ['blocked1', 'muted1'] }, isDeactivated: false, isPrivate: false },
        }),
      }));
    });

    it('should return empty array when no reels found', async () => {
      prisma.reel.findMany.mockResolvedValue([]);
      const result = await service.suggestedReels(undefined, 20);
      expect(result).toEqual([]);
    });

    it('should use 72-hour window for reel freshness', async () => {
      prisma.reel.findMany.mockResolvedValue([]);
      await service.suggestedReels(undefined, 20);

      const callArgs = prisma.reel.findMany.mock.calls[0][0];
      const gteDate = callArgs.where.createdAt.gte;
      const ageMs = Date.now() - gteDate.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      // Should be approximately 72 hours (with small tolerance for test execution time)
      expect(ageHours).toBeGreaterThan(71.9);
      expect(ageHours).toBeLessThan(72.1);
    });

    it('should reserve 15% of slots for reel exploration', async () => {
      prisma.reel.findMany.mockResolvedValue([]);
      await service.suggestedReels(undefined, 20);

      // First call is the main reel query, mainCount = 17
      const mainCall = prisma.reel.findMany.mock.calls[0][0];
      expect(mainCall.take).toBe(17);

      // Second call is exploration reel query
      const explorationCall = prisma.reel.findMany.mock.calls[1][0];
      expect(explorationCall.take).toBe(3);
      expect(explorationCall.where.viewsCount).toEqual({ lt: 100 });
      expect(explorationCall.where.status).toBe(ReelStatus.READY);
    });
  });

  // ── suggestedChannels ───────────────────────────────────────

  describe('suggestedChannels', () => {
    it('should return channels sorted by subscribers then views', async () => {
      const mockChannels = [
        {
          id: 'channel1', userId: 'user1', handle: 'c1', name: 'Channel One',
          subscribersCount: 5000, totalViews: 100000, user: { id: 'user1', username: 'user1' },
        },
      ];
      prisma.channel.findMany.mockResolvedValue(mockChannels);

      const result = await service.suggestedChannels(undefined, 20);

      expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { user: { isDeactivated: false } },
        orderBy: [
          { subscribersCount: 'desc' },
          { totalViews: 'desc' },
        ],
        take: 20,
      }));
      expect(result).toEqual(mockChannels);
    });

    it('should exclude own channel and blocked/muted users when userId provided', async () => {
      const userId = 'user123';
      prisma.block.findMany.mockResolvedValue([{ blockerId: userId, blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      prisma.channel.findMany.mockResolvedValue([]);

      await service.suggestedChannels(userId, 20);

      expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: userId },
          user: { id: { notIn: ['blocked1', 'muted1'] }, isDeactivated: false },
        }),
      }));
    });

    it('should return empty array when no channels found', async () => {
      prisma.channel.findMany.mockResolvedValue([]);
      const result = await service.suggestedChannels(undefined, 20);
      expect(result).toEqual([]);
    });

    it('should not filter by isPrivate for channels (channels are public)', async () => {
      prisma.channel.findMany.mockResolvedValue([]);
      await service.suggestedChannels(undefined, 20);

      const callArgs = prisma.channel.findMany.mock.calls[0][0];
      // Channel where clause should only check isDeactivated, not isPrivate
      expect(callArgs.where.user).toEqual({ isDeactivated: false });
    });
  });

  // ── suggestedThreads ────────────────────────────────────────

  describe('suggestedThreads', () => {
    it('should return threads for unauthenticated users using engagement fallback', async () => {
      const mockThreads = [
        { id: 't1', content: 'thread', likesCount: 50, repliesCount: 10, createdAt: new Date() },
      ];
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.suggestedThreads(undefined, 20);

      // mainCount = 20 - ceil(20*0.15) = 17
      expect(prisma.thread.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          isRemoved: false,
          visibility: 'PUBLIC',
          isChainHead: true,
          user: { isDeactivated: false },
          createdAt: { gte: expect.any(Date) },
        }),
        orderBy: [
          { likesCount: 'desc' },
          { repliesCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 17,
      }));
      expect(result).toEqual(mockThreads);
    });

    it('should attempt pgvector ranking for authenticated users', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);

      await service.suggestedThreads('user1', 20);

      expect(mockEmbeddingsService.getUserInterestVector).toHaveBeenCalledWith('user1');
    });

    it('should fall back to engagement sort when no interest vector exists', async () => {
      mockEmbeddingsService.getUserInterestVector.mockResolvedValue(null);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      const mockThreads = [{ id: 't1', content: 'fallback thread' }];
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.suggestedThreads('user1', 20);

      expect(result).toEqual(mockThreads);
    });

    it('should return empty array when no threads exist', async () => {
      prisma.thread.findMany.mockResolvedValue([]);
      const result = await service.suggestedThreads(undefined, 20);
      expect(result).toEqual([]);
    });

    it('should reserve 15% of slots for thread exploration', async () => {
      prisma.thread.findMany.mockResolvedValue([]);
      await service.suggestedThreads(undefined, 20);

      // First call is the main thread query, mainCount = 17
      const mainCall = prisma.thread.findMany.mock.calls[0][0];
      expect(mainCall.take).toBe(17);

      // Second call is exploration thread query
      const explorationCall = prisma.thread.findMany.mock.calls[1][0];
      expect(explorationCall.take).toBe(3);
      expect(explorationCall.where.viewsCount).toEqual({ lt: 100 });
      expect(explorationCall.where.isChainHead).toBe(true);
    });
  });

  // ── multiStageRank (tested indirectly via public methods) ───

  describe('multiStageRank — pgvector ranking pipeline', () => {
    it('should use ranked order when pgvector returns candidates', async () => {
      const userId = 'user1';
      const interestCentroids = [[0.1, 0.2, 0.3]];
      mockEmbeddingsService.getUserInterestVector.mockResolvedValue(interestCentroids);
      mockEmbeddingsService.findSimilarByMultipleVectors.mockResolvedValue([
        { contentId: 'p1', similarity: 0.9 },
        { contentId: 'p2', similarity: 0.7 },
      ]);

      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.feedInteraction.findMany.mockResolvedValue([]);
      // Engagement scores query, author map query, hashtag map query, hydration query, exploration query
      prisma.post.findMany
        .mockResolvedValueOnce([
          { id: 'p1', likesCount: 100, commentsCount: 10, sharesCount: 5, savesCount: 3, viewsCount: 500, createdAt: new Date() },
          { id: 'p2', likesCount: 50, commentsCount: 5, sharesCount: 2, savesCount: 1, viewsCount: 200, createdAt: new Date() },
        ])
        // Author map query
        .mockResolvedValueOnce([
          { id: 'p1', userId: 'author1' },
          { id: 'p2', userId: 'author2' },
        ])
        // Hashtag map query
        .mockResolvedValueOnce([
          { id: 'p1', hashtags: ['islam', 'quran'] },
          { id: 'p2', hashtags: ['cooking', 'recipe'] },
        ])
        // Final hydration query
        .mockResolvedValueOnce([
          { id: 'p1', content: 'post 1' },
          { id: 'p2', content: 'post 2' },
        ])
        // Exploration query
        .mockResolvedValueOnce([]);

      const result = await service.suggestedPosts(userId, 20);

      // Should have called findSimilarByMultipleVectors with the interest centroids
      expect(mockEmbeddingsService.findSimilarByMultipleVectors).toHaveBeenCalledWith(
        interestCentroids, 500, expect.any(Array), expect.any(Array),
      );
      // Result should be non-empty (ranked posts)
      expect(result.length).toBeGreaterThan(0);
    });

    it('should exclude seen posts from pgvector candidates', async () => {
      const userId = 'user1';
      mockEmbeddingsService.getUserInterestVector.mockResolvedValue([[0.1, 0.2]]);
      mockEmbeddingsService.findSimilarByMultipleVectors.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.feedInteraction.findMany.mockResolvedValue([
        { postId: 'seen-1' },
        { postId: 'seen-2' },
      ]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.suggestedPosts(userId, 20);

      expect(mockEmbeddingsService.findSimilarByMultipleVectors).toHaveBeenCalledWith(
        expect.any(Array),
        500,
        expect.any(Array),
        expect.arrayContaining(['seen-1', 'seen-2']),
      );
    });

    it('should fetch hashtag map alongside author map for diversity reranking', async () => {
      const userId = 'user1';
      mockEmbeddingsService.getUserInterestVector.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockEmbeddingsService.findSimilarByMultipleVectors.mockResolvedValue([
        { contentId: 'p1', similarity: 0.9 },
        { contentId: 'p2', similarity: 0.8 },
        { contentId: 'p3', similarity: 0.7 },
      ]);

      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.feedInteraction.findMany.mockResolvedValue([]);
      prisma.post.findMany
        // Engagement scores
        .mockResolvedValueOnce([
          { id: 'p1', likesCount: 10, commentsCount: 1, sharesCount: 0, savesCount: 0, viewsCount: 100, createdAt: new Date() },
          { id: 'p2', likesCount: 10, commentsCount: 1, sharesCount: 0, savesCount: 0, viewsCount: 100, createdAt: new Date() },
          { id: 'p3', likesCount: 10, commentsCount: 1, sharesCount: 0, savesCount: 0, viewsCount: 100, createdAt: new Date() },
        ])
        // Author map
        .mockResolvedValueOnce([
          { id: 'p1', userId: 'a1' },
          { id: 'p2', userId: 'a2' },
          { id: 'p3', userId: 'a3' },
        ])
        // Hashtag map — this is the new query
        .mockResolvedValueOnce([
          { id: 'p1', hashtags: ['islam', 'quran'] },
          { id: 'p2', hashtags: ['islam', 'quran'] },
          { id: 'p3', hashtags: ['cooking'] },
        ])
        // Hydration
        .mockResolvedValueOnce([
          { id: 'p1', content: 'p1' },
          { id: 'p2', content: 'p2' },
          { id: 'p3', content: 'p3' },
        ])
        // Exploration
        .mockResolvedValueOnce([]);

      const result = await service.suggestedPosts(userId, 20);

      // Hashtag map query should have been called (3rd post.findMany call)
      expect(prisma.post.findMany).toHaveBeenCalledTimes(5);
      // The hashtag query selects id + hashtags
      const hashtagCall = prisma.post.findMany.mock.calls[2][0];
      expect(hashtagCall.select).toEqual({ id: true, hashtags: true });
      expect(result.length).toBeGreaterThan(0);
    });

    it('should defer posts with 2+ overlapping hashtags in recent window', async () => {
      const userId = 'user1';
      mockEmbeddingsService.getUserInterestVector.mockResolvedValue([[0.1, 0.2, 0.3]]);
      // 4 candidates: p1, p2, p3 share "islam"+"quran" tags, p4 is different
      mockEmbeddingsService.findSimilarByMultipleVectors.mockResolvedValue([
        { contentId: 'p1', similarity: 0.95 },
        { contentId: 'p2', similarity: 0.90 },
        { contentId: 'p3', similarity: 0.85 },
        { contentId: 'p4', similarity: 0.80 },
      ]);

      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.feedInteraction.findMany.mockResolvedValue([]);
      prisma.post.findMany
        // Engagement scores
        .mockResolvedValueOnce([
          { id: 'p1', likesCount: 10, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 100, createdAt: new Date() },
          { id: 'p2', likesCount: 10, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 100, createdAt: new Date() },
          { id: 'p3', likesCount: 10, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 100, createdAt: new Date() },
          { id: 'p4', likesCount: 10, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 100, createdAt: new Date() },
        ])
        // Author map — all different authors
        .mockResolvedValueOnce([
          { id: 'p1', userId: 'a1' },
          { id: 'p2', userId: 'a2' },
          { id: 'p3', userId: 'a3' },
          { id: 'p4', userId: 'a4' },
        ])
        // Hashtag map — p1, p2, p3 share same tags, p4 is different
        .mockResolvedValueOnce([
          { id: 'p1', hashtags: ['islam', 'quran'] },
          { id: 'p2', hashtags: ['islam', 'quran'] },
          { id: 'p3', hashtags: ['islam', 'quran'] },
          { id: 'p4', hashtags: ['cooking', 'recipe'] },
        ])
        // Hydration
        .mockResolvedValueOnce([
          { id: 'p1', content: 'p1' },
          { id: 'p2', content: 'p2' },
          { id: 'p3', content: 'p3' },
          { id: 'p4', content: 'p4' },
        ])
        // Exploration
        .mockResolvedValueOnce([]);

      const result = await service.suggestedPosts(userId, 20);

      // All 4 should still be in results (deferred, not removed)
      expect(result.length).toBe(4);
      // p4 (different hashtags) should appear before p3 (deferred due to hashtag overlap)
      const ids = result.map((r: any) => r.id);
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
      expect(ids).toContain('p3');
      expect(ids).toContain('p4');
      // p4 should appear before p3 since p3 gets deferred (islam+quran overlap >= 2 with recent)
      const p4Idx = ids.indexOf('p4');
      const p3Idx = ids.indexOf('p3');
      expect(p4Idx).toBeLessThan(p3Idx);
    });
  });

  // ── getExcludedUserIds (tested indirectly) ──────────────────

  describe('getExcludedUserIds — bidirectional blocking', () => {
    it('should include users who blocked the current user (not just users the current user blocked)', async () => {
      const userId = 'me';
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'me', blockedId: 'i-blocked-them' },
        { blockerId: 'they-blocked-me', blockedId: 'me' },
      ]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.suggestedPosts(userId, 20);

      // The where clause should exclude both directions
      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({
            id: { notIn: expect.arrayContaining(['i-blocked-them', 'they-blocked-me']) },
          }),
        }),
      }));
    });
  });

  // ── Edge cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('should respect limit parameter for suggestedPeople', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.suggestedPeople(undefined, 5);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 5,
      }));
    });

    it('should default to limit=20 when not specified for suggestedPosts', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      await service.suggestedPosts(undefined);

      // mainCount = 20 - ceil(20*0.15) = 17
      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 17,
      }));
    });

    it('should handle empty block/mute lists gracefully', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1' }]);

      const result = await service.suggestedPosts('user1', 20);

      // Should not crash, should still return posts
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});
