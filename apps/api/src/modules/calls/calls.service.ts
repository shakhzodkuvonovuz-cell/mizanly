import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CallStatus, CallType } from '@prisma/client';

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  async initiate(userId: string, targetUserId: string, callType: string) {
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
        callType: callType as CallType,
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
    if (session.status !== CallStatus.RINGING) throw new BadRequestException('Call is not ringing');
    this.requireParticipant(session.participants, userId);

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
    if (session.status !== CallStatus.RINGING) throw new BadRequestException('Call is not ringing');
    this.requireParticipant(session.participants, userId);

    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.DECLINED, endedAt: new Date() },
    });
  }

  async end(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId);
    this.requireParticipant(session.participants, userId);
    if (session.status === CallStatus.ENDED) return session;

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

  async missedCall(sessionId: string) {
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
    ];

    const turnUrl = process.env.TURN_SERVER_URL;
    const turnUsername = process.env.TURN_USERNAME;
    const turnCredential = process.env.TURN_CREDENTIAL;

    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      });
    }

    return { iceServers };
  }

  private async getSession(sessionId: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) throw new NotFoundException('Call not found');
    return session;
  }

  private requireParticipant(participants: { userId: string }[], userId: string) {
    if (!participants.some(p => p.userId === userId)) {
      throw new ForbiddenException('Not a participant in this call');
    }
  }
}