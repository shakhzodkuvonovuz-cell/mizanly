import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ThreadVisibility, ReportReason } from '@prisma/client';

const THREAD_SELECT = {
  id: true,
  content: true,
  mediaUrls: true,
  mediaTypes: true,
  visibility: true,
  isChainHead: true,
  chainId: true,
  chainPosition: true,
  isQuotePost: true,
  quoteText: true,
  repostOfId: true,
  hashtags: true,
  mentions: true,
  likesCount: true,
  repliesCount: true,
  repostsCount: true,
  quotesCount: true,
  viewsCount: true,
  bookmarksCount: true,
  hideLikesCount: true,
  isPinned: true,
  isSensitive: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  circle: { select: { id: true, name: true, slug: true } },
  poll: {
    include: {
      options: {
        orderBy: { position: 'asc' as const },
        include: { _count: { select: { votes: true } } },
      },
    },
  },
  repostOf: {
    select: {
      id: true,
      content: true,
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  },
};

const REPLY_SELECT = {
  id: true,
  content: true,
  mediaUrls: true,
  likesCount: true,
  createdAt: true,
  parentId: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  _count: { select: { replies: true } },
};

@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async getFeed(
    userId: string,
    type: 'foryou' | 'following' | 'trending' = 'foryou',
    cursor?: string,
    limit = 20,
  ) {
    const [follows, blocks, mutes] = await Promise.all([
      type === 'following'
        ? this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })
        : Promise.resolve([]),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true } }),
    ]);

    const followingIds = follows.map((f) => f.followingId);
    const excludedIds = [
      ...blocks.map((b) => b.blockedId),
      ...mutes.map((m) => m.mutedId),
    ];

    const where: any = { isRemoved: false, isChainHead: true };

    if (type === 'following') {
      where.userId = { in: [userId, ...followingIds], ...(excludedIds.length ? { notIn: excludedIds } : {}) };
    } else {
      where.visibility = 'PUBLIC';
      if (excludedIds.length) where.userId = { notIn: excludedIds };
    }

    const threads = await this.prisma.thread.findMany({
      where,
      select: THREAD_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy:
        type === 'trending'
          ? { likesCount: 'desc' }
          : { createdAt: 'desc' },
    });

    const hasMore = threads.length > limit;
    const items = hasMore ? threads.slice(0, limit) : threads;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async create(userId: string, dto: CreateThreadDto) {
    // Parse and upsert hashtags
    const hashtagMatches = (dto.content ?? '').match(/#([a-zA-Z0-9_\u0600-\u06FF]+)/g) ?? [];
    const hashtagNames = [...new Set(hashtagMatches.map((h) => h.slice(1).toLowerCase()))];
    if (hashtagNames.length > 0) {
      await Promise.all(
        hashtagNames.map((name) =>
          this.prisma.hashtag.upsert({
            where: { name },
            create: { name, threadsCount: 1 },
            update: { threadsCount: { increment: 1 } },
          }),
        ),
      );
    }

    const [thread] = await this.prisma.$transaction([
      this.prisma.thread.create({
        data: {
          userId,
          content: dto.content,
          visibility: (dto.visibility as ThreadVisibility) ?? 'PUBLIC',
          circleId: dto.circleId,
          mediaUrls: dto.mediaUrls ?? [],
          mediaTypes: dto.mediaTypes ?? [],
          hashtags: dto.hashtags ?? [],
          mentions: dto.mentions ?? [],
          isQuotePost: dto.isQuotePost ?? false,
          quoteText: dto.quoteText,
          repostOfId: dto.repostOfId,
          poll: dto.poll
            ? {
                create: {
                  question: dto.poll.question,
                  endsAt: dto.poll.endsAt ? new Date(dto.poll.endsAt) : undefined,
                  allowMultiple: dto.poll.allowMultiple ?? false,
                  options: {
                    create: dto.poll.options.map((o, i) => ({
                      text: o.text,
                      position: i,
                    })),
                  },
                },
              }
            : undefined,
        },
        select: THREAD_SELECT,
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { threadsCount: { increment: 1 } },
      }),
    ]);
    return thread;
  }

  async getById(threadId: string, viewerId?: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: THREAD_SELECT,
    });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    let userReaction: string | null = null;
    let isBookmarked = false;

    if (viewerId) {
      const [reaction, bookmark] = await Promise.all([
        this.prisma.threadReaction.findUnique({
          where: { userId_threadId: { userId: viewerId, threadId } },
        }),
        this.prisma.threadBookmark.findUnique({
          where: { userId_threadId: { userId: viewerId, threadId } },
        }),
      ]);
      userReaction = reaction?.reaction ?? null;
      isBookmarked = !!bookmark;
    }

    return { ...thread, userReaction, isBookmarked };
  }

  async delete(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.thread.update({
        where: { id: threadId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "threadsCount" = GREATEST("threadsCount" - 1, 0) WHERE id = ${userId}`,
    ]);
    return { deleted: true };
  }

  async like(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    const existing = await this.prisma.threadReaction.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (existing) throw new ConflictException('Already reacted');

    await this.prisma.$transaction([
      this.prisma.threadReaction.create({
        data: { userId, threadId, reaction: 'LIKE' },
      }),
      this.prisma.thread.update({
        where: { id: threadId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    // Notify thread owner
    this.notifications.create({
      userId: thread.userId, actorId: userId,
      type: 'LIKE', threadId,
    }).catch((err) => this.logger.error('Failed to create notification', err));
    return { liked: true };
  }

  async unlike(threadId: string, userId: string) {
    const existing = await this.prisma.threadReaction.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (!existing) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.threadReaction.delete({
        where: { userId_threadId: { userId, threadId } },
      }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${threadId}`,
    ]);
    return { liked: false };
  }

  async repost(threadId: string, userId: string) {
    const original = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!original || original.isRemoved) throw new NotFoundException('Thread not found');

    // Check if user already reposted
    const existingRepost = await this.prisma.thread.findFirst({
      where: { userId, repostOfId: threadId, isRemoved: false },
    });
    if (existingRepost) throw new ConflictException('Already reposted');

    const [repost] = await this.prisma.$transaction([
      this.prisma.thread.create({
        data: {
          userId,
          content: '',
          repostOfId: threadId,
          mediaUrls: [],
          mediaTypes: [],
          visibility: 'PUBLIC',
        },
        select: THREAD_SELECT,
      }),
      this.prisma.thread.update({
        where: { id: threadId },
        data: { repostsCount: { increment: 1 } },
      }),
    ]);
    // Notify thread owner
    this.notifications.create({
      userId: original.userId, actorId: userId,
      type: 'REPOST', threadId,
    }).catch((err) => this.logger.error('Failed to create notification', err));
    return repost;
  }

  async unrepost(threadId: string, userId: string) {
    const repost = await this.prisma.thread.findFirst({
      where: { userId, repostOfId: threadId, isRemoved: false },
    });
    if (!repost) throw new NotFoundException('Repost not found');

    await this.prisma.$transaction([
      this.prisma.thread.update({
        where: { id: repost.id },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "repostsCount" = GREATEST("repostsCount" - 1, 0) WHERE id = ${threadId}`,
    ]);
    return { reposted: false };
  }

  async bookmark(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    try {
      await this.prisma.$transaction([
        this.prisma.threadBookmark.create({ data: { userId, threadId } }),
        this.prisma.thread.update({
          where: { id: threadId },
          data: { bookmarksCount: { increment: 1 } },
        }),
      ]);
    } catch {
      throw new ConflictException('Already bookmarked');
    }
    return { bookmarked: true };
  }

  async unbookmark(threadId: string, userId: string) {
    const existing = await this.prisma.threadBookmark.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (!existing) throw new NotFoundException('Bookmark not found');

    await this.prisma.$transaction([
      this.prisma.threadBookmark.delete({
        where: { userId_threadId: { userId, threadId } },
      }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "bookmarksCount" = GREATEST("bookmarksCount" - 1, 0) WHERE id = ${threadId}`,
    ]);
    return { bookmarked: false };
  }

  async getReplies(threadId: string, cursor?: string, limit = 20, viewerId?: string) {
    const replies = await this.prisma.threadReply.findMany({
      where: { threadId, parentId: null },
      select: REPLY_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
    });

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, limit) : replies;

    // Attach isLiked for authenticated viewer
    if (viewerId && items.length > 0) {
      const replyIds = items.map((r) => r.id);
      const liked = await this.prisma.threadReplyLike.findMany({
        where: { userId: viewerId, replyId: { in: replyIds } },
        select: { replyId: true },
      });
      const likedSet = new Set(liked.map((l) => l.replyId));
      return {
        data: items.map((r) => ({ ...r, isLiked: likedSet.has(r.id) })),
        meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
      };
    }

    return {
      data: items.map((r) => ({ ...r, isLiked: false })),
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async likeReply(threadId: string, replyId: string, userId: string) {
    const reply = await this.prisma.threadReply.findUnique({ where: { id: replyId } });
    if (!reply || reply.threadId !== threadId) throw new NotFoundException('Reply not found');

    const existing = await this.prisma.threadReplyLike.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (existing) throw new ConflictException('Already liked');

    await this.prisma.$transaction([
      this.prisma.threadReplyLike.create({ data: { userId, replyId } }),
      this.prisma.threadReply.update({
        where: { id: replyId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    return { liked: true };
  }

  async unlikeReply(threadId: string, replyId: string, userId: string) {
    const existing = await this.prisma.threadReplyLike.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (!existing) throw new NotFoundException('Like not found');

    await this.prisma.$transaction([
      this.prisma.threadReplyLike.delete({
        where: { userId_replyId: { userId, replyId } },
      }),
      this.prisma.$executeRaw`UPDATE "ThreadReply" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${replyId}`,
    ]);
    return { liked: false };
  }

  async addReply(threadId: string, userId: string, content: string, parentId?: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');

    if (parentId) {
      const parent = await this.prisma.threadReply.findUnique({ where: { id: parentId } });
      if (!parent || parent.threadId !== threadId) throw new NotFoundException('Parent reply not found');
    }

    const [reply] = await this.prisma.$transaction([
      this.prisma.threadReply.create({
        data: { threadId, userId, content, parentId },
        select: REPLY_SELECT,
      }),
      this.prisma.thread.update({
        where: { id: threadId },
        data: { repliesCount: { increment: 1 } },
      }),
    ]);
    // Notify thread owner
    this.notifications.create({
      userId: thread.userId, actorId: userId,
      type: 'THREAD_REPLY', threadId,
      body: content.substring(0, 100),
    }).catch((err) => this.logger.error('Failed to create notification', err));
    return reply;
  }

  async deleteReply(replyId: string, userId: string) {
    const reply = await this.prisma.threadReply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('Reply not found');
    if (reply.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.threadReply.delete({ where: { id: replyId } }),
      this.prisma.$executeRaw`UPDATE "Thread" SET "repliesCount" = GREATEST("repliesCount" - 1, 0) WHERE id = ${reply.threadId}`,
    ]);
    return { deleted: true };
  }

  async votePoll(optionId: string, userId: string) {
    const option = await this.prisma.pollOption.findUnique({
      where: { id: optionId },
      include: { poll: true },
    });
    if (!option) throw new NotFoundException('Poll option not found');

    if (option.poll.endsAt && option.poll.endsAt < new Date()) {
      throw new BadRequestException('Poll has ended');
    }

    const existing = await this.prisma.pollVote.findUnique({
      where: { userId_optionId: { userId, optionId } },
    });
    if (existing) throw new ConflictException('Already voted');

    // If allowMultiple is false, check if user has already voted on any option in this poll
    if (!option.poll.allowMultiple) {
      const existingVoteOnPoll = await this.prisma.pollVote.findFirst({
        where: { userId, option: { pollId: option.pollId } },
      });
      if (existingVoteOnPoll) throw new ConflictException('Already voted on this poll');
    }

    await this.prisma.$transaction([
      this.prisma.pollVote.create({ data: { userId, optionId } }),
      this.prisma.pollOption.update({
        where: { id: optionId },
        data: { votesCount: { increment: 1 } },
      }),
      this.prisma.poll.update({
        where: { id: option.pollId },
        data: { totalVotes: { increment: 1 } },
      }),
    ]);
    return { voted: true };
  }

  async getUserThreads(username: string, cursor?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    const threads = await this.prisma.thread.findMany({
      where: { userId: user.id, isRemoved: false, isChainHead: true },
      select: THREAD_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = threads.length > limit;
    const items = hasMore ? threads.slice(0, limit) : threads;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async report(threadId: string, userId: string, reason: string) {
    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
      INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        description: `thread:${threadId}`,
        reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
      },
    });
    return { reported: true };
  }

  async dismiss(threadId: string, userId: string) {
    await this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId: threadId, contentType: 'THREAD' } },
      create: { userId, contentId: threadId, contentType: 'THREAD' },
      update: {},
    });
    return { dismissed: true };
  }
}
