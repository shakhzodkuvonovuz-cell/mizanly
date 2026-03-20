import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingsController } from './embeddings.controller';
import { EmbeddingPipelineService } from './embedding-pipeline.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EmbeddingsController', () => {
  let controller: EmbeddingsController;
  let pipeline: jest.Mocked<EmbeddingPipelineService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmbeddingsController],
      providers: [
        ...globalMockProviders,
        {
          provide: EmbeddingPipelineService,
          useValue: {
            backfillAll: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(EmbeddingsController);
    pipeline = module.get(EmbeddingPipelineService) as jest.Mocked<EmbeddingPipelineService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('backfill', () => {
    it('should call pipeline.backfillAll and return result with success flag', async () => {
      const mockResult = { processed: 150, failed: 2 };
      pipeline.backfillAll.mockResolvedValue(mockResult as any);

      const result = await controller.backfill();

      expect(pipeline.backfillAll).toHaveBeenCalled();
      expect(result).toEqual({ data: mockResult, success: true });
    });

    it('should propagate errors from pipeline', async () => {
      pipeline.backfillAll.mockRejectedValue(new Error('Pipeline failed'));

      await expect(controller.backfill()).rejects.toThrow('Pipeline failed');
    });
  });
});
