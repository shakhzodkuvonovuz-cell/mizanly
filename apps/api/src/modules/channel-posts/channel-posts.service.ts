import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class ChannelPostsService {
  constructor(private prisma: PrismaService) {}

  async create(channelId: string, userId: string, data: { content: string; mediaUrls?: string[] }) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException('Only channel owner can post');
    return this.prisma.channelPost.create({
      data: { channelId, userId, content: data.content, mediaUrls: data.mediaUrls ?? [] },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
  }

  async getFeed(channelId: string, cursor?: string, limit = 20) {
    const posts = await this.prisma.channelPost.findMany({
      where: { channelId, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();
    return { data: posts, meta: { cursor: posts[posts.length - 1]?.id ?? null, hasMore } };
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
    const post = await this.getById(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    await this.prisma.channelPost.delete({ where: { id: postId } });
    return { deleted: true };
  }

  async pin(postId: string, userId: string) {
    const post = await this.getById(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    return this.prisma.channelPost.update({ where: { id: postId }, data: { isPinned: true } });
  }

  async unpin(postId: string, userId: string) {
    const post = await this.getById(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    return this.prisma.channelPost.update({ where: { id: postId }, data: { isPinned: false } });
  }

  async like(postId: string) {
    await this.prisma.$executeRaw`UPDATE channel_posts SET "likesCount" = "likesCount" + 1 WHERE id = ${postId}`;
    return { liked: true };
  }

  async unlike(postId: string) {
    await this.prisma.$executeRaw`UPDATE channel_posts SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${postId}`;
    return { unliked: true };
  }
}