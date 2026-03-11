import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class AudioTracksService {
  constructor(private prisma: PrismaService) {}

  async create(data: { title: string; artist: string; duration: number; audioUrl: string; coverUrl?: string; isOriginal?: boolean }) {
    return this.prisma.audioTrack.create({ data: { ...data, isOriginal: data.isOriginal ?? false } });
  }

  async getById(trackId: string) {
    const track = await this.prisma.audioTrack.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Audio track not found');
    return track;
  }

  async search(query: string, limit = 20) {
    return this.prisma.audioTrack.findMany({
      where: { OR: [{ title: { contains: query, mode: 'insensitive' } }, { artist: { contains: query, mode: 'insensitive' } }] },
      orderBy: { reelsCount: 'desc' },
      take: limit,
    });
  }

  async trending(limit = 20) {
    return this.prisma.audioTrack.findMany({ orderBy: { reelsCount: 'desc' }, take: limit });
  }

  async getReelsUsingTrack(trackId: string, cursor?: string, limit = 20) {
    const reels = await this.prisma.reel.findMany({
      where: { audioTrackId: trackId, isRemoved: false, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { viewsCount: 'desc' },
      take: limit + 1,
    });
    const hasMore = reels.length > limit;
    if (hasMore) reels.pop();
    return { data: reels, meta: { cursor: reels[reels.length - 1]?.id ?? null, hasMore } };
  }

  async incrementUsage(trackId: string) {
    await this.prisma.$executeRaw`UPDATE audio_tracks SET "reelsCount" = "reelsCount" + 1 WHERE id = ${trackId}`;
  }

  async delete(trackId: string) {
    await this.prisma.audioTrack.delete({ where: { id: trackId } });
    return { deleted: true };
  }
}