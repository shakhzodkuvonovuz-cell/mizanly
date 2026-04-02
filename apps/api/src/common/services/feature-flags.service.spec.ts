import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagsService } from './feature-flags.service';
import { PrismaService } from '../../config/prisma.service';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let redis: any;
  let prisma: any;

  beforeEach(async () => {
    redis = {
      hgetall: jest.fn().mockResolvedValue({}),
      hset: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      featureFlag: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: 'REDIS', useValue: redis },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FeatureFlagsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── isEnabled ──

  describe('isEnabled', () => {
    it('should return true when flag value is "true"', async () => {
      redis.hgetall.mockResolvedValue({ dark_mode: 'true' });
      expect(await service.isEnabled('dark_mode')).toBe(true);
    });

    it('should return false when flag value is "false"', async () => {
      redis.hgetall.mockResolvedValue({ dark_mode: 'false' });
      expect(await service.isEnabled('dark_mode')).toBe(false);
    });

    it('should return false when flag does not exist', async () => {
      redis.hgetall.mockResolvedValue({});
      expect(await service.isEnabled('nonexistent')).toBe(false);
    });

    it('should return true when flag is percentage > 0', async () => {
      redis.hgetall.mockResolvedValue({ rollout: '50' });
      expect(await service.isEnabled('rollout')).toBe(true);
    });

    it('should return false when flag is percentage 0', async () => {
      redis.hgetall.mockResolvedValue({ disabled: '0' });
      expect(await service.isEnabled('disabled')).toBe(false);
    });

    it('should return false when flag value is non-numeric non-boolean string', async () => {
      redis.hgetall.mockResolvedValue({ broken: 'abc' });
      expect(await service.isEnabled('broken')).toBe(false);
    });
  });

  // ── isEnabledForUser ──

  describe('isEnabledForUser', () => {
    it('should return true when flag is "true" regardless of userId', async () => {
      redis.hgetall.mockResolvedValue({ feature: 'true' });
      expect(await service.isEnabledForUser('feature', 'user-1')).toBe(true);
    });

    it('should return false when flag is "false"', async () => {
      redis.hgetall.mockResolvedValue({ feature: 'false' });
      expect(await service.isEnabledForUser('feature', 'user-1')).toBe(false);
    });

    it('should return false when flag does not exist', async () => {
      redis.hgetall.mockResolvedValue({});
      expect(await service.isEnabledForUser('nonexistent', 'user-1')).toBe(false);
    });

    it('should return deterministic result for same userId + flagName', async () => {
      redis.hgetall.mockResolvedValue({ rollout: '50' });
      const result1 = await service.isEnabledForUser('rollout', 'user-abc');
      // Invalidate cache so we re-fetch
      (service as any).localCache = null;
      redis.hgetall.mockResolvedValue({ rollout: '50' });
      const result2 = await service.isEnabledForUser('rollout', 'user-abc');
      expect(result1).toBe(result2); // Deterministic hash
    });

    it('should return true for 100% rollout', async () => {
      redis.hgetall.mockResolvedValue({ full_rollout: '100' });
      // hash % 100 is always 0-99, which is < 100
      expect(await service.isEnabledForUser('full_rollout', 'any-user')).toBe(true);
    });

    it('should return false for 0% rollout', async () => {
      redis.hgetall.mockResolvedValue({ zero: '0' });
      expect(await service.isEnabledForUser('zero', 'any-user')).toBe(false);
    });

    it('should return false for non-numeric value', async () => {
      redis.hgetall.mockResolvedValue({ bad: 'abc' });
      expect(await service.isEnabledForUser('bad', 'user-1')).toBe(false);
    });
  });

  // ── setFlag ──

  describe('setFlag', () => {
    it('should dual-write to Redis and DB', async () => {
      await service.setFlag('dark_mode', 'true');

      expect(redis.hset).toHaveBeenCalledWith('feature_flags', 'dark_mode', 'true');
      expect(redis.expire).toHaveBeenCalledWith('feature_flags', 90 * 24 * 3600);
      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith({
        where: { name: 'dark_mode' },
        create: { name: 'dark_mode', value: 'true' },
        update: { value: 'true' },
      });
    });

    it('should invalidate local cache after set', async () => {
      // Prime cache
      redis.hgetall.mockResolvedValue({ x: '1' });
      await service.isEnabled('x');
      expect((service as any).localCache).not.toBeNull();

      await service.setFlag('x', '2');
      expect((service as any).localCache).toBeNull();
    });

    it('should log and continue when DB write fails', async () => {
      prisma.featureFlag.upsert.mockRejectedValue(new Error('DB down'));
      // Should not throw — logs error, Redis still written
      await expect(service.setFlag('flag', 'true')).resolves.not.toThrow();
      expect(redis.hset).toHaveBeenCalled();
    });
  });

  // ── deleteFlag ──

  describe('deleteFlag', () => {
    it('should delete from both Redis and DB', async () => {
      await service.deleteFlag('old_flag');

      expect(redis.hdel).toHaveBeenCalledWith('feature_flags', 'old_flag');
      expect(prisma.featureFlag.deleteMany).toHaveBeenCalledWith({ where: { name: 'old_flag' } });
    });

    it('should invalidate local cache after delete', async () => {
      redis.hgetall.mockResolvedValue({ x: '1' });
      await service.isEnabled('x');
      expect((service as any).localCache).not.toBeNull();

      await service.deleteFlag('x');
      expect((service as any).localCache).toBeNull();
    });

    it('should log and continue when DB delete fails', async () => {
      prisma.featureFlag.deleteMany.mockRejectedValue(new Error('DB down'));
      await expect(service.deleteFlag('flag')).resolves.not.toThrow();
      expect(redis.hdel).toHaveBeenCalled();
    });
  });

  // ── getAllFlags ──

  describe('getAllFlags', () => {
    it('should return flags from Redis when available', async () => {
      redis.hgetall.mockResolvedValue({ a: '1', b: 'true' });
      const result = await service.getAllFlags();
      expect(result).toEqual({ a: '1', b: 'true' });
    });

    it('should fall back to DB when Redis returns empty', async () => {
      redis.hgetall.mockResolvedValue({});
      prisma.featureFlag.findMany.mockResolvedValue([
        { name: 'db_flag', value: 'true' },
        { name: 'other', value: '50' },
      ]);

      const result = await service.getAllFlags();
      expect(result).toEqual({ db_flag: 'true', other: '50' });
    });

    it('should fall back to DB when Redis throws', async () => {
      redis.hgetall.mockRejectedValue(new Error('Redis down'));
      prisma.featureFlag.findMany.mockResolvedValue([{ name: 'f', value: 'v' }]);

      const result = await service.getAllFlags();
      expect(result).toEqual({ f: 'v' });
    });

    it('should return empty object when both Redis and DB are down', async () => {
      redis.hgetall.mockRejectedValue(new Error('Redis down'));
      prisma.featureFlag.findMany.mockRejectedValue(new Error('DB down'));

      const result = await service.getAllFlags();
      expect(result).toEqual({});
    });
  });

  // ── getFlagValue (private, tested via isEnabled) — 3-tier fallback ──

  describe('3-tier fallback (local cache → Redis → DB)', () => {
    it('should use local cache within TTL window', async () => {
      redis.hgetall.mockResolvedValue({ cached_flag: 'true' });
      await service.isEnabled('cached_flag'); // Primes cache

      redis.hgetall.mockClear();
      const result = await service.isEnabled('cached_flag');
      expect(result).toBe(true);
      expect(redis.hgetall).not.toHaveBeenCalled(); // Served from cache
    });

    it('should re-fetch from Redis when cache expires', async () => {
      redis.hgetall.mockResolvedValue({ flag: 'true' });
      await service.isEnabled('flag');

      // Simulate cache expiry
      (service as any).lastCacheTime = Date.now() - 31_000;

      redis.hgetall.mockResolvedValue({ flag: 'false' });
      const result = await service.isEnabled('flag');
      expect(result).toBe(false);
      expect(redis.hgetall).toHaveBeenCalledTimes(2);
    });

    it('should fall back to stale local cache when Redis fails', async () => {
      // Prime cache
      redis.hgetall.mockResolvedValue({ flag: 'true' });
      await service.isEnabled('flag');

      // Simulate cache expiry + Redis failure
      (service as any).lastCacheTime = Date.now() - 31_000;
      redis.hgetall.mockRejectedValue(new Error('Redis down'));

      const result = await service.isEnabled('flag');
      expect(result).toBe(true); // Stale cache
    });

    it('should fall back to DB when Redis fails and no cache exists', async () => {
      redis.hgetall.mockRejectedValue(new Error('Redis down'));
      prisma.featureFlag.findMany.mockResolvedValue([
        { name: 'db_flag', value: 'true' },
      ]);

      const result = await service.isEnabled('db_flag');
      expect(result).toBe(true);
      expect(prisma.featureFlag.findMany).toHaveBeenCalled();
    });

    it('should return false when both Redis and DB are down and no cache', async () => {
      redis.hgetall.mockRejectedValue(new Error('Redis down'));
      prisma.featureFlag.findMany.mockRejectedValue(new Error('DB down'));

      const result = await service.isEnabled('anything');
      expect(result).toBe(false);
    });
  });
});
