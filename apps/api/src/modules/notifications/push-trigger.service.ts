import { Injectable, Logger } from '@nestjs/common';
import { PushService } from './push.service';
import { PrismaService } from '../../config/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class PushTriggerService {
  private readonly logger = new Logger(PushTriggerService.name);

  constructor(
    private push: PushService,
    private prisma: PrismaService,
  ) {}

  // Called after a notification is created in the DB
  async triggerPush(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { actor: true },
    });
    if (!notification) {
      this.logger.warn(`Notification ${notificationId} not found`);
      return;
    }

    const actorName = notification.actor?.displayName || 'Someone';

    switch (notification.type) {
      case NotificationType.LIKE:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildLikeNotification(actorName, notification.postId),
          );
        }
        break;
      case NotificationType.COMMENT:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildCommentNotification(
              actorName,
              notification.postId,
              notification.body || '',
            ),
          );
        }
        break;
      case NotificationType.FOLLOW:
        if (notification.actorId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildFollowNotification(actorName, notification.actorId),
          );
        }
        break;
      case NotificationType.MESSAGE:
        if (notification.conversationId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildMessageNotification(
              actorName,
              notification.conversationId,
              notification.body || '',
            ),
          );
        }
        break;
      case NotificationType.MENTION:
        // Could be mention in post or thread
        const targetId = notification.postId || notification.threadId || '';
        const targetType = notification.postId ? 'post' : 'thread';
        await this.sendSafe(
          notification.userId,
          this.push.buildMentionNotification(actorName, targetId, targetType),
        );
        break;
      case NotificationType.THREAD_REPLY:
      case NotificationType.REPLY:
        // Similar to comment but for threads
        if (notification.threadId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildCommentNotification(
              actorName,
              notification.threadId,
              notification.body || '',
            ),
          );
        }
        break;
      case NotificationType.FOLLOW_REQUEST:
      case NotificationType.FOLLOW_REQUEST_ACCEPTED:
        // Use generic notification with title/body if present
        if (notification.title || notification.body) {
          await this.sendSafe(notification.userId, {
            title: notification.title || 'Follow request',
            body: notification.body || '',
          });
        }
        break;
      // Add more types as needed
      default:
        // For other types, send generic notification if title/body present
        if (notification.title || notification.body) {
          await this.sendSafe(notification.userId, {
            title: notification.title || 'New notification',
            body: notification.body || '',
          });
        }
        this.logger.debug(`No push mapping for type ${notification.type}`);
    }
  }

  private async sendSafe(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    try {
      await this.push.sendToUser(userId, notification);
    } catch (error) {
      this.logger.error(
        `Failed to send push to user ${userId}: ${error.message}`,
        error.stack,
      );
    }
  }
}