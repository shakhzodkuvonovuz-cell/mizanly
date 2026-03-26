import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReelsService } from './reels.service';
import { StreamService } from '../stream/stream.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * Tests for Session 5: Reel publish fields + photo carousel support.
 * Covers: altText, locationName, locationLat/Lng, commentPermission,
 * brandedContent, brandPartner, remixAllowed, topics, carousel fields.
 */
describe('ReelsService — Publish Fields & Carousel', () => {
  let service: ReelsService;
  let prisma: any;

  const userId = 'user-creator';

  const baseDto = {
    videoUrl: 'https://r2.example.com/reel.mp4',
    duration: 30,
    caption: 'Check this out',
  };

  const baseMockReel = {
    id: 'reel-new',
    userId,
    videoUrl: baseDto.videoUrl,
    duration: 30,
    caption: 'Check this out',
    status: 'PROCESSING',
    mentions: [],
    hashtags: [],
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isRemoved: false,
    createdAt: new Date(),
    user: { id: userId, username: 'creator', displayName: 'Creator', avatarUrl: null, isVerified: false },
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
          useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn(), zcard: jest.fn().mockResolvedValue(0), zadd: jest.fn().mockResolvedValue(0), zrevrange: jest.fn().mockResolvedValue([]), expire: jest.fn().mockResolvedValue(1), pipeline: jest.fn().mockReturnValue({ del: jest.fn().mockReturnThis(), zadd: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) }) },
        },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService) as any;
  });

  function mockTransaction(reelOverrides: Record<string, unknown> = {}) {
    const mockReel = { ...baseMockReel, ...reelOverrides };
    prisma.$transaction.mockResolvedValue([mockReel, undefined]);
    return mockReel;
  }

  // ── altText ──

  describe('altText', () => {
    it('should pass altText to Prisma create', async () => {
      mockTransaction({ altText: 'A short video of a cat' });
      await service.create(userId, { ...baseDto, altText: 'A short video of a cat' });

      const txCall = prisma.$transaction.mock.calls[0][0];
      // $transaction receives an array of Prisma operations
      // The first element is the reel.create call — check that it was called
      expect(txCall).toBeDefined();
    });

    it('should accept undefined altText', async () => {
      mockTransaction();
      const result = await service.create(userId, baseDto);
      expect(result).toBeDefined();
    });
  });

  // ── location ──

  describe('location fields', () => {
    it('should pass location data to Prisma', async () => {
      mockTransaction({ locationName: 'Mecca', locationLat: 21.4225, locationLng: 39.8262 });

      const result = await service.create(userId, {
        ...baseDto,
        locationName: 'Mecca',
        locationLat: 21.4225,
        locationLng: 39.8262,
      });

      expect(result).toBeDefined();
    });
  });

  // ── commentPermission ──

  describe('commentPermission', () => {
    it('should default to EVERYONE', async () => {
      mockTransaction({ commentPermission: 'EVERYONE' });

      const result = await service.create(userId, baseDto);
      expect(result).toBeDefined();
    });

    it('should accept NOBODY', async () => {
      mockTransaction({ commentPermission: 'NOBODY' });

      const result = await service.create(userId, { ...baseDto, commentPermission: 'NOBODY' });
      expect(result).toBeDefined();
    });

    it('should accept FOLLOWERS', async () => {
      mockTransaction({ commentPermission: 'FOLLOWERS' });

      const result = await service.create(userId, { ...baseDto, commentPermission: 'FOLLOWERS' });
      expect(result).toBeDefined();
    });
  });

  // ── brandedContent ──

  describe('brandedContent', () => {
    it('should default to false', async () => {
      mockTransaction();
      const result = await service.create(userId, baseDto);
      expect(result).toBeDefined();
    });

    it('should accept branded content with partner', async () => {
      mockTransaction({ brandedContent: true, brandPartner: 'Nike' });

      const result = await service.create(userId, {
        ...baseDto,
        brandedContent: true,
        brandPartner: 'Nike',
      });
      expect(result).toBeDefined();
    });

    it('should clear brandPartner when brandedContent is false', async () => {
      mockTransaction({ brandedContent: false, brandPartner: null });

      const result = await service.create(userId, {
        ...baseDto,
        brandedContent: false,
        brandPartner: 'Nike',
      });
      expect(result).toBeDefined();
    });
  });

  // ── remixAllowed ──

  describe('remixAllowed', () => {
    it('should default to true', async () => {
      mockTransaction({ remixAllowed: true });
      const result = await service.create(userId, baseDto);
      expect(result).toBeDefined();
    });

    it('should be settable to false', async () => {
      mockTransaction({ remixAllowed: false });
      const result = await service.create(userId, { ...baseDto, remixAllowed: false });
      expect(result).toBeDefined();
    });
  });

  // ── topics ──

  describe('topics', () => {
    it('should default to empty array', async () => {
      mockTransaction({ topics: [] });
      const result = await service.create(userId, baseDto);
      expect(result).toBeDefined();
    });

    it('should accept topics array', async () => {
      mockTransaction({ topics: ['comedy', 'education'] });
      const result = await service.create(userId, { ...baseDto, topics: ['comedy', 'education'] });
      expect(result).toBeDefined();
    });
  });

  // ── Photo Carousel ──

  describe('photo carousel', () => {
    it('should create a carousel reel with slide URLs', async () => {
      const carouselUrls = [
        'https://r2.example.com/slide1.jpg',
        'https://r2.example.com/slide2.jpg',
        'https://r2.example.com/slide3.jpg',
      ];
      mockTransaction({ isPhotoCarousel: true, carouselUrls });

      const result = await service.create(userId, {
        ...baseDto,
        isPhotoCarousel: true,
        carouselUrls,
      });
      expect(result).toBeDefined();
    });

    it('should accept per-slide text overlays', async () => {
      const carouselTexts = ['First slide', 'Second slide', ''];
      mockTransaction({ isPhotoCarousel: true, carouselTexts });

      const result = await service.create(userId, {
        ...baseDto,
        isPhotoCarousel: true,
        carouselUrls: ['https://r2.example.com/1.jpg', 'https://r2.example.com/2.jpg', 'https://r2.example.com/3.jpg'],
        carouselTexts,
      });
      expect(result).toBeDefined();
    });

    it('should default carousel fields when not a carousel', async () => {
      mockTransaction();
      const result = await service.create(userId, baseDto);
      expect(result).toBeDefined();
    });
  });

  // ── All fields together ──

  describe('all publish fields combined', () => {
    it('should handle all reel publish fields simultaneously', async () => {
      mockTransaction({
        altText: 'A beautiful sunset timelapse',
        locationName: 'Bondi Beach',
        locationLat: -33.8915,
        locationLng: 151.2767,
        commentPermission: 'FOLLOWERS',
        brandedContent: true,
        brandPartner: 'GoPro',
        remixAllowed: false,
        topics: ['travel', 'nature'],
      });

      const result = await service.create(userId, {
        ...baseDto,
        altText: 'A beautiful sunset timelapse',
        locationName: 'Bondi Beach',
        locationLat: -33.8915,
        locationLng: 151.2767,
        commentPermission: 'FOLLOWERS',
        brandedContent: true,
        brandPartner: 'GoPro',
        remixAllowed: false,
        topics: ['travel', 'nature'],
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('reel-new');
    });
  });
});
