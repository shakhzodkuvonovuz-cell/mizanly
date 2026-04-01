import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { AdminService } from './admin.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { createClerkClient } from '@clerk/backend';

// Mock Clerk SDK
jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(),
}));

const mockClerkClient = {
  users: {
    banUser: jest.fn().mockResolvedValue({}),
    unbanUser: jest.fn().mockResolvedValue({}),
  },
};

(createClerkClient as jest.Mock).mockReturnValue(mockClerkClient);

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
              update: jest.fn().mockResolvedValue({}),
            },
            reel: {
              count: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            video: {
              count: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            message: {
              update: jest.fn().mockResolvedValue({}),
            },
            moderationLog: {
              create: jest.fn().mockResolvedValue({}),
            },
            adminAuditLog: {
              create: jest.fn().mockResolvedValue({}),
            },
            comment: {
              update: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('fake-clerk-secret'),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get(PrismaService) as any;

    // Reset Clerk mocks between tests
    mockClerkClient.users.banUser.mockClear();
    mockClerkClient.users.unbanUser.mockClear();
  });

  describe('verifyAdmin', () => {
    it('should not throw if user is ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await expect(service.verifyAdmin('admin-id')).resolves.not.toThrow();
    });

    it('should throw ForbiddenException if user is not ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.verifyAdmin('user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyAdmin('missing-id')).rejects.toThrow(
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

    it('should paginate with ID cursor', async () => {
      const reports = Array.from({ length: 21 }, (_, i) => ({
        id: `report-${i}`,
        status: 'PENDING',
        createdAt: new Date(`2026-03-${String(i + 1).padStart(2, '0')}`),
      }));
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findMany.mockResolvedValue(reports);

      const result = await service.getReports('admin-id');

      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('report-19');
      expect(result.data.length).toBe(20);
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

    it('should use cursor-based pagination when cursor provided', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findMany.mockResolvedValue([]);

      await service.getReports('admin-id', undefined, 'report-cursor-id');

      expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({
        cursor: { id: 'report-cursor-id' },
        skip: 1,
      }));
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
      prisma.report.findUnique.mockResolvedValue({ reportedPostId: null, reportedCommentId: null, reportedUserId: null });
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
      prisma.report.findUnique.mockResolvedValue({ reportedPostId: null, reportedCommentId: null, reportedUserId: null });
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

    it('should remove post when action is REMOVE_CONTENT', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue({
        reportedPostId: 'post-1',
        reportedCommentId: null,
        reportedUserId: 'user-1',
      });
      prisma.report.update.mockResolvedValue({ id: 'report-1', status: 'RESOLVED' });
      (prisma.post as any) = { ...prisma.post, update: jest.fn().mockResolvedValue({}) };

      await service.resolveReport('admin-id', 'report-1', 'REMOVE_CONTENT');

      expect(prisma.report.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          actionTaken: 'CONTENT_REMOVED',
        }),
      }));
    });

    it('should ban user when action is BAN_USER', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' }) // verifyAdmin (resolveReport)
        .mockResolvedValueOnce({ role: 'ADMIN' }) // verifyAdmin (banUser)
        .mockResolvedValueOnce({ id: 'target-1', role: 'USER', clerkId: 'clerk-target-1' }); // merged role+clerkId
      prisma.report.findUnique.mockResolvedValue({
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: null,
        reportedUserId: 'target-1',
        reportedThreadId: null,
        reportedReelId: null,
        reportedVideoId: null,
      });
      prisma.report.update.mockResolvedValue({ id: 'report-1', status: 'RESOLVED' });
      prisma.user.update.mockResolvedValue({ id: 'target-1', username: 't', displayName: 'T', isBanned: true, banExpiresAt: null, banReason: 'Spam' });

      await service.resolveReport('admin-id', 'report-1', 'BAN_USER', 'Spam');

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'target-1' },
        data: expect.objectContaining({ isBanned: true }),
      }));
      expect(mockClerkClient.users.banUser).toHaveBeenCalledWith('clerk-target-1');
    });

    it('should throw NotFoundException when report not found', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.resolveReport('admin-id', 'missing', 'WARN')).rejects.toThrow(
        NotFoundException,
      );
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

      expect(prisma.user.count).toHaveBeenCalledWith({ where: { isDeactivated: false, isDeleted: false, isBanned: false } });
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
    it('should deactivate user with reason and revoke Clerk session', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' }) // admin check
        .mockResolvedValueOnce({ id: 'user-1', role: 'USER', clerkId: 'clerk-user-1' }); // merged role+clerkId
      prisma.user.update.mockResolvedValue({ id: 'user-1', username: 'u1', displayName: 'U1', isBanned: true, banExpiresAt: new Date(), banReason: 'Spam' });

      const result = await service.banUser('admin-id', 'user-1', 'Spam', 24);

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isDeactivated: true,
          banReason: 'Spam',
          banExpiresAt: expect.any(Date),
        }),
        select: expect.objectContaining({ id: true, username: true }),
      }));
      expect(mockClerkClient.users.banUser).toHaveBeenCalledWith('clerk-user-1');
    });

    it('should still succeed if Clerk ban call fails', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' })
        .mockResolvedValueOnce({ id: 'user-1', role: 'USER', clerkId: 'clerk-user-1' });
      prisma.user.update.mockResolvedValue({ id: 'user-1', username: 'u1', displayName: 'U1', isBanned: true, banExpiresAt: null, banReason: 'Spam' });
      mockClerkClient.users.banUser.mockRejectedValueOnce(new Error('Clerk API unavailable'));

      const result = await service.banUser('admin-id', 'user-1', 'Spam');

      expect(result.id).toBe('user-1');
      expect(result.isBanned).toBe(true);
      expect(mockClerkClient.users.banUser).toHaveBeenCalledWith('clerk-user-1');
    });

    it('should reject banning admin users', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' }) // admin check
        .mockResolvedValueOnce({ id: 'other-admin', role: 'ADMIN' }); // target is also admin

      await expect(service.banUser('admin-id', 'other-admin', 'Reason')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException for missing target', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' }) // admin check
        .mockResolvedValueOnce(null); // target not found

      await expect(service.banUser('admin-id', 'missing', 'Reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should set banExpiresAt when duration provided', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' })
        .mockResolvedValueOnce({ id: 'user-1', role: 'USER', clerkId: 'clerk-user-1' });
      prisma.user.update.mockResolvedValue({ id: 'user-1', username: 'u1', displayName: 'U1', isBanned: true, banExpiresAt: new Date(), banReason: 'Temp ban' });

      await service.banUser('admin-id', 'user-1', 'Temp ban', 24);

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isBanned: true,
          banExpiresAt: expect.any(Date),
        }),
      }));
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.banUser('user-id', 'target', 'Reason')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should skip Clerk call when clerkId not found', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' })
        .mockResolvedValueOnce({ id: 'user-1', role: 'USER', clerkId: null }); // no clerkId
      prisma.user.update.mockResolvedValue({ id: 'user-1', username: 'u1', displayName: 'U1', isBanned: true, banExpiresAt: null, banReason: 'Spam' });

      await service.banUser('admin-id', 'user-1', 'Spam');

      expect(mockClerkClient.users.banUser).not.toHaveBeenCalled();
    });
  });

  describe('unbanUser', () => {
    it('should reactivate user and lift Clerk ban', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' }) // admin check
        .mockResolvedValueOnce({ clerkId: 'clerk-user-1' }); // clerkId fetch
      prisma.user.update.mockResolvedValue({ id: 'user-1', username: 'u1', displayName: 'U1', bio: '', isBanned: false });

      const result = await service.unbanUser('admin-id', 'user-1');

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isDeactivated: false,
          banReason: null,
          banExpiresAt: null,
        }),
        select: expect.objectContaining({ id: true, username: true, bio: true }),
      }));
      expect(mockClerkClient.users.unbanUser).toHaveBeenCalledWith('clerk-user-1');
    });

    it('should still succeed if Clerk unban call fails', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' })
        .mockResolvedValueOnce({ clerkId: 'clerk-user-1' });
      prisma.user.update.mockResolvedValue({ id: 'user-1', username: 'u1', displayName: 'U1', bio: '', isBanned: false });
      mockClerkClient.users.unbanUser.mockRejectedValueOnce(new Error('Clerk API down'));

      const result = await service.unbanUser('admin-id', 'user-1');

      expect(result.id).toBe('user-1');
      expect(result.isBanned).toBe(false);
    });

    it('should reject non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.unbanUser('user-id', 'target')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});