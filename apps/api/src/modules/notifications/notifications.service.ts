import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { PushTriggerService } from './push-trigger.service';
import { NotificationType } from '@prisma/client';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private prisma: PrismaService,
    private devices: DevicesService,
    private pushTrigger: PushTriggerService,
  ) {}

  async getNotifications(
    userId: string,
    filter?: 'all' | 'mentions' | 'verified',
    cursor?: string,
    limit = 30,
  ) {
    const where: any = { userId };

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

    // Fire push notification (non-blocking)
    this.pushTrigger.triggerPush(notification.id).catch(() => {});

    return notification;
  }
}
