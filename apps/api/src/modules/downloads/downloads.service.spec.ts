import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DownloadsService } from './downloads.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DownloadsService', () => {
  let service: DownloadsService;
  let prisma: any;

  const mockDownload = {
    id: 'dl-1',
    userId: 'user-1',
    contentType: 'video',
    contentId: 'video-1',
    quality: 'auto',
    fileSize: 0,
    status: 'pending',
    progress: 0,
    filePath: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        DownloadsService,
        {
          provide: PrismaService,
          useValue: {
            video: { findUnique: jest.fn() },
            post: { findUnique: jest.fn() },
            reel: { findUnique: jest.fn() },
            offlineDownload: {
              upsert: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              aggregate: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DownloadsService>(DownloadsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('requestDownload', () => {
    it('should create a download request for a video', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1', status: 'PUBLISHED', hlsUrl: 'https://stream.test/v.m3u8',
      });
      prisma.offlineDownload.upsert.mockResolvedValue(mockDownload);

      const result = await service.requestDownload('user-1', {
        contentId: 'video-1', contentType: 'video',
      });

      expect(result).toEqual(mockDownload);
    });

    it('should throw NotFoundException for non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.requestDownload('user-1', {
        contentId: 'video-1', contentType: 'video',
      })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-published video', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'video-1', status: 'DRAFT' });
      await expect(service.requestDownload('user-1', {
        contentId: 'video-1', contentType: 'video',
      })).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when post download is disabled', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', isDownloadable: false, mediaUrls: ['test'] });
      await expect(service.requestDownload('user-1', {
        contentId: 'post-1', contentType: 'post',
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getDownloads', () => {
    it('should return paginated downloads', async () => {
      prisma.offlineDownload.findMany.mockResolvedValue([mockDownload]);
      const result = await service.getDownloads('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should filter by status', async () => {
      prisma.offlineDownload.findMany.mockResolvedValue([]);
      await service.getDownloads('user-1', 'complete');
      expect(prisma.offlineDownload.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'complete' }) }),
      );
    });
  });

  describe('updateProgress', () => {
    it('should update download progress', async () => {
      prisma.offlineDownload.update.mockResolvedValue({ ...mockDownload, progress: 0.5, status: 'downloading' });
      const result = await service.updateProgress('user-1', 'dl-1', 0.5);
      expect(result.progress).toBe(0.5);
      expect(result.status).toBe('downloading');
    });

    it('should mark as complete at progress 1.0', async () => {
      prisma.offlineDownload.update.mockResolvedValue({ ...mockDownload, progress: 1, status: 'complete' });
      const result = await service.updateProgress('user-1', 'dl-1', 1.0);
      expect(result.status).toBe('complete');
    });
  });

  describe('getStorageUsed', () => {
    it('should return total bytes and file count', async () => {
      prisma.offlineDownload.aggregate.mockResolvedValue({
        _sum: { fileSize: 1048576 },
        _count: 3,
      });

      const result = await service.getStorageUsed('user-1');
      expect(result.totalBytes).toBe(1048576);
      expect(result.totalFiles).toBe(3);
    });

    it('should return zero when no downloads', async () => {
      prisma.offlineDownload.aggregate.mockResolvedValue({
        _sum: { fileSize: null },
        _count: 0,
      });

      const result = await service.getStorageUsed('user-1');
      expect(result.totalBytes).toBe(0);
      expect(result.totalFiles).toBe(0);
    });
  });

  describe('deleteDownload', () => {
    it('should delete a download record', async () => {
      prisma.offlineDownload.delete.mockResolvedValue(mockDownload);
      await service.deleteDownload('user-1', 'dl-1');
      expect(prisma.offlineDownload.delete).toHaveBeenCalledWith({
        where: { id: 'dl-1', userId: 'user-1' },
      });
    });
  });
});
