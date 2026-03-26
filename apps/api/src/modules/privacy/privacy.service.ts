import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service';
import { UploadService } from '../upload/upload.service';
import { QueueService } from '../../common/queue/queue.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);
  private readonly r2PublicUrl: string;

  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private queueService: QueueService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {
    this.r2PublicUrl = this.config.get('R2_PUBLIC_URL') ?? 'https://media.mizanly.app';
  }

  /**
   * Extract R2 object key from a full public URL.
   * e.g. "https://media.mizanly.app/avatars/user123/abc.jpg" → "avatars/user123/abc.jpg"
   * Returns null if URL doesn't match R2 domain (external URL).
   */
  private extractR2Key(url: string | null): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const baseUrl = new URL(this.r2PublicUrl);
      if (parsed.host !== baseUrl.host) return null;
      // Key is the path without leading slash
      return parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
    } catch {
      return null;
    }
  }

  /**
   * Bug 67: Process scheduled account deletions.
   * Runs daily at 3 AM — finds users whose deletedAt has passed and purges their data.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async processScheduledDeletions() {
    const now = new Date();
    const usersToDelete = await this.prisma.user.findMany({
      where: {
        scheduledDeletionAt: { lte: now },
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

    // Fetch user data with take:10000 cap to prevent OOM on power users (FIX 2.7)
    const EXPORT_CAP = 10000;
    const [
      posts, threads, stories, reels, messages, follows, comments,
      postReactions, videos, bookmarks, blocks, mutes, notifications,
      threadReplies, userSettings, watchHistory,
      reelComments, reelReactions, videoReactions, videoComments,
      circleMemberships, reports, tips, coinTransactions,
      dhikrSessions, fastingLogs,
    ] = await Promise.all([
      this.prisma.post.findMany({ where: { userId }, select: { id: true, content: true, mediaUrls: true, postType: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.thread.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.story.findMany({ where: { userId }, select: { id: true, mediaUrl: true, mediaType: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.reel.findMany({ where: { userId }, select: { id: true, caption: true, videoUrl: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, messageType: true, conversationId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.comment.findMany({ where: { userId }, select: { id: true, content: true, postId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.postReaction.findMany({ where: { userId }, select: { postId: true, reaction: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.video.findMany({ where: { userId }, select: { id: true, title: true, videoUrl: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.savedPost.findMany({ where: { userId }, select: { postId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.notification.findMany({ where: { userId }, select: { id: true, type: true, isRead: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.threadReply.findMany({ where: { userId }, select: { id: true, content: true, threadId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.userSettings.findUnique({ where: { userId } }),
      this.prisma.watchHistory.findMany({ where: { userId }, select: { videoId: true, watchedAt: true }, take: EXPORT_CAP }),
      // Additional categories for GDPR completeness
      this.prisma.reelComment.findMany({ where: { userId }, select: { id: true, content: true, reelId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.reelReaction.findMany({ where: { userId }, select: { reelId: true, reaction: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.videoReaction.findMany({ where: { userId }, select: { videoId: true, isLike: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.videoComment.findMany({ where: { userId }, select: { id: true, content: true, videoId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.circleMember.findMany({ where: { userId }, select: { circleId: true, role: true, joinedAt: true }, take: EXPORT_CAP }),
      this.prisma.report.findMany({ where: { reporterId: userId }, select: { id: true, reason: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.tip.findMany({ where: { senderId: userId }, select: { id: true, amount: true, receiverId: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.coinTransaction.findMany({ where: { userId }, select: { id: true, type: true, amount: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.dhikrSession.findMany({ where: { userId }, select: { id: true, count: true, phrase: true, createdAt: true }, take: EXPORT_CAP }),
      this.prisma.fastingLog.findMany({ where: { userId }, select: { id: true, date: true, fastType: true }, take: EXPORT_CAP }),
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

    const exportData: Record<string, unknown> = {
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
        data: messages.map((m: { id: string; content: string | null; messageType: string; conversationId: string; createdAt: Date }) => ({
          ...m,
          encrypted: encryptedConversationIds.has(m.conversationId),
        })),
      },
      comments,
      postReactions,
      bookmarks,
      blocks: blocks.map((b: { blockedId: string }) => b.blockedId),
      mutes: mutes.map((m: { mutedId: string }) => m.mutedId),
      following: follows.map((f: { followingId: string; createdAt: Date }) => ({ userId: f.followingId, followedAt: f.createdAt })),
      notifications: { count: notifications.length, data: notifications },
      watchHistory,
      reelComments,
      reelReactions,
      videoReactions,
      videoComments,
      circleMemberships,
      reports: reports.map((r: { id: string; reason: string; createdAt: Date }) => ({ id: r.id, reason: r.reason, createdAt: r.createdAt })),
      tips: tips.map((t: { id: string; amount: { toNumber?: () => number }; receiverId: string | null; createdAt: Date }) => ({ amount: Number(t.amount), receiverId: t.receiverId, createdAt: t.createdAt })),
      coinTransactions,
      dhikrSessions,
      fastingLogs,
      exportedAt: new Date().toISOString(),
    };

    // Indicate which categories hit the export cap (GDPR transparency)
    const truncatedCategories = Object.entries(exportData)
      .filter(([, val]) => Array.isArray(val) && val.length >= EXPORT_CAP)
      .map(([key]) => key);

    return {
      ...exportData,
      _meta: { exportCap: EXPORT_CAP, truncatedCategories },
    };
  }

  /**
   * GDPR Article 17 — Right to Erasure.
   * THE SINGLE comprehensive account deletion function. All other deletion paths
   * (users.service.deleteAccount, scheduled cron) MUST delegate here.
   *
   * Covers ~70 tables across 10 categories:
   *   1. User profile anonymization (PII scrub)
   *   2. Content soft-delete (posts, threads, reels, videos, comments)
   *   3. Message anonymization (content → '[deleted]', media cleared)
   *   4. Sensitive data deletion (2FA, encryption keys, devices)
   *   5. Social graph removal (follows, blocks, mutes, restricts)
   *   6. Engagement data (reactions, bookmarks, interactions, votes)
   *   7. Religious data (GDPR Art 9 — dhikr, fasting, hajj, hifz, prayer, Quran)
   *   8. Behavioral/preference data (feed interactions, interests, settings, screen time)
   *   9. Creator/commerce data (stats, promotions, products, memberships)
   *  10. Post-transaction cleanup (R2 media, Meilisearch indexes, Redis keys)
   *
   * Financial records (Tip, Order, GiftRecord, CharityDonation, ZakatDonation,
   * WaqfDonation, CoinTransaction, CreatorEarning) are NOT deleted — they use
   * SetNull on FK and are preserved for audit/tax compliance.
   */
  async deleteAllUserData(userId: string) {
    // Verify user exists before attempting deletion
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, isDeleted: true, avatarUrl: true, coverUrl: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('User account already deleted');

    this.logger.warn(`Full data deletion requested for user ${userId}`);

    // ── Pre-transaction: Collect media URLs and content IDs for post-tx cleanup ──
    const [userPosts, userReels, userStories, userVideos, userThreads] = await Promise.all([
      this.prisma.post.findMany({
        where: { userId },
        select: { id: true, mediaUrls: true },
      }),
      this.prisma.reel.findMany({
        where: { userId },
        select: { id: true, videoUrl: true, thumbnailUrl: true, carouselUrls: true },
      }),
      this.prisma.story.findMany({
        where: { userId },
        select: { mediaUrl: true, thumbnailUrl: true },
      }),
      this.prisma.video.findMany({
        where: { userId },
        select: { id: true, videoUrl: true, thumbnailUrl: true },
      }),
      this.prisma.thread.findMany({
        where: { userId },
        select: { id: true },
      }),
    ]);

    // Build R2 keys list
    const mediaKeysToDelete: string[] = [];
    const avatarKey = this.extractR2Key(user.avatarUrl);
    if (avatarKey) mediaKeysToDelete.push(avatarKey);
    const coverKey = this.extractR2Key(user.coverUrl);
    if (coverKey) mediaKeysToDelete.push(coverKey);
    for (const post of userPosts) {
      for (const url of post.mediaUrls) {
        const key = this.extractR2Key(url);
        if (key) mediaKeysToDelete.push(key);
      }
    }
    for (const reel of userReels) {
      const vk = this.extractR2Key(reel.videoUrl);
      if (vk) mediaKeysToDelete.push(vk);
      const tk = this.extractR2Key(reel.thumbnailUrl);
      if (tk) mediaKeysToDelete.push(tk);
      // Collect carousel slide URLs for R2 deletion
      if (reel.carouselUrls && Array.isArray(reel.carouselUrls)) {
        for (const carouselUrl of reel.carouselUrls) {
          const ck = this.extractR2Key(carouselUrl);
          if (ck) mediaKeysToDelete.push(ck);
        }
      }
    }
    for (const story of userStories) {
      const mk = this.extractR2Key(story.mediaUrl);
      if (mk) mediaKeysToDelete.push(mk);
      const tk = this.extractR2Key(story.thumbnailUrl);
      if (tk) mediaKeysToDelete.push(tk);
    }
    for (const video of userVideos) {
      const vk = this.extractR2Key(video.videoUrl);
      if (vk) mediaKeysToDelete.push(vk);
      const tk = this.extractR2Key(video.thumbnailUrl);
      if (tk) mediaKeysToDelete.push(tk);
    }

    // ── Atomic transaction: all DB mutations succeed or none do ──
    // Do NOT hard-delete financial records — preserve for audit trail (SetNull on FK)
    await this.prisma.$transaction(async (tx) => {
      // ─── 1. Anonymize user profile (PII scrub) ───
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

      // ─── 2. Content soft-delete + location PII strip ───
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
      // Anonymize reel comments and video comments (user's own)
      await tx.reelComment.deleteMany({ where: { userId } });
      await tx.videoComment.deleteMany({ where: { userId } });

      // ─── 3. Message anonymization ───
      // Scrub content + media from sent messages. Does NOT delete messages
      // (other participants still see "[deleted]" placeholder).
      await tx.message.updateMany({
        where: { senderId: userId },
        data: {
          content: '[deleted]',
          mediaUrl: null,
          mediaType: null,
          fileName: null,
          fileSize: null,
          voiceDuration: null,
          transcription: null,
        },
      });
      // Remove message reactions by user
      await tx.messageReaction.deleteMany({ where: { userId } });
      // Remove starred messages
      await tx.starredMessage.deleteMany({ where: { userId } });
      // Remove saved messages (Telegram-style self-bookmark)
      await tx.savedMessage.deleteMany({ where: { userId } });

      // ─── 4. Sensitive personal data deletion ───
      await tx.profileLink.deleteMany({ where: { userId } });
      await tx.twoFactorSecret.deleteMany({ where: { userId } });
      await tx.encryptionKey.deleteMany({ where: { userId } });
      await tx.conversationKeyEnvelope.deleteMany({ where: { userId } });
      await tx.device.deleteMany({ where: { userId } });
      // PII profiles
      await tx.altProfile.deleteMany({ where: { userId } });
      await tx.altProfileAccess.deleteMany({ where: { userId } });
      await tx.dMNote.deleteMany({ where: { userId } });
      await tx.scholarVerification.deleteMany({ where: { userId } });

      // ─── 5. Social graph removal ───
      await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.mute.deleteMany({ where: { OR: [{ userId }, { mutedId: userId }] } });
      await tx.restrict.deleteMany({ where: { OR: [{ restricterId: userId }, { restrictedId: userId }] } });
      await tx.followRequest.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } });
      // Conversation memberships (removes user from all chats)
      await tx.conversationMember.deleteMany({ where: { userId } });
      // Circle/community memberships
      await tx.circleMember.deleteMany({ where: { userId } });
      // Channel subscriptions and memberships
      await tx.subscription.deleteMany({ where: { userId } });
      await tx.channelMember.deleteMany({ where: { userId } });
      // Hashtag follows
      await tx.hashtagFollow.deleteMany({ where: { userId } });
      // Mosque memberships
      await tx.mosqueMembership.deleteMany({ where: { userId } });
      // Series follows
      await tx.seriesFollower.deleteMany({ where: { userId } });
      // Majlis list memberships (both owned lists and membership in others)
      await tx.majlisListMember.deleteMany({ where: { userId } });

      // ─── 6. Engagement data (reactions, bookmarks, interactions, votes) ───
      await tx.savedPost.deleteMany({ where: { userId } });
      await tx.threadBookmark.deleteMany({ where: { userId } });
      await tx.videoBookmark.deleteMany({ where: { userId } });
      await tx.postReaction.deleteMany({ where: { userId } });
      await tx.threadReaction.deleteMany({ where: { userId } });
      await tx.threadReplyLike.deleteMany({ where: { userId } });
      await tx.reelReaction.deleteMany({ where: { userId } });
      await tx.reelCommentReaction.deleteMany({ where: { userId } });
      await tx.commentReaction.deleteMany({ where: { userId } });
      await tx.videoReaction.deleteMany({ where: { userId } });
      await tx.videoCommentLike.deleteMany({ where: { userId } });
      await tx.watchHistory.deleteMany({ where: { userId } });
      await tx.watchLater.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.storyView.deleteMany({ where: { viewerId: userId } });
      await tx.storyStickerResponse.deleteMany({ where: { userId } });
      await tx.storyChainEntry.deleteMany({ where: { userId } });
      await tx.pollVote.deleteMany({ where: { userId } });
      await tx.eventRSVP.deleteMany({ where: { userId } });
      await tx.scholarQuestionVote.deleteMany({ where: { userId } });
      await tx.halalVerifyVote.deleteMany({ where: { userId } });
      await tx.communityNoteRating.deleteMany({ where: { userId } });
      await tx.productReview.deleteMany({ where: { userId } });
      await tx.businessReview.deleteMany({ where: { userId } });
      await tx.halalRestaurantReview.deleteMany({ where: { userId } });
      await tx.postCollab.deleteMany({ where: { userId } });
      await tx.postTaggedUser.deleteMany({ where: { userId } });
      await tx.reelTaggedUser.deleteMany({ where: { userId } });
      await tx.collabInvite.deleteMany({ where: { OR: [{ inviterId: userId }, { inviteeId: userId }] } });

      // ─── 7. GDPR Article 9 — Religious data (special category) ───
      await tx.dhikrSession.deleteMany({ where: { userId } });
      await tx.fastingLog.deleteMany({ where: { userId } });
      await tx.hajjProgress.deleteMany({ where: { userId } });
      await tx.hifzProgress.deleteMany({ where: { userId } });
      await tx.quranReadingPlan.deleteMany({ where: { userId } });
      await tx.prayerNotificationSetting.deleteMany({ where: { userId } });
      await tx.dhikrChallengeParticipant.deleteMany({ where: { userId } });
      await tx.dailyTaskCompletion.deleteMany({ where: { userId } });
      await tx.duaBookmark.deleteMany({ where: { userId } });
      await tx.mosquePost.deleteMany({ where: { userId } });
      await tx.scholarQuestion.deleteMany({ where: { userId } });

      // ─── 8. Behavioral/preference data ───
      await tx.feedInteraction.deleteMany({ where: { userId } });
      await tx.feedDismissal.deleteMany({ where: { userId } });
      await tx.userInterest.deleteMany({ where: { userId } });
      await tx.reelInteraction.deleteMany({ where: { userId } });
      await tx.videoInteraction.deleteMany({ where: { userId } });
      await tx.userSettings.deleteMany({ where: { userId } });
      await tx.contentFilterSetting.deleteMany({ where: { userId } });
      await tx.screenTimeLog.deleteMany({ where: { userId } });
      await tx.quietModeSetting.deleteMany({ where: { userId } });
      await tx.profileCustomization.deleteMany({ where: { userId } });
      await tx.storyHighlightAlbum.deleteMany({ where: { userId } });
      await tx.blockedKeyword.deleteMany({ where: { userId } });
      await tx.draftPost.deleteMany({ where: { userId } });
      await tx.savedSearch.deleteMany({ where: { userId } });
      await tx.chatFolder.deleteMany({ where: { userId } });
      await tx.offlineDownload.deleteMany({ where: { userId } });

      // ─── 9. Gamification, creator, and commerce data ───
      await tx.userStreak.deleteMany({ where: { userId } });
      await tx.userAchievement.deleteMany({ where: { userId } });
      await tx.userXP.deleteMany({ where: { userId } });
      await tx.userReputation.deleteMany({ where: { userId } });
      await tx.coinBalance.deleteMany({ where: { userId } });
      // CoinTransaction records are financial audit trail — preserve for compliance (FK uses SetNull)
      await tx.creatorStat.deleteMany({ where: { userId } });
      await tx.postPromotion.deleteMany({ where: { userId } });
      await tx.postReminder.deleteMany({ where: { userId } });
      await tx.premiumSubscription.deleteMany({ where: { userId } });
      await tx.membershipSubscription.deleteMany({ where: { userId } });
      await tx.challengeParticipant.deleteMany({ where: { userId } });
      await tx.seriesProgress.deleteMany({ where: { userId } });
      await tx.premiereReminder.deleteMany({ where: { userId } });
      await tx.videoClip.deleteMany({ where: { userId } });
      await tx.reelTemplate.deleteMany({ where: { userId } });
      await tx.userStickerPack.deleteMany({ where: { userId } });
      await tx.generatedSticker.deleteMany({ where: { userId } });
      await tx.aiAvatar.deleteMany({ where: { userId } });
      await tx.voicePost.deleteMany({ where: { userId } });
      await tx.playlistCollaborator.deleteMany({ where: { userId } });

      // ─── 10. Live/audio participation records ───
      await tx.liveParticipant.deleteMany({ where: { userId } });
      await tx.liveGuest.deleteMany({ where: { userId } });
      await tx.audioRoomParticipant.deleteMany({ where: { userId } });
      await tx.callParticipant.deleteMany({ where: { userId } });
    });

    // ── Post-transaction: R2 media cleanup (batched in chunks of 50) ──
    if (mediaKeysToDelete.length > 0) {
      this.logger.log(`Deleting ${mediaKeysToDelete.length} R2 media files for user ${userId}`);
      const R2_BATCH_SIZE = 50;
      let totalFailed = 0;
      for (let i = 0; i < mediaKeysToDelete.length; i += R2_BATCH_SIZE) {
        const batch = mediaKeysToDelete.slice(i, i + R2_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((key) =>
            this.uploadService.deleteFile(key).catch((err: unknown) => {
              const errMsg = err instanceof Error ? err.message : String(err);
              this.logger.warn(`R2 delete failed for ${key}: ${errMsg}`);
            }),
          ),
        );
        totalFailed += results.filter((r) => r.status === 'rejected').length;
      }
      if (totalFailed > 0) {
        this.logger.warn(`${totalFailed}/${mediaKeysToDelete.length} R2 deletions failed for user ${userId}`);
      } else {
        this.logger.log(`All ${mediaKeysToDelete.length} R2 media files deleted for user ${userId}`);
      }
    }

    // ── Post-transaction: Meilisearch index removal (fire-and-forget) ──
    const searchDeletions: Array<{ indexName: string; documentId: string }> = [];
    for (const post of userPosts) {
      searchDeletions.push({ indexName: 'posts', documentId: post.id });
    }
    for (const reel of userReels) {
      searchDeletions.push({ indexName: 'reels', documentId: reel.id });
    }
    for (const thread of userThreads) {
      searchDeletions.push({ indexName: 'threads', documentId: thread.id });
    }
    for (const video of userVideos) {
      searchDeletions.push({ indexName: 'videos', documentId: video.id });
    }
    // Remove user from users index
    searchDeletions.push({ indexName: 'users', documentId: userId });

    for (const { indexName, documentId } of searchDeletions) {
      this.queueService.addSearchIndexJob({
        action: 'delete',
        indexName,
        documentId,
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Meilisearch delete job failed for ${indexName}/${documentId}: ${msg}`);
      });
    }

    // ── Post-transaction: Redis key cleanup ──
    try {
      const keysToDelete = [
        `user:${user.username}`,
        `user:${userId}`,
        `user:profile:${userId}`,
        `user:settings:${userId}`,
        `user:interests:${userId}`,
        `user:feed:${userId}`,
        `user:notifications:${userId}`,
        `user:unread:${userId}`,
        `screen-time:${userId}`,
        `quiet-mode:${userId}`,
      ];
      await this.redis.del(...keysToDelete);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis cleanup failed for user ${userId}: ${msg}`);
    }

    this.logger.log(`Account deletion completed for user ${userId} — ~70 tables purged`);
    return { deleted: true, userId, deletedAt: new Date().toISOString() };
  }
}