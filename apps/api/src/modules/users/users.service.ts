import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../config/prisma.service';
import { PrivacyService } from '../privacy/privacy.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NOTIFICATION_REQUESTED, NotificationRequestedEvent } from '../../common/events/notification.events';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { acquireCronLock } from '../../common/utils/cron-lock';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PostVisibility, ThreadVisibility, ReportReason } from '@prisma/client';
import { sanitizeText } from '@/common/utils/sanitize';
import { PublishWorkflowService } from '@/common/services/publish-workflow.service';
import { QueueService } from '@/common/queue/queue.service';
import { ContentSafetyService } from '../moderation/content-safety.service';

// A01-#7 / B01-#7: Remove sensitive/moderation fields from public select.
// lastSeenAt is a privacy concern (shows exact activity time).
// isDeleted/isBanned/isDeactivated are moderation internals (checked in code, not exposed to client).
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

// Internal fields needed for status checks but NOT sent to clients
const INTERNAL_STATUS_FIELDS = {
  isDeleted: true,
  isBanned: true,
  isDeactivated: true,
  lastSeenAt: true,
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
    private privacyService: PrivacyService,
    @Inject('REDIS') private redis: Redis,
    private readonly eventEmitter: EventEmitter2,
    private publishWorkflow: PublishWorkflowService,
    private queueService: QueueService,
    private contentSafety: ContentSafetyService,
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
        referralCode: true,
        profileLinks: { orderBy: { position: 'asc' } },
        settings: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // X08-#13 FIX: Moderate publicly visible text fields before persisting
    const textsToModerate = [dto.bio, dto.displayName, dto.location].filter(Boolean) as string[];
    for (const text of textsToModerate) {
      const result = await this.contentSafety.moderateText(text);
      if (!result.safe) {
        throw new BadRequestException(
          result.suggestion
            ? `Content flagged: ${result.flags.join(', ')}. Suggestion: ${result.suggestion}`
            : `Content flagged: ${result.flags.join(', ')}`,
        );
      }
    }

    // A01-#14: Explicitly destructure allowed fields instead of spreading entire DTO
    const { username, displayName, bio, avatarUrl, coverUrl, website, location,
      pronouns, statusText, creatorCategory, language, theme, isPrivate, madhab } = dto;
    const sanitizedData: Record<string, unknown> = {
      ...(displayName !== undefined ? { displayName: sanitizeText(displayName) } : {}),
      ...(bio !== undefined ? { bio: sanitizeText(bio) } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(coverUrl !== undefined ? { coverUrl } : {}),
      ...(website !== undefined ? { website: sanitizeText(website) } : {}),
      ...(location !== undefined ? { location: sanitizeText(location) } : {}),
      ...(pronouns !== undefined ? { pronouns } : {}),
      ...(statusText !== undefined ? { statusText } : {}),
      ...(creatorCategory !== undefined ? { creatorCategory } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(theme !== undefined ? { theme } : {}),
      ...(isPrivate !== undefined ? { isPrivate } : {}),
      ...(madhab !== undefined ? { madhab } : {}),
      ...(username !== undefined ? { username } : {}),
    };

    // Handle username change: save old username for redirect lookup
    let oldUsername: string | null = null;
    if (sanitizedData.username) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (!currentUser) throw new NotFoundException('User not found');

      const newUsername = (sanitizedData.username as string).toLowerCase();

      if (newUsername !== currentUser.username) {
        // Check if new username is already taken
        const existing = await this.prisma.user.findUnique({
          where: { username: newUsername },
          select: { id: true },
        });
        if (existing) throw new ConflictException('Username already taken');

        // Store old username for redirect, then apply new one
        oldUsername = currentUser.username;
        sanitizedData.previousUsername = currentUser.username;
        sanitizedData.username = newUsername;
      } else {
        // Same username, no change needed — remove from update data
        delete sanitizedData.username;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: sanitizedData,
      select: PUBLIC_USER_FIELDS,
    });

    // Invalidate cache for both old and new usernames
    if (oldUsername) {
      await this.redis.del(`user:${oldUsername}`);
    }
    await this.redis.del(`user:${updated.username}`);

    // Re-index user in search after profile update
    this.publishWorkflow.onPublish({
      contentType: 'user',
      contentId: userId,
      userId,
      indexDocument: {
        id: userId,
        username: updated.username,
        displayName: updated.displayName,
        bio: updated.bio,
      },
    }).catch(err => this.logger.warn('Publish workflow failed for user profile update', err instanceof Error ? err.message : err));

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
    // Delegate to PrivacyService which covers 34+ data categories (GDPR Article 20)
    return this.privacyService.exportUserData(userId);
  }

  /**
   * Permanently delete user account — delegates to the single comprehensive
   * deletion function in PrivacyService.deleteAllUserData().
   */
  async deleteAccount(userId: string) {
    return this.privacyService.deleteAllUserData(userId);
  }

  async getProfile(username: string, currentUserId?: string) {
    // Try cache first
    const cached = await this.redis.get(`user:${username}`);
    let user;
    let redirectedFromPreviousUsername = false;
    if (cached) {
      user = JSON.parse(cached);
    } else {
      user = await this.prisma.user.findUnique({
        where: { username },
        select: {
          ...PUBLIC_USER_FIELDS,
          ...INTERNAL_STATUS_FIELDS,
          profileLinks: { orderBy: { position: 'asc' } },
          channel: { select: CHANNEL_SELECT },
        },
      });

      // Username not found — check if someone had this as their previous username (redirect)
      if (!user) {
        const redirectUser = await this.prisma.user.findFirst({
          where: { previousUsername: username },
          select: {
            ...PUBLIC_USER_FIELDS,
            ...INTERNAL_STATUS_FIELDS,
            profileLinks: { orderBy: { position: 'asc' } },
            channel: { select: CHANNEL_SELECT },
          },
        });
        if (redirectUser) {
          user = redirectUser;
          redirectedFromPreviousUsername = true;
        }
      }

      if (!user) throw new NotFoundException('User not found');
      // Cache for 5 minutes (cache under the looked-up username)
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
    let isFollowedBy = false;
    let followRequestPending = false;
    if (currentUserId && currentUserId !== user.id) {
      const [follow, reverseFollow] = await Promise.all([
        this.prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
        }),
        this.prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: user.id, followingId: currentUserId } },
        }),
      ]);
      isFollowing = !!follow;
      isFollowedBy = !!reverseFollow;

      if (!isFollowing && user.isPrivate) {
        const req = await this.prisma.followRequest.findUnique({
          where: { senderId_receiverId: { senderId: currentUserId, receiverId: user.id } },
        });
        followRequestPending = req?.status === 'PENDING';
      }
    }

    return {
      ...user,
      isFollowing,
      isFollowedBy,
      followRequestPending,
      ...(redirectedFromPreviousUsername ? { redirectedFrom: username } : {}),
    };
  }

  async getUserPosts(username: string, cursor?: string, viewerId?: string, limit = 20) {
    // B01-#1/#21: Use select + check banned/deactivated/deleted status
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, isDeleted: true, isBanned: true, isDeactivated: true, isPrivate: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted || user.isBanned || user.isDeactivated) throw new NotFoundException('User not found');

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

    // Owner sees ALL posts (including future-scheduled); others only see published
    const scheduledFilter = isOwn ? {} : { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] };
    const posts = await this.prisma.post.findMany({
      where: { userId: user.id, isRemoved: false, ...scheduledFilter, ...visibilityFilter },
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
    // B01-#2/#21: Use select + check banned/deactivated/deleted status
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, isDeleted: true, isBanned: true, isDeactivated: true, isPrivate: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted || user.isBanned || user.isDeactivated) throw new NotFoundException('User not found');

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

    // Owner sees ALL threads (including future-scheduled); others only see published
    const threadScheduledFilter = isOwn ? {} : { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] };
    const threads = await this.prisma.thread.findMany({
      where: { userId: user.id, isRemoved: false, isChainHead: true, ...threadScheduledFilter, ...visibilityFilter },
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
      where: { userId, post: { isRemoved: false } },
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
      where: { userId, thread: { isRemoved: false } },
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
      where: { userId, saved: true, reel: { isRemoved: false } },
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
      where: { userId, video: { isRemoved: false } },
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
      where: { userId, video: { isRemoved: false } },
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
      where: { userId, video: { isRemoved: false } },
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
   * Finding #250: Daily follower count snapshot for growth charts.
   * Runs at 2 AM, snapshots follower counts for all users with >0 followers.
   */
  @Cron('0 2 * * *')
  async snapshotFollowerCounts() {
    try {
      if (!await acquireCronLock(this.redis, 'cron:snapshotFollowerCounts', 3500, this.logger)) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // B01-#9/#10: Add isDeactivated filter, use cursor pagination instead of take cap
      let cursor: string | undefined;
      let totalCreated = 0;
      const FETCH_BATCH = 1000;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const users = await this.prisma.user.findMany({
          where: { followersCount: { gt: 0 }, isDeleted: false, isBanned: false, isDeactivated: false },
          select: { id: true, followersCount: true },
          take: FETCH_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: 'asc' },
        });
        if (users.length === 0) break;
        cursor = users[users.length - 1].id;

        // Process in parallel batches of 100 instead of sequential
        const BATCH_SIZE = 100;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
          const batch = users.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(user =>
              this.prisma.creatorStat.upsert({
                where: { userId_date_space: { userId: user.id, date: today, space: 'SAF' } },
                update: { followers: user.followersCount },
                create: { userId: user.id, date: today, space: 'SAF', followers: user.followersCount },
              }),
            ),
          );
          totalCreated += results.filter(r => r.status === 'fulfilled').length;
        }

        if (users.length < FETCH_BATCH) break; // Last page
      }

      this.logger.log(`Follower snapshot: ${totalCreated} users snapshotted (cursor-paginated)`);
    } catch (error) {
      this.logger.error('snapshotFollowerCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
    }
  }

  /**
   * Finding #312: Weekly screen time report notification.
   * Runs every Sunday at 9 AM.
   */
  @Cron('0 9 * * 0')
  async sendWeeklyScreenTimeDigest() {
    try {
      // Dedup: prevent duplicate digests if cron restarts mid-execution
      // ISO 8601 week number — Jan 4 is always in week 1, Thursday defines the week's year.
      // This correctly handles year boundaries (e.g. Dec 31 can be W01 of next year).
      const now = new Date();
      const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      // Set to nearest Thursday: current date + 4 - current day (Mon=1, Sun=7)
      const dayNum = target.getUTCDay() || 7; // Convert Sunday=0 to 7
      target.setUTCDate(target.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      const weekId = `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      const dedupKey = `digest_sent:screen_time:${weekId}`;
      const alreadySent = await this.redis.set(dedupKey, '1', 'EX', 8 * 24 * 3600, 'NX');
      if (!alreadySent) {
        this.logger.log(`Screen time digest already sent for ${weekId} — skipping`);
        return;
      }

      const usersWithLimits = await this.prisma.userSettings.findMany({
        where: { dailyTimeLimit: { not: null } },
        select: { userId: true, dailyTimeLimit: true },
        take: 10000,
      });

      // Emit notification events — listener handles DB creation + push delivery
      let created = 0;
      for (const s of usersWithLimits) {
        try {
          this.eventEmitter.emit(NOTIFICATION_REQUESTED, new NotificationRequestedEvent({
            userId: s.userId,
            actorId: null,
            type: 'SYSTEM',
            title: 'Weekly Screen Time Summary',
            body: `Your daily limit is ${s.dailyTimeLimit} minutes. Check your wellbeing settings for this week's usage.`,
          }));
          created++;
        } catch (err) {
          this.logger.warn('Screen time digest notification failed', err instanceof Error ? err.message : err);
        }
      }

      this.logger.log(`Weekly screen time digest sent to ${created} users`);
    } catch (error) {
      this.logger.error('sendWeeklyScreenTimeDigest cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
    }
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

  // B01-#18: Removed unused viewerId parameter (block/privacy checks done in resolveUsernameToUserId)
  private async queryFollowers(userId: string, cursor?: string, _viewerId?: string, limit = 20) {
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

  private async queryFollowing(userId: string, cursor?: string, _viewerId?: string, limit = 20) {
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

  /**
   * Finding #287: Request account verification.
   * Creates a verification request in the admin queue.
   */
  async requestVerification(userId: string, data: { category: string; reason: string; proofUrl?: string }) {
    // Check if already verified
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isVerified: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified) throw new ConflictException('Account is already verified');

    // Check for existing pending request
    const existing = await this.prisma.report.findFirst({
      where: { reporterId: userId, description: { contains: 'verification_request' }, status: 'PENDING' },
    });
    if (existing) throw new ConflictException('Verification request already pending');

    // Use report table to queue verification requests for admin review
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedUserId: userId,
        reason: 'OTHER',
        description: `[verification_request] Category: ${data.category}. Reason: ${data.reason}. Proof: ${data.proofUrl || 'none'}`,
        status: 'PENDING',
      },
    });
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
      // B01-#15: Filter out removed/moderated posts from liked list
      where: { userId, reaction: "LIKE", post: { isRemoved: false } },
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
        scheduledDeletionAt: scheduledDeletionDate, // When it WILL be deleted (future)
        // deletedAt stays null — only set when actually deleted
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
      data: { scheduledDeletionAt: null, deletedAt: null, isDeactivated: false, deactivatedAt: null },
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
      data: { isDeactivated: false, deactivatedAt: null, deletedAt: null, scheduledDeletionAt: null },
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
  async findByPhoneNumbers(userId: string, phoneHashes: string[]) {
    // Mobile sends SHA-256 hashes of phone numbers (privacy-preserving).
    // We hash stored phone numbers server-side and compare against client hashes.
    if (phoneHashes.length === 0) return [];

    const uniqueHashes = [...new Set(phoneHashes)];

    // Fetch all users with non-null phone (limited to reasonable set)
    const usersWithPhone = await this.prisma.user.findMany({
      where: { phone: { not: null }, id: { not: userId }, isDeleted: false, isBanned: false, isDeactivated: false },
      select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true, phone: true },
      take: 10000,
    });

    // Hash each user's phone server-side and match against client hashes
    const crypto = await import('crypto');
    const hashSet = new Set(uniqueHashes);
    const users = usersWithPhone.filter(u => {
      if (!u.phone) return false;
      const normalized = u.phone.replace(/\D/g, '');
      const hash = crypto.createHash('sha256').update(normalized).digest('hex');
      return hashSet.has(hash);
    }).map(({ phone: _phone, ...rest }) => rest); // strip phone from response

    if (users.length === 0) return [];

    // Check follows and blocks in parallel
    const matchedIds = users.map(u => u.id);
    const [follows, blocks] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId, followingId: { in: matchedIds } },
        select: { followingId: true },
        take: matchedIds.length, // Cap at matched contacts count (already bounded)
      }),
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: userId, blockedId: { in: matchedIds } },
            { blockedId: userId, blockerId: { in: matchedIds } },
          ],
        },
        select: { blockerId: true, blockedId: true },
        take: matchedIds.length * 2, // Both directions
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

  // Finding #273: Similar accounts — collaborative filtering based on shared followers
  async getSimilarAccounts(username: string, viewerId?: string, limit = 10) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Find users followed by people who also follow this user (collaborative filtering)
    // "People who follow X also follow Y"
    const followersOfUser = await this.prisma.follow.findMany({
      where: { followingId: user.id },
      select: { followerId: true },
      take: 100,
    });
    const followerIds = followersOfUser.map(f => f.followerId);

    if (followerIds.length === 0) {
      return { data: [] };
    }

    // Find who those followers also follow (excluding the user themselves)
    const alsoFollowed = await this.prisma.follow.groupBy({
      by: ['followingId'],
      where: {
        followerId: { in: followerIds },
        followingId: { not: user.id },
        following: { isPrivate: false, isDeactivated: false, isBanned: false, isDeleted: false },
      },
      _count: { followerId: true },
      orderBy: { _count: { followerId: 'desc' } },
      take: limit + 5, // fetch a few extra in case some are blocked
    });

    const similarUserIds = alsoFollowed.map(a => a.followingId);
    if (similarUserIds.length === 0) return { data: [] };

    const users = await this.prisma.user.findMany({
      where: { id: { in: similarUserIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        bio: true,
        followersCount: true,
      },
    });

    // Preserve the collaborative filtering order
    const userMap = new Map(users.map(u => [u.id, u]));
    let result = alsoFollowed
      .map(a => {
        const u = userMap.get(a.followingId);
        return u ? { ...u, sharedFollowers: a._count.followerId } : null;
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    // Filter out viewer (if authenticated) and blocked users
    if (viewerId) {
      const blocks = await this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: { in: result.map(u => u.id) } },
            { blockedId: viewerId, blockerId: { in: result.map(u => u.id) } },
          ],
        },
        select: { blockerId: true, blockedId: true },
        take: 50,
      });
      const blockedSet = new Set<string>();
      for (const b of blocks) {
        blockedSet.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
      }
      result = result.filter(u => u.id !== viewerId && !blockedSet.has(u.id));
    }

    return { data: result.slice(0, limit) };
  }

  // Finding #403: Popular with friends — posts liked by people you follow
  async getPopularWithFriends(userId: string, limit = 10) {
    // Get who the user follows
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
      take: 200,
    });
    const followingIds = follows.map(f => f.followingId);
    if (followingIds.length === 0) return { data: [] };

    // Find posts recently liked by followed users (last 48h)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentLikes = await this.prisma.postReaction.findMany({
      where: {
        userId: { in: followingIds },
        createdAt: { gte: twoDaysAgo },
        post: { isRemoved: false, visibility: 'PUBLIC' },
      },
      select: {
        postId: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Group by postId, count friend likes
    const postFriendLikes = new Map<string, { count: number; friends: Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }> }>();
    for (const like of recentLikes) {
      const existing = postFriendLikes.get(like.postId);
      if (existing) {
        existing.count++;
        if (existing.friends.length < 3) existing.friends.push(like.user);
      } else {
        postFriendLikes.set(like.postId, { count: 1, friends: [like.user] });
      }
    }

    // Sort by friend like count
    const topPostIds = [...postFriendLikes.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([id]) => id);

    if (topPostIds.length === 0) return { data: [] };

    const posts = await this.prisma.post.findMany({
      where: { id: { in: topPostIds } },
      select: {
        id: true,
        content: true,
        mediaUrls: true,
        likesCount: true,
        commentsCount: true,
        createdAt: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
    });

    const postMap = new Map(posts.map(p => [p.id, p]));
    const result = topPostIds
      .map(id => {
        const post = postMap.get(id);
        const friendData = postFriendLikes.get(id);
        if (!post || !friendData) return null;
        return {
          ...post,
          friendLikes: friendData.count,
          likedByFriends: friendData.friends,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return { data: result };
  }
}
