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
    const defaultBody = { scrollDepth: 80, timeSpentMs: 120000, interactionCount: 15, space: 'saf' };

    it('should call retentionService.trackSessionDepth with userId and body', async () => {
      service.trackSessionDepth.mockResolvedValue(undefined);

      const result = await controller.trackSession(userId, defaultBody);

      expect(service.trackSessionDepth).toHaveBeenCalledWith(userId, defaultBody);
      expect(result).toEqual({ success: true });
    });

    it('should return { success: true } on successful tracking', async () => {
      service.trackSessionDepth.mockResolvedValue(undefined);

      const result = await controller.trackSession(userId, defaultBody);

      expect(result).toEqual({ success: true });
      expect(Object.keys(result)).toEqual(['success']);
    });

    it('should propagate service errors to the caller', async () => {
      service.trackSessionDepth.mockRejectedValue(new Error('Redis connection failed'));

      await expect(controller.trackSession(userId, defaultBody)).rejects.toThrow(
        'Redis connection failed',
      );
    });

    it('should pass through all body fields correctly for each space', async () => {
      service.trackSessionDepth.mockResolvedValue(undefined);

      const spaces = ['saf', 'majlis', 'risalah', 'bakra', 'minbar'];
      for (const space of spaces) {
        const body = { scrollDepth: 50, timeSpentMs: 60000, interactionCount: 10, space };
        await controller.trackSession(userId, body);

        expect(service.trackSessionDepth).toHaveBeenCalledWith(userId, {
          scrollDepth: 50,
          timeSpentMs: 60000,
          interactionCount: 10,
          space,
        });
      }

      expect(service.trackSessionDepth).toHaveBeenCalledTimes(5);
    });

    it('should call service exactly once per invocation', async () => {
      service.trackSessionDepth.mockResolvedValue(undefined);

      await controller.trackSession(userId, defaultBody);

      expect(service.trackSessionDepth).toHaveBeenCalledTimes(1);
    });

    it('should work with zero values for numeric fields', async () => {
      service.trackSessionDepth.mockResolvedValue(undefined);

      const body = { scrollDepth: 0, timeSpentMs: 0, interactionCount: 0, space: 'bakra' };
      const result = await controller.trackSession(userId, body);

      expect(service.trackSessionDepth).toHaveBeenCalledWith(userId, body);
      expect(result).toEqual({ success: true });
    });

    it('should work with maximum valid numeric values', async () => {
      service.trackSessionDepth.mockResolvedValue(undefined);

      const body = {
        scrollDepth: 100000,
        timeSpentMs: 86400000,
        interactionCount: 100000,
        space: 'minbar',
      };
      const result = await controller.trackSession(userId, body);

      expect(service.trackSessionDepth).toHaveBeenCalledWith(userId, body);
      expect(result).toEqual({ success: true });
    });

    it('should pass the userId from @CurrentUser decorator, not from body', async () => {
      service.trackSessionDepth.mockResolvedValue(undefined);

      const differentUserId = 'user-different-456';
      await controller.trackSession(differentUserId, defaultBody);

      expect(service.trackSessionDepth).toHaveBeenCalledWith(
        differentUserId,
        expect.objectContaining({ scrollDepth: 80 }),
      );
      // Ensure userId is passed as first arg, not embedded in body
      const [passedUserId] = service.trackSessionDepth.mock.calls[0];
      expect(passedUserId).toBe(differentUserId);
    });
  });
});
