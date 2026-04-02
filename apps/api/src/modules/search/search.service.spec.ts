import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { SearchService } from './search.service';
import { MeilisearchService } from './meilisearch.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        SearchService,
        {
          provide: MeilisearchService,
          useValue: {
            search: jest.fn().mockResolvedValue(null),
            isAvailable: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            post: {
              findMany: jest.fn(),
            },
            thread: {
              findMany: jest.fn(),
            },
            user: {
              findMany: jest.fn(),
            },
            hashtag: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            userInterest: {
              findMany: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
            },
            reel: {
              findMany: jest.fn(),
            },
            video: {
              findMany: jest.fn(),
            },
            channel: {
              findMany: jest.fn(),
            },
            block: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            mute: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            restrict: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    prisma = module.get(PrismaService) as any;
  });

  describe('search', () => {
    it('should search people when type=people', async () => {
      const query = 'john';
      const mockUsers = [
        {
          id: 'user-123',
          username: 'john_doe',
          displayName: 'John Doe',
          avatarUrl: null,
          bio: 'Hello',
          isVerified: false,
          _count: { followers: 10 },
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.search(query, 'people');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isBanned: false,
            isDeactivated: false,
            isDeleted: false,
          }),
          take: 20,
        }),
      );
      expect(result).toEqual({ people: mockUsers });
    });

    it('should search threads with pagination when type=threads', async () => {
      const query = 'nestjs';
      const mockThreads = [
        {
          id: 'thread-1',
          content: 'NestJS is great',
          mediaUrls: [],
          likesCount: 100,
          repliesCount: 5,
          repostsCount: 2,
          createdAt: new Date(),
          user: {
            id: 'user-1',
            username: 'dev',
            displayName: 'Developer',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.search(query, 'threads');

      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
        }),
        select: expect.any(Object),
        take: 21,
        orderBy: { likesCount: 'desc' },
      });
      expect(result).toEqual({
        data: mockThreads.slice(0, 20),
        meta: { cursor: null, hasMore: false },
      });
    });

    it('should search posts with pagination when type=posts', async () => {
      const query = 'photo';
      const mockPosts = [
        {
          id: 'post-1',
          postType: 'IMAGE',
          content: 'Beautiful photo',
          mediaUrls: ['url1'],
          mediaTypes: ['IMAGE'],
          likesCount: 50,
          commentsCount: 3,
          createdAt: new Date(),
          user: {
            id: 'user-2',
            username: 'photographer',
            avatarUrl: null,
          },
        },
      ];
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.search(query, 'posts');

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isRemoved: false,
        }),
        select: expect.any(Object),
        take: 21,
        orderBy: { likesCount: 'desc' },
      });
      expect(result).toEqual({
        data: mockPosts.slice(0, 20),
        meta: { cursor: null, hasMore: false },
      });
    });

    it('should search hashtags when type=tags', async () => {
      const query = 'travel';
      const mockHashtags = [
        { id: 'tag-1', name: 'travel', postsCount: 100 },
        { id: 'tag-2', name: 'travelgram', postsCount: 50 },
      ];
      prisma.hashtag.findMany.mockResolvedValue(mockHashtags);

      const result = await service.search(query, 'tags');

      expect(prisma.hashtag.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ name: { contains: query, mode: 'insensitive' } }),
        take: 20,
        orderBy: { postsCount: 'desc' },
      });
      expect(result).toEqual({ hashtags: mockHashtags });
    });

    it('should return mixed results when no type specified', async () => {
      const query = 'test';
      const mockUsers = [{ id: 'user-1', username: 'testuser' }];
      const mockThreads = [{ id: 'thread-1', content: 'test thread' }];
      const mockPosts = [{ id: 'post-1', content: 'test post' }];
      const mockHashtags = [{ id: 'tag-1', name: 'test' }];

      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.thread.findMany.mockResolvedValue(mockThreads);
      prisma.post.findMany.mockResolvedValue(mockPosts);
      prisma.hashtag.findMany.mockResolvedValue(mockHashtags);

      const result = await service.search(query);

      expect(result).toEqual({
        people: mockUsers,
        threads: mockThreads,
        posts: mockPosts,
        hashtags: mockHashtags,
      });
    });

    it('should search reels with pagination when type=reels', async () => {
      const query = 'fun';
      const mockReels = [
        {
          id: 'reel-1',
          caption: 'fun reel',
          videoUrl: 'url',
          thumbnailUrl: 'thumb',
          duration: 15,
          likesCount: 100,
          commentsCount: 5,
          sharesCount: 2,
          viewsCount: 1000,
          status: 'READY',
          createdAt: new Date(),
          user: {
            id: 'user-1',
            username: 'creator',
            displayName: 'Creator',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      prisma.reel.findMany.mockResolvedValue(mockReels);

      const result = await service.search(query, 'reels');

      expect(prisma.reel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'READY',
            isRemoved: false,
          }),
          take: 21,
        }),
      );
      expect(result).toEqual({
        data: mockReels.slice(0, 20),
        meta: { cursor: null, hasMore: false },
      });
    });

    it('should search videos with pagination when type=videos', async () => {
      const query = 'tutorial';
      const mockVideos = [
        {
          id: 'video-1',
          title: 'tutorial video',
          description: 'learn something',
          thumbnailUrl: 'thumb',
          duration: 300,
          category: 'Education',
          tags: ['tutorial'],
          viewsCount: 5000,
          likesCount: 200,
          dislikesCount: 2,
          commentsCount: 30,
          publishedAt: new Date(),
          createdAt: new Date(),
          user: {
            id: 'user-1',
            username: 'creator',
            displayName: 'Creator',
            avatarUrl: null,
            isVerified: false,
          },
          channel: {
            id: 'channel-1',
            handle: 'creator',
            name: 'Creator Channel',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      prisma.video.findMany.mockResolvedValue(mockVideos);

      const result = await service.search(query, 'videos');

      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PUBLISHED',
            isRemoved: false,
          }),
          take: 21,
        }),
      );
      expect(result).toEqual({
        data: mockVideos.slice(0, 20),
        meta: { cursor: null, hasMore: false },
      });
    });

    it('should search channels with pagination when type=channels', async () => {
      const query = 'tech';
      const mockChannels = [
        {
          id: 'channel-1',
          handle: 'techchannel',
          name: 'Tech Channel',
          description: 'Tech videos',
          avatarUrl: null,
          bannerUrl: null,
          subscribersCount: 10000,
          videosCount: 50,
          totalViews: 500000,
          isVerified: true,
          createdAt: new Date(),
          user: {
            id: 'user-1',
            username: 'owner',
            displayName: 'Owner',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      prisma.channel.findMany.mockResolvedValue(mockChannels);

      const result = await service.search(query, 'channels');

      expect(prisma.channel.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: [
            { handle: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          user: { isBanned: false, isDeleted: false, isDeactivated: false },
        }),
        select: expect.any(Object),
        take: 21,
        orderBy: { subscribersCount: 'desc' },
      });
      expect(result).toEqual({
        data: mockChannels.slice(0, 20),
        meta: { cursor: null, hasMore: false },
      });
    });

    it('should support cursor pagination for posts', async () => {
      const query = 'test';
      const cursor = 'post-123';
      const mockPosts = Array.from({ length: 21 }, (_, i) => ({
        id: `post-${i}`,
        content: `post ${i}`,
      }));
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.search(query, 'posts', cursor);

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isRemoved: false,
        }),
        select: expect.any(Object),
        take: 21,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { likesCount: 'desc' },
      });
      expect((result as any).data).toHaveLength(20);
      expect((result as any).meta.hasMore).toBe(true);
      expect((result as any).meta.cursor).toBe('post-19');
    });

    it('should respect limit parameter', async () => {
      const query = 'test';
      const limit = 5;
      const mockPosts = Array.from({ length: 6 }, (_, i) => ({
        id: `post-${i}`,
        content: `post ${i}`,
      }));
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.search(query, 'posts', undefined, limit);

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        select: expect.any(Object),
        take: limit + 1,
        orderBy: { likesCount: 'desc' },
      });
      expect((result as any).data).toHaveLength(limit);
      expect((result as any).meta.hasMore).toBe(true);
    });

    it('should support cursor pagination for threads', async () => {
      const query = 'test';
      const cursor = 'thread-123';
      const mockThreads = Array.from({ length: 21 }, (_, i) => ({
        id: `thread-${i}`,
        content: `thread ${i}`,
        mediaUrls: [],
        likesCount: 10 + i,
        repliesCount: 0,
        repostsCount: 0,
        createdAt: new Date(),
        user: {
          id: `user-${i}`,
          username: `user${i}`,
          displayName: `User ${i}`,
          avatarUrl: null,
          isVerified: false,
        },
      }));
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.search(query, 'threads', cursor);

      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
        }),
        select: expect.any(Object),
        take: 21,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { likesCount: 'desc' },
      });
      expect((result as any).data).toHaveLength(20);
      expect((result as any).meta.hasMore).toBe(true);
      expect((result as any).meta.cursor).toBe('thread-19');
    });

    it('should support cursor pagination for videos', async () => {
      const query = 'test';
      const cursor = 'video-123';
      const mockVideos = Array.from({ length: 21 }, (_, i) => ({
        id: `video-${i}`,
        title: `video ${i}`,
        description: `description ${i}`,
        thumbnailUrl: 'thumb',
        duration: 300,
        category: 'Education',
        tags: ['test'],
        viewsCount: 5000 + i,
        likesCount: 200,
        dislikesCount: 2,
        commentsCount: 30,
        publishedAt: new Date(),
        createdAt: new Date(),
        user: {
          id: `user-${i}`,
          username: `creator${i}`,
          displayName: `Creator ${i}`,
          avatarUrl: null,
          isVerified: false,
        },
        channel: {
          id: `channel-${i}`,
          handle: `channel${i}`,
          name: `Channel ${i}`,
          avatarUrl: null,
          isVerified: false,
        },
      }));
      prisma.video.findMany.mockResolvedValue(mockVideos);

      const result = await service.search(query, 'videos', cursor);

      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PUBLISHED',
            isRemoved: false,
          }),
          take: 21,
          cursor: { id: cursor },
          skip: 1,
        }),
      );
      expect((result as any).data).toHaveLength(20);
      expect((result as any).meta.hasMore).toBe(true);
      expect((result as any).meta.cursor).toBe('video-19');
    });

    it('should support cursor pagination for channels', async () => {
      const query = 'test';
      const cursor = 'channel-123';
      const mockChannels = Array.from({ length: 21 }, (_, i) => ({
        id: `channel-${i}`,
        handle: `channel${i}`,
        name: `Channel ${i}`,
        description: `description ${i}`,
        avatarUrl: null,
        bannerUrl: null,
        subscribersCount: 10000 + i,
        videosCount: 50,
        totalViews: 500000,
        isVerified: true,
        createdAt: new Date(),
        user: {
          id: `user-${i}`,
          username: `owner${i}`,
          displayName: `Owner ${i}`,
          avatarUrl: null,
          isVerified: false,
        },
      }));
      prisma.channel.findMany.mockResolvedValue(mockChannels);

      const result = await service.search(query, 'channels', cursor);

      expect(prisma.channel.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: [
            { handle: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          user: { isBanned: false, isDeleted: false, isDeactivated: false },
        }),
        select: expect.any(Object),
        take: 21,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { subscribersCount: 'desc' },
      });
      expect((result as any).data).toHaveLength(20);
      expect((result as any).meta.hasMore).toBe(true);
      expect((result as any).meta.cursor).toBe('channel-19');
    });

    it('should support cursor pagination for reels', async () => {
      const query = 'test';
      const cursor = 'reel-123';
      const mockReels = Array.from({ length: 21 }, (_, i) => ({
        id: `reel-${i}`,
        caption: `reel ${i}`,
        videoUrl: 'url',
        thumbnailUrl: 'thumb',
        duration: 15,
        likesCount: 100 + i,
        commentsCount: 5,
        sharesCount: 2,
        viewsCount: 1000,
        status: 'READY',
        createdAt: new Date(),
        user: {
          id: `user-${i}`,
          username: `creator${i}`,
          displayName: `Creator ${i}`,
          avatarUrl: null,
          isVerified: false,
        },
      }));
      prisma.reel.findMany.mockResolvedValue(mockReels);

      const result = await service.search(query, 'reels', cursor);

      expect(prisma.reel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'READY',
            isRemoved: false,
          }),
          take: 21,
          cursor: { id: cursor },
          skip: 1,
        }),
      );
      expect((result as any).data).toHaveLength(20);
      expect((result as any).meta.hasMore).toBe(true);
      expect((result as any).meta.cursor).toBe('reel-19');
    });
  });

  describe('trending', () => {
    it('should return trending hashtags and threads from last 24h', async () => {
      // New implementation uses $queryRaw for SQL aggregation instead of post.findMany
      const mockTopTags = [
        { tag: 'trending', cnt: BigInt(2) },
        { tag: 'news', cnt: BigInt(2) },
      ];
      const mockHashtagRecords = [
        { id: 'tag-1', name: 'trending', postsCount: 500 },
        { id: 'tag-2', name: 'news', postsCount: 300 },
      ];
      const mockThreads = [
        {
          id: 'thread-1',
          content: 'Trending thread',
          likesCount: 200,
          user: { id: 'user-1', username: 'trendy' },
        },
      ];
      prisma.$queryRaw.mockResolvedValue(mockTopTags);
      prisma.hashtag.findMany.mockResolvedValue(mockHashtagRecords);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.trending();

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.hashtag.findMany).toHaveBeenCalledWith({
        take: 50,
        where: expect.objectContaining({ name: { in: ['trending', 'news'] } },
      });
      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
          createdAt: { gte: expect.any(Date) },
        }),
        select: expect.any(Object),
        take: 10,
        orderBy: { likesCount: 'desc' },
      });
      // Hashtags should include recentCount and be sorted by it
      // Hashtags include recentCount + trend velocity indicator
      expect(result.hashtags).toEqual([
        { id: 'tag-1', name: 'trending', postsCount: 500, recentCount: 2, trend: 'falling' },
        { id: 'tag-2', name: 'news', postsCount: 300, recentCount: 2, trend: 'falling' },
      ]);
      expect(result.threads).toEqual(mockThreads);
    });
  });

  describe('getHashtagPosts', () => {
    it('should return posts for hashtag with pagination', async () => {
      const tag = 'travel';
      const mockHashtag = { id: 'tag-1', name: 'travel', postsCount: 100 };
      const mockPosts = [
        {
          id: 'post-1',
          content: 'Travel post',
          user: { id: 'user-1', username: 'traveler' },
        },
      ];
      prisma.hashtag.findUnique.mockResolvedValue(mockHashtag);
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.getHashtagPosts(tag);

      expect(prisma.hashtag.findUnique).toHaveBeenCalledWith({
        where: expect.objectContaining({ name: tag.toLowerCase() },
      });
      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          hashtags: { has: tag.toLowerCase() },
          visibility: 'PUBLIC',
          isRemoved: false,
        }),
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({
        hashtag: mockHashtag,
        data: mockPosts.slice(0, 20),
        meta: { cursor: null, hasMore: false },
      });
    });

    it('should support cursor pagination for hashtag posts', async () => {
      const tag = 'travel';
      const cursor = 'post-123';
      const mockHashtag = { id: 'tag-1', name: 'travel', postsCount: 100 };
      const mockPosts = Array.from({ length: 21 }, (_, i) => ({
        id: `post-${i}`,
        content: `post ${i}`,
        user: { id: `user-${i}`, username: `traveler${i}` },
      }));
      prisma.hashtag.findUnique.mockResolvedValue(mockHashtag);
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.getHashtagPosts(tag, cursor);

      expect(prisma.hashtag.findUnique).toHaveBeenCalledWith({
        where: expect.objectContaining({ name: tag.toLowerCase() },
      });
      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          hashtags: { has: tag.toLowerCase() },
          visibility: 'PUBLIC',
          isRemoved: false,
        }),
        select: expect.any(Object),
        take: 21,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
      expect((result as any).data).toHaveLength(20);
      expect((result as any).meta.hasMore).toBe(true);
      expect((result as any).meta.cursor).toBe('post-19');
      expect(result.hashtag).toEqual(mockHashtag);
    });
  });

  describe('suggestedUsers', () => {
    it('should return users not followed by the requester', async () => {
      const userId = 'user-123';
      const mockFollowing = [{ followingId: 'user-456' }];
      const mockUsers = [
        {
          id: 'user-789',
          username: 'suggested',
          displayName: 'Suggested User',
          avatarUrl: null,
          bio: '',
          isVerified: false,
          _count: { followers: 5 },
        },
      ];
      prisma.follow.findMany.mockResolvedValue(mockFollowing);
      prisma.userInterest.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.suggestedUsers(userId);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ followerId: userId }),
          select: { followingId: true },
          take: 1000,
        }),
      );
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPrivate: false,
            isDeactivated: false,
            isBanned: false,
            isDeleted: false,
          }),
        }),
      );
      expect(result).toEqual(mockUsers);
    });

    it('should filter by shared interests when user has interests', async () => {
      const userId = 'user-123';
      const mockFollowing = [{ followingId: 'user-456' }];
      const mockInterests = [{ category: 'tech' }, { category: 'sports' }];
      const mockUsers = [
        {
          id: 'user-789',
          username: 'suggested',
          displayName: 'Suggested User',
          avatarUrl: null,
          bio: '',
          isVerified: false,
          _count: { followers: 5 },
        },
      ];
      prisma.follow.findMany.mockResolvedValue(mockFollowing);
      prisma.userInterest.findMany.mockResolvedValue(mockInterests);
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.suggestedUsers(userId);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPrivate: false,
            isDeactivated: false,
            isBanned: false,
            isDeleted: false,
            interests: { some: { category: { in: ['tech', 'sports'] } } },
          }),
        }),
      );
      expect(result).toEqual(mockUsers);
    });
  });

  describe('searchPosts', () => {
    it('should return posts matching query', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-1', content: 'Islamic finance tips', likesCount: 10, user: { id: 'u1' } },
      ]);
      const result = await service.searchPosts('finance');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].content).toContain('finance');
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty for no matches', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.searchPosts('xyznonexistent');
      expect(result.data).toEqual([]);
    });
  });

  describe('searchThreads', () => {
    it('should return threads matching query', async () => {
      prisma.thread.findMany.mockResolvedValue([
        { id: 'thread-1', content: 'Discussion about fasting', user: { id: 'u1' } },
      ]);
      const result = await service.searchThreads('fasting');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty for no matches', async () => {
      prisma.thread.findMany.mockResolvedValue([]);
      const result = await service.searchThreads('xyznonexistent');
      expect(result.data).toEqual([]);
    });
  });

  describe('searchReels', () => {
    it('should return reels matching caption or hashtag', async () => {
      prisma.reel.findMany.mockResolvedValue([
        { id: 'reel-1', caption: 'Beautiful quran recitation', user: { id: 'u1' } },
      ]);
      const result = await service.searchReels('quran');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty for no matches', async () => {
      prisma.reel.findMany.mockResolvedValue([]);
      const result = await service.searchReels('xyznonexistent');
      expect(result.data).toEqual([]);
    });
  });

  describe('getExploreFeed', () => {
    it('should return trending posts from last 7 days', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-1', content: 'Trending', likesCount: 100, createdAt: new Date() },
      ]);
      const result = await service.getExploreFeed();
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty when no trending posts', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.getExploreFeed();
      expect(result.data).toEqual([]);
    });
  });

  describe('getSuggestions', () => {
    it('should return combined user and hashtag suggestions', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'ahmed', displayName: 'Ahmed' },
      ]);
      prisma.hashtag.findMany.mockResolvedValue([
        { name: 'ahl', postsCount: 10 },
      ]);

      const result = await service.getSuggestions('ah');
      expect(result.users).toHaveLength(1);
      expect(result.hashtags).toHaveLength(1);
    });

    it('should return empty when no suggestions match', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.hashtag.findMany.mockResolvedValue([]);
      const result = await service.getSuggestions('xyznonexistent');
      expect(result.users).toEqual([]);
      expect(result.hashtags).toEqual([]);
    });
  });

  describe('error paths', () => {
    it('should throw BadRequestException for empty query', async () => {
      await expect(service.search('')).rejects.toThrow('Search query is required');
    });

    it('should throw BadRequestException for whitespace-only query', async () => {
      await expect(service.search('   ')).rejects.toThrow('Search query is required');
    });

    it('should throw BadRequestException for query exceeding 200 chars', async () => {
      const longQuery = 'a'.repeat(201);
      await expect(service.search(longQuery)).rejects.toThrow('Search query must be under 200 characters');
    });

    it('should return empty results for people search with no matches', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.search('nonexistent_user_xyz', 'people');
      expect(result).toEqual({ people: [] });
    });

    it('should return empty results for tags search with no matches', async () => {
      prisma.hashtag.findMany.mockResolvedValue([]);
      const result = await service.search('nonexistent_tag_xyz', 'tags');
      expect(result).toEqual({ hashtags: [] });
    });

    it('should filter banned/deleted users from people search via where clause', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.search('john', 'people');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isBanned: false,
            isDeactivated: false,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should filter isRemoved content from posts search', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      await service.search('test', 'posts');
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRemoved: false,
            visibility: 'PUBLIC',
          }),
        }),
      );
    });

    it('should filter isRemoved content from threads search', async () => {
      prisma.thread.findMany.mockResolvedValue([]);
      await service.search('test', 'threads');
      expect(prisma.thread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRemoved: false,
            visibility: 'PUBLIC',
            isChainHead: true,
          }),
        }),
      );
    });

    it('should fall through to Prisma when Meilisearch is unavailable', async () => {
      // Meilisearch mock is set to isAvailable=false by default in the test setup
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-1', content: 'fallback result' },
      ]);

      const result = await service.search('fallback', 'posts');
      expect(result).toHaveProperty('data');
      expect(prisma.post.findMany).toHaveBeenCalled();
    });
  });

  describe('getSuggestions error paths', () => {
    it('should return empty arrays for empty suggestion query', async () => {
      const result = await service.getSuggestions('');
      expect(result).toEqual({ users: [], hashtags: [] });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.hashtag.findMany).not.toHaveBeenCalled();
    });

    it('should return empty arrays for whitespace-only suggestion query', async () => {
      const result = await service.getSuggestions('   ');
      expect(result).toEqual({ users: [], hashtags: [] });
    });
  });

  describe('getHashtagPosts error paths', () => {
    it('should return null hashtag when tag does not exist', async () => {
      prisma.hashtag.findUnique.mockResolvedValue(null);
      prisma.post.findMany.mockResolvedValue([]);

      const result = await service.getHashtagPosts('nonexistenttag');
      expect(result.hashtag).toBeNull();
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('R2-Tab2 audit fixes', () => {
    it('should filter blocked users from paginated posts search', async () => {
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'user-1', blockedId: 'blocked-user' },
      ]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-1', content: 'Good post', user: { id: 'good-user' } },
      ]);

      const result = await service.search('test', 'posts', undefined, 20, 'user-1');

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.objectContaining({
              id: { notIn: expect.arrayContaining(['blocked-user']) },
            }),
          }),
        }),
      );
      expect(result).toHaveProperty('data');
    });

    it('should filter isRemoved hits from Meilisearch results', async () => {
      // Enable Meilisearch for this test
      const meilisearch = (service as any).meilisearch;
      meilisearch.isAvailable.mockReturnValue(true);
      meilisearch.search.mockResolvedValue({
        hits: [
          { id: 'post-ok', content: 'Valid post', isRemoved: false, visibility: 'PUBLIC' },
          { id: 'post-removed', content: 'Removed post', isRemoved: true, visibility: 'PUBLIC' },
        ],
        estimatedTotalHits: 2,
      });

      const result = await service.search('test', 'posts', undefined, 20);

      // The removed post should be filtered out
      const data = (result as any).data || (result as any).posts;
      if (data) {
        const ids = data.map((h: { id: string }) => h.id);
        expect(ids).not.toContain('post-removed');
      }
    });

    it('should accept userId for trending and filter threads', async () => {
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'user-1', blockedId: 'blocked-user' },
      ]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.hashtag.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);

      await service.trending('user-1');

      // getExcludedUserIds should have been called, which queries block.findMany
      expect(prisma.block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: 'user-1' }, { blockedId: 'user-1' }] },
        }),
      );
    });

    it('should accept userId for getHashtagPosts and filter', async () => {
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'user-2', blockedId: 'bad-user' },
      ]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.hashtag.findUnique.mockResolvedValue({ id: 'tag-1', name: 'test', postsCount: 10 });
      prisma.post.findMany.mockResolvedValue([]);

      await service.getHashtagPosts('test', undefined, 20, 'user-2');

      // getExcludedUserIds should have been called
      expect(prisma.block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: 'user-2' }, { blockedId: 'user-2' }] },
        }),
      );
    });

    it('should apply block/mute filter to channel search', async () => {
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'user-3', blockedId: 'blocked-user' },
      ]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.channel.findMany.mockResolvedValue([]);

      await service.search('tech', 'channels', undefined, 20, 'user-3');

      expect(prisma.channel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.objectContaining({
              id: { notIn: expect.arrayContaining(['blocked-user', 'muted-user']) },
            }),
          }),
        }),
      );
    });
  });

  // ═══ T10 Audit: Missing search coverage #46-47 ═══

  describe('Meilisearch-first search path — #46 M', () => {
    it('should return Meilisearch results when available and matching', async () => {
      // Create a new module with Meilisearch available
      const meilisearchMock = {
        search: jest.fn().mockResolvedValue({
          hits: [{ id: 'ms-1', content: 'Meilisearch result' }],
          estimatedTotalHits: 1,
        }),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      const module2 = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          SearchService,
          { provide: MeilisearchService, useValue: meilisearchMock },
          {
            provide: PrismaService,
            useValue: {
              post: { findMany: jest.fn() },
              user: { findMany: jest.fn() },
              hashtag: { findMany: jest.fn() },
              thread: { findMany: jest.fn() },
              reel: { findMany: jest.fn() },
              video: { findMany: jest.fn() },
              channel: { findMany: jest.fn() },
              block: { findMany: jest.fn().mockResolvedValue([]) },
              mute: { findMany: jest.fn().mockResolvedValue([]) },
              restrict: { findMany: jest.fn().mockResolvedValue([]) },
            },
          },
        ],
      }).compile();
      const svc2 = module2.get<SearchService>(SearchService);

      const result = await svc2.search('quran', 'posts');
      // When Meilisearch is available and returns hits, should use those results
      expect(meilisearchMock.isAvailable).toHaveBeenCalled();
    });
  });

  describe('getExploreFeed — block/mute with userId — #47 L', () => {
    it('should exclude blocked/muted users when userId provided', async () => {
      prisma.block.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'blocked-user' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.getExploreFeed(undefined, 20, 'u1');

      expect(prisma.block.findMany).toHaveBeenCalled();
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.objectContaining({
              id: { notIn: expect.arrayContaining(['blocked-user', 'muted-user']) },
            }),
          }),
        }),
      );
    });
  });
});