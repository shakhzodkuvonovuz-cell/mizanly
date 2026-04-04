import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class AltProfileService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: { displayName: string; bio?: string; avatarUrl?: string }) {
    // Check if user already has an alt profile
    const existing = await this.prisma.altProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException('You already have a Flipside profile');
    }

    return this.prisma.altProfile.create({
      data: {
        userId,
        displayName: data.displayName,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  async update(userId: string, data: { displayName?: string; bio?: string; avatarUrl?: string }) {
    const profile = await this.prisma.altProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Flipside profile not found');

    return this.prisma.altProfile.update({
      where: { userId },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
    });
  }

  async delete(userId: string) {
    const profile = await this.prisma.altProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Flipside profile not found');

    await this.prisma.altProfile.delete({ where: { userId } });
    return { deleted: true };
  }

  async getOwn(userId: string) {
    const profile = await this.prisma.altProfile.findUnique({
      where: { userId },
      include: {
        access: {
          select: { userId: true, createdAt: true },
        },
      },
    });
    return profile;
  }

  async getForUser(targetUserId: string, viewerId: string) {
    const profile = await this.prisma.altProfile.findUnique({
      where: { userId: targetUserId },
    });
    if (!profile || !profile.isActive) return null;

    // Check if viewer has access
    if (targetUserId !== viewerId) {
      const access = await this.prisma.altProfileAccess.findUnique({
        where: {
          altProfileId_userId: {
            altProfileId: profile.id,
            userId: viewerId,
          },
        },
      });
      if (!access) {
        throw new ForbiddenException('You do not have access to this Flipside profile');
      }
    }

    return {
      id: profile.id,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      createdAt: profile.createdAt,
    };
  }

  async addAccess(userId: string, targetUserIds: string[]) {
    const profile = await this.prisma.altProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Flipside profile not found');

    if (targetUserIds.length > 100) {
      throw new BadRequestException('Cannot add more than 100 users at once');
    }

    // Batch: single createMany instead of N individual upserts
    const createResult = await this.prisma.altProfileAccess.createMany({
      data: targetUserIds.map(targetId => ({
        altProfileId: profile.id,
        userId: targetId,
      })),
      skipDuplicates: true,
    });

    // Determine which IDs were actually added vs already existed
    const existingAccess = await this.prisma.altProfileAccess.findMany({
      where: { altProfileId: profile.id, userId: { in: targetUserIds } },
      select: { userId: true },
    });
    const existingSet = new Set(existingAccess.map(a => a.userId));

    const results = targetUserIds.map(targetId => ({
      userId: targetId,
      added: existingSet.has(targetId),
    }));

    return results;
  }

  async removeAccess(userId: string, targetUserId: string) {
    const profile = await this.prisma.altProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Flipside profile not found');

    try {
      await this.prisma.altProfileAccess.delete({
        where: {
          altProfileId_userId: {
            altProfileId: profile.id,
            userId: targetUserId,
          },
        },
      });
    } catch {
      // Already removed — idempotent
    }

    return { removed: true };
  }

  async getAccessList(userId: string) {
    const profile = await this.prisma.altProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Flipside profile not found');

    const access = await this.prisma.altProfileAccess.findMany({
      where: { altProfileId: profile.id },
      include: {
        // We can't directly include user since there's no relation on AltProfileAccess to User
        // So we'll fetch users separately
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Fetch user details for access list
    const userIds = access.map(a => a.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
      take: 50,
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    return access.map(a => ({
      userId: a.userId,
      user: userMap.get(a.userId) || null,
      addedAt: a.createdAt,
    }));
  }

  async getAltPosts(userId: string, viewerId: string, cursor?: string) {
    // Verify access
    const profile = await this.prisma.altProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], meta: { cursor: null, hasMore: false } };

    if (userId !== viewerId) {
      const access = await this.prisma.altProfileAccess.findUnique({
        where: {
          altProfileId_userId: {
            altProfileId: profile.id,
            userId: viewerId,
          },
        },
      });
      if (!access) {
        throw new ForbiddenException('No access to Flipside posts');
      }
    }

    const limit = 20;
    const posts = await this.prisma.post.findMany({
      where: {
        userId,
        isAltProfile: true,
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        content: true,
        postType: true,
        mediaUrls: true,
        mediaTypes: true,
        likesCount: true,
        commentsCount: true,
        createdAt: true,
      },
    });

    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();

    return {
      data: posts,
      meta: { cursor: posts[posts.length - 1]?.id ?? null, hasMore },
    };
  }
}
