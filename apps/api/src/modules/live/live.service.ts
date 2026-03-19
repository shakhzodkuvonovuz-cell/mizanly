import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { LiveStatus, LiveType } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class LiveService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: { title: string; description?: string; thumbnailUrl?: string; liveType: string; scheduledAt?: string; isRecorded?: boolean }) {
    const streamKey = randomBytes(16).toString('hex');
    return this.prisma.liveSession.create({
      data: {
        hostId: userId,
        title: data.title,
        description: data.description,
        thumbnailUrl: data.thumbnailUrl,
        liveType: data.liveType as LiveType,
        status: data.scheduledAt ? LiveStatus.SCHEDULED : LiveStatus.LIVE,
        streamKey,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        startedAt: data.scheduledAt ? undefined : new Date(),
        isRecorded: data.isRecorded ?? true,
      },
      include: { host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
  }

  async getById(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
          take: 20,
        },
      },
    });
    if (!session) throw new NotFoundException('Live session not found');
    return session;
  }

  async getActive(liveType?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { status: LiveStatus.LIVE };
    if (liveType) where.liveType = liveType as LiveType;
    if (cursor) where.id = { lt: cursor };

    const sessions = await this.prisma.liveSession.findMany({
      where,
      include: { host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { currentViewers: 'desc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  async getScheduled(cursor?: string, limit = 20) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { status: LiveStatus.SCHEDULED, scheduledAt: { gte: new Date() }, ...(cursor ? { id: { lt: cursor } } : {
      take: 50,
    }) },
      include: { host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  async startLive(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (session.status === LiveStatus.ENDED) throw new BadRequestException('Cannot restart an ended session');
    if (session.status === LiveStatus.CANCELLED) throw new BadRequestException('Cannot start a cancelled session');
    if (session.status === LiveStatus.LIVE) throw new BadRequestException('Session is already live');
    if (session.status !== LiveStatus.SCHEDULED) throw new BadRequestException('Can only start a scheduled session');
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.LIVE, startedAt: new Date() },
    });
  }

  async endLive(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not live');
    await this.prisma.liveParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: new Date() },
    });
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.ENDED, endedAt: new Date(), currentViewers: 0 },
    });
  }

  async cancelLive(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    // Only SCHEDULED or LIVE sessions can be cancelled; ENDED/CANCELLED cannot
    if (session.status === LiveStatus.ENDED) throw new BadRequestException('Cannot cancel an ended session');
    if (session.status === LiveStatus.CANCELLED) throw new BadRequestException('Session is already cancelled');
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.CANCELLED },
    });
  }

  async join(sessionId: string, userId: string, role = 'viewer') {
    const session = await this.getById(sessionId);
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not live');

    // Host is always implicitly in the session — don't add as participant
    if (session.hostId === userId) {
      return { joined: true, currentViewers: session.currentViewers };
    }

    const existing = await this.prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing && !existing.leftAt) return { joined: true, currentViewers: session.currentViewers };

    if (existing) {
      await this.prisma.liveParticipant.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: { leftAt: null, joinedAt: new Date(), role },
      });
    } else {
      await this.prisma.liveParticipant.create({
        data: { sessionId, userId, role },
      });
    }

    // Atomically increment viewers and update peak in one query
    await this.prisma.$executeRaw`
      UPDATE "LiveSession"
      SET "currentViewers" = "currentViewers" + 1,
          "totalViews" = "totalViews" + 1,
          "peakViewers" = GREATEST("peakViewers", "currentViewers" + 1)
      WHERE id = ${sessionId}
    `;
    const updated = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { currentViewers: true },
    });
    return { joined: true, currentViewers: updated?.currentViewers ?? 0 };
  }

  async leave(sessionId: string, userId: string) {
    // Only mark as left if participant exists and hasn't already left
    const participant = await this.prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!participant || participant.leftAt) return { left: true };

    await this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { leftAt: new Date() },
    });
    // Use GREATEST to prevent negative viewers
    await this.prisma.$executeRaw`
      UPDATE "LiveSession"
      SET "currentViewers" = GREATEST("currentViewers" - 1, 0)
      WHERE id = ${sessionId}
    `;
    return { left: true };
  }

  async raiseHand(sessionId: string, userId: string) {
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { role: 'raised_hand' },
    });
  }

  async promoteToSpeaker(sessionId: string, hostId: string, targetUserId: string) {
    await this.requireHost(sessionId, hostId);
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      data: { role: 'speaker' },
    });
  }

  async demoteToViewer(sessionId: string, hostId: string, targetUserId: string) {
    await this.requireHost(sessionId, hostId);
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      data: { role: 'viewer' },
    });
  }

  async updateRecording(sessionId: string, userId: string, recordingUrl: string) {
    await this.requireHost(sessionId, userId);
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { recordingUrl },
    });
  }

  async getHostSessions(userId: string, cursor?: string, limit = 20) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { hostId: userId, ...(cursor ? { id: { lt: cursor } } : {
      take: 50,
    }) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  private async requireHost(sessionId: string, userId: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.hostId !== userId) throw new ForbiddenException('Only the host can perform this action');
    return session;
  }
}