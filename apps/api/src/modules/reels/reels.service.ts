import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateReelDto } from './dto/create-reel.dto';
import { Prisma, ReelStatus, ReactionType, ReportReason } from '@prisma/client';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { extractHashtags } from '@/common/utils/hashtag';
import { GamificationService } from '../gamification/gamification.service';

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

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private notifications: NotificationsService,
    private stream: StreamService,
    private gamification: GamificationService,
  ) {}

  async create(userId: string, dto: CreateReelDto) {
    // Parse and upsert hashtags from caption
    const hashtagNames = [...new Set([
      ...extractHashtags(dto.caption ?? ''),
      ...(dto.hashtags || []).map((h) => h.toLowerCase()),
    ])];
    if (hashtagNames.length > 0) {
      await Promise.all(
        hashtagNames.map((name) =>
          this.prisma.hashtag.upsert({
            where: { name },
            create: { name, postsCount: 1 },
            update: { postsCount: { increment: 1 } },
          }),
        ),
      );
    }

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
          status: ReelStatus.PROCESSING,
        },
        select: REEL_SELECT,
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { reelsCount: { increment: 1 } },
      }),
    ]);

    // Mention notifications (skip self-mentions)
    if (dto.mentions?.length) {
      const [mentionedUsers, actor] = await Promise.all([
        this.prisma.user.findMany({ where: { username: { in: dto.mentions } }, select: { id: true } }),
        this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
      ]);
      for (const mentioned of mentionedUsers) {
        if (mentioned.id !== userId) {
          this.notifications.create({
            userId: mentioned.id,
            actorId: userId,
            type: 'MENTION',
            reelId: reel.id,
            title: 'Mentioned you',
            body: `@${actor?.username ?? 'Someone'} mentioned you in a reel`,
          }).catch((err) => this.logger.error('Failed to create mention notification', err));
        }
      }
    }

    // Kick off Cloudflare Stream ingestion (async)
    this.stream.uploadFromUrl(dto.videoUrl, { title: dto.caption ?? 'Reel', creatorId: userId })
      .then(async (streamId) => {
        await this.prisma.reel.update({
          where: { id: reel.id },
          data: { streamId },
        });
        this.logger.log(`Reel ${reel.id} submitted to Stream as ${streamId}`);
      })
      .catch((err) => {
        this.logger.error(`Stream upload failed for reel ${reel.id}`, err);
        this.prisma.reel.update({
          where: { id: reel.id },
          data: { status: 'READY' },
        }).catch(() => {});
      });

    // Gamification: award XP + update streak
    this.gamification.awardXP(userId, 'reel_created').catch(() => {});
    this.gamification.updateStreak(userId, 'posting').catch(() => {});

    return {
      ...reel,
      isLiked: false,
      isBookmarked: false,
    };
  }

  async getFeed(userId: string | undefined, cursor?: string, limit = 20) {
    // Cache for 30 seconds if user is logged in
    if (userId) {
      const cacheKey = `feed:reels:${userId}:${cursor ?? 'first'}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const [blocks, mutes] = userId ? await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true } }),
    ]) : [[], []];

    const excludedIds = [
      ...blocks.map(b => b.blockedId),
      ...mutes.map(m => m.mutedId),
    ];

    const where: Prisma.ReelWhereInput = {
      status: ReelStatus.READY,
      isRemoved: false,
      user: { isPrivate: false },
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) }, // last 72h
      ...(cursor ? { createdAt: { lt: new Date(cursor), gte: new Date(Date.now() - 72 * 60 * 60 * 1000) } } : {}),
      ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
    };

    // Fetch up to 200 recent reels to score and rank
    const recentReels = await this.prisma.reel.findMany({
      where,
      select: REEL_SELECT,
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    // Score each reel: engagement weighted by recency
    const scored = recentReels.map(reel => {
      const ageHours = Math.max(1, (Date.now() - new Date(reel.createdAt).getTime()) / 3600000);
      const engagement = (reel.likesCount * 2) + (reel.commentsCount * 4) + (reel.sharesCount * 6) + (reel.viewsCount * 0.1);
      const score = engagement / Math.pow(ageHours, 1.2);
      return { ...reel, _score: score };
    });

    // Sort by score descending
    scored.sort((a, b) => b._score - a._score);

    // Paginate using createdAt as cursor
    const startIdx = cursor ? scored.findIndex(p => new Date(p.createdAt).toISOString() < cursor) : 0;
    const page = scored.slice(Math.max(0, startIdx), Math.max(0, startIdx) + limit + 1);

    const hasMore = page.length > limit;
    const data = hasMore ? page.slice(0, limit) : page;

    // Strip internal _score field
    const plainData = data.map(({ _score, ...reel }) => reel);

    let likedReelIds: string[] = [];
    let bookmarkedReelIds: string[] = [];

    if (userId && plainData.length > 0) {
      const reelIds = plainData.map(r => r.id);
      const [reactions, interactions] = await Promise.all([
        this.prisma.reelReaction.findMany({
          where: { userId, reelId: { in: reelIds } },
          select: { reelId: true },
        }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
        }),
      ]);
      likedReelIds = reactions.map(r => r.reelId);
      bookmarkedReelIds = interactions.map(i => i.reelId);
    }

    const enhancedData = plainData.map(reel => ({
      ...reel,
      isLiked: userId ? likedReelIds.includes(reel.id) : false,
      isBookmarked: userId ? bookmarkedReelIds.includes(reel.id) : false,
    }));

    const result = {
      data: enhancedData,
      meta: {
        cursor: hasMore ? enhancedData[enhancedData.length - 1].createdAt : null,
        hasMore,
      },
    };

    if (userId) {
      const cacheKey = `feed:reels:${userId}:${cursor ?? 'first'}`;
      await this.redis.setex(cacheKey, 30, JSON.stringify(result));
    }

    return result;
  }

  async getById(reelId: string, userId?: string) {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: REEL_SELECT,
    });
    if (!reel || reel.status !== ReelStatus.READY || reel.isRemoved) throw new NotFoundException('Reel not found');

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

  async delete(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.reel.update({
        where: { id: reelId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "reelsCount" = GREATEST("reelsCount" - 1, 0) WHERE id = ${userId}`,
    ]);

    // Clean up from Cloudflare Stream
    if (reel.streamId) {
      this.stream.deleteVideo(reel.streamId).catch((err) => {
        this.logger.warn(`Failed to delete Stream reel ${reel.streamId}`, err);
      });
    }

    return { deleted: true };
  }

  async like(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

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
          UPDATE "Reel"
          SET "likesCount" = GREATEST(0, "likesCount" + 1)
          WHERE id = ${reelId}
        `,
      ]);
      // Notify reel owner (skip self-notification)
      if (reel.userId !== userId) {
        this.notifications.create({
          userId: reel.userId, actorId: userId,
          type: 'LIKE', reelId,
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
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

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
          UPDATE "Reel"
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

  async comment(reelId: string, userId: string, content: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

    const [comment] = await this.prisma.$transaction([
      this.prisma.reelComment.create({
        data: {
          userId,
          reelId,
          content: sanitizeText(content),
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
        UPDATE "Reel"
        SET "commentsCount" = "commentsCount" + 1
        WHERE id = ${reelId}
      `,
    ]);
    // Notify reel owner (skip self-notification)
    if (reel.userId !== userId) {
      this.notifications.create({
        userId: reel.userId, actorId: userId,
        type: 'COMMENT', reelId,
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
      this.prisma.reelComment.delete({ where: { id: commentId } }),
      this.prisma.$executeRaw`UPDATE "Reel" SET "commentsCount" = GREATEST(0, "commentsCount" - 1) WHERE id = ${reelId}`,
    ]);
    return { deleted: true };
  }

  async getComments(reelId: string, userId: string | undefined, cursor?: string, limit = 20) {
    // Build excluded user IDs from blocks/mutes
    let excludedUserIds: string[] = [];
    if (userId) {
      const [blocks, mutes] = await Promise.all([
        this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
        this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true } }),
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
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

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
        UPDATE "Reel"
        SET "sharesCount" = "sharesCount" + 1
        WHERE id = ${reelId}
      `;
    });

    return { shared: true };
  }

  async bookmark(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

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
        UPDATE "Reel"
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
        UPDATE "Reel"
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
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

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
        UPDATE "Reel"
        SET "viewsCount" = "viewsCount" + 1
        WHERE id = ${reelId}
      `;
    });

    return { viewed: true };
  }

  async getUserReels(username: string, cursor?: string, limit = 20, userId?: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    const reels = await this.prisma.reel.findMany({
      where: { userId: user.id, status: ReelStatus.READY, isRemoved: false },
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
        }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
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
    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
      INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        description: `reel:${reelId}`,
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
      },
    });
    return { reported: true };
  }

  async getByAudioTrack(audioTrackId: string, cursor?: string, limit = 20, userId?: string) {
    const reels = await this.prisma.reel.findMany({
      where: { audioTrackId, status: ReelStatus.READY, isRemoved: false },
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
        }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
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
      where: { duetOfId: reelId, status: ReelStatus.READY, isRemoved: false },
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
        }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
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
      where: { stitchOfId: reelId, status: ReelStatus.READY, isRemoved: false },
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
        }),
        this.prisma.reelInteraction.findMany({
          where: { userId, reelId: { in: reelIds }, saved: true },
          select: { reelId: true },
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

  getShareLink(reelId: string) {
    return { url: `https://mizanly.app/reel/${reelId}` };
  }
}
