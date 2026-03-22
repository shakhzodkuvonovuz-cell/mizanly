import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service';
import { Post, Thread, Reel, Video } from '@prisma/client';

export interface ScheduledItem {
  id: string;
  type: 'post' | 'thread' | 'reel' | 'video';
  title?: string;
  content?: string;
  caption?: string;
  scheduledAt: Date;
  createdAt: Date;
}

export type ScheduledContent = Post | Thread | Reel | Video;

type ContentModel = 'post' | 'thread' | 'reel' | 'video';

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(private prisma: PrismaService) {}

  private getModel(type: string): ContentModel {
    const validModels: ContentModel[] = ['post', 'thread', 'reel', 'video'];
    if (!validModels.includes(type as ContentModel)) {
      throw new BadRequestException('Invalid content type');
    }
    return type as ContentModel;
  }

  async getScheduled(userId: string): Promise<ScheduledItem[]> {
    const [posts, threads, reels, videos] = await Promise.all([
      this.prisma.post.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          content: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
      this.prisma.thread.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          content: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
      this.prisma.reel.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          caption: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
      this.prisma.video.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
    ]);

    const scheduledItems: ScheduledItem[] = [
      ...posts.map((p) => ({
        id: p.id,
        type: 'post' as const,
        content: p.content ?? undefined,
        scheduledAt: p.scheduledAt!,
        createdAt: p.createdAt,
      })),
      ...threads.map((t) => ({
        id: t.id,
        type: 'thread' as const,
        content: t.content,
        scheduledAt: t.scheduledAt!,
        createdAt: t.createdAt,
      })),
      ...reels.map((r) => ({
        id: r.id,
        type: 'reel' as const,
        caption: r.caption ?? undefined,
        scheduledAt: r.scheduledAt!,
        createdAt: r.createdAt,
      })),
      ...videos.map((v) => ({
        id: v.id,
        type: 'video' as const,
        title: v.title,
        scheduledAt: v.scheduledAt!,
        createdAt: v.createdAt,
      })),
    ];

    return scheduledItems.sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
    );
  }

  async updateSchedule(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
    scheduledAt: Date,
  ): Promise<ScheduledContent> {
    const minTime = new Date(Date.now() + 15 * 60 * 1000);
    if (scheduledAt < minTime) {
      throw new BadRequestException(
        'Scheduled time must be at least 15 minutes from now',
      );
    }

    const model = this.getModel(type);
    // Type-safe approach: use a helper function to handle the dynamic access
    const content = await this.findContent(model, id);
    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return this.updateContent(model, id, { scheduledAt });
  }

  async cancelSchedule(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
  ): Promise<ScheduledContent> {
    const model = this.getModel(type);
    const content = await this.findContent(model, id);
    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return this.updateContent(model, id, { scheduledAt: null });
  }

  async publishNow(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
  ): Promise<ScheduledContent> {
    const model = this.getModel(type);
    const content = await this.findContent(model, id);
    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return this.updateContent(model, id, { scheduledAt: null });
  }

  // Helper methods for type-safe dynamic access
  private async findContent(model: ContentModel, id: string): Promise<{ userId: string | null } | null> {
    switch (model) {
      case 'post':
        return this.prisma.post.findUnique({ where: { id }, select: { userId: true } });
      case 'thread':
        return this.prisma.thread.findUnique({ where: { id }, select: { userId: true } });
      case 'reel':
        return this.prisma.reel.findUnique({ where: { id }, select: { userId: true } });
      case 'video':
        return this.prisma.video.findUnique({ where: { id }, select: { userId: true } });
      default:
        return null;
    }
  }

  private async updateContent(
    model: ContentModel,
    id: string,
    data: { scheduledAt: Date | null }
  ): Promise<ScheduledContent> {
    switch (model) {
      case 'post':
        return this.prisma.post.update({ where: { id }, data });
      case 'thread':
        return this.prisma.thread.update({ where: { id }, data });
      case 'reel':
        return this.prisma.reel.update({ where: { id }, data });
      case 'video':
        return this.prisma.video.update({ where: { id }, data });
      default:
        throw new BadRequestException('Invalid content type');
    }
  }

  /**
   * Auto-publish all content whose scheduledAt has passed.
   * Runs every minute via @nestjs/schedule cron.
   * Sets scheduledAt to null (= published) for all overdue items.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishOverdueContent(): Promise<{ posts: number; threads: number; reels: number; videos: number }> {
    const now = new Date();

    const [posts, threads, reels, videos] = await Promise.all([
      this.prisma.post.updateMany({
        where: { scheduledAt: { not: null, lte: now } },
        data: { scheduledAt: null },
      }),
      this.prisma.thread.updateMany({
        where: { scheduledAt: { not: null, lte: now } },
        data: { scheduledAt: null },
      }),
      this.prisma.reel.updateMany({
        where: { scheduledAt: { not: null, lte: now } },
        data: { scheduledAt: null },
      }),
      this.prisma.video.updateMany({
        where: { scheduledAt: { not: null, lte: now } },
        data: { scheduledAt: null },
      }),
    ]);

    const result = {
      posts: posts.count,
      threads: threads.count,
      reels: reels.count,
      videos: videos.count,
    };

    const totalPublished = result.posts + result.threads + result.reels + result.videos;
    if (totalPublished > 0) {
      this.logger.log(`Auto-published ${totalPublished} items: ${JSON.stringify(result)}`);
    }

    return result;
  }
}