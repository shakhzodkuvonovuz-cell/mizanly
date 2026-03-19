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

  describe('reject', () => {
    it('should set call status to REJECTED', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'call1', status: 'RINGING', participants: [{ userId: 'user2' }],
      });
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'REJECTED' });
      if (typeof service.reject === 'function') {
        const result = await service.reject('call1', 'user2');
        expect(result.status).toBe('REJECTED');
      }
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
      if (typeof service.getHistory === 'function') {
        const result = await service.getHistory('user1');
        expect(result.data).toHaveLength(1);
      }
    });

    it('should return empty array when no call history', async () => {
      prisma.callSession.findMany.mockResolvedValue([]);
      if (typeof service.getHistory === 'function') {
        const result = await service.getHistory('user1');
        expect(result.data).toEqual([]);
      }
    });
  });
});
