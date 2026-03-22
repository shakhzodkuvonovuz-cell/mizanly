import { Injectable, NotFoundException, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PushTriggerService } from './push-trigger.service';
import { NotificationType, Prisma } from '@prisma/client';
import Redis from 'ioredis';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private prisma: PrismaService,
    private pushTrigger: PushTriggerService,
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
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException();

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
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

  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException();

    await this.prisma.notification.delete({ where: { id: notificationId } });
    return { deleted: true };
  }

  // Internal helper — used by other services to create notifications
  async create(params: {
    userId: string;
    actorId: string;
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
    if (params.userId === params.actorId) return null; // No self-notifications

    // Validate notification type at runtime (internal callers pass string literals)
    const validTypes = Object.values(NotificationType);
    if (!validTypes.includes(params.type as NotificationType)) {
      this.logger.warn(`Invalid notification type: ${params.type}`);
      return null;
    }

    // Fetch all pre-creation checks in parallel: settings, user prefs, block/mute
    const [settings, user, blockExists, muteExists] = await Promise.all([
      this.prisma.settings.findUnique({
        where: { userId: params.userId },
        select: { notifyLikes: true, notifyComments: true, notifyFollows: true, notifyMentions: true, notifyMessages: true, notifyLiveStreams: true },
      }),
      this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { notificationsOn: true },
      }),
      this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: params.userId, blockedId: params.actorId },
            { blockedId: params.userId, blockerId: params.actorId },
          ],
        },
      }),
      this.prisma.mute.findFirst({
        where: { userId: params.userId, mutedId: params.actorId },
      }),
    ]);

    // Check user's per-type notification settings
    if (settings) {
      const typeToSetting: Record<string, keyof typeof settings> = {
        LIKE: 'notifyLikes', REEL_LIKE: 'notifyLikes', VIDEO_LIKE: 'notifyLikes',
        COMMENT: 'notifyComments', REEL_COMMENT: 'notifyComments', VIDEO_COMMENT: 'notifyComments', REPLY: 'notifyComments', THREAD_REPLY: 'notifyComments',
        FOLLOW: 'notifyFollows', FOLLOW_REQUEST: 'notifyFollows', FOLLOW_REQUEST_ACCEPTED: 'notifyFollows',
        MENTION: 'notifyMentions',
        MESSAGE: 'notifyMessages', STORY_REPLY: 'notifyMessages',
        LIVE_STARTED: 'notifyLiveStreams',
      };
      const settingKey = typeToSetting[params.type];
      if (settingKey && settings[settingKey] === false) return null;
    }

    // Check if user has global notifications disabled
    if (user && !user.notificationsOn) return null;

    // Don't notify if recipient has blocked or muted the actor
    if (blockExists || muteExists) return null;

    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        actorId: params.actorId,
        type: params.type as NotificationType, // Validated above via Object.values check
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

    // Fire push notification (non-blocking, logged on failure)
    this.pushTrigger.triggerPush(notification.id).catch((e) => this.logger.error('Push trigger failed', e));

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
}
