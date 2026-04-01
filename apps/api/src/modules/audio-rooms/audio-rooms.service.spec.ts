import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AudioRoomsService } from './audio-rooms.service';
import { CreateAudioRoomDto } from './dto/create-audio-room.dto';
import { AudioRoomRole, RoleChangeDto } from './dto/role-change.dto';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AudioRoomsService', () => {
  let service: AudioRoomsService;
  let prisma: any;

  const txMock = {
    audioRoom: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    audioRoomParticipant: {
      create: jest.fn(),
    },
  };

  const mockPrismaService = {
    $transaction: jest.fn().mockImplementation((fnOrArray) => {
      if (typeof fnOrArray === 'function') {
        return fnOrArray(txMock);
      }
      // Array-based transaction (endRoom uses this)
      return Promise.resolve(fnOrArray);
    }),
    audioRoom: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    audioRoomParticipant: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        AudioRoomsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AudioRoomsService>(AudioRoomsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create audio room successfully (live)', async () => {
      const userId = 'user123';
      const dto: CreateAudioRoomDto = {
        title: 'Test Room',
        description: 'Test Description',
      };
      const mockRoom = {
        id: 'room1',
        title: dto.title,
        description: dto.description,
        hostId: userId,
        status: 'live',
        scheduledAt: null,
        startedAt: expect.any(Date),
        maxSpeakers: 10,
        isRecording: false,
        createdAt: new Date(),
        host: {
          id: userId,
          username: 'testuser',
          displayName: 'Test User',
          avatarUrl: null,
          isVerified: false,
        },
        participants: [],
      };
      const mockParticipant = {
        id: 'part1',
        roomId: 'room1',
        userId,
        role: AudioRoomRole.HOST,
        isMuted: false,
        handRaised: false,
        joinedAt: new Date(),
      };
      const mockRoomWithParticipants = { ...mockRoom, participants: [mockParticipant] };

      txMock.audioRoom.create.mockResolvedValue(mockRoom);
      txMock.audioRoomParticipant.create.mockResolvedValue(mockParticipant);
      txMock.audioRoom.findUnique.mockResolvedValue(mockRoomWithParticipants);

      const result = await service.create(userId, dto);

      expect(result).toEqual(mockRoomWithParticipants);
      expect(txMock.audioRoom.create).toHaveBeenCalledWith({
        data: {
          title: dto.title,
          description: dto.description,
          hostId: userId,
          status: 'live',
          scheduledAt: null,
          startedAt: expect.any(Date),
          maxSpeakers: 10,
          isRecording: false,
        },
      });
      expect(txMock.audioRoomParticipant.create).toHaveBeenCalledWith({
        data: {
          roomId: 'room1',
          userId,
          role: AudioRoomRole.HOST,
          isMuted: false,
          handRaised: false,
        },
      });
      expect(txMock.audioRoom.findUnique).toHaveBeenCalledWith({
        where: { id: 'room1' },
        select: expect.any(Object),
      });
    });

    it('should create scheduled audio room', async () => {
      const userId = 'user123';
      const scheduledAt = '2026-03-14T10:00:00Z';
      const dto: CreateAudioRoomDto = {
        title: 'Scheduled Room',
        scheduledAt,
      };
      const mockRoom = {
        id: 'room2',
        title: dto.title,
        description: null,
        hostId: userId,
        status: 'scheduled',
        scheduledAt: new Date(scheduledAt),
        startedAt: null,
        maxSpeakers: 10,
        isRecording: false,
        createdAt: new Date(),
        host: { id: userId },
        participants: [],
      };

      txMock.audioRoom.create.mockResolvedValue(mockRoom);
      txMock.audioRoomParticipant.create.mockResolvedValue({});
      txMock.audioRoom.findUnique.mockResolvedValue(mockRoom);

      await service.create(userId, dto);

      expect(txMock.audioRoom.create).toHaveBeenCalledWith({
        data: {
          title: dto.title,
          description: dto.description,
          hostId: userId,
          status: 'scheduled',
          scheduledAt: new Date(scheduledAt),
          startedAt: null,
          maxSpeakers: 10,
          isRecording: false,
        },
      });
    });
  });

  describe('list', () => {
    it('should list active rooms with pagination', async () => {
      const viewerId = 'viewer123';
      const mockRooms = [
        {
          id: 'room1',
          title: 'Room 1',
          status: 'live',
          createdAt: new Date('2026-03-13T12:00:00Z'),
        },
        {
          id: 'room2',
          title: 'Room 2',
          status: 'scheduled',
          createdAt: new Date('2026-03-13T11:00:00Z'),
        },
      ];
      mockPrismaService.audioRoom.findMany.mockResolvedValue(mockRooms);

      const result = await service.list(viewerId);

      expect(result.data).toEqual(mockRooms);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBe(mockRooms[1].createdAt.toISOString());
      expect(mockPrismaService.audioRoom.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { status: 'live' },
            { status: 'scheduled' },
          ],
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle cursor pagination', async () => {
      const cursor = '2026-03-13T12:00:00Z';
      mockPrismaService.audioRoom.findMany.mockResolvedValue([]);

      await service.list(undefined, cursor);

      expect(mockPrismaService.audioRoom.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: expect.any(Array),
            createdAt: { lt: new Date(cursor) },
          },
        }),
      );
    });
  });

  describe('getById', () => {
    it('should return room when found', async () => {
      const roomId = 'room1';
      const mockRoom = { id: roomId, title: 'Test Room' };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);

      const result = await service.getById(roomId);

      expect(result).toEqual(mockRoom);
      expect(mockPrismaService.audioRoom.findUnique).toHaveBeenCalledWith({
        where: { id: roomId },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when room not found', async () => {
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('endRoom', () => {
    it('should end room successfully (host)', async () => {
      const roomId = 'room1';
      const userId = 'host123';
      const mockRoom = {
        id: roomId,
        hostId: userId,
        status: 'live',
        host: { id: userId },
      };
      const mockUpdatedRoom = { id: roomId, status: 'ended' };

      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.audioRoom.update.mockResolvedValue(mockUpdatedRoom);
      mockPrismaService.$transaction.mockResolvedValue([{ count: 1 }, mockUpdatedRoom]);

      const result = await service.endRoom(roomId, userId);

      expect(result).toEqual(mockUpdatedRoom);
      // J08-#17: Now uses select instead of include: { host: true } to avoid PII leak
      expect(mockPrismaService.audioRoom.findUnique).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: roomId },
      }));
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.audioRoomParticipant.deleteMany).toHaveBeenCalledWith({
        where: { roomId },
      });
      expect(mockPrismaService.audioRoom.update).toHaveBeenCalledWith({
        where: { id: roomId },
        data: {
          status: 'ended',
          endedAt: expect.any(Date),
        },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when room not found', async () => {
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(null);

      await expect(service.endRoom('nonexistent', 'user123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not host', async () => {
      const mockRoom = {
        id: 'room1',
        hostId: 'host123',
        host: { id: 'host123' },
      };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(service.endRoom('room1', 'not-host')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when room already ended', async () => {
      const mockRoom = {
        id: 'room1',
        hostId: 'host123',
        status: 'ended',
        host: { id: 'host123' },
      };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(service.endRoom('room1', 'host123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('join', () => {
    it('should join room as listener', async () => {
      const roomId = 'room1';
      const userId = 'user123';
      const mockRoom = { id: roomId, status: 'live' };
      const mockParticipant = { id: 'part1' };
      const mockUpdatedRoom = { id: roomId, participants: [mockParticipant] };

      mockPrismaService.audioRoom.findUnique
        .mockResolvedValueOnce(mockRoom) // first call: check room exists
        .mockResolvedValueOnce(mockUpdatedRoom); // second call: return updated room
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(null);
      mockPrismaService.audioRoomParticipant.create.mockResolvedValue(mockParticipant);

      const result = await service.join(roomId, userId);

      expect(result).toEqual(mockUpdatedRoom);
      expect(mockPrismaService.audioRoomParticipant.create).toHaveBeenCalledWith({
        data: {
          roomId,
          userId,
          role: AudioRoomRole.LISTENER,
          isMuted: true,
          handRaised: false,
        },
      });
    });

    it('should throw NotFoundException when room not found', async () => {
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(null);

      await expect(service.join('nonexistent', 'user123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when room not live', async () => {
      const mockRoom = { id: 'room1', status: 'scheduled' };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(service.join('room1', 'user123')).rejects.toThrow(BadRequestException);
    });

    it('should handle duplicate join gracefully (idempotent)', async () => {
      const mockRoom = { id: 'room1', status: 'live' };
      mockPrismaService.audioRoom.findUnique
        .mockResolvedValueOnce(mockRoom) // first call: check room exists
        .mockResolvedValueOnce({ ...mockRoom, participants: [{ id: 'part1' }] }); // return with participants
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(null);
      mockPrismaService.audioRoomParticipant.create.mockResolvedValue({ id: 'part1', userId: 'user123' });

      const result = await service.join('room1', 'user123');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', 'room1');
    });
  });

  describe('leave', () => {
    it('should leave room as listener', async () => {
      const roomId = 'room1';
      const userId = 'listener123';
      const mockParticipant = { id: 'part1', userId };
      const mockRoom = { id: roomId, hostId: 'host123' };

      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(mockParticipant);
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.delete.mockResolvedValue({});

      const result = await service.leave(roomId, userId);

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.audioRoomParticipant.delete).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId, userId } },
      });
    });

    it('should throw BadRequestException when not participant', async () => {
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.leave('room1', 'user123')).rejects.toThrow(BadRequestException);
    });

    it('should end room when host leaves', async () => {
      const roomId = 'room1';
      const userId = 'host123';
      const mockParticipant = { id: 'part1', userId };
      const mockRoom = { id: roomId, hostId: userId };

      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(mockParticipant);
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      // endRoom will be called; we can mock its behavior
      const endRoomSpy = jest.spyOn(service, 'endRoom').mockResolvedValue({} as any);

      await service.leave(roomId, userId);

      expect(endRoomSpy).toHaveBeenCalledWith(roomId, userId);
    });
  });

  describe('changeRole', () => {
    it('should change role from listener to speaker (host only)', async () => {
      const roomId = 'room1';
      const hostId = 'host123';
      const targetUserId = 'listener123';
      const dto: RoleChangeDto = { userId: targetUserId, role: AudioRoomRole.SPEAKER };
      const mockRoom = { id: roomId, hostId, status: 'live', host: { id: hostId }, maxSpeakers: 10 };
      const mockParticipant = { roomId, userId: targetUserId, role: AudioRoomRole.LISTENER };

      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(mockParticipant);
      mockPrismaService.audioRoomParticipant.count.mockResolvedValue(1); // 1 speaker (host), room allows 10
      mockPrismaService.audioRoomParticipant.update.mockResolvedValue({});

      const result = await service.changeRole(roomId, hostId, dto);

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.audioRoomParticipant.update).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId, userId: targetUserId } },
        data: { role: AudioRoomRole.SPEAKER },
      });
    });

    it('should throw NotFoundException when room not found', async () => {
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(null);

      await expect(service.changeRole('nonexistent', 'host123', {} as any))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not host', async () => {
      const mockRoom = { id: 'room1', hostId: 'host123', host: { id: 'host123' } };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(service.changeRole('room1', 'not-host', {} as any))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when room not live', async () => {
      const mockRoom = { id: 'room1', hostId: 'host123', status: 'scheduled', host: { id: 'host123' } };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(service.changeRole('room1', 'host123', {} as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when participant not found', async () => {
      const mockRoom = { id: 'room1', hostId: 'host123', status: 'live', host: { id: 'host123' } };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.changeRole('room1', 'host123', { userId: 'target', role: AudioRoomRole.SPEAKER }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to change host role', async () => {
      const mockRoom = { id: 'room1', hostId: 'host123', status: 'live', host: { id: 'host123' } };
      const mockParticipant = { roomId: 'room1', userId: 'host123', role: AudioRoomRole.HOST };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(mockParticipant);

      await expect(service.changeRole('room1', 'host123', { userId: 'host123', role: AudioRoomRole.LISTENER }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleHand', () => {
    it('should toggle hand raised for listener', async () => {
      const roomId = 'room1';
      const userId = 'listener123';
      const mockParticipant = { roomId, userId, role: AudioRoomRole.LISTENER, handRaised: false };

      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(mockParticipant);
      mockPrismaService.audioRoomParticipant.update.mockResolvedValue({ handRaised: true });

      const result = await service.toggleHand(roomId, userId);

      expect(result).toEqual({ handRaised: true });
      expect(mockPrismaService.audioRoomParticipant.update).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId, userId } },
        data: { handRaised: true },
      });
    });

    it('should throw BadRequestException when not participant', async () => {
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.toggleHand('room1', 'user123')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when not listener', async () => {
      const mockParticipant = { role: AudioRoomRole.SPEAKER };
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(mockParticipant);

      await expect(service.toggleHand('room1', 'user123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleMute', () => {
    it('should toggle self-mute', async () => {
      const roomId = 'room1';
      const userId = 'participant123';
      const mockRoom = { id: roomId, status: 'live' };
      const mockParticipant = { roomId, userId, isMuted: false };

      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(mockParticipant);
      mockPrismaService.audioRoomParticipant.update.mockResolvedValue({ isMuted: true });

      const result = await service.toggleMute(roomId, userId);

      expect(result).toEqual({ isMuted: true });
      expect(mockPrismaService.audioRoomParticipant.update).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId, userId } },
        data: { isMuted: true },
      });
    });

    it('should toggle mute for others (host only)', async () => {
      const roomId = 'room1';
      const hostId = 'host123';
      const targetUserId = 'listener123';
      const mockRoom = { id: roomId, status: 'live' };
      const mockTargetParticipant = { roomId, userId: targetUserId, isMuted: false };
      const mockHostParticipant = { roomId, userId: hostId, role: AudioRoomRole.HOST };

      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findUnique.mockImplementation((args) => {
        if (args.where.roomId_userId.userId === targetUserId) return mockTargetParticipant;
        if (args.where.roomId_userId.userId === hostId) return mockHostParticipant;
        return null;
      });
      mockPrismaService.audioRoomParticipant.update.mockResolvedValue({ isMuted: true });

      const result = await service.toggleMute(roomId, hostId, targetUserId);

      expect(result).toEqual({ isMuted: true });
      expect(mockPrismaService.audioRoomParticipant.update).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId, userId: targetUserId } },
        data: { isMuted: true },
      });
    });

    it('should throw NotFoundException when room not found', async () => {
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(null);

      await expect(service.toggleMute('nonexistent', 'user123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when room not live', async () => {
      const mockRoom = { id: 'room1', status: 'scheduled' };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(service.toggleMute('room1', 'user123')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when target participant not found', async () => {
      const mockRoom = { id: 'room1', status: 'live' };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.toggleMute('room1', 'user123', 'target')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-host tries to mute others', async () => {
      const mockRoom = { id: 'room1', status: 'live' };
      const mockTargetParticipant = { userId: 'target', isMuted: false };
      const mockCallerParticipant = { role: AudioRoomRole.LISTENER };
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findUnique.mockImplementation((args) => {
        if (args.where.roomId_userId.userId === 'target') return mockTargetParticipant;
        return mockCallerParticipant;
      });

      await expect(service.toggleMute('room1', 'caller', 'target')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listParticipants', () => {
    it('should list participants with role filter', async () => {
      const roomId = 'room1';
      const mockParticipants = [
        { id: 'part1', role: AudioRoomRole.LISTENER },
        { id: 'part2', role: AudioRoomRole.SPEAKER },
      ];
      const mockRoom = { id: roomId };

      mockPrismaService.audioRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.audioRoomParticipant.findMany.mockResolvedValue(mockParticipants);

      const result = await service.listParticipants(roomId, undefined, AudioRoomRole.LISTENER);

      expect(result.data).toEqual(mockParticipants);
      expect(mockPrismaService.audioRoomParticipant.findMany).toHaveBeenCalledWith({
        where: { roomId, role: AudioRoomRole.LISTENER },
        select: expect.any(Object),
        take: 51, // A16-#15: limit+1 for accurate hasMore detection
        orderBy: { joinedAt: 'desc' },
      });
    });

    it('should throw NotFoundException when room not found', async () => {
      mockPrismaService.audioRoom.findUnique.mockResolvedValue(null);

      await expect(service.listParticipants('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});