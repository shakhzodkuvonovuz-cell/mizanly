import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
    });
  }

  async create(userId: string, name: string, memberIds?: string[]) {
    const slug = generateSlug(name);
    const extraMemberIds = (memberIds ?? []).filter(id => id !== userId);
    const totalMembers = 1 + extraMemberIds.length;

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
      // P2002: slug collision (extremely rare with random suffix) — retry with new slug
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const retrySlug = generateSlug(name);
        return this.prisma.circle.create({
          data: {
            ownerId: userId,
            name,
            slug: retrySlug,
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
      }
      throw err;
    }
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

    const result = await this.prisma.circleMember.createMany({
      data: memberIds.map(id => ({ circleId, userId: id })),
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

  async getMembers(circleId: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can view members');
    return this.prisma.circleMember.findMany({
      where: { circleId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
  }
}
