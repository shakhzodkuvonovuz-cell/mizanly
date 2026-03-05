import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';

const POST_SELECT = {
  id: true,
  postType: true,
  content: true,
  visibility: true,
  mediaUrls: true,
  mediaTypes: true,
  thumbnailUrl: true,
  mediaWidth: true,
  mediaHeight: true,
  hashtags: true,
  mentions: true,
  locationName: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  savesCount: true,
  viewsCount: true,
  hideLikesCount: true,
  commentsDisabled: true,
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
};

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async getFeed(
    userId: string,
    type: 'following' | 'foryou' = 'following',
    cursor?: string,
    limit = 20,
  ) {
    const [follows, blocks, mutes] = await Promise.all([
      type === 'following'
        ? this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })
        : Promise.resolve([]),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      this.prisma.mute.findMany({ where: { muterId: userId }, select: { mutedId: true } }),
    ]);

    const followingIds = follows.map((f) => f.followingId);
    const excludedIds = [
      ...blocks.map((b) => b.blockedId),
      ...mutes.map((m) => m.mutedId),
    ];

    const where: any = {
      isRemoved: false,
      scheduledAt: null,
      ...(type === 'following'
        ? { userId: { in: [userId, ...followingIds], ...(excludedIds.length ? { notIn: excludedIds } : {}) } }
        : { visibility: 'PUBLIC', ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}) }),
    };

    const posts = await this.prisma.post.findMany({
      where,
      select: POST_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async create(userId: string, dto: CreatePostDto) {
    // Parse and upsert hashtags
    const hashtagMatches = (dto.content ?? '').match(/#([a-zA-Z0-9_\u0600-\u06FF]+)/g) ?? [];
    const hashtagNames = [...new Set(hashtagMatches.map((h) => h.slice(1).toLowerCase()))];
    if (hashtagNames.length > 0) {
      await Promise.all(
        hashtagNames.map((name) =>
          this.prisma.hashtag.upsert({
            where: { name },
            create: { name, postsCount: 1 },
            update: { postsCount: { increment: 1 } },
          }),
        ),
      );
    }

    const [post] = await this.prisma.$transaction([
      this.prisma.post.create({
        data: {
          userId,
          postType: dto.postType as any,
          content: dto.content,
          visibility: (dto.visibility as any) ?? 'PUBLIC',
          circleId: dto.circleId,
          mediaUrls: dto.mediaUrls ?? [],
          mediaTypes: dto.mediaTypes ?? [],
          thumbnailUrl: dto.thumbnailUrl,
          mediaWidth: dto.mediaWidth,
          mediaHeight: dto.mediaHeight,
          videoDuration: dto.videoDuration,
          hashtags: dto.hashtags ?? [],
          mentions: dto.mentions ?? [],
          locationName: dto.locationName,
          isSensitive: dto.isSensitive ?? false,
          altText: dto.altText,
          hideLikesCount: dto.hideLikesCount ?? false,
          commentsDisabled: dto.commentsDisabled ?? false,
        },
        select: POST_SELECT,
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { postsCount: { increment: 1 } },
      }),
    ]);
    return post;
  }

  async getById(postId: string, viewerId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        ...POST_SELECT,
        sharedPost: { select: { id: true, content: true, user: { select: { username: true } } } },
      },
    });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

    let userReaction: string | null = null;
    let isSaved = false;

    if (viewerId) {
      const [reaction, saved] = await Promise.all([
        this.prisma.postReaction.findUnique({
          where: { userId_postId: { userId: viewerId, postId } },
        }),
        this.prisma.savedPost.findUnique({
          where: { userId_postId: { userId: viewerId, postId } },
        }),
      ]);
      userReaction = reaction?.reaction ?? null;
      isSaved = !!saved;
    }

    return { ...post, userReaction, isSaved };
  }

  async update(postId: string, userId: string, data: Partial<CreatePostDto>) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();
    if (post.isRemoved) throw new BadRequestException('Post has been removed');

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        content: data.content,
        hideLikesCount: data.hideLikesCount,
        commentsDisabled: data.commentsDisabled,
        isSensitive: data.isSensitive,
        altText: data.altText,
      },
      select: POST_SELECT,
    });
  }

  async delete(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.post.update({
        where: { id: postId },
        data: { isRemoved: true, removedAt: new Date(), removedById: userId },
      }),
      this.prisma.user.update({
        where: { id: userId },
      this.prisma.$executeRaw`UPDATE "User" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${userId}`,
      }),
    ]);
    return { deleted: true };
  }

  async react(postId: string, userId: string, reaction: string = 'LIKE') {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      // Update reaction type
      await this.prisma.postReaction.update({
        where: { userId_postId: { userId, postId } },
        data: { reaction: reaction as any },
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.postReaction.create({
          data: { userId, postId, reaction: reaction as any },
        }),
        this.prisma.post.update({
          where: { id: postId },
          data: { likesCount: { increment: 1 } },
        }),
      ]);
      // Notify post owner
      this.notifications.create({
        userId: post.userId, actorId: userId,
        type: 'LIKE', postId,
      }).catch((err) => this.logger.error('Failed to create notification', err));
    }
    return { reaction };
  }

  async unreact(postId: string, userId: string) {
    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.postReaction.delete({
        where: { userId_postId: { userId, postId } },
      }),
      this.prisma.post.update({
        where: { id: postId },
      this.prisma.$executeRaw`UPDATE "Post" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${postId}`,
      }),
    ]);
    return { reaction: null };
  }

  async save(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

    try {
      await this.prisma.$transaction([
        this.prisma.savedPost.create({ data: { userId, postId } }),
        this.prisma.post.update({ where: { id: postId }, data: { savesCount: { increment: 1 } } }),
      ]);
    } catch {
      throw new ConflictException('Post already saved');
    }
    return { saved: true };
  }

  async unsave(postId: string, userId: string) {
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) throw new NotFoundException('Save not found');

    await this.prisma.$transaction([
      this.prisma.savedPost.delete({ where: { userId_postId: { userId, postId } } }),
      this.prisma.$executeRaw`UPDATE "Post" SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = ${postId}`,
    ]);
    return { saved: false };
  }

  async share(postId: string, userId: string, content?: string) {
    const original = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!original || original.isRemoved) throw new NotFoundException('Post not found');

    const [shared] = await this.prisma.$transaction([
      this.prisma.post.create({
        data: {
          userId,
          postType: 'TEXT',
          content: content,
          sharedPostId: postId,
          visibility: 'PUBLIC',
        },
        select: POST_SELECT,
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { sharesCount: { increment: 1 } },
      }),
    ]);
    return shared;
  }

  async getComments(postId: string, cursor?: string, limit = 20) {
    const comments = await this.prisma.comment.findMany({
      where: { postId, parentId: null, isRemoved: false },
      include: {
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
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async getCommentReplies(commentId: string, cursor?: string, limit = 20) {
    const replies = await this.prisma.comment.findMany({
      where: { parentId: commentId, isRemoved: false },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
    });

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, limit) : replies;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async addComment(postId: string, userId: string, dto: AddCommentDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');
    if (post.commentsDisabled) throw new ForbiddenException('Comments are disabled on this post');

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          userId,
          postId,
          content: dto.content,
          parentId: dto.parentId,
          mentions: [],
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
        },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);
    // Notify post owner
    this.notifications.create({
      userId: post.userId, actorId: userId,
      type: dto.parentId ? 'REPLY' : 'COMMENT',
      postId, commentId: comment.id,
      body: dto.content.substring(0, 100),
    }).catch((err) => this.logger.error('Failed to create notification', err));
    return comment;
  }

  async editComment(commentId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.isRemoved) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.comment.update({
        where: { id: commentId },
        data: { isRemoved: true },
      }),
      this.prisma.post.update({
        where: { id: comment.postId },
      this.prisma.$executeRaw`UPDATE "Post" SET "commentsCount" = GREATEST("commentsCount" - 1, 0) WHERE id = ${comment.postId}`,
      }),
    ]);
    return { deleted: true };
  }

  async likeComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');

    const existing = await this.prisma.commentReaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existing) throw new ConflictException('Already reacted');

    await this.prisma.$transaction([
      this.prisma.commentReaction.create({
        data: { userId, commentId, reaction: 'LIKE' },
      }),
      this.prisma.comment.update({
        where: { id: commentId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    return { liked: true };
  }

  async unlikeComment(commentId: string, userId: string) {
    const existing = await this.prisma.commentReaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });
    if (!existing) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.commentReaction.delete({
        where: { userId_commentId: { userId, commentId } },
      }),
      this.prisma.comment.update({
        where: { id: commentId },
      this.prisma.$executeRaw`UPDATE "Comment" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${commentId}`,
      }),
    ]);
    return { liked: false };
  }

  async report(postId: string, userId: string, reason: string) {
    const reasonMap: Record<string, string> = {
      SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
      INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
    };
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedPostId: postId,
        reason: (reasonMap[reason] ?? 'OTHER') as any,
      },
    });
    return { reported: true };
  }

  async dismiss(postId: string, userId: string) {
    await this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId: postId, contentType: 'POST' } },
      create: { userId, contentId: postId, contentType: 'POST' },
      update: {},
    });
    return { dismissed: true };
  }
}
