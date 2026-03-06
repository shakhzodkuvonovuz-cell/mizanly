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
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Prisma, VideoStatus } from '@prisma/client';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';

const CHANNEL_SELECT = {
  id: true,
  userId: true,
  handle: true,
  name: true,
  description: true,
  avatarUrl: true,
  bannerUrl: true,
  subscribersCount: true,
  videosCount: true,
  totalViews: true,
  isVerified: true,
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
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateChannelDto) {
    // Check if user already has a channel (userId is unique in Channel model)
    const existing = await this.prisma.channel.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('User already has a channel');
    }

    // Check handle availability
    const handleTaken = await this.prisma.channel.findUnique({
      where: { handle: dto.handle },
    });
    if (handleTaken) {
      throw new ConflictException('Handle already taken');
    }

    const channel = await this.prisma.channel.create({
      data: {
        userId,
        handle: dto.handle,
        name: dto.name,
        description: dto.description,
      },
      select: CHANNEL_SELECT,
    });

    return {
      ...channel,
      isSubscribed: false, // owner is not automatically subscribed
    };
  }

  async getByHandle(handle: string, userId?: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { handle },
      select: CHANNEL_SELECT,
    });
    if (!channel) throw new NotFoundException('Channel not found');

    let isSubscribed = false;
    if (userId) {
      const subscription = await this.prisma.subscription.findUnique({
        where: { userId_channelId: { userId, channelId: channel.id } },
      });
      isSubscribed = !!subscription;
    }

    return { ...channel, isSubscribed };
  }

  async update(handle: string, userId: string, dto: UpdateChannelDto) {
    const channel = await this.prisma.channel.findUnique({
      where: { handle },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException();

    const updated = await this.prisma.channel.update({
      where: { handle },
      data: {
        name: dto.name,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
        bannerUrl: dto.bannerUrl,
      },
      select: CHANNEL_SELECT,
    });

    // isSubscribed flag for the owner (they cannot subscribe to own channel)
    return { ...updated, isSubscribed: false };
  }

  async delete(handle: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { handle },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException();

    // Soft delete: mark as removed? Currently no isRemoved field.
    // Instead, delete all related records? Schema has onDelete: Cascade for relations.
    // We'll delete the channel (cascade will clean up subscriptions, videos, etc.)
    await this.prisma.channel.delete({
      where: { handle },
    });

    return { deleted: true };
  }

  async subscribe(handle: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { handle },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId === userId) {
      throw new BadRequestException('Cannot subscribe to your own channel');
    }

    const existing = await this.prisma.subscription.findUnique({
      where: { userId_channelId: { userId, channelId: channel.id } },
    });
    if (existing) throw new ConflictException('Already subscribed');

    await this.prisma.$transaction([
      this.prisma.subscription.create({
        data: { userId, channelId: channel.id },
      }),
      this.prisma.$executeRaw`
        UPDATE "Channel"
        SET "subscribersCount" = GREATEST(0, "subscribersCount" + 1)
        WHERE id = ${channel.id}
      `,
    ]);

    // Notify channel owner
    this.notifications.create({
      userId: channel.userId,
      actorId: userId,
      type: 'FOLLOW', // reuse follow notification type for subscription
    }).catch((err) => this.logger.error('Failed to create notification', err));

    return { subscribed: true };
  }

  async unsubscribe(handle: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { handle },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const existing = await this.prisma.subscription.findUnique({
      where: { userId_channelId: { userId, channelId: channel.id } },
    });
    if (!existing) throw new NotFoundException('Not subscribed');

    await this.prisma.$transaction([
      this.prisma.subscription.delete({
        where: { userId_channelId: { userId, channelId: channel.id } },
      }),
      this.prisma.$executeRaw`
        UPDATE "Channel"
        SET "subscribersCount" = GREATEST(0, "subscribersCount" - 1)
        WHERE id = ${channel.id}
      `,
    ]);

    return { subscribed: false };
  }

  async getVideos(handle: string, userId?: string, cursor?: string, limit = 20) {
    const channel = await this.prisma.channel.findUnique({
      where: { handle },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const [blocks, mutes] = userId ? await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true } }),
    ]) : [[], []];

    const excludedIds = [
      ...blocks.map(b => b.blockedId),
      ...mutes.map(m => m.mutedId),
    ];

    const where: Prisma.VideoWhereInput = {
      channelId: channel.id,
      status: VideoStatus.PUBLISHED,
      ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
    };

    const videos = await this.prisma.video.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        videoUrl: true,
        thumbnailUrl: true,
        duration: true,
        viewsCount: true,
        likesCount: true,
        dislikesCount: true,
        commentsCount: true,
        category: true,
        tags: true,
        publishedAt: true,
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
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { publishedAt: 'desc' },
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
        }),
        this.prisma.videoBookmark.findMany({
          where: { userId, videoId: { in: videoIds } },
          select: { videoId: true },
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

    return {
      data: enhancedData,
      meta: { cursor: nextCursor, hasMore },
    };
  }

  async getMyChannels(userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { userId },
      select: CHANNEL_SELECT,
    });

    // No need for isSubscribed flag (own channels)
    return channels.map(ch => ({ ...ch, isSubscribed: false }));
  }
}