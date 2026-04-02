import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #60-61: reports controller missing endpoints (getStats, getPending)
 */
describe('ReportsController — W7 T09 gaps', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        ...globalMockProviders,
        {
          provide: ReportsService,
          useValue: {
            create: jest.fn(),
            getMyReports: jest.fn(),
            getPending: jest.fn(),
            getStats: jest.fn(),
            getById: jest.fn(),
            resolve: jest.fn(),
            dismiss: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ReportsController);
    service = module.get(ReportsService) as jest.Mocked<ReportsService>;
  });

  afterEach(() => jest.clearAllMocks());

  // T09 #60: GET stats
  describe('getStats', () => {
    it('should delegate to service.getStats with adminId', async () => {
      service.getStats.mockResolvedValue({ pending: 5, reviewing: 2, resolved: 10, dismissed: 3, total: 20 } as any);

      const result = await controller.getStats('admin-1');

      expect(service.getStats).toHaveBeenCalledWith('admin-1');
      expect(result.pending).toBe(5);
    });
  });

  // T09 #61: GET pending
  describe('getPending', () => {
    it('should delegate to service.getPending with adminId and cursor', async () => {
      service.getPending.mockResolvedValue({ data: [{ id: 'r1' }], meta: { cursor: null, hasMore: false } } as any);

      const result = await controller.getPending('admin-1', 'cursor-1');

      expect(service.getPending).toHaveBeenCalledWith('admin-1', 'cursor-1');
      expect(result.data).toHaveLength(1);
    });

    it('should call without cursor', async () => {
      service.getPending.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.getPending('admin-1', undefined);

      expect(service.getPending).toHaveBeenCalledWith('admin-1', undefined);
    });
  });
});
