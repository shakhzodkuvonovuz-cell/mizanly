import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { StageSessionStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashToken } from '../../common/utils/field-encryption';

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };
const MAX_STAGE_SPEAKERS = 20;

@Injectable()
export class DiscordFeaturesService {
  private readonly logger = new Logger(DiscordFeaturesService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

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
    // Use offset-based pagination to avoid cursor/sort mismatch
    // (cursor is id-based but sort is by isPinned + lastReplyAt)
    const skip = cursor ? 1 : 0;
    const cursorObj = cursor ? { id: cursor } : undefined;

    const threads = await this.prisma.forumThread.findMany({
      where: { circleId },
      orderBy: [{ isPinned: 'desc' }, { lastReplyAt: 'desc' }],
      take: limit + 1,
      skip,
      cursor: cursorObj,
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
    const thread = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
      select: { id: true, circleId: true, isLocked: true },
    });
    if (!thread) throw new NotFoundException();
    if (thread.isLocked) throw new ForbiddenException('Thread is locked');

    // Verify user is a member of the circle
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: thread.circleId, userId } },
    });
    if (!membership) throw new ForbiddenException('Must be a member of this community to reply');

    const [reply] = await this.prisma.$transaction([
      this.prisma.forumReply.create({
        data: { threadId, authorId: userId, content },
        include: { author: { select: USER_SELECT } },
      }),
      this.prisma.forumThread.update({
        where: { id: threadId },
        data: { replyCount: { increment: 1 }, lastReplyAt: new Date() },
      }),
    ]);

    return reply;
  }

  async getForumReplies(threadId: string, cursor?: string, limit = 50) {
    // Use Prisma cursor pagination (skip+cursor) to avoid cursor/sort mismatch
    const skip = cursor ? 1 : 0;
    const cursorObj = cursor ? { id: cursor } : undefined;

    const replies = await this.prisma.forumReply.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      skip,
      cursor: cursorObj,
      include: { author: { select: USER_SELECT } },
    });

    const hasMore = replies.length > limit;
    if (hasMore) replies.pop();
    return { data: replies, meta: { cursor: replies[replies.length - 1]?.id || null, hasMore } };
  }

  /** Check if user is the thread author OR a community admin/moderator/owner */
  private async requireThreadModerator(threadId: string, userId: string) {
    const thread = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
      select: { id: true, circleId: true, authorId: true, isLocked: true, isPinned: true },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    if (thread.authorId !== userId) {
      const membership = await this.prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId: thread.circleId, userId } },
        select: { role: true },
      });
      if (!membership || !['OWNER', 'ADMIN', 'MODERATOR'].includes(membership.role)) {
        throw new ForbiddenException('Only the thread author or community moderators can perform this action');
      }
    }
    return thread;
  }

  async lockForumThread(threadId: string, userId: string) {
    const thread = await this.requireThreadModerator(threadId, userId);
    // Toggle lock state instead of one-way lock
    return this.prisma.forumThread.update({
      where: { id: threadId },
      data: { isLocked: !thread.isLocked },
    });
  }

  async pinForumThread(threadId: string, userId: string) {
    const thread = await this.requireThreadModerator(threadId, userId);
    return this.prisma.forumThread.update({
      where: { id: threadId },
      data: { isPinned: !thread.isPinned },
    });
  }

  async deleteForumThread(threadId: string, userId: string) {
    const thread = await this.requireThreadModerator(threadId, userId);
    // Delete all replies first, then the thread
    await this.prisma.forumReply.deleteMany({ where: { threadId: thread.id } });
    return this.prisma.forumThread.delete({ where: { id: thread.id } });
  }

  async deleteForumReply(replyId: string, userId: string) {
    const reply = await this.prisma.forumReply.findUnique({
      where: { id: replyId },
      select: { id: true, threadId: true, authorId: true },
    });
    if (!reply) throw new NotFoundException('Reply not found');

    // Allow delete by author or community moderator
    if (reply.authorId !== userId) {
      const thread = await this.prisma.forumThread.findUnique({
        where: { id: reply.threadId },
        select: { circleId: true },
      });
      if (thread) {
        const membership = await this.prisma.circleMember.findUnique({
          where: { circleId_userId: { circleId: thread.circleId, userId } },
          select: { role: true },
        });
        if (!membership || !['OWNER', 'ADMIN', 'MODERATOR'].includes(membership.role)) {
          throw new ForbiddenException('Only the reply author or community moderators can delete replies');
        }
      }
    }

    await this.prisma.forumReply.delete({ where: { id: replyId } });
    // Decrement reply count
    await this.prisma.forumThread.update({
      where: { id: reply.threadId },
      data: { replyCount: { decrement: 1 } },
    });
    // Floor at 0 to prevent negative on race
    await this.prisma.forumThread.updateMany({
      where: { id: reply.threadId, replyCount: { lt: 0 } },
      data: { replyCount: 0 },
    });

    return;
  }

  // ── Webhooks ────────────────────────────────────────────

  async createWebhook(userId: string, circleId: string, dto: { name: string; avatarUrl?: string; targetChannelId?: string }) {
    // Verify user is an admin/owner of the circle
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('Must be a member to create webhooks');
    if (!['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only community admins can create webhooks');
    }

    const count = await this.prisma.webhook.count({ where: { circleId } });
    if (count >= 15) throw new BadRequestException('Maximum 15 webhooks per community');

    // Generate a random token and store its SHA-256 hash.
    // The plaintext token is returned once on creation — the user needs it
    // to call the execute endpoint. We store only the hash for lookup.
    const plaintextToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(plaintextToken);

    const webhook = await this.prisma.webhook.create({
      data: {
        circleId,
        createdById: userId,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        targetChannelId: dto.targetChannelId,
        token: tokenHash,
      },
      select: {
        id: true, circleId: true, name: true, avatarUrl: true,
        targetChannelId: true, isActive: true, createdAt: true,
      },
    });
    // Return plaintext token once — this is the only time it's available
    return { ...webhook, token: plaintextToken };
  }

  async getWebhooks(circleId: string, userId?: string) {
    // Verify the user is a member of the community before exposing webhooks
    if (userId) {
      const membership = await this.prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId, userId } },
      });
      if (!membership) throw new ForbiddenException('You must be a member of this community');
    }
    return this.prisma.webhook.findMany({
      where: { circleId, isActive: true },
      select: {
        id: true, circleId: true, name: true, avatarUrl: true,
        targetChannelId: true, events: true, isActive: true,
        lastUsedAt: true, createdAt: true,
        // Exclude token hash and secret — never expose stored hashes/ciphertexts
      },
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
    // Hash the incoming token to match against the stored SHA-256 hash.
    // Legacy webhooks with unhashed tokens are also supported: if hashed lookup
    // fails, fall back to raw token lookup for backward compatibility.
    const tokenHash = hashToken(token);
    let webhook = await this.prisma.webhook.findUnique({
      where: { token: tokenHash },
      select: { id: true, isActive: true, targetChannelId: true, circleId: true },
    });
    if (!webhook) {
      // Fallback: try raw token for legacy webhooks created before hashing
      webhook = await this.prisma.webhook.findUnique({
        where: { token },
        select: { id: true, isActive: true, targetChannelId: true, circleId: true },
      });
    }
    if (!webhook || !webhook.isActive) throw new NotFoundException('Webhook not found');

    // Update last used
    await this.prisma.webhook.update({ where: { id: webhook.id }, data: { lastUsedAt: new Date() } });

    // Create a message in the target channel if targetChannelId is set
    if (webhook.targetChannelId) {
      await this.prisma.message.create({
        data: {
          conversationId: webhook.targetChannelId,
          content: dto.content,
          messageType: 'SYSTEM',
        },
      });
    }

    return { webhookId: webhook.id };
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
    const session = await this.prisma.stageSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Stage session not found');
    if (session.hostId !== userId) throw new ForbiddenException('Only the host can start the session');
    if (session.status === 'STAGE_LIVE') throw new BadRequestException('Session is already live');
    if (session.status === 'STAGE_ENDED') throw new BadRequestException('Cannot start an ended session');
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { status: 'STAGE_LIVE', startedAt: new Date() },
    });
  }

  async endStageSession(sessionId: string, userId: string) {
    const session = await this.prisma.stageSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Stage session not found');
    if (session.hostId !== userId) throw new ForbiddenException('Only the host can end the session');
    if (session.status === 'STAGE_ENDED') throw new BadRequestException('Session is already ended');
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { status: 'STAGE_ENDED', endedAt: new Date() },
    });
  }

  async inviteSpeaker(sessionId: string, hostId: string, speakerId: string) {
    const session = await this.prisma.stageSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Stage session not found');
    if (session.hostId !== hostId) throw new ForbiddenException('Only the host can invite speakers');
    if (session.status !== StageSessionStatus.STAGE_LIVE) throw new BadRequestException('Can only invite speakers to a live session');

    // Validate speaker exists
    const speaker = await this.prisma.user.findUnique({ where: { id: speakerId }, select: { id: true } });
    if (!speaker) throw new NotFoundException('Speaker not found');

    // Check speaker cap
    if (session.speakerIds.length >= MAX_STAGE_SPEAKERS) {
      throw new BadRequestException(`Maximum ${MAX_STAGE_SPEAKERS} speakers per stage session`);
    }

    const speakers = [...new Set([...session.speakerIds, speakerId])];
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { speakerIds: speakers },
    });
  }

  async removeSpeaker(sessionId: string, hostId: string, speakerId: string) {
    const session = await this.prisma.stageSession.findFirst({ where: { id: sessionId, hostId } });
    if (!session) throw new NotFoundException();
    if (speakerId === hostId) throw new BadRequestException('Cannot remove the host from speakers');

    const speakers = session.speakerIds.filter((id: string) => id !== speakerId);
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { speakerIds: speakers },
    });
  }

  async joinStageAsListener(sessionId: string, userId: string) {
    const session = await this.prisma.stageSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException();
    if (session.status !== StageSessionStatus.STAGE_LIVE) throw new BadRequestException('Stage session is not live');

    await this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { audienceCount: { increment: 1 } },
    });

    return { sessionId };
  }

  async leaveStageAsListener(sessionId: string, userId: string) {
    const session = await this.prisma.stageSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException();

    // Guard against negative count
    if (session.audienceCount > 0) {
      await this.prisma.stageSession.update({
        where: { id: sessionId },
        data: { audienceCount: { decrement: 1 } },
      });
    }

    return { sessionId };
  }

  async getActiveStageSessions(circleId?: string) {
    const where: Record<string, unknown> = { status: 'STAGE_LIVE' };
    if (circleId) {
      where.circleId = circleId;
    } else {
      // Only show stages from public communities when no circleId filter
      where.circle = { privacy: 'PUBLIC' };
    }

    return this.prisma.stageSession.findMany({
      where,
      orderBy: { audienceCount: 'desc' },
      take: 50,
      include: { host: { select: USER_SELECT } },
    });
  }
}
