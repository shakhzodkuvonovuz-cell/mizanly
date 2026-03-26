import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as CircuitBreaker from 'opossum';
import * as Sentry from '@sentry/node';

/**
 * Default circuit breaker configurations for each external dependency.
 *
 * When a dependency is failing, the circuit "opens" after the error threshold
 * is exceeded within the rolling window, causing subsequent calls to fail-fast.
 * After resetTimeout, one probe request is allowed through (half-open).
 * If it succeeds the circuit closes; if it fails, the circuit re-opens.
 */
const BREAKER_CONFIGS: Record<string, CircuitBreaker.Options> = {
  redis: {
    timeout: 3000, // 3s — Redis should respond sub-ms; 3s means it's dead
    errorThresholdPercentage: 50,
    resetTimeout: 10000, // Try again after 10s
    volumeThreshold: 5, // Need 5 requests before the breaker can open
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
  },
  stripe: {
    timeout: 10000, // 10s — Stripe can be slow on complex operations
    errorThresholdPercentage: 60,
    resetTimeout: 30000, // 30s — Stripe rate-limits aggressively
    volumeThreshold: 3,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 6,
  },
  'expo-push': {
    timeout: 5000, // 5s — Expo push is usually fast
    errorThresholdPercentage: 50,
    resetTimeout: 15000, // 15s between retries
    volumeThreshold: 5,
    rollingCountTimeout: 15000,
    rollingCountBuckets: 5,
  },
  meilisearch: {
    timeout: 5000, // 5s — search should be fast
    errorThresholdPercentage: 50,
    resetTimeout: 20000, // 20s — Meilisearch may need time to recover
    volumeThreshold: 3,
    rollingCountTimeout: 20000,
    rollingCountBuckets: 5,
  },
};

export interface BreakerStatus {
  state: string;
  stats: {
    fires: number;
    successes: number;
    failures: number;
    rejects: number;
    timeouts: number;
    fallbacks: number;
    latencyMean: number;
  };
}

/**
 * CircuitBreakerService — manages opossum circuit breakers for external dependencies.
 *
 * When an external service (Redis, Stripe, Expo, Meilisearch) is failing, the circuit
 * breaker "opens" after N consecutive failures, causing subsequent calls to fail-fast
 * without actually hitting the failing service. After a timeout, the circuit "half-opens"
 * and lets one request through to test if the service is back.
 *
 * This prevents:
 * - Cascading failures (one dead service taking down all endpoints)
 * - Connection pool exhaustion (retrying dead connections)
 * - Latency amplification (waiting for timeout on every request)
 */
@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker for a named service.
   *
   * If a breaker already exists for the given name, it is returned.
   * Otherwise a new one is created with either the provided options
   * or the default config for that service name.
   *
   * The action function passed to opossum is a no-op identity;
   * actual work is done via `exec()` which fires the breaker
   * with the real function each time.
   *
   * @param name — unique identifier (e.g., 'redis', 'stripe', 'expo-push', 'meilisearch')
   * @param options — opossum options override (merged with defaults)
   */
  getBreaker(name: string, options?: CircuitBreaker.Options): CircuitBreaker {
    const existing = this.breakers.get(name);
    if (existing) return existing;

    const defaultOpts = BREAKER_CONFIGS[name] ?? {};
    const mergedOpts: CircuitBreaker.Options = {
      ...defaultOpts,
      ...options,
      name,
    };

    // The action is a passthrough; real work is passed to fire() each time
    const breaker = new CircuitBreaker(async (fn: () => Promise<unknown>) => fn(), mergedOpts);

    // Wire Sentry + logging for state transitions
    breaker.on('open', () => {
      this.logger.warn(`Circuit breaker OPENED for '${name}' — failing fast`);
      Sentry.captureMessage(`Circuit breaker OPENED for ${name}`, 'warning');
    });
    breaker.on('halfOpen', () => {
      this.logger.log(`Circuit breaker half-open for '${name}' — testing recovery`);
    });
    breaker.on('close', () => {
      this.logger.log(`Circuit breaker CLOSED for '${name}' — service recovered`);
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Execute a function through a named circuit breaker.
   *
   * If the circuit is open, throws immediately without executing fn.
   * If the circuit is closed/half-open, executes fn normally.
   * If a fallback is provided and the circuit is open or fn fails,
   * the fallback value is returned instead of throwing.
   *
   * @param name — breaker name (auto-creates if not yet initialized)
   * @param fn — the async function to protect
   * @param fallback — optional fallback function to call on failure
   */
  async exec<T>(name: string, fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    const breaker = this.getBreaker(name);

    if (fallback) {
      breaker.fallback(() => fallback());
    }

    // opossum's fire() passes arguments to the action function.
    // Our action is `(fn) => fn()`, so we pass the real function as the argument.
    return breaker.fire(fn) as Promise<T>;
  }

  /**
   * Get status of all registered breakers for the health endpoint.
   */
  getStatus(): Record<string, BreakerStatus> {
    const result: Record<string, BreakerStatus> = {};
    for (const [name, breaker] of this.breakers) {
      const state = breaker.opened
        ? 'open'
        : breaker.halfOpen
          ? 'half-open'
          : 'closed';

      const stats = breaker.stats;
      result[name] = {
        state,
        stats: {
          fires: stats.fires,
          successes: stats.successes,
          failures: stats.failures,
          rejects: stats.rejects,
          timeouts: stats.timeouts,
          fallbacks: stats.fallbacks,
          latencyMean: stats.latencyMean,
        },
      };
    }
    return result;
  }

  /**
   * Cleanup on shutdown — shut down all breakers to clear timers.
   */
  onModuleDestroy() {
    for (const [name, breaker] of this.breakers) {
      try {
        breaker.shutdown();
      } catch (err) {
        this.logger.warn(`Failed to shutdown breaker '${name}': ${err instanceof Error ? err.message : err}`);
      }
    }
    this.breakers.clear();
    this.logger.log('All circuit breakers shut down');
  }
}
