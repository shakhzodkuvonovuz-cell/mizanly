import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../config/prisma.service';
import { mockRedis, mockConfigService, mockPrivacyService, mockPublishWorkflowService, mockNotificationsService, mockQueueService } from '../../common/test/mock-providers';

const mockPrisma = {
  provide: PrismaService,
  useValue: {
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    follow: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    block: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    mute: { findMany: jest.fn().mockResolvedValue([]) },
    restrict: { findMany: jest.fn().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    post: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn() },
    report: { findFirst: jest.fn(), create: jest.fn() },
    followerSnapshot: { create: jest.fn() },
    userSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    verificationRequest: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn().mockImplementation((fns: any[]) => Promise.all(fns.map((f: any) => f))),
    $executeRaw: jest.fn(),
  },
};

describe('UsersService — Similar Accounts & Popular With Friends', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService, mockPrisma, mockRedis, mockConfigService, mockPrivacyService, mockPublishWorkflowService, mockNotificationsService, mockQueueService],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
  });

  describe('getSimilarAccounts', () => {
    it('should return similar accounts based on shared followers', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }, { followerId: 'f2' }]);
      prisma.follow.groupBy.mockResolvedValue([
        { followingId: 's1', _count: { followerId: 2 } },
        { followingId: 's2', _count: { followerId: 1 } },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 's1', username: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false, bio: 'Hi', followersCount: 100 },
        { id: 's2', username: 'bob', displayName: 'Bob', avatarUrl: null, isVerified: true, bio: 'Yo', followersCount: 200 },
      ]);

      const result = await service.getSimilarAccounts('testuser');
      expect(result.data.length).toBe(2);
      expect(result.data[0].sharedFollowers).toBe(2);
    });

    it('should throw for unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getSimilarAccounts('nope')).rejects.toThrow('User not found');
    });

    it('should return empty when no followers', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.follow.findMany.mockResolvedValue([]);
      const result = await service.getSimilarAccounts('testuser');
      expect(result.data).toHaveLength(0);
    });

    it('should filter blocked users', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }]);
      prisma.follow.groupBy.mockResolvedValue([{ followingId: 's1', _count: { followerId: 1 } }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 's1', username: 'blocked', displayName: 'X', avatarUrl: null, isVerified: false, bio: '', followersCount: 10 },
      ]);
      prisma.block.findMany.mockResolvedValue([{ blockerId: 'viewer-1', blockedId: 's1' }]);

      const result = await service.getSimilarAccounts('testuser', 'viewer-1');
      expect(result.data).toHaveLength(0);
    });
  });

  describe('getPopularWithFriends', () => {
    it('should return posts liked by friends', async () => {
      prisma.follow.findMany.mockResolvedValue([{ followingId: 'f1' }, { followingId: 'f2' }]);
      prisma.postReaction.findMany.mockResolvedValue([
        { postId: 'p1', user: { id: 'f1', username: 'alice', displayName: 'Alice', avatarUrl: null } },
        { postId: 'p1', user: { id: 'f2', username: 'bob', displayName: 'Bob', avatarUrl: null } },
      ]);
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', content: 'Hi', mediaUrls: [], likesCount: 10, commentsCount: 2, createdAt: new Date(), user: { id: 'c1', username: 'creator', displayName: 'C', avatarUrl: null, isVerified: false } },
      ]);

      const result = await service.getPopularWithFriends('user-1');
      expect(result.data.length).toBe(1);
      expect(result.data[0].friendLikes).toBe(2);
    });

    it('should return empty when no follows', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      const result = await service.getPopularWithFriends('user-1');
      expect(result.data).toHaveLength(0);
    });
  });
});
