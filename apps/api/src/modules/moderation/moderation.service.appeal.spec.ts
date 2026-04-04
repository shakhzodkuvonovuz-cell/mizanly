import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { PrismaService } from '../../config/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ModerationService — appeal resolution', () => {
  let service: ModerationService;
  let prisma: any;

  beforeEach(async () => {
    const tx = {
      post: { update: jest.fn().mockResolvedValue({}) },
      comment: { update: jest.fn().mockResolvedValue({}) },
      message: { update: jest.fn().mockResolvedValue({}) },
      user: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ clerkId: 'clerk-123' }),
      },
      moderationLog: { update: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      moderationLog: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      report: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
      post: { update: jest.fn().mockResolvedValue({}) },
      comment: { update: jest.fn().mockResolvedValue({}) },
      message: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) => fn(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: { moderateImage: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) } },
      ],
    }).compile();

    service = module.get<ModerationService>(ModerationService);
  });

  describe('resolveAppeal — accepted ban reversal', () => {
    it('should clear isBanned, isDeactivated, banExpiresAt, and banReason', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue({
        id: 'log1',
        isAppealed: true,
        appealResolved: false,
        action: 'PERMANENT_BAN',
        targetUserId: 'user1',
        targetPostId: null,
        targetCommentId: null,
        targetMessageId: null,
      });

      await service.resolveAppeal('admin1', 'log1', true, 'Ban reversed');

      // Verify transaction was called
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw when appeal already resolved', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue({
        id: 'log1',
        isAppealed: true,
        appealResolved: true,
        action: 'WARNING',
        targetUserId: 'user1',
      });

      await expect(service.resolveAppeal('admin1', 'log1', true, 'test')).rejects.toThrow(BadRequestException);
    });

    it('should throw when no appeal submitted', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue({
        id: 'log1',
        isAppealed: false,
        appealResolved: false,
        action: 'WARNING',
        targetUserId: 'user1',
      });

      await expect(service.resolveAppeal('admin1', 'log1', true, 'test')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent log', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue(null);
      await expect(service.resolveAppeal('admin1', 'nonexistent', true, 'test')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveAppeal — content removal reversal', () => {
    it('should restore post and comment when CONTENT_REMOVED appeal accepted', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue({
        id: 'log1',
        isAppealed: true,
        appealResolved: false,
        action: 'CONTENT_REMOVED',
        targetUserId: 'user1',
        targetPostId: 'post1',
        targetCommentId: 'comment1',
        targetMessageId: null,
      });

      await service.resolveAppeal('admin1', 'log1', true, 'Content restored');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should NOT reverse when appeal rejected', async () => {
      const tx = {
        post: { update: jest.fn() },
        comment: { update: jest.fn() },
        message: { update: jest.fn() },
        user: { update: jest.fn(), findUnique: jest.fn() },
        moderationLog: { update: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<void>) => fn(tx));

      prisma.moderationLog.findUnique.mockResolvedValue({
        id: 'log1',
        isAppealed: true,
        appealResolved: false,
        action: 'CONTENT_REMOVED',
        targetUserId: 'user1',
        targetPostId: 'post1',
        targetCommentId: null,
        targetMessageId: null,
      });

      await service.resolveAppeal('admin1', 'log1', false, 'Appeal denied');

      // Post should NOT be updated (restored) when appeal is rejected
      expect(tx.post.update).not.toHaveBeenCalled();
    });
  });

  describe('review — message removal', () => {
    it('should soft-delete reported message when action is remove', async () => {
      const tx = {
        report: { update: jest.fn().mockResolvedValue({}) },
        post: { update: jest.fn().mockResolvedValue({}) },
        comment: { update: jest.fn().mockResolvedValue({}) },
        message: { update: jest.fn().mockResolvedValue({}) },
        moderationLog: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<void>) => fn(tx));
      prisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
        reportedPostId: null,
        reportedCommentId: null,
        reportedMessageId: 'msg1',
        reportedUserId: 'user1',
      });

      await service.review('admin1', 'r1', 'remove', 'Violated guidelines');

      expect(tx.message.update).toHaveBeenCalledWith({
        where: { id: 'msg1' },
        data: { isDeleted: true },
      });
    });
  });

  describe('getMyActions — moderator identity hidden', () => {
    it('should NOT include moderator relation in response', async () => {
      prisma.moderationLog.findMany.mockResolvedValue([
        {
          id: 'log1',
          action: 'WARNING',
          targetUserId: 'user1',
          targetPost: null,
          targetComment: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getMyActions('user1');

      // Verify the query does NOT include moderator select
      expect(prisma.moderationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.not.objectContaining({
            moderator: expect.anything(),
          }),
        }),
      );
      expect(result.data[0]).not.toHaveProperty('moderator');
    });
  });

  describe('getPendingAppeals — standard cursor pagination', () => {
    it('should use Prisma cursor pattern, not manual id filter', async () => {
      prisma.moderationLog.findMany.mockResolvedValue([]);

      await service.getPendingAppeals('admin1', 'cursor123');

      expect(prisma.moderationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'cursor123' },
          skip: 1,
        }),
      );
      // Should NOT have where.id = { lt: cursor }
      const callArgs = prisma.moderationLog.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('id');
    });
  });
});
