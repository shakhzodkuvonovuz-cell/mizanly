import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace, PostVisibility, Prisma } from '@prisma/client';

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
  constructor(private prisma: PrismaService) {}

  async logInteraction(userId: string, data: { postId: string; space: string; viewed?: boolean; viewDurationMs?: number; completionRate?: number | null; liked?: boolean; commented?: boolean; shared?: boolean; saved?: boolean }) {
    // Find existing interaction
    const existing = await this.prisma.feedInteraction.findFirst({
      where: { userId, postId: data.postId },
    });
    if (existing) {
      return this.prisma.feedInteraction.update({
        where: { id: existing.id },
        data: {
          viewed: data.viewed,
          viewDurationMs: data.viewDurationMs,
          completionRate: data.completionRate,
          liked: data.liked,
          commented: data.commented,
          shared: data.shared,
          saved: data.saved,
        },
      });
    } else {
      return this.prisma.feedInteraction.create({
        data: {
          userId,
          postId: data.postId,
          space: data.space as ContentSpace,
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
  }

  async dismiss(userId: string, contentId: string, contentType: string) {
    return this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId, contentType } },
      update: {},
      create: { userId, contentId, contentType },
    });
  }

  async getDismissedIds(userId: string, contentType: string): Promise<string[]> {
    const d = await this.prisma.feedDismissal.findMany({ where: { userId, contentType }, select: { contentId: true } });
    return d.map(x => x.contentId);
  }

  async getUserInterests(userId: string): Promise<Record<string, number>> {
    const interactions = await this.prisma.feedInteraction.findMany({ where: { userId, viewed: true }, select: { space: true, viewDurationMs: true, liked: true, commented: true, shared: true, saved: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    const scores: Record<string, number> = {};
    for (const i of interactions) {
      const w = (i.liked ? 2 : 0) + (i.commented ? 3 : 0) + (i.shared ? 4 : 0) + (i.saved ? 3 : 0) + Math.min(i.viewDurationMs / 10000, 5);
      scores[i.space] = (scores[i.space] || 0) + w;
    }
    return scores;
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

    if (contentFilter.strictnessLevel === 'strict' || contentFilter.strictnessLevel === 'family') {
      // Exclude posts with content warnings
      where.contentWarning = null;
    }

    return where;
  }

  /**
   * Trending feed — posts from last 7 days scored by engagement rate.
   * Works without auth (for anonymous browsing + new user cold start).
   */
  async getTrendingFeed(cursor?: string, limit = 20) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const posts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        visibility: PostVisibility.PUBLIC,
        scheduledAt: null,
        createdAt: { gte: sevenDaysAgo },
        user: { isDeactivated: false, isPrivate: false },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: FEED_POST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Score by engagement RATE, not total
    const scored = posts.map((post) => {
      const ageHours = Math.max(1, (Date.now() - post.createdAt.getTime()) / 3600000);
      const engagementTotal =
        post.likesCount +
        post.commentsCount * 2 +
        post.sharesCount * 3 +
        post.savesCount * 2;
      const engagementRate = engagementTotal / ageHours;
      return { ...post, _score: engagementRate };
    });

    scored.sort((a, b) => b._score - a._score);
    const page = scored.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const data = (hasMore ? page.slice(0, limit) : page).map(
      ({ _score, ...post }) => post,
    );

    return {
      data,
      meta: {
        hasMore,
        cursor: data.length > 0 ? data[data.length - 1].id : undefined,
      },
    };
  }

  /**
   * Featured / staff-picked posts — editorial control over what new users see.
   */
  async getFeaturedFeed(cursor?: string, limit = 20) {
    const posts = await this.prisma.post.findMany({
      where: {
        isFeatured: true,
        isRemoved: false,
        visibility: PostVisibility.PUBLIC,
        user: { isDeactivated: false },
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
  async featurePost(postId: string, featured: boolean) {
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
    // Get IDs to exclude: the user's own ID + already followed
    const excludeIds: string[] = userId ? [userId] : [];
    if (userId) {
      const following = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
        take: 50,
      });
      excludeIds.push(...following.map((f) => f.followingId));
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
    // Find posts with locationName that were created nearby
    // Since we don't have lat/lng on posts, we search for posts with any locationName
    // and sort by recency. In production, you'd use PostGIS or a geo index.
    const posts = await this.prisma.post.findMany({
      where: {
        locationName: { not: null },
        isRemoved: false,
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
}