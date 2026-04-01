import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CollabStatus, Prisma } from '@prisma/client';

@Injectable()
export class CollabsService {
  constructor(private prisma: PrismaService) {}

  async invite(userId: string, postId: string, targetUserId: string) {
    if (userId === targetUserId) throw new BadRequestException('Cannot invite yourself');

    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, userId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException('Only post owner can invite collaborators');

    // Verify target user exists and is active
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isBanned: true, isDeactivated: true, isDeleted: true },
    });
    if (!targetUser || targetUser.isBanned || targetUser.isDeactivated || targetUser.isDeleted) {
      throw new NotFoundException('User not found');
    }

    // Check block relationships — cannot invite if either party has blocked the other
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: userId },
        ],
      },
    });
    if (blocked) throw new NotFoundException('User not found');

    // Use create + P2002 handling for race-condition-safe idempotency
    try {
      return await this.prisma.postCollab.create({
        data: { postId, userId: targetUserId, status: CollabStatus.PENDING },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          post: { select: { id: true, content: true } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User already invited');
      }
      throw error;
    }
  }

  async accept(collabId: string, userId: string) {
    const collab = await this.getCollab(collabId);
    if (collab.userId !== userId) throw new ForbiddenException();
    if (collab.status !== CollabStatus.PENDING) throw new BadRequestException('Not pending');

    return this.prisma.postCollab.update({
      where: { id: collabId },
      data: { status: CollabStatus.ACCEPTED },
    });
  }

  async decline(collabId: string, userId: string) {
    const collab = await this.getCollab(collabId);
    if (collab.userId !== userId) throw new ForbiddenException();

    return this.prisma.postCollab.update({
      where: { id: collabId },
      data: { status: CollabStatus.DECLINED },
    });
  }

  async remove(collabId: string, userId: string) {
    const collab = await this.getCollab(collabId);
    // Allow removal by the invited user OR the post owner
    if (collab.userId !== userId) {
      const post = await this.prisma.post.findUnique({ where: { id: collab.postId }, select: { id: true, userId: true } });
      if (!post || post.userId !== userId) {
        throw new ForbiddenException('Only the invited user or post owner can remove a collaboration');
      }
    }

    await this.prisma.postCollab.delete({ where: { id: collabId } });
    return { removed: true };
  }

  async getMyPending(userId: string) {
    return this.prisma.postCollab.findMany({
      where: { userId, status: CollabStatus.PENDING },
      include: {
        post: {
          select: { id: true, content: true, mediaUrls: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getPostCollabs(postId: string) {
    return this.prisma.postCollab.findMany({
      where: { postId, status: { in: [CollabStatus.ACCEPTED, CollabStatus.PENDING] } },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  async getAcceptedCollabs(userId: string, cursor?: string, limit = 20) {
    const collabs = await this.prisma.postCollab.findMany({
      where: { userId, status: CollabStatus.ACCEPTED },
      include: {
        post: {
          select: { id: true, content: true, mediaUrls: true, createdAt: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = collabs.length > limit;
    const items = hasMore ? collabs.slice(0, limit) : collabs;
    return { data: items, meta: { cursor: items[items.length - 1]?.id ?? null, hasMore } };
  }

  private async getCollab(collabId: string) {
    const collab = await this.prisma.postCollab.findUnique({
      where: { id: collabId },
      select: { id: true, userId: true, postId: true, status: true },
    });
    if (!collab) throw new NotFoundException('Collab not found');
    return collab;
  }
}