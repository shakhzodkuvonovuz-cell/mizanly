import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreatorService } from './creator.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CreatorService', () => {
  let service: CreatorService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CreatorService,
        {
          provide: PrismaService,
          useValue: {
            post: { findUnique: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
            reel: { findUnique: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
            user: { findUnique: jest.fn() },
            follow: { findMany: jest.fn().mockResolvedValue([]) },
            tip: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }) },
            membershipSubscription: { count: jest.fn().mockResolvedValue(0) },
            membershipTier: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();
    service = module.get(CreatorService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getPostInsights', () => {
    it('should return post insights for owner', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'u1', likesCount: 50, commentsCount: 10, sharesCount: 5, savesCount: 3, viewsCount: 1000, createdAt: new Date(),
      });
      const result = await service.getPostInsights('p1', 'u1');
      expect(result.likes).toBe(50);
      expect(result.engagementRate).toBe('6.5');
    });

    it('should throw NotFoundException', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.getPostInsights('p1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ userId: 'other' });
      await expect(service.getPostInsights('p1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReelInsights', () => {
    it('should return reel insights', async () => {
      prisma.reel.findUnique.mockResolvedValue({
        userId: 'u1', likesCount: 100, commentsCount: 20, sharesCount: 10, viewsCount: 5000, createdAt: new Date(),
      });
      const result = await service.getReelInsights('r1', 'u1');
      expect(result.likes).toBe(100);
      expect(result.engagementRate).toBe('2.6');
    });
  });

  describe('getDashboardOverview', () => {
    it('should return dashboard overview', async () => {
      prisma.user.findUnique.mockResolvedValue({ followersCount: 1000, postsCount: 50, reelsCount: 20 });
      prisma.post.aggregate.mockResolvedValue({ _sum: { likesCount: 500, commentsCount: 100, viewsCount: 10000 } });
      prisma.reel.aggregate.mockResolvedValue({ _sum: { likesCount: 300, commentsCount: 50, viewsCount: 5000 } });
      const result = await service.getDashboardOverview('u1');
      expect(result.followers).toBe(1000);
      expect(result.totalLikes).toBe(800);
      expect(result.totalViews).toBe(15000);
    });

    it('should throw NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getDashboardOverview('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getContentPerformance', () => {
    it('should return top posts and reels', async () => {
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', likesCount: 100, createdAt: new Date() }]);
      prisma.reel.findMany.mockResolvedValue([{ id: 'r1', likesCount: 200, createdAt: new Date() }]);
      const result = await service.getContentPerformance('u1');
      expect(result.topPosts).toHaveLength(1);
      expect(result.topReels).toHaveLength(1);
      expect(result.bestHours).toBeDefined();
    });
  });

  describe('getGrowthTrends', () => {
    it('should return follower growth data', async () => {
      prisma.follow.findMany.mockResolvedValue([
        { createdAt: new Date('2026-03-15') },
        { createdAt: new Date('2026-03-15') },
        { createdAt: new Date('2026-03-16') },
      ]);
      const result = await service.getGrowthTrends('u1');
      expect(result.totalNewFollowers).toBe(3);
    });
  });

  describe('getRevenueSummary', () => {
    it('should return tip and membership revenue', async () => {
      prisma.tip.aggregate.mockResolvedValue({ _sum: { amount: 500 }, _count: 10 });
      prisma.membershipSubscription.count.mockResolvedValue(5);
      prisma.membershipTier.findMany.mockResolvedValue([
        { price: 10, _count: { subscriptions: 3 } },
        { price: 25, _count: { subscriptions: 2 } },
      ]);
      const result = await service.getRevenueSummary('u1');
      expect(result.tips.total).toBe(500);
      expect(result.tips.count).toBe(10);
      expect(result.memberships.total).toBe(80); // 10*3 + 25*2
    });
  });
});
