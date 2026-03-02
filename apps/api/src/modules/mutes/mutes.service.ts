import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class MutesService {
  constructor(private prisma: PrismaService) {}

  async mute(userId: string, mutedId: string) {
    if (userId === mutedId) {
      throw new BadRequestException('Cannot mute yourself');
    }

    const existing = await this.prisma.mute.findUnique({
      where: { userId_mutedId: { userId, mutedId } },
    });
    if (existing) throw new ConflictException('Already muted');

    await this.prisma.mute.create({ data: { userId, mutedId } });
    return { message: 'User muted' };
  }

  async unmute(userId: string, mutedId: string) {
    const existing = await this.prisma.mute.findUnique({
      where: { userId_mutedId: { userId, mutedId } },
    });
    if (!existing) throw new NotFoundException('Mute not found');

    await this.prisma.mute.delete({
      where: { userId_mutedId: { userId, mutedId } },
    });
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
