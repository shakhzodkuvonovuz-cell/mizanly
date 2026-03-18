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
});