import { Test } from '@nestjs/testing';
import { LiveService } from './live.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('LiveService', () => {
  let service: LiveService;
  let prisma: Record<string, any>;
  let redis: Record<string, any>;

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
      user: {
        findUnique: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    redis = {
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
      lrange: jest.fn().mockResolvedValue([]),
      publish: jest.fn().mockResolvedValue(1),
    };

    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,LiveService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'REDIS', useValue: redis },
      ],
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

    it('uses select-based query excluding credentials', async () => {
      prisma.liveSession.findMany.mockResolvedValue([]);
      await service.getScheduled();
      const callArgs = prisma.liveSession.findMany.mock.calls[0][0];
      expect(callArgs.select).toBeDefined();
      expect(callArgs.select.streamKey).toBeUndefined();
      expect(callArgs.select.host.select.id).toBe(true);
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

    it('uses select with host relation instead of include for lightweight queries', async () => {
      prisma.liveSession.findMany.mockResolvedValue([]);
      await service.getActive();
      const callArgs = prisma.liveSession.findMany.mock.calls[0][0];
      // Should use select (not include) for lightweight list view
      expect(callArgs.select).toBeDefined();
      expect(callArgs.include).toBeUndefined();
      // Host should use selective fields
      expect(callArgs.select.host).toEqual({
        select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
      });
      // streamKey should NOT be selected (it's a credential)
      expect(callArgs.select.streamKey).toBeUndefined();
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

    it('uses select-based query with host relation', async () => {
      prisma.liveSession.findMany.mockResolvedValue([]);
      await service.getHostSessions('user1');
      const callArgs = prisma.liveSession.findMany.mock.calls[0][0];
      expect(callArgs.select).toBeDefined();
      expect(callArgs.select.host).toBeDefined();
      expect(callArgs.select.streamKey).toBeUndefined();
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
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      prisma.liveParticipant.findUnique.mockResolvedValue({ sessionId: 'live1', userId: 'user1', role: 'VIEWER' });
      prisma.liveParticipant.update.mockResolvedValue({ role: 'RAISED_HAND' });
      const result = await service.raiseHand('live1', 'user1');
      expect(result.role).toBe('RAISED_HAND');
    });
  });

  describe('promoteToSpeaker', () => {
    it('should promote participant to speaker', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      prisma.liveParticipant.update.mockResolvedValue({ role: 'SPEAKER' });
      const result = await service.promoteToSpeaker('live1', 'host1', 'user1');
      expect(result.role).toBe('SPEAKER');
    });
  });

  describe('demoteToViewer', () => {
    it('should demote participant to viewer', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      prisma.liveParticipant.update.mockResolvedValue({ role: 'VIEWER' });
      const result = await service.demoteToViewer('live1', 'host1', 'user1');
      expect(result.role).toBe('VIEWER');
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

  // T11 rows 86-99: Missing live service tests

  describe('inviteGuest', () => {
    beforeEach(() => {
      prisma.liveGuest = {
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn().mockResolvedValue({ liveId: 'live1', userId: 'guest1', status: 'INVITED', user: { id: 'guest1' } }),
      };
    });

    it('should invite guest when host and under max', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', status: 'LIVE' });
      const result = await service.inviteGuest('live1', 'guest1', 'host1');
      expect(result.status).toBe('INVITED');
      expect(prisma.liveGuest.upsert).toHaveBeenCalled();
    });

    it('should reject when max 4 guests reached', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', status: 'LIVE' });
      prisma.liveGuest.count.mockResolvedValue(4);
      await expect(service.inviteGuest('live1', 'guest5', 'host1')).rejects.toThrow(BadRequestException);
    });

    it('should reject when non-host invites', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', status: 'LIVE' });
      await expect(service.inviteGuest('live1', 'guest1', 'not-host')).rejects.toThrow(ForbiddenException);
    });

    it('should reject when session not live', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', status: 'SCHEDULED' });
      await expect(service.inviteGuest('live1', 'guest1', 'host1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptGuestInvite', () => {
    beforeEach(() => {
      prisma.liveGuest = {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ status: 'ACCEPTED', user: { id: 'guest1' } }),
      };
      prisma.$transaction = jest.fn().mockImplementation((fn) => fn(prisma));
    });

    it('should accept a pending invite', async () => {
      prisma.liveGuest.findUnique.mockResolvedValue({ liveId: 'live1', userId: 'guest1', status: 'INVITED' });
      const result = await service.acceptGuestInvite('live1', 'guest1');
      expect(result.status).toBe('ACCEPTED');
    });

    it('should reject when no pending invite', async () => {
      prisma.liveGuest.findUnique.mockResolvedValue(null);
      await expect(service.acceptGuestInvite('live1', 'guest1')).rejects.toThrow(NotFoundException);
    });

    it('should reject when max 4 already accepted', async () => {
      prisma.liveGuest.findUnique.mockResolvedValue({ liveId: 'live1', userId: 'guest1', status: 'INVITED' });
      prisma.liveGuest.count.mockResolvedValue(4);
      await expect(service.acceptGuestInvite('live1', 'guest1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeGuest', () => {
    beforeEach(() => {
      prisma.liveGuest = {
        update: jest.fn().mockResolvedValue({ status: 'REMOVED' }),
      };
    });

    it('should remove guest as host', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      const result = await service.removeGuest('live1', 'guest1', 'host1');
      expect(result.status).toBe('REMOVED');
    });

    it('should reject when non-host removes', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      await expect(service.removeGuest('live1', 'guest1', 'not-host')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listGuests', () => {
    beforeEach(() => {
      prisma.liveGuest = {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'g1', status: 'ACCEPTED', user: { id: 'g1' } },
          { userId: 'g2', status: 'INVITED', user: { id: 'g2' } },
        ]),
      };
    });

    it('should return guests for a session', async () => {
      const result = await service.listGuests('live1');
      expect(result).toHaveLength(2);
      expect(prisma.liveGuest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { liveId: 'live1', status: { in: ['INVITED', 'ACCEPTED'] } },
      }));
    });
  });

  describe('startRehearsal', () => {
    it('should create a rehearsal session', async () => {
      prisma.liveSession.create.mockResolvedValue({ id: 'live2', isRehearsal: true, status: 'LIVE' });
      const result = await service.startRehearsal('host1', { title: 'Test Rehearsal' });
      expect(result.isRehearsal).toBe(true);
      expect(prisma.liveSession.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ isRehearsal: true, hostId: 'host1' }),
      }));
    });
  });

  describe('goLiveFromRehearsal', () => {
    it('should transition rehearsal to public live', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', isRehearsal: true, status: 'LIVE' });
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', isRehearsal: false });
      const result = await service.goLiveFromRehearsal('live1', 'host1');
      expect(result.isRehearsal).toBe(false);
    });

    it('should reject when not in rehearsal mode', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', isRehearsal: false, status: 'LIVE' });
      await expect(service.goLiveFromRehearsal('live1', 'host1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('endRehearsal', () => {
    it('should end a rehearsal session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', isRehearsal: true, status: 'LIVE' });
      prisma.liveParticipant.updateMany.mockResolvedValue({});
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', status: 'ENDED' });
      const result = await service.endRehearsal('live1', 'host1');
      expect(result.status).toBe('ENDED');
    });

    it('should reject when not in rehearsal mode', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', isRehearsal: false, status: 'LIVE' });
      await expect(service.endRehearsal('live1', 'host1')).rejects.toThrow(BadRequestException);
    });

    it('should reject when already ended', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', isRehearsal: true, status: 'ENDED' });
      await expect(service.endRehearsal('live1', 'host1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('setSubscribersOnly', () => {
    it('should toggle subscribers-only mode', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', isSubscribersOnly: true });
      const result = await service.setSubscribersOnly('live1', 'host1', true);
      expect(result.isSubscribersOnly).toBe(true);
    });

    it('should reject non-host', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1' });
      await expect(service.setSubscribersOnly('live1', 'not-host', true)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join — subscribers-only enforcement', () => {
    beforeEach(() => {
      prisma.follow = { findUnique: jest.fn() };
    });

    it('should reject non-follower when subscribers-only', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        id: 'live1', hostId: 'host1', status: 'LIVE', isSubscribersOnly: true,
        currentViewers: 0, participants: [],
      });
      prisma.follow.findUnique.mockResolvedValue(null);
      await expect(service.join('live1', 'viewer1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join — host short-circuit', () => {
    it('should return joined for host without creating participant', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        id: 'live1', hostId: 'host1', status: 'LIVE', isSubscribersOnly: false,
        currentViewers: 5, participants: [],
      });
      const result = await service.join('live1', 'host1');
      expect(result.joined).toBe(true);
      expect(prisma.liveParticipant.create).not.toHaveBeenCalled();
    });
  });

  describe('startLive — CANCELLED rejection', () => {
    it('should reject starting a cancelled session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', status: 'CANCELLED' });
      await expect(service.startLive('live1', 'host1')).rejects.toThrow(BadRequestException);
    });
  });

  // T11 row 95: join re-join after leaving
  describe('join — re-join after leaving', () => {
    it('should update existing participant and only increment currentViewers (not totalViews)', async () => {
      prisma.liveSession.findUnique
        .mockResolvedValueOnce({
          id: 'live1', hostId: 'host1', status: 'LIVE', isSubscribersOnly: false,
          currentViewers: 5, participants: [],
        }) // getById
        .mockResolvedValueOnce({ currentViewers: 6 }); // after re-join
      prisma.liveParticipant.findUnique.mockResolvedValue({ sessionId: 'live1', userId: 'viewer1', leftAt: new Date() }); // existing + leftAt set
      prisma.liveParticipant.update.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.join('live1', 'viewer1');
      expect(result.joined).toBe(true);
      // Should update (re-join), not create
      expect(prisma.liveParticipant.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { sessionId_userId: { sessionId: 'live1', userId: 'viewer1' } },
        data: expect.objectContaining({ leftAt: null }),
      }));
      expect(prisma.liveParticipant.create).not.toHaveBeenCalled();
    });
  });

  // T11 row 99: startLive — Stream integration failure fallback
  describe('startLive — Stream failure fallback', () => {
    it('should continue without Stream when createLiveInput fails', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'host1', status: 'SCHEDULED', title: 'Test' });
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', status: 'LIVE', startedAt: new Date() });
      // Stream service throws
      const streamService = (service as any).stream;
      streamService.createLiveInput = jest.fn().mockRejectedValue(new Error('Cloudflare API down'));

      const result = await service.startLive('live1', 'host1');
      expect(result).toBeDefined();
      // Should still update to LIVE despite Stream failure
      expect(prisma.liveSession.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'LIVE' }),
      }));
    });
  });

  describe('getParticipants', () => {
    it('returns paginated participants for existing session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1' });
      const mockParticipants = [
        { userId: 'u1', role: 'VIEWER', joinedAt: new Date(), user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false } },
        { userId: 'u2', role: 'SPEAKER', joinedAt: new Date(), user: { id: 'u2', username: 'user2', displayName: 'User 2', avatarUrl: null, isVerified: true } },
      ];
      prisma.liveParticipant.findMany = jest.fn().mockResolvedValue(mockParticipants);

      const result = await service.getParticipants('live1');
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
    });

    it('throws NotFoundException for non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.getParticipants('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns hasMore when more than limit', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1' });
      const many = Array.from({ length: 21 }, (_, i) => ({
        userId: `u${i}`, role: 'VIEWER', joinedAt: new Date(),
        user: { id: `u${i}`, username: `user${i}`, displayName: `User ${i}`, avatarUrl: null, isVerified: false },
      }));
      prisma.liveParticipant.findMany = jest.fn().mockResolvedValue(many);

      const result = await service.getParticipants('live1');
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('u19');
    });
  });

  describe('lowerHand', () => {
    it('lowers raised hand back to viewer', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      prisma.liveParticipant.findUnique.mockResolvedValue({ sessionId: 'live1', userId: 'u1', role: 'RAISED_HAND' });
      prisma.liveParticipant.update.mockResolvedValue({ sessionId: 'live1', userId: 'u1', role: 'VIEWER' });

      const result = await service.lowerHand('live1', 'u1');
      expect(result.role).toBe('VIEWER');
      expect(prisma.liveParticipant.update).toHaveBeenCalledWith({
        where: { sessionId_userId: { sessionId: 'live1', userId: 'u1' } },
        data: { role: 'VIEWER' },
      });
    });

    it('throws NotFoundException for non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.lowerHand('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if session not live', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'ENDED' });
      await expect(service.lowerHand('live1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if not a participant', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      prisma.liveParticipant.findUnique.mockResolvedValue(null);
      await expect(service.lowerHand('live1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if hand not raised', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      prisma.liveParticipant.findUnique.mockResolvedValue({ role: 'VIEWER' });
      await expect(service.lowerHand('live1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if already a speaker', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      prisma.liveParticipant.findUnique.mockResolvedValue({ role: 'SPEAKER' });
      await expect(service.lowerHand('live1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendChat', () => {
    it('stores chat message in Redis and returns it', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'testuser', displayName: 'Test User', avatarUrl: null });

      const result = await service.sendChat('live1', 'u1', 'Hello world');
      expect(result.message).toBe('Hello world');
      expect(result.username).toBe('testuser');
      expect(result.userId).toBe('u1');
      expect(redis.lpush).toHaveBeenCalled();
      expect(redis.ltrim).toHaveBeenCalledWith(expect.any(String), 0, 499);
      expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 86400);
    });

    it('throws NotFoundException for non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.sendChat('nonexistent', 'u1', 'Hello')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if session not live', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'ENDED' });
      await expect(service.sendChat('live1', 'u1', 'Hello')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getChatMessages', () => {
    it('returns parsed chat messages from Redis', async () => {
      const msg1 = JSON.stringify({ id: 'a', userId: 'u1', message: 'Hello', timestamp: '2026-04-01T00:00:00Z' });
      const msg2 = JSON.stringify({ id: 'b', userId: 'u2', message: 'World', timestamp: '2026-04-01T00:00:01Z' });
      redis.lrange.mockResolvedValue([msg1, msg2]);

      const result = await service.getChatMessages('live1');
      expect(result).toHaveLength(2);
      expect(result[0].message).toBe('Hello');
      expect(result[1].message).toBe('World');
    });

    it('returns empty array when no messages', async () => {
      redis.lrange.mockResolvedValue([]);
      const result = await service.getChatMessages('live1');
      expect(result).toEqual([]);
    });

    it('filters out invalid JSON entries', async () => {
      redis.lrange.mockResolvedValue(['invalid-json', JSON.stringify({ id: 'a', message: 'Valid' })]);
      const result = await service.getChatMessages('live1');
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Valid');
    });
  });
});