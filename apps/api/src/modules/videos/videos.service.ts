import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { CountdownTheme, EndScreenType, ScreenPosition } from '@prisma/client';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { Prisma, VideoStatus, VideoCategory, ReportReason } from '@prisma/client';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { GamificationService } from '../gamification/gamification.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
import { AiService } from '../ai/ai.service';
import { QueueService } from '../../common/queue/queue.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { getExcludedUserIds } from '../../common/utils/excluded-users';

const VIDEO_SELECT = {
  id: true,
  userId: true,
  channelId: true,
  title: true,
  description: true,
  videoUrl: true,
  streamId: true,
  hlsUrl: true,
  dashUrl: true,
  qualities: true,
  isLooping: true,
  normalizeAudio: true,
  thumbnailUrl: true,
  duration: true,
  category: true,
  tags: true,
  chapters: true,
  viewsCount: true,
  likesCount: true,
  dislikesCount: true,
  commentsCount: true,
  status: true,
  isRemoved: true,
  scheduledAt: true,
  publishedAt: true,
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
  channel: {
    select: {
      id: true,
      handle: true,
      name: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

type VideoWithRelations = Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>;

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private notifications: NotificationsService,
    private stream: StreamService,
    private gamification: GamificationService,
    private contentSafety: ContentSafetyService,
    private ai: AiService,
    private queueService: QueueService,
    private configService: ConfigService,
    private publishWorkflow: PublishWorkflowService,
  ) {}

  private async enhanceVideos(videos: VideoWithRelations[], userId?: string) {
    if (!userId || videos.length === 0) return videos;
    const videoIds = videos.map(v => v.id);
    const [reactions, bookmarks] = await Promise.all([
      this.prisma.videoReaction.findMany({
        where: { userId, videoId: { in: videoIds } },
        select: { videoId: true, isLike: true },
      }),
      this.prisma.videoBookmark.findMany({
        where: { userId, videoId: { in: videoIds } },
        select: { videoId: true },
      }),
    ]);
    const likedVideoIds = reactions.filter(r => r.isLike).map(r => r.videoId);
    const dislikedVideoIds = reactions.filter(r => !r.isLike).map(r => r.videoId);
    const bookmarkedVideoIds = bookmarks.map(b => b.videoId);
    return videos.map(video => ({
      ...video,
      isLiked: likedVideoIds.includes(video.id),
      isDisliked: dislikedVideoIds.includes(video.id),
      isBookmarked: bookmarkedVideoIds.includes(video.id),
    }));
  }

  async create(userId: string, dto: CreateVideoDto) {
    // Verify channel exists and user owns it
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException();

    // Pre-save content moderation: block harmful text before persisting (Finding 45)
    const moderationText = [dto.title, dto.description].filter(Boolean).join('\n');
    if (moderationText) {
      const moderationResult = await this.contentSafety.moderateText(moderationText);
      if (!moderationResult.safe) {
        this.logger.warn(`Video creation blocked by content safety: flags=${moderationResult.flags.join(',')}, userId=${userId}`);
        throw new BadRequestException(
          `Content flagged: ${moderationResult.flags.join(', ')}. ${moderationResult.suggestion || 'Please revise your video details.'}`,
        );
      }
    }

    // Pre-save thumbnail moderation: block harmful images before persisting (Finding 45)
    if (dto.thumbnailUrl) {
      const imageResult = await this.ai.moderateImage(dto.thumbnailUrl);
      if (imageResult.classification === 'BLOCK') {
        this.logger.warn(`Video creation blocked: thumbnail BLOCKED — ${imageResult.reason}, userId=${userId}`);
        throw new BadRequestException('Thumbnail image violates community guidelines');
      }
    }

    const video = await this.prisma.$transaction([
      this.prisma.video.create({
        data: {
          userId,
          channelId: dto.channelId,
          title: sanitizeText(dto.title),
          description: dto.description ? sanitizeText(dto.description) : dto.description,
          videoUrl: dto.videoUrl,
          thumbnailUrl: dto.thumbnailUrl,
          duration: dto.duration,
          category: dto.category || VideoCategory.OTHER,
          tags: dto.tags || [],
          normalizeAudio: dto.normalizeAudio ?? false,
          status: VideoStatus.PROCESSING,
        },
        select: VIDEO_SELECT,
      }),
      this.prisma.channel.update({
        where: { id: dto.channelId },
        data: { videosCount: { increment: 1 } },
      }),
    ]);

    // Media processing: EXIF strip, resize variants, BlurHash for thumbnail (fire-and-forget)
    if (dto.thumbnailUrl) {
      const mediaKey = dto.thumbnailUrl.split('/').slice(-3).join('/');
      this.queueService.addMediaProcessingJob({
        mediaUrl: dto.thumbnailUrl, mediaKey, userId, contentType: 'video', contentId: video[0].id,
      }).catch(err => this.logger.warn(`Failed to queue media processing for video ${video[0].id}: ${err instanceof Error ? err.message : err}`));
    }

    // Kick off Cloudflare Stream ingestion (async — don't block response)
    this.stream.uploadFromUrl(dto.videoUrl, { title: dto.title, creatorId: userId })
      .then(async (streamId) => {
        await this.prisma.video.update({
          where: { id: video[0].id },
          data: { streamId },
        });
        this.logger.log(`Video ${video[0].id} submitted to Stream as ${streamId}`);
      })
      .catch((err) => {
        this.logger.error(`Stream upload failed for video ${video[0].id}`, err);
        // Fall back to PUBLISHED with raw R2 URL
        this.prisma.video.update({
          where: { id: video[0].id },
          data: { status: 'PUBLISHED' },
        }).catch((e) => this.logger.error('Failed to update video status', e));
      });

    // Publish workflow: search index, cache invalidation, real-time event
    this.publishWorkflow.onPublish({
      contentType: 'video',
      contentId: video[0].id,
      userId,
      indexDocument: {
        id: video[0].id,
        title: dto.title,
        description: dto.description || '',
        tags: dto.tags || [],
        username: video[0].user?.username || '',
        userId,
        channelId: dto.channelId,
        category: dto.category || 'OTHER',
        status: 'PROCESSING',
      },
    }).catch(err => this.logger.warn('Publish workflow failed for video', err instanceof Error ? err.message : err));

    // Gamification: award XP + update streak
    this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'video_created' }).catch(err => this.logger.warn('Failed to queue gamification XP for video', err instanceof Error ? err.message : err));
    this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Failed to queue gamification streak for video', err instanceof Error ? err.message : err));

    // Invalidate video feed cache so new video appears immediately
    this.invalidateVideoFeedCache().catch((err) => this.logger.debug('Video feed cache invalidation failed', err instanceof Error ? err.message : err));

    // Notify channel subscribers about the new video (fire-and-forget, capped at 200)
    this.prisma.subscription.findMany({
      where: { channelId: dto.channelId },
      select: { userId: true },
      take: 200,
    }).then((subscribers: Array<{ userId: string }>) => {
      for (const sub of subscribers) {
        if (sub.userId !== userId) {
          this.notifications.create({
            userId: sub.userId,
            actorId: userId,
            type: 'VIDEO_PUBLISHED',
            videoId: video[0].id,
            title: dto.title,
            body: `New video on ${channel.name}: ${dto.title}`,
          }).catch((e: unknown) => this.logger.warn(`Video published notification failed: ${e instanceof Error ? e.message : e}`));
        }
      }
    }).catch((e: unknown) => this.logger.warn(`Failed to fetch subscribers for video notification: ${e instanceof Error ? e.message : e}`));

    return {
      ...video[0],
      isLiked: false,
      isDisliked: false,
      isBookmarked: false,
    };
  }

  /**
   * Invalidate video feed cache keys.
   * Uses SCAN to find and delete matching keys without blocking Redis.
   */
  private async invalidateVideoFeedCache() {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'feed:videos:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  async getFeed(userId: string | undefined, category?: string, cursor?: string, limit = 20) {
    // Cache for 30 seconds if user is logged in
    if (userId) {
      const cacheKey = `feed:videos:${userId}:${category ?? 'all'}:${cursor ?? 'first'}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    // Use shared cached utility (Redis-cached 60s) instead of 2 separate block+mute queries
    const excludedIds = userId ? await getExcludedUserIds(this.prisma, this.redis, userId) : [];

    // Build feed: videos from subscribed channels + trending (by views)
    const subscribedChannels = userId ? await this.prisma.subscription.findMany({
      where: { userId },
      select: { channelId: true },
      take: 50,
    }) : [];

    const channelIds = subscribedChannels.map(s => s.channelId);

    const where: Prisma.VideoWhereInput = {
      status: VideoStatus.PUBLISHED,
      isRemoved: false,
      user: { isPrivate: false, isDeactivated: false, isBanned: false, isDeleted: false },
      ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
      ...(category && category !== 'all' ? (() => {
        const validCategories = Object.values(VideoCategory);
        if (!validCategories.includes(category as VideoCategory)) {
          throw new BadRequestException(`Invalid video category: ${category}`);
        }
        return { category: category as VideoCategory };
      })() : {}),
      AND: [
        // Prioritize subscribed channels if user has subscriptions
        ...(channelIds.length ? [{ OR: [{ channelId: { in: channelIds } }, { channelId: { notIn: channelIds } }] }] : []),
        { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
      ],
    };

    // If user has subscriptions, prioritize subscribed channels
    const orderBy: Prisma.VideoOrderByWithRelationInput[] = [
      { publishedAt: 'desc' },
      { viewsCount: 'desc' },
    ];

    const videos = await this.prisma.video.findMany({
      where,
      select: VIDEO_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy,
    });

    const hasMore = videos.length > limit;
    const data = hasMore ? videos.slice(0, limit) : videos;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    let likedVideoIds: string[] = [];
    let dislikedVideoIds: string[] = [];
    let bookmarkedVideoIds: string[] = [];

    if (userId && data.length > 0) {
      const videoIds = data.map(v => v.id);
      const [reactions, interactions] = await Promise.all([
        this.prisma.videoReaction.findMany({
          where: { userId, videoId: { in: videoIds } },
          select: { videoId: true, isLike: true },
      take: 50,
    }),
        this.prisma.videoBookmark.findMany({
          where: { userId, videoId: { in: videoIds } },
          select: { videoId: true },
      take: 50,
    }),
      ]);
      likedVideoIds = reactions.filter(r => r.isLike).map(r => r.videoId);
      dislikedVideoIds = reactions.filter(r => !r.isLike).map(r => r.videoId);
      bookmarkedVideoIds = interactions.map(i => i.videoId);
    }

    const enhancedData = data.map(video => ({
      ...video,
      isLiked: userId ? likedVideoIds.includes(video.id) : false,
      isDisliked: userId ? dislikedVideoIds.includes(video.id) : false,
      isBookmarked: userId ? bookmarkedVideoIds.includes(video.id) : false,
    }));

    const result = {
      data: enhancedData,
      meta: { cursor: nextCursor, hasMore },
    };

    if (userId) {
      const cacheKey = `feed:videos:${userId}:${category ?? 'all'}:${cursor ?? 'first'}`;
      await this.redis.setex(cacheKey, 30, JSON.stringify(result));
    }

    return result;
  }

  async getById(videoId: string, userId?: string) {
    const video = await this.prisma.video.findFirst({
      where: {
        id: videoId,
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
      },
      select: VIDEO_SELECT,
    });
    if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');

    // Hide future-scheduled content from non-owners
    if (video.scheduledAt && new Date(video.scheduledAt) > new Date() && video.user?.id !== userId) {
      throw new NotFoundException('Video not found');
    }

    // Check block status
    if (userId && video.user && userId !== video.user.id) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: video.user.id },
            { blockerId: video.user.id, blockedId: userId },
          ],
        },
      });
      if (blocked) throw new NotFoundException('Video not found');
    }

    let isLiked = false;
    let isDisliked = false;
    let isBookmarked = false;
    let isSubscribed = false;

    if (userId) {
      const [reaction, bookmark, subscription] = await Promise.all([
        this.prisma.videoReaction.findUnique({
          where: { userId_videoId: { userId, videoId } },
        }),
        this.prisma.videoBookmark.findUnique({
          where: { userId_videoId: { userId, videoId } },
        }),
        this.prisma.subscription.findUnique({
          where: { userId_channelId: { userId, channelId: video.channelId } },
        }),
      ]);
      isLiked = reaction?.isLike === true;
      isDisliked = reaction?.isLike === false;
      isBookmarked = !!bookmark;
      isSubscribed = !!subscription;
    }

    return {
      ...video,
      isLiked,
      isDisliked,
      isBookmarked,
      isSubscribed,
    };
  }

  async update(videoId: string, userId: string, dto: UpdateVideoDto) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException();

    // Pre-save text moderation on updated title/description (prevents edit attack)
    const moderationText = [dto.title, dto.description].filter(Boolean).join(' ');
    if (moderationText) {
      const modResult = await this.contentSafety.moderateText(moderationText);
      if (!modResult.safe) {
        throw new BadRequestException(`Content flagged: ${modResult.flags?.join(', ') || 'policy violation'}`);
      }
    }

    // Pre-save thumbnail moderation on update (prevents bait-and-switch with harmful thumbnails)
    if (dto.thumbnailUrl && dto.thumbnailUrl !== video.thumbnailUrl) {
      const imageResult = await this.ai.moderateImage(dto.thumbnailUrl);
      if (imageResult.classification === 'BLOCK') {
        this.logger.warn(`Video update blocked: thumbnail BLOCKED — ${imageResult.reason}, userId=${userId}, videoId=${videoId}`);
        throw new BadRequestException('Thumbnail image violates community guidelines');
      }
    }

    const updated = await this.prisma.video.update({
      where: { id: videoId },
      data: {
        title: dto.title ? sanitizeText(dto.title) : dto.title,
        description: dto.description ? sanitizeText(dto.description) : dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        category: dto.category,
        tags: dto.tags,
      },
      select: VIDEO_SELECT,
    });

    // Invalidate cached translations — stale after content edit
    this.ai.clearTranslationCache(videoId)
      .catch(err => this.logger.warn(`Failed to clear translation cache for video ${videoId}`, err instanceof Error ? err.message : err));

    // Re-index updated video in search
    this.publishWorkflow.onPublish({
      contentType: 'video',
      contentId: videoId,
      userId,
      indexDocument: {
        id: videoId,
        title: updated.title || '',
        description: updated.description || '',
        tags: updated.tags || [],
        username: updated.user?.username || '',
        userId,
        channelId: updated.channelId,
        category: updated.category || 'OTHER',
        status: updated.status,
      },
    }).catch(err => this.logger.warn('Publish workflow failed for video update', err instanceof Error ? err.message : err));

    // Re-fetch flags
    const [reaction, bookmark] = await Promise.all([
      this.prisma.videoReaction.findUnique({
        where: { userId_videoId: { userId, videoId } },
      }),
      this.prisma.videoBookmark.findUnique({
        where: { userId_videoId: { userId, videoId } },
      }),
    ]);
    return {
      ...updated,
      isLiked: reaction?.isLike === true,
      isDisliked: reaction?.isLike === false,
      isBookmarked: !!bookmark,
    };
  }

  async delete(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.video.update({
        where: { id: videoId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`
        UPDATE "channels"
        SET "videosCount" = GREATEST("videosCount" - 1, 0)
        WHERE id = ${video.channelId}
      `,
    ]);

    // Clean up from Cloudflare Stream
    if (video.streamId) {
      this.stream.deleteVideo(video.streamId).catch((err) => {
        this.logger.warn(`Failed to delete Stream video ${video.streamId}`, err);
      });
    }

    // Invalidate cached translations for deleted video
    this.ai.clearTranslationCache(videoId)
      .catch(err => this.logger.warn(`Failed to clear translation cache for video ${videoId}`, err instanceof Error ? err.message : err));

    // Unpublish workflow: search index removal, cache invalidation, real-time event
    this.publishWorkflow.onUnpublish({
      contentType: 'video',
      contentId: videoId,
      userId,
    }).catch(err => this.logger.warn('Unpublish workflow failed for video', err instanceof Error ? err.message : err));

    // Invalidate video feed cache so deleted video disappears immediately
    this.invalidateVideoFeedCache().catch((err) => this.logger.debug('Video feed cache invalidation failed', err instanceof Error ? err.message : err));

    return { deleted: true };
  }

  async like(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');
    if (video.scheduledAt && new Date(video.scheduledAt) > new Date() && video.userId !== userId) throw new NotFoundException('Video not found');

    try {
      await this.prisma.$transaction(async (tx) => {
        // Read existing reaction INSIDE the transaction to prevent race condition
        const existingReaction = await tx.videoReaction.findUnique({
          where: { userId_videoId: { userId, videoId } },
        });
        if (existingReaction?.isLike === true) throw new ConflictException('Already liked');

        if (existingReaction) {
          // Update existing reaction (dislike → like flip)
          await tx.videoReaction.update({
            where: { userId_videoId: { userId, videoId } },
            data: { isLike: true },
          });
          // Decrement dislikesCount, increment likesCount
          await tx.$executeRaw`
            UPDATE "videos"
            SET "dislikesCount" = GREATEST(0, "dislikesCount" - 1),
                "likesCount" = GREATEST(0, "likesCount" + 1)
            WHERE id = ${videoId}
          `;
        } else {
          // Create new reaction
          await tx.videoReaction.create({
            data: { userId, videoId, isLike: true },
          });
          await tx.$executeRaw`
            UPDATE "videos"
            SET "likesCount" = GREATEST(0, "likesCount" + 1)
            WHERE id = ${videoId}
          `;
        }
      });

      // Notify video owner (not self)
      if (video.userId && video.userId !== userId) {
        this.notifications.create({
          userId: video.userId,
          actorId: userId,
          type: 'VIDEO_LIKE',
          videoId,
        }).catch((err) => this.logger.error('Failed to create notification', err));
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
        return { liked: true };
      }
      throw err;
    }

    return { liked: true };
  }

  async dislike(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');
    if (video.scheduledAt && new Date(video.scheduledAt) > new Date() && video.userId !== userId) throw new NotFoundException('Video not found');

    await this.prisma.$transaction(async (tx) => {
      // Read existing reaction INSIDE the transaction to prevent race condition
      const existingReaction = await tx.videoReaction.findUnique({
        where: { userId_videoId: { userId, videoId } },
      });
      if (existingReaction?.isLike === false) throw new ConflictException('Already disliked');

      if (existingReaction) {
        await tx.videoReaction.update({
          where: { userId_videoId: { userId, videoId } },
          data: { isLike: false },
        });
        await tx.$executeRaw`
          UPDATE "videos"
          SET "likesCount" = GREATEST(0, "likesCount" - 1),
              "dislikesCount" = GREATEST(0, "dislikesCount" + 1)
          WHERE id = ${videoId}
        `;
      } else {
        await tx.videoReaction.create({
          data: { userId, videoId, isLike: false },
        });
        await tx.$executeRaw`
          UPDATE "videos"
          SET "dislikesCount" = GREATEST(0, "dislikesCount" + 1)
          WHERE id = ${videoId}
        `;
      }
    });

    return { disliked: true };
  }

  async removeReaction(videoId: string, userId: string) {
    const existingReaction = await this.prisma.videoReaction.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    if (!existingReaction) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.videoReaction.delete({
        where: { userId_videoId: { userId, videoId } },
      }),
      existingReaction.isLike
        ? this.prisma.$executeRaw`
            UPDATE "videos"
            SET "likesCount" = GREATEST(0, "likesCount" - 1)
            WHERE id = ${videoId}
          `
        : this.prisma.$executeRaw`
            UPDATE "videos"
            SET "dislikesCount" = GREATEST(0, "dislikesCount" - 1)
            WHERE id = ${videoId}
          `,
    ]);

    return { removed: true };
  }

  async comment(videoId: string, userId: string, content: string, parentId?: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');
    if (video.scheduledAt && new Date(video.scheduledAt) > new Date() && video.userId !== userId) throw new NotFoundException('Video not found');

    // A05-#7: Content moderation on comments
    const modResult = await this.contentSafety.moderateText(content);
    if (!modResult.safe) {
      throw new BadRequestException(`Comment flagged: ${modResult.flags?.join(', ') || 'policy violation'}`);
    }

    // A05-#8: Validate parentId belongs to same video
    if (parentId) {
      const parent = await this.prisma.videoComment.findUnique({
        where: { id: parentId },
        select: { videoId: true },
      });
      if (!parent || parent.videoId !== videoId) {
        throw new BadRequestException('Parent comment does not belong to this video');
      }
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.videoComment.create({
        data: {
          userId,
          videoId,
          content: sanitizeText(content),
          parentId,
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
      this.prisma.video.update({
        where: { id: videoId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);

    // Notify video owner (if not own comment)
    if (video.userId && video.userId !== userId) {
      this.notifications.create({
        userId: video.userId,
        actorId: userId,
        type: 'VIDEO_COMMENT',
        videoId,
        body: content.substring(0, 100),
      }).catch((err) => this.logger.error('Failed to create notification', err));
    }

    return comment;
  }

  async getComments(videoId: string, cursor?: string, limit = 20) {
    const comments = await this.prisma.videoComment.findMany({
      where: {
        videoId,
        parentId: null, // top-level comments only
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        likesCount: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        _count: { select: { replies: true } },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { likesCount: 'desc' }, // sort by popular first
    });

    // Map _count.replies to repliesCount
    const mappedComments = comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      likesCount: comment.likesCount,
      repliesCount: comment._count?.replies ?? 0,
      user: comment.user,
    }));

    const hasMore = comments.length > limit;
    const items = hasMore ? mappedComments.slice(0, limit) : mappedComments;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async deleteComment(videoId: string, commentId: string, userId: string) {
    const comment = await this.prisma.videoComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.videoId !== videoId) throw new NotFoundException('Comment not found');

    // Allow both comment author AND video owner to delete
    if (comment.userId !== userId) {
      const video = await this.prisma.video.findUnique({ where: { id: videoId }, select: { userId: true } });
      if (!video || video.userId !== userId) throw new ForbiddenException();
    }

    await this.prisma.$transaction([
      this.prisma.videoComment.update({ where: { id: commentId }, data: { content: '[deleted]' } }),
      this.prisma.$executeRaw`UPDATE "videos" SET "commentsCount" = GREATEST("commentsCount" - 1, 0) WHERE id = ${videoId}`,
    ]);
    return { deleted: true };
  }

  async bookmark(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');
    if (video.scheduledAt && new Date(video.scheduledAt) > new Date() && video.userId !== userId) throw new NotFoundException('Video not found');

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.videoBookmark.findUnique({
          where: { userId_videoId: { userId, videoId } },
        });
        if (existing) throw new ConflictException('Already bookmarked');

        await tx.videoBookmark.create({ data: { userId, videoId } });
        await tx.$executeRaw`UPDATE "videos" SET "savesCount" = GREATEST(0, "savesCount" + 1) WHERE id = ${videoId}`;
      });
    } catch (err: unknown) {
      if (err instanceof ConflictException) throw err;
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
        return { bookmarked: true }; // Race condition — already bookmarked
      }
      throw err;
    }
    return { bookmarked: true };
  }

  async unbookmark(videoId: string, userId: string) {
    const existing = await this.prisma.videoBookmark.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    if (!existing) throw new NotFoundException('Bookmark not found');

    await this.prisma.$transaction([
      this.prisma.videoBookmark.delete({
        where: { userId_videoId: { userId, videoId } },
      }),
      this.prisma.$executeRaw`UPDATE "videos" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = ${videoId}`,
    ]);
    return { bookmarked: false };
  }

  async view(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');

    const now = new Date();

    // Deduplicate inside transaction to prevent race condition double-counting
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.watchHistory.findUnique({
        where: { userId_videoId: { userId, videoId } },
      });

      const isNewView = !existing || (now.getTime() - existing.watchedAt.getTime() > 24 * 60 * 60 * 1000);

      await tx.watchHistory.upsert({
        where: { userId_videoId: { userId, videoId } },
        create: { userId, videoId, watchedAt: now },
        update: { watchedAt: now },
      });

      if (isNewView) {
        await tx.video.update({
          where: { id: videoId },
          data: { viewsCount: { increment: 1 } },
        });
        await tx.channel.update({
          where: { id: video.channelId },
          data: { totalViews: { increment: 1 } },
        });
      }
    });

    return { viewed: true };
  }

  async updateProgress(videoId: string, userId: string, progress: number) {
    await this.prisma.watchHistory.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId, progress, completed: progress >= 95, watchedAt: new Date() },
      update: { progress, completed: progress >= 95, watchedAt: new Date() },
    });
    return { updated: true };
  }

  async report(videoId: string, userId: string, reason: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
    if (!video) throw new NotFoundException('Video not found');

    const existing = await this.prisma.report.findFirst({
      where: { reporterId: userId, reportedVideoId: videoId },
    });
    if (existing) return { reported: true };

    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM',
      HARASSMENT: 'HARASSMENT',
      HATE_SPEECH: 'HATE_SPEECH',
      VIOLENCE: 'VIOLENCE',
      MISINFORMATION: 'MISINFORMATION',
      NUDITY: 'NUDITY',
      IMPERSONATION: 'IMPERSONATION',
      OTHER: 'OTHER',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedVideoId: videoId,
        description: reason, // Store original user-provided reason text
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
      },
    });
    return { reported: true };
  }

  async getRecommended(videoId: string, limit = 10, userId?: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { channelId: true, category: true, tags: true },
    });
    if (!video) throw new NotFoundException('Video not found');

    const where: Prisma.VideoWhereInput = {
      id: { not: videoId },
      status: VideoStatus.PUBLISHED,
      isRemoved: false,
      user: { isBanned: false, isDeactivated: false, isDeleted: false },
      AND: [
        { OR: [
          { channelId: video.channelId },
          { category: video.category },
          ...(video.tags.length > 0 ? [{ tags: { hasSome: video.tags } }] : []),
        ] },
        { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
      ],
    };

    const videos = await this.prisma.video.findMany({
      where,
      select: VIDEO_SELECT,
      take: limit,
      orderBy: { viewsCount: 'desc' },
    });

    const enhanced = await this.enhanceVideos(videos, userId);
    return enhanced;
  }

  async getCommentReplies(commentId: string, cursor?: string, limit = 20) {
    const comment = await this.prisma.videoComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const replies = await this.prisma.videoComment.findMany({
      where: {
        parentId: commentId,
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        likesCount: true,
        user: {
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
      orderBy: { createdAt: 'asc' },
    });

    const hasMore = replies.length > limit;
    const data = hasMore ? replies.slice(0, limit) : replies;
    return {
      data,
      meta: { cursor: hasMore ? data[data.length - 1].id : null, hasMore },
    };
  }

  async getShareLink(videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    const appUrl = this.configService.get<string>('APP_URL') || 'https://mizanly.app';
    return { url: `${appUrl}/video/${videoId}` };
  }

  // ── Premiere ──────────────────────────────────────────

  async createPremiere(videoId: string, userId: string, dto: { scheduledAt: string; chatEnabled?: boolean; countdownTheme?: string; trailerUrl?: string }) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
    if (!video) throw new NotFoundException('Video not found');
    if (new Date(dto.scheduledAt) <= new Date()) throw new BadRequestException('Premiere must be in the future');

    // Atomic: create premiere + update video in single transaction
    const [premiere] = await this.prisma.$transaction([
      this.prisma.videoPremiere.create({
        data: {
          videoId,
          scheduledAt: new Date(dto.scheduledAt),
          chatEnabled: dto.chatEnabled ?? true,
          countdownTheme: (dto.countdownTheme || 'EMERALD') as CountdownTheme,
          trailerUrl: dto.trailerUrl,
        },
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: { isPremiereEnabled: true, scheduledAt: new Date(dto.scheduledAt) },
      }),
    ]);

    return premiere;
  }

  async getPremiere(videoId: string) {
    const premiere = await this.prisma.videoPremiere.findUnique({
      where: { videoId },
      include: {
        video: { select: { title: true, thumbnailUrl: true, userId: true, channel: { select: { name: true, handle: true, avatarUrl: true } } } },
      },
    });
    if (!premiere) throw new NotFoundException('Premiere not found');
    return premiere;
  }

  async setPremiereReminder(videoId: string, userId: string) {
    const premiere = await this.prisma.videoPremiere.findUnique({ where: { videoId } });
    if (!premiere) throw new NotFoundException('Premiere not found');

    try {
      await this.prisma.$transaction([
        this.prisma.premiereReminder.create({
          data: { premiereId: premiere.id, userId },
        }),
        this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = "reminderCount" + 1 WHERE id = ${premiere.id}`,
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return; // Already set — idempotent
      }
      throw error;
    }
    return;
  }

  async removePremiereReminder(videoId: string, userId: string) {
    const premiere = await this.prisma.videoPremiere.findUnique({ where: { videoId } });
    if (!premiere) throw new NotFoundException('Premiere not found');

    await this.prisma.$transaction([
      this.prisma.premiereReminder.delete({
        where: { premiereId_userId: { premiereId: premiere.id, userId } },
      }),
      this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = GREATEST("reminderCount" - 1, 0) WHERE id = ${premiere.id}`,
    ]);
    return;
  }

  async startPremiere(videoId: string, userId: string) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
    if (!video) throw new NotFoundException();

    // Bug 24: Also publish the video when premiere starts
    await this.prisma.$transaction([
      this.prisma.videoPremiere.update({
        where: { videoId },
        data: { isLive: true },
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: { status: VideoStatus.PUBLISHED, publishedAt: new Date() },
      }),
    ]);

    return;
  }

  // Bug 25: Add viewerCount increment for premieres
  async incrementPremiereViewerCount(videoId: string) {
    return this.prisma.videoPremiere.update({
      where: { videoId },
      data: { viewerCount: { increment: 1 } },
    });
  }

  async getPremiereViewerCount(videoId: string) {
    const premiere = await this.prisma.videoPremiere.findUnique({ where: { videoId } });
    return { viewerCount: premiere?.viewerCount || 0 };
  }

  // ── End Screens ───────────────────────────────────────

  async setEndScreens(videoId: string, userId: string, items: Array<{ type: string; targetId?: string; label: string; url?: string; position: string; showAtSeconds: number }>) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
    if (!video) throw new NotFoundException();
    if (items.length > 4) throw new BadRequestException('Maximum 4 end screen items');

    // Atomic: delete + create in a single transaction to prevent partial state
    return this.prisma.$transaction(async (tx) => {
      await tx.endScreen.deleteMany({ where: { videoId } });
      const endScreens = await Promise.all(
        items.map(item =>
          tx.endScreen.create({
            data: {
              videoId,
              type: item.type as EndScreenType,
              targetId: item.targetId,
              label: item.label,
              url: item.url,
              position: item.position as ScreenPosition,
              showAtSeconds: item.showAtSeconds,
            },
          })
        )
      );
      return endScreens;
    });
  }

  async getEndScreens(videoId: string) {
    return this.prisma.endScreen.findMany({
      where: { videoId },
      orderBy: { showAtSeconds: 'desc' },
      take: 50,
    });
  }

  async deleteEndScreens(videoId: string, userId: string) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
    if (!video) throw new NotFoundException();
    await this.prisma.endScreen.deleteMany({ where: { videoId } });
    return;
  }

  // ── Video Chapters ─────────────────────────────────

  async getChapters(videoId: string) {
    return this.prisma.videoChapter.findMany({
      where: { videoId },
      orderBy: { timestampSeconds: 'asc' },
      take: 50,
    });
  }

  async parseChaptersFromDescription(videoId: string, userId: string) {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, userId },
      select: { description: true },
    });
    if (!video || !video.description) return [];

    // Parse timestamps like "0:00 Introduction\n2:30 Main Topic\n1:05:30 Conclusion"
    const pattern = /(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/g;
    const chapters: { title: string; timestampSeconds: number }[] = [];

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(video.description)) !== null) {
      const parts = match[1].split(':').map(Number);
      let seconds = 0;
      if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
      chapters.push({ title: match[2].trim(), timestampSeconds: seconds });
    }

    if (chapters.length === 0) return [];

    // Atomic: delete + create in a single transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.videoChapter.deleteMany({ where: { videoId } });
      await tx.videoChapter.createMany({
        data: chapters.map((ch, i) => ({
          videoId,
          title: ch.title,
          timestampSeconds: ch.timestampSeconds,
          order: i,
        })),
      });
    });

    return this.getChapters(videoId);
  }
}