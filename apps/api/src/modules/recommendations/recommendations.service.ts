import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma, ReelStatus, PostVisibility, EmbeddingContentType } from '@prisma/client';
import { EmbeddingsService } from '../embeddings/embeddings.service';

const POST_SELECT = {
  id: true,
  postType: true,
  content: true,
  visibility: true,
  mediaUrls: true,
  mediaTypes: true,
  thumbnailUrl: true,
  mediaWidth: true,
  mediaHeight: true,
  hashtags: true,
  mentions: true,
  locationName: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  savesCount: true,
  viewsCount: true,
  hideLikesCount: true,
  commentsDisabled: true,
  isSensitive: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  circle: { select: { id: true, name: true, slug: true } },
};

const THREAD_SELECT = {
  id: true,
  content: true,
  mediaUrls: true,
  mediaTypes: true,
  visibility: true,
  isChainHead: true,
  chainId: true,
  chainPosition: true,
  isQuotePost: true,
  quoteText: true,
  repostOfId: true,
  hashtags: true,
  mentions: true,
  likesCount: true,
  repliesCount: true,
  repostsCount: true,
  quotesCount: true,
  viewsCount: true,
  bookmarksCount: true,
  hideLikesCount: true,
  isPinned: true,
  isSensitive: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  circle: { select: { id: true, name: true, slug: true } },
  poll: {
    include: {
      options: {
        orderBy: { position: 'asc' as const },
        include: { _count: { select: { votes: true } } },
      },
    },
  },
  repostOf: {
    select: {
      id: true,
      content: true,
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  },
};

const REEL_SELECT = {
  id: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  caption: true,
  mentions: true,
  hashtags: true,
  status: true,
  isRemoved: true,
  audioTrackId: true,
  audioTitle: true,
  audioArtist: true,
  isDuet: true,
  isStitch: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  viewsCount: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

const CHANNEL_SELECT = {
  id: true,
  userId: true,
  handle: true,
  name: true,
  description: true,
  avatarUrl: true,
  bannerUrl: true,
  subscribersCount: true,
  videosCount: true,
  totalViews: true,
  isVerified: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

interface ScoredCandidate {
  contentId: string;
  similarity: number;
  engagementScore: number;
  recencyScore: number;
  finalScore: number;
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingsService: EmbeddingsService,
  ) {}

  private async getExcludedUserIds(userId: string): Promise<string[]> {
    const [blocks, mutes] = await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true },
      take: 50,
    }),
      this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true },
      take: 50,
    }),
    ]);
    return [
      ...blocks.map(b => b.blockedId),
      ...mutes.map(m => m.mutedId),
    ];
  }

  // ── Multi-stage ranking pipeline ──────────────────────────

  /**
   * Stage 1: Candidate generation — pgvector KNN top 500
   * Stage 2: Scoring — behavioral signals (engagement, recency)
   * Stage 3: Reranking — diversity injection (no same author back-to-back)
   */
  private async multiStageRank(
    userId: string,
    contentType: EmbeddingContentType,
    limit: number,
  ): Promise<string[]> {
    // Stage 1: Get user interest vector and find similar content
    const interestVector = await this.embeddingsService.getUserInterestVector(userId);
    if (!interestVector) return [];

    const excludedIds = await this.getExcludedUserIds(userId);

    // Get IDs user has already seen
    const seenIds = await this.prisma.feedInteraction.findMany({
      where: { userId, viewed: true },
      select: { postId: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const seenSet = new Set(seenIds.map(s => s.postId));

    // KNN search: top 500 candidates
    const candidates = await this.embeddingsService.findSimilarByVector(
      interestVector,
      500,
      [contentType],
      [...seenSet],
    );

    if (candidates.length === 0) return [];

    // Stage 2: Score candidates with behavioral signals
    const candidateIds = candidates.map(c => c.contentId);
    const engagementMap = await this.getEngagementScores(candidateIds, contentType);

    const scored: ScoredCandidate[] = candidates.map(c => {
      const engagement = engagementMap.get(c.contentId) || { score: 0, createdAt: new Date() };
      const ageHours = (Date.now() - engagement.createdAt.getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 1 - ageHours / 168); // decay over 7 days

      return {
        contentId: c.contentId,
        similarity: c.similarity,
        engagementScore: engagement.score,
        recencyScore,
        // Weighted final score: 40% similarity, 35% engagement, 25% recency
        finalScore: c.similarity * 0.4 + engagement.score * 0.35 + recencyScore * 0.25,
      };
    });

    // Sort by final score
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Stage 3: Diversity injection — ensure no same-author back-to-back
    const authorMap = await this.getAuthorMap(scored.slice(0, limit * 3).map(s => s.contentId), contentType);
    const diversified: string[] = [];
    let lastAuthor = '';

    for (const item of scored) {
      if (diversified.length >= limit) break;
      const author = authorMap.get(item.contentId) || '';
      // Skip if same author as last item (unless we're running out)
      if (author === lastAuthor && diversified.length < scored.length - 1) continue;
      if (excludedIds.includes(author)) continue;
      diversified.push(item.contentId);
      lastAuthor = author;
    }

    return diversified;
  }

  private async getEngagementScores(
    contentIds: string[],
    contentType: EmbeddingContentType,
  ): Promise<Map<string, { score: number; createdAt: Date }>> {
    const map = new Map<string, { score: number; createdAt: Date }>();
    if (contentIds.length === 0) return map;

    if (contentType === EmbeddingContentType.POST) {
      const posts = await this.prisma.post.findMany({
        where: { id: { in: contentIds } },
        select: { id: true, likesCount: true, commentsCount: true, sharesCount: true, savesCount: true, viewsCount: true, createdAt: true },
      });
      for (const p of posts) {
        const totalEngagement = p.likesCount + p.commentsCount * 2 + p.sharesCount * 3 + p.savesCount * 2;
        const engagementRate = p.viewsCount > 0 ? totalEngagement / p.viewsCount : 0;
        map.set(p.id, { score: Math.min(engagementRate * 10, 1), createdAt: p.createdAt });
      }
    } else if (contentType === EmbeddingContentType.REEL) {
      const reels = await this.prisma.reel.findMany({
        where: { id: { in: contentIds } },
        select: { id: true, likesCount: true, commentsCount: true, sharesCount: true, viewsCount: true, createdAt: true },
      });
      for (const r of reels) {
        const totalEngagement = r.likesCount + r.commentsCount * 2 + r.sharesCount * 3;
        const engagementRate = r.viewsCount > 0 ? totalEngagement / r.viewsCount : 0;
        map.set(r.id, { score: Math.min(engagementRate * 10, 1), createdAt: r.createdAt });
      }
    } else if (contentType === EmbeddingContentType.THREAD) {
      const threads = await this.prisma.thread.findMany({
        where: { id: { in: contentIds } },
        select: { id: true, likesCount: true, repliesCount: true, repostsCount: true, viewsCount: true, createdAt: true },
      });
      for (const t of threads) {
        const totalEngagement = t.likesCount + t.repliesCount * 2 + t.repostsCount * 3;
        const engagementRate = t.viewsCount > 0 ? totalEngagement / t.viewsCount : 0;
        map.set(t.id, { score: Math.min(engagementRate * 10, 1), createdAt: t.createdAt });
      }
    }

    return map;
  }

  private async getAuthorMap(contentIds: string[], contentType: EmbeddingContentType): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (contentIds.length === 0) return map;

    if (contentType === EmbeddingContentType.POST) {
      const items = await this.prisma.post.findMany({ where: { id: { in: contentIds } }, select: { id: true, userId: true } });
      items.forEach(i => map.set(i.id, i.userId));
    } else if (contentType === EmbeddingContentType.REEL) {
      const items = await this.prisma.reel.findMany({ where: { id: { in: contentIds } }, select: { id: true, userId: true } });
      items.forEach(i => map.set(i.id, i.userId));
    } else if (contentType === EmbeddingContentType.THREAD) {
      const items = await this.prisma.thread.findMany({ where: { id: { in: contentIds } }, select: { id: true, userId: true } });
      items.forEach(i => map.set(i.id, i.userId));
    }

    return map;
  }

  // ── Public recommendation methods ─────────────────────────

  async suggestedPeople(userId?: string, limit = 20) {
    // If no authenticated user, return popular users
    if (!userId) {
      const users = await this.prisma.user.findMany({
        where: {
          isDeactivated: false,
          isPrivate: false,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
          bio: true,
          followersCount: true,
        },
        orderBy: { followersCount: 'desc' },
        take: limit,
      });
      return users.map(u => ({ ...u, mutualFollowers: 0 }));
    }

    // Get blocked/muted users to exclude
    const excludedIds = await this.getExcludedUserIds(userId);

    // Friends-of-friends algorithm
    const myFollowing = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
      take: 50,
    });
    const myFollowingIds = myFollowing.map(f => f.followingId);

    const fofFollows = await this.prisma.follow.findMany({
      where: {
        followerId: { in: myFollowingIds },
        followingId: { notIn: [...myFollowingIds, userId, ...excludedIds] },
      },
      select: { followingId: true },
      take: 50,
    });

    const mutualCount = new Map<string, number>();
    for (const f of fofFollows) {
      mutualCount.set(f.followingId, (mutualCount.get(f.followingId) || 0) + 1);
    }

    const sortedIds = [...mutualCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: sortedIds, notIn: excludedIds },
        isDeactivated: false,
        isPrivate: false,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        bio: true,
      },
      take: 50,
    });

    return users
      .map(u => ({ ...u, mutualFollowers: mutualCount.get(u.id) || 0 }))
      .sort((a, b) => b.mutualFollowers - a.mutualFollowers);
  }

  async suggestedPosts(userId?: string, limit = 20) {
    // Try pgvector multi-stage ranking for authenticated users
    if (userId) {
      const rankedIds = await this.multiStageRank(userId, EmbeddingContentType.POST, limit);
      if (rankedIds.length > 0) {
        const posts = await this.prisma.post.findMany({
          where: { id: { in: rankedIds }, isRemoved: false },
          select: POST_SELECT,
        });
        // Re-order to match ranked order
        const postMap = new Map(posts.map(p => [p.id, p]));
        return rankedIds.map(id => postMap.get(id)).filter(Boolean);
      }
    }

    // Fallback: engagement-based sorting
    const where: Prisma.PostWhereInput = {
      isRemoved: false,
      visibility: PostVisibility.PUBLIC,
      scheduledAt: null,
      user: { isDeactivated: false, isPrivate: false },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    };
    if (userId) {
      where.userId = { not: userId };
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    return this.prisma.post.findMany({
      where,
      select: POST_SELECT,
      orderBy: [
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { sharesCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  }

  async suggestedReels(userId?: string, limit = 20) {
    // Try pgvector multi-stage ranking for authenticated users
    if (userId) {
      const rankedIds = await this.multiStageRank(userId, EmbeddingContentType.REEL, limit);
      if (rankedIds.length > 0) {
        const reels = await this.prisma.reel.findMany({
          where: { id: { in: rankedIds }, isRemoved: false, status: ReelStatus.READY },
          select: REEL_SELECT,
        });
        const reelMap = new Map(reels.map(r => [r.id, r]));
        return rankedIds.map(id => reelMap.get(id)).filter(Boolean);
      }
    }

    // Fallback: engagement-based sorting
    const where: Prisma.ReelWhereInput = {
      isRemoved: false,
      status: ReelStatus.READY,
      scheduledAt: null,
      user: { isDeactivated: false, isPrivate: false },
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
    };
    if (userId) {
      where.userId = { not: userId };
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    return this.prisma.reel.findMany({
      where,
      select: REEL_SELECT,
      orderBy: [
        { viewsCount: 'desc' },
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  }

  async suggestedChannels(userId?: string, limit = 20) {
    const where: Prisma.ChannelWhereInput = {
      user: { isDeactivated: false },
    };
    if (userId) {
      where.userId = { not: userId };
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    return this.prisma.channel.findMany({
      where,
      select: CHANNEL_SELECT,
      orderBy: [
        { subscribersCount: 'desc' },
        { totalViews: 'desc' },
      ],
      take: limit,
    });
  }

  /**
   * Suggested threads with pgvector ranking
   */
  async suggestedThreads(userId?: string, limit = 20) {
    if (userId) {
      const rankedIds = await this.multiStageRank(userId, EmbeddingContentType.THREAD, limit);
      if (rankedIds.length > 0) {
        const threads = await this.prisma.thread.findMany({
          where: { id: { in: rankedIds }, isRemoved: false },
          select: THREAD_SELECT,
        });
        const threadMap = new Map(threads.map(t => [t.id, t]));
        return rankedIds.map(id => threadMap.get(id)).filter(Boolean);
      }
    }

    // Fallback
    return this.prisma.thread.findMany({
      where: {
        isRemoved: false,
        visibility: 'PUBLIC',
        isChainHead: true,
        user: { isDeactivated: false },
        createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      select: THREAD_SELECT,
      orderBy: [
        { likesCount: 'desc' },
        { repliesCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  }
}
