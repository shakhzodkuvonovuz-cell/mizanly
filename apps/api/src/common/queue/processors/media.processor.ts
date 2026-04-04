import * as Sentry from "@sentry/node";
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../config/prisma.service';
import { DlqService } from '../dlq.service';
import { assertNotPrivateUrl } from '../../utils/ssrf';
import { attachCorrelationId } from '../with-correlation';

interface MediaJobData {
  type: 'image-resize' | 'blurhash' | 'video-transcode';
  mediaUrl: string;
  mediaKey: string;
  userId: string;
  contentType?: string;
  contentId?: string;
}

/**
 * Media processor -- handles EXIF stripping, BlurHash generation, and image variants.
 *
 * Uses sharp for image processing (already installed).
 * Video transcription delegates to Cloudflare Stream (webhook-driven).
 *
 * LEGAL NOTE (Finding 22 -- GDPR Article 25, Data Protection by Design):
 * The image-resize job strips EXIF metadata (GPS coordinates, device info, timestamps)
 * from processed images via sharp.rotate(). However, the ORIGINAL file uploaded directly
 * to R2 via presigned URL still contains full EXIF data. The original URL is stored in
 * mediaUrls[] and served to users.
 *
 * TODO: [LEGAL/PRIVACY] After processing, REPLACE the original file in R2 with the
 * EXIF-stripped version. This requires:
 * 1. Upload service to support programmatic PUT (not just presigned URLs)
 * 2. Post-processing step that overwrites the original key with the stripped buffer
 * 3. Or: route all uploads through the server instead of direct-to-R2
 * Until then, user GPS coordinates may be embedded in uploaded photos.
 */
@Injectable()
export class MediaProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaProcessor.name);
  private worker: Worker | null = null;
  private s3Client: InstanceType<typeof import('@aws-sdk/client-s3').S3Client> | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private dlq: DlqService,
  ) {}

  private async getS3Client() {
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

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set -- media worker disabled');
      return;
    }

    this.worker = new Worker(
      'media-processing',
      async (job: Job<MediaJobData>) => {
        attachCorrelationId(job, this.logger);
        switch (job.name) {
          case 'image-resize':
            await this.processImageResize(job);
            break;
          case 'blurhash':
            await this.processBlurHash(job);
            break;
          case 'video-transcode':
            // Video transcoding is fully handled by Cloudflare Stream:
            // 1. Videos are uploaded directly to Stream via upload.service.ts
            // 2. Stream automatically transcodes to HLS/DASH adaptive bitrate
            // 3. When transcoding completes, Stream sends a webhook to stream.controller.ts
            // 4. The webhook handler sets video.status = 'PUBLISHED' and video.publishedAt
            // No server-side transcoding is needed -- this job type exists for completeness
            // and to provide a hook if a non-Stream video pipeline is ever needed.
            this.logger.debug(`Video transcode for ${job.data.mediaKey} -- delegated to Cloudflare Stream`);
            await job.updateProgress(100);
            break;
          default:
            throw new Error(`Unknown media job type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        prefix: 'mizanly',
        concurrency: 3,
        lockDuration: 120000,
        maxStalledCount: 3,
        settings: {
          stalledInterval: 120000,
        },
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Media job ${job.id} completed`);
      const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
      if (duration > 5000) this.logger.warn(`Job ${job.id} (${job.name}) took ${duration}ms`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const maxAttempts = job?.opts?.attempts ?? 1;
      if (job && job.attemptsMade >= maxAttempts) {
        Sentry.captureException(err, {
          tags: { queue: 'media-processing', jobName: job.name },
          extra: { jobId: job.id, attemptsMade: job.attemptsMade, data: job.data },
        });
        this.dlq.moveToDlq(job, err, 'media-processing').catch((e) => this.logger.error('DLQ routing failed for media-processing', e?.message));
      }
      this.logger.error(`Media job ${job?.id} failed (attempt ${job?.attemptsMade ?? '?'}/${maxAttempts}): ${err.message}`);
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error(`Media worker error: ${err.message}`);
      Sentry.captureException(err, { tags: { queue: 'media-processing' } });
    });

    this.worker.on('stalled', (jobId: string) => {
      this.logger.warn(`Media job ${jobId} stalled -- being re-executed`);
    });

    this.logger.log('Media processing worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async validateMediaUrl(url: string): Promise<void> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new Error('Media URL: only HTTPS is allowed');
    }
    await assertNotPrivateUrl(url, 'Media URL');
  }

  private async processImageResize(job: Job<MediaJobData>): Promise<void> {
    const { mediaUrl, mediaKey } = job.data;
    await this.validateMediaUrl(mediaUrl);
    this.logger.debug(`Processing image (EXIF strip + resize) for ${mediaKey}`);

    try {
      const sharp = await import('sharp');
      const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      // Reject files > 50MB to prevent OOM
      const contentLength = Number(response.headers.get('content-length') || '0');
      if (contentLength > 50 * 1024 * 1024) {
        throw new Error(`Image too large: ${contentLength} bytes (max 50MB)`);
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

      // Upload each resized variant to R2 (reuse singleton S3Client)
      const s3 = await this.getS3Client();
      const r2Bucket = this.config.get<string>('R2_BUCKET_NAME') || 'mizanly-media';

      for (const size of sizes) {
        const resizedBuffer = await sharp.default(stripped)
          .resize(size.width, size.height, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        if (s3) {
          const variantKey = mediaKey.replace(/(\.[^.]+)$/, `-${size.name}$1`);
          try {
            const { PutObjectCommand } = await import('@aws-sdk/client-s3');
            await s3.send(new PutObjectCommand({
              Bucket: r2Bucket,
              Key: variantKey,
              Body: resizedBuffer,
              ContentType: 'image/jpeg',
            }));
            this.logger.debug(`Uploaded ${size.name} variant: ${variantKey}`);
          } catch (uploadErr) {
            this.logger.warn(`Failed to upload ${size.name} variant for ${mediaKey}: ${uploadErr instanceof Error ? uploadErr.message : uploadErr}`);
          }
        } else {
          this.logger.debug(`R2 credentials not configured -- skipping ${size.name} variant upload for ${mediaKey}`);
        }
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
    await this.validateMediaUrl(mediaUrl);
    this.logger.debug(`Generating BlurHash for ${mediaKey}`);

    try {
      const sharp = await import('sharp');
      const { encode } = await import('blurhash');
      const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      // Reject files > 50MB to prevent OOM
      const contentLength = Number(response.headers.get('content-length') || '0');
      if (contentLength > 50 * 1024 * 1024) {
        throw new Error(`Image too large for BlurHash: ${contentLength} bytes (max 50MB)`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Downscale to small image for BlurHash encoding (4x3 components = good quality)
      const { data, info } = await sharp.default(buffer)
        .resize(32, 32, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Encode real BlurHash (produces compact string like "LEHV6nWB2yk8pyo0adR*.7kCMdnj")
      const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);

      // Write to database if contentId provided
      if (contentId && contentType) {
        const updateData = { blurhash };
        if (contentType === 'reel') {
          await this.prisma.reel.update({ where: { id: contentId }, data: updateData }).catch((e) => this.logger.warn(`BlurHash DB write failed for reel/${contentId}`, e?.message));
        } else if (contentType === 'post') {
          await this.prisma.post.update({ where: { id: contentId }, data: updateData }).catch((e) => this.logger.warn(`BlurHash DB write failed for post/${contentId}`, e?.message));
        } else if (contentType === 'story') {
          await this.prisma.story.update({ where: { id: contentId }, data: updateData }).catch((e) => this.logger.warn(`BlurHash DB write failed for story/${contentId}`, e?.message));
        } else if (contentType === 'video') {
          await this.prisma.video.update({ where: { id: contentId }, data: { blurhash } }).catch((e) => this.logger.warn(`BlurHash DB write failed for video/${contentId}`, e?.message));
        }
      }

      await job.updateProgress(100);
      this.logger.debug(`BlurHash generated for ${mediaKey}: ${blurhash}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`BlurHash generation failed for ${mediaKey}: ${msg}`);
      throw error;
    }
  }
}
