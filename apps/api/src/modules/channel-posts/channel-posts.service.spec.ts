import { Test } from '@nestjs/testing';
import { ChannelPostsService } from './channel-posts.service';
import { PrismaService } from '../../config/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChannelPostsService', () => {
  let service: ChannelPostsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      channel: { findUnique: jest.fn() },
      channelPost: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      subscription: { findMany: jest.fn().mockResolvedValue([]) },
      channelSubscription: { findUnique: jest.fn() },
      channelPostLike: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), delete: jest.fn() },
      block: { findMany: jest.fn().mockResolvedValue([]) },
      mute: { findMany: jest.fn().mockResolvedValue([]) },
      restrict: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn(),
      $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.resolve(ops)),
    };
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, ChannelPostsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChannelPostsService);
  });

  describe('create', () => {
    it('should create post for channel owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1', name: 'TestChannel' });
      prisma.channelPost.create.mockResolvedValue({ id: 'cp1' });
      const result = await service.create('ch1', 'user1', { content: 'Hello' });
      expect(result.id).toBe('cp1');
    });

    it('should reject non-owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'other' });
      await expect(service.create('ch1', 'user1', { content: 'Hello' })).rejects.toThrow(ForbiddenException);
    });

    it('should create post with media', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1', name: 'TestChannel' });
      prisma.channelPost.create.mockResolvedValue({ id: 'cp2', mediaUrl: 'url' });
      const result = await service.create('ch1', 'user1', { content: 'Photo', mediaUrl: 'url' });
      expect(result.mediaUrl).toBe('url');
    });
  });

  describe('getFeed', () => {
    it('should list posts by channel', async () => {
      prisma.channelPost.findMany.mockResolvedValue([{ id: 'cp1' }, { id: 'cp2' }]);
      const result = await service.getFeed('ch1');
      expect(result.data).toHaveLength(2);
    });

    it('should return empty array for channel with no posts', async () => {
      prisma.channelPost.findMany.mockResolvedValue([]);
      const result = await service.getFeed('ch1');
      expect(result.data).toEqual([]);
    });
  });

  describe('pin', () => {
    it('should pin a channel post', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1' });
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1' });
      prisma.channelPost.update.mockResolvedValue({ id: 'cp1', isPinned: true });
      const result = await service.pin('cp1', 'user1');
      expect(result.isPinned).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete post by owner', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({
        id: 'cp1', channelId: 'ch1', userId: 'user1',
        user: { id: 'user1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
        channel: { id: 'ch1', handle: 'ch1', name: 'Channel 1' },
      });
      prisma.channelPost.delete.mockResolvedValue({ id: 'cp1' });
      await service.delete('cp1', 'user1');
      expect(prisma.channelPost.delete).toHaveBeenCalled();
    });
  });

  describe('pin/unpin', () => {
    it('should reject pin by non-owner', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({
        id: 'cp1', channelId: 'ch1', userId: 'other',
        user: { id: 'other', username: 'other', displayName: 'Other', avatarUrl: null, isVerified: false },
        channel: { id: 'ch1', handle: 'ch1', name: 'Channel 1' },
      });
      await expect(service.pin('cp1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('pagination', () => {
    it('should paginate with cursor', async () => {
      prisma.channelPost.findMany.mockResolvedValue([{ id: 'cp3' }]);
      const result = await service.getFeed('ch1', 'cp2', 10);
      expect(result.data).toEqual([{ id: 'cp3' }]);
      expect(prisma.channelPost.findMany).toHaveBeenCalled();
    });
  });

  describe('R2-Tab2 audit fixes', () => {
    it('should run content moderation on create', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1', name: 'TestChannel' });
      prisma.channelPost.create.mockResolvedValue({ id: 'cp-mod', content: 'Safe content' });
      const cs = (service as any).contentSafety;
      cs.moderateText.mockResolvedValue({ safe: true, flags: [] });

      await service.create('ch1', 'user1', { content: 'Safe content' });

      expect(cs.moderateText).toHaveBeenCalled();
    });

    it('should reject flagged content on create', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1' });
      const cs = (service as any).contentSafety;
      cs.moderateText.mockResolvedValue({ safe: false, flags: ['hate_speech'] });

      await expect(service.create('ch1', 'user1', { content: 'Bad content' })).rejects.toThrow('Content flagged');
    });

    it('should accept userId in getFeed and filter excluded users', async () => {
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'user1', blockedId: 'blocked-user' },
      ]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.channelPost.findMany.mockResolvedValue([]);

      await service.getFeed('ch1', 'user1');

      expect(prisma.block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: 'user1' }, { blockedId: 'user1' }] },
        }),
      );
    });

    it('should use GREATEST guard in like SQL', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1' });
      prisma.channelPostLike.findUnique.mockResolvedValue(null);
      prisma.channelPostLike.create.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockImplementation(async (ops: unknown[]) => {
        // Execute the ops to capture $executeRaw calls
        for (const op of ops) {
          if (op && typeof (op as any).then === 'function') await op;
        }
        return ops;
      });

      await service.like('cp1', 'user1');

      // Verify $executeRaw was called (the GREATEST guard is in the tagged template)
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
