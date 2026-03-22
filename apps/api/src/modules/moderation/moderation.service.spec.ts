import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ModerationService } from './moderation.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ModerationService', () => {
  let service: ModerationService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ModerationService,
        {
          provide: PrismaService,
          useValue: {
            report: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            post: { update: jest.fn() },
            comment: { update: jest.fn() },
            moderationLog: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<void>) => fn({
              report: { update: jest.fn() },
              post: { update: jest.fn() },
              comment: { update: jest.fn() },
              moderationLog: { create: jest.fn() },
            })),
          },
        },
      ],
    }).compile();
    service = module.get(ModerationService);
    prisma = module.get(PrismaService) as any;
  });

  describe('checkText', () => {
    it('should return safe result for clean text', async () => {
      const result = await service.checkText('u1', { text: 'Assalamu Alaikum brothers and sisters' });
      expect(result.flagged).toBe(false);
    });

    it('should flag inappropriate text', async () => {
      prisma.report.create.mockResolvedValue({});
      const result = await service.checkText('u1', { text: 'kill yourself you worthless piece of trash' });
      expect(result.flagged).toBe(true);
      expect(result.categories).toEqual(expect.arrayContaining([expect.any(String)]));
    });
  });

  describe('checkImage', () => {
    it('should return SAFE when AI classifies image as safe', async () => {
      const result = await service.checkImage('u1', { imageUrl: 'https://cdn.test/img.jpg' });
      expect(result.safe).toBe(true);
      expect(result.classification).toBe('SAFE');
    });
  });

  describe('getQueue', () => {
    it('should return pending reports for admin', async () => {
      prisma.report.findMany.mockResolvedValue([{ id: 'r1', status: 'PENDING' }]);
      const result = await service.getQueue('admin-1');
      expect(result.data).toHaveLength(1);
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.getQueue('u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('review', () => {
    it('should approve (dismiss) a report', async () => {
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING', reason: 'SPAM' });
      await service.review('admin-1', 'r1', 'approve');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing report', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      await expect(service.review('admin-1', 'missing', 'approve')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already reviewed report', async () => {
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', status: 'RESOLVED' });
      await expect(service.review('admin-1', 'r1', 'approve')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStats', () => {
    it('should return moderation statistics', async () => {
      const result = await service.getStats('admin-1');
      expect(result).toHaveProperty('flaggedToday');
      expect(result).toHaveProperty('reviewedToday');
      expect(result).toHaveProperty('totalPending');
    });
  });

  describe('submitAppeal', () => {
    it('should submit appeal for moderation action', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue({ id: 'ml1', targetUserId: 'u1', isAppealed: false });
      prisma.moderationLog.update.mockResolvedValue({ id: 'ml1', isAppealed: true });
      const result = await service.submitAppeal('u1', {
        moderationLogId: 'ml1', reason: 'no-violation', details: 'I did nothing wrong',
      });
      expect(result.isAppealed).toBe(true);
    });

    it('should throw ForbiddenException if not target user', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue({ id: 'ml1', targetUserId: 'other', isAppealed: false });
      await expect(service.submitAppeal('u1', {
        moderationLogId: 'ml1', reason: 'no-violation', details: 'test',
      })).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already appealed', async () => {
      prisma.moderationLog.findUnique.mockResolvedValue({ id: 'ml1', targetUserId: 'u1', isAppealed: true });
      await expect(service.submitAppeal('u1', {
        moderationLogId: 'ml1', reason: 'no-violation', details: 'test',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyActions', () => {
    it('should return actions targeting user', async () => {
      prisma.moderationLog.findMany.mockResolvedValue([{ id: 'ml1', action: 'WARNING' }]);
      const result = await service.getMyActions('u1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('flagContent', () => {
    it('should create a report record from flagged content', async () => {
      prisma.report.create.mockResolvedValue({ id: 'r1', status: 'PENDING' });

      await service.flagContent({
        reporterId: 'user-1',
        text: 'bad word here',
        context: 'post',
        categories: ['HATE_SPEECH'],
        severity: 'HIGH',
        matches: ['bad word'],
        reportedPostId: 'post-1',
      });

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reporterId: 'user-1',
            reportedPostId: 'post-1',
            status: 'PENDING',
            actionTaken: 'NONE',
          }),
        }),
      );
    });

    it('should create report with null reporterId for auto-flagged content (Finding 28)', async () => {
      prisma.report.create.mockResolvedValue({});
      await service.flagContent({
        reporterId: 'u1',
        categories: ['SPAM'],
        severity: 'LOW',
        matches: ['buy now'],
        autoFlagged: true,
      });
      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reporterId: null,
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('getMyAppeals', () => {
    it('should return paginated appeals for user', async () => {
      prisma.moderationLog.findMany.mockResolvedValue([
        { id: 'ml1', action: 'CONTENT_REMOVED', appealStatus: 'PENDING', targetUserId: 'u1' },
      ]);

      const result = await service.getMyAppeals('u1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].appealStatus).toBe('PENDING');
    });

    it('should return empty when no appeals', async () => {
      prisma.moderationLog.findMany.mockResolvedValue([]);
      const result = await service.getMyAppeals('u1');
      expect(result.data).toEqual([]);
    });
  });
});
