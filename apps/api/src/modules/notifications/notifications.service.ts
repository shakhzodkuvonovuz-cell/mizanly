import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getNotifications(userId: string, filter?: 'all' | 'mentions' | 'verified', cursor?: string, limit = 30) {
    let where: any = { recipientId: userId };
    if (filter === 'mentions') where.type = { in: ['MENTION'] };
    if (filter === 'verified') where.actor = { isVerified: true };

    return this.prisma.notification.findMany({
      where,
      include: {
        actor: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId: userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { recipientId: userId, read: false } });
    return { unread: count };
  }

  async create(recipientId: string, actorId: string, type: string, targetType?: string, targetId?: string) {
    if (recipientId === actorId) return null; // Don't self-notify
    return this.prisma.notification.create({
      data: { recipientId, actorId, type: type as any, targetType, targetId },
    });
  }
}
