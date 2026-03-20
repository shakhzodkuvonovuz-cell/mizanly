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

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: expect.any(Object),
        take: 20,
        orderBy: { followers: { _count: 'desc' } },
      });
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
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
        },
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
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isRemoved: false,
        },
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
        where: { name: { contains: query, mode: 'insensitive' } },
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

      expect(prisma.reel.findMany).toHaveBeenCalledWith({
        where: {
          caption: { contains: query, mode: 'insensitive' },
          status: 'READY',
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
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

      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          status: 'PUBLISHED',
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { viewsCount: 'desc' },
      });
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
        where: {
          OR: [
            { handle: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
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
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isRemoved: false,
        },
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
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
        },
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

      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          status: 'PUBLISHED',
        },
        select: expect.any(Object),
        take: 21,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { viewsCount: 'desc' },
      });
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
        where: {
          OR: [
            { handle: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
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

      expect(prisma.reel.findMany).toHaveBeenCalledWith({
        where: {
          caption: { contains: query, mode: 'insensitive' },
          status: 'READY',
        },
        select: expect.any(Object),
        take: 21,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
      expect((result as any).data).toHaveLength(20);
      expect((result as any).meta.hasMore).toBe(true);
      expect((result as any).meta.cursor).toBe('reel-19');
    });
  });

  describe('trending', () => {
    it('should return trending hashtags and threads from last 24h', async () => {
      const mockPosts = [
        { hashtags: ['trending', 'news'] },
        { hashtags: ['trending'] },
        { hashtags: ['news'] },
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
      prisma.post.findMany.mockResolvedValue(mockPosts);
      prisma.hashtag.findMany.mockResolvedValue(mockHashtagRecords);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.trending();

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: expect.any(Date) },
          hashtags: { isEmpty: false },
        },
        select: { hashtags: true },
        take: 500,
      });
      expect(prisma.hashtag.findMany).toHaveBeenCalledWith({
        where: { name: { in: ['trending', 'news'] } },
      });
      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: {
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
          createdAt: { gte: expect.any(Date) },
        },
        select: expect.any(Object),
        take: 10,
        orderBy: { likesCount: 'desc' },
      });
      // Hashtags should include recentCount and be sorted by it
      expect(result.hashtags).toEqual([
        { id: 'tag-1', name: 'trending', postsCount: 500, recentCount: 2 },
        { id: 'tag-2', name: 'news', postsCount: 300, recentCount: 2 },
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
        where: { name: tag.toLowerCase() },
      });
      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: {
          hashtags: { has: tag.toLowerCase() },
          visibility: 'PUBLIC',
          isRemoved: false,
        },
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
        where: { name: tag.toLowerCase() },
      });
      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: {
          hashtags: { has: tag.toLowerCase() },
          visibility: 'PUBLIC',
          isRemoved: false,
        },
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

      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: { followerId: userId },
        select: { followingId: true },
      });
      expect(prisma.userInterest.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { category: true },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: ['user-456', userId] },
          isPrivate: false,
          isDeactivated: false,
        },
        select: expect.any(Object),
        take: 20,
        orderBy: { followers: { _count: 'desc' } },
      });
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

      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: { followerId: userId },
        select: { followingId: true },
      });
      expect(prisma.userInterest.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { category: true },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: ['user-456', userId] },
          isPrivate: false,
          isDeactivated: false,
          interests: { some: { category: { in: ['tech', 'sports'] } } },
        },
        select: expect.any(Object),
        take: 20,
        orderBy: { followers: { _count: 'desc' } },
      });
      expect(result).toEqual(mockUsers);
    });
  });
});