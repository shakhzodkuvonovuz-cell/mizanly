import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushTriggerService } from '../notifications/push-trigger.service';
import { Notification } from '@prisma/client';

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private pushTrigger: PushTriggerService,
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

    // Check block
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUserId },
        ],
      },
    });
    if (block) throw new ForbiddenException('Cannot follow this user');

    // Check already following
    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });
    if (existing) throw new ConflictException('Already following');

    if (target.isPrivate) {
      // Create follow request
      const existingRequest = await this.prisma.followRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: currentUserId,
            receiverId: targetUserId,
          },
        },
      });
      if (existingRequest) throw new ConflictException('Follow request already sent');

      const request = await this.prisma.followRequest.create({
        data: { senderId: currentUserId, receiverId: targetUserId },
      });
      // Notify target of incoming follow request
      this.notifications.create({
        userId: targetUserId, actorId: currentUserId,
        type: 'FOLLOW_REQUEST', followRequestId: request.id,
      })
        .then(notification => {
          if (notification) {
            this.pushTrigger.triggerPush(notification.id).catch(() => {});
          }
        })
        .catch((err) => this.logger.error('Failed to create notification', err));
      return { type: 'request', request };
    }

    // Direct follow
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
      .then(notification => {
        if (notification) {
          this.pushTrigger.triggerPush(notification.id).catch(() => {});
        }
      })
      .catch((err) => this.logger.error('Failed to create notification', err));

    return { type: 'follow', follow };
  }

  async unfollow(currentUserId: string, targetUserId: string) {
    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });
    if (!existing) throw new NotFoundException('Not following this user');

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

  async getFollowers(userId: string, cursor?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

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

  async getFollowing(userId: string, cursor?: string, limit = 20) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

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

  async getOwnRequests(userId: string) {
    return this.prisma.followRequest.findMany({
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
    });
  }

  async acceptRequest(currentUserId: string, requestId: string) {
    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.receiverId !== currentUserId) throw new ForbiddenException();
    if (request.status !== 'PENDING') throw new BadRequestException('Request already handled');

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
    // Notify requester that their request was accepted
    this.notifications.create({
      userId: request.senderId, actorId: request.receiverId,
      type: 'FOLLOW_REQUEST_ACCEPTED',
    })
      .then(notification => {
        if (notification) {
          this.pushTrigger.triggerPush(notification.id).catch(() => {});
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
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
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
