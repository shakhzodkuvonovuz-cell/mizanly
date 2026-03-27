import { Test } from '@nestjs/testing';
import { CircuitBreakerService } from './circuit-breaker.service';
import * as Sentry from '@sentry/node';

jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
}));

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    service = module.get(CircuitBreakerService);
  });

  afterEach(() => {
    // Clean up breakers to avoid timer leaks
    service.onModuleDestroy();
  });

  describe('getBreaker', () => {
    it('should create a breaker with the given name', () => {
      const breaker = service.getBreaker('redis');
      expect(breaker).toBeDefined();
      expect(breaker.name).toBe('redis');
    });

    it('should return the same breaker on subsequent calls with the same name', () => {
      const first = service.getBreaker('redis');
      const second = service.getBreaker('redis');
      expect(first).toBe(second);
    });

    it('should create separate breakers for different names', () => {
      const redis = service.getBreaker('redis');
      const stripe = service.getBreaker('stripe');
      expect(redis).not.toBe(stripe);
      expect(redis.name).toBe('redis');
      expect(stripe.name).toBe('stripe');
    });

    it('should use default configs for known service names', () => {
      const breaker = service.getBreaker('redis');
      // Redis default: volumeThreshold = 5
      expect(breaker.volumeThreshold).toBe(5);
    });

    it('should allow custom options to override defaults', () => {
      const breaker = service.getBreaker('custom-service', {
        timeout: 1000,
        errorThresholdPercentage: 30,
        resetTimeout: 5000,
        volumeThreshold: 2,
      });
      expect(breaker.name).toBe('custom-service');
      expect(breaker.volumeThreshold).toBe(2);
    });
  });

  describe('exec', () => {
    it('should execute function successfully when circuit is closed', async () => {
      const result = await service.exec('redis', async () => 'success');
      expect(result).toBe('success');
    });

    it('should return the resolved value from the function', async () => {
      const result = await service.exec('redis', async () => ({ data: [1, 2, 3] }));
      expect(result).toEqual({ data: [1, 2, 3] });
    });

    it('should propagate errors from the function when circuit is closed', async () => {
      await expect(
        service.exec('redis', async () => {
          throw new Error('connection refused');
        }),
      ).rejects.toThrow('connection refused');
    });

    it('should open circuit after threshold failures', async () => {
      // Use a breaker with low thresholds for testing
      service.getBreaker('test-open', {
        timeout: false, // disable timeout
        errorThresholdPercentage: 50,
        resetTimeout: 60000, // long reset to keep it open during test
        volumeThreshold: 2,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 1,
      });

      // Generate enough failures to trip the breaker
      const failingFn = async () => {
        throw new Error('service down');
      };

      // Fire enough to exceed volumeThreshold and error threshold
      for (let i = 0; i < 3; i++) {
        await service.exec('test-open', failingFn).catch(() => {});
      }

      // Now the circuit should be open — should fail fast without executing fn
      const spyFn = jest.fn().mockResolvedValue('should not run');
      await expect(service.exec('test-open', spyFn)).rejects.toThrow();
      expect(spyFn).not.toHaveBeenCalled();
    });

    it('should fail-fast when circuit is open (not execute fn)', async () => {
      service.getBreaker('test-failfast', {
        timeout: false,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 2,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 1,
      });

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await service.exec('test-failfast', async () => {
          throw new Error('fail');
        }).catch(() => {});
      }

      // Verify fail-fast behavior
      let executionCount = 0;
      try {
        await service.exec('test-failfast', async () => {
          executionCount++;
          return 'ok';
        });
      } catch {
        // expected
      }
      expect(executionCount).toBe(0);
    });

    it('should use fallback when provided and circuit is open', async () => {
      service.getBreaker('test-fallback', {
        timeout: false,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 2,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 1,
      });

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await service.exec('test-fallback', async () => {
          throw new Error('fail');
        }, () => 'fallback-value' as never).catch(() => {});
      }

      // Fallback should be returned when circuit is open
      const result = await service.exec(
        'test-fallback',
        async () => 'should not run',
        () => 'fallback-result',
      );
      expect(result).toBe('fallback-result');
    });

    it('should use fallback when function fails and circuit is closed', async () => {
      const result = await service.exec(
        'test-fn-fallback',
        async () => {
          throw new Error('boom');
        },
        () => 'recovered',
      );
      expect(result).toBe('recovered');
    });

    it('should auto-create breaker if exec is called before getBreaker', async () => {
      const result = await service.exec('auto-created', async () => 42);
      expect(result).toBe(42);

      // Verify the breaker was created
      const status = service.getStatus();
      expect(status['auto-created']).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return empty object when no breakers exist', () => {
      const status = service.getStatus();
      expect(status).toEqual({});
    });

    it('should report status for all registered breakers', async () => {
      service.getBreaker('redis');
      service.getBreaker('stripe');
      service.getBreaker('meilisearch');

      const status = service.getStatus();

      expect(Object.keys(status)).toHaveLength(3);
      expect(status['redis']).toBeDefined();
      expect(status['stripe']).toBeDefined();
      expect(status['meilisearch']).toBeDefined();
    });

    it('should report "closed" state for healthy breakers', () => {
      service.getBreaker('redis');
      const status = service.getStatus();
      expect(status['redis'].state).toBe('closed');
    });

    it('should report "open" state for tripped breakers', async () => {
      service.getBreaker('test-status-open', {
        timeout: false,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 2,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 1,
      });

      for (let i = 0; i < 3; i++) {
        await service.exec('test-status-open', async () => {
          throw new Error('fail');
        }).catch(() => {});
      }

      const status = service.getStatus();
      expect(status['test-status-open'].state).toBe('open');
    });

    it('should include stats fields in the status', () => {
      service.getBreaker('redis');
      const status = service.getStatus();
      const redisStatus = status['redis'];

      expect(redisStatus.stats).toBeDefined();
      expect(typeof redisStatus.stats.fires).toBe('number');
      expect(typeof redisStatus.stats.successes).toBe('number');
      expect(typeof redisStatus.stats.failures).toBe('number');
      expect(typeof redisStatus.stats.rejects).toBe('number');
      expect(typeof redisStatus.stats.timeouts).toBe('number');
      expect(typeof redisStatus.stats.fallbacks).toBe('number');
      expect(typeof redisStatus.stats.latencyMean).toBe('number');
    });

    it('should track success count after successful executions', async () => {
      service.getBreaker('test-stats');

      await service.exec('test-stats', async () => 'ok');
      await service.exec('test-stats', async () => 'ok');

      const status = service.getStatus();
      expect(status['test-stats'].stats.fires).toBe(2);
      expect(status['test-stats'].stats.successes).toBe(2);
    });
  });

  describe('Sentry integration', () => {
    it('should send Sentry warning when circuit opens', async () => {
      service.getBreaker('test-sentry', {
        timeout: false,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 2,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 1,
      });

      for (let i = 0; i < 3; i++) {
        await service.exec('test-sentry', async () => {
          throw new Error('fail');
        }).catch(() => {});
      }

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Circuit breaker OPENED for test-sentry',
        'warning',
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should shut down all breakers and clear the map', () => {
      const redis = service.getBreaker('redis');
      const stripe = service.getBreaker('stripe');

      const shutdownSpyRedis = jest.spyOn(redis, 'shutdown');
      const shutdownSpyStripe = jest.spyOn(stripe, 'shutdown');

      service.onModuleDestroy();

      expect(shutdownSpyRedis).toHaveBeenCalled();
      expect(shutdownSpyStripe).toHaveBeenCalled();

      // After destroy, status should be empty
      const status = service.getStatus();
      expect(Object.keys(status)).toHaveLength(0);
    });

    it('should handle errors during shutdown gracefully', () => {
      const breaker = service.getBreaker('error-on-shutdown');
      jest.spyOn(breaker, 'shutdown').mockImplementation(() => {
        throw new Error('shutdown error');
      });

      // Should not throw
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  describe('half-open and recovery', () => {
    it('should transition to half-open after resetTimeout', async () => {
      service.getBreaker('test-halfopen', {
        timeout: false,
        errorThresholdPercentage: 50,
        resetTimeout: 100, // 100ms for fast test
        volumeThreshold: 2,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 1,
      });

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await service.exec('test-halfopen', async () => {
          throw new Error('fail');
        }).catch(() => {});
      }

      // Should be open
      let status = service.getStatus();
      expect(status['test-halfopen'].state).toBe('open');

      // Wait for resetTimeout
      await new Promise(resolve => setTimeout(resolve, 200));

      // Next call should go through (half-open allows one probe)
      const result = await service.exec('test-halfopen', async () => 'recovered');
      expect(result).toBe('recovered');

      // After successful probe, should be closed
      status = service.getStatus();
      expect(status['test-halfopen'].state).toBe('closed');
    });
  });
});
