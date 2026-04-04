import { Injectable, Inject, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { ContentSafetyService } from '../moderation/content-safety.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NOTIFICATION_REQUESTED, NotificationRequestedEvent } from '../../common/events/notification.events';
import { sanitizeText } from '@/common/utils/sanitize';
import { getExcludedUserIds } from '../../common/utils/excluded-users';

@Injectable()
export class ChannelPostsService {
  private readonly logger = new Logger(ChannelPostsService.name);
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private contentSafety: ContentSafetyService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(channelId: string, userId: string, data: { content: string; mediaUrls?: string[] }) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { id: true, userId: true, name: true } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException('Only channel owner can post');

    // Sanitize + moderate content before persisting
    const sanitized = sanitizeText(data.content);
    const moderation = await this.contentSafety.moderateText(sanitized);
    if (!moderation.safe) {
      throw new BadRequestException(`Content flagged: ${moderation.flags.join(', ')}`);
    }

    const post = await this.prisma.channelPost.create({
      data: { channelId, userId, content: sanitized, mediaUrls: data.mediaUrls ?? [] },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });

    // Notify channel subscribers about the new post (fire-and-forget, capped at 200)
    this.prisma.subscription.findMany({
      where: { channelId },
      select: { userId: true },
      take: 200,
    }).then((subscribers: Array<{ userId: string }>) => {
      for (const sub of subscribers) {
        if (sub.userId !== userId) {
          this.eventEmitter.emit(NOTIFICATION_REQUESTED, new NotificationRequestedEvent({
            userId: sub.userId,
            actorId: userId,
            type: 'CHANNEL_POST',
            title: channel.name,
            body: `New post in ${channel.name}`,
          }));
        }
      }
    }).catch((e: unknown) => this.logger.warn(`Failed to fetch subscribers for channel post notification: ${e instanceof Error ? e.message : e}`));

    return post;
  }

  async getFeed(channelId: string, userId?: string, cursor?: string, limit = 20) {
    const safeLim = Math.min(Math.max(limit, 1), 50);
    const excludedIds = userId ? await getExcludedUserIds(this.prisma, this.redis, userId) : [];
    const posts = await this.prisma.channelPost.findMany({
      where: {
        channelId,
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
        ...(excludedIds.length > 0 ? { userId: { notIn: excludedIds } } : {}),
      },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { createdAt: 'desc' },
      take: safeLim + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = posts.length > safeLim;
    const data = hasMore ? posts.slice(0, safeLim) : posts;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  async getById(postId: string) {
    const post = await this.prisma.channelPost.findUnique({
      where: { id: postId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } }, channel: { select: { id: true, handle: true, name: true } } },
    });
    if (!post) throw new NotFoundException('Community post not found');
    return post;
  }

  async delete(postId: string, userId: string) {
    const post = await this.getPostForPermissionCheck(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    await this.prisma.channelPost.delete({ where: { id: postId } });
    return { deleted: true };
  }

  async pin(postId: string, userId: string) {
    const post = await this.getPostForPermissionCheck(postId);
    // Allow pin by post author or channel owner
    if (post.userId !== userId) {
      const channel = await this.prisma.channel.findUnique({ where: { id: post.channelId }, select: { id: true, userId: true } });
      if (!channel || channel.userId !== userId) throw new ForbiddenException('Only channel owner or post author can pin');
    }
    return this.prisma.channelPost.update({ where: { id: postId }, data: { isPinned: true } });
  }

  async unpin(postId: string, userId: string) {
    const post = await this.getPostForPermissionCheck(postId);
    // Allow unpin by post author or channel owner
    if (post.userId !== userId) {
      const channel = await this.prisma.channel.findUnique({ where: { id: post.channelId }, select: { id: true, userId: true } });
      if (!channel || channel.userId !== userId) throw new ForbiddenException('Only channel owner or post author can unpin');
    }
    return this.prisma.channelPost.update({ where: { id: postId }, data: { isPinned: false } });
  }

  /** Lightweight query for permission checks — loads only userId and channelId. */
  private async getPostForPermissionCheck(postId: string) {
    const post = await this.prisma.channelPost.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, channelId: true },
    });
    if (!post) throw new NotFoundException('Community post not found');
    return post;
  }

  async like(postId: string, userId: string) {
    const post = await this.prisma.channelPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Community post not found');

    // Dedup: check if already liked via ChannelPostLike junction table
    const existing = await this.prisma.channelPostLike.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { userId: true },
    });
    if (existing) throw new ConflictException('Already liked');

    await this.prisma.$transaction([
      this.prisma.channelPostLike.create({ data: { userId, postId } }),
      this.prisma.$executeRaw`UPDATE "channel_posts" SET "likesCount" = GREATEST("likesCount" + 1, 0) WHERE id = ${postId}`,
    ]);
    return { liked: true };
  }

  async unlike(postId: string, userId: string) {
    const post = await this.prisma.channelPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Community post not found');

    // Check if the user has actually liked the post
    const existing = await this.prisma.channelPostLike.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException('Like not found');

    await this.prisma.$transaction([
      this.prisma.channelPostLike.delete({ where: { userId_postId: { userId, postId } } }),
      this.prisma.$executeRaw`UPDATE "channel_posts" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${postId}`,
    ]);
    return { unliked: true };
  }
}