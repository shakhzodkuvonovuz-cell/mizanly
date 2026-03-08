import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../config/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: any;

  beforeEach(async () => {
    const mockPrismaService = {
      $queryRaw: jest.fn(),
      user: { count: jest.fn() },
      post: { count: jest.fn() },
      thread: { count: jest.fn() },
      reel: { count: jest.fn() },
    };

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get(HealthController);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /health', () => {
    it('should return 200 with status "healthy" when database is up', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await controller.check();

      expect(result).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        database: 'up',
        version: expect.any(String),
      });
      expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should return status "degraded" when database query fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('DB connection failed'));

      const result = await controller.check();

      expect(result).toEqual({
        status: 'degraded',
        timestamp: expect.any(String),
        database: 'down',
        version: expect.any(String),
      });
    });
  });

  describe('GET /health/metrics', () => {
    it('should return entity counts and system metrics', async () => {
      prisma.user.count.mockResolvedValue(100);
      prisma.post.count.mockResolvedValue(500);
      prisma.thread.count.mockResolvedValue(200);
      prisma.reel.count.mockResolvedValue(150);

      const result = await controller.metrics();

      expect(result).toEqual({
        timestamp: expect.any(String),
        counts: {
          users: 100,
          posts: 500,
          threads: 200,
          reels: 150,
        },
        uptime: expect.any(Number),
        memory: expect.any(Object),
      });
      expect(prisma.user.count).toHaveBeenCalled();
      expect(prisma.post.count).toHaveBeenCalled();
      expect(prisma.thread.count).toHaveBeenCalled();
      expect(prisma.reel.count).toHaveBeenCalledWith({ where: { status: 'READY' } });
    });
  });
});