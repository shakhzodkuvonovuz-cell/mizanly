import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma, CirclePrivacy } from '@prisma/client';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';

const CIRCLE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  avatarUrl: true,
  coverUrl: true,
  privacy: true,
  ownerId: true,
  membersCount: true,
  postsCount: true,
  rules: true,
  isBanned: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

const CIRCLE_MEMBER_SELECT = {
  circleId: true,
  userId: true,
  role: true,
  joinedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

@Injectable()
export class CommunitiesService {
  private readonly logger = new Logger(CommunitiesService.name);

  constructor(private prisma: PrismaService) {}

  // Helper: generate slug from name
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  // Helper: check if user is owner or admin/moderator
  private async checkUserPermission(circleId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
      select: { role: true },
    });
    return member?.role === 'OWNER' || member?.role === 'ADMIN' || member?.role === 'MODERATOR';
  }

  // Helper: check if user is owner
  private async isOwner(circleId: string, userId: string): Promise<boolean> {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      select: { ownerId: true },
    });
    return circle?.ownerId === userId;
  }

  // Create community
  async create(userId: string, dto: CreateCommunityDto) {
    const slug = this.generateSlug(dto.name);
    const existing = await this.prisma.circle.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException('Community with similar name already exists');
    }

    const privacy: CirclePrivacy = dto.isPrivate ? CirclePrivacy.PRIVATE : CirclePrivacy.PUBLIC;

    const circle = await this.prisma.circle.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        coverUrl: dto.coverUrl,
        rules: dto.rules,
        privacy,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      select: CIRCLE_SELECT,
    });

    return { data: circle, success: true, timestamp: new Date().toISOString() };
  }

  // List communities with optional auth
  async list(viewerId?: string, cursor?: string, limit = 20) {
    const where: Prisma.CircleWhereInput = {};
    if (!viewerId) {
      // Guest: only public communities
      where.privacy = CirclePrivacy.PUBLIC;
    } else {
      // Authenticated user: show public + private where member
      const memberCircleIds = await this.prisma.circleMember
        .findMany({
          where: { userId: viewerId },
          select: { circleId: true },
        })
        .then((rows) => rows.map((r) => r.circleId));

      where.OR = [
        { privacy: CirclePrivacy.PUBLIC },
        { id: { in: memberCircleIds } },
      ];
    }
    where.isBanned = false;

    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const circles = await this.prisma.circle.findMany({
      where,
      select: CIRCLE_SELECT,
      take: limit + 1, // fetch one extra to know if there's more
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = circles.length > limit;
    const data = circles.slice(0, limit);

    return {
      data,
      meta: {
        cursor: data.length > 0 ? data[data.length - 1].createdAt.toISOString() : null,
        hasMore,
      },
      success: true,
      timestamp: new Date().toISOString(),
    };
  }

  // Get community detail
  async getById(id: string, viewerId?: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: CIRCLE_SELECT,
    });

    if (!circle || circle.isBanned) {
      throw new NotFoundException('Community not found');
    }

    // Check privacy
    if (circle.privacy === CirclePrivacy.PRIVATE || circle.privacy === CirclePrivacy.INVITE_ONLY) {
      if (!viewerId) {
        throw new ForbiddenException('This community is private');
      }
      const isMember = await this.prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId: id, userId: viewerId } },
      });
      if (!isMember) {
        throw new ForbiddenException('This community is private');
      }
    }

    return { data: circle, success: true, timestamp: new Date().toISOString() };
  }

  // Update community
  async update(id: string, userId: string, dto: UpdateCommunityDto) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { ownerId: true, isBanned: true },
    });
    if (!circle || circle.isBanned) {
      throw new NotFoundException('Community not found');
    }
    if (circle.ownerId !== userId) {
      // Allow admins/moderators? We'll check permission
      const hasPermission = await this.checkUserPermission(id, userId);
      if (!hasPermission) {
        throw new ForbiddenException('Only owner or admins can update community');
      }
    }

    const updateData: Prisma.CircleUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      // Update slug if name changed
      updateData.slug = this.generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.coverUrl !== undefined) updateData.coverUrl = dto.coverUrl;
    if (dto.rules !== undefined) updateData.rules = dto.rules;
    if (dto.isPrivate !== undefined) {
      updateData.privacy = dto.isPrivate ? CirclePrivacy.PRIVATE : CirclePrivacy.PUBLIC;
    }

    const updated = await this.prisma.circle.update({
      where: { id },
      data: updateData,
      select: CIRCLE_SELECT,
    });

    return { data: updated, success: true, timestamp: new Date().toISOString() };
  }

  // Delete community
  async delete(id: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { ownerId: true, isBanned: true },
    });
    if (!circle) {
      throw new NotFoundException('Community not found');
    }
    if (circle.ownerId !== userId) {
      throw new ForbiddenException('Only owner can delete community');
    }

    await this.prisma.circle.delete({ where: { id } });
    return { data: null, success: true, timestamp: new Date().toISOString() };
  }

  // Join community
  async join(id: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { privacy: true },
    });
    if (!circle) {
      throw new NotFoundException('Community not found');
    }

    // Check if already member
    const existing = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: id, userId } },
    });
    if (existing) {
      throw new BadRequestException('Already a member');
    }

    // Handle privacy
    if (circle.privacy === CirclePrivacy.INVITE_ONLY) {
      throw new ForbiddenException('This community is invite-only');
    }
    // For private communities, maybe require approval? For now, allow join.
    // In future, create pending request.

    await this.prisma.$transaction([
      this.prisma.circleMember.create({
        data: {
          circleId: id,
          userId,
          role: 'MEMBER',
        },
      }),
      this.prisma.circle.update({
        where: { id },
        data: { membersCount: { increment: 1 } },
      }),
    ]);

    return { data: null, success: true, timestamp: new Date().toISOString() };
  }

  // Leave community
  async leave(id: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!circle) {
      throw new NotFoundException('Community not found');
    }
    if (circle.ownerId === userId) {
      throw new BadRequestException('Owner cannot leave community; transfer ownership first');
    }

    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: id, userId } },
    });
    if (!member) {
      throw new BadRequestException('Not a member');
    }

    await this.prisma.$transaction([
      this.prisma.circleMember.delete({
        where: { circleId_userId: { circleId: id, userId } },
      }),
      this.prisma.circle.update({
        where: { id },
        data: { membersCount: { decrement: 1 } },
      }),
    ]);

    return { data: null, success: true, timestamp: new Date().toISOString() };
  }

  // List community members
  async listMembers(id: string, viewerId?: string, cursor?: string, limit = 50) {
    // Verify community exists and viewer has access
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { privacy: true },
    });
    if (!circle) {
      throw new NotFoundException('Community not found');
    }

    // Privacy check
    if (circle.privacy === CirclePrivacy.PRIVATE || circle.privacy === CirclePrivacy.INVITE_ONLY) {
      if (!viewerId) {
        throw new ForbiddenException('This community is private');
      }
      const isMember = await this.prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId: id, userId: viewerId } },
      });
      if (!isMember) {
        throw new ForbiddenException('This community is private');
      }
    }

    const where: Prisma.CircleMemberWhereInput = { circleId: id };
    if (cursor) {
      where.joinedAt = { lt: new Date(cursor) };
    }

    const members = await this.prisma.circleMember.findMany({
      where,
      select: CIRCLE_MEMBER_SELECT,
      take: limit + 1,
      orderBy: { joinedAt: 'asc' },
    });

    const hasMore = members.length > limit;
    const data = members.slice(0, limit);

    return {
      data,
      meta: {
        cursor: data.length > 0 ? data[data.length - 1].joinedAt.toISOString() : null,
        hasMore,
      },
      success: true,
      timestamp: new Date().toISOString(),
    };
  }
}