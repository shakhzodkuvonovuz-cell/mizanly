import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StreamService } from '../stream/stream.service';
import { LiveRole } from '@prisma/client';
import { LiveStatus, LiveType, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

/** Lightweight select for list views — excludes streamKey (credential), playbackUrl, streamId, recordingUrl */
const LIVE_SESSION_LIST_SELECT = {
  id: true,
  hostId: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  liveType: true,
  status: true,
  currentViewers: true,
  totalViews: true,
  peakViewers: true,
  isRecorded: true,
  isRehearsal: true,
  isSubscribersOnly: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
  host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
};

@Injectable()
export class LiveService {
  constructor(
    private prisma: PrismaService,
    private stream: StreamService,
  ) {}

  async create(userId: string, data: { title: string; description?: string; thumbnailUrl?: string; liveType: string; scheduledAt?: string; isRecorded?: boolean }) {
    const streamKey = randomBytes(16).toString('hex');
    return this.prisma.liveSession.create({
      data: {
        hostId: userId,
        title: data.title,
        description: data.description,
        thumbnailUrl: data.thumbnailUrl,
        liveType: data.liveType as LiveType, // Validated by CreateLiveDto @IsEnum
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
      select: {
        id: true,
        hostId: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        liveType: true,
        status: true,
        currentViewers: true,
        totalViews: true,
        peakViewers: true,
        isRecorded: true,
        isRehearsal: true,
        isSubscribersOnly: true,
        recordingUrl: true,
        scheduledAt: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,
        // streamKey intentionally excluded — it is a credential
        host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        participants: {
          where: { leftAt: null },
          select: {
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
          take: 20,
        },
      },
    });
    if (!session) throw new NotFoundException('Live session not found');
    return session;
  }

  async getActive(liveType?: string, cursor?: string, limit = 20) {
    const where: Prisma.LiveSessionWhereInput = { status: LiveStatus.LIVE, isRehearsal: false };
    if (liveType) {
      const validLiveTypes = Object.values(LiveType);
      if (!validLiveTypes.includes(liveType as LiveType)) {
        throw new BadRequestException(`Invalid live type: ${liveType}`);
      }
      where.liveType = liveType as LiveType;
    }
    if (cursor) where.id = { lt: cursor };

    const sessions = await this.prisma.liveSession.findMany({
      where,
      // Select only fields needed for list views — excludes streamKey (credential)
      // and other heavy fields not needed in listings
      select: LIVE_SESSION_LIST_SELECT,
      orderBy: { currentViewers: 'desc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  async getScheduled(cursor?: string, limit = 20) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { status: LiveStatus.SCHEDULED, scheduledAt: { gte: new Date() }, ...(cursor ? { id: { lt: cursor } } : {}) },
      select: LIVE_SESSION_LIST_SELECT,
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

    // Create Cloudflare Stream live input for real-time broadcasting
    let rtmpsUrl: string | undefined;
    let rtmpsKey: string | undefined;
    let playbackUrl: string | undefined;
    let liveInputId: string | undefined;
    try {
      const liveInput = await this.stream.createLiveInput(session.title);
      rtmpsUrl = liveInput.rtmpsUrl;
      rtmpsKey = liveInput.rtmpsKey;
      playbackUrl = liveInput.playbackUrl;
      liveInputId = liveInput.liveInputId;
    } catch {
      // Stream integration optional — continue without it for basic metadata-only live sessions
    }

    const updated = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        status: LiveStatus.LIVE,
        startedAt: new Date(),
        ...(playbackUrl ? { playbackUrl } : {}),
        ...(liveInputId ? { streamId: liveInputId } : {}),
        ...(rtmpsKey ? { streamKey: rtmpsKey } : {}),
      },
    });

    return {
      ...updated,
      rtmpsUrl,
      rtmpsKey,
      playbackUrl,
    };
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

  async join(sessionId: string, userId: string, role = 'VIEWER') {
    const session = await this.getById(sessionId);
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not live');

    // Host is always implicitly in the session — don't add as participant
    if (session.hostId === userId) {
      return { joined: true, currentViewers: session.currentViewers };
    }

    // Enforce subscribers-only mode: check if user follows the host
    if (session.isSubscribersOnly) {
      const follow = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: session.hostId } },
      });
      if (!follow) {
        throw new ForbiddenException('This live session is for subscribers only');
      }
    }

    const existing = await this.prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing && !existing.leftAt) return { joined: true, currentViewers: session.currentViewers };

    if (existing) {
      // Re-joining after leaving — only increment currentViewers, NOT totalViews
      await this.prisma.liveParticipant.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: { leftAt: null, joinedAt: new Date(), role: role as LiveRole },
      });
      await this.prisma.$executeRaw`
        UPDATE "live_sessions"
        SET "currentViewers" = "currentViewers" + 1,
            "peakViewers" = GREATEST("peakViewers", "currentViewers" + 1)
        WHERE id = ${sessionId}
      `;
    } else {
      // First join — increment both currentViewers and totalViews
      await this.prisma.liveParticipant.create({
        data: { sessionId, userId, role: role as LiveRole },
      });
      await this.prisma.$executeRaw`
        UPDATE "live_sessions"
        SET "currentViewers" = "currentViewers" + 1,
            "totalViews" = "totalViews" + 1,
            "peakViewers" = GREATEST("peakViewers", "currentViewers" + 1)
        WHERE id = ${sessionId}
      `;
    }
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
      UPDATE "live_sessions"
      SET "currentViewers" = GREATEST("currentViewers" - 1, 0)
      WHERE id = ${sessionId}
    `;
    return { left: true };
  }

  async raiseHand(sessionId: string, userId: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not live');

    const participant = await this.prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!participant) throw new NotFoundException('Not a participant in this session');
    // Only viewers can raise their hand — speakers and hosts should not
    if (participant.role !== LiveRole.VIEWER) throw new BadRequestException('Only viewers can raise their hand');

    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { role: 'RAISED_HAND' },
    });
  }

  async promoteToSpeaker(sessionId: string, hostId: string, targetUserId: string) {
    await this.requireHost(sessionId, hostId);
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      data: { role: 'SPEAKER' },
    });
  }

  async demoteToViewer(sessionId: string, hostId: string, targetUserId: string) {
    await this.requireHost(sessionId, hostId);
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      data: { role: 'VIEWER' },
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
      where: { hostId: userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      select: LIVE_SESSION_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  // ── Multi-guest live streaming ──────────────────────────

  async inviteGuest(liveId: string, userId: string, hostId: string) {
    const session = await this.requireHost(liveId, hostId);
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not live');

    // Max 4 guests
    const guestCount = await this.prisma.liveGuest.count({
      where: { liveId, status: 'ACCEPTED' },
    });
    if (guestCount >= 4) throw new BadRequestException('Maximum 4 guests allowed');

    return this.prisma.liveGuest.upsert({
      where: { liveId_userId: { liveId, userId } },
      update: { status: 'INVITED' },
      create: { liveId, userId, status: 'INVITED' },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
  }

  async acceptGuestInvite(liveId: string, userId: string) {
    const guest = await this.prisma.liveGuest.findUnique({
      where: { liveId_userId: { liveId, userId } },
    });
    if (!guest || guest.status !== 'INVITED') throw new NotFoundException('No pending invitation');

    // Recheck guest count before accepting — prevents race condition allowing >4 guests
    const acceptedCount = await this.prisma.liveGuest.count({
      where: { liveId, status: 'ACCEPTED' },
    });
    if (acceptedCount >= 4) throw new BadRequestException('Maximum 4 guests already accepted');

    return this.prisma.liveGuest.update({
      where: { liveId_userId: { liveId, userId } },
      data: { status: 'ACCEPTED', joinedAt: new Date() },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
  }

  async removeGuest(liveId: string, guestUserId: string, hostId: string) {
    await this.requireHost(liveId, hostId);
    return this.prisma.liveGuest.update({
      where: { liveId_userId: { liveId, userId: guestUserId } },
      data: { status: 'REMOVED', leftAt: new Date() },
    });
  }

  async listGuests(liveId: string) {
    return this.prisma.liveGuest.findMany({
      where: { liveId, status: { in: ['INVITED', 'ACCEPTED'] } },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  // ── Rehearsal Mode ─────────────────────────────────────

  /**
   * Start a rehearsal: creates a live session that is not visible in feeds
   * and doesn't send notifications. Only the host can see it.
   */
  async startRehearsal(userId: string, data: { title: string; description?: string; thumbnailUrl?: string }) {
    const streamKey = randomBytes(16).toString('hex');
    return this.prisma.liveSession.create({
      data: {
        hostId: userId,
        title: data.title,
        description: data.description,
        thumbnailUrl: data.thumbnailUrl,
        liveType: LiveType.VIDEO_STREAM,
        status: LiveStatus.LIVE,
        streamKey,
        startedAt: new Date(),
        isRehearsal: true,
        isRecorded: false,
      },
      include: { host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
  }

  /**
   * Transition from rehearsal to public live.
   * Sets isRehearsal = false, making the stream visible in feeds.
   */
  async goLiveFromRehearsal(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (!session.isRehearsal) throw new BadRequestException('Session is not in rehearsal mode');
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not active');

    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { isRehearsal: false },
    });
  }

  /**
   * End a rehearsal without ever going public.
   */
  async endRehearsal(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (!session.isRehearsal) throw new BadRequestException('Session is not in rehearsal mode');
    if (session.status === LiveStatus.ENDED) throw new BadRequestException('Rehearsal is already ended');

    await this.prisma.liveParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: new Date() },
    });

    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.ENDED, endedAt: new Date(), currentViewers: 0 },
    });
  }

  // ── Subscribers-Only Mode ─────────────────────────────

  /**
   * Toggle subscribers-only mode for a live stream.
   */
  async setSubscribersOnly(sessionId: string, userId: string, subscribersOnly: boolean) {
    await this.requireHost(sessionId, userId);
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { isSubscribersOnly: subscribersOnly },
    });
  }

  private async requireHost(sessionId: string, userId: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.hostId !== userId) throw new ForbiddenException('Only the host can perform this action');
    return session;
  }
}