import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { CreatePostDto } from './dto/create-post.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PushTriggerService } from '../notifications/push-trigger.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { extractHashtags } from '@/common/utils/hashtag';
import { Prisma, PostType, PostVisibility, ReactionType, ReportReason, ContentSpace } from '@prisma/client';
import { GamificationService } from '../gamification/gamification.service';
import { AiService } from '../ai/ai.service';
import { AsyncJobService } from '../../common/services/async-jobs.service';
import { QueueService } from '../../common/queue/queue.service';
import { AnalyticsService } from '../../common/services/analytics.service';

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

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private pushTrigger: PushTriggerService,
    @Inject('REDIS') private redis: Redis,
    private gamification: GamificationService,
    private ai: AiService,
    private jobs: AsyncJobService,
    private queueService: QueueService,
    private analytics: AnalyticsService,
  ) {}

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

    // Cache only "for you" feed for 30 seconds
    if (type === 'foryou') {
      const cacheKey = `feed:foryou:${userId}:${cursor ?? 'first'}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    if (type === 'foryou') {
      // Get blocked/muted users to exclude
      const [blocks, mutes] = await Promise.all([
        this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true },
      take: 50,
    }),
        this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true },
      take: 50,
    }),
      ]);
      const excludedIds = [
        ...blocks.map((b) => b.blockedId),
        ...mutes.map((m) => m.mutedId),
      ];

      // Fetch recent posts from last 72 hours
      const recentPosts = await this.prisma.post.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
          isRemoved: false,
          user: { isPrivate: false, isBanned: false },
          visibility: 'PUBLIC',
          ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
          ...(cursor ? { createdAt: { lt: new Date(cursor), gte: new Date(Date.now() - 72 * 60 * 60 * 1000) } } : {}),
        },
        select: POST_SELECT,
        take: 200, // fetch more to score and rank
        orderBy: { createdAt: 'desc' },
      });

      // Score each post: engagement weighted by recency
      const scored = recentPosts.map(post => {
        const ageHours = Math.max(1, (Date.now() - new Date(post.createdAt).getTime()) / 3600000);
        const engagement = (post.likesCount * 3) + (post.commentsCount * 5) + (post.sharesCount * 7) + (post.savesCount * 2) + (post.viewsCount * 0.1);
        const score = engagement / Math.pow(ageHours, 1.5);
        return { ...post, _score: score };
      });

      // Sort by score descending, paginate
      scored.sort((a, b) => b._score - a._score);
      const startIdx = cursor ? scored.findIndex(p => new Date(p.createdAt).toISOString() < cursor) : 0;
      const page = scored.slice(Math.max(0, startIdx), Math.max(0, startIdx) + limit + 1);

      const hasMore = page.length > limit;
      const result = hasMore ? page.slice(0, limit) : page;

      // Strip internal score field
      const data = result.map(({ _score, ...post }) => post);
      const enriched = await this.enrichPostsForUser(data, userId);

      const finalResult = {
        data: enriched,
        meta: {
          cursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
          hasMore,
        },
      };

      // Cache "for you" feed for 30 seconds
      const cacheKey = `feed:foryou:${userId}:${cursor ?? 'first'}`;
      await this.redis.setex(cacheKey, 30, JSON.stringify(finalResult));

      return finalResult;
    }

    // Following feed — with zero-follow fallback to trending
    const [follows, blocks, mutes] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true },
      take: 50,
    }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true },
      take: 50,
    }),
      this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true },
      take: 50,
    }),
    ]);

    const followingIds = follows.map((f) => f.followingId);
    const followCount = followingIds.length;
    const excludedIds = [
      ...blocks.map((b) => b.blockedId),
      ...mutes.map((m) => m.mutedId),
    ];

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
      scheduledAt: null,
      userId: { in: visibleUserIds },
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const posts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        visibility: 'PUBLIC',
        scheduledAt: null,
        createdAt: { gte: sevenDaysAgo },
        user: { isDeactivated: false, isPrivate: false },
        ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: POST_SELECT,
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    const scored = posts.map(post => {
      const ageHours = Math.max(1, (Date.now() - post.createdAt.getTime()) / 3600000);
      const engagement = post.likesCount + post.commentsCount * 2 + post.sharesCount * 3 + post.savesCount * 2;
      return { ...post, _score: engagement / ageHours };
    });
    scored.sort((a, b) => b._score - a._score);

    const page = scored.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const data = (hasMore ? page.slice(0, limit) : page).map(({ _score, ...p }) => p);
    const enriched = await this.enrichPostsForUser(data, userId);

    return {
      data: enriched,
      meta: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore },
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
        scheduledAt: null,
        userId: { in: visibleUserIds },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: POST_SELECT,
      take: halfLimit + 1,
      orderBy: { createdAt: 'desc' },
    });

    // Get trending content to fill the rest
    const seenIds = new Set(followingPosts.map(p => p.id));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trendingPosts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        visibility: 'PUBLIC',
        scheduledAt: null,
        createdAt: { gte: sevenDaysAgo },
        user: { isDeactivated: false, isPrivate: false },
        id: { notIn: [...seenIds] },
        ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
      },
      select: POST_SELECT,
      take: 200,
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
    const [followingResult, blocks, mutes] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      take: 50,
    }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true },
      take: 50,
    }),
      this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true },
      take: 50,
    }),
    ]);
    const followIds = followingResult.map(f => f.followingId);
    const excludedIds = [
      ...blocks.map((b) => b.blockedId),
      ...mutes.map((m) => m.mutedId),
    ];
    const excludedSet = new Set(excludedIds);
    const visibleUserIds = [userId, ...followIds.filter(id => !excludedSet.has(id))];

    const posts = await this.prisma.post.findMany({
      where: {
        userId: { in: visibleUserIds },
        isRemoved: false,
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
    const [circleMembers, blocks, mutes] = await Promise.all([
      this.prisma.circleMember.findMany({
        where: { circle: { ownerId: userId } },
        select: { userId: true },
      take: 50,
    }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true },
      take: 50,
    }),
      this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true },
      take: 50,
    }),
    ]);
    const excludedIds = [
      ...blocks.map((b) => b.blockedId),
      ...mutes.map((m) => m.mutedId),
    ];
    const excludedSet = new Set(excludedIds);
    const favoriteIds = circleMembers.map(m => m.userId).filter(id => !excludedSet.has(id));
    if (favoriteIds.length === 0) return { data: [], meta: { cursor: null, hasMore: false } };

    const posts = await this.prisma.post.findMany({
      where: {
        userId: { in: favoriteIds },
        isRemoved: false,
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

  private async enrichPostsForUser<T extends { id: string }>(posts: T[], userId: string) {
    if (!posts.length) return posts;
    const postIds = posts.map((p) => p.id);
    const [reactions, saves] = await Promise.all([
      this.prisma.postReaction.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true, reaction: true },
      take: 50,
    }),
      this.prisma.savedPost.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      take: 50,
    }),
    ]);
    const reactionMap = new Map(reactions.map((r) => [r.postId, r.reaction]));
    const savedSet = new Set(saves.map((s) => s.postId));
    return posts.map((post) => ({
      ...post,
      userReaction: reactionMap.get(post.id) ?? null,
      isSaved: savedSet.has(post.id),
    }));
  }

  async create(userId: string, dto: CreatePostDto) {
    // Parse hashtags (upserts happen inside transaction below)
    const hashtagNames = extractHashtags(dto.content ?? '');

    const result = await this.prisma.$transaction(async (tx) => {
      // Upsert hashtags inside transaction so counts stay consistent if post creation fails
      if (hashtagNames.length > 0) {
        await Promise.all(
          hashtagNames.map((name) =>
            tx.hashtag.upsert({
              where: { name },
              create: { name, postsCount: 1 },
              update: { postsCount: { increment: 1 } },
            }),
          ),
        );
      }

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
          isSensitive: dto.isSensitive ?? false,
          altText: dto.altText,
          hideLikesCount: dto.hideLikesCount ?? false,
          commentsDisabled: dto.commentsDisabled ?? false,
        },
        select: POST_SELECT,
      });

      await tx.user.update({
        where: { id: userId },
        data: { postsCount: { increment: 1 } },
      });

      return post;
    });

    const post = result;
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
              this.queueService.addPushNotificationJob({ notificationId: notification.id });
            }
          } catch (err) {
            this.logger.error('Failed to create mention notification', err);
          }
        }
      }
    }
    // Gamification: award XP + update streak (fire-and-forget)
    this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'post_created' });
    this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' });

    // AI moderation: check content asynchronously via queue (flag for review, don't block)
    if (dto.content) {
      this.queueService.addModerationJob({ content: dto.content, contentType: 'post', contentId: post.id });
    }

    // Track analytics
    this.analytics.track('post_created', userId, {
      postType: post.postType,
      hasMedia: post.mediaUrls.length > 0,
      visibility: post.visibility,
    });
    this.analytics.increment('posts:daily');

    // Invalidate for-you feed cache for the author
    await this.redis.del(`feed:foryou:${userId}:first`);
    return post;
  }

  async getById(postId: string, viewerId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        ...POST_SELECT,
        sharedPost: { select: { id: true, content: true, user: { select: { username: true } } } },
      },
    });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

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

  async update(postId: string, userId: string, data: Partial<CreatePostDto>) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();
    if (post.isRemoved) throw new BadRequestException('Post has been removed');

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        content: data.content ? sanitizeText(data.content) : data.content,
        hideLikesCount: data.hideLikesCount,
        commentsDisabled: data.commentsDisabled,
        isSensitive: data.isSensitive,
        altText: data.altText,
      },
      select: POST_SELECT,
    });
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
      this.prisma.$executeRaw`UPDATE "User" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${userId}`,
    ]);
    // Invalidate for-you feed cache for the author
    await this.redis.del(`feed:foryou:${userId}:first`);
    return { deleted: true };
  }

  async react(postId: string, userId: string, reaction: string = 'LIKE') {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      // Update reaction type
      await this.prisma.postReaction.update({
        where: { userId_postId: { userId, postId } },
        data: { reaction: reaction as ReactionType },
      });
    } else {
      try {
        await this.prisma.$transaction([
          this.prisma.postReaction.create({
            data: { userId, postId, reaction: reaction as ReactionType },
          }),
          this.prisma.post.update({
            where: { id: postId },
            data: { likesCount: { increment: 1 } },
          }),
        ]);
        // Notify post owner (skip if reacting to own post)
        if (post.userId !== userId) {
          try {
            const notification = await this.notifications.create({
              userId: post.userId, actorId: userId,
              type: 'LIKE', postId,
            });
            if (notification) {
              this.queueService.addPushNotificationJob({ notificationId: notification.id });
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
      this.prisma.$executeRaw`UPDATE "Post" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${postId}`,
    ]);
    return { reaction: null };
  }

  async save(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

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
    return { saved: true };
  }

  async unsave(postId: string, userId: string) {
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) throw new NotFoundException('Save not found');

    await this.prisma.$transaction([
      this.prisma.savedPost.delete({ where: { userId_postId: { userId, postId } } }),
      this.prisma.$executeRaw`UPDATE "Post" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = ${postId}`,
    ]);
    return { saved: false };
  }

  async share(postId: string, userId: string, content?: string) {
    const original = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!original || original.isRemoved) throw new NotFoundException('Post not found');

    const existing = await this.prisma.post.findFirst({
      where: { userId, sharedPostId: postId, isRemoved: false },
    });
    if (existing) throw new ConflictException('Already shared this post');

    const [shared] = await this.prisma.$transaction([
      this.prisma.post.create({
        data: {
          userId,
          postType: 'TEXT',
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
    ]);
    return shared;
  }

  async getComments(postId: string, cursor?: string, limit = 20) {
    const comments = await this.prisma.comment.findMany({
      where: { postId, parentId: null, isRemoved: false, isHidden: false },
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
      where: { parentId: commentId, isRemoved: false },
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
    if (post.commentsDisabled) throw new ForbiddenException('Comments are disabled on this post');

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
            this.queueService.addPushNotificationJob({ notificationId: notification.id });
          }
        }
      } else if (post.userId !== userId) {
        // Top-level comment — notify post owner (skip self-notification)
        const notification = await this.notifications.create({
          userId: post.userId, actorId: userId,
          type: 'COMMENT',
          postId, commentId: comment.id,
          body: dto.content.substring(0, 100),
        });
        if (notification) {
          this.queueService.addPushNotificationJob({ notificationId: notification.id });
        }
      }
    } catch (err) {
      this.logger.error('Failed to create notification', err);
    }

    // Gamification: award XP for commenting
    this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'comment_posted' });

    return comment;
  }

  async editComment(commentId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.isRemoved) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content: sanitizeText(content) },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.comment.update({
        where: { id: commentId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "Post" SET "commentsCount" = GREATEST("commentsCount" - 1, 0) WHERE id = ${comment.postId}`,
    ]);
    return { deleted: true };
  }

  async likeComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');

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
      this.prisma.$executeRaw`UPDATE "Comment" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${commentId}`,
    ]);
    return { liked: false };
  }

  async report(postId: string, userId: string, reason: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
      INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedPostId: postId,
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
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

    await this.prisma.savedPost.upsert({
      where: { userId_postId: { userId, postId } },
      update: { collectionName: 'archive' },
      create: { userId, postId, collectionName: 'archive' },
    });
    return { archived: true };
  }

  async unarchivePost(postId: string, userId: string) {
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing || existing.collectionName !== 'archive') {
      throw new NotFoundException('Post not archived');
    }
    await this.prisma.savedPost.delete({
      where: { userId_postId: { userId, postId } },
    });
    return { archived: false };
  }

  async getArchived(userId: string, cursor?: string, limit = 20) {
    const saved = await this.prisma.savedPost.findMany({
      where: { userId, collectionName: 'archive' },
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
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');
    return { url: `https://mizanly.app/post/${postId}` };
  }

  async crossPost(userId: string, postId: string, dto: { targetSpaces: string[]; captionOverride?: string }) {
    const post = await this.prisma.post.findFirst({ where: { id: postId, userId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.isRemoved) throw new BadRequestException('Cannot cross-post a removed post');

    const validSpaces = ['SAF', 'MAJLIS', 'BAKRA', 'MINBAR'];
    const targets = dto.targetSpaces.filter(s => validSpaces.includes(s) && s !== post.space);
    if (targets.length === 0) throw new BadRequestException('No valid target spaces');

    const newPosts = [];
    for (const space of targets) {
      const newPost = await this.prisma.post.create({
        data: {
          userId,
          content: dto.captionOverride ?? post.content,
          mediaUrls: post.mediaUrls,
          mediaTypes: post.mediaTypes,
          thumbnailUrl: post.thumbnailUrl,
          mediaWidth: post.mediaWidth,
          mediaHeight: post.mediaHeight,
          postType: post.postType,
          space: space as ContentSpace,
          hashtags: post.hashtags,
          mentions: post.mentions,
        },
        select: POST_SELECT,
      });
      newPosts.push(newPost);
    }
    return newPosts;
  }
}
