import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
            },
            report: {
              create: jest.fn(),
            },
            device: {
              deleteMany: jest.fn(),
            },
            block: {
              findFirst: jest.fn(),
            },
            follow: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            followRequest: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            post: {
              findMany: jest.fn(),
            },
            thread: {
              findMany: jest.fn(),
            },
            savedPost: {
              findMany: jest.fn(),
            },
            threadBookmark: {
              findMany: jest.fn(),
            },
            watchLater: {
              findMany: jest.fn(),
              upsert: jest.fn(),
              deleteMany: jest.fn(),
            },
            draftPost: {
              findMany: jest.fn(),
            },
            creatorStat: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
  });

  describe('getProfile', () => {
    it('should return user data for existing username', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        bio: 'Hello',
        avatarUrl: 'https://example.com/avatar.jpg',
        coverUrl: null,
        website: null,
        location: null,
        isVerified: false,
        isPrivate: false,
        followersCount: 10,
        followingCount: 5,
        postsCount: 3,
        role: 'USER',
        createdAt: new Date(),
      };
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('testuser');

      expect(redis.get).toHaveBeenCalledWith('user:testuser');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
        select: expect.any(Object),
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'user:testuser',
        300,
        JSON.stringify(mockUser),
      );
      expect(result).toEqual({ ...mockUser, isFollowing: false, followRequestPending: false });
    });

    it('should return cached user if available', async () => {
      const cachedUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Cached User',
      };
      redis.get.mockResolvedValue(JSON.stringify(cachedUser));

      const result = await service.getProfile('testuser');

      expect(redis.get).toHaveBeenCalledWith('user:testuser');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ ...cachedUser, isFollowing: false, followRequestPending: false });
    });

    it('should throw NotFoundException for nonexistent user', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update user and invalidate cache', async () => {
      const userId = 'user-123';
      const dto = { displayName: 'Updated Name' };
      const updatedUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Updated Name',
        bio: null,
        avatarUrl: null,
        coverUrl: null,
        website: null,
        location: null,
        isVerified: false,
        isPrivate: false,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: 'USER',
        createdAt: new Date(),
      };
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(userId, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: dto,
        select: expect.any(Object),
      });
      expect(redis.del).toHaveBeenCalledWith('user:testuser');
      expect(result).toEqual(updatedUser);
    });
  });

  describe('reportUser', () => {
    it('should create a report record', async () => {
      const reporterId = 'user-123';
      const targetId = 'user-456';
      const reason = 'spam';
      const mockReport = {
        id: 'report-789',
        reporterId,
        targetId,
        reason: 'SPAM',
        createdAt: new Date(),
      };
      prisma.report.create.mockResolvedValue(mockReport);

      const result = await service.report(reporterId, targetId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId,
          reportedUserId: targetId,
          reason: 'SPAM',
        },
      });
      expect(result).toEqual({ reported: true });
    });
  });

  describe('getMe', () => {
    const PUBLIC_USER_FIELDS = {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      coverUrl: true,
      website: true,
      location: true,
      isVerified: true,
      isPrivate: true,
      followersCount: true,
      followingCount: true,
      postsCount: true,
      role: true,
      createdAt: true,
    };

    it('should return user with settings and profileLinks', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Test User',
        bio: 'Hello',
        avatarUrl: 'https://example.com/avatar.jpg',
        coverUrl: null,
        website: null,
        location: null,
        isVerified: false,
        isPrivate: false,
        followersCount: 10,
        followingCount: 5,
        postsCount: 3,
        role: 'USER',
        createdAt: new Date(),
        email: 'test@example.com',
        language: 'en',
        theme: 'dark',
        lastSeenAt: new Date(),
        profileLinks: [
          { id: 'link-1', platform: 'twitter', url: 'https://twitter.com/test', position: 0 },
        ],
        settings: { id: 'settings-1', notificationsEnabled: true },
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: expect.objectContaining({
          ...PUBLIC_USER_FIELDS,
          email: true,
          language: true,
          theme: true,
          lastSeenAt: true,
          profileLinks: { orderBy: { position: 'asc' } },
          settings: true,
        }),
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'nonexistent';
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('should set isDeactivated flag', async () => {
      const userId = 'user-123';
      prisma.user.update.mockResolvedValue({});

      const result = await service.deactivate(userId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isDeactivated: true, deactivatedAt: expect.any(Date) },
      });
      expect(result).toEqual({ message: 'Account deactivated' });
    });
  });

  describe('deleteAccount', () => {
    it('should anonymize user data and delete devices', async () => {
      const userId = 'user-123';
      prisma.user.update.mockResolvedValue({});
      prisma.device.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.deleteAccount(userId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          username: expect.stringContaining('deleted_'),
          displayName: 'Deleted User',
          bio: '',
          avatarUrl: null,
          coverUrl: null,
          website: null,
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });
      expect(prisma.device.deleteMany).toHaveBeenCalledWith({ where: { userId } });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('getProfile with blocks', () => {
    it('should throw ForbiddenException when user blocked', async () => {
      const username = 'blockeduser';
      const currentUserId = 'user-123';
      const mockUser = { id: 'blocked-456' };
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue({ blockerId: currentUserId, blockedId: mockUser.id });

      await expect(service.getProfile(username, currentUserId)).rejects.toThrow(ForbiddenException);
      expect(prisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: currentUserId, blockedId: mockUser.id },
            { blockerId: mockUser.id, blockedId: currentUserId },
          ],
        },
      });
    });

    it('should return follow status when user is following', async () => {
      const username = 'targetuser';
      const currentUserId = 'user-123';
      const mockUser = { id: 'target-456', isPrivate: false };
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue({ followerId: currentUserId, followingId: mockUser.id });

      const result = await service.getProfile(username, currentUserId);

      expect(result.isFollowing).toBe(true);
      expect(result.followRequestPending).toBe(false);
    });

    it('should return pending follow request for private user', async () => {
      const username = 'privateuser';
      const currentUserId = 'user-123';
      const mockUser = { id: 'private-456', isPrivate: true };
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.followRequest.findUnique.mockResolvedValue({ status: 'PENDING' });

      const result = await service.getProfile(username, currentUserId);

      expect(result.isFollowing).toBe(false);
      expect(result.followRequestPending).toBe(true);
    });
  });

  describe('getUserPosts', () => {
    it('should return posts with visibility filtering', async () => {
      const username = 'testuser';
      const viewerId = 'viewer-123';
      const mockUser = { id: 'user-456' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.follow.findUnique.mockResolvedValue(null);
      const mockPosts = [
        { id: 'post-1', content: 'public post', likesCount: 5 },
      ];
      prisma.post.findMany.mockResolvedValue(mockPosts);

      const result = await service.getUserPosts(username, undefined, viewerId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username } });
      expect(prisma.follow.findUnique).toHaveBeenCalledWith({
        where: { followerId_followingId: { followerId: viewerId, followingId: mockUser.id } },
      });
      // Expect visibility filter to be PUBLIC when not follower
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ visibility: 'PUBLIC' }),
        }),
      );
      expect(result.data).toEqual(mockPosts.slice(0, 20));
    });
  });

  describe('getFollowers', () => {
    it('should return followers with pagination', async () => {
      const username = 'testuser';
      const mockUser = { id: 'user-123' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const mockFollows = [
        {
          follower: { id: 'follower-1', username: 'follower1', displayName: 'Follower One', avatarUrl: null, isVerified: false },
        },
      ];
      prisma.follow.findMany.mockResolvedValue(mockFollows);

      const result = await service.getFollowers(username);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { followingId: mockUser.id },
          include: { follower: expect.any(Object) },
        }),
      );
      expect(result.data).toEqual(mockFollows.map(f => f.follower));
    });
  });

  describe('getFollowing', () => {
    it('should return following with pagination', async () => {
      const username = 'testuser';
      const mockUser = { id: 'user-123' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const mockFollows = [
        {
          following: { id: 'following-1', username: 'following1', displayName: 'Following One', avatarUrl: null, isVerified: false },
        },
      ];
      prisma.follow.findMany.mockResolvedValue(mockFollows);

      const result = await service.getFollowing(username);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { followerId: mockUser.id },
          include: { following: expect.any(Object) },
        }),
      );
      expect(result.data).toEqual(mockFollows.map(f => f.following));
    });
  });

  describe('getSavedPosts', () => {
    it('should return saved posts with pagination', async () => {
      const userId = 'user-123';
      const mockSaved = [
        {
          post: {
            id: 'post-1',
            content: 'saved post',
            user: { id: 'author-1', username: 'author', displayName: 'Author', avatarUrl: null },
          },
        },
      ];
      prisma.savedPost.findMany.mockResolvedValue(mockSaved);

      const result = await service.getSavedPosts(userId);

      expect(prisma.savedPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          include: { post: expect.any(Object) },
        }),
      );
      expect(result.data).toEqual(mockSaved.map(s => s.post));
    });
  });

  describe('getSavedThreads', () => {
    it('should return saved threads with pagination', async () => {
      const userId = 'user-123';
      const mockBookmarks = [
        {
          thread: {
            id: 'thread-1',
            content: 'saved thread',
            user: { id: 'author-1', username: 'author', displayName: 'Author', avatarUrl: null },
          },
        },
      ];
      prisma.threadBookmark.findMany.mockResolvedValue(mockBookmarks);

      const result = await service.getSavedThreads(userId);

      expect(prisma.threadBookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          include: { thread: expect.any(Object) },
        }),
      );
      expect(result.data).toEqual(mockBookmarks.map(b => b.thread));
    });
  });

  describe('getQrCode', () => {
    it('should return deeplink and profile URL', async () => {
      const userId = 'user-123';
      const mockUser = { username: 'testuser' };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getQrCode(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { username: true },
      });
      expect(result).toEqual({
        username: 'testuser',
        deeplink: 'mizanly://profile/testuser',
        profileUrl: 'https://mizanly.app/@testuser',
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'nonexistent';
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getQrCode(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('addWatchLater', () => {
    it('should add a video to watch later', async () => {
      prisma.watchLater.upsert.mockResolvedValue({ userId: 'u1', videoId: 'v1' });
      const result = await service.addWatchLater('u1', 'v1');
      expect(result).toEqual({ added: true });
      expect(prisma.watchLater.upsert).toHaveBeenCalledWith({
        where: { userId_videoId: { userId: 'u1', videoId: 'v1' } },
        create: { userId: 'u1', videoId: 'v1' },
        update: {},
      });
    });
  });

  describe('removeWatchLater', () => {
    it('should remove a video from watch later', async () => {
      prisma.watchLater.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.removeWatchLater('u1', 'v1');
      expect(result).toEqual({ removed: true });
      expect(prisma.watchLater.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', videoId: 'v1' },
      });
    });
  });
});