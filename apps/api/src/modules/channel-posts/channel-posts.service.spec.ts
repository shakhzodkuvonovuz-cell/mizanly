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
      channelSubscription: { findUnique: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, ChannelPostsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChannelPostsService);
  });

  describe('create', () => {
    it('should create post for channel owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1' });
      prisma.channelPost.create.mockResolvedValue({ id: 'cp1' });
      const result = await service.create('ch1', 'user1', { content: 'Hello' });
      expect(result.id).toBe('cp1');
    });

    it('should reject non-owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'other' });
      await expect(service.create('ch1', 'user1', { content: 'Hello' })).rejects.toThrow(ForbiddenException);
    });

    it('should create post with media', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1' });
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
    it('should pin a post', async () => {
      prisma.channelPost.findUnique.mockResolvedValue({
        id: 'cp1', channelId: 'ch1', userId: 'user1',
        user: { id: 'user1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
        channel: { id: 'ch1', handle: 'ch1', name: 'Channel 1' },
      });
      prisma.channelPost.update.mockResolvedValue({ id: 'cp1', isPinned: true });
      const result = await service.pin('cp1', 'user1');
      expect(result.isPinned).toBe(true);
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
});
