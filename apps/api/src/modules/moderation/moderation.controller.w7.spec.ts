import { Test, TestingModule } from '@nestjs/testing';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #71-72: moderation controller missing endpoints (getPendingAppeals, resolveAppeal)
 */
describe('ModerationController — W7 T09 gaps', () => {
  let controller: ModerationController;
  let service: jest.Mocked<ModerationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModerationController],
      providers: [
        ...globalMockProviders,
        {
          provide: ModerationService,
          useValue: {
            checkText: jest.fn(),
            checkImage: jest.fn(),
            getQueue: jest.fn(),
            review: jest.fn(),
            getStats: jest.fn(),
            getMyActions: jest.fn(),
            getMyAppeals: jest.fn(),
            submitAppeal: jest.fn(),
            getPendingAppeals: jest.fn(),
            resolveAppeal: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ModerationController);
    service = module.get(ModerationService) as jest.Mocked<ModerationService>;
  });

  afterEach(() => jest.clearAllMocks());

  // T09 #71: GET pending-appeals
  describe('getPendingAppeals', () => {
    it('should delegate to service.getPendingAppeals with adminId and cursor', async () => {
      service.getPendingAppeals.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      const result = await controller.getPendingAppeals('admin-1', 'cursor-abc');

      expect(service.getPendingAppeals).toHaveBeenCalledWith('admin-1', 'cursor-abc');
      expect(result.data).toEqual([]);
    });
  });

  // T09 #72: PATCH appeal/:logId/resolve
  describe('resolveAppeal', () => {
    it('should delegate to service.resolveAppeal with adminId, logId, accepted, result', async () => {
      service.resolveAppeal.mockResolvedValue(undefined as any);

      await controller.resolveAppeal('admin-1', 'log-1', { accepted: true, result: 'Overturned' } as any);

      expect(service.resolveAppeal).toHaveBeenCalledWith('admin-1', 'log-1', true, 'Overturned');
    });
  });
});
