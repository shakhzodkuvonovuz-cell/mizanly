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
    expect(service).toBeInstanceOf(ThumbnailsService);
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
      expect(result).toEqual({ thumbnailUrl: 'url2', variantId: '2' });
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

  describe('trackClick', () => {
    it('should increment clicks', async () => {
      mockPrisma.thumbnailVariant.update.mockResolvedValue({ id: '1', clicks: 5 });
      const result = await service.trackClick('1');
      expect(result).toEqual({ tracked: true });
      expect(mockPrisma.thumbnailVariant.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { clicks: { increment: 1 } },
      });
    });
  });

  describe('getVariants', () => {
    it('should return variants with CTR stats', async () => {
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([
        { id: '1', thumbnailUrl: 'url1', impressions: 1000, clicks: 50, isWinner: false, createdAt: new Date() },
        { id: '2', thumbnailUrl: 'url2', impressions: 1000, clicks: 80, isWinner: true, createdAt: new Date() },
      ]);
      const result = await service.getVariants('post', 'post-1');
      expect(result).not.toBeNull();
      expect(result!.variants).toHaveLength(2);
      expect(result!.variants[0].ctr).toBe(5);
      expect(result!.variants[1].ctr).toBe(8);
      expect(result!.testComplete).toBe(true);
      expect(result!.winner!.id).toBe('2');
      expect(result!.totalImpressions).toBe(2000);
    });

    it('should return null when no variants exist', async () => {
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([]);
      const result = await service.getVariants('post', 'missing');
      expect(result).toBeNull();
    });

    it('should show testComplete false when no winner', async () => {
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([
        { id: '1', thumbnailUrl: 'url1', impressions: 100, clicks: 5, isWinner: false, createdAt: new Date() },
        { id: '2', thumbnailUrl: 'url2', impressions: 100, clicks: 10, isWinner: false, createdAt: new Date() },
      ]);
      const result = await service.getVariants('post', 'post-1');
      expect(result!.testComplete).toBe(false);
      expect(result!.winner).toBeNull();
    });
  });

  describe('serveThumbnail — random assignment', () => {
    it('should return a URL from one of the variants with variantId', async () => {
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([
        { id: '1', thumbnailUrl: 'url1', isWinner: false },
        { id: '2', thumbnailUrl: 'url2', isWinner: false },
      ]);
      mockPrisma.thumbnailVariant.update.mockResolvedValue({ id: '1', impressions: 1, contentType: 'post', contentId: 'post-1', isWinner: false });
      const result = await service.serveThumbnail('post', 'post-1');
      expect(result).not.toBeNull();
      expect(['url1', 'url2']).toContain(result!.thumbnailUrl);
      expect(['1', '2']).toContain(result!.variantId);
    });
  });

  describe('createVariants — 3 variants', () => {
    it('should create 3 variants successfully', async () => {
      mockPrisma.thumbnailVariant.count.mockResolvedValue(0);
      mockPrisma.thumbnailVariant.create
        .mockResolvedValueOnce({ id: '1', thumbnailUrl: 'url1' })
        .mockResolvedValueOnce({ id: '2', thumbnailUrl: 'url2' })
        .mockResolvedValueOnce({ id: '3', thumbnailUrl: 'url3' });
      const result = await service.createVariants('reel', 'r1', ['url1', 'url2', 'url3']);
      expect(result).toHaveLength(3);
    });
  });

  describe('getVariants — zero impressions CTR', () => {
    it('should return 0 CTR when impressions is 0', async () => {
      mockPrisma.thumbnailVariant.findMany.mockResolvedValue([
        { id: '1', thumbnailUrl: 'url1', impressions: 0, clicks: 0, isWinner: false, createdAt: new Date() },
      ]);
      const result = await service.getVariants('post', 'post-1');
      expect(result!.variants[0].ctr).toBe(0);
    });
  });
});
