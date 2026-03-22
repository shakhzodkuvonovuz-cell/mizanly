import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class RestrictsService {
  constructor(private readonly prisma: PrismaService) {}

  async restrict(restricterId: string, restrictedId: string) {
    if (restricterId === restrictedId) {
      throw new BadRequestException('Cannot restrict yourself');
    }

    // Verify target user exists
    const targetUser = await this.prisma.user.findUnique({ where: { id: restrictedId } });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Idempotent — return success if already restricted
    try {
      await this.prisma.restrict.create({
        data: { restricterId, restrictedId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { message: 'User restricted' };
      }
      throw error;
    }
    return { message: 'User restricted' };
  }

  async unrestrict(restricterId: string, restrictedId: string) {
    // Idempotent — return success even if not restricted
    await this.prisma.restrict.deleteMany({
      where: { restricterId, restrictedId },
    });
    return { message: 'User unrestricted' };
  }

  async getRestrictedList(userId: string, cursor?: string, limit = 20) {
    const restricts = await this.prisma.restrict.findMany({
      where: { restricterId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: {
              restricterId_restrictedId: {
                restricterId: userId,
                restrictedId: cursor,
              },
            },
            skip: 1,
          }
        : {}),
    });

    const hasMore = restricts.length > limit;
    if (hasMore) restricts.pop();

    const userIds = restricts.map((r) => r.restrictedId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
      take: 50,
    });

    // Preserve chronological order from restrict records (findMany doesn't guarantee order)
    const userMap = new Map(users.map((u) => [u.id, u]));
    const orderedUsers = userIds
      .map((id) => userMap.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u);

    return {
      data: orderedUsers,
      meta: {
        hasMore,
        cursor: restricts[restricts.length - 1]?.restrictedId,
      },
    };
  }

  async isRestricted(
    restricterId: string,
    restrictedId: string,
  ): Promise<boolean> {
    const restrict = await this.prisma.restrict.findUnique({
      where: {
        restricterId_restrictedId: { restricterId, restrictedId },
      },
    });
    return !!restrict;
  }

  /**
   * Get all user IDs that the given user has restricted.
   * Used by feed/story/comment services to filter restricted users' content.
   */
  async getRestrictedIds(userId: string): Promise<string[]> {
    const restricts = await this.prisma.restrict.findMany({
      where: { restricterId: userId },
      select: { restrictedId: true },
      take: 50,
    });
    return restricts.map((r) => r.restrictedId);
  }
}
