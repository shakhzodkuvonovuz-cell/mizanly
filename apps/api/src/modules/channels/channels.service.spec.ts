import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { ChannelsService } from './channels.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let prisma: any;
  let redis: any;
  let notifications: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ChannelsService,
        {
          provide: PrismaService,
          useValue: {
            channel: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            subscription: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              count: jest.fn().mockResolvedValue(0),
              create: jest.fn(),
              delete: jest.fn(),
            },
            video: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            block: {
              findMany: jest.fn(),
            },
            mute: {
              findMany: jest.fn(),
            },
            videoReaction: {
              findMany: jest.fn(),
            },
            videoBookmark: {
              findMany: jest.fn(),
            },
            $executeRaw: jest.fn(),
            $transaction: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    notifications = module.get(NotificationsService);
  });

  describe('create', () => {
    it('should create a channel with valid data', async () => {
      const userId = 'user-123';
      const dto = { handle: 'tech', name: 'Tech Channel', description: 'Cool tech' };
      const mockChannel = {
        id: 'channel-456',
        userId,
        ...dto,
        avatarUrl: null,
        bannerUrl: null,
        subscribersCount: 0,
        videosCount: 0,
        totalViews: 0,
        isVerified: false,
        createdAt: new Date(),
        user: {
          id: userId,
          username: 'user123',
          displayName: 'User',
          avatarUrl: null,
          isVerified: false,
        },
      };
      prisma.channel.findUnique.mockResolvedValue(null); // no existing channel
      prisma.channel.create.mockResolvedValue(mockChannel);

      const result = await service.create(userId, dto);

      expect(prisma.channel.create).toHaveBeenCalledWith({
        data: {
          userId,
          handle: dto.handle,
          name: dto.name,
          description: dto.description,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual({ ...mockChannel, isSubscribed: false });
    });

    it('should throw ConflictException if user already has a channel', async () => {
      const userId = 'user-123';
      const dto = { handle: 'tech', name: 'Tech', description: '' };
      prisma.channel.findUnique.mockResolvedValue({ id: 'existing', userId } as any);

      await expect(service.create(userId, dto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if handle is taken', async () => {
      const userId = 'user-123';
      const dto = { handle: 'taken', name: 'Tech', description: '' };
      prisma.channel.findUnique
        .mockResolvedValueOnce(null) // no existing user channel
        .mockResolvedValueOnce({ id: 'other', userId: 'other' } as any); // handle taken

      await expect(service.create(userId, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('getByHandle', () => {
    it('should return channel with isSubscribed false for anonymous user', async () => {
      const handle = 'tech';
      const mockChannel = {
        id: 'channel-456',
        userId: 'owner-123',
        handle,
        name: 'Tech Channel',
        description: 'Cool',
        avatarUrl: null,
        bannerUrl: null,
        subscribersCount: 100,
        videosCount: 5,
        totalViews: 1000,
        isVerified: false,
        trailerVideo: null,
        createdAt: new Date(),
        user: {
          id: 'owner-123',
          username: 'owner',
          displayName: 'Owner',
          avatarUrl: null,
          isVerified: false,
        },
      };
      prisma.channel.findUnique.mockResolvedValue(mockChannel);
      prisma.subscription.findUnique.mockResolvedValue(null);

      const result = await service.getByHandle(handle);

      expect(result).toEqual({ ...mockChannel, isSubscribed: false });
    });

    it('should return channel with isSubscribed true if user subscribed', async () => {
      const handle = 'tech';
      const userId = 'user-123';
      const mockChannel = { id: 'channel-456', userId: 'owner' } as any;
      prisma.channel.findUnique.mockResolvedValue(mockChannel);
      prisma.subscription.findUnique.mockResolvedValue({ userId, channelId: 'channel-456' } as any);

      const result = await service.getByHandle(handle, userId);

      expect(result.isSubscribed).toBe(true);
    });

    it('should throw NotFoundException if channel does not exist', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.getByHandle('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update channel if user is owner', async () => {
      const handle = 'tech';
      const userId = 'owner-123';
      const dto = { name: 'Updated Name', description: 'New desc' };
      const existingChannel = { id: 'channel-456', userId, handle };
      const updatedChannel = {
        ...existingChannel,
        name: dto.name,
        description: dto.description,
        avatarUrl: null,
        bannerUrl: null,
        subscribersCount: 0,
        videosCount: 0,
        totalViews: 0,
        isVerified: false,
        createdAt: new Date(),
        user: {
          id: userId,
          username: 'owner',
          displayName: 'Owner',
          avatarUrl: null,
          isVerified: false,
        },
      };
      prisma.channel.findUnique.mockResolvedValue(existingChannel as any);
      prisma.channel.update.mockResolvedValue(updatedChannel);

      const result = await service.update(handle, userId, dto);

      expect(prisma.channel.update).toHaveBeenCalledWith({
        where: { handle },
        data: {
          name: dto.name,
          description: dto.description,
          avatarUrl: undefined,
          bannerUrl: undefined,
        },
        select: expect.any(Object),
      });
      expect(result.isSubscribed).toBe(false);
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.update('unknown', 'user-123', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const existingChannel = { id: 'channel-456', userId: 'owner-123', handle: 'tech' };
      prisma.channel.findUnique.mockResolvedValue(existingChannel as any);

      await expect(service.update('tech', 'other-user', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should hard-delete channel if user is owner', async () => {
      const handle = 'tech';
      const userId = 'owner-123';
      const existingChannel = { id: 'channel-456', userId, handle };
      prisma.channel.findUnique.mockResolvedValue(existingChannel as any);
      prisma.channel.delete.mockResolvedValue({} as any);

      await service.delete(handle, userId);

      expect(prisma.channel.delete).toHaveBeenCalledWith({
        where: { handle },
      });
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.delete('unknown', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const existingChannel = { id: 'channel-456', userId: 'owner-123', handle: 'tech' };
      prisma.channel.findUnique.mockResolvedValue(existingChannel as any);

      await expect(service.delete('tech', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('subscribe', () => {
    it('should subscribe user to channel', async () => {
      const handle = 'tech';
      const userId = 'user-123';
      const channelId = 'channel-456';
      const channel = { id: channelId, userId: 'owner-456' };
      prisma.channel.findUnique.mockResolvedValue(channel as any);
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue(undefined);
      notifications.create.mockResolvedValue(undefined);

      await service.subscribe(handle, userId);

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: { userId, channelId },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith({
        userId: channel.userId,
        actorId: userId,
        type: 'FOLLOW',
      });
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.subscribe('unknown', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user tries to subscribe to own channel', async () => {
      const channel = { id: 'channel-456', userId: 'owner-123' };
      prisma.channel.findUnique.mockResolvedValue(channel as any);

      await expect(service.subscribe('tech', 'owner-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if already subscribed', async () => {
      const channel = { id: 'channel-456', userId: 'owner-456' };
      prisma.channel.findUnique.mockResolvedValue(channel as any);
      prisma.subscription.findUnique.mockResolvedValue({} as any);

      await expect(service.subscribe('tech', 'user-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe user from channel', async () => {
      const handle = 'tech';
      const userId = 'user-123';
      const channelId = 'channel-456';
      const channel = { id: channelId, userId: 'owner-456' };
      prisma.channel.findUnique.mockResolvedValue(channel as any);
      prisma.subscription.findUnique.mockResolvedValue({} as any);
      prisma.$transaction.mockResolvedValue(undefined);

      await service.unsubscribe(handle, userId);

      expect(prisma.subscription.delete).toHaveBeenCalledWith({
        where: { userId_channelId: { userId, channelId } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.unsubscribe('unknown', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if not subscribed', async () => {
      const channel = { id: 'channel-456', userId: 'owner-456' };
      prisma.channel.findUnique.mockResolvedValue(channel as any);
      prisma.subscription.findUnique.mockResolvedValue(null);

      await expect(service.unsubscribe('tech', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getVideos', () => {
    it('should return published videos for channel with pagination', async () => {
      const handle = 'tech';
      const channelId = 'channel-456';
      const channel = { id: channelId };
      const mockVideos = [
        {
          id: 'video-1',
          title: 'Video 1',
          description: 'Desc',
          videoUrl: 'url',
          thumbnailUrl: null,
          duration: 120,
          viewsCount: 100,
          likesCount: 10,
          dislikesCount: 1,
          commentsCount: 5,
          category: 'EDUCATION',
          tags: ['tech'],
          publishedAt: new Date(),
          user: { id: 'owner', username: 'owner', displayName: 'Owner', avatarUrl: null, isVerified: false },
          channel: { id: channelId, handle: 'tech', name: 'Tech', avatarUrl: null },
        },
      ];
      prisma.channel.findUnique.mockResolvedValue(channel as any);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue(mockVideos);
      prisma.videoReaction.findMany.mockResolvedValue([]);
      prisma.videoBookmark.findMany.mockResolvedValue([]);

      const result = await service.getVideos(handle);

      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should exclude blocked/muted users', async () => {
      const handle = 'tech';
      const channelId = 'channel-456';
      const channel = { id: channelId };
      prisma.channel.findUnique.mockResolvedValue(channel as any);
      prisma.block.findMany.mockResolvedValue([{ blockedId: 'blocked-user' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      prisma.video.findMany.mockResolvedValue([]);

      await service.getVideos(handle, 'user-123');

      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { notIn: ['blocked-user', 'muted-user'] },
          }),
        }),
      );
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.getVideos('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyChannels', () => {
    it('should return channels owned by user', async () => {
      const userId = 'user-123';
      const mockChannels = [
        {
          id: 'channel-456',
          userId,
          handle: 'tech',
          name: 'Tech',
          description: '',
          avatarUrl: null,
          bannerUrl: null,
          subscribersCount: 0,
          videosCount: 0,
          totalViews: 0,
          isVerified: false,
          createdAt: new Date(),
          user: {
            id: userId,
            username: 'user',
            displayName: 'User',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      prisma.channel.findMany.mockResolvedValue(mockChannels);

      const result = await service.getMyChannels(userId);

      expect(result).toHaveLength(1);
      expect(result[0].isSubscribed).toBe(false);
    });
  });

  describe('getAnalytics', () => {
    it('should return channel analytics for owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'user-1', handle: 'test' });
      prisma.subscription.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([{ viewsCount: 100, likesCount: 10 }]);

      const result = await service.getAnalytics('test', 'user-1');
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'other', handle: 'test' });
      await expect(service.getAnalytics('test', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      await expect(service.getAnalytics('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSubscribers', () => {
    it('should return subscribers for channel owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'user-1', handle: 'test' });
      prisma.subscription.findMany.mockResolvedValue([
        { user: { id: 'u1', username: 'sub1', displayName: 'Subscriber', avatarUrl: null } },
      ]);

      const result = await service.getSubscribers('test', 'user-1');
      expect(result.data).toHaveLength(1);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'other', handle: 'test' });
      await expect(service.getSubscribers('test', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setTrailer', () => {
    it('should set trailer for channel owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'user-1', handle: 'test' });
      prisma.video.findUnique.mockResolvedValue({ id: 'video-1', channelId: 'ch-1' });
      prisma.channel.update.mockResolvedValue({ trailerVideoId: 'video-1' });

      const result = await service.setTrailer('test', 'user-1', 'video-1');
      expect(result.trailerVideoId).toBe('video-1');
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'other', handle: 'test' });
      await expect(service.setTrailer('test', 'user-1', 'video-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeTrailer', () => {
    it('should remove trailer for channel owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'user-1', handle: 'test' });
      prisma.channel.update.mockResolvedValue({ trailerVideoId: null });

      const result = await service.removeTrailer('test', 'user-1');
      expect(result.trailerVideoId).toBeNull();
    });
  });
});