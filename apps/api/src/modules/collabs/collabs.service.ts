import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CollabStatus, Prisma } from '@prisma/client';

@Injectable()
export class CollabsService {
  constructor(private prisma: PrismaService) {}

  async invite(userId: string, postId: string, targetUserId: string) {
    if (userId === targetUserId) throw new BadRequestException('Cannot invite yourself');

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException('Only post owner can invite collaborators');

    const existing = await this.prisma.postCollab.findUnique({
      where: { postId_userId: { postId, userId: targetUserId } },
    });
    if (existing) throw new ConflictException('User already invited');

    return this.prisma.postCollab.create({
      data: { postId, userId: targetUserId, status: CollabStatus.PENDING },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        post: { select: { id: true, content: true } },
      },
    });
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
    const post = await this.prisma.post.findUnique({ where: { id: collab.postId } });
    if (collab.userId !== userId && post?.userId !== userId) throw new ForbiddenException();

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
    });
  }

  async getPostCollabs(postId: string) {
    return this.prisma.postCollab.findMany({
      where: { postId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAcceptedCollabs(userId: string, cursor?: string, limit = 20) {
    const collabs = await this.prisma.postCollab.findMany({
      where: { userId, status: CollabStatus.ACCEPTED, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: {
        post: {
          select: { id: true, content: true, mediaUrls: true, createdAt: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = collabs.length > limit;
    if (hasMore) collabs.pop();
    return { data: collabs, meta: { cursor: collabs[collabs.length - 1]?.id ?? null, hasMore } };
  }

  private async getCollab(collabId: string) {
    const collab = await this.prisma.postCollab.findUnique({ where: { id: collabId } });
    if (!collab) throw new NotFoundException('Collab not found');
    return collab;
  }
}