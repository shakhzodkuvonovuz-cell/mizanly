import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { WatchHistoryService } from './watch-history.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('WatchHistoryService', () => {
  let service: WatchHistoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      video: {
        findUnique: jest.fn(),
      },
      watchHistory: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      watchLater: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        WatchHistoryService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<WatchHistoryService>(WatchHistoryService);
  });

  describe('recordWatch', () => {
    it('should throw NotFoundException if video does not exist', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(
        service.recordWatch('user123', 'video456', 30, false),
      ).rejects.toThrow(NotFoundException);
    });

    it('should upsert watch history with progress and completed', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'video456' });
      prisma.watchHistory.upsert.mockResolvedValue({
        userId: 'user123',
        videoId: 'video456',
        progress: 30,
        completed: false,
        watchedAt: new Date(),
      });

      const result = await service.recordWatch('user123', 'video456', 30, false);
      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith({
        where: { userId_videoId: { userId: 'user123', videoId: 'video456' } },
        create: {
          userId: 'user123',
          videoId: 'video456',
          progress: 30,
          completed: false,
        },
        update: { watchedAt: expect.any(Date), progress: 30, completed: false },
      });
      expect(result).toHaveProperty('userId', 'user123');
    });
  });

  describe('getHistory', () => {
    it('should return paginated watch history', async () => {
      const mockItems = [
        {
          id: 'wh1',
          progress: 50,
          completed: true,
          watchedAt: new Date(),
          video: {
            id: 'video1',
            title: 'Test Video',
            thumbnailUrl: 'thumb.jpg',
            duration: 120,
            viewsCount: 1000,
            createdAt: new Date(),
            channel: {
              id: 'channel1',
              handle: 'test',
              name: 'Test Channel',
              avatarUrl: 'avatar.jpg',
            },
          },
        },
      ];
      prisma.watchHistory.findMany.mockResolvedValue(mockItems);

      const result = await service.getHistory('user123');
      expect(prisma.watchHistory.findMany).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Test Video');
      expect(result.data[0].progress).toBe(50);
      expect(result.meta).toHaveProperty('cursor');
    });
  });

  describe('removeFromHistory', () => {
    it('should delete watch history entries for user and video', async () => {
      prisma.watchHistory.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.removeFromHistory('user123', 'video456');
      expect(prisma.watchHistory.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user123', videoId: 'video456' },
      });
      expect(result).toEqual({ removed: true });
    });
  });

  describe('clearHistory', () => {
    it('should delete all watch history for user', async () => {
      prisma.watchHistory.deleteMany.mockResolvedValue({ count: 5 });
      const result = await service.clearHistory('user123');
      expect(prisma.watchHistory.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user123' },
      });
      expect(result).toEqual({ cleared: true });
    });
  });

  describe('addToWatchLater', () => {
    it('should throw NotFoundException if video does not exist', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(
        service.addToWatchLater('user123', 'video456'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should upsert watch later entry', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'video456' });
      prisma.watchLater.upsert.mockResolvedValue({});
      await service.addToWatchLater('user123', 'video456');
      expect(prisma.watchLater.upsert).toHaveBeenCalledWith({
        where: { userId_videoId: { userId: 'user123', videoId: 'video456' } },
        create: { userId: 'user123', videoId: 'video456' },
        update: {},
      });
    });
  });

  describe('removeFromWatchLater', () => {
    it('should delete watch later entry', async () => {
      prisma.watchLater.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.removeFromWatchLater('user123', 'video456');
      expect(prisma.watchLater.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user123', videoId: 'video456' },
      });
      expect(result).toEqual({ removed: true });
    });
  });

  describe('getWatchLater', () => {
    it('should return paginated watch later list', async () => {
      const mockItems = [
        {
          video: {
            id: 'video1',
            title: 'Test Video',
            thumbnailUrl: 'thumb.jpg',
            duration: 120,
            viewsCount: 1000,
            createdAt: new Date(),
            channel: {
              id: 'channel1',
              handle: 'test',
              name: 'Test Channel',
              avatarUrl: 'avatar.jpg',
            },
          },
        },
      ];
      prisma.watchLater.findMany.mockResolvedValue(mockItems);
      const result = await service.getWatchLater('user123');
      expect(prisma.watchLater.findMany).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Test Video');
      expect(result.meta).toHaveProperty('cursor');
    });
  });

  describe('isInWatchLater', () => {
    it('should return false if not in watch later', async () => {
      prisma.watchLater.findUnique.mockResolvedValue(null);
      const result = await service.isInWatchLater('user123', 'video456');
      expect(result).toEqual({ inWatchLater: false });
    });

    it('should return true if in watch later', async () => {
      prisma.watchLater.findUnique.mockResolvedValue({ userId: 'user123', videoId: 'video456' });
      const result = await service.isInWatchLater('user123', 'video456');
      expect(result).toEqual({ inWatchLater: true });
    });
  });

  describe('recordWatch — defaults', () => {
    it('should use default progress 0 and completed false', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'video1' });
      prisma.watchHistory.upsert.mockResolvedValue({
        userId: 'user1', videoId: 'video1', progress: 0, completed: false,
      });
      const result = await service.recordWatch('user1', 'video1');
      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ progress: 0, completed: false }),
      }));
      expect(result.progress).toBe(0);
    });
  });

  describe('getHistory — pagination', () => {
    it('should set hasMore when results exceed limit', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `wh${i}`, progress: 50, completed: false, watchedAt: new Date(),
        video: { id: `v${i}`, title: `Video ${i}`, thumbnailUrl: null, duration: 60, viewsCount: 0, createdAt: new Date(), channel: null },
      }));
      prisma.watchHistory.findMany.mockResolvedValue(items);
      const result = await service.getHistory('user1');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
    });

    it('should return empty when no history', async () => {
      prisma.watchHistory.findMany.mockResolvedValue([]);
      const result = await service.getHistory('user1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should pass cursor to findMany', async () => {
      prisma.watchHistory.findMany.mockResolvedValue([]);
      await service.getHistory('user1', 'wh5', 10);
      expect(prisma.watchHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({
        cursor: { id: 'wh5' },
        skip: 1,
        take: 11,
      }));
    });
  });

  describe('getWatchLater — pagination', () => {
    it('should set hasMore when results exceed limit', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        videoId: `v${i}`,
        video: { id: `v${i}`, title: `Video ${i}`, thumbnailUrl: null, duration: 60, viewsCount: 0, createdAt: new Date(), channel: null },
      }));
      prisma.watchLater.findMany.mockResolvedValue(items);
      const result = await service.getWatchLater('user1');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
    });

    it('should return empty when no watch later items', async () => {
      prisma.watchLater.findMany.mockResolvedValue([]);
      const result = await service.getWatchLater('user1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('addToWatchLater — returns added', () => {
    it('should return { added: true }', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.watchLater.upsert.mockResolvedValue({});
      const result = await service.addToWatchLater('user1', 'v1');
      expect(result).toEqual({ added: true });
    });
  });
});