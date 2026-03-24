import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReelsService } from './reels.service';
import { StreamService } from '../stream/stream.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * Tests for Photo Carousel reels — Session 5.
 * Covers: creation, carousel field validation, per-slide text,
 * behavior differences from regular video reels.
 */
describe('ReelsService — Photo Carousel', () => {
  let service: ReelsService;
  let prisma: any;
  let stream: any;

  const userId = 'user-carousel';

  const carouselDto = {
    videoUrl: 'https://r2.example.com/slide1.jpg',
    duration: 15, // 3 slides × 5 seconds
    isPhotoCarousel: true,
    carouselUrls: [
      'https://r2.example.com/slide1.jpg',
      'https://r2.example.com/slide2.jpg',
      'https://r2.example.com/slide3.jpg',
    ],
    carouselTexts: ['First slide', 'Second slide', ''],
    caption: 'My first carousel',
  };

  const baseMockReel = {
    id: 'reel-carousel',
    userId,
    videoUrl: carouselDto.videoUrl,
    duration: carouselDto.duration,
    caption: carouselDto.caption,
    status: 'PROCESSING',
    mentions: [],
    hashtags: [],
    isPhotoCarousel: true,
    carouselUrls: carouselDto.carouselUrls,
    carouselTexts: carouselDto.carouselTexts,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isRemoved: false,
    createdAt: new Date(),
    user: { id: userId, username: 'carousel_user', displayName: 'Carousel User', avatarUrl: null, isVerified: false },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ReelsService,
        {
          provide: PrismaService,
          useValue: {
            reel: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            reelReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            reelInteraction: { create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            reelComment: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), update: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
            mute: { findMany: jest.fn() },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
        },
        {
          provide: StreamService,
          useValue: { uploadFromUrl: jest.fn().mockResolvedValue('stream-id') },
        },
        {
          provide: 'REDIS',
          useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService) as any;
    stream = module.get(StreamService) as any;
  });

  describe('carousel creation', () => {
    it('should create a carousel reel with slide URLs and texts', async () => {
      prisma.$transaction.mockResolvedValue([baseMockReel, undefined]);

      const result = await service.create(userId, carouselDto);

      expect(result).toBeDefined();
      expect(result.isPhotoCarousel).toBe(true);
      expect(result.carouselUrls).toHaveLength(3);
      expect(result.carouselTexts).toEqual(['First slide', 'Second slide', '']);
    });

    it('should create carousel with empty texts array', async () => {
      const dto = { ...carouselDto, carouselTexts: [] };
      prisma.$transaction.mockResolvedValue([{ ...baseMockReel, carouselTexts: [] }, undefined]);

      const result = await service.create(userId, dto);
      expect(result).toBeDefined();
    });

    it('should create carousel without carouselTexts', async () => {
      const { carouselTexts, ...dto } = carouselDto;
      prisma.$transaction.mockResolvedValue([{ ...baseMockReel, carouselTexts: [] }, undefined]);

      const result = await service.create(userId, dto);
      expect(result).toBeDefined();
    });

    it('should accept carousel with publish fields', async () => {
      const dto = {
        ...carouselDto,
        altText: 'Three photos of sunset',
        locationName: 'Bondi Beach',
        locationLat: -33.8915,
        locationLng: 151.2767,
        topics: ['travel', 'photography'],
        brandedContent: false,
        remixAllowed: true,
        commentPermission: 'EVERYONE',
      };
      prisma.$transaction.mockResolvedValue([{ ...baseMockReel, ...dto }, undefined]);

      const result = await service.create(userId, dto);
      expect(result).toBeDefined();
    });

    it('should still trigger Stream upload for carousel primary image', async () => {
      prisma.$transaction.mockResolvedValue([baseMockReel, undefined]);

      await service.create(userId, carouselDto);

      // Stream service should be called with the videoUrl (first slide)
      expect(stream.uploadFromUrl).toHaveBeenCalledWith(
        carouselDto.videoUrl,
        expect.objectContaining({ creatorId: userId }),
      );
    });

    it('should reject carousel with fewer than 2 slides', async () => {
      const dto = {
        ...carouselDto,
        carouselUrls: ['https://r2.example.com/single.jpg'],
        carouselTexts: ['Only slide'],
      };

      await expect(service.create(userId, dto)).rejects.toThrow('at least 2 images');
    });

    it('should reject carousel with empty carouselUrls', async () => {
      const dto = { ...carouselDto, carouselUrls: [] };
      await expect(service.create(userId, dto)).rejects.toThrow('at least 2 images');
    });

    it('should handle carousel with 35 slides (maximum)', async () => {
      const urls = Array.from({ length: 35 }, (_, i) => `https://r2.example.com/slide${i}.jpg`);
      const texts = Array.from({ length: 35 }, (_, i) => `Slide ${i + 1}`);
      const dto = { ...carouselDto, carouselUrls: urls, carouselTexts: texts };
      prisma.$transaction.mockResolvedValue([{ ...baseMockReel, carouselUrls: urls, carouselTexts: texts }, undefined]);

      const result = await service.create(userId, dto);
      expect(result).toBeDefined();
    });
  });

  describe('carousel vs video behavior', () => {
    it('should not skip Stream upload even for carousels', async () => {
      prisma.$transaction.mockResolvedValue([baseMockReel, undefined]);

      await service.create(userId, carouselDto);

      // Carousel still gets a stream entry (for thumbnail generation)
      expect(stream.uploadFromUrl).toHaveBeenCalled();
    });

    it('should keep regular video behavior for non-carousel', async () => {
      const videoDto = {
        videoUrl: 'https://r2.example.com/reel.mp4',
        duration: 30,
        caption: 'Regular reel',
      };
      const videoReel = {
        ...baseMockReel,
        id: 'reel-video',
        isPhotoCarousel: false,
        carouselUrls: [],
        carouselTexts: [],
      };
      prisma.$transaction.mockResolvedValue([videoReel, undefined]);

      const result = await service.create(userId, videoDto);

      expect(result.isPhotoCarousel).toBe(false);
      expect(result.carouselUrls).toEqual([]);
    });
  });
});
