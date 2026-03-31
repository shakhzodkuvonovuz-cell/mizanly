import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateClipDto } from './dto/create-clip.dto';

@Injectable()
export class ClipsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, videoId: string, dto: CreateClipDto) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');
    if (video.status !== 'PUBLISHED') throw new ForbiddenException('Video not available');
    if (dto.endTime <= dto.startTime) throw new BadRequestException('End time must be after start time');
    if (dto.endTime - dto.startTime > 60) throw new BadRequestException('Clips can be max 60 seconds');
    if (video.duration && dto.endTime > video.duration) {
      throw new BadRequestException('End time exceeds video duration');
    }

    const duration = dto.endTime - dto.startTime;

    return this.prisma.videoClip.create({
      data: {
        userId,
        sourceVideoId: videoId,
        title: dto.title || `Clip from ${video.title}`,
        startTime: dto.startTime,
        endTime: dto.endTime,
        duration,
        clipUrl: video.hlsUrl ? `${video.hlsUrl}?start=${dto.startTime}&end=${dto.endTime}` : null,
        thumbnailUrl: video.thumbnailUrl,
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        sourceVideo: { select: { id: true, title: true, thumbnailUrl: true, duration: true, channel: { select: { name: true, handle: true } } } },
      },
    });
  }

  async getByVideo(videoId: string, cursor?: string, limit = 20) {
    limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const where: Record<string, unknown> = { sourceVideoId: videoId };
    if (cursor) where.id = { lt: cursor };

    const clips = await this.prisma.videoClip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
    });

    const hasMore = clips.length > limit;
    if (hasMore) clips.pop();

    return {
      data: clips,
      meta: { cursor: clips[clips.length - 1]?.id || null, hasMore },
    };
  }

  async getByUser(userId: string, cursor?: string, limit = 20) {
    limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const where: Record<string, unknown> = { userId };
    if (cursor) where.id = { lt: cursor };

    const clips = await this.prisma.videoClip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sourceVideo: { select: { id: true, title: true, thumbnailUrl: true, duration: true } },
      },
    });

    const hasMore = clips.length > limit;
    if (hasMore) clips.pop();

    return {
      data: clips,
      meta: { cursor: clips[clips.length - 1]?.id || null, hasMore },
    };
  }

  async delete(clipId: string, userId: string) {
    const clip = await this.prisma.videoClip.findFirst({ where: { id: clipId, userId } });
    if (!clip) throw new NotFoundException('Clip not found');
    return this.prisma.videoClip.delete({ where: { id: clipId } });
  }

  async getShareLink(clipId: string) {
    const clip = await this.prisma.videoClip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException();
    return { url: `https://mizanly.app/video/${clip.sourceVideoId}?t=${clip.startTime}` };
  }
}
