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
}