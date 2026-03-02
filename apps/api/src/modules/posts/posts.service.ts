import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  private readonly postSelect = {
    id: true, type: true, caption: true, visibility: true,
    likeCount: true, commentCount: true, shareCount: true, createdAt: true,
    author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    media: { select: { id: true, url: true, type: true, width: true, height: true, order: true }, orderBy: { order: 'asc' as const } },
    circle: { select: { id: true, name: true, emoji: true } },
  };

  async getFeed(userId: string, type: 'following' | 'foryou' = 'following', cursor?: string, limit = 20) {
    if (type === 'following') {
      const followingIds = await this.prisma.follow.findMany({
        where: { followerId: userId }, select: { followingId: true },
      });
      const ids = followingIds.map(f => f.followingId);
      ids.push(userId); // Include own posts

      return this.prisma.post.findMany({
        where: { authorId: { in: ids }, visibility: 'PUBLIC' },
        select: this.postSelect,
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      });
    }

    // For You: all public posts (simplified - would use ML ranking in prod)
    return this.prisma.post.findMany({
      where: { visibility: 'PUBLIC' },
      select: this.postSelect,
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreatePostDto) {
    return this.prisma.post.create({
      data: {
        authorId: userId,
        type: dto.type,
        caption: dto.caption,
        visibility: dto.visibility || 'PUBLIC',
        circleId: dto.circleId,
        media: dto.media ? {
          create: dto.media.map((m, i) => ({ url: m.url, type: m.type || 'IMAGE', width: m.width, height: m.height, order: i })),
        } : undefined,
      },
      select: this.postSelect,
    });
  }

  async getById(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: this.postSelect });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async delete(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException();
    return this.prisma.post.delete({ where: { id: postId } });
  }

  async like(postId: string, userId: string) {
    await this.prisma.like.create({ data: { userId, postId } });
    await this.prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
    return { liked: true };
  }

  async unlike(postId: string, userId: string) {
    await this.prisma.like.delete({ where: { userId_postId: { userId, postId } } });
    await this.prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
    return { liked: false };
  }

  async bookmark(postId: string, userId: string) {
    await this.prisma.bookmark.create({ data: { userId, postId } });
    return { bookmarked: true };
  }

  async unbookmark(postId: string, userId: string) {
    await this.prisma.bookmark.delete({ where: { userId_postId: { userId, postId } } });
    return { bookmarked: false };
  }

  async getComments(postId: string, cursor?: string, limit = 20) {
    return this.prisma.comment.findMany({
      where: { postId, parentId: null },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        _count: { select: { replies: true } },
      },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  async addComment(postId: string, userId: string, content: string, parentId?: string) {
    const comment = await this.prisma.comment.create({
      data: { authorId: userId, postId, content, parentId },
      include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
    await this.prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
    return comment;
  }
}
