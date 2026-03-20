import { Test, TestingModule } from '@nestjs/testing';
import { ThumbnailsService } from './thumbnails.service';
import { PrismaService } from '../../config/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('ThumbnailsService', () => {
  let service: ThumbnailsService;

  const mockPrisma = {
    thumbnailVariant: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThumbnailsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ThumbnailsService>(ThumbnailsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createVariants', () => {
    it('should reject less than 2 thumbnails', async () => {
      await expect(
        service.createVariants('post', 'post-1', ['url1']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject more than 3 thumbnails', async () => {
      await expect(
        service.createVariants('post', 'post-1', ['url1', 'url2', 'url3', 'url4']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if variants already exist', async () => {
      mockPrisma.thumbnailVariant.count.mockResolvedValue(2);
      await expect(
        service.createVariants('post', 'post-1', ['url1', 'url2']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create variants when valid', async () => {
      mockPrisma.thumbnailVariant.count.mockResolvedValue(0);
      mockPrisma.thumbnailVariant.create
        .mockResolvedValueOnce({ id: '1', thumbnailUrl: 'url1' })
        .mockResolvedValueOnce({ id: '2', thumbnailUrl: 'url2' });

      const result = await service.createVariants('post', 'post-1', ['url1', 'url2']);
      expect(result).toHaveLength(2);
    });
  });

  describe('serveThumbnail', () => {
    it('should return null when no variants exist', async () => {
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([]);
      const result = await service.serveThumbnail('post', 'post-1');
      expect(result).toBeNull();
    });

    it('should return winner URL when winner exists', async () => {
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([
        { id: '1', thumbnailUrl: 'url1', isWinner: false, impressions: 500 },
        { id: '2', thumbnailUrl: 'url2', isWinner: true, impressions: 500 },
      ]);
      const result = await service.serveThumbnail('post', 'post-1');
      expect(result).toBe('url2');
    });
  });

  describe('trackImpression', () => {
    it('should increment impressions', async () => {
      mockPrisma.thumbnailVariant.update.mockResolvedValue({
        id: '1', contentType: 'post', contentId: 'post-1', impressions: 1, isWinner: false,
      });
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([
        { id: '1', impressions: 1, clicks: 0, isWinner: false },
      ]);
      const result = await service.trackImpression('1');
      expect(result).toEqual({ tracked: true });
    });
  });
});
