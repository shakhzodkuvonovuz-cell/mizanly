import { Test, TestingModule } from '@nestjs/testing';
import { DlqService } from './dlq.service';
import { PrismaService } from '../../config/prisma.service';

describe('DlqService', () => {
  let service: DlqService;
  let mockRedis: any;
  let mockPrisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedis = {
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
    };

    mockPrisma = {
      failedJob: {
        create: jest.fn().mockResolvedValue({ id: 'fj-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: 'REDIS', useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DlqService>(DlqService);
  });

  const createMockJob = (overrides: Partial<{
    id: string;
    name: string;
    data: Record<string, unknown>;
    attemptsMade: number;
    opts: { attempts: number };
  }> = {}): any => ({
    id: 'job-1',
    name: 'test-job',
    data: { userId: 'user-1', action: 'sendPush' },
    attemptsMade: 3,
    opts: { attempts: 3 },
    ...overrides,
  });

  describe('moveToDlq', () => {
    it('should skip if job is undefined', async () => {
      await service.moveToDlq(undefined, new Error('fail'), 'test-queue');

      expect(mockRedis.lpush).not.toHaveBeenCalled();
      expect(mockPrisma.failedJob.create).not.toHaveBeenCalled();
    });

    it('should skip if this is NOT the final attempt', async () => {
      const job = createMockJob({ attemptsMade: 1, opts: { attempts: 3 } });

      await service.moveToDlq(job, new Error('fail'), 'test-queue');

      expect(mockRedis.lpush).not.toHaveBeenCalled();
      expect(mockPrisma.failedJob.create).not.toHaveBeenCalled();
    });

    it('should move to DLQ on final attempt', async () => {
      const job = createMockJob({ attemptsMade: 3, opts: { attempts: 3 } });

      await service.moveToDlq(job, new Error('permanently failed'), 'notifications');

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'mizanly:dlq',
        expect.stringContaining('"jobId":"job-1"'),
      );
      expect(mockRedis.ltrim).toHaveBeenCalledWith('mizanly:dlq', 0, 999);
      expect(mockRedis.expire).toHaveBeenCalledWith('mizanly:dlq', 7 * 86400);

      expect(mockPrisma.failedJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          queue: 'notifications',
          jobName: 'test-job',
          jobId: 'job-1',
          error: 'permanently failed',
          attempts: 3,
        }),
      });
    });

    it('should strip sensitive fields from DLQ entry', async () => {
      const job = createMockJob({
        data: {
          userId: 'user-1',
          secret: 'whsec_123',
          token: 'tok_abc',
          signingSecret: 'sig_secret',
          apiKey: 'ak_xxx',
          webhookSecret: 'ws_yyy',
          payload: { safe: true },
        },
      });

      await service.moveToDlq(job, new Error('fail'), 'webhooks');

      const redisArg = mockRedis.lpush.mock.calls[0][1];
      const parsed = JSON.parse(redisArg);

      expect(parsed.data.userId).toBe('user-1');
      expect(parsed.data.payload).toEqual({ safe: true });
      expect(parsed.data.secret).toBeUndefined();
      expect(parsed.data.token).toBeUndefined();
      expect(parsed.data.signingSecret).toBeUndefined();
      expect(parsed.data.apiKey).toBeUndefined();
      expect(parsed.data.webhookSecret).toBeUndefined();
    });

    it('should handle Redis failure gracefully', async () => {
      mockRedis.lpush.mockRejectedValue(new Error('Redis down'));
      const job = createMockJob();

      // Should not throw
      await service.moveToDlq(job, new Error('fail'), 'test-queue');

      // DB should still be called
      expect(mockPrisma.failedJob.create).toHaveBeenCalled();
    });

    it('should handle DB failure gracefully', async () => {
      mockPrisma.failedJob.create.mockRejectedValue(new Error('DB down'));
      const job = createMockJob();

      // Should not throw
      await service.moveToDlq(job, new Error('fail'), 'test-queue');

      // Redis should still be called
      expect(mockRedis.lpush).toHaveBeenCalled();
    });

    it('should capture to Sentry when both Redis AND DB fail', async () => {
      mockRedis.lpush.mockRejectedValue(new Error('Redis down'));
      mockPrisma.failedJob.create.mockRejectedValue(new Error('DB down'));
      const job = createMockJob();

      const Sentry = require('@sentry/node');
      const captureSpy = jest.spyOn(Sentry, 'captureException').mockImplementation();

      await service.moveToDlq(job, new Error('critical fail'), 'test-queue');

      expect(captureSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'critical fail' }),
        expect.objectContaining({
          tags: { queue: 'test-queue', jobName: 'test-job' },
        }),
      );

      captureSpy.mockRestore();
    });

    it('should treat job with no opts.attempts as 1 attempt max', async () => {
      const job = createMockJob({ attemptsMade: 1, opts: undefined as any });
      (job as any).opts = undefined;

      await service.moveToDlq(job, new Error('fail'), 'test-queue');

      // attemptsMade (1) >= maxAttempts (1), so it SHOULD move to DLQ
      expect(mockRedis.lpush).toHaveBeenCalled();
    });

    it('should include failedAt timestamp in DLQ entry', async () => {
      const before = new Date().toISOString();
      const job = createMockJob();

      await service.moveToDlq(job, new Error('fail'), 'test-queue');

      const redisArg = mockRedis.lpush.mock.calls[0][1];
      const parsed = JSON.parse(redisArg);
      const after = new Date().toISOString();

      expect(parsed.failedAt).toBeDefined();
      expect(parsed.failedAt >= before).toBe(true);
      expect(parsed.failedAt <= after).toBe(true);
    });

    it('should include error message and queue name in DLQ entry', async () => {
      const job = createMockJob();

      await service.moveToDlq(job, new Error('Something broke'), 'media-processing');

      const redisArg = mockRedis.lpush.mock.calls[0][1];
      const parsed = JSON.parse(redisArg);

      expect(parsed.error).toBe('Something broke');
      expect(parsed.queue).toBe('media-processing');
      expect(parsed.name).toBe('test-job');
      expect(parsed.attempts).toBe(3);
    });
  });
});
