# Batch 38 — Video Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Cloudflare Stream for adaptive bitrate video playback, add quality/speed/loop controls, thumbnail customization, and volume normalization flag.

**Architecture:** Mobile uploads video to R2 (existing flow). API creates DB record with `status: PROCESSING`, then calls Cloudflare Stream's "copy from URL" API to ingest the R2 file. Stream processes and sends a webhook (`stream.ready`) back to the API, which updates `hlsUrl`, `qualities[]`, and `status: PUBLISHED`. Mobile plays HLS when available, falls back to raw R2 URL.

**Tech Stack:** NestJS (stream module), Prisma (schema fields), expo-av (HLS playback), expo-video-thumbnails (frame picker), Cloudflare Stream API

---

## Task 1: Schema — Add Video/Reel Stream Fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Video model ~line 706, Reel model ~line 494)

**Step 1: Add fields to Video model**

In `schema.prisma`, after the `streamId String?` line (~706) in the Video model, add:

```prisma
  hlsUrl       String?
  dashUrl      String?
  qualities    String[]    @default([])
  isLooping    Boolean     @default(false)
  normalizeAudio Boolean   @default(false)
```

**Step 2: Add fields to Reel model**

In `schema.prisma`, after the `streamId String?` line (~494) in the Reel model, add:

```prisma
  hlsUrl       String?
  dashUrl      String?
  qualities    String[]    @default([])
  isLooping    Boolean     @default(true)
  normalizeAudio Boolean   @default(false)
```

**Step 3: Push schema**

Run: `cd apps/api && npx prisma db push`
Expected: schema updates applied, no errors

**Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(schema): add hlsUrl, dashUrl, qualities, isLooping, normalizeAudio to Video and Reel"
```

---

## Task 2: API — StreamService

**Files:**
- Create: `apps/api/src/modules/stream/stream.service.ts`
- Create: `apps/api/src/modules/stream/stream.module.ts`
- Create: `apps/api/src/modules/stream/stream.controller.ts`
- Create: `apps/api/src/modules/stream/stream.service.spec.ts`

**Step 1: Write the test file**

Create `apps/api/src/modules/stream/stream.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StreamService } from './stream.service';
import { PrismaService } from '../../config/prisma.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('StreamService', () => {
  let service: StreamService;
  let prisma: any;

  beforeEach(async () => {
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                CF_STREAM_ACCOUNT_ID: 'test-account-id',
                CF_STREAM_API_TOKEN: 'test-api-token',
                CF_STREAM_WEBHOOK_SECRET: 'test-webhook-secret',
              };
              return config[key];
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            video: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            reel: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<StreamService>(StreamService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('uploadFromUrl', () => {
    it('should call Cloudflare Stream copy endpoint and return streamId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          result: { uid: 'stream-uid-123' },
        }),
      });

      const result = await service.uploadFromUrl(
        'https://media.mizanly.app/videos/user1/abc.mp4',
        { title: 'Test Video', creatorId: 'user1' },
      );

      expect(result).toBe('stream-uid-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/stream/copy',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-token',
          }),
        }),
      );
    });

    it('should throw on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ errors: [{ message: 'Invalid URL' }] }),
      });

      await expect(
        service.uploadFromUrl('https://bad-url.com/video.mp4', { title: 'Test', creatorId: 'u1' }),
      ).rejects.toThrow('Cloudflare Stream upload failed');
    });
  });

  describe('getPlaybackUrls', () => {
    it('should return HLS and DASH URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          result: {
            uid: 'stream-uid-123',
            playback: {
              hls: 'https://customer-xxx.cloudflarestream.com/stream-uid-123/manifest/video.m3u8',
              dash: 'https://customer-xxx.cloudflarestream.com/stream-uid-123/manifest/video.mpd',
            },
            readyToStream: true,
            input: { width: 1920, height: 1080 },
          },
        }),
      });

      const result = await service.getPlaybackUrls('stream-uid-123');
      expect(result.hlsUrl).toContain('video.m3u8');
      expect(result.dashUrl).toContain('video.mpd');
    });
  });

  describe('deleteVideo', () => {
    it('should call Cloudflare Stream delete endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });

      await service.deleteVideo('stream-uid-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/stream/stream-uid-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('handleWebhook', () => {
    it('should update video when stream.ready fires for a Video', async () => {
      prisma.video.findFirst.mockResolvedValueOnce({ id: 'video-1', streamId: 'stream-uid-123' });
      prisma.video.update.mockResolvedValueOnce({});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          result: {
            uid: 'stream-uid-123',
            readyToStream: true,
            playback: {
              hls: 'https://stream.com/manifest/video.m3u8',
              dash: 'https://stream.com/manifest/video.mpd',
            },
            input: { width: 1920, height: 1080 },
          },
        }),
      });

      await service.handleStreamReady('stream-uid-123');

      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'video-1' },
          data: expect.objectContaining({
            hlsUrl: expect.stringContaining('m3u8'),
            status: 'PUBLISHED',
          }),
        }),
      );
    });

    it('should update reel when stream.ready fires for a Reel', async () => {
      prisma.video.findFirst.mockResolvedValueOnce(null);
      prisma.reel.findFirst.mockResolvedValueOnce({ id: 'reel-1', streamId: 'stream-uid-456' });
      prisma.reel.update.mockResolvedValueOnce({});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          result: {
            uid: 'stream-uid-456',
            readyToStream: true,
            playback: {
              hls: 'https://stream.com/manifest/video.m3u8',
              dash: 'https://stream.com/manifest/video.mpd',
            },
            input: { width: 1080, height: 1920 },
          },
        }),
      });

      await service.handleStreamReady('stream-uid-456');

      expect(prisma.reel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reel-1' },
          data: expect.objectContaining({
            hlsUrl: expect.stringContaining('m3u8'),
            status: 'READY',
          }),
        }),
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/stream/stream.service.spec.ts --no-coverage`
Expected: FAIL — `Cannot find module './stream.service'`

**Step 3: Write StreamService**

Create `apps/api/src/modules/stream/stream.service.ts`:

```typescript
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

interface UploadMeta {
  title: string;
  creatorId: string;
}

interface PlaybackUrls {
  hlsUrl: string;
  dashUrl: string;
  thumbnailUrl: string;
  qualities: string[];
}

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.accountId = this.config.get('CF_STREAM_ACCOUNT_ID') ?? '';
    this.apiToken = this.config.get('CF_STREAM_API_TOKEN') ?? '';
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Upload a video to Cloudflare Stream by providing an R2 public URL.
   * Stream will fetch and transcode the video asynchronously.
   * Returns the Stream UID (streamId).
   */
  async uploadFromUrl(r2PublicUrl: string, meta: UploadMeta): Promise<string> {
    const response = await fetch(`${this.baseUrl}/copy`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        url: r2PublicUrl,
        meta: { name: meta.title, creator: meta.creatorId },
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      this.logger.error('Cloudflare Stream upload failed', data.errors);
      throw new InternalServerErrorException('Cloudflare Stream upload failed');
    }

    return data.result.uid;
  }

  /**
   * Get playback URLs and metadata for a Stream video.
   */
  async getPlaybackUrls(streamId: string): Promise<PlaybackUrls> {
    const response = await fetch(`${this.baseUrl}/${streamId}`, {
      method: 'GET',
      headers: this.headers(),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      this.logger.error('Failed to get Stream playback URLs', data.errors);
      throw new InternalServerErrorException('Failed to get Stream status');
    }

    const result = data.result;
    const width = result.input?.width ?? 0;
    const height = result.input?.height ?? 0;
    const maxDimension = Math.max(width, height);

    // Determine available qualities based on source resolution
    const qualities: string[] = [];
    if (maxDimension >= 360) qualities.push('360p');
    if (maxDimension >= 720) qualities.push('720p');
    if (maxDimension >= 1080) qualities.push('1080p');
    if (maxDimension >= 2160) qualities.push('4k');

    return {
      hlsUrl: result.playback?.hls ?? '',
      dashUrl: result.playback?.dash ?? '',
      thumbnailUrl: `https://customer-${this.accountId}.cloudflarestream.com/${streamId}/thumbnails/thumbnail.jpg`,
      qualities,
    };
  }

  /**
   * Delete a video from Cloudflare Stream.
   */
  async deleteVideo(streamId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${streamId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });

    if (!response.ok) {
      this.logger.warn(`Failed to delete Stream video ${streamId}`);
    }
  }

  /**
   * Handle Cloudflare Stream "ready to stream" event.
   * Finds the matching Video or Reel by streamId and updates playback URLs + status.
   */
  async handleStreamReady(streamId: string): Promise<void> {
    // Get playback URLs from Stream
    const playback = await this.getPlaybackUrls(streamId);

    // Try Video first
    const video = await this.prisma.video.findFirst({ where: { streamId } });
    if (video) {
      await this.prisma.video.update({
        where: { id: video.id },
        data: {
          hlsUrl: playback.hlsUrl,
          dashUrl: playback.dashUrl,
          qualities: playback.qualities,
          status: 'PUBLISHED',
        },
      });
      this.logger.log(`Video ${video.id} ready for streaming`);
      return;
    }

    // Try Reel
    const reel = await this.prisma.reel.findFirst({ where: { streamId } });
    if (reel) {
      await this.prisma.reel.update({
        where: { id: reel.id },
        data: {
          hlsUrl: playback.hlsUrl,
          dashUrl: playback.dashUrl,
          qualities: playback.qualities,
          status: 'READY',
        },
      });
      this.logger.log(`Reel ${reel.id} ready for streaming`);
      return;
    }

    this.logger.warn(`No Video or Reel found for streamId ${streamId}`);
  }

  /**
   * Handle Cloudflare Stream error event.
   */
  async handleStreamError(streamId: string, error: string): Promise<void> {
    this.logger.error(`Stream error for ${streamId}: ${error}`);

    const video = await this.prisma.video.findFirst({ where: { streamId } });
    if (video) {
      await this.prisma.video.update({
        where: { id: video.id },
        data: { status: 'DRAFT' },
      });
      return;
    }

    const reel = await this.prisma.reel.findFirst({ where: { streamId } });
    if (reel) {
      await this.prisma.reel.update({
        where: { id: reel.id },
        data: { status: 'FAILED' },
      });
    }
  }
}
```

**Step 4: Write StreamController**

Create `apps/api/src/modules/stream/stream.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { StreamService } from './stream.service';
import { createHmac, timingSafeEqual } from 'crypto';

@ApiTags('Stream Webhooks')
@Controller('stream')
export class StreamController {
  private readonly logger = new Logger(StreamController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly streamService: StreamService,
    private config: ConfigService,
  ) {
    this.webhookSecret = this.config.get('CF_STREAM_WEBHOOK_SECRET') ?? '';
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Body() body: { uid: string; readyToStream?: boolean; status?: { state: string; errorReasonCode?: string } },
    @Headers('webhook-signature') signature?: string,
  ) {
    // Verify webhook signature if secret is configured
    if (this.webhookSecret && signature) {
      this.verifySignature(JSON.stringify(body), signature);
    }

    const streamId = body.uid;
    if (!streamId) {
      this.logger.warn('Webhook received without uid');
      return { received: true };
    }

    if (body.readyToStream) {
      await this.streamService.handleStreamReady(streamId);
    } else if (body.status?.state === 'error') {
      await this.streamService.handleStreamError(
        streamId,
        body.status.errorReasonCode ?? 'unknown',
      );
    }

    return { received: true };
  }

  private verifySignature(payload: string, signature: string) {
    // Cloudflare webhook signature format: time=<timestamp>,sig1=<hex>
    const parts = signature.split(',');
    const timePart = parts.find(p => p.startsWith('time='));
    const sigPart = parts.find(p => p.startsWith('sig1='));

    if (!timePart || !sigPart) {
      throw new UnauthorizedException('Invalid webhook signature format');
    }

    const timestamp = timePart.replace('time=', '');
    const expectedSig = sigPart.replace('sig1=', '');

    const signaturePayload = `${timestamp}.${payload}`;
    const computed = createHmac('sha256', this.webhookSecret)
      .update(signaturePayload)
      .digest('hex');

    if (!timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSig))) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
```

**Step 5: Write StreamModule**

Create `apps/api/src/modules/stream/stream.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Module({
  controllers: [StreamController],
  providers: [StreamService],
  exports: [StreamService],
})
export class StreamModule {}
```

**Step 6: Run tests**

Run: `cd apps/api && npx jest src/modules/stream/stream.service.spec.ts --no-coverage`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/stream/
git commit -m "feat(api): add StreamService for Cloudflare Stream integration"
```

---

## Task 3: API — Register StreamModule + Integrate with Videos/Reels

**Files:**
- Modify: `apps/api/src/app.module.ts` (~line 56, imports array)
- Modify: `apps/api/src/modules/videos/videos.module.ts`
- Modify: `apps/api/src/modules/videos/videos.service.ts` (~lines 93-138, create method; ~lines 307-323, delete method)
- Modify: `apps/api/src/modules/videos/dto/create-video.dto.ts`
- Modify: `apps/api/src/modules/reels/reels.module.ts`
- Modify: `apps/api/src/modules/reels/reels.service.ts` (~lines 59-108, create method; ~lines 268-281, delete method)
- Modify: `apps/api/src/modules/reels/dto/create-reel.dto.ts`

**Step 1: Register StreamModule in AppModule**

In `apps/api/src/app.module.ts`, add import:
```typescript
import { StreamModule } from './modules/stream/stream.module';
```

Add `StreamModule` to the imports array (after `CommunitiesModule`).

**Step 2: Import StreamModule in VideosModule**

In `apps/api/src/modules/videos/videos.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [NotificationsModule, StreamModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
```

**Step 3: Import StreamModule in ReelsModule**

In `apps/api/src/modules/reels/reels.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [NotificationsModule, StreamModule],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService],
})
export class ReelsModule {}
```

**Step 4: Add `normalizeAudio` to CreateVideoDto**

In `apps/api/src/modules/videos/dto/create-video.dto.ts`, add at the end of the class:
```typescript
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  normalizeAudio?: boolean;
```

Add `IsBoolean` to the class-validator import.

**Step 5: Add `normalizeAudio` to CreateReelDto**

In `apps/api/src/modules/reels/dto/create-reel.dto.ts`, add at the end of the class:
```typescript
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  normalizeAudio?: boolean;
```

(`IsBoolean` already imported.)

**Step 6: Integrate StreamService into VideosService**

In `apps/api/src/modules/videos/videos.service.ts`:

Add import at top:
```typescript
import { StreamService } from '../stream/stream.service';
```

Add to constructor:
```typescript
constructor(
  private prisma: PrismaService,
  @Inject('REDIS') private redis: Redis,
  private notifications: NotificationsService,
  private stream: StreamService,
) {}
```

Replace the `create` method (~lines 93-138) — remove the immediate PUBLISHED update and add Stream ingestion:

```typescript
  async create(userId: string, dto: CreateVideoDto) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException();

    const [video] = await this.prisma.$transaction([
      this.prisma.video.create({
        data: {
          userId,
          channelId: dto.channelId,
          title: sanitizeText(dto.title),
          description: dto.description ? sanitizeText(dto.description) : dto.description,
          videoUrl: dto.videoUrl,
          thumbnailUrl: dto.thumbnailUrl,
          duration: dto.duration,
          category: dto.category || VideoCategory.OTHER,
          tags: dto.tags || [],
          normalizeAudio: dto.normalizeAudio ?? false,
          status: VideoStatus.PROCESSING,
          publishedAt: new Date(),
        },
        select: VIDEO_SELECT,
      }),
      this.prisma.channel.update({
        where: { id: dto.channelId },
        data: { videosCount: { increment: 1 } },
      }),
    ]);

    // Kick off Cloudflare Stream ingestion (async — don't block response)
    this.stream.uploadFromUrl(dto.videoUrl, { title: dto.title, creatorId: userId })
      .then(async (streamId) => {
        await this.prisma.video.update({
          where: { id: video.id },
          data: { streamId },
        });
        this.logger.log(`Video ${video.id} submitted to Stream as ${streamId}`);
      })
      .catch((err) => {
        this.logger.error(`Stream upload failed for video ${video.id}`, err);
        // Fall back to PUBLISHED with raw R2 URL
        this.prisma.video.update({
          where: { id: video.id },
          data: { status: VideoStatus.PUBLISHED },
        }).catch(() => {});
      });

    return {
      ...video,
      isLiked: false,
      isDisliked: false,
      isBookmarked: false,
    };
  }
```

Update the `delete` method (~lines 307-323) — add Stream cleanup:

```typescript
  async delete(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');
    if (video.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.video.delete({
        where: { id: videoId },
      }),
      this.prisma.$executeRaw`
        UPDATE "Channel"
        SET "videosCount" = GREATEST("videosCount" - 1, 0)
        WHERE id = ${video.channelId}
      `,
    ]);

    // Clean up from Cloudflare Stream
    if (video.streamId) {
      this.stream.deleteVideo(video.streamId).catch((err) => {
        this.logger.warn(`Failed to delete Stream video ${video.streamId}`, err);
      });
    }

    return { deleted: true };
  }
```

Add `hlsUrl`, `dashUrl`, `qualities`, `isLooping`, `normalizeAudio` to `VIDEO_SELECT` (~line 18):

```typescript
const VIDEO_SELECT = {
  id: true,
  userId: true,
  channelId: true,
  title: true,
  description: true,
  videoUrl: true,
  streamId: true,
  hlsUrl: true,
  dashUrl: true,
  qualities: true,
  isLooping: true,
  normalizeAudio: true,
  thumbnailUrl: true,
  duration: true,
  category: true,
  tags: true,
  chapters: true,
  viewsCount: true,
  likesCount: true,
  dislikesCount: true,
  commentsCount: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  channel: {
    select: {
      id: true,
      handle: true,
      name: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};
```

**Step 7: Integrate StreamService into ReelsService**

In `apps/api/src/modules/reels/reels.service.ts`:

Add import at top:
```typescript
import { StreamService } from '../stream/stream.service';
```

Add to constructor:
```typescript
constructor(
  private prisma: PrismaService,
  @Inject('REDIS') private redis: Redis,
  private notifications: NotificationsService,
  private stream: StreamService,
) {}
```

After the reel is created in the `create` method (~after line 108, after the transaction), add Stream ingestion:

```typescript
    // Kick off Cloudflare Stream ingestion (async)
    this.stream.uploadFromUrl(dto.videoUrl, { title: dto.caption ?? 'Reel', creatorId: userId })
      .then(async (streamId) => {
        await this.prisma.reel.update({
          where: { id: reel.id },
          data: { streamId },
        });
        this.logger.log(`Reel ${reel.id} submitted to Stream as ${streamId}`);
      })
      .catch((err) => {
        this.logger.error(`Stream upload failed for reel ${reel.id}`, err);
        this.prisma.reel.update({
          where: { id: reel.id },
          data: { status: 'READY' },
        }).catch(() => {});
      });
```

In the `delete` method (~lines 268-281), add Stream cleanup after the transaction:

```typescript
    // Clean up from Cloudflare Stream
    if (reel.streamId) {
      this.stream.deleteVideo(reel.streamId).catch((err) => {
        this.logger.warn(`Failed to delete Stream reel ${reel.streamId}`, err);
      });
    }
```

Add `hlsUrl`, `dashUrl`, `qualities`, `isLooping`, `normalizeAudio`, `streamId` to `REEL_SELECT` (~line 18):

```typescript
const REEL_SELECT = {
  id: true,
  videoUrl: true,
  streamId: true,
  hlsUrl: true,
  dashUrl: true,
  qualities: true,
  isLooping: true,
  normalizeAudio: true,
  thumbnailUrl: true,
  duration: true,
  caption: true,
  mentions: true,
  hashtags: true,
  status: true,
  isRemoved: true,
  audioTrackId: true,
  audioTitle: true,
  audioArtist: true,
  isDuet: true,
  isStitch: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  viewsCount: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};
```

**Step 8: Run existing tests**

Run: `cd apps/api && npx jest src/modules/videos/ src/modules/reels/ src/modules/stream/ --no-coverage`
Expected: All tests PASS (existing tests may need mock updates for StreamService — add `{ provide: StreamService, useValue: { uploadFromUrl: jest.fn().mockResolvedValue('mock-stream-id'), deleteVideo: jest.fn() } }` to providers in existing spec files)

**Step 9: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/videos/ apps/api/src/modules/reels/ apps/api/src/modules/stream/
git commit -m "feat(api): integrate StreamService with videos and reels — async Stream ingestion on create, cleanup on delete"
```

---

## Task 4: Mobile — Update Types and API Client

**Files:**
- Modify: `apps/mobile/src/types/index.ts` (~lines 178-203 Reel, ~lines 234-259 Video)
- Modify: `apps/mobile/src/services/api.ts` (~line 394, videosApi.create)

**Step 1: Update Video interface**

In `apps/mobile/src/types/index.ts`, add fields to the `Video` interface (after `videoUrl` ~line 240):

```typescript
  streamId?: string;
  hlsUrl?: string;
  dashUrl?: string;
  qualities?: string[];
  isLooping?: boolean;
  normalizeAudio?: boolean;
```

**Step 2: Update Reel interface**

In `apps/mobile/src/types/index.ts`, add fields to the `Reel` interface (after `videoUrl` ~line 180):

```typescript
  streamId?: string;
  hlsUrl?: string;
  dashUrl?: string;
  qualities?: string[];
  isLooping?: boolean;
  normalizeAudio?: boolean;
```

**Step 3: Commit**

```bash
git add apps/mobile/src/types/index.ts apps/mobile/src/services/api.ts
git commit -m "feat(mobile): add stream playback fields to Video and Reel types"
```

---

## Task 5: Mobile — VideoPlayer Upgrade (HLS, Quality, Loop, 0.25x)

**Files:**
- Modify: `apps/mobile/src/components/ui/VideoPlayer.tsx`

**Step 1: Update props interface**

Replace the `VideoPlayerProps` interface (~line 21):

```typescript
type PlaybackSpeed = 0.25 | 0.5 | 1 | 1.25 | 1.5 | 2;
type VideoQuality = 'auto' | '360p' | '720p' | '1080p' | '4k';

interface VideoPlayerProps {
  uri: string;
  hlsUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  qualities?: string[];
  isLooping?: boolean;
  autoPlay?: boolean;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}
```

**Step 2: Add quality state and loop state**

Inside the component function, add:

```typescript
const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('auto');
const [qualitySheetVisible, setQualitySheetVisible] = useState(false);
const [looping, setLooping] = useState(isLooping ?? false);
```

**Step 3: Compute effective video source**

Add a helper to determine which URL to use:

```typescript
  // Prefer HLS URL (adaptive bitrate) over raw R2 URL
  const effectiveUri = hlsUrl || uri;
```

Update the `<Video>` component to use `effectiveUri` instead of `uri`, and use `looping` state:

```tsx
<Video
  ref={videoRef}
  source={{ uri: effectiveUri }}
  style={styles.video}
  resizeMode={ResizeMode.CONTAIN}
  shouldPlay={autoPlay}
  useNativeControls={false}
  onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
  volume={isMuted ? 0 : volume}
  rate={playbackSpeed}
  isLooping={looping}
  onLoadStart={() => setIsLoading(true)}
/>
```

**Step 4: Add quality selector BottomSheet**

After the speed selector BottomSheet (~line 312), add:

```tsx
      {/* Quality selector bottom sheet */}
      <BottomSheet visible={qualitySheetVisible} onClose={() => setQualitySheetVisible(false)}>
        <BottomSheetItem
          label="Auto"
          onPress={() => { setSelectedQuality('auto'); setQualitySheetVisible(false); }}
          icon={<Icon name="settings" size="md" color={selectedQuality === 'auto' ? colors.emerald : colors.text.secondary} />}
        />
        {(qualities || []).map((q) => (
          <BottomSheetItem
            key={q}
            label={q}
            onPress={() => { setSelectedQuality(q as VideoQuality); setQualitySheetVisible(false); }}
            icon={<Icon name="layers" size="md" color={selectedQuality === q ? colors.emerald : colors.text.secondary} />}
          />
        ))}
      </BottomSheet>
```

**Step 5: Add quality button and loop button to top controls**

Replace the top controls (~line 222):

```tsx
<View style={styles.topControls}>
  <TouchableOpacity onPress={() => setLooping(!looping)} style={styles.iconButton}>
    <Icon name="repeat" size="md" color={looping ? colors.emerald : colors.text.primary} />
  </TouchableOpacity>
  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
    {qualities && qualities.length > 0 && (
      <TouchableOpacity onPress={() => setQualitySheetVisible(true)} style={styles.iconButton}>
        <Text style={styles.speedText}>{selectedQuality === 'auto' ? 'Auto' : selectedQuality}</Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity onPress={toggleFullscreen} style={styles.iconButton}>
      <Icon name="maximize" size="md" color={colors.text.primary} />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => setSpeedSheetVisible(true)} style={styles.iconButton}>
      <Text style={styles.speedText}>{playbackSpeed}x</Text>
    </TouchableOpacity>
  </View>
</View>
```

**Step 6: Add 0.25x to speed sheet**

Add a new BottomSheetItem at the top of the speed sheet (~line 287):

```tsx
<BottomSheetItem
  label="0.25x"
  onPress={() => changeSpeed(0.25)}
  icon={<Icon name="clock" size="md" color={colors.text.secondary} />}
/>
```

**Step 7: Commit**

```bash
git add apps/mobile/src/components/ui/VideoPlayer.tsx
git commit -m "feat(mobile): upgrade VideoPlayer — HLS playback, quality selector, loop toggle, 0.25x speed"
```

---

## Task 6: Mobile — Wire VideoPlayer into Minbar and Bakra

**Files:**
- Modify: `apps/mobile/app/(tabs)/minbar.tsx` — pass `hlsUrl` and `qualities` to VideoPlayer
- Modify: `apps/mobile/app/(tabs)/bakra.tsx` — pass `hlsUrl`, `qualities`, and `isLooping` to video component
- Modify: `apps/mobile/app/(screens)/video-detail.tsx` (if it exists) — or wherever the Minbar video detail screen uses VideoPlayer

**Step 1: Update Minbar video detail**

Find where `<VideoPlayer` is used and add props:

```tsx
<VideoPlayer
  uri={video.videoUrl}
  hlsUrl={video.hlsUrl}
  thumbnailUrl={video.thumbnailUrl}
  duration={video.duration}
  qualities={video.qualities}
  isLooping={video.isLooping}
  autoPlay
  onProgress={(p) => handleProgress(p)}
  onComplete={() => handleComplete()}
/>
```

**Step 2: Update Bakra feed**

In `bakra.tsx`, wherever the `<Video>` component from expo-av is used directly for reel playback, prefer HLS URL:

```tsx
<Video
  source={{ uri: reel.hlsUrl || reel.videoUrl }}
  // ... existing props
  isLooping={reel.isLooping ?? true}
/>
```

**Step 3: Commit**

```bash
git add apps/mobile/app/
git commit -m "feat(mobile): wire HLS playback URLs into Minbar and Bakra screens"
```

---

## Task 7: Mobile — Thumbnail Customization (create-video.tsx)

**Files:**
- Modify: `apps/mobile/app/(screens)/create-video.tsx`

**Step 1: Replace VideoThumbnail stub**

Remove the stub at line 15:
```typescript
// REMOVE: const VideoThumbnail = { getThumbnailAsync: async (_uri: string, _opts?: { time?: number }) => ({ uri: '' }) };
```

Add real import:
```typescript
import * as VideoThumbnails from 'expo-video-thumbnails';
```

**Step 2: Add thumbnail generation state**

Add state variables after the existing state (~line 53):

```typescript
const [thumbnailOptions, setThumbnailOptions] = useState<string[]>([]);
const [customThumbnail, setCustomThumbnail] = useState(false);
const [normalizeAudio, setNormalizeAudio] = useState(false);
```

**Step 3: Generate thumbnail frames after video pick**

After the video is picked (find the `pickVideo` or `handlePickVideo` function), add frame generation:

```typescript
  // Generate 10 evenly-spaced thumbnail frames
  const generateFrames = async (videoUri: string, durationMs: number) => {
    const frameCount = Math.min(10, Math.max(3, Math.floor(durationMs / 1000)));
    const interval = durationMs / (frameCount + 1);
    const frames: string[] = [];

    for (let i = 1; i <= frameCount; i++) {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
          time: Math.floor(interval * i),
        });
        frames.push(uri);
      } catch {
        // Skip failed frames
      }
    }

    setThumbnailOptions(frames);
    if (frames.length > 0 && !thumbnailUri) {
      setThumbnailUri(frames[0]);
    }
  };
```

Call `generateFrames(asset.uri, asset.duration * 1000)` after setting the video state.

**Step 4: Add thumbnail filmstrip UI**

After the video preview section, add a horizontal frame picker:

```tsx
{thumbnailOptions.length > 0 && (
  <View style={styles.thumbnailSection}>
    <Text style={styles.sectionLabel}>{t('createVideo.selectThumbnail')}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailStrip}>
      {thumbnailOptions.map((frame, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => { setThumbnailUri(frame); setCustomThumbnail(false); }}
          style={[
            styles.thumbnailFrame,
            thumbnailUri === frame && !customThumbnail && styles.thumbnailFrameSelected,
          ]}
        >
          <Image source={{ uri: frame }} style={styles.thumbnailImage} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        onPress={async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setThumbnailUri(result.assets[0].uri);
            setCustomThumbnail(true);
          }
        }}
        style={[styles.thumbnailFrame, styles.uploadThumbnailButton]}
      >
        <Icon name="image" size="md" color={colors.text.secondary} />
        <Text style={styles.uploadThumbnailText}>{t('createVideo.customThumbnail')}</Text>
      </TouchableOpacity>
    </ScrollView>
  </View>
)}
```

**Step 5: Add normalize audio toggle**

Below the category selector, add:

```tsx
<View style={styles.toggleRow}>
  <View>
    <Text style={styles.toggleLabel}>{t('createVideo.normalizeAudio')}</Text>
    <Text style={styles.toggleSubtitle}>{t('createVideo.normalizeAudioDesc')}</Text>
  </View>
  <TouchableOpacity
    onPress={() => setNormalizeAudio(!normalizeAudio)}
    style={[styles.toggle, normalizeAudio && styles.toggleActive]}
  >
    <View style={[styles.toggleThumb, normalizeAudio && styles.toggleThumbActive]} />
  </TouchableOpacity>
</View>
```

**Step 6: Include normalizeAudio in upload payload**

In the upload/submit function, add `normalizeAudio` to the API call payload.

**Step 7: Add styles**

Add to the StyleSheet:

```typescript
  thumbnailSection: {
    marginTop: spacing.base,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  thumbnailStrip: {
    flexDirection: 'row',
  },
  thumbnailFrame: {
    width: 80,
    height: 80 * (9 / 16),
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginRight: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailFrameSelected: {
    borderColor: colors.emerald,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  uploadThumbnailButton: {
    backgroundColor: colors.dark.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    borderColor: colors.dark.border,
  },
  uploadThumbnailText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  toggleLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  toggleSubtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: colors.emerald,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.text.primary,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
```

**Step 8: Add i18n keys**

Add to `apps/mobile/src/i18n/en.json` and `ar.json`:

```json
"createVideo.selectThumbnail": "Select thumbnail",
"createVideo.customThumbnail": "Custom",
"createVideo.normalizeAudio": "Normalize audio",
"createVideo.normalizeAudioDesc": "Consistent volume levels"
```

Arabic:
```json
"createVideo.selectThumbnail": "اختر صورة مصغرة",
"createVideo.customThumbnail": "مخصص",
"createVideo.normalizeAudio": "تسوية الصوت",
"createVideo.normalizeAudioDesc": "مستويات صوت متسقة"
```

**Step 9: Commit**

```bash
git add apps/mobile/app/(screens)/create-video.tsx apps/mobile/src/i18n/
git commit -m "feat(mobile): add thumbnail frame picker and normalize audio toggle to create-video"
```

---

## Task 8: Mobile — Thumbnail Customization (create-reel.tsx)

**Files:**
- Modify: `apps/mobile/app/(screens)/create-reel.tsx`

Same pattern as Task 7 but for reels — fewer frames (6 instead of 10), shorter videos.

**Step 1: Add `expo-video-thumbnails` import and thumbnail generation**

Follow the same pattern as create-video.tsx: generate 6 frames, add filmstrip UI, add normalize audio toggle.

**Step 2: Add i18n keys for reels**

```json
"createReel.selectThumbnail": "Select cover",
"createReel.customThumbnail": "Custom",
"createReel.normalizeAudio": "Normalize audio",
"createReel.normalizeAudioDesc": "Consistent volume levels"
```

Arabic:
```json
"createReel.selectThumbnail": "اختر غلاف",
"createReel.customThumbnail": "مخصص",
"createReel.normalizeAudio": "تسوية الصوت",
"createReel.normalizeAudioDesc": "مستويات صوت متسقة"
```

**Step 3: Commit**

```bash
git add apps/mobile/app/(screens)/create-reel.tsx apps/mobile/src/i18n/
git commit -m "feat(mobile): add thumbnail frame picker and normalize audio toggle to create-reel"
```

---

## Task 9: Install expo-video-thumbnails Dependency

**Files:**
- Modify: `apps/mobile/package.json`

**Step 1: Install**

Run: `cd apps/mobile && npx expo install expo-video-thumbnails`

**Step 2: Verify**

Run: `cd apps/mobile && npx expo doctor`
Expected: No critical issues

**Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "chore(mobile): install expo-video-thumbnails"
```

**Note:** This task should be run BEFORE Tasks 7 and 8 in practice, but is listed separately to keep dependency installation distinct. Run this first if executing sequentially.

---

## Task 10: API Tests — Update Existing Specs for StreamService Mock

**Files:**
- Modify: `apps/api/src/modules/videos/videos.service.spec.ts`
- Modify: `apps/api/src/modules/reels/reels.service.spec.ts`

**Step 1: Add StreamService mock to VideosService spec**

In `videos.service.spec.ts`, add to providers:

```typescript
{
  provide: StreamService,
  useValue: {
    uploadFromUrl: jest.fn().mockResolvedValue('mock-stream-id'),
    deleteVideo: jest.fn().mockResolvedValue(undefined),
  },
},
```

Add import:
```typescript
import { StreamService } from '../stream/stream.service';
```

**Step 2: Add StreamService mock to ReelsService spec**

Same pattern for `reels.service.spec.ts`.

**Step 3: Run all tests**

Run: `cd apps/api && npx jest --no-coverage`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add apps/api/src/modules/videos/videos.service.spec.ts apps/api/src/modules/reels/reels.service.spec.ts
git commit -m "test(api): add StreamService mocks to existing video and reel specs"
```

---

## Task 11: Final — Batch Commit + Tag

**Step 1: Run full API test suite**

Run: `cd apps/api && npx jest --no-coverage`
Expected: All tests PASS

**Step 2: Create batch commit**

```bash
git add -A
git commit -m "feat: complete Batch 38 — Cloudflare Stream integration, HLS playback, quality/speed/loop controls, thumbnail picker"
```

**Step 3: Push**

```bash
git push origin main
```
