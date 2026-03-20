import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ClipsService } from './clips.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ClipsService', () => {
  let service: ClipsService;
  let prisma: any;

  const mockVideo = {
    id: 'video-1',
    title: 'Test Video',
    status: 'PUBLISHED',
    duration: 300,
    hlsUrl: 'https://stream.example.com/video.m3u8',
    thumbnailUrl: 'https://r2.example.com/thumb.jpg',
  };

  const mockClip = {
    id: 'clip-1',
    userId: 'user-1',
    sourceVideoId: 'video-1',
    title: 'Cool moment',
    startTime: 30,
    endTime: 60,
    duration: 30,
    clipUrl: 'https://stream.example.com/video.m3u8?start=30&end=60',
    thumbnailUrl: 'https://r2.example.com/thumb.jpg',
    viewsCount: 0,
    likesCount: 0,
    sharesCount: 0,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ClipsService,
        {
          provide: PrismaService,
          useValue: {
            video: { findUnique: jest.fn() },
            videoClip: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ClipsService>(ClipsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('create', () => {
    it('should create a clip from a published video', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoClip.create.mockResolvedValue(mockClip);

      const result = await service.create('user-1', 'video-1', {
        startTime: 30,
        endTime: 60,
        title: 'Cool moment',
      });

      expect(result).toEqual(mockClip);
      expect(prisma.videoClip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            sourceVideoId: 'video-1',
            startTime: 30,
            endTime: 60,
            duration: 30,
          }),
        }),
      );
    });

    it('should throw NotFoundException when video does not exist', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.create('user-1', 'video-1', { startTime: 0, endTime: 30 }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when video is not published', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, status: 'DRAFT' });
      await expect(service.create('user-1', 'video-1', { startTime: 0, endTime: 30 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when endTime <= startTime', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      await expect(service.create('user-1', 'video-1', { startTime: 60, endTime: 30 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when clip exceeds 60 seconds', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      await expect(service.create('user-1', 'video-1', { startTime: 0, endTime: 90 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when endTime exceeds video duration', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      await expect(service.create('user-1', 'video-1', { startTime: 280, endTime: 310 }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getByVideo', () => {
    it('should return paginated clips for a video', async () => {
      prisma.videoClip.findMany.mockResolvedValue([mockClip]);

      const result = await service.getByVideo('video-1');

      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should indicate hasMore when more clips exist', async () => {
      const clips = Array(21).fill(mockClip).map((c, i) => ({ ...c, id: `clip-${i}` }));
      prisma.videoClip.findMany.mockResolvedValue(clips);

      const result = await service.getByVideo('video-1');

      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete a clip owned by the user', async () => {
      prisma.videoClip.findFirst.mockResolvedValue(mockClip);
      prisma.videoClip.delete.mockResolvedValue(mockClip);

      await service.delete('clip-1', 'user-1');

      expect(prisma.videoClip.delete).toHaveBeenCalledWith({ where: { id: 'clip-1' } });
    });

    it('should throw NotFoundException when clip does not exist or not owned', async () => {
      prisma.videoClip.findFirst.mockResolvedValue(null);
      await expect(service.delete('clip-1', 'user-2')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getShareLink', () => {
    it('should return a share link with timestamp', async () => {
      prisma.videoClip.findUnique.mockResolvedValue(mockClip);

      const result = await service.getShareLink('clip-1');

      expect(result.url).toBe('https://mizanly.app/video/video-1?t=30');
    });

    it('should throw NotFoundException when clip does not exist', async () => {
      prisma.videoClip.findUnique.mockResolvedValue(null);
      await expect(service.getShareLink('clip-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByUser', () => {
    it('should return paginated clips for a user', async () => {
      prisma.videoClip.findMany.mockResolvedValue([mockClip]);

      const result = await service.getByUser('user-1');

      expect(prisma.videoClip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1' },
        take: 21,
      }));
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should apply cursor for pagination', async () => {
      prisma.videoClip.findMany.mockResolvedValue([]);

      await service.getByUser('user-1', 'cursor-123');

      expect(prisma.videoClip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1', id: { lt: 'cursor-123' } },
      }));
    });

    it('should return hasMore true when results exceed limit', async () => {
      const clips = Array(21).fill(mockClip).map((c, i) => ({ ...c, id: `clip-${i}` }));
      prisma.videoClip.findMany.mockResolvedValue(clips);

      const result = await service.getByUser('user-1');

      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
    });
  });

  describe('create — edge cases', () => {
    it('should use default title when none provided', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoClip.create.mockResolvedValue(mockClip);

      await service.create('user-1', 'video-1', { startTime: 0, endTime: 30 } as any);

      expect(prisma.videoClip.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          title: 'Clip from Test Video',
        }),
      }));
    });
  });

  describe('getByVideo — cursor', () => {
    it('should apply cursor for pagination', async () => {
      prisma.videoClip.findMany.mockResolvedValue([]);

      await service.getByVideo('video-1', 'cursor-123');

      expect(prisma.videoClip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { sourceVideoId: 'video-1', id: { lt: 'cursor-123' } },
      }));
    });
  });
});
