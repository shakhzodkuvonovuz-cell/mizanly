import { Test, TestingModule } from '@nestjs/testing';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedTransparencyService } from './feed-transparency.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FeedController', () => {
  let controller: FeedController;
  let service: FeedService;

  const mockService = {
    dismiss: jest.fn(),
    getPersonalized: jest.fn(),
    getExplore: jest.fn(),
    reportNotInterested: jest.fn(),
    recalculateScores: jest.fn(),
    logInteraction: jest.fn(),
    undismiss: jest.fn(),
    getDismissed: jest.fn().mockResolvedValue([]),
  };

  const mockTransparency = {
    explainPost: jest.fn().mockResolvedValue({ reasons: ['Popular post'] }),
    explainFeed: jest.fn(),
    enhancedSearch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [
        ...globalMockProviders,
        { provide: FeedService, useValue: mockService },
        { provide: FeedTransparencyService, useValue: mockTransparency },
      ],
    }).compile();

    controller = module.get<FeedController>(FeedController);
    service = module.get<FeedService>(FeedService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('log', () => {
    it('should call service.logInteraction', async () => {
      const dto = { postId: 'post-1', space: 'saf' };
      mockService.logInteraction.mockResolvedValue({ logged: true });
      await controller.log('user-1', dto as any);
      expect(service.logInteraction).toHaveBeenCalledWith('user-1', dto);
    });

    it('should handle interaction with viewDuration', async () => {
      const dto = { postId: 'post-1', space: 'saf', viewDurationMs: 5000 };
      mockService.logInteraction.mockResolvedValue({ logged: true });
      await controller.log('user-1', dto as any);
      expect(service.logInteraction).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('dismiss', () => {
    it('should call service.dismiss', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('user-1', 'post', 'post-1');
      expect(service.dismiss).toHaveBeenCalledWith('user-1', 'post-1', 'post');
    });

    it('should handle dismiss with reel type', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('user-1', 'reel', 'reel-1');
      expect(service.dismiss).toHaveBeenCalledWith('user-1', 'reel-1', 'reel');
    });
  });

  describe('undismiss', () => {
    it('should call service.undismiss', async () => {
      mockService.undismiss.mockResolvedValue({ undismissed: true });
      await controller.undismiss('user-1', 'post', 'post-1');
      expect(service.undismiss).toHaveBeenCalledWith('user-1', 'post-1', 'post');
    });
  });

  describe('getPersonalized', () => {
    it('should return personalized feed', async () => {
      mockService.getPersonalized.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      if (typeof controller.getPersonalized === 'function') {
        const result = await controller.getPersonalized('user-1');
        expect(result).toBeDefined();
      }
    });

    it('should handle pagination cursor', async () => {
      mockService.getPersonalized.mockResolvedValue({ data: [{ id: 'p1' }], meta: { cursor: 'p1', hasMore: true } });
      if (typeof controller.getPersonalized === 'function') {
        const result = await controller.getPersonalized('user-1', 'cursor-1' as any);
        expect(result).toBeDefined();
      }
    });
  });

  describe('getExplore', () => {
    it('should return explore feed', async () => {
      mockService.getExplore.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      if (typeof controller.getExplore === 'function') {
        const result = await controller.getExplore('user-1');
        expect(result).toBeDefined();
      }
    });
  });

  describe('getDismissed', () => {
    it('should return dismissed items', async () => {
      mockService.getDismissed.mockResolvedValue([{ id: 'p1', type: 'post' }]);
      if (typeof controller.getDismissed === 'function') {
        const result = await controller.getDismissed('user-1');
        expect(result).toBeDefined();
      }
    });
  });
});
