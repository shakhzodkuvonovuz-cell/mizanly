import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushTriggerService } from '../notifications/push-trigger.service';
import { Prisma, Notification } from '@prisma/client';
import { QueueService } from '../../common/queue/queue.service';
import { AnalyticsService } from '../../common/services/analytics.service';

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private pushTrigger: PushTriggerService,
    private queueService: QueueService,
    private analytics: AnalyticsService,
  ) {}

  async follow(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isPrivate: true, isDeactivated: true, isBanned: true },
    });
    if (!target || target.isDeactivated || target.isBanned) {
      throw new NotFoundException('User not found');
    }

    // Check block in either direction
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUserId },
        ],
      },
    });
    if (block) throw new ForbiddenException('Cannot follow this user');

    // Check already following — return idempotent success
    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });
    if (existing) return { type: 'follow', follow: existing };

    if (target.isPrivate) {
      // Check for existing pending request — return idempotent success
      const existingRequest = await this.prisma.followRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: currentUserId,
            receiverId: targetUserId,
          },
        },
      });
      if (existingRequest) {
        if (existingRequest.status === 'PENDING') {
          return { type: 'request', request: existingRequest };
        }
        if (existingRequest.status === 'DECLINED') {
          throw new BadRequestException('Follow request was declined. Please wait before requesting again.');
        }
      }

      // Create follow request, handle P2002 race condition
      try {
        const request = await this.prisma.followRequest.create({
          data: { senderId: currentUserId, receiverId: targetUserId },
        });
        // Notify target of incoming follow request
        this.notifications.create({
          userId: targetUserId, actorId: currentUserId,
          type: 'FOLLOW_REQUEST', followRequestId: request.id,
        })
          .then((notification: Notification | null) => {
            if (notification) {
              this.queueService.addPushNotificationJob({ notificationId: notification.id });
            }
          })
          .catch((err) => this.logger.error('Failed to create notification', err));
        return { type: 'request', request };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const req = await this.prisma.followRequest.findUnique({
            where: { senderId_receiverId: { senderId: currentUserId, receiverId: targetUserId } },
          });
          return { type: 'request', request: req };
        }
        throw err;
      }
    }

    // Direct follow — handle P2002 race condition
    try {
      const [follow] = await this.prisma.$transaction([
        this.prisma.follow.create({
          data: { followerId: currentUserId, followingId: targetUserId },
        }),
        this.prisma.user.update({
          where: { id: currentUserId },
          data: { followingCount: { increment: 1 } },
        }),
        this.prisma.user.update({
          where: { id: targetUserId },
          data: { followersCount: { increment: 1 } },
        }),
      ]);
      // Notify target of new follower
      this.notifications.create({
        userId: targetUserId, actorId: currentUserId,
        type: 'FOLLOW',
      })
        .then((notification: Notification | null) => {
          if (notification) {
            this.queueService.addPushNotificationJob({ notificationId: notification.id });
          }
        })
        .catch((err) => this.logger.error('Failed to create notification', err));

      this.analytics.track('user_followed', currentUserId, { targetUserId });
      this.analytics.increment('follows:daily');
      return { type: 'follow', follow };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const follow = await this.prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: currentUserId, followingId: targetUserId } },
        });
        return { type: 'follow', follow };
      }
      throw err;
    }
  }

  async unfollow(currentUserId: string, targetUserId: string) {
    // Idempotent: if not following, just return success
    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });
    if (!existing) {
      // Also clean up any pending follow request (idempotent)
      await this.prisma.followRequest.deleteMany({
        where: { senderId: currentUserId, receiverId: targetUserId, status: 'PENDING' },
      });
      return { message: 'Unfollowed' };
    }

    await this.prisma.$transaction([
      this.prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = ${currentUserId}`,
      this.prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE id = ${targetUserId}`,
    ]);

    return { message: 'Unfollowed' };
  }

  async getFollowers(userId: string, cursor?: string, viewerId?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, isPrivate: true } });
    if (!user) throw new NotFoundException('User not found');
    // Private accounts: only the owner or their followers can see the followers list
    if (user.isPrivate && viewerId !== userId) {
      if (!viewerId) throw new ForbiddenException('This account is private');
      const isFollowing = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
      });
      if (!isFollowing) throw new ForbiddenException('This account is private');
    }

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

  async getFollowing(userId: string, cursor?: string, viewerId?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, isPrivate: true } });
    if (!user) throw new NotFoundException('User not found');
    // Private accounts: only the owner or their followers can see the following list
    if (user.isPrivate && viewerId !== userId) {
      if (!viewerId) throw new ForbiddenException('This account is private');
      const isFollowing = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
      });
      if (!isFollowing) throw new ForbiddenException('This account is private');
    }

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

  async getOwnRequests(userId: string, cursor?: string, limit = 20) {
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
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

  async acceptRequest(currentUserId: string, requestId: string) {
    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.receiverId !== currentUserId) throw new ForbiddenException();
    if (request.status !== 'PENDING') {
      // Idempotent: if already accepted, just return success
      if (request.status === 'ACCEPTED') return { message: 'Follow request accepted' };
      throw new BadRequestException('Request already handled');
    }

    // Check block — don't accept if a block now exists
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: request.senderId },
          { blockerId: request.senderId, blockedId: currentUserId },
        ],
      },
    });
    if (block) {
      await this.prisma.followRequest.update({
        where: { id: requestId },
        data: { status: 'DECLINED' },
      });
      throw new ForbiddenException('Cannot accept follow from this user');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.followRequest.update({
          where: { id: requestId },
          data: { status: 'ACCEPTED' },
        }),
        this.prisma.follow.create({
          data: { followerId: request.senderId, followingId: request.receiverId },
        }),
        this.prisma.user.update({
          where: { id: request.senderId },
          data: { followingCount: { increment: 1 } },
        }),
        this.prisma.user.update({
          where: { id: request.receiverId },
          data: { followersCount: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      // P2002: follow already exists (concurrent accept) — idempotent
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { message: 'Follow request accepted' };
      }
      throw err;
    }
    // Notify requester that their request was accepted
    this.notifications.create({
      userId: request.senderId, actorId: request.receiverId,
      type: 'FOLLOW_REQUEST_ACCEPTED',
    })
      .then((notification: Notification | null) => {
        if (notification) {
          this.queueService.addPushNotificationJob({ notificationId: notification.id });
        }
      })
      .catch((err) => this.logger.error('Failed to create notification', err));

    return { message: 'Follow request accepted' };
  }

  async declineRequest(currentUserId: string, requestId: string) {
    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.receiverId !== currentUserId) throw new ForbiddenException();

    await this.prisma.followRequest.update({
      where: { id: requestId },
      data: { status: 'DECLINED' },
    });
    return { message: 'Follow request declined' };
  }

  async cancelRequest(currentUserId: string, requestId: string) {
    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.senderId !== currentUserId) throw new ForbiddenException();

    await this.prisma.followRequest.delete({ where: { id: requestId } });
    return { message: 'Follow request cancelled' };
  }

  async getSuggestions(userId: string, limit = 20) {
    // Scan up to 200 followings for friends-of-friends suggestions (increased from 50)
    // to improve recommendation quality by widening the social graph scan radius
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
      take: 200,
    });
    const followingIds = following.map((f) => f.followingId);

    const suggestions = await this.prisma.user.findMany({
      where: {
        id: { notIn: [...followingIds, userId] },
        isDeactivated: false,
        isBanned: false,
        followers: { some: { followerId: { in: followingIds } } },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        followersCount: true,
      },
      take: limit,
      orderBy: { followersCount: 'desc' },
    });

    return suggestions;
  }

  /**
   * Remove a follower — lets a user kick someone from following them.
   * Unlike unfollow (I stop following you), this is "I remove you from my followers".
   */
  async removeFollower(currentUserId: string, followerUserId: string) {
    if (currentUserId === followerUserId) {
      throw new BadRequestException('Cannot remove yourself as a follower');
    }

    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: followerUserId,
          followingId: currentUserId,
        },
      },
    });
    if (!existing) return { message: 'Follower removed' }; // idempotent

    await this.prisma.$transaction([
      this.prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: followerUserId,
            followingId: currentUserId,
          },
        },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = ${followerUserId}`,
      this.prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE id = ${currentUserId}`,
    ]);

    return { message: 'Follower removed' };
  }

  /**
   * Check if one user follows another — single findUnique query, no N+1.
   * The compound @@id on Follow uses [followerId, followingId] so this
   * is an index-backed PK lookup, O(1) per call.
   */
  async checkFollowing(followerId: string, followingId: string) {
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });
    return { isFollowing: !!follow };
  }
}
