import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface CreateVideoReplyData {
  commentId: string;
  commentType: 'POST' | 'REEL';
  mediaUrl: string;
  thumbnailUrl?: string;
  duration?: number;
}

const VIDEO_REPLY_SELECT = {
  id: true,
  userId: true,
  commentId: true,
  commentType: true,
  mediaUrl: true,
  thumbnailUrl: true,
  duration: true,
  viewsCount: true,
  likesCount: true,
  createdAt: true,
};

@Injectable()
export class VideoRepliesService {
  private readonly logger = new Logger(VideoRepliesService.name);

  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateVideoReplyData) {
    const { commentId, commentType, mediaUrl, thumbnailUrl, duration } = data;

    if (commentType !== 'POST' && commentType !== 'REEL') {
      throw new BadRequestException('commentType must be "POST" or "REEL"');
    }

    if (!mediaUrl || !mediaUrl.trim()) {
      throw new BadRequestException('mediaUrl is required');
    }

    // Validate URL format
    try {
      new URL(mediaUrl);
    } catch {
      throw new BadRequestException('mediaUrl must be a valid URL');
    }

    if (duration !== undefined && (duration < 0 || duration > 300)) {
      throw new BadRequestException('duration must be between 0 and 300 seconds');
    }

    // Verify the target comment exists
    if (commentType === 'POST') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { id: true },
      });
      if (!comment) {
        throw new NotFoundException('Comment not found');
      }
    } else {
      const reelComment = await this.prisma.reelComment.findUnique({
        where: { id: commentId },
        select: { id: true },
      });
      if (!reelComment) {
        throw new NotFoundException('Comment not found');
      }
    }

    const videoReply = await this.prisma.videoReply.create({
      data: {
        userId,
        commentId,
        commentType,
        mediaUrl,
        thumbnailUrl,
        duration,
      },
      select: VIDEO_REPLY_SELECT,
    });

    return videoReply;
  }

  async getByComment(commentId: string, cursor?: string, limit = 20) {
    const videoReplies = await this.prisma.videoReply.findMany({
      where: {
        commentId,
        isDeleted: false,
      },
      select: VIDEO_REPLY_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = videoReplies.length > limit;
    const items = hasMore ? videoReplies.slice(0, limit) : videoReplies;

    // Fetch user data for all unique userIds
    const userIds = [...new Set(items.map((vr) => vr.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isBanned: false, isDeactivated: false, isDeleted: false },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
      take: 50,
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = items.map((vr) => ({
      ...vr,
      user: userMap.get(vr.userId) ?? null,
    }));

    return {
      data,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getById(id: string) {
    const videoReply = await this.prisma.videoReply.findUnique({
      where: { id },
      select: {
        ...VIDEO_REPLY_SELECT,
        isDeleted: true,
      },
    });

    if (!videoReply || videoReply.isDeleted) {
      throw new NotFoundException('Video reply not found');
    }

    const { isDeleted: _isDeleted, ...result } = videoReply;
    return result;
  }

  async delete(id: string, userId: string) {
    const videoReply = await this.prisma.videoReply.findUnique({
      where: { id },
      select: { id: true, userId: true, isDeleted: true },
    });

    if (!videoReply || videoReply.isDeleted) {
      throw new NotFoundException('Video reply not found');
    }

    if (videoReply.userId !== userId) {
      throw new ForbiddenException('Not your video reply');
    }

    await this.prisma.videoReply.update({
      where: { id },
      data: { isDeleted: true },
    });

    return { deleted: true };
  }
}
