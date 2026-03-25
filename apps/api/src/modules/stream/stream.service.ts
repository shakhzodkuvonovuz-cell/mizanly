import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { assertNotPrivateUrl } from '../../common/utils/ssrf';

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

    const data: CfStreamResponse = await response.json();
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
    const response = await fetch(`${this.baseUrl}/${streamId}`, {
      method: 'GET',
      headers: this.headers(),
    });

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
    const response = await fetch(`${this.baseUrl}/${streamId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });

    if (!response.ok) {
      this.logger.warn(`Failed to delete Stream video ${streamId}`);
    }
  }

  async handleStreamReady(streamId: string): Promise<void> {
    const playback = await this.getPlaybackUrls(streamId);

    const video = await this.prisma.video.findFirst({ where: { streamId } });
    if (video) {
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
      this.logger.log(`Video ${video.id} ready for streaming`);
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

  /**
   * Create a Cloudflare Stream Live Input for real-time broadcasting.
   * Returns RTMPS ingest URL and HLS playback URL.
   */
  async createLiveInput(title: string): Promise<{ rtmpsUrl: string; rtmpsKey: string; playbackUrl: string; liveInputId: string }> {
    this.ensureConfigured();

    const response = await fetch(
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
      },
    );

    const data = await response.json() as { success: boolean; result?: { uid: string; rtmps?: { url: string; streamKey: string }; webRTC?: { url: string }; srt?: { url: string } }; errors?: Array<{ message: string }> };
    if (!data.success || !data.result?.rtmps) {
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

    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream/live_inputs/${liveInputId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.apiToken}` },
      },
    );
  }
}
