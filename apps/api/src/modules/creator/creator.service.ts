import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CreatorService {
  private readonly logger = new Logger(CreatorService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

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
      revenue: Number(tipRevenue._sum.amount ?? 0),
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
      (sum, tier) => sum + Number(tier.price) * tier._count.subscriptions,
      0,
    );

    return {
      tips: { total: Number(tips._sum.amount ?? 0), count: tips._count },
      memberships: { total: membershipTotal, count: membershipIncome },
    };
  }

  // ── Audience Demographics ─────────────────────────

  async getAudienceDemographics(channelId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [countries, ageRanges, genders, sources] = await Promise.all([
      this.prisma.viewerDemographic.groupBy({
        by: ['country'],
        where: { channelId, viewDate: { gte: thirtyDaysAgo } },
        _count: { country: true },
        orderBy: { _count: { country: 'desc' } },
        take: 10,
      }),
      this.prisma.viewerDemographic.groupBy({
        by: ['ageRange'],
        where: { channelId, viewDate: { gte: thirtyDaysAgo } },
        _count: { ageRange: true },
        orderBy: { _count: { ageRange: 'desc' } },
      }),
      this.prisma.viewerDemographic.groupBy({
        by: ['gender'],
        where: { channelId, viewDate: { gte: thirtyDaysAgo } },
        _count: { gender: true },
      }),
      this.prisma.viewerDemographic.groupBy({
        by: ['source'],
        where: { channelId, viewDate: { gte: thirtyDaysAgo } },
        _count: { source: true },
        orderBy: { _count: { source: 'desc' } },
      }),
    ]);

    return {
      countries: countries.map(c => ({ country: c.country, count: c._count.country })),
      ageRanges: ageRanges.map(a => ({ range: a.ageRange, count: a._count.ageRange })),
      genders: genders.map(g => ({ gender: g.gender, count: g._count.gender })),
      sources: sources.map(s => ({ source: s.source, count: s._count.source })),
    };
  }

  // ── AI Analytics Chat ─────────────────────────────────

  /**
   * AI-powered analytics chat. Creator asks a question about their performance,
   * the system fetches their analytics data and passes it to Claude with the question.
   */
  async askAI(userId: string, question: string): Promise<{ answer: string; dataUsed: string[] }> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');

    // Gather analytics context for the creator
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [user, topPosts, recentFollowerCount, totalPosts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true, followersCount: true, followingCount: true, postsCount: true },
      }),
      this.prisma.post.findMany({
        where: { userId, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { likesCount: 'desc' },
        take: 10,
        select: {
          id: true, content: true, postType: true,
          likesCount: true, commentsCount: true, sharesCount: true, viewsCount: true,
          hashtags: true, createdAt: true,
        },
      }),
      this.prisma.follow.count({
        where: { followingId: userId, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.post.count({
        where: { userId, createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    // Build analytics context
    const topPostsSummary = topPosts.map((p, i) => {
      const totalEng = p.likesCount + p.commentsCount + p.sharesCount;
      const engRate = p.viewsCount > 0 ? ((totalEng / p.viewsCount) * 100).toFixed(1) : '0';
      return `${i + 1}. "${(p.content || '').slice(0, 60)}..." (${p.postType}) — ${p.likesCount} likes, ${p.commentsCount} comments, ${p.viewsCount} views, ${engRate}% engagement, posted ${p.createdAt.toLocaleDateString()}, hashtags: ${p.hashtags.join(', ') || 'none'}`;
    }).join('\n');

    const context = `
Creator: @${user.username} (${user.displayName})
Followers: ${user.followersCount} | Following: ${user.followingCount}
New followers (30d): ${recentFollowerCount}
Posts (30d): ${totalPosts}

Top 10 Posts (Last 30 Days):
${topPostsSummary || 'No posts in the last 30 days.'}
`.trim();

    const dataUsed = ['followers', 'posts', 'engagement', 'hashtags'];

    if (!apiKey) {
      return {
        answer: `Based on your ${totalPosts} posts in the last 30 days with ${user.followersCount} followers and ${recentFollowerCount} new followers, your account is ${recentFollowerCount > 10 ? 'growing well' : 'steady'}. Try posting more during peak hours and using relevant hashtags.`,
        dataUsed,
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: `You are an analytics assistant for Mizanly, a social media platform for the Muslim community. Answer the creator's question using ONLY the data provided. Be specific with numbers. Keep responses concise (2-3 sentences). If you don't have data to answer, say so honestly.`,
          messages: [
            { role: 'user', content: `Analytics data:\n${context}\n\nQuestion: ${question}` },
          ],
        }),
      });

      if (!response.ok) {
        this.logger.error(`Claude API error in askAI: ${response.status}`);
        throw new Error('AI service unavailable');
      }

      const data = await response.json();
      const answer = data.content?.[0]?.text || 'Unable to analyze your data right now.';

      return { answer, dataUsed };
    } catch (error) {
      this.logger.error('AI analytics chat failed', error);
      return {
        answer: `You have ${user.followersCount} followers with ${recentFollowerCount} new in the last 30 days. You posted ${totalPosts} times. Your top post got ${topPosts[0]?.likesCount ?? 0} likes.`,
        dataUsed,
      };
    }
  }
}
