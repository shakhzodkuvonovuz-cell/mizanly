import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { PlaylistsService } from './playlists.service';

describe('PlaylistsService', () => {
  let service: PlaylistsService;
  let prisma: any;
  let redis: any;
  let notifications: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistsService,
        {
          provide: PrismaService,
          useValue: {
            playlist: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            playlistItem: {
              create: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
              aggregate: jest.fn(),
            },
            channel: {
              findUnique: jest.fn(),
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

    service = module.get<PlaylistsService>(PlaylistsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    notifications = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const USER_ID = 'user-123';
    const CHANNEL_ID = 'channel-789';
    const dto = {
      channelId: CHANNEL_ID,
      title: 'My Playlist',
      description: 'My description',
      isPublic: true,
    };

    it('should create playlist when user owns channel', async () => {
      const mockChannel = { id: CHANNEL_ID, userId: USER_ID };
      const mockPlaylist = {
        id: 'playlist-abc',
        channelId: CHANNEL_ID,
        title: dto.title,
        description: dto.description,
        isPublic: true,
        videosCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.channel.findUnique.mockResolvedValue(mockChannel);
      prisma.playlist.create.mockResolvedValue(mockPlaylist);

      const result = await service.create(USER_ID, dto);

      expect(prisma.channel.findUnique).toHaveBeenCalledWith({
        where: { id: CHANNEL_ID },
      });
      expect(prisma.playlist.create).toHaveBeenCalledWith({
        data: {
          channelId: CHANNEL_ID,
          title: dto.title,
          description: dto.description,
          isPublic: true,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockPlaylist);
    });

    it('should throw NotFoundException when channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user not channel owner', async () => {
      const mockChannel = { id: CHANNEL_ID, userId: 'other-user' };
      prisma.channel.findUnique.mockResolvedValue(mockChannel);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(ForbiddenException);
    });

    it('should default isPublic to true when not provided', async () => {
      const dtoWithoutIsPublic = {
        channelId: CHANNEL_ID,
        title: 'My Playlist',
        description: 'My description',
        // isPublic omitted
      };
      const mockChannel = { id: CHANNEL_ID, userId: USER_ID };
      const mockPlaylist = {
        id: 'playlist-abc',
        channelId: CHANNEL_ID,
        title: dtoWithoutIsPublic.title,
        description: dtoWithoutIsPublic.description,
        isPublic: true, // Should default to true
        videosCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.channel.findUnique.mockResolvedValue(mockChannel);
      prisma.playlist.create.mockResolvedValue(mockPlaylist);

      const result = await service.create(USER_ID, dtoWithoutIsPublic);

      expect(prisma.playlist.create).toHaveBeenCalledWith({
        data: {
          channelId: CHANNEL_ID,
          title: dtoWithoutIsPublic.title,
          description: dtoWithoutIsPublic.description,
          isPublic: true, // Should default to true
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockPlaylist);
    });

    it('should handle missing description', async () => {
      const dtoWithoutDescription = {
        channelId: CHANNEL_ID,
        title: 'My Playlist',
        isPublic: false,
        // description omitted
      };
      const mockChannel = { id: CHANNEL_ID, userId: USER_ID };
      const mockPlaylist = {
        id: 'playlist-abc',
        channelId: CHANNEL_ID,
        title: dtoWithoutDescription.title,
        description: null, // Should be null when not provided
        isPublic: false,
        videosCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.channel.findUnique.mockResolvedValue(mockChannel);
      prisma.playlist.create.mockResolvedValue(mockPlaylist);

      const result = await service.create(USER_ID, dtoWithoutDescription);

      expect(prisma.playlist.create).toHaveBeenCalledWith({
        data: {
          channelId: CHANNEL_ID,
          title: dtoWithoutDescription.title,
          description: undefined, // Prisma will set to null if undefined
          isPublic: false,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockPlaylist);
    });
  });
});