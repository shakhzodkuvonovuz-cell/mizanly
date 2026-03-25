import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { UsersService } from './users.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let redis: any;

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
              findMany: jest.fn().mockResolvedValue([]),
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
            reelInteraction: {
              findMany: jest.fn(),
            },
            reelBookmark: {
              findMany: jest.fn(),
            },
            videoBookmark: {
              findMany: jest.fn(),
            },
            watchLater: {
              findMany: jest.fn(),
            },
            draftPost: {
              findMany: jest.fn(),
            },
            creatorStat: {
              findMany: jest.fn(),
            },
            comment: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            message: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            postReaction: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            reel: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            video: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            watchHistory: {
              findMany: jest.fn().mockResolvedValue([]),
              deleteMany: jest.fn(),
            },
            watchLaterItem: {
              create: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
            $queryRaw: jest.fn().mockResolvedValue([]),
            $transaction: jest.fn().mockImplementation((fn) => fn({
              user: { update: jest.fn().mockResolvedValue({}) },
              post: { updateMany: jest.fn().mockResolvedValue({}) },
              thread: { updateMany: jest.fn().mockResolvedValue({}) },
              comment: { updateMany: jest.fn().mockResolvedValue({}) },
              reel: { updateMany: jest.fn().mockResolvedValue({}) },
              video: { updateMany: jest.fn().mockResolvedValue({}) },
              story: { deleteMany: jest.fn().mockResolvedValue({}) },
              profileLink: { deleteMany: jest.fn().mockResolvedValue({}) },
              twoFactorSecret: { deleteMany: jest.fn().mockResolvedValue({}) },
              encryptionKey: { deleteMany: jest.fn().mockResolvedValue({}) },
              device: { deleteMany: jest.fn().mockResolvedValue({}) },
              follow: { deleteMany: jest.fn().mockResolvedValue({}) },
              block: { deleteMany: jest.fn().mockResolvedValue({}) },
              savedPost: { deleteMany: jest.fn().mockResolvedValue({}) },
              threadBookmark: { deleteMany: jest.fn().mockResolvedValue({}) },
              videoBookmark: { deleteMany: jest.fn().mockResolvedValue({}) },
              postReaction: { deleteMany: jest.fn().mockResolvedValue({}) },
              circleMember: { deleteMany: jest.fn().mockResolvedValue({}) },
              mute: { deleteMany: jest.fn().mockResolvedValue({}) },
              restrict: { deleteMany: jest.fn().mockResolvedValue({}) },
              followRequest: { deleteMany: jest.fn().mockResolvedValue({}) },
            })),
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
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should redirect to user when looking up a previous username', async () => {
      const redirectedUser = {
        id: 'user-123',
        username: 'newname',
        displayName: 'Test User',
        bio: '',
        avatarUrl: null,
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
      // Username lookup fails — no user with this current username
      prisma.user.findUnique.mockResolvedValue(null);
      // But previousUsername lookup succeeds
      prisma.user.findFirst.mockResolvedValue(redirectedUser);

      const result = await service.getProfile('oldname');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { previousUsername: 'oldname' },
        select: expect.any(Object),
      });
      expect(result.username).toBe('newname');
      expect(result.redirectedFrom).toBe('oldname');
      expect(result.isFollowing).toBe(false);
    });

    it('should not include redirectedFrom when username matches directly', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'directmatch',
        displayName: 'Test User',
        isPrivate: false,
      };
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('directmatch');

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(result.redirectedFrom).toBeUndefined();
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

    it('should save old username as previousUsername when username changes', async () => {
      const userId = 'user-123';
      const dto = { username: 'newname' };
      const currentUser = { username: 'oldname' };
      const updatedUser = {
        id: userId,
        username: 'newname',
        displayName: 'Test',
        bio: '',
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
      prisma.user.findUnique
        .mockResolvedValueOnce(currentUser)   // fetch current user for username check
        .mockResolvedValueOnce(null);          // check new username not taken
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(userId, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          username: 'newname',
          previousUsername: 'oldname',
        }),
        select: expect.any(Object),
      });
      // Both old and new username caches should be invalidated
      expect(redis.del).toHaveBeenCalledWith('user:oldname');
      expect(redis.del).toHaveBeenCalledWith('user:newname');
      expect(result).toEqual(updatedUser);
    });

    it('should throw ConflictException when new username is already taken', async () => {
      const userId = 'user-123';
      const dto = { username: 'taken_name' };
      const currentUser = { username: 'oldname' };
      prisma.user.findUnique
        .mockResolvedValueOnce(currentUser)           // fetch current user
        .mockResolvedValueOnce({ id: 'other-user' }); // username exists

      await expect(service.updateProfile(userId, dto)).rejects.toThrow('Username already taken');
    });

    it('should not update username when same as current', async () => {
      const userId = 'user-123';
      const dto = { username: 'samename', displayName: 'New Name' };
      const currentUser = { username: 'samename' };
      const updatedUser = {
        id: userId,
        username: 'samename',
        displayName: 'New Name',
        bio: '',
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
      prisma.user.findUnique.mockResolvedValueOnce(currentUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      await service.updateProfile(userId, dto);

      // Should only pass displayName, not username or previousUsername
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { displayName: 'New Name' },
        select: expect.any(Object),
      });
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
      const mockUser = { username: 'testuser' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({});

      const result = await service.deactivate(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { username: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isDeactivated: true, deactivatedAt: expect.any(Date) },
      });
      expect(redis.del).toHaveBeenCalledWith('user:testuser');
      expect(result).toEqual({ message: 'Account deactivated' });
    });
  });

  describe('deleteAccount', () => {
    it('should anonymize user data and delete devices via transaction', async () => {
      const userId = 'user-123';
      const mockUser = { username: 'testuser', isDeleted: false };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.deleteAccount(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { username: true, isDeleted: true },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('user:testuser');
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
      prisma.block.findFirst.mockResolvedValue(null);
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

    it('should throw ForbiddenException if viewer is blocked by user', async () => {
      const username = 'testuser';
      const viewerId = 'viewer-123';
      const mockUser = { id: 'user-456' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue({ blockerId: 'user-456', blockedId: viewerId });

      await expect(service.getUserPosts(username, undefined, viewerId))
        .rejects.toThrow(ForbiddenException);
    });

    it('should not check block when viewer is the owner', async () => {
      const username = 'testuser';
      const viewerId = 'user-456';
      const mockUser = { id: 'user-456' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.post.findMany.mockResolvedValue([]);

      const result = await service.getUserPosts(username, undefined, viewerId);
      expect(prisma.block.findFirst).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });
  });

  describe('getUserThreads', () => {
    it('should throw ForbiddenException if viewer is blocked', async () => {
      const username = 'testuser';
      const viewerId = 'viewer-123';
      const mockUser = { id: 'user-456' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findFirst.mockResolvedValue({ blockerId: viewerId, blockedId: 'user-456' });

      await expect(service.getUserThreads(username, undefined, viewerId))
        .rejects.toThrow(ForbiddenException);
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

  describe('getSavedReels', () => {
    it('should return saved reels with pagination', async () => {
      const userId = 'user-123';
      const mockInteractions = [
        {
          createdAt: new Date('2026-03-08T10:00:00Z'),
          reel: {
            id: 'reel-1',
            videoUrl: 'https://example.com/video1.mp4',
            thumbnailUrl: 'https://example.com/thumb1.jpg',
            caption: 'First reel',
            likesCount: 100,
            commentsCount: 20,
            sharesCount: 5,
            viewsCount: 1000,
            createdAt: new Date('2026-03-07T10:00:00Z'),
            user: {
              id: 'author-1',
              username: 'author1',
              displayName: 'Author One',
              avatarUrl: 'https://example.com/avatar1.jpg',
              isVerified: true,
            },
          },
        },
        {
          createdAt: new Date('2026-03-08T09:00:00Z'),
          reel: {
            id: 'reel-2',
            videoUrl: 'https://example.com/video2.mp4',
            thumbnailUrl: 'https://example.com/thumb2.jpg',
            caption: 'Second reel',
            likesCount: 50,
            commentsCount: 10,
            sharesCount: 2,
            viewsCount: 500,
            createdAt: new Date('2026-03-07T09:00:00Z'),
            user: {
              id: 'author-2',
              username: 'author2',
              displayName: 'Author Two',
              avatarUrl: 'https://example.com/avatar2.jpg',
              isVerified: false,
            },
          },
        },
      ] as any;
      prisma.reelInteraction.findMany.mockResolvedValue(mockInteractions);

      const result = await service.getSavedReels(userId);

      expect(prisma.reelInteraction.findMany).toHaveBeenCalledWith({
        where: { userId, saved: true },
        include: {
          reel: {
            select: {
              id: true,
              videoUrl: true,
              thumbnailUrl: true,
              caption: true,
              likesCount: true,
              commentsCount: true,
              sharesCount: true,
              viewsCount: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  isVerified: true,
                },
              },
            },
          },
        },
        take: 21, // limit + 1
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('reel-1');
      expect(result.data[0].isBookmarked).toBe(true);
      expect(result.data[1].id).toBe('reel-2');
      expect(result.data[1].isBookmarked).toBe(true);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should paginate with cursor', async () => {
      const userId = 'user-123';
      const cursor = 'reel-2';
      const mockInteractions = [
        {
          createdAt: new Date('2026-03-08T08:00:00Z'),
          reel: {
            id: 'reel-3',
            videoUrl: 'https://example.com/video3.mp4',
            thumbnailUrl: 'https://example.com/thumb3.jpg',
            caption: 'Third reel',
            likesCount: 30,
            commentsCount: 5,
            sharesCount: 1,
            viewsCount: 300,
            createdAt: new Date('2026-03-07T08:00:00Z'),
            user: {
              id: 'author-3',
              username: 'author3',
              displayName: 'Author Three',
              avatarUrl: 'https://example.com/avatar3.jpg',
              isVerified: false,
            },
          },
        },
      ] as any;
      prisma.reelInteraction.findMany.mockResolvedValue(mockInteractions);

      const result = await service.getSavedReels(userId, cursor, 20);

      expect(prisma.reelInteraction.findMany).toHaveBeenCalledWith({
        where: { userId, saved: true },
        include: {
          reel: {
            select: {
              id: true,
              videoUrl: true,
              thumbnailUrl: true,
              caption: true,
              likesCount: true,
              commentsCount: true,
              sharesCount: true,
              viewsCount: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  isVerified: true,
                },
              },
            },
          },
        },
        take: 21,
        cursor: { userId_reelId: { userId, reelId: cursor } },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('reel-3');
      expect(result.data[0].isBookmarked).toBe(true);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getSavedVideos', () => {
    it('should return bookmarked videos with pagination', async () => {
      const userId = 'user-123';
      const mockBookmarks = [
        {
          createdAt: new Date('2026-03-08T10:00:00Z'),
          videoId: 'video-1',
          video: {
            id: 'video-1',
            title: 'First video',
            thumbnailUrl: 'https://example.com/thumb1.jpg',
            duration: 300,
            viewsCount: 1000,
            likesCount: 50,
            createdAt: new Date('2026-03-07T10:00:00Z'),
            channel: {
              id: 'channel-1',
              handle: 'channel1',
              name: 'Channel One',
              description: 'First channel',
              avatarUrl: 'https://example.com/channel1.jpg',
              bannerUrl: null,
              subscribersCount: 100,
              videosCount: 10,
              totalViews: 5000,
              isVerified: true,
              createdAt: new Date('2026-01-01T00:00:00Z'),
            },
          },
        },
        {
          createdAt: new Date('2026-03-08T09:00:00Z'),
          videoId: 'video-2',
          video: {
            id: 'video-2',
            title: 'Second video',
            thumbnailUrl: 'https://example.com/thumb2.jpg',
            duration: 180,
            viewsCount: 500,
            likesCount: 25,
            createdAt: new Date('2026-03-07T09:00:00Z'),
            channel: {
              id: 'channel-2',
              handle: 'channel2',
              name: 'Channel Two',
              description: 'Second channel',
              avatarUrl: 'https://example.com/channel2.jpg',
              bannerUrl: null,
              subscribersCount: 50,
              videosCount: 5,
              totalViews: 2500,
              isVerified: false,
              createdAt: new Date('2026-01-02T00:00:00Z'),
            },
          },
        },
      ] as any;
      prisma.videoBookmark.findMany.mockResolvedValue(mockBookmarks);

      const result = await service.getSavedVideos(userId);

      expect(prisma.videoBookmark.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          video: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              duration: true,
              viewsCount: true,
              likesCount: true,
              createdAt: true,
              channel: {
                select: {
                  id: true,
                  handle: true,
                  name: true,
                  description: true,
                  avatarUrl: true,
                  bannerUrl: true,
                  subscribersCount: true,
                  videosCount: true,
                  totalViews: true,
                  isVerified: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        take: 21, // limit + 1
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('video-1');
      expect(result.data[0].isBookmarked).toBe(true);
      expect(result.data[1].id).toBe('video-2');
      expect(result.data[1].isBookmarked).toBe(true);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should paginate videos with cursor', async () => {
      const userId = 'user-123';
      const cursor = 'video-2';
      const mockBookmarks = [
        {
          createdAt: new Date('2026-03-08T08:00:00Z'),
          videoId: 'video-3',
          video: {
            id: 'video-3',
            title: 'Third video',
            thumbnailUrl: 'https://example.com/thumb3.jpg',
            duration: 240,
            viewsCount: 300,
            likesCount: 15,
            createdAt: new Date('2026-03-07T08:00:00Z'),
            channel: {
              id: 'channel-3',
              handle: 'channel3',
              name: 'Channel Three',
              description: 'Third channel',
              avatarUrl: 'https://example.com/channel3.jpg',
              bannerUrl: null,
              subscribersCount: 30,
              videosCount: 3,
              totalViews: 1500,
              isVerified: false,
              createdAt: new Date('2026-01-03T00:00:00Z'),
            },
          },
        },
      ] as any;
      prisma.videoBookmark.findMany.mockResolvedValue(mockBookmarks);

      const result = await service.getSavedVideos(userId, cursor, 20);

      expect(prisma.videoBookmark.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          video: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              duration: true,
              viewsCount: true,
              likesCount: true,
              createdAt: true,
              channel: {
                select: {
                  id: true,
                  handle: true,
                  name: true,
                  description: true,
                  avatarUrl: true,
                  bannerUrl: true,
                  subscribersCount: true,
                  videosCount: true,
                  totalViews: true,
                  isVerified: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        take: 21,
        cursor: { userId_videoId: { userId, videoId: cursor } },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('video-3');
      expect(result.data[0].isBookmarked).toBe(true);
      expect(result.meta.hasMore).toBe(false);
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

  // ═══════════════════════════════════════════════════════
  // exportData
  // ═══════════════════════════════════════════════════════

  describe('exportData', () => {
    it('should return all user data for GDPR export', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', content: 'test' }]);
      prisma.comment.findMany.mockResolvedValue([]);
      prisma.message.findMany.mockResolvedValue([{ id: 'm1', content: 'hello', conversationId: 'c1' }]);
      prisma.follow.findMany
        .mockResolvedValueOnce([{ followerId: 'f1' }])
        .mockResolvedValueOnce([{ followingId: 'f2' }]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.savedPost.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.reel.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.exportData('user-1');
      expect(result.profile).toBeDefined();
      expect(result.posts).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('hello');
      expect(result.followers).toContain('f1');
      expect(result.following).toContain('f2');
      expect(result.exportedAt).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  // getMutualFollowers
  // ═══════════════════════════════════════════════════════

  describe('getMutualFollowers', () => {
    it('should return mutual followers', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'target-1' });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'mutual-1', username: 'mutual', displayName: 'Mutual', avatarUrl: null },
      ]);

      const result = await service.getMutualFollowers('user-1', 'targetuser');
      expect(result.data).toHaveLength(1);
    });

    it('should throw NotFoundException for non-existent target', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMutualFollowers('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getLikedPosts
  // ═══════════════════════════════════════════════════════

  describe('getLikedPosts', () => {
    it('should return liked posts with pagination', async () => {
      prisma.postReaction.findMany.mockResolvedValue([
        { postId: 'p1', post: { id: 'p1', content: 'Test', user: { id: 'u1' } } },
      ]);

      const result = await service.getLikedPosts('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty when no liked posts', async () => {
      prisma.postReaction.findMany.mockResolvedValue([]);
      const result = await service.getLikedPosts('user-1');
      expect(result.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // requestAccountDeletion / cancelAccountDeletion
  // ═══════════════════════════════════════════════════════

  describe('requestAccountDeletion', () => {
    it('should mark account for deletion', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'testuser', isDeleted: false });
      prisma.user.update.mockResolvedValue({});
      const result = await service.requestAccountDeletion('user-1');
      expect(result).toEqual(expect.objectContaining({ requested: true }));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ isDeactivated: true }),
        }),
      );
    });
  });

  describe('cancelAccountDeletion', () => {
    it('should cancel account deletion', async () => {
      prisma.user.findUnique.mockResolvedValue({ isDeleted: false });
      prisma.user.update.mockResolvedValue({});
      const result = await service.cancelAccountDeletion('user-1');
      expect(result).toEqual({ cancelled: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: null, isDeactivated: false }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  // updateNasheedMode
  // ═══════════════════════════════════════════════════════

  describe('updateNasheedMode', () => {
    it('should enable nasheed mode', async () => {
      prisma.user.update.mockResolvedValue({ id: 'user-1', nasheedMode: true });
      const result = await service.updateNasheedMode('user-1', true);
      expect(result.nasheedMode).toBe(true);
    });

    it('should disable nasheed mode', async () => {
      prisma.user.update.mockResolvedValue({ id: 'user-1', nasheedMode: false });
      const result = await service.updateNasheedMode('user-1', false);
      expect(result.nasheedMode).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // findByPhoneNumbers
  // ═══════════════════════════════════════════════════════

  describe('findByPhoneNumbers (hash-based contact sync)', () => {
    // Mobile sends SHA-256 hashes of phone numbers, backend hashes stored phones to compare
    const crypto = require('crypto');
    const hashPhone = (phone: string) => crypto.createHash('sha256').update(phone.replace(/\D/g, '')).digest('hex');

    it('should return matching users when hash matches', async () => {
      const phoneHash = hashPhone('+1234567890');
      prisma.user.findMany.mockResolvedValue([
        { id: 'u2', username: 'friend', displayName: 'Friend', avatarUrl: null, isVerified: false, phone: '1234567890' },
      ]);
      prisma.follow.findMany.mockResolvedValue([{ followingId: 'u2' }]);
      prisma.block.findMany.mockResolvedValue([]);

      const result = await service.findByPhoneNumbers('user-1', [phoneHash]);
      expect(result).toHaveLength(1);
      expect(result[0].isFollowing).toBe(true);
      // Phone should be stripped from response
      expect(result[0]).not.toHaveProperty('phone');
    });

    it('should return empty for no hash matches', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u2', phone: '9999999999' },
      ]);
      const result = await service.findByPhoneNumbers('user-1', [hashPhone('+0000000000')]);
      expect(result).toEqual([]);
    });

    it('should return empty for empty input', async () => {
      const result = await service.findByPhoneNumbers('user-1', []);
      expect(result).toEqual([]);
    });

    it('should deduplicate hashes', async () => {
      const hash = hashPhone('+1234567890');
      prisma.user.findMany.mockResolvedValue([]);
      await service.findByPhoneNumbers('user-1', [hash, hash, hash]);
      // Should only query once
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getFollowRequests
  // ═══════════════════════════════════════════════════════

  describe('getFollowRequests', () => {
    it('should return pending follow requests', async () => {
      prisma.followRequest.findMany.mockResolvedValue([
        { id: 'fr-1', fromUserId: 'user-2', createdAt: new Date(), fromUser: { id: 'user-2', username: 'requester' } },
      ]);

      const result = await service.getFollowRequests('user-1');
      expect(result.data).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getDrafts
  // ═══════════════════════════════════════════════════════

  describe('getDrafts', () => {
    it('should return user drafts', async () => {
      prisma.draftPost.findMany.mockResolvedValue([{ id: 'd1', content: 'draft' }]);
      const result = await service.getDrafts('user-1');
      expect(result).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getAnalytics
  // ═══════════════════════════════════════════════════════

  describe('getAnalytics', () => {
    it('should return creator stats for last 30 days', async () => {
      prisma.creatorStat.findMany.mockResolvedValue([
        { date: new Date(), views: 100, likes: 50 },
        { date: new Date(), views: 80, likes: 40 },
      ]);

      const result = await service.getAnalytics('user-1');
      expect(result.stats).toHaveLength(2);
      expect(result.stats[0].views).toBe(100);
    });

    it('should return empty stats for new creator', async () => {
      prisma.creatorStat.findMany.mockResolvedValue([]);
      const result = await service.getAnalytics('user-1');
      expect(result.stats).toEqual([]);
    });
  });
});