import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../config/prisma.service';
import { PrivacyService } from './privacy.service';
import { UploadService } from '../upload/upload.service';
import { QueueService } from '../../common/queue/queue.service';
import { globalMockProviders } from '../../common/test/mock-providers';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

/** Creates a Proxy that returns jest.fn() mocks for any model.method access */
function createTxProxy(): any {
  return new Proxy(
    {},
    {
      get() {
        return new Proxy(
          {},
          {
            get(_t, method) {
              return jest.fn().mockResolvedValue(method === 'update' ? {} : { count: 0 });
            },
          },
        );
      },
    },
  );
}

const NINETY_ONE_DAYS_AGO = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

describe('PrivacyService — hardDeletePurgedUsers', () => {
  let service: PrivacyService;
  let prisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        {
          provide: UploadService,
          useValue: { deleteFile: jest.fn().mockResolvedValue({ deleted: true }) },
        },
        {
          provide: QueueService,
          useValue: { addSearchIndexJob: jest.fn().mockResolvedValue('job-id') },
        },
        PrivacyService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue(null),
              delete: jest.fn().mockResolvedValue({}),
            },
            post: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findMany: jest.fn().mockResolvedValue([]) },
            story: { findMany: jest.fn().mockResolvedValue([]) },
            reel: { findMany: jest.fn().mockResolvedValue([]) },
            video: { findMany: jest.fn().mockResolvedValue([]) },
            device: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<void>) => fn(createTxProxy())),
          },
        },
      ],
    }).compile();

    service = module.get(PrivacyService);
    prisma = module.get(PrismaService) as any;
  });

  it('should return 0 when no users are eligible for hard-delete', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(0);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('should hard-delete users soft-deleted more than 90 days ago', async () => {
    const candidates = [
      { id: 'user-1', deletedAt: NINETY_ONE_DAYS_AGO, updatedAt: NINETY_ONE_DAYS_AGO },
      { id: 'user-2', deletedAt: NINETY_ONE_DAYS_AGO, updatedAt: NINETY_ONE_DAYS_AGO },
    ];
    prisma.user.findMany.mockResolvedValue(candidates);
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1', isDeleted: true })
      .mockResolvedValueOnce({ id: 'user-2', isDeleted: true });
    prisma.user.delete.mockResolvedValue({});

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(2);
    expect(prisma.user.delete).toHaveBeenCalledTimes(2);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-2' } });
  });

  it('should NOT hard-delete users soft-deleted less than 90 days ago', async () => {
    // The findMany query uses a cutoff date, so users <90 days should not appear in results.
    // Verify the query filter is correct by checking the where clause.
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(0);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: true,
        }),
        take: 10,
      }),
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('should skip users where isDeleted became false (safety check)', async () => {
    const candidates = [{ id: 'user-revived', deletedAt: NINETY_ONE_DAYS_AGO, updatedAt: NINETY_ONE_DAYS_AGO }];
    prisma.user.findMany.mockResolvedValue(candidates);
    // Safety re-fetch returns isDeleted: false (user was somehow un-deleted)
    prisma.user.findUnique.mockResolvedValue({ id: 'user-revived', isDeleted: false });

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(0);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('should skip users where findUnique returns null (already deleted)', async () => {
    const candidates = [{ id: 'user-gone', deletedAt: NINETY_ONE_DAYS_AGO, updatedAt: NINETY_ONE_DAYS_AGO }];
    prisma.user.findMany.mockResolvedValue(candidates);
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(0);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('should continue processing when one user fails to delete', async () => {
    const candidates = [
      { id: 'user-fail', deletedAt: NINETY_ONE_DAYS_AGO, updatedAt: NINETY_ONE_DAYS_AGO },
      { id: 'user-ok', deletedAt: NINETY_ONE_DAYS_AGO, updatedAt: NINETY_ONE_DAYS_AGO },
    ];
    prisma.user.findMany.mockResolvedValue(candidates);
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user-fail', isDeleted: true })
      .mockResolvedValueOnce({ id: 'user-ok', isDeleted: true });
    prisma.user.delete
      .mockRejectedValueOnce(new Error('FK constraint violation'))
      .mockResolvedValueOnce({});

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(1);
    expect(prisma.user.delete).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ operation: 'hard-delete-purge', userId: 'user-fail' }),
      }),
    );
  });

  it('should call Sentry.addBreadcrumb before each deletion as audit trail', async () => {
    const candidates = [{ id: 'user-audit', deletedAt: NINETY_ONE_DAYS_AGO, updatedAt: NINETY_ONE_DAYS_AGO }];
    prisma.user.findMany.mockResolvedValue(candidates);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-audit', isDeleted: true });
    prisma.user.delete.mockResolvedValue({});

    await service.hardDeletePurgedUsers();

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'hard-delete',
        message: expect.stringContaining('user-audit'),
        level: 'warning',
      }),
    );
  });

  it('should use updatedAt as fallback when deletedAt is null', async () => {
    const candidates = [{ id: 'user-no-deletedAt', deletedAt: null, updatedAt: NINETY_ONE_DAYS_AGO }];
    prisma.user.findMany.mockResolvedValue(candidates);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-no-deletedAt', isDeleted: true });
    prisma.user.delete.mockResolvedValue({});

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(NINETY_ONE_DAYS_AGO.toISOString()),
      }),
    );
  });

  it('should handle top-level findMany failure gracefully', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('DB connection lost'));

    const result = await service.hardDeletePurgedUsers();

    expect(result).toBe(0);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should limit batch size to 10', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.hardDeletePurgedUsers();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it('should query with correct 90-day cutoff date', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.hardDeletePurgedUsers();

    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where.isDeleted).toBe(true);
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(2);

    // Verify the cutoff date is approximately 90 days ago (within 5 seconds tolerance)
    const cutoffDate = call.where.OR[0].deletedAt.lte;
    const expectedCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoffDate.getTime() - expectedCutoff.getTime())).toBeLessThan(5000);
  });
});
