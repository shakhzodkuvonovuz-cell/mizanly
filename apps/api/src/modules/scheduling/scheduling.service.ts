import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

export interface ScheduledItem {
  id: string;
  type: 'post' | 'thread' | 'reel' | 'video';
  title?: string;
  content?: string;
  caption?: string;
  scheduledAt: Date;
  createdAt: Date;
}

@Injectable()
export class SchedulingService {
  constructor(private prisma: PrismaService) {}

  private getModel(type: string): keyof PrismaService {
    const map: Record<string, keyof PrismaService> = {
      post: 'post',
      thread: 'thread',
      reel: 'reel',
      video: 'video',
    };
    if (!(type in map)) {
      throw new BadRequestException('Invalid content type');
    }
    return map[type];
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
      }),
      this.prisma.thread.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          content: true,
          scheduledAt: true,
          createdAt: true,
        },
      }),
      this.prisma.reel.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          caption: true,
          scheduledAt: true,
          createdAt: true,
        },
      }),
      this.prisma.video.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          createdAt: true,
        },
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
  ) {
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
  ) {
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
  ) {
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
  private async findContent(model: keyof PrismaService, id: string): Promise<{ userId: string } | null> {
    switch (model) {
      case 'post':
        return this.prisma.post.findUnique({ where: { id } });
      case 'thread':
        return this.prisma.thread.findUnique({ where: { id } });
      case 'reel':
        return this.prisma.reel.findUnique({ where: { id } });
      case 'video':
        return this.prisma.video.findUnique({ where: { id } });
      default:
        return null;
    }
  }

  private async updateContent(
    model: keyof PrismaService,
    id: string,
    data: { scheduledAt: Date | null }
  ): Promise<unknown> {
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
}