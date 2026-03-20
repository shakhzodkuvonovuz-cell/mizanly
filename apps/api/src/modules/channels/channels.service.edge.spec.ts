import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ChannelsService } from './channels.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('ChannelsService — edge cases', () => {
  let service: ChannelsService;
  let prisma: any;

  const userId = 'user-edge-1';

  const mockChannel = {
    id: 'channel-1',
    userId,
    handle: 'testchannel',
    name: 'Test Channel',
    description: null,
    avatarUrl: null,
    bannerUrl: null,
    subscribersCount: 0,
    videosCount: 0,
    totalViews: 0,
    isVerified: false,
    createdAt: new Date(),
    trailerVideoId: null,
    user: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false },
  };

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
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            subscription: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            video: { findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    prisma = module.get(PrismaService);
  });

  describe('create — edge cases', () => {
    it('should accept Arabic channel name', async () => {
      prisma.channel.findUnique.mockResolvedValue(null); // no existing channel or handle
      prisma.channel.create.mockResolvedValue({ ...mockChannel, name: 'قناة المعرفة' });

      const result = await service.create(userId, {
        handle: 'knowledge',
        name: 'قناة المعرفة',
      } as any);

      expect(result.name).toBe('قناة المعرفة');
    });

    it('should throw ConflictException when user already has a channel', async () => {
      prisma.channel.findUnique.mockResolvedValueOnce(mockChannel); // existing channel

      await expect(service.create(userId, {
        handle: 'newchannel',
        name: 'New Channel',
      } as any)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when handle is already taken', async () => {
      prisma.channel.findUnique
        .mockResolvedValueOnce(null) // no channel for user
        .mockResolvedValueOnce(mockChannel); // handle exists

      await expect(service.create(userId, {
        handle: 'testchannel',
        name: 'New Channel',
      } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('getByHandle — edge cases', () => {
    it('should throw NotFoundException for non-existent handle', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.getByHandle('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('subscribe/unsubscribe — edge cases', () => {
    it('should throw ConflictException when already subscribed', async () => {
      prisma.channel.findUnique.mockResolvedValue({ ...mockChannel, userId: 'other-user' });
      prisma.subscription.findUnique.mockResolvedValue({ userId, channelId: 'channel-1' });

      await expect(service.subscribe('testchannel', userId))
        .rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when unsubscribing from channel you are not subscribed to', async () => {
      prisma.channel.findUnique.mockResolvedValue({ ...mockChannel, userId: 'other-user' });
      prisma.subscription.findUnique.mockResolvedValue(null);

      await expect(service.unsubscribe('testchannel', userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when subscribing to own channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(mockChannel); // userId matches

      await expect(service.subscribe('testchannel', userId))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getVideos — edge cases', () => {
    it('should return empty array for channel with 0 videos', async () => {
      prisma.channel.findUnique.mockResolvedValue(mockChannel);
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.getVideos('testchannel');
      expect(result.data).toEqual([]);
    });
  });
});
