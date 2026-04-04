import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
import { acquireCronLock } from '../../common/utils/cron-lock';

/**
 * Orphaned upload cleanup service.
 *
 * When a user gets a presigned URL, uploads a file to R2, then abandons the
 * post/story/thread, the R2 object persists forever. This cron reconciles
 * R2 objects against DB references and deletes orphaned uploads older than 24 hours.
 *
 * Strategy:
 * - List R2 objects using S3 ListObjectsV2 API
 * - For each object, check if its key is referenced in any content table
 * - If not referenced and older than 24 hours, delete it
 * - Processes in batches of 1000 objects per run to avoid timeout
 *
 * Runs daily at 3 AM (low-traffic window).
 */
@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);
  private s3Client: InstanceType<typeof import('@aws-sdk/client-s3').S3Client> | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  private async getS3Client(): Promise<InstanceType<typeof import('@aws-sdk/client-s3').S3Client> | null> {
    if (this.s3Client) return this.s3Client;
    const r2AccountId = this.config.get<string>('R2_ACCOUNT_ID') || this.config.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const r2AccessKey = this.config.get<string>('R2_ACCESS_KEY_ID') || this.config.get<string>('CLOUDFLARE_R2_ACCESS_KEY');
    const r2SecretKey = this.config.get<string>('R2_SECRET_ACCESS_KEY') || this.config.get<string>('CLOUDFLARE_R2_SECRET_KEY');
    if (!r2AccountId || !r2AccessKey || !r2SecretKey) return null;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
    });
    return this.s3Client;
  }

  /**
   * Daily orphaned upload cleanup.
   * Lists R2 objects, checks if referenced in DB, deletes orphans older than 24h.
   */
  @Cron('0 3 * * *') // 3 AM daily
  async cleanupOrphanedUploads(): Promise<{ checked: number; deleted: number }> {
    if (!await acquireCronLock(this.redis, 'cron:cleanupOrphanedUploads', 3500, this.logger)) {
      return { checked: 0, deleted: 0 };
    }

    const s3 = await this.getS3Client();
    if (!s3) {
      this.logger.warn('R2 credentials not configured — orphan cleanup skipped');
      return { checked: 0, deleted: 0 };
    }

    const bucket = this.config.get<string>('R2_BUCKET_NAME') || 'mizanly-media';
    const publicUrl = this.config.get<string>('R2_PUBLIC_URL') || 'https://media.mizanly.app';
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Process each upload folder separately
    const folders = ['posts', 'stories', 'messages', 'reels', 'videos', 'thumbnails', 'avatars', 'covers', 'misc'];
    let totalChecked = 0;
    let totalDeleted = 0;

    try {
      for (const folder of folders) {
        const { checked, deleted } = await this.cleanupFolder(s3, bucket, publicUrl, folder, cutoffDate);
        totalChecked += checked;
        totalDeleted += deleted;
      }

      this.logger.log(`Orphan cleanup complete: checked=${totalChecked}, deleted=${totalDeleted}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Orphan cleanup failed: ${msg}`);
      Sentry.captureException(error, { tags: { cron: 'cleanupOrphanedUploads' } });
    }

    return { checked: totalChecked, deleted: totalDeleted };
  }

  private async cleanupFolder(
    s3: InstanceType<typeof import('@aws-sdk/client-s3').S3Client>,
    bucket: string,
    publicUrl: string,
    folder: string,
    cutoffDate: Date,
  ): Promise<{ checked: number; deleted: number }> {
    const { ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    let checked = 0;
    let deleted = 0;
    let continuationToken: string | undefined;

    // Process up to 1000 objects per folder per run
    const maxObjectsPerFolder = 1000;

    do {
      const listResult = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${folder}/`,
        MaxKeys: Math.min(200, maxObjectsPerFolder - checked),
        ContinuationToken: continuationToken,
      }));

      const objects = listResult.Contents ?? [];
      if (objects.length === 0) break;

      for (const obj of objects) {
        if (!obj.Key || !obj.LastModified) continue;
        if (obj.LastModified >= cutoffDate) continue; // Skip objects younger than 24h

        checked++;
        const fileUrl = `${publicUrl}/${obj.Key}`;

        // Check if this URL is referenced in any content table
        const isReferenced = await this.isMediaReferenced(fileUrl, obj.Key);

        if (!isReferenced) {
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
            deleted++;
            this.logger.debug(`Deleted orphan: ${obj.Key}`);
          } catch (delErr) {
            this.logger.warn(`Failed to delete orphan ${obj.Key}: ${delErr instanceof Error ? delErr.message : delErr}`);
          }
        }
      }

      continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken && checked < maxObjectsPerFolder);

    if (deleted > 0) {
      this.logger.log(`Folder ${folder}: checked=${checked}, deleted=${deleted}`);
    }

    return { checked, deleted };
  }

  /**
   * Check if a media URL or key is referenced in any content table.
   * Uses a single batched query approach for efficiency.
   */
  private async isMediaReferenced(fileUrl: string, key: string): Promise<boolean> {
    // Check posts (mediaUrls is a JSON array)
    const postRef = await this.prisma.post.findFirst({
      where: { mediaUrls: { has: fileUrl } },
      select: { id: true },
    });
    if (postRef) return true;

    // Check stories
    const storyRef = await this.prisma.story.findFirst({
      where: {
        OR: [
          { mediaUrl: fileUrl },
          { thumbnailUrl: fileUrl },
        ],
      },
      select: { id: true },
    });
    if (storyRef) return true;

    // Check threads (mediaUrls is a JSON array)
    const threadRef = await this.prisma.thread.findFirst({
      where: { mediaUrls: { has: fileUrl } },
      select: { id: true },
    });
    if (threadRef) return true;

    // Check reels
    const reelRef = await this.prisma.reel.findFirst({
      where: {
        OR: [
          { videoUrl: fileUrl },
          { thumbnailUrl: fileUrl },
          { carouselUrls: { has: fileUrl } },
        ],
      },
      select: { id: true },
    });
    if (reelRef) return true;

    // Check videos
    const videoRef = await this.prisma.video.findFirst({
      where: {
        OR: [
          { videoUrl: fileUrl },
          { thumbnailUrl: fileUrl },
        ],
      },
      select: { id: true },
    });
    if (videoRef) return true;

    // Check user avatars/covers
    const userRef = await this.prisma.user.findFirst({
      where: {
        OR: [
          { avatarUrl: fileUrl },
          { coverUrl: fileUrl },
        ],
      },
      select: { id: true },
    });
    if (userRef) return true;

    // Check messages (mediaUrl field)
    const messageRef = await this.prisma.message.findFirst({
      where: { mediaUrl: fileUrl },
      select: { id: true },
    });
    if (messageRef) return true;

    return false;
  }
}
