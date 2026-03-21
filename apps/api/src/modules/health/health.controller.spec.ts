import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaService } from '../../config/prisma.service';
import { AsyncJobService } from '../../common/services/async-jobs.service';
import { FeatureFlagsService } from '../../common/services/feature-flags.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock global fetch for R2/Stream health checks
const originalFetch = global.fetch;

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: any;

  beforeEach(async () => {
    // Mock fetch to simulate healthy external services
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;

    const mockPrismaService = {
      $queryRaw: jest.fn(),
      user: { count: jest.fn(), findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
      post: { count: jest.fn() },
      thread: { count: jest.fn() },
      reel: { count: jest.fn() },
    };

    const mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    const mockAsyncJobService = {
      enqueue: jest.fn(),
      getStats: jest.fn().mockReturnValue({ pending: 0, active: 0, completed: 0, failed: 0 }),
    };

    const mockFeatureFlagsService = {
      getAllFlags: jest.fn().mockResolvedValue({}),
      isEnabledForUser: jest.fn().mockResolvedValue(false),
    };

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        ...globalMockProviders,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'REDIS', useValue: mockRedis },
        { provide: AsyncJobService, useValue: mockAsyncJobService },
        { provide: FeatureFlagsService, useValue: mockFeatureFlagsService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test') } },
      ],
    }).compile();

    controller = module.get(HealthController);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(HealthController);
  });

  describe('GET /health', () => {
    it('should return 200 with status "healthy" when all services are up', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await controller.check();

      expect(result).toEqual(expect.objectContaining({
        status: 'healthy',
        timestamp: expect.any(String),
        services: expect.objectContaining({ database: 'up', redis: 'up' }),
        version: expect.any(String),
      }));
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return status "degraded" when database query fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('DB connection failed'));

      const result = await controller.check();

      expect(result.status).not.toBe('healthy');
      expect(result.services.database).toBe('down');
      expect(result.timestamp).toBeDefined();
      expect(result.version).toBeDefined();
    });
  });

  describe('GET /health/metrics', () => {
    it('should return entity counts and system metrics', async () => {
      prisma.user.count.mockResolvedValue(100);
      prisma.post.count.mockResolvedValue(500);
      prisma.thread.count.mockResolvedValue(200);
      prisma.reel.count.mockResolvedValue(150);

      const result = await controller.metrics('admin-user-id');

      expect(result).toEqual(expect.objectContaining({
        timestamp: expect.any(String),
        counts: { users: 100, posts: 500, threads: 200, reels: 150 },
        uptime: expect.any(Number),
        memory: expect.any(Object),
      }));
      expect(prisma.user.count).toHaveBeenCalled();
      expect(prisma.post.count).toHaveBeenCalled();
      expect(prisma.thread.count).toHaveBeenCalled();
      expect(prisma.reel.count).toHaveBeenCalledWith({ where: { status: 'READY' } });
    });

    it('should include memory usage info', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.post.count.mockResolvedValue(0);
      prisma.thread.count.mockResolvedValue(0);
      prisma.reel.count.mockResolvedValue(0);

      const result = await controller.metrics('admin-user-id');
      expect(result.memory).toBeDefined();
      expect(result.memory.heapUsedMB).toBeDefined();
    });

    it('should return uptime as positive number', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.post.count.mockResolvedValue(0);
      prisma.thread.count.mockResolvedValue(0);
      prisma.reel.count.mockResolvedValue(0);

      const result = await controller.metrics('admin-user-id');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('response format', () => {
    it('should include timestamp as ISO string in health check', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const result = await controller.check();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should include version string', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const result = await controller.check();
      expect(typeof result.version).toBe('string');
    });

    it('should report redis status', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const result = await controller.check();
      expect(['up', 'down']).toContain(result.services.redis);
    });

    it('should handle all services healthy', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const result = await controller.check();
      expect(result.status).toBe('healthy');
      expect(result.services.database).toBe('up');
    });

    it('should report zero counts for empty database', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.post.count.mockResolvedValue(0);
      prisma.thread.count.mockResolvedValue(0);
      prisma.reel.count.mockResolvedValue(0);

      const result = await controller.metrics('admin-user-id');
      expect(result.counts.users).toBe(0);
      expect(result.counts.posts).toBe(0);
    });
  });

  describe('GET /health/live', () => {
    it('should always return alive status', () => {
      const result = controller.live();
      expect(result.status).toBe('alive');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
