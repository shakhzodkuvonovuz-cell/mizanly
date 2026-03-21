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
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { Prisma, VideoStatus, VideoCategory, ReportReason } from '@prisma/client';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { GamificationService } from '../gamification/gamification.service';
import { QueueService } from '../../common/queue/queue.service';

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
    private queueService: QueueService,
  ) {}

  private async enhanceVideos(videos: VideoWithRelations[], userId?: string) {
    if (!userId || videos.length === 0) return videos;
    const videoIds = videos.map(v => v.id);
    const [reactions, bookmarks] = await Promise.all([
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

    // Gamification: award XP + update streak
    this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'video_created' });
    this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' });

    return {
      ...video[0],
      isLiked: false,
      isDisliked: false,
      isBookmarked: false,
    };
  }

  async getFeed(userId: string | undefined, category?: string, cursor?: string, limit = 20) {
    // Cache for 30 seconds if user is logged in
    if (userId) {
      const cacheKey = `feed:videos:${userId}:${category ?? 'all'}:${cursor ?? 'first'}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const [blocks, mutes] = userId ? await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true },
      take: 50,
    }),
      this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true },
      take: 50,
    }),
    ]) : [[], []];

    const excludedIds = [
      ...blocks.map(b => b.blockedId),
      ...mutes.map(m => m.mutedId),
    ];

    // Build feed: videos from subscribed channels + trending (by views)
    const subscribedChannels = userId ? await this.prisma.subscription.findMany({
      where: { userId },
      select: { channelId: true },
      take: 50,
    }) : [];

    const channelIds = subscribedChannels.map(s => s.channelId);

    const where: Prisma.VideoWhereInput = {
      status: VideoStatus.PUBLISHED,
      user: { isPrivate: false },
      ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
      ...(category && category !== 'all' ? (() => {
        const validCategories = Object.values(VideoCategory);
        if (!validCategories.includes(category as VideoCategory)) {
          throw new BadRequestException(`Invalid video category: ${category}`);
        }
        return { category: category as VideoCategory };
      })() : {}),
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
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: VIDEO_SELECT,
    });
    if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');

    // Check block status
    if (userId && userId !== video.user.id) {
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
        UPDATE "Channel"
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

    return { deleted: true };
  }

  async like(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new NotFoundException('Video not found');

    const existingReaction = await this.prisma.videoReaction.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    if (existingReaction?.isLike === true) throw new ConflictException('Already liked');
    // If existing reaction is dislike, we'll replace it

    try {
      await this.prisma.$transaction(async (tx) => {
        if (existingReaction) {
          // Update existing reaction
          await tx.videoReaction.update({
            where: { userId_videoId: { userId, videoId } },
            data: { isLike: true },
          });
          // Decrement dislikesCount, increment likesCount
          await tx.$executeRaw`
            UPDATE "Video"
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
            UPDATE "Video"
            SET "likesCount" = GREATEST(0, "likesCount" + 1)
            WHERE id = ${videoId}
          `;
        }
      });

      // Notify video owner (not self)
      if (video.userId !== userId) {
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
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new NotFoundException('Video not found');

    const existingReaction = await this.prisma.videoReaction.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    if (existingReaction?.isLike === false) throw new ConflictException('Already disliked');

    await this.prisma.$transaction(async (tx) => {
      if (existingReaction) {
        await tx.videoReaction.update({
          where: { userId_videoId: { userId, videoId } },
          data: { isLike: false },
        });
        await tx.$executeRaw`
          UPDATE "Video"
          SET "likesCount" = GREATEST(0, "likesCount" - 1),
              "dislikesCount" = GREATEST(0, "dislikesCount" + 1)
          WHERE id = ${videoId}
        `;
      } else {
        await tx.videoReaction.create({
          data: { userId, videoId, isLike: false },
        });
        await tx.$executeRaw`
          UPDATE "Video"
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
            UPDATE "Video"
            SET "likesCount" = GREATEST(0, "likesCount" - 1)
            WHERE id = ${videoId}
          `
        : this.prisma.$executeRaw`
            UPDATE "Video"
            SET "dislikesCount" = GREATEST(0, "dislikesCount" - 1)
            WHERE id = ${videoId}
          `,
    ]);

    return { removed: true };
  }

  async comment(videoId: string, userId: string, content: string, parentId?: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new NotFoundException('Video not found');

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
    if (video.userId !== userId) {
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
      where: { videoId, parentId: null }, // top-level comments only
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
      this.prisma.$executeRaw`UPDATE "Video" SET "commentsCount" = GREATEST("commentsCount" - 1, 0) WHERE id = ${videoId}`,
    ]);
    return { deleted: true };
  }

  async bookmark(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new NotFoundException('Video not found');

    const existing = await this.prisma.videoBookmark.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    if (existing) throw new ConflictException('Already bookmarked');

    await this.prisma.$transaction([
      this.prisma.videoBookmark.create({
        data: { userId, videoId },
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: { savesCount: { increment: 1 } },
      }),
    ]);
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
      this.prisma.$executeRaw`UPDATE "Video" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = ${videoId}`,
    ]);
    return { bookmarked: false };
  }

  async view(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new NotFoundException('Video not found');

    // Deduplicate: only count view if user hasn't watched this video today
    const existing = await this.prisma.watchHistory.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });

    const now = new Date();
    const isNewView = !existing || (now.getTime() - existing.watchedAt.getTime() > 24 * 60 * 60 * 1000);

    const ops = [
      this.prisma.watchHistory.upsert({
        where: { userId_videoId: { userId, videoId } },
        create: { userId, videoId, watchedAt: now },
        update: { watchedAt: now },
      }),
    ];

    if (isNewView) {
      ops.push(
        this.prisma.video.update({
          where: { id: videoId },
          data: { viewsCount: { increment: 1 } },
        }) as any,
        this.prisma.channel.update({
          where: { id: video.channelId },
          data: { totalViews: { increment: 1 } },
        }) as any,
      );
    }

    await this.prisma.$transaction(ops);
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
      where: { reporterId: userId, description: `video:${videoId}` },
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
        description: `video:${videoId}`,
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason, // Safe: reasonMap fallback guarantees valid ReportReason
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
      OR: [
        { channelId: video.channelId },
        { category: video.category },
        ...(video.tags.length > 0 ? [{ tags: { hasSome: video.tags } }] : []),
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
      where: { parentId: commentId },
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

  async recordProgress(videoId: string, userId: string, progress: number) {
    return this.updateProgress(videoId, userId, progress);
  }

  async getShareLink(videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    return { url: `https://mizanly.app/video/${videoId}` };
  }

  // ── Premiere ──────────────────────────────────────────

  async createPremiere(videoId: string, userId: string, dto: { scheduledAt: string; chatEnabled?: boolean; countdownTheme?: string; trailerUrl?: string }) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
    if (!video) throw new NotFoundException('Video not found');
    if (new Date(dto.scheduledAt) <= new Date()) throw new BadRequestException('Premiere must be in the future');

    const premiere = await this.prisma.videoPremiere.create({
      data: {
        videoId,
        scheduledAt: new Date(dto.scheduledAt),
        chatEnabled: dto.chatEnabled ?? true,
        countdownTheme: dto.countdownTheme || 'emerald',
        trailerUrl: dto.trailerUrl,
      },
    });

    await this.prisma.video.update({
      where: { id: videoId },
      data: { isPremiereEnabled: true, scheduledAt: new Date(dto.scheduledAt) },
    });

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
      await this.prisma.premiereReminder.create({
        data: { premiereId: premiere.id, userId },
      });
      await this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = "reminderCount" + 1 WHERE id = ${premiere.id}`;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: true };
      }
      throw error;
    }
    return { success: true };
  }

  async removePremiereReminder(videoId: string, userId: string) {
    const premiere = await this.prisma.videoPremiere.findUnique({ where: { videoId } });
    if (!premiere) throw new NotFoundException('Premiere not found');

    await this.prisma.premiereReminder.delete({
      where: { premiereId_userId: { premiereId: premiere.id, userId } },
    });
    await this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = GREATEST("reminderCount" - 1, 0) WHERE id = ${premiere.id}`;
    return { success: true };
  }

  async startPremiere(videoId: string, userId: string) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
    if (!video) throw new NotFoundException();

    await this.prisma.videoPremiere.update({
      where: { videoId },
      data: { isLive: true },
    });

    return { success: true };
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

    await this.prisma.endScreen.deleteMany({ where: { videoId } });

    const endScreens = await Promise.all(
      items.map(item =>
        this.prisma.endScreen.create({
          data: {
            videoId,
            type: item.type,
            targetId: item.targetId,
            label: item.label,
            url: item.url,
            position: item.position,
            showAtSeconds: item.showAtSeconds,
          },
        })
      )
    );

    return endScreens;
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
    return { success: true };
  }

  // ── Video Chapters ─────────────────────────────────

  async getChapters(videoId: string) {
    return this.prisma.videoChapter.findMany({
      where: { videoId },
      orderBy: { timestampSeconds: 'asc' },
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

    // Delete existing chapters and create new ones
    await this.prisma.videoChapter.deleteMany({ where: { videoId } });
    await this.prisma.videoChapter.createMany({
      data: chapters.map((ch, i) => ({
        videoId,
        title: ch.title,
        timestampSeconds: ch.timestampSeconds,
        order: i,
      })),
    });

    return this.getChapters(videoId);
  }
}