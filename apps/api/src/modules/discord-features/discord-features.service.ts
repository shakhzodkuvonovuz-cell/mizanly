import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import * as crypto from 'crypto';

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };

@Injectable()
export class DiscordFeaturesService {
  constructor(private prisma: PrismaService) {}

  // ── Forum Threads ───────────────────────────────────────

  async createForumThread(userId: string, circleId: string, dto: { title: string; content: string; tags?: string[] }) {
    // Verify user is a member of the circle
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!membership) throw new ForbiddenException('Must be a member of this community to create threads');
    return this.prisma.forumThread.create({
      data: { circleId, authorId: userId, title: dto.title, content: dto.content, tags: dto.tags || [] },
      include: { author: { select: USER_SELECT } },
    });
  }

  async getForumThreads(circleId: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { circleId };
    if (cursor) where.id = { lt: cursor };

    const threads = await this.prisma.forumThread.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { lastReplyAt: 'desc' }],
      take: limit + 1,
      include: { author: { select: USER_SELECT }, _count: { select: { replies: true } } },
    });

    const hasMore = threads.length > limit;
    if (hasMore) threads.pop();
    return { data: threads, meta: { cursor: threads[threads.length - 1]?.id || null, hasMore } };
  }

  async getForumThread(threadId: string) {
    const thread = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
      include: { author: { select: USER_SELECT } },
    });
    if (!thread) throw new NotFoundException();
    return thread;
  }

  async replyToForumThread(userId: string, threadId: string, content: string) {
    const thread = await this.prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException();
    if (thread.isLocked) throw new ForbiddenException('Thread is locked');

    const reply = await this.prisma.forumReply.create({
      data: { threadId, authorId: userId, content },
      include: { author: { select: USER_SELECT } },
    });

    await this.prisma.forumThread.update({
      where: { id: threadId },
      data: { replyCount: { increment: 1 }, lastReplyAt: new Date() },
    });

    return reply;
  }

  async getForumReplies(threadId: string, cursor?: string, limit = 50) {
    const where: Record<string, unknown> = { threadId };
    if (cursor) where.id = { gt: cursor }; // Ascending order for replies

    const replies = await this.prisma.forumReply.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      include: { author: { select: USER_SELECT } },
    });

    const hasMore = replies.length > limit;
    if (hasMore) replies.pop();
    return { data: replies, meta: { cursor: replies[replies.length - 1]?.id || null, hasMore } };
  }

  async lockForumThread(threadId: string, userId: string) {
    const thread = await this.prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.authorId !== userId) throw new ForbiddenException('Only the thread author can lock this thread');
    return this.prisma.forumThread.update({ where: { id: threadId }, data: { isLocked: true } });
  }

  async pinForumThread(threadId: string, userId: string) {
    const thread = await this.prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.authorId !== userId) throw new ForbiddenException('Only the thread author can pin this thread');
    return this.prisma.forumThread.update({
      where: { id: threadId },
      data: { isPinned: !thread.isPinned },
    });
  }

  // ── Webhooks ────────────────────────────────────────────

  async createWebhook(userId: string, circleId: string, dto: { name: string; avatarUrl?: string; targetChannelId?: string }) {
    // Verify user is a member of the circle
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!membership) throw new ForbiddenException('Must be a member to create webhooks');

    const count = await this.prisma.webhook.count({ where: { circleId } });
    if (count >= 15) throw new BadRequestException('Maximum 15 webhooks per community');

    return this.prisma.webhook.create({
      data: { circleId, createdById: userId, name: dto.name, avatarUrl: dto.avatarUrl, targetChannelId: dto.targetChannelId },
    });
  }

  async getWebhooks(circleId: string) {
    return this.prisma.webhook.findMany({
      where: { circleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async deleteWebhook(webhookId: string, userId: string) {
    // Allow deletion by creator OR community admin/owner
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException();

    if (webhook.createdById !== userId) {
      // Check if user is admin/owner of the community
      const membership = await this.prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId: webhook.circleId, userId } },
        select: { role: true },
      });
      if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
        throw new ForbiddenException('Only the creator or community admin can delete webhooks');
      }
    }

    return this.prisma.webhook.delete({ where: { id: webhookId } });
  }

  async executeWebhook(token: string, dto: { content: string; username?: string; avatarUrl?: string }) {
    if (!dto.content || dto.content.length > 4000) {
      throw new BadRequestException('Content is required and must be under 4000 characters');
    }
    const webhook = await this.prisma.webhook.findUnique({ where: { token } });
    if (!webhook || !webhook.isActive) throw new NotFoundException('Webhook not found');

    // Update last used
    await this.prisma.webhook.update({ where: { id: webhook.id }, data: { lastUsedAt: new Date() } });

    // In production, this would create a message in the target channel/conversation
    return { success: true, webhookId: webhook.id };
  }

  // ── Stage Sessions (Moderated Audio) ────────────────────

  async createStageSession(userId: string, circleId: string, dto: { title: string; scheduledAt?: string }) {
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!membership) throw new ForbiddenException('Must be a member to create stage sessions');
    return this.prisma.stageSession.create({
      data: {
        circleId,
        hostId: userId,
        title: dto.title,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        speakerIds: [userId],
      },
      include: { host: { select: USER_SELECT } },
    });
  }

  async startStageSession(sessionId: string, userId: string) {
    const session = await this.prisma.stageSession.findFirst({ where: { id: sessionId, hostId: userId } });
    if (!session) throw new NotFoundException();
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { status: 'live', startedAt: new Date() },
    });
  }

  async endStageSession(sessionId: string, userId: string) {
    const session = await this.prisma.stageSession.findFirst({ where: { id: sessionId, hostId: userId } });
    if (!session) throw new NotFoundException();
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { status: 'ended', endedAt: new Date() },
    });
  }

  async inviteSpeaker(sessionId: string, hostId: string, speakerId: string) {
    const session = await this.prisma.stageSession.findFirst({ where: { id: sessionId, hostId } });
    if (!session) throw new NotFoundException();

    const speakers = [...new Set([...session.speakerIds, speakerId])];
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { speakerIds: speakers },
    });
  }

  async getActiveStageSessions(circleId?: string) {
    const where: Record<string, unknown> = { status: 'live' };
    if (circleId) where.circleId = circleId;

    return this.prisma.stageSession.findMany({
      where,
      orderBy: { audienceCount: 'desc' },
      take: 50,
      include: { host: { select: USER_SELECT } },
    });
  }
}
