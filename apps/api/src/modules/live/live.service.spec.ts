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
      $executeRaw: jest.fn().mockResolvedValue(1),
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

    it('rejects joining ended session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'ENDED', hostId: 'h' });
      await expect(service.join('live1', 'user1')).rejects.toThrow();
    });

    it('rejects joining non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.join('bad', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('leave', () => {
    it('decrements viewer count', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE', hostId: 'h' });
      prisma.liveParticipant.findUnique.mockResolvedValue({ id: 'lp1' });
      prisma.liveParticipant.update.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      await service.leave('live1', 'user1');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('getScheduled', () => {
    it('returns scheduled sessions', async () => {
      prisma.liveSession.findMany.mockResolvedValue([
        { id: 'live1', status: 'SCHEDULED', scheduledAt: new Date() },
      ]);
      const result = await service.getScheduled();
      expect(result.data).toHaveLength(1);
    });

    it('returns empty when no scheduled sessions', async () => {
      prisma.liveSession.findMany.mockResolvedValue([]);
      const result = await service.getScheduled();
      expect(result.data).toEqual([]);
    });
  });

  describe('getActive', () => {
    it('returns currently live sessions', async () => {
      prisma.liveSession.findMany.mockResolvedValue([
        { id: 'live1', status: 'LIVE', currentViewers: 50 },
      ]);
      const result = await service.getActive();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('live1');
    });
  });

  describe('getHostSessions', () => {
    it('returns host history with pagination', async () => {
      prisma.liveSession.findMany.mockResolvedValue([
        { id: 'live1', status: 'ENDED' },
      ]);
      const result = await service.getHostSessions('user1');
      expect(result.data).toHaveLength(1);
    });

    it('returns empty when no sessions', async () => {
      prisma.liveSession.findMany.mockResolvedValue([]);
      const result = await service.getHostSessions('user1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getById', () => {
    it('returns session with participants', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE', host: {}, participants: [] });
      const result = await service.getById('live1');
      expect(result.id).toBe('live1');
    });

    it('throws NotFoundException for missing session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('startLive', () => {
    it('starts a scheduled session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1', status: 'SCHEDULED' });
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      const result = await service.startLive('live1', 'user1');
      expect(result.status).toBe('LIVE');
    });

    it('throws BadRequestException for already live session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1', status: 'LIVE' });
      await expect(service.startLive('live1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException for non-host', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'other', status: 'SCHEDULED' });
      await expect(service.startLive('live1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelLive', () => {
    it('cancels a scheduled session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1', status: 'SCHEDULED' });
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', status: 'CANCELLED' });
      const result = await service.cancelLive('live1', 'user1');
      expect(result.status).toBe('CANCELLED');
    });

    it('throws BadRequestException for ended session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1', status: 'ENDED' });
      await expect(service.cancelLive('live1', 'user1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('endLive — edge cases', () => {
    it('throws BadRequestException for non-live session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1', status: 'SCHEDULED' });
      await expect(service.endLive('live1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.endLive('nonexistent', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('leave — edge cases', () => {
    it('returns left true when participant not found', async () => {
      prisma.liveParticipant.findUnique.mockResolvedValue(null);
      const result = await service.leave('live1', 'user1');
      expect(result).toEqual({ left: true });
    });

    it('returns left true when already left', async () => {
      prisma.liveParticipant.findUnique.mockResolvedValue({ id: 'lp1', leftAt: new Date() });
      const result = await service.leave('live1', 'user1');
      expect(result).toEqual({ left: true });
    });
  });

  describe('raiseHand', () => {
    it('should update participant role to raised_hand', async () => {
      prisma.liveParticipant.update.mockResolvedValue({ role: 'raised_hand' });
      const result = await service.raiseHand('live1', 'user1');
      expect(result.role).toBe('raised_hand');
    });
  });

  describe('promoteToSpeaker', () => {
    it('should promote participant to speaker', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      prisma.liveParticipant.update.mockResolvedValue({ role: 'speaker' });
      const result = await service.promoteToSpeaker('live1', 'host1', 'user1');
      expect(result.role).toBe('speaker');
    });
  });

  describe('demoteToViewer', () => {
    it('should demote participant to viewer', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      prisma.liveParticipant.update.mockResolvedValue({ role: 'viewer' });
      const result = await service.demoteToViewer('live1', 'host1', 'user1');
      expect(result.role).toBe('viewer');
    });
  });

  describe('updateRecording', () => {
    it('should update recording URL', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1' });
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', recordingUrl: 'https://cdn.example.com/rec.mp4' });
      const result = await service.updateRecording('live1', 'user1', 'https://cdn.example.com/rec.mp4');
      expect(result.recordingUrl).toBe('https://cdn.example.com/rec.mp4');
    });
  });
});