import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { assertNotPrivateUrl } from '../../common/utils/ssrf';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';

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

/** Cloudflare Stream API response shape */
interface CfStreamResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: {
    uid: string;
    playback?: { hls?: string; dash?: string };
    input?: { width?: number; height?: number };
  };
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
    private publishWorkflow: PublishWorkflowService,
  ) {
    this.accountId = this.config.get('CF_STREAM_ACCOUNT_ID') ?? '';
    this.apiToken = this.config.get('CF_STREAM_API_TOKEN') ?? '';
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`;
    if (!this.accountId || !this.apiToken) {
      this.logger.warn('CF_STREAM_ACCOUNT_ID or CF_STREAM_API_TOKEN not configured — video streaming will fail');
    }
  }

  private ensureConfigured(): void {
    if (!this.accountId || !this.apiToken) {
      throw new InternalServerErrorException('Cloudflare Stream is not configured');
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  async uploadFromUrl(
    r2PublicUrl: string,
    meta: UploadMeta,
  ): Promise<string> {
    // Validate URL to prevent SSRF — only allow R2 public URLs or https URLs
    const r2PublicDomain = this.config.get('R2_PUBLIC_URL') || '';
    if (r2PublicDomain && !r2PublicUrl.startsWith(r2PublicDomain)) {
      throw new BadRequestException('Video URL must be from the application storage');
    }
    // SSRF protection: resolve hostname to IP and check against private CIDR ranges
    try {
      await assertNotPrivateUrl(r2PublicUrl, 'Video URL');
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid video URL');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/copy`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          url: r2PublicUrl,
          meta: { name: meta.title, creator: meta.creatorId },
        }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cloudflare Stream upload network error: ${msg}`);
      throw new InternalServerErrorException('Video upload service unavailable');
    }

    let data: CfStreamResponse;
    try {
      data = await response.json();
    } catch {
      this.logger.error(`Cloudflare Stream upload returned invalid JSON: HTTP ${response.status}`);
      throw new InternalServerErrorException('Video upload service returned invalid response');
    }

    if (!response.ok || !data.success) {
      this.logger.error('Cloudflare Stream upload failed', data.errors);
      throw new InternalServerErrorException(
        'Cloudflare Stream upload failed',
      );
    }

    if (!data.result) {
      throw new InternalServerErrorException('Cloudflare Stream returned no result');
    }
    return data.result.uid;
  }

  async getPlaybackUrls(streamId: string): Promise<PlaybackUrls> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${streamId}`, {
        method: 'GET',
        headers: this.headers(),
      });
    } catch (err) {
      this.logger.error(`Network error fetching Stream playback URLs for ${streamId}`, err instanceof Error ? err.message : err);
      throw new InternalServerErrorException('Failed to reach video service');
    }

    const data: CfStreamResponse = await response.json();
    if (!response.ok || !data.success || !data.result) {
      this.logger.error('Failed to get Stream playback URLs', data.errors);
      throw new InternalServerErrorException('Failed to get Stream status');
    }

    const result = data.result;
    const maxDimension = Math.max(
      result.input?.width ?? 0,
      result.input?.height ?? 0,
    );

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

  async deleteVideo(streamId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/${streamId}`, {
        method: 'DELETE',
        headers: this.headers(),
      });

      if (!response.ok) {
        this.logger.warn(`Failed to delete Stream video ${streamId}: HTTP ${response.status}`);
      }
    } catch (err) {
      this.logger.error(`Network error deleting Stream video ${streamId}`, err instanceof Error ? err.message : err);
    }
  }

  async handleStreamReady(streamId: string): Promise<void> {
    const playback = await this.getPlaybackUrls(streamId);

    const video = await this.prisma.video.findFirst({
      where: { streamId },
      select: { id: true, status: true, channelId: true, userId: true, title: true, description: true, tags: true, category: true, user: { select: { username: true } } },
    });
    if (video) {
      const previousStatus = video.status;
      await this.prisma.video.update({
        where: { id: video.id },
        data: {
          hlsUrl: playback.hlsUrl,
          dashUrl: playback.dashUrl,
          qualities: playback.qualities,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });

      // Only increment videosCount when re-publishing from DRAFT (error recovery).
      // PROCESSING → PUBLISHED does NOT increment because create() already did it.
      if (video.channelId && previousStatus === 'DRAFT') {
        await this.prisma.channel.update({
          where: { id: video.channelId },
          data: { videosCount: { increment: 1 } },
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to increment channel videosCount for channel ${video.channelId}: ${msg}`);
        });
      }

      // Index the now-published video in search
      if (video.userId) {
        this.publishWorkflow.onPublish({
          contentType: 'video',
          contentId: video.id,
          userId: video.userId,
          indexDocument: {
            id: video.id,
            title: video.title || '',
            description: video.description || '',
            tags: video.tags || [],
            username: video.user?.username || '',
            userId: video.userId,
            channelId: video.channelId,
            category: video.category || 'OTHER',
            status: 'PUBLISHED',
          },
        }).catch(err => this.logger.warn(`Failed to index published video ${video.id}`, err instanceof Error ? err.message : err));
      }

      this.logger.log(`Video ${video.id} ready for streaming (was ${previousStatus})`);
      return;
    }

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

  async handleStreamError(streamId: string, error: string): Promise<void> {
    this.logger.error(`Stream error for ${streamId}: ${error}`);

    const video = await this.prisma.video.findFirst({
      where: { streamId },
      select: { id: true, channelId: true, status: true },
    });
    if (video) {
      await this.prisma.video.update({
        where: { id: video.id },
        data: { status: 'DRAFT' },
      });
      // Decrement channel videosCount if the video was previously counted (PUBLISHED/PROCESSING)
      if (video.status !== 'DRAFT' && video.channelId) {
        await this.prisma.$executeRaw`
          UPDATE "channels"
          SET "videosCount" = GREATEST("videosCount" - 1, 0)
          WHERE id = ${video.channelId}
        `;
      }
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

  /**
   * Create a Cloudflare Stream Live Input for real-time broadcasting.
   * Returns RTMPS ingest URL and HLS playback URL.
   */
  async createLiveInput(title: string): Promise<{ rtmpsUrl: string; rtmpsKey: string; playbackUrl: string; liveInputId: string }> {
    this.ensureConfigured();

    let response: Response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream/live_inputs`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meta: { name: title },
            recording: { mode: 'automatic', timeoutSeconds: 300 },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cloudflare Stream live input network error: ${msg}`);
      throw new InternalServerErrorException('Live streaming service unavailable');
    }

    let data: { success: boolean; result?: { uid: string; rtmps?: { url: string; streamKey: string }; webRTC?: { url: string }; srt?: { url: string } }; errors?: Array<{ message: string }> };
    try {
      data = await response.json() as typeof data;
    } catch {
      this.logger.error(`Cloudflare Stream live input returned invalid JSON: HTTP ${response.status}`);
      throw new InternalServerErrorException('Live streaming service returned invalid response');
    }

    if (!response.ok || !data.success || !data.result?.rtmps) {
      this.logger.error(`Failed to create live input: ${JSON.stringify(data.errors ?? [])}`);
      throw new InternalServerErrorException('Failed to create live stream');
    }

    const uid = data.result.uid;
    return {
      rtmpsUrl: data.result.rtmps.url,
      rtmpsKey: data.result.rtmps.streamKey,
      playbackUrl: `https://customer-${this.accountId}.cloudflarestream.com/${uid}/manifest/video.m3u8`,
      liveInputId: uid,
    };
  }

  /**
   * Delete a Cloudflare Stream Live Input.
   */
  async deleteLiveInput(liveInputId: string): Promise<void> {
    this.ensureConfigured();

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream/live_inputs/${liveInputId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${this.apiToken}` },
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!response.ok) {
        this.logger.warn(`Failed to delete live input ${liveInputId}: HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Network error deleting live input ${liveInputId}: ${msg}`);
    }
  }
}
