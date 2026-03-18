import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReportsService } from './reports.service';
import { ReportStatus, ReportReason, ModerationAction } from '@prisma/client';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
            },
            comment: {
              findUnique: jest.fn(),
            },
            message: {
              findUnique: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            moderationLog: {
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
        ...dto,
      };

      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.create.mockResolvedValue(createdReport);

      const result = await service.create(userId, dto);
      expect(prisma.report.findFirst).toHaveBeenCalled();
      expect(prisma.report.create).toHaveBeenCalled();
      expect(result).toEqual(createdReport);
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
});