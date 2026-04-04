import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AudioTracksService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: { title: string; artist: string; duration: number; audioUrl: string; coverUrl?: string; isOriginal?: boolean }) {
    // Check for duplicate title+artist to prevent accidental re-uploads
    const existing = await this.prisma.audioTrack.findFirst({
      where: { title: data.title, artist: data.artist },
    });
    if (existing) throw new ConflictException('Audio track with this title and artist already exists');

    return this.prisma.audioTrack.create({ data: { ...data, userId, isOriginal: data.isOriginal ?? false } });
  }

  async getById(trackId: string) {
    const track = await this.prisma.audioTrack.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Audio track not found');
    return track;
  }

  async search(query: string, cursor?: string, limit = 20) {
    const where: Prisma.AudioTrackWhereInput = {
      OR: [{ title: { contains: query, mode: 'insensitive' } }, { artist: { contains: query, mode: 'insensitive' } }],
    };
    if (cursor) where.id = { lt: cursor };
    const tracks = await this.prisma.audioTrack.findMany({
      where,
      orderBy: { reelsCount: 'desc' },
      take: limit + 1,
    });
    const hasMore = tracks.length > limit;
    if (hasMore) tracks.pop();
    return { data: tracks, meta: { cursor: tracks[tracks.length - 1]?.id ?? null, hasMore } };
  }

  async trending(cursor?: string, limit = 20) {
    const where: Prisma.AudioTrackWhereInput = {};
    if (cursor) where.id = { lt: cursor };
    const tracks = await this.prisma.audioTrack.findMany({
      where,
      orderBy: { reelsCount: 'desc' },
      take: limit + 1,
    });
    const hasMore = tracks.length > limit;
    if (hasMore) tracks.pop();
    return { data: tracks, meta: { cursor: tracks[tracks.length - 1]?.id ?? null, hasMore } };
  }

  async getReelsUsingTrack(trackId: string, cursor?: string, limit = 20) {
    // Verify track exists
    const track = await this.prisma.audioTrack.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Audio track not found');

    const where: Prisma.ReelWhereInput = {
      audioTrackId: trackId,
      isRemoved: false,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    };
    if (cursor) where.id = { lt: cursor };

    const reels = await this.prisma.reel.findMany({
      where,
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { viewsCount: 'desc' },
      take: limit + 1,
    });
    const hasMore = reels.length > limit;
    if (hasMore) reels.pop();
    return { data: reels, meta: { cursor: reels[reels.length - 1]?.id ?? null, hasMore } };
  }

  async incrementUsage(trackId: string) {
    await this.prisma.$executeRaw`UPDATE "audio_tracks" SET "reelsCount" = "reelsCount" + 1 WHERE id = ${trackId}`;
  }

  async decrementUsage(trackId: string) {
    await this.prisma.$executeRaw`UPDATE "audio_tracks" SET "reelsCount" = GREATEST("reelsCount" - 1, 0) WHERE id = ${trackId}`;
  }

  async delete(trackId: string, userId: string) {
    const track = await this.prisma.audioTrack.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Audio track not found');

    // Ownership check — only creator can delete
    if (track.userId !== userId) {
      throw new ForbiddenException('You can only delete your own audio tracks');
    }

    // Only allow deletion if no reels are using this track
    if (track.reelsCount > 0) {
      throw new ForbiddenException('Cannot delete track that is in use by reels');
    }

    await this.prisma.audioTrack.delete({ where: { id: trackId } });
    return { deleted: true };
  }
}