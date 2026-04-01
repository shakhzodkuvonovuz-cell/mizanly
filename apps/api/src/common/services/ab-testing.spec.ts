import { Test } from '@nestjs/testing';
import { ABTestingService, ExperimentConfig } from './ab-testing.service';
import { PrismaService } from '../../config/prisma.service';

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  mget: jest.fn().mockResolvedValue([]),
  incr: jest.fn().mockResolvedValue(1),
  eval: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  scan: jest.fn().mockResolvedValue(['0', []]),
};

const mockPrisma = {
  experiment: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
};

describe('ABTestingService', () => {
  let service: ABTestingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ABTestingService,
        { provide: 'REDIS', useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(ABTestingService);
  });

  const testExperiment: ExperimentConfig = {
    id: 'feed_ranking_v2',
    name: 'Feed Ranking V2',
    variants: [
      { name: 'control', weight: 50 },
      { name: 'treatment', weight: 50 },
    ],
    enabled: true,
  };

  describe('createExperiment', () => {
    it('should store experiment in Redis', async () => {
      const result = await service.createExperiment(testExperiment);
      expect(result).toEqual(testExperiment);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'ab:experiment:feed_ranking_v2',
        JSON.stringify(testExperiment),
        'EX',
        90 * 24 * 3600,
      );
    });
  });

  describe('getExperiment', () => {
    it('should return experiment from Redis', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(testExperiment));
      const result = await service.getExperiment('feed_ranking_v2');
      expect(result).toEqual(testExperiment);
    });

    it('should return null for missing experiment', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.getExperiment('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getExperiments', () => {
    it('should return all experiments', async () => {
      mockRedis.scan.mockResolvedValue(['0', ['ab:experiment:exp1']]);
      mockRedis.mget.mockResolvedValue([JSON.stringify(testExperiment)]);
      const result = await service.getExperiments();
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no experiments', async () => {
      mockRedis.scan.mockResolvedValue(['0', []]);
      const result = await service.getExperiments();
      expect(result).toHaveLength(0);
    });
  });

  describe('getVariant', () => {
    it('should return control for disabled experiment', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ ...testExperiment, enabled: false }));
      const result = await service.getVariant('feed_ranking_v2', 'user-1');
      expect(result).toBe('control');
    });

    it('should return control for missing experiment', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.getVariant('nonexistent', 'user-1');
      expect(result).toBe('control');
    });

    it('should return existing assignment', async () => {
      // First call: get experiment, second call: get existing assignment
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(testExperiment))
        .mockResolvedValueOnce('treatment');
      const result = await service.getVariant('feed_ranking_v2', 'user-1');
      expect(result).toBe('treatment');
    });

    it('should assign deterministically and store', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(testExperiment))
        .mockResolvedValueOnce(null); // no existing assignment
      const result = await service.getVariant('feed_ranking_v2', 'user-1');
      expect(['control', 'treatment']).toContain(result);
      expect(mockRedis.set).toHaveBeenCalled(); // stores assignment
    });

    it('should be consistent for same user+experiment', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(testExperiment))
        .mockResolvedValueOnce(null);
      const result1 = await service.getVariant('feed_ranking_v2', 'user-abc');

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(testExperiment))
        .mockResolvedValueOnce(null);
      const result2 = await service.getVariant('feed_ranking_v2', 'user-abc');

      expect(result1).toBe(result2); // deterministic
    });
  });

  describe('getUserAssignments', () => {
    it('should return assignments for all enabled experiments', async () => {
      mockRedis.scan.mockResolvedValue(['0', ['ab:experiment:exp1']]);
      mockRedis.mget.mockResolvedValue([JSON.stringify(testExperiment)]);
      mockRedis.get.mockResolvedValue(JSON.stringify(testExperiment));

      const result = await service.getUserAssignments('user-1');
      expect(result).toHaveProperty('feed_ranking_v2');
    });
  });

  describe('trackConversion', () => {
    it('should increment conversion counter', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(testExperiment))
        .mockResolvedValueOnce('treatment');

      await service.trackConversion('feed_ranking_v2', 'user-1', 'click_post');
      // atomicIncr uses redis.eval instead of incr+expire
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1, 'ab:conversions:feed_ranking_v2:treatment:click_post', 90 * 24 * 3600,
      );
    });
  });

  describe('getMetrics', () => {
    it('should return conversion metrics by variant', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(testExperiment))
        .mockResolvedValueOnce('5'); // conversion count

      mockRedis.scan
        .mockResolvedValueOnce(['0', ['ab:conversions:feed_ranking_v2:control:click']])
        .mockResolvedValueOnce(['0', ['ab:conversions:feed_ranking_v2:treatment:click']]);

      const result = await service.getMetrics('feed_ranking_v2');
      expect(result).toHaveProperty('control');
      expect(result).toHaveProperty('treatment');
    });

    it('should return empty for missing experiment', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.getMetrics('nonexistent');
      expect(result).toEqual({});
    });
  });

  describe('deleteExperiment', () => {
    it('should delete experiment and assignments', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['0', ['ab:assignment:exp1:u1']])
        .mockResolvedValueOnce(['0', []]);
      await service.deleteExperiment('exp1');
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });
});
