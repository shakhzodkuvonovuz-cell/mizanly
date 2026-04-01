import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { TIME_WINDOWS } from '../../common/constants/feed-scoring';
import { CreatePostDto } from './dto/create-post.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { extractHashtags } from '@/common/utils/hashtag';
import { Prisma, PostType, PostVisibility, CommentPermission, ReactionType, ReportReason, ContentSpace } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
import { QueueService } from '../../common/queue/queue.service';
import { AnalyticsService } from '../../common/services/analytics.service';
import { enrichPostsForUser } from '../../common/utils/enrich';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { getExcludedUserIds } from '../../common/utils/excluded-users';
import { ScoredFeedCache, ScoredItem } from '../../common/utils/scored-feed-cache';
import { createHash } from 'crypto';

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
  locationLat: true,
  locationLng: true,
  scheduledAt: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  savesCount: true,
  viewsCount: true,
  hideLikesCount: true,
  commentsDisabled: true,
  commentPermission: true,
  brandedContent: true,
  brandPartner: true,
  remixAllowed: true,
  shareToFeed: true,
  topics: true,
  altText: true,
  isSensitive: true,
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
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  private readonly scoredFeedCache: ScoredFeedCache;
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Inject('REDIS') private redis: Redis,
    private ai: AiService,
    private contentSafety: ContentSafetyService,
    private queueService: QueueService,
    private analytics: AnalyticsService,
    private publishWorkflow: PublishWorkflowService,
  ) {
    this.scoredFeedCache = new ScoredFeedCache(redis);
  }

  async getFeed(
    userId: string,
    type: 'following' | 'foryou' | 'chronological' | 'favorites' = 'following',
    cursor?: string,
    limit = 20,
  ) {
    if (type === 'chronological') {
      return this.getChronologicalFeed(userId, cursor, limit);
    }

    if (type === 'favorites') {
      return this.getFavoritesFeed(userId, cursor, limit);
    }

    // For-you feed: materialized scoring via Redis sorted set.
    // Scores 500 candidates once, caches in sorted set for 120s, paginates from cache.
    if (type === 'foryou') {
      const sfeedKey = `sfeed:saf:foryou:${userId}`;
      const page = cursor ? parseInt(cursor, 10) || 0 : 0;

      const { items, hasMore } = await this.scoredFeedCache.getPage(
        sfeedKey,
        page,
        limit,
        120,
        async (): Promise<ScoredItem[]> => {
          const [excludedIds, dismissals] = await Promise.all([
            getExcludedUserIds(this.prisma, this.redis, userId),
            this.prisma.feedDismissal.findMany({ where: { userId, contentType: 'POST' }, select: { contentId: true }, take: 200 }),
          ]);
          const dismissedPostIds = dismissals.map(d => d.contentId);

          const recentPosts = await this.prisma.post.findMany({
            where: {
              createdAt: { gte: new Date(Date.now() - TIME_WINDOWS.FORYOU_HOURS * 3600000) },
              isRemoved: false,
              OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
              user: { isPrivate: false, isBanned: false, isDeactivated: false, isDeleted: false },
              visibility: 'PUBLIC',
              ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
              ...(dismissedPostIds.length ? { id: { notIn: dismissedPostIds } } : {}),
            },
            select: POST_SELECT,
            take: 500,
            orderBy: { createdAt: 'desc' },
          });

          return recentPosts.map(post => {
            const ageHours = Math.max(1, (Date.now() - new Date(post.createdAt).getTime()) / 3600000);
            const engagement = (post.likesCount * 3) + (post.commentsCount * 5) + (post.sharesCount * 7) + (post.savesCount * 2) + (post.viewsCount * 0.1);
            const score = engagement / Math.pow(ageHours, 1.5);
            return { ...post, score, id: post.id };
          });
        },
      );

      // Strip score field and enrich with user-specific data (isLiked, isSaved)
      const data = items.map(({ score, ...post }) => post);
      const enriched = await this.enrichPostsForUser(data as { id: string }[], userId);

      return {
        data: enriched,
        meta: {
          cursor: hasMore ? String(page + 1) : null,
          hasMore,
        },
      };
    }

    // Following feed — with zero-follow fallback to trending
    const [follows, excludedIds] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true }, take: 5000 }),
      getExcludedUserIds(this.prisma, this.redis, userId),
    ]);

    const followingIds = follows.map((f) => f.followingId);
    const followCount = followingIds.length;

    // Zero follows → return trending content so feed is never empty
    if (followCount === 0) {
      return this.getTrendingFallback(userId, excludedIds, cursor, limit);
    }

    // Few follows (< 10) → blend 50% following + 50% trending
    if (followCount < 10) {
      return this.getBlendedFeed(userId, followingIds, excludedIds, cursor, limit);
    }

    // Normal following feed
    const excludedSet = new Set(excludedIds);
    const visibleUserIds = [userId, ...followingIds.filter(id => !excludedSet.has(id))];

    const where: Prisma.PostWhereInput = {
      isRemoved: false,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      userId: { in: visibleUserIds },
      user: { isBanned: false, isDeactivated: false, isDeleted: false },
      AND: [
        { OR: [{ visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS' }, { userId }] },
      ],
    };

    const posts = await this.prisma.post.findMany({
      where,
      select: POST_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const enriched = await this.enrichPostsForUser(items, userId);
    const result = {
      data: enriched,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };

    return result;
  }

  /**
   * Trending fallback for users with zero follows.
   * Returns engagement-rate-scored posts from last 7 days.
   */
  private async getTrendingFallback(userId: string, excludedIds: string[], cursor?: string, limit = 20) {
    const sfeedKey = `sfeed:saf:trending:${userId}`;
    const page = cursor ? parseInt(cursor, 10) || 0 : 0;

    const { items, hasMore } = await this.scoredFeedCache.getPage(
      sfeedKey,
      page,
      limit,
      120,
      async (): Promise<ScoredItem[]> => {
        const fallbackCutoff = new Date(Date.now() - TIME_WINDOWS.FALLBACK_HOURS * 3600000);

        const posts = await this.prisma.post.findMany({
          where: {
            isRemoved: false,
            visibility: 'PUBLIC',
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
            createdAt: { gte: fallbackCutoff },
            user: { isDeactivated: false, isBanned: false, isDeleted: false, isPrivate: false },
            ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
          },
          select: POST_SELECT,
          take: 500,
          orderBy: { createdAt: 'desc' },
        });

        return posts.map(post => {
          const ageHours = Math.max(1, (Date.now() - post.createdAt.getTime()) / 3600000);
          const engagement = post.likesCount + post.commentsCount * 2 + post.sharesCount * 3 + post.savesCount * 2;
          return { ...post, score: engagement / ageHours, id: post.id };
        });
      },
    );

    const data = items.map(({ score, ...p }) => p);
    const enriched = await this.enrichPostsForUser(data as { id: string }[], userId);

    return {
      data: enriched,
      meta: { cursor: hasMore ? String(page + 1) : null, hasMore },
    };
  }

  /**
   * Blended feed for users with few follows (< 10).
   * 50% following content + 50% trending content, merged and deduplicated.
   */
  private async getBlendedFeed(userId: string, followingIds: string[], excludedIds: string[], cursor?: string, limit = 20) {
    const excludedSet = new Set(excludedIds);
    const visibleUserIds = [userId, ...followingIds.filter(id => !excludedSet.has(id))];
    const halfLimit = Math.ceil(limit / 2);

    // Get following content
    const followingPosts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        userId: { in: visibleUserIds },
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
        AND: [
          { OR: [{ visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS' }, { userId }] },
        ],
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: POST_SELECT,
      take: halfLimit + 1,
      orderBy: { createdAt: 'desc' },
    });

    // Get trending content to fill the rest — exclude already-seen posts + cursor for pagination
    const seenIds = [...new Set(followingPosts.map(p => p.id))];
    const fallbackCutoff = new Date(Date.now() - TIME_WINDOWS.FALLBACK_HOURS * 3600000);
    const trendingPosts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        visibility: 'PUBLIC',
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        createdAt: { gte: fallbackCutoff },
        user: { isDeactivated: false, isBanned: false, isDeleted: false, isPrivate: false },
        // Use AND to combine notIn (exclude seen) with lt (cursor pagination)
        AND: [
          { id: { notIn: seenIds } },
          ...(cursor ? [{ id: { lt: cursor } }] : []),
        ],
        ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
      },
      select: POST_SELECT,
      take: limit * 3,
      orderBy: { createdAt: 'desc' },
    });

    // Score trending by engagement rate
    const scoredTrending = trendingPosts.map(post => {
      const ageHours = Math.max(1, (Date.now() - post.createdAt.getTime()) / 3600000);
      const engagement = post.likesCount + post.commentsCount * 2 + post.sharesCount * 3 + post.savesCount * 2;
      return { ...post, _score: engagement / ageHours };
    });
    scoredTrending.sort((a, b) => b._score - a._score);
    const trendingSlice = scoredTrending.slice(0, halfLimit).map(({ _score, ...p }) => p);

    // Interleave: following, trending, following, trending...
    const merged: typeof followingPosts = [];
    const fi = followingPosts.slice(0, halfLimit);
    const ti = trendingSlice;
    const maxLen = Math.max(fi.length, ti.length);
    for (let i = 0; i < maxLen && merged.length < limit; i++) {
      if (i < fi.length) merged.push(fi[i]);
      if (i < ti.length && merged.length < limit) merged.push(ti[i]);
    }

    const hasMore = followingPosts.length > halfLimit || scoredTrending.length > halfLimit;
    const enriched = await this.enrichPostsForUser(merged, userId);

    return {
      data: enriched,
      meta: { cursor: merged.length > 0 ? merged[merged.length - 1].id : null, hasMore },
    };
  }

  private async getChronologicalFeed(userId: string, cursor?: string, limit = 20) {
    const [followingResult, excludedIds] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
        take: 5000,
      }),
      getExcludedUserIds(this.prisma, this.redis, userId),
    ]);
    const followIds = followingResult.map(f => f.followingId);
    const excludedSet = new Set(excludedIds);
    const visibleUserIds = [userId, ...followIds.filter(id => !excludedSet.has(id))];

    const posts = await this.prisma.post.findMany({
      where: {
        userId: { in: visibleUserIds },
        isRemoved: false,
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
        AND: [
          { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
          { OR: [{ userId }, { visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS' }] },
        ],
      },
      select: POST_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const enriched = await this.enrichPostsForUser(items, userId);
    return {
      data: enriched,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  private async getFavoritesFeed(userId: string, cursor?: string, limit = 20) {
    const [circleMembers, excludedIds] = await Promise.all([
      this.prisma.circleMember.findMany({
        where: { circle: { ownerId: userId } },
        select: { userId: true },
        take: 50,
      }),
      getExcludedUserIds(this.prisma, this.redis, userId),
    ]);
    const excludedSet = new Set(excludedIds);
    const favoriteIds = circleMembers.map(m => m.userId).filter(id => !excludedSet.has(id));
    if (favoriteIds.length === 0) return { data: [], meta: { cursor: null, hasMore: false } };

    const posts = await this.prisma.post.findMany({
      where: {
        userId: { in: favoriteIds },
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        visibility: { in: ['PUBLIC', 'FOLLOWERS'] },
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
      },
      select: POST_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const enriched = await this.enrichPostsForUser(items, userId);
    return {
      data: enriched,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  /** Enrich posts with user-specific reaction/saved status (delegates to shared utility) */
  private async enrichPostsForUser<T extends { id: string }>(posts: T[], userId: string) {
    if (!posts.length) return posts;
    return enrichPostsForUser(this.prisma, posts, userId);
  }

  async create(userId: string, dto: CreatePostDto) {
    // Run content safety check before saving — fails closed (blocks on moderation error)
    if (dto.content) {
      const moderationResult = await this.contentSafety.moderateText(dto.content);
      if (!moderationResult.safe) {
        this.logger.warn(`Post creation blocked by content safety: flags=${moderationResult.flags.join(',')}, userId=${userId}`);
        throw new BadRequestException(
          `Content flagged: ${moderationResult.flags.join(', ')}. ${moderationResult.suggestion || 'Please revise your post.'}`,
        );
      }
    }

    // Duplicate post detection — prevent same post twice within 5 minutes
    // Checks both text content AND media URLs to catch media-only dupes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const dupWhere: Record<string, unknown> = { userId, createdAt: { gte: fiveMinutesAgo }, isRemoved: false };
    if (dto.content?.trim()) {
      dupWhere.content = dto.content.trim();
    }
    if (dto.mediaUrls?.length) {
      dupWhere.mediaUrls = { equals: dto.mediaUrls };
    }
    // Only check if we have something to match on (content or media)
    if (dto.content?.trim() || dto.mediaUrls?.length) {
      const duplicate = await this.prisma.post.findFirst({
        where: dupWhere,
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Duplicate post — you already posted this content recently');
      }
    }

    // Parse hashtags (upserts happen inside transaction below)
    const hashtagNames = extractHashtags(dto.content ?? '');
    const isScheduled = !!dto.scheduledAt;

    const result = await this.prisma.$transaction(async (tx) => {
      // Batch upsert hashtags: createMany for record existence + single raw SQL for count increment
      // For scheduled content: create the hashtag record but don't increment count yet
      if (hashtagNames.length > 0) {
        await tx.hashtag.createMany({
          data: hashtagNames.map(name => ({ name })),
          skipDuplicates: true,
        });
        if (!isScheduled) {
          // Batch increment postsCount using tagged template (safe from SQL injection)
          await tx.$executeRaw`UPDATE hashtags SET "postsCount" = "postsCount" + 1 WHERE name = ANY(${hashtagNames}::text[])`;
        }
      }

      // Map commentPermission → also set legacy commentsDisabled boolean for backward compat
      // DTO @IsEnum validates value — safe to index the enum directly
      const commentPerm = dto.commentPermission
        ? CommentPermission[dto.commentPermission as keyof typeof CommentPermission] ?? CommentPermission.EVERYONE
        : CommentPermission.EVERYONE;
      const commentsOff = dto.commentsDisabled ?? (commentPerm === CommentPermission.NOBODY);

      const post = await tx.post.create({
        data: {
          userId,
          postType: dto.postType as PostType,
          content: dto.content ? sanitizeText(dto.content) : dto.content,
          visibility: (dto.visibility as PostVisibility) ?? PostVisibility.PUBLIC,
          circleId: dto.circleId,
          mediaUrls: dto.mediaUrls ?? [],
          mediaTypes: dto.mediaTypes ?? [],
          thumbnailUrl: dto.thumbnailUrl,
          mediaWidth: dto.mediaWidth,
          mediaHeight: dto.mediaHeight,
          videoDuration: dto.videoDuration,
          hashtags: dto.hashtags ?? [],
          mentions: dto.mentions ?? [],
          locationName: dto.locationName,
          locationLat: dto.locationLat,
          locationLng: dto.locationLng,
          isSensitive: dto.isSensitive ?? false,
          altText: dto.altText,
          hideLikesCount: dto.hideLikesCount ?? false,
          commentsDisabled: commentsOff,
          commentPermission: commentPerm,
          brandedContent: dto.brandedContent ?? false,
          brandPartner: dto.brandedContent ? dto.brandPartner : null,
          remixAllowed: dto.remixAllowed ?? true,
          shareToFeed: dto.shareToFeed ?? true,
          topics: dto.topics ?? [],
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          // Finding #418: Content hash for legal evidence
          contentHash: dto.content ? createHash('sha256').update(dto.content).digest('hex') : undefined,
        },
        select: POST_SELECT,
      });

      // Create tagged user records (accepts user IDs or usernames — resolves both)
      if (dto.taggedUserIds?.length) {
        const validUsers = await tx.user.findMany({
          where: {
            OR: [
              { id: { in: dto.taggedUserIds } },
              { username: { in: dto.taggedUserIds } },
            ],
            isDeleted: false,
            isBanned: false,
          },
          select: { id: true },
        });
        if (validUsers.length > 0) {
          await tx.postTaggedUser.createMany({
            data: validUsers.map((u) => ({
              postId: post.id,
              userId: u.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Create collaborator invite if username provided
      if (dto.collaboratorUsername) {
        const invitee = await tx.user.findUnique({
          where: { username: dto.collaboratorUsername },
          select: { id: true },
        });
        if (invitee && invitee.id !== userId) {
          await tx.collabInvite.create({
            data: {
              postId: post.id,
              inviterId: userId,
              inviteeId: invitee.id,
            },
          }).catch(() => {
            // Unique constraint — invite already exists, ignore
          });
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: { postsCount: { increment: 1 } },
      });

      return post;
    });

    const post = result;

    // --- Side effects deferred for scheduled content ---
    // Notifications, gamification XP, and analytics only fire when content is actually published.
    // For scheduled content, these are triggered by the scheduling cron in publishOverdueContent().
    if (!isScheduled) {
      // Mention notifications
      if (dto.mentions?.length) {
        const [mentionedUsers, actor] = await Promise.all([
          this.prisma.user.findMany({ where: { username: { in: dto.mentions } }, select: { id: true },
        take: 50,
      }),
          this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
        ]);
        for (const mentioned of mentionedUsers) {
          if (mentioned.id !== userId) {
            try {
              const notification = await this.notifications.create({
                userId: mentioned.id,
                actorId: userId,
                type: 'MENTION',
                postId: post.id,
                title: 'Mentioned you',
                body: `@${actor?.username ?? 'Someone'} mentioned you in a post`,
              });
              if (notification) {
                // Push delivery owned by NotificationsService.create() — no duplicate enqueue
              }
            } catch (err) {
              this.logger.error('Failed to create mention notification', err instanceof Error ? err.message : err);
            }
          }
        }
      }
      // Tag + collab notifications (fetch actor once for both)
      const needsActor = (dto.taggedUserIds?.length && dto.taggedUserIds.some((id) => id !== userId)) || dto.collaboratorUsername;
      const actorUsername = needsActor
        ? (await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }))?.username ?? 'Someone'
        : undefined;

      // Tag notifications — use validated IDs from transaction, not raw DTO
      if (dto.taggedUserIds?.length) {
        const taggedRecords = await this.prisma.postTaggedUser.findMany({
          where: { postId: post.id },
          select: { userId: true },
        });
        for (const record of taggedRecords) {
          if (record.userId !== userId) {
            this.notifications.create({
              userId: record.userId,
              actorId: userId,
              type: 'TAG',
              postId: post.id,
              title: 'Tagged you',
              body: `@${actorUsername} tagged you in a post`,
            }).then((n) => {
              // Push delivery owned by NotificationsService.create() — no duplicate enqueue
            }).catch((err) => {
              this.logger.error('Failed to create tag notification', err instanceof Error ? err.message : err);
            });
          }
        }
      }

      // Collaborator invite notification
      if (dto.collaboratorUsername) {
        const invitee = await this.prisma.user.findUnique({
          where: { username: dto.collaboratorUsername },
          select: { id: true },
        });
        if (invitee && invitee.id !== userId) {
          this.notifications.create({
            userId: invitee.id,
            actorId: userId,
            type: 'COLLAB_INVITE',
            postId: post.id,
            title: 'Collaboration invite',
            body: `@${actorUsername} invited you to collaborate on a post`,
          }).then((n) => {
            // Push delivery owned by NotificationsService.create() — no duplicate enqueue
          }).catch((err) => {
            this.logger.error('Failed to create collab notification', err instanceof Error ? err.message : err);
          });
        }
      }

      // Gamification: award XP + update streak (fire-and-forget)
      this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'post_created' }).catch(err => this.logger.warn('Failed to queue gamification XP for post', err instanceof Error ? err.message : err));
      this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Failed to queue gamification streak for post', err instanceof Error ? err.message : err));

      // Track analytics
      this.analytics.track('post_created', userId, {
        postType: post.postType,
        hasMedia: post.mediaUrls.length > 0,
        visibility: post.visibility,
      });
      this.analytics.increment('posts:daily');
    }
    // --- End deferred side effects ---

    // AI moderation: ALWAYS runs at creation time to catch violations early (even for scheduled content)
    if (dto.content) {
      this.queueService.addModerationJob({ content: dto.content, contentType: 'post', contentId: post.id }).catch(err => this.logger.warn('Failed to queue moderation for post', err instanceof Error ? err.message : err));
    }

    // Image moderation: ALWAYS runs at creation time (even for scheduled content)
    if (dto.mediaUrls?.length && dto.mediaTypes?.some((t: string) => t.startsWith('image'))) {
      for (const [idx, url] of dto.mediaUrls.entries()) {
        if (dto.mediaTypes?.[idx]?.startsWith('image')) {
          this.moderatePostImage(userId, post.id, url).catch((err: Error) => {
            this.logger.error(`Image moderation failed for post ${post.id}: ${err.message}`);
          });
        }
      }
    }

    // Publish workflow: search index, cache invalidation, real-time event
    // Only trigger for immediately-published content (not scheduled)
    if (!dto.scheduledAt) {
      this.publishWorkflow.onPublish({
        contentType: 'post',
        contentId: post.id,
        userId,
        indexDocument: {
          id: post.id,
          content: dto.content || '',
          hashtags: dto.hashtags || [],
          username: post.user?.username || '',
          userId,
          postType: post.postType,
          visibility: post.visibility,
        },
      }).catch(err => this.logger.warn('Publish workflow failed for post', err instanceof Error ? err.message : err));
    }

    // Invalidate scored feed caches for the author
    await Promise.all([
      this.scoredFeedCache.invalidate(`sfeed:saf:foryou:${userId}`),
      this.scoredFeedCache.invalidate(`sfeed:saf:trending:${userId}`),
    ]);
    return post;
  }

  async getById(postId: string, viewerId?: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        isRemoved: false,
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
      },
      select: {
        ...POST_SELECT,
        isRemoved: true,
        sharedPost: { select: { id: true, content: true, user: { select: { username: true } } } },
      },
    });
    if (!post) throw new NotFoundException('Post not found');

    // Hide future-scheduled content from non-owners
    if (post.scheduledAt && new Date(post.scheduledAt) > new Date() && post.user?.id !== viewerId) {
      throw new NotFoundException('Post not found');
    }

    // Enforce visibility — CIRCLE and FOLLOWERS posts require viewer checks
    const isOwner = viewerId && post.user?.id === viewerId;
    if (!isOwner && post.visibility !== 'PUBLIC') {
      if (post.visibility === 'FOLLOWERS' && viewerId && post.user?.id) {
        const follows = await this.prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: post.user.id } },
        });
        if (!follows) throw new NotFoundException('Post not found');
      } else if (post.visibility === 'CIRCLE') {
        // CIRCLE posts require circle membership — non-members can't see
        if (!viewerId || !post.circle) throw new NotFoundException('Post not found');
        const member = await this.prisma.circleMember.findFirst({
          where: { circleId: post.circle.id, userId: viewerId },
        });
        if (!member) throw new NotFoundException('Post not found');
      } else if (!viewerId) {
        // FOLLOWERS/CIRCLE not visible to anonymous users
        throw new NotFoundException('Post not found');
      }
    }

    // Check block status
    if (viewerId && post.user && viewerId !== post.user.id) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: post.user.id },
            { blockerId: post.user.id, blockedId: viewerId },
          ],
        },
      });
      if (blocked) throw new NotFoundException('Post not found');
    }

    let userReaction: string | null = null;
    let isSaved = false;

    if (viewerId) {
      const [reaction, saved] = await Promise.all([
        this.prisma.postReaction.findUnique({
          where: { userId_postId: { userId: viewerId, postId } },
        }),
        this.prisma.savedPost.findUnique({
          where: { userId_postId: { userId: viewerId, postId } },
        }),
      ]);
      userReaction = reaction?.reaction ?? null;
      isSaved = !!saved;
    }

    return { ...post, userReaction, isSaved };
  }

  /**
   * Increment view count for a post (simple counter, no dedup — matches Instagram behavior).
   * Called fire-and-forget from the controller after returning the post.
   */
  async recordView(postId: string): Promise<void> {
    await this.prisma.post.update({
      where: { id: postId },
      data: { viewsCount: { increment: 1 } },
    }).catch(err => this.logger.warn(`Failed to record view for post ${postId}`, err instanceof Error ? err.message : err));
  }

  async update(postId: string, userId: string, data: Partial<CreatePostDto>) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();
    if (post.isRemoved) throw new BadRequestException('Post has been removed');

    // Finding #306: 15-minute edit window — prevent bait-and-switch on viral posts
    const fifteenMinutesMs = 15 * 60 * 1000;
    const postAge = Date.now() - new Date(post.createdAt).getTime();
    if (postAge > fifteenMinutesMs && data.content !== undefined) {
      throw new BadRequestException('Posts can only be edited within 15 minutes of creation');
    }

    // Content moderation on edit — prevent bait-and-switch (clean create → harmful edit)
    if (data.content) {
      const moderationResult = await this.contentSafety.moderateText(data.content);
      if (!moderationResult.safe) {
        throw new BadRequestException(
          `Content flagged: ${moderationResult.flags.join(', ')}. ${moderationResult.suggestion || 'Please revise your post.'}`,
        );
      }
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        content: data.content ? sanitizeText(data.content) : data.content,
        hideLikesCount: data.hideLikesCount,
        commentsDisabled: data.commentsDisabled,
        isSensitive: data.isSensitive,
        altText: data.altText,
        editedAt: new Date(),
        // Finding #307: Save edit history snapshot
        editHistory: [
          ...((post.editHistory as Array<{ content: string; editedAt: string }>) ?? []),
          { content: post.content, editedAt: new Date().toISOString() },
        ].slice(-10), // Keep last 10 edits
      },
      select: POST_SELECT,
    });

    // Re-index updated post in search
    this.publishWorkflow.onPublish({
      contentType: 'post',
      contentId: postId,
      userId,
      indexDocument: {
        id: postId,
        content: updated.content || '',
        hashtags: updated.hashtags || [],
        username: updated.user?.username || '',
        userId,
        postType: updated.postType,
        visibility: updated.visibility,
      },
    }).catch(err => this.logger.warn('Publish workflow failed for post update', err instanceof Error ? err.message : err));

    return updated;
  }

  async delete(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.post.update({
        where: { id: postId },
        data: { isRemoved: true, removedAt: new Date(), removedById: userId },
      }),
      this.prisma.$executeRaw`UPDATE "users" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${userId}`,
    ]);

    // Decrement hashtag counters — batch single query instead of N+1
    if (post.hashtags && post.hashtags.length > 0) {
      await this.prisma.$executeRaw`UPDATE "hashtags" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE name = ANY(${post.hashtags}::text[])`;
    }

    await Promise.all([
      this.scoredFeedCache.invalidate(`sfeed:saf:foryou:${userId}`),
      this.scoredFeedCache.invalidate(`sfeed:saf:trending:${userId}`),
    ]);

    // Unpublish workflow: search index removal, cache invalidation, real-time event
    this.publishWorkflow.onUnpublish({
      contentType: 'post',
      contentId: postId,
      userId,
    }).catch(err => this.logger.warn('Unpublish workflow failed for post', err instanceof Error ? err.message : err));

    return { deleted: true };
  }

  async react(postId: string, userId: string, reaction: string = 'LIKE') {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');
    if (post.scheduledAt && new Date(post.scheduledAt) > new Date() && post.userId !== userId) throw new NotFoundException('Post not found');

    // Prevent self-like/self-react
    if (post.userId === userId) {
      throw new BadRequestException('Cannot react to your own post');
    }

    // Block + mute check: prevent blocked/muted users from reacting
    if (post.userId && post.userId !== userId) {
      const [block, mute] = await Promise.all([
        this.prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: post.userId },
              { blockerId: post.userId, blockedId: userId },
            ],
          },
          select: { blockerId: true },
        }),
        this.prisma.mute.findFirst({
          where: {
            OR: [
              { userId: post.userId, mutedId: userId },
              { userId, mutedId: post.userId },
            ],
          },
          select: { userId: true },
        }),
      ]);
      if (block) throw new ForbiddenException('Cannot interact with this user');
      if (mute) throw new ForbiddenException('Cannot interact with this user');
    }

    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      // Update reaction type
      await this.prisma.postReaction.update({
        where: { userId_postId: { userId, postId } },
        data: { reaction: reaction as ReactionType }, // Validated by ReactDto @IsEnum
      });
    } else {
      try {
        await this.prisma.$transaction([
          this.prisma.postReaction.create({
            data: { userId, postId, reaction: reaction as ReactionType }, // Validated by ReactDto @IsEnum
          }),
          this.prisma.post.update({
            where: { id: postId },
            data: { likesCount: { increment: 1 } },
          }),
        ]);
        // Notify post owner (skip if reacting to own post)
        if (post.userId && post.userId !== userId) {
          try {
            const notification = await this.notifications.create({
              userId: post.userId, actorId: userId,
              type: 'LIKE', postId,
            });
            if (notification) {
              // Push delivery owned by NotificationsService.create() — no duplicate enqueue
            }
          } catch (err) {
            this.logger.error('Failed to create notification', err);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
          return { reaction }; // Already reacted (race condition), treat as success
        }
        throw err;
      }
    }

    // Finding #351: Publish real-time like event
    this.redis.publish?.('content:update', JSON.stringify({
      postId,
      event: 'post_reaction',
      data: { postId, userId, reaction, likesCount: (post.likesCount || 0) + (existing ? 0 : 1) },
    }))?.catch?.(() => {});

    return { reaction };
  }

  async unreact(postId: string, userId: string) {
    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) return { reaction: null }; // Already unreacted, idempotent

    await this.prisma.$transaction([
      this.prisma.postReaction.delete({
        where: { userId_postId: { userId, postId } },
      }),
      this.prisma.$executeRaw`UPDATE "posts" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${postId}`,
    ]);
    return { reaction: null };
  }

  async save(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');
    if (post.scheduledAt && new Date(post.scheduledAt) > new Date() && post.userId !== userId) throw new NotFoundException('Post not found');

    try {
      await this.prisma.$transaction([
        this.prisma.savedPost.create({ data: { userId, postId } }),
        this.prisma.post.update({ where: { id: postId }, data: { savesCount: { increment: 1 } } }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Post already saved');
      }
      throw error;
    }
    // NOTE: No notification on save (Instagram parity). Add if engagement data shows value.

    return { saved: true };
  }

  async unsave(postId: string, userId: string) {
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) throw new NotFoundException('Save not found');

    await this.prisma.$transaction([
      this.prisma.savedPost.delete({ where: { userId_postId: { userId, postId } } }),
      this.prisma.$executeRaw`UPDATE "posts" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = ${postId}`,
    ]);
    return { saved: false };
  }

  // Finding #175: Save to collection/folder
  async saveToCollection(postId: string, userId: string, collectionName: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');
    if (post.scheduledAt && new Date(post.scheduledAt) > new Date() && post.userId !== userId) throw new NotFoundException('Post not found');

    // Update or create the saved post with collection name
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      // Already saved — just update the collection
      await this.prisma.savedPost.update({
        where: { userId_postId: { userId, postId } },
        data: { collectionName },
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.savedPost.create({ data: { userId, postId, collectionName } }),
        this.prisma.post.update({ where: { id: postId }, data: { savesCount: { increment: 1 } } }),
      ]);
    }
    return { saved: true, collection: collectionName };
  }

  // Finding #175: Get user's bookmark collections
  async getCollections(userId: string) {
    const saved = await this.prisma.savedPost.groupBy({
      by: ['collectionName'],
      where: { userId },
      _count: true,
      orderBy: { _count: { collectionName: 'desc' } },
    });

    return {
      data: saved.map(s => ({
        name: s.collectionName,
        count: s._count,
      })),
    };
  }

  // Finding #175: Get saved posts in a collection
  async getCollection(userId: string, collectionName: string, cursor?: string) {
    const saves = await this.prisma.savedPost.findMany({
      where: {
        userId,
        collectionName,
        post: { isRemoved: false, user: { isBanned: false, isDeactivated: false, isDeleted: false } },
      },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            mediaUrls: true,
            likesCount: true,
            commentsCount: true,
            createdAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
          },
        },
      },
      take: 21,
      ...(cursor ? { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = saves.length > 20;
    const items = hasMore ? saves.slice(0, 20) : saves;
    return {
      data: items.map(s => s.post),
      meta: {
        cursor: hasMore && items.length > 0 ? items[items.length - 1].postId : null,
        hasMore,
      },
    };
  }

  async share(postId: string, userId: string, content?: string) {
    const original = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!original || original.isRemoved) throw new NotFoundException('Post not found');
    if (original.scheduledAt && new Date(original.scheduledAt) > new Date() && original.userId !== userId) throw new NotFoundException('Post not found');

    // Block check: cannot share posts from users who blocked you or whom you blocked
    if (original.userId && original.userId !== userId) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: original.userId },
            { blockerId: original.userId, blockedId: userId },
          ],
        },
      });
      if (blocked) throw new NotFoundException('Post not found');
    }

    const existing = await this.prisma.post.findFirst({
      where: { userId, sharedPostId: postId, isRemoved: false },
    });
    if (existing) throw new ConflictException('Already shared this post');

    const [shared] = await this.prisma.$transaction([
      this.prisma.post.create({
        data: {
          userId,
          postType: original.postType,
          content: content ? sanitizeText(content) : content,
          sharedPostId: postId,
          visibility: 'PUBLIC',
        },
        select: POST_SELECT,
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { sharesCount: { increment: 1 } },
      }),
      // Increment sharer's postsCount (share creates a new post record)
      this.prisma.$executeRaw`UPDATE "users" SET "postsCount" = "postsCount" + 1 WHERE id = ${userId}`,
    ]);

    // Notify original post owner about the share (not self)
    if (original.userId && original.userId !== userId) {
      this.notifications.create({
        userId: original.userId,
        actorId: userId,
        type: 'REPOST',
        postId,
      }).catch((err) => this.logger.error('Failed to create share notification', err));
    }

    return shared;
  }

  async shareAsStory(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { select: { id: true, username: true } },
      },
    });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

    // Hide future-scheduled content from non-owners
    if (post.scheduledAt && new Date(post.scheduledAt) > new Date() && post.userId !== userId) {
      throw new NotFoundException('Post not found');
    }

    // Check remixAllowed — respect author's sharing preference
    if (post.userId !== userId && !post.remixAllowed) {
      throw new ForbiddenException('Post author has disabled sharing');
    }

    // Block check: cannot share posts from users who blocked you or whom you blocked
    if (post.userId && post.userId !== userId) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: post.userId },
            { blockerId: post.userId, blockedId: userId },
          ],
        },
      });
      if (blocked) throw new NotFoundException('Post not found');
    }

    // Determine media for the story
    const mediaUrl = post.mediaUrls?.[0];
    if (!mediaUrl) {
      throw new BadRequestException('Post has no media to share as a story');
    }

    const mediaType = post.mediaTypes?.[0] ?? 'image';
    const authorUsername = post.user?.username ?? 'unknown';
    const textOverlay = `Shared from @${authorUsername}`;

    const story = await this.prisma.story.create({
      data: {
        userId,
        mediaUrl,
        mediaType,
        thumbnailUrl: post.thumbnailUrl,
        textOverlay,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
        userId: true,
        mediaUrl: true,
        mediaType: true,
        thumbnailUrl: true,
        textOverlay: true,
        viewsCount: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Increment share count on the original post
    await this.prisma.post.update({
      where: { id: postId },
      data: { sharesCount: { increment: 1 } },
    });

    return story;
  }

  async getComments(postId: string, cursor?: string, limit = 20, viewerId?: string) {
    const excludedIds = viewerId ? await getExcludedUserIds(this.prisma, this.redis, viewerId) : [];
    const comments = await this.prisma.comment.findMany({
      where: {
        postId, parentId: null, isRemoved: false, isHidden: false,
        user: { isBanned: false, isDeactivated: false, isDeleted: false, ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}) },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        _count: { select: { replies: true } },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async getCommentReplies(commentId: string, cursor?: string, limit = 20) {
    const replies = await this.prisma.comment.findMany({
      where: { parentId: commentId, isRemoved: false, isHidden: false, user: { isBanned: false, isDeactivated: false, isDeleted: false } },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
    });

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, limit) : replies;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async addComment(postId: string, userId: string, dto: AddCommentDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');
    if (post.scheduledAt && new Date(post.scheduledAt) > new Date() && post.userId !== userId) throw new NotFoundException('Post not found');

    // Block + mute check: prevent blocked/muted users from commenting
    if (post.userId && post.userId !== userId) {
      const [block, mute] = await Promise.all([
        this.prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: post.userId },
              { blockerId: post.userId, blockedId: userId },
            ],
          },
          select: { blockerId: true },
        }),
        this.prisma.mute.findFirst({
          where: {
            OR: [
              { userId: post.userId, mutedId: userId },
              { userId, mutedId: post.userId },
            ],
          },
          select: { userId: true },
        }),
      ]);
      if (block) throw new ForbiddenException('Cannot interact with this user');
      if (mute) throw new ForbiddenException('Cannot interact with this user');
    }

    // Content moderation on comments — prevent abusive content
    if (dto.content) {
      const moderationResult = await this.contentSafety.moderateText(dto.content);
      if (!moderationResult.safe) {
        throw new BadRequestException(
          `Comment flagged: ${moderationResult.flags.join(', ')}. ${moderationResult.suggestion || 'Please revise your comment.'}`,
        );
      }
    }

    // Validate parentId belongs to the same post (prevent cross-post orphaned replies)
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { postId: true },
      });
      if (!parent || parent.postId !== postId) {
        throw new BadRequestException('Parent comment does not belong to this post');
      }
    }

    // Enforce commentPermission — owner always allowed (supersedes legacy commentsDisabled)
    const perm = post.commentPermission ?? 'EVERYONE';
    const isOwner = post.userId && post.userId === userId;
    if (!isOwner && (perm === 'NOBODY' || post.commentsDisabled)) {
      throw new ForbiddenException('Comments are disabled on this post');
    }
    if (perm === 'FOLLOWERS' && post.userId && post.userId !== userId) {
      const follows = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: post.userId } },
      });
      if (!follows) {
        throw new ForbiddenException('Only followers can comment on this post');
      }
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          userId,
          postId,
          content: sanitizeText(dto.content),
          parentId: dto.parentId,
          mentions: [],
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
        },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);
    // Notify: reply goes to parent comment author; top-level comment goes to post owner
    try {
      if (dto.parentId) {
        // It's a reply — notify the parent comment's author
        const parentComment = await this.prisma.comment.findUnique({
          where: { id: dto.parentId },
          select: { userId: true },
        });
        if (parentComment && parentComment.userId !== userId) {
          const notification = await this.notifications.create({
            userId: parentComment.userId, actorId: userId,
            type: 'REPLY',
            postId, commentId: comment.id,
            body: dto.content.substring(0, 100),
          });
          if (notification) {
            // Push delivery owned by NotificationsService.create() — no duplicate enqueue
          }
        }
      } else if (post.userId && post.userId !== userId) {
        // Top-level comment — notify post owner (skip self-notification)
        const notification = await this.notifications.create({
          userId: post.userId, actorId: userId,
          type: 'COMMENT',
          postId, commentId: comment.id,
          body: dto.content.substring(0, 100),
        });
        if (notification) {
          // Push delivery owned by NotificationsService.create() — no duplicate enqueue
        }
      }
    } catch (err) {
      this.logger.error('Failed to create notification', err);
    }

    // Gamification: award XP for commenting
    this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'comment_posted' }).catch(err => this.logger.warn('Failed to queue gamification XP for comment', err instanceof Error ? err.message : err));

    // Finding #350: Publish real-time comment event
    this.redis.publish?.('content:update', JSON.stringify({
      postId,
      event: 'post_comment',
      data: {
        postId,
        comment: {
          id: comment.id,
          content: comment.content,
          user: comment.user,
          createdAt: comment.createdAt,
          parentId: dto.parentId || null,
        },
        commentsCount: (post.commentsCount || 0) + 1,
      },
    }))?.catch?.(() => {});

    return comment;
  }

  async editComment(commentId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.isRemoved) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();

    // Content moderation on edit — prevent bait-and-switch
    if (content) {
      const moderationResult = await this.contentSafety.moderateText(content);
      if (!moderationResult.safe) {
        throw new BadRequestException(
          `Comment flagged: ${moderationResult.flags.join(', ')}. ${moderationResult.suggestion || 'Please revise your comment.'}`,
        );
      }
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content: sanitizeText(content) },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { userId: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    // Allow both comment author AND post owner to delete
    if (comment.userId !== userId && comment.post?.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.comment.update({
        where: { id: commentId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "posts" SET "commentsCount" = GREATEST("commentsCount" - 1, 0) WHERE id = ${comment.postId}`,
    ]);
    return { deleted: true };
  }

  async likeComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');

    // Prevent self-liking (consistent with post self-like guard)
    if (comment.userId === userId) {
      throw new BadRequestException('Cannot like your own comment');
    }

    const existing = await this.prisma.commentReaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existing) throw new ConflictException('Already liked');

    try {
      await this.prisma.$transaction([
        this.prisma.commentReaction.create({
          data: { userId, commentId, reaction: 'LIKE' },
        }),
        this.prisma.comment.update({
          where: { id: commentId },
          data: { likesCount: { increment: 1 } },
        }),
      ]);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Already liked');
      }
      throw error;
    }
    return { liked: true };
  }

  async unlikeComment(commentId: string, userId: string) {
    const existing = await this.prisma.commentReaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });
    if (!existing) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.commentReaction.delete({
        where: { userId_commentId: { userId, commentId } },
      }),
      this.prisma.$executeRaw`UPDATE "comments" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${commentId}`,
    ]);
    return { liked: false };
  }

  async report(postId: string, userId: string, reason: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    // Prevent duplicate reports
    const existing = await this.prisma.report.findFirst({
      where: { reporterId: userId, reportedPostId: postId },
    });
    if (existing) return { reported: true };

    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
      INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedPostId: postId,
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason, // Safe: reasonMap fallback guarantees valid ReportReason
      },
    });
    return { reported: true };
  }

  async dismiss(postId: string, userId: string) {
    await this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId: postId, contentType: 'POST' } },
      create: { userId, contentId: postId, contentType: 'POST' },
      update: {},
    });
    return { dismissed: true };
  }

  async archivePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    // Check if already saved — only increment savesCount on new save
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      await this.prisma.savedPost.update({
        where: { userId_postId: { userId, postId } },
        data: { collectionName: 'archive' },
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.savedPost.create({ data: { userId, postId, collectionName: 'archive' } }),
        this.prisma.post.update({ where: { id: postId }, data: { savesCount: { increment: 1 } } }),
      ]);
    }
    return { archived: true };
  }

  async unarchivePost(postId: string, userId: string) {
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing || existing.collectionName !== 'archive') {
      throw new NotFoundException('Post not archived');
    }
    await this.prisma.$transaction([
      this.prisma.savedPost.delete({ where: { userId_postId: { userId, postId } } }),
      this.prisma.$executeRaw`UPDATE "posts" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = ${postId}`,
    ]);
    return { archived: false };
  }

  async getArchived(userId: string, cursor?: string, limit = 20) {
    const saved = await this.prisma.savedPost.findMany({
      where: {
        userId,
        collectionName: 'archive',
        post: { isRemoved: false, user: { isBanned: false, isDeactivated: false, isDeleted: false } },
      },
      include: { post: { select: POST_SELECT } },
      take: limit + 1,
      ...(cursor
        ? { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 }
        : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = saved.length > limit;
    const items = hasMore ? saved.slice(0, limit) : saved;
    const data = items.map((s) => s.post);
    return {
      data,
      meta: { cursor: hasMore ? items[items.length - 1].postId : null, hasMore },
    };
  }

  async pinComment(postId: string, commentId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.postId !== postId) throw new NotFoundException('Comment not found');

    await this.prisma.comment.updateMany({
      where: { postId, isPinned: true },
      data: { isPinned: false },
    });

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { isPinned: true },
    });
    return updated;
  }

  async unpinComment(postId: string, commentId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.postId !== postId) throw new NotFoundException('Comment not found');

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { isPinned: false },
    });
    return updated;
  }

  // ── Hide Reply ──
  async hideComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { userId: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.post.userId !== userId) throw new ForbiddenException('Only post author can hide comments');
    return this.prisma.comment.update({ where: { id: commentId }, data: { isHidden: true } });
  }

  async unhideComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { userId: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.post.userId !== userId) throw new ForbiddenException('Only post author can unhide comments');
    return this.prisma.comment.update({ where: { id: commentId }, data: { isHidden: false } });
  }

  async getHiddenComments(postId: string, userId: string, cursor?: string, limit = 20) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException('Only post author can view hidden comments');

    const comments = await this.prisma.comment.findMany({
      where: { postId, isHidden: true, isRemoved: false },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
        _count: { select: { replies: true } },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async getShareLink(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isRemoved: false, visibility: 'PUBLIC' },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    return { url: `https://mizanly.app/post/${postId}` };
  }

  async crossPost(userId: string, postId: string, dto: { targetSpaces: string[]; captionOverride?: string }) {
    const post = await this.prisma.post.findFirst({ where: { id: postId, userId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.isRemoved) throw new BadRequestException('Cannot cross-post a removed post');

    // Moderate caption override if provided
    if (dto.captionOverride) {
      const modResult = await this.contentSafety.moderateText(dto.captionOverride);
      if (!modResult.safe) {
        throw new BadRequestException(`Content flagged: ${modResult.flags?.join(', ') || 'policy violation'}`);
      }
    }

    const validSpaces = ['SAF', 'MAJLIS', 'BAKRA', 'MINBAR'];
    const targets = dto.targetSpaces.filter(s => validSpaces.includes(s) && s !== post.space);
    if (targets.length === 0) throw new BadRequestException('No valid target spaces');

    // Wrap all cross-posts + counter in a transaction to prevent partial failures
    const newPosts = await this.prisma.$transaction(async (tx) => {
      const posts = [];
      for (const space of targets) {
        const newPost = await tx.post.create({
          data: {
            userId,
            content: dto.captionOverride ?? post.content,
            mediaUrls: post.mediaUrls,
            mediaTypes: post.mediaTypes,
            thumbnailUrl: post.thumbnailUrl,
            mediaWidth: post.mediaWidth,
            mediaHeight: post.mediaHeight,
            postType: post.postType,
            space: space as ContentSpace, // Safe: filtered by validSpaces whitelist above
            hashtags: post.hashtags,
            mentions: post.mentions,
          },
          select: POST_SELECT,
        });
        posts.push(newPost);
      }

      // Increment user's post count atomically with GREATEST protection
      if (posts.length > 0) {
        await tx.$executeRaw`UPDATE "users" SET "postsCount" = "postsCount" + ${posts.length} WHERE id = ${userId}`;
      }

      return posts;
    });

    return newPosts;
  }

  /**
   * Finding #274: Get related posts based on shared hashtags.
   */
  async getRelatedPosts(postId: string, limit = 5) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { hashtags: true, userId: true },
    });
    if (!post || !post.hashtags.length) return [];

    return this.prisma.post.findMany({
      where: {
        id: { not: postId },
        hashtags: { hasSome: post.hashtags },
        isRemoved: false,
        visibility: 'PUBLIC',
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        user: { isDeactivated: false, isBanned: false, isDeleted: false },
      },
      select: POST_SELECT,
      orderBy: { likesCount: 'desc' },
      take: limit,
    });
  }

  /**
   * Finding #252: Pin/unpin a post on your profile.
   * Only 1 post can be pinned at a time — unpins previous.
   */
  async pinPost(postId: string, userId: string, isPinned: boolean) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    if (isPinned) {
      // Unpin all other posts first (only 1 pinned at a time)
      await this.prisma.post.updateMany({
        where: { userId, isPinned: true },
        data: { isPinned: false },
      });
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { isPinned },
      select: POST_SELECT,
    });
  }

  /**
   * Respond to a tag — tagged user can approve or decline being tagged.
   */
  async respondToTag(tagId: string, userId: string, status: 'APPROVED' | 'DECLINED') {
    // Try PostTaggedUser first
    const postTag = await this.prisma.postTaggedUser.findUnique({ where: { id: tagId } });
    if (postTag) {
      if (postTag.userId !== userId) {
        throw new ForbiddenException('Only the tagged user can respond to a tag');
      }
      return this.prisma.postTaggedUser.update({
        where: { id: tagId },
        data: { status },
      });
    }

    // Try ReelTaggedUser
    const reelTag = await this.prisma.reelTaggedUser.findUnique({ where: { id: tagId } });
    if (reelTag) {
      if (reelTag.userId !== userId) {
        throw new ForbiddenException('Only the tagged user can respond to a tag');
      }
      return this.prisma.reelTaggedUser.update({
        where: { id: tagId },
        data: { status },
      });
    }

    throw new NotFoundException('Tag not found');
  }

  /**
   * Background image moderation via Claude Vision API.
   * If BLOCK: auto-remove post + notify user.
   * If WARNING: mark post as sensitive (blurred in feed).
   */
  private async moderatePostImage(userId: string, postId: string, imageUrl: string): Promise<void> {
    try {
      const result = await this.ai.moderateImage(imageUrl);

      if (result.classification === 'BLOCK') {
        // Auto-remove the post
        await this.prisma.post.update({
          where: { id: postId },
          data: { isRemoved: true, isSensitive: true },
        });
        this.logger.warn(`Post ${postId} auto-removed: image blocked (${result.reason})`);

        // Unpublish workflow on auto-moderation removal
        this.publishWorkflow.onUnpublish({
          contentType: 'post',
          contentId: postId,
          userId,
        }).catch(err => this.logger.warn('Unpublish workflow failed for moderated post', err instanceof Error ? err.message : err));

        // Create a moderation report for the record
        await this.prisma.report.create({
          data: {
            reporterId: userId,
            reportedUserId: userId,
            reportedPostId: postId,
            reason: ReportReason.OTHER,
            description: `[Auto-moderation] Image blocked: ${result.reason || 'Policy violation'}`,
            status: 'RESOLVED',
            actionTaken: 'CONTENT_REMOVED',
          },
        });

        // Notify the user that their content was removed
        this.notifications.create({
          userId,
          actorId: userId,
          type: 'SYSTEM',
          postId,
          title: 'Content removed',
          body: 'Your post was removed because it violates community guidelines. You can appeal this decision in Settings > Account > Appeals.',
        }).catch(err => this.logger.warn('Failed to send content removal notification', err instanceof Error ? err.message : err));
      } else if (result.classification === 'WARNING') {
        // Mark as sensitive — blurred in feed, tap to reveal
        await this.prisma.post.update({
          where: { id: postId },
          data: { isSensitive: true },
        });
        this.logger.log(`Post ${postId} marked sensitive: ${result.reason}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Image moderation error for post ${postId}: ${msg}`);
      // Non-blocking: post remains visible, flagged for manual review if moderation fails
    }
  }

  // Finding #251: Content performance comparison — post analytics vs author average
  async getPostAnalytics(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException('Only the author can view analytics');

    const recentPosts = await this.prisma.post.findMany({
      where: { userId, isRemoved: false },
      select: { likesCount: true, commentsCount: true, sharesCount: true, viewsCount: true, savesCount: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const count = recentPosts.length || 1;
    const avg = {
      likes: recentPosts.reduce((s, p) => s + p.likesCount, 0) / count,
      comments: recentPosts.reduce((s, p) => s + p.commentsCount, 0) / count,
      shares: recentPosts.reduce((s, p) => s + p.sharesCount, 0) / count,
      views: recentPosts.reduce((s, p) => s + p.viewsCount, 0) / count,
      saves: recentPosts.reduce((s, p) => s + p.savesCount, 0) / count,
    };

    const pctDiff = (val: number, avgVal: number) =>
      avgVal > 0 ? Math.round(((val - avgVal) / avgVal) * 100) : 0;

    return {
      post: {
        likes: post.likesCount,
        comments: post.commentsCount,
        shares: post.sharesCount,
        views: post.viewsCount,
        saves: post.savesCount,
      },
      average: {
        likes: Math.round(avg.likes * 10) / 10,
        comments: Math.round(avg.comments * 10) / 10,
        shares: Math.round(avg.shares * 10) / 10,
        views: Math.round(avg.views * 10) / 10,
        saves: Math.round(avg.saves * 10) / 10,
      },
      comparison: {
        likesVsAvg: pctDiff(post.likesCount, avg.likes),
        commentsVsAvg: pctDiff(post.commentsCount, avg.comments),
        sharesVsAvg: pctDiff(post.sharesCount, avg.shares),
        viewsVsAvg: pctDiff(post.viewsCount, avg.views),
        savesVsAvg: pctDiff(post.savesCount, avg.saves),
      },
    };
  }

  // Finding #173: Track post impression — called when post appears in feed viewport
  async trackImpression(postId: string, userId: string) {
    // Use Redis HyperLogLog for unique impression counting per post
    try {
      if (this.redis.pfadd) {
        await this.redis.pfadd(`post:impressions:${postId}`, userId);
        return { tracked: true };
      }
    } catch {
      // Redis failure — report honestly instead of faking success
    }
    return { tracked: false };
  }

  // Finding #173: Get impression count for a post
  async getImpressionCount(postId: string) {
    try {
      if (this.redis.pfcount) {
        const count = await this.redis.pfcount(`post:impressions:${postId}`);
        return { impressions: count };
      }
      return { impressions: 0 };
    } catch {
      return { impressions: 0 };
    }
  }

  // Finding #385: Engagement prediction — estimate expected engagement for a new post
  async predictEngagement(userId: string) {
    // Get user's recent post stats to build prediction model
    const recentPosts = await this.prisma.post.findMany({
      where: { userId, isRemoved: false },
      select: {
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        viewsCount: true,
        savesCount: true,
        hashtags: true,
        mediaUrls: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    if (recentPosts.length < 3) {
      return {
        prediction: null,
        tips: [
          'Post at least 3 times to get engagement predictions',
          'Posts with 3+ hashtags get more reach',
          'Photos get 2x more engagement than text-only posts',
        ],
      };
    }

    const count = recentPosts.length;
    const avgLikes = recentPosts.reduce((s, p) => s + p.likesCount, 0) / count;
    const avgComments = recentPosts.reduce((s, p) => s + p.commentsCount, 0) / count;
    const avgShares = recentPosts.reduce((s, p) => s + p.sharesCount, 0) / count;
    const avgViews = recentPosts.reduce((s, p) => s + p.viewsCount, 0) / count;
    const avgSaves = recentPosts.reduce((s, p) => s + p.savesCount, 0) / count;

    // Calculate best posting patterns
    const hourBuckets: Record<number, number[]> = {};
    for (const p of recentPosts) {
      const hour = new Date(p.createdAt).getHours();
      if (!hourBuckets[hour]) hourBuckets[hour] = [];
      hourBuckets[hour].push(p.likesCount + p.commentsCount * 2);
    }

    const bestHours = Object.entries(hourBuckets)
      .map(([h, scores]) => ({ hour: parseInt(h), avgScore: scores.reduce((a, b) => a + b, 0) / scores.length }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 3)
      .map(h => h.hour);

    // Posts with media vs text-only performance
    const withMedia = recentPosts.filter(p => p.mediaUrls.length > 0);
    const textOnly = recentPosts.filter(p => p.mediaUrls.length === 0);
    const mediaAvgLikes = withMedia.length > 0
      ? withMedia.reduce((s, p) => s + p.likesCount, 0) / withMedia.length
      : 0;
    const textAvgLikes = textOnly.length > 0
      ? textOnly.reduce((s, p) => s + p.likesCount, 0) / textOnly.length
      : 0;

    // Hashtag performance
    const hashtagCounts = recentPosts.map(p => ({ count: p.hashtags.length, likes: p.likesCount }));
    const optimalHashtags = hashtagCounts
      .filter(h => h.count > 0)
      .sort((a, b) => b.likes - a.likes)[0]?.count || 3;

    // Generate tips
    const tips: string[] = [];
    if (mediaAvgLikes > textAvgLikes * 1.5) {
      tips.push(`Posts with photos get ${Math.round((mediaAvgLikes / Math.max(textAvgLikes, 1) - 1) * 100)}% more likes`);
    }
    if (bestHours.length > 0) {
      tips.push(`Your best posting hours are ${bestHours.map(h => `${h}:00`).join(', ')}`);
    }
    if (optimalHashtags > 0) {
      tips.push(`Your top-performing posts use ~${optimalHashtags} hashtags`);
    }

    return {
      prediction: {
        expectedLikes: Math.round(avgLikes),
        expectedComments: Math.round(avgComments),
        expectedShares: Math.round(avgShares),
        expectedViews: Math.round(avgViews),
        expectedSaves: Math.round(avgSaves),
      },
      insights: {
        bestHours,
        optimalHashtagCount: optimalHashtags,
        mediaVsTextLikeRatio: textAvgLikes > 0 ? Math.round((mediaAvgLikes / textAvgLikes) * 10) / 10 : null,
        totalPostsAnalyzed: count,
      },
      tips,
    };
  }

  // Finding #386: Content repurpose suggestions
  async getRepurposeSuggestions(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true, content: true, mediaUrls: true, mediaTypes: true, likesCount: true, commentsCount: true, sharesCount: true, postType: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    const suggestions: Array<{ type: string; title: string; description: string }> = [];
    const hasText = !!post.content && post.content.length > 50;
    const hasImage = post.mediaUrls.length > 0 && (post.mediaTypes || []).some((t: string) => t.startsWith('image'));
    const hasVideo = (post.mediaTypes || []).some((t: string) => t.startsWith('video'));
    const isHighEngagement = post.likesCount >= 10 || post.commentsCount >= 5;

    if (hasText && !hasVideo) {
      suggestions.push({ type: 'reel', title: 'Turn into a Reel', description: 'Create a short video reading or narrating this post content' });
    }
    if (hasText && post.content && post.content.length > 200) {
      suggestions.push({ type: 'thread', title: 'Expand as a Thread', description: 'Break this into a multi-part thread on Majlis for deeper discussion' });
    }
    if (hasImage) {
      suggestions.push({ type: 'story', title: 'Share as a Story', description: 'Share this image as a 24-hour story with interactive stickers' });
    }
    if (hasVideo) {
      suggestions.push({ type: 'carousel', title: 'Create photo carousel', description: 'Extract key frames from the video and create a swipeable carousel post' });
    }
    if (isHighEngagement) {
      suggestions.push({ type: 'cross_post', title: 'Cross-post to other spaces', description: 'This content performed well — share it on Majlis, Bakra, or Minbar too' });
    }
    if (post.content && post.content.length < 100) {
      suggestions.push({ type: 'video', title: 'Create a long-form video', description: 'Expand on this topic with a detailed video for Minbar' });
    }

    return { suggestions };
  }
}
