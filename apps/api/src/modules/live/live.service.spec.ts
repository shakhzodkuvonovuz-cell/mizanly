import { Test } from '@nestjs/testing';
import { LiveService } from './live.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('LiveService', () => {
  let service: LiveService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      liveSession: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      liveParticipant: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,LiveService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(LiveService);
  });

  describe('create', () => {
    it('creates a live session', async () => {
      prisma.liveSession.create.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      const result = await service.create('user1', { title: 'Test', liveType: 'VIDEO_STREAM' });
      expect(result.id).toBe('live1');
    });

    it('creates scheduled session', async () => {
      prisma.liveSession.create.mockResolvedValue({ id: 'live1', status: 'SCHEDULED' });
      const result = await service.create('user1', { title: 'Test', liveType: 'AUDIO_SPACE', scheduledAt: '2026-04-01T10:00:00Z' });
      expect(result.status).toBe('SCHEDULED');
    });
  });

  describe('endLive', () => {
    it('ends a live session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1', status: 'LIVE' });
      prisma.liveParticipant.updateMany.mockResolvedValue({});
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', status: 'ENDED' });
      const result = await service.endLive('live1', 'user1');
      expect(result.status).toBe('ENDED');
    });

    it('rejects non-host', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'other' });
      await expect(service.endLive('live1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join', () => {
    it('increments viewer count', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE', hostId: 'h', participants: [] });
      prisma.liveParticipant.findUnique.mockResolvedValue(null);
      prisma.liveParticipant.create.mockResolvedValue({});
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', currentViewers: 5, peakViewers: 10 });
      const result = await service.join('live1', 'user1');
      expect(result.joined).toBe(true);
    });
  });
});