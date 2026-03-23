import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AnalyticsProcessor } from './analytics.processor';
import { GamificationService } from '../../../modules/gamification/gamification.service';
import { QueueService } from '../queue.service';

// Mock bullmq Worker so onModuleInit doesn't create a real Redis connection
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name, _processor, _opts) => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Job: jest.fn(),
}));

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;
  let gamification: any;
  let configGet: jest.Mock;

  const buildModule = async (redisUrl: string | null) => {
    configGet = jest.fn().mockReturnValue(redisUrl);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsProcessor,
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: GamificationService,
          useValue: {
            awardXP: jest.fn().mockResolvedValue(undefined),
            updateStreak: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: QueueService,
          useValue: {
            moveToDlq: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(AnalyticsProcessor);
    gamification = module.get(GamificationService);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should not create worker when REDIS_URL is not set', async () => {
    await buildModule(null);
    processor.onModuleInit();
    expect((processor as any).worker).toBeNull();
  });

  it('should create worker when REDIS_URL is set', async () => {
    await buildModule('redis://localhost:6379');
    processor.onModuleInit();
    expect((processor as any).worker).not.toBeNull();
  });

  describe('processAwardXP (via reflection)', () => {
    it('should call gamification.awardXP with userId and action', async () => {
      await buildModule(null);
      const job = { data: { userId: 'user-1', action: 'post_created' } };
      await (processor as any).processAwardXP(job);
      expect(gamification.awardXP).toHaveBeenCalledWith('user-1', 'post_created');
    });
  });

  describe('processUpdateStreak (via reflection)', () => {
    it('should call gamification.updateStreak with userId and action', async () => {
      await buildModule(null);
      const job = { data: { userId: 'user-2', action: 'daily_login' } };
      await (processor as any).processUpdateStreak(job);
      expect(gamification.updateStreak).toHaveBeenCalledWith('user-2', 'daily_login');
    });
  });

  describe('processEngagementTracking (via reflection)', () => {
    it('should not throw for engagement tracking job', async () => {
      await buildModule(null);
      const job = { data: { type: 'like', userId: 'u1', contentType: 'post', contentId: 'p1' } };
      await expect((processor as any).processEngagementTracking(job)).resolves.not.toThrow();
    });
  });

  it('should close worker on module destroy', async () => {
    await buildModule('redis://localhost:6379');
    processor.onModuleInit();
    const worker = (processor as any).worker;
    await processor.onModuleDestroy();
    expect(worker.close).toHaveBeenCalled();
  });

  it('should not throw on destroy when worker is null', async () => {
    await buildModule(null);
    processor.onModuleInit();
    await expect(processor.onModuleDestroy()).resolves.not.toThrow();
  });
});
