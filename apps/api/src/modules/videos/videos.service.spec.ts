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
              update: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            block: {
              findMany: jest.fn(),
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
              findMany: jest.fn(),
            },
            watchHistory: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn(),
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
          publishedAt: expect.any(Date),
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
      prisma.block.findMany.mockResolvedValue([{ blockedId: 'blocked-user' }]);
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
      prisma.video.findUnique.mockResolvedValue(mockVideo);
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
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.getById('unknown')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if video not published', async () => {
      const mockVideo = { id: 'video-123', status: VideoStatus.DRAFT } as any;
      prisma.video.findUnique.mockResolvedValue(mockVideo);
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
    it('should delete video if user is owner', async () => {
      const videoId = 'video-123';
      const userId = 'owner-456';
      const existingVideo = { id: videoId, userId, channelId: 'channel-789' };
      prisma.video.findUnique.mockResolvedValue(existingVideo as any);
      prisma.$transaction.mockResolvedValue(undefined);

      await service.delete(videoId, userId);

      expect(prisma.video.delete).toHaveBeenCalledWith({ where: { id: videoId } });
      expect(prisma.$executeRaw).toHaveBeenCalled();
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
          where: { videoId, parentId: null },
          orderBy: { likesCount: 'desc' },
        }),
      );
    });
  });

  describe('bookmark', () => {
    it('should bookmark video', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, userId: 'owner-789', status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoBookmark.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.bookmark(videoId, userId);

      expect(prisma.videoBookmark.create).toHaveBeenCalledWith({
        data: { userId, videoId },
      });
      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: videoId },
        data: { savesCount: { increment: 1 } },
      });
      expect(result).toEqual({ bookmarked: true });
    });

    it('should throw ConflictException if already bookmarked', async () => {
      const video = { id: 'video-123', userId: 'owner', status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.videoBookmark.findUnique.mockResolvedValue({} as any);
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
    it('should increment view count', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const video = { id: videoId, channelId: 'channel-789', status: VideoStatus.PUBLISHED };
      prisma.video.findUnique.mockResolvedValue(video as any);
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.view(videoId, userId);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: videoId },
        data: { viewsCount: { increment: 1 } },
      });
      expect(prisma.channel.update).toHaveBeenCalledWith({
        where: { id: video.channelId },
        data: { totalViews: { increment: 1 } },
      });
      expect(prisma.watchHistory.upsert).toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
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
      prisma.report.create.mockResolvedValue({} as any);

      const result = await service.report(videoId, userId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: userId,
          description: `video:${videoId}`,
          reason: 'SPAM',
        },
      });
      expect(result).toEqual({ reported: true });
    });

    it('should default to OTHER for unknown reason', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const reason = 'UNKNOWN_REASON';
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
});