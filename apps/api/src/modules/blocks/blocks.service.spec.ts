import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { BlocksService } from './blocks.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BlocksService', () => {
  let service: BlocksService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        BlocksService,
        {
          provide: PrismaService,
          useValue: {
            block: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({ id: 'user-456' }),
            },
            follow: {
              findMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            followRequest: {
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BlocksService>(BlocksService);
    prisma = module.get(PrismaService) as any;
  });

  describe('block', () => {
    it('should create a block record and delete follows/follow requests', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.create.mockResolvedValue({});
      prisma.follow.deleteMany.mockResolvedValue({});
      prisma.followRequest.deleteMany.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.block(blockerId, blockedId);

      expect(prisma.block.findUnique).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
        select: { followerId: true, followingId: true },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ message: 'User blocked' });
    });

    it('should throw BadRequestException when blocking yourself', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-123';

      await expect(service.block(blockerId, blockedId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return success idempotently if already blocked', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.user.findUnique.mockResolvedValue({ id: blockedId });
      prisma.block.findUnique.mockResolvedValue({ blockerId, blockedId });

      const result = await service.block(blockerId, blockedId);

      expect(result).toEqual({ message: 'User blocked' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should include executeRaw in transaction when follows existed', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.user.findUnique.mockResolvedValue({ id: blockedId });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([
        { followerId: blockerId, followingId: blockedId },
        { followerId: blockedId, followingId: blockerId },
      ]);
      prisma.$transaction.mockResolvedValue([]);

      await service.block(blockerId, blockedId);

      // Transaction should include: block.create + follow.deleteMany + followRequest.deleteMany + 4x $executeRaw
      const txArgs = prisma.$transaction.mock.calls[0][0];
      expect(txArgs.length).toBe(7); // 3 base + 2 blokerWasFollowing + 2 blockedWasFollowing
    });
  });

  describe('unblock', () => {
    it('should delete block record', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.block.findUnique.mockResolvedValue({ blockerId, blockedId });
      prisma.block.delete.mockResolvedValue({});

      const result = await service.unblock(blockerId, blockedId);

      expect(prisma.block.delete).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
      expect(result).toEqual({ message: 'User unblocked' });
    });

    it('should return success idempotently if block not found', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.block.findUnique.mockResolvedValue(null);

      const result = await service.unblock(blockerId, blockedId);

      expect(result).toEqual({ message: 'User unblocked' });
      expect(prisma.block.delete).not.toHaveBeenCalled();
    });
  });

  describe('getBlockedList', () => {
    it('should return paginated list of blocked users', async () => {
      const userId = 'user-123';
      const blockedUser = {
        id: 'user-456',
        username: 'blockeduser',
        displayName: 'Blocked User',
        avatarUrl: null,
      };
      const mockBlocks = [
        {
          blockedId: 'user-456',
          createdAt: new Date(),
          blocked: blockedUser,
        },
      ];
      prisma.block.findMany.mockResolvedValue(mockBlocks);

      const result = await service.getBlockedList(userId);

      expect(prisma.block.findMany).toHaveBeenCalledWith({
        where: { blockerId: userId },
        include: {
          blocked: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual([blockedUser]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should support cursor pagination', async () => {
      const userId = 'user-123';
      const cursor = 'user-456';
      prisma.block.findMany.mockResolvedValue([]);

      await service.getBlockedList(userId, cursor, 10);

      expect(prisma.block.findMany).toHaveBeenCalledWith({
        where: { blockerId: userId },
        include: expect.any(Object),
        take: 11,
        cursor: { blockerId_blockedId: { blockerId: userId, blockedId: cursor } },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('isBlocked', () => {
    it('should return true if block exists', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.block.findUnique.mockResolvedValue({ blockerId, blockedId });

      const result = await service.isBlocked(blockerId, blockedId);

      expect(prisma.block.findUnique).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
      expect(result).toBe(true);
    });

    it('should return false if block does not exist', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.block.findUnique.mockResolvedValue(null);

      const result = await service.isBlocked(blockerId, blockedId);

      expect(result).toBe(false);
    });
  });
});