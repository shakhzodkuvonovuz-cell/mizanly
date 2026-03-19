import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace, Prisma } from '@prisma/client';

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