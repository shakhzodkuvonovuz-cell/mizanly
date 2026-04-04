import { Injectable, Inject, NotFoundException, ForbiddenException, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NOTIFICATION_REQUESTED, NotificationRequestedEvent } from '../../common/events/notification.events';
import { acquireCronLock } from '../../common/utils/cron-lock';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 50)
    + '-' + randomBytes(4).toString('hex');
}

@Injectable()
export class CirclesService {
  private readonly logger = new Logger(CirclesService.name);
  constructor(
    private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async getMyCircles(userId: string) {
    return this.prisma.circle.findMany({
      where: { ownerId: userId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  async create(userId: string, name: string, memberIds?: string[]) {
    // Enforce circle limit per user (max 50)
    const circleCount = await this.prisma.circle.count({ where: { ownerId: userId } });
    if (circleCount >= 50) {
      throw new BadRequestException('You can create a maximum of 50 circles');
    }

    const extraMemberIds = (memberIds ?? []).filter(id => id !== userId);
    const totalMembers = 1 + extraMemberIds.length;
    const MAX_SLUG_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      const slug = generateSlug(name);
      try {
        return await this.prisma.circle.create({
          data: {
            ownerId: userId,
            name,
            slug,
            membersCount: totalMembers,
            members: {
              create: [
                { userId },
                ...extraMemberIds.map(id => ({ userId: id })),
              ],
            },
          },
          include: { _count: { select: { members: true } } },
        });
      } catch (err) {
        // P2002: slug collision — retry with a new slug up to MAX_SLUG_RETRIES times
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          if (attempt === MAX_SLUG_RETRIES - 1) {
            throw new InternalServerErrorException('Failed to generate unique circle slug after multiple attempts');
          }
          continue;
        }
        throw err;
      }
    }

    // Unreachable, but satisfies TypeScript return type
    throw new InternalServerErrorException('Failed to create circle');
  }

  /** J08-#36: Lightweight ownership check — fetches only id + ownerId instead of full Circle */
  private async verifyCircleOwnership(circleId: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true, ownerId: true },
    });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can manage this circle');
    return circle;
  }

  async update(circleId: string, userId: string, name?: string) {
    // J08-#36: Use lightweight ownership check instead of fetching full Circle
    await this.verifyCircleOwnership(circleId, userId);
    return this.prisma.circle.update({ where: { id: circleId }, data: { ...(name && { name }) } });
  }

  async delete(circleId: string, userId: string) {
    // J08-#36: Use lightweight ownership check instead of fetching full Circle
    await this.verifyCircleOwnership(circleId, userId);
    return this.prisma.circle.delete({ where: { id: circleId } });
  }

  async addMembers(circleId: string, userId: string, memberIds: string[]) {
    // J08-#36: Select only needed fields (name needed for notification body)
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true, ownerId: true, name: true },
    });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can manage members');

    // Verify all requested users actually exist before adding
    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, isDeleted: false, isBanned: false },
      select: { id: true },
    });
    const existingIds = new Set(existingUsers.map(u => u.id));
    const validMemberIds = memberIds.filter(id => existingIds.has(id));
    if (validMemberIds.length === 0) {
      throw new BadRequestException('None of the specified users exist');
    }

    // Filter out any users who have a block relationship with the circle owner
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: validMemberIds } },
          { blockedId: userId, blockerId: { in: validMemberIds } },
        ],
      },
      select: { blockerId: true, blockedId: true },
      take: 50,
    });
    const blockedSet = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) blockedSet.add(b.blockedId);
      else blockedSet.add(b.blockerId);
    }
    const safeMemberIds = validMemberIds.filter((id) => !blockedSet.has(id));
    if (safeMemberIds.length === 0) return { added: 0 };

    const result = await this.prisma.circleMember.createMany({
      data: safeMemberIds.map(id => ({ circleId, userId: id })),
      skipDuplicates: true,
    });

    // Atomic increment by actual number of rows inserted
    if (result.count > 0) {
      await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = "membersCount" + ${result.count} WHERE id = ${circleId}`;

      // Notify each added member (fire-and-forget, capped at 50 to avoid spam)
      for (const memberId of safeMemberIds.slice(0, 50)) {
        this.eventEmitter.emit(NOTIFICATION_REQUESTED, new NotificationRequestedEvent({
          userId: memberId,
          actorId: userId,
          type: 'CIRCLE_INVITE',
          title: 'Added to circle',
          body: `You were added to "${circle.name}"`,
        }));
      }

      // Notify circle owner that members joined (fire-and-forget)
      // Each added member triggers a CIRCLE_JOIN notification to the owner
      for (const memberId of safeMemberIds.slice(0, 50)) {
        if (memberId !== userId) {
          this.eventEmitter.emit(NOTIFICATION_REQUESTED, new NotificationRequestedEvent({
            userId,
            actorId: memberId,
            type: 'CIRCLE_JOIN',
            circleId,
            title: circle.name,
            body: `A new member joined "${circle.name}"`,
          }));
        }
      }
    }

    return { added: result.count };
  }

  async removeMembers(circleId: string, userId: string, memberIds: string[]) {
    // J08-#36: Select name for notification body (lightweight query)
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true, ownerId: true, name: true },
    });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can manage members');

    // Prevent removing the owner
    const safeIds = memberIds.filter(id => id !== circle.ownerId);
    if (safeIds.length === 0) {
      return { removed: 0 };
    }

    const result = await this.prisma.circleMember.deleteMany({
      where: { circleId, userId: { in: safeIds } },
    });

    // Atomic decrement by actual number of rows deleted
    if (result.count > 0) {
      await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = GREATEST("membersCount" - ${result.count}, 1) WHERE id = ${circleId}`;

      // Notify each removed member (fire-and-forget, capped at 50)
      for (const memberId of safeIds.slice(0, 50)) {
        this.eventEmitter.emit(NOTIFICATION_REQUESTED, new NotificationRequestedEvent({
          userId: memberId,
          actorId: userId,
          type: 'SYSTEM',
          circleId,
          title: 'Removed from circle',
          body: `You were removed from "${circle.name}"`,
        }));
      }
    }

    return { removed: result.count };
  }

  async getMembers(circleId: string, userId: string, cursor?: string, limit = 20) {
    // J08-#36: Use lightweight ownership check instead of fetching full Circle
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true, ownerId: true },
    });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can view members');

    const members = await this.prisma.circleMember.findMany({
      where: { circleId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      take: limit + 1,
      orderBy: { joinedAt: 'asc' },
      ...(cursor ? { cursor: { circleId_userId: { circleId, userId: cursor } }, skip: 1 } : {}),
    });

    const hasMore = members.length > limit;
    const items = hasMore ? members.slice(0, limit) : members;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].userId : null,
        hasMore,
      },
    };
  }

  // ── Expired Circle Invite Cleanup ──
  @Cron('0 3 * * *') // Daily at 3:00 AM
  async cleanupExpiredCircleInvites(): Promise<number> {
    try {
      if (!await acquireCronLock(this.redis, 'cron:cleanupExpiredCircleInvites', 3500, this.logger)) return 0;
      const result = await this.prisma.circleInvite.deleteMany({
        where: {
          expiresAt: { not: null, lt: new Date() },
        },
      });
      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired circle invite(s)`);
      }
      return result.count;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to clean up expired circle invites: ${message}`, stack);
      return 0;
    }
  }
}
