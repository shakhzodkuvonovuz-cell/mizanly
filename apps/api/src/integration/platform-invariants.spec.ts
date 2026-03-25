import { Test } from '@nestjs/testing';
import { PostsService } from '../modules/posts/posts.service';
import { ThreadsService } from '../modules/threads/threads.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';
import { QueueService } from '../common/queue/queue.service';
import { AnalyticsService } from '../common/services/analytics.service';

/**
 * Phase 2, Workstream 6: Platform-level integration tests.
 *
 * These tests validate INVARIANTS that span modules, not individual methods.
 * Each test verifies a truth that should hold across the entire platform.
 */

const mockPrisma = {
  provide: PrismaService,
  useValue: {
    post: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    postReaction: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    comment: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    follow: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    block: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    mute: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'notif-1' }), update: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), delete: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    hashtag: { upsert: jest.fn() },
    report: { findFirst: jest.fn(), create: jest.fn() },
    feedDismissal: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    savedPost: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    postTaggedUser: { findMany: jest.fn().mockResolvedValue([]) },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn().mockImplementation((fns: unknown[]) => Promise.all(fns.map((f: unknown) => f))),
    $executeRaw: jest.fn(),
  },
};

const mockQueue = {
  provide: QueueService,
  useValue: {
    addPushNotificationJob: jest.fn(),
    addGamificationJob: jest.fn(),
    addSearchIndexJob: jest.fn(),
    addModerationJob: jest.fn(),
  },
};

const mockAnalytics = { provide: AnalyticsService, useValue: { track: jest.fn() } };

describe('Platform Invariants', () => {
  let postsService: PostsService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let notifCreate: jest.Mock;
  let queueService: Record<string, jest.Mock>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PostsService,
        mockPrisma,
        ...globalMockProviders.filter(p => {
          const prov = p as { provide: unknown };
          return prov.provide !== PrismaService;
        }),
        mockQueue,
        mockAnalytics,
      ],
    }).compile();

    postsService = module.get(PostsService);
    prisma = module.get(PrismaService) as unknown as Record<string, Record<string, jest.Mock>>;
    notifCreate = (module.get(NotificationsService) as unknown as { create: jest.Mock }).create;
    queueService = module.get(QueueService) as unknown as Record<string, jest.Mock>;
  });

  describe('Invariant: Notification delivery has exactly one owner', () => {
    it('should NOT call addPushNotificationJob after notification create (create() owns delivery)', async () => {
      const mockPost = {
        id: 'p1', userId: 'author-1', content: 'test', isRemoved: false,
        likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, savesCount: 0,
        commentPermission: 'EVERYONE', commentsDisabled: false,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.postReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([undefined, undefined]);

      await postsService.react('p1', 'reactor-1', 'LIKE');

      // NotificationsService.create() was called (it handles push internally)
      expect(notifCreate).toHaveBeenCalled();
      // But addPushNotificationJob should NOT have been called (no duplicate delivery)
      expect(queueService.addPushNotificationJob).not.toHaveBeenCalled();
    });
  });

  describe('Invariant: Search indexing uses valid action contracts', () => {
    it('should only use index/update/delete actions in addSearchIndexJob', async () => {
      // Track all addSearchIndexJob calls
      const calls: string[] = [];
      queueService.addSearchIndexJob.mockImplementation((data: { action: string }) => {
        calls.push(data.action);
        return Promise.resolve('job-id');
      });

      // Trigger a post deletion which should call addSearchIndexJob with 'delete'
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1', isRemoved: false, hashtags: [] });
      prisma.$transaction.mockResolvedValue([undefined, undefined]);
      await postsService.delete('p1', 'u1');

      // Verify all actions are from the valid set
      const validActions = new Set(['index', 'update', 'delete']);
      for (const action of calls) {
        expect(validActions.has(action)).toBe(true);
      }
    });
  });

  describe('Invariant: Deactivated users are excluded from public content queries', () => {
    it('should include isDeactivated filter in feed queries', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);

      await postsService.getFeed('user-1', 'foryou');

      // Verify that the findMany call includes user lifecycle filtering
      const findManyCall = prisma.post.findMany.mock.calls[0]?.[0];
      expect(findManyCall?.where?.user).toBeDefined();
      expect(findManyCall?.where?.user?.isDeactivated).toBe(false);
      expect(findManyCall?.where?.user?.isBanned).toBe(false);
    });
  });

  describe('Invariant: Scheduled content uses consistent publication check', () => {
    it('feed queries should use OR scheduledAt pattern', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.follow.findMany.mockResolvedValue([{ followingId: 'f1' }]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);

      await postsService.getFeed('user-1', 'following');

      const findManyCall = prisma.post.findMany.mock.calls[0]?.[0];
      // Should have OR clause for scheduledAt
      expect(findManyCall?.where?.OR).toBeDefined();
      const orClause = findManyCall?.where?.OR;
      expect(orClause).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scheduledAt: null }),
          expect.objectContaining({ scheduledAt: expect.objectContaining({ lte: expect.any(Date) }) }),
        ]),
      );
    });
  });
});
