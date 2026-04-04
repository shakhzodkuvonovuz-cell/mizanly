import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace, PostVisibility, Prisma, FeedContentType } from '@prisma/client';
import Redis from 'ioredis';
import { CANDIDATE_POOL_SIZE, TIME_WINDOWS } from '../../common/constants/feed-scoring';
import { getExcludedUserIds } from '../../common/utils/excluded-users';

const FEED_POST_SELECT = {
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
  isFeatured: true,
  blurhash: true,
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

@Injectable()
export class FeedService {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async logInteraction(userId: string, data: { postId: string; space: string; viewed?: boolean; viewDurationMs?: number; completionRate?: number | null; liked?: boolean; commented?: boolean; shared?: boolean; saved?: boolean }) {
    // Build only defined update fields to avoid overwriting with undefined
    const updateData: Record<string, unknown> = {};
    if (data.viewed !== undefined) updateData.viewed = data.viewed;
    if (data.viewDurationMs !== undefined) updateData.viewDurationMs = data.viewDurationMs;
    if (data.completionRate !== undefined) updateData.completionRate = data.completionRate;
    if (data.liked !== undefined) updateData.liked = data.liked;
    if (data.commented !== undefined) updateData.commented = data.commented;
    if (data.shared !== undefined) updateData.shared = data.shared;
    if (data.saved !== undefined) updateData.saved = data.saved;

    // Atomic upsert on @@unique([userId, postId]) — no TOCTOU race
    return this.prisma.feedInteraction.upsert({
      where: { userId_postId: { userId, postId: data.postId } },
      update: updateData,
      create: {
        userId,
        postId: data.postId,
        space: data.space as ContentSpace, // Validated by LogInteractionDto @IsEnum
        viewed: data.viewed ?? false,
        viewDurationMs: data.viewDurationMs ?? 0,
        completionRate: data.completionRate,
        liked: data.liked ?? false,
        commented: data.commented ?? false,
        shared: data.shared ?? false,
        saved: data.saved ?? false,
      },
    });
  }

  async dismiss(userId: string, contentId: string, contentType: FeedContentType) {
    // Dismissal is persisted in DB (feedDismissal table). The feed algorithm reads
    // dismissed content IDs via getDismissedIds() to exclude from future pages.
    const result = this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId, contentType } },
      update: {},
      create: { userId, contentId, contentType },
    });
    // Invalidate dismissed IDs cache
    await this.redis.del(`dismissed:${userId}:${contentType}`);
    return result;
  }

  async getDismissedIds(userId: string, contentType: FeedContentType): Promise<string[]> {
    const cacheKey = `dismissed:${userId}:${contentType}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }
    const d = await this.prisma.feedDismissal.findMany({ where: { userId, contentType }, select: { contentId: true }, take: 1000 });
    const ids = d.map(x => x.contentId);
    await this.redis.set(cacheKey, JSON.stringify(ids), 'EX', 120);
    return ids;
  }

  /**
   * Finding #406: "On This Day" memories — find posts from same date in previous years.
   */
  async getOnThisDay(userId: string) {
    const today = new Date();
    const month = today.getMonth();
    const day = today.getDate();

    const memories = await this.prisma.post.findMany({
      where: {
        userId,
        isRemoved: false,
        createdAt: { lt: new Date(today.getFullYear(), 0, 1) },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      select: {
        id: true, content: true, mediaUrls: true, thumbnailUrl: true,
        postType: true, likesCount: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return memories.filter(p => {
      const d = new Date(p.createdAt);
      return d.getMonth() === month && d.getDate() === day;
    }).slice(0, 5);
  }

  /**
   * Finding #402: Trending in your community — posts from followed hashtags trending in last 24h.
   */
  async getCommunityTrending(userId: string, limit = 10) {
    const [followedTags, excludedIds, dismissedIds] = await Promise.all([
      this.prisma.hashtagFollow.findMany({
        where: { userId },
        select: { hashtagId: true },
        take: 50,
      }),
      this.getExcludedUserIds(userId),
      this.getDismissedIds(userId, 'post' as FeedContentType),
    ]);
    const hashtagIds = followedTags.map(h => h.hashtagId);
    const hashtags = hashtagIds.length > 0
      ? await this.prisma.hashtag.findMany({ where: { id: { in: hashtagIds } }, select: { name: true } })
      : [];
    const tagNames = hashtags.map(h => h.name);
    if (tagNames.length === 0) return [];

    const trendingCutoff = new Date(Date.now() - TIME_WINDOWS.TRENDING_HOURS * 3600000);
    const posts = await this.prisma.post.findMany({
      where: {
        hashtags: { hasSome: tagNames },
        createdAt: { gte: trendingCutoff },
        isRemoved: false,
        visibility: 'PUBLIC',
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        user: {
          isDeactivated: false, isBanned: false, isDeleted: false, isPrivate: false,
          ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}),
        },
        ...(dismissedIds.length > 0 ? { id: { notIn: dismissedIds } } : {}),
      },
      select: { id: true, content: true, mediaUrls: true, likesCount: true, commentsCount: true, sharesCount: true, createdAt: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      take: CANDIDATE_POOL_SIZE.COMMUNITY,
      orderBy: { createdAt: 'desc' },
    });

    // Score by time-decayed engagement: (likes*2 + comments*3 + shares*4) / ageHours^1.2
    const scored = posts.map(post => {
      const ageHours = Math.max(1, (Date.now() - post.createdAt.getTime()) / 3600000);
      const engagement = post.likesCount * 2 + post.commentsCount * 3 + post.sharesCount * 4;
      return { ...post, _score: engagement / Math.pow(ageHours, 1.2) };
    });
    scored.sort((a, b) => b._score - a._score);

    return scored.slice(0, limit).map(({ _score, ...post }) => post);
  }

  async getUserInterests(userId: string): Promise<{ bySpace: Record<string, number>; byHashtag: Record<string, number> }> {
    const interactions = await this.prisma.feedInteraction.findMany({
      where: { userId, OR: [{ liked: true }, { saved: true }, { viewDurationMs: { gte: 5000 } }] },
      select: { space: true, viewDurationMs: true, liked: true, commented: true, shared: true, saved: true, postId: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const bySpace: Record<string, number> = {};
    const postIds = interactions.map(i => i.postId).filter((id): id is string => id !== null);
    // Fetch hashtags for interacted posts
    const posts = postIds.length > 0
      ? await this.prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, hashtags: true }, take: 200 })
      : [];
    const hashtagMap = new Map(posts.map(p => [p.id, p.hashtags]));
    const byHashtag: Record<string, number> = {};

    for (const i of interactions) {
      const w = (i.liked ? 2 : 0) + (i.commented ? 3 : 0) + (i.shared ? 4 : 0) + (i.saved ? 3 : 0) + Math.min(i.viewDurationMs / 10000, 5);
      bySpace[i.space] = (bySpace[i.space] || 0) + w;
      const tags = (i.postId ? hashtagMap.get(i.postId) : undefined) || [];
      for (const tag of tags) {
        byHashtag[tag] = (byHashtag[tag] || 0) + w;
      }
    }
    return { bySpace, byHashtag };
  }

  /**
   * Finding #295: Reset algorithm — clear all feed interactions and interest data.
   * Gives user a fresh start with the recommendation algorithm.
   */
  async resetAlgorithm(userId: string) {
    await this.prisma.$transaction([
      this.prisma.feedInteraction.deleteMany({ where: { userId } }),
      this.prisma.feedDismissal.deleteMany({ where: { userId } }),
    ]);
    // Clear Redis session signals
    await this.redis.del(`session:${userId}`);
    // Clear cached foryou feeds and scored feed sorted sets (SCAN is non-blocking unlike KEYS)
    for (const pattern of [`feed:foryou:${userId}:*`, `sfeed:*:${userId}`]) {
      let scanCursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(scanCursor, 'MATCH', pattern, 'COUNT', 100);
        scanCursor = nextCursor;
        if (keys.length > 0) await this.redis.del(...keys);
      } while (scanCursor !== '0');
    }
    return { reset: true, message: 'Your algorithm has been reset. Your feed will now show fresh content.' };
  }

  async undismiss(userId: string, contentId: string, contentType: FeedContentType) {
    try {
      await this.prisma.feedDismissal.delete({ where: { userId_contentId_contentType: { userId, contentId, contentType } } });
    } catch (error) {
      // P2025: record not found — idempotent, treat as already undismissed
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { undismissed: true };
      }
      throw error;
    }
    // Invalidate dismissed IDs cache
    await this.redis.del(`dismissed:${userId}:${contentType}`);
    return { undismissed: true };
  }

  /**
   * Load user's content filter settings for feed filtering.
   * Returns null if the user has no custom settings.
   */
  async getContentFilter(userId: string) {
    return this.prisma.contentFilterSetting.findUnique({
      where: { userId },
      select: { hideMusic: true, strictnessLevel: true },
    });
  }

  /**
   * Build Prisma where-clause additions based on the user's content filter settings.
   * Callers can spread these into their existing `where` object.
   */
  async buildContentFilterWhere(userId: string): Promise<Prisma.JsonObject> {
    const contentFilter = await this.getContentFilter(userId);
    if (!contentFilter) return {};

    const where: Prisma.JsonObject = {};

    if (contentFilter.hideMusic) {
      // Exclude posts with audio tracks
      where.audioTrackId = null;
    }

    if (contentFilter.strictnessLevel === 'STRICT' || contentFilter.strictnessLevel === 'FAMILY') {
      // Exclude posts with content warnings
      where.contentWarning = null;
    }

    return where;
  }

  /** Get user IDs to exclude from feeds (blocked both directions + muted + restricted).
   *  Delegates to shared cached utility — results cached in Redis for 60s per user. */
  private async getExcludedUserIds(userId: string): Promise<string[]> {
    return getExcludedUserIds(this.prisma, this.redis, userId);
  }

  /**
   * Trending feed — posts scored by engagement rate directly in SQL.
   * Uses SQL-computed score: (likes + comments*2 + shares*3 + saves*2) / GREATEST(ageHours, 1)
   * with keyset cursor pagination (score:id:ts) for consistent page-to-page ordering.
   *
   * Previous approach fetched 500 candidates into JS, scored and sorted in memory.
   * This version computes the score in PostgreSQL ORDER BY, fetching only limit+1 rows.
   * Multi-tier window expansion (24h → 48h → 7d) ensures enough candidates.
   */
  async getTrendingFeed(cursor?: string, limit = 20, userId?: string) {
    // Redis cache for unauthenticated trending feed (personalized feeds bypass cache)
    const cacheKey = !userId ? `trending_feed:${cursor || 'first'}:${limit}` : null;
    if (cacheKey) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // Corrupted cache entry — fall through to recompute
        }
      }
    }

    // Build block/mute filter + content filter + dismissed IDs when authenticated
    let excludedUserIds: string[] = [];
    let contentFilter: Record<string, unknown> = {};
    let dismissedIds: string[] = [];
    if (userId) {
      const [excludedIds, dismissed, cf] = await Promise.all([
        this.getExcludedUserIds(userId),
        this.getDismissedIds(userId, 'post' as FeedContentType),
        this.buildContentFilterWhere(userId),
      ]);
      excludedUserIds = excludedIds;
      dismissedIds = dismissed;
      contentFilter = cf as Record<string, unknown>;
    }

    // Parse cursor: "score:id:ts" keyset for score-sorted pagination.
    // The timestamp (ts) ensures scores are computed at the same reference point
    // across pages, preventing items from drifting across page boundaries.
    let cursorScore: number | null = null;
    let cursorId: string | null = null;
    let scoreTimestamp: number = Date.now();
    if (cursor) {
      const parts = cursor.split(':');
      if (parts.length >= 2) {
        cursorScore = parseFloat(parts[0]);
        cursorId = parts[1];
        if (parts.length >= 3) {
          const parsedTs = parseInt(parts[2], 10);
          if (!isNaN(parsedTs) && parsedTs > 0) {
            scoreTimestamp = parsedTs;
          }
        }
      }
    }

    // Reference timestamp for scoring — fixed across pages via cursor
    const refTimestamp = new Date(scoreTimestamp);
    const take = limit + 1;

    // Multi-tier window expansion: 24h → 48h → 7d
    const tiers = [
      TIME_WINDOWS.TRENDING_HOURS,    // 24h — tight trending window
      TIME_WINDOWS.FORYOU_HOURS,      // 48h — expanded if sparse
      TIME_WINDOWS.FALLBACK_HOURS,    // 7d — last resort
    ];

    // SQL-scored trending: compute engagement score in PostgreSQL, ORDER BY it,
    // and use keyset pagination so only limit+1 rows are fetched per page.
    // Score formula: (likesCount + commentsCount*2 + sharesCount*3 + savesCount*2)
    //               / GREATEST(EXTRACT(EPOCH FROM (refTs - createdAt)) / 3600, 1)
    let scoredIds: Array<{ id: string; score: number }> = [];

    for (const windowHours of tiers) {
      const cutoff = new Date(Date.now() - windowHours * 3600000);

      // Build dynamic WHERE fragments for optional filters
      const excludeUserClause = excludedUserIds.length > 0
        ? Prisma.sql`AND u."id" NOT IN (${Prisma.join(excludedUserIds)})`
        : Prisma.empty;
      const excludeDismissedClause = dismissedIds.length > 0
        ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(dismissedIds)})`
        : Prisma.empty;
      const contentFilterClauses: Prisma.Sql[] = [];
      if (contentFilter.audioTrackId === null) {
        contentFilterClauses.push(Prisma.sql`AND p."audioTrackId" IS NULL`);
      }
      if (contentFilter.contentWarning === null) {
        contentFilterClauses.push(Prisma.sql`AND p."contentWarning" IS NULL`);
      }
      const contentFilterSql = contentFilterClauses.length > 0
        ? Prisma.join(contentFilterClauses, ' ')
        : Prisma.empty;

      // Keyset cursor clause: skip rows at or above cursor position
      const cursorClause = cursorScore !== null && cursorId !== null
        ? Prisma.sql`AND (
            ("likesCount" + "commentsCount" * 2 + "sharesCount" * 3 + "savesCount" * 2)::float
            / GREATEST(EXTRACT(EPOCH FROM (${refTimestamp}::timestamptz - p."createdAt")) / 3600.0, 1.0)
            < ${cursorScore}
            OR (
              ABS(
                ("likesCount" + "commentsCount" * 2 + "sharesCount" * 3 + "savesCount" * 2)::float
                / GREATEST(EXTRACT(EPOCH FROM (${refTimestamp}::timestamptz - p."createdAt")) / 3600.0, 1.0)
                - ${cursorScore}
              ) < 1e-9
              AND p."id" > ${cursorId}
            )
          )`
        : Prisma.empty;

      scoredIds = await this.prisma.$queryRaw<Array<{ id: string; score: number }>>`
        SELECT
          p."id",
          ("likesCount" + "commentsCount" * 2 + "sharesCount" * 3 + "savesCount" * 2)::float
          / GREATEST(EXTRACT(EPOCH FROM (${refTimestamp}::timestamptz - p."createdAt")) / 3600.0, 1.0)
          AS score
        FROM "posts" p
        INNER JOIN "users" u ON u."id" = p."userId"
        WHERE p."isRemoved" = false
          AND p."visibility" = 'PUBLIC'
          AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= NOW())
          AND p."createdAt" >= ${cutoff}
          AND u."isDeactivated" = false
          AND u."isBanned" = false
          AND u."isDeleted" = false
          AND u."isPrivate" = false
          ${excludeUserClause}
          ${excludeDismissedClause}
          ${contentFilterSql}
          ${cursorClause}
        ORDER BY score DESC, p."id" ASC
        LIMIT ${take}
      `;

      // For first-page requests, check if we have enough candidates (expand window if not)
      if (cursorScore === null && scoredIds.length < Math.min(take, 100)) {
        continue; // Try wider window
      }
      break;
    }

    const hasMore = scoredIds.length > limit;
    const pageIds = hasMore ? scoredIds.slice(0, limit) : scoredIds;

    // Hydrate with Prisma to get full post data + relations (user, circle)
    let data: Prisma.PostGetPayload<{ select: typeof FEED_POST_SELECT }>[] = [];
    if (pageIds.length > 0) {
      const idList = pageIds.map(r => r.id);
      const hydrated = await this.prisma.post.findMany({
        where: { id: { in: idList } },
        select: FEED_POST_SELECT,
      });
      // Restore score-based order (findMany doesn't preserve IN-list order)
      const orderMap = new Map(idList.map((id, idx) => [id, idx]));
      hydrated.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      data = hydrated;
    }

    // Build keyset cursor from last scored item
    const lastScored = pageIds[pageIds.length - 1];
    const nextCursor = hasMore && lastScored
      ? `${lastScored.score}:${lastScored.id}:${scoreTimestamp}`
      : undefined;

    const result = {
      data,
      meta: {
        hasMore,
        cursor: nextCursor,
      },
    };

    // Cache unauthenticated trending feed for 5 minutes
    if (cacheKey) {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    }

    return result;
  }

  /**
   * Featured / staff-picked posts — editorial control over what new users see.
   */
  async getFeaturedFeed(cursor?: string, limit = 20, userId?: string) {
    let userFilter = {};
    let dismissedIds: string[] = [];
    if (userId) {
      const [excludedIds, dismissed] = await Promise.all([
        this.getExcludedUserIds(userId),
        this.getDismissedIds(userId, 'post' as FeedContentType),
      ]);
      if (excludedIds.length > 0) {
        userFilter = { id: { notIn: excludedIds } };
      }
      dismissedIds = dismissed;
    }

    const posts = await this.prisma.post.findMany({
      where: {
        isFeatured: true,
        isRemoved: false,
        visibility: PostVisibility.PUBLIC,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        user: { isDeactivated: false, isBanned: false, isDeleted: false, isPrivate: false, ...userFilter },
        ...(dismissedIds.length > 0 ? { id: { notIn: dismissedIds } } : {}),
      },
      select: { ...FEED_POST_SELECT, featuredAt: true },
      orderBy: { featuredAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;

    return {
      data,
      meta: {
        hasMore,
        cursor: hasMore && data.length > 0 ? data[data.length - 1].id : null,
      },
    };
  }

  /**
   * Feature or unfeature a post (admin only).
   */
  async featurePost(postId: string, featured: boolean, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
    return this.prisma.post.update({
      where: { id: postId },
      data: {
        isFeatured: featured,
        featuredAt: featured ? new Date() : null,
      },
      select: { id: true, isFeatured: true, featuredAt: true },
    });
  }

  /**
   * Suggested users to follow — scored by followers, content, verification, and language.
   * Works without auth for anonymous users.
   */
  async getSuggestedUsers(userId?: string, limit = 5) {
    // Get IDs to exclude: the user's own ID + already followed + blocked/muted
    const excludeIds: string[] = userId ? [userId] : [];
    if (userId) {
      const [following, blockedMutedIds] = await Promise.all([
        this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
          take: 5000,
        }),
        this.getExcludedUserIds(userId),
      ]);
      excludeIds.push(...following.map((f) => f.followingId));
      excludeIds.push(...blockedMutedIds);
    }

    const users = await this.prisma.user.findMany({
      where: {
        isDeactivated: false,
        isBanned: false,
        isDeleted: false,
        isPrivate: false,
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isVerified: true,
        followersCount: true,
        postsCount: true,
      },
      orderBy: [
        { isVerified: 'desc' },
        { followersCount: 'desc' },
        { postsCount: 'desc' },
      ],
      take: limit,
    });

    return users;
  }

  /**
   * Get the follow count for a user. Returns 0 if user not found.
   */
  async getUserFollowingCount(userId: string): Promise<number> {
    const count = await this.prisma.follow.count({
      where: { followerId: userId },
    });
    return count;
  }

  async getNearbyContent(lat: number, lng: number, radiusKm: number, cursor?: string, userId?: string) {
    const limit = 20;
    // STUB: Currently returns all geo-tagged posts without actual distance filtering.
    // The Post model lacks lat/lng fields, so true proximity search is not possible.

    // Build block/mute exclusion + dismissed IDs when authenticated
    let userFilter: Record<string, unknown> = {};
    let dismissedIds: string[] = [];
    if (userId) {
      const [excludedIds, dismissed] = await Promise.all([
        this.getExcludedUserIds(userId),
        this.getDismissedIds(userId, 'post' as FeedContentType),
      ]);
      if (excludedIds.length > 0) {
        userFilter = { id: { notIn: excludedIds } };
      }
      dismissedIds = dismissed;
    }

    const posts = await this.prisma.post.findMany({
      where: {
        locationName: { not: null },
        isRemoved: false,
        visibility: PostVisibility.PUBLIC,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        user: { isDeactivated: false, isBanned: false, isDeleted: false, isPrivate: false, ...userFilter },
        ...(dismissedIds.length > 0 ? { id: { notIn: dismissedIds } } : {}),
      },
      select: {
        id: true,
        content: true,
        mediaUrls: true,
        mediaTypes: true,
        postType: true,
        locationName: true,
        likesCount: true,
        commentsCount: true,
        createdAt: true,
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    return {
      data: items,
      meta: {
        hasMore,
        cursor: hasMore ? items[items.length - 1].id : null,
      },
    };
  }

  /**
   * Get creators that the user frequently interacts with (10+ interactions in last 7 days).
   * Returns a Set of creator user IDs for fast lookup.
   */
  async getFrequentCreatorIds(userId: string): Promise<Set<string>> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Use SQL aggregation instead of loading 500 interactions into JS
    const results = await this.prisma.$queryRaw<Array<{ creatorId: string }>>`
      SELECT p."userId" as "creatorId"
       FROM "feed_interactions" fi
       JOIN "posts" p ON fi."postId" = p.id
       WHERE fi."userId" = ${userId}
         AND fi."createdAt" >= ${sevenDaysAgo}
         AND (fi."viewed" = true OR fi."liked" = true OR fi."commented" = true OR fi."shared" = true OR fi."saved" = true)
         AND p."userId" != ${userId}
       GROUP BY p."userId"
       HAVING COUNT(*) >= 10
    `;

    return new Set(results.map(r => r.creatorId));
  }

  /**
   * Get the list of frequent creators with their profile info.
   */
  async getFrequentCreators(userId: string) {
    const frequentIds = await this.getFrequentCreatorIds(userId);
    if (frequentIds.size === 0) return [];

    // Exclude blocked/muted users
    const excludedIds = await this.getExcludedUserIds(userId);
    const filteredIds = [...frequentIds].filter(id => !excludedIds.includes(id));
    if (filteredIds.length === 0) return [];

    return this.prisma.user.findMany({
      where: { id: { in: filteredIds }, isDeactivated: false, isBanned: false, isDeleted: false },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
      },
      take: 50,
    });
  }
}