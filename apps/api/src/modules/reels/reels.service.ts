import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateReelDto } from './dto/create-reel.dto';
import { ReelStatus } from '@prisma/client';
import Redis from 'ioredis';

const REEL_SELECT = {
  id: true,
  userId: true,
  videoUrl: true,
  streamId: true,
  thumbnailUrl: true,
  duration: true,
  width: true,
  height: true,
  status: true,
  caption: true,
  hashtags: true,
  mentions: true,
  language: true,
  audioId: true,
  audioTitle: true,
  audioArtist: true,
  audioTrackId: true,
  isDuet: true,
  isStitch: true,
  scheduledAt: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  savesCount: true,
  viewsCount: true,
  loopsCount: true,
  isFeatureWorthy: true,
  isSensitive: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  audioTrack: {
    select: {
      id: true,
      title: true,
      artist: true,
      duration: true,
      previewUrl: true,
    },
  },
};

@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async create(userId: string, dto: CreateReelDto) {
    const [reel] = await this.prisma.$transaction([
      this.prisma.reel.create({
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
          status: ReelStatus.PROCESSING,
          // Schema fields with defaults - Prisma will use defaults if omitted
          // width: 1080,
          // height: 1920,
          // language: 'en',
          // likesCount: 0,
          // commentsCount: 0,
          // sharesCount: 0,
          // savesCount: 0,
          // viewsCount: 0,
          // loopsCount: 0,
        },
        select: REEL_SELECT,
      }),
      // TODO: Uncomment when User model has reelsCount field
      // this.prisma.user.update({
      //   where: { id: userId },
      //   data: { reelsCount: { increment: 1 } },
      // }),
    ]);

    // TODO: In future, trigger video processing job here
    // For now, just mark as READY
    const updatedReel = await this.prisma.reel.update({
      where: { id: reel.id },
      data: { status: ReelStatus.READY },
      select: REEL_SELECT,
    });

    return {
      ...updatedReel,
      status: ReelStatus.READY,
      isLiked: false,
      isBookmarked: false,
    };
  }
}