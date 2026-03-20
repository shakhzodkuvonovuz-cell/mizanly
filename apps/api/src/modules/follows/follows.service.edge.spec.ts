import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { FollowsService } from './follows.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('FollowsService — edge cases', () => {
  let service: FollowsService;
  let prisma: any;

  const userA = 'user-a';
  const userB = 'user-b';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        FollowsService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            follow: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            followRequest: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            block: { findFirst: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
        },
      ],
    }).compile();

    service = module.get<FollowsService>(FollowsService);
    prisma = module.get(PrismaService);
  });

  describe('follow — edge cases', () => {
    it('should throw BadRequestException when following yourself', async () => {
      await expect(service.follow(userA, userA))
        .rejects.toThrow(BadRequestException);
    });

    it('should return idempotent success when already following', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB, isPrivate: false, isDeactivated: false, isBanned: false });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue({ followerId: userA, followingId: userB });

      const result = await service.follow(userA, userB);
      expect(result.type).toBe('follow');
      expect(result.follow).toBeDefined();
    });

    it('should create FollowRequest for private account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB, isPrivate: true, isDeactivated: false, isBanned: false });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.followRequest.findUnique.mockResolvedValue(null);
      prisma.followRequest.create.mockResolvedValue({ id: 'req-1', senderId: userA, receiverId: userB, status: 'PENDING' });

      const result = await service.follow(userA, userB);
      expect(result.type).toBe('request');
      expect(prisma.followRequest.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException for deactivated user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB, isPrivate: false, isDeactivated: true, isBanned: false });

      await expect(service.follow(userA, userB))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('unfollow — edge cases', () => {
    it('should return success even when not following (idempotent)', async () => {
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.unfollow(userA, userB);
      expect(result.message).toBe('Unfollowed');
    });
  });

  describe('getFollowers — edge cases', () => {
    it('should return empty array for user with 0 followers', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userA });
      prisma.follow.findMany.mockResolvedValue([]);

      const result = await service.getFollowers(userA);
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getFollowing — edge cases', () => {
    it('should return empty array for user following 0 users', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userA });
      prisma.follow.findMany.mockResolvedValue([]);

      const result = await service.getFollowing(userA);
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('acceptRequest — edge cases', () => {
    it('should throw NotFoundException for non-existent request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue(null);

      await expect(service.acceptRequest(userA, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
