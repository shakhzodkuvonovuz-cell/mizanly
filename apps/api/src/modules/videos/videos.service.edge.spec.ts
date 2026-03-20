import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { VideosService } from './videos.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';

describe('VideosService — edge cases', () => {
  let service: VideosService;
  let prisma: any;

  const userId = 'user-edge-1';

  const mockVideo = {
    id: 'video-1',
    userId,
    channelId: 'channel-1',
    title: 'Test Video',
    description: 'desc',
    videoUrl: 'https://example.com/video.mp4',
    streamId: null,
    hlsUrl: null,
    dashUrl: null,
    qualities: [],
    isLooping: false,
    normalizeAudio: false,
    thumbnailUrl: null,
    duration: 120,
    category: 'OTHER',
    tags: [],
    chapters: [],
    viewsCount: 0,
    likesCount: 0,
    dislikesCount: 0,
    commentsCount: 0,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    createdAt: new Date(),
    user: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false },
    channel: { id: 'channel-1', handle: 'test', name: 'Test', avatarUrl: null, isVerified: false },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        VideosService,
        {
          provide: PrismaService,
          useValue: {
            video: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            videoReaction: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            videoBookmark: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            videoComment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            videoChapter: {
              findMany: jest.fn().mockResolvedValue([]),
              createMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            channel: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            watchHistory: {
              upsert: jest.fn(),
              findUnique: jest.fn(),
            },
            user: {
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            report: { create: jest.fn() },
            subscription: { findMany: jest.fn().mockResolvedValue([]) },
            premiere: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            premiereReminder: {
              create: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            endScreen: {
              createMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
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
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<VideosService>(VideosService);
    prisma = module.get(PrismaService);
  });

  describe('create — input edge cases', () => {
    it('should handle Arabic title and description', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'channel-1', userId });
      prisma.$transaction.mockResolvedValue([
        { ...mockVideo, title: 'درس في الفقه', description: 'شرح مفصل' },
        {},
      ]);

      const result = await service.create(userId, {
        channelId: 'channel-1',
        title: 'درس في الفقه',
        description: 'شرح مفصل',
        videoUrl: 'https://example.com/video.mp4',
      } as any);

      expect(result.title).toBe('درس في الفقه');
    });

    it('should throw NotFoundException for non-existent channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.create(userId, {
        channelId: 'nonexistent',
        title: 'Test',
        videoUrl: 'https://example.com/video.mp4',
      } as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the channel', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'channel-1', userId: 'other-user' });

      await expect(service.create(userId, {
        channelId: 'channel-1',
        title: 'Test',
        videoUrl: 'https://example.com/video.mp4',
      } as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('parseChaptersFromDescription — edge cases', () => {
    it('should return empty array when video has no description', async () => {
      prisma.video.findFirst.mockResolvedValue({ description: null });

      const result = await service.parseChaptersFromDescription('video-1', userId);
      expect(result).toEqual([]);
    });

    it('should return empty array when description has no timestamps', async () => {
      prisma.video.findFirst.mockResolvedValue({ description: 'No timestamps here, just text' });

      const result = await service.parseChaptersFromDescription('video-1', userId);
      expect(result).toEqual([]);
    });

    it('should parse chapters with Arabic titles', async () => {
      prisma.video.findFirst.mockResolvedValue({
        description: '0:00 مقدمة\n2:30 الموضوع الرئيسي\n1:05:30 الخاتمة',
      });
      prisma.videoChapter.deleteMany.mockResolvedValue({ count: 0 });
      prisma.videoChapter.createMany.mockResolvedValue({ count: 3 });
      prisma.videoChapter.findMany.mockResolvedValue([
        { title: 'مقدمة', timestampSeconds: 0, order: 0 },
        { title: 'الموضوع الرئيسي', timestampSeconds: 150, order: 1 },
        { title: 'الخاتمة', timestampSeconds: 3930, order: 2 },
      ]);

      const result = await service.parseChaptersFromDescription('video-1', userId);
      expect(result).toHaveLength(3);
      expect(prisma.videoChapter.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ title: 'مقدمة', timestampSeconds: 0 }),
          ]),
        }),
      );
    });
  });

  describe('updateProgress — edge cases', () => {
    it('should handle progress of 0 (just started)', async () => {
      prisma.watchHistory.upsert.mockResolvedValue({ progress: 0, completed: false });

      const result = await service.updateProgress('video-1', userId, 0);
      expect(result.updated).toBe(true);
      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ progress: 0, completed: false }),
        }),
      );
    });

    it('should mark as completed when progress >= 95', async () => {
      prisma.watchHistory.upsert.mockResolvedValue({ progress: 95, completed: true });

      const result = await service.updateProgress('video-1', userId, 95);
      expect(result.updated).toBe(true);
      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ completed: true }),
        }),
      );
    });
  });

  describe('getFeed — edge cases', () => {
    it('should handle cursor pointing to deleted video gracefully', async () => {
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId, undefined, 'deleted-video-cursor', 20);
      expect(result.data).toEqual([]);
    });
  });

  describe('getById — edge cases', () => {
    it('should throw NotFoundException for non-PUBLISHED video', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, status: 'PROCESSING' });

      await expect(service.getById('video-1', userId))
        .rejects.toThrow(NotFoundException);
    });
  });
});
