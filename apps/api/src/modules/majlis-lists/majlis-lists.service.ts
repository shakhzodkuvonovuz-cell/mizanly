import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { Prisma } from '@prisma/client';

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  isPrivate: true,
  membersCount: true,
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

@Injectable()
export class MajlisListsService {
  constructor(private prisma: PrismaService) {}

  async getLists(userId: string, cursor?: string, limit = 20) {
    const where: Prisma.MajlisListWhereInput = {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    };

    const lists = await this.prisma.majlisList.findMany({
      where,
      select: LIST_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = lists.length > limit;
    const data = hasMore ? lists.slice(0, limit) : lists;

    return {
      data: data.map(list => ({
        ...list,
        isPublic: !list.isPrivate,
      })),
      meta: {
        cursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  async createList(userId: string, dto: CreateListDto) {
    const { isPublic = true, ...rest } = dto;
    const list = await this.prisma.majlisList.create({
      data: {
        ...rest,
        isPrivate: !isPublic,
        ownerId: userId,
      },
      select: LIST_SELECT,
    });

    return {
      ...list,
      isPublic: !list.isPrivate,
    };
  }

  async getListById(userId: string | undefined, id: string) {
    const list = await this.prisma.majlisList.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        members: {
          select: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
              },
            },
            addedAt: true,
          },
          take: 10,
          orderBy: { addedAt: 'desc' },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    // Check access: if private, user must be owner or member
    if (list.isPrivate) {
      if (!userId) {
        throw new ForbiddenException('You do not have access to this private list');
      }
      if (list.owner.id !== userId) {
        const isMember = await this.prisma.majlisListMember.findFirst({
          where: { listId: id, userId },
        });
        if (!isMember) {
          throw new ForbiddenException('You do not have access to this private list');
        }
      }
    }

    return {
      ...list,
      isPublic: !list.isPrivate,
      members: list.members.map(m => ({
        ...m.user,
        addedAt: m.addedAt,
      })),
    };
  }

  async updateList(userId: string, id: string, dto: UpdateListDto) {
    const list = await this.prisma.majlisList.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.ownerId !== userId) {
      throw new ForbiddenException('Only the list owner can update');
    }

    const { isPublic, ...rest } = dto;
    const data: Prisma.MajlisListUpdateInput = { ...rest };
    if (isPublic !== undefined) {
      data.isPrivate = !isPublic;
    }

    const updated = await this.prisma.majlisList.update({
      where: { id },
      data,
      select: LIST_SELECT,
    });

    return {
      ...updated,
      isPublic: !updated.isPrivate,
    };
  }

  async deleteList(userId: string, id: string) {
    const list = await this.prisma.majlisList.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.ownerId !== userId) {
      throw new ForbiddenException('Only the list owner can delete');
    }

    await this.prisma.majlisList.delete({
      where: { id },
    });

    return;
  }

  async getMembers(userId: string | undefined, listId: string, cursor?: string, limit = 20) {
    // Verify list exists and check access
    const list = await this.prisma.majlisList.findUnique({
      where: { id: listId },
      select: { isPrivate: true, ownerId: true },
    });
    if (!list) {
      throw new NotFoundException('List not found');
    }

    // Check access: if private, user must be owner or member
    if (list.isPrivate) {
      if (!userId) {
        throw new ForbiddenException('You do not have access to this private list');
      }
      if (list.ownerId !== userId) {
        const isMember = await this.prisma.majlisListMember.findFirst({
          where: { listId, userId },
        });
        if (!isMember) {
          throw new ForbiddenException('You do not have access to this private list');
        }
      }
    }

    const members = await this.prisma.majlisListMember.findMany({
      where: { listId },
      select: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        addedAt: true,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { listId_userId: { listId, userId: cursor } }, skip: 1 } : {}),
      orderBy: { addedAt: 'desc' },
    });

    const hasMore = members.length > limit;
    const data = hasMore ? members.slice(0, limit) : members;

    return {
      data: data.map(m => ({
        ...m.user,
        addedAt: m.addedAt,
      })),
      meta: {
        cursor: hasMore ? data[data.length - 1].user.id : null,
        hasMore,
      },
    };
  }

  async addMember(userId: string, listId: string, dto: AddMemberDto) {
    const list = await this.prisma.majlisList.findUnique({
      where: { id: listId },
      select: { ownerId: true, isPrivate: true },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.ownerId !== userId) {
      throw new ForbiddenException('Only the list owner can add members');
    }

    // Check if user exists and is active
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, isBanned: true, isDeactivated: true, isDeleted: true },
    });
    if (!targetUser || targetUser.isBanned || targetUser.isDeactivated || targetUser.isDeleted) {
      throw new NotFoundException('User not found');
    }

    // Check if already a member
    const existing = await this.prisma.majlisListMember.findUnique({
      where: { listId_userId: { listId, userId: dto.userId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this list');
    }

    // Use transaction to add member and increment count
    const result = await this.prisma.$transaction([
      this.prisma.majlisListMember.create({
        data: { listId, userId: dto.userId },
      }),
      this.prisma.majlisList.update({
        where: { id: listId },
        data: { membersCount: { increment: 1 } },
      }),
    ]);

    return;
  }

  async removeMember(userId: string, listId: string, memberUserId: string) {
    const list = await this.prisma.majlisList.findUnique({
      where: { id: listId },
      select: { ownerId: true },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.ownerId !== userId) {
      throw new ForbiddenException('Only the list owner can remove members');
    }

    // Check if member exists
    const existing = await this.prisma.majlisListMember.findUnique({
      where: { listId_userId: { listId, userId: memberUserId } },
    });
    if (!existing) {
      throw new NotFoundException('User is not a member of this list');
    }

    // Use transaction to remove member and decrement count (with GREATEST to prevent negative)
    await this.prisma.$transaction([
      this.prisma.majlisListMember.delete({
        where: { listId_userId: { listId, userId: memberUserId } },
      }),
      this.prisma.$executeRaw`UPDATE "majlis_lists" SET "membersCount" = GREATEST("membersCount" - 1, 0) WHERE id = ${listId}`,
    ]);

    return;
  }

  async getTimeline(userId: string | undefined, listId: string, cursor?: string, limit = 20) {
    // Verify list exists and is public or user has access
    const list = await this.prisma.majlisList.findUnique({
      where: { id: listId },
      select: { isPrivate: true, ownerId: true, members: { select: { userId: true } } },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    // Check access: if private, user must be owner or member
    if (list.isPrivate) {
      if (!userId) {
        throw new ForbiddenException('You do not have access to this private list');
      }
      if (list.ownerId !== userId) {
        const isMember = list.members.some(m => m.userId === userId);
        if (!isMember) {
          throw new ForbiddenException('You do not have access to this private list');
        }
      }
    }

    const memberIds = list.members.map(m => m.userId);
    if (memberIds.length === 0) {
      return { data: [], meta: { cursor: null, hasMore: false } };
    }

    const threads = await this.prisma.thread.findMany({
      where: {
        userId: { in: memberIds },
        isChainHead: true,
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        visibility: { in: ['PUBLIC', 'FOLLOWERS'] },
        user: { isBanned: false, isDeactivated: false, isDeleted: false },
      },
      select: {
        id: true,
        content: true,
        hashtags: true,
        mentions: true,
        likesCount: true,
        repliesCount: true,
        repostsCount: true,
        quotesCount: true,
        bookmarksCount: true,
        viewsCount: true,
        isSensitive: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = threads.length > limit;
    const data = hasMore ? threads.slice(0, limit) : threads;

    return {
      data,
      meta: {
        cursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }
}