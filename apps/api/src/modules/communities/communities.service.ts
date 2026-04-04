import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
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
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);

    // If slug is empty (all characters were stripped), generate a random one
    if (!slug) {
      slug = 'community-' + require('crypto').randomUUID().slice(0, 8);
    }

    return slug;
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

    let circle;
    try {
      circle = await this.prisma.circle.create({
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
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('Community with similar name already exists');
      }
      throw err;
    }

    return circle;
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
      take: 50,
    })
        .then((rows) => rows.map((r) => r.circleId));

      where.OR = [
        { privacy: CirclePrivacy.PUBLIC },
        { id: { in: memberCircleIds } },
      ];
    }
    where.isBanned = false;

    const circles = await this.prisma.circle.findMany({
      where,
      select: CIRCLE_SELECT,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = circles.length > limit;
    const data = hasMore ? circles.slice(0, limit) : circles;

    return {
      data,
      meta: {
        cursor: data.length > 0 ? data[data.length - 1].id : null,
        hasMore,
      },
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

    return circle;
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

    let updated;
    try {
      updated = await this.prisma.circle.update({
        where: { id },
        data: updateData,
        select: CIRCLE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A community with a similar name already exists');
      }
      throw error;
    }

    return updated;
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
    return null;
  }

  // Join community
  async join(id: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { privacy: true, isBanned: true },
    });
    if (!circle || circle.isBanned) {
      throw new NotFoundException('Community not found');
    }

    // Idempotent: if already a member, return gracefully
    const existing = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: id, userId } },
    });
    if (existing) {
      throw new ConflictException('Already a member');
    }

    // Handle privacy — both INVITE_ONLY and PRIVATE communities require invitation
    if (circle.privacy === CirclePrivacy.INVITE_ONLY || circle.privacy === CirclePrivacy.PRIVATE) {
      throw new ForbiddenException('This community is private — contact the owner or an admin to be invited');
    }

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

    return null;
  }

  // Leave community
  async leave(id: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { ownerId: true, isBanned: true },
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
      throw new ConflictException('Not a member');
    }

    await this.prisma.$transaction([
      this.prisma.circleMember.delete({
        where: { circleId_userId: { circleId: id, userId } },
      }),
      this.prisma.$executeRaw`UPDATE "Circle" SET "membersCount" = GREATEST("membersCount" - 1, 0) WHERE id = ${id}`,
    ]);

    return null;
  }

  // List community members
  async listMembers(id: string, viewerId?: string, cursor?: string, limit = 50) {
    // Verify community exists and viewer has access
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      select: { privacy: true, isBanned: true },
    });
    if (!circle || circle.isBanned) {
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
    // Fix #159: Composite cursor (joinedAt:userId) prevents duplicates when
    // multiple members share the same joinedAt timestamp.
    if (cursor) {
      const sepIdx = cursor.lastIndexOf(':');
      if (sepIdx > 0) {
        const cursorDate = new Date(cursor.substring(0, sepIdx));
        const cursorUserId = cursor.substring(sepIdx + 1);
        if (!isNaN(cursorDate.getTime())) {
          where.OR = [
            { joinedAt: { gt: cursorDate } },
            { joinedAt: cursorDate, userId: { gt: cursorUserId } },
          ];
        }
      }
    }

    const members = await this.prisma.circleMember.findMany({
      where,
      select: CIRCLE_MEMBER_SELECT,
      take: limit + 1,
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
    });

    const hasMore = members.length > limit;
    const data = members.slice(0, limit);
    const last = data[data.length - 1];
    const nextCursor = last ? `${last.joinedAt.toISOString()}:${last.userId}` : null;

    return {
      data,
      meta: {
        cursor: nextCursor,
        hasMore,
      },
    };
  }

  // ── Role Management ────────────────────────────────

  async createRole(communityId: string, userId: string, data: {
    name: string; color?: string;
    canSendMessages?: boolean; canPostMedia?: boolean; canInvite?: boolean;
    canKick?: boolean; canBan?: boolean; canManageRoles?: boolean;
    canManageChannels?: boolean; canSpeak?: boolean;
  }) {
    await this.requireAdmin(communityId, userId);
    const maxPosition = await this.prisma.communityRole.count({ where: { communityId } });
    return this.prisma.communityRole.create({
      data: { communityId, position: maxPosition, ...data },
    });
  }

  async updateRole(roleId: string, userId: string, data: {
    name?: string; color?: string;
    canSendMessages?: boolean; canPostMedia?: boolean; canInvite?: boolean;
    canKick?: boolean; canBan?: boolean; canManageRoles?: boolean;
    canManageChannels?: boolean; canSpeak?: boolean;
  }) {
    const role = await this.prisma.communityRole.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    await this.requireAdmin(role.communityId, userId);

    // Whitelist only allowed fields to prevent arbitrary field injection
    const allowed: Record<string, unknown> = {};
    if (data.name !== undefined) allowed.name = data.name;
    if (data.color !== undefined) allowed.color = data.color;
    if (data.canSendMessages !== undefined) allowed.canSendMessages = data.canSendMessages;
    if (data.canPostMedia !== undefined) allowed.canPostMedia = data.canPostMedia;
    if (data.canInvite !== undefined) allowed.canInvite = data.canInvite;
    if (data.canKick !== undefined) allowed.canKick = data.canKick;
    if (data.canBan !== undefined) allowed.canBan = data.canBan;
    if (data.canManageRoles !== undefined) allowed.canManageRoles = data.canManageRoles;
    if (data.canManageChannels !== undefined) allowed.canManageChannels = data.canManageChannels;
    if (data.canSpeak !== undefined) allowed.canSpeak = data.canSpeak;

    return this.prisma.communityRole.update({ where: { id: roleId }, data: allowed });
  }

  async deleteRole(roleId: string, userId: string) {
    const role = await this.prisma.communityRole.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    await this.requireAdmin(role.communityId, userId);
    return this.prisma.communityRole.delete({ where: { id: roleId } });
  }

  async listRoles(communityId: string) {
    return this.prisma.communityRole.findMany({
      where: { communityId },
      orderBy: { position: 'asc' },
      take: 50,
    });
  }

  private async requireAdmin(communityId: string, userId: string) {
    const community = await this.prisma.circle.findUnique({ where: { id: communityId } });
    if (!community) throw new NotFoundException('Community not found');

    // Owner always has permission
    if (community.ownerId === userId) return community;

    // Check if user has ADMIN role in the community
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: communityId, userId } },
      select: { role: true },
    });
    if (!membership || !['ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only the owner or admins can manage roles');
    }

    return community;
  }
}