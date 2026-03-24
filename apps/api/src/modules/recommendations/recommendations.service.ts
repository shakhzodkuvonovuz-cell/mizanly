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
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
        take: 50,
      }),
      this.prisma.mute.findMany({
        where: { userId },
        select: { mutedId: true },
        take: 50,
      }),
    ]);
    const excluded = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) excluded.add(b.blockedId);
      else excluded.add(b.blockerId);
    }
    for (const m of mutes) {
      excluded.add(m.mutedId);
    }
    return [...excluded];
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
    try {
    // Stage 1: Get user interest centroids and find similar content
    const interestCentroids = await this.embeddingsService.getUserInterestVector(userId);
    if (!interestCentroids) return [];

    const excludedIds = await this.getExcludedUserIds(userId);

    // Get IDs user has already seen
    const seenIds = await this.prisma.feedInteraction.findMany({
      where: { userId, viewed: true },
      select: { postId: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const seenSet = new Set(seenIds.map(s => s.postId));

    // KNN search: top 500 candidates across all interest centroids
    const candidates = await this.embeddingsService.findSimilarByMultipleVectors(
      interestCentroids,
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

    // Stage 3: Diversity injection — no same-author back-to-back + hashtag cluster diversity
    const topCandidateIds = scored.slice(0, limit * 3).map(s => s.contentId);
    const [authorMap, hashtagMap] = await Promise.all([
      this.getAuthorMap(topCandidateIds, contentType),
      this.getHashtagMap(topCandidateIds, contentType),
    ]);

    // Pass 1: Author dedup — no same author back-to-back
    const authorDeduped: ScoredCandidate[] = [];
    let lastAuthor = '';
    const skippedByAuthor: ScoredCandidate[] = [];

    for (const item of scored) {
      const author = authorMap.get(item.contentId) || '';
      if (excludedIds.includes(author)) continue;
      if (author === lastAuthor && authorDeduped.length < scored.length - 1) {
        skippedByAuthor.push(item);
        continue;
      }
      authorDeduped.push(item);
      lastAuthor = author;
    }
    // Append skipped items at the end so they are not lost
    authorDeduped.push(...skippedByAuthor);

    // Pass 2: Hashtag diversity — prevent same hashtag cluster 3+ times in a row
    const diversified: string[] = [];
    const recentHashtags: string[] = [];
    const deferredByHashtag: ScoredCandidate[] = [];

    for (const item of authorDeduped) {
      if (diversified.length >= limit) break;
      const postTags = hashtagMap.get(item.contentId) || [];
      const recentWindow = recentHashtags.slice(-6);
      const tagOverlap = postTags.filter(t => recentWindow.includes(t)).length;

      if (tagOverlap >= 2 && diversified.length > 0) {
        deferredByHashtag.push(item);
        continue;
      }
      diversified.push(item.contentId);
      recentHashtags.push(...postTags);
    }

    // Fill remaining slots with deferred hashtag items
    for (const item of deferredByHashtag) {
      if (diversified.length >= limit) break;
      diversified.push(item.contentId);
    }

    return diversified;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      // Re-throw critical errors (SQL, null pointer), only swallow embeddings-not-available
      if (msg.includes('SQL') || msg.includes('null') || msg.includes('Cannot read')) {
        this.logger.error(`Multi-stage ranking critical error: ${msg}`);
        throw error;
      }
      this.logger.warn(`Multi-stage ranking failed, falling back to engagement sort: ${msg}`);
      return [];
    }
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
        take: 500,
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
        take: 500,
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
        take: 500,
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
      const items = await this.prisma.post.findMany({ where: { id: { in: contentIds } }, select: { id: true, userId: true }, take: 500 });
      items.forEach(i => { if (i.userId) map.set(i.id, i.userId); });
    } else if (contentType === EmbeddingContentType.REEL) {
      const items = await this.prisma.reel.findMany({ where: { id: { in: contentIds } }, select: { id: true, userId: true }, take: 500 });
      items.forEach(i => { if (i.userId) map.set(i.id, i.userId); });
    } else if (contentType === EmbeddingContentType.THREAD) {
      const items = await this.prisma.thread.findMany({ where: { id: { in: contentIds } }, select: { id: true, userId: true }, take: 500 });
      items.forEach(i => { if (i.userId) map.set(i.id, i.userId); });
    }

    return map;
  }

  private async getHashtagMap(contentIds: string[], contentType: EmbeddingContentType): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (contentIds.length === 0) return map;

    if (contentType === EmbeddingContentType.POST) {
      const items = await this.prisma.post.findMany({ where: { id: { in: contentIds } }, select: { id: true, hashtags: true }, take: 500 });
      items.forEach(i => map.set(i.id, i.hashtags));
    } else if (contentType === EmbeddingContentType.REEL) {
      const items = await this.prisma.reel.findMany({ where: { id: { in: contentIds } }, select: { id: true, hashtags: true }, take: 500 });
      items.forEach(i => map.set(i.id, i.hashtags));
    } else if (contentType === EmbeddingContentType.THREAD) {
      const items = await this.prisma.thread.findMany({ where: { id: { in: contentIds } }, select: { id: true, hashtags: true }, take: 500 });
      items.forEach(i => map.set(i.id, i.hashtags));
    }

    return map;
  }

  // ── Exploration helpers ──────────────────────────────────

  /**
   * Fetch fresh posts with low view counts for exploration slots.
   * These give new creators a chance to surface and prevent filter bubbles.
   */
  private async getExplorationPosts(
    excludedUserIds: string[],
    userId: string | undefined,
    count: number,
  ) {
    if (count <= 0) return [];
    const freshCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours
    const where: Prisma.PostWhereInput = {
      createdAt: { gte: freshCutoff },
      viewsCount: { lt: 100 },
      isRemoved: false,
      visibility: PostVisibility.PUBLIC,
      scheduledAt: null,
      user: { isDeactivated: false, isPrivate: false },
    };
    if (userId) {
      where.userId = { not: userId, notIn: excludedUserIds };
    }
    return this.prisma.post.findMany({
      where,
      select: POST_SELECT,
      take: count,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Fetch fresh reels with low view counts for exploration slots.
   */
  private async getExplorationReels(
    excludedUserIds: string[],
    userId: string | undefined,
    count: number,
  ) {
    if (count <= 0) return [];
    const freshCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const where: Prisma.ReelWhereInput = {
      createdAt: { gte: freshCutoff },
      viewsCount: { lt: 100 },
      isRemoved: false,
      status: ReelStatus.READY,
      scheduledAt: null,
      user: { isDeactivated: false, isPrivate: false },
    };
    if (userId) {
      where.userId = { not: userId, notIn: excludedUserIds };
    }
    return this.prisma.reel.findMany({
      where,
      select: REEL_SELECT,
      take: count,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Fetch fresh threads with low view counts for exploration slots.
   */
  private async getExplorationThreads(
    excludedUserIds: string[],
    userId: string | undefined,
    count: number,
  ) {
    if (count <= 0) return [];
    const freshCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const where: Prisma.ThreadWhereInput = {
      createdAt: { gte: freshCutoff },
      viewsCount: { lt: 100 },
      isRemoved: false,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      visibility: 'PUBLIC',
      isChainHead: true,
      user: { isDeactivated: false },
    };
    if (userId) {
      where.userId = { not: userId, notIn: excludedUserIds };
    }
    return this.prisma.thread.findMany({
      where,
      select: THREAD_SELECT,
      take: count,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Interleave exploration items into main results.
   * Every ~7th position gets an exploration item to keep discovery natural.
   */
  private interleaveExploration<T extends { id: string }>(
    mainResults: T[],
    explorationItems: T[],
  ): T[] {
    if (explorationItems.length === 0) return mainResults;

    // Deduplicate: remove any exploration items already in main results
    const mainIds = new Set(mainResults.map(r => r.id));
    const uniqueExploration = explorationItems.filter(e => !mainIds.has(e.id));
    if (uniqueExploration.length === 0) return mainResults;

    const result = [...mainResults];
    uniqueExploration.forEach((item, i) => {
      const insertAt = Math.min((i + 1) * 7, result.length);
      result.splice(insertAt, 0, item);
    });
    return result;
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
      take: 200,
    });
    const myFollowingIds = myFollowing.map(f => f.followingId);

    const fofFollows = await this.prisma.follow.findMany({
      where: {
        followerId: { in: myFollowingIds },
        followingId: { notIn: [...myFollowingIds, userId, ...excludedIds] },
      },
      select: { followingId: true },
      take: 200,
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
    // Fetch excluded IDs once (avoids duplicate query in multiStageRank + fallback)
    const excludedIds = userId ? await this.getExcludedUserIds(userId) : [];

    // Reserve 15% of slots for exploration content (fresh, low-view posts)
    const explorationCount = Math.ceil(limit * 0.15);
    const mainCount = limit - explorationCount;

    // Try pgvector multi-stage ranking for authenticated users
    if (userId) {
      const rankedIds = await this.multiStageRank(userId, EmbeddingContentType.POST, mainCount);
      if (rankedIds.length > 0) {
        const [posts, explorationPosts] = await Promise.all([
          this.prisma.post.findMany({
            where: { id: { in: rankedIds }, isRemoved: false },
            select: POST_SELECT,
            take: 50,
          }),
          this.getExplorationPosts(excludedIds, userId, explorationCount),
        ]);
        // Re-order to match ranked order
        const postMap = new Map(posts.map(p => [p.id, p]));
        const mainResults = rankedIds.map(id => postMap.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
        return this.interleaveExploration(mainResults, explorationPosts);
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
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    const mainPosts = await this.prisma.post.findMany({
      where,
      select: POST_SELECT,
      orderBy: [
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { sharesCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: mainCount,
    });

    // Add exploration posts for fallback path too
    const explorationPosts = await this.getExplorationPosts(excludedIds, userId, explorationCount);
    return this.interleaveExploration(mainPosts, explorationPosts);
  }

  async suggestedReels(userId?: string, limit = 20) {
    // Fetch excluded IDs once
    const excludedIds = userId ? await this.getExcludedUserIds(userId) : [];

    // Reserve 15% of slots for exploration content
    const explorationCount = Math.ceil(limit * 0.15);
    const mainCount = limit - explorationCount;

    // Try pgvector multi-stage ranking for authenticated users
    if (userId) {
      const rankedIds = await this.multiStageRank(userId, EmbeddingContentType.REEL, mainCount);
      if (rankedIds.length > 0) {
        const [reels, explorationReels] = await Promise.all([
          this.prisma.reel.findMany({
            where: { id: { in: rankedIds }, isRemoved: false, status: ReelStatus.READY },
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
            isTrial: false,
            select: REEL_SELECT,
            take: 50,
          }),
          this.getExplorationReels(excludedIds, userId, explorationCount),
        ]);
        const reelMap = new Map(reels.map(r => [r.id, r]));
        const mainResults = rankedIds.map(id => reelMap.get(id)).filter(Boolean);
        return this.interleaveExploration(mainResults as Array<{ id: string }>, explorationReels);
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
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    const mainReels = await this.prisma.reel.findMany({
      where,
      select: REEL_SELECT,
      orderBy: [
        { viewsCount: 'desc' },
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: mainCount,
    });

    const explorationReels = await this.getExplorationReels(excludedIds, userId, explorationCount);
    return this.interleaveExploration(mainReels, explorationReels);
  }

  async suggestedChannels(userId?: string, limit = 20) {
    // Fetch excluded IDs once
    const excludedIds = userId ? await this.getExcludedUserIds(userId) : [];

    const where: Prisma.ChannelWhereInput = {
      user: { isDeactivated: false },
    };
    if (userId) {
      where.userId = { not: userId };
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
    const excludedIds = userId ? await this.getExcludedUserIds(userId) : [];

    // Reserve 15% of slots for exploration content
    const explorationCount = Math.ceil(limit * 0.15);
    const mainCount = limit - explorationCount;

    if (userId) {
      const rankedIds = await this.multiStageRank(userId, EmbeddingContentType.THREAD, mainCount);
      if (rankedIds.length > 0) {
        const [threads, explorationThreads] = await Promise.all([
          this.prisma.thread.findMany({
            where: { id: { in: rankedIds }, isRemoved: false },
            select: THREAD_SELECT,
            take: 50,
          }),
          this.getExplorationThreads(excludedIds, userId, explorationCount),
        ]);
        const threadMap = new Map(threads.map(t => [t.id, t]));
        const mainResults = rankedIds.map(id => threadMap.get(id)).filter(Boolean);
        return this.interleaveExploration(mainResults as Array<{ id: string }>, explorationThreads);
      }
    }

    // Fallback
    const mainThreads = await this.prisma.thread.findMany({
      where: {
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
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
      take: mainCount,
    });

    const explorationThreads = await this.getExplorationThreads(excludedIds, userId, explorationCount);
    return this.interleaveExploration(mainThreads, explorationThreads);
  }
}
