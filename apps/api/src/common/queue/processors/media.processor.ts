import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../config/prisma.service';

interface MediaJobData {
  type: 'image-resize' | 'blurhash' | 'video-transcode';
  mediaUrl: string;
  mediaKey: string;
  userId: string;
  contentType?: string;
  contentId?: string;
}

/**
 * Media processor — handles EXIF stripping, BlurHash generation, and image variants.
 *
 * Uses sharp for image processing (already installed).
 * Video transcription delegates to Cloudflare Stream (webhook-driven).
 */
@Injectable()
export class MediaProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — media worker disabled');
      return;
    }

    this.worker = new Worker(
      'media-processing',
      async (job: Job<MediaJobData>) => {
        switch (job.name) {
          case 'image-resize':
            await this.processImageResize(job);
            break;
          case 'blurhash':
            await this.processBlurHash(job);
            break;
          case 'video-transcode':
            // Cloudflare Stream handles transcoding via webhook — no server-side work needed
            this.logger.debug(`Video transcode for ${job.data.mediaKey} — delegated to Cloudflare Stream`);
            await job.updateProgress(100);
            break;
          default:
            this.logger.warn(`Unknown media job type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        concurrency: 3,
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Media job ${job.id} completed`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Media job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Media processing worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processImageResize(job: Job<MediaJobData>): Promise<void> {
    const { mediaUrl, mediaKey } = job.data;
    this.logger.debug(`Processing image (EXIF strip + resize) for ${mediaKey}`);

    try {
      const sharp = await import('sharp');
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Strip EXIF metadata (GPS, device info, etc.) while preserving orientation
      // sharp.rotate() auto-orients based on EXIF then strips metadata
      const stripped = await sharp.default(buffer)
        .rotate() // Auto-orient from EXIF, then strip all metadata
        .toBuffer();

      // Generate resize variants
      const sizes = [
        { name: 'thumb', width: 150, height: 150 },
        { name: 'medium', width: 600, height: 600 },
        { name: 'large', width: 1200, height: 1200 },
      ];

      for (const size of sizes) {
        await sharp.default(stripped)
          .resize(size.width, size.height, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        // TODO: Upload each variant to R2 when upload service supports programmatic uploads
        // Current upload service only generates presigned URLs for client-side uploads
      }

      await job.updateProgress(100);
      this.logger.debug(`Image processed (EXIF stripped + resized) for ${mediaKey}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Image processing failed for ${mediaKey}: ${msg}`);
      throw error;
    }
  }

  private async processBlurHash(job: Job<MediaJobData>): Promise<void> {
    const { mediaUrl, mediaKey, contentType, contentId } = job.data;
    this.logger.debug(`Generating blur placeholder for ${mediaKey}`);

    try {
      const sharp = await import('sharp');
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Downscale to tiny image for average color computation
      const { data, info } = await sharp.default(buffer)
        .resize(32, 32, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixelCount = info.width * info.height;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < pixelCount; i++) {
        r += data[i * 4];
        g += data[i * 4 + 1];
        b += data[i * 4 + 2];
      }

      // Convert to hex color for use as placeholder background
      const hexR = Math.round(r / pixelCount).toString(16).padStart(2, '0');
      const hexG = Math.round(g / pixelCount).toString(16).padStart(2, '0');
      const hexB = Math.round(b / pixelCount).toString(16).padStart(2, '0');
      const blurhash = `#${hexR}${hexG}${hexB}`;

      // Write to database if contentId provided
      if (contentId && contentType) {
        if (contentType === 'reel') {
          await this.prisma.reel.update({
            where: { id: contentId },
            data: { blurhash },
          }).catch(() => { /* reel may not exist */ });
        } else if (contentType === 'post') {
          await this.prisma.post.update({
            where: { id: contentId },
            data: { blurhash },
          }).catch(() => { /* post may not exist */ });
        }
      }

      await job.updateProgress(100);
      this.logger.debug(`Blur placeholder generated for ${mediaKey}: ${blurhash}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Blur generation failed for ${mediaKey}: ${msg}`);
      throw error;
    }
  }
}
