import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { VideoStatus } from '@prisma/client';

import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateSubtitleTrackDto {
  @IsString() @MaxLength(100) label: string;
  @IsString() @MaxLength(10) language: string;
  @IsUrl() srtUrl: string;
}

@Injectable()
export class SubtitlesService {
  constructor(private prisma: PrismaService) {}

  async listTracks(videoId: string, userId?: string) {
    // Verify video exists and is accessible
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, status: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    // If video is not published, only owner can view subtitles
    if (video.status !== VideoStatus.PUBLISHED) {
      if (!userId || video.userId !== userId) {
        throw new ForbiddenException('Video not accessible');
      }
    }

    const tracks = await this.prisma.subtitleTrack.findMany({
      where: { videoId },
      select: {
        id: true,
        label: true,
        language: true,
        url: true,
        isDefault: true,
        createdAt: true,
      },
      orderBy: { isDefault: 'desc' },
      take: 50,
    });

    return tracks;
  }

  async createTrack(videoId: string, userId: string, dto: CreateSubtitleTrackDto) {
    // Validate video exists and user is owner
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException();

    // Validate language format (ISO 639-1/639-2, 2-3 chars)
    if (!/^[a-z]{2,3}$/i.test(dto.language)) {
      throw new BadRequestException('Language must be a 2-3 letter ISO code');
    }
    if (dto.label.length > 50) {
      throw new BadRequestException('Label too long (max 50 chars)');
    }
    // Validate URL format (should be a valid URL)
    try {
      new URL(dto.srtUrl);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    const track = await this.prisma.subtitleTrack.create({
      data: {
        videoId,
        label: dto.label,
        language: dto.language.toLowerCase(),
        url: dto.srtUrl,
        isDefault: false, // could be set based on first track or explicit flag
      },
      select: {
        id: true,
        label: true,
        language: true,
        url: true,
        isDefault: true,
        createdAt: true,
      },
    });

    return track;
  }

  async deleteTrack(videoId: string, trackId: string, userId: string) {
    // Verify track exists and belongs to video
    const track = await this.prisma.subtitleTrack.findUnique({
      where: { id: trackId },
      select: { id: true, videoId: true, video: { select: { userId: true } } },
    });
    if (!track) throw new NotFoundException('Subtitle track not found');
    if (track.videoId !== videoId) {
      throw new BadRequestException('Track does not belong to this video');
    }
    // Verify user is video owner
    if (track.video.userId !== userId) throw new ForbiddenException();

    await this.prisma.subtitleTrack.delete({
      where: { id: trackId },
    });

    return { deleted: true };
  }

  async getSrtRedirect(videoId: string, trackId: string, userId?: string) {
    // Verify track exists and belongs to video
    const track = await this.prisma.subtitleTrack.findUnique({
      where: { id: trackId },
      select: { id: true, videoId: true, url: true, video: { select: { userId: true, status: true } } },
    });
    if (!track) throw new NotFoundException('Subtitle track not found');
    if (track.videoId !== videoId) {
      throw new BadRequestException('Track does not belong to this video');
    }
    // Check video accessibility
    if (track.video.status !== VideoStatus.PUBLISHED) {
      if (!userId || track.video.userId !== userId) {
        throw new ForbiddenException('Video not accessible');
      }
    }

    // Return the URL for redirection (controller will handle redirect)
    return { url: track.url };
  }
}