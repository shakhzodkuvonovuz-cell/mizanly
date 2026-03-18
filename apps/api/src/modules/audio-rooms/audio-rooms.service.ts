import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateAudioRoomDto } from './dto/create-audio-room.dto';
import { RoleChangeDto, AudioRoomRole } from './dto/role-change.dto';

const ROOM_STATUS = {
  LIVE: 'live',
  ENDED: 'ended',
  SCHEDULED: 'scheduled',
} as const;

const ROOM_SELECT = {
  id: true,
  title: true,
  description: true,
  hostId: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  maxSpeakers: true,
  isRecording: true,
  createdAt: true,
  host: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  participants: {
    select: {
      id: true,
      userId: true,
      role: true,
      isMuted: true,
      handRaised: true,
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
    },
  },
};

const PARTICIPANT_SELECT = {
  id: true,
  roomId: true,
  userId: true,
  role: true,
  isMuted: true,
  handRaised: true,
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
export class AudioRoomsService {
  private readonly logger = new Logger(AudioRoomsService.name);

  constructor(private prisma: PrismaService) {}

  // Create audio room
  async create(userId: string, dto: CreateAudioRoomDto) {
    const room = await this.prisma.audioRoom.create({
      data: {
        title: dto.title,
        description: dto.description,
        hostId: userId,
        status: dto.scheduledAt ? ROOM_STATUS.SCHEDULED : ROOM_STATUS.LIVE,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        startedAt: dto.scheduledAt ? null : new Date(),
        maxSpeakers: 10, // default
        isRecording: false,
      },
      select: ROOM_SELECT,
    });

    // Add host as participant
    await this.prisma.audioRoomParticipant.create({
      data: {
        roomId: room.id,
        userId: userId,
        role: AudioRoomRole.HOST,
        isMuted: false,
        handRaised: false,
      },
    });

    // Reload room with participants
    return this.prisma.audioRoom.findUnique({
      where: { id: room.id },
      select: ROOM_SELECT,
    });
  }

  // List active rooms (live or scheduled)
  async list(viewerId: string | undefined, cursor?: string, limit = 20) {
    const where: Prisma.AudioRoomWhereInput = {
      OR: [
        { status: ROOM_STATUS.LIVE },
        { status: ROOM_STATUS.SCHEDULED },
      ],
    };

    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const rooms = await this.prisma.audioRoom.findMany({
      where,
      select: ROOM_SELECT,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = rooms.length === limit;
    const nextCursor = hasMore ? rooms[rooms.length - 1].createdAt.toISOString() : null;

    return {
      data: rooms,
      meta: { cursor: nextCursor, hasMore },
    };
  }

  // Get room by ID
  async getById(id: string, viewerId?: string) {
    const room = await this.prisma.audioRoom.findUnique({
      where: { id },
      select: ROOM_SELECT,
    });

    if (!room) {
      throw new NotFoundException('Audio room not found');
    }

    // If viewer is participant, include additional info?
    return room;
  }

  // End room (host only)
  async endRoom(id: string, userId: string) {
    const room = await this.prisma.audioRoom.findUnique({
      where: { id },
      include: { host: true },
    });

    if (!room) {
      throw new NotFoundException('Audio room not found');
    }

    if (room.hostId !== userId) {
      throw new ForbiddenException('Only the host can end the room');
    }

    if (room.status === ROOM_STATUS.ENDED) {
      throw new BadRequestException('Room already ended');
    }

    // Delete all participants (cascade)
    // Update room status
    const [, updated] = await this.prisma.$transaction([
      this.prisma.audioRoomParticipant.deleteMany({ where: { roomId: id } }),
      this.prisma.audioRoom.update({
        where: { id },
        data: {
          status: ROOM_STATUS.ENDED,
          endedAt: new Date(),
        },
        select: ROOM_SELECT,
      }),
    ]);

    return updated;
  }

  // Join room as listener
  async join(id: string, userId: string) {
    const room = await this.prisma.audioRoom.findUnique({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException('Audio room not found');
    }

    if (room.status !== ROOM_STATUS.LIVE) {
      throw new BadRequestException('Room is not live');
    }

    // Create participant — handle P2002 (unique constraint) for idempotent join
    try {
      await this.prisma.audioRoomParticipant.create({
        data: {
          roomId: id,
          userId,
          role: AudioRoomRole.LISTENER,
          isMuted: true,
          handRaised: false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Already joined this room');
      }
      throw error;
    }

    // Return updated room
    return this.prisma.audioRoom.findUnique({
      where: { id },
      select: ROOM_SELECT,
    });
  }

  // Leave room
  async leave(id: string, userId: string) {
    const participant = await this.prisma.audioRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: id, userId } },
    });

    if (!participant) {
      throw new BadRequestException('Not a participant in this room');
    }

    // If host leaves, end the room? For now just remove participant
    // But if host leaves, maybe we should end room. Let's implement: if host leaves, end room.
    const room = await this.prisma.audioRoom.findUnique({
      where: { id },
    });

    if (room?.hostId === userId) {
      // Host leaving → end room
      return this.endRoom(id, userId);
    }

    // Otherwise delete participant
    await this.prisma.audioRoomParticipant.delete({
      where: { roomId_userId: { roomId: id, userId } },
    });

    return { success: true };
  }

  // Change participant role (host only)
  async changeRole(id: string, userId: string, dto: RoleChangeDto) {
    const room = await this.prisma.audioRoom.findUnique({
      where: { id },
      include: { host: true },
    });

    if (!room) {
      throw new NotFoundException('Audio room not found');
    }

    if (room.hostId !== userId) {
      throw new ForbiddenException('Only the host can change roles');
    }

    if (room.status !== ROOM_STATUS.LIVE) {
      throw new BadRequestException('Room is not live');
    }

    // Find target participant
    const targetParticipant = await this.prisma.audioRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: id, userId: dto.userId } },
    });

    if (!targetParticipant) {
      throw new NotFoundException('Participant not found in this room');
    }

    // Validate role transition
    const currentRole = targetParticipant.role;
    const newRole = dto.role;

    // Only allow listener ↔ speaker changes (host role cannot be changed)
    if (currentRole === AudioRoomRole.HOST || newRole === AudioRoomRole.HOST) {
      throw new BadRequestException('Cannot change host role');
    }

    // Update role
    await this.prisma.audioRoomParticipant.update({
      where: { roomId_userId: { roomId: id, userId: dto.userId } },
      data: { role: newRole },
    });

    return { success: true };
  }

  // Toggle hand raised
  async toggleHand(id: string, userId: string) {
    const participant = await this.prisma.audioRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: id, userId } },
    });

    if (!participant) {
      throw new BadRequestException('Not a participant in this room');
    }

    if (participant.role !== AudioRoomRole.LISTENER) {
      throw new BadRequestException('Only listeners can raise hand');
    }

    await this.prisma.audioRoomParticipant.update({
      where: { roomId_userId: { roomId: id, userId } },
      data: { handRaised: !participant.handRaised },
    });

    return { handRaised: !participant.handRaised };
  }

  // Toggle mute (self or host for others)
  async toggleMute(id: string, userId: string, targetUserId?: string) {
    const room = await this.prisma.audioRoom.findUnique({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException('Audio room not found');
    }

    if (room.status !== ROOM_STATUS.LIVE) {
      throw new BadRequestException('Room is not live');
    }

    const isSelf = !targetUserId || targetUserId === userId;
    const targetId = isSelf ? userId : targetUserId;

    // Check if target is participant
    const targetParticipant = await this.prisma.audioRoomParticipant.findUnique({
      where: { roomId_userId: { roomId: id, userId: targetId } },
    });

    if (!targetParticipant) {
      throw new NotFoundException('Participant not found');
    }

    // Permission check
    if (!isSelf) {
      // Must be host to mute others
      const hostParticipant = await this.prisma.audioRoomParticipant.findUnique({
        where: { roomId_userId: { roomId: id, userId } },
      });
      if (!hostParticipant || hostParticipant.role !== AudioRoomRole.HOST) {
        throw new ForbiddenException('Only host can mute others');
      }
    }

    await this.prisma.audioRoomParticipant.update({
      where: { roomId_userId: { roomId: id, userId: targetId } },
      data: { isMuted: !targetParticipant.isMuted },
    });

    return { isMuted: !targetParticipant.isMuted };
  }

  // List participants by role
  async listParticipants(
    id: string,
    viewerId?: string,
    role?: AudioRoomRole,
    cursor?: string,
    limit = 50,
  ) {
    const room = await this.prisma.audioRoom.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Audio room not found');
    }

    const where: Prisma.AudioRoomParticipantWhereInput = { roomId: id };
    if (role) {
      where.role = role;
    }
    if (cursor) {
      where.joinedAt = { lt: new Date(cursor) };
    }

    const participants = await this.prisma.audioRoomParticipant.findMany({
      where,
      select: PARTICIPANT_SELECT,
      take: limit,
      orderBy: { joinedAt: 'desc' },
    });

    const hasMore = participants.length === limit;
    const nextCursor = hasMore ? participants[participants.length - 1].joinedAt.toISOString() : null;

    return {
      data: participants,
      meta: { cursor: nextCursor, hasMore },
    };
  }
}