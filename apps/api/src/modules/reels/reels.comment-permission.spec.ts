import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReelsService } from './reels.service';
import { StreamService } from '../stream/stream.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ReelsService — Comment Permission Enforcement', () => {
  let service: ReelsService;
  let prisma: any;

  const reelOwner = 'user-owner';
  const follower = 'user-follower';
  const stranger = 'user-stranger';

  function makeReel(overrides: Record<string, unknown> = {}) {
    return {
      id: 'reel-1',
      userId: reelOwner,
      status: 'READY',
      isRemoved: false,
      commentPermission: 'EVERYONE',
      ...overrides,
    };
  }

  const mockComment = {
    id: 'rc-1', content: 'Great reel', userId: follower, reelId: 'reel-1', likesCount: 0,
    createdAt: new Date(),
    user: { id: follower, username: 'follower', displayName: 'Follower', avatarUrl: null, isVerified: false },
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
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
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

  describe('commentPermission: EVERYONE', () => {
    it('should allow anyone to comment', async () => {
      prisma.reel.findUnique.mockResolvedValue(makeReel());
      prisma.$transaction.mockResolvedValue([mockComment, {}]);

      const result = await service.comment('reel-1', stranger, 'Nice!');
      expect(result).toBeDefined();
    });
  });

  describe('commentPermission: NOBODY', () => {
    it('should block all comments', async () => {
      prisma.reel.findUnique.mockResolvedValue(makeReel({ commentPermission: 'NOBODY' }));

      await expect(
        service.comment('reel-1', follower, 'Hello'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('commentPermission: FOLLOWERS', () => {
    it('should allow followers', async () => {
      prisma.reel.findUnique.mockResolvedValue(makeReel({ commentPermission: 'FOLLOWERS' }));
      prisma.follow.findUnique.mockResolvedValue({ followerId: follower, followingId: reelOwner });
      prisma.$transaction.mockResolvedValue([mockComment, {}]);

      const result = await service.comment('reel-1', follower, 'Great!');
      expect(result).toBeDefined();
    });

    it('should block non-followers', async () => {
      prisma.reel.findUnique.mockResolvedValue(makeReel({ commentPermission: 'FOLLOWERS' }));
      prisma.follow.findUnique.mockResolvedValue(null);

      await expect(
        service.comment('reel-1', stranger, 'Hello'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow reel owner', async () => {
      prisma.reel.findUnique.mockResolvedValue(makeReel({ commentPermission: 'FOLLOWERS' }));
      prisma.$transaction.mockResolvedValue([{ ...mockComment, userId: reelOwner }, {}]);

      const result = await service.comment('reel-1', reelOwner, 'My reel');
      expect(result).toBeDefined();
    });
  });

  describe('carousel reel comments', () => {
    it('should enforce permission on carousel reels too', async () => {
      prisma.reel.findUnique.mockResolvedValue(makeReel({
        commentPermission: 'NOBODY',
        isPhotoCarousel: true,
        carouselUrls: ['https://example.com/1.jpg'],
      }));

      await expect(
        service.comment('reel-1', stranger, 'Nice carousel'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('null commentPermission (defaults)', () => {
    it('should allow comments when commentPermission is null', async () => {
      prisma.reel.findUnique.mockResolvedValue(makeReel({ commentPermission: null }));
      prisma.$transaction.mockResolvedValue([mockComment, {}]);

      const result = await service.comment('reel-1', stranger, 'Hello');
      expect(result).toBeDefined();
    });
  });
});
