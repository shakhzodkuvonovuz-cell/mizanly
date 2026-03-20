import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { EventsService } from './events.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    event: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    eventRSVP: {
      create: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        EventsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    const baseDto = {
      title: 'Test Event',
      description: 'Test Description',
      coverUrl: 'https://example.com/cover.jpg',
      startDate: '2026-03-20T10:00:00Z',
      endDate: '2026-03-20T12:00:00Z',
      location: 'Test Location',
      isOnline: false,
      eventType: 'in_person',
    };
    const baseEvent = {
      id: 'event1',
      userId: 'user1',
      title: 'Test Event',
      description: 'Test Description',
      coverUrl: 'https://example.com/cover.jpg',
      startDate: new Date('2026-03-20T10:00:00Z'),
      endDate: new Date('2026-03-20T12:00:00Z'),
      location: 'Test Location',
      locationUrl: 'https://maps.example.com',
      isOnline: false,
      onlineUrl: undefined,
      eventType: 'in_person',
      privacy: 'public',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user1',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        isVerified: false,
      },
      community: null,
      _count: { rsvps: 0 },
    };

    it('should create event successfully', async () => {
      const userId = 'user1';
      const dto = baseDto;
      const mockEvent = baseEvent;
      mockPrismaService.event.create.mockResolvedValue(mockEvent);

      const result = await service.createEvent(userId, dto);

      expect(result).toEqual({
        ...mockEvent,
        goingCount: 0,
        maybeCount: 0,
        notGoingCount: 0,
      });
      expect(mockPrismaService.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: dto.title,
          startDate: dto.startDate,
          user: { connect: { id: userId } },
        }),
        include: expect.objectContaining({
          user: expect.any(Object),
          _count: expect.any(Object),
        }),
      });
    });

    it('should include community when communityId provided', async () => {
      const userId = 'user1';
      const dto = { ...baseDto, communityId: 'comm1' };
      const mockEvent = { ...baseEvent, community: { id: 'comm1', name: 'Community', avatarUrl: null } };
      mockPrismaService.event.create.mockResolvedValue(mockEvent);
      mockPrismaService.eventRSVP.count.mockResolvedValue(0);

      await service.createEvent(userId, dto);

      expect(mockPrismaService.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          communityId: 'comm1',
        }),
        include: expect.objectContaining({
          user: expect.any(Object),
          _count: expect.any(Object),
        }),
      });
    });
  });

  describe('listEvents', () => {
    it('should return paginated events with counts', async () => {
      const userId = 'user1';
      const mockEvents = [
        { id: 'event1', title: 'Event 1', userId: 'user1' },
        { id: 'event2', title: 'Event 2', userId: 'user2' },
      ];
      mockPrismaService.event.findMany.mockResolvedValue(mockEvents);
      mockPrismaService.eventRSVP.groupBy.mockResolvedValue([]);

      const result = await service.listEvents(userId, undefined, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ cursor: null, hasMore: false });
      expect(mockPrismaService.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          take: 21,
          orderBy: { startDate: 'desc' },
        }),
      );
    });

    it('should handle cursor pagination', async () => {
      const cursor = 'event1';
      mockPrismaService.event.findMany.mockResolvedValue([{ id: 'event2' }]);
      mockPrismaService.eventRSVP.groupBy.mockResolvedValue([]);

      await service.listEvents('user1', cursor, 20);

      expect(mockPrismaService.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: cursor },
          skip: 1,
        }),
      );
    });

    it('should filter by privacy and eventType', async () => {
      mockPrismaService.event.findMany.mockResolvedValue([]);
      mockPrismaService.eventRSVP.groupBy.mockResolvedValue([]);

      await service.listEvents('user1', undefined, 20, 'public', 'in_person');

      expect(mockPrismaService.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { privacy: 'public', eventType: 'in_person' },
        }),
      );
    });

    it('should only show public events when userId is null', async () => {
      mockPrismaService.event.findMany.mockResolvedValue([]);
      mockPrismaService.eventRSVP.groupBy.mockResolvedValue([]);

      await service.listEvents(null, undefined, 20);

      expect(mockPrismaService.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { privacy: 'public' },
        }),
      );
    });
  });

  describe('getEvent', () => {
    it('should return event with counts and user RSVP', async () => {
      const eventId = 'event1';
      const userId = 'user1';
      const mockEvent = {
        id: eventId,
        userId: 'user2',
        privacy: 'public',
        title: 'Test Event',
        user: { id: 'user2', username: 'user2' },
        community: null,
        _count: { rsvps: 10 },
      };
      mockPrismaService.event.findUnique.mockResolvedValue(mockEvent);
      mockPrismaService.eventRSVP.count
        .mockResolvedValueOnce(5) // goingCount
        .mockResolvedValueOnce(2) // maybeCount
        .mockResolvedValueOnce(1); // notGoingCount
      mockPrismaService.eventRSVP.findUnique.mockResolvedValue({ status: 'going' });

      const result = await service.getEvent(eventId, userId);

      expect(result).toEqual({
        ...mockEvent,
        goingCount: 5,
        maybeCount: 2,
        notGoingCount: 1,
        userRsvp: 'going',
      });
      expect(mockPrismaService.event.findUnique).toHaveBeenCalledWith({
        where: { id: eventId },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException when event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.getEvent('missing-id', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when private event and user not owner', async () => {
      const mockEvent = {
        id: 'event1',
        userId: 'owner',
        privacy: 'private',
        user: {},
        community: null,
        _count: { rsvps: 0 },
      };
      mockPrismaService.event.findUnique.mockResolvedValue(mockEvent);

      await expect(service.getEvent('event1', 'other-user')).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to view private event', async () => {
      const mockEvent = {
        id: 'event1',
        userId: 'owner',
        privacy: 'private',
        user: {},
        community: null,
        _count: { rsvps: 0 },
      };
      mockPrismaService.event.findUnique.mockResolvedValue(mockEvent);
      mockPrismaService.eventRSVP.count.mockResolvedValue(0);
      mockPrismaService.eventRSVP.findUnique.mockResolvedValue(null);

      const result = await service.getEvent('event1', 'owner');
      expect(result).toHaveProperty('id', 'event1');
      expect(result.goingCount).toBe(0);
    });
  });

  describe('updateEvent', () => {
    it('should update event successfully', async () => {
      const userId = 'owner';
      const eventId = 'event1';
      const dto = { title: 'Updated Title' };
      const mockExisting = { id: eventId, userId };
      const mockUpdated = {
        id: eventId,
        userId,
        title: 'Updated Title',
        user: {},
        community: null,
        _count: { rsvps: 0 },
      };
      mockPrismaService.event.findUnique.mockResolvedValue(mockExisting);
      mockPrismaService.event.update.mockResolvedValue(mockUpdated);
      mockPrismaService.eventRSVP.count.mockResolvedValue(0);

      const result = await service.updateEvent(userId, eventId, dto);

      expect(result).toEqual({
        ...mockUpdated,
        goingCount: 0,
        maybeCount: 0,
        notGoingCount: 0,
      });
      expect(mockPrismaService.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { title: 'Updated Title' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException when event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.updateEvent('user1', 'missing-id', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      const mockExisting = { id: 'event1', userId: 'owner' };
      mockPrismaService.event.findUnique.mockResolvedValue(mockExisting);

      await expect(service.updateEvent('other-user', 'event1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteEvent', () => {
    it('should delete event successfully', async () => {
      const userId = 'owner';
      const eventId = 'event1';
      const mockExisting = { id: eventId, userId };
      mockPrismaService.event.findUnique.mockResolvedValue(mockExisting);
      mockPrismaService.event.delete.mockResolvedValue({});

      const result = await service.deleteEvent(userId, eventId);

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
    });

    it('should throw NotFoundException when event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.deleteEvent('user1', 'missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      const mockExisting = { id: 'event1', userId: 'owner' };
      mockPrismaService.event.findUnique.mockResolvedValue(mockExisting);

      await expect(service.deleteEvent('other-user', 'event1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rsvpToEvent', () => {
    const futureEvent = {
      id: 'event1', privacy: 'public', userId: 'owner',
      startDate: '2027-12-01T00:00:00Z', endDate: '2027-12-02T00:00:00Z',
    };

    it('should upsert RSVP for a public event', async () => {
      const userId = 'user1';
      const eventId = 'event1';
      const status = 'going' as const;
      mockPrismaService.event.findUnique.mockResolvedValue(futureEvent);
      const mockRsvp = { eventId, userId, status, user: {} };
      mockPrismaService.eventRSVP.upsert.mockResolvedValue(mockRsvp);

      const result = await service.rsvpToEvent(userId, eventId, status);

      expect(result).toEqual(mockRsvp);
      expect(mockPrismaService.eventRSVP.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId, userId } },
        update: { status },
        create: { eventId, userId, status },
        include: { user: expect.any(Object) },
      });
    });

    it('should throw NotFoundException when event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.rsvpToEvent('user1', 'missing-id', 'going')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for private event when user not owner', async () => {
      const privateEvent = { ...futureEvent, privacy: 'private' };
      mockPrismaService.event.findUnique.mockResolvedValue(privateEvent);

      await expect(service.rsvpToEvent('other-user', 'event1', 'going')).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to RSVP to private event', async () => {
      const privateEvent = { ...futureEvent, privacy: 'private' };
      mockPrismaService.event.findUnique.mockResolvedValue(privateEvent);
      mockPrismaService.eventRSVP.upsert.mockResolvedValue({ status: 'going' });

      const result = await service.rsvpToEvent('owner', 'event1', 'going');
      expect(result).toHaveProperty('status', 'going');
    });

    it('should throw BadRequestException for past events', async () => {
      const pastEvent = {
        ...futureEvent,
        startDate: '2020-01-01T00:00:00Z',
        endDate: '2020-01-02T00:00:00Z',
      };
      mockPrismaService.event.findUnique.mockResolvedValue(pastEvent);

      await expect(service.rsvpToEvent('user1', 'event1', 'going')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeRsvp', () => {
    it('should remove RSVP successfully', async () => {
      const userId = 'user1';
      const eventId = 'event1';
      mockPrismaService.eventRSVP.delete.mockResolvedValue({});

      const result = await service.removeRsvp(userId, eventId);

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.eventRSVP.delete).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId, userId } },
      });
    });

    it('should throw NotFoundException when RSVP not found (P2025)', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      mockPrismaService.eventRSVP.delete.mockRejectedValue(
        new PrismaClientKnownRequestError('Not found', { code: 'P2025', clientVersion: '0' }),
      );

      await expect(service.removeRsvp('user1', 'event1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAttendees', () => {
    it('should return paginated attendees', async () => {
      const eventId = 'event1';
      const mockRsvps = [
        { id: 'rsvp1', eventId, userId: 'user1', user: {} },
        { id: 'rsvp2', eventId, userId: 'user2', user: {} },
      ];
      mockPrismaService.event.findUnique.mockResolvedValue({ id: eventId });
      mockPrismaService.eventRSVP.findMany.mockResolvedValue(mockRsvps);

      const result = await service.listAttendees(eventId);

      expect(result.data).toEqual(mockRsvps);
      expect(mockPrismaService.eventRSVP.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId },
          take: 21,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should throw NotFoundException when event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.listAttendees('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should filter by status', async () => {
      const eventId = 'event1';
      mockPrismaService.event.findUnique.mockResolvedValue({ id: eventId });
      mockPrismaService.eventRSVP.findMany.mockResolvedValue([]);

      await service.listAttendees(eventId, undefined, 20, 'going');

      expect(mockPrismaService.eventRSVP.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId, status: 'going' },
        }),
      );
    });

    it('should handle cursor pagination', async () => {
      const eventId = 'event1';
      const cursor = 'rsvp1';
      mockPrismaService.event.findUnique.mockResolvedValue({ id: eventId });
      mockPrismaService.eventRSVP.findMany.mockResolvedValue([]);

      await service.listAttendees(eventId, cursor, 20);

      expect(mockPrismaService.eventRSVP.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: cursor },
          skip: 1,
        }),
      );
    });
  });
});