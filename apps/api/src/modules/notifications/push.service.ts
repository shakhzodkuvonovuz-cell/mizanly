import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';

// Expo push notification API (no SDK needed, just HTTP)
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100;

// ── Push notification i18n templates ────────────────────────────
// TODO: User model has no `locale` field yet. When added (e.g. `locale String @default("en")`),
// fetch user.locale before constructing notifications and use these templates.
// For now, templates are defined and ready; the lookup falls back to 'en'.
const NOTIFICATION_TEMPLATES: Record<string, Record<string, { title: string; body: string }>> = {
  LIKE: {
    en: { title: 'New Like', body: '{{actor}} liked your post' },
    ar: { title: '\u0625\u0639\u062C\u0627\u0628 \u062C\u062F\u064A\u062F', body: '{{actor}} \u0623\u0639\u062C\u0628 \u0628\u0645\u0646\u0634\u0648\u0631\u0643' },
    tr: { title: 'Yeni Be\u011Feni', body: '{{actor}} g\u00F6nderini be\u011Fendi' },
  },
  COMMENT: {
    en: { title: 'New Comment', body: '{{actor}} commented: {{preview}}' },
    ar: { title: '\u062A\u0639\u0644\u064A\u0642 \u062C\u062F\u064A\u062F', body: '{{actor}} \u0639\u0644\u0651\u0642: {{preview}}' },
    tr: { title: 'Yeni Yorum', body: '{{actor}} yorum yapt\u0131: {{preview}}' },
  },
  FOLLOW: {
    en: { title: 'New Follower', body: '{{actor}} started following you' },
    ar: { title: '\u0645\u062A\u0627\u0628\u0639 \u062C\u062F\u064A\u062F', body: '{{actor}} \u0628\u062F\u0623 \u0645\u062A\u0627\u0628\u0639\u062A\u0643' },
    tr: { title: 'Yeni Takip\u00E7i', body: '{{actor}} seni takip etmeye ba\u015Flad\u0131' },
  },
  MESSAGE: {
    en: { title: 'New Message', body: '{{actor}}: {{preview}}' },
    ar: { title: '\u0631\u0633\u0627\u0644\u0629 \u062C\u062F\u064A\u062F\u0629', body: '{{actor}}: {{preview}}' },
    tr: { title: 'Yeni Mesaj', body: '{{actor}}: {{preview}}' },
  },
  MENTION: {
    en: { title: 'You Were Mentioned', body: '{{actor}} mentioned you in a {{targetType}}' },
    ar: { title: '\u062A\u0645\u062A \u0627\u0644\u0625\u0634\u0627\u0631\u0629 \u0625\u0644\u064A\u0643', body: '{{actor}} \u0623\u0634\u0627\u0631 \u0625\u0644\u064A\u0643 \u0641\u064A {{targetType}}' },
    tr: { title: 'Bahsedildiniz', body: '{{actor}} bir {{targetType}} i\u00E7inde senden bahsetti' },
  },
  PRAYER: {
    en: { title: 'Prayer Time', body: "It's time for {{prayerName}}" },
    ar: { title: '\u0648\u0642\u062A \u0627\u0644\u0635\u0644\u0627\u0629', body: '\u062D\u0627\u0646 \u0648\u0642\u062A \u0635\u0644\u0627\u0629 {{prayerName}}' },
    tr: { title: 'Namaz Vakti', body: '{{prayerName}} namaz\u0131 vakti geldi' },
  },
};

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
  private readonly expoAccessToken: string;

  constructor(
    private prisma: PrismaService,
    private circuitBreaker: CircuitBreakerService,
    private config: ConfigService,
  ) {
    this.expoAccessToken = this.config.get<string>('this.expoAccessToken', '');
    if (!this.expoAccessToken) {
      this.logger.warn('this.expoAccessToken not set — push notifications will use unauthenticated mode (higher rate limits from Expo)');
    }
  }

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

  // Send push to multiple users with per-user badge counts
  async sendToUsers(userIds: string[], notification: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    // Fetch tokens grouped by userId so we can assign correct badge per user
    const devices = await this.prisma.device.findMany({
      where: { userId: { in: userIds }, isActive: true, pushToken: { not: '' } },
      select: { pushToken: true, userId: true },
    });
    if (devices.length === 0) {
      this.logger.debug(`No active device tokens for users ${userIds.join(',')}`);
      return;
    }

    // Batch-fetch unread counts for all users
    const uniqueUserIds = [...new Set(devices.map(d => d.userId))];
    const unreadCounts = await this.prisma.notification.groupBy({
      by: ['userId'],
      where: { userId: { in: uniqueUserIds }, isRead: false },
      _count: true,
    });
    const countMap = new Map(unreadCounts.map(c => [c.userId, c._count]));

    const messages = devices.map(device => ({
      to: device.pushToken,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default' as const,
      badge: countMap.get(device.userId) ?? 1,
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
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        // Include Expo access token for authenticated push requests
        // (reduces rate-limiting risk and prevents token abuse)
        if (this.expoAccessToken) {
          headers['Authorization'] = `Bearer ${this.expoAccessToken}`;
        }
        const response = await this.circuitBreaker.exec('expo-push', () =>
          fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(batch),
          }).then(async (r) => {
            if (!r.ok) {
              throw new InternalServerErrorException(`Expo push API responded with status ${r.status}: ${await r.text()}`);
            }
            return r;
          }),
        );
        // Expo returns { data: ExpoPushTicket[] }
        const result: { data?: Array<{ status: string; id?: string; message?: string; details?: { error: string } }> } = await response.json();
        const tickets: ExpoPushTicket[] = (result.data ?? []) as ExpoPushTicket[];
        await this.handlePushResponse(batch, tickets);
        allTickets.push(...tickets);
      } catch (error) {
        this.logger.error(`Failed to send push batch: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
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
        if (error === 'DeviceNotRegistered' || error === 'InvalidCredentials' || error === 'MismatchSenderId') {
          invalidTokens.push(batch[index].to);
        }
        if (error === 'MessageTooBig') {
          this.logger.error(`Push message too big for token ${batch[index].to}`);
        } else if (error === 'MessageRateExceeded') {
          this.logger.warn(`Push rate exceeded for token ${batch[index].to}`);
        } else {
          this.logger.warn(`Push ticket error: ${error}`, ticket.message);
        }
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
      this.logger.error(`Failed to deactivate tokens: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
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
    } catch (err) {
      this.logger.warn('Unread count query failed', err instanceof Error ? err.message : String(err));
      return 0;
    }
  }

  // ── i18n template resolution ─────────────────────────────────
  // Resolves a localized notification template, falling back to 'en'.
  // TODO: Once User model has `locale` field, pass user locale here.
  getLocalizedTemplate(
    type: string,
    locale: string,
    vars: Record<string, string>,
  ): { title: string; body: string } | null {
    const templates = NOTIFICATION_TEMPLATES[type];
    if (!templates) return null;

    const tpl = templates[locale] || templates['en'];
    if (!tpl) return null;

    let { title, body } = tpl;
    for (const [key, value] of Object.entries(vars)) {
      title = title.replace(`{{${key}}}`, value);
      body = body.replace(`{{${key}}}`, value);
    }
    return { title, body };
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

  buildMessageNotification(senderName: string, conversationId: string, preview: string, isE2E = false): { title: string; body: string; data: Record<string, string> } {
    // E2E-encrypted conversations: generic body to avoid leaking plaintext to APNs/FCM
    const body = isE2E ? `${senderName} sent you a message` : `${senderName}: ${preview}`;
    return {
      title: 'New message',
      body,
      data: { type: 'message', conversationId, senderName },
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

  buildStoryReplyNotification(actorName: string, _preview: string): { title: string; body: string; data: Record<string, string> } {
    // Generic body — story replies may contain sensitive content
    return {
      title: 'Story reply',
      body: `${actorName} replied to your story`,
      data: { type: 'message', actorName },
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

  buildPollVoteNotification(actorName: string, targetId: string): { title: string; body: string; data: Record<string, string> } {
    return {
      title: 'Poll vote',
      body: `${actorName} voted on your poll`,
      data: { type: 'poll_vote', targetId, actorName },
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
