import { Test, TestingModule } from '@nestjs/testing';
import { SubtitlesController } from './subtitles.controller';
import { SubtitlesService } from './subtitles.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SubtitlesController', () => {
  let controller: SubtitlesController;
  let service: jest.Mocked<SubtitlesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubtitlesController],
      providers: [
        ...globalMockProviders,
        {
          provide: SubtitlesService,
          useValue: {
            listTracks: jest.fn(),
            createTrack: jest.fn(),
            deleteTrack: jest.fn(),
            getSrtRedirect: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(SubtitlesController);
    service = module.get(SubtitlesService) as jest.Mocked<SubtitlesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('listTracks', () => {
    it('should call subtitlesService.listTracks with videoId and userId', async () => {
      service.listTracks.mockResolvedValue([{ id: 'track-1', language: 'en' }] as any);

      const result = await controller.listTracks('vid-1', userId);

      expect(service.listTracks).toHaveBeenCalledWith('vid-1', userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('createTrack', () => {
    it('should call subtitlesService.createTrack with videoId, userId, and dto', async () => {
      const dto = { language: 'en', srtContent: 'subtitle content' };
      service.createTrack.mockResolvedValue({ id: 'track-1' } as any);

      await controller.createTrack('vid-1', userId, dto as any);

      expect(service.createTrack).toHaveBeenCalledWith('vid-1', userId, dto);
    });
  });

  describe('deleteTrack', () => {
    it('should call subtitlesService.deleteTrack with videoId, trackId, and userId', async () => {
      service.deleteTrack.mockResolvedValue({ deleted: true } as any);

      await controller.deleteTrack('vid-1', 'track-1', userId);

      expect(service.deleteTrack).toHaveBeenCalledWith('vid-1', 'track-1', userId);
    });
  });

  describe('getSrtRedirect', () => {
    it('should call subtitlesService.getSrtRedirect and return url', async () => {
      service.getSrtRedirect.mockResolvedValue({ url: 'https://cdn.example.com/track.srt' } as any);

      const result = await controller.getSrtRedirect('vid-1', 'track-1', userId);

      expect(service.getSrtRedirect).toHaveBeenCalledWith('vid-1', 'track-1', userId);
      expect(result).toEqual({ url: 'https://cdn.example.com/track.srt' });
    });
  });
});
