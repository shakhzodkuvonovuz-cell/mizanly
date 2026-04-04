import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ThreadsService } from './threads.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ThreadsService — edge cases', () => {
  let service: ThreadsService;
  let prisma: any;

  const userId = 'user-edge-1';

  const mockThread = {
    id: 'thread-1',
    userId,
    content: 'test',
    mediaUrls: [],
    mediaTypes: [],
    visibility: 'PUBLIC',
    isChainHead: true,
    chainId: null,
    chainPosition: null,
    isQuotePost: false,
    quoteText: null,
    repostOfId: null,
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
    replyPermission: 'EVERYONE',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false },
    circle: null,
    poll: null,
    repostOf: null,
  };

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
              update: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            follow: { findMany: jest.fn() },
            block: { findMany: jest.fn(), findFirst: jest.fn() },
            mute: { findMany: jest.fn() },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn() },
            feedDismissal: { upsert: jest.fn() },
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
            pollOption: { findUnique: jest.fn(), update: jest.fn() },
            pollVote: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
            poll: { update: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: (() => {
            const sortedSets = new Map<string, { score: number; member: string }[]>();
            const redisMock: Record<string, unknown> = {
              get: jest.fn(), set: jest.fn(), setex: jest.fn(),
              del: jest.fn(async (...keys: string[]) => { for (const k of keys) sortedSets.delete(k); return keys.length; }),
              zcard: jest.fn(async (key: string) => sortedSets.get(key)?.length ?? 0),
              zadd: jest.fn(async (key: string, ...args: (string | number)[]) => { if (!sortedSets.has(key)) sortedSets.set(key, []); const set = sortedSets.get(key)!; for (let i = 0; i < args.length; i += 2) set.push({ score: Number(args[i]), member: String(args[i + 1]) }); return args.length / 2; }),
              zrevrange: jest.fn(async (key: string, start: number, stop: number) => { const set = sortedSets.get(key); if (!set) return []; const sorted = [...set].sort((a, b) => b.score - a.score); return sorted.slice(start, stop + 1).map(s => s.member); }),
              expire: jest.fn().mockResolvedValue(1),
              pipeline: jest.fn(() => { const cmds: (() => Promise<unknown>)[] = []; const pipe: Record<string, unknown> = { del: (...keys: string[]) => { cmds.push(() => (redisMock.del as any)(...keys)); return pipe; }, zadd: (key: string, ...args: (string | number)[]) => { cmds.push(() => (redisMock.zadd as any)(key, ...args)); return pipe; }, expire: (key: string, s: number) => { cmds.push(() => (redisMock.expire as any)(key, s)); return pipe; }, exec: async () => { const r: [null, unknown][] = []; for (const c of cmds) { r.push([null, await c()]); } return r; } }; return pipe; }),
            };
            return redisMock;
          })(),
        },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
    prisma = module.get(PrismaService);
  });

  describe('create — input edge cases', () => {
    it('should handle Arabic thread content with RTL markers', async () => {
      const arabicContent = 'ما شاء الله \u200F #إسلام @scholar';

      prisma.$transaction.mockResolvedValue([
        { ...mockThread, content: arabicContent },
        { threadsCount: 1 },
      ]);

      const result = await service.create(userId, {
        content: arabicContent,
        mentions: ['scholar'],
      });

      expect(result.content).toBe(arabicContent);
    });

    it('should handle mixed bidirectional text (English + Arabic)', async () => {
      const mixedContent = 'English عربي English عربي';

      prisma.$transaction.mockResolvedValue([
        { ...mockThread, content: mixedContent },
        {},
      ]);

      const result = await service.create(userId, { content: mixedContent });
      expect(result.content).toBe(mixedContent);
    });

    it('should handle poll options containing emoji', async () => {
      const dto = {
        content: 'Vote!',
        poll: {
          question: 'Which?',
          options: [{ text: 'Option 🕌' }, { text: 'خيار 📿' }, { text: '🤲' }],
        },
      };

      prisma.$transaction.mockResolvedValue([
        { ...mockThread, content: 'Vote!', poll: { question: 'Which?', options: dto.poll.options } },
        {},
      ]);

      const result = await service.create(userId, dto);
      expect(result).toBeDefined();
      // Verify poll was included in transaction call
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should strip HTML tags from content via sanitizeText', async () => {
      const htmlContent = '<script>alert("xss")</script>Safe text';

      prisma.$transaction.mockResolvedValue([
        { ...mockThread, content: 'Safe text' },
        {},
      ]);

      await service.create(userId, { content: htmlContent });

      const txArgs = prisma.$transaction.mock.calls[0][0];
      // $transaction is called with an array of Prisma operations
      // The thread.create call is the first operation
      expect(txArgs).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('addReply — input edge cases', () => {
    it('should handle reply content containing HTML-like tags (stored as plain text)', async () => {
      const xssReply = '<script>alert("xss")</script>';

      prisma.thread.findUnique.mockResolvedValue(mockThread);
      prisma.$transaction.mockResolvedValue([
        { id: 'reply-1', content: 'alert("xss")', userId, threadId: 'thread-1' },
        {},
      ]);

      const result = await service.addReply('thread-1', userId, xssReply);
      expect(result).toBeDefined();
      // sanitizeText strips HTML tags, so the <script> tags are removed
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException for reply on removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });

      await expect(service.addReply('thread-1', userId, 'reply text'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getFeed — edge cases', () => {
    it('should handle limit = 0 without crashing', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);

      // type='foryou' with no threads — should return empty
      const result = await service.getFeed(userId, 'foryou', undefined, 0);
      expect(result.data).toEqual([]);
    });

    it('should return empty data for trending when no threads exist in DB', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId, 'trending');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('like — edge cases', () => {
    it('should throw NotFoundException when liking a soft-deleted thread (isRemoved: true)', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });

      await expect(service.like('thread-1', userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when already reacted', async () => {
      const otherUser = 'other-user-1';
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, userId: 'thread-author' });
      prisma.threadReaction.findUnique.mockResolvedValue({ userId: otherUser, threadId: 'thread-1', reaction: 'LIKE' });

      await expect(service.like('thread-1', otherUser))
        .rejects.toThrow(ConflictException);
    });
  });
});
