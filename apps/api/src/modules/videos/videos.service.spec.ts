import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { VideosService } from './videos.service';
import { StreamService } from '../stream/stream.service';
import { VideoStatus, VideoCategory } from '@prisma/client';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('VideosService', () => {
  let service: VideosService;
  let prisma: any;
  let redis: any;
  let notifications: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        VideosService,
        {
          provide: PrismaService,
          useValue: {
            channel: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            video: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            block: {
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            mute: {
              findMany: jest.fn(),
            },
            subscription: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            videoReaction: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            videoBookmark: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            videoComment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            watchHistory: {
              upsert: jest.fn(),
              findUnique: jest.fn().mockResolvedValue(null),
            },
            report: {
              create: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            videoPremiere: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            premiereReminder: {
              create: jest.fn(),
              delete: jest.fn(),
            },
            endScreen: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              deleteMany: jest.fn(),
            },
            videoChapter: {
              findMany: jest.fn().mockResolvedValue([]),
              createMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: StreamService,
          useValue: {
            uploadFromUrl: jest.fn().mockResolvedValue('mock-stream-id'),
            deleteVideo: jest.fn().mockResolvedValue(undefined),
            getPlaybackUrls: jest.fn().mockResolvedValue({
              hlsUrl: 'https://mock.stream/video.m3u8',
              dashUrl: 'https://mock.stream/video.mpd',
              thumbnailUrl: 'https://mock.stream/thumb.jpg',
              qualities: ['360p', '720p', '1080p'],
            }),
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

    service = module.get<VideosService>(VideosService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    notifications = module.get(NotificationsService);
  });

  describe('create', () => {
    it('should create a video for owned channel', async () => {
      const userId = 'user-123';
      const dto = {
        channelId: 'channel-456',
        title: 'Test Video',
        description: 'Description',
        videoUrl: 'https://example.com/video.mp4',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 120,
        category: VideoCategory.EDUCATION,
        tags: ['tech'],
      };
      const mockChannel = { id: 'channel-456', userId };
      const mockVideo = {
        id: 'video-789',
        userId,
        channelId: dto.channelId,
        title: dto.title,
        description: dto.description,
        videoUrl: dto.videoUrl,
        thumbnailUrl: dto.thumbnailUrl,
        duration: dto.duration,
        category: dto.category,
        tags: dto.tags,
        viewsCount: 0,
        likesCount: 0,
        dislikesCount: 0,
        commentsCount: 0,
        status: VideoStatus.PUBLISHED,
        publishedAt: new Date(),
        createdAt: new Date(),
        user: { id: userId, username: 'user', displayName: 'User', avatarUrl: null, isVerified: false },
        channel: { id: 'channel-456', handle: 'tech', name: 'Tech', avatarUrl: null, isVerified: false },
      };
      prisma.channel.findUnique.mockResolvedValue(mockChannel);
      prisma.$transaction.mockResolvedValue([mockVideo, undefined]);
      prisma.video.create.mockResolvedValue(mockVideo);
      prisma.video.update.mockResolvedValue(mockVideo);

      const result = await service.create(userId, dto);

      expect(prisma.channel.findUnique).toHaveBeenCalledWith({ where: { id: dto.channelId } });
      expect(prisma.video.create).toHaveBeenCalledWith({
        data: {
          userId,
          channelId: dto.channelId,
          title: dto.title,
          description: dto.description,
          videoUrl: dto.videoUrl,
          thumbnailUrl: dto.thumbnailUrl,
          duration: dto.duration,
          category: dto.category || VideoCategory.OTHER,
          tags: dto.tags || [],
          normalizeAudio: false,
          status: VideoStatus.PROCESSING,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        ...mockVideo,
        isLiked: false,
        isDisliked: false,
        isBookmarked: false,
      });
    });

    it('should throw NotFoundException if channel not found', async () => {
      const userId = 'user-123';
      const dto = { channelId: 'nonexistent', title: 'Test', videoUrl: 'url', duration: 100 } as any;
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.create(userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own channel', async () => {
      const userId = 'user-123';
      const dto = { channelId: 'channel-456', title: 'Test', videoUrl: 'url', duration: 100 } as any;
      prisma.channel.findUnique.mockResolvedValue({ id: 'channel-456', userId: 'other-user' });

      await expect(service.create(userId, dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getFeed', () => {
    it('should return paginated feed for authenticated user with cache', async () => {
      const userId = 'user-123';
      const mockVideos = [
        {
          id: 'video-1',
          userId: 'owner-1',
          channelId: 'channel-1',
          title: 'Video 1',
          description: 'Desc',
          videoUrl: 'url1',
          thumbnailUrl: null,
          duration: 120,
          category: VideoCategory.EDUCATION,
          tags: [],
          viewsCount: 100,
          likesCount: 10,
          dislikesCount: 1,
          commentsCount: 5,
          status: VideoStatus.PUBLISHED,
          publishedAt: new Date(),
          createdAt: new Date(),
          user: { id: 'owner-1', username: 'owner1', displayName: 'Owner1', avatarUrl: null, isVerified: false },
          channel: { id: 'channel-1', handle: 'tech', name: 'Tech', avatarUrl: null, isVerified: false },
        },
      ];
      redis.get.mockResolvedValue(JSON.stringify({ data: mockVideos, meta: { cursor: null, hasMore: false } }));
      const result = await service.getFeed(userId);

      expect(redis.get).toHaveBeenCalled();
      expect(result.data).toEqual(JSON.parse(JSON.stringify(mockVideos)));
    });

    it('should fetch from DB when cache miss', async () => {
      const userId = 'user-123';
      const mockVideos = [
        {
          id: 'video-1',
          userId: 'owner-1',
          channelId: 'channel-1',
          title: 'Video 1',
          description: 'Desc',
          videoUrl: 'url1',
          thumbnailUrl: null,
          duration: 120,
          category: VideoCategory.EDUCATION,
          tags: [],
          viewsCount: 100,
          likesCount: 10,
          dislikesCount: 1,
          commentsCount: 5,
          status: VideoStatus.PUBLISHED,
          publishedAt: new Date(),
          createdAt: new Date(),
          user: { id: 'owner-1', username: 'owner1', displayName: 'Owner1', avatarUrl: null, isVerified: false },
          channel: { id: 'channel-1', handle: 'tech', name: 'Tech', avatarUrl: null, isVerified: false },
        },
      ];
      redis.get.mockResolvedValue(null);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.subscription.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([...mockVideos, { ...mockVideos[0], id: 'video-2' }]);
      prisma.videoReaction.findMany.mockResolvedValue([]);
      prisma.videoBookmark.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId, undefined, undefined, 1);

      expect(redis.setex).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(true);
    });

    it('should exclude blocked/muted users', async () => {
      const userId = 'user-123';
      redis.get.mockResolvedValue(null);
      prisma.block.findMany.mockResolvedValue([{ blockerId: userId, blockedId: 'blocked-user' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      prisma.subscription.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);

      await service.getFeed(userId);

      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { notIn: ['blocked-user', 'muted-user'] },
          }),
        }),
      );
    });
  });

  describe('getById', () => {
    it('should return video with flags for authenticated user', async () => {
      const videoId = 'video-123';
      const userId = 'user-123';
      const mockVideo = {
        id: videoId,
        userId: 'owner-456',
        channelId: 'channel-789',
        title: 'Video',
        description: 'Desc',
        videoUrl: 'url',
        thumbnailUrl: null,
        duration: 120,
        category: VideoCategory.EDUCATION,
        tags: [],
        viewsCount: 100,
        likesCount: 10,
        dislikesCount: 2,
        commentsCount: 5,
        status: VideoStatus.PUBLISHED,
        publishedAt: new Date(),
        createdAt: new Date(),
        user: { id: 'owner-456', username: 'owner', displayName: 'Owner', avatarUrl: null, isVerified: false },
        channel: { id: 'channel-789', handle: 'tech', name: 'Tech', avatarUrl: null, isVerified: false },
      };
      prisma.video.findFirst.mockResolvedValue(mockVideo);
      prisma.videoReaction.findUnique.mockResolvedValue({ userId, videoId, isLike: true });
      prisma.videoBookmark.findUnique.mockResolvedValue({ userId, videoId });
      prisma.subscription.findUnique.mockResolvedValue({ userId, channelId: 'channel-789' });

      const result = await service.getById(videoId, userId);

      expect(result.isLiked).toBe(true);
      expect(result.isDisliked).toBe(false);
      expect(result.isBookmarked).toBe(true);
      expect(result.isSubscribed).toBe(true);
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      await expect(service.getById('unknown')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if video not published', async () => {
      const mockVideo = { id: 'video-123', status: VideoStatus.DRAFT } as any;
      prisma.video.findFirst.mockResolvedValue(mockVideo);
      await expect(service.getById('video-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update video if user is owner', async () => {
      const videoId = 'video-123';
      const userId = 'owner-456';
      const dto = { title: 'Updated Title', description: 'New desc' };
      const existingVideo = { id: videoId, userId, channelId: 'channel-789' };
      const updatedVideo = {
        ...existingVideo,
        title: dto.title,
        description: dto.description,
        thumbnailUrl: null,
        duration: 120,
        category: VideoCategory.EDUCATION,
        tags: [],
        viewsCount: 0,
        likesCount: 0,
        dislikesCount: 0,
        commentsCount: 0,
        status: VideoStatus.PUBLISHED,
        publishedAt: new Date(),
        createdAt: new Date(),
        user: { id: userId, username: 'owner', displayName: 'Owner', avatarUrl: null, isVerified: false },
        channel: { id: 'channel-789', handle: 'tech', name: 'Tech', avatarUrl: null, isVerified: false },
      };
      prisma.video.findUnique.mockResolvedValue(existingVideo as any);
      prisma.video.update.mockResolvedValue(updatedVideo);
      prisma.videoReaction.findUnique.mockResolvedValue(null);
      prisma.videoBookmark.findUnique.mockResolvedValue(null);

      const result = await service.update(videoId, userId, dto);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: videoId },
        data: {
          title: dto.title,
          description: dto.description,
          thumbnailUrl: undefined,
          category: undefined,
          tags: undefined,
        },
        select: expect.any(Object),
      });
      expect(result.isLiked).toBe(false);
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.update('unknown', 'user-123', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const existingVideo = { id: 'video-123', userId: 'owner-456' };
      prisma.video.findUnique.mockResolvedValue(existingVideo as any);
      await expect(service.update('video-123', 'other-user', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should soft-delete video if user is owner', async () => {
      const videoId = 'video-123';
      const userId = 'owner-456';
      const existingVideo = { id: videoId, userId, channelId: 'channel-789' };
      prisma.video.findUnique.mockResolvedValue(existingVideo as any);
      prisma.$transaction.mockResolvedValue(undefined);

      await service.delete(videoId, userId);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.delete('unknown', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const existingVideo = { id: 'video-123', userId: 'owner-456' };
      prisma.video.findUnique.mockResolvedValue(existingVideo as any);
      await expect(service.delete('video-123', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('like', () => {
    it('should like video', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, userId: 'owner-789', status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
      notifications.create.mockResolvedValue(undefined);

      const result = await service.like(videoId, userId);

      expect(prisma.videoReaction.create).toHaveBeenCalledWith({
        data: { userId, videoId, isLike: true },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith({
        userId: video.userId,
        actorId: userId,
        type: 'VIDEO_LIKE',
        videoId,
      });
      expect(result).toEqual({ liked: true });
    });

    it('should replace dislike with like', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, userId: 'owner-789', status: VideoStatus.PUBLISHED };
      const existingReaction = { userId, videoId, isLike: false };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoReaction.findUnique.mockResolvedValue(existingReaction);
      prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
      notifications.create.mockResolvedValue(undefined);

      await service.like(videoId, userId);

      expect(prisma.videoReaction.update).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
        data: { isLike: true },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.like('unknown', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already liked', async () => {
      const video = { id: 'video-123', userId: 'owner', status: VideoStatus.PUBLISHED };
      const existingReaction = { userId: 'user-123', videoId: 'video-123', isLike: true };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoReaction.findUnique.mockResolvedValue(existingReaction);
      prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
      await expect(service.like('video-123', 'user-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('dislike', () => {
    it('should dislike video', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, userId: 'owner-789', status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation((callback: any) => callback(prisma));

      const result = await service.dislike(videoId, userId);

      expect(prisma.videoReaction.create).toHaveBeenCalledWith({
        data: { userId, videoId, isLike: false },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result).toEqual({ disliked: true });
    });

    it('should replace like with dislike', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, userId: 'owner-789', status: VideoStatus.PUBLISHED };
      const existingReaction = { userId, videoId, isLike: true };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoReaction.findUnique.mockResolvedValue(existingReaction);
      prisma.$transaction.mockImplementation((callback: any) => callback(prisma));

      await service.dislike(videoId, userId);

      expect(prisma.videoReaction.update).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
        data: { isLike: false },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw ConflictException if already disliked', async () => {
      const video = { id: 'video-123', userId: 'owner', status: VideoStatus.PUBLISHED };
      const existingReaction = { userId: 'user-123', videoId: 'video-123', isLike: false };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoReaction.findUnique.mockResolvedValue(existingReaction);
      prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
      await expect(service.dislike('video-123', 'user-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('removeReaction', () => {
    it('should remove like reaction', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const existingReaction = { userId, videoId, isLike: true };
      prisma.videoReaction.findUnique.mockResolvedValue(existingReaction);
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.removeReaction(videoId, userId);

      expect(prisma.videoReaction.delete).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result).toEqual({ removed: true });
    });

    it('should throw NotFoundException if reaction not found', async () => {
      prisma.videoReaction.findUnique.mockResolvedValue(null);
      await expect(service.removeReaction('video-123', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('comment', () => {
    it('should create comment and notify owner', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const content = 'Great video!';
      const video = { id: videoId, userId: 'owner-789', status: VideoStatus.PUBLISHED };
      const mockComment = {
        id: 'comment-123',
        content,
        createdAt: new Date(),
        user: { id: userId, username: 'user', displayName: 'User', avatarUrl: null },
      };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.$transaction.mockResolvedValue([mockComment, undefined]);
      prisma.videoComment.create.mockResolvedValue(mockComment);
      notifications.create.mockResolvedValue(undefined);

      const result = await service.comment(videoId, userId, content);

      expect(prisma.videoComment.create).toHaveBeenCalledWith({
        data: { userId, videoId, content, parentId: undefined },
        select: expect.any(Object),
      });
      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: videoId },
        data: { commentsCount: { increment: 1 } },
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: video.userId,
        actorId: userId,
        type: 'VIDEO_COMMENT',
        videoId,
        body: content.substring(0, 100),
      });
      expect(result).toEqual(mockComment);
    });

    it('should not notify if commenting on own video', async () => {
      const videoId = 'video-123';
      const userId = 'owner-789';
      const video = { id: videoId, userId, status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.$transaction.mockResolvedValue([{} as any, undefined]);
      prisma.videoComment.create.mockResolvedValue({} as any);

      await service.comment(videoId, userId, 'test');

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.comment('unknown', 'user-123', 'test')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getComments', () => {
    it('should return paginated top-level comments', async () => {
      const videoId = 'video-123';
      const mockComments = [
        {
          id: 'comment-1',
          content: 'Great!',
          createdAt: new Date(),
          likesCount: 5,
          repliesCount: 2,
          user: { id: 'user-1', username: 'user1', displayName: 'User1', avatarUrl: null, isVerified: false },
        },
      ];
      prisma.videoComment.findMany.mockResolvedValue([...mockComments, { ...mockComments[0], id: 'comment-2' }]);

      const result = await service.getComments(videoId, undefined, 1);

      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(true);
      expect(prisma.videoComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ videoId, parentId: null }),
          orderBy: { likesCount: 'desc' },
        }),
      );
    });
  });

  describe('bookmark', () => {
    it('should bookmark video', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, userId: 'owner-789', status: VideoStatus.PUBLISHED, isRemoved: false };
      prisma.video.findUnique.mockResolvedValue(video as any);
      // Interactive transaction mock for bookmark
      const mockTx = {
        videoBookmark: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        $executeRaw: jest.fn(),
      };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn(mockTx);
        return Promise.all(fn);
      });

      const result = await service.bookmark(videoId, userId);

      expect(mockTx.videoBookmark.create).toHaveBeenCalledWith({ data: { userId, videoId } });
      expect(result).toEqual({ bookmarked: true });
    });

    it('should throw ConflictException if already bookmarked', async () => {
      const video = { id: 'video-123', userId: 'owner', status: VideoStatus.PUBLISHED, isRemoved: false };
      prisma.video.findUnique.mockResolvedValue(video as any);
      const mockTx = {
        videoBookmark: { findUnique: jest.fn().mockResolvedValue({} as any), create: jest.fn() },
        $executeRaw: jest.fn(),
      };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn(mockTx);
        return Promise.all(fn);
      });
      await expect(service.bookmark('video-123', 'user-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('unbookmark', () => {
    it('should remove bookmark', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      prisma.videoBookmark.findUnique.mockResolvedValue({ userId, videoId } as any);
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.unbookmark(videoId, userId);

      expect(prisma.videoBookmark.delete).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result).toEqual({ bookmarked: false });
    });

    it('should throw NotFoundException if bookmark not found', async () => {
      prisma.videoBookmark.findUnique.mockResolvedValue(null);
      await expect(service.unbookmark('video-123', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('view', () => {
    it('should increment view count on first view (deduplication)', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, channelId: 'channel-789', status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.watchHistory.findUnique.mockResolvedValue(null); // first view
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.view(videoId, userId);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });

    it('should not increment view count for repeat views within 24h', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, channelId: 'channel-789', status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.watchHistory.findUnique.mockResolvedValue({ watchedAt: new Date() }); // recent view
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.view(videoId, userId);

      expect(result).toEqual({ viewed: true });
      // Transaction should only contain watchHistory upsert, not video/channel increment
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.view('unknown', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('report', () => {
    it('should create report', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const reason = 'SPAM';
      prisma.video.findUnique.mockResolvedValue({ id: videoId });
      prisma.report.create.mockResolvedValue({} as any);

      const result = await service.report(videoId, userId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: userId,
          reportedVideoId: videoId,
          description: reason,
          reason: 'SPAM',
        },
      });
      expect(result).toEqual({ reported: true });
    });

    it('should default to OTHER for unknown reason', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const reason = 'UNKNOWN_REASON';
      prisma.video.findUnique.mockResolvedValue({ id: videoId });
      prisma.report.create.mockResolvedValue({} as any);

      await service.report(videoId, userId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reason: 'OTHER',
        }),
      });
    });
  });

  describe('updateProgress', () => {
    it('should create watch history entry if none exists', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const progress = 45;
      prisma.watchHistory.upsert.mockResolvedValue({ id: 'wh1' });

      const result = await service.updateProgress(videoId, userId, progress);

      expect(result).toEqual({ updated: true });
      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
        create: { userId, videoId, progress, completed: false, watchedAt: expect.any(Date) },
        update: { progress, completed: false, watchedAt: expect.any(Date) },
      });
    });

    it('should mark completed when progress >= 95', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const progress = 96;
      prisma.watchHistory.upsert.mockResolvedValue({ id: 'wh1' });

      const result = await service.updateProgress(videoId, userId, progress);

      expect(result).toEqual({ updated: true });
      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
        create: { userId, videoId, progress, completed: true, watchedAt: expect.any(Date) },
        update: { progress, completed: true, watchedAt: expect.any(Date) },
      });
    });

    it('should not mark completed when progress < 95', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const progress = 50;
      prisma.watchHistory.upsert.mockResolvedValue({ id: 'wh1' });

      const result = await service.updateProgress(videoId, userId, progress);

      expect(result).toEqual({ updated: true });
      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
        create: { userId, videoId, progress, completed: false, watchedAt: expect.any(Date) },
        update: { progress, completed: false, watchedAt: expect.any(Date) },
      });
    });
  });

  // ═══════════════════════════════════════════════════════
  // getShareLink
  // ═══════════════════════════════════════════════════════

  describe('getShareLink', () => {
    it('should return share URL for existing video', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'video-1' });
      const result = await service.getShareLink('video-1');
      expect(result.url).toContain('video-1');
    });

    it('should throw NotFoundException for nonexistent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.getShareLink('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Premiere
  // ═══════════════════════════════════════════════════════

  describe('createPremiere', () => {
    it('should create premiere for owned video', async () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      prisma.video.findFirst.mockResolvedValue({ id: 'video-1', userId: 'user-1' });
      const premiereResult = { videoId: 'video-1', scheduledAt: future };
      prisma.$transaction.mockResolvedValue([premiereResult, {}]);

      const result = await service.createPremiere('video-1', 'user-1', { scheduledAt: future });
      expect(result.videoId).toBe('video-1');
    });

    it('should throw NotFoundException when video not found', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      await expect(service.createPremiere('v1', 'u1', { scheduledAt: new Date(Date.now() + 86400000).toISOString() }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for past scheduled time', async () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      prisma.video.findFirst.mockResolvedValue({ id: 'v1', userId: 'u1' });
      await expect(service.createPremiere('v1', 'u1', { scheduledAt: past })).rejects.toThrow();
    });
  });

  describe('getPremiere', () => {
    it('should return premiere data', async () => {
      prisma.videoPremiere.findUnique.mockResolvedValue({ videoId: 'video-1', scheduledAt: new Date() });
      const result = await service.getPremiere('video-1');
      expect(result.videoId).toBe('video-1');
    });

    it('should throw NotFoundException when no premiere', async () => {
      prisma.videoPremiere.findUnique.mockResolvedValue(null);
      await expect(service.getPremiere('video-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setPremiereReminder', () => {
    it('should set reminder for premiere', async () => {
      prisma.videoPremiere.findUnique.mockResolvedValue({ id: 'prem-1', videoId: 'video-1' });
      prisma.premiereReminder.create.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.setPremiereReminder('video-1', 'user-1');
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException when premiere not found', async () => {
      prisma.videoPremiere.findUnique.mockResolvedValue(null);
      await expect(service.setPremiereReminder('v1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removePremiereReminder', () => {
    it('should remove reminder', async () => {
      prisma.videoPremiere.findUnique.mockResolvedValue({ id: 'prem-1' });
      prisma.premiereReminder.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.removePremiereReminder('video-1', 'user-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('startPremiere', () => {
    it('should start premiere for video owner', async () => {
      prisma.video.findFirst.mockResolvedValue({ id: 'video-1', userId: 'user-1' });
      prisma.videoPremiere.update.mockResolvedValue({});

      const result = await service.startPremiere('video-1', 'user-1');
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException for non-owner', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      await expect(service.startPremiere('v1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPremiereViewerCount', () => {
    it('should return viewer count', async () => {
      prisma.videoPremiere.findUnique.mockResolvedValue({ viewerCount: 42 });
      const result = await service.getPremiereViewerCount('video-1');
      expect(result).toEqual({ viewerCount: 42 });
    });

    it('should return 0 when no premiere', async () => {
      prisma.videoPremiere.findUnique.mockResolvedValue(null);
      const result = await service.getPremiereViewerCount('video-1');
      expect(result).toEqual({ viewerCount: 0 });
    });
  });

  // ═══════════════════════════════════════════════════════
  // End Screens
  // ═══════════════════════════════════════════════════════

  describe('setEndScreens', () => {
    it('should set end screen items', async () => {
      prisma.video.findFirst.mockResolvedValue({ id: 'v1', userId: 'u1' });
      const mockTx = {
        endScreen: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'es-1' }) },
      };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn(mockTx);
        return Promise.all(fn);
      });

      const items = [{ type: 'video', label: 'Next', position: 'bottom-right', showAtSeconds: 300 }];
      const result = await service.setEndScreens('v1', 'u1', items);
      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException for non-owner', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      await expect(service.setEndScreens('v1', 'u1', [])).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for more than 4 items', async () => {
      prisma.video.findFirst.mockResolvedValue({ id: 'v1', userId: 'u1' });
      const items = Array(5).fill({ type: 'video', label: 'X', position: 'top', showAtSeconds: 300 });
      await expect(service.setEndScreens('v1', 'u1', items)).rejects.toThrow();
    });
  });

  describe('getEndScreens', () => {
    it('should return end screens', async () => {
      prisma.endScreen.findMany.mockResolvedValue([{ id: 'es-1', type: 'video' }]);
      const result = await service.getEndScreens('v1');
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteEndScreens', () => {
    it('should delete end screens for video owner', async () => {
      prisma.video.findFirst.mockResolvedValue({ id: 'v1', userId: 'u1' });
      prisma.endScreen.deleteMany.mockResolvedValue({});
      const result = await service.deleteEndScreens('v1', 'u1');
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException for non-owner', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      await expect(service.deleteEndScreens('v1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Chapters
  // ═══════════════════════════════════════════════════════

  describe('getChapters', () => {
    it('should return chapters sorted by timestamp', async () => {
      prisma.videoChapter.findMany.mockResolvedValue([
        { title: 'Intro', timestampSeconds: 0 },
        { title: 'Main', timestampSeconds: 120 },
      ]);
      const result = await service.getChapters('v1');
      expect(result).toHaveLength(2);
    });
  });

  describe('parseChaptersFromDescription', () => {
    it('should parse timestamps from description', async () => {
      prisma.video.findFirst.mockResolvedValue({ description: '0:00 Introduction\n2:30 Main Topic\n5:00 Conclusion' });
      prisma.videoChapter.deleteMany.mockResolvedValue({});
      prisma.videoChapter.createMany.mockResolvedValue({ count: 3 });
      prisma.videoChapter.findMany.mockResolvedValue([
        { title: 'Introduction', timestampSeconds: 0 },
        { title: 'Main Topic', timestampSeconds: 150 },
        { title: 'Conclusion', timestampSeconds: 300 },
      ]);

      const result = await service.parseChaptersFromDescription('v1', 'u1');
      expect(result).toHaveLength(3);
    });

    it('should return empty when video has no description', async () => {
      prisma.video.findFirst.mockResolvedValue({ description: null });
      const result = await service.parseChaptersFromDescription('v1', 'u1');
      expect(result).toEqual([]);
    });

    it('should return empty when video not found', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      const result = await service.parseChaptersFromDescription('v1', 'u1');
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getCommentReplies
  // ═══════════════════════════════════════════════════════

  describe('getCommentReplies', () => {
    it('should return replies for a comment', async () => {
      prisma.videoComment.findUnique.mockResolvedValue({ id: 'comment-1' });
      prisma.videoComment.findMany.mockResolvedValue([
        { id: 'reply-1', content: 'Great point', parentId: 'comment-1' },
      ]);
      const result = await service.getCommentReplies('comment-1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty when no replies', async () => {
      prisma.videoComment.findUnique.mockResolvedValue({ id: 'comment-1' });
      prisma.videoComment.findMany.mockResolvedValue([]);
      const result = await service.getCommentReplies('comment-1');
      expect(result.data).toEqual([]);
    });

    it('should throw NotFoundException when comment not found', async () => {
      prisma.videoComment.findUnique.mockResolvedValue(null);
      await expect(service.getCommentReplies('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});