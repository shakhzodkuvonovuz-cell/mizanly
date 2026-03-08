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

    // Type-safe model access using switch statement
    let content: any;
    switch (type) {
      case 'post':
        content = await this.prisma.post.findUnique({ where: { id } });
        break;
      case 'thread':
        content = await this.prisma.thread.findUnique({ where: { id } });
        break;
      case 'reel':
        content = await this.prisma.reel.findUnique({ where: { id } });
        break;
      case 'video':
        content = await this.prisma.video.findUnique({ where: { id } });
        break;
      default:
        throw new BadRequestException('Invalid content type');
    }

    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Type-safe update using switch statement
    switch (type) {
      case 'post':
        return this.prisma.post.update({
          where: { id },
          data: { scheduledAt },
        });
      case 'thread':
        return this.prisma.thread.update({
          where: { id },
          data: { scheduledAt },
        });
      case 'reel':
        return this.prisma.reel.update({
          where: { id },
          data: { scheduledAt },
        });
      case 'video':
        return this.prisma.video.update({
          where: { id },
          data: { scheduledAt },
        });
      default:
        throw new BadRequestException('Invalid content type');
    }
  }

  async cancelSchedule(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
  ) {
    // Type-safe model access using switch statement
    let content: any;
    switch (type) {
      case 'post':
        content = await this.prisma.post.findUnique({ where: { id } });
        break;
      case 'thread':
        content = await this.prisma.thread.findUnique({ where: { id } });
        break;
      case 'reel':
        content = await this.prisma.reel.findUnique({ where: { id } });
        break;
      case 'video':
        content = await this.prisma.video.findUnique({ where: { id } });
        break;
      default:
        throw new BadRequestException('Invalid content type');
    }

    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Type-safe update using switch statement
    switch (type) {
      case 'post':
        return this.prisma.post.update({
          where: { id },
          data: { scheduledAt: null },
        });
      case 'thread':
        return this.prisma.thread.update({
          where: { id },
          data: { scheduledAt: null },
        });
      case 'reel':
        return this.prisma.reel.update({
          where: { id },
          data: { scheduledAt: null },
        });
      case 'video':
        return this.prisma.video.update({
          where: { id },
          data: { scheduledAt: null },
        });
      default:
        throw new BadRequestException('Invalid content type');
    }
  }

  async publishNow(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
  ) {
    // Type-safe model access using switch statement
    let content: any;
    switch (type) {
      case 'post':
        content = await this.prisma.post.findUnique({ where: { id } });
        break;
      case 'thread':
        content = await this.prisma.thread.findUnique({ where: { id } });
        break;
      case 'reel':
        content = await this.prisma.reel.findUnique({ where: { id } });
        break;
      case 'video':
        content = await this.prisma.video.findUnique({ where: { id } });
        break;
      default:
        throw new BadRequestException('Invalid content type');
    }

    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Type-safe update using switch statement
    switch (type) {
      case 'post':
        return this.prisma.post.update({
          where: { id },
          data: { scheduledAt: null },
        });
      case 'thread':
        return this.prisma.thread.update({
          where: { id },
          data: { scheduledAt: null },
        });
      case 'reel':
        return this.prisma.reel.update({
          where: { id },
          data: { scheduledAt: null },
        });
      case 'video':
        return this.prisma.video.update({
          where: { id },
          data: { scheduledAt: null },
        });
      default:
        throw new BadRequestException('Invalid content type');
    }
  }
}