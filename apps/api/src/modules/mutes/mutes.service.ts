import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MutesService {
  constructor(private prisma: PrismaService) {}

  async mute(userId: string, mutedId: string) {
    if (userId === mutedId) {
      throw new BadRequestException('Cannot mute yourself');
    }

    // Verify target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: mutedId },
      select: { id: true },
    });
    if (!targetUser) throw new NotFoundException('User not found');

    // Use create + P2002 handling for race-condition-safe idempotency
    try {
      await this.prisma.mute.create({ data: { userId, mutedId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Already muted');
      }
      throw error;
    }
    return { message: 'User muted' };
  }

  async unmute(userId: string, mutedId: string) {
    const deleted = await this.prisma.mute.deleteMany({
      where: { userId, mutedId },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Mute not found');
    }

    return { message: 'User unmuted' };
  }

  async getMutedList(userId: string, cursor?: string, limit = 20) {
    const mutes = await this.prisma.mute.findMany({
      where: { userId },
      include: {
        muted: {
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
            cursor: { userId_mutedId: { userId, mutedId: cursor } },
            skip: 1,
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = mutes.length > limit;
    const items = hasMore ? mutes.slice(0, limit) : mutes;
    return {
      data: items.map((m) => m.muted),
      meta: {
        cursor: hasMore ? items[items.length - 1].mutedId : null,
        hasMore,
      },
    };
  }
}
