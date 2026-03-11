import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { SubtitlesService } from './subtitles.service';
import { VideoStatus } from '@prisma/client';

describe('SubtitlesService', () => {
  let service: SubtitlesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubtitlesService,
        {
          provide: PrismaService,
          useValue: {
            video: {
              findUnique: jest.fn(),
            },
            subtitleTrack: {
              findMany: jest.fn(),
              create: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<SubtitlesService>(SubtitlesService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTracks', () => {
    it('should return subtitle tracks for a published video', async () => {
      const videoId = 'video-123';
      const mockVideo = { id: videoId, userId: 'owner-1', status: VideoStatus.PUBLISHED };
      const mockTracks = [
        { id: 'track-1', label: 'English', language: 'en', url: 'http://example.com/track.srt', isDefault: true, createdAt: new Date() },
      ];
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.subtitleTrack.findMany.mockResolvedValue(mockTracks);

      const result = await service.listTracks(videoId);

      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: videoId },
        select: { id: true, userId: true, status: true },
      });
      expect(prisma.subtitleTrack.findMany).toHaveBeenCalledWith({
        where: { videoId },
        select: {
          id: true,
          label: true,
          language: true,
          url: true,
          isDefault: true,
          createdAt: true,
        },
        orderBy: { isDefault: 'desc' },
      });
      expect(result).toEqual(mockTracks);
    });

    it('should allow owner to view tracks of non‑published video', async () => {
      const videoId = 'video-123';
      const userId = 'owner-1';
      const mockVideo = { id: videoId, userId, status: VideoStatus.DRAFT };
      const mockTracks = [] as any;
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.subtitleTrack.findMany.mockResolvedValue(mockTracks);

      const result = await service.listTracks(videoId, userId);

      expect(result).toEqual([]);
    });

    it('should throw NotFoundException if video does not exist', async () => {
      const videoId = 'video-123';
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.listTracks(videoId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for non‑published video when user is not owner', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const mockVideo = { id: videoId, userId: 'owner-1', status: VideoStatus.PRIVATE };
      prisma.video.findUnique.mockResolvedValue(mockVideo);

      await expect(service.listTracks(videoId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createTrack', () => {
    it('should create a subtitle track when user is video owner', async () => {
      const videoId = 'video-123';
      const userId = 'owner-1';
      const dto = { label: 'English', language: 'en', srtUrl: 'https://example.com/track.srt' };
      const mockVideo = { id: videoId, userId };
      const mockTrack = {
        id: 'track-1',
        label: 'English',
        language: 'en',
        url: 'https://example.com/track.srt',
        isDefault: false,
        createdAt: new Date(),
      };
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.subtitleTrack.create.mockResolvedValue(mockTrack);

      const result = await service.createTrack(videoId, userId, dto);

      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: videoId },
        select: { id: true, userId: true },
      });
      expect(prisma.subtitleTrack.create).toHaveBeenCalledWith({
        data: {
          videoId,
          label: 'English',
          language: 'en',
          url: 'https://example.com/track.srt',
          isDefault: false,
        },
        select: {
          id: true,
          label: true,
          language: true,
          url: true,
          isDefault: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(mockTrack);
    });

    it('should throw NotFoundException if video does not exist', async () => {
      const videoId = 'video-123';
      const userId = 'owner-1';
      const dto = { label: 'English', language: 'en', srtUrl: 'https://example.com/track.srt' };
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.createTrack(videoId, userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not video owner', async () => {
      const videoId = 'video-123';
      const userId = 'user-456';
      const dto = { label: 'English', language: 'en', srtUrl: 'https://example.com/track.srt' };
      const mockVideo = { id: videoId, userId: 'owner-1' };
      prisma.video.findUnique.mockResolvedValue(mockVideo);

      await expect(service.createTrack(videoId, userId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException for invalid language code', async () => {
      const videoId = 'video-123';
      const userId = 'owner-1';
      const dto = { label: 'English', language: 'english', srtUrl: 'https://example.com/track.srt' };
      const mockVideo = { id: videoId, userId };
      prisma.video.findUnique.mockResolvedValue(mockVideo);

      await expect(service.createTrack(videoId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid URL', async () => {
      const videoId = 'video-123';
      const userId = 'owner-1';
      const dto = { label: 'English', language: 'en', srtUrl: 'not-a-url' };
      const mockVideo = { id: videoId, userId };
      prisma.video.findUnique.mockResolvedValue(mockVideo);

      await expect(service.createTrack(videoId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if label too long', async () => {
      const videoId = 'video-123';
      const userId = 'owner-1';
      const dto = { label: 'A'.repeat(51), language: 'en', srtUrl: 'https://example.com/track.srt' };
      const mockVideo = { id: videoId, userId };
      prisma.video.findUnique.mockResolvedValue(mockVideo);

      await expect(service.createTrack(videoId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteTrack', () => {
    it('should delete track when user is video owner', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const userId = 'owner-1';
      const mockTrack = {
        id: trackId,
        videoId,
        video: { userId },
      };
      prisma.subtitleTrack.findUnique.mockResolvedValue(mockTrack);
      prisma.subtitleTrack.delete.mockResolvedValue({});

      const result = await service.deleteTrack(videoId, trackId, userId);

      expect(prisma.subtitleTrack.findUnique).toHaveBeenCalledWith({
        where: { id: trackId },
        select: { id: true, videoId: true, video: { select: { userId: true } } },
      });
      expect(prisma.subtitleTrack.delete).toHaveBeenCalledWith({
        where: { id: trackId },
      });
      expect(result.deleted).toBe(true);
    });

    it('should throw NotFoundException if track does not exist', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const userId = 'owner-1';
      prisma.subtitleTrack.findUnique.mockResolvedValue(null);

      await expect(service.deleteTrack(videoId, trackId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if track belongs to different video', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const userId = 'owner-1';
      const mockTrack = {
        id: trackId,
        videoId: 'other-video',
        video: { userId },
      };
      prisma.subtitleTrack.findUnique.mockResolvedValue(mockTrack);

      await expect(service.deleteTrack(videoId, trackId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException if user is not video owner', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const userId = 'user-456';
      const mockTrack = {
        id: trackId,
        videoId,
        video: { userId: 'owner-1' },
      };
      prisma.subtitleTrack.findUnique.mockResolvedValue(mockTrack);

      await expect(service.deleteTrack(videoId, trackId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getSrtRedirect', () => {
    it('should return URL for published video track', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const mockTrack = {
        id: trackId,
        videoId,
        url: 'https://example.com/track.srt',
        video: { userId: 'owner-1', status: VideoStatus.PUBLISHED },
      };
      prisma.subtitleTrack.findUnique.mockResolvedValue(mockTrack);

      const result = await service.getSrtRedirect(videoId, trackId);

      expect(prisma.subtitleTrack.findUnique).toHaveBeenCalledWith({
        where: { id: trackId },
        select: { id: true, videoId: true, url: true, video: { select: { userId: true, status: true } } },
      });
      expect(result.url).toBe('https://example.com/track.srt');
    });

    it('should allow owner to access non‑published video track', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const userId = 'owner-1';
      const mockTrack = {
        id: trackId,
        videoId,
        url: 'https://example.com/track.srt',
        video: { userId, status: VideoStatus.DRAFT },
      };
      prisma.subtitleTrack.findUnique.mockResolvedValue(mockTrack);

      const result = await service.getSrtRedirect(videoId, trackId, userId);

      expect(result.url).toBe('https://example.com/track.srt');
    });

    it('should throw NotFoundException if track does not exist', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      prisma.subtitleTrack.findUnique.mockResolvedValue(null);

      await expect(service.getSrtRedirect(videoId, trackId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if track belongs to different video', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const mockTrack = {
        id: trackId,
        videoId: 'other-video',
        url: '...',
        video: { userId: 'owner-1', status: VideoStatus.PUBLISHED },
      };
      prisma.subtitleTrack.findUnique.mockResolvedValue(mockTrack);

      await expect(service.getSrtRedirect(videoId, trackId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException for non‑published video when user is not owner', async () => {
      const videoId = 'video-123';
      const trackId = 'track-1';
      const userId = 'user-456';
      const mockTrack = {
        id: trackId,
        videoId,
        url: '...',
        video: { userId: 'owner-1', status: VideoStatus.PRIVATE },
      };
      prisma.subtitleTrack.findUnique.mockResolvedValue(mockTrack);

      await expect(service.getSrtRedirect(videoId, trackId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});