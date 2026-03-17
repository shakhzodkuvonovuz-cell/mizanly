import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { AddCollaboratorDto } from './dto/collaborator.dto';

export interface PlaylistItemResponse {
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

export interface PlaylistResponse {
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

export interface PaginatedResponse<T> {
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

  async delete(id: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    await this.prisma.playlist.delete({ where: { id } });
    return { deleted: true };
  }

  async addItem(playlistId: string, videoId: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const isOwner = playlist.channel.userId === userId;
    if (!isOwner) {
      const collaborator = await this.prisma.playlistCollaborator.findUnique({
        where: { playlistId_userId: { playlistId, userId } },
      });
      const isEditor = collaborator?.role === 'editor';
      if (!isEditor) throw new ForbiddenException('Not your playlist');
    }

    const maxPosition = await this.prisma.playlistItem.aggregate({
      where: { playlistId },
      _max: { position: true },
    });

    const [item] = await this.prisma.$transaction([
      this.prisma.playlistItem.create({
        data: {
          playlistId,
          videoId,
          position: (maxPosition._max.position ?? -1) + 1,
        },
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
      }),
      this.prisma.playlist.update({
        where: { id: playlistId },
        data: { videosCount: { increment: 1 } },
      }),
    ]);
    return item;
  }

  async removeItem(playlistId: string, videoId: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    await this.prisma.$transaction([
      this.prisma.playlistItem.delete({
        where: { playlistId_videoId: { playlistId, videoId } },
      }),
      this.prisma.playlist.update({
        where: { id: playlistId },
        data: { videosCount: { decrement: 1 } },
      }),
    ]);
    return { removed: true };
  }

  async toggleCollaborative(playlistId: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    const updated = await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { isCollaborative: !playlist.isCollaborative },
      select: {
        id: true,
        isCollaborative: true,
      },
    });

    // If disabling collaborative, remove all collaborators
    if (!updated.isCollaborative) {
      await this.prisma.playlistCollaborator.deleteMany({ where: { playlistId } });
    }

    return updated;
  }

  async addCollaborator(playlistId: string, userId: string, dto: AddCollaboratorDto) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');
    if (!playlist.isCollaborative) throw new BadRequestException('Playlist is not collaborative');
    if (dto.userId === userId) throw new BadRequestException('Cannot add yourself as collaborator');

    const targetUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!targetUser) throw new NotFoundException('User not found');

    const existing = await this.prisma.playlistCollaborator.findUnique({
      where: { playlistId_userId: { playlistId, userId: dto.userId } },
    });
    if (existing) throw new BadRequestException('User is already a collaborator');

    return this.prisma.playlistCollaborator.create({
      data: {
        playlistId,
        userId: dto.userId,
        role: dto.role ?? 'editor',
        addedById: userId,
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
      },
    });
  }

  async removeCollaborator(playlistId: string, userId: string, collaboratorUserId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const isOwner = playlist.channel.userId === userId;
    const isSelf = userId === collaboratorUserId;
    if (!isOwner && !isSelf) throw new ForbiddenException('Not allowed');

    const collaborator = await this.prisma.playlistCollaborator.findUnique({
      where: { playlistId_userId: { playlistId, userId: collaboratorUserId } },
    });
    if (!collaborator) throw new NotFoundException('Collaborator not found');

    await this.prisma.playlistCollaborator.delete({
      where: { playlistId_userId: { playlistId, userId: collaboratorUserId } },
    });
    return { removed: true };
  }

  async getCollaborators(playlistId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const collaborators = await this.prisma.playlistCollaborator.findMany({
      where: { playlistId },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
      },
      orderBy: { addedAt: 'asc' },
    });

    return { data: collaborators };
  }

  async updateCollaboratorRole(playlistId: string, userId: string, collaboratorUserId: string, role: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    const collaborator = await this.prisma.playlistCollaborator.findUnique({
      where: { playlistId_userId: { playlistId, userId: collaboratorUserId } },
    });
    if (!collaborator) throw new NotFoundException('Collaborator not found');

    return this.prisma.playlistCollaborator.update({
      where: { playlistId_userId: { playlistId, userId: collaboratorUserId } },
      data: { role },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
      },
    });
  }
}