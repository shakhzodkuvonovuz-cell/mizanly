import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../ai/ai.service';
import { acquireCronLock } from '../../common/utils/cron-lock';
import { ContentSafetyService } from '../moderation/content-safety.service';
import { QueueService } from '../../common/queue/queue.service';
import { Prisma, MessageType, ReportReason, StickerResponseType } from '@prisma/client';
import { sanitizeText } from '../../common/utils/sanitize';

const STORY_SELECT = {
  id: true,
  userId: true,
  mediaUrl: true,
  mediaType: true,
  thumbnailUrl: true,
  duration: true,
  textOverlay: true,
  textColor: true,
  bgColor: true,
  viewsCount: true,
  repliesCount: true,
  isHighlight: true,
  highlightName: true,
  highlightAlbumId: true,
  stickerData: true,
  closeFriendsOnly: true,
  isArchived: true,
  expiresAt: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private contentSafety: ContentSafetyService,
    private queueService: QueueService,
    private notifications: NotificationsService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async getFeedStories(userId: string) {
    const [follows, blocks, mutes, restricts] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
        take: 10000,
      }),
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
        take: 10000,
      }),
      this.prisma.mute.findMany({
        where: { userId },
        select: { mutedId: true },
        take: 10000,
      }),
      this.prisma.restrict.findMany({
        where: { restricterId: userId },
        select: { restrictedId: true },
        take: 10000,
      }),
    ]);

    // Build excluded set: blocked (both directions) + muted + restricted
    const excluded = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) excluded.add(b.blockedId);
      else excluded.add(b.blockerId);
    }
    for (const m of mutes) excluded.add(m.mutedId);
    for (const r of restricts) excluded.add(r.restrictedId);

    const followingIds = follows.map((f) => f.followingId).filter((id) => !excluded.has(id));
    const ids = [userId, ...followingIds];

    const rawStories = await this.prisma.story.findMany({
      where: {
        userId: { in: ids },
        expiresAt: { gt: new Date() },
        isArchived: false,
        user: { isDeactivated: false, isBanned: false, isDeleted: false },
      },
      select: { ...STORY_SELECT, closeFriendsOnly: true, subscribersOnly: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Filter out closeFriendsOnly stories unless viewer is in the author's close friends circle
    // and subscribersOnly stories unless viewer is a subscriber
    // For own stories, always show all
    const stories = rawStories.filter((story) => {
      if (story.userId === userId) return true;
      // Close friends: needs CloseFriend schema model for proper membership check
      // Currently rejects all close-friends stories for non-owners (safe default)
      if (story.closeFriendsOnly) return false;
      // Subscribers only: needs subscriber relationship check
      if (story.subscribersOnly) return false;
      return true;
    });

    // Group by user
    const grouped = new Map<
      string,
      { user: (typeof stories)[0]['user']; stories: typeof stories; hasUnread: boolean }
    >();

    for (const story of stories) {
      if (!story.user) continue;
      const key = story.user.id;
      if (!grouped.has(key)) {
        grouped.set(key, { user: story.user, stories: [], hasUnread: false });
      }
      const group = grouped.get(key);
      if (group) group.stories.push(story);
    }

    // Check which stories the current user has already seen
    const storyIds = stories.map((s) => s.id);
    const views = storyIds.length > 0
      ? await this.prisma.storyView.findMany({
          where: { viewerId: userId, storyId: { in: storyIds } },
          select: { storyId: true },
          take: 100, // Match the story fetch limit
        })
      : [];
    const viewedIds = new Set(views.map((v) => v.storyId));

    const result = Array.from(grouped.values()).map((group) => ({
      ...group,
      hasUnread: group.stories.some((s) => !viewedIds.has(s.id)),
    }));

    // Sort: own stories first, then by hasUnread, then by latest story
    result.sort((a, b) => {
      if (a.user?.id === userId) return -1;
      if (b.user?.id === userId) return 1;
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      return 0;
    });

    return result;
  }

  async create(
    userId: string,
    data: {
      mediaUrl: string;
      mediaType: string;
      thumbnailUrl?: string;
      duration?: number;
      textOverlay?: string;
      textColor?: string;
      bgColor?: string;
      stickerData?: object;
      closeFriendsOnly?: boolean;
      subscribersOnly?: boolean;
    },
  ) {
    // X08-#14: Moderate text content (textOverlay, stickerData) before persisting
    if (data.textOverlay) {
      const modResult = await this.contentSafety.moderateText(data.textOverlay);
      if (!modResult.safe) {
        throw new BadRequestException('Story text content flagged by moderation');
      }
    }
    if (data.stickerData) {
      const stickerText = typeof data.stickerData === 'string'
        ? data.stickerData
        : JSON.stringify(data.stickerData);
      if (stickerText.length > 0 && stickerText !== '{}') {
        const modResult = await this.contentSafety.moderateText(stickerText);
        if (!modResult.safe) {
          throw new BadRequestException('Story sticker content flagged by moderation');
        }
      }
    }

    const story = await this.prisma.story.create({
      data: {
        userId,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        thumbnailUrl: data.thumbnailUrl,
        duration: data.duration,
        textOverlay: data.textOverlay ? sanitizeText(data.textOverlay) : data.textOverlay,
        textColor: data.textColor,
        bgColor: data.bgColor,
        stickerData: data.stickerData as Prisma.InputJsonValue,
        closeFriendsOnly: data.closeFriendsOnly ?? false,
        subscribersOnly: data.subscribersOnly ?? false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: STORY_SELECT,
    });

    // Image moderation (async, non-blocking)
    if (data.mediaType?.startsWith('image')) {
      this.moderateStoryImage(userId, story.id, data.mediaUrl).catch((err: Error) => {
        this.logger.error(`Story image moderation failed for ${story.id}: ${err.message}`);
      });
    }

    // Finding #205: Story mention notifications
    // Extract @mentions from textOverlay and stickerData
    const mentionRegex = /@([a-zA-Z0-9_.]{1,30})/g;
    const allText = [data.textOverlay || '', JSON.stringify(data.stickerData || {})].join(' ');
    const mentions = [...allText.matchAll(mentionRegex)].map(m => m[1]);
    if (mentions.length > 0) {
      const mentionedUsers = await this.prisma.user.findMany({
        where: { username: { in: mentions }, id: { not: userId } },
        select: { id: true },
        take: 20,
      });
      const actorUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      // J01-#11: Parallelize mention notifications
      await Promise.all(mentionedUsers.map(mu =>
        this.notifications.create({
          userId: mu.id, actorId: userId, type: 'MENTION',
          title: 'Mentioned you in a story',
          body: `@${actorUser?.username ?? 'Someone'} mentioned you in their story`,
        }).catch((err) => this.logger.warn('Story mention notification failed', err instanceof Error ? err.message : err)),
      ));
    }

    // Gamification: award XP for story creation
    this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'story_created' }).catch(err => this.logger.warn('Failed to queue gamification XP', err instanceof Error ? err.message : err));

    return story;
  }

  private async moderateStoryImage(userId: string, storyId: string, imageUrl: string): Promise<void> {
    try {
      const result = await this.ai.moderateImage(imageUrl);
      if (result.classification === 'BLOCK') {
        // Soft-remove: expire immediately + archive (preserves audit trail for appeals)
        await this.prisma.story.update({
          where: { id: storyId },
          data: { expiresAt: new Date(), isArchived: true, isSensitive: true },
        });
        this.logger.warn(`Story ${storyId} soft-removed: image blocked (${result.reason})`);
      } else if (result.classification === 'WARNING') {
        await this.prisma.story.update({
          where: { id: storyId },
          data: { isSensitive: true },
        });
        this.logger.log(`Story ${storyId} marked sensitive: ${result.reason}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Story image moderation error for ${storyId}: ${msg}`);
    }
  }

  async getById(storyId: string, viewerId?: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    // Don't expose expired or archived stories to non-owners
    if (viewerId !== story.userId) {
      if (story.isArchived) throw new NotFoundException('Story not found');
      if (story.expiresAt && story.expiresAt < new Date()) throw new NotFoundException('Story has expired');

      // B07-#2: Block check on direct ID access
      if (viewerId && story.userId) {
        const blocked = await this.prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: viewerId, blockedId: story.userId },
              { blockerId: story.userId, blockedId: viewerId },
            ],
          },
        });
        if (blocked) throw new NotFoundException('Story not found');
      }

      // B07-#3: closeFriendsOnly / subscribersOnly enforcement
      if (story.closeFriendsOnly) throw new ForbiddenException('This story is for close friends only');
      if ((story as any).subscribersOnly) throw new ForbiddenException('This story is for subscribers only');

      // Private account: only approved followers can view stories
      if (story.userId) {
        const author = await this.prisma.user.findUnique({
          where: { id: story.userId },
          select: { isPrivate: true, isBanned: true, isDeactivated: true, isDeleted: true },
        });
        if (author?.isBanned || author?.isDeactivated || author?.isDeleted) throw new NotFoundException('Story not found');
        if (author?.isPrivate) {
          if (!viewerId) throw new ForbiddenException('This account is private');
          const follow = await this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: story.userId } },
          });
          if (!follow) throw new ForbiddenException('This account is private');
        }
      }

      // Record view if viewer is authenticated and not the owner
      // Removed fire-and-forget upsert — clients should use markViewed endpoint (B07-#6)
    }

    return story;
  }

  async delete(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();

    await this.prisma.story.update({
      where: { id: storyId },
      data: { isArchived: true },
    });
    return { archived: true };
  }

  async unarchive(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();

    await this.prisma.story.update({
      where: { id: storyId },
      data: { isArchived: false },
    });
    return { unarchived: true };
  }

  async markViewed(storyId: string, viewerId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.expiresAt && story.expiresAt < new Date()) throw new BadRequestException('Story has expired');
    if (story.isArchived) throw new BadRequestException('Story is archived');
    // A07-#3: Don't count self-views
    if (story.userId === viewerId) return { viewed: true };

    const alreadyViewed = await this.prisma.storyView.findUnique({
      where: { storyId_viewerId: { storyId, viewerId } },
    });

    if (!alreadyViewed) {
      try {
        await this.prisma.$transaction([
          this.prisma.storyView.create({ data: { storyId, viewerId } }),
          this.prisma.story.update({
            where: { id: storyId },
            data: { viewsCount: { increment: 1 } },
          }),
        ]);
      } catch (error) {
        // P2002: concurrent view from same user — idempotent, view already counted
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return { viewed: true };
        }
        throw error;
      }
    }

    return { viewed: true };
  }

  async getViewers(storyId: string, ownerId: string, cursor?: string, limit = 20) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== ownerId) throw new ForbiddenException('Only owner can see viewers');

    const views = await this.prisma.storyView.findMany({
      where: { storyId },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor
        ? {
            cursor: { storyId_viewerId: { storyId, viewerId: cursor } },
            skip: 1,
          }
        : {}),
    });

    // Fetch user details separately
    const viewerIds = views.map((v) => v.viewerId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: viewerIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
      take: 50,
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const hasMore = views.length > limit;
    const items = hasMore ? views.slice(0, limit) : views;

    return {
      data: items.map((v) => ({ ...userMap.get(v.viewerId), viewedAt: v.createdAt })),
      meta: { cursor: hasMore ? items[items.length - 1].viewerId : null, hasMore },
    };
  }

  async replyToStory(storyId: string, senderId: string, content: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');

    // B07-#4: Check expiry and archived status
    if (story.isArchived) throw new BadRequestException('Cannot reply to archived story');
    if (story.expiresAt && story.expiresAt < new Date()) throw new BadRequestException('Cannot reply to expired story');

    const ownerId = story.userId;
    if (!ownerId) throw new NotFoundException('Story not found');
    if (senderId === ownerId) {
      throw new BadRequestException('Cannot reply to your own story');
    }

    // Check block
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: ownerId },
          { blockerId: ownerId, blockedId: senderId },
        ],
      },
    });
    if (block) throw new ForbiddenException('Cannot message this user');

    // Find existing DM conversation
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: senderId } } },
          { members: { some: { userId: ownerId } } },
        ],
      },
    });

    // If not exists, create DM
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          isGroup: false,
          createdById: senderId,
          members: {
            create: [{ userId: senderId }, { userId: ownerId }],
          },
        },
      });
    }

    // Atomic: message create + story repliesCount + conversation lastMessage
    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId,
          content: sanitizeText(content),
          messageType: MessageType.STORY_REPLY,
        },
        select: {
          id: true,
          content: true,
          messageType: true,
          createdAt: true,
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.story.update({
        where: { id: storyId },
        data: { repliesCount: { increment: 1 } },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessageText: content.slice(0, 100),
          lastMessageById: senderId,
        },
      });

      return msg;
    });

    // Create STORY_REPLY notification so the story owner gets a push notification
    this.notifications.create({
      userId: ownerId,
      actorId: senderId,
      type: 'STORY_REPLY',
      conversationId: conversation.id,
      title: 'Story reply',
      body: 'Replied to your story',
    }).catch((err) => this.logger.warn('Story reply notification failed', err instanceof Error ? err.message : err));

    return message;
  }

  async getReactionSummary(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException('Only story owner can view reaction summary');

    const results = await this.prisma.$queryRaw<
      Array<{ emoji: string; count: bigint }>
    >`
      SELECT "responseData"->>'emoji' as emoji, COUNT(*) as count
      FROM "story_sticker_responses"
      WHERE "storyId" = ${storyId} AND "stickerType" = 'emoji'
      GROUP BY "responseData"->>'emoji'
      ORDER BY count DESC
    `;

    return results.map((r) => ({
      emoji: r.emoji,
      count: Number(r.count),
    }));
  }

  async getHighlights(userId: string) {
    return this.prisma.storyHighlightAlbum.findMany({
      where: { userId },
      include: {
        stories: {
          where: { isArchived: true },
          select: { id: true, mediaUrl: true, mediaType: true, thumbnailUrl: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { position: 'asc' },
      take: 50,
    });
  }

  async createHighlight(userId: string, title: string, coverUrl?: string) {
    const count = await this.prisma.storyHighlightAlbum.count({ where: { userId } });
    // Finding #220: Highlight album limit — max 100
    if (count >= 100) throw new BadRequestException('Maximum 100 highlight albums');
    return this.prisma.storyHighlightAlbum.create({
      data: { userId, title, coverUrl, position: count },
    });
  }

  async updateHighlight(albumId: string, userId: string, data: { title?: string; coverUrl?: string }) {
    const album = await this.prisma.storyHighlightAlbum.findUnique({ where: { id: albumId } });
    if (!album) throw new NotFoundException('Highlight not found');
    if (album.userId !== userId) throw new ForbiddenException();

    return this.prisma.storyHighlightAlbum.update({ where: { id: albumId }, data });
  }

  async deleteHighlight(albumId: string, userId: string) {
    const album = await this.prisma.storyHighlightAlbum.findUnique({ where: { id: albumId } });
    if (!album) throw new NotFoundException('Highlight not found');
    if (album.userId !== userId) throw new ForbiddenException();

    // Clear isHighlight on stories that were in this album before deleting
    await this.prisma.story.updateMany({
      where: { highlightAlbumId: albumId },
      data: { isHighlight: false },
    });
    await this.prisma.storyHighlightAlbum.delete({ where: { id: albumId } });
    return { deleted: true };
  }

  async addStoryToHighlight(storyId: string, albumId: string, userId: string) {
    const [story, album] = await Promise.all([
      this.prisma.story.findUnique({ where: { id: storyId } }),
      this.prisma.storyHighlightAlbum.findUnique({ where: { id: albumId } }),
    ]);
    if (!story || !album) throw new NotFoundException();
    if (story.userId !== userId || album.userId !== userId) throw new ForbiddenException();

    return this.prisma.story.update({
      where: { id: storyId },
      data: { highlightAlbumId: albumId, isHighlight: true, isArchived: true },
    });
  }

  async getArchived(userId: string) {
    return this.prisma.story.findMany({
      where: {
        userId,
        isArchived: true,
      },
      select: STORY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async submitStickerResponse(storyId: string, userId: string, stickerType: StickerResponseType, responseData: Record<string, unknown>) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');

    // B07-#5: Check expiry, archived, visibility, blocked
    if (story.isArchived) throw new BadRequestException('Cannot respond to archived story');
    if (story.expiresAt && story.expiresAt < new Date()) throw new BadRequestException('Cannot respond to expired story');
    // PF-2: closeFriendsOnly/subscribersOnly enforcement (no CloseFriend model — safe reject)
    if (story.closeFriendsOnly && userId !== story.userId) {
      throw new ForbiddenException('This story is for close friends only');
    }
    if ((story as any).subscribersOnly && userId !== story.userId) {
      throw new ForbiddenException('This story is for subscribers only');
    }
    if (story.userId && userId !== story.userId) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: story.userId },
            { blockerId: story.userId, blockedId: userId },
          ],
        },
      });
      if (blocked) throw new ForbiddenException('Cannot interact with this story');
    }

    // B07-#17: Use upsert to prevent P2002 race
    return this.prisma.storyStickerResponse.upsert({
      where: {
        storyId_userId_stickerType: { storyId, userId, stickerType },
      },
      create: { storyId, userId, stickerType, responseData: responseData as Prisma.InputJsonValue },
      update: { responseData: responseData as Prisma.InputJsonValue },
    });
  }

  async getStickerResponses(storyId: string, ownerId: string, stickerType?: StickerResponseType) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== ownerId) throw new ForbiddenException('Only story owner can view responses');
    return this.prisma.storyStickerResponse.findMany({
      where: { storyId, ...(stickerType ? { stickerType } : {}) },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getStickerSummary(storyId: string, ownerId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== ownerId) throw new ForbiddenException();
    const responses = await this.prisma.storyStickerResponse.findMany({ where: { storyId }, select: { stickerType: true, responseData: true },
      take: 50,
    });
    const summary: Record<string, Record<string, number>> = {};
    for (const r of responses) {
      if (!summary[r.stickerType]) summary[r.stickerType] = {};
      const data = r.responseData as Record<string, string>;
      const answer = data.answer ?? data.option ?? 'unknown';
      summary[r.stickerType][answer] = (summary[r.stickerType][answer] || 0) + 1;
    }
    return summary;
  }

  async reportStory(storyId: string, userId: string, reason: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId === userId) throw new BadRequestException('Cannot report your own story');

    // Dedup: one report per user per story
    const existing = await this.prisma.report.findFirst({
      where: { reporterId: userId, description: { startsWith: `story:${storyId}` } },
    });
    if (existing) return { reported: true };

    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM', HARASSMENT: 'HARASSMENT', HATE_SPEECH: 'HATE_SPEECH',
      VIOLENCE: 'VIOLENCE', MISINFORMATION: 'MISINFORMATION', NUDITY: 'NUDITY',
      IMPERSONATION: 'IMPERSONATION', OTHER: 'OTHER',
    };

    await this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedUserId: story.userId,
        description: `story:${storyId} — ${reason}`,
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
      },
    });

    return { reported: true };
  }

  /**
   * Cleanup expired stories older than 7 days (grace period for highlight saves).
   * Soft-deletes via isRemoved flag. Does NOT touch highlighted stories.
   * Runs daily at 3:45 AM (staggered from other cleanup crons).
   */
  @Cron('0 45 3 * * *')
  async cleanupExpiredStories(): Promise<number> {
    try {
      if (!await acquireCronLock(this.redis, 'cron:cleanupExpiredStories', 3500, this.logger)) return 0;

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const result = await this.prisma.story.updateMany({
        where: {
          expiresAt: { lt: sevenDaysAgo },
          isHighlight: false,
          isRemoved: false,
        },
        data: { isRemoved: true },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired stories older than 7 days`);
      }
      return result.count;
    } catch (error) {
      this.logger.error('cleanupExpiredStories cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }
}
