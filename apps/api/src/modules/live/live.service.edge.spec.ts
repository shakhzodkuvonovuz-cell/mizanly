import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { LiveService } from './live.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('LiveService — edge cases', () => {
  let service: LiveService;
  let prisma: any;

  const userId = 'user-edge-1';

  const mockSession = {
    id: 'live-1',
    userId,
    title: 'Test Stream',
    status: 'LIVE',
    liveType: 'VIDEO',
    viewerCount: 0,
    maxGuests: 4,
    subscribersOnly: false,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        LiveService,
        {
          provide: PrismaService,
          useValue: {
            liveSession: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            liveParticipant: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            liveGuest: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LiveService>(LiveService);
    prisma = module.get(PrismaService);
  });

  describe('inviteGuest — edge cases', () => {
    it('should throw ForbiddenException when non-host tries to invite', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ ...mockSession, hostId: 'other-user' });

      await expect(service.inviteGuest('live-1', 'guest-id', userId))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('endLive — edge cases', () => {
    it('should throw NotFoundException for non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);

      await expect(service.endLive('nonexistent', userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-host tries to end', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ ...mockSession, hostId: 'other-user' });

      await expect(service.endLive('live-1', userId))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getActive — edge cases', () => {
    it('should return empty when no streams are active', async () => {
      const result = await service.getActive();
      expect(result.data).toEqual([]);
    });
  });

  describe('setSubscribersOnly — edge cases', () => {
    it('should throw ForbiddenException when non-host toggles', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ ...mockSession, hostId: 'other-user' });

      await expect(service.setSubscribersOnly('live-1', userId, true))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getById — edge cases', () => {
    it('should throw NotFoundException for non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);

      await expect(service.getById('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
