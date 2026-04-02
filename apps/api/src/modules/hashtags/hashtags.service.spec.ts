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
            hashtagFollow: {
              upsert: jest.fn(),
              deleteMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
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
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
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
        where: expect.objectContaining({
          hashtags: { has: 'test' },
          isRemoved: false,
          visibility: 'PUBLIC',
        }),
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
        where: expect.objectContaining({
          hashtags: { has: 'test' },
          isRemoved: false,
          status: 'READY',
        }),
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
        where: expect.objectContaining({
          hashtags: { has: 'test' },
          isRemoved: false,
          visibility: 'PUBLIC',
        }),
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

  describe('followHashtag', () => {
    it('should follow hashtag', async () => {
      prisma.hashtag.findUnique.mockResolvedValue({ id: 'h1', name: 'islam' });
      prisma.hashtagFollow.upsert.mockResolvedValue({});
      const result = await service.followHashtag('user-1', 'h1');
      expect(result).toEqual({ followed: true });
    });

    it('should throw NotFoundException for nonexistent hashtag', async () => {
      prisma.hashtag.findUnique.mockResolvedValue(null);
      await expect(service.followHashtag('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unfollowHashtag', () => {
    it('should unfollow hashtag', async () => {
      prisma.hashtagFollow.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.unfollowHashtag('user-1', 'h1');
      expect(result).toEqual({ followed: false });
    });
  });

  describe('getFollowedHashtags', () => {
    it('should return followed hashtags with pagination', async () => {
      prisma.hashtagFollow.findMany.mockResolvedValue([
        { hashtagId: 'h1', createdAt: new Date() },
      ]);
      prisma.hashtag.findMany.mockResolvedValue([
        { id: 'h1', name: 'islam', postsCount: 100 },
      ]);
      const result = await service.getFollowedHashtags('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('islam');
    });

    it('should return empty when user follows no hashtags', async () => {
      prisma.hashtagFollow.findMany.mockResolvedValue([]);
      const result = await service.getFollowedHashtags('user-1');
      expect(result.data).toHaveLength(0);
    });
  });

  // ═══ T10 Audit: Hashtag enrichment + cursor + NotFoundException ═══

  describe('getPostsByHashtag — enrichment with userId — #1 M', () => {
    it('should call enrichPosts when userId is provided', async () => {
      prisma.hashtag.findUnique.mockResolvedValue({ id: '1', name: 'test' });
      const mockPosts = [{ id: 'p1', content: 'test', user: { id: 'u2' } }];
      prisma.post.findMany.mockResolvedValue(mockPosts);
      prisma.postReaction.findMany.mockResolvedValue([{ postId: 'p1', reaction: 'LIKE' }]);
      prisma.savedPost.findMany.mockResolvedValue([{ postId: 'p1' }]);

      const result = await service.getPostsByHashtag('test', 'u1', undefined, 20);
      expect(result.data).toHaveLength(1);
      // When userId is passed, enrichment should occur — the result should have enriched fields
      expect(result.data[0]).toHaveProperty('userReaction');
      expect(result.data[0]).toHaveProperty('isSaved');
    });
  });

  describe('getReelsByHashtag — enrichment with userId — #2 M', () => {
    it('should call enrichReels when userId is provided', async () => {
      prisma.hashtag.findUnique.mockResolvedValue({ id: '1', name: 'test' });
      const mockReels = [{ id: 'r1', caption: 'test', user: { id: 'u2' } }];
      prisma.reel.findMany.mockResolvedValue(mockReels);
      prisma.reelReaction.findMany.mockResolvedValue([]);
      prisma.reelInteraction.findMany.mockResolvedValue([]);

      const result = await service.getReelsByHashtag('test', 'u1', undefined, 20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('userReaction');
      expect(result.data[0]).toHaveProperty('isSaved');
    });
  });

  describe('getThreadsByHashtag — enrichment with userId — #3 M', () => {
    it('should call enrichThreads when userId is provided', async () => {
      prisma.hashtag.findUnique.mockResolvedValue({ id: '1', name: 'test' });
      const mockThreads = [{ id: 't1', content: 'test', user: { id: 'u2' } }];
      prisma.thread.findMany.mockResolvedValue(mockThreads);
      prisma.threadReaction.findMany.mockResolvedValue([]);
      prisma.threadBookmark.findMany.mockResolvedValue([]);

      const result = await service.getThreadsByHashtag('test', 'u1', undefined, 20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('userReaction');
      expect(result.data[0]).toHaveProperty('isSaved');
    });
  });

  describe('getPostsByHashtag — cursor pagination — #4 M', () => {
    it('should return hasMore=true and cursor when more results exist', async () => {
      prisma.hashtag.findUnique.mockResolvedValue({ id: '1', name: 'test' });
      // Return limit+1 posts to trigger hasMore=true
      const posts = Array.from({ length: 21 }, (_, i) => ({
        id: `p${i}`, content: `Post ${i}`, user: { id: 'u1' }, createdAt: new Date(),
      }));
      prisma.post.findMany.mockResolvedValue(posts);

      const result = await service.getPostsByHashtag('test', undefined, undefined, 20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('p19');
      expect(result.data).toHaveLength(20);
    });
  });

  describe('getReelsByHashtag — cursor pagination — #5 M', () => {
    it('should return hasMore=true and cursor when more results exist', async () => {
      prisma.hashtag.findUnique.mockResolvedValue({ id: '1', name: 'test' });
      const reels = Array.from({ length: 21 }, (_, i) => ({
        id: `r${i}`, caption: `Reel ${i}`, user: { id: 'u1' }, createdAt: new Date(),
      }));
      prisma.reel.findMany.mockResolvedValue(reels);

      const result = await service.getReelsByHashtag('test', undefined, undefined, 20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('r19');
      expect(result.data).toHaveLength(20);
    });
  });

  describe('getThreadsByHashtag — cursor pagination — #6 M', () => {
    it('should return hasMore=true and cursor when more results exist', async () => {
      prisma.hashtag.findUnique.mockResolvedValue({ id: '1', name: 'test' });
      const threads = Array.from({ length: 21 }, (_, i) => ({
        id: `t${i}`, content: `Thread ${i}`, user: { id: 'u1' }, createdAt: new Date(),
      }));
      prisma.thread.findMany.mockResolvedValue(threads);

      const result = await service.getThreadsByHashtag('test', undefined, undefined, 20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('t19');
      expect(result.data).toHaveLength(20);
    });
  });

  describe('getReelsByHashtag — NotFoundException — #7 L', () => {
    it('should throw NotFoundException when hashtag does not exist', async () => {
      prisma.hashtag.findUnique.mockResolvedValue(null);
      await expect(service.getReelsByHashtag('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getThreadsByHashtag — NotFoundException — #8 L', () => {
    it('should throw NotFoundException when hashtag does not exist', async () => {
      prisma.hashtag.findUnique.mockResolvedValue(null);
      await expect(service.getThreadsByHashtag('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('decrementCount — negative floor — #9 L', () => {
    it('should call updateMany to floor count at zero after decrement', async () => {
      prisma.hashtag.update.mockResolvedValue({});
      prisma.hashtag.updateMany = jest.fn().mockResolvedValue({ count: 0 });
      await service.decrementCount('test', 'postsCount');
      expect(prisma.hashtag.updateMany).toHaveBeenCalledWith({
        where: { name: 'test', postsCount: { lt: 0 } },
        data: { postsCount: 0 },
      });
    });
  });
});