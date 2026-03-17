import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StreamService } from './stream.service';
import { PrismaService } from '../../config/prisma.service';

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
        json: () =>
          Promise.resolve({
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
        json: () =>
          Promise.resolve({ errors: [{ message: 'Invalid URL' }] }),
      });

      await expect(
        service.uploadFromUrl('https://bad-url.com/video.mp4', {
          title: 'Test',
          creatorId: 'u1',
        }),
      ).rejects.toThrow('Cloudflare Stream upload failed');
    });
  });

  describe('getPlaybackUrls', () => {
    it('should return HLS and DASH URLs with qualities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
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
      expect(result.qualities).toEqual(['360p', '720p', '1080p']);
    });
  });

  describe('deleteVideo', () => {
    it('should call Cloudflare Stream delete endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await service.deleteVideo('stream-uid-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/stream/stream-uid-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('handleStreamReady', () => {
    it('should update video when stream is ready', async () => {
      prisma.video.findFirst.mockResolvedValueOnce({
        id: 'video-1',
        streamId: 'stream-uid-123',
      });
      prisma.video.update.mockResolvedValueOnce({});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
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

    it('should update reel when stream is ready', async () => {
      prisma.video.findFirst.mockResolvedValueOnce(null);
      prisma.reel.findFirst.mockResolvedValueOnce({
        id: 'reel-1',
        streamId: 'stream-uid-456',
      });
      prisma.reel.update.mockResolvedValueOnce({});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
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

  describe('handleStreamError', () => {
    it('should set video status to DRAFT on error', async () => {
      prisma.video.findFirst.mockResolvedValueOnce({
        id: 'video-1',
        streamId: 'stream-uid-123',
      });
      prisma.video.update.mockResolvedValueOnce({});

      await service.handleStreamError('stream-uid-123', 'codec_unsupported');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: { status: 'DRAFT' },
      });
    });

    it('should set reel status to FAILED on error', async () => {
      prisma.video.findFirst.mockResolvedValueOnce(null);
      prisma.reel.findFirst.mockResolvedValueOnce({
        id: 'reel-1',
        streamId: 'stream-uid-456',
      });
      prisma.reel.update.mockResolvedValueOnce({});

      await service.handleStreamError('stream-uid-456', 'duration_exceeded');

      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: 'reel-1' },
        data: { status: 'FAILED' },
      });
    });
  });
});
