import { Test } from '@nestjs/testing';
import { BroadcastService } from './broadcast.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BroadcastService', () => {
  let service: BroadcastService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      broadcastChannel: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      channelMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      broadcastMessage: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      $executeRaw: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        BroadcastService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(BroadcastService);
  });

  describe('create', () => {
    it('creates channel and adds owner', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue(null);
      prisma.broadcastChannel.create.mockResolvedValue({ id: 'ch1', name: 'Test', slug: 'test' });
      prisma.channelMember.create.mockResolvedValue({});
      const result = await service.create('user1', { name: 'Test', slug: 'test' });
      expect(result.id).toBe('ch1');
    });

    it('throws ConflictException for duplicate slug', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create('user1', { name: 'Test', slug: 'test' })).rejects.toThrow(ConflictException);
    });
  });

  describe('subscribe', () => {
    it('subscribes user and increments count', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'ch1' });
      prisma.channelMember.findUnique.mockResolvedValue(null);
      prisma.channelMember.create.mockResolvedValue({ channelId: 'ch1', userId: 'user1' });
      await service.subscribe('ch1', 'user1');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('allows owner to send', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastMessage.create.mockResolvedValue({ id: 'msg1' });
      const result = await service.sendMessage('ch1', 'user1', { content: 'Hello' });
      expect(result.id).toBe('msg1');
    });

    it('rejects subscriber sending', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'SUBSCRIBER' });
      await expect(service.sendMessage('ch1', 'user1', { content: 'Hello' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('pinMessage', () => {
    it('pins message as admin', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue({ id: 'msg1', channelId: 'ch1' });
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.broadcastMessage.update.mockResolvedValue({ id: 'msg1', isPinned: true });
      const result = await service.pinMessage('msg1', 'user1');
      expect(result.isPinned).toBe(true);
    });
  });

  describe('delete', () => {
    it('allows owner to delete channel', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastChannel.delete.mockResolvedValue({});
      const result = await service.delete('ch1', 'user1');
      expect(result.deleted).toBe(true);
    });
  });
});