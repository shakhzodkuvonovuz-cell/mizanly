import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EventsController', () => {
  let controller: EventsController;
  let service: jest.Mocked<EventsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        ...globalMockProviders,
        {
          provide: EventsService,
          useValue: {
            createEvent: jest.fn(),
            listEvents: jest.fn(),
            getEvent: jest.fn(),
            updateEvent: jest.fn(),
            deleteEvent: jest.fn(),
            rsvpToEvent: jest.fn(),
            removeRsvp: jest.fn(),
            listAttendees: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(EventsController);
    service = module.get(EventsService) as jest.Mocked<EventsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createEvent', () => {
    it('should call service.createEvent with userId and dto', async () => {
      const dto = { title: 'Friday Lecture', startDate: '2026-04-01T18:00:00Z' };
      service.createEvent.mockResolvedValue({ id: 'event-1', ...dto } as any);

      const result = await controller.createEvent(userId, dto as any);

      expect(service.createEvent).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ title: 'Friday Lecture' }));
    });
  });

  describe('listEvents', () => {
    it('should call service.listEvents with all params', async () => {
      service.listEvents.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.listEvents(userId, 'cursor-1', 10, 'public', 'online');

      expect(service.listEvents).toHaveBeenCalledWith(userId, 'cursor-1', 10, 'public', 'online');
    });
  });

  describe('getEvent', () => {
    it('should call service.getEvent with id and userId', async () => {
      service.getEvent.mockResolvedValue({ id: 'event-1', title: 'Test' } as any);

      const result = await controller.getEvent(userId, 'event-1');

      expect(service.getEvent).toHaveBeenCalledWith('event-1', userId);
      expect(result).toEqual(expect.objectContaining({ id: 'event-1' }));
    });

    it('should propagate NotFoundException', async () => {
      service.getEvent.mockRejectedValue(new NotFoundException('Event not found'));

      await expect(controller.getEvent(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateEvent', () => {
    it('should call service.updateEvent with userId, id, and dto', async () => {
      const dto = { title: 'Updated Lecture' };
      service.updateEvent.mockResolvedValue({ id: 'event-1', title: 'Updated Lecture' } as any);

      const result = await controller.updateEvent(userId, 'event-1', dto as any);

      expect(service.updateEvent).toHaveBeenCalledWith(userId, 'event-1', dto);
      expect(result).toEqual(expect.objectContaining({ title: 'Updated Lecture' }));
    });
  });

  describe('rsvpToEvent', () => {
    it('should call service.rsvpToEvent with userId, eventId, and status', async () => {
      service.rsvpToEvent.mockResolvedValue({ status: 'going' } as any);

      const result = await controller.rsvpToEvent(userId, 'event-1', { status: 'going' });

      expect(service.rsvpToEvent).toHaveBeenCalledWith(userId, 'event-1', 'going');
      expect(result).toEqual({ status: 'going' });
    });
  });

  describe('removeRsvp', () => {
    it('should call service.removeRsvp with userId and eventId', async () => {
      service.removeRsvp.mockResolvedValue(undefined as any);

      const result = await controller.removeRsvp(userId, 'event-1');

      expect(service.removeRsvp).toHaveBeenCalledWith(userId, 'event-1');
      expect(result).toBeNull();
    });
  });

  describe('listAttendees', () => {
    it('should call service.listAttendees with all params', async () => {
      service.listAttendees.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.listAttendees('event-1', 'cursor-1', 25, 'going');

      expect(service.listAttendees).toHaveBeenCalledWith('event-1', 'cursor-1', 25, 'going');
    });
  });

  describe('deleteEvent', () => {
    it('should call service.deleteEvent with userId and id', async () => {
      service.deleteEvent.mockResolvedValue(undefined as any);

      const result = await controller.deleteEvent(userId, 'event-1');

      expect(service.deleteEvent).toHaveBeenCalledWith(userId, 'event-1');
      expect(result).toBeNull();
    });
  });
});
