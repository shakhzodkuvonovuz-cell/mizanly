import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

interface PlaylistItemResponse {
  id: string;
  position: number;
  createdAt: Date;
  video: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    duration: number;
    viewsCount: number;
    createdAt: Date;
    channel: {
      id: string;
      handle: string;
      name: string;
      avatarUrl: string | null;
    };
  };
}

interface PlaylistResponse {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  isPublic: boolean;
  videosCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: { cursor: string | null; hasMore: boolean };
}

@Injectable()
export class PlaylistsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreatePlaylistDto) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId }
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException('Not your channel');

    return this.prisma.playlist.create({
      data: {
        channelId: dto.channelId,
        title: dto.title,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
      },
      select: {
        id: true,
        channelId: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        isPublic: true,
        videosCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getById(id: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id },
      select: {
        id: true,
        channelId: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        isPublic: true,
        videosCount: true,
        createdAt: true,
        updatedAt: true,
        channel: {
          select: {
            id: true,
            handle: true,
            name: true,
            userId: true,
          },
        },
      },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    return playlist;
  }

  async getByChannel(channelId: string, cursor?: string, limit = 20): Promise<PaginatedResponse<PlaylistResponse>> {
    const playlists = await this.prisma.playlist.findMany({
      where: { channelId, isPublic: true },
      select: {
        id: true,
        channelId: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        isPublic: true,
        videosCount: true,
        createdAt: true,
        updatedAt: true,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = playlists.length > limit;
    const items = hasMore ? playlists.slice(0, limit) : playlists;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async getItems(playlistId: string, cursor?: string, limit = 20): Promise<PaginatedResponse<PlaylistItemResponse>> {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId }
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const items = await this.prisma.playlistItem.findMany({
      where: { playlistId },
      select: {
        id: true,
        position: true,
        createdAt: true,
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            viewsCount: true,
            createdAt: true,
            channel: {
              select: {
                id: true,
                handle: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { position: 'asc' },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    return {
      data: result,
      meta: { cursor: hasMore ? result[result.length - 1].id : null, hasMore },
    };
  }

  async update(id: string, userId: string, dto: UpdatePlaylistDto) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    return this.prisma.playlist.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        channelId: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        isPublic: true,
        videosCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}