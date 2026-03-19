import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class MosquesService {
  constructor(private readonly prisma: PrismaService) {}

  async findNearby(lat: number, lng: number, radiusKm: number = 15) {
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    return this.prisma.mosqueCommunity.findMany({
      where: {
        latitude: { gte: lat - latDelta, lte: lat + latDelta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      orderBy: { memberCount: 'desc' },
      take: 50,
    });
  }

  async create(userId: string, data: {
    name: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    madhab?: string;
    language?: string;
    phone?: string;
    website?: string;
    imageUrl?: string;
  }) {
    const mosque = await this.prisma.mosqueCommunity.create({
      data: { ...data, createdById: userId, memberCount: 1 },
    });

    // Auto-join the creator as admin
    await this.prisma.mosqueMembership.create({
      data: { mosqueId: mosque.id, userId, role: 'admin' },
    });

    return mosque;
  }

  async getById(mosqueId: string) {
    const mosque = await this.prisma.mosqueCommunity.findUnique({
      where: { id: mosqueId },
    });
    if (!mosque) throw new NotFoundException('Mosque not found');
    return mosque;
  }

  async join(userId: string, mosqueId: string) {
    const mosque = await this.prisma.mosqueCommunity.findUnique({ where: { id: mosqueId } });
    if (!mosque) throw new NotFoundException('Mosque not found');

    const existing = await this.prisma.mosqueMembership.findUnique({
      where: { mosqueId_userId: { mosqueId, userId } },
    });
    if (existing) throw new ConflictException('Already a member');

    await this.prisma.mosqueMembership.create({
      data: { mosqueId, userId, role: 'member' },
    });

    await this.prisma.mosqueCommunity.update({
      where: { id: mosqueId },
      data: { memberCount: { increment: 1 } },
    });

    return { joined: true };
  }

  async leave(userId: string, mosqueId: string) {
    try {
      await this.prisma.mosqueMembership.delete({
        where: { mosqueId_userId: { mosqueId, userId } },
      });
      await this.prisma.mosqueCommunity.update({
        where: { id: mosqueId },
        data: { memberCount: { decrement: 1 } },
      });
    } catch {
      // Not a member
    }
    return { left: true };
  }

  async getFeed(mosqueId: string, cursor?: string, limit: number = 20) {
    const posts = await this.prisma.mosquePost.findMany({
      where: {
        mosqueId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const hasMore = posts.length === limit;
    return {
      data: posts,
      meta: {
        hasMore,
        cursor: hasMore ? posts[posts.length - 1].createdAt.toISOString() : undefined,
      },
    };
  }

  async createPost(userId: string, mosqueId: string, content: string, mediaUrls?: string[]) {
    // Verify membership
    const membership = await this.prisma.mosqueMembership.findUnique({
      where: { mosqueId_userId: { mosqueId, userId } },
    });
    if (!membership) throw new ForbiddenException('Must be a member to post');

    return this.prisma.mosquePost.create({
      data: { mosqueId, userId, content, mediaUrls: mediaUrls ?? [] },
    });
  }

  async getMembers(mosqueId: string, cursor?: string, limit: number = 50) {
    const members = await this.prisma.mosqueMembership.findMany({
      where: {
        mosqueId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const hasMore = members.length === limit;
    return {
      data: members,
      meta: {
        hasMore,
        cursor: hasMore ? members[members.length - 1].createdAt.toISOString() : undefined,
      },
    };
  }

  async getMyMosques(userId: string) {
    const memberships = await this.prisma.mosqueMembership.findMany({
      where: { userId },
      include: { mosque: true },
      take: 50,
    });
    return memberships.map((m) => ({ ...m.mosque, role: m.role }));
  }
}
