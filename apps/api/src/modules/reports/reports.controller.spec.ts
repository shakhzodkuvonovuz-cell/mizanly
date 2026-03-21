import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  const userId = 'user-123';

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

  describe('create', () => {
    it('should call reportsService.create with userId and dto', async () => {
      const dto = { targetType: 'post', targetId: 'post-1', reason: 'spam' };
      service.create.mockResolvedValue({ id: 'rep-1' } as any);

      const result = await controller.create(userId, dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'rep-1' }));
    });
  });

  describe('getMyReports', () => {
    it('should call reportsService.getMyReports with userId and cursor', async () => {
      service.getMyReports.mockResolvedValue({ data: [] } as any);

      await controller.getMyReports(userId, 'cursor-1');

      expect(service.getMyReports).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('getById', () => {
    it('should call reportsService.getById with id and userId', async () => {
      service.getById.mockResolvedValue({ id: 'rep-1', reason: 'spam' } as any);

      await controller.getById(userId, 'rep-1');

      expect(service.getById).toHaveBeenCalledWith('rep-1', userId);
    });
  });

  describe('resolve', () => {
    it('should call reportsService.resolve with id, adminId, and actionTaken from DTO', async () => {
      service.resolve.mockResolvedValue({ resolved: true } as any);

      await controller.resolve(userId, 'rep-1', { actionTaken: 'CONTENT_REMOVED' } as any);

      expect(service.resolve).toHaveBeenCalledWith('rep-1', userId, 'CONTENT_REMOVED');
    });
  });

  describe('dismiss', () => {
    it('should call reportsService.dismiss with id and adminId', async () => {
      service.dismiss.mockResolvedValue({ dismissed: true } as any);

      await controller.dismiss(userId, 'rep-1');

      expect(service.dismiss).toHaveBeenCalledWith('rep-1', userId);
    });
  });
});
