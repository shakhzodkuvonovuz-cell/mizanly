import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    // Validate target user exists
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true, username: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // Idempotent: if already blocked, return success
    const existing = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (existing) return { message: 'User blocked' };

    // Count follows being deleted to decrement counts accurately
    const deletedFollows = await this.prisma.follow.findMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
      select: { followerId: true, followingId: true },
      take: 50,
    });

    // blocker→blocked: blocker loses 1 following, blocked loses 1 follower
    const blockerWasFollowing = deletedFollows.some(
      (f) => f.followerId === blockerId && f.followingId === blockedId,
    );
    // blocked→blocker: blocked loses 1 following, blocker loses 1 follower
    const blockedWasFollowing = deletedFollows.some(
      (f) => f.followerId === blockedId && f.followingId === blockerId,
    );

    try {
      await this.prisma.$transaction([
        this.prisma.block.create({ data: { blockerId, blockedId } }),
        this.prisma.follow.deleteMany({
          where: {
            OR: [
              { followerId: blockerId, followingId: blockedId },
              { followerId: blockedId, followingId: blockerId },
            ],
          },
        }),
        this.prisma.followRequest.deleteMany({
          where: {
            OR: [
              { senderId: blockerId, receiverId: blockedId },
              { senderId: blockedId, receiverId: blockerId },
            ],
          },
        }),
        ...(blockerWasFollowing
          ? [
              this.prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = ${blockerId}`,
              this.prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE id = ${blockedId}`,
            ]
          : []),
        ...(blockedWasFollowing
          ? [
              this.prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = ${blockedId}`,
              this.prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE id = ${blockerId}`,
            ]
          : []),
      ]);
    } catch (err) {
      // P2002: concurrent block race condition — idempotent
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { message: 'User blocked' };
      }
      throw err;
    }

    // Invalidate profile cache for both users so blocked state is immediately visible
    if (target.username) {
      this.redis.del(`user:${target.username}`).catch(err => this.logger.warn('Failed to invalidate user cache', err instanceof Error ? err.message : err));
    }
    // Also invalidate blocker's profile cache (follower counts changed)
    const blocker = await this.prisma.user.findUnique({
      where: { id: blockerId },
      select: { username: true },
    });
    if (blocker?.username) {
      this.redis.del(`user:${blocker.username}`).catch(err => this.logger.warn('Failed to invalidate blocker cache', err instanceof Error ? err.message : err));
    }

    // Post-block cleanup (non-blocking): remove from circles + archive DM conversations
    this.cleanupAfterBlock(blockerId, blockedId).catch((err) =>
      this.logger.error(`Block cleanup failed for ${blockerId}->${blockedId}: ${err.message}`),
    );

    return { message: 'User blocked' };
  }

  /**
   * After a block: remove blocked user from blocker's circles,
   * and archive shared DM conversations for both parties.
   */
  private async cleanupAfterBlock(blockerId: string, blockedId: string): Promise<void> {
    // Remove blocked user from any circles owned by the blocker
    try {
      const blockerCircles = await this.prisma.circle.findMany({
        where: { ownerId: blockerId },
        select: { id: true },
        take: 50,
      });
      if (blockerCircles.length > 0) {
        const circleIds = blockerCircles.map((c) => c.id);
        const result = await this.prisma.circleMember.deleteMany({
          where: { circleId: { in: circleIds }, userId: blockedId },
        });
        // Decrement membersCount for affected circles
        if (result.count > 0) {
          for (const circleId of circleIds) {
            await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = GREATEST("membersCount" - 1, 1) WHERE id = ${circleId}`.catch(err => this.logger.warn('Failed to update circle member count', err instanceof Error ? err.message : err));
          }
        }
      }
    } catch (err) {
      this.logger.error(`Circle cleanup failed for block ${blockerId}->${blockedId}`, err instanceof Error ? err.message : err);
    }

    // Archive shared 1:1 DM conversations for both parties
    try {
      const sharedConversations = await this.prisma.conversation.findMany({
        where: {
          isGroup: false,
          AND: [
            { members: { some: { userId: blockerId } } },
            { members: { some: { userId: blockedId } } },
          ],
        },
        select: { id: true },
        take: 50,
      });
      if (sharedConversations.length > 0) {
        const convIds = sharedConversations.map((c) => c.id);
        await this.prisma.conversationMember.updateMany({
          where: {
            conversationId: { in: convIds },
            userId: { in: [blockerId, blockedId] },
          },
          data: { isArchived: true },
        });
      }
    } catch (err) {
      this.logger.error(`DM archive cleanup failed for block ${blockerId}->${blockedId}`, err instanceof Error ? err.message : err);
    }
  }

  async unblock(blockerId: string, blockedId: string) {
    // Idempotent: if not blocked, return success
    const existing = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (!existing) return { message: 'User unblocked' };

    await this.prisma.block.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    return { message: 'User unblocked' };
  }

  async getBlockedList(userId: string, cursor?: string, limit = 20) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { blockerId_blockedId: { blockerId: userId, blockedId: cursor } },
            skip: 1,
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = blocks.length > limit;
    const items = hasMore ? blocks.slice(0, limit) : blocks;
    return {
      data: items.map((b) => b.blocked),
      meta: {
        cursor: hasMore ? items[items.length - 1].blockedId : null,
        hasMore,
      },
    };
  }

  async isBlocked(userA: string, userB: string): Promise<boolean> {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA },
        ],
      },
    });
    return !!block;
  }

  async getBlockedIds(userId: string): Promise<string[]> {
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId },
          { blockedId: userId },
        ],
      },
      select: { blockerId: true, blockedId: true },
      take: 1000,
    });
    const ids = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId !== userId) ids.add(b.blockerId);
      if (b.blockedId !== userId) ids.add(b.blockedId);
    }
    return [...ids];
  }
}
