import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
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
  });

  describe('trending', () => {
    it('should return trending hashtags and threads from last 24h', async () => {
      const mockHashtags = [
        { id: 'tag-1', name: 'trending', postsCount: 500 },
      ];
      const mockThreads = [
        {
          id: 'thread-1',
          content: 'Trending thread',
          likesCount: 200,
          user: { id: 'user-1', username: 'trendy' },
        },
      ];
      prisma.hashtag.findMany.mockResolvedValue(mockHashtags);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.trending();

      expect(prisma.hashtag.findMany).toHaveBeenCalledWith({
        take: 20,
        orderBy: { postsCount: 'desc' },
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
      expect(result).toEqual({ hashtags: mockHashtags, threads: mockThreads });
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
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.suggestedUsers(userId);

      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: { followerId: userId },
        select: { followingId: true },
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
  });
});