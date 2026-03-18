import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { HashtagsService } from './hashtags.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('HashtagsService', () => {
  let service: HashtagsService;
  let prisma: any;
  let redis: jest.Mocked<Redis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        HashtagsService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
            hashtag: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
            },
            post: {
              findMany: jest.fn(),
            },
            reel: {
              findMany: jest.fn(),
            },
            thread: {
              findMany: jest.fn(),
            },
            postReaction: {
              findMany: jest.fn(),
            },
            reelReaction: {
              findMany: jest.fn(),
            },
            threadReaction: {
              findMany: jest.fn(),
            },
            savedPost: {
              findMany: jest.fn(),
            },
            reelInteraction: {
              findMany: jest.fn(),
            },
            threadBookmark: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HashtagsService>(HashtagsService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS');
  });

  describe('getTrendingRaw', () => {
    it('should return trending hashtags ordered by total count', async () => {
      const mockHashtags = [
        { id: '1', name: 'test', postsCount: 10, reelsCount: 5, threadsCount: 2, videosCount: 1, total: 18 },
      ];
      prisma.$queryRaw.mockResolvedValue(mockHashtags);

      const result = await service.getTrendingRaw(50);
      expect(result).toEqual(mockHashtags);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should return hashtags with prefix match', async () => {
      const mockHashtags = [{ id: '1', name: 'test', postsCount: 5 }];
      prisma.hashtag.findMany.mockResolvedValue(mockHashtags);

      const result = await service.search('tes', 20);
      expect(result).toEqual(mockHashtags);
      expect(prisma.hashtag.findMany).toHaveBeenCalledWith({
        where: {
          name: { startsWith: 'tes', mode: 'insensitive' },
        },
        take: 20,
        orderBy: { postsCount: 'desc' },
      });
    });
  });

  describe('getByName', () => {
    it('should return hashtag if exists', async () => {
      const mockHashtag = { id: '1', name: 'test', postsCount: 10 };
      prisma.hashtag.findUnique.mockResolvedValue(mockHashtag);

      const result = await service.getByName('test');
      expect(result).toEqual(mockHashtag);
    });

    it('should throw NotFoundException if hashtag not found', async () => {
      prisma.hashtag.findUnique.mockResolvedValue(null);

      await expect(service.getByName('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPostsByHashtag', () => {
    it('should return posts with hashtag', async () => {
      const mockHashtag = { id: '1', name: 'test' };
      const mockPosts = [{ id: 'p1', content: 'test post', user: { id: 'u1' } }];
      prisma.hashtag.findUnique.mockResolvedValue(mockHashtag);
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.getPostsByHashtag('test', undefined, undefined, 20);
      expect(result.data).toEqual(mockPosts);
      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: {
          hashtags: { has: 'test' },
          isRemoved: false,
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should throw NotFoundException if hashtag not found', async () => {
      prisma.hashtag.findUnique.mockResolvedValue(null);

      await expect(service.getPostsByHashtag('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getReelsByHashtag', () => {
    it('should return reels with hashtag', async () => {
      const mockHashtag = { id: '1', name: 'test' };
      const mockReels = [{ id: 'r1', caption: 'test reel', user: { id: 'u1' } }];
      prisma.hashtag.findUnique.mockResolvedValue(mockHashtag);
      prisma.reel.findMany.mockResolvedValue(mockReels);

      const result = await service.getReelsByHashtag('test', undefined, undefined, 20);
      expect(result.data).toEqual(mockReels);
      expect(prisma.reel.findMany).toHaveBeenCalledWith({
        where: {
          hashtags: { has: 'test' },
          isRemoved: false,
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getThreadsByHashtag', () => {
    it('should return threads with hashtag', async () => {
      const mockHashtag = { id: '1', name: 'test' };
      const mockThreads = [{ id: 't1', content: 'test thread', user: { id: 'u1' } }];
      prisma.hashtag.findUnique.mockResolvedValue(mockHashtag);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.getThreadsByHashtag('test', undefined, undefined, 20);
      expect(result.data).toEqual(mockThreads);
      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: {
          hashtags: { has: 'test' },
          isRemoved: false,
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('incrementCount', () => {
    it('should upsert and increment count', async () => {
      await service.incrementCount('test', 'postsCount');
      expect(prisma.hashtag.upsert).toHaveBeenCalledWith({
        where: { name: 'test' },
        create: { name: 'test', postsCount: 1 },
        update: { postsCount: { increment: 1 } },
      });
    });
  });

  describe('decrementCount', () => {
    it('should decrement count', async () => {
      prisma.hashtag.update.mockResolvedValue({});
      await service.decrementCount('test', 'postsCount');
      expect(prisma.hashtag.update).toHaveBeenCalledWith({
        where: { name: 'test' },
        data: { postsCount: { decrement: 1 } },
      });
    });

    it('should not throw if update fails', async () => {
      prisma.hashtag.update.mockRejectedValue(new Error());
      await expect(service.decrementCount('test', 'postsCount')).resolves.not.toThrow();
    });
  });
});