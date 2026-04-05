import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReportsService } from './reports.service';
import { ReportStatus, ReportReason, ModerationAction } from '@prisma/client';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ReportsService,
        {
          provide: PrismaService,
          useValue: {
            report: {
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            post: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            comment: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            message: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            moderationLog: {
              create: jest.fn(),
            },
            thread: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            reel: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            video: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            notification: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a report when no duplicate exists', async () => {
      const userId = 'user123';
      const dto = {
        reason: ReportReason.HATE_SPEECH,
        description: 'Hate speech',
        reportedUserId: 'reportedUser123',
      } as any;
      const createdReport = {
        id: 'report123',
        reporterId: userId,
        status: 'PENDING',
        createdAt: new Date('2026-03-31'),
        ...dto,
      };

      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.create.mockResolvedValue(createdReport);

      const result = await service.create(userId, dto);
      expect(prisma.report.findFirst).toHaveBeenCalled();
      expect(prisma.report.create).toHaveBeenCalled();
      // Returns only safe fields (id, status, createdAt)
      expect(result).toEqual({ id: 'report123', status: 'PENDING', createdAt: new Date('2026-03-31') });
    });

    it('should throw ConflictException if duplicate pending report exists', async () => {
      const userId = 'user123';
      const dto = { reportedUserId: 'reportedUser123', reason: ReportReason.HARASSMENT };
      const existing = { id: 'existing' };

      prisma.report.findFirst.mockResolvedValue(existing);

      await expect(service.create(userId, dto as any)).rejects.toThrow(ConflictException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when reporting yourself', async () => {
      const userId = 'user123';
      const dto = { reportedUserId: 'user123', reason: ReportReason.HARASSMENT } as any;

      await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException with no report target', async () => {
      const userId = 'user123';
      const dto = { reason: ReportReason.HARASSMENT } as any;

      await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when reporting own post', async () => {
      const userId = 'user123';
      const dto = { reportedPostId: 'post1', reason: ReportReason.SPAM } as any;
      prisma.post.findUnique.mockResolvedValue({ userId: 'user123' });

      await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyReports', () => {
    it('should return paginated reports', async () => {
      const userId = 'user123';
      const reports = [
        { id: 'report1', reportedUser: { id: 'u1', username: 'user1' } },
        { id: 'report2', reportedUser: { id: 'u2', username: 'user2' } },
      ];
      prisma.report.findMany.mockResolvedValue([...reports, { id: 'extra' }]);

      const result = await service.getMyReports(userId, undefined, 2);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('report2');
    });

    it('should handle cursor pagination', async () => {
      const userId = 'user123';
      prisma.report.findMany.mockResolvedValue([]);
      await service.getMyReports(userId, 'cursor123', 20);
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { reporterId: userId },
        take: 21,
        cursor: { id: 'cursor123' },
        skip: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
    });
  });

  describe('getById', () => {
    it('should return report if found and belongs to user', async () => {
      const report = { id: 'report123', reporterId: 'user123', reportedUser: {} };
      prisma.report.findUnique.mockResolvedValue(report);

      const result = await service.getById('report123', 'user123');
      expect(result).toEqual(report);
    });

    it('should throw NotFoundException if report not found', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing', 'user123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if report belongs to other user and user is not admin', async () => {
      const report = { id: 'report123', reporterId: 'otherUser' };
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.getById('report123', 'user123')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPending', () => {
    it('should return paginated pending reports for admin', async () => {
      const reports = [{ id: 'report1' }, { id: 'report2' }, { id: 'extra' }];
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findMany.mockResolvedValue(reports);
      const result = await service.getPending('admin1', undefined, 2);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.getPending('user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resolve', () => {
    it('should resolve report and create moderation log', async () => {
      const report = {
        id: 'report123',
        status: 'PENDING',
        reportedUserId: 'targetUser',
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: null,
        reason: 'HATE_SPEECH',
      };
      const updatedReport = { ...report, status: 'RESOLVED' };
      const log = { id: 'log123' };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
      prisma.report.update.mockResolvedValue(updatedReport);
      prisma.moderationLog.create.mockResolvedValue(log);

      const result = await service.resolve('report123', 'admin123', 'WARNING' as ModerationAction);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(updatedReport);
    });

    it('should throw NotFoundException if report not found', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(null);
      await expect(
        service.resolve('missing', 'admin123', 'WARNING' as ModerationAction),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(
        service.resolve('report1', 'user1', 'WARNING' as ModerationAction),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('dismiss', () => {
    it('should dismiss report', async () => {
      const report = { id: 'report123', status: 'PENDING' };
      const dismissed = { ...report, status: 'DISMISSED' };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.update.mockResolvedValue(dismissed);
      const result = await service.dismiss('report123', 'admin1');
      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report123' },
        data: { status: 'DISMISSED', reviewedById: 'admin1', reviewedAt: expect.any(Date) },
      });
      expect(result).toEqual(dismissed);
    });

    it('should throw NotFoundException if report not found', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(null);
      await expect(service.dismiss('missing', 'admin1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.dismiss('report1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStats', () => {
    it('should return counts for admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.count
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(2)  // reviewing
        .mockResolvedValueOnce(10) // resolved
        .mockResolvedValueOnce(3); // dismissed
      const result = await service.getStats('admin1');
      expect(result).toEqual({
        pending: 5,
        reviewing: 2,
        resolved: 10,
        dismissed: 3,
        total: 20,
      });
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.getStats('user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Content removal for thread/reel/video (X08-#2)', () => {
    it('resolve should remove reported thread on CONTENT_REMOVED', async () => {
      const report = {
        id: 'r-thread',
        status: 'PENDING',
        reason: 'HARASSMENT',
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: null,
        reportedUserId: null,
        reportedThreadId: 'thread-1',
        reportedReelId: null,
        reportedVideoId: null,
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
      prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' });
      prisma.moderationLog.create.mockResolvedValue({ id: 'log-1' });

      await service.resolve('r-thread', 'admin1', 'CONTENT_REMOVED' as ModerationAction);

      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { isRemoved: true },
      });
    });

    it('resolve should remove reported reel on CONTENT_REMOVED', async () => {
      const report = {
        id: 'r-reel',
        status: 'PENDING',
        reason: 'NUDITY',
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: null,
        reportedUserId: null,
        reportedThreadId: null,
        reportedReelId: 'reel-1',
        reportedVideoId: null,
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
      prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' });
      prisma.moderationLog.create.mockResolvedValue({ id: 'log-2' });

      await service.resolve('r-reel', 'admin1', 'CONTENT_REMOVED' as ModerationAction);

      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: 'reel-1' },
        data: { isRemoved: true },
      });
    });

    it('resolve should remove reported video on CONTENT_REMOVED', async () => {
      const report = {
        id: 'r-video',
        status: 'PENDING',
        reason: 'VIOLENCE',
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: null,
        reportedUserId: null,
        reportedThreadId: null,
        reportedReelId: null,
        reportedVideoId: 'video-1',
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
      prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' });
      prisma.moderationLog.create.mockResolvedValue({ id: 'log-3' });

      await service.resolve('r-video', 'admin1', 'CONTENT_REMOVED' as ModerationAction);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: { isRemoved: true },
      });
    });
  });

  describe('Temp ban banExpiresAt (X04-#3)', () => {
    it('should set banExpiresAt to ~72 hours on TEMP_BAN', async () => {
      const report = {
        id: 'r-ban',
        status: 'PENDING',
        reason: 'HARASSMENT',
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: null,
        reportedUserId: 'target-user',
        reportedThreadId: null,
        reportedReelId: null,
        reportedVideoId: null,
      };
      const beforeTime = Date.now();
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
      prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' });
      prisma.moderationLog.create.mockResolvedValue({ id: 'log-ban' });
      prisma.user.update.mockResolvedValue({ id: 'target-user', isBanned: true });

      await service.resolve('r-ban', 'admin1', 'TEMP_BAN' as ModerationAction);

      // Verify user.update was called with banExpiresAt
      expect(prisma.user.update).toHaveBeenCalled();
      const userUpdateCalls = prisma.user.update.mock.calls;
      // Find the call that sets isBanned (not the Clerk-related one)
      const banCall = userUpdateCalls.find(
        (call: any[]) => call[0]?.data?.isBanned === true,
      );
      expect(banCall).toBeDefined();
      const banData = banCall[0].data;
      expect(banData.isBanned).toBe(true);
      expect(banData.banExpiresAt).toBeInstanceOf(Date);

      // banExpiresAt should be ~72 hours from now (within 1 minute tolerance)
      const expectedMs = 72 * 3600000;
      const actualDiff = banData.banExpiresAt.getTime() - beforeTime;
      expect(actualDiff).toBeGreaterThan(expectedMs - 60000);
      expect(actualDiff).toBeLessThan(expectedMs + 60000);
    });
  });

  describe('R2-Tab2 audit fixes — deindex loop includes video', () => {
    it('should include video in the deindex content types for PERMANENT_BAN action', async () => {
      const report = {
        id: 'r-ban-deindex',
        status: 'PENDING',
        reason: 'SPAM',
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: null,
        reportedUserId: 'banned-user',
        reportedThreadId: null,
        reportedReelId: null,
        reportedVideoId: null,
      };
      // verifyAdminOrModerator calls user.findUnique first, then banned user lookup
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' })         // admin check
        .mockResolvedValueOnce({ clerkId: null });         // banned user Clerk lookup (no Clerk ID)
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
      prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' });
      prisma.moderationLog.create.mockResolvedValue({ id: 'log-deindex' });
      prisma.user.update.mockResolvedValue({ id: 'banned-user', isBanned: true });
      // All content model findMany return empty to stop the deindex loop
      prisma.post.findMany.mockResolvedValue([]);
      prisma.reel.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);

      await service.resolve('r-ban-deindex', 'admin1', 'PERMANENT_BAN' as ModerationAction);

      // The deindex loop should query post, reel, thread, AND video
      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'banned-user' },
        }),
      );
    });
  });

  // ── F3-3: Report creation accepts thread/reel/video-only targets ──
  describe('create — thread/reel/video-only targets (F3-3)', () => {
    it('should accept a report targeting only a thread', async () => {
      const userId = 'user123';
      const dto = {
        reason: ReportReason.HARASSMENT,
        reportedThreadId: 'thread-1',
      } as any;
      prisma.thread.findUnique.mockResolvedValue({ userId: 'other-user' });
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.count.mockResolvedValue(0);
      prisma.report.create.mockResolvedValue({ id: 'r1', status: 'PENDING', createdAt: new Date() });

      const result = await service.create(userId, dto);
      expect(result.id).toBe('r1');
      expect(prisma.report.create).toHaveBeenCalled();
    });

    it('should accept a report targeting only a reel', async () => {
      const userId = 'user123';
      const dto = {
        reason: ReportReason.SPAM,
        reportedReelId: 'reel-1',
      } as any;
      prisma.reel.findUnique.mockResolvedValue({ userId: 'other-user' });
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.count.mockResolvedValue(0);
      prisma.report.create.mockResolvedValue({ id: 'r2', status: 'PENDING', createdAt: new Date() });

      const result = await service.create(userId, dto);
      expect(result.id).toBe('r2');
      expect(prisma.report.create).toHaveBeenCalled();
    });

    it('should accept a report targeting only a video', async () => {
      const userId = 'user123';
      const dto = {
        reason: ReportReason.HATE_SPEECH,
        reportedVideoId: 'video-1',
      } as any;
      prisma.video.findUnique.mockResolvedValue({ userId: 'other-user' });
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.count.mockResolvedValue(0);
      prisma.report.create.mockResolvedValue({ id: 'r3', status: 'PENDING', createdAt: new Date() });

      const result = await service.create(userId, dto);
      expect(result.id).toBe('r3');
      expect(prisma.report.create).toHaveBeenCalled();
    });

    it('should still reject when no target fields are set at all', async () => {
      const userId = 'user123';
      const dto = { reason: ReportReason.HARASSMENT } as any;

      await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ── F3-4: Dismiss restores auto-hidden threads/reels/videos ──
  describe('dismiss — restore thread/reel/video on dismiss (F3-4)', () => {
    it('should restore auto-hidden thread on dismiss of urgent report', async () => {
      const report = {
        id: 'r-urgent-thread',
        status: 'PENDING',
        reason: 'VIOLENCE',
        reportedPostId: null,
        reportedCommentId: null,
        reportedThreadId: 'thread-1',
        reportedReelId: null,
        reportedVideoId: null,
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.count.mockResolvedValue(0); // no other urgent reports
      prisma.report.update.mockResolvedValue({ ...report, status: 'DISMISSED' });

      await service.dismiss('r-urgent-thread', 'admin1');

      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { isRemoved: false },
      });
    });

    it('should restore auto-hidden reel on dismiss of urgent report', async () => {
      const report = {
        id: 'r-urgent-reel',
        status: 'PENDING',
        reason: 'NUDITY',
        reportedPostId: null,
        reportedCommentId: null,
        reportedThreadId: null,
        reportedReelId: 'reel-1',
        reportedVideoId: null,
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.count.mockResolvedValue(0); // no other urgent reports
      prisma.report.update.mockResolvedValue({ ...report, status: 'DISMISSED' });

      await service.dismiss('r-urgent-reel', 'admin1');

      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: 'reel-1' },
        data: { isRemoved: false },
      });
    });

    it('should restore auto-hidden video on dismiss of urgent report', async () => {
      const report = {
        id: 'r-urgent-video',
        status: 'PENDING',
        reason: 'TERRORISM',
        reportedPostId: null,
        reportedCommentId: null,
        reportedThreadId: null,
        reportedReelId: null,
        reportedVideoId: 'video-1',
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.count.mockResolvedValue(0); // no other urgent reports
      prisma.report.update.mockResolvedValue({ ...report, status: 'DISMISSED' });

      await service.dismiss('r-urgent-video', 'admin1');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: { isRemoved: false },
      });
    });

    it('should NOT restore thread/reel/video if other urgent reports exist', async () => {
      const report = {
        id: 'r-urgent-multi',
        status: 'PENDING',
        reason: 'VIOLENCE',
        reportedPostId: null,
        reportedCommentId: null,
        reportedThreadId: 'thread-1',
        reportedReelId: 'reel-1',
        reportedVideoId: 'video-1',
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.count.mockResolvedValue(2); // other urgent reports exist
      prisma.report.update.mockResolvedValue({ ...report, status: 'DISMISSED' });

      await service.dismiss('r-urgent-multi', 'admin1');

      // None should be restored because other urgent reports exist
      expect(prisma.thread.update).not.toHaveBeenCalled();
      expect(prisma.reel.update).not.toHaveBeenCalled();
      expect(prisma.video.update).not.toHaveBeenCalled();
    });

    it('should NOT restore content for non-urgent report reasons', async () => {
      const report = {
        id: 'r-non-urgent',
        status: 'PENDING',
        reason: 'SPAM', // not in URGENT_REPORT_REASONS
        reportedPostId: null,
        reportedCommentId: null,
        reportedThreadId: 'thread-1',
        reportedReelId: null,
        reportedVideoId: null,
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.update.mockResolvedValue({ ...report, status: 'DISMISSED' });

      await service.dismiss('r-non-urgent', 'admin1');

      // No restore should happen for non-urgent reasons
      expect(prisma.thread.update).not.toHaveBeenCalled();
      expect(prisma.report.count).not.toHaveBeenCalled();
    });
  });
});