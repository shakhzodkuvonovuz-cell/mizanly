import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ThreadsService } from './threads.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ThreadsService — authorization matrix', () => {
  let service: ThreadsService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

  const mockThreadByA = {
    id: 'thread-1',
    userId: userA,
    content: 'Test thread',
    isRemoved: false,
    isChainHead: true,
    visibility: 'PUBLIC',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ThreadsService,
        {
          provide: PrismaService,
          useValue: {
            thread: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
            threadReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            threadReply: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn(), update: jest.fn() },
            threadReplyLike: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            threadBookmark: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn(), findUnique: jest.fn() },
            block: { findMany: jest.fn(), findFirst: jest.fn() },
            mute: { findMany: jest.fn() },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn() },
            feedDismissal: { upsert: jest.fn() },
            pollOption: { findUnique: jest.fn(), update: jest.fn() },
            pollVote: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
            poll: { update: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        { provide: 'REDIS', useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn(), zcard: jest.fn().mockResolvedValue(0), zadd: jest.fn().mockResolvedValue(0), zrevrange: jest.fn().mockResolvedValue([]), expire: jest.fn().mockResolvedValue(1), pipeline: jest.fn().mockReturnValue({ del: jest.fn().mockReturnThis(), zadd: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) }) } },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
    prisma = module.get(PrismaService);
  });

  describe('delete — ownership', () => {
    it('should allow owner to delete', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const result = await service.delete('thread-1', userA);
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException when non-owner deletes', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      await expect(service.delete('thread-1', userB)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteReply — ownership', () => {
    it('should allow reply author to delete', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'r-1', userId: userA, threadId: 'thread-1' });
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const result = await service.deleteReply('r-1', userA);
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException when non-author deletes reply', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'r-1', userId: userA, threadId: 'thread-1' });
      await expect(service.deleteReply('r-1', userB)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('repost — ownership', () => {
    it('should throw BadRequestException when reposting own thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      await expect(service.repost('thread-1', userA)).rejects.toThrow(BadRequestException);
    });

    it('should allow user B to repost user A thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      prisma.thread.findFirst.mockResolvedValue(null); // no existing repost
      prisma.$transaction.mockResolvedValue([{ id: 'repost-1' }, {}]);
      const result = await service.repost('thread-1', userB);
      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('setReplyPermission — ownership', () => {
    it('should allow owner to set reply permission', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      prisma.thread.update.mockResolvedValue({});
      const result = await service.setReplyPermission('thread-1', userA, 'following');
      expect(result.updated).toBe(true);
    });

    it('should throw ForbiddenException when non-owner sets permission', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      await expect(service.setReplyPermission('thread-1', userB, 'none')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('like — any user', () => {
    it('should allow any user to like a thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const result = await service.like('thread-1', userB);
      expect(result.liked).toBe(true);
    });

    it('should throw ConflictException when already liked', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      prisma.threadReaction.findUnique.mockResolvedValue({ userId: userB, threadId: 'thread-1' });
      await expect(service.like('thread-1', userB)).rejects.toThrow(ConflictException);
    });
  });

  describe('bookmark — per-user', () => {
    it('should allow any user to bookmark', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThreadByA);
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const result = await service.bookmark('thread-1', userB);
      expect(result.bookmarked).toBe(true);
    });

    it('should throw NotFoundException for removed thread bookmark', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThreadByA, isRemoved: true });
      await expect(service.bookmark('thread-1', userB)).rejects.toThrow(NotFoundException);
    });
  });
});
