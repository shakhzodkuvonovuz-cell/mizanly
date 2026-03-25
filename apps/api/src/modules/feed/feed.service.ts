import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace, PostVisibility, Prisma } from '@prisma/client';
import Redis from 'ioredis';

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

    // Use findFirst + update/create since FeedInteraction lacks @@unique([userId, postId])
    // (adding the constraint requires schema migration — deferred to file 15)
    const existing = await this.prisma.feedInteraction.findFirst({
      where: { userId, postId: data.postId },
    });

    if (existing) {
      return this.prisma.feedInteraction.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    return this.prisma.feedInteraction.create({
      data: {
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

  async dismiss(userId: string, contentId: string, contentType: string) {
    // Finding #300: Track negative signal for algorithm adjustment
    await this.redis.lpush(`negative_signals:${userId}`, JSON.stringify({
      contentId, contentType, action: 'dismiss', timestamp: Date.now(),
    }));
    await this.redis.ltrim(`negative_signals:${userId}`, 0, 199);

    return this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId, contentType } },
      update: {},
      create: { userId, contentId, contentType },
    });
  }

  async getDismissedIds(userId: string, contentType: string): Promise<string[]> {
    const d = await this.prisma.feedDismissal.findMany({ where: { userId, contentType }, select: { contentId: true }, take: 1000 });
    return d.map(x => x.contentId);
  }

  async getUserInterests(userId: string): Promise<{ bySpace: Record<string, number>; byHashtag: Record<string, number> }> {
    const interactions = await this.prisma.feedInteraction.findMany({
      where: { userId, OR: [{ liked: true }, { saved: true }, { viewDurationMs: { gte: 5000 } }] },
      select: { space: true, viewDurationMs: true, liked: true, commented: true, shared: true, saved: true, postId: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const bySpace: Record<string, number> = {};
    const postIds = interactions.map(i => i.postId);
    // Fetch hashtags for interacted posts
    const posts = postIds.length > 0
      ? await this.prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, hashtags: true }, take: 200 })
      : [];
    const hashtagMap = new Map(posts.map(p => [p.id, p.hashtags]));
    const byHashtag: Record<string, number> = {};

    for (const i of interactions) {
      const w = (i.liked ? 2 : 0) + (i.commented ? 3 : 0) + (i.shared ? 4 : 0) + (i.saved ? 3 : 0) + Math.min(i.viewDurationMs / 10000, 5);
      bySpace[i.space] = (bySpace[i.space] || 0) + w;
      const tags = hashtagMap.get(i.postId) || [];
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
    // Clear cached foryou feeds
    const keys = await this.redis.keys(`feed:foryou:${userId}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
    return { reset: true, message: 'Your algorithm has been reset. Your feed will now show fresh content.' };
  }

  async undismiss(userId: string, contentId: string, contentType: string) {
    try {
      await this.prisma.feedDismissal.delete({ where: { userId_contentId_contentType: { userId, contentId, contentType } } });
    } catch (error) {
      // P2025: record not found — idempotent, treat as already undismissed
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { undismissed: true };
      }
      throw error;
    }
    return { undismissed: true };
  }

  /**
   * Load user's content filter settings for feed filtering.
   * Returns null if the user has no custom settings.
   */
  async getContentFilter(userId: string) {
    return this.prisma.contentFilterSetting.findUnique({
      where: { userId },
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

  /** Get user IDs to exclude from feeds (blocked both directions + muted + restricted) */
  private async getExcludedUserIds(userId: string): Promise<string[]> {
    const [blocks, mutes, restricts] = await Promise.all([
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
      this.prisma.restrict.findMany({
        where: { restricterId: userId },
        select: { restrictedId: true },
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
    for (const r of restricts) {
      excluded.add(r.restrictedId);
    }
    return [...excluded];
  }

  /**
   * Trending feed — posts from last 7 days scored by engagement rate.
   * Uses cursor-based pagination with (score, id) keyset to avoid refetching rows.
   * Works without auth (for anonymous browsing + new user cold start).
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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Build block/mute filter + content filter when authenticated
    let userFilter = {};
    let contentFilter = {};
    if (userId) {
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length > 0) {
        userFilter = { id: { notIn: excludedIds } };
      }
      contentFilter = await this.buildContentFilterWhere(userId) as Record<string, unknown>;
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

    const posts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        visibility: PostVisibility.PUBLIC,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        createdAt: { gte: sevenDaysAgo },
        user: { isDeactivated: false, isPrivate: false, ...userFilter },
        ...contentFilter,
      },
      select: FEED_POST_SELECT,
      orderBy: { createdAt: 'desc' },
      // Fetch a reasonable candidate pool for scoring.
      // No offset — we filter by score/id cursor below.
      take: 200,
    });

    // Scoring formula: engagementRate = engagementTotal / ageHours
    // where engagementTotal = likes*1 + comments*2 + shares*3 + saves*2
    // This is a simple time-decay engagement rate that favors fresh viral content.
    const scored = posts.map((post) => {
      const ageHours = Math.max(1, (scoreTimestamp - post.createdAt.getTime()) / 3600000);
      const engagementTotal =
        post.likesCount +
        post.commentsCount * 2 +
        post.sharesCount * 3 +
        post.savesCount * 2;
      const engagementRate = engagementTotal / ageHours;
      return { ...post, _score: engagementRate };
    });

    scored.sort((a, b) => b._score - a._score || a.id.localeCompare(b.id));

    // Cursor-based keyset filtering: skip items at or above the cursor position.
    // Uses epsilon tolerance (1e-9) for float comparison since scores involve division
    // and Date.now() shifts between page requests cause minor score drift.
    let filtered = scored;
    if (cursorScore !== null && cursorId !== null) {
      const eps = 1e-9;
      const startIdx = scored.findIndex(
        (item) =>
          item._score < cursorScore! - eps ||
          (Math.abs(item._score - cursorScore!) < eps && item.id > cursorId!),
      );
      filtered = startIdx >= 0 ? scored.slice(startIdx) : [];
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;

    const data = pageItems.map(({ _score, ...post }) => post);

    // Build keyset cursor from last item's score + id + timestamp
    // Timestamp ensures consistent scoring across page requests
    const lastItem = pageItems[pageItems.length - 1];
    const nextCursor = hasMore && lastItem
      ? `${lastItem._score}:${lastItem.id}:${scoreTimestamp}`
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
    if (userId) {
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length > 0) {
        userFilter = { id: { notIn: excludedIds } };
      }
    }

    const posts = await this.prisma.post.findMany({
      where: {
        isFeatured: true,
        isRemoved: false,
        visibility: PostVisibility.PUBLIC,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        user: { isDeactivated: false, ...userFilter },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: FEED_POST_SELECT,
      orderBy: { featuredAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;

    return {
      data,
      meta: {
        hasMore,
        cursor: data.length > 0 ? data[data.length - 1].id : undefined,
      },
    };
  }

  /**
   * Feature or unfeature a post (admin only).
   */
  async featurePost(postId: string, featured: boolean, userId?: string) {
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('Admin access required');
      }
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
          take: 50,
        }),
        this.getExcludedUserIds(userId),
      ]);
      excludeIds.push(...following.map((f) => f.followingId));
      excludeIds.push(...blockedMutedIds);
    }

    const users = await this.prisma.user.findMany({
      where: {
        isDeactivated: false,
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
    //
    // To implement real nearby content:
    // 1. Add `latitude Float?` and `longitude Float?` fields to the Post model
    // 2. Install PostGIS extension: `CREATE EXTENSION IF NOT EXISTS postgis;`
    // 3. Add a geography column: `ALTER TABLE "Post" ADD COLUMN geog geography(Point, 4326);`
    // 4. Create spatial index: `CREATE INDEX posts_geog_idx ON "Post" USING GIST(geog);`
    // 5. Query with ST_DWithin: `WHERE ST_DWithin(geog, ST_MakePoint($lng, $lat)::geography, $radiusKm * 1000)`
    //
    // Alternatively, use the Haversine formula (as mosques.service does) with lat/lng columns
    // and a bounding box pre-filter for index usage.
    const posts = await this.prisma.post.findMany({
      where: {
        locationName: { not: null },
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
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
      take: limit,
    });

    const hasMore = posts.length === limit;
    return {
      data: posts,
      meta: {
        hasMore,
        cursor: hasMore ? posts[posts.length - 1].createdAt.toISOString() : undefined,
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
    const results = await this.prisma.$queryRawUnsafe<Array<{ creatorId: string }>>(
      `SELECT p."userId" as "creatorId"
       FROM "FeedInteraction" fi
       JOIN "Post" p ON fi."postId" = p.id
       WHERE fi."userId" = $1
         AND fi."createdAt" >= $2
         AND (fi."viewed" = true OR fi."liked" = true OR fi."commented" = true OR fi."shared" = true OR fi."saved" = true)
         AND p."userId" != $1
       GROUP BY p."userId"
       HAVING COUNT(*) >= 10`,
      userId,
      sevenDaysAgo,
    );

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
      where: { id: { in: filteredIds } },
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