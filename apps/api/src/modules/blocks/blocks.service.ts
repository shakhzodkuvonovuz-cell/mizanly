import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class BlocksService {
  constructor(private prisma: PrismaService) {}

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    // Validate target user exists
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
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

    return { message: 'User blocked' };
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

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    return !!block;
  }
}
