import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  async getFeedStories(userId: string) {
    const followingIds = await this.prisma.follow.findMany({
      where: { followerId: userId }, select: { followingId: true },
    });
    const ids = [...followingIds.map(f => f.followingId), userId];

    const stories = await this.prisma.story.findMany({
      where: { authorId: { in: ids }, expiresAt: { gt: new Date() } },
      include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Group by author
    const grouped = new Map();
    stories.forEach(s => {
      if (!grouped.has(s.authorId)) grouped.set(s.authorId, { user: s.author, stories: [] });
      grouped.get(s.authorId).stories.push(s);
    });
    return Array.from(grouped.values());
  }

  async create(userId: string, mediaUrl: string, type: string, duration?: number, circleId?: string) {
    return this.prisma.story.create({
      data: {
        authorId: userId, mediaUrl, type: type as any,
        duration: duration || 5,
        circleId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  async markViewed(storyId: string, viewerId: string) {
    await this.prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId } },
      create: { storyId, viewerId },
      update: {},
    });
    await this.prisma.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
  }
}
