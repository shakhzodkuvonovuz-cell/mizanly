import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// Expo push notification API (no SDK needed, just HTTP)
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100;

interface ExpoPushMessage {
  to: string;          // ExpoPushToken
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  // Send push to a specific user (fetches their device tokens)
  async sendToUser(userId: string, notification: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    const tokens = await this.getActiveTokensForUser(userId);
    if (tokens.length === 0) {
      this.logger.debug(`No active device tokens for user ${userId}`);
      return;
    }

    // Fetch unread count for badge
    const badgeCount = await this.getUnreadCountForUser(userId);

    const messages = tokens.map(token => ({
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default' as const,
      badge: badgeCount,
      priority: 'high' as const,
    }));
    await this.sendBatch(messages);
  }

  // Send push to multiple users
  async sendToUsers(userIds: string[], notification: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    const tokens = await this.getActiveTokensForUsers(userIds);
    if (tokens.length === 0) {
      this.logger.debug(`No active device tokens for users ${userIds.join(',')}`);
      return;
    }
    const messages = tokens.map(token => ({
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default' as const,
      priority: 'high' as const,
    }));
    await this.sendBatch(messages);
  }

  // Batch send (Expo supports up to 100 per request)
  private async sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const batches: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
      batches.push(messages.slice(i, i + MAX_BATCH_SIZE));
    }
    const allTickets: ExpoPushTicket[] = [];
    for (const batch of batches) {
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(batch),
        });
        if (!response.ok) {
          this.logger.error(`Expo push API responded with status ${response.status}: ${await response.text()}`);
          continue;
        }
        // Expo returns { data: ExpoPushTicket[] }
        const result = await response.json();
        const tickets: ExpoPushTicket[] = result.data || result;
        await this.handlePushResponse(batch, tickets);
        allTickets.push(...tickets);
      } catch (error) {
        this.logger.error(`Failed to send push batch: ${error.message}`, error.stack);
      }
    }
    return allTickets;
  }

  // Handle Expo push response, deactivate invalid tokens
  private async handlePushResponse(batch: ExpoPushMessage[], tickets: ExpoPushTicket[]): Promise<void> {
    const invalidTokens: string[] = [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'error') {
        const error = ticket.details?.error;
        if (error === 'DeviceNotRegistered' || error === 'InvalidCredentials') {
          // Token is expired or invalid, mark device inactive
          invalidTokens.push(batch[index].to);
        }
        this.logger.warn(`Push ticket error: ${error}`, ticket.message);
      }
    });
    if (invalidTokens.length > 0) {
      await this.deactivateTokens(invalidTokens);
    }
  }

  // Deactivate expired/invalid device tokens
  private async deactivateTokens(tokens: string[]): Promise<void> {
    try {
      await this.prisma.device.updateMany({
        where: { pushToken: { in: tokens } },
        data: { isActive: false },
      });
      this.logger.log(`Deactivated ${tokens.length} invalid device tokens`);
    } catch (error) {
      this.logger.error(`Failed to deactivate tokens: ${error.message}`, error.stack);
    }
  }

  // Fetch active device tokens for a single user
  private async getActiveTokensForUser(userId: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId, isActive: true },
      select: { pushToken: true },
      take: 50,
    });
    return devices.map(d => d.pushToken);
  }

  // Fetch active device tokens for multiple users
  private async getActiveTokensForUsers(userIds: string[]): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId: { in: userIds }, isActive: true },
      select: { pushToken: true },
      take: 1000,
    });
    return devices.map(d => d.pushToken);
  }

  // Get unread notification count for badge
  private async getUnreadCountForUser(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({
        where: { userId, isRead: false },
      });
    } catch {
      return 0;
    }
  }

  // Build notification for different types

  buildLikeNotification(actorName: string, postId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New like',
      body: `${actorName} liked your post`,
      data: { type: 'like', postId, actorName },
    };
  }

  buildCommentNotification(actorName: string, postId: string, preview: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New comment',
      body: `${actorName} commented: ${preview}`,
      data: { type: 'comment', postId, actorName, preview },
    };
  }

  buildFollowNotification(actorName: string, userId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New follower',
      body: `${actorName} started following you`,
      data: { type: 'follow', userId, actorName },
    };
  }

  buildMessageNotification(senderName: string, conversationId: string, preview: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New message',
      body: `${senderName}: ${preview}`,
      data: { type: 'message', conversationId, senderName, preview },
    };
  }

  buildMentionNotification(actorName: string, targetId: string, targetType: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'You were mentioned',
      body: `${actorName} mentioned you in a ${targetType}`,
      data: { type: 'mention', targetId, targetType, actorName },
    };
  }

  buildRepostNotification(actorName: string, postId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Repost',
      body: `${actorName} reposted your post`,
      data: { type: 'repost', postId, actorName },
    };
  }

  buildQuotePostNotification(actorName: string, postId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Quote post',
      body: `${actorName} quoted your post`,
      data: { type: 'quote_post', postId, actorName },
    };
  }

  buildReelLikeNotification(actorName: string, reelId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New like',
      body: `${actorName} liked your reel`,
      data: { type: 'reel_like', reelId, actorName },
    };
  }

  buildReelCommentNotification(actorName: string, reelId: string, preview: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New comment',
      body: `${actorName} commented on your reel: ${preview}`,
      data: { type: 'comment', reelId, actorName, preview },
    };
  }

  buildVideoLikeNotification(actorName: string, videoId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New like',
      body: `${actorName} liked your video`,
      data: { type: 'video_like', videoId, actorName },
    };
  }

  buildVideoCommentNotification(actorName: string, videoId: string, preview: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New comment',
      body: `${actorName} commented on your video: ${preview}`,
      data: { type: 'comment', videoId, actorName, preview },
    };
  }

  buildVideoPublishedNotification(actorName: string, videoId: string, videoTitle: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New video',
      body: `${actorName} published: ${videoTitle}`,
      data: { type: 'video_published', videoId, actorName },
    };
  }

  buildLiveStartedNotification(actorName: string, liveId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Live now',
      body: `${actorName} is live now!`,
      data: { type: 'live', videoId: liveId, actorName },
    };
  }

  buildChannelPostNotification(actorName: string, channelName: string, postId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: channelName,
      body: `${actorName} posted in ${channelName}`,
      data: { type: 'channel_post', postId, actorName },
    };
  }

  buildStoryReplyNotification(actorName: string, preview: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Story reply',
      body: `${actorName} replied to your story: ${preview}`,
      data: { type: 'message', actorName, preview },
    };
  }

  buildCircleInviteNotification(actorName: string, circleName: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Circle invite',
      body: `${actorName} invited you to join ${circleName}`,
      data: { type: 'system', actorName, circleName },
    };
  }

  buildCircleJoinNotification(actorName: string, circleName: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New member',
      body: `${actorName} joined ${circleName}`,
      data: { type: 'system', actorName, circleName },
    };
  }

  buildPollVoteNotification(actorName: string, postId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Poll vote',
      body: `${actorName} voted on your poll`,
      data: { type: 'poll_vote', postId, actorName },
    };
  }

  buildTipNotification(senderName: string, amount: number): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'New tip',
      body: `${senderName} sent you a tip of $${amount.toFixed(2)}`,
      data: { type: 'tip', senderName, amount: amount.toString() },
    };
  }

  buildEventNotification(eventTitle: string, eventId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Event reminder',
      body: `Event "${eventTitle}" is starting soon`,
      data: { type: 'event', eventId, eventTitle },
    };
  }

  buildPrayerNotification(prayerName: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Prayer time',
      body: `It's time for ${prayerName}`,
      data: { type: 'prayer', prayerName },
    };
  }
}
