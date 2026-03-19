import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class CreatorService {
  constructor(private prisma: PrismaService) {}

  async getPostInsights(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        userId: true,
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        savesCount: true,
        viewsCount: true,
        createdAt: true,
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException('Not your post');

    const totalEngagement = post.likesCount + post.commentsCount + post.sharesCount;
    const engagementRate =
      post.viewsCount > 0
        ? ((totalEngagement / post.viewsCount) * 100).toFixed(1)
        : '0';

    return {
      likes: post.likesCount,
      comments: post.commentsCount,
      shares: post.sharesCount,
      saves: post.savesCount,
      views: post.viewsCount,
      createdAt: post.createdAt,
      engagementRate,
    };
  }

  async getReelInsights(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: {
        userId: true,
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        viewsCount: true,
        createdAt: true,
      },
    });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException('Not your reel');

    const totalEngagement = reel.likesCount + reel.commentsCount + reel.sharesCount;
    const engagementRate =
      reel.viewsCount > 0
        ? ((totalEngagement / reel.viewsCount) * 100).toFixed(1)
        : '0';

    return {
      likes: reel.likesCount,
      comments: reel.commentsCount,
      shares: reel.sharesCount,
      views: reel.viewsCount,
      createdAt: reel.createdAt,
      engagementRate,
    };
  }

  async getDashboardOverview(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { followersCount: true, postsCount: true, reelsCount: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Total engagement across all posts and reels
    const [postStats, reelStats, tipRevenue] = await Promise.all([
      this.prisma.post.aggregate({
        where: { userId, isRemoved: false },
        _sum: { likesCount: true, commentsCount: true, viewsCount: true },
      }),
      this.prisma.reel.aggregate({
        where: { userId, isRemoved: false },
        _sum: { likesCount: true, commentsCount: true, viewsCount: true },
      }),
      this.prisma.tip.aggregate({
        where: { receiverId: userId },
        _sum: { amount: true },
      }),
    ]);

    const totalLikes =
      (postStats._sum?.likesCount ?? 0) + (reelStats._sum?.likesCount ?? 0);
    const totalViews =
      (postStats._sum?.viewsCount ?? 0) + (reelStats._sum?.viewsCount ?? 0);
    const totalComments =
      (postStats._sum?.commentsCount ?? 0) + (reelStats._sum?.commentsCount ?? 0);

    const engagementRate =
      totalViews > 0
        ? (((totalLikes + totalComments) / totalViews) * 100).toFixed(1)
        : '0';

    return {
      followers: user.followersCount,
      totalPosts: user.postsCount + user.reelsCount,
      totalLikes,
      totalViews,
      totalComments,
      engagementRate,
      revenue: tipRevenue._sum.amount ?? 0,
    };
  }

  async getAudienceDemographics(userId: string) {
    // Get follower locations (sample up to 1000)
    const followers = await this.prisma.follow.findMany({
      where: { followingId: userId },
      select: { follower: { select: { location: true, createdAt: true } } },
      take: 1000,
    });

    const locationCounts: Record<string, number> = {};
    for (const f of followers) {
      const loc = f.follower.location || 'Unknown';
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    }

    const topLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count }));

    return { topLocations, totalFollowers: followers.length };
  }

  async getContentPerformance(userId: string) {
    const [topPosts, topReels] = await Promise.all([
      this.prisma.post.findMany({
        where: { userId, isRemoved: false },
        select: {
          id: true,
          content: true,
          likesCount: true,
          commentsCount: true,
          viewsCount: true,
          createdAt: true,
          mediaUrls: true,
        },
        orderBy: { likesCount: 'desc' },
        take: 10,
      }),
      this.prisma.reel.findMany({
        where: { userId, isRemoved: false },
        select: {
          id: true,
          caption: true,
          likesCount: true,
          commentsCount: true,
          viewsCount: true,
          createdAt: true,
          thumbnailUrl: true,
        },
        orderBy: { likesCount: 'desc' },
        take: 10,
      }),
    ]);

    // Best posting hours (analyze top performing content)
    const allContent = [
      ...topPosts.map((p) => ({ createdAt: p.createdAt })),
      ...topReels.map((r) => ({ createdAt: r.createdAt })),
    ];
    const hourCounts: Record<number, number> = {};
    for (const c of allContent) {
      const hour = new Date(c.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    return { topPosts, topReels, bestHours: hourCounts };
  }

  async getGrowthTrends(userId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    // Group by day
    const dailyCounts: Record<string, number> = {};
    for (const f of follows) {
      const day = f.createdAt.toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }

    return { daily: dailyCounts, totalNewFollowers: follows.length };
  }

  async getRevenueSummary(userId: string) {
    const [tips, membershipIncome] = await Promise.all([
      this.prisma.tip.aggregate({
        where: { receiverId: userId },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.membershipSubscription.count({
        where: { tier: { userId }, status: 'active' },
      }),
    ]);

    // Get total membership revenue from tier prices * active subscribers
    const tiersWithSubscribers = await this.prisma.membershipTier.findMany({
      where: { userId },
      select: {
        price: true,
        _count: {
          select: { subscriptions: { where: { status: 'active' } } },
        },
      },
      take: 50,
    });

    const membershipTotal = tiersWithSubscribers.reduce(
      (sum, tier) => sum + tier.price * tier._count.subscriptions,
      0,
    );

    return {
      tips: { total: tips._sum.amount ?? 0, count: tips._count },
      memberships: { total: membershipTotal, count: membershipIncome },
    };
  }
}
