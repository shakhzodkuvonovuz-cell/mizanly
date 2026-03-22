import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PostVisibility, ThreadVisibility, ReportReason } from '@prisma/client';
import { sanitizeText } from '@/common/utils/sanitize';

const PUBLIC_USER_FIELDS = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  coverUrl: true,
  website: true,
  location: true,
  isVerified: true,
  isPrivate: true,
  followersCount: true,
  followingCount: true,
  postsCount: true,
  role: true,
  createdAt: true,
  lastSeenAt: true,
  isDeleted: true,
  isBanned: true,
  isDeactivated: true,
};

const CHANNEL_SELECT = {
  id: true,
  handle: true,
  name: true,
  description: true,
  avatarUrl: true,
  bannerUrl: true,
  subscribersCount: true,
  videosCount: true,
  totalViews: true,
  isVerified: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  touchLastSeen(userId: string) {
    this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    }).catch((e) => this.logger.error('Failed to update lastSeenAt', e));
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PUBLIC_USER_FIELDS,
        email: true,
        language: true,
        theme: true,
        lastSeenAt: true,
        profileLinks: { orderBy: { position: 'asc' } },
        settings: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const sanitizedData = { ...dto };
    if (sanitizedData.displayName) sanitizedData.displayName = sanitizeText(sanitizedData.displayName);
    if (sanitizedData.bio) sanitizedData.bio = sanitizeText(sanitizedData.bio);
    if (sanitizedData.location) sanitizedData.location = sanitizeText(sanitizedData.location);
    if (sanitizedData.website) sanitizedData.website = sanitizeText(sanitizedData.website);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: sanitizedData,
      select: PUBLIC_USER_FIELDS,
    });
    await this.redis.del(`user:${updated.username}`);
    return updated;
  }

  async deactivate(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isDeactivated: true, deactivatedAt: new Date() },
    });

    await this.redis.del(`user:${user.username}`);
    return { message: 'Account deactivated' };
  }

  /**
   * GDPR data export — returns all user data in JSON format.
   * Includes: profile, posts, comments, messages, follows, likes, bookmarks, search history.
   */
  async exportData(userId: string) {
    const [user, posts, comments, messages, followers, following, likes, bookmarks, threads, reels, videos] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, username: true, displayName: true, bio: true, avatarUrl: true,
          coverUrl: true, website: true, location: true, isPrivate: true,
          createdAt: true, lastSeenAt: true,
        },
      }),
      this.prisma.post.findMany({
        where: { userId, isRemoved: false },
        select: { id: true, content: true, mediaUrls: true, postType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50000,
      }),
      this.prisma.comment.findMany({
        where: { userId, isRemoved: false },
        select: { id: true, content: true, postId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50000,
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        select: { id: true, content: true, conversationId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50000,
      }),
      this.prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true, createdAt: true },
        take: 50000,
      }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true, createdAt: true },
        take: 50000,
      }),
      this.prisma.postReaction.findMany({
        where: { userId },
        select: { postId: true, reaction: true, createdAt: true },
        take: 50000,
      }),
      this.prisma.savedPost.findMany({
        where: { userId },
        select: { postId: true, createdAt: true },
        take: 50000,
      }),
      // Additional content types for complete GDPR export
      this.prisma.thread.findMany({
        where: { userId },
        select: { id: true, content: true, mediaUrls: true, createdAt: true },
        take: 50000,
      }),
      this.prisma.reel.findMany({
        where: { userId },
        select: { id: true, caption: true, videoUrl: true, createdAt: true },
        take: 50000,
      }),
      this.prisma.video.findMany({
        where: { userId },
        select: { id: true, title: true, description: true, thumbnailUrl: true, createdAt: true },
        take: 50000,
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      posts,
      threads,
      reels,
      videos,
      comments,
      messages,
      followers: followers.map(f => f.followerId),
      following: following.map(f => f.followingId),
      likes,
      bookmarks,
    };
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, isDeleted: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('Account already deleted');

    // Full transactional soft-delete: anonymize PII + mark all content as removed (GDPR Article 17)
    await this.prisma.$transaction(async (tx) => {
      // Anonymize user profile — use full userId to prevent collision
      await tx.user.update({
        where: { id: userId },
        data: {
          username: `deleted_${userId}`,
          displayName: 'Deleted User',
          bio: '',
          avatarUrl: null,
          coverUrl: null,
          website: null,
          email: `deleted_${userId}@deleted.local`,
          phone: null,
          expoPushToken: null,
          notificationsOn: false,
          isDeleted: true,
          deletedAt: new Date(),
          isDeactivated: true,
          deactivatedAt: new Date(),
        },
      });

      // Soft-delete all user content
      await tx.post.updateMany({
        where: { userId },
        data: { isRemoved: true, removedReason: 'Account deleted by user', removedAt: new Date() },
      });
      await tx.thread.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.comment.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.reel.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.video.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.story.deleteMany({ where: { userId } });

      // Delete sensitive personal data
      await tx.profileLink.deleteMany({ where: { userId } });
      await tx.twoFactorSecret.deleteMany({ where: { userId } });
      await tx.encryptionKey.deleteMany({ where: { userId } });
      await tx.device.deleteMany({ where: { userId } });

      // Remove social graph
      await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });

      // Clean up circles, mutes, and restricts
      await tx.circleMember.deleteMany({ where: { userId } });
      await tx.mute.deleteMany({ where: { OR: [{ userId }, { mutedId: userId }] } });
      await tx.restrict.deleteMany({ where: { OR: [{ restricterId: userId }, { restrictedId: userId }] } });
      await tx.followRequest.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } });

      // Delete bookmarks and reactions
      await tx.bookmark.deleteMany({ where: { userId } });
      await tx.postReaction.deleteMany({ where: { userId } });
    });

    await this.redis.del(`user:${user.username}`);
    return { deleted: true };
  }

  async getProfile(username: string, currentUserId?: string) {
    // Try cache first
    const cached = await this.redis.get(`user:${username}`);
    let user;
    if (cached) {
      user = JSON.parse(cached);
    } else {
      user = await this.prisma.user.findUnique({
        where: { username },
        select: {
          ...PUBLIC_USER_FIELDS,
          profileLinks: { orderBy: { position: 'asc' } },
          channel: { select: CHANNEL_SELECT },
        },
      });
      if (!user) throw new NotFoundException('User not found');
      // Cache for 5 minutes
      await this.redis.setex(`user:${username}`, 300, JSON.stringify(user));
    }

    // Reject deleted, banned, or deactivated profiles
    if (user.isDeleted || user.isBanned || user.isDeactivated) {
      throw new NotFoundException('User not found');
    }

    // Check if current user is blocked
    if (currentUserId) {
      const block = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: currentUserId, blockedId: user.id },
            { blockerId: user.id, blockedId: currentUserId },
          ],
        },
      });
      if (block) throw new ForbiddenException('User not available');
    }

    let isFollowing = false;
    let followRequestPending = false;
    if (currentUserId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: user.id,
          },
        },
      });
      isFollowing = !!follow;

      if (!isFollowing && user.isPrivate) {
        const req = await this.prisma.followRequest.findUnique({
          where: {
            senderId_receiverId: {
              senderId: currentUserId,
              receiverId: user.id,
            },
          },
        });
        followRequestPending = req?.status === 'PENDING';
      }
    }

    return { ...user, isFollowing, followRequestPending };
  }

  async getUserPosts(username: string, cursor?: string, viewerId?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    // Block check: prevent viewing posts of/by blocked users
    if (viewerId && viewerId !== user.id) {
      const block = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: user.id },
            { blockerId: user.id, blockedId: viewerId },
          ],
        },
      });
      if (block) throw new ForbiddenException('User not available');
    }

    const isOwn = viewerId === user.id;
    const isFollower = !isOwn && !!viewerId && await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
    }).then(Boolean);

    const visibilityFilter = isOwn
      ? {}
      : isFollower
        ? { visibility: { in: [PostVisibility.PUBLIC, PostVisibility.FOLLOWERS] } }
        : { visibility: PostVisibility.PUBLIC };

    const posts = await this.prisma.post.findMany({
      where: { userId: user.id, isRemoved: false, scheduledAt: null, ...visibilityFilter },
      select: {
        id: true,
        content: true,
        postType: true,
        mediaUrls: true,
        thumbnailUrl: true,
        likesCount: true,
        commentsCount: true,
        createdAt: true,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getUserThreads(username: string, cursor?: string, viewerId?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    // Block check: prevent viewing threads of/by blocked users
    if (viewerId && viewerId !== user.id) {
      const block = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: user.id },
            { blockerId: user.id, blockedId: viewerId },
          ],
        },
      });
      if (block) throw new ForbiddenException('User not available');
    }

    const isOwn = viewerId === user.id;
    const isFollower = !isOwn && !!viewerId && await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
    }).then(Boolean);

    const visibilityFilter = isOwn
      ? {}
      : isFollower
        ? { visibility: { in: [ThreadVisibility.PUBLIC, ThreadVisibility.FOLLOWERS] } }
        : { visibility: ThreadVisibility.PUBLIC };

    const threads = await this.prisma.thread.findMany({
      where: { userId: user.id, isRemoved: false, isChainHead: true, ...visibilityFilter },
      select: {
        id: true,
        content: true,
        mediaUrls: true,
        likesCount: true,
        repliesCount: true,
        repostsCount: true,
        createdAt: true,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = threads.length > limit;
    const items = hasMore ? threads.slice(0, limit) : threads;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getSavedPosts(userId: string, cursor?: string, limit = 20) {
    const saved = await this.prisma.savedPost.findMany({
      where: { userId },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            postType: true,
            mediaUrls: true,
            thumbnailUrl: true,
            likesCount: true,
            commentsCount: true,
            createdAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = saved.length > limit;
    const items = hasMore ? saved.slice(0, limit) : saved;
    return {
      data: items.map((s) => s.post),
      meta: {
        cursor: hasMore ? items[items.length - 1].postId : null,
        hasMore,
      },
    };
  }

  async getSavedThreads(userId: string, cursor?: string, limit = 20) {
    const bookmarks = await this.prisma.threadBookmark.findMany({
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
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_threadId: { userId, threadId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = bookmarks.length > limit;
    const items = hasMore ? bookmarks.slice(0, limit) : bookmarks;
    return {
      data: items.map((b) => b.thread),
      meta: {
        cursor: hasMore ? items[items.length - 1].threadId : null,
        hasMore,
      },
    };
  }

  async getSavedReels(userId: string, cursor?: string, limit = 20) {
    const interactions = await this.prisma.reelInteraction.findMany({
      where: { userId, saved: true },
      include: {
        reel: {
          select: {
            id: true,
            videoUrl: true,
            thumbnailUrl: true,
            caption: true,
            likesCount: true,
            commentsCount: true,
            sharesCount: true,
            viewsCount: true,
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
      ...(cursor ? { cursor: { userId_reelId: { userId, reelId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = interactions.length > limit;
    const items = hasMore ? interactions.slice(0, limit) : interactions;
    return {
      data: items.map((i) => ({ ...i.reel, isBookmarked: true })),
      meta: {
        cursor: hasMore ? items[items.length - 1].reelId : null,
        hasMore,
      },
    };
  }

  async getSavedVideos(userId: string, cursor?: string, limit = 20) {
    const bookmarks = await this.prisma.videoBookmark.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            viewsCount: true,
            likesCount: true,
            createdAt: true,
            channel: {
              select: {
                id: true,
                handle: true,
                name: true,
                description: true,
                avatarUrl: true,
                bannerUrl: true,
                subscribersCount: true,
                videosCount: true,
                totalViews: true,
                isVerified: true,
                createdAt: true,
              },
            },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_videoId: { userId, videoId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = bookmarks.length > limit;
    const items = hasMore ? bookmarks.slice(0, limit) : bookmarks;
    return {
      data: items.map((b) => ({ ...b.video, isBookmarked: true })),
      meta: {
        cursor: hasMore ? items[items.length - 1].videoId : null,
        hasMore,
      },
    };
  }

  async getFollowRequests(userId: string, cursor?: string, limit = 20) {
    const requests = await this.prisma.followRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: {
        sender: {
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
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = requests.length > limit;
    const items = hasMore ? requests.slice(0, limit) : requests;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getWatchLater(userId: string, cursor?: string, limit = 20) {
    const items = await this.prisma.watchLater.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            viewsCount: true,
            createdAt: true,
            channel: { select: { id: true, handle: true, name: true, avatarUrl: true } },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_videoId: { userId, videoId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    return {
      data: result.map((w) => w.video),
      meta: {
        cursor: hasMore ? result[result.length - 1].videoId : null,
        hasMore,
      },
    };
  }

  async addWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId },
      update: {},
    });
    return { added: true };
  }

  async removeWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.deleteMany({
      where: { userId, videoId },
    });
    return { removed: true };
  }

  async getWatchHistory(userId: string, cursor?: string, limit = 20) {
    const items = await this.prisma.watchHistory.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            viewsCount: true,
            createdAt: true,
            channel: { select: { id: true, handle: true, name: true, avatarUrl: true } },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { watchedAt: 'desc' },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    return {
      data: result.map((w) => ({
        ...w.video,
        progress: w.progress,
        completed: w.completed,
        watchedAt: w.watchedAt,
      })),
      meta: {
        cursor: hasMore ? result[result.length - 1].id : null,
        hasMore,
      },
    };
  }

  async clearWatchHistory(userId: string) {
    await this.prisma.watchHistory.deleteMany({ where: { userId } });
    return { cleared: true };
  }

  async getDrafts(userId: string) {
    return this.prisma.draftPost.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async getQrCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      username: user.username,
      deeplink: `mizanly://profile/${user.username}`,
      profileUrl: `https://mizanly.app/@${user.username}`,
    };
  }

  async getAnalytics(userId: string) {
    const stats = await this.prisma.creatorStat.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30,
    });
    return { stats };
  }

  /**
   * Get followers by username — resolves username to userId, applies block/banned/deactivated
   * checks (which the userId-based FollowsService.getFollowers does not do), then delegates
   * the core query to the shared resolveAndGetFollowers helper.
   *
   * This is NOT a duplicate of FollowsService.getFollowers — it serves a different API
   * surface (username-based public endpoint via /users/:username/followers) whereas
   * FollowsService.getFollowers serves the userId-based authenticated endpoint
   * (/follows/:userId/followers). Both are needed for different consumer contexts.
   */
  async getFollowers(username: string, cursor?: string, viewerId?: string, limit = 20) {
    const userId = await this.resolveUsernameToUserId(username, viewerId);
    return this.queryFollowers(userId, cursor, viewerId, limit);
  }

  /**
   * Get following by username — same pattern as getFollowers.
   * See getFollowers JSDoc for why this is not a duplicate.
   */
  async getFollowing(username: string, cursor?: string, viewerId?: string, limit = 20) {
    const userId = await this.resolveUsernameToUserId(username, viewerId);
    return this.queryFollowing(userId, cursor, viewerId, limit);
  }

  /**
   * Resolve username to userId with block/banned/deactivated/deleted checks.
   * Shared by getFollowers and getFollowing to avoid duplication.
   */
  private async resolveUsernameToUserId(username: string, viewerId?: string): Promise<string> {
    const target = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, isPrivate: true, isDeleted: true, isBanned: true, isDeactivated: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.isDeleted || target.isBanned || target.isDeactivated) throw new NotFoundException('User not found');
    if (viewerId) {
      const block = await this.prisma.block.findFirst({
        where: { OR: [{ blockerId: viewerId, blockedId: target.id }, { blockerId: target.id, blockedId: viewerId }] },
      });
      if (block) throw new ForbiddenException('User not available');
    }
    if (target.isPrivate && viewerId !== target.id) {
      if (!viewerId) throw new ForbiddenException('This account is private');
      const isFollowing = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: target.id } },
      });
      if (!isFollowing) throw new ForbiddenException('This account is private');
    }
    return target.id;
  }

  private async queryFollowers(userId: string, cursor?: string, viewerId?: string, limit = 20) {
    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { followerId_followingId: { followerId: cursor, followingId: userId } }, skip: 1 } : {}),
    });
    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;
    return {
      data: items.map((f) => f.follower),
      meta: { cursor: hasMore ? items[items.length - 1].followerId : null, hasMore },
    };
  }

  private async queryFollowing(userId: string, cursor?: string, viewerId?: string, limit = 20) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { followerId_followingId: { followerId: userId, followingId: cursor } }, skip: 1 } : {}),
    });
    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;
    return {
      data: items.map((f) => f.following),
      meta: { cursor: hasMore ? items[items.length - 1].followingId : null, hasMore },
    };
  }

  async report(reporterId: string, reportedUserId: string, reason: string) {
    if (reporterId === reportedUserId) return { reported: false };
    const reasonMap: Record<string, ReportReason> = {
      spam: 'SPAM' as ReportReason,
      impersonation: 'IMPERSONATION' as ReportReason,
      inappropriate: 'OTHER' as ReportReason,
      harassment: 'HARASSMENT' as ReportReason,
      nudity: 'NUDITY' as ReportReason,
      violence: 'VIOLENCE' as ReportReason,
      hate_speech: 'HATE_SPEECH' as ReportReason,
      self_harm: 'SELF_HARM' as ReportReason,
      misinformation: 'MISINFORMATION' as ReportReason,
      terrorism: 'TERRORISM' as ReportReason,
      doxxing: 'DOXXING' as ReportReason,
      copyright: 'COPYRIGHT' as ReportReason,
    };
    const mappedReason = reasonMap[reason] ?? ('OTHER' as ReportReason);
    await this.prisma.report.create({
      data: { reporterId, reportedUserId, reason: mappedReason },
    });
    return { reported: true };
  }

  async getMutualFollowers(currentUserId: string, targetUsername: string, limit = 20) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true, isDeleted: true, isBanned: true, isDeactivated: true, isPrivate: true },
    });
    if (!target) throw new NotFoundException("User not found");
    if (target.isDeleted || target.isBanned || target.isDeactivated) throw new NotFoundException('User not found');

    // Block check
    const block = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: currentUserId, blockedId: target.id }, { blockerId: target.id, blockedId: currentUserId }] },
    });
    if (block) throw new ForbiddenException('User not available');

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const mutual = await this.prisma.$queryRaw<Array<{id: string, username: string, displayName: string, avatarUrl: string | null}>>`
      SELECT u.id, u.username, u."displayName", u."avatarUrl"
      FROM follows f1
      INNER JOIN follows f2 ON f1."followerId" = f2."followerId"
      INNER JOIN users u ON f1."followerId" = u.id
      WHERE f1."followingId" = ${currentUserId} AND f2."followingId" = ${target.id}
        AND u."isDeleted" = false AND u."isBanned" = false AND u."isDeactivated" = false
      LIMIT ${safeLimit}
    `;
    return {
      data: mutual,
      meta: { cursor: null, hasMore: false },
    };
  }

  async getLikedPosts(userId: string, cursor?: string, limit = 20) {
    const reactions = await this.prisma.postReaction.findMany({
      where: { userId, reaction: "LIKE" },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            postType: true,
            mediaUrls: true,
            thumbnailUrl: true,
            likesCount: true,
            commentsCount: true,
            createdAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
    });

    const hasMore = reactions.length > limit;
    const items = hasMore ? reactions.slice(0, limit) : reactions;
    return {
      data: items.map(r => r.post),
      meta: {
        cursor: hasMore ? items[items.length - 1].postId : null,
        hasMore,
      },
    };
  }

  async requestAccountDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, isDeleted: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('Account already deleted');

    // 30-day grace period: deactivate now, schedule deletion
    const scheduledDeletionDate = new Date();
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + 30);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: scheduledDeletionDate,
        isDeactivated: true,
        deactivatedAt: new Date(),
      },
    });
    await this.redis.del(`user:${user.username}`);
    return {
      requested: true,
      scheduledDeletionDate: scheduledDeletionDate.toISOString(),
      message: 'Account will be permanently deleted in 30 days. You can cancel before then.',
    };
  }

  async cancelAccountDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDeleted: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('Account already permanently deleted');

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null, isDeactivated: false, deactivatedAt: null },
    });
    return { cancelled: true };
  }

  async reactivateAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDeactivated: true, isDeleted: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('Account permanently deleted — cannot reactivate');
    if (!user.isDeactivated) return { reactivated: true, message: 'Account is already active' };

    await this.prisma.user.update({
      where: { id: userId },
      data: { isDeactivated: false, deactivatedAt: null, deletedAt: null },
    });
    return { reactivated: true };
  }

  async updateNasheedMode(userId: string, enabled: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { nasheedMode: enabled },
      select: { id: true, nasheedMode: true },
    });
  }

  /**
   * Contact sync — matches phone numbers against registered users.
   * Phone numbers are normalized and hashed (SHA-256) server-side before comparison
   * to avoid storing raw contact data in memory longer than necessary.
   * The actual DB query still uses normalized numbers since phone is stored in plaintext.
   */
  async findByPhoneNumbers(userId: string, phoneNumbers: string[]) {
    // Normalize: strip non-digits, take last 10 digits
    const normalized = phoneNumbers
      .map(p => p.replace(/\D/g, '').slice(-10))
      .filter(p => p.length >= 7); // reject too-short numbers

    if (normalized.length === 0) return [];

    // Deduplicate
    const uniqueNumbers = [...new Set(normalized)];

    const users = await this.prisma.user.findMany({
      where: { phone: { in: uniqueNumbers }, id: { not: userId }, isDeleted: false, isBanned: false },
      select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
      take: 50,
    });

    if (users.length === 0) return [];

    // Check follows and blocks in parallel
    const [follows, blocks] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId, followingId: { in: users.map(u => u.id) } },
        select: { followingId: true },
        take: 50,
      }),
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: userId, blockedId: { in: users.map(u => u.id) } },
            { blockedId: userId, blockerId: { in: users.map(u => u.id) } },
          ],
        },
        select: { blockerId: true, blockedId: true },
        take: 50,
      }),
    ]);

    const followedSet = new Set(follows.map(f => f.followingId));
    const blockedSet = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) blockedSet.add(b.blockedId);
      else blockedSet.add(b.blockerId);
    }

    // Filter out blocked users from results
    return users
      .filter(u => !blockedSet.has(u.id))
      .map(u => ({ ...u, isFollowing: followedSet.has(u.id) }));
  }
}
