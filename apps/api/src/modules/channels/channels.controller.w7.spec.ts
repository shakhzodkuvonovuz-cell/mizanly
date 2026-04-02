import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #1-#5: Controller delegation tests for missing endpoints
 */
describe('ChannelsController — W7 T09 gaps', () => {
  let controller: ChannelsController;

  const mockService = {
    create: jest.fn(),
    getByHandle: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getVideos: jest.fn(),
    getMyChannels: jest.fn(),
    getAnalytics: jest.fn(),
    getSubscribers: jest.fn(),
    setTrailer: jest.fn(),
    removeTrailer: jest.fn(),
    getRecommended: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        ...globalMockProviders,
        { provide: ChannelsService, useValue: mockService },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'test-secret') } },
        { provide: PrismaService, useValue: {} },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ChannelsController);
    jest.clearAllMocks();
  });

  // T09 #1: GET :handle/analytics
  describe('getAnalytics', () => {
    it('should delegate to service.getAnalytics with handle and userId', async () => {
      mockService.getAnalytics.mockResolvedValue({ totalViews: 100 });
      const result = await controller.getAnalytics('my-channel', 'user-1');
      expect(mockService.getAnalytics).toHaveBeenCalledWith('my-channel', 'user-1');
      expect(result).toEqual({ totalViews: 100 });
    });
  });

  // T09 #2: GET :handle/subscribers
  describe('getSubscribers', () => {
    it('should delegate to service.getSubscribers with handle, userId, cursor', async () => {
      mockService.getSubscribers.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      const result = await controller.getSubscribers('my-channel', 'user-1', 'cursor-abc');
      expect(mockService.getSubscribers).toHaveBeenCalledWith('my-channel', 'user-1', 'cursor-abc');
      expect(result.data).toEqual([]);
    });
  });

  // T09 #3: PUT :handle/trailer
  describe('setTrailer', () => {
    it('should delegate to service.setTrailer with handle, userId, videoId', async () => {
      mockService.setTrailer.mockResolvedValue({ trailerVideoId: 'video-1' });
      const result = await controller.setTrailer('my-channel', 'user-1', { videoId: 'video-1' } as any);
      expect(mockService.setTrailer).toHaveBeenCalledWith('my-channel', 'user-1', 'video-1');
      expect(result.trailerVideoId).toBe('video-1');
    });
  });

  // T09 #4: DELETE :handle/trailer
  describe('removeTrailer', () => {
    it('should delegate to service.removeTrailer with handle and userId', async () => {
      mockService.removeTrailer.mockResolvedValue({ trailerVideoId: null });
      const result = await controller.removeTrailer('my-channel', 'user-1');
      expect(mockService.removeTrailer).toHaveBeenCalledWith('my-channel', 'user-1');
      expect(result.trailerVideoId).toBeNull();
    });
  });

  // T09 #5: GET recommended
  describe('getRecommended', () => {
    it('should delegate to service.getRecommended with userId and parsed limit', async () => {
      mockService.getRecommended.mockResolvedValue([]);
      const result = await controller.getRecommended('user-1', '5');
      expect(mockService.getRecommended).toHaveBeenCalledWith('user-1', 5);
      expect(result).toEqual([]);
    });

    it('should default limit to 10 when not provided', async () => {
      mockService.getRecommended.mockResolvedValue([]);
      await controller.getRecommended('user-1', undefined);
      expect(mockService.getRecommended).toHaveBeenCalledWith('user-1', 10);
    });
  });
});
