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
import { CreateReelDto } from './dto/create-reel.dto';
import { ReelStatus } from '@prisma/client';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';

const REEL_SELECT = {
  id: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  caption: true,
  mentions: true,
  hashtags: true,
  status: true,
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
  ) {}

  async create(userId: string, dto: CreateReelDto) {
    // Parse and upsert hashtags from caption
    const hashtagMatches = (dto.caption ?? '').match(/#([a-zA-Z0-9_\u0600-\u06FF]+)/g) ?? [];
    const hashtagNames = [...new Set([
      ...hashtagMatches.map((h) => h.slice(1).toLowerCase()),
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
          caption: dto.caption,
          mentions: dto.mentions || [],
          hashtags: dto.hashtags || [],
          audioTrackId: dto.audioTrackId,
          isDuet: dto.isDuet || false,
          isStitch: dto.isStitch || false,
          status: ReelStatus.PROCESSING,
          // Schema fields with defaults - Prisma will use defaults if omitted
          // width: 1080,
          // height: 1920,
          // language: 'en',
          // likesCount: 0,
          // commentsCount: 0,
          // sharesCount: 0,
          // savesCount: 0,
          // viewsCount: 0,
          // loopsCount: 0,
        },
        select: REEL_SELECT,
      }),
      // TODO: Uncomment when User model has reelsCount field
      // this.prisma.user.update({
      //   where: { id: userId },
      //   data: { reelsCount: { increment: 1 } },
      // }),
    ]);

    // TODO: In future, trigger video processing job here
    // For now, just mark as READY
    const updatedReel = await this.prisma.reel.update({
      where: { id: reel.id },
      data: { status: ReelStatus.READY },
      select: REEL_SELECT,
    });

    return {
      ...updatedReel,
      status: ReelStatus.READY,
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
      this.prisma.mute.findMany({ where: { muterId: userId }, select: { mutedId: true } }),
    ]) : [[], []];

    const excludedIds = [
      ...blocks.map(b => b.blockedId),
      ...mutes.map(m => m.mutedId),
    ];

    const where: any = {
      status: ReelStatus.READY,
      ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
    };

    const reels = await this.prisma.reel.findMany({
      where,
      select: REEL_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = reels.length > limit;
    const data = hasMore ? reels.slice(0, limit) : reels;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const result = {
      data,
      meta: { cursor: nextCursor, hasMore },
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
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

    let isLiked = false;
    let isBookmarked = false;

    if (userId) {
      const [like, bookmark] = await Promise.all([
        this.prisma.reelLike.findUnique({
          where: { userId_reelId: { userId, reelId } },
        }),
        this.prisma.reelBookmark.findUnique({
          where: { userId_reelId: { userId, reelId } },
        }),
      ]);
      isLiked = !!like;
      isBookmarked = !!bookmark;
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
    return { deleted: true };
  }

  async like(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

    const existing = await this.prisma.reelLike.findUnique({
      where: { userId_reelId: { userId, reelId } },
    });
    if (existing) throw new ConflictException('Already liked');

    await this.prisma.$transaction([
      this.prisma.reelLike.create({
        data: { userId, reelId },
      }),
      this.prisma.reel.update({
        where: { id: reelId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    // Notify reel owner
    this.notifications.create({
      userId: reel.userId, actorId: userId,
      type: 'LIKE', reelId,
    }).catch((err) => this.logger.error('Failed to create notification', err));
    return { liked: true };
  }

  async unlike(reelId: string, userId: string) {
    const existing = await this.prisma.reelLike.findUnique({
      where: { userId_reelId: { userId, reelId } },
    });
    if (!existing) throw new NotFoundException('Like not found');

    await this.prisma.$transaction([
      this.prisma.reelLike.delete({
        where: { userId_reelId: { userId, reelId } },
      }),
      this.prisma.$executeRaw`UPDATE "Reel" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${reelId}`,
    ]);
    return { liked: false };
  }

  async comment(reelId: string, userId: string, content: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          userId,
          content,
          reelId,
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
      this.prisma.reel.update({
        where: { id: reelId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);
    // Notify reel owner
    this.notifications.create({
      userId: reel.userId, actorId: userId,
      type: 'COMMENT', reelId,
      body: content.substring(0, 100),
    }).catch((err) => this.logger.error('Failed to create notification', err));
    return comment;
  }

  async getComments(reelId: string, cursor?: string, limit = 20) {
    const comments = await this.prisma.comment.findMany({
      where: { reelId },
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

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { sharesCount: { increment: 1 } },
    });
    return { shared: true };
  }

  async bookmark(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

    try {
      await this.prisma.$transaction([
        this.prisma.reelBookmark.create({ data: { userId, reelId } }),
        this.prisma.reel.update({
          where: { id: reelId },
          data: { savesCount: { increment: 1 } },
        }),
      ]);
    } catch {
      throw new ConflictException('Already bookmarked');
    }
    return { bookmarked: true };
  }

  async unbookmark(reelId: string, userId: string) {
    const existing = await this.prisma.reelBookmark.findUnique({
      where: { userId_reelId: { userId, reelId } },
    });
    if (!existing) throw new NotFoundException('Bookmark not found');

    await this.prisma.$transaction([
      this.prisma.reelBookmark.delete({
        where: { userId_reelId: { userId, reelId } },
      }),
      this.prisma.$executeRaw`UPDATE "Reel" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = ${reelId}`,
    ]);
    return { bookmarked: false };
  }

  async view(reelId: string, userId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.status !== ReelStatus.READY) throw new NotFoundException('Reel not found');

    const existing = await this.prisma.reelView.findUnique({
      where: { userId_reelId: { userId, reelId } },
    });
    if (existing) return { viewed: true }; // Already viewed

    await this.prisma.$transaction([
      this.prisma.reelView.create({
        data: { userId, reelId },
      }),
      this.prisma.reel.update({
        where: { id: reelId },
        data: { viewsCount: { increment: 1 } },
      }),
    ]);
    return { viewed: true };
  }

  async getUserReels(username: string, cursor?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    const reels = await this.prisma.reel.findMany({
      where: { userId: user.id, status: ReelStatus.READY },
      select: REEL_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = reels.length > limit;
    const items = hasMore ? reels.slice(0, limit) : reels;
    return {
      data: items.map((r) => ({ ...r, isLiked: false, isBookmarked: false })),
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
}