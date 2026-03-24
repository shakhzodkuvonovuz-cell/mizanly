import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReelsService } from './reels.service';
import { StreamService } from '../stream/stream.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * Carousel validation tests — ensuring data integrity before DB write.
 */
describe('ReelsService — Carousel Validation', () => {
  let service: ReelsService;
  let prisma: any;

  const userId = 'user-val';
  const baseCarouselDto = {
    videoUrl: 'https://r2.example.com/slide1.jpg',
    duration: 15,
    isPhotoCarousel: true,
    carouselUrls: ['https://r2.example.com/s1.jpg', 'https://r2.example.com/s2.jpg', 'https://r2.example.com/s3.jpg'],
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
            follow: { findUnique: jest.fn() },
            reelTaggedUser: { createMany: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n1' }) } },
        { provide: StreamService, useValue: { uploadFromUrl: jest.fn().mockResolvedValue('stream-id') } },
        { provide: 'REDIS', useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();
    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService);
  });

  describe('minimum slide count', () => {
    it('should reject carousel with 0 slides', async () => {
      await expect(
        service.create(userId, { ...baseCarouselDto, carouselUrls: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject carousel with 1 slide', async () => {
      await expect(
        service.create(userId, { ...baseCarouselDto, carouselUrls: ['https://r2.example.com/single.jpg'] }),
      ).rejects.toThrow('at least 2 images');
    });

    it('should accept carousel with exactly 2 slides', async () => {
      const mockReel = { id: 'reel-2', userId, status: 'PROCESSING', isPhotoCarousel: true, carouselUrls: ['a', 'b'], createdAt: new Date(), user: { id: userId, username: 'u', displayName: 'U', avatarUrl: null, isVerified: false } };
      prisma.$transaction.mockResolvedValue([mockReel, undefined]);

      const result = await service.create(userId, {
        ...baseCarouselDto,
        carouselUrls: ['https://r2.example.com/a.jpg', 'https://r2.example.com/b.jpg'],
      });
      expect(result).toBeDefined();
    });
  });

  describe('carouselTexts parity', () => {
    it('should reject when carouselTexts has MORE items than carouselUrls', async () => {
      await expect(
        service.create(userId, {
          ...baseCarouselDto,
          carouselTexts: ['a', 'b', 'c', 'd'], // 4 texts for 3 URLs
        }),
      ).rejects.toThrow('carouselTexts cannot have more items');
    });

    it('should accept when carouselTexts has FEWER items than carouselUrls', async () => {
      const mockReel = { id: 'reel-fewer', userId, status: 'PROCESSING', isPhotoCarousel: true, carouselUrls: baseCarouselDto.carouselUrls, createdAt: new Date(), user: { id: userId, username: 'u', displayName: 'U', avatarUrl: null, isVerified: false } };
      prisma.$transaction.mockResolvedValue([mockReel, undefined]);

      const result = await service.create(userId, {
        ...baseCarouselDto,
        carouselTexts: ['only first'], // 1 text for 3 URLs — OK
      });
      expect(result).toBeDefined();
    });

    it('should accept when carouselTexts has SAME count as carouselUrls', async () => {
      const mockReel = { id: 'reel-same', userId, status: 'PROCESSING', isPhotoCarousel: true, carouselUrls: baseCarouselDto.carouselUrls, createdAt: new Date(), user: { id: userId, username: 'u', displayName: 'U', avatarUrl: null, isVerified: false } };
      prisma.$transaction.mockResolvedValue([mockReel, undefined]);

      const result = await service.create(userId, {
        ...baseCarouselDto,
        carouselTexts: ['a', 'b', 'c'],
      });
      expect(result).toBeDefined();
    });

    it('should accept empty carouselTexts array', async () => {
      const mockReel = { id: 'reel-empty-texts', userId, status: 'PROCESSING', isPhotoCarousel: true, carouselUrls: baseCarouselDto.carouselUrls, createdAt: new Date(), user: { id: userId, username: 'u', displayName: 'U', avatarUrl: null, isVerified: false } };
      prisma.$transaction.mockResolvedValue([mockReel, undefined]);

      const result = await service.create(userId, {
        ...baseCarouselDto,
        carouselTexts: [],
      });
      expect(result).toBeDefined();
    });

    it('should accept undefined carouselTexts', async () => {
      const mockReel = { id: 'reel-no-texts', userId, status: 'PROCESSING', isPhotoCarousel: true, carouselUrls: baseCarouselDto.carouselUrls, createdAt: new Date(), user: { id: userId, username: 'u', displayName: 'U', avatarUrl: null, isVerified: false } };
      prisma.$transaction.mockResolvedValue([mockReel, undefined]);

      const result = await service.create(userId, baseCarouselDto);
      expect(result).toBeDefined();
    });
  });

  describe('non-carousel reels skip validation', () => {
    it('should not validate carousel fields for regular video reels', async () => {
      const mockReel = { id: 'reel-video', userId, status: 'PROCESSING', isPhotoCarousel: false, carouselUrls: [], createdAt: new Date(), user: { id: userId, username: 'u', displayName: 'U', avatarUrl: null, isVerified: false } };
      prisma.$transaction.mockResolvedValue([mockReel, undefined]);

      const result = await service.create(userId, {
        videoUrl: 'https://r2.example.com/reel.mp4',
        duration: 30,
      });
      expect(result).toBeDefined();
    });
  });

  describe('duration calculation', () => {
    it('should accept duration up to 180 (reel max)', async () => {
      const mockReel = { id: 'reel-max', userId, status: 'PROCESSING', isPhotoCarousel: true, carouselUrls: baseCarouselDto.carouselUrls, createdAt: new Date(), user: { id: userId, username: 'u', displayName: 'U', avatarUrl: null, isVerified: false } };
      prisma.$transaction.mockResolvedValue([mockReel, undefined]);

      const result = await service.create(userId, {
        ...baseCarouselDto,
        duration: 180,
      });
      expect(result).toBeDefined();
    });
  });
});
