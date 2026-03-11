import { Test, TestingModule } from '@nestjs/testing';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [
        { provide: FeedService, useValue: mockService },
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
  });

  describe('dismiss', () => {
    it('should call service.dismiss', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('user-1', 'post', 'post-1');
      expect(service.dismiss).toHaveBeenCalledWith('user-1', 'post-1', 'post');
    });
  });

  describe('undismiss', () => {
    it('should call service.undismiss', async () => {
      mockService.undismiss.mockResolvedValue({ undismissed: true });
      await controller.undismiss('user-1', 'post', 'post-1');
      expect(service.undismiss).toHaveBeenCalledWith('user-1', 'post-1', 'post');
    });
  });
});