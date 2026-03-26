import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { ReplyPermission } from '@prisma/client';
import { CreateThreadDto } from './dto/create-thread.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { extractHashtags } from '@/common/utils/hashtag';
import { Prisma, ThreadVisibility, ReportReason } from '@prisma/client';
import { GamificationService } from '../gamification/gamification.service';
import { AiService } from '../ai/ai.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
import { QueueService } from '../../common/queue/queue.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';

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
  scheduledAt: true,
  replyPermission: true,
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

const REPLY_SELECT = {
  id: true,
  content: true,
  mediaUrls: true,
  likesCount: true,
  createdAt: true,
  parentId: true,
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
};

@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private notifications: NotificationsService,
    private gamification: GamificationService,
    private ai: AiService,
    private queueService: QueueService,
    private contentSafety: ContentSafetyService,
    private publishWorkflow: PublishWorkflowService,
  ) {}

  /** Get IDs of users that should be excluded (blocked by us, blocked us, muted by us).
   *  Safety-critical: no artificial cap — blocks must enforce completely.
   *  Upper bound of 10,000 to prevent DoS on pathological accounts. */
  private async getExcludedUserIds(userId: string): Promise<string[]> {
    const [blockedByMe, blockedMe, mutes] = await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true }, take: 10000 }),
      this.prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true }, take: 10000 }),
      this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true }, take: 10000 }),
    ]);
    const ids = new Set<string>();
    for (const b of blockedByMe) ids.add(b.blockedId);
    for (const b of blockedMe) ids.add(b.blockerId);
    for (const m of mutes) ids.add(m.mutedId);
    return [...ids];
  }

  async getFeed(
    userId: string,
    type: 'foryou' | 'following' | 'trending' = 'foryou',
    cursor?: string,
    limit = 20,
  ) {
    const [follows, excludedIds] = await Promise.all([
      type === 'following'
        ? this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true },
      take: 50,
    })
        : Promise.resolve([]),
      this.getExcludedUserIds(userId),
    ]);

    const followingIds = follows.map((f) => f.followingId);

    // For You feed: engagement-weighted scoring
    if (type === 'foryou') {
      const where: Prisma.ThreadWhereInput = {
        isChainHead: true,
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        visibility: 'PUBLIC',
        user: { isPrivate: false, isDeactivated: false, isBanned: false, isDeleted: false },
        createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
      };
      if (excludedIds.length) where.userId = { notIn: excludedIds };

      const recentThreads = await this.prisma.thread.findMany({
        where,
        select: THREAD_SELECT,
        take: 500, // wider candidate pool for better scoring diversity
        orderBy: { createdAt: 'desc' },
      });

      // Score each thread: engagement weighted by recency
      const scored = recentThreads.map(thread => {
        const ageHours = Math.max(1, (Date.now() - new Date(thread.createdAt).getTime()) / 3600000);
        const engagement = (thread.likesCount * 3) + (thread.repliesCount * 5) + (thread.repostsCount * 4);
        const score = engagement / Math.pow(ageHours, 1.5);
        return { ...thread, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);
      const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
      const page = scored.slice(offset, offset + limit + 1);

      const hasMore = page.length > limit;
      const result = hasMore ? page.slice(0, limit) : page;

      const data = result.map(({ _score, ...thread }) => thread);

      return {
        data,
        meta: {
          cursor: hasMore ? String(offset + limit) : null,
          hasMore,
        },
      };
    }

    // Following feed: chronological from followed users, with zero-follow fallback
    if (type === 'following') {
      // Zero follows → serve trending instead so feed is never empty
      if (followingIds.length === 0) {
        return this.getTrendingThreads(excludedIds, cursor, limit);
      }

      // Few follows (< 10) → blend following + trending
      if (followingIds.length < 10) {
        return this.getBlendedThreadFeed(userId, followingIds, excludedIds, cursor, limit);
      }

      const allowedUserIds = [userId, ...followingIds].filter(id => !excludedIds.includes(id));
      const where: Prisma.ThreadWhereInput = {
        isRemoved: false,
        isChainHead: true,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        userId: { in: allowedUserIds },
        user: { isDeactivated: false, isBanned: false, isDeleted: false },
        AND: [
          { OR: [{ visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS' }, { userId }] },
        ],
      };

      const threads = await this.prisma.thread.findMany({
        where,
        select: THREAD_SELECT,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      });

      const hasMore = threads.length > limit;
      const items = hasMore ? threads.slice(0, limit) : threads;
      return {
        data: items,
        meta: { cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null, hasMore },
      };
    }

    // Trending feed: engagement-rate scoring with reply depth
    return this.getTrendingThreads(excludedIds, cursor, limit);
  }

  /**
   * Trending threads scored by reply depth + engagement rate.
   * Threads with deep reply chains score higher.
   */
  private async getTrendingThreads(excludedIds: string[], cursor?: string, limit = 20) {
    // 60-second Redis cache for trending threads (same pattern as posts.service.ts getTrendingFallback)
    const cacheKey = `threads:trending:${cursor ?? 'first'}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as { data: Record<string, unknown>[]; meta: { hasMore: boolean; cursor?: string } };
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const threads = await this.prisma.thread.findMany({
      where: {
        isRemoved: false,
        isChainHead: true,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        visibility: 'PUBLIC',
        createdAt: { gte: sevenDaysAgo },
        user: { isPrivate: false, isDeactivated: false, isBanned: false, isDeleted: false },
        ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
      },
      select: THREAD_SELECT,
      take: 500, // wider candidate pool for better trending diversity
      orderBy: { createdAt: 'desc' },
    });

    // Score by reply depth + engagement rate
    const scored = threads.map((thread) => {
      const ageHours = Math.max(1, (Date.now() - thread.createdAt.getTime()) / 3600000);
      // Reply depth is the strongest signal for threads (conversation depth > likes)
      const replyDepthScore = thread.repliesCount * 3;
      const engagementScore =
        thread.likesCount * 1.0 +
        replyDepthScore +
        thread.repostsCount * 2.0 +
        thread.quotesCount * 2.5;
      const engagementRate = engagementScore / ageHours;
      return { ...thread, _score: engagementRate };
    });

    scored.sort((a, b) => b._score - a._score);
    const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
    const page = scored.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;
    const data = (hasMore ? page.slice(0, limit) : page).map(
      ({ _score, ...t }) => t,
    );

    const result = {
      data,
      meta: {
        hasMore,
        cursor: hasMore ? String(offset + limit) : undefined,
      },
    };

    // Cache trending threads for 60 seconds
    await this.redis.setex(cacheKey, 60, JSON.stringify(result));
    return result;
  }

  /**
   * Blended feed for users with few follows (< 10).
   * 50% following + 50% trending, merged and deduplicated.
   */
  private async getBlendedThreadFeed(userId: string, followingIds: string[], excludedIds: string[], cursor?: string, limit = 20) {
    const allowedUserIds = [userId, ...followingIds].filter(id => !excludedIds.includes(id));
    const halfLimit = Math.ceil(limit / 2);

    // Get following threads
    const followingThreads = await this.prisma.thread.findMany({
      where: {
        isRemoved: false,
        isChainHead: true,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        userId: { in: allowedUserIds },
        user: { isDeactivated: false, isBanned: false, isDeleted: false },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: THREAD_SELECT,
      take: halfLimit + 1,
      orderBy: { createdAt: 'desc' },
    });

    // Get trending to fill the rest
    const seenIds = new Set(followingThreads.map(t => t.id));
    const trending = await this.getTrendingThreads(excludedIds, undefined, halfLimit);
    const trendingFiltered = trending.data.filter((t: { id: string }) => !seenIds.has(t.id)) as typeof followingThreads;

    // Interleave
    const merged: typeof followingThreads = [];
    const fi = followingThreads.slice(0, halfLimit);
    const ti = trendingFiltered;
    const maxLen = Math.max(fi.length, ti.length);
    for (let i = 0; i < maxLen && merged.length < limit; i++) {
      if (i < fi.length) merged.push(fi[i]);
      if (i < ti.length && merged.length < limit) merged.push(ti[i]);
    }

    const hasMore = followingThreads.length > halfLimit || trending.meta.hasMore;
    return {
      data: merged,
      meta: { cursor: merged.length > 0 ? merged[merged.length - 1].id : null, hasMore },
    };
  }

  async create(userId: string, dto: CreateThreadDto) {
    // Pre-save content moderation: block harmful text before persisting (Finding 44)
    if (dto.content) {
      const moderationResult = await this.contentSafety.moderateText(dto.content);
      if (!moderationResult.safe) {
        this.logger.warn(`Thread creation blocked by content safety: flags=${moderationResult.flags.join(',')}, userId=${userId}`);
        throw new BadRequestException(
          `Content flagged: ${moderationResult.flags.join(', ')}. ${moderationResult.suggestion || 'Please revise your thread.'}`,
        );
      }
    }

    // Pre-save image moderation: block harmful images before persisting (Finding 44)
    if (dto.mediaUrls?.length && dto.mediaTypes?.some((t: string) => t.startsWith('image'))) {
      for (const [idx, url] of dto.mediaUrls.entries()) {
        if (dto.mediaTypes?.[idx]?.startsWith('image')) {
          const imageResult = await this.ai.moderateImage(url);
          if (imageResult.classification === 'BLOCK') {
            this.logger.warn(`Thread creation blocked: image BLOCKED — ${imageResult.reason}, userId=${userId}`);
            throw new BadRequestException('Image violates community guidelines');
          }
        }
      }
    }

    // Parse and upsert hashtags
    const hashtagNames = extractHashtags(dto.content ?? '');
    const isScheduled = !!dto.scheduledAt;
    // For scheduled content: create the hashtag record but don't increment count yet —
    // counts are incremented when the scheduling cron publishes the content
    if (hashtagNames.length > 0) {
      await Promise.all(
        hashtagNames.map((name) =>
          this.prisma.hashtag.upsert({
            where: { name },
            create: { name, threadsCount: isScheduled ? 0 : 1 },
            update: isScheduled ? {} : { threadsCount: { increment: 1 } },
          }),
        ),
      );
    }

    const [thread] = await this.prisma.$transaction([
      this.prisma.thread.create({
        data: {
          userId,
          content: sanitizeText(dto.content),
          visibility: (dto.visibility as ThreadVisibility) ?? 'PUBLIC', // Validated by CreateThreadDto @IsEnum
          circleId: dto.circleId,
          mediaUrls: dto.mediaUrls ?? [],
          mediaTypes: dto.mediaTypes ?? [],
          hashtags: dto.hashtags ?? [],
          mentions: dto.mentions ?? [],
          isQuotePost: dto.isQuotePost ?? false,
          quoteText: dto.quoteText ? sanitizeText(dto.quoteText) : dto.quoteText,
          repostOfId: dto.repostOfId,
          poll: dto.poll
            ? {
                create: {
                  question: dto.poll.question,
                  endsAt: dto.poll.endsAt ? new Date(dto.poll.endsAt) : undefined,
                  allowMultiple: dto.poll.allowMultiple ?? false,
                  options: {
                    create: dto.poll.options.map((o, i) => ({
                      text: o.text,
                      position: i,
                    })),
                  },
                },
              }
            : undefined,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        },
        select: THREAD_SELECT,
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { threadsCount: { increment: 1 } },
      }),
    ]);
    // --- Side effects deferred for scheduled content ---
    // Notifications and gamification XP only fire when content is actually published.
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
            this.notifications.create({
              userId: mentioned.id,
              actorId: userId,
              type: 'MENTION',
              threadId: thread.id,
              title: 'Mentioned you',
              body: `@${actor?.username ?? 'Someone'} mentioned you in a thread`,
            }).catch((err) => this.logger.error('Failed to create mention notification', err));
          }
        }
      }

      // Gamification: award XP + update streak
      this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'thread_created' }).catch(err => this.logger.warn('Failed to queue gamification XP for thread', err instanceof Error ? err.message : err));
      this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Failed to queue gamification streak for thread', err instanceof Error ? err.message : err));
    }
    // --- End deferred side effects ---

    // Publish workflow: search index, cache invalidation, real-time event
    // Only trigger for immediately-published content (not scheduled)
    if (!dto.scheduledAt) {
      this.publishWorkflow.onPublish({
        contentType: 'thread',
        contentId: thread.id,
        userId,
        indexDocument: {
          id: thread.id,
          content: thread.content,
          hashtags: thread.hashtags,
          username: thread.user?.username || '',
          userId,
          visibility: thread.visibility,
        },
      }).catch(err => this.logger.warn('Publish workflow failed for thread', err instanceof Error ? err.message : err));
    }

    return thread;
  }

  async getById(threadId: string, viewerId?: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: THREAD_SELECT,
    });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    // Hide future-scheduled content from non-owners
    if (thread.scheduledAt && new Date(thread.scheduledAt) > new Date() && thread.user?.id !== viewerId) {
      throw new NotFoundException('Thread not found');
    }

    let userReaction: string | null = null;
    let isBookmarked = false;

    if (viewerId && thread.user) {
      // Check if blocked in either direction
      const block = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: thread.user.id },
            { blockerId: thread.user.id, blockedId: viewerId },
          ],
        },
      });
      if (block) throw new NotFoundException('Thread not found');

      const [reaction, bookmark] = await Promise.all([
        this.prisma.threadReaction.findUnique({
          where: { userId_threadId: { userId: viewerId, threadId } },
        }),
        this.prisma.threadBookmark.findUnique({
          where: { userId_threadId: { userId: viewerId, threadId } },
        }),
      ]);
      userReaction = reaction?.reaction ?? null;
      isBookmarked = !!bookmark;
    }

    return { ...thread, userReaction, isBookmarked };
  }

  async updateThread(threadId: string, userId: string, content: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.userId !== userId) throw new ForbiddenException();
    if (thread.isRemoved) throw new BadRequestException('Thread has been removed');

    const updated = await this.prisma.thread.update({
      where: { id: threadId },
      data: { content: sanitizeText(content) },
      select: THREAD_SELECT,
    });

    // Re-index updated thread in search
    this.publishWorkflow.onPublish({
      contentType: 'thread',
      contentId: threadId,
      userId,
      indexDocument: {
        id: threadId,
        content: updated.content || '',
        hashtags: updated.hashtags || [],
        username: updated.user?.username || '',
        userId,
        visibility: updated.visibility,
      },
    }).catch(err => this.logger.warn('Publish workflow failed for thread update', err instanceof Error ? err.message : err));

    return updated;
  }

  /**
   * Bug 59: Create a continuation thread in a chain.
   * The first thread becomes the chain head, subsequent threads share the same chainId.
   */
  async createContinuation(userId: string, parentThreadId: string, content: string) {
    const parent = await this.prisma.thread.findUnique({ where: { id: parentThreadId } });
    if (!parent) throw new NotFoundException('Thread not found');
    if (parent.userId !== userId) throw new ForbiddenException('Only the author can add continuations');
    if (parent.isRemoved) throw new BadRequestException('Thread has been removed');

    // Determine chainId — if parent is already in a chain, use its chainId; otherwise start a new chain
    const chainId = parent.chainId || parent.id;

    // Set parent as chain head if not already
    if (!parent.chainId) {
      await this.prisma.thread.update({
        where: { id: parentThreadId },
        data: { chainId, chainPosition: 1, isChainHead: true },
      });
    }

    // Count existing chain members to determine position
    const chainCount = await this.prisma.thread.count({ where: { chainId } });

    const continuation = await this.prisma.thread.create({
      data: {
        userId,
        content: sanitizeText(content),
        isChainHead: false,
        chainId,
        chainPosition: chainCount + 1,
        visibility: parent.visibility,
      },
      select: THREAD_SELECT,
    });

    return continuation;
  }

  async delete(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.thread.update({
        where: { id: threadId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "threadsCount" = GREATEST("threadsCount" - 1, 0) WHERE id = ${userId}`,
    ]);

    // Decrement hashtag counters for removed thread
    if (thread.hashtags && thread.hashtags.length > 0) {
      await Promise.all(
        thread.hashtags.map((name: string) =>
          this.prisma.$executeRaw`UPDATE "Hashtag" SET "threadsCount" = GREATEST("threadsCount" - 1, 0) WHERE name = ${name}`,
        ),
      );
    }

    // Unpublish workflow: search index removal, cache invalidation, real-time event
    this.publishWorkflow.onUnpublish({
      contentType: 'thread',
      contentId: threadId,
      userId,
    }).catch(err => this.logger.warn('Unpublish workflow failed for thread', err instanceof Error ? err.message : err));

    return { deleted: true };
  }

  async like(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');
    if (thread.scheduledAt && new Date(thread.scheduledAt) > new Date() && thread.userId !== userId) throw new NotFoundException('Thread not found');

    // Prevent self-like
    if (thread.userId === userId) {
      throw new BadRequestException('Cannot like your own thread');
    }

    const existing = await this.prisma.threadReaction.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (existing) throw new ConflictException('Already reacted');

    try {
      await this.prisma.$transaction([
        this.prisma.threadReaction.create({
          data: { userId, threadId, reaction: 'LIKE' },
        }),
        this.prisma.thread.update({
          where: { id: threadId },
          data: { likesCount: { increment: 1 } },
        }),
      ]);
      // Notify thread owner (skip self-notification)
      if (thread.userId && thread.userId !== userId) {
        this.notifications.create({
          userId: thread.userId, actorId: userId,
          type: 'LIKE', threadId,
        }).catch((err) => this.logger.error('Failed to create notification', err));
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        return { liked: true };
      }
      throw err;
    }
    return { liked: true };
  }

  async unlike(threadId: string, userId: string) {
    const existing = await this.prisma.threadReaction.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (!existing) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.threadReaction.delete({
        where: { userId_threadId: { userId, threadId } },
      }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${threadId}`,
    ]);
    return { liked: false };
  }

  async repost(threadId: string, userId: string) {
    const original = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!original || original.isRemoved) throw new NotFoundException('Thread not found');

    // Prevent self-reposting
    if (original.userId === userId) throw new BadRequestException('Cannot repost your own thread');

    // Check if user already reposted
    const existingRepost = await this.prisma.thread.findFirst({
      where: { userId, repostOfId: threadId, isRemoved: false },
    });
    if (existingRepost) throw new ConflictException('Already reposted');

    const [repost] = await this.prisma.$transaction([
      this.prisma.thread.create({
        data: {
          userId,
          content: '',
          repostOfId: threadId,
          isChainHead: true,
          mediaUrls: [],
          mediaTypes: [],
          visibility: 'PUBLIC',
        },
        select: THREAD_SELECT,
      }),
      this.prisma.thread.update({
        where: { id: threadId },
        data: { repostsCount: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { threadsCount: { increment: 1 } },
      }),
    ]);
    // Notify thread owner (always different user due to self-repost guard above)
    if (original.userId) {
      this.notifications.create({
        userId: original.userId, actorId: userId,
        type: 'REPOST', threadId,
      }).catch((err) => this.logger.error('Failed to create notification', err));
    }
    return repost;
  }

  async unrepost(threadId: string, userId: string) {
    const repost = await this.prisma.thread.findFirst({
      where: { userId, repostOfId: threadId, isRemoved: false },
    });
    if (!repost) throw new NotFoundException('Repost not found');

    await this.prisma.$transaction([
      this.prisma.thread.update({
        where: { id: repost.id },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "repostsCount" = GREATEST("repostsCount" - 1, 0) WHERE id = ${threadId}`,
    ]);
    return { reposted: false };
  }

  async bookmark(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    try {
      await this.prisma.$transaction([
        this.prisma.threadBookmark.create({ data: { userId, threadId } }),
        this.prisma.thread.update({
          where: { id: threadId },
          data: { bookmarksCount: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Already bookmarked');
      }
      throw error;
    }
    return { bookmarked: true };
  }

  async unbookmark(threadId: string, userId: string) {
    const existing = await this.prisma.threadBookmark.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (!existing) throw new NotFoundException('Bookmark not found');

    await this.prisma.$transaction([
      this.prisma.threadBookmark.delete({
        where: { userId_threadId: { userId, threadId } },
      }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "bookmarksCount" = GREATEST("bookmarksCount" - 1, 0) WHERE id = ${threadId}`,
    ]);
    return { bookmarked: false };
  }

  async getReplies(threadId: string, cursor?: string, limit = 20, viewerId?: string) {
    // Filter out replies from blocked/muted users
    const excludedIds = viewerId ? await this.getExcludedUserIds(viewerId) : [];
    const whereClause: Prisma.ThreadReplyWhereInput = { threadId, parentId: null };
    if (excludedIds.length) whereClause.userId = { notIn: excludedIds };

    const replies = await this.prisma.threadReply.findMany({
      where: whereClause,
      select: REPLY_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
    });

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, limit) : replies;

    // Attach isLiked for authenticated viewer
    if (viewerId && items.length > 0) {
      const replyIds = items.map((r) => r.id);
      const liked = await this.prisma.threadReplyLike.findMany({
        where: { userId: viewerId, replyId: { in: replyIds } },
        select: { replyId: true },
      take: 50,
    });
      const likedSet = new Set(liked.map((l) => l.replyId));
      return {
        data: items.map((r) => ({ ...r, isLiked: likedSet.has(r.id) })),
        meta: { cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null, hasMore },
      };
    }

    return {
      data: items.map((r) => ({ ...r, isLiked: false })),
      meta: { cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null, hasMore },
    };
  }

  async likeReply(threadId: string, replyId: string, userId: string) {
    const reply = await this.prisma.threadReply.findUnique({ where: { id: replyId } });
    if (!reply || reply.threadId !== threadId) throw new NotFoundException('Reply not found');

    const existing = await this.prisma.threadReplyLike.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (existing) throw new ConflictException('Already liked');

    await this.prisma.$transaction([
      this.prisma.threadReplyLike.create({ data: { userId, replyId } }),
      this.prisma.threadReply.update({
        where: { id: replyId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    return { liked: true };
  }

  async unlikeReply(threadId: string, replyId: string, userId: string) {
    const existing = await this.prisma.threadReplyLike.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (!existing) throw new NotFoundException('Like not found');

    await this.prisma.$transaction([
      this.prisma.threadReplyLike.delete({
        where: { userId_replyId: { userId, replyId } },
      }),
      this.prisma.$executeRaw`UPDATE "ThreadReply" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${replyId}`,
    ]);
    return { liked: false };
  }

  async addReply(threadId: string, userId: string, content: string, parentId?: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');
    if (thread.scheduledAt && new Date(thread.scheduledAt) > new Date() && thread.userId !== userId) throw new NotFoundException('Thread not found');

    // Enforce reply permission — owner always allowed
    if (thread.replyPermission && thread.replyPermission !== 'EVERYONE' && thread.userId !== userId) {
      if (thread.replyPermission === 'FOLLOWING' && thread.userId) {
        // Check: does the replier follow the author? (same direction as canReply)
        const isFollowing = await this.prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: userId, followingId: thread.userId } },
        });
        if (!isFollowing) throw new ForbiddenException('Only followers can reply to this thread');
      } else if (thread.replyPermission === 'MENTIONED') {
        // Check if the replier is actually mentioned in the thread
        const replier = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        if (!replier || !thread.mentions.includes(replier.username)) {
          throw new ForbiddenException('Only mentioned users can reply to this thread');
        }
      } else if (thread.replyPermission === 'NONE') {
        throw new ForbiddenException('Replies are disabled for this thread');
      }
    }

    if (parentId) {
      const parent = await this.prisma.threadReply.findUnique({ where: { id: parentId } });
      if (!parent || parent.threadId !== threadId) throw new NotFoundException('Parent reply not found');
    }

    const [reply] = await this.prisma.$transaction([
      this.prisma.threadReply.create({
        data: { threadId, userId, content: sanitizeText(content), parentId },
        select: REPLY_SELECT,
      }),
      this.prisma.thread.update({
        where: { id: threadId },
        data: { repliesCount: { increment: 1 } },
      }),
    ]);
    // Gamification: award XP for thread reply
    this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'thread_reply_created' }).catch(err => this.logger.warn('Failed to queue gamification XP', err instanceof Error ? err.message : err));

    // Notify thread owner (skip self-notification)
    if (thread.userId && thread.userId !== userId) {
      this.notifications.create({
        userId: thread.userId, actorId: userId,
        type: 'THREAD_REPLY', threadId,
        body: content.substring(0, 100),
      }).catch((err) => this.logger.error('Failed to create notification', err));
    }
    return reply;
  }

  async deleteReply(replyId: string, userId: string) {
    const reply = await this.prisma.threadReply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('Reply not found');
    if (reply.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.threadReply.update({ where: { id: replyId }, data: { content: '[deleted]' } }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "repliesCount" = GREATEST("repliesCount" - 1, 0) WHERE id = ${reply.threadId}`,
    ]);
    return { deleted: true };
  }

  async votePoll(optionId: string, userId: string) {
    const option = await this.prisma.pollOption.findUnique({
      where: { id: optionId },
      include: { poll: true },
    });
    if (!option) throw new NotFoundException('Poll option not found');

    if (option.poll.endsAt && option.poll.endsAt < new Date()) {
      throw new BadRequestException('Poll has ended');
    }

    const existing = await this.prisma.pollVote.findUnique({
      where: { userId_optionId: { userId, optionId } },
    });
    if (existing) throw new ConflictException('Already voted');

    // If allowMultiple is false, check if user has already voted on any option in this poll
    if (!option.poll.allowMultiple) {
      const existingVoteOnPoll = await this.prisma.pollVote.findFirst({
        where: { userId, option: { pollId: option.pollId } },
      });
      if (existingVoteOnPoll) throw new ConflictException('Already voted on this poll');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.pollVote.create({ data: { userId, optionId } }),
        this.prisma.pollOption.update({
          where: { id: optionId },
          data: { votesCount: { increment: 1 } },
        }),
        this.prisma.poll.update({
          where: { id: option.pollId },
          data: { totalVotes: { increment: 1 } },
        }),
      ]);
    } catch (err: unknown) {
      // P2002: duplicate vote from concurrent request
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        throw new ConflictException('Already voted on this poll');
      }
      throw err;
    }
    return { voted: true };
  }

  async getUserThreads(username: string, cursor?: string, limit = 20, viewerId?: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    // If viewer is authenticated, check if blocked in either direction
    if (viewerId && viewerId !== user.id) {
      const block = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: user.id },
            { blockerId: user.id, blockedId: viewerId },
          ],
        },
      });
      if (block) throw new NotFoundException('User not found');
    }

    const isOwn = viewerId === user.id;
    const threads = await this.prisma.thread.findMany({
      where: { userId: user.id, isRemoved: false, isChainHead: true, ...(isOwn ? {} : { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }) },
      select: THREAD_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = threads.length > limit;
    const items = hasMore ? threads.slice(0, limit) : threads;
    return {
      data: items,
      meta: { cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null, hasMore },
    };
  }

  async report(threadId: string, userId: string, reason: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId }, select: { id: true, isRemoved: true } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    // Prevent duplicate reports — use reportedThreadId FK instead of description string
    const existing = await this.prisma.report.findFirst({
      where: { reporterId: userId, reportedThreadId: threadId },
    });
    if (existing) return { reported: true };

    const reasonMap: Record<string, ReportReason> = {
      SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
      INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedThreadId: threadId,
        reason: reasonMap[reason] ?? 'OTHER',
      },
    });
    return { reported: true };
  }

  async dismiss(threadId: string, userId: string) {
    await this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId: threadId, contentType: 'THREAD' } },
      create: { userId, contentId: threadId, contentType: 'THREAD' },
      update: {},
    });
    return { dismissed: true };
  }

  async setReplyPermission(threadId: string, userId: string, permission: 'everyone' | 'following' | 'mentioned' | 'none') {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');
    if (thread.userId !== userId) throw new ForbiddenException();

    const validPermissions = ['everyone', 'following', 'mentioned', 'none'] as const;
    if (!validPermissions.includes(permission)) {
      throw new BadRequestException('Invalid permission value');
    }

    await this.prisma.thread.update({
      where: { id: threadId },
      data: { replyPermission: permission as ReplyPermission },
    });
    return { updated: true, permission };
  }

  async canReply(threadId: string, userId?: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { userId: true, replyPermission: true, mentions: true, isRemoved: true, user: { select: { username: true } } },
    });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    // Author can always reply (if authenticated)
    if (userId && thread.userId === userId) return { canReply: true, reason: 'author' };

    const permission = thread.replyPermission ?? 'EVERYONE';
    if (permission === 'NONE') return { canReply: false, reason: 'none' };
    if (permission === 'EVERYONE') return { canReply: true, reason: 'everyone' };

    // Following check requires authenticated user
    if (permission === 'FOLLOWING') {
      if (!userId || !thread.userId) return { canReply: false, reason: 'not_following' };
      const follow = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: thread.userId } },
      });
      if (follow) return { canReply: true, reason: 'following' };
      return { canReply: false, reason: 'not_following' };
    }

    // Mentioned check requires authenticated user
    if (permission === 'MENTIONED') {
      if (!userId) return { canReply: false, reason: 'not_mentioned' };
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      if (user && thread.mentions.includes(user.username)) {
        return { canReply: true, reason: 'mentioned' };
      }
      return { canReply: false, reason: 'not_mentioned' };
    }

    return { canReply: false, reason: 'unknown' };
  }

  async getShareLink(threadId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId }, select: { id: true, isRemoved: true } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');
    return { url: `https://mizanly.app/thread/${threadId}` };
  }

  async isBookmarked(threadId: string, userId: string) {
    const bookmark = await this.prisma.threadBookmark.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    return { bookmarked: !!bookmark };
  }

  // Finding #263: Share thread to story — creates a story from thread content
  async shareToStory(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { ...THREAD_SELECT, userId: true },
    });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    // Create a story with the thread content as text overlay
    const storyContent = (thread.content || '').substring(0, 500);
    const authorName = thread.user?.displayName || thread.user?.username || 'Unknown';

    // We create the story via the stories service if available, but since we don't inject it,
    // return the data needed for the mobile client to create the story
    return {
      threadId: thread.id,
      content: storyContent,
      author: authorName,
      authorAvatar: thread.user?.avatarUrl,
      authorUsername: thread.user?.username,
      likesCount: thread.likesCount,
      repliesCount: thread.repliesCount,
      shareUrl: `https://mizanly.app/thread/${threadId}`,
    };
  }

  // Finding #381: Thread unroll — returns the full chain as a flat, ordered list
  async getThreadUnroll(threadId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { ...THREAD_SELECT, chainId: true },
    });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    // If no chain, return single thread
    if (!thread.chainId) {
      return { data: [thread], meta: { totalParts: 1 } };
    }

    // Fetch all threads in the chain, ordered by position
    const chain = await this.prisma.thread.findMany({
      where: { chainId: thread.chainId, isRemoved: false },
      select: THREAD_SELECT,
      orderBy: { chainPosition: 'asc' },
      take: 50,
    });

    return {
      data: chain,
      meta: { totalParts: chain.length, chainId: thread.chainId },
    };
  }

  // Finding #251: Content performance comparison — thread analytics vs author average
  async getThreadAnalytics(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.userId !== userId) throw new ForbiddenException('Only the author can view analytics');

    // Get author's average engagement across their last 50 threads
    const recentThreads = await this.prisma.thread.findMany({
      where: { userId, isRemoved: false, isChainHead: true },
      select: { likesCount: true, repliesCount: true, repostsCount: true, viewsCount: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const count = recentThreads.length || 1;
    const avgLikes = recentThreads.reduce((s, t) => s + t.likesCount, 0) / count;
    const avgReplies = recentThreads.reduce((s, t) => s + t.repliesCount, 0) / count;
    const avgReposts = recentThreads.reduce((s, t) => s + t.repostsCount, 0) / count;
    const avgViews = recentThreads.reduce((s, t) => s + t.viewsCount, 0) / count;

    return {
      thread: {
        likes: thread.likesCount,
        replies: thread.repliesCount,
        reposts: thread.repostsCount,
        views: thread.viewsCount,
      },
      average: {
        likes: Math.round(avgLikes * 10) / 10,
        replies: Math.round(avgReplies * 10) / 10,
        reposts: Math.round(avgReposts * 10) / 10,
        views: Math.round(avgViews * 10) / 10,
      },
      comparison: {
        likesVsAvg: avgLikes > 0 ? Math.round(((thread.likesCount - avgLikes) / avgLikes) * 100) : 0,
        repliesVsAvg: avgReplies > 0 ? Math.round(((thread.repliesCount - avgReplies) / avgReplies) * 100) : 0,
        repostsVsAvg: avgReposts > 0 ? Math.round(((thread.repostsCount - avgReposts) / avgReposts) * 100) : 0,
        viewsVsAvg: avgViews > 0 ? Math.round(((thread.viewsCount - avgViews) / avgViews) * 100) : 0,
      },
    };
  }
}
