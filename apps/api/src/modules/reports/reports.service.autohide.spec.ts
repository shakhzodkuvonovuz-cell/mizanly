import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { ReportReason, ReportStatus } from '@prisma/client';

describe('ReportsService — auto-hide + dismiss restore', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      report: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'r1', status: 'PENDING', createdAt: new Date() }),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      post: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'other-user' }),
        update: jest.fn().mockResolvedValue({}),
      },
      comment: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'other-user' }),
        update: jest.fn().mockResolvedValue({}),
      },
      message: { findUnique: jest.fn().mockResolvedValue({ senderId: 'other-user' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: { addModerationJob: jest.fn().mockResolvedValue(undefined), addSearchIndexJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue(null) } },
        { provide: PublishWorkflowService, useValue: { onUnpublish: jest.fn().mockResolvedValue(undefined) } },
        { provide: 'REDIS', useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('urgent report auto-hide threshold', () => {
    it('should NOT auto-hide with fewer than 3 unique reporters', async () => {
      // Only 1 unique reporter group
      prisma.report.groupBy.mockResolvedValue([{ reporterId: 'user1' }]);

      await service.create('user1', {
        reason: 'NUDITY' as ReportReason,
        description: 'test',
        reportedPostId: 'post1',
      } as any);

      // post.update should NOT be called since threshold not met
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('should auto-hide with 3+ unique reporters', async () => {
      // 3 unique reporter groups
      prisma.report.groupBy.mockResolvedValue([
        { reporterId: 'user1' },
        { reporterId: 'user2' },
        { reporterId: 'user3' },
      ]);

      await service.create('user4', {
        reason: 'TERRORISM' as ReportReason,
        description: 'test',
        reportedPostId: 'post1',
      } as any);

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post1' },
          data: expect.objectContaining({ isRemoved: true }),
        }),
      );
    });

    it('should NOT auto-hide for non-urgent reasons', async () => {
      await service.create('user1', {
        reason: 'SPAM' as ReportReason,
        description: 'spam',
        reportedPostId: 'post1',
      } as any);

      expect(prisma.post.update).not.toHaveBeenCalled();
    });
  });

  describe('dismiss restores auto-hidden content', () => {
    it('should restore post on dismiss when no other urgent reports exist', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
        reason: 'NUDITY',
        reportedPostId: 'post1',
        reportedCommentId: null,
      });
      prisma.report.count.mockResolvedValue(0); // no other urgent reports
      prisma.report.update.mockResolvedValue({ id: 'r1', status: 'DISMISSED' });

      await service.dismiss('r1', 'admin1');

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post1' },
        data: { isRemoved: false, removedReason: null },
      });
    });

    it('should NOT restore when other urgent reports exist for same target', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
        reason: 'VIOLENCE',
        reportedPostId: 'post1',
        reportedCommentId: null,
      });
      prisma.report.count.mockResolvedValue(2); // 2 other urgent reports
      prisma.report.update.mockResolvedValue({ id: 'r1', status: 'DISMISSED' });

      await service.dismiss('r1', 'admin1');

      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('should NOT restore for non-urgent dismissed reports', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
        reason: 'SPAM',
        reportedPostId: 'post1',
        reportedCommentId: null,
      });
      prisma.report.update.mockResolvedValue({ id: 'r1', status: 'DISMISSED' });

      await service.dismiss('r1', 'admin1');

      expect(prisma.post.update).not.toHaveBeenCalled();
    });
  });

  describe('report create returns safe fields only', () => {
    it('should return only id, status, createdAt', async () => {
      const now = new Date();
      prisma.report.create.mockResolvedValue({
        id: 'r1',
        reporterId: 'user1',
        reason: 'HARASSMENT',
        description: 'test',
        reportedUserId: 'target1',
        status: 'PENDING',
        createdAt: now,
        actionTaken: 'NONE',
      });

      const result = await service.create('user1', {
        reason: 'HARASSMENT' as ReportReason,
        description: 'test',
        reportedUserId: 'target1',
      } as any);

      expect(result).toEqual({ id: 'r1', status: 'PENDING', createdAt: now });
      expect(result).not.toHaveProperty('reporterId');
      expect(result).not.toHaveProperty('actionTaken');
    });
  });
});
