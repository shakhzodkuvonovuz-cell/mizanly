import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 50)
    + '-' + Math.random().toString(36).slice(2, 7);
}

@Injectable()
export class CirclesService {
  constructor(private prisma: PrismaService) {}

  async getMyCircles(userId: string) {
    return this.prisma.circle.findMany({
      where: { ownerId: userId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  async create(userId: string, name: string, memberIds?: string[]) {
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

  async update(circleId: string, userId: string, name?: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can update');
    return this.prisma.circle.update({ where: { id: circleId }, data: { ...(name && { name }) } });
  }

  async delete(circleId: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can delete');
    return this.prisma.circle.delete({ where: { id: circleId } });
  }

  async addMembers(circleId: string, userId: string, memberIds: string[]) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can manage members');

    // Filter out any users who have a block relationship with the circle owner
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: memberIds } },
          { blockedId: userId, blockerId: { in: memberIds } },
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
    const safeMemberIds = memberIds.filter((id) => !blockedSet.has(id));
    if (safeMemberIds.length === 0) return { added: 0 };

    const result = await this.prisma.circleMember.createMany({
      data: safeMemberIds.map(id => ({ circleId, userId: id })),
      skipDuplicates: true,
    });

    // Atomic increment by actual number of rows inserted
    if (result.count > 0) {
      await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = "membersCount" + ${result.count} WHERE id = ${circleId}`;
    }

    return { added: result.count };
  }

  async removeMembers(circleId: string, userId: string, memberIds: string[]) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
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
    }

    return { removed: result.count };
  }

  async getMembers(circleId: string, userId: string, cursor?: string, limit = 20) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can view members');

    const members = await this.prisma.circleMember.findMany({
      where: { circleId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      take: limit + 1,
      orderBy: { createdAt: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = members.length > limit;
    const items = hasMore ? members.slice(0, limit) : members;
    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }
}
