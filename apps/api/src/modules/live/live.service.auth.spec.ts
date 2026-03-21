import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { LiveService } from './live.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('LiveService — authorization matrix', () => {
  let service: LiveService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';
  const mockSession = { id: 'live-1', hostId: userA, userId: userA, status: 'LIVE' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        LiveService,
        {
          provide: PrismaService,
          useValue: {
            liveSession: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            liveParticipant: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            liveGuest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), upsert: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LiveService>(LiveService);
    prisma = module.get(PrismaService);
  });

  it('should allow host to end stream', async () => {
    prisma.liveSession.findUnique.mockResolvedValue(mockSession);
    prisma.liveSession.update.mockResolvedValue({ ...mockSession, status: 'ENDED' });
    const result = await service.endLive('live-1', userA);
    expect(result).toBeDefined();
  });

  it('should throw ForbiddenException when non-host ends stream', async () => {
    prisma.liveSession.findUnique.mockResolvedValue(mockSession);
    await expect(service.endLive('live-1', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when non-host removes guest', async () => {
    prisma.liveSession.findUnique.mockResolvedValue(mockSession);
    await expect(service.removeGuest('live-1', 'guest-1', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when non-host toggles subscribers only', async () => {
    prisma.liveSession.findUnique.mockResolvedValue(mockSession);
    await expect(service.setSubscribersOnly('live-1', userB, true)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException for non-existent session', async () => {
    prisma.liveSession.findUnique.mockResolvedValue(null);
    await expect(service.endLive('nonexistent', userA)).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when non-host invites guests', async () => {
    prisma.liveSession.findUnique.mockResolvedValue(mockSession);
    await expect(service.inviteGuest('live-1', userB, userB)).rejects.toThrow(ForbiddenException);
  });
});
