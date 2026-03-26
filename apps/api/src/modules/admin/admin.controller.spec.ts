import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { FeatureFlagsService } from '../../common/services/feature-flags.service';
import { CounterReconciliationService } from '../../common/services/counter-reconciliation.service';
import { MeilisearchSyncService } from '../../common/services/meilisearch-sync.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;
  let featureFlags: jest.Mocked<FeatureFlagsService>;

  const adminId = 'admin-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        ...globalMockProviders,
        {
          provide: AdminService,
          useValue: {
            getReports: jest.fn(),
            getReport: jest.fn(),
            resolveReport: jest.fn(),
            getStats: jest.fn(),
            banUser: jest.fn(),
            unbanUser: jest.fn(),
            verifyAdmin: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FeatureFlagsService,
          useValue: {
            getAllFlags: jest.fn(),
            setFlag: jest.fn(),
            deleteFlag: jest.fn(),
          },
        },
        {
          provide: CounterReconciliationService,
          useValue: { reconcileAll: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MeilisearchSyncService,
          useValue: { fullSync: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(AdminController);
    adminService = module.get(AdminService) as jest.Mocked<AdminService>;
    featureFlags = module.get(FeatureFlagsService) as jest.Mocked<FeatureFlagsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getReports', () => {
    it('should call adminService.getReports with correct params', async () => {
      const mockResult = {
        data: [{ id: 'report-1', reason: 'spam' }],
        meta: { cursor: null, hasMore: false },
      };
      adminService.getReports.mockResolvedValue(mockResult as any);

      const result = await controller.getReports(adminId, 'PENDING', 'cursor-1');

      expect(adminService.getReports).toHaveBeenCalledWith(adminId, 'PENDING', 'cursor-1');
      expect(result).toEqual(mockResult);
    });

    it('should propagate ForbiddenException from service', async () => {
      adminService.getReports.mockRejectedValue(new ForbiddenException('Admin access required'));

      await expect(controller.getReports(adminId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReport', () => {
    it('should call adminService.getReport with adminId and reportId', async () => {
      const mockReport = { id: 'report-1', reason: 'spam', status: 'PENDING' };
      adminService.getReport.mockResolvedValue(mockReport as any);

      const result = await controller.getReport(adminId, 'report-1');

      expect(adminService.getReport).toHaveBeenCalledWith(adminId, 'report-1');
      expect(result).toEqual(expect.objectContaining({ id: 'report-1' }));
    });

    it('should propagate NotFoundException when report not found', async () => {
      adminService.getReport.mockRejectedValue(new NotFoundException('Report not found'));

      await expect(controller.getReport(adminId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveReport', () => {
    it('should call adminService.resolveReport with dto fields', async () => {
      const dto = { action: 'WARN' as const, note: 'First warning' };
      const mockUpdated = { id: 'report-1', status: 'RESOLVED', actionTaken: 'WARNING' };
      adminService.resolveReport.mockResolvedValue(mockUpdated as any);

      const result = await controller.resolveReport(adminId, 'report-1', dto);

      expect(adminService.resolveReport).toHaveBeenCalledWith(adminId, 'report-1', 'WARN', 'First warning');
      expect(result).toEqual(expect.objectContaining({ status: 'RESOLVED' }));
    });
  });

  describe('getStats', () => {
    it('should return platform statistics', async () => {
      const mockStats = { users: 1000, posts: 5000, threads: 200, reels: 300, videos: 50, pendingReports: 12 };
      adminService.getStats.mockResolvedValue(mockStats as any);

      const result = await controller.getStats(adminId);

      expect(adminService.getStats).toHaveBeenCalledWith(adminId);
      expect(result).toEqual(mockStats);
    });
  });

  describe('banUser', () => {
    it('should call adminService.banUser with reason and duration', async () => {
      const dto = { reason: 'Spam', duration: 24 };
      const mockBanned = { id: 'user-2', isBanned: true, banReason: 'Spam' };
      adminService.banUser.mockResolvedValue(mockBanned as any);

      const result = await controller.banUser(adminId, 'user-2', dto);

      expect(adminService.banUser).toHaveBeenCalledWith(adminId, 'user-2', 'Spam', 24);
      expect(result).toEqual(expect.objectContaining({ isBanned: true }));
    });

    it('should propagate ForbiddenException for non-admin', async () => {
      adminService.banUser.mockRejectedValue(new ForbiddenException('Admin access required'));

      await expect(controller.banUser('regular-user', 'user-2', { reason: 'test' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unbanUser', () => {
    it('should call adminService.unbanUser with correct params', async () => {
      const mockUnbanned = { id: 'user-2', isBanned: false, banReason: null };
      adminService.unbanUser.mockResolvedValue(mockUnbanned as any);

      const result = await controller.unbanUser(adminId, 'user-2');

      expect(adminService.unbanUser).toHaveBeenCalledWith(adminId, 'user-2');
      expect(result).toEqual(expect.objectContaining({ isBanned: false }));
    });
  });

  describe('getFlags', () => {
    it('should delegate to featureFlags.getAllFlags after admin check', async () => {
      const mockFlags = { dark_mode: 'true', beta_feature: '50' };
      featureFlags.getAllFlags.mockResolvedValue(mockFlags as any);

      const result = await controller.getFlags(adminId);

      expect(adminService.verifyAdmin).toHaveBeenCalledWith(adminId);
      expect(featureFlags.getAllFlags).toHaveBeenCalled();
      expect(result).toEqual(mockFlags);
    });
  });

  describe('setFlag', () => {
    it('should delegate to featureFlags.setFlag after admin check', async () => {
      featureFlags.setFlag.mockResolvedValue(undefined as any);

      await controller.setFlag(adminId, 'dark_mode', 'true');

      expect(adminService.verifyAdmin).toHaveBeenCalledWith(adminId);
      expect(featureFlags.setFlag).toHaveBeenCalledWith('dark_mode', 'true');
    });
  });

  describe('deleteFlag', () => {
    it('should delegate to featureFlags.deleteFlag after admin check', async () => {
      featureFlags.deleteFlag.mockResolvedValue(undefined as any);

      await controller.deleteFlag(adminId, 'dark_mode');

      expect(featureFlags.deleteFlag).toHaveBeenCalledWith('dark_mode');
    });
  });
});
