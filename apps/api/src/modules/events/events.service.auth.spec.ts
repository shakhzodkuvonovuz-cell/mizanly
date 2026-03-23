import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EventsService } from './events.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EventsService — authorization matrix', () => {
  let service: EventsService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';
  const mockEvent = { id: 'event-1', userId: userA, title: 'Test Event' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        EventsService,
        {
          provide: PrismaService,
          useValue: {
            event: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            eventRSVP: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), upsert: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
            user: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get(PrismaService);
  });

  it('should allow organizer to update event', async () => {
    prisma.event.findUnique.mockResolvedValue(mockEvent);
    prisma.event.update.mockResolvedValue({ ...mockEvent, title: 'Updated' });
    const result = await service.updateEvent(userA, 'event-1', { title: 'Updated' } as any);
    expect(result).toBeDefined();
    expect(result.title).toBe('Updated');
  });

  it('should throw ForbiddenException when non-organizer updates', async () => {
    prisma.event.findUnique.mockResolvedValue(mockEvent);
    await expect(service.updateEvent(userB, 'event-1', { title: 'Hacked' } as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('should allow organizer to delete event', async () => {
    prisma.event.findUnique.mockResolvedValue(mockEvent);
    prisma.event.delete.mockResolvedValue({});
    const result = await service.deleteEvent(userA, 'event-1');
    expect(result).toBeDefined();
    expect(prisma.event.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'event-1' } }));
  });

  it('should throw ForbiddenException when non-organizer deletes', async () => {
    prisma.event.findUnique.mockResolvedValue(mockEvent);
    await expect(service.deleteEvent(userB, 'event-1')).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException for non-existent event update', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.updateEvent(userA, 'nonexistent', {} as any))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException for non-existent event delete', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.deleteEvent(userA, 'nonexistent'))
      .rejects.toThrow(NotFoundException);
  });
});
