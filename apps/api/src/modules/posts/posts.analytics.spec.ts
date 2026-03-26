import { Test } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { PrismaService } from '../../config/prisma.service';
import { mockRedis, mockNotificationsService, mockGamificationService, mockAiService, mockConfigService, mockContentSafetyService, mockPublishWorkflowService } from '../../common/test/mock-providers';
import { QueueService } from '../../common/queue/queue.service';
import { AnalyticsService } from '../../common/services/analytics.service';

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
    notification: { create: jest.fn() },
    hashtag: { upsert: jest.fn() },
    report: { findFirst: jest.fn(), create: jest.fn() },
    feedDismissal: { upsert: jest.fn() },
    savedPost: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    postTaggedUser: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((fns: any[]) => Promise.all(fns.map((f: any) => f))),
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

const mockAnalytics = {
  provide: AnalyticsService,
  useValue: { track: jest.fn() },
};

describe('PostsService — Analytics & Impressions', () => {
  let service: PostsService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PostsService,
        mockPrisma,
        mockRedis,
        mockNotificationsService,
        mockGamificationService,
        mockAiService,
        mockConfigService,
        mockContentSafetyService,
        mockPublishWorkflowService,
        mockQueue,
        mockAnalytics,
      ],
    }).compile();

    service = module.get(PostsService);
    prisma = module.get(PrismaService);
  });

  describe('getPostAnalytics', () => {
    const mockPost = { id: 'p1', userId: 'u1', isRemoved: false, likesCount: 20, commentsCount: 8, sharesCount: 5, viewsCount: 200, savesCount: 15 };

    it('should return comparison percentages', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.post.findMany.mockResolvedValue([
        { likesCount: 10, commentsCount: 4, sharesCount: 2, viewsCount: 100, savesCount: 8 },
        { likesCount: 10, commentsCount: 4, sharesCount: 2, viewsCount: 100, savesCount: 8 },
      ]);

      const result = await service.getPostAnalytics('p1', 'u1');
      expect(result.post.likes).toBe(20);
      expect(result.average.likes).toBe(10);
      expect(result.comparison.likesVsAvg).toBe(100);
    });

    it('should throw for non-author', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost);
      await expect(service.getPostAnalytics('p1', 'other')).rejects.toThrow();
    });

    it('should throw for missing post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.getPostAnalytics('nope', 'u1')).rejects.toThrow('Post not found');
    });

    it('should handle zero averages', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, savesCount: 0 });
      prisma.post.findMany.mockResolvedValue([{ likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, savesCount: 0 }]);
      const result = await service.getPostAnalytics('p1', 'u1');
      expect(result.comparison.likesVsAvg).toBe(0);
    });

    it('should calculate negative comparison', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, likesCount: 5 });
      prisma.post.findMany.mockResolvedValue([{ likesCount: 10, commentsCount: 4, sharesCount: 2, viewsCount: 100, savesCount: 8 }]);
      const result = await service.getPostAnalytics('p1', 'u1');
      expect(result.comparison.likesVsAvg).toBe(-50);
    });
  });

  describe('trackImpression', () => {
    it('should return tracked true', async () => {
      const result = await service.trackImpression('p1', 'u1');
      expect(result.tracked).toBe(true);
    });
  });

  describe('getImpressionCount', () => {
    it('should return impressions number', async () => {
      const result = await service.getImpressionCount('p1');
      expect(result).toHaveProperty('impressions');
    });
  });
});
