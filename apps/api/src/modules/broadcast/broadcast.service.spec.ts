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

  describe('getBySlug', () => {
    it('should return channel by slug', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'ch1', slug: 'test-channel', name: 'Test' });
      const result = await service.getBySlug('test-channel');
      expect(result.slug).toBe('test-channel');
    });

    it('should throw NotFoundException for invalid slug', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue(null);
      await expect(service.getBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscriber and return unsubscribed true', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ userId: 'u1', channelId: 'ch1', role: 'SUBSCRIBER' });
      prisma.channelMember.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      const result = await service.unsubscribe('ch1', 'u1');
      expect(result).toEqual({ unsubscribed: true });
    });

    it('should return unsubscribed true idempotently when not a member', async () => {
      prisma.channelMember.findUnique.mockResolvedValue(null);
      const result = await service.unsubscribe('ch1', 'u1');
      expect(result).toEqual({ unsubscribed: true });
    });
  });

  describe('getMessages', () => {
    it('should return broadcast messages with pagination', async () => {
      prisma.broadcastMessage.findMany.mockResolvedValue([
        { id: 'msg1', content: 'Announcement', createdAt: new Date() },
      ]);
      const result = await service.getMessages('ch1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getSubscribers', () => {
    it('should return subscribers list with pagination', async () => {
      prisma.channelMember.findMany.mockResolvedValue([
        { user: { id: 'u1', username: 'ali' }, role: 'SUBSCRIBER' },
      ]);
      const result = await service.getSubscribers('ch1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('update', () => {
    it('should update channel for owner', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastChannel.update.mockResolvedValue({ id: 'ch1', name: 'Updated' });
      const result = await service.update('ch1', 'owner1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'SUBSCRIBER' });
      await expect(service.update('ch1', 'u1', { name: 'X' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('discover', () => {
    it('should return discoverable channels', async () => {
      prisma.broadcastChannel.findMany.mockResolvedValue([
        { id: 'ch1', name: 'News Channel', subscriberCount: 100 },
      ]);
      const result = await service.discover();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should return channel by id', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'ch1', name: 'Test' });
      const result = await service.getById('ch1');
      expect(result.id).toBe('ch1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unpinMessage', () => {
    it('should unpin message as admin', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue({ id: 'msg1', channelId: 'ch1' });
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.broadcastMessage.update.mockResolvedValue({ id: 'msg1', isPinned: false });
      const result = await service.unpinMessage('msg1', 'user1');
      expect(result.isPinned).toBe(false);
    });

    it('should throw NotFoundException when message not found', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue(null);
      await expect(service.unpinMessage('nonexistent', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMessage', () => {
    it('should delete message and decrement postsCount', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue({ id: 'msg1', channelId: 'ch1' });
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastMessage.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      const result = await service.deleteMessage('msg1', 'user1');
      expect(result).toEqual({ deleted: true });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw NotFoundException when message not found', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue(null);
      await expect(service.deleteMessage('nonexistent', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPinnedMessages', () => {
    it('should return pinned messages', async () => {
      prisma.broadcastMessage.findMany.mockResolvedValue([{ id: 'msg1', isPinned: true }]);
      const result = await service.getPinnedMessages('ch1');
      expect(result).toHaveLength(1);
    });
  });

  describe('muteChannel', () => {
    it('should mute channel for subscriber', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ userId: 'u1', channelId: 'ch1' });
      prisma.channelMember.update.mockResolvedValue({ isMuted: true });
      const result = await service.muteChannel('ch1', 'u1', true);
      expect(result.isMuted).toBe(true);
    });

    it('should throw NotFoundException when not subscribed', async () => {
      prisma.channelMember.findUnique.mockResolvedValue(null);
      await expect(service.muteChannel('ch1', 'u1', true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyChannels', () => {
    it('should return user channels with role', async () => {
      prisma.channelMember.findMany.mockResolvedValue([
        { channel: { id: 'ch1', name: 'Test' }, role: 'OWNER', isMuted: false },
      ]);
      const result = await service.getMyChannels('u1');
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('OWNER');
    });
  });

  describe('promoteToAdmin', () => {
    it('should promote subscriber to admin', async () => {
      prisma.channelMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' }) // requireRole for owner
        .mockResolvedValueOnce({ role: 'SUBSCRIBER', userId: 'target' }); // target lookup
      prisma.channelMember.update.mockResolvedValue({ role: 'ADMIN' });
      const result = await service.promoteToAdmin('ch1', 'owner1', 'target');
      expect(result.role).toBe('ADMIN');
    });

    it('should throw NotFoundException when target not found', async () => {
      prisma.channelMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce(null);
      await expect(service.promoteToAdmin('ch1', 'owner1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when targeting owner', async () => {
      prisma.channelMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ role: 'OWNER', userId: 'target' });
      await expect(service.promoteToAdmin('ch1', 'owner1', 'target')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('demoteFromAdmin', () => {
    it('should demote admin to subscriber', async () => {
      prisma.channelMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ role: 'ADMIN', userId: 'target' });
      prisma.channelMember.update.mockResolvedValue({ role: 'SUBSCRIBER' });
      const result = await service.demoteFromAdmin('ch1', 'owner1', 'target');
      expect(result.role).toBe('SUBSCRIBER');
    });
  });

  describe('removeSubscriber', () => {
    it('should remove subscriber from channel', async () => {
      prisma.channelMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ role: 'SUBSCRIBER', userId: 'target' });
      prisma.channelMember.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      const result = await service.removeSubscriber('ch1', 'owner1', 'target');
      expect(result).toEqual({ removed: true });
    });

    it('should throw ForbiddenException when removing owner', async () => {
      prisma.channelMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ role: 'OWNER', userId: 'target' });
      await expect(service.removeSubscriber('ch1', 'owner1', 'target')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unsubscribe — owner restriction', () => {
    it('should throw ForbiddenException when owner tries to unsubscribe', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ userId: 'u1', channelId: 'ch1', role: 'OWNER' });
      await expect(service.unsubscribe('ch1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });
});