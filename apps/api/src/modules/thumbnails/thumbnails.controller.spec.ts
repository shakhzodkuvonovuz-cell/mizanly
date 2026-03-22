import { Test, TestingModule } from '@nestjs/testing';
import { ThumbnailsController } from './thumbnails.controller';
import { ThumbnailsService } from './thumbnails.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ThumbnailsController', () => {
  let controller: ThumbnailsController;
  let service: jest.Mocked<ThumbnailsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThumbnailsController],
      providers: [
        ...globalMockProviders,
        {
          provide: ThumbnailsService,
          useValue: {
            createVariants: jest.fn(),
            getVariants: jest.fn(),
            serveThumbnail: jest.fn(),
            trackImpression: jest.fn(),
            trackClick: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ThumbnailsController);
    service = module.get(ThumbnailsService) as jest.Mocked<ThumbnailsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createVariants', () => {
    it('should call thumbnailsService.createVariants with contentType, contentId, urls, and userId', async () => {
      service.createVariants.mockResolvedValue({ id: 'test-1' } as any);

      await controller.createVariants('user-1', { contentType: 'post', contentId: 'post-1', thumbnailUrls: ['a.jpg', 'b.jpg'] } as any);

      expect(service.createVariants).toHaveBeenCalledWith('post', 'post-1', ['a.jpg', 'b.jpg'], 'user-1');
    });
  });

  describe('getVariants', () => {
    it('should call thumbnailsService.getVariants with contentType, contentId, and userId', async () => {
      service.getVariants.mockResolvedValue([{ id: 'v-1', url: 'a.jpg', impressions: 100 }] as any);

      await controller.getVariants('user-1', 'post', 'post-1');

      expect(service.getVariants).toHaveBeenCalledWith('post', 'post-1', 'user-1');
    });
  });

  describe('serve', () => {
    it('should call thumbnailsService.serveThumbnail and return thumbnailUrl', async () => {
      service.serveThumbnail.mockResolvedValue('https://cdn.example.com/thumb.jpg');

      const result = await controller.serve('reel', 'reel-1');

      expect(service.serveThumbnail).toHaveBeenCalledWith('reel', 'reel-1');
      expect(result).toEqual({ thumbnailUrl: 'https://cdn.example.com/thumb.jpg' });
    });
  });

  describe('trackImpression', () => {
    it('should call thumbnailsService.trackImpression with variantId', async () => {
      service.trackImpression.mockResolvedValue({ tracked: true } as any);

      await controller.trackImpression({ variantId: 'v-1' });

      expect(service.trackImpression).toHaveBeenCalledWith('v-1');
    });
  });

  describe('trackClick', () => {
    it('should call thumbnailsService.trackClick with variantId', async () => {
      service.trackClick.mockResolvedValue({ tracked: true } as any);

      await controller.trackClick({ variantId: 'v-1' });

      expect(service.trackClick).toHaveBeenCalledWith('v-1');
    });
  });
});
