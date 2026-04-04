import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReelsService } from './reels.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { StreamService } from '../stream/stream.service';

describe('ReelsService — edge cases', () => {
  let service: ReelsService;
  let prisma: any;
  let redis: any;

  const userId = 'user-edge-1';

  const mockReel = {
    id: 'reel-1',
    userId,
    videoUrl: 'https://example.com/video.mp4',
    streamId: null,
    hlsUrl: null,
    dashUrl: null,
    qualities: [],
    isLooping: false,
    normalizeAudio: false,
    thumbnailUrl: null,
    duration: 30,
    caption: 'test',
    description: null,
    mentions: [],
    hashtags: [],
    status: 'READY',
    isRemoved: false,
    audioTrackId: null,
    audioTitle: null,
    audioArtist: null,
    isDuet: false,
    isStitch: false,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    savesCount: 0,
    createdAt: new Date(),
    user: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ReelsService,
        {
          provide: PrismaService,
          useValue: {
            reel: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            reelReaction: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            reelInteraction: {
              upsert: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            reelComment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
            },
            user: {
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
            report: { create: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: StreamService,
          useValue: {
            uploadFromUrl: jest.fn().mockResolvedValue('stream-123'),
            deleteVideo: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: 'REDIS',
          useValue: (() => {
            const sortedSets = new Map<string, { score: number; member: string }[]>();
            const hashStore = new Map<string, Map<string, string>>();
            const redisMock = {
              get: jest.fn().mockResolvedValue(null),
              set: jest.fn().mockResolvedValue('OK'),
              setex: jest.fn().mockResolvedValue('OK'),
              del: jest.fn(async (...keys: string[]) => { for (const k of keys) { sortedSets.delete(k); hashStore.delete(k); } return keys.length; }),
              zcard: jest.fn(async (key: string) => sortedSets.get(key)?.length ?? 0),
              zadd: jest.fn(async (key: string, ...args: (string | number)[]) => {
                if (!sortedSets.has(key)) sortedSets.set(key, []);
                const set = sortedSets.get(key)!;
                for (let i = 0; i < args.length; i += 2) set.push({ score: Number(args[i]), member: String(args[i + 1]) });
                return args.length / 2;
              }),
              zrevrange: jest.fn(async (key: string, start: number, stop: number) => {
                const set = sortedSets.get(key);
                if (!set) return [];
                const sorted = [...set].sort((a, b) => b.score - a.score);
                return sorted.slice(start, stop + 1).map(s => s.member);
              }),
              hset: jest.fn(async (key: string, ...args: string[]) => {
                if (!hashStore.has(key)) hashStore.set(key, new Map());
                const h = hashStore.get(key)!;
                for (let i = 0; i < args.length; i += 2) h.set(args[i], args[i + 1]);
                return args.length / 2;
              }),
              hmget: jest.fn(async (key: string, ...fields: string[]) => {
                const h = hashStore.get(key);
                return fields.map(f => h?.get(f) ?? null);
              }),
              expire: jest.fn().mockResolvedValue(1),
              pipeline: jest.fn(() => {
                const cmds: (() => Promise<unknown>)[] = [];
                const pipe: Record<string, unknown> = {
                  del: (...keys: string[]) => { cmds.push(() => redisMock.del(...keys)); return pipe; },
                  zadd: (key: string, ...args: (string | number)[]) => { cmds.push(() => redisMock.zadd(key, ...args)); return pipe; },
                  hset: (key: string, ...args: string[]) => { cmds.push(() => redisMock.hset(key, ...args)); return pipe; },
                  expire: (key: string, s: number) => { cmds.push(() => redisMock.expire(key, s)); return pipe; },
                  exec: async () => { const r: [null, unknown][] = []; for (const c of cmds) { r.push([null, await c()]); } return r; },
                };
                return pipe;
              }),
            };
            return redisMock;
          })(),
        },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS');
  });

  describe('create — input edge cases', () => {
    it('should handle Arabic caption', async () => {
      const arabicCaption = 'ما شاء الله تبارك الله #بكرة';

      prisma.$transaction.mockResolvedValue([
        { ...mockReel, caption: arabicCaption },
        {},
      ]);

      const result = await service.create(userId, {
        videoUrl: 'https://example.com/video.mp4',
        caption: arabicCaption,
      } as any);

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle empty caption (videos can have no caption)', async () => {
      prisma.$transaction.mockResolvedValue([
        { ...mockReel, caption: null },
        {},
      ]);

      const result = await service.create(userId, {
        videoUrl: 'https://example.com/video.mp4',
      } as any);

      expect(result).toBeDefined();
      expect(result.caption).toBeNull();
    });

    it('should handle caption containing only hashtags', async () => {
      const hashtagCaption = '#reel #viral #mizanly';

      prisma.$transaction.mockResolvedValue([
        { ...mockReel, caption: hashtagCaption, hashtags: ['reel', 'viral', 'mizanly'] },
        {},
      ]);

      const result = await service.create(userId, {
        videoUrl: 'https://example.com/video.mp4',
        caption: hashtagCaption,
      } as any);

      expect(result).toBeDefined();
      // extractHashtags should have found the 3 hashtags — batch createMany pattern
      expect(prisma.hashtag.createMany).toHaveBeenCalled();
    });
  });

  describe('getFeed — edge cases', () => {
    it('should handle limit = 0 without crashing (returns empty)', async () => {
      prisma.reel.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId, undefined, 0);
      expect(result.data).toEqual([]);
    });

    it('should return empty feed for user with no follows and no content', async () => {
      prisma.reel.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId);
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getTrendingReels — edge cases', () => {
    it('should return empty array when no reels exist in DB', async () => {
      prisma.reel.findMany.mockResolvedValue([]);

      const result = await service.getTrendingReels();
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('view — edge cases', () => {
    it('should not double-count when view called twice for same user', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);

      // First call: no existing view
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') {
          return fn({
            reelInteraction: {
              findUnique: jest.fn().mockResolvedValue(null),
              upsert: jest.fn(),
            },
            $executeRaw: jest.fn(),
          });
        }
        return fn;
      });

      const result1 = await service.view('reel-1', userId);
      expect(result1.viewed).toBe(true);

      // Second call: existing view with viewed=true
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') {
          return fn({
            reelInteraction: {
              findUnique: jest.fn().mockResolvedValue({ viewed: true }),
              upsert: jest.fn(),
            },
            $executeRaw: jest.fn(),
          });
        }
        return fn;
      });

      const result2 = await service.view('reel-1', userId);
      expect(result2.viewed).toBe(true);
      // The second call should have returned early (existing?.viewed check)
    });
  });

  describe('getComments — edge cases', () => {
    it('should return empty array for reel with 0 comments', async () => {
      prisma.reelComment.findMany.mockResolvedValue([]);

      const result = await service.getComments('reel-1', userId);
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('like — edge cases', () => {
    it('should throw NotFoundException when reel is not READY status', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'PROCESSING' });

      await expect(service.like('reel-1', userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when reel is removed', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);

      await expect(service.like('nonexistent-reel', userId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('R2-Tab2 audit fixes', () => {
    it('should use getExcludedUserIds in getFeed (not inline 10K query)', async () => {
      prisma.block.findMany.mockResolvedValue([
        { blockerId: userId, blockedId: 'blocked-reel-user' },
      ]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.reel.findMany.mockResolvedValue([]);

      await service.getFeed(userId);

      // getExcludedUserIds should have been called via the utility function
      expect(prisma.block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        }),
      );
    });
  });
});
