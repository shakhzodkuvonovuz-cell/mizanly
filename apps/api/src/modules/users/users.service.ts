import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { ReportReason } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

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
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: PUBLIC_USER_FIELDS,
    });
    await this.redis.del(`user:${updated.username}`);
    return updated;
  }

  async deactivate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isDeactivated: true, deactivatedAt: new Date() },
    });
    return { message: 'Account deactivated' };
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
        },
      });
      if (!user) throw new NotFoundException('User not found');
      // Cache for 5 minutes
      await this.redis.setex(`user:${username}`, 300, JSON.stringify(user));
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

    const isOwn = viewerId === user.id;
    const isFollower = !isOwn && !!viewerId && await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
    }).then(Boolean);

    const visibilityFilter = isOwn
      ? {}
      : isFollower
        ? { visibility: { in: ['PUBLIC', 'FOLLOWERS'] } }
        : { visibility: 'PUBLIC' };

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

    const isOwn = viewerId === user.id;
    const isFollower = !isOwn && !!viewerId && await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
    }).then(Boolean);

    const visibilityFilter = isOwn
      ? {}
      : isFollower
        ? { visibility: { in: ['PUBLIC', 'FOLLOWERS'] } }
        : { visibility: 'PUBLIC' };

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

  async getDrafts(userId: string) {
    return this.prisma.draftPost.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
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

  async getFollowers(username: string, cursor?: string, limit = 20) {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    const userId = target.id;
    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
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
      orderBy: { createdAt: 'desc' },
      ...(cursor
        ? {
            cursor: {
              followerId_followingId: {
                followerId: cursor,
                followingId: userId,
              },
            },
            skip: 1,
          }
        : {}),
    });

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;
    return {
      data: items.map((f) => f.follower),
      meta: {
        cursor: hasMore ? items[items.length - 1].followerId : null,
        hasMore,
      },
    };
  }

  async getFollowing(username: string, cursor?: string, limit = 20) {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    const userId = target.id;
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
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
      orderBy: { createdAt: 'desc' },
      ...(cursor
        ? {
            cursor: {
              followerId_followingId: {
                followerId: userId,
                followingId: cursor,
              },
            },
            skip: 1,
          }
        : {}),
    });

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;
    return {
      data: items.map((f) => f.following),
      meta: {
        cursor: hasMore ? items[items.length - 1].followingId : null,
        hasMore,
      },
    };
  }

  async report(reporterId: string, reportedUserId: string, reason: string) {
    if (reporterId === reportedUserId) return { reported: false };
    const reasonMap: Record<string, string> = {
      spam: 'SPAM',
      impersonation: 'HARASSMENT',
      inappropriate: 'NUDITY',
    };
    const mappedReason = (reasonMap[reason] ?? 'SPAM') as ReportReason;
    await this.prisma.report.create({
      data: { reporterId, reportedUserId, reason: mappedReason },
    }).catch((err) => this.logger.error('Failed to save report', err));
    return { reported: true };
  }
}
