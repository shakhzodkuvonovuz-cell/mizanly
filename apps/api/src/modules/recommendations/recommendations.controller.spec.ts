import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  let service: jest.Mocked<RecommendationsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        ...globalMockProviders,
        {
          provide: RecommendationsService,
          useValue: {
            suggestedPeople: jest.fn(),
            suggestedPosts: jest.fn(),
            suggestedReels: jest.fn(),
            suggestedChannels: jest.fn(),
            suggestedThreads: jest.fn(),
          },
        },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(RecommendationsController);
    service = module.get(RecommendationsService) as jest.Mocked<RecommendationsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('suggestedPeople', () => {
    it('should call service with capped limit', async () => {
      service.suggestedPeople.mockResolvedValue([{ id: 'user-2' }] as any);
      const result = await controller.suggestedPeople(userId, 10);
      expect(service.suggestedPeople).toHaveBeenCalledWith(userId, 10);
      expect(result).toHaveLength(1);
    });

    it('should cap limit at 50', async () => {
      service.suggestedPeople.mockResolvedValue([]);
      await controller.suggestedPeople(userId, 999);
      expect(service.suggestedPeople).toHaveBeenCalledWith(userId, 50);
    });

    it('should default to 20 when no limit', async () => {
      service.suggestedPeople.mockResolvedValue([]);
      await controller.suggestedPeople(userId);
      expect(service.suggestedPeople).toHaveBeenCalledWith(userId, 20);
    });
  });

  describe('suggestedPosts', () => {
    it('should call service with capped limit', async () => {
      service.suggestedPosts.mockResolvedValue([{ id: 'post-1' }] as any);
      await controller.suggestedPosts(userId, 5);
      expect(service.suggestedPosts).toHaveBeenCalledWith(userId, 5, 0);
    });
  });

  describe('suggestedReels', () => {
    it('should call service with capped limit', async () => {
      service.suggestedReels.mockResolvedValue([{ id: 'reel-1' }] as any);
      await controller.suggestedReels(userId, 10);
      expect(service.suggestedReels).toHaveBeenCalledWith(userId, 10, 0);
    });
  });

  describe('suggestedChannels', () => {
    it('should call service with capped limit', async () => {
      service.suggestedChannels.mockResolvedValue([{ id: 'ch-1' }] as any);
      await controller.suggestedChannels(userId, 10);
      expect(service.suggestedChannels).toHaveBeenCalledWith(userId, 10, 0);
    });
  });

  describe('suggestedThreads', () => {
    it('should call service with capped limit', async () => {
      service.suggestedThreads.mockResolvedValue([{ id: 't-1' }] as any);
      const result = await controller.suggestedThreads(userId, 10);
      expect(service.suggestedThreads).toHaveBeenCalledWith(userId, 10, 0);
      expect(result).toHaveLength(1);
    });

    it('should cap limit at 50', async () => {
      service.suggestedThreads.mockResolvedValue([]);
      await controller.suggestedThreads(userId, 100);
      expect(service.suggestedThreads).toHaveBeenCalledWith(userId, 50, 0);
    });

    it('should pass offset parameter for pagination', async () => {
      service.suggestedThreads.mockResolvedValue([]);
      await controller.suggestedThreads(userId, 10, 20);
      expect(service.suggestedThreads).toHaveBeenCalledWith(userId, 10, 20);
    });
  });

  describe('offset pagination', () => {
    it('should pass offset to suggestedPosts', async () => {
      service.suggestedPosts.mockResolvedValue([]);
      await controller.suggestedPosts(userId, 10, 5);
      expect(service.suggestedPosts).toHaveBeenCalledWith(userId, 10, 5);
    });

    it('should default offset to 0', async () => {
      service.suggestedReels.mockResolvedValue([]);
      await controller.suggestedReels(userId, 10);
      expect(service.suggestedReels).toHaveBeenCalledWith(userId, 10, 0);
    });

    it('should clamp negative offset to 0', async () => {
      service.suggestedChannels.mockResolvedValue([]);
      await controller.suggestedChannels(userId, 10, -5);
      expect(service.suggestedChannels).toHaveBeenCalledWith(userId, 10, 0);
    });
  });
});
