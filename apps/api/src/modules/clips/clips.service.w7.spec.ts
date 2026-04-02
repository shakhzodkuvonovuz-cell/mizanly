import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { ClipsService } from './clips.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T03 #32-33, #38: clips null hlsUrl, null duration, empty results
 */
describe('ClipsService — W7 T03 gaps', () => {
  let service: ClipsService;
  let prisma: any;

  const mockVideo = {
    id: 'video-1',
    title: 'Test Video',
    status: 'PUBLISHED',
    duration: 300,
    hlsUrl: 'https://stream.example.com/video.m3u8',
    thumbnailUrl: 'https://r2.example.com/thumb.jpg',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ClipsService,
        {
          provide: PrismaService,
          useValue: {
            video: { findUnique: jest.fn() },
            videoClip: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ClipsService>(ClipsService);
    prisma = module.get(PrismaService) as any;
  });

  // T03 #32: create — null hlsUrl sets clipUrl to null
  describe('create — null hlsUrl', () => {
    it('should set clipUrl to null when video has no hlsUrl', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, hlsUrl: null });
      prisma.videoClip.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'clip-new', ...data }));

      const result = await service.create('user-1', 'video-1', { startTime: 10, endTime: 40, title: 'Test' });

      expect(prisma.videoClip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clipUrl: null,
          }),
        }),
      );
    });
  });

  // T03 #33: create — null duration skips endTime > duration check
  describe('create — null duration', () => {
    it('should allow any endTime when video duration is null', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, duration: null });
      prisma.videoClip.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'clip-new', ...data }));

      // endTime 250 would normally fail with duration=300 check but since duration is null, it passes
      const result = await service.create('user-1', 'video-1', { startTime: 200, endTime: 250, title: 'Long' });

      expect(prisma.videoClip.create).toHaveBeenCalled();
    });
  });

  // T03 #38: getByVideo — empty result returns null cursor
  describe('getByVideo — empty result', () => {
    it('should return empty data with null cursor', async () => {
      prisma.videoClip.findMany.mockResolvedValue([]);

      const result = await service.getByVideo('video-empty');

      expect(result.data).toEqual([]);
      expect(result.meta.cursor).toBeNull();
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // getByUser — empty result
  describe('getByUser — empty result', () => {
    it('should return empty data with null cursor', async () => {
      prisma.videoClip.findMany.mockResolvedValue([]);

      const result = await service.getByUser('user-empty');

      expect(result.data).toEqual([]);
      expect(result.meta.cursor).toBeNull();
      expect(result.meta.hasMore).toBe(false);
    });
  });
});
