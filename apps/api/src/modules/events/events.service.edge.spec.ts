import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EventsService } from './events.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EventsService — edge cases', () => {
  let service: EventsService;
  let prisma: any;

  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        EventsService,
        {
          provide: PrismaService,
          useValue: {
            event: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            eventRSVP: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), upsert: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
            user: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get(PrismaService);
  });

  describe('createEvent — edge cases', () => {
    it('should accept Arabic event title', async () => {
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        title: 'ليلة القدر',
        userId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
      });

      const result = await service.createEvent(userId, {
        title: 'ليلة القدر',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      expect(result.title).toBe('ليلة القدر');
    });
  });

  describe('getEvent — edge cases', () => {
    it('should throw NotFoundException for non-existent event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getEvent('nonexistent', userId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('rsvpToEvent — edge cases', () => {
    it('should throw NotFoundException for non-existent event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.rsvpToEvent(userId, 'nonexistent', 'GOING'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteEvent — edge cases', () => {
    it('should throw NotFoundException for non-existent event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.deleteEvent(userId, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('listEvents — edge cases', () => {
    it('should return empty when no events exist', async () => {
      const result = await service.listEvents(userId);
      expect(result.data).toEqual([]);
    });
  });

  describe('removeRsvp — edge cases', () => {
    it('should remove RSVP when it exists', async () => {
      prisma.eventRSVP.delete.mockResolvedValue({});

      // removeRsvp returns void on success
      await expect(service.removeRsvp(userId, 'event-1')).resolves.toBeUndefined();
      expect(prisma.eventRSVP.delete).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: 'event-1', userId } },
      });
    });
  });
});
