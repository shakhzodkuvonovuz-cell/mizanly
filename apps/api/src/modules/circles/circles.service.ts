import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

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

  async create(userId: string, name: string, emoji?: string, memberIds?: string[]) {
    return this.prisma.circle.create({
      data: {
        ownerId: userId, name, emoji,
        members: memberIds?.length ? { create: memberIds.map(id => ({ userId: id })) } : undefined,
      },
      include: { _count: { select: { members: true } } },
    });
  }

  async update(circleId: string, userId: string, name?: string, emoji?: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException();
    if (circle.ownerId !== userId) throw new ForbiddenException();
    return this.prisma.circle.update({ where: { id: circleId }, data: { ...(name && { name }), ...(emoji && { emoji }) } });
  }

  async delete(circleId: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException();
    if (circle.ownerId !== userId) throw new ForbiddenException();
    return this.prisma.circle.delete({ where: { id: circleId } });
  }

  async addMembers(circleId: string, userId: string, memberIds: string[]) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle || circle.ownerId !== userId) throw new ForbiddenException();
    await this.prisma.circleMember.createMany({
      data: memberIds.map(id => ({ circleId, userId: id })),
      skipDuplicates: true,
    });
    return { added: memberIds.length };
  }

  async removeMembers(circleId: string, userId: string, memberIds: string[]) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle || circle.ownerId !== userId) throw new ForbiddenException();
    await this.prisma.circleMember.deleteMany({ where: { circleId, userId: { in: memberIds } } });
    return { removed: memberIds.length };
  }

  async getMembers(circleId: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle || circle.ownerId !== userId) throw new ForbiddenException();
    return this.prisma.circleMember.findMany({
      where: { circleId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
  }
}
