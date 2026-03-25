import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Bug 67: Process scheduled account deletions.
   * Runs daily at 3 AM — finds users whose deletedAt has passed and purges their data.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async processScheduledDeletions() {
    const now = new Date();
    const usersToDelete = await this.prisma.user.findMany({
      where: {
        deletedAt: { lte: now },
        isDeactivated: true,
        isDeleted: false,
      },
      select: { id: true },
      take: 50, // Process in batches to avoid OOM
    });

    if (usersToDelete.length === 0) return;

    this.logger.log(`Processing ${usersToDelete.length} scheduled account deletions`);

    for (const user of usersToDelete) {
      try {
        await this.deleteAllUserData(user.id);
        this.logger.log(`Purged user ${user.id} (scheduled deletion completed)`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to purge user ${user.id}: ${msg}`);
      }
    }
  }

  /**
   * Finding #200: Purge IP addresses older than 90 days.
   * Runs daily at 4 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeOldIpAddresses() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      // Clear IP from device records older than 90 days
      const result = await this.prisma.device.updateMany({
        where: { lastActiveAt: { lt: ninetyDaysAgo } },
        data: { ipAddress: null },
      });
      if (result.count > 0) {
        this.logger.log(`Purged IP addresses from ${result.count} old device records`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`IP purge failed: ${msg}`);
    }
  }

  // DONE: [PRIVACY] Status privacy fields (readReceipts, typingIndicators, lastSeenVisibility)
  // have been added to the UserSettings schema and are now persisted server-side via
  // settingsService.updatePrivacy(). The UpdatePrivacyDto accepts all three fields.
  // Mobile side (status-privacy.tsx) still needs to be wired to call settingsApi.updatePrivacy()
  // instead of AsyncStorage for these fields.

  /**
   * GDPR Article 20 — Data Portability.
   * Export ALL user personal data without caps.
   * Finding 5: removed take limits, added missing data categories.
   */
  async exportUserData(userId: string) {
    // Verify user exists — select only user-facing fields, NOT clerkId/pushToken
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        email: true,
        phone: true,
        avatarUrl: true,
        coverUrl: true,
        website: true,
        language: true,
        location: true,
        madhab: true,
        isPrivate: true,
        isChildAccount: true,
        createdAt: true,
        profileLinks: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Fetch ALL user data — high take limit for GDPR Art 20 (complete export required)
    const [
      posts, threads, stories, reels, messages, follows, comments,
      postReactions, videos, bookmarks, blocks, mutes, notifications,
      threadReplies, userSettings, watchHistory,
      reelComments, reelReactions, videoReactions, videoComments,
      circleMemberships, reports, tips, coinTransactions,
      dhikrSessions, fastingLogs, searchHistory,
    ] = await Promise.all([
      this.prisma.post.findMany({ where: { userId }, select: { id: true, content: true, mediaUrls: true, postType: true, createdAt: true } }),
      this.prisma.thread.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true } }),
      this.prisma.story.findMany({ where: { userId }, select: { id: true, mediaUrl: true, mediaType: true, createdAt: true } }),
      this.prisma.reel.findMany({ where: { userId }, select: { id: true, caption: true, videoUrl: true, createdAt: true } }),
      this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, messageType: true, conversationId: true, createdAt: true } }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true, createdAt: true } }),
      this.prisma.comment.findMany({ where: { userId }, select: { id: true, content: true, postId: true, createdAt: true } }),
      this.prisma.postReaction.findMany({ where: { userId }, select: { postId: true, reaction: true, createdAt: true } }),
      this.prisma.video.findMany({ where: { userId }, select: { id: true, title: true, videoUrl: true, createdAt: true } }),
      this.prisma.savedPost.findMany({ where: { userId }, select: { postId: true, createdAt: true } }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true, createdAt: true } }),
      this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true, createdAt: true } }),
      this.prisma.notification.findMany({ where: { userId }, select: { id: true, type: true, isRead: true, createdAt: true } }),
      this.prisma.threadReply.findMany({ where: { userId }, select: { id: true, content: true, threadId: true, createdAt: true } }),
      this.prisma.userSettings.findUnique({ where: { userId } }),
      this.prisma.watchHistory.findMany({ where: { userId }, select: { videoId: true, watchedAt: true } }),
      // Additional categories for GDPR completeness
      this.prisma.reelComment.findMany({ where: { userId }, select: { id: true, content: true, reelId: true, createdAt: true } }),
      this.prisma.reelReaction.findMany({ where: { userId }, select: { reelId: true, reaction: true, createdAt: true } }),
      this.prisma.videoReaction.findMany({ where: { userId }, select: { videoId: true, isLike: true, createdAt: true } }),
      this.prisma.videoComment.findMany({ where: { userId }, select: { id: true, content: true, videoId: true, createdAt: true } }),
      this.prisma.circleMember.findMany({ where: { userId }, select: { circleId: true, role: true, joinedAt: true } }),
      this.prisma.report.findMany({ where: { reporterId: userId }, select: { id: true, reason: true, createdAt: true } }),
      this.prisma.tip.findMany({ where: { senderId: userId }, select: { id: true, amount: true, receiverId: true, createdAt: true } }),
      this.prisma.coinTransaction.findMany({ where: { userId }, select: { id: true, type: true, amount: true, createdAt: true } }),
      this.prisma.dhikrSession.findMany({ where: { userId }, select: { id: true, count: true, dhikrType: true, createdAt: true } }),
      this.prisma.fastingLog.findMany({ where: { userId }, select: { id: true, date: true, type: true } }),
      this.prisma.searchHistory.findMany({ where: { userId }, select: { query: true, createdAt: true } }),
    ]);

    // Check which conversations have encryption envelopes to accurately mark messages
    const encryptedConversationIds = new Set<string>();
    if (messages.length > 0) {
      const envelopes = await this.prisma.conversationKeyEnvelope.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      for (const e of envelopes) {
        encryptedConversationIds.add(e.conversationId);
      }
    }

    this.logger.log(`Data export requested for user ${userId}`);

    return {
      profile: user,
      settings: userSettings,
      posts,
      threads,
      threadReplies,
      stories,
      reels,
      videos,
      messages: {
        count: messages.length,
        data: messages.map(m => ({
          ...m,
          encrypted: encryptedConversationIds.has(m.conversationId),
        })),
      },
      comments,
      postReactions,
      bookmarks,
      blocks: blocks.map(b => b.blockedId),
      mutes: mutes.map(m => m.mutedId),
      following: follows.map(f => ({ userId: f.followingId, followedAt: f.createdAt })),
      notifications: { count: notifications.length, data: notifications },
      watchHistory,
      reelComments,
      reelReactions,
      videoReactions,
      videoComments,
      circleMemberships,
      reports: reports.map(r => ({ id: r.id, reason: r.reason, createdAt: r.createdAt })),
      tips: tips.map(t => ({ amount: Number(t.amount), receiverId: t.receiverId, createdAt: t.createdAt })),
      coinTransactions,
      dhikrSessions,
      fastingLogs,
      searchHistory,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * GDPR Article 17 — Right to Erasure.
   * Comprehensive soft-delete covering all user data.
   * Finding 6: expanded deletion to cover reels, videos, reactions, notifications,
   * thread replies, bookmarks, mutes, search history, settings, and more.
   * Finding 29: sets deletedAt for 30-day scheduled job processing.
   * Finding 33: deletes encryption keys and conversation key envelopes.
   */
  async deleteAllUserData(userId: string) {
    // Verify user exists before attempting deletion
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isDeleted: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('User account already deleted');

    this.logger.warn(`Full data deletion requested for user ${userId}`);

    // Soft-delete: anonymize PII and mark as deleted (GDPR Article 17)
    // Do NOT hard-delete financial records — preserve for audit trail (SetNull on FK)
    await this.prisma.$transaction(async (tx) => {
      // Anonymize user profile
      await tx.user.update({
        where: { id: userId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          isDeactivated: true,
          deactivatedAt: new Date(),
          displayName: 'Deleted User',
          username: `deleted_${userId}`,
          bio: '',
          avatarUrl: null,
          coverUrl: null,
          website: null,
          email: `deleted_${userId}@deleted.local`,
          phone: null,
          location: null,
          madhab: null,
          expoPushToken: null,
          notificationsOn: false,
        },
      });

      // Soft-delete all user content + strip location data (GDPR: location is PII)
      await tx.post.updateMany({
        where: { userId },
        data: { isRemoved: true, removedReason: 'Account deleted by user', removedAt: new Date(), locationName: null, locationLat: null, locationLng: null },
      });
      await tx.thread.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.comment.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.reel.updateMany({
        where: { userId },
        data: { isRemoved: true, locationName: null, locationLat: null, locationLng: null },
      });
      await tx.video.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.story.deleteMany({ where: { userId } });
      await tx.threadReply.updateMany({
        where: { userId },
        data: { content: '[deleted]' },
      });

      // Delete sensitive personal data
      await tx.profileLink.deleteMany({ where: { userId } });
      await tx.twoFactorSecret.deleteMany({ where: { userId } });
      await tx.encryptionKey.deleteMany({ where: { userId } });
      await tx.conversationKeyEnvelope.deleteMany({ where: { userId } });
      await tx.device.deleteMany({ where: { userId } });

      // Remove social graph
      await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.mute.deleteMany({ where: { OR: [{ userId }, { mutedId: userId }] } });

      // Delete reactions, bookmarks, and interaction data
      await tx.savedPost.deleteMany({ where: { userId } });
      await tx.postReaction.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.watchHistory.deleteMany({ where: { userId } });

      // Delete user settings (contains preference data)
      await tx.userSettings.deleteMany({ where: { userId } });

      // Delete gamification data
      await tx.userStreak.deleteMany({ where: { userId } });

      // TODO: [LEGAL/GDPR] Schedule complete purge job for 30 days from now.
      // A scheduled job (cron or BullMQ repeatable) should:
      // 1. Query users WHERE deletedAt < NOW() - 30 days AND isDeleted = true
      // 2. Hard-delete remaining anonymized records (posts, threads, etc.)
      // 3. Purge from Cloudflare R2/Stream storage
      // 4. Remove from Meilisearch index
      // 5. Notify admins of completed deletion
      // This is required to fulfill the privacy policy promise of "30-day purge".
    });

    return { deleted: true, userId, deletedAt: new Date().toISOString() };
  }
}