import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { WatchHistory, WatchLater } from '@prisma/client';

@Injectable()
export class WatchHistoryService {
  private readonly logger = new Logger(WatchHistoryService.name);
  constructor(private prisma: PrismaService) {}

  // Record watch progress (upsert)
  async recordWatch(
    userId: string,
    videoId: string,
    progress?: number,
    completed?: boolean,
  ) {
    // Verify video exists
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException('Video not found');

    const data: { watchedAt: Date; progress?: number; completed?: boolean } = { watchedAt: new Date() };
    if (progress !== undefined) data.progress = progress;
    if (completed !== undefined) data.completed = completed;

    return this.prisma.watchHistory.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: {
        userId,
        videoId,
        progress: progress ?? 0,
        completed: completed ?? false,
      },
      update: data,
    });
  }

  // Get user's watch history with pagination
  async getHistory(userId: string, cursor?: string, limit = 20) {
    const items = await this.prisma.watchHistory.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            viewsCount: true,
            createdAt: true,
            channel: {
              select: {
                id: true,
                handle: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { watchedAt: 'desc' },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    return {
      data: result.map((w) => ({
        ...w.video,
        progress: w.progress,
        completed: w.completed,
        watchedAt: w.watchedAt,
      })),
      meta: {
        cursor: hasMore ? result[result.length - 1].id : null,
        hasMore,
      },
    };
  }

  // Remove a single video from watch history
  async removeFromHistory(userId: string, videoId: string) {
    await this.prisma.watchHistory.deleteMany({
      where: { userId, videoId },
    });
    return { removed: true };
  }

  // Clear all watch history for user
  async clearHistory(userId: string) {
    await this.prisma.watchHistory.deleteMany({
      where: { userId },
    });
    return { cleared: true };
  }

  // Add video to watch later
  async addToWatchLater(userId: string, videoId: string) {
    // Verify video exists
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException('Video not found');

    await this.prisma.watchLater.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId },
      update: {},
    });
    return { added: true };
  }

  // Remove video from watch later
  async removeFromWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.deleteMany({
      where: { userId, videoId },
    });
    return { removed: true };
  }

  // Get watch later list with pagination
  async getWatchLater(userId: string, cursor?: string, limit = 20) {
    const items = await this.prisma.watchLater.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            viewsCount: true,
            createdAt: true,
            channel: {
              select: {
                id: true,
                handle: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      take: limit + 1,
      ...(cursor
        ? { cursor: { userId_videoId: { userId, videoId: cursor } }, skip: 1 }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    return {
      data: result.map((w) => w.video),
      meta: {
        cursor: hasMore ? result[result.length - 1].videoId : null,
        hasMore,
      },
    };
  }

  // Check if video is in watch later
  async isInWatchLater(userId: string, videoId: string) {
    const item = await this.prisma.watchLater.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    return { inWatchLater: !!item };
  }
}