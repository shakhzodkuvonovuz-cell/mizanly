import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { TIME_WINDOWS } from '../../common/constants/feed-scoring';
import { CreateReelDto } from './dto/create-reel.dto';
import { Prisma, ReelStatus, CommentPermission, ReactionType, ReportReason } from '@prisma/client';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { extractHashtags } from '@/common/utils/hashtag';
import { GamificationService } from '../gamification/gamification.service';
import { AiService } from '../ai/ai.service';
import { QueueService } from '../../common/queue/queue.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { ScoredFeedCache, ScoredItem } from '../../common/utils/scored-feed-cache';

const REEL_SELECT = {
  id: true,
  videoUrl: true,
  streamId: true,
  hlsUrl: true,
  dashUrl: true,
  qualities: true,
  isLooping: true,
  normalizeAudio: true,
  thumbnailUrl: true,
  duration: true,
  caption: true,
  mentions: true,
  hashtags: true,
  status: true,
  isRemoved: true,
  isPhotoCarousel: true,
  carouselUrls: true,
  carouselTexts: true,
  altText: true,
  locationName: true,
  locationLat: true,
  locationLng: true,
  commentPermission: true,
  brandedContent: true,
  brandPartner: true,
  remixAllowed: true,
  topics: true,
  isTrial: true,
  scheduledAt: true,
  audioTrackId: true,
  audioTitle: true,
  audioArtist: true,
  isDuet: true,
  isStitch: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  viewsCount: true,
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
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);
  private readonly scoredFeedCache: ScoredFeedCache;

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private notifications: NotificationsService,
    private stream: StreamService,
    private gamification: GamificationService,
    private ai: AiService,
    private queueService: QueueService,
    private contentSafety: ContentSafetyService,
    private publishWorkflow: PublishWorkflowService,
  ) {
    this.scoredFeedCache = new ScoredFeedCache(redis);
  }

  async create(userId: string, dto: CreateReelDto) {
    // Pre-save text moderation — blocks creation if content is flagged
    if (dto.caption) {
      const modResult = await this.contentSafety.moderateText(dto.caption);
      if (!modResult.safe) {
        throw new BadRequestException(`Content flagged: ${modResult.flags?.join(', ') || 'policy violation'}`);
      }
    }

    // Validate carousel integrity
    if (dto.isPhotoCarousel) {
      if (!dto.carouselUrls?.length || dto.carouselUrls.length < 2) {
        throw new BadRequestException('Photo carousel requires at least 2 images in carouselUrls');
      }
      if (dto.carouselTexts?.length && dto.carouselTexts.length > dto.carouselUrls.length) {
        throw new BadRequestException('carouselTexts cannot have more items than carouselUrls');
      }
    }

    // Parse and upsert hashtags from caption
    const hashtagNames = [...new Set([
      ...extractHashtags(dto.caption ?? ''),
      ...(dto.hashtags || []).map((h) => h.toLowerCase()),
    ])];
    const isScheduled = !!dto.scheduledAt;
    // For scheduled content: create the hashtag record but don't increment count yet —
    // counts are incremented when the scheduling cron publishes the content
    if (hashtagNames.length > 0) {
      await Promise.all(
        hashtagNames.map((name) =>
          this.prisma.hashtag.upsert({
            where: { name },
            create: { name, reelsCount: isScheduled ? 0 : 1 },
            update: isScheduled ? {} : { reelsCount: { increment: 1 } },
          }),
        ),
      );
    }

    const commentPerm = dto.commentPermission
      ? CommentPermission[dto.commentPermission as keyof typeof CommentPermission] ?? CommentPermission.EVERYONE
      : CommentPermission.EVERYONE;

    const [reel] = await this.prisma.$transaction([
      this.prisma.reel.create({
        data: {
          userId,
          videoUrl: dto.videoUrl,
          thumbnailUrl: dto.thumbnailUrl,
          duration: dto.duration,
          caption: dto.caption ? sanitizeText(dto.caption) : dto.caption,
          mentions: dto.mentions || [],
          hashtags: dto.hashtags || [],
          audioTrackId: dto.audioTrackId,
          isDuet: dto.isDuet || false,
          isStitch: dto.isStitch || false,
          normalizeAudio: dto.normalizeAudio ?? false,
          isPhotoCarousel: dto.isPhotoCarousel ?? false,
          carouselUrls: dto.carouselUrls ?? [],
          carouselTexts: dto.carouselTexts ?? [],
          altText: dto.altText,
          locationName: dto.locationName,
          locationLat: dto.locationLat,
          locationLng: dto.locationLng,
          commentPermission: commentPerm,
          brandedContent: dto.brandedContent ?? false,
          brandPartner: dto.brandedContent ? dto.brandPartner : null,
          remixAllowed: dto.remixAllowed ?? true,
          topics: dto.topics ?? [],
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          isTrial: dto.isTrial ?? false,
          status: ReelStatus.PROCESSING,
        },
        select: REEL_SELECT,
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { reelsCount: { increment: 1 } },
      }),
    ]);

    // Create tagged user records (accepts user IDs or usernames — resolves both)
    // Tag records are always created (even for scheduled content), but notifications are deferred
    if (dto.taggedUserIds?.length) {
      const validUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { id: { in: dto.taggedUserIds } },
            { username: { in: dto.taggedUserIds } },
          ],
          isDeleted: false,
          isBanned: false,
        },
        select: { id: true },
      });
      if (validUsers.length > 0) {
        await this.prisma.reelTaggedUser.createMany({
          data: validUsers.map((u: { id: string }) => ({ reelId: reel.id, userId: u.id })),
          skipDuplicates: true,
        });
      }
    }

    // --- Side effects deferred for scheduled content ---
    // Notifications, gamification XP only fire when content is actually published.
    // For scheduled content, these are triggered by the scheduling cron in publishOverdueContent().
    if (!isScheduled) {
      // Fetch actor username once for all notifications (tags + mentions)
      const needsActor = (dto.taggedUserIds?.length && dto.taggedUserIds.some((id) => id !== userId)) || dto.mentions?.length;
      const actorUsername = needsActor
        ? (await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }))?.username ?? 'Someone'
        : undefined;

      // Tag notifications
      if (dto.taggedUserIds?.length) {
        const taggedRecords = await this.prisma.reelTaggedUser.findMany({
          where: { reelId: reel.id },
          select: { userId: true },
        });
        for (const record of taggedRecords) {
          if (record.userId !== userId) {
            this.notifications.create({
              userId: record.userId,
              actorId: userId,
              type: 'MENTION',
              reelId: reel.id,
              title: 'Tagged you',
              body: `@${actorUsername} tagged you in a reel`,
            }).catch((err) => this.logger.error('Failed to create tag notification', err));
          }
        }
      }

      // Mention notifications (skip self-mentions)
      if (dto.mentions?.length) {
        const mentionedUsers = await this.prisma.user.findMany({
          where: { username: { in: dto.mentions } },
          select: { id: true },
          take: 50,
        });
        for (const mentioned of mentionedUsers) {
          if (mentioned.id !== userId) {
            this.notifications.create({
              userId: mentioned.id,
              actorId: userId,
              type: 'MENTION',
              reelId: reel.id,
              title: 'Mentioned you',
              body: `@${actorUsername ?? 'Someone'} mentioned you in a reel`,
            }).catch((err) => this.logger.error('Failed to create mention notification', err));
          }
        }
      }

      // Gamification: award XP + update streak
      this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'reel_created' }).catch(err => this.logger.warn('Failed to queue gamification XP for reel', err instanceof Error ? err.message : err));
      this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Failed to queue gamification streak for reel', err instanceof Error ? err.message : err));
    }
    // --- End deferred side effects ---

    // Kick off Cloudflare Stream ingestion (async) — ALWAYS runs, even for scheduled content
    // Video processing takes time, so we want it ready when the content publishes
    this.stream.uploadFromUrl(dto.videoUrl, { title: dto.caption ?? 'Reel', creatorId: userId })
      .then(async (streamId) => {
        await this.prisma.reel.update({
          where: { id: reel.id },
          data: { streamId, status: 'READY' },
        });
        this.logger.log(`Reel ${reel.id} submitted to Stream as ${streamId}`);
        // Finding #377: Notify user their reel is ready (success path)
        this.notifications.create({
          userId, actorId: null, type: 'SYSTEM', reelId: reel.id,
          title: 'Reel ready!',
          body: 'Your reel has finished processing and is now live.',
        }).catch(() => {});
      })
      .catch((err) => {
        this.logger.error(`Stream upload failed for reel ${reel.id}`, err);
        this.prisma.reel.update({
          where: { id: reel.id },
          data: { status: 'READY' },
        }).then(() => {
          // Finding #377: Notify user their reel is ready
          this.notifications.create({
            userId, actorId: null, type: 'SYSTEM', reelId: reel.id,
            title: 'Reel ready!',
            body: 'Your reel has finished processing and is now live.',
          }).catch(() => {});
        }).catch((e) => this.logger.error('Failed to update reel status', e));
      });

    // Content moderation (if caption provided)
    if (reel.caption) {
      this.queueService.addModerationJob({ content: reel.caption, contentType: 'reel', contentId: reel.id }).catch((err: unknown) => {
        this.logger.error(`Moderation queue failed for reel ${reel.id}`, err instanceof Error ? err.message : err);
      });
    }

    // Image moderation on thumbnail (async, non-blocking)
    if (dto.thumbnailUrl) {
      this.moderateReelThumbnail(userId, reel.id, dto.thumbnailUrl).catch((err: Error) => {
        this.logger.error(`Reel thumbnail moderation failed for ${reel.id}: ${err.message}`);
      });
    }

    // Publish workflow: search index, cache invalidation, real-time event
    // Only trigger for immediately-published content (not scheduled)
    if (!dto.scheduledAt) {
      this.publishWorkflow.onPublish({
        contentType: 'reel',
        contentId: reel.id,
        userId,
        indexDocument: {
          id: reel.id,
          caption: reel.caption,
          userId,
          hashtags: reel.hashtags,
        },
      }).catch(err => this.logger.warn('Publish workflow failed for reel', err instanceof Error ? err.message : err));
    }

    return {
      ...reel,
      isLiked: false,
      isBookmarked: false,
    };
  }

  async getFeed(userId: string | undefined, cursor?: string, limit = 20) {
    const sfeedKey = userId ? `sfeed:bakra:foryou:${userId}` : `sfeed:bakra:foryou:anon`;
    const page = cursor ? parseInt(cursor, 10) || 0 : 0;

    const { items, hasMore } = await this.scoredFeedCache.getPage(
      sfeedKey,
      page,
      limit,
      60,
      async (): Promise<ScoredItem[]> => {
        const [blocks, mutes] = userId ? await Promise.all([
          this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true }, take: 10000 }),
          this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true }, take: 10000 }),
        ]) : [[], []];

        const excludedSet = new Set<string>();
        for (const b of blocks) {
          if (b.blockerId === userId) excludedSet.add(b.blockedId);
          else excludedSet.add(b.blockerId);
        }
        for (const m of mutes) excludedSet.add(m.mutedId);
        const excludedIds = [...excludedSet];

        const where: Prisma.ReelWhereInput = {
          status: ReelStatus.READY,
          isRemoved: false,
          isTrial: false,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          user: { isPrivate: false, isDeactivated: false, isBanned: false, isDeleted: false },
          createdAt: { gte: new Date(Date.now() - TIME_WINDOWS.FORYOU_HOURS * 3600000) },
          ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
        };

        const recentReels = await this.prisma.reel.findMany({
          where,
          select: REEL_SELECT,
          take: 500,
          orderBy: { createdAt: 'desc' },
        });

        return recentReels.map(reel => {
          const ageHours = Math.max(1, (Date.now() - new Date(reel.createdAt).getTime()) / 3600000);
          const engagement = (reel.likesCount * 2) + (reel.commentsCount * 4) + (reel.sharesCount * 6) + (reel.viewsCount * 0.1);
          const score = engagement / Math.pow(ageHours, 1.2);
          return { ...reel, score, id: reel.id };
        });
      },
    );

    // Strip score field
    const plainData = items.map(({ score, ...reel }) => reel);

    let likedReelIds: string[] = [];
    let bookmarkedReelIds: string[] = [];

    if (userId && plainData.length > 0) {
      const reelIds = plainData.map(r => r.id as string);
      const [reactions, interactions] = await Promise.all([
        this.prisma.reelReaction.findMany({
          where: { userId, reelId: { in: reelIds } },
          select: { reelId: true },
          take: 50,
        }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
          take: 50,
        }),
      ]);
      likedReelIds = reactions.map(r => r.reelId);
      bookmarkedReelIds = interactions.map(i => i.reelId);
    }

    const enhancedData = plainData.map(reel => ({
      ...reel,
      isLiked: userId ? likedReelIds.includes(reel.id as string) : false,
      isBookmarked: userId ? bookmarkedReelIds.includes(reel.id as string) : false,
    }));

    return {
      data: enhancedData,
      meta: {
        cursor: hasMore ? String(page + 1) : null,
        hasMore,
      },
    };
  }

  /**
   * Trending reels endpoint — scored by completion rate + engagement.
   * Completion rate > 80% is the strongest signal (people watched the whole thing).
   * Works without auth for anonymous browsing.
   */
  async getTrendingReels(cursor?: string, limit = 20) {
    const sfeedKey = 'sfeed:bakra:trending';
    const page = cursor ? parseInt(cursor, 10) || 0 : 0;

    const { items, hasMore } = await this.scoredFeedCache.getPage(
      sfeedKey,
      page,
      limit,
      120,
      async (): Promise<ScoredItem[]> => {
        const trendingCutoff = new Date(Date.now() - TIME_WINDOWS.TRENDING_HOURS * 3600000);

        const reels = await this.prisma.reel.findMany({
          where: {
            status: ReelStatus.READY,
            isRemoved: false,
            isTrial: false,
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
            createdAt: { gte: trendingCutoff },
            user: { isDeactivated: false, isBanned: false, isDeleted: false, isPrivate: false },
          },
          select: {
            ...REEL_SELECT,
            savesCount: true,
          },
          take: 500,
          orderBy: { createdAt: 'desc' },
        });

        return reels.map((reel) => {
          const ageHours = Math.max(1, (Date.now() - reel.createdAt.getTime()) / 3600000);
          const completionProxy = reel.viewsCount > 0
            ? Math.min(1, (reel.likesCount + reel.commentsCount) / reel.viewsCount * 5)
            : 0;
          const engagement =
            completionProxy * 2.0 +
            reel.likesCount * 1.0 +
            reel.sharesCount * 3.0 +
            (reel.commentsCount * 1.5);
          const engagementRate = engagement / ageHours;
          return { ...reel, score: engagementRate, id: reel.id };
        });
      },
    );

    const data = items.map(({ score, ...reel }) => reel);

    return {
      data,
      meta: {
        hasMore,
        cursor: hasMore ? String(page + 1) : undefined,
      },
    };
  }

  async updateReel(reelId: string, userId: string, data: { caption?: string; hashtags?: string[] }) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException();
    if (reel.isRemoved) throw new BadRequestException('Reel has been removed');

    const updated = await this.prisma.reel.update({
      where: { id: reelId },
      data: {
        ...(data.caption !== undefined ? { caption: data.caption } : {}),
        ...(data.hashtags ? { hashtags: data.hashtags } : {}),
        updatedAt: new Date(),
      },
      select: REEL_SELECT,
    });

    // Re-index updated reel in search (use 'caption' to match Meilisearch searchableAttributes)
    this.publishWorkflow.onPublish({
      contentType: 'reel',
      contentId: reelId,
      userId,
      indexDocument: {
        id: reelId,
        caption: updated.caption || '',
        hashtags: updated.hashtags || [],
        username: updated.user?.username || '',
        userId,
      },
    }).catch(err => this.logger.warn('Publish workflow failed for reel update', err instanceof Error ? err.message : err));

    return updated;
  }

  async getById(reelId: string, userId?: string) {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: REEL_SELECT,
    });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');

    // Hide future-scheduled content from non-owners
    if (reel.scheduledAt && new Date(reel.scheduledAt) > new Date() && reel.user?.id !== userId) {
      throw new NotFoundException('Reel not found');
    }

    // Check block status
    if (userId && reel.user && userId !== reel.user.id) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: reel.user.id },
            { blockerId: reel.user.id, blockedId: userId },
          ],
        },
      });
      if (blocked) throw new NotFoundException('Reel not found');
    }

    let isLiked = false;
    let isBookmarked = false;

    if (userId) {
      const [reaction, interaction] = await Promise.all([
        this.prisma.reelReaction.findUnique({
          where: { userId_reelId: { userId, reelId } },
        }),
        this.prisma.reelInteraction.findUnique({
          where: { userId_reelId: { userId, reelId } },
        }),
      ]);
      isLiked = !!reaction;
      isBookmarked = !!interaction?.saved;
    }

    return { ...reel, isLiked, isBookmarked };
  }

  async recordView(reelId: string): Promise<void> {
    await this.prisma.reel.update({
      where: { id: reelId },
      data: { viewsCount: { increment: 1 } },
    }).catch(() => {});
  }

  async delete(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.reel.update({
        where: { id: reelId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "users" SET "reelsCount" = GREATEST("reelsCount" - 1, 0) WHERE id = ${userId}`,
    ]);

    // Decrement hashtag counters for removed reel
    if (reel.hashtags && reel.hashtags.length > 0) {
      await Promise.all(
        reel.hashtags.map((name: string) =>
          this.prisma.$executeRaw`UPDATE "hashtags" SET "reelsCount" = GREATEST("reelsCount" - 1, 0) WHERE name = ${name}`,
        ),
      );
    }

    // Clean up from Cloudflare Stream
    if (reel.streamId) {
      this.stream.deleteVideo(reel.streamId).catch((err) => {
        this.logger.warn(`Failed to delete Stream reel ${reel.streamId}`, err);
      });
    }

    // Unpublish workflow: search index removal, cache invalidation, real-time event
    this.publishWorkflow.onUnpublish({
      contentType: 'reel',
      contentId: reelId,
      userId,
    }).catch(err => this.logger.warn('Unpublish workflow failed for reel', err instanceof Error ? err.message : err));

    return { deleted: true };
  }

  /** Convert a trial reel to a published reel (visible in feeds) */
  async publishTrial(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException();
    if (!reel.isTrial) throw new BadRequestException('Reel is not a trial');

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { isTrial: false },
    });

    // Index the now-public reel in search
    this.publishWorkflow.onPublish({
      contentType: 'reel',
      contentId: reelId,
      userId,
      indexDocument: {
        id: reelId,
        caption: reel.caption || '',
        hashtags: reel.hashtags || [],
        userId,
      },
    }).catch(err => this.logger.warn('Publish workflow failed for trial reel publish', err instanceof Error ? err.message : err));

    return { published: true };
  }

  async like(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');
    if (reel.scheduledAt && new Date(reel.scheduledAt) > new Date() && reel.userId !== userId) throw new NotFoundException('Reel not found');

    // Prevent self-like
    if (reel.userId === userId) {
      throw new BadRequestException('Cannot like your own reel');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.reelReaction.create({
          data: { userId, reelId, reaction: ReactionType.LIKE },
        }),
        this.prisma.reelInteraction.upsert({
          where: { userId_reelId: { userId, reelId } },
          create: { userId, reelId, liked: true },
          update: { liked: true },
        }),
        this.prisma.$executeRaw`
          UPDATE "reels"
          SET "likesCount" = GREATEST(0, "likesCount" + 1)
          WHERE id = ${reelId}
        `,
      ]);
      // Notify reel owner (skip self-notification) — use REEL_LIKE so PushTriggerService routes correctly
      if (reel.userId && reel.userId !== userId) {
        this.notifications.create({
          userId: reel.userId, actorId: userId,
          type: 'REEL_LIKE', reelId,
        }).catch((err) => this.logger.error('Failed to create notification', err));
      }
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Already liked');
      }
      throw err;
    }
    return { liked: true };
  }

  async unlike(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');

    try {
      await this.prisma.$transaction([
        this.prisma.reelReaction.delete({
          where: { userId_reelId: { userId, reelId } },
        }),
        this.prisma.reelInteraction.upsert({
          where: { userId_reelId: { userId, reelId } },
          create: { userId, reelId, liked: false },
          update: { liked: false },
        }),
        this.prisma.$executeRaw`
          UPDATE "reels"
          SET "likesCount" = GREATEST(0, "likesCount" - 1)
          WHERE id = ${reelId}
        `,
      ]);
    } catch (err: unknown) {
      // P2025 = record not found (already deleted by a concurrent request)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Like not found');
      }
      throw err;
    }
    return { liked: false };
  }

  async comment(reelId: string, userId: string, content: string, parentId?: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');
    if (reel.scheduledAt && new Date(reel.scheduledAt) > new Date() && reel.userId !== userId) throw new NotFoundException('Reel not found');

    // Enforce commentPermission — owner always allowed
    const perm = reel.commentPermission ?? 'EVERYONE';
    const isOwner = reel.userId && reel.userId === userId;
    if (!isOwner && perm === 'NOBODY') {
      throw new ForbiddenException('Comments are disabled on this reel');
    }
    if (perm === 'FOLLOWERS' && reel.userId && reel.userId !== userId) {
      const follows = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: reel.userId } },
      });
      if (!follows) {
        throw new ForbiddenException('Only followers can comment on this reel');
      }
    }

    // Validate parentId belongs to the same reel
    if (parentId) {
      const parent = await this.prisma.reelComment.findUnique({ where: { id: parentId } });
      if (!parent || parent.reelId !== reelId) throw new NotFoundException('Parent comment not found');
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.reelComment.create({
        data: {
          userId,
          reelId,
          content: sanitizeText(content),
          ...(parentId && { parentId }),
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.$executeRaw`
        UPDATE "reels"
        SET "commentsCount" = "commentsCount" + 1
        WHERE id = ${reelId}
      `,
    ]);
    // Notify reel owner (skip self-notification) — use REEL_COMMENT so PushTriggerService routes correctly
    if (reel.userId && reel.userId !== userId) {
      this.notifications.create({
        userId: reel.userId, actorId: userId,
        type: 'REEL_COMMENT', reelId,
        body: content.substring(0, 100),
      }).catch((err) => this.logger.error('Failed to create notification', err));
    }
    return comment;
  }

  async deleteComment(reelId: string, commentId: string, userId: string) {
    const comment = await this.prisma.reelComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.reelId !== reelId) throw new NotFoundException('Comment not found');

    // Allow comment author OR reel owner to delete the comment
    if (comment.userId !== userId) {
      const reel = await this.prisma.reel.findUnique({ where: { id: reelId }, select: { userId: true } });
      if (!reel || reel.userId !== userId) throw new ForbiddenException('Not your comment');
    }

    await this.prisma.$transaction([
      this.prisma.reelComment.update({ where: { id: commentId }, data: { content: '[deleted]' } }),
      this.prisma.$executeRaw`UPDATE "reels" SET "commentsCount" = GREATEST(0, "commentsCount" - 1) WHERE id = ${reelId}`,
    ]);
    return { deleted: true };
  }

  async likeComment(reelId: string, commentId: string, userId: string) {
    const comment = await this.prisma.reelComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.reelId !== reelId) throw new NotFoundException('Comment not found');

    try {
      await this.prisma.$transaction([
        this.prisma.reelCommentReaction.create({
          data: { commentId, userId },
        }),
        this.prisma.reelComment.update({
          where: { id: commentId },
          data: { likesCount: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { liked: true };
      }
      throw error;
    }
    return { liked: true };
  }

  async unlikeComment(reelId: string, commentId: string, userId: string) {
    const comment = await this.prisma.reelComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.reelId !== reelId) throw new NotFoundException('Comment not found');

    const deleted = await this.prisma.reelCommentReaction.deleteMany({
      where: { commentId, userId },
    });
    if (deleted.count > 0) {
      await this.prisma.$executeRaw`UPDATE "reel_comments" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${commentId}`;
    }
    return { unliked: true };
  }

  async getComments(reelId: string, userId: string | undefined, cursor?: string, limit = 20) {
    // Build excluded user IDs from blocks/mutes
    let excludedUserIds: string[] = [];
    if (userId) {
      const [blocks, mutes] = await Promise.all([
        this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true },
      take: 50,
    }),
        this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true },
      take: 50,
    }),
      ]);
      excludedUserIds = [
        ...blocks.map(b => b.blockedId),
        ...mutes.map(m => m.mutedId),
      ];
    }

    const comments = await this.prisma.reelComment.findMany({
      where: {
        reelId,
        ...(excludedUserIds.length ? { userId: { notIn: excludedUserIds } } : {}),
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async share(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');

    // Use interactive transaction to atomically check-and-update, avoiding double-counting
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reelInteraction.findUnique({
        where: { userId_reelId: { userId, reelId } },
        select: { shared: true },
      });
      if (existing?.shared) return; // Already shared, skip increment

      await tx.reelInteraction.upsert({
        where: { userId_reelId: { userId, reelId } },
        create: { userId, reelId, shared: true },
        update: { shared: true },
      });
      await tx.$executeRaw`
        UPDATE "reels"
        SET "sharesCount" = "sharesCount" + 1
        WHERE id = ${reelId}
      `;
    });

    return { shared: true };
  }

  async bookmark(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');
    if (reel.scheduledAt && new Date(reel.scheduledAt) > new Date() && reel.userId !== userId) throw new NotFoundException('Reel not found');

    // Use interactive transaction to atomically check-and-update
    const alreadyBookmarked = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reelInteraction.findUnique({
        where: { userId_reelId: { userId, reelId } },
        select: { saved: true },
      });
      if (existing?.saved) return true;

      await tx.reelInteraction.upsert({
        where: { userId_reelId: { userId, reelId } },
        create: { userId, reelId, saved: true },
        update: { saved: true },
      });
      await tx.$executeRaw`
        UPDATE "reels"
        SET "savesCount" = "savesCount" + 1
        WHERE id = ${reelId}
      `;
      return false;
    });

    if (alreadyBookmarked) throw new ConflictException('Already bookmarked');
    return { bookmarked: true };
  }

  async unbookmark(reelId: string, userId: string) {
    // Use interactive transaction to atomically check-and-update
    const wasBookmarked = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reelInteraction.findUnique({
        where: { userId_reelId: { userId, reelId } },
        select: { saved: true },
      });
      if (!existing?.saved) return false;

      await tx.reelInteraction.update({
        where: { userId_reelId: { userId, reelId } },
        data: { saved: false },
      });
      await tx.$executeRaw`
        UPDATE "reels"
        SET "savesCount" = GREATEST("savesCount" - 1, 0)
        WHERE id = ${reelId}
      `;
      return true;
    });

    if (!wasBookmarked) throw new NotFoundException('Bookmark not found');
    return { bookmarked: false };
  }

  async view(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');

    // Use interactive transaction to atomically check-and-update, avoiding double-counting
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reelInteraction.findUnique({
        where: { userId_reelId: { userId, reelId } },
        select: { viewed: true },
      });
      if (existing?.viewed) return; // Already viewed, skip increment

      await tx.reelInteraction.upsert({
        where: { userId_reelId: { userId, reelId } },
        create: { userId, reelId, viewed: true },
        update: { viewed: true },
      });
      await tx.$executeRaw`
        UPDATE "reels"
        SET "viewsCount" = "viewsCount" + 1
        WHERE id = ${reelId}
      `;
    });

    return { viewed: true };
  }

  async getUserReels(username: string, cursor?: string, limit = 20, userId?: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    const isOwn = userId === user.id;
    // Owner sees all reels (including trial + scheduled); others see only published non-trial
    const trialFilter = isOwn ? {} : { isTrial: false };
    const scheduledFilter = isOwn ? {} : { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] };
    const reels = await this.prisma.reel.findMany({
      where: { userId: user.id, status: ReelStatus.READY, isRemoved: false, ...trialFilter, ...scheduledFilter },
      select: REEL_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = reels.length > limit;
    const items = hasMore ? reels.slice(0, limit) : reels;

    let likedReelIds: string[] = [];
    let bookmarkedReelIds: string[] = [];

    if (userId && items.length > 0) {
      const reelIds = items.map(r => r.id);
      const [reactions, interactions] = await Promise.all([
        this.prisma.reelReaction.findMany({
          where: { userId, reelId: { in: reelIds } },
          select: { reelId: true },
      take: 50,
    }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
      take: 50,
    }),
      ]);
      likedReelIds = reactions.map(r => r.reelId);
      bookmarkedReelIds = interactions.map(i => i.reelId);
    }

    const data = items.map((reel) => ({
      ...reel,
      isLiked: userId ? likedReelIds.includes(reel.id) : false,
      isBookmarked: userId ? bookmarkedReelIds.includes(reel.id) : false,
    }));

    return {
      data,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async report(reelId: string, userId: string, reason: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId }, select: { id: true } });
    if (!reel) throw new NotFoundException('Reel not found');

    const existing = await this.prisma.report.findFirst({
      where: { reporterId: userId, description: `reel:${reelId}` },
    });
    if (existing) return { reported: true };

    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
      INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        description: `reel:${reelId}`,
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason, // Safe: reasonMap fallback guarantees valid ReportReason
      },
    });
    return { reported: true };
  }

  async getByAudioTrack(audioTrackId: string, cursor?: string, limit = 20, userId?: string) {
    const reels = await this.prisma.reel.findMany({
      where: { audioTrackId, status: ReelStatus.READY, isRemoved: false, isTrial: false, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
      select: REEL_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = reels.length > limit;
    const items = hasMore ? reels.slice(0, limit) : reels;

    let likedReelIds: string[] = [];
    let bookmarkedReelIds: string[] = [];

    if (userId && items.length > 0) {
      const reelIds = items.map(r => r.id);
      const [reactions, interactions] = await Promise.all([
        this.prisma.reelReaction.findMany({
          where: { userId, reelId: { in: reelIds } },
          select: { reelId: true },
      take: 50,
    }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
      take: 50,
    }),
      ]);
      likedReelIds = reactions.map(r => r.reelId);
      bookmarkedReelIds = interactions.map(i => i.reelId);
    }

    const data = items.map((reel) => ({
      ...reel,
      isLiked: userId ? likedReelIds.includes(reel.id) : false,
      isBookmarked: userId ? bookmarkedReelIds.includes(reel.id) : false,
    }));

    return {
      data,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async getDuets(reelId: string, cursor?: string, limit = 20, userId?: string) {
    const parent = await this.prisma.reel.findUnique({
      where: { id: reelId, status: ReelStatus.READY, isRemoved: false },
    });
    if (!parent) throw new NotFoundException('Reel not found');

    const reels = await this.prisma.reel.findMany({
      where: { duetOfId: reelId, status: ReelStatus.READY, isRemoved: false, isTrial: false, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
      select: REEL_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = reels.length > limit;
    const items = hasMore ? reels.slice(0, limit) : reels;

    let likedReelIds: string[] = [];
    let bookmarkedReelIds: string[] = [];

    if (userId && items.length > 0) {
      const reelIds = items.map(r => r.id);
      const [reactions, interactions] = await Promise.all([
        this.prisma.reelReaction.findMany({
          where: { userId, reelId: { in: reelIds } },
          select: { reelId: true },
      take: 50,
    }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
      take: 50,
    }),
      ]);
      likedReelIds = reactions.map(r => r.reelId);
      bookmarkedReelIds = interactions.map(i => i.reelId);
    }

    const data = items.map((reel) => ({
      ...reel,
      isLiked: userId ? likedReelIds.includes(reel.id) : false,
      isBookmarked: userId ? bookmarkedReelIds.includes(reel.id) : false,
    }));

    return {
      data,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async getStitches(reelId: string, cursor?: string, limit = 20, userId?: string) {
    const parent = await this.prisma.reel.findUnique({
      where: { id: reelId, status: ReelStatus.READY, isRemoved: false },
    });
    if (!parent) throw new NotFoundException('Reel not found');

    const reels = await this.prisma.reel.findMany({
      where: { stitchOfId: reelId, status: ReelStatus.READY, isRemoved: false, isTrial: false, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
      select: REEL_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = reels.length > limit;
    const items = hasMore ? reels.slice(0, limit) : reels;

    let likedReelIds: string[] = [];
    let bookmarkedReelIds: string[] = [];

    if (userId && items.length > 0) {
      const reelIds = items.map(r => r.id);
      const [reactions, interactions] = await Promise.all([
        this.prisma.reelReaction.findMany({
          where: { userId, reelId: { in: reelIds } },
          select: { reelId: true },
      take: 50,
    }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
      take: 50,
    }),
      ]);
      likedReelIds = reactions.map(r => r.reelId);
      bookmarkedReelIds = interactions.map(i => i.reelId);
    }

    const data = items.map((reel) => ({
      ...reel,
      isLiked: userId ? likedReelIds.includes(reel.id) : false,
      isBookmarked: userId ? bookmarkedReelIds.includes(reel.id) : false,
    }));

    return {
      data,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async archive(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException();

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { isArchived: true },
    });
    return { archived: true };
  }

  async unarchive(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException();

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { isArchived: false },
    });
    return { archived: false };
  }

  async getShareLink(reelId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId }, select: { id: true, isRemoved: true } });
    if (!reel || reel.isRemoved) throw new NotFoundException('Reel not found');
    return { url: `https://mizanly.app/reel/${reelId}` };
  }

  private async moderateReelThumbnail(userId: string, reelId: string, imageUrl: string): Promise<void> {
    try {
      const result = await this.ai.moderateImage(imageUrl);
      if (result.classification === 'BLOCK') {
        await this.prisma.reel.update({
          where: { id: reelId },
          data: { isRemoved: true, isSensitive: true },
        });
        this.logger.warn(`Reel ${reelId} auto-removed: thumbnail blocked (${result.reason})`);

        // Unpublish workflow on auto-moderation removal
        this.publishWorkflow.onUnpublish({
          contentType: 'reel',
          contentId: reelId,
          userId,
        }).catch(err => this.logger.warn('Unpublish workflow failed for moderated reel', err instanceof Error ? err.message : err));

        // Notify user their content was removed
        this.notifications.create({
          userId, actorId: userId, type: 'SYSTEM', reelId,
          title: 'Content removed',
          body: 'Your reel was removed because it violates community guidelines.',
        }).catch(() => {});
      } else if (result.classification === 'WARNING') {
        await this.prisma.reel.update({
          where: { id: reelId },
          data: { isSensitive: true },
        });
        this.logger.log(`Reel ${reelId} marked sensitive: ${result.reason}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reel thumbnail moderation error for ${reelId}: ${msg}`);
    }
  }

  // Finding #376: Reel draft — save draft state without publishing
  // NOTE: ReelStatus enum lacks a DRAFT value (only PROCESSING/READY/FAILED).
  // Using PROCESSING as the draft marker until a schema migration adds DRAFT.
  async saveDraft(userId: string, dto: CreateReelDto) {
    const draft = await this.prisma.reel.create({
      data: {
        userId,
        videoUrl: dto.videoUrl || '',
        duration: dto.duration || 0,
        caption: dto.caption ? sanitizeText(dto.caption) : '',
        hashtags: dto.hashtags ?? [],
        mentions: dto.mentions ?? [],
        status: ReelStatus.PROCESSING,
        altText: dto.altText,
        topics: dto.topics ?? [],
      },
      select: REEL_SELECT,
    });
    return draft;
  }

  // Finding #376: Get user's draft reels (uses PROCESSING as draft marker)
  async getDrafts(userId: string) {
    const drafts = await this.prisma.reel.findMany({
      where: { userId, status: ReelStatus.PROCESSING, isRemoved: false },
      select: REEL_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { data: drafts };
  }

  // Finding #376: Delete a draft
  async deleteDraft(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException();
    if (reel.status !== ReelStatus.PROCESSING) throw new BadRequestException('Only drafts can be deleted this way');

    await this.prisma.reel.delete({ where: { id: reelId } });
    return { deleted: true };
  }

  // Finding #317: Get download URL with optional watermark
  async getDownloadUrl(reelId: string, userId: string, withWatermark = true) {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      include: { user: { select: { username: true } } },
    });
    if (!reel || reel.isRemoved) throw new NotFoundException('Reel not found');

    // Original quality URL (Finding #318)
    const originalUrl = reel.videoUrl;

    return {
      url: originalUrl,
      watermark: withWatermark,
      // Watermark overlay is done client-side (mobile FFmpeg) — we provide the brand text
      watermarkText: withWatermark ? '@' + (reel.user?.username ?? 'unknown') + ' • mizanly.app' : null,
      quality: 'original',
    };
  }

  // Finding #384: Content accessibility checker — remind creator about missing fields
  getAccessibilityReport(reel: Record<string, unknown>) {
    const issues: string[] = [];
    if (!reel.altText) issues.push('Add alt text for visually impaired users');
    if (!reel.caption) issues.push('Add a caption for better discoverability');
    if (typeof reel.hashtags === 'object' && Array.isArray(reel.hashtags) && reel.hashtags.length === 0) {
      issues.push('Add hashtags to help others find your content');
    }

    return {
      score: issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 30),
      issues,
      isComplete: issues.length === 0,
    };
  }
}
