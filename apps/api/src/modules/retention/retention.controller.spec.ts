import { Test, TestingModule } from '@nestjs/testing';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('RetentionController', () => {
  let controller: RetentionController;
  let service: jest.Mocked<RetentionService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetentionController],
      providers: [
        ...globalMockProviders,
        {
          provide: RetentionService,
          useValue: {
            trackSessionDepth: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(RetentionController);
    service = module.get(RetentionService) as jest.Mocked<RetentionService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('trackSession', () => {
    it('should call retentionService.trackSessionDepth with userId and body', async () => {
      const body = { scrollDepth: 80, timeSpentMs: 120000, interactionCount: 15, space: 'saf' };
      service.trackSessionDepth.mockResolvedValue(undefined as any);

      const result = await controller.trackSession(userId, body);

      expect(service.trackSessionDepth).toHaveBeenCalledWith(userId, body);
      expect(result).toEqual({ success: true });
    });
  });
});
