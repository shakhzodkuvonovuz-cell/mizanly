import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReportsService } from './reports.service';
import { ReportReason, ModerationAction } from '@prisma/client';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #48-61, #82: reports critical safety paths
 */
describe('ReportsService — W7 T09 gaps', () => {
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
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
              groupBy: jest.fn().mockResolvedValue([]),
            },
            post: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            comment: { findUnique: jest.fn(), update: jest.fn() },
            message: { findUnique: jest.fn(), update: jest.fn() },
            thread: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
            reel: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
            video: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
            user: { findUnique: jest.fn(), update: jest.fn() },
            moderationLog: { create: jest.fn() },
            notification: { create: jest.fn() },
            $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  // T09 #49: mass-report abuse detection (>10 reports/hour)
  describe('create — mass-report abuse', () => {
    it('should throw BadRequestException when user exceeds 10 reports in 1 hour', async () => {
      prisma.report.count.mockResolvedValue(10);

      await expect(
        service.create('user-1', { reason: ReportReason.SPAM, reportedUserId: 'other' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #48: urgent report auto-hide (NUDITY/VIOLENCE/TERRORISM)
  describe('create — urgent report auto-hide', () => {
    it('should auto-hide post when NUDITY report reaches 3 unique reporters', async () => {
      prisma.report.count.mockResolvedValue(0); // not mass-reporting
      prisma.post.findUnique.mockResolvedValue({ userId: 'other-user' }); // ownership check — not self
      prisma.report.findFirst.mockResolvedValue(null); // no duplicate
      prisma.report.create.mockResolvedValue({ id: 'r1', status: 'PENDING', createdAt: new Date() });
      prisma.report.groupBy.mockResolvedValue([{ reporterId: 'u1' }, { reporterId: 'u2' }, { reporterId: 'u3' }]); // 3 unique
      prisma.post.update.mockResolvedValue({});

      await service.create('user-3', {
        reason: ReportReason.NUDITY,
        reportedPostId: 'post-1',
      } as any);

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: expect.objectContaining({ isRemoved: true }),
        }),
      );
    });

    it('should NOT auto-hide when fewer than 3 unique reporters', async () => {
      prisma.report.count.mockResolvedValue(0);
      prisma.post.findUnique.mockResolvedValue({ userId: 'other-user' }); // ownership check — not self
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.create.mockResolvedValue({ id: 'r1', status: 'PENDING', createdAt: new Date() });
      prisma.report.groupBy.mockResolvedValue([{ reporterId: 'u1' }]); // only 1 reporter

      await service.create('user-1', {
        reason: ReportReason.VIOLENCE,
        reportedPostId: 'post-1',
      } as any);

      expect(prisma.post.update).not.toHaveBeenCalled();
    });
  });

  // T09 #50: reporting own comment
  describe('create — self-report comment', () => {
    it('should throw BadRequestException when reporting own comment', async () => {
      prisma.comment.findUnique.mockResolvedValue({ userId: 'user-1' });

      await expect(
        service.create('user-1', { reason: ReportReason.SPAM, reportedCommentId: 'comment-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #51: reporting own message
  describe('create — self-report message', () => {
    it('should throw BadRequestException when reporting own message', async () => {
      prisma.message.findUnique.mockResolvedValue({ senderId: 'user-1' });

      await expect(
        service.create('user-1', { reason: ReportReason.SPAM, reportedMessageId: 'msg-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #53: resolve — CONTENT_REMOVED action
  describe('resolve — CONTENT_REMOVED', () => {
    it('should soft-delete reported post on CONTENT_REMOVED', async () => {
      const report = {
        id: 'r1', status: 'PENDING', reason: 'SPAM',
        reportedPostId: 'post-1', reportedUserId: null,
        reportedCommentId: null, reportedMessageId: null,
        reportedThreadId: null, reportedReelId: null, reportedVideoId: null,
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' });
      prisma.moderationLog.create.mockResolvedValue({});
      prisma.post.update.mockResolvedValue({});

      await service.resolve('r1', 'admin-1', 'CONTENT_REMOVED' as ModerationAction);

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { isRemoved: true },
      });
    });
  });

  // T09 #55: resolve — TEMP_MUTE warningsCount increment
  describe('resolve — TEMP_MUTE', () => {
    it('should increment warningsCount on TEMP_MUTE', async () => {
      const report = {
        id: 'r-mute', status: 'PENDING', reason: 'HARASSMENT',
        reportedPostId: null, reportedUserId: 'target-user',
        reportedCommentId: null, reportedMessageId: null,
        reportedThreadId: null, reportedReelId: null, reportedVideoId: null,
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' });
      prisma.moderationLog.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      await service.resolve('r-mute', 'admin-1', 'TEMP_MUTE' as ModerationAction);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target-user' },
        data: { warningsCount: { increment: 1 } },
      });
    });
  });

  // T09 #57: resolve — already resolved report
  describe('resolve — already resolved', () => {
    it('should throw BadRequestException when report already resolved', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', status: 'RESOLVED' });

      await expect(
        service.resolve('r1', 'admin-1', 'WARNING' as ModerationAction),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #58: dismiss — already resolved report
  describe('dismiss — already resolved', () => {
    it('should throw BadRequestException when report already dismissed', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', status: 'DISMISSED' });

      await expect(service.dismiss('r1', 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #59: getById — admin can view any report
  describe('getById — admin access', () => {
    it('should allow admin to view another user report', async () => {
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'other-user', reportedUser: {} });
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

      const result = await service.getById('r1', 'admin-1');

      expect(result.id).toBe('r1');
    });

    it('should allow MODERATOR to view another user report', async () => {
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'other-user', reportedUser: {} });
      prisma.user.findUnique.mockResolvedValue({ role: 'MODERATOR' });

      const result = await service.getById('r1', 'mod-1');

      expect(result.id).toBe('r1');
    });
  });

  // T09 #52: moderation queue for reported post
  describe('create — moderation queue enqueue', () => {
    it('should enqueue moderation job for reported post with content', async () => {
      prisma.report.count.mockResolvedValue(0);
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.create.mockResolvedValue({ id: 'r1', status: 'PENDING', createdAt: new Date() });
      prisma.post.findUnique.mockResolvedValue({ userId: 'other-user', content: 'Problematic content' });

      const qs = (service as any).queueService;
      qs.addModerationJob.mockResolvedValue(undefined);

      await service.create('user-1', { reason: ReportReason.HARASSMENT, reportedPostId: 'post-1' } as any);

      expect(qs.addModerationJob).toHaveBeenCalledWith({
        content: 'Problematic content',
        contentType: 'post',
        contentId: 'post-1',
      });
    });
  });
});
