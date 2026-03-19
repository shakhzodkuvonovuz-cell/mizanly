import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AdminService } from './admin.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        AdminService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              count: jest.fn(),
              update: jest.fn(),
            },
            report: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            post: {
              count: jest.fn(),
            },
            thread: {
              count: jest.fn(),
            },
            reel: {
              count: jest.fn(),
            },
            video: {
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get(PrismaService) as any;
  });

  describe('assertAdmin', () => {
    it('should not throw if user is ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await expect(service['assertAdmin']('admin-id')).resolves.not.toThrow();
    });

    it('should throw ForbiddenException if user is not ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service['assertAdmin']('user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service['assertAdmin']('missing-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getReports', () => {
    it('should return paginated reports', async () => {
      const mockReports = [
        {
          id: 'report-1',
          status: 'PENDING',
          createdAt: new Date('2026-03-01'),
          reporter: { id: 'user-1', username: 'reporter', displayName: 'Reporter', avatarUrl: null },
          reportedUser: { id: 'user-2', username: 'reported', displayName: 'Reported', avatarUrl: null },
        },
        {
          id: 'report-2',
          status: 'PENDING',
          createdAt: new Date('2026-03-02'),
          reporter: { id: 'user-3', username: 'reporter2', displayName: 'Reporter2', avatarUrl: null },
          reportedUser: null,
        },
      ];
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findMany.mockResolvedValue(mockReports);

      const result = await service.getReports('admin-id');

      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          reporter: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          reportedUser: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 21,
      });
      expect(result.data).toEqual(mockReports);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should filter by status', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findMany.mockResolvedValue([]);

      await service.getReports('admin-id', 'PENDING');

      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 21,
      });
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.getReports('user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getReport', () => {
    it('should return a single report', async () => {
      const mockReport = {
        id: 'report-1',
        status: 'PENDING',
        reporter: { id: 'user-1', username: 'reporter', displayName: 'Reporter', avatarUrl: null },
        reportedUser: { id: 'user-2', username: 'reported', displayName: 'Reported', avatarUrl: null },
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(mockReport);

      const result = await service.getReport('admin-id', 'report-1');

      expect(prisma.report.findUnique).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        include: {
          reporter: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          reportedUser: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
      expect(result).toEqual(mockReport);
    });

    it('should throw NotFoundException if report not found', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.getReport('admin-id', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.getReport('user-id', 'report-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('resolveReport', () => {
    it('should update report with WARN action', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.update.mockResolvedValue({ id: 'report-1', status: 'RESOLVED' });

      const result = await service.resolveReport('admin-id', 'report-1', 'WARN', 'Warning note');

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          status: 'RESOLVED',
          actionTaken: 'WARNING',
          reviewedById: 'admin-id',
          reviewedAt: expect.any(Date),
          moderatorNotes: 'Warning note',
        },
      });
    });

    it('should update report with DISMISS action', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.update.mockResolvedValue({ id: 'report-1', status: 'DISMISSED' });

      const result = await service.resolveReport('admin-id', 'report-1', 'DISMISS');

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          status: 'DISMISSED',
          actionTaken: 'NONE',
          reviewedById: 'admin-id',
          reviewedAt: expect.any(Date),
          moderatorNotes: undefined,
        },
      });
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.resolveReport('user-id', 'report-1', 'WARN')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getStats', () => {
    it('should return platform statistics', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.user.count.mockResolvedValue(100);
      prisma.post.count.mockResolvedValue(500);
      prisma.thread.count.mockResolvedValue(200);
      prisma.reel.count.mockResolvedValue(150);
      prisma.video.count.mockResolvedValue(75);
      prisma.report.count.mockResolvedValue(10);

      const result = await service.getStats('admin-id');

      expect(prisma.user.count).toHaveBeenCalledWith({ where: { isDeactivated: false } });
      expect(prisma.post.count).toHaveBeenCalledWith();
      expect(prisma.thread.count).toHaveBeenCalledWith({ where: { isChainHead: true } });
      expect(prisma.reel.count).toHaveBeenCalledWith();
      expect(prisma.video.count).toHaveBeenCalledWith();
      expect(prisma.report.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
      expect(result).toEqual({
        users: 100,
        posts: 500,
        threads: 200,
        reels: 150,
        videos: 75,
        pendingReports: 10,
      });
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.getStats('user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('banUser', () => {
    it('should deactivate user with reason', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.user.update.mockResolvedValue({ id: 'user-1', isDeactivated: true });

      const result = await service.banUser('admin-id', 'user-1', 'Spam', 24);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isDeactivated: true,
          banReason: 'Spam',
          banExpiresAt: expect.any(Date),
        }),
      });
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.banUser('user-id', 'target', 'Reason')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('unbanUser', () => {
    it('should reactivate user', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.user.update.mockResolvedValue({ id: 'user-1', isDeactivated: false });

      const result = await service.unbanUser('admin-id', 'user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isDeactivated: false,
          banReason: null,
          banExpiresAt: null,
        }),
      });
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.unbanUser('user-id', 'target')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});