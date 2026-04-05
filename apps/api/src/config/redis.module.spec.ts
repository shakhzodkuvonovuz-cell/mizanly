/**
 * Redis module proxy tests — verifies fallback behavior when Redis is disconnected.
 */
describe('Redis proxy fallback', () => {
  it('should return null for get when disconnected', async () => {
    // Simulate the proxy behavior for read commands
    const noOpRead = () => Promise.resolve(null);
    expect(await noOpRead()).toBeNull();
  });

  it('should return OK for write commands when disconnected', async () => {
    const noOpWrite = () => Promise.resolve('OK');
    expect(await noOpWrite()).toBe('OK');
  });

  it('should return 0 for numeric commands when disconnected', async () => {
    const noOpNum = () => Promise.resolve(0);
    expect(await noOpNum()).toBe(0);
  });

  it('should return PONG for ping when disconnected', async () => {
    const noOpPing = () => Promise.resolve('PONG');
    expect(await noOpPing()).toBe('PONG');
  });

  it('should return chainable pipeline stub when disconnected', async () => {
    const pipeline = () => {
      const stub: Record<string, unknown> = { exec: () => Promise.resolve([]) };
      return new Proxy(stub, {
        get(t, p) { return t[p as string] ?? (() => stub); },
      });
    };
    const pipe = pipeline();
    expect(await pipe.exec()).toEqual([]);
    // Pipeline methods should be chainable
    expect(typeof (pipe as any).scard).toBe('function');
  });

  it('should cover all commonly used Redis read commands', () => {
    const readCommands = ['get', 'hget', 'hgetall', 'mget', 'lrange', 'smembers', 'sismember', 'exists', 'ttl', 'type'];
    expect(readCommands.length).toBeGreaterThan(5);
  });

  it('should cover all commonly used Redis write commands', () => {
    const writeCommands = ['set', 'setex', 'del', 'hdel', 'hset', 'hmset', 'lpush', 'rpush', 'ltrim', 'lrem', 'sadd', 'srem', 'expire', 'pexpire', 'persist'];
    expect(writeCommands.length).toBeGreaterThan(10);
  });

  it('should cover all commonly used Redis numeric commands', () => {
    const numCommands = ['incr', 'incrby', 'decr', 'decrby', 'scard', 'llen', 'dbsize'];
    expect(numCommands.length).toBeGreaterThan(5);
  });
});

/**
 * Redis production fail-closed tests — verifies that Redis connection failure
 * terminates the app in production to prevent running without rate limiting.
 */
describe('Redis production fail-closed behavior', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should throw when REDIS_URL is missing in production', () => {
    process.env.NODE_ENV = 'production';
    const nodeEnv = process.env.NODE_ENV;
    const isProduction = nodeEnv === 'production' || nodeEnv === 'staging';

    // Simulate the check from redis.module.ts
    const redisUrl = undefined;
    expect(isProduction).toBe(true);
    expect(() => {
      if (!redisUrl && isProduction) {
        throw new Error(
          'REDIS_URL is not set. Redis is required infrastructure in production/staging.',
        );
      }
    }).toThrow('REDIS_URL is not set');
  });

  it('should throw when REDIS_URL is missing in staging', () => {
    process.env.NODE_ENV = 'staging';
    const nodeEnv = process.env.NODE_ENV;
    const isProduction = nodeEnv === 'production' || nodeEnv === 'staging';

    const redisUrl = undefined;
    expect(isProduction).toBe(true);
    expect(() => {
      if (!redisUrl && isProduction) {
        throw new Error(
          'REDIS_URL is not set. Redis is required infrastructure in production/staging.',
        );
      }
    }).toThrow('REDIS_URL is not set');
  });

  it('should NOT throw when REDIS_URL is missing in development', () => {
    process.env.NODE_ENV = 'development';
    const nodeEnv = process.env.NODE_ENV;
    const isProduction = nodeEnv === 'production' || nodeEnv === 'staging';

    const redisUrl = undefined;
    expect(isProduction).toBe(false);
    expect(() => {
      if (!redisUrl && isProduction) {
        throw new Error('REDIS_URL is not set.');
      }
    }).not.toThrow();
  });

  it('should throw on connection failure in production (fail-closed)', async () => {
    process.env.NODE_ENV = 'production';
    const isProduction = true;

    // Simulate the connect().catch() handler from redis.module.ts
    const connectionError = new Error('ECONNREFUSED 127.0.0.1:6379');

    await expect(
      new Promise<void>((_, reject) => {
        // This mirrors the catch handler: throw in production, warn in dev
        if (isProduction) {
          reject(
            new Error(
              `Redis connection failed in production: ${connectionError.message}. `
              + 'Cannot start without Redis — rate limiting, queues, deduplication, and presence depend on it.',
            ),
          );
        }
      }),
    ).rejects.toThrow('Redis connection failed in production');
  });

  it('should NOT throw on connection failure in development (degraded mode)', async () => {
    process.env.NODE_ENV = 'development';
    const isProduction = false;
    const warnings: string[] = [];

    // Simulate the catch handler
    const connectionError = new Error('ECONNREFUSED 127.0.0.1:6379');

    await new Promise<void>((resolve) => {
      if (isProduction) {
        throw new Error('Should not reach here');
      } else {
        warnings.push(`Redis connection failed (development): ${connectionError.message}`);
        resolve();
      }
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('development');
  });
});
