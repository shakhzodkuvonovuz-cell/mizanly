import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';

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

  async getByChannel(channelId: string, cursor?: string, limit = 20): Promise<{ data: any[]; meta: { cursor: string | null; hasMore: boolean } }> {
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

  async getItems(playlistId: string, cursor?: string, limit = 20): Promise<{ data: any[]; meta: { cursor: string | null; hasMore: boolean } }> {
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
}