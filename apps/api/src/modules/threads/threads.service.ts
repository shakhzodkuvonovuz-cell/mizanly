import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateThreadDto } from './dto/create-thread.dto';

@Injectable()
export class ThreadsService {
  constructor(private prisma: PrismaService) {}

  private readonly threadSelect = {
    id: true, content: true, visibility: true, likeCount: true,
    repostCount: true, replyCount: true, viewCount: true, isPinned: true, createdAt: true,
    author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    media: { select: { id: true, url: true, type: true, order: true }, orderBy: { order: 'asc' as const } },
    poll: { include: { options: { orderBy: { order: 'asc' as const } } } },
    circle: { select: { id: true, name: true, emoji: true } },
    replyTo: { select: { id: true, content: true, author: { select: { username: true } } } },
  };

  async getFeed(userId: string, type: 'foryou' | 'following' | 'trending' = 'foryou', cursor?: string, limit = 20) {
    let where: any = { replyToId: null, visibility: 'PUBLIC' };

    if (type === 'following') {
      const followingIds = await this.prisma.follow.findMany({
        where: { followerId: userId }, select: { followingId: true },
      });
      where.authorId = { in: [...followingIds.map(f => f.followingId), userId] };
    }

    return this.prisma.thread.findMany({
      where,
      select: this.threadSelect,
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: type === 'trending' ? { likeCount: 'desc' } : { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateThreadDto) {
    return this.prisma.thread.create({
      data: {
        authorId: userId,
        content: dto.content,
        visibility: dto.visibility || 'PUBLIC',
        circleId: dto.circleId,
        replyToId: dto.replyToId,
        rootThreadId: dto.rootThreadId,
        media: dto.media ? {
          create: dto.media.map((m, i) => ({ url: m.url, type: m.type || 'IMAGE', order: i })),
        } : undefined,
        poll: dto.poll ? {
          create: {
            question: dto.poll.question,
            expiresAt: new Date(dto.poll.expiresAt),
            options: { create: dto.poll.options.map((o, i) => ({ text: o, order: i })) },
          },
        } : undefined,
      },
      select: this.threadSelect,
    });
  }

  async getById(threadId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId }, select: this.threadSelect });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  async getReplies(threadId: string, cursor?: string, limit = 20) {
    return this.prisma.thread.findMany({
      where: { replyToId: threadId },
      select: this.threadSelect,
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException();
    if (thread.authorId !== userId) throw new ForbiddenException();
    return this.prisma.thread.delete({ where: { id: threadId } });
  }

  async like(threadId: string, userId: string) {
    await this.prisma.like.create({ data: { userId, threadId } });
    await this.prisma.thread.update({ where: { id: threadId }, data: { likeCount: { increment: 1 } } });
    return { liked: true };
  }

  async unlike(threadId: string, userId: string) {
    await this.prisma.like.delete({ where: { userId_threadId: { userId, threadId } } });
    await this.prisma.thread.update({ where: { id: threadId }, data: { likeCount: { decrement: 1 } } });
    return { liked: false };
  }

  async repost(threadId: string, userId: string) {
    await this.prisma.repost.create({ data: { userId, threadId } });
    await this.prisma.thread.update({ where: { id: threadId }, data: { repostCount: { increment: 1 } } });
    return { reposted: true };
  }

  async votePoll(optionId: string, userId: string) {
    await this.prisma.pollVote.create({ data: { optionId, voterId: userId } });
    await this.prisma.pollOption.update({ where: { id: optionId }, data: { voteCount: { increment: 1 } } });
    return { voted: true };
  }
}
