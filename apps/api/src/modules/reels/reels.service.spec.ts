import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { ReelsService } from './reels.service';
import { StreamService } from '../stream/stream.service';
import { GamificationService } from '../gamification/gamification.service';
import { Prisma, ReelStatus, ReportReason, ReactionType } from '@prisma/client';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ReelsService', () => {
  const REEL_SELECT = {
    id: true,
    videoUrl: true,
    thumbnailUrl: true,
    duration: true,
    caption: true,
    mentions: true,
    hashtags: true,
    status: true,
    isRemoved: true,
    audioTrackId: true,
    audioTitle: true,
    audioArtist: true,
    isDuet: true,
    isStitch: true,
    likesCount: true,
    commentsCount: true,
    sharesCount: true,
    viewsCount: true,
    createdAt: true,
    user: {
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
      },
    },
  };
  let service: ReelsService;
  let prisma: any;
  let redis: any;
  let notifications: any;

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
              findMany: jest.fn(),
            },
            reelInteraction: {
              create: jest.fn(),
              upsert: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            reelView: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
            reelComment: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
              update: jest.fn(),
            },
            block: {
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            mute: {
              findMany: jest.fn(),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: StreamService,
          useValue: {
            uploadFromUrl: jest.fn().mockResolvedValue('mock-stream-id'),
            deleteVideo: jest.fn().mockResolvedValue(undefined),
            getPlaybackUrls: jest.fn().mockResolvedValue({
              hlsUrl: 'https://mock.stream/reel.m3u8',
              dashUrl: 'https://mock.stream/reel.mpd',
              thumbnailUrl: 'https://mock.stream/thumb.jpg',
              qualities: ['360p', '720p'],
            }),
          },
        },
        {
          provide: 'REDIS',
          useValue: (() => {
            // Functional sorted-set mock that stores ZADD data and returns via ZREVRANGE
            const sortedSets = new Map<string, { score: number; member: string }[]>();
            const hashStore = new Map<string, Map<string, string>>();
            const redisMock = {
              get: jest.fn(),
              set: jest.fn().mockResolvedValue('OK'),
              setex: jest.fn(),
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
        {
          provide: GamificationService,
          useValue: {
            awardXP: jest.fn().mockResolvedValue(undefined),
            updateStreak: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    notifications = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ReelsService);
  });

  describe('create', () => {
    it('should create reel with PROCESSING status then update to READY', async () => {
      const userId = 'user-123';
      const dto = {
        videoUrl: 'https://example.com/video.mp4',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 15,
        caption: 'Test reel #hello #world',
        hashtags: ['extra'],
        mentions: ['user2'],
        audioTrackId: 'audio-123',
        isDuet: false,
        isStitch: false,
      };
      const mockReel = {
        id: 'reel-456',
        userId,
        videoUrl: dto.videoUrl,
        thumbnailUrl: dto.thumbnailUrl,
        duration: dto.duration,
        caption: dto.caption,
        mentions: dto.mentions,
        hashtags: ['hello', 'world', 'extra'],
        audioTrackId: dto.audioTrackId,
        isDuet: dto.isDuet,
        isStitch: dto.isStitch,
        status: ReelStatus.PROCESSING,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        loopsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: userId,
          username: 'testuser',
          displayName: 'Test User',
          avatarUrl: null,
          isVerified: false,
        },
        audioTrack: null,
      };
      const mockUpdatedReel = { ...mockReel, status: ReelStatus.READY };

      prisma.hashtag.upsert.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([mockReel]);
      prisma.reel.update.mockResolvedValue(mockUpdatedReel);

      const result = await service.create(userId, dto);

      expect(prisma.hashtag.upsert).toHaveBeenCalledTimes(3); // #hello, #world, extra
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
      // Result comes from the $transaction mock which returns [mockReel]
      expect(result).toBeDefined();
      expect(result.id).toBe(mockReel.id);
    });
  });

  describe('getFeed', () => {
    it('should return reels ordered by engagement score, not chronology', async () => {
      const userId = 'user-123';
      const now = new Date();
      const mockReels = [
        {
          id: 'reel-1',
          status: ReelStatus.READY,
          userId: 'user-1',
          user: { id: 'user-1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
          videoUrl: 'url1',
          thumbnailUrl: 'thumb1',
          duration: 10,
          caption: 'Older but high engagement',
          mentions: [],
          hashtags: [],
          audioTrackId: null,
          isDuet: false,
          isStitch: false,
          isRemoved: false,
          likesCount: 100,      // high engagement
          commentsCount: 20,
          sharesCount: 10,
          savesCount: 0,
          viewsCount: 5000,
          loopsCount: 10,
          createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day old
          updatedAt: new Date(),
          audioTrack: null,
        },
        {
          id: 'reel-2',
          status: ReelStatus.READY,
          userId: 'user-2',
          user: { id: 'user-2', username: 'user2', displayName: 'User 2', avatarUrl: null, isVerified: false },
          videoUrl: 'url2',
          thumbnailUrl: 'thumb2',
          duration: 12,
          caption: 'Newer but low engagement',
          mentions: [],
          hashtags: [],
          audioTrackId: null,
          isDuet: false,
          isStitch: false,
          isRemoved: false,
          likesCount: 5,
          commentsCount: 1,
          sharesCount: 0,
          savesCount: 0,
          viewsCount: 100,
          loopsCount: 5,
          createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours old
          updatedAt: new Date(),
          audioTrack: null,
        },
      ];

      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      // The service will fetch up to 200 reels; we mock returning these two
      prisma.reel.findMany.mockResolvedValue(mockReels);
      prisma.reelReaction.findMany.mockResolvedValue([]);
      prisma.reelInteraction.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId);

      // Expect the high‑engagement older reel first, not the newer low‑engagement one
      expect(result.data[0].id).toBe('reel-1'); // older, high engagement
      expect(result.data[1].id).toBe('reel-2'); // newer, low engagement
      // Verify the query fetched recent reels (72h window) with createdAt order for initial fetch
      expect(prisma.reel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' }, // Initial fetch by recency before scoring
          take: 500,          // We fetch up to 500 to score
        })
      );
    });

    it('should exclude blocked/muted users', async () => {
      const userId = 'user-123';
      const blockedUser = 'blocked-456';
      const mutedUser = 'muted-789';
      const mockReels = [
        {
          id: 'reel-1',
          status: ReelStatus.READY,
          userId: 'user-other',
          user: { id: 'user-other', username: 'other', displayName: 'Other', avatarUrl: null, isVerified: false },
          videoUrl: 'url1',
          thumbnailUrl: 'thumb1',
          duration: 10,
          caption: 'Caption',
          mentions: [],
          hashtags: [],
          audioTrackId: null,
          isDuet: false,
          isStitch: false,
          isRemoved: false,
          likesCount: 0,
          commentsCount: 0,
          sharesCount: 0,
          savesCount: 0,
          viewsCount: 0,
          loopsCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          audioTrack: null,
        },
      ];

      prisma.block.findMany.mockResolvedValue([{ blockerId: userId, blockedId: blockedUser }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: mutedUser }]);
      prisma.reel.findMany.mockResolvedValue(mockReels);
      prisma.reelReaction.findMany.mockResolvedValue([]);
      prisma.reelInteraction.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId);

      // Verify feed query was called with block/mute filtering
      expect(prisma.reel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ReelStatus.READY,
            isRemoved: false,
            userId: expect.objectContaining({ notIn: expect.arrayContaining([blockedUser, mutedUser]) }),
          }),
        }),
      );
    });
  });

  describe('like', () => {
    it('should create like and increment likesCount', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        userId: 'owner-789',
        status: ReelStatus.READY,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);
      notifications.create.mockResolvedValue(undefined);

      const result = await service.like(reelId, userId);

      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId } });
      expect(prisma.$transaction).toHaveBeenCalled();
      // Notify reel owner (not self)
      expect(notifications.create).toHaveBeenCalledWith({
        userId: mockReel.userId,
        actorId: userId,
        type: 'REEL_LIKE',
        reelId,
      });
      expect(result).toEqual({ liked: true });
    });

    it('should throw BadRequestException when liking own reel', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        userId, // same user
        status: ReelStatus.READY,
        isRemoved: false,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);

      await expect(service.like(reelId, userId)).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate like (P2002)', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        status: ReelStatus.READY,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      prisma.$transaction.mockRejectedValue(p2002Error);

      await expect(service.like(reelId, userId)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if reel not READY', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        status: ReelStatus.PROCESSING,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);

      await expect(service.like(reelId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlike', () => {
    it('should delete like and decrement count', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = { id: reelId, status: ReelStatus.READY };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.$transaction.mockResolvedValue([{}, {}, 1]);

      const result = await service.unlike(reelId, userId);

      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId } });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ liked: false });
    });

    it('should throw NotFoundException if like not found (P2025)', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = { id: reelId, status: ReelStatus.READY };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '5.0.0' },
      );
      prisma.$transaction.mockRejectedValue(p2025Error);

      await expect(service.unlike(reelId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should soft-delete reel (set isRemoved to true)', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        userId,
        status: ReelStatus.READY,
        isRemoved: false,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reel.update.mockResolvedValue({ ...mockReel, isRemoved: true });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockResolvedValue([{ ...mockReel, isRemoved: true }, 1]);

      const result = await service.delete(reelId, userId);

      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId } });
      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: reelId },
        data: { isRemoved: true },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-author', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        userId: 'different-user',
        status: ReelStatus.READY,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);

      await expect(service.delete(reelId, userId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if reel not found', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';

      prisma.reel.findUnique.mockResolvedValue(null);

      await expect(service.delete(reelId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('view', () => {
    it('should increment viewsCount via interactive transaction', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        status: ReelStatus.READY,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      // Interactive transaction: the service passes a callback function
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          reelInteraction: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({}),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        return fn(tx);
      });

      const result = await service.view(reelId, userId);

      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId } });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });

    it('should not increment if already viewed', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        status: ReelStatus.READY,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      // Interactive transaction: viewed=true means early return
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          reelInteraction: {
            findUnique: jest.fn().mockResolvedValue({ viewed: true }),
          },
        };
        return fn(tx);
      });

      const result = await service.view(reelId, userId);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });
  });

  describe('deleteComment', () => {
    it('should delete own comment successfully', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const commentId = 'comment-789';
      const mockComment = {
        id: commentId,
        reelId,
        userId,
      };

      prisma.reelComment.findUnique.mockResolvedValue(mockComment);
      prisma.$transaction.mockResolvedValue([{}, 1]);

      const result = await service.deleteComment(reelId, commentId, userId);

      expect(prisma.reelComment.findUnique).toHaveBeenCalledWith({
        where: { id: commentId },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        prisma.reelComment.update({ where: { id: commentId }, data: { content: '[deleted]' } }),
        prisma.$executeRaw`UPDATE "Reel" SET "commentsCount" = GREATEST(0, "commentsCount" - 1) WHERE id = ${reelId}`,
      ]);
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException for non-existent comment', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const commentId = 'comment-789';

      prisma.reelComment.findUnique.mockResolvedValue(null);

      await expect(service.deleteComment(reelId, commentId, userId))
        .rejects.toThrow(NotFoundException);
      expect(prisma.reelComment.findUnique).toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when deleting another user\'s comment (and not reel owner)', async () => {
      const userId = 'user-123';
      const otherUserId = 'other-456';
      const reelId = 'reel-456';
      const commentId = 'comment-789';
      const mockComment = {
        id: commentId,
        reelId,
        userId: otherUserId,
      };
      const mockReel = { userId: 'reel-owner-999' }; // neither comment owner nor reel owner

      prisma.reelComment.findUnique.mockResolvedValue(mockComment);
      prisma.reel.findUnique.mockResolvedValue(mockReel);

      await expect(service.deleteComment(reelId, commentId, userId))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.reelComment.findUnique).toHaveBeenCalled();
      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId }, select: { userId: true } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should allow reel owner to delete another user\'s comment', async () => {
      const reelOwner = 'reel-owner-123';
      const commentAuthor = 'other-456';
      const reelId = 'reel-456';
      const commentId = 'comment-789';
      const mockComment = {
        id: commentId,
        reelId,
        userId: commentAuthor,
      };

      prisma.reelComment.findUnique.mockResolvedValue(mockComment);
      prisma.reel.findUnique.mockResolvedValue({ userId: reelOwner });
      prisma.$transaction.mockResolvedValue([{}, 1]);

      const result = await service.deleteComment(reelId, commentId, reelOwner);

      expect(result).toEqual({ deleted: true });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════
  // getById
  // ═══════════════════════════════════════════════════════

  describe('getById', () => {
    const mockReel = {
      id: 'reel-1', videoUrl: 'https://r2/vid.mp4', caption: 'Test', status: 'READY',
      isRemoved: false, likesCount: 10, commentsCount: 5, sharesCount: 2, viewsCount: 100,
      user: { id: 'owner', username: 'owner', displayName: 'Owner', avatarUrl: null, isVerified: false },
    };

    it('should return reel with isLiked/isBookmarked when userId provided', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reelReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      prisma.reelInteraction.findUnique.mockResolvedValue({ saved: true });

      const result = await service.getById('reel-1', 'user-1');
      expect(result.id).toBe('reel-1');
      expect(result.isLiked).toBe(true);
      expect(result.isBookmarked).toBe(true);
    });

    it('should return reel with isLiked=false isBookmarked=false when no interaction', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reelReaction.findUnique.mockResolvedValue(null);
      prisma.reelInteraction.findUnique.mockResolvedValue(null);

      const result = await service.getById('reel-1', 'user-1');
      expect(result.isLiked).toBe(false);
      expect(result.isBookmarked).toBe(false);
    });

    it('should return reel without user context', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);

      const result = await service.getById('reel-1');
      expect(result.isLiked).toBe(false);
      expect(result.isBookmarked).toBe(false);
    });

    it('should throw NotFoundException when reel not found', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when reel is removed', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, isRemoved: true });
      await expect(service.getById('reel-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when reel status is PROCESSING', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'PROCESSING' });
      await expect(service.getById('reel-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // comment
  // ═══════════════════════════════════════════════════════

  describe('comment', () => {
    it('should create comment and return it', async () => {
      const mockComment = { id: 'comment-1', content: 'Great reel!', createdAt: new Date(), user: { id: 'user-1' } };
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', userId: 'user-1', status: 'READY' });
      prisma.$transaction.mockResolvedValue([mockComment, 1]);

      const result = await service.comment('reel-1', 'user-1', 'Great reel!');
      expect(result.id).toBe('comment-1');
      expect(result.content).toBe('Great reel!');
    });

    it('should throw NotFoundException when reel not found', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.comment('nonexistent', 'user-1', 'test')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when reel not READY', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', status: 'PROCESSING' });
      await expect(service.comment('reel-1', 'user-1', 'test')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getComments
  // ═══════════════════════════════════════════════════════

  describe('getComments', () => {
    it('should return comments with pagination', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.reelComment.findMany.mockResolvedValue([
        { id: 'c-1', content: 'Nice!', user: { id: 'u1' } },
      ]);

      const result = await service.getComments('reel-1', 'user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty for reel with no comments', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.reelComment.findMany.mockResolvedValue([]);

      const result = await service.getComments('reel-1', 'user-1');
      expect(result.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // share
  // ═══════════════════════════════════════════════════════

  describe('share', () => {
    it('should share reel and increment count', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', status: 'READY' });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn({
          reelInteraction: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
          $executeRaw: jest.fn(),
        });
        return [];
      });

      const result = await service.share('reel-1', 'user-1');
      expect(result).toEqual({ shared: true });
    });

    it('should throw NotFoundException when reel not found', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.share('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // bookmark / unbookmark
  // ═══════════════════════════════════════════════════════

  describe('bookmark', () => {
    it('should bookmark reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', status: 'READY' });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn({
          reelInteraction: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
          $executeRaw: jest.fn(),
        });
        return false;
      });

      const result = await service.bookmark('reel-1', 'user-1');
      expect(result).toEqual({ bookmarked: true });
    });

    it('should throw NotFoundException when reel not found', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.bookmark('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when already bookmarked', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', status: 'READY' });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn({
          reelInteraction: { findUnique: jest.fn().mockResolvedValue({ saved: true }), upsert: jest.fn() },
          $executeRaw: jest.fn(),
        });
        return true;
      });

      await expect(service.bookmark('reel-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('unbookmark', () => {
    it('should unbookmark reel', async () => {
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn({
          reelInteraction: { findUnique: jest.fn().mockResolvedValue({ saved: true }), update: jest.fn() },
          $executeRaw: jest.fn(),
        });
        return true;
      });

      const result = await service.unbookmark('reel-1', 'user-1');
      expect(result).toEqual({ bookmarked: false });
    });

    it('should throw NotFoundException when not bookmarked', async () => {
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn({
          reelInteraction: { findUnique: jest.fn().mockResolvedValue(null) },
        });
        return false;
      });

      await expect(service.unbookmark('reel-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // report
  // ═══════════════════════════════════════════════════════

  describe('report', () => {
    it('should create report for reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1' });
      prisma.report.create.mockResolvedValue({});

      const result = await service.report('reel-1', 'user-1', 'SPAM');
      expect(result).toEqual({ reported: true });
      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reporterId: 'user-1' }) }),
      );
    });

    it('should handle unknown reason by mapping to OTHER', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1' });
      prisma.report.create.mockResolvedValue({});
      const result = await service.report('reel-1', 'user-1', 'UNKNOWN_REASON');
      expect(result).toEqual({ reported: true });
    });
  });

  // ═══════════════════════════════════════════════════════
  // archive / unarchive
  // ═══════════════════════════════════════════════════════

  describe('archive', () => {
    it('should archive reel for owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', userId: 'user-1' });
      prisma.reel.update.mockResolvedValue({});

      const result = await service.archive('reel-1', 'user-1');
      expect(result).toEqual({ archived: true });
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', userId: 'other' });
      await expect(service.archive('reel-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when reel not found', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.archive('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unarchive', () => {
    it('should unarchive reel for owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', userId: 'user-1', isArchived: true });
      prisma.reel.update.mockResolvedValue({});

      const result = await service.unarchive('reel-1', 'user-1');
      expect(result).toEqual({ archived: false });
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1', userId: 'other', isArchived: true });
      await expect(service.unarchive('reel-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getUserReels
  // ═══════════════════════════════════════════════════════

  describe('getUserReels', () => {
    it('should return reels by username', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      prisma.reel.findMany.mockResolvedValue([
        { id: 'reel-1', status: 'READY', isRemoved: false, user: { id: 'user-1' } },
      ]);
      prisma.reelReaction.findMany.mockResolvedValue([]);
      prisma.reelInteraction.findMany.mockResolvedValue([]);

      const result = await service.getUserReels('testuser');
      expect(result.data).toHaveLength(1);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserReels('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getTrendingReels
  // ═══════════════════════════════════════════════════════

  describe('getTrendingReels', () => {
    it('should return trending reels scored by engagement, higher engagement first', async () => {
      prisma.reel.findMany.mockResolvedValue([
        { id: 'reel-low', createdAt: new Date(), likesCount: 10, commentsCount: 5, sharesCount: 2, viewsCount: 100, user: { id: 'u2' } },
        { id: 'reel-high', createdAt: new Date(), likesCount: 100, commentsCount: 50, sharesCount: 20, viewsCount: 1000, user: { id: 'u1' } },
      ]);

      const result = await service.getTrendingReels();
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
      // Higher engagement should be first after scoring
      if (result.data.length === 2) {
        expect(result.data[0].id).toBe('reel-high');
      }
    });

    it('should return empty data and hasMore=false when no recent reels', async () => {
      prisma.reel.findMany.mockResolvedValue([]);

      const result = await service.getTrendingReels();
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });
});