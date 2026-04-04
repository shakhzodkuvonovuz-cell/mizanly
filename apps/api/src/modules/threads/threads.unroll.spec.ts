import { Test } from '@nestjs/testing';
import { ThreadsService } from './threads.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders, mockRedis, mockEventEmitter, mockAiService, mockConfigService, mockContentSafetyService, mockPublishWorkflowService } from '../../common/test/mock-providers';
import { QueueService } from '../../common/queue/queue.service';

const mockPrisma = {
  provide: PrismaService,
  useValue: {
    thread: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    threadReaction: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    threadReply: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    threadReplyLike: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    threadBookmark: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    follow: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    block: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    mute: { findMany: jest.fn().mockResolvedValue([]) },
    hashtag: { upsert: jest.fn() },
    report: { findFirst: jest.fn(), create: jest.fn() },
    feedDismissal: { upsert: jest.fn() },
    pollOption: { findUnique: jest.fn() },
    pollVote: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    poll: { update: jest.fn() },
    $transaction: jest.fn().mockImplementation((fns: any[]) => Promise.all(fns.map((f: any) => f))),
    $executeRaw: jest.fn(),
  },
};

const mockQueue = {
  provide: QueueService,
  useValue: {
    addGamificationJob: jest.fn().mockResolvedValue('job-1'),
    addSearchIndexJob: jest.fn().mockResolvedValue('job-2'),
  },
};

describe('ThreadsService — Thread Unroll & Analytics', () => {
  let service: ThreadsService;
  let prisma: any;

  const baseThread = {
    id: 'thread-1',
    content: 'Hello world',
    chainId: 'chain-1',
    isRemoved: false,
    userId: 'user-1',
    likesCount: 10,
    repliesCount: 5,
    repostsCount: 3,
    viewsCount: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 'user-1', username: 'test', displayName: 'Test', avatarUrl: null, isVerified: false },
    circle: null,
    poll: null,
    repostOf: null,
    mediaUrls: [],
    mediaTypes: [],
    visibility: 'PUBLIC',
    isChainHead: true,
    chainPosition: 1,
    isQuotePost: false,
    quoteText: null,
    repostOfId: null,
    hashtags: [],
    mentions: [],
    quotesCount: 0,
    bookmarksCount: 0,
    hideLikesCount: false,
    isPinned: false,
    isSensitive: false,
    replyPermission: 'EVERYONE',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ThreadsService,
        mockPrisma,
        mockRedis,
        mockEventEmitter,
        mockAiService,
        mockConfigService,
        mockContentSafetyService,
        mockQueue,
        mockPublishWorkflowService,
      ],
    }).compile();

    service = module.get(ThreadsService);
    prisma = module.get(PrismaService);
  });

  describe('getThreadUnroll', () => {
    it('should return single thread when no chain', async () => {
      prisma.thread.findFirst.mockResolvedValue({ ...baseThread, chainId: null });
      const result = await service.getThreadUnroll('thread-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.totalParts).toBe(1);
    });

    it('should return full chain ordered by position', async () => {
      prisma.thread.findFirst.mockResolvedValue(baseThread);
      prisma.thread.findMany.mockResolvedValue([
        { ...baseThread, chainPosition: 1 },
        { ...baseThread, id: 'thread-2', chainPosition: 2 },
        { ...baseThread, id: 'thread-3', chainPosition: 3 },
      ]);
      const result = await service.getThreadUnroll('thread-1');
      expect(result.data).toHaveLength(3);
      expect(result.meta.totalParts).toBe(3);
      expect(result.meta.chainId).toBe('chain-1');
    });

    it('should throw for removed thread', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.getThreadUnroll('thread-1')).rejects.toThrow('Thread not found');
    });

    it('should throw for nonexistent thread', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.getThreadUnroll('nope')).rejects.toThrow('Thread not found');
    });
  });

  describe('getThreadAnalytics', () => {
    it('should return analytics with comparison', async () => {
      prisma.thread.findUnique.mockResolvedValue(baseThread);
      prisma.thread.findMany.mockResolvedValue([
        { likesCount: 5, repliesCount: 2, repostsCount: 1, viewsCount: 50 },
        { likesCount: 5, repliesCount: 2, repostsCount: 1, viewsCount: 50 },
      ]);

      const result = await service.getThreadAnalytics('thread-1', 'user-1');
      expect(result.thread.likes).toBe(10);
      expect(result.average.likes).toBe(5);
      expect(result.comparison.likesVsAvg).toBe(100);
    });

    it('should throw for non-author', async () => {
      prisma.thread.findUnique.mockResolvedValue(baseThread);
      await expect(service.getThreadAnalytics('thread-1', 'other')).rejects.toThrow();
    });

    it('should handle zero averages', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...baseThread, likesCount: 0, repliesCount: 0, repostsCount: 0, viewsCount: 0 });
      prisma.thread.findMany.mockResolvedValue([{ likesCount: 0, repliesCount: 0, repostsCount: 0, viewsCount: 0 }]);
      const result = await service.getThreadAnalytics('thread-1', 'user-1');
      expect(result.comparison.likesVsAvg).toBe(0);
    });
  });
});
