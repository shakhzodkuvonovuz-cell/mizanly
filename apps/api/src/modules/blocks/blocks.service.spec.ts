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
              findFirst: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({ id: 'user-456', username: 'blocked-user' }),
            },
            follow: {
              findMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            followRequest: {
              deleteMany: jest.fn(),
            },
            circle: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            circleMember: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            conversation: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            conversationMember: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            $transaction: jest.fn().mockImplementation(async (fnOrArray: unknown) => {
              if (typeof fnOrArray === 'function') return (fnOrArray as (tx: any) => Promise<unknown>)(prisma);
              return Promise.all(fnOrArray as Promise<unknown>[]);
            }),
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
      prisma.follow.deleteMany.mockResolvedValue({ count: 0 });
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });
      // $transaction uses mockImplementation from beforeEach — passes prisma as tx

      const result = await service.block(blockerId, blockedId);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
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
      prisma.user.findUnique.mockResolvedValue({ id: blockedId, username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue({ blockerId, blockedId });

      const result = await service.block(blockerId, blockedId);

      expect(result).toEqual({ message: 'User blocked' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should include executeRaw in transaction when follows existed', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.user.findUnique.mockResolvedValue({ id: blockedId, username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([
        { followerId: blockerId, followingId: blockedId },
        { followerId: blockedId, followingId: blockerId },
      ]);
      prisma.block.create.mockResolvedValue({});
      prisma.follow.deleteMany.mockResolvedValue({ count: 2 });
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });

      await service.block(blockerId, blockedId);

      // Interactive transaction called with callback function
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      // Verify block was created + follows deleted + counters decremented
      expect(prisma.block.create).toHaveBeenCalled();
      expect(prisma.follow.deleteMany).toHaveBeenCalled();
      expect(prisma.followRequest.deleteMany).toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalled();
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

      expect(prisma.block.findMany).toHaveBeenCalledWith(expect.objectContaining({
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
      }));
      expect(result.data).toEqual([blockedUser]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should support cursor pagination', async () => {
      const userId = 'user-123';
      const cursor = 'user-456';
      prisma.block.findMany.mockResolvedValue([]);

      await service.getBlockedList(userId, cursor, 10);

      expect(prisma.block.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { blockerId: userId },
        include: expect.any(Object),
        take: 11,
        cursor: { blockerId_blockedId: { blockerId: userId, blockedId: cursor } },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      }));
    });
  });

  describe('isBlocked', () => {
    it('should return true if block exists in either direction', async () => {
      prisma.block.findFirst.mockResolvedValue({ blockerId: 'user-123', blockedId: 'user-456' });

      const result = await service.isBlocked('user-123', 'user-456');
      expect(result).toBe(true);
      expect(prisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: 'user-123', blockedId: 'user-456' },
            { blockerId: 'user-456', blockedId: 'user-123' },
          ],
        },
      });
    });

    it('should return false if no block exists', async () => {
      prisma.block.findFirst.mockResolvedValue(null);

      const result = await service.isBlocked('user-123', 'user-456');
      expect(result).toBe(false);
    });
  });

  describe('block — edge cases', () => {
    it('should throw NotFoundException when target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.block('user-123', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should not include counter updates when no follows existed', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-456', username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.create.mockResolvedValue({});
      prisma.follow.deleteMany.mockResolvedValue({ count: 0 });
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });

      await service.block('user-123', 'user-456');

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(prisma.block.create).toHaveBeenCalled();
      expect(prisma.follow.deleteMany).toHaveBeenCalled();
      // No $executeRaw calls since no follows existed
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('getBlockedList — edge cases', () => {
    it('should return empty list when no blocks', async () => {
      prisma.block.findMany.mockResolvedValue([]);

      const result = await service.getBlockedList('user-123');

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('should set hasMore true when results exceed limit', async () => {
      const blocks = Array.from({ length: 21 }, (_, i) => ({
        blockedId: `user-${i}`,
        createdAt: new Date(),
        blocked: { id: `user-${i}`, username: `user${i}`, displayName: `User ${i}`, avatarUrl: null },
      }));
      prisma.block.findMany.mockResolvedValue(blocks);

      const result = await service.getBlockedList('user-123');

      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('user-19');
    });

    it('should apply custom limit', async () => {
      prisma.block.findMany.mockResolvedValue([]);

      await service.getBlockedList('user-123', undefined, 5);

      expect(prisma.block.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 6,
      }));
    });
  });

  describe('cleanupAfterBlock', () => {
    it('should remove blocked user from blocker circles and archive DM conversations', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';

      // Setup: block is created successfully
      prisma.user.findUnique.mockResolvedValue({ id: blockedId, username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([]);

      // Setup: cleanup finds circles and conversations
      prisma.circle.findMany.mockResolvedValue([{ id: 'circle-1' }]);
      prisma.circleMember.deleteMany.mockResolvedValue({ count: 1 });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      prisma.conversationMember.updateMany.mockResolvedValue({ count: 2 });

      await service.block(blockerId, blockedId);

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(prisma.circle.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { ownerId: blockerId },
      }));
      expect(prisma.circleMember.deleteMany).toHaveBeenCalledWith({
        where: { circleId: { in: ['circle-1'] }, userId: blockedId },
      });
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          isGroup: false,
        }),
      }));
      expect(prisma.conversationMember.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: { in: ['conv-1'] },
          userId: { in: [blockerId, blockedId] },
        },
        data: { isArchived: true },
      });
    });

    it('should not fail if cleanup encounters no circles or conversations', async () => {
      const blockerId = 'user-123';
      const blockedId = 'user-456';
      prisma.user.findUnique.mockResolvedValue({ id: blockedId, username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([]);
      prisma.circle.findMany.mockResolvedValue([]);
      prisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.block(blockerId, blockedId);
      expect(result).toEqual({ message: 'User blocked' });
    });
  });

  describe('getBlockedIds', () => {
    it('should return all blocked user IDs in both directions', async () => {
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'user-123', blockedId: 'user-456' },
        { blockerId: 'user-789', blockedId: 'user-123' },
      ]);

      const result = await service.getBlockedIds('user-123');
      expect(result).toContain('user-456');
      expect(result).toContain('user-789');
      expect(result).not.toContain('user-123');
    });

    it('should return empty array when no blocks', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      const result = await service.getBlockedIds('user-123');
      expect(result).toEqual([]);
    });
  });
});