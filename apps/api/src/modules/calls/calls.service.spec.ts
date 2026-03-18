import { Test } from '@nestjs/testing';
import { CallsService } from './calls.service';
import { PrismaService } from '../../config/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CallsService', () => {
  let service: CallsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      callSession: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      callParticipant: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,CallsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CallsService);
  });

  describe('initiate', () => {
    it('creates call session with participants', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue(null);
      prisma.callSession.create.mockResolvedValue({ id: 'call1', status: 'RINGING', participants: [] });
      const result = await service.initiate('user1', 'user2', 'VOICE');
      expect(result.status).toBe('RINGING');
    });

    it('rejects if user already in call', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue({ sessionId: 'existing' });
      await expect(service.initiate('user1', 'user2', 'VOICE')).rejects.toThrow(BadRequestException);
    });
  });

  describe('answer', () => {
    it('sets status to ACTIVE', async () => {
      prisma.callSession.findUnique.mockResolvedValue({ id: 'call1', status: 'RINGING', participants: [{ userId: 'user2' }] });
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'ACTIVE' });
      const result = await service.answer('call1', 'user2');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('end', () => {
    it('ends call and calculates duration', async () => {
      const startedAt = new Date(Date.now() - 60000);
      prisma.callSession.findUnique.mockResolvedValue({ id: 'call1', status: 'ACTIVE', startedAt, participants: [{ userId: 'user1' }] });
      prisma.callParticipant.updateMany.mockResolvedValue({});
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'ENDED', duration: 60 });
      const result = await service.end('call1', 'user1');
      expect(result.status).toBe('ENDED');
    });
  });
});