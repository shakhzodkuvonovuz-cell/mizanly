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

    // Check if user has push notifications muted for this type
    const actorName = notification.actor?.displayName || 'Someone';

    switch (notification.type) {
      case NotificationType.LIKE:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildLikeNotification(actorName, notification.postId),
          );
        } else if (notification.threadId) {
          await this.sendSafe(notification.userId, {
            title: 'Like',
            body: `${actorName} liked your thread`,
            data: { type: 'like', threadId: notification.threadId, actorName },
          });
        }
        break;

      case NotificationType.COMMENT:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildCommentNotification(
              actorName,
              notification.postId || notification.reelId!,
              this.truncate(notification.body || '', 80),
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

      case NotificationType.FOLLOW_REQUEST:
        await this.sendSafe(notification.userId, {
          title: 'Follow request',
          body: `${actorName} requested to follow you`,
          data: { type: 'follow', userId: notification.actorId || '', actorName },
        });
        break;

      case NotificationType.FOLLOW_REQUEST_ACCEPTED:
        await this.sendSafe(notification.userId, {
          title: 'Follow request accepted',
          body: `${actorName} accepted your follow request`,
          data: { type: 'follow', userId: notification.actorId || '', actorName },
        });
        break;

      case NotificationType.MESSAGE:
        if (notification.conversationId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildMessageNotification(
              actorName,
              notification.conversationId,
              this.truncate(notification.body || '', 80),
            ),
          );
        }
        break;

      case NotificationType.MENTION: {
        const targetId = notification.postId || notification.threadId || '';
        const targetType = notification.postId ? 'post' : 'thread';
        await this.sendSafe(
          notification.userId,
          this.push.buildMentionNotification(actorName, targetId, targetType),
        );
        break;
      }

      case NotificationType.THREAD_REPLY:
      case NotificationType.REPLY:
        if (notification.threadId) {
          await this.sendSafe(notification.userId, {
            title: 'New reply',
            body: `${actorName} replied: ${this.truncate(notification.body || '', 80)}`,
            data: { type: 'comment', threadId: notification.threadId, actorName },
          });
        }
        break;

      case NotificationType.REPOST:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildRepostNotification(actorName, notification.postId),
          );
        } else if (notification.threadId) {
          await this.sendSafe(notification.userId, {
            title: 'Repost',
            body: `${actorName} reposted your thread`,
            data: { type: 'repost', threadId: notification.threadId, actorName },
          });
        }
        break;

      case NotificationType.QUOTE_POST:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildQuotePostNotification(actorName, notification.postId),
          );
        }
        break;

      case NotificationType.CHANNEL_POST:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildChannelPostNotification(actorName, notification.title || 'Channel', notification.postId),
          );
        }
        break;

      case NotificationType.LIVE_STARTED:
        if (notification.videoId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildLiveStartedNotification(actorName, notification.videoId),
          );
        }
        break;

      case NotificationType.VIDEO_PUBLISHED:
        if (notification.videoId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildVideoPublishedNotification(actorName, notification.videoId, notification.title || ''),
          );
        }
        break;

      case NotificationType.REEL_LIKE:
        if (notification.reelId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildReelLikeNotification(actorName, notification.reelId),
          );
        }
        break;

      case NotificationType.REEL_COMMENT:
        if (notification.reelId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildReelCommentNotification(actorName, notification.reelId, this.truncate(notification.body || '', 80)),
          );
        }
        break;

      case NotificationType.VIDEO_LIKE:
        if (notification.videoId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildVideoLikeNotification(actorName, notification.videoId),
          );
        }
        break;

      case NotificationType.VIDEO_COMMENT:
        if (notification.videoId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildVideoCommentNotification(actorName, notification.videoId, this.truncate(notification.body || '', 80)),
          );
        }
        break;

      case NotificationType.STORY_REPLY:
        await this.sendSafe(
          notification.userId,
          this.push.buildStoryReplyNotification(actorName, this.truncate(notification.body || '', 80)),
        );
        break;

      case NotificationType.POLL_VOTE:
        if (notification.postId) {
          await this.sendSafe(
            notification.userId,
            this.push.buildPollVoteNotification(actorName, notification.postId),
          );
        }
        break;

      case NotificationType.CIRCLE_INVITE:
        await this.sendSafe(
          notification.userId,
          this.push.buildCircleInviteNotification(actorName, notification.title || 'a circle'),
        );
        break;

      case NotificationType.CIRCLE_JOIN:
        await this.sendSafe(
          notification.userId,
          this.push.buildCircleJoinNotification(actorName, notification.title || 'your circle'),
        );
        break;

      case NotificationType.SYSTEM:
        if (notification.title || notification.body) {
          await this.sendSafe(notification.userId, {
            title: notification.title || 'Mizanly',
            body: notification.body || '',
            data: { type: 'system' },
          });
        }
        break;

      default:
        // Fallback for any future types — send generic if content exists
        if (notification.title || notification.body) {
          await this.sendSafe(notification.userId, {
            title: notification.title || 'New notification',
            body: notification.body || '',
          });
        }
        this.logger.debug(`No specific push mapping for type ${notification.type}, used generic`);
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
        `Failed to send push to user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '\u2026';
  }
}
