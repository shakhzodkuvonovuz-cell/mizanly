import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateReelDto } from './dto/create-reel.dto';
import Redis from 'ioredis';

@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async create(userId: string, dto: CreateReelDto) {
    const reel = await this.prisma.reel.create({
      data: {
        userId,
        videoUrl: dto.videoUrl,
        thumbnailUrl: dto.thumbnailUrl,
        duration: dto.duration,
        caption: dto.caption,
        mentions: dto.mentions || [],
        hashtags: dto.hashtags || [],
        audioTrackId: dto.audioTrackId,
        isDuet: dto.isDuet || false,
        isStitch: dto.isStitch || false,
        status: 'PROCESSING',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
    });

    // TODO: In future, trigger video processing job here
    // For now, just mark as READY
    await this.prisma.reel.update({
      where: { id: reel.id },
      data: { status: 'READY' },
    });

    return {
      ...reel,
      status: 'READY' as const,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      viewsCount: 0,
      isLiked: false,
      isBookmarked: false,
    };
  }
}