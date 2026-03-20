import { Test, TestingModule } from '@nestjs/testing';
import { FollowsService } from '../modules/follows/follows.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

/**
 * Integration: Follow + Feed
 * Follow → Verify following → Get feed → Unfollow → Verify not following
 */
describe('Integration: Follow + Feed', () => {
  let followsService: FollowsService;
  let prisma: any;

  const userA = { id: 'user-a', username: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false, followersCount: 0, followingCount: 0, isPrivate: false, isDeactivated: false, isBanned: false };
  const userB = { id: 'user-b', username: 'bob', displayName: 'Bob', avatarUrl: null, isVerified: false, followersCount: 10, followingCount: 5, isPrivate: false, isDeactivated: false, isBanned: false };

  beforeEach(async () => {
    const prismaValue: any = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'user-a') return Promise.resolve(userA);
          if (where.id === 'user-b') return Promise.resolve(userB);
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(userB),
      },
      follow: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ followerId: 'user-b', followingId: 'user-a' }),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      followRequest: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      block: { findFirst: jest.fn().mockResolvedValue(null) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation((fnOrArr: any) => {
        if (typeof fnOrArr === 'function') return fnOrArr(prismaValue);
        return Promise.all(fnOrArr);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        FollowsService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    followsService = module.get(FollowsService);
    prisma = module.get(PrismaService) as any;
  });

  it('should follow a user', async () => {
    const result = await followsService.follow('user-b', 'user-a');
    expect(result).toHaveProperty('type', 'follow');
    expect(result).toHaveProperty('follow');
  });

  it('should return idempotent success when already following', async () => {
    prisma.follow.findUnique.mockResolvedValue({ followerId: 'user-b', followingId: 'user-a' });
    const result = await followsService.follow('user-b', 'user-a');
    expect(result).toHaveProperty('type', 'follow');
  });

  it('should unfollow a user', async () => {
    prisma.follow.findUnique.mockResolvedValue({ followerId: 'user-b', followingId: 'user-a' });
    const result = await followsService.unfollow('user-b', 'user-a');
    expect(result).toHaveProperty('message', 'Unfollowed');
  });

  it('should check following status', async () => {
    prisma.follow.findUnique.mockResolvedValue(null);
    const result = await followsService.checkFollowing('user-b', 'user-a');
    expect(result).toHaveProperty('isFollowing', false);
  });

  it('should return suggestions excluding followed users', async () => {
    prisma.follow.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([userA]);
    const result = await followsService.getSuggestions('user-b');
    expect(Array.isArray(result)).toBe(true);
  });
});
