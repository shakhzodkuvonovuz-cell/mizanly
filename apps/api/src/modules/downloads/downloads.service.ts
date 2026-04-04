import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ThumbnailContentType, DownloadQuality } from '@prisma/client';
import { CreateDownloadDto } from './dto/create-download.dto';

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);
  constructor(private prisma: PrismaService) {}

  /** Upsert an OfflineDownload record; verify content exists and is downloadable */
  async requestDownload(userId: string, dto: CreateDownloadDto) {
    // Verify content exists
    const mediaUrl = await this.resolveMediaUrl(dto.contentType, dto.contentId);
    if (!mediaUrl) {
      throw new NotFoundException(`${dto.contentType} not found or has no media`);
    }

    // Upsert — if user already requested this content, reset to pending
    const download = await this.prisma.offlineDownload.upsert({
      where: { userId_contentId: { userId, contentId: dto.contentId } },
      update: {
        status: 'PENDING',
        progress: 0,
        quality: (dto.quality as DownloadQuality) ?? 'auto',
      },
      create: {
        userId,
        contentType: dto.contentType as ThumbnailContentType,
        contentId: dto.contentId,
        quality: (dto.quality as DownloadQuality) ?? 'auto',
        status: 'PENDING',
        progress: 0,
      },
    });

    return download;
  }

  /** Paginated list of downloads for a user, optionally filtered by status */
  async getDownloads(userId: string, status?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const downloads = await this.prisma.offlineDownload.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
    });

    const hasMore = downloads.length > limit;
    const items = hasMore ? downloads.slice(0, limit) : downloads;

    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  /** Resolve the actual media URL for a download record */
  async getDownloadUrl(userId: string, downloadId: string) {
    const download = await this.prisma.offlineDownload.findUnique({
      where: { id: downloadId },
    });
    if (!download) throw new NotFoundException('Download not found');
    if (download.userId !== userId) throw new ForbiddenException();

    const url = await this.resolveMediaUrl(download.contentType, download.contentId);
    if (!url) throw new NotFoundException('Content no longer available');

    return { url };
  }

  /** Update download progress and optionally fileSize */
  async updateProgress(userId: string, downloadId: string, progress: number, fileSize?: number) {
    const download = await this.prisma.offlineDownload.findUnique({
      where: { id: downloadId },
    });
    if (!download) throw new NotFoundException('Download not found');
    if (download.userId !== userId) throw new ForbiddenException();

    const status = progress >= 1 ? 'complete' : 'downloading';
    const data: Record<string, unknown> = { progress, status };
    if (fileSize !== undefined) data.fileSize = fileSize;

    return this.prisma.offlineDownload.update({
      where: { id: downloadId },
      data,
    });
  }

  /** Delete a download record */
  async deleteDownload(userId: string, downloadId: string) {
    const download = await this.prisma.offlineDownload.findUnique({
      where: { id: downloadId },
    });
    if (!download) throw new NotFoundException('Download not found');
    if (download.userId !== userId) throw new ForbiddenException();

    await this.prisma.offlineDownload.delete({ where: { id: downloadId } });
    return;
  }

  /** Aggregate fileSize for all complete downloads of a user */
  async getStorageUsed(userId: string) {
    const result = await this.prisma.offlineDownload.aggregate({
      where: { userId, status: 'COMPLETE' },
      _sum: { fileSize: true },
      _count: true,
    });

    return {
      usedBytes: result._sum.fileSize ?? 0,
      count: result._count,
    };
  }

  // ── Private helpers ──

  /** Look up the media URL for a given content type + id */
  private async resolveMediaUrl(contentType: string, contentId: string): Promise<string | null> {
    switch (contentType) {
      case 'post': {
        const post = await this.prisma.post.findUnique({
          where: { id: contentId, isRemoved: false },
          select: { mediaUrls: true, thumbnailUrl: true },
        });
        if (!post) return null;
        // Return the first media URL, or thumbnail
        return post.mediaUrls[0] ?? post.thumbnailUrl ?? null;
      }
      case 'video': {
        const video = await this.prisma.video.findUnique({
          where: { id: contentId, isRemoved: false },
          select: { videoUrl: true, hlsUrl: true },
        });
        if (!video) return null;
        return video.hlsUrl ?? video.videoUrl ?? null;
      }
      case 'reel': {
        const reel = await this.prisma.reel.findUnique({
          where: { id: contentId, isRemoved: false },
          select: { videoUrl: true, hlsUrl: true },
        });
        if (!reel) return null;
        return reel.hlsUrl ?? reel.videoUrl ?? null;
      }
      default:
        throw new BadRequestException(`Unsupported content type: ${contentType}`);
    }
  }
}
