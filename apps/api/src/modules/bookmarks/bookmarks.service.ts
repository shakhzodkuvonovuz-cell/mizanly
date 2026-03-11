import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma, SavedPost, ThreadBookmark, VideoBookmark } from '@prisma/client';

@Injectable()
export class BookmarksService {
  private readonly logger = new Logger(BookmarksService.name);
  constructor(private prisma: PrismaService) {}

  // Save a post with optional collection name
  async savePost(userId: string, postId: string, collectionName = 'default') {
    // Check if post exists
    const post = await this.prisma.post.findUnique({
      where: { id: postId, isRemoved: false },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    // Check if already saved
    const existing = await this.prisma.savedPost.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
    });
    if (existing) {
      // Update collection name if different
      if (existing.collectionName !== collectionName) {
        return this.prisma.savedPost.update({
          where: { userId_postId: { userId, postId } },
          data: { collectionName },
        });
      }
      return existing; // already saved in same collection
    }

    // Create saved post
    const [savedPost] = await this.prisma.$transaction([
      this.prisma.savedPost.create({
        data: { userId, postId, collectionName },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { savesCount: { increment: 1 } },
      }),
    ]);
    return savedPost;
  }

  // Unsave a post
  async unsavePost(userId: string, postId: string) {
    const saved = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!saved) throw new NotFoundException('Post not saved');

    await this.prisma.$transaction([
      this.prisma.savedPost.delete({
        where: { userId_postId: { userId, postId } },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { savesCount: { decrement: 1 } },
      }),
    ]);
    return { success: true };
  }

  // Save a thread
  async saveThread(userId: string, threadId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId, isRemoved: false },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    const existing = await this.prisma.threadBookmark.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (existing) return existing;

    return this.prisma.threadBookmark.create({
      data: { userId, threadId },
    });
  }

  // Unsave a thread
  async unsaveThread(userId: string, threadId: string) {
    const saved = await this.prisma.threadBookmark.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });
    if (!saved) throw new NotFoundException('Thread not saved');

    await this.prisma.threadBookmark.delete({
      where: { userId_threadId: { userId, threadId } },
    });
    return { success: true };
  }

  // Save a video
  async saveVideo(userId: string, videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId, isRemoved: false },
      select: { id: true },
    });
    if (!video) throw new NotFoundException('Video not found');

    const existing = await this.prisma.videoBookmark.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    if (existing) return existing;

    return this.prisma.videoBookmark.create({
      data: { userId, videoId },
    });
  }

  // Unsave a video
  async unsaveVideo(userId: string, videoId: string) {
    const saved = await this.prisma.videoBookmark.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });
    if (!saved) throw new NotFoundException('Video not saved');

    await this.prisma.videoBookmark.delete({
      where: { userId_videoId: { userId, videoId } },
    });
    return { success: true };
  }

  // Get saved posts with optional collection filter
  async getSavedPosts(userId: string, collectionName?: string, cursor?: string, limit = 20) {
    const where: Prisma.SavedPostWhereInput = { userId };
    if (collectionName) where.collectionName = collectionName;

    const saved = await this.prisma.savedPost.findMany({
      where,
      include: {
        post: {
          select: {
            id: true,
            content: true,
            mediaUrls: true,
            mediaTypes: true,
            thumbnailUrl: true,
            likesCount: true,
            commentsCount: true,
            savesCount: true,
            createdAt: true,
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
        },
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor
        ? {
            cursor: {
              userId_postId: { userId, postId: cursor },
            },
            skip: 1,
          }
        : {}),
    });

    const hasMore = saved.length > limit;
    const items = hasMore ? saved.slice(0, limit) : saved;
    return {
      data: items.map((sp) => sp.post),
      meta: {
        cursor: hasMore ? items[items.length - 1].postId : null,
        hasMore,
      },
    };
  }

  // Get saved threads
  async getSavedThreads(userId: string, cursor?: string, limit = 20) {
    const saved = await this.prisma.threadBookmark.findMany({
      where: { userId },
      include: {
        thread: {
          select: {
            id: true,
            content: true,
            mediaUrls: true,
            likesCount: true,
            repliesCount: true,
            createdAt: true,
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
        },
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor
        ? {
            cursor: {
              userId_threadId: { userId, threadId: cursor },
            },
            skip: 1,
          }
        : {}),
    });

    const hasMore = saved.length > limit;
    const items = hasMore ? saved.slice(0, limit) : saved;
    return {
      data: items.map((tb) => tb.thread),
      meta: {
        cursor: hasMore ? items[items.length - 1].threadId : null,
        hasMore,
      },
    };
  }

  // Get saved videos
  async getSavedVideos(userId: string, cursor?: string, limit = 20) {
    const saved = await this.prisma.videoBookmark.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnailUrl: true,
            videoUrl: true,
            duration: true,
            viewsCount: true,
            likesCount: true,
            savesCount: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
              },
            },
            channel: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor
        ? {
            cursor: {
              userId_videoId: { userId, videoId: cursor },
            },
            skip: 1,
          }
        : {}),
    });

    const hasMore = saved.length > limit;
    const items = hasMore ? saved.slice(0, limit) : saved;
    return {
      data: items.map((vb) => vb.video),
      meta: {
        cursor: hasMore ? items[items.length - 1].videoId : null,
        hasMore,
      },
    };
  }

  // Get collection names for the user (group by collectionName)
  async getCollections(userId: string) {
    const groups = await this.prisma.savedPost.groupBy({
      by: ['collectionName'],
      where: { userId },
      _count: { postId: true },
    });
    return groups.map((g) => ({
      name: g.collectionName,
      count: g._count.postId,
    }));
  }

  // Move a saved post to another collection
  async moveToCollection(userId: string, postId: string, collectionName: string) {
    const saved = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!saved) throw new NotFoundException('Saved post not found');

    return this.prisma.savedPost.update({
      where: { userId_postId: { userId, postId } },
      data: { collectionName },
    });
  }

  // Check if post is saved
  async isPostSaved(userId: string, postId: string) {
    const saved = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { collectionName: true, createdAt: true },
    });
    return { saved: !!saved, collectionName: saved?.collectionName };
  }

  // Check if thread is saved
  async isThreadSaved(userId: string, threadId: string) {
    const saved = await this.prisma.threadBookmark.findUnique({
      where: { userId_threadId: { userId, threadId } },
      select: { createdAt: true },
    });
    return { saved: !!saved };
  }

  // Check if video is saved
  async isVideoSaved(userId: string, videoId: string) {
    const saved = await this.prisma.videoBookmark.findUnique({
      where: { userId_videoId: { userId, videoId } },
      select: { createdAt: true },
    });
    return { saved: !!saved };
  }
}