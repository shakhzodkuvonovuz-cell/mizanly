import { Test } from '@nestjs/testing';
import { CallsService } from './calls.service';
import { PrismaService } from '../../config/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CallsService', () => {
  let service: CallsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      callSession: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
      callParticipant: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, CallsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CallsService);
  });

  describe('initiate', () => {
    it('should create call session with participants', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue(null);
      prisma.callSession.create.mockResolvedValue({ id: 'call1', status: 'RINGING', participants: [] });
      const result = await service.initiate('user1', 'user2', 'VOICE');
      expect(result.status).toBe('RINGING');
    });

    it('should reject if user already in call', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue({ sessionId: 'existing' });
      await expect(service.initiate('user1', 'user2', 'VOICE')).rejects.toThrow(BadRequestException);
    });

    it('should create VIDEO call type', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue(null);
      prisma.callSession.create.mockResolvedValue({ id: 'call2', status: 'RINGING', type: 'VIDEO' });
      const result = await service.initiate('user1', 'user2', 'VIDEO');
      expect(result.status).toBe('RINGING');
    });
  });

  describe('answer', () => {
    it('should set status to ACTIVE', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'RINGING', participants: [{ userId: 'user2' }],
      });
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'ACTIVE' });
      const result = await service.answer('call1', 'user2');
      expect(result.status).toBe('ACTIVE');
    });

    it('should reject if call not found', async () => {
      prisma.callSession.findUnique.mockResolvedValue(null);
      await expect(service.answer('bad', 'user2')).rejects.toThrow();
    });
  });

  describe('end', () => {
    it('should end call and calculate duration', async () => {
      const startedAt = new Date(Date.now() - 60000);
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'ACTIVE', startedAt, participants: [{ userId: 'user1' }],
      });
      prisma.callParticipant.updateMany.mockResolvedValue({});
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'ENDED', duration: 60 });
      const result = await service.end('call1', 'user1');
      expect(result.status).toBe('ENDED');
    });

    it('should handle ending a non-active call', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'RINGING', participants: [{ userId: 'user1' }],
      });
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'ENDED' });
      prisma.callParticipant.updateMany.mockResolvedValue({});
      const result = await service.end('call1', 'user1');
      expect(result.status).toBe('ENDED');
    });
  });

  describe('getHistory', () => {
    it('should return call history for user', async () => {
      prisma.callParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'user1', session: { id: 'c1', status: 'ENDED', participants: [] } },
      ]);
      const result = await service.getHistory('user1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty array when no call history', async () => {
      prisma.callParticipant.findMany.mockResolvedValue([]);
      const result = await service.getHistory('user1');
      expect(result.data).toEqual([]);
    });
  });

  describe('decline', () => {
    it('should decline a ringing call', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'RINGING', participants: [{ userId: 'user1' }, { userId: 'user2' }],
      });
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'DECLINED' });

      const result = await service.decline('call1', 'user1');
      expect(result.status).toBe('DECLINED');
    });

    it('should throw if call is not ringing', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'ACTIVE', participants: [{ userId: 'user1' }],
      });
      await expect(service.decline('call1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for nonexistent call', async () => {
      prisma.callSession.findUnique.mockResolvedValue(null);
      await expect(service.decline('nonexistent', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-participant', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'RINGING', participants: [{ userId: 'user2' }],
      });
      await expect(service.decline('call1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('missedCall', () => {
    it('should mark call as missed', async () => {
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'MISSED' });
      const result = await service.missedCall('call1');
      expect(result.status).toBe('MISSED');
    });
  });

  describe('getActiveCall', () => {
    it('should return active call for user', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue({
        session: { id: 'call1', status: 'ACTIVE', participants: [] },
      });
      const result = await service.getActiveCall('user1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('call1');
    });

    it('should return null when no active call', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue(null);
      const result = await service.getActiveCall('user1');
      expect(result).toBeNull();
    });
  });

  describe('getIceServers', () => {
    it('should return STUN servers', () => {
      const result = service.getIceServers();
      expect(result.iceServers).toBeDefined();
      expect(result.iceServers.length).toBeGreaterThanOrEqual(3);
      expect(result.iceServers[0].urls).toContain('stun:');
    });
  });

  describe('createGroupCall', () => {
    it('should create group call with up to 8 participants', async () => {
      prisma.callSession.create.mockResolvedValue({
        id: 'call1', callType: 'VIDEO', status: 'RINGING', participants: [],
      });
      const result = await service.createGroupCall('conv1', 'user1', ['user2', 'user3']);
      expect(result.status).toBe('RINGING');
    });

    it('should throw BadRequestException for more than 8 participants', async () => {
      const tooMany = Array(8).fill('u').map((_, i) => `user-${i}`);
      await expect(service.createGroupCall('conv1', 'user1', tooMany)).rejects.toThrow(BadRequestException);
    });
  });

  describe('shareScreen', () => {
    it('should enable screen sharing', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'ACTIVE', isScreenSharing: false, participants: [{ userId: 'user1' }],
      });
      prisma.callSession.update.mockResolvedValue({ isScreenSharing: true, screenShareUserId: 'user1' });

      const result = await service.shareScreen('call1', 'user1');
      expect(result.isScreenSharing).toBe(true);
    });

    it('should throw if someone already sharing', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'ACTIVE', isScreenSharing: true, participants: [{ userId: 'user1' }],
      });
      await expect(service.shareScreen('call1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('should throw if call not active', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'ENDED', isScreenSharing: false, participants: [{ userId: 'user1' }],
      });
      await expect(service.shareScreen('call1', 'user1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('stopScreenShare', () => {
    it('should stop screen sharing', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'ACTIVE', screenShareUserId: 'user1', participants: [{ userId: 'user1' }],
      });
      prisma.callSession.update.mockResolvedValue({ isScreenSharing: false, screenShareUserId: null });

      const result = await service.stopScreenShare('call1', 'user1');
      expect(result.isScreenSharing).toBe(false);
    });

    it('should throw ForbiddenException if not the screen sharer', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'ACTIVE', screenShareUserId: 'other', participants: [{ userId: 'user1' }],
      });
      await expect(service.stopScreenShare('call1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });
});
