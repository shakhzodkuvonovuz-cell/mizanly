import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
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
      const existing = null;
      const createdReport = {
        id: 'report123',
        reporterId: userId,
        ...dto,
      };

      prisma.report.findFirst.mockResolvedValue(existing);
      prisma.report.create.mockResolvedValue(createdReport);

      const result = await service.create(userId, dto);
      expect(prisma.report.findFirst).toHaveBeenCalledWith({
        where: {
          reporterId: userId,
          reportedUserId: dto.reportedUserId,
          status: { in: ['PENDING', 'REVIEWING'] },
        },
      });
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: userId,
          reason: dto.reason,
          description: dto.description,
          reportedPostId: undefined,
          reportedUserId: dto.reportedUserId,
          reportedCommentId: undefined,
          reportedMessageId: undefined,
        },
      });
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
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { reporterId: userId },
        take: 3,
        orderBy: { createdAt: 'desc' },
        include: {
          reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
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

    it('should throw ForbiddenException if report belongs to other user', async () => {
      const report = { id: 'report123', reporterId: 'otherUser' };
      prisma.report.findUnique.mockResolvedValue(report);
      await expect(service.getById('report123', 'user123')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPending', () => {
    it('should return paginated pending reports', async () => {
      const reports = [{ id: 'report1' }, { id: 'report2' }, { id: 'extra' }];
      prisma.report.findMany.mockResolvedValue(reports);
      const result = await service.getPending(undefined, 2);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
        take: 3,
        orderBy: { createdAt: 'asc' },
        include: {
          reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
    });
  });

  describe('resolve', () => {
    it('should resolve report and create moderation log', async () => {
      const report = { id: 'report123', reportedUserId: 'targetUser', reason: 'HATE_SPEECH' };
      const updatedReport = { ...report, status: 'RESOLVED' };
      const log = { id: 'log123' };
      prisma.report.findUnique.mockResolvedValue(report);
      prisma.$transaction.mockImplementation((ops) => Promise.all(ops.map(op => op())));
      prisma.report.update.mockResolvedValue(updatedReport);
      prisma.moderationLog.create.mockResolvedValue(log);

      const result = await service.resolve('report123', 'admin123', 'WARNING');
      expect(prisma.report.findUnique).toHaveBeenCalledWith({ where: { id: 'report123' } });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report123' },
        data: { status: 'RESOLVED', actionTaken: 'WARNING', reviewedAt: expect.any(Date) },
      });
      expect(prisma.moderationLog.create).toHaveBeenCalledWith({
        data: {
          moderatorId: 'admin123',
          action: 'WARNING',
          targetUserId: report.reportedUserId,
          targetPostId: null,
          reason: 'Report report123: HATE_SPEECH',
        },
      });
      expect(result).toEqual(updatedReport);
    });

    it('should throw NotFoundException if report not found', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      await expect(service.resolve('missing', 'admin123', 'WARNING')).rejects.toThrow(NotFoundException);
    });
  });

  describe('dismiss', () => {
    it('should dismiss report', async () => {
      const dismissed = { id: 'report123', status: 'DISMISSED' };
      prisma.report.update.mockResolvedValue(dismissed);
      const result = await service.dismiss('report123');
      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report123' },
        data: { status: 'DISMISSED', reviewedAt: expect.any(Date) },
      });
      expect(result).toEqual(dismissed);
    });
  });

  describe('getStats', () => {
    it('should return counts', async () => {
      prisma.report.count
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(2)  // reviewing
        .mockResolvedValueOnce(10) // resolved
        .mockResolvedValueOnce(3); // dismissed
      const result = await service.getStats();
      expect(result).toEqual({
        pending: 5,
        reviewing: 2,
        resolved: 10,
        dismissed: 3,
        total: 20,
      });
    });
  });
});