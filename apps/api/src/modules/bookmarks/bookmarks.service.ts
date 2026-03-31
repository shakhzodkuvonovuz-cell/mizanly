import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

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

    // Upsert handles idempotency — no race between find and create
    try {
      // Try to find existing first to decide whether to increment
      const existing = await this.prisma.savedPost.findUnique({
        where: { userId_postId: { userId, postId } },
      });

      if (existing) {
        // Already saved — update collection if different
        if (existing.collectionName !== collectionName) {
          return this.prisma.savedPost.update({
            where: { userId_postId: { userId, postId } },
            data: { collectionName },
          });
        }
        return existing;
      }

      // New save — create + increment atomically
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
    } catch (error) {
      // P2002: concurrent duplicate — another request already saved
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.savedPost.findUnique({
          where: { userId_postId: { userId, postId } },
        });
        return existing;
      }
      throw error;
    }
  }

  // Unsave a post
  async unsavePost(userId: string, postId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.savedPost.delete({
          where: { userId_postId: { userId, postId } },
        });
        // Decrement but never go below 0
        await tx.post.update({
          where: { id: postId },
          data: {
            savesCount: {
              decrement: 1,
            },
          },
        });
        // Clamp to 0 if it went negative
        await tx.post.updateMany({
          where: { id: postId, savesCount: { lt: 0 } },
          data: { savesCount: 0 },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Post not saved');
      }
      throw error;
    }
    return { success: true };
  }

  // Save a thread
  async saveThread(userId: string, threadId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId, isRemoved: false },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    try {
      const [bookmark] = await this.prisma.$transaction([
        this.prisma.threadBookmark.create({
          data: { userId, threadId },
        }),
        this.prisma.thread.update({
          where: { id: threadId },
          data: { bookmarksCount: { increment: 1 } },
        }),
      ]);
      return bookmark;
    } catch (error) {
      // P2002: already saved — idempotent
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.threadBookmark.findUnique({
          where: { userId_threadId: { userId, threadId } },
        });
        return existing;
      }
      throw error;
    }
  }

  // Unsave a thread
  async unsaveThread(userId: string, threadId: string) {
    try {
      await this.prisma.$transaction([
        this.prisma.threadBookmark.delete({
          where: { userId_threadId: { userId, threadId } },
        }),
        this.prisma.$executeRaw`UPDATE "threads" SET "bookmarksCount" = GREATEST("bookmarksCount" - 1, 0) WHERE id = ${threadId}`,
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Thread not saved');
      }
      throw error;
    }
    return { success: true };
  }

  // Save a video
  async saveVideo(userId: string, videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId, isRemoved: false },
      select: { id: true },
    });
    if (!video) throw new NotFoundException('Video not found');

    try {
      const [bookmark] = await this.prisma.$transaction([
        this.prisma.videoBookmark.create({
          data: { userId, videoId },
        }),
        this.prisma.video.update({
          where: { id: videoId },
          data: { savesCount: { increment: 1 } },
        }),
      ]);
      return bookmark;
    } catch (error) {
      // P2002: already saved — idempotent
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.videoBookmark.findUnique({
          where: { userId_videoId: { userId, videoId } },
        });
        return existing;
      }
      throw error;
    }
  }

  // Unsave a video
  async unsaveVideo(userId: string, videoId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.videoBookmark.delete({
          where: { userId_videoId: { userId, videoId } },
        });
        await tx.video.update({
          where: { id: videoId },
          data: { savesCount: { decrement: 1 } },
        });
        // Clamp to 0 if it went negative
        await tx.video.updateMany({
          where: { id: videoId, savesCount: { lt: 0 } },
          data: { savesCount: 0 },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Video not saved');
      }
      throw error;
    }
    return { success: true };
  }

  // Get saved posts with optional collection filter
  async getSavedPosts(userId: string, collectionName?: string, cursor?: string, limit = 20) {
    limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const where: Prisma.SavedPostWhereInput = {
      userId,
      post: { isRemoved: false, user: { isBanned: false, isDeactivated: false, isDeleted: false } },
    };
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
    limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const saved = await this.prisma.threadBookmark.findMany({
      where: { userId, thread: { isRemoved: false, user: { isBanned: false, isDeactivated: false, isDeleted: false } } },
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
    limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const saved = await this.prisma.videoBookmark.findMany({
      where: { userId, video: { isRemoved: false, user: { isBanned: false, isDeactivated: false, isDeleted: false } } },
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
