import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { CallStatus, CallType, CallParticipant } from '@prisma/client';

interface CallSessionWithParticipants {
  id: string;
  callType: CallType;
  status: CallStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  participants: CallParticipant[];
}

@Injectable()
export class CallsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async initiate(userId: string, targetUserId: string, callType: CallType) {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot call yourself');
    }

    // Check blocks bidirectionally
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: userId },
        ],
      },
    });
    if (blocked) throw new ForbiddenException('Cannot call this user');

    // Check no active call for either user
    const activeCall = await this.prisma.callParticipant.findFirst({
      where: {
        userId: { in: [userId, targetUserId] },
        leftAt: null,
        session: { status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] } },
      },
    });
    if (activeCall) throw new BadRequestException('User is already in a call');

    const session = await this.prisma.callSession.create({
      data: {
        callType,
        status: CallStatus.RINGING,
        participants: {
          createMany: {
            data: [
              { userId, role: 'caller', joinedAt: new Date() },
              { userId: targetUserId, role: 'callee' },
            ],
          },
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    return session;
  }

  async answer(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId);
    this.requireParticipant(session.participants, userId);
    if (session.status !== CallStatus.RINGING) throw new BadRequestException('Call is not ringing');

    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: {
        status: CallStatus.ACTIVE,
        startedAt: new Date(),
        participants: {
          update: {
            where: { sessionId_userId: { sessionId, userId } },
            data: { joinedAt: new Date() },
          },
        },
      },
    });
  }

  async decline(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId);
    this.requireParticipant(session.participants, userId);
    if (session.status !== CallStatus.RINGING) throw new BadRequestException('Call is not ringing');

    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.DECLINED, endedAt: new Date() },
    });
  }

  async end(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId);
    this.requireParticipant(session.participants, userId);

    // Only RINGING or ACTIVE calls can be ended
    if (session.status !== CallStatus.RINGING && session.status !== CallStatus.ACTIVE) {
      return session;
    }

    const now = new Date();
    const duration = session.startedAt ? Math.floor((now.getTime() - session.startedAt.getTime()) / 1000) : 0;

    await this.prisma.callParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: now },
    });

    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.ENDED, endedAt: now, duration },
    });
  }

  async missedCall(sessionId: string, userId?: string) {
    const session = await this.getSession(sessionId);
    if (userId) {
      this.requireParticipant(session.participants, userId);
    }
    if (session.status !== CallStatus.RINGING) throw new BadRequestException('Only ringing calls can be marked as missed');
    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.MISSED, endedAt: new Date() },
    });
  }

  async getHistory(userId: string, cursor?: string, limit = 20) {
    const participations = await this.prisma.callParticipant.findMany({
      where: { userId, ...(cursor ? { session: { id: { lt: cursor } } } : {}) },
      include: {
        session: {
          include: {
            participants: {
              include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
            },
          },
        },
      },
      orderBy: { session: { createdAt: 'desc' } },
      take: limit + 1,
    });
    const hasMore = participations.length > limit;
    if (hasMore) participations.pop();
    const data = participations.map(p => p.session);
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  async getActiveCall(userId: string) {
    const participant = await this.prisma.callParticipant.findFirst({
      where: { userId, leftAt: null, session: { status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] } } },
      include: {
        session: {
          include: {
            participants: {
              include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
            },
          },
        },
      },
    });
    return participant?.session ?? null;
  }

  getIceServers() {
    const iceServers: { urls: string; username?: string; credential?: string }[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];

    const turnUrl = this.config.get<string>('TURN_SERVER_URL');
    const turnUsername = this.config.get<string>('TURN_USERNAME');
    const turnCredential = this.config.get<string>('TURN_CREDENTIAL');

    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      });
    }

    return { iceServers };
  }

  private async getSession(sessionId: string): Promise<CallSessionWithParticipants> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) throw new NotFoundException('Call not found');
    return session;
  }

  private requireParticipant(participants: Pick<CallParticipant, 'userId'>[], userId: string) {
    if (!participants.some(p => p.userId === userId)) {
      throw new ForbiddenException('Not a participant in this call');
    }
  }

  // ── Group calls (up to 8 participants) ─────────────

  async createGroupCall(conversationId: string, initiatorId: string, participantIds: string[], callType: CallType = CallType.VIDEO) {
    if (participantIds.length > 7) throw new BadRequestException('Group calls support up to 8 participants');

    // Check for active calls among all participants
    const allIds = [initiatorId, ...participantIds.filter(id => id !== initiatorId)];
    const activeCall = await this.prisma.callParticipant.findFirst({
      where: {
        userId: { in: allIds },
        leftAt: null,
        session: { status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] } },
      },
    });
    if (activeCall) throw new BadRequestException('One or more participants are already in a call');

    const session = await this.prisma.callSession.create({
      data: {
        callType,
        status: CallStatus.RINGING,
        maxParticipants: allIds.length,
        participants: {
          createMany: {
            data: allIds.map(userId => ({
              userId,
              role: userId === initiatorId ? 'caller' : 'receiver',
            })),
          },
        },
      },
      include: { participants: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } } },
    });

    return session;
  }

  // ── Screen sharing ─────────────────────────────────

  async shareScreen(callId: string, userId: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { participants: true },
    });
    if (!session) throw new NotFoundException('Call not found');
    this.requireParticipant(session.participants, userId);
    if (session.status !== CallStatus.ACTIVE) throw new BadRequestException('Call must be active');
    if (session.isScreenSharing) throw new BadRequestException('Someone is already sharing their screen');

    return this.prisma.callSession.update({
      where: { id: callId },
      data: { isScreenSharing: true, screenShareUserId: userId },
    });
  }

  async stopScreenShare(callId: string, userId: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { participants: true },
    });
    if (!session) throw new NotFoundException('Call not found');
    this.requireParticipant(session.participants, userId);
    if (session.screenShareUserId !== userId) throw new ForbiddenException('Only the screen sharer can stop');

    return this.prisma.callSession.update({
      where: { id: callId },
      data: { isScreenSharing: false, screenShareUserId: null },
    });
  }
}
