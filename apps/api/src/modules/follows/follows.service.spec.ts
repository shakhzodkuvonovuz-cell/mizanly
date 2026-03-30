import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FollowsService } from './follows.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FollowsService', () => {
  let service: FollowsService;
  let prisma: any;
  let notifications: any;

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
              update: jest.fn(),
            },
            follow: {
              create: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              findMany: jest.fn(),
            },
            followRequest: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            block: {
              findFirst: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<FollowsService>(FollowsService);
    prisma = module.get(PrismaService) as any;
    notifications = module.get(NotificationsService) as any;
  });

  describe('follow', () => {
    it('should create a follow record and increment counts for public user', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      const mockUser = {
        id: targetUserId,
        isPrivate: false,
        isDeactivated: false,
        isBanned: false,
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null);
      const mockFollow = {
        id: 'follow-789',
        followerId: currentUserId,
        followingId: targetUserId,
        createdAt: new Date(),
      };
      prisma.follow.create.mockResolvedValue(mockFollow);
      prisma.user.update.mockResolvedValue({}); // mock user update
      notifications.create.mockResolvedValue(undefined);
      prisma.$transaction.mockImplementation(async (queries: any[]) => {
        const results = [];
        for (const query of queries) {
          results.push(await query);
        }
        return results;
      });

      const result = await service.follow(currentUserId, targetUserId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: targetUserId },
        select: { id: true, username: true, isPrivate: true, isDeactivated: true, isBanned: true },
      });
      expect(prisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: currentUserId, blockedId: targetUserId },
            { blockerId: targetUserId, blockedId: currentUserId },
          ],
        },
      });
      expect(prisma.follow.findUnique).toHaveBeenCalledWith({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.follow.create).toHaveBeenCalledWith({
        data: { followerId: currentUserId, followingId: targetUserId },
      });
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: targetUserId,
        actorId: currentUserId,
        type: 'FOLLOW',
      });
      expect(result).toEqual({ type: 'follow', follow: mockFollow });
    });

    it('should throw BadRequestException when trying to follow yourself', async () => {
      const userId = 'user-123';
      await expect(service.follow(userId, userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when target user does not exist', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.follow(currentUserId, targetUserId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when block exists', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      const mockUser = {
        id: targetUserId,
        isPrivate: false,
        isDeactivated: false,
        isBanned: false,
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue({ blockerId: currentUserId, blockedId: targetUserId });
      await expect(service.follow(currentUserId, targetUserId)).rejects.toThrow(ForbiddenException);
    });

    it('should return existing follow when already following (idempotent)', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      const mockUser = {
        id: targetUserId,
        isPrivate: false,
        isDeactivated: false,
        isBanned: false,
      };
      const existingFollow = { followerId: currentUserId, followingId: targetUserId };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(existingFollow);
      const result = await service.follow(currentUserId, targetUserId);
      expect(result).toEqual({ type: 'follow', follow: existingFollow });
    });

    it('should create a follow request for private user', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      const mockUser = {
        id: targetUserId,
        isPrivate: true,
        isDeactivated: false,
        isBanned: false,
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.followRequest.findUnique.mockResolvedValue(null);
      const mockRequest = {
        id: 'request-789',
        senderId: currentUserId,
        receiverId: targetUserId,
        status: 'PENDING',
        createdAt: new Date(),
      };
      prisma.followRequest.create.mockResolvedValue(mockRequest);
      notifications.create.mockResolvedValue(undefined);

      const result = await service.follow(currentUserId, targetUserId);

      expect(prisma.followRequest.create).toHaveBeenCalledWith({
        data: { senderId: currentUserId, receiverId: targetUserId },
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: targetUserId,
        actorId: currentUserId,
        type: 'FOLLOW_REQUEST',
        followRequestId: mockRequest.id,
      });
      expect(result).toEqual({ type: 'request', request: mockRequest });
    });
  });

  describe('unfollow', () => {
    it('should delete follow record and decrement counts', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      const mockFollow = {
        followerId: currentUserId,
        followingId: targetUserId,
      };
      prisma.follow.findUnique.mockResolvedValue(mockFollow);
      prisma.follow.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockImplementation(async (queries: any[]) => {
        const results = [];
        for (const query of queries) {
          results.push(await query);
        }
        return results;
      });

      const result = await service.unfollow(currentUserId, targetUserId);

      expect(prisma.follow.findUnique).toHaveBeenCalledWith({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.follow.delete).toHaveBeenCalledWith({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ message: 'Unfollowed' });
    });

    it('should return success when not following (idempotent)', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.follow.deleteMany.mockResolvedValue({ count: 0 });
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });
      const result = await service.unfollow(currentUserId, targetUserId);
      expect(result).toHaveProperty('message', 'Unfollowed');
    });
  });

  describe('getFollowers', () => {
    it('should return paginated followers list', async () => {
      const userId = 'user-123';
      const mockUser = { id: userId };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const mockFollows = [
        {
          followerId: 'follower-1',
          followingId: userId,
          follower: {
            id: 'follower-1',
            username: 'follower1',
            displayName: 'Follower One',
            avatarUrl: 'avatar1.jpg',
            isVerified: false,
          },
        },
        {
          followerId: 'follower-2',
          followingId: userId,
          follower: {
            id: 'follower-2',
            username: 'follower2',
            displayName: 'Follower Two',
            avatarUrl: 'avatar2.jpg',
            isVerified: true,
          },
        },
      ];
      prisma.follow.findMany.mockResolvedValue(mockFollows);

      const result = await service.getFollowers(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: userId }, select: { id: true, isPrivate: true } });
      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: {
          followingId: userId,
          follower: { isDeactivated: false, isBanned: false, isDeleted: false },
        },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
        },
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual(mockFollows.map(f => f.follower));
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException for invalid user', async () => {
      const userId = 'user-123';
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getFollowers(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFollowing', () => {
    it('should return paginated following list', async () => {
      const userId = 'user-123';
      const mockUser = { id: userId };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const mockFollows = [
        {
          followerId: userId,
          followingId: 'following-1',
          following: {
            id: 'following-1',
            username: 'following1',
            displayName: 'Following One',
            avatarUrl: 'avatar1.jpg',
            isVerified: false,
          },
        },
      ];
      prisma.follow.findMany.mockResolvedValue(mockFollows);

      const result = await service.getFollowing(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: userId }, select: { id: true, isPrivate: true } });
      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: {
          followerId: userId,
          following: { isDeactivated: false, isBanned: false, isDeleted: false },
        },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
        },
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual(mockFollows.map(f => f.following));
    });

    it('should throw NotFoundException for invalid user', async () => {
      const userId = 'user-123';
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getFollowing(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkFollowing', () => {
    it('should return { isFollowing: true } when following', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      prisma.follow.findUnique.mockResolvedValue({ followerId: currentUserId, followingId: targetUserId });

      const result = await service.checkFollowing(currentUserId, targetUserId);

      expect(prisma.follow.findUnique).toHaveBeenCalledWith({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      });
      expect(result).toEqual({ isFollowing: true });
    });

    it('should return { isFollowing: false } when not following', async () => {
      const currentUserId = 'user-123';
      const targetUserId = 'user-456';
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.checkFollowing(currentUserId, targetUserId);

      expect(result).toEqual({ isFollowing: false });
    });
  });

  describe('acceptRequest', () => {
    it('should accept pending request (self-accept, no notification issue)', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'user-1', receiverId: 'user-1', status: 'PENDING',
      });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.acceptRequest('user-1', 'req-1');
      expect(result.message).toContain('accepted');
    });

    it('should throw NotFoundException when request not found', async () => {
      prisma.followRequest.findUnique.mockResolvedValue(null);
      await expect(service.acceptRequest('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not the receiver', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'user-2', receiverId: 'other', status: 'PENDING',
      });
      await expect(service.acceptRequest('user-1', 'req-1')).rejects.toThrow(ForbiddenException);
    });

    it('should return success for already accepted request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'user-2', receiverId: 'user-1', status: 'ACCEPTED',
      });
      const result = await service.acceptRequest('user-1', 'req-1');
      expect(result.message).toContain('accepted');
    });

    it('should throw ForbiddenException when blocked', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'user-2', receiverId: 'user-1', status: 'PENDING',
      });
      prisma.block.findFirst.mockResolvedValue({ blockerId: 'user-1', blockedId: 'user-2' });
      prisma.followRequest.update.mockResolvedValue({});
      await expect(service.acceptRequest('user-1', 'req-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('declineRequest', () => {
    it('should decline pending request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'user-2', receiverId: 'user-1', status: 'PENDING',
      });
      prisma.followRequest.update.mockResolvedValue({});
      const result = await service.declineRequest('user-1', 'req-1');
      expect(result.message).toContain('declined');
    });

    it('should throw NotFoundException when request not found', async () => {
      prisma.followRequest.findUnique.mockResolvedValue(null);
      await expect(service.declineRequest('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not the receiver', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'user-2', receiverId: 'other',
      });
      await expect(service.declineRequest('user-1', 'req-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelRequest', () => {
    it('should cancel own request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'user-1', receiverId: 'user-2',
      });
      prisma.followRequest.delete.mockResolvedValue({});
      const result = await service.cancelRequest('user-1', 'req-1');
      expect(result.message).toContain('cancelled');
    });

    it('should throw ForbiddenException when not the sender', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'other', receiverId: 'user-2',
      });
      await expect(service.cancelRequest('user-1', 'req-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getOwnRequests', () => {
    it('should return pending follow requests with pagination', async () => {
      prisma.followRequest.findMany.mockResolvedValue([
        { id: 'req-1', sender: { id: 'user-2', username: 'requester' }, status: 'PENDING' },
      ]);
      const result = await service.getOwnRequests('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getSuggestions', () => {
    it('should return user suggestions', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u2', username: 'suggested', displayName: 'Suggested', avatarUrl: null, isVerified: false },
      ]);

      const result = await service.getSuggestions('user-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('removeFollower', () => {
    it('should remove a follower and decrement counts', async () => {
      prisma.follow.findUnique.mockResolvedValue({
        followerId: 'follower-1',
        followingId: 'user-1',
      });
      prisma.follow.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockImplementation(async (queries: any[]) => {
        for (const q of queries) await q;
      });

      const result = await service.removeFollower('user-1', 'follower-1');
      expect(result).toEqual({ message: 'Follower removed' });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should return success idempotently if not a follower', async () => {
      prisma.follow.findUnique.mockResolvedValue(null);
      const result = await service.removeFollower('user-1', 'nobody');
      expect(result).toEqual({ message: 'Follower removed' });
    });

    it('should throw BadRequestException when removing yourself', async () => {
      await expect(service.removeFollower('user-1', 'user-1'))
        .rejects.toThrow(BadRequestException);
    });
  });
});