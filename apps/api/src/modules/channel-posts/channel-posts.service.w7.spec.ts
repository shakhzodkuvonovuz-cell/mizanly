import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { ChannelPostsService } from './channel-posts.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #16-27: channel-posts like/unlike/unpin + error paths
 */
describe('ChannelPostsService — W7 T09 gaps', () => {
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
      channelPostLike: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        delete: jest.fn(),
      },
      block: { findMany: jest.fn().mockResolvedValue([]) },
      mute: { findMany: jest.fn().mockResolvedValue([]) },
      restrict: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn(),
      $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => {
        for (const op of ops) {
          if (op && typeof (op as any).then === 'function') await op;
        }
        return ops;
      }),
    };
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, ChannelPostsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChannelPostsService);
  });

  // T09 #16: like happy path
  describe('like', () => {
    it('should create like and increment likesCount', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1' });
      prisma.channelPostLike.findUnique.mockResolvedValue(null);
      prisma.channelPostLike.create.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.like('cp1', 'user-1');

      expect(result).toEqual({ liked: true });
      expect(prisma.channelPostLike.create).toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    // T09 #18: already liked throws ConflictException
    it('should throw ConflictException when already liked', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1' });
      prisma.channelPostLike.findUnique.mockResolvedValue({ userId: 'user-1', postId: 'cp1' });

      await expect(service.like('cp1', 'user-1')).rejects.toThrow(ConflictException);
    });

    // T09 #20: post not found
    it('should throw NotFoundException when post not found', async () => {
      prisma.channelPost.findUnique.mockResolvedValue(null);

      await expect(service.like('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // T09 #17: unlike happy path
  describe('unlike', () => {
    it('should delete like and decrement likesCount', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1' });
      prisma.channelPostLike.findUnique.mockResolvedValue({ userId: 'user-1', postId: 'cp1' });
      prisma.channelPostLike.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.unlike('cp1', 'user-1');

      expect(result).toEqual({ unliked: true });
      expect(prisma.channelPostLike.delete).toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    // T09 #19: like not found on unlike
    it('should throw NotFoundException when like not found', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1' });
      prisma.channelPostLike.findUnique.mockResolvedValue(null);

      await expect(service.unlike('cp1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    // T09 #20: post not found on unlike
    it('should throw NotFoundException when post not found', async () => {
      prisma.channelPost.findUnique.mockResolvedValue(null);

      await expect(service.unlike('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // T09 #22: unpin
  describe('unpin', () => {
    it('should unpin post by post author', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1', userId: 'user-1' });
      prisma.channelPost.update.mockResolvedValue({ id: 'cp1', isPinned: false });

      const result = await service.unpin('cp1', 'user-1');

      expect(result.isPinned).toBe(false);
      expect(prisma.channelPost.update).toHaveBeenCalledWith({
        where: { id: 'cp1' },
        data: { isPinned: false },
      });
    });

    it('should allow channel owner to unpin any post', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1', userId: 'other-user' });
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'channel-owner' });
      prisma.channelPost.update.mockResolvedValue({ id: 'cp1', isPinned: false });

      const result = await service.unpin('cp1', 'channel-owner');

      expect(result.isPinned).toBe(false);
    });

    it('should throw ForbiddenException for non-owner unpin', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1', userId: 'other-user' });
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'channel-owner' });

      await expect(service.unpin('cp1', 'random-user')).rejects.toThrow(ForbiddenException);
    });
  });

  // T09 #21: delete — non-owner forbidden
  describe('delete — non-owner', () => {
    it('should throw ForbiddenException when non-owner tries to delete', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1', userId: 'other-user' });

      await expect(service.delete('cp1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // T09 #23: create — channel not found
  describe('create — channel not found', () => {
    it('should throw NotFoundException when channel does not exist', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.create('nonexistent-ch', 'user-1', { content: 'Hello' })).rejects.toThrow(NotFoundException);
    });
  });

  // T09 #25: pin — channel owner can pin any post
  describe('pin — channel owner can pin any post', () => {
    it('should allow channel owner to pin a post by another user', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({ id: 'cp1', channelId: 'ch1', userId: 'post-author' });
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'channel-owner' });
      prisma.channelPost.update.mockResolvedValue({ id: 'cp1', isPinned: true });

      const result = await service.pin('cp1', 'channel-owner');

      expect(result.isPinned).toBe(true);
    });
  });

  // T09 #24: getFeed hasMore computation
  describe('getFeed — hasMore', () => {
    it('should return hasMore=true and correct cursor when posts exceed limit', async () => {
      const posts = Array.from({ length: 3 }, (_, i) => ({ id: `cp-${i}` }));
      prisma.channelPost.findMany.mockResolvedValue(posts);

      const result = await service.getFeed('ch1', undefined, undefined, 2);

      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('cp-1');
    });
  });
});
