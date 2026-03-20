import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { UsersService } from './users.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('UsersService — edge cases', () => {
  let service: UsersService;
  let prisma: any;
  let redis: any;

  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            report: { create: jest.fn() },
            device: { deleteMany: jest.fn() },
            block: { findFirst: jest.fn() },
            follow: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            followRequest: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            post: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findMany: jest.fn().mockResolvedValue([]) },
            savedPost: { findMany: jest.fn().mockResolvedValue([]) },
            threadBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            reelInteraction: { findMany: jest.fn().mockResolvedValue([]) },
            reelBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            videoBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            watchLater: { findMany: jest.fn().mockResolvedValue([]) },
            draftPost: { findMany: jest.fn().mockResolvedValue([]) },
            creatorStat: { findMany: jest.fn().mockResolvedValue([]) },
            comment: { findMany: jest.fn().mockResolvedValue([]) },
            message: { findMany: jest.fn().mockResolvedValue([]) },
            postReaction: { findMany: jest.fn().mockResolvedValue([]) },
            reel: { findMany: jest.fn().mockResolvedValue([]) },
            video: { findMany: jest.fn().mockResolvedValue([]) },
            watchHistory: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            watchLaterItem: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS');
  });

  describe('updateProfile — input edge cases', () => {
    it('should handle Arabic displayName', async () => {
      prisma.user.update.mockResolvedValue({
        id: userId,
        username: 'testuser',
        displayName: 'عبد الله',
        bio: null,
        avatarUrl: null,
      });

      const result = await service.updateProfile(userId, { displayName: 'عبد الله' } as any);
      expect(result.displayName).toBe('عبد الله');
      // Redis cache should be invalidated
      expect(redis.del).toHaveBeenCalled();
    });

    it('should handle displayName containing emoji', async () => {
      prisma.user.update.mockResolvedValue({
        id: userId,
        username: 'testuser',
        displayName: 'Ahmed 🕌',
      });

      const result = await service.updateProfile(userId, { displayName: 'Ahmed 🕌' } as any);
      expect(result.displayName).toBe('Ahmed 🕌');
    });

    it('should strip HTML tags from bio via sanitizeText', async () => {
      prisma.user.update.mockResolvedValue({
        id: userId,
        username: 'testuser',
        displayName: 'Test',
        bio: 'Just a bio',
      });

      await service.updateProfile(userId, { bio: '<b>Just a bio</b>' } as any);

      // Verify sanitizeText was called — the data passed to update should have sanitized bio
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.bio).not.toContain('<b>');
    });
  });

  describe('getProfile — edge cases', () => {
    it('should throw NotFoundException for non-existent username', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when blocked user views profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target-id',
        username: 'blocked',
        isDeactivated: false,
        isBanned: false,
      });
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

      await expect(service.getProfile('blocked', userId))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByPhoneNumbers — edge cases', () => {
    it('should return empty array when given empty phone numbers list', async () => {
      const result = await service.findByPhoneNumbers(userId, []);
      expect(result).toEqual([]);
    });

    it('should normalize phone numbers (strip non-digits, take last 10)', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.findByPhoneNumbers(userId, ['+1 (555) 123-4567']);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone: { in: ['5551234567'] },
          }),
        }),
      );
    });
  });

  describe('getMutualFollowers — edge cases', () => {
    it('should throw NotFoundException for non-existent target user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMutualFollowers(userId, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate — edge cases', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getMe — edge cases', () => {
    it('should throw NotFoundException when user ID does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('nonexistent-id'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
