import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { SchedulingService } from './scheduling.service';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              findMany: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            thread: {
              findMany: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            reel: {
              findMany: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            video: {
              findMany: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getScheduled', () => {
    it('should return scheduled items across all types sorted by scheduledAt', async () => {
      const userId = 'user-123';
      const now = new Date();
      const mockPosts = [
        { id: 'post-1', content: 'Post 1', scheduledAt: new Date(now.getTime() + 3600000), type: 'post' },
      ];
      const mockThreads = [
        { id: 'thread-1', content: 'Thread 1', scheduledAt: new Date(now.getTime() + 7200000), type: 'thread' },
      ];
      const mockReels = [
        { id: 'reel-1', caption: 'Reel 1', scheduledAt: new Date(now.getTime() + 10800000), type: 'reel' },
      ];
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', scheduledAt: new Date(now.getTime() + 14400000), type: 'video' },
      ];

      prisma.post.findMany.mockResolvedValue(mockPosts);
      prisma.thread.findMany.mockResolvedValue(mockThreads);
      prisma.reel.findMany.mockResolvedValue(mockReels);
      prisma.video.findMany.mockResolvedValue(mockVideos);

      const result = await service.getScheduled(userId);

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          scheduledAt: { not: null, gt: expect.any(Date) },
        },
        select: expect.any(Object),
        orderBy: { scheduledAt: 'asc' },
      });
      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          scheduledAt: { not: null, gt: expect.any(Date) },
        },
        select: expect.any(Object),
        orderBy: { scheduledAt: 'asc' },
      });
      expect(prisma.reel.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          scheduledAt: { not: null, gt: expect.any(Date) },
        },
        select: expect.any(Object),
        orderBy: { scheduledAt: 'asc' },
      });
      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          scheduledAt: { not: null, gt: expect.any(Date) },
        },
        select: expect.any(Object),
        orderBy: { scheduledAt: 'asc' },
      });

      // Expect combined list sorted by scheduledAt
      expect(result.length).toBe(4);
      expect(result[0].type).toBe('post');
      expect(result[1].type).toBe('thread');
      expect(result[2].type).toBe('reel');
      expect(result[3].type).toBe('video');
    });

    it('should return empty array when no scheduled items', async () => {
      const userId = 'user-123';
      prisma.post.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.reel.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.getScheduled(userId);

      expect(result).toEqual([]);
    });
  });

  describe('updateSchedule', () => {
    it('should update scheduledAt for a post', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const newScheduledAt = new Date(Date.now() + 30 * 60000); // 30 minutes from now
      const mockPost = { id, userId, scheduledAt: new Date(Date.now() + 60 * 60000) };

      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.post.update.mockResolvedValue({ ...mockPost, scheduledAt: newScheduledAt });

      const result = await service.updateSchedule(userId, type, id, newScheduledAt);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id },
        select: { userId: true, scheduledAt: true },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id },
        data: { scheduledAt: newScheduledAt },
      });
      expect(result.scheduledAt).toEqual(newScheduledAt);
    });

    it('should throw NotFoundException if item does not exist', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const newScheduledAt = new Date(Date.now() + 30 * 60000);

      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.updateSchedule(userId, type, id, newScheduledAt)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own the item', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const newScheduledAt = new Date(Date.now() + 30 * 60000);
      const mockPost = { id, userId: 'other-user', scheduledAt: new Date() };

      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.updateSchedule(userId, type, id, newScheduledAt)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if scheduledAt is less than 15 minutes from now', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const newScheduledAt = new Date(Date.now() + 10 * 60000); // 10 minutes
      const mockPost = { id, userId, scheduledAt: new Date() };

      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.updateSchedule(userId, type, id, newScheduledAt)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update scheduledAt for thread, reel, video types', async () => {
      const userId = 'user-123';
      const newScheduledAt = new Date(Date.now() + 30 * 60000);
      const mockItem = { id: 'item-1', userId, scheduledAt: new Date() };

      // Test each type
      const types = ['thread', 'reel', 'video'];
      for (const type of types) {
        const model = type;
        prisma[model].findUnique.mockResolvedValue(mockItem);
        prisma[model].update.mockResolvedValue({ ...mockItem, scheduledAt: newScheduledAt });

        const result = await service.updateSchedule(userId, type, 'item-1', newScheduledAt);

        expect(prisma[model].findUnique).toHaveBeenCalledWith({
          where: { id: 'item-1' },
          select: { userId: true, scheduledAt: true },
        });
        expect(prisma[model].update).toHaveBeenCalledWith({
          where: { id: 'item-1' },
          data: { scheduledAt: newScheduledAt },
        });
        expect(result.scheduledAt).toEqual(newScheduledAt);

        // Clear mocks between iterations
        jest.clearAllMocks();
      }
    });
  });

  describe('cancelSchedule', () => {
    it('should set scheduledAt to null for a post', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const mockPost = { id, userId, scheduledAt: new Date() };

      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.post.update.mockResolvedValue({ ...mockPost, scheduledAt: null });

      const result = await service.cancelSchedule(userId, type, id);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id },
        select: { userId: true },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id },
        data: { scheduledAt: null },
      });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if item does not exist', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';

      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.cancelSchedule(userId, type, id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own the item', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const mockPost = { id, userId: 'other-user' };

      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.cancelSchedule(userId, type, id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('publishNow', () => {
    it('should set scheduledAt to null for a post', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const mockPost = { id, userId, scheduledAt: new Date() };

      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.post.update.mockResolvedValue({ ...mockPost, scheduledAt: null });

      const result = await service.publishNow(userId, type, id);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id },
        select: { userId: true },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id },
        data: { scheduledAt: null },
      });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if item does not exist', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';

      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.publishNow(userId, type, id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own the item', async () => {
      const userId = 'user-123';
      const type = 'post';
      const id = 'post-1';
      const mockPost = { id, userId: 'other-user' };

      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.publishNow(userId, type, id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});