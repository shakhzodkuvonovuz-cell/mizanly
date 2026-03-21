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

    return {
      data: users,
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
}
