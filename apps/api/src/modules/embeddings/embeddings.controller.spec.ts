import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EmbeddingsController } from './embeddings.controller';
import { EmbeddingPipelineService } from './embedding-pipeline.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EmbeddingsController', () => {
  let controller: EmbeddingsController;
  let pipeline: jest.Mocked<EmbeddingPipelineService>;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
    };

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
        { provide: PrismaService, useValue: prisma },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(EmbeddingsController);
    pipeline = module.get(EmbeddingPipelineService) as jest.Mocked<EmbeddingPipelineService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('backfill', () => {
    it('should call pipeline.backfillAll for admin user', async () => {
      const mockResult = { posts: 100, reels: 30, threads: 15, videos: 5 };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      pipeline.backfillAll.mockResolvedValue(mockResult);

      const result = await controller.backfill('admin-user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-user-1' },
        select: { role: true },
      });
      expect(pipeline.backfillAll).toHaveBeenCalled();
      expect(result).toEqual({ data: mockResult, success: true });
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(controller.backfill('regular-user')).rejects.toThrow(ForbiddenException);
      expect(pipeline.backfillAll).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(controller.backfill('nonexistent')).rejects.toThrow(ForbiddenException);
    });

    it('should propagate errors from pipeline', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      pipeline.backfillAll.mockRejectedValue(new Error('Pipeline failed'));

      await expect(controller.backfill('admin-user')).rejects.toThrow('Pipeline failed');
    });
  });
});
