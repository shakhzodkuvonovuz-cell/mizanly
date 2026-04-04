import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ThreadsService } from './threads.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ThreadsService', () => {
  let service: ThreadsService;
  let prisma: any;
  let redis: any;
  let eventEmitter: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ThreadsService,
        {
          provide: PrismaService,
          useValue: {
            thread: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
            },
            threadReaction: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            threadReply: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
              update: jest.fn(),
            },
            threadReplyLike: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            threadBookmark: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            block: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            mute: {
              findMany: jest.fn(),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            feedDismissal: {
              upsert: jest.fn(),
            },
            restrict: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            pollOption: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            pollVote: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
            },
            poll: {
              update: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: (() => {
            const sortedSets = new Map<string, { score: number; member: string }[]>();
            const hashStore = new Map<string, Map<string, string>>();
            const redisMock = {
              get: jest.fn(),
              set: jest.fn().mockResolvedValue('OK'),
              setex: jest.fn(),
              del: jest.fn(async (...keys: string[]) => { for (const k of keys) { sortedSets.delete(k); hashStore.delete(k); } return keys.length; }),
              zcard: jest.fn(async (key: string) => sortedSets.get(key)?.length ?? 0),
              zadd: jest.fn(async (key: string, ...args: (string | number)[]) => {
                if (!sortedSets.has(key)) sortedSets.set(key, []);
                const set = sortedSets.get(key)!;
                for (let i = 0; i < args.length; i += 2) set.push({ score: Number(args[i]), member: String(args[i + 1]) });
                return args.length / 2;
              }),
              zrevrange: jest.fn(async (key: string, start: number, stop: number) => {
                const set = sortedSets.get(key);
                if (!set) return [];
                const sorted = [...set].sort((a, b) => b.score - a.score);
                return sorted.slice(start, stop + 1).map(s => s.member);
              }),
              hset: jest.fn(async (key: string, ...args: string[]) => {
                if (!hashStore.has(key)) hashStore.set(key, new Map());
                const h = hashStore.get(key)!;
                for (let i = 0; i < args.length; i += 2) h.set(args[i], args[i + 1]);
                return args.length / 2;
              }),
              hmget: jest.fn(async (key: string, ...fields: string[]) => {
                const h = hashStore.get(key);
                return fields.map(f => h?.get(f) ?? null);
              }),
              expire: jest.fn().mockResolvedValue(1),
              pipeline: jest.fn(() => {
                const cmds: (() => Promise<unknown>)[] = [];
                const pipe: Record<string, unknown> = {
                  del: (...keys: string[]) => { cmds.push(() => redisMock.del(...keys)); return pipe; },
                  zadd: (key: string, ...args: (string | number)[]) => { cmds.push(() => redisMock.zadd(key, ...args)); return pipe; },
                  hset: (key: string, ...args: string[]) => { cmds.push(() => redisMock.hset(key, ...args)); return pipe; },
                  expire: (key: string, s: number) => { cmds.push(() => redisMock.expire(key, s)); return pipe; },
                  exec: async () => { const r: [null, unknown][] = []; for (const c of cmds) { r.push([null, await c()]); } return r; },
                };
                return pipe;
              }),
            };
            return redisMock;
          })(),
        },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    eventEmitter = module.get(EventEmitter2);
  });

  describe('createThread', () => {
    it('should create thread and increment user threadsCount', async () => {
      const userId = 'user-123';
      const dto = {
        content: 'Hello thread',
        visibility: 'PUBLIC' as const,
      };
      const mockThread = {
        id: 'thread-456',
        userId,
        content: dto.content,
        visibility: dto.visibility,
        mediaUrls: [],
        mediaTypes: [],
        hashtags: [],
        mentions: [],
        likesCount: 0,
        repliesCount: 0,
        repostsCount: 0,
        quotesCount: 0,
        viewsCount: 0,
        bookmarksCount: 0,
        hideLikesCount: false,
        isPinned: false,
        isSensitive: false,
        isRemoved: false,
        isChainHead: true,
        chainId: null,
        chainPosition: null,
        isQuotePost: false,
        quoteText: null,
        repostOfId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: userId,
          username: 'testuser',
          displayName: 'Test User',
          avatarUrl: null,
          isVerified: false,
        },
        circle: null,
        poll: null,
        repostOf: null,
      };

      prisma.$transaction.mockResolvedValue([mockThread, {}]);
      prisma.thread.create.mockResolvedValue(mockThread as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.hashtag.upsert.mockResolvedValue({} as any);

      const result = await service.create(userId, dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.thread.create).toHaveBeenCalledWith({
        data: {
          userId,
          content: dto.content,
          visibility: dto.visibility,
          circleId: undefined,
          mediaUrls: [],
          mediaTypes: [],
          hashtags: [],
          mentions: [],
          isQuotePost: false,
          quoteText: undefined,
          repostOfId: undefined,
          poll: undefined,
          scheduledAt: null,
        },
        select: expect.any(Object),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { threadsCount: { increment: 1 } },
      });
      expect(result).toEqual(mockThread);
    });

    it('should create thread with poll — creates thread + poll options', async () => {
      const userId = 'user-123';
      const dto = {
        content: 'Poll thread',
        visibility: 'PUBLIC' as const,
        poll: {
          question: 'What do you think?',
          options: [
            { text: 'Option 1' },
            { text: 'Option 2' },
          ],
          allowMultiple: false,
          endsAt: new Date(Date.now() + 86400000).toISOString(),
        },
      };
      const mockThread = {
        id: 'thread-456',
        userId,
        content: dto.content,
        visibility: dto.visibility,
        poll: {
          id: 'poll-789',
          question: dto.poll.question,
          endsAt: new Date(dto.poll.endsAt),
          allowMultiple: dto.poll.allowMultiple,
          totalVotes: 0,
          options: [
            { id: 'opt-1', text: 'Option 1', position: 0, votesCount: 0, _count: { votes: 0 } },
            { id: 'opt-2', text: 'Option 2', position: 1, votesCount: 0, _count: { votes: 0 } },
          ],
        },
        // ... other fields
      } as any;

      prisma.$transaction.mockResolvedValue([mockThread, {}]);
      prisma.thread.create.mockResolvedValue(mockThread);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.hashtag.upsert.mockResolvedValue({} as any);

      const result = await service.create(userId, dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      const threadCreateCall = prisma.thread.create.mock.calls[0];
      expect(threadCreateCall[0].data.poll).toBeDefined();
      expect(threadCreateCall[0].data.poll.create.question).toBe(dto.poll.question);
      expect(result).toEqual(mockThread);
    });
  });

  describe('deleteThread', () => {
    it('should soft-delete and decrement count', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const mockThread = {
        id: threadId,
        userId,
        isRemoved: false,
      };

      prisma.thread.findUnique.mockResolvedValue(mockThread as any);
      prisma.$transaction.mockResolvedValue([{ ...mockThread, isRemoved: true }, 1]);
      prisma.thread.update.mockResolvedValue({ ...mockThread, isRemoved: true } as any);
      prisma.$executeRaw.mockResolvedValue(1 as any);

      const result = await service.delete(threadId, userId);

      expect(prisma.thread.findUnique).toHaveBeenCalledWith({ where: { id: threadId } });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: threadId },
        data: { isRemoved: true },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-author', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const mockThread = {
        id: threadId,
        userId: 'different-user',
        isRemoved: false,
      };

      prisma.thread.findUnique.mockResolvedValue(mockThread as any);

      await expect(service.delete(threadId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('likeReply', () => {
    it('should create ThreadReplyLike and increment count', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const replyId = 'reply-789';
      const mockReply = {
        id: replyId,
        threadId,
        userId: 'reply-owner',
        likesCount: 5,
      };

      prisma.threadReply.findUnique.mockResolvedValue(mockReply as any);
      prisma.threadReplyLike.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, { ...mockReply, likesCount: 6 }]);
      prisma.threadReplyLike.create.mockResolvedValue({} as any);
      prisma.threadReply.update.mockResolvedValue({ ...mockReply, likesCount: 6 } as any);

      const result = await service.likeReply(threadId, replyId, userId);

      expect(prisma.threadReply.findUnique).toHaveBeenCalledWith({ where: { id: replyId } });
      expect(prisma.threadReplyLike.findUnique).toHaveBeenCalledWith({
        where: { userId_replyId: { userId, replyId } },
      });
      expect(prisma.threadReplyLike.create).toHaveBeenCalledWith({
        data: { userId, replyId },
      });
      expect(prisma.threadReply.update).toHaveBeenCalledWith({
        where: { id: replyId },
        data: { likesCount: { increment: 1 } },
      });
      expect(result).toEqual({ liked: true });
    });

    it('should throw ConflictException if already liked', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const replyId = 'reply-789';
      const mockReply = {
        id: replyId,
        threadId,
      };
      const mockLike = {
        userId,
        replyId,
      };

      prisma.threadReply.findUnique.mockResolvedValue(mockReply as any);
      prisma.threadReplyLike.findUnique.mockResolvedValue(mockLike as any);

      await expect(service.likeReply(threadId, replyId, userId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('unlikeReply', () => {
    it('should delete like and decrement count', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const replyId = 'reply-789';
      const mockLike = {
        userId,
        replyId,
      };

      prisma.threadReplyLike.findUnique.mockResolvedValue(mockLike as any);
      prisma.$transaction.mockResolvedValue([{}, 1]);
      prisma.threadReplyLike.delete.mockResolvedValue({} as any);
      prisma.$executeRaw.mockResolvedValue(1 as any);

      const result = await service.unlikeReply(threadId, replyId, userId);

      expect(prisma.threadReplyLike.findUnique).toHaveBeenCalledWith({
        where: { userId_replyId: { userId, replyId } },
      });
      expect(prisma.threadReplyLike.delete).toHaveBeenCalledWith({
        where: { userId_replyId: { userId, replyId } },
      });
      expect(result).toEqual({ liked: false });
    });
  });

  describe('getFeed', () => {
    it('should return threads sorted by engagement score for trending', async () => {
      const userId = 'user-123';
      const now = new Date();
      const mockThreads = [
        {
          id: 'thread-1',
          content: 'Trending thread 1',
          likesCount: 100,
          repliesCount: 20,
          repostsCount: 5,
          quotesCount: 3,
          viewsCount: 500,
          createdAt: now,
          user: { id: 'user-1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
        } as any,
        {
          id: 'thread-2',
          content: 'Trending thread 2',
          likesCount: 50,
          repliesCount: 10,
          repostsCount: 2,
          quotesCount: 1,
          viewsCount: 200,
          createdAt: now,
          user: { id: 'user-2', username: 'user2', displayName: 'User 2', avatarUrl: null, isVerified: false },
        } as any,
      ];

      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.getFeed(userId, 'trending');

      expect(prisma.thread.findMany).toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
      // Higher engagement thread should be first
      expect(result.data[0].id).toBe('thread-1');
    });
  });

  describe('addReply', () => {
    it('should create reply and increment repliesCount', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const content = 'This is a reply';
      const mockThread = {
        id: threadId,
        userId: 'thread-owner',
        isRemoved: false,
      };
      const mockReply = {
        id: 'reply-789',
        threadId,
        userId,
        content,
        mediaUrls: [],
        likesCount: 0,
        createdAt: new Date(),
        parentId: null,
        user: {
          id: userId,
          username: 'replyuser',
          displayName: 'Reply User',
          avatarUrl: null,
          isVerified: false,
        },
        _count: { replies: 0 },
      } as any;

      prisma.thread.findUnique.mockResolvedValue(mockThread as any);
      prisma.$transaction.mockResolvedValue([mockReply, {}]);
      prisma.threadReply.create.mockResolvedValue(mockReply);
      prisma.thread.update.mockResolvedValue({} as any);
      const result = await service.addReply(threadId, userId, content);

      expect(prisma.thread.findUnique).toHaveBeenCalledWith({ where: { id: threadId } });
      expect(prisma.threadReply.create).toHaveBeenCalledWith({
        data: { threadId, userId, content, parentId: undefined },
        select: expect.any(Object),
      });
      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: threadId },
        data: { repliesCount: { increment: 1 } },
      });
      expect(eventEmitter.emit).toHaveBeenCalled();
      expect(result).toEqual(mockReply);
    });
  });

  describe('report', () => {
    it('should create report record', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const reason = 'SPAM';
      const mockReport = {
        id: 'report-789',
        reporterId: userId,
        description: `thread:${threadId}`,
        reason: 'SPAM',
        createdAt: new Date(),
      } as any;

      prisma.thread.findUnique.mockResolvedValue({ id: threadId, isRemoved: false });
      prisma.report.create.mockResolvedValue(mockReport);

      const result = await service.report(threadId, userId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: userId,
          reportedThreadId: threadId,
          reason: 'SPAM',
        },
      });
      expect(result).toEqual({ reported: true });
    });
  });

  // ═══════════════════════════════════════════════════════
  // getById
  // ═══════════════════════════════════════════════════════

  describe('getById', () => {
    const mockThread = {
      id: 'thread-1', content: 'Test thread', isRemoved: false, visibility: 'PUBLIC',
      likesCount: 10, repliesCount: 5, repostsCount: 2,
      user: { id: 'owner', username: 'owner', displayName: 'Owner', avatarUrl: null, isVerified: false },
    };

    it('should return thread with viewer reaction and bookmark status', async () => {
      prisma.thread.findFirst.mockResolvedValue(mockThread);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.threadReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId: 'viewer' });

      const result = await service.getById('thread-1', 'viewer');
      expect(result.id).toBe('thread-1');
      expect(result.userReaction).toBe('LIKE');
      expect(result.isBookmarked).toBe(true);
    });

    it('should return thread without viewer context', async () => {
      prisma.thread.findFirst.mockResolvedValue(mockThread);

      const result = await service.getById('thread-1');
      expect(result.userReaction).toBeNull();
      expect(result.isBookmarked).toBe(false);
    });

    it('should throw NotFoundException when not found (banned user)', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when viewer is blocked', async () => {
      prisma.thread.findFirst.mockResolvedValue(mockThread);
      prisma.block.findFirst.mockResolvedValue({ blockerId: 'viewer', blockedId: 'owner' });
      await expect(service.getById('thread-1', 'viewer')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // like / unlike
  // ═══════════════════════════════════════════════════════

  describe('like', () => {
    it('should throw BadRequestException when liking own thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'user-1', isRemoved: false });

      await expect(service.like('thread-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should like thread by another user', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner-99', isRemoved: false });
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.like('thread-1', 'user-1');
      expect(result).toEqual({ liked: true });
    });

    it('should throw NotFoundException for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: true });
      await expect(service.like('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already liked', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: false });
      prisma.threadReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      await expect(service.like('thread-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('unlike', () => {
    it('should unlike thread', async () => {
      prisma.threadReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      prisma.$transaction.mockResolvedValue([{}, 1]);

      const result = await service.unlike('thread-1', 'user-1');
      expect(result).toEqual({ liked: false });
    });

    it('should throw NotFoundException if not liked', async () => {
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      await expect(service.unlike('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // bookmark / unbookmark
  // ═══════════════════════════════════════════════════════

  describe('bookmark', () => {
    it('should bookmark thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: false });
      prisma.threadBookmark.create.mockResolvedValue({});
      const result = await service.bookmark('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: true });
    });

    it('should throw NotFoundException for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: true });
      await expect(service.bookmark('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when thread not found', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.bookmark('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unbookmark', () => {
    it('should unbookmark thread', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId: 'user-1', threadId: 'thread-1' });
      prisma.threadBookmark.delete.mockResolvedValue({});
      const result = await service.unbookmark('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: false });
    });

    it('should throw NotFoundException if not bookmarked', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      await expect(service.unbookmark('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getReplies
  // ═══════════════════════════════════════════════════════

  describe('getReplies', () => {
    it('should return replies with pagination', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.threadReply.findMany.mockResolvedValue([
        { id: 'reply-1', content: 'Good point', user: { id: 'u1' } },
      ]);
      prisma.threadReplyLike.findMany.mockResolvedValue([]);

      const result = await service.getReplies('thread-1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty for thread with no replies', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.threadReply.findMany.mockResolvedValue([]);

      const result = await service.getReplies('thread-1');
      expect(result.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // deleteReply
  // ═══════════════════════════════════════════════════════

  describe('deleteReply', () => {
    it('should delete own reply', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'reply-1', userId: 'user-1', threadId: 'thread-1' });
      prisma.threadReply.update.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.deleteReply('reply-1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-author', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'reply-1', userId: 'other', threadId: 'thread-1' });
      await expect(service.deleteReply('reply-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when reply not found', async () => {
      prisma.threadReply.findUnique.mockResolvedValue(null);
      await expect(service.deleteReply('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // dismiss
  // ═══════════════════════════════════════════════════════

  describe('dismiss', () => {
    it('should dismiss thread from feed', async () => {
      prisma.feedDismissal = { upsert: jest.fn().mockResolvedValue({}) };
      const result = await service.dismiss('thread-1', 'user-1');
      expect(result).toEqual({ dismissed: true });
    });
  });

  // ═══════════════════════════════════════════════════════
  // getShareLink / isBookmarked
  // ═══════════════════════════════════════════════════════

  describe('getShareLink', () => {
    it('should return share URL', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: false });
      const result = await service.getShareLink('thread-1');
      expect(result.url).toContain('thread-1');
    });
  });

  describe('isBookmarked', () => {
    it('should return bookmarked true when bookmarked', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId: 'user-1', threadId: 'thread-1' });
      const result = await service.isBookmarked('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: true });
    });

    it('should return bookmarked false when not bookmarked', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      const result = await service.isBookmarked('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: false });
    });
  });

  // ═══════════════════════════════════════════════════════
  // getFeed
  // ═══════════════════════════════════════════════════════

  describe('getFeed', () => {
    it('should return empty feed for user with follows but no posts', async () => {
      prisma.follow.findMany.mockResolvedValue(
        Array(15).fill(null).map((_, i) => ({ followingId: `f-${i}` })),
      );
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      prisma.threadBookmark.findUnique.mockResolvedValue(null);

      const result = await service.getFeed('user-1', 'following');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should fall back to trending when user has zero follows', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-1', 'following');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getUserThreads
  // ═══════════════════════════════════════════════════════

  describe('getUserThreads', () => {
    it('should return empty threads for user with no threads', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      prisma.thread.findMany.mockResolvedValue([]);

      const result = await service.getUserThreads('testuser');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserThreads('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // repost / unrepost
  // ═══════════════════════════════════════════════════════

  describe('repost', () => {
    it('should create repost and increment repostsCount', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: false });
      prisma.thread.findFirst.mockResolvedValue(null);
      const repostThread = { id: 'repost-1', userId: 'user-1', repostOfId: 'thread-1', user: { id: 'user-1' } };
      prisma.$transaction.mockResolvedValue([repostThread, {}]);

      const result = await service.repost('thread-1', 'user-1');
      expect(result.repostOfId).toBe('thread-1');
    });

    it('should throw BadRequestException when reposting own thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'user-1', isRemoved: false });
      await expect(service.repost('thread-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when already reposted', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: false });
      prisma.thread.findFirst.mockResolvedValue({ id: 'repost-1' });
      await expect(service.repost('thread-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when thread not found', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.repost('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when thread is removed', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: true });
      await expect(service.repost('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unrepost', () => {
    it('should remove repost and decrement count', async () => {
      prisma.thread.findFirst.mockResolvedValue({ id: 'repost-1', userId: 'user-1', repostOfId: 'thread-1' });
      prisma.$transaction.mockResolvedValue([{}, 1]);

      const result = await service.unrepost('thread-1', 'user-1');
      expect(result).toEqual({ reposted: false });
    });

    it('should throw NotFoundException when no repost exists', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.unrepost('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // votePoll
  // ═══════════════════════════════════════════════════════

  describe('votePoll', () => {
    const mockOption = {
      id: 'opt-1', pollId: 'poll-1', text: 'Option A', votesCount: 0,
      poll: { id: 'poll-1', endsAt: null, allowMultiple: false, totalVotes: 0 },
    };

    it('should cast vote and increment counts', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(mockOption);
      prisma.pollVote.findUnique.mockResolvedValue(null);
      prisma.pollVote.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.votePoll('opt-1', 'user-1');
      expect(result).toEqual({ voted: true });
    });

    it('should throw NotFoundException for nonexistent option', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(null);
      await expect(service.votePoll('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when poll has ended', async () => {
      const expiredOption = {
        ...mockOption,
        poll: { ...mockOption.poll, endsAt: new Date(Date.now() - 86400000) },
      };
      prisma.pollOption.findUnique.mockResolvedValue(expiredOption);
      await expect(service.votePoll('opt-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when already voted on same option', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(mockOption);
      prisma.pollVote.findUnique.mockResolvedValue({ userId: 'user-1', optionId: 'opt-1' });
      await expect(service.votePoll('opt-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when already voted on poll (single choice)', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(mockOption);
      prisma.pollVote.findUnique.mockResolvedValue(null);
      prisma.pollVote.findFirst.mockResolvedValue({ userId: 'user-1', optionId: 'opt-2' });
      await expect(service.votePoll('opt-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // AUDIT V2 — New tests for fixed findings
  // ═══════════════════════════════════════════════════════

  describe('Audit V2 — getById visibility enforcement', () => {
    it('A04-#4: getById should use findFirst with banned filter', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.getById('t1')).rejects.toThrow(NotFoundException);
      expect(prisma.thread.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRemoved: false,
            user: { isBanned: false, isDeactivated: false, isDeleted: false },
          }),
        }),
      );
    });

    it('A04-#4: getById should reject FOLLOWERS-only thread for anonymous', async () => {
      prisma.thread.findFirst.mockResolvedValue({
        id: 't1', visibility: 'FOLLOWERS', user: { id: 'author' }, isRemoved: false,
      });
      await expect(service.getById('t1')).rejects.toThrow(NotFoundException);
    });

    it('A04-#4: getById should return PUBLIC thread for anonymous', async () => {
      prisma.thread.findFirst.mockResolvedValue({
        id: 't1', visibility: 'PUBLIC', user: { id: 'author' }, isRemoved: false,
      });
      const result = await service.getById('t1');
      expect(result.id).toBe('t1');
    });
  });

  describe('Audit V2 — content moderation', () => {
    it('A04-#5: updateThread should run content moderation', async () => {
      prisma.thread.findUnique.mockResolvedValue({ userId: 'u1', isRemoved: false });
      const contentSafety = (service as any).contentSafety;
      contentSafety.moderateText = jest.fn().mockResolvedValue({ safe: false, flags: ['HATE_SPEECH'], suggestion: 'Remove hate speech' });

      await expect(service.updateThread('t1', 'u1', 'hate content')).rejects.toThrow(BadRequestException);
    });

    it('A04-#6: createContinuation should run content moderation', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', isRemoved: false, chainId: null });
      const contentSafety = (service as any).contentSafety;
      contentSafety.moderateText = jest.fn().mockResolvedValue({ safe: false, flags: ['SPAM'] });

      await expect(service.createContinuation('u1', 't1', 'spam content')).rejects.toThrow(BadRequestException);
    });

    it('A04-#7: addReply should run content moderation', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 't1', userId: 'author', isRemoved: false, replyPermission: 'EVERYONE' });
      const contentSafety = (service as any).contentSafety;
      contentSafety.moderateText = jest.fn().mockResolvedValue({ safe: false, flags: ['NSFW'] });

      await expect(service.addReply('t1', 'u1', 'nsfw content')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Audit V2 — self-like guard', () => {
    it('A04-#10: likeReply should reject self-likes', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'r1', threadId: 't1', userId: 'u1' });
      await expect(service.likeReply('t1', 'r1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Audit V2 — getUserThreads user status', () => {
    it('B04-#12: getUserThreads should reject banned user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isBanned: true, isDeactivated: false, isDeleted: false });
      await expect(service.getUserThreads('banned-user')).rejects.toThrow(NotFoundException);
    });

    it('B04-#12: getUserThreads should reject deactivated user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isBanned: false, isDeactivated: true, isDeleted: false });
      await expect(service.getUserThreads('deactivated-user')).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: canReply() — 5 permission branches (T04 #1, C severity)
  // ────────────────────────────────────────────────────────────
  describe('canReply', () => {
    const baseThread = { userId: 'author-1', replyPermission: 'EVERYONE', mentions: ['alice'], isRemoved: false, user: { username: 'author' } };

    it('should throw NotFoundException for nonexistent thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.canReply('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, isRemoved: true });
      await expect(service.canReply('t1')).rejects.toThrow(NotFoundException);
    });

    it('should return canReply=true reason=author when viewer is the thread author', async () => {
      prisma.thread.findUnique.mockResolvedValue(baseThread);
      const result = await service.canReply('t1', 'author-1');
      expect(result).toEqual({ canReply: true, reason: 'author' });
    });

    it('should return canReply=true reason=everyone when permission is EVERYONE', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'EVERYONE' });
      const result = await service.canReply('t1', 'viewer-1');
      expect(result).toEqual({ canReply: true, reason: 'everyone' });
    });

    it('should return canReply=false reason=none when permission is NONE', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'NONE' });
      const result = await service.canReply('t1', 'viewer-1');
      expect(result).toEqual({ canReply: false, reason: 'none' });
    });

    it('should return canReply=true reason=following when viewer follows author', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'FOLLOWING' });
      prisma.follow.findUnique.mockResolvedValue({ followerId: 'viewer-1', followingId: 'author-1' });
      const result = await service.canReply('t1', 'viewer-1');
      expect(result).toEqual({ canReply: true, reason: 'following' });
    });

    it('should return canReply=false reason=not_following when viewer does not follow author', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'FOLLOWING' });
      prisma.follow.findUnique.mockResolvedValue(null);
      const result = await service.canReply('t1', 'viewer-1');
      expect(result).toEqual({ canReply: false, reason: 'not_following' });
    });

    it('should return canReply=false reason=not_following when unauthenticated and permission is FOLLOWING', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'FOLLOWING' });
      const result = await service.canReply('t1');
      expect(result).toEqual({ canReply: false, reason: 'not_following' });
    });

    it('should return canReply=true reason=mentioned when viewer is mentioned', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'MENTIONED', mentions: ['alice'] });
      prisma.user.findUnique.mockResolvedValue({ username: 'alice' });
      const result = await service.canReply('t1', 'viewer-1');
      expect(result).toEqual({ canReply: true, reason: 'mentioned' });
    });

    it('should return canReply=false reason=not_mentioned when viewer is not mentioned', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'MENTIONED', mentions: ['alice'] });
      prisma.user.findUnique.mockResolvedValue({ username: 'bob' });
      const result = await service.canReply('t1', 'viewer-1');
      expect(result).toEqual({ canReply: false, reason: 'not_mentioned' });
    });

    it('should return canReply=false reason=not_mentioned when unauthenticated and permission is MENTIONED', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'MENTIONED' });
      const result = await service.canReply('t1');
      expect(result).toEqual({ canReply: false, reason: 'not_mentioned' });
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: createContinuation() (T04 #2, C severity)
  // ────────────────────────────────────────────────────────────
  describe('createContinuation', () => {
    const parentThread = { id: 'parent-1', userId: 'u1', isRemoved: false, chainId: null, chainPosition: null, visibility: 'PUBLIC' };

    beforeEach(() => {
      const cs = (service as any).contentSafety;
      cs.moderateText = jest.fn().mockResolvedValue({ safe: true, flags: [] });
    });

    it('should throw NotFoundException for nonexistent parent thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.createContinuation('u1', 'missing', 'content')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-author tries to continue', async () => {
      prisma.thread.findUnique.mockResolvedValue(parentThread);
      await expect(service.createContinuation('other-user', 'parent-1', 'content')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...parentThread, isRemoved: true });
      await expect(service.createContinuation('u1', 'parent-1', 'content')).rejects.toThrow(BadRequestException);
    });

    it('should create chain head from non-chain parent and set chainId=parentId', async () => {
      prisma.thread.findUnique.mockResolvedValue(parentThread);
      prisma.thread.update.mockResolvedValue({});
      prisma.thread.count.mockResolvedValue(1);
      const continuation = { id: 'cont-1', chainId: 'parent-1', chainPosition: 2, isChainHead: false };
      prisma.thread.create.mockResolvedValue(continuation);

      const result = await service.createContinuation('u1', 'parent-1', 'continuation text');

      // Parent should be updated to become chain head
      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: 'parent-1' },
        data: { chainId: 'parent-1', chainPosition: 1, isChainHead: true },
      });
      expect(prisma.thread.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ chainId: 'parent-1', isChainHead: false }),
      }));
      expect(result).toEqual(continuation);
    });

    it('should use existing chainId when parent is already in a chain', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...parentThread, chainId: 'chain-99' });
      prisma.thread.count.mockResolvedValue(3);
      prisma.thread.create.mockResolvedValue({ id: 'cont-2', chainId: 'chain-99', chainPosition: 4 });

      await service.createContinuation('u1', 'parent-1', 'content');

      // Should NOT update parent since it's already in a chain
      expect(prisma.thread.update).not.toHaveBeenCalled();
      expect(prisma.thread.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ chainId: 'chain-99', chainPosition: 4 }),
      }));
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: updateThread() (T04 #3, C severity)
  // ────────────────────────────────────────────────────────────
  describe('updateThread', () => {
    beforeEach(() => {
      const cs = (service as any).contentSafety;
      cs.moderateText = jest.fn().mockResolvedValue({ safe: true, flags: [] });
    });

    it('should throw NotFoundException for nonexistent thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.updateThread('missing', 'u1', 'new content')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner tries to update', async () => {
      prisma.thread.findUnique.mockResolvedValue({ userId: 'other', isRemoved: false });
      await expect(service.updateThread('t1', 'u1', 'new content')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ userId: 'u1', isRemoved: true });
      await expect(service.updateThread('t1', 'u1', 'new content')).rejects.toThrow(BadRequestException);
    });

    it('should update thread content and return updated thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ userId: 'u1', isRemoved: false });
      const updated = { id: 't1', content: 'updated text', visibility: 'PUBLIC', hashtags: [], user: { username: 'u1' } };
      prisma.thread.update.mockResolvedValue(updated);

      const result = await service.updateThread('t1', 'u1', 'updated text');

      expect(prisma.thread.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 't1' },
        data: { content: 'updated text' },
      }));
      expect(result).toEqual(updated);
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: shareToStory() (T04 #4, H severity)
  // ────────────────────────────────────────────────────────────
  describe('shareToStory', () => {
    it('should throw NotFoundException for nonexistent/removed thread', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.shareToStory('missing', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when non-owner tries to share non-public thread', async () => {
      prisma.thread.findFirst.mockResolvedValue({
        id: 't1', userId: 'author-1', visibility: 'FOLLOWERS', content: 'test',
        user: { displayName: 'Author', username: 'author', avatarUrl: null },
        likesCount: 10, repliesCount: 5,
      });
      await expect(service.shareToStory('t1', 'other-user')).rejects.toThrow(NotFoundException);
    });

    it('should return formatted story data for public thread', async () => {
      prisma.thread.findFirst.mockResolvedValue({
        id: 't1', userId: 'author-1', visibility: 'PUBLIC', content: 'Hello world',
        user: { displayName: 'Author', username: 'author', avatarUrl: 'https://avatar.url' },
        likesCount: 10, repliesCount: 5,
      });

      const result = await service.shareToStory('t1', 'viewer-1');

      expect(result).toEqual(expect.objectContaining({
        threadId: 't1',
        content: 'Hello world',
        author: 'Author',
        authorAvatar: 'https://avatar.url',
        authorUsername: 'author',
        likesCount: 10,
        repliesCount: 5,
        shareUrl: 'https://mizanly.app/thread/t1',
      }));
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: recordView() (T04 #5, M severity)
  // ────────────────────────────────────────────────────────────
  describe('recordView', () => {
    it('should increment viewsCount for the thread', async () => {
      prisma.thread.update.mockResolvedValue({});
      await service.recordView('t1');
      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { viewsCount: { increment: 1 } },
      });
    });

    it('should gracefully swallow errors (fire-and-forget)', async () => {
      prisma.thread.update.mockRejectedValue(new Error('DB error'));
      // Should not throw — error is caught internally
      await expect(service.recordView('nonexistent')).resolves.toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: addReply() reply permission enforcement (T04 #6, M)
  // ────────────────────────────────────────────────────────────
  describe('addReply — reply permission enforcement', () => {
    const baseThread = {
      id: 't1', userId: 'author-1', isRemoved: false, scheduledAt: null,
      replyPermission: 'FOLLOWING', mentions: ['alice'],
    };

    beforeEach(() => {
      // Ensure content safety returns safe for reply permission tests
      const cs = (service as any).contentSafety;
      cs.moderateText = jest.fn().mockResolvedValue({ safe: true, flags: [] });
    });

    it('should throw ForbiddenException for FOLLOWING when replier does not follow author', async () => {
      prisma.thread.findUnique.mockResolvedValue(baseThread);
      prisma.follow.findUnique.mockResolvedValue(null);
      await expect(service.addReply('t1', 'replier-1', 'test reply')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for MENTIONED when replier is not mentioned', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'MENTIONED' });
      prisma.user.findUnique.mockResolvedValue({ username: 'bob' });
      await expect(service.addReply('t1', 'replier-1', 'test reply')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for NONE permission', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'NONE' });
      await expect(service.addReply('t1', 'replier-1', 'test reply')).rejects.toThrow(ForbiddenException);
    });

    it('should allow author to reply regardless of permission setting', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, replyPermission: 'NONE' });
      prisma.threadReply.findUnique.mockResolvedValue(null);
      const reply = { id: 'r1', content: 'reply', user: { id: 'author-1' } };
      prisma.$transaction.mockResolvedValue([reply, {}]);
      prisma.threadReply.create.mockResolvedValue(reply);
      prisma.thread.update.mockResolvedValue({});

      const result = await service.addReply('t1', 'author-1', 'self reply');
      expect(result).toEqual(reply);
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: bookmark() P2002 race (T04 #8, M severity)
  // ────────────────────────────────────────────────────────────
  describe('bookmark — P2002 race condition', () => {
    it('should throw ConflictException when P2002 unique constraint violated', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 't1', isRemoved: false });
      // Import the actual PrismaClientKnownRequestError class
      const { Prisma } = require('@prisma/client');
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.0.0' });
      prisma.$transaction.mockRejectedValue(p2002Error);

      await expect(service.bookmark('t1', 'u1')).rejects.toThrow(ConflictException);
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: like() P2002 race (T04 #9, M severity)
  // ────────────────────────────────────────────────────────────
  describe('like — P2002 race condition', () => {
    it('should return liked:true when P2002 occurs (concurrent duplicate)', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 't1', isRemoved: false, userId: 'other-user', scheduledAt: null });
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      const error = new Error('P2002') as any;
      error.code = 'P2002';
      prisma.$transaction.mockRejectedValue(error);

      const result = await service.like('t1', 'u1');
      expect(result).toEqual({ liked: true });
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: votePoll() P2002 race (T04 #10, M severity)
  // ────────────────────────────────────────────────────────────
  describe('votePoll — P2002 race condition', () => {
    it('should throw ConflictException when P2002 occurs (concurrent duplicate vote)', async () => {
      prisma.pollOption.findUnique.mockResolvedValue({
        id: 'opt-1', pollId: 'poll-1',
        poll: { endsAt: null, allowMultiple: false },
      });
      prisma.pollVote.findUnique.mockResolvedValue(null);
      prisma.pollVote.findFirst.mockResolvedValue(null);
      const error = new Error('P2002') as any;
      error.code = 'P2002';
      prisma.$transaction.mockRejectedValue(error);

      await expect(service.votePoll('opt-1', 'u1')).rejects.toThrow(ConflictException);
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: getThreadAnalytics() (tested in unroll spec but verify here)
  // ────────────────────────────────────────────────────────────
  describe('getThreadAnalytics', () => {
    it('should throw NotFoundException for nonexistent thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.getThreadAnalytics('t1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-author', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 't1', userId: 'other' });
      await expect(service.getThreadAnalytics('t1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('should return thread stats with comparison to average', async () => {
      prisma.thread.findUnique.mockResolvedValue({
        id: 't1', userId: 'u1', likesCount: 20, repliesCount: 10, repostsCount: 5, viewsCount: 100,
      });
      prisma.thread.findMany.mockResolvedValue([
        { likesCount: 10, repliesCount: 5, repostsCount: 2, viewsCount: 50 },
        { likesCount: 10, repliesCount: 5, repostsCount: 2, viewsCount: 50 },
      ]);

      const result = await service.getThreadAnalytics('t1', 'u1');

      expect(result.thread).toEqual({ likes: 20, replies: 10, reposts: 5, views: 100 });
      expect(result.average.likes).toBe(10);
      expect(result.comparison.likesVsAvg).toBe(100); // (20-10)/10 * 100
    });
  });

  // ────────────────────────────────────────────────────────────
  // W7-T1: getThreadUnroll() (verify basic behavior)
  // ────────────────────────────────────────────────────────────
  describe('getThreadUnroll', () => {
    it('should throw NotFoundException for nonexistent thread', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.getThreadUnroll('missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-public thread', async () => {
      prisma.thread.findFirst.mockResolvedValue({ id: 't1', visibility: 'FOLLOWERS', chainId: null });
      await expect(service.getThreadUnroll('t1')).rejects.toThrow(NotFoundException);
    });

    it('should return single thread when no chain', async () => {
      const thread = { id: 't1', visibility: 'PUBLIC', chainId: null };
      prisma.thread.findFirst.mockResolvedValue(thread);
      const result = await service.getThreadUnroll('t1');
      expect(result.data).toEqual([thread]);
      expect(result.meta.totalParts).toBe(1);
    });

    it('should return chain threads ordered by position', async () => {
      prisma.thread.findFirst.mockResolvedValue({ id: 't1', visibility: 'PUBLIC', chainId: 'chain-1' });
      const chain = [
        { id: 't1', chainPosition: 1 },
        { id: 't2', chainPosition: 2 },
      ];
      prisma.thread.findMany.mockResolvedValue(chain);
      const result = await service.getThreadUnroll('t1');
      expect(result.data).toEqual(chain);
      expect(result.meta.totalParts).toBe(2);
      expect(result.meta.chainId).toBe('chain-1');
    });
  });
});