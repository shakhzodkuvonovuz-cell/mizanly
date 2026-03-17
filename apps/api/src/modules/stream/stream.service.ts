import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
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

  async uploadFromUrl(
    r2PublicUrl: string,
    meta: UploadMeta,
  ): Promise<string> {
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
      throw new InternalServerErrorException(
        'Cloudflare Stream upload failed',
      );
    }

    return data.result.uid;
  }

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
}
