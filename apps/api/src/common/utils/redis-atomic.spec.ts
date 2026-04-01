import { atomicIncr } from './redis-atomic';

describe('atomicIncr', () => {
  it('should call redis.eval with Lua script', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1) } as any;
    const result = await atomicIncr(redis, 'test:key', 60);
    expect(result).toBe(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1, 'test:key', 60,
    );
  });

  it('should return incremented count', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(5) } as any;
    const result = await atomicIncr(redis, 'test:key', 60);
    expect(result).toBe(5);
  });

  it('Lua script should contain conditional EXPIRE', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1) } as any;
    await atomicIncr(redis, 'test:key', 60);
    const luaScript = redis.eval.mock.calls[0][0];
    expect(luaScript).toContain('INCR');
    expect(luaScript).toContain('EXPIRE');
    expect(luaScript).toContain('if c == 1');
  });

  it('should pass TTL as ARGV[1]', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1) } as any;
    await atomicIncr(redis, 'rate:user:123', 120);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1, 'rate:user:123', 120,
    );
  });

  it('should pass key as KEYS[1]', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1) } as any;
    await atomicIncr(redis, 'counter:api:v1', 300);
    // Second argument is number of keys (1), third is the key itself
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1, 'counter:api:v1', 300,
    );
  });
});
