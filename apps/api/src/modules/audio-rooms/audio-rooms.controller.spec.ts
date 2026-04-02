import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AudioRoomsController } from './audio-rooms.controller';
import { AudioRoomsService } from './audio-rooms.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AudioRoomsController', () => {
  let controller: AudioRoomsController;
  let service: jest.Mocked<AudioRoomsService>;

  const userId = 'user-123';
  const roomId = 'room-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AudioRoomsController],
      providers: [
        ...globalMockProviders,
        {
          provide: AudioRoomsService,
          useValue: {
            create: jest.fn(),
            list: jest.fn(),
            getById: jest.fn(),
            endRoom: jest.fn(),
            join: jest.fn(),
            leave: jest.fn(),
            changeRole: jest.fn(),
            toggleHand: jest.fn(),
            toggleMute: jest.fn(),
            listParticipants: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(AudioRoomsController);
    service = module.get(AudioRoomsService) as jest.Mocked<AudioRoomsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call audioRoomsService.create with userId and dto', async () => {
      const dto = { title: 'Islamic Discussion', description: 'Weekly talk' };
      const mockRoom = { id: roomId, hostId: userId, title: 'Islamic Discussion', status: 'LIVE' };
      service.create.mockResolvedValue(mockRoom as any);

      const result = await controller.create(userId, dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ title: 'Islamic Discussion', status: 'LIVE' }));
    });
  });

  describe('list', () => {
    it('should call audioRoomsService.list with parsed limit', async () => {
      const mockList = { data: [{ id: roomId }], meta: { cursor: null, hasMore: false } };
      service.list.mockResolvedValue(mockList as any);

      const result = await controller.list(userId, 'cursor-1', '10');

      expect(service.list).toHaveBeenCalledWith(userId, 'cursor-1', 10);
      expect(result).toEqual(mockList);
    });

    it('should default limit to 20 when not provided', async () => {
      service.list.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.list(userId);

      expect(service.list).toHaveBeenCalledWith(userId, undefined, 20);
    });
  });

  describe('getById', () => {
    it('should call audioRoomsService.getById with id and viewerId', async () => {
      const mockRoom = { id: roomId, title: 'Room', participantCount: 5 };
      service.getById.mockResolvedValue(mockRoom as any);

      const result = await controller.getById(roomId, userId);

      expect(service.getById).toHaveBeenCalledWith(roomId, userId);
      expect(result).toEqual(expect.objectContaining({ id: roomId }));
    });

    it('should propagate NotFoundException', async () => {
      service.getById.mockRejectedValue(new NotFoundException('Room not found'));

      await expect(controller.getById('nonexistent', userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('endRoom', () => {
    it('should call audioRoomsService.endRoom with id and userId', async () => {
      service.endRoom.mockResolvedValue({ ended: true } as any);

      const result = await controller.endRoom(roomId, userId);

      expect(service.endRoom).toHaveBeenCalledWith(roomId, userId);
      expect(result).toEqual({ ended: true });
    });

    it('should propagate ForbiddenException for non-host', async () => {
      service.endRoom.mockRejectedValue(new ForbiddenException('Only host can end'));

      await expect(controller.endRoom(roomId, 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join', () => {
    it('should call audioRoomsService.join with id and userId', async () => {
      service.join.mockResolvedValue({ role: 'LISTENER', roomId } as any);

      const result = await controller.join(roomId, userId);

      expect(service.join).toHaveBeenCalledWith(roomId, userId);
      expect(result).toEqual(expect.objectContaining({ role: 'LISTENER' }));
    });
  });

  describe('leave', () => {
    it('should call audioRoomsService.leave with id and userId', async () => {
      service.leave.mockResolvedValue({ left: true } as any);

      const result = await controller.leave(roomId, userId);

      expect(service.leave).toHaveBeenCalledWith(roomId, userId);
      expect(result).toEqual({ left: true });
    });
  });

  describe('changeRole', () => {
    it('should call audioRoomsService.changeRole with id, userId, and dto', async () => {
      const dto = { targetUserId: 'user-2', role: 'SPEAKER' };
      service.changeRole.mockResolvedValue({ updated: true } as any);

      const result = await controller.changeRole(roomId, userId, dto as any);

      expect(service.changeRole).toHaveBeenCalledWith(roomId, userId, dto);
      expect(result).toEqual({ updated: true });
    });
  });

  describe('toggleHand', () => {
    it('should call audioRoomsService.toggleHand with id and userId', async () => {
      service.toggleHand.mockResolvedValue({ handRaised: true } as any);

      const result = await controller.toggleHand(roomId, userId, {} as any);

      expect(service.toggleHand).toHaveBeenCalledWith(roomId, userId);
      expect(result).toEqual({ handRaised: true });
    });
  });

  describe('toggleMute', () => {
    it('should call audioRoomsService.toggleMute with id, userId, and targetUserId', async () => {
      service.toggleMute.mockResolvedValue({ muted: true } as any);

      const result = await controller.toggleMute(roomId, userId, { targetUserId: 'user-2' } as any);

      expect(service.toggleMute).toHaveBeenCalledWith(roomId, userId, 'user-2');
      expect(result).toEqual({ muted: true });
    });
  });

  describe('listParticipants', () => {
    it('should call audioRoomsService.listParticipants with parsed params', async () => {
      const mockList = { data: [{ userId, role: 'SPEAKER' }], meta: { cursor: null, hasMore: false } };
      service.listParticipants.mockResolvedValue(mockList as any);

      const result = await controller.listParticipants(roomId, userId, 'SPEAKER' as any, 'cursor-1', '25');

      expect(service.listParticipants).toHaveBeenCalledWith(roomId, userId, 'SPEAKER', 'cursor-1', 25);
      expect(result).toEqual(mockList);
    });

    it('should default limit to 50 when not provided', async () => {
      service.listParticipants.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.listParticipants(roomId);

      expect(service.listParticipants).toHaveBeenCalledWith(roomId, undefined, undefined, undefined, 50);
    });
  });

  // T11 rows 100-105: Missing audio-rooms controller tests
  describe('getActiveRooms', () => {
    it('should call audioRoomsService.getActiveRooms with cursor', async () => {
      service.getActiveRooms = jest.fn().mockResolvedValue({ data: [{ id: 'room-1' }], meta: { hasMore: false } });
      const result = await controller.getActiveRooms('cursor-1');
      expect(service.getActiveRooms).toHaveBeenCalledWith('cursor-1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getUpcomingRooms', () => {
    it('should call audioRoomsService.getUpcomingRooms with cursor', async () => {
      service.getUpcomingRooms = jest.fn().mockResolvedValue({ data: [], meta: { hasMore: false } });
      const result = await controller.getUpcomingRooms('cursor-1');
      expect(service.getUpcomingRooms).toHaveBeenCalledWith('cursor-1');
      expect(result.data).toEqual([]);
    });
  });

  describe('listRecordings', () => {
    it('should call audioRoomsService.listRecordings with userId', async () => {
      service.listRecordings = jest.fn().mockResolvedValue([{ id: 'room-1', recordingUrl: 'url' }]);
      const result = await controller.listRecordings(userId);
      expect(service.listRecordings).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('getRecording', () => {
    it('should call audioRoomsService.getRecording with roomId', async () => {
      service.getRecording = jest.fn().mockResolvedValue({ id: roomId, recordingUrl: 'url' });
      const result = await controller.getRecording(roomId);
      expect(service.getRecording).toHaveBeenCalledWith(roomId);
      expect(result).toEqual(expect.objectContaining({ recordingUrl: 'url' }));
    });
  });

  describe('startRecording', () => {
    it('should call audioRoomsService.startRecording with id and userId', async () => {
      service.startRecording = jest.fn().mockResolvedValue({ isRecording: true });
      const result = await controller.startRecording(roomId, userId);
      expect(service.startRecording).toHaveBeenCalledWith(roomId, userId);
      expect(result).toEqual(expect.objectContaining({ isRecording: true }));
    });
  });

  describe('stopRecording', () => {
    it('should call audioRoomsService.stopRecording with id, userId, and url', async () => {
      service.stopRecording = jest.fn().mockResolvedValue({ isRecording: false, recordingUrl: 'https://rec.mp3' });
      const result = await controller.stopRecording(roomId, userId, { recordingUrl: 'https://rec.mp3' } as any);
      expect(service.stopRecording).toHaveBeenCalledWith(roomId, userId, 'https://rec.mp3');
      expect(result).toEqual(expect.objectContaining({ isRecording: false }));
    });
  });
});
