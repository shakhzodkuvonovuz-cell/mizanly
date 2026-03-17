import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class RestrictsService {
  constructor(private readonly prisma: PrismaService) {}

  async restrict(restricterId: string, restrictedId: string) {
    if (restricterId === restrictedId) {
      throw new BadRequestException('Cannot restrict yourself');
    }
    return this.prisma.restrict.create({
      data: { restricterId, restrictedId },
    });
  }

  async unrestrict(restricterId: string, restrictedId: string) {
    return this.prisma.restrict.delete({
      where: {
        restricterId_restrictedId: { restricterId, restrictedId },
      },
    });
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
