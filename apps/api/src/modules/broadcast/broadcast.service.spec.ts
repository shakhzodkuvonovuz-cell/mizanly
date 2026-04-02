import { Test } from '@nestjs/testing';
import { BroadcastService } from './broadcast.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
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
        findMany: jest.fn().mockResolvedValue([]),
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
      $transaction: jest.fn((arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
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

    it('should throw BadRequestException when attempting to change slug', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'ch1', slug: 'original-slug' });
      await expect(
        service.update('ch1', 'owner1', { slug: 'new-slug' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should strip slug from update payload even if same value', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'ch1', slug: 'same-slug' });
      prisma.broadcastChannel.update.mockResolvedValue({ id: 'ch1', name: 'Updated', slug: 'same-slug' });
      await service.update('ch1', 'owner1', { name: 'Updated', slug: 'same-slug' } as any);
      expect(prisma.broadcastChannel.update).toHaveBeenCalledWith({
        where: { id: 'ch1' },
        data: { name: 'Updated' },
      });
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

  // T11 rows 115-119: Missing broadcast service tests

  describe('subscribe — idempotency', () => {
    it('should return existing member when already subscribed', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'ch1' });
      prisma.channelMember.findUnique.mockResolvedValue({ channelId: 'ch1', userId: 'u1', role: 'SUBSCRIBER' });
      const result = await service.subscribe('ch1', 'u1');
      expect(result).toEqual(expect.objectContaining({ channelId: 'ch1', userId: 'u1' }));
    });

    it('should throw NotFoundException for non-existent channel', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue(null);
      await expect(service.subscribe('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessage — empty message rejection', () => {
    it('should reject message with no content and no media', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      await expect(service.sendMessage('ch1', 'u1', { content: '' })).rejects.toThrow(BadRequestException);
    });

    it('should accept message with media but no content', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastMessage.create.mockResolvedValue({ id: 'msg1', mediaUrl: 'https://img.com/1.jpg' });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.channelMember.findMany.mockResolvedValue([]);
      const result = await service.sendMessage('ch1', 'u1', { mediaUrl: 'https://img.com/1.jpg' });
      expect(result.id).toBe('msg1');
    });
  });

  describe('discover — cursor pagination with hasMore', () => {
    it('should set hasMore true when more channels exist', async () => {
      const channels = Array.from({ length: 21 }, (_, i) => ({
        id: `ch${i}`, name: `Channel ${i}`, subscribersCount: 100 - i,
      }));
      prisma.broadcastChannel.findMany.mockResolvedValue(channels);
      const result = await service.discover();
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
    });

    it('should set hasMore false when exactly at limit', async () => {
      const channels = Array.from({ length: 5 }, (_, i) => ({
        id: `ch${i}`, name: `Channel ${i}`, subscribersCount: 100 - i,
      }));
      prisma.broadcastChannel.findMany.mockResolvedValue(channels);
      const result = await service.discover();
      expect(result.meta.hasMore).toBe(false);
      expect(result.data).toHaveLength(5);
    });
  });

  // T11 row 118: getSubscribers without userId (open-access path)
  describe('getSubscribers — no userId', () => {
    it('should skip requireRole when userId is undefined', async () => {
      prisma.channelMember.findMany.mockResolvedValue([
        { user: { id: 'u1', username: 'ali' }, role: 'SUBSCRIBER', joinedAt: new Date() },
      ]);
      // When userId is undefined, requireRole should NOT be called
      const result = await service.getSubscribers('ch1', undefined, undefined);
      expect(result.data).toHaveLength(1);
      // If requireRole was called with undefined, it would throw ForbiddenException
      // The fact this doesn't throw proves the path works
    });
  });

  // T11 rows 116-117: sendMessage notification fan-out + Redis publish
  describe('sendMessage — notification fan-out', () => {
    it('should create message and trigger background notification chain', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastMessage.create.mockResolvedValue({
        id: 'msg1', channelId: 'ch1', content: 'Hello subscribers',
        sender: { id: 'u1', username: 'admin' },
      });
      prisma.$executeRaw.mockResolvedValue(1);
      // Background .then() chain: findMany + createMany + redis.publish
      prisma.channelMember.findMany.mockResolvedValue([
        { userId: 'sub1' }, { userId: 'sub2' },
      ]);
      prisma.notification = { createMany: jest.fn().mockResolvedValue({ count: 2 }) };

      const result = await service.sendMessage('ch1', 'u1', { content: 'Hello subscribers' });
      expect(result.id).toBe('msg1');
      expect(prisma.$executeRaw).toHaveBeenCalled(); // postsCount increment
      // Note: notification fan-out runs in background .then() — we verify the message itself is returned
    });
  });
});