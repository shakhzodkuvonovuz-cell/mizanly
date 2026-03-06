import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { ReelsService } from './reels.service';
import { ReelStatus, ReportReason, ReactionType } from '@prisma/client';

describe('ReelsService', () => {
  let service: ReelsService;
  let prisma: any;
  let redis: any;
  let notifications: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
            },
            block: {
              findMany: jest.fn(),
            },
            mute: {
              findMany: jest.fn(),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
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
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
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
      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: mockReel.id },
        data: { status: ReelStatus.READY },
        select: expect.any(Object),
      });
      expect(result.status).toBe(ReelStatus.READY);
      expect(result.isLiked).toBe(false);
      expect(result.isBookmarked).toBe(false);
    });
  });

  describe('getFeed', () => {
    it('should return READY reels, exclude PROCESSING/FAILED', async () => {
      const userId = 'user-123';
      const mockReels = [
        {
          id: 'reel-1',
          status: ReelStatus.READY,
          userId: 'user-1',
          user: { id: 'user-1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
          videoUrl: 'url1',
          thumbnailUrl: 'thumb1',
          duration: 10,
          caption: 'Caption 1',
          mentions: [],
          hashtags: [],
          audioTrackId: null,
          isDuet: false,
          isStitch: false,
          isRemoved: false,
          likesCount: 5,
          commentsCount: 2,
          sharesCount: 1,
          savesCount: 0,
          viewsCount: 100,
          loopsCount: 10,
          createdAt: new Date(),
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
          caption: 'Caption 2',
          mentions: [],
          hashtags: [],
          audioTrackId: null,
          isDuet: false,
          isStitch: false,
          isRemoved: false,
          likesCount: 10,
          commentsCount: 3,
          sharesCount: 2,
          savesCount: 1,
          viewsCount: 200,
          loopsCount: 20,
          createdAt: new Date(),
          updatedAt: new Date(),
          audioTrack: null,
        },
      ];

      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.reel.findMany.mockResolvedValue(mockReels);
      prisma.reelLike.findMany.mockResolvedValue([]);
      prisma.reelBookmark.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId);

      expect(prisma.reel.findMany).toHaveBeenCalledWith({
        where: {
          status: ReelStatus.READY,
          isRemoved: false,
          userId: undefined, // no excluded IDs
        },
        select: expect.any(Object),
        take: 21, // limit + 1
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].status).toBe(ReelStatus.READY);
      expect(result.data[0].isLiked).toBe(false);
      expect(result.data[0].isBookmarked).toBe(false);
      expect(result.meta.hasMore).toBe(false);
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

      prisma.block.findMany.mockResolvedValue([{ blockedId: blockedUser }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: mutedUser }]);
      prisma.reel.findMany.mockResolvedValue(mockReels);
      prisma.reelLike.findMany.mockResolvedValue([]);
      prisma.reelBookmark.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId);

      expect(prisma.reel.findMany).toHaveBeenCalledWith({
        where: {
          status: ReelStatus.READY,
          isRemoved: false,
          userId: { notIn: [blockedUser, mutedUser] },
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
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
      prisma.reelReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);
      notifications.create.mockResolvedValue(undefined);

      const result = await service.like(reelId, userId);

      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId } });
      expect(prisma.reelReaction.findUnique).toHaveBeenCalledWith({
        where: { userId_reelId: { userId, reelId } },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      // Check transaction includes reelReaction.create, reelInteraction.upsert, reel.update
      expect(notifications.create).toHaveBeenCalledWith({
        userId: mockReel.userId,
        actorId: userId,
        type: 'LIKE',
        reelId,
      });
      expect(result).toEqual({ liked: true });
    });

    it('should throw ConflictException if already liked', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        status: ReelStatus.READY,
      };
      const mockReaction = { userId, reelId, reaction: ReactionType.LIKE };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reelReaction.findUnique.mockResolvedValue(mockReaction);

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
      const mockReaction = { userId, reelId, reaction: ReactionType.LIKE };

      prisma.reelReaction.findUnique.mockResolvedValue(mockReaction);
      prisma.$transaction.mockResolvedValue([{}, {}, 1]);

      const result = await service.unlike(reelId, userId);

      expect(prisma.reelReaction.findUnique).toHaveBeenCalledWith({
        where: { userId_reelId: { userId, reelId } },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ liked: false });
    });

    it('should throw NotFoundException if like not found', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';

      prisma.reelReaction.findUnique.mockResolvedValue(null);

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
      prisma.$transaction.mockResolvedValue([{ ...mockReel, isRemoved: true }, 1]);

      const result = await service.delete(reelId, userId);

      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId } });
      expect(prisma.$transaction).toHaveBeenCalled();
      // Check transaction includes reel.update with isRemoved: true and $executeRaw
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
      expect(prisma.$transaction.mock.calls[0][0][0]).toEqual(
        expect.objectContaining({
          where: { id: reelId },
          data: { isRemoved: true },
        }),
      );
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
    it('should increment viewsCount and create view record', async () => {
      const userId = 'user-123';
      const reelId = 'reel-456';
      const mockReel = {
        id: reelId,
        status: ReelStatus.READY,
      };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reelInteraction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.view(reelId, userId);

      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: reelId } });
      expect(prisma.reelInteraction.findUnique).toHaveBeenCalledWith({
        where: { userId_reelId: { userId, reelId } },
      });
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
      const mockInteraction = { userId, reelId, viewed: true };

      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reelInteraction.findUnique.mockResolvedValue(mockInteraction);

      const result = await service.view(reelId, userId);

      expect(prisma.reelInteraction.findUnique).toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });
  });
});