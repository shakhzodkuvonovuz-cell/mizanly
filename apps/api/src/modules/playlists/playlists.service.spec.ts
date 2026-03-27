import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { PlaylistsService } from './playlists.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PlaylistsService', () => {
  let service: PlaylistsService;
  let prisma: any;
  let redis: any;
  let notifications: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
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
              findUnique: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
              aggregate: jest.fn(),
              count: jest.fn().mockResolvedValue(5),
            },
            channel: {
              findUnique: jest.fn(),
            },
            playlistCollaborator: {
              findUnique: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
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

  describe('getById', () => {
    const PLAYLIST_ID = 'playlist-abc';
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channelId: 'channel-789',
      title: 'My Playlist',
      description: 'My description',
      thumbnailUrl: null,
      isPublic: true,
      videosCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      channel: {
        id: 'channel-789',
        handle: 'tech',
        name: 'Tech Channel',
        userId: 'user-123',
      },
    };

    it('should return playlist when found', async () => {
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

      const result = await service.getById(PLAYLIST_ID);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockPlaylist);
    });

    it('should throw NotFoundException when playlist not found', async () => {
      prisma.playlist.findUnique.mockResolvedValue(null);

      await expect(service.getById(PLAYLIST_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByChannel', () => {
    const CHANNEL_ID = 'channel-789';
    const mockPlaylists = [
      {
        id: 'playlist-abc',
        channelId: CHANNEL_ID,
        title: 'Playlist 1',
        description: 'Desc 1',
        thumbnailUrl: null,
        isPublic: true,
        videosCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'playlist-def',
        channelId: CHANNEL_ID,
        title: 'Playlist 2',
        description: 'Desc 2',
        thumbnailUrl: null,
        isPublic: true,
        videosCount: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return paginated playlists for channel', async () => {
      prisma.playlist.findMany.mockResolvedValue(mockPlaylists);

      const result = await service.getByChannel(CHANNEL_ID);

      expect(prisma.playlist.findMany).toHaveBeenCalledWith({
        where: { channelId: CHANNEL_ID, isPublic: true },
        select: expect.any(Object),
        take: 21, // limit + 1
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should handle cursor pagination', async () => {
      const cursor = 'playlist-abc';
      prisma.playlist.findMany.mockResolvedValue(mockPlaylists.slice(0, 1));

      await service.getByChannel(CHANNEL_ID, cursor);

      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: cursor },
          skip: 1,
        }),
      );
    });
  });

  describe('getItems', () => {
    const PLAYLIST_ID = 'playlist-abc';
    const mockItems = [
      {
        id: 'item-1',
        position: 0,
        createdAt: new Date(),
        video: {
          id: 'video-1',
          title: 'Video 1',
          thumbnailUrl: null,
          duration: 120,
          viewsCount: 100,
          createdAt: new Date(),
          channel: {
            id: 'channel-789',
            handle: 'tech',
            name: 'Tech Channel',
            avatarUrl: null,
          },
        },
      },
    ];

    it('should return paginated playlist items', async () => {
      prisma.playlist.findUnique.mockResolvedValue({ id: PLAYLIST_ID });
      prisma.playlistItem.findMany.mockResolvedValue(mockItems);

      const result = await service.getItems(PLAYLIST_ID);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
      });
      expect(prisma.playlistItem.findMany).toHaveBeenCalledWith({
        where: { playlistId: PLAYLIST_ID },
        select: expect.any(Object),
        take: 21,
        orderBy: { position: 'asc' },
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException when playlist not found', async () => {
      prisma.playlist.findUnique.mockResolvedValue(null);

      await expect(service.getItems(PLAYLIST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should handle cursor pagination', async () => {
      const cursor = 'item-1';
      prisma.playlist.findUnique.mockResolvedValue({ id: PLAYLIST_ID });
      prisma.playlistItem.findMany.mockResolvedValue([]);

      await service.getItems(PLAYLIST_ID, cursor);

      expect(prisma.playlistItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: cursor },
          skip: 1,
        }),
      );
    });
  });

  describe('update', () => {
    const USER_ID = 'user-123';
    const PLAYLIST_ID = 'playlist-abc';
    const dto = {
      title: 'Updated Title',
      description: 'Updated description',
      isPublic: false,
    };

    it('should update playlist when user is owner', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: USER_ID },
      };
      const updatedPlaylist = {
        id: PLAYLIST_ID,
        channelId: 'channel-789',
        ...dto,
        thumbnailUrl: null,
        videosCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
      prisma.playlist.update.mockResolvedValue(updatedPlaylist);

      const result = await service.update(PLAYLIST_ID, USER_ID, dto);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        include: { channel: { select: { userId: true } } },
      });
      expect(prisma.playlist.update).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        data: dto,
        select: expect.any(Object),
      });
      expect(result).toEqual(updatedPlaylist);
    });

    it('should throw NotFoundException when playlist not found', async () => {
      prisma.playlist.findUnique.mockResolvedValue(null);

      await expect(service.update(PLAYLIST_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: 'other-user' },
      };
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

      await expect(service.update(PLAYLIST_ID, USER_ID, dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    const USER_ID = 'user-123';
    const PLAYLIST_ID = 'playlist-abc';

    it('should delete playlist when user is owner', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: USER_ID },
      };
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
      prisma.playlist.delete.mockResolvedValue({});

      const result = await service.delete(PLAYLIST_ID, USER_ID);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        include: { channel: { select: { userId: true } } },
      });
      expect(prisma.playlist.delete).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException when playlist not found', async () => {
      prisma.playlist.findUnique.mockResolvedValue(null);

      await expect(service.delete(PLAYLIST_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: 'other-user' },
      };
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

      await expect(service.delete(PLAYLIST_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addItem', () => {
    const USER_ID = 'user-123';
    const PLAYLIST_ID = 'playlist-abc';
    const VIDEO_ID = 'video-def';

    it('should add video to playlist with auto-position', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: USER_ID },
      };
      const mockItem = {
        id: 'item-1',
        position: 0,
        createdAt: new Date(),
        video: {
          id: VIDEO_ID,
          title: 'Video 1',
          thumbnailUrl: null,
          duration: 120,
          viewsCount: 100,
          createdAt: new Date(),
          channel: {
            id: 'channel-789',
            handle: 'tech',
            name: 'Tech Channel',
            avatarUrl: null,
          },
        },
      };

      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
      prisma.playlistItem.aggregate.mockResolvedValue({ _max: { position: null } });
      prisma.$transaction.mockResolvedValue([mockItem, {}]);

      const result = await service.addItem(PLAYLIST_ID, VIDEO_ID, USER_ID);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        include: { channel: { select: { userId: true } } },
      });
      expect(prisma.playlistItem.aggregate).toHaveBeenCalledWith({
        where: { playlistId: PLAYLIST_ID },
        _max: { position: true },
      });
      expect(result).toEqual(mockItem);
    });

    it('should calculate correct position from existing max', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: USER_ID },
      };
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
      prisma.playlistItem.aggregate.mockResolvedValue({ _max: { position: 4 } });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      await service.addItem(PLAYLIST_ID, VIDEO_ID, USER_ID);

      expect(prisma.playlistItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            position: 5, // 4 + 1 = 5
          }),
        }),
      );
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: 'other-user' },
      };
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

      await expect(service.addItem(PLAYLIST_ID, VIDEO_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeItem', () => {
    const USER_ID = 'user-123';
    const PLAYLIST_ID = 'playlist-abc';
    const VIDEO_ID = 'video-def';

    it('should remove video from playlist', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: USER_ID },
      };
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
      prisma.playlistItem.findUnique.mockResolvedValue({ playlistId: PLAYLIST_ID, videoId: VIDEO_ID });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.removeItem(PLAYLIST_ID, VIDEO_ID, USER_ID);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        include: { channel: { select: { userId: true } } },
      });
      expect(prisma.playlistItem.delete).toHaveBeenCalledWith({
        where: { playlistId_videoId: { playlistId: PLAYLIST_ID, videoId: VIDEO_ID } },
      });
      expect(result).toEqual({ removed: true });
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      const mockPlaylist = {
        id: PLAYLIST_ID,
        channel: { userId: 'other-user' },
      };
      prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

      await expect(service.removeItem(PLAYLIST_ID, VIDEO_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});