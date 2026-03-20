import { Test, TestingModule } from '@nestjs/testing';
import { WatchHistoryController } from './watch-history.controller';
import { WatchHistoryService } from './watch-history.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('WatchHistoryController', () => {
  let controller: WatchHistoryController;
  let service: jest.Mocked<WatchHistoryService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WatchHistoryController],
      providers: [
        ...globalMockProviders,
        {
          provide: WatchHistoryService,
          useValue: {
            recordWatch: jest.fn(),
            getHistory: jest.fn(),
            removeFromHistory: jest.fn(),
            clearHistory: jest.fn(),
            addToWatchLater: jest.fn(),
            removeFromWatchLater: jest.fn(),
            getWatchLater: jest.fn(),
            isInWatchLater: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(WatchHistoryController);
    service = module.get(WatchHistoryService) as jest.Mocked<WatchHistoryService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('recordWatch', () => {
    it('should call service.recordWatch with userId, videoId, progress, and completed', async () => {
      service.recordWatch.mockResolvedValue({ id: 'wh-1' } as any);

      await controller.recordWatch(userId, { videoId: 'vid-1', progress: 0.5, completed: false } as any);

      expect(service.recordWatch).toHaveBeenCalledWith(userId, 'vid-1', 0.5, false);
    });
  });

  describe('getHistory', () => {
    it('should call service.getHistory with userId and cursor', async () => {
      service.getHistory.mockResolvedValue({ data: [] } as any);

      await controller.getHistory(userId, 'cursor-1');

      expect(service.getHistory).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('removeFromHistory', () => {
    it('should call service.removeFromHistory with userId and videoId', async () => {
      service.removeFromHistory.mockResolvedValue(undefined as any);

      await controller.removeFromHistory(userId, 'vid-1');

      expect(service.removeFromHistory).toHaveBeenCalledWith(userId, 'vid-1');
    });
  });

  describe('clearHistory', () => {
    it('should call service.clearHistory with userId', async () => {
      service.clearHistory.mockResolvedValue(undefined as any);

      await controller.clearHistory(userId);

      expect(service.clearHistory).toHaveBeenCalledWith(userId);
    });
  });

  describe('addToWatchLater', () => {
    it('should call service.addToWatchLater with userId and videoId', async () => {
      service.addToWatchLater.mockResolvedValue({ id: 'wl-1' } as any);

      await controller.addToWatchLater(userId, { videoId: 'vid-1' } as any);

      expect(service.addToWatchLater).toHaveBeenCalledWith(userId, 'vid-1');
    });
  });

  describe('removeFromWatchLater', () => {
    it('should call service.removeFromWatchLater with userId and videoId', async () => {
      service.removeFromWatchLater.mockResolvedValue(undefined as any);

      await controller.removeFromWatchLater(userId, 'vid-1');

      expect(service.removeFromWatchLater).toHaveBeenCalledWith(userId, 'vid-1');
    });
  });

  describe('getWatchLater', () => {
    it('should call service.getWatchLater with userId and cursor', async () => {
      service.getWatchLater.mockResolvedValue({ data: [] } as any);

      await controller.getWatchLater(userId, 'cursor-1');

      expect(service.getWatchLater).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('isInWatchLater', () => {
    it('should call service.isInWatchLater with userId and videoId', async () => {
      service.isInWatchLater.mockResolvedValue(true as any);

      await controller.isInWatchLater(userId, 'vid-1');

      expect(service.isInWatchLater).toHaveBeenCalledWith(userId, 'vid-1');
    });
  });
});
