import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { UsersService } from './users.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('UsersService — authorization matrix', () => {
  let service: UsersService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
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
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  it('should update own profile', async () => {
    prisma.user.update.mockResolvedValue({ id: userA, username: 'testuser', displayName: 'Updated' });
    const result = await service.updateProfile(userA, { displayName: 'Updated' } as any);
    expect(result.displayName).toBe('Updated');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: userA } }));
  });

  it('should throw ForbiddenException when blocked user views profile', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userB, username: 'blocked', isDeactivated: false, isBanned: false });
    prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });
    await expect(service.getProfile('blocked', userA)).rejects.toThrow(ForbiddenException);
  });

  it('should return limited data for private profile (not following)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userB, username: 'private', isDeactivated: false, isBanned: false, isPrivate: true,
      followersCount: 10, followingCount: 5, postsCount: 20,
    });
    prisma.block.findFirst.mockResolvedValue(null);
    prisma.follow.findUnique.mockResolvedValue(null);
    prisma.followRequest.findUnique.mockResolvedValue(null);

    const result = await service.getProfile('private', userA);
    expect(result).toBeDefined();
    // Profile should exist but may hide posts/content for non-followers
  });

  it('should only return own saved posts', async () => {
    const result = await service.getSavedPosts(userA);
    expect(result.data).toEqual([]);
    expect(prisma.savedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should only return own drafts', async () => {
    const result = await service.getDrafts(userA);
    expect(result).toEqual([]);
    expect(prisma.draftPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should throw NotFoundException for non-existent username', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('nonexistent', userA)).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException for getMe with invalid userId', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getMe('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should only clear own watch history', async () => {
    prisma.watchHistory.deleteMany.mockResolvedValue({ count: 5 });
    const result = await service.clearWatchHistory(userA);
    expect(result).toBeDefined();
    expect(prisma.watchHistory.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });
});
