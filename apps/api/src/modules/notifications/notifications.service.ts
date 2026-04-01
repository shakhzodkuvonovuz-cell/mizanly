import { Injectable, NotFoundException, ForbiddenException, Logger, Inject, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../config/prisma.service';
import { PushTriggerService } from './push-trigger.service';
import { QueueService } from '../../common/queue/queue.service';
import { NotificationType, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { atomicIncr } from '../../common/utils/redis-atomic';
import { acquireCronLock } from '../../common/utils/cron-lock';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private prisma: PrismaService,
    private pushTrigger: PushTriggerService,
    @Optional() private queueService: QueueService | null,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async getNotifications(
    userId: string,
    filter?: 'all' | 'mentions' | 'verified',
    cursor?: string,
    limit = 30,
  ) {
    const where: Prisma.NotificationWhereInput = { userId };

    if (filter === 'mentions') {
      where.type = { in: ['MENTION', 'THREAD_REPLY', 'REPLY'] };
    } else if (filter === 'verified') {
      where.actor = { isVerified: true };
    }

    // Build conditional relation includes based on filter to avoid unnecessary JOINs.
    // For 'mentions' filter, only post/thread relations are relevant (MENTION, REPLY, THREAD_REPLY).
    // For 'all'/'verified', include all content relations since mixed types appear.
    const contentIncludes = this.buildContentIncludes(filter);

    const notifications = await this.prisma.notification.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            isBanned: true,
            isDeactivated: true,
          },
        },
        ...contentIncludes,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;

    // Compute isFollowing for each actor so the client can show follow-back buttons
    const actorIds = [...new Set(items.map((n) => n.actorId).filter(Boolean))] as string[];
    const followedActors = actorIds.length > 0
      ? await this.prisma.follow.findMany({
          where: { followerId: userId, followingId: { in: actorIds } },
          select: { followingId: true },
        })
      : [];
    const followingSet = new Set(followedActors.map((f) => f.followingId));

    const enrichedItems = items
      .filter((n) => !n.actor?.isBanned && !n.actor?.isDeactivated)
      .map((n) => {
        const { isBanned: _b, isDeactivated: _d, ...actorFields } = n.actor ?? {} as Record<string, unknown>;
        return {
          ...n,
          actor: n.actor
            ? { ...actorFields, isFollowing: followingSet.has(n.actor.id) }
            : n.actor,
        };
      });

    return {
      data: enrichedItems,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException();

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    // Emit updated unread count via Redis pub/sub so badge updates in real-time
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    this.redis.publish('notification:badge', JSON.stringify({
      userId,
      unreadCount,
    })).catch((e) => this.logger.debug('Redis unread count publish failed', e));

    return updated;
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    // Emit unread count update (0) so badge updates in real-time
    this.redis.publish('notification:badge', JSON.stringify({
      userId,
      unreadCount: 0,
    })).catch((e) => this.logger.debug('Redis unread count publish failed', e));

    return { updated: true };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unread: count };
  }

  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    const groups = await this.prisma.notification.groupBy({
      by: ['type'],
      where: { userId, isRead: false },
      _count: true,
    });
    const counts: Record<string, number> = {};
    for (const g of groups) {
      counts[g.type] = g._count;
    }
    counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
    return counts;
  }

  async getUnreadCountTotal(userId: string) {
    const total = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { total };
  }

  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException();

    await this.prisma.notification.delete({ where: { id: notificationId } });

    // If the deleted notification was unread, invalidate the cached unread count
    // so the next getUnreadCount call returns the correct value
    if (!notification.isRead) {
      this.redis.del(`notif_unread:${userId}`).catch((err) => this.logger.debug('Redis unread count cache invalidation failed', err?.message));
    }

    return { deleted: true };
  }

  // TODO: [03] F28 — Push notification i18n
  // When user locale is available (via User.locale field), use it to select
  // the notification title/body from i18n templates instead of hardcoded English.
  // This requires:
  // 1. User.locale field in Prisma schema
  // 2. Server-side i18n template file (e.g., notification-templates.ts)
  // 3. Lookup user locale before constructing title/body

  // Internal helper — used by other services to create notifications
  async create(params: {
    userId: string;
    actorId: string | null;
    type: string;
    postId?: string;
    threadId?: string;
    commentId?: string;
    reelId?: string;
    videoId?: string;
    conversationId?: string;
    followRequestId?: string;
    title?: string;
    body?: string;
  }) {
    // No self-notifications — but allow null actorId for system notifications
    if (params.userId === params.actorId && params.actorId !== null) return null;

    // Validate notification type at runtime (internal callers pass string literals)
    const validTypes = Object.values(NotificationType);
    if (!validTypes.includes(params.type as NotificationType)) {
      this.logger.warn(`Invalid notification type: ${params.type}`);
      return null;
    }

    // Check actor is not banned/deleted before creating notification
    if (params.actorId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: params.actorId },
        select: { isBanned: true, isDeleted: true },
      });
      if (actor?.isBanned || actor?.isDeleted) return null;
    }

    // Fetch all pre-creation checks in parallel: settings, user prefs, block/mute
    // Skip block/mute checks for system notifications (actorId is null)
    const [settings, user, blockExists, muteExists] = await Promise.all([
      this.prisma.userSettings.findUnique({
        where: { userId: params.userId },
        select: { notifyLikes: true, notifyComments: true, notifyFollows: true, notifyMentions: true, notifyMessages: true, notifyLiveStreams: true },
      }),
      this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { notificationsOn: true },
      }),
      params.actorId
        ? this.prisma.block.findFirst({
            where: {
              OR: [
                { blockerId: params.userId, blockedId: params.actorId },
                { blockedId: params.userId, blockerId: params.actorId },
              ],
            },
          })
        : Promise.resolve(null),
      params.actorId
        ? this.prisma.mute.findFirst({
            where: { userId: params.userId, mutedId: params.actorId },
          })
        : Promise.resolve(null),
    ]);

    // Check user's per-type notification settings
    if (settings) {
      const typeToSetting: Record<string, keyof typeof settings> = {
        LIKE: 'notifyLikes', REEL_LIKE: 'notifyLikes', VIDEO_LIKE: 'notifyLikes',
        COMMENT: 'notifyComments', REEL_COMMENT: 'notifyComments', VIDEO_COMMENT: 'notifyComments', REPLY: 'notifyComments', THREAD_REPLY: 'notifyComments',
        FOLLOW: 'notifyFollows', FOLLOW_REQUEST: 'notifyFollows', FOLLOW_REQUEST_ACCEPTED: 'notifyFollows',
        MENTION: 'notifyMentions', TAG: 'notifyMentions',
        MESSAGE: 'notifyMessages', STORY_REPLY: 'notifyMessages',
        LIVE_STARTED: 'notifyLiveStreams',
        REPOST: 'notifyLikes', QUOTE_POST: 'notifyComments',
        CHANNEL_POST: 'notifyFollows', VIDEO_PUBLISHED: 'notifyFollows',
        POLL_VOTE: 'notifyComments', COLLAB_INVITE: 'notifyMentions',
      };
      const settingKey = typeToSetting[params.type];
      if (settingKey && settings[settingKey] === false) return null;
    }

    // Check if user has global notifications disabled
    if (user && !user.notificationsOn) return null;

    // Don't notify if recipient has blocked or muted the actor
    if (blockExists || muteExists) return null;

    // Redis-based deduplication: suppress identical notifications within 5 minutes
    // Use content target ID for content notifications, or actorId+title hash for system notifications
    const targetId = params.postId || params.threadId || params.reelId || params.videoId
      || params.commentId || params.conversationId || params.followRequestId
      || (params.actorId ? `actor:${params.actorId}:${(params.title || '').slice(0, 20)}` : 'none');
    const dedupeKey = `notif_dedup:${params.userId}:${params.type}:${targetId}`;
    try {
      const exists = await this.redis.get(dedupeKey);
      if (exists) {
        this.logger.debug(`Duplicate notification suppressed: ${dedupeKey}`);
        return null;
      }
    } catch (e) {
      // Redis failure should not block notification creation
      this.logger.debug('Redis dedup check failed, proceeding with creation', e);
    }

    // Finding #204: Notification batching — group similar notifications
    // If same type + same target content within 30 min, update existing instead of creating new
    const batchableTypes = ['LIKE', 'REEL_LIKE', 'VIDEO_LIKE', 'COMMENT', 'REEL_COMMENT'];
    const contentId = params.postId || params.reelId || params.videoId || params.threadId;
    if (batchableTypes.includes(params.type) && contentId) {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: params.userId,
          type: params.type as NotificationType,
          ...(params.postId ? { postId: params.postId } : {}),
          ...(params.reelId ? { reelId: params.reelId } : {}),
          ...(params.videoId ? { videoId: params.videoId } : {}),
          createdAt: { gte: thirtyMinAgo },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        // Batch: update the existing notification body to show aggregated count
        const countKey = `notif_batch:${existing.id}`;
        const count = await atomicIncr(this.redis, countKey, 1800);

        // If re-marking a read notification as unread, invalidate the cached unread count
        const wasRead = existing.isRead;

        // Build grammatically correct batched body
        // "Alice and 3 others liked your post" instead of "Alice liked your post and 3 others"
        const actionMap: Record<string, string> = {
          LIKE: 'liked your post', REEL_LIKE: 'liked your reel', VIDEO_LIKE: 'liked your video',
          COMMENT: 'commented on your post', REEL_COMMENT: 'commented on your reel',
        };
        const action = actionMap[params.type] || '';
        const batchedBody = count > 0 && action
          ? `and ${count} ${count === 1 ? 'other' : 'others'} ${action}`
          : (params.body || '');

        await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            body: batchedBody,
            actorId: params.actorId, // Update to latest actor
            isRead: false, // Mark unread again
            createdAt: new Date(), // Bump to top
          },
        });

        if (wasRead) {
          this.redis.del(`notif_unread:${params.userId}`).catch((err) => this.logger.debug('Redis unread count cache invalidation failed', err?.message));
        }

        return existing;
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        actorId: params.actorId,
        type: params.type as NotificationType,
        postId: params.postId,
        threadId: params.threadId,
        commentId: params.commentId,
        reelId: params.reelId,
        videoId: params.videoId,
        conversationId: params.conversationId,
        followRequestId: params.followRequestId,
        title: params.title,
        body: params.body,
      },
    });

    // Set Redis dedup key with 5 minute TTL (non-blocking)
    this.redis.set(dedupeKey, '1', 'EX', 300).catch((e) =>
      this.logger.debug('Redis dedup set failed', e),
    );

    // Fire push notification via queue (durable retry) or direct fallback
    if (this.queueService) {
      this.queueService.addPushNotificationJob({ notificationId: notification.id })
        .catch((e) => {
          this.logger.warn('Queue push job failed, falling back to direct push', e instanceof Error ? e.message : e);
          this.pushTrigger.triggerPush(notification.id).catch((e2) => this.logger.error('Direct push fallback failed', e2));
        });
    } else {
      this.pushTrigger.triggerPush(notification.id).catch((e) => this.logger.error('Push trigger failed', e));
    }

    // Emit real-time socket notification to the user's room (C-03: socket delivery)
    // The ChatGateway joins users to `user:{userId}` rooms on connect.
    // We publish to a Redis channel; the gateway subscribes and emits to the socket room.
    this.redis.publish('notification:new', JSON.stringify({
      userId: params.userId,
      notification: {
        id: notification.id,
        type: notification.type,
        actorId: notification.actorId,
        postId: notification.postId,
        threadId: notification.threadId,
        reelId: notification.reelId,
        videoId: notification.videoId,
        commentId: notification.commentId,
        conversationId: notification.conversationId,
        title: params.title,
        body: params.body,
        createdAt: notification.createdAt,
      },
    })).catch((e) => this.logger.debug('Redis notification publish failed', e));

    return notification;
  }

  /**
   * Build conditional content relation includes based on notification filter.
   * For 'mentions' filter: only post/thread (MENTION/REPLY/THREAD_REPLY never have reel/video).
   * For 'all'/'verified': include all content relations since mixed types appear.
   */
  private buildContentIncludes(filter?: 'all' | 'mentions' | 'verified'): Record<string, unknown> {
    const postSelect = { select: { id: true, thumbnailUrl: true, mediaUrls: true } };
    const reelSelect = { select: { id: true, thumbnailUrl: true } };
    const threadSelect = { select: { id: true, mediaUrls: true } };
    const videoSelect = { select: { id: true, thumbnailUrl: true } };

    if (filter === 'mentions') {
      // MENTION, REPLY, THREAD_REPLY — only post and thread are relevant
      return {
        post: postSelect,
        thread: threadSelect,
      };
    }

    // For 'all', 'verified', or undefined — include all content relations
    return {
      post: postSelect,
      reel: reelSelect,
      thread: threadSelect,
      video: videoSelect,
    };
  }

  // Finding #363: Group notification summary — aggregate notifications by type+content
  async getGroupedNotifications(userId: string, cursor?: string, limit = 20) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Validate cursor is a valid date string
    if (cursor && isNaN(new Date(cursor).getTime())) {
      throw new NotFoundException('Invalid cursor');
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        createdAt: { gte: oneDayAgo },
        ...(cursor ? { createdAt: { lt: new Date(cursor), gte: oneDayAgo } } : {}),
      },
      include: {
        actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit * 3, 100), // Adaptive: fetch 3x groups needed, cap at 100
    });

    // Group by type + content target (postId/reelId/threadId)
    const groups = new Map<string, { type: string; targetId: string | null; actors: Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }>; count: number; latestAt: Date; notificationId: string }>();

    for (const n of notifications) {
      const targetId = n.postId || n.reelId || n.threadId || n.videoId || '';
      const key = `${n.type}:${targetId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        if (n.actor && existing.actors.length < 3) {
          existing.actors.push(n.actor);
        }
      } else {
        groups.set(key, {
          type: n.type,
          targetId: targetId || null,
          actors: n.actor ? [n.actor] : [],
          count: 1,
          latestAt: n.createdAt,
          notificationId: n.id,
        });
      }
    }

    const grouped = [...groups.values()]
      .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime())
      .slice(0, limit);

    return {
      data: grouped,
      meta: { hasMore: groups.size > limit },
    };
  }

  /**
   * M-07: Notification cleanup/retention cron
   * Deletes read notifications older than 90 days.
   * Runs at 3 AM daily (low-traffic window) to minimize DB impact.
   */
  @Cron('0 30 3 * * *') // 3:30 AM daily (staggered from other 3 AM crons)
  async cleanupOldNotifications(): Promise<number> {
    try {
      if (!await acquireCronLock(this.redis, 'cron:cleanupOldNotifications', 3500, this.logger)) return 0;
      const readCutoff = new Date();
      readCutoff.setDate(readCutoff.getDate() - 90);

      // Also clean up unread notifications older than 1 year to prevent unbounded growth (B10#3)
      const unreadCutoff = new Date();
      unreadCutoff.setDate(unreadCutoff.getDate() - 365);

      const BATCH_SIZE = 10000;
      let totalDeleted = 0;

      // Delete old read notifications (90 days)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await this.prisma.notification.findMany({
          where: { isRead: true, createdAt: { lt: readCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });

        if (batch.length === 0) break;

        const result = await this.prisma.notification.deleteMany({
          where: { id: { in: batch.map(n => n.id) } },
        });
        totalDeleted += result.count;

        if (batch.length < BATCH_SIZE) break;
      }

      // Delete old unread notifications (1 year) — prevents unbounded growth
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await this.prisma.notification.findMany({
          where: { isRead: false, createdAt: { lt: unreadCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });

        if (batch.length === 0) break;

        const result = await this.prisma.notification.deleteMany({
          where: { id: { in: batch.map(n => n.id) } },
        });
        totalDeleted += result.count;

        if (batch.length < BATCH_SIZE) break;
      }

      if (totalDeleted > 0) {
        this.logger.log(`Cleaned up ${totalDeleted} old notification(s)`);
      }

      return totalDeleted;
    } catch (error) {
      this.logger.error('cleanupOldNotifications cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }
}
