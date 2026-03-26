import { Injectable, Logger } from '@nestjs/common';

/**
 * @deprecated DEAD CODE — Nothing in the codebase calls enqueue().
 *
 * This service was intended as a lightweight in-process job runner with
 * setTimeout-based exponential backoff retry. It has two fatal flaws:
 *
 * 1. Process-local: if the Node.js process restarts during a retry delay,
 *    the job and all pending retries are permanently lost.
 * 2. Never adopted: grep confirms zero callers of enqueue() across the
 *    entire codebase. Stats are permanently all-zeros.
 *
 * USE INSTEAD: QueueService (src/common/queue/queue.service.ts)
 * — BullMQ-backed, Redis-durable, with retry, exponential backoff,
 *   dead-letter queue, correlation ID propagation, and proper stats.
 *
 * This service is kept (not removed) because:
 * - It's a @Global() module imported in AppModule
 * - HealthController injects it for getStats() on /health/metrics
 * - Removing it risks DI resolution errors if any module transitively depends on it
 *
 * If you need async job execution, add a method to QueueService and a
 * corresponding @Processor() class. Do NOT use this service.
 */
@Injectable()
export class AsyncJobService {
  private readonly logger = new Logger('AsyncJobs');
  private jobCounts = { enqueued: 0, completed: 0, failed: 0, retried: 0 };

  /**
   * @deprecated Use QueueService instead. This method runs jobs in-process
   * with setTimeout retry — jobs are lost on process restart.
   *
   * If called, it will log a deprecation warning and still execute the job
   * in-process for backward compatibility.
   */
  enqueue(
    jobName: string,
    fn: () => Promise<unknown>,
    options: { maxRetries?: number; retryDelayMs?: number } = {},
  ): void {
    this.logger.warn(
      `DEPRECATED: AsyncJobService.enqueue("${jobName}") called. ` +
      `Use QueueService for durable job execution. This job runs in-process ` +
      `and will be lost if the process restarts during retry.`,
    );

    const { maxRetries = 2, retryDelayMs = 1000 } = options;
    this.jobCounts.enqueued++;

    this.executeWithRetry(jobName, fn, maxRetries, retryDelayMs, 0).catch(
      (err) => {
        this.jobCounts.failed++;
        this.logger.error(`Job "${jobName}" failed after ${maxRetries + 1} attempts: ${err?.message || err}`);
      },
    );
  }

  private async executeWithRetry(
    jobName: string,
    fn: () => Promise<unknown>,
    maxRetries: number,
    baseDelay: number,
    attempt: number,
  ): Promise<void> {
    try {
      await fn();
      this.jobCounts.completed++;
    } catch (err) {
      if (attempt < maxRetries) {
        this.jobCounts.retried++;
        const delay = baseDelay * Math.pow(2, attempt);
        this.logger.warn(`Job "${jobName}" failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(jobName, fn, maxRetries, baseDelay, attempt + 1);
      }
      throw err;
    }
  }

  /** Get job statistics for monitoring/health checks */
  getStats() {
    return { ...this.jobCounts, deprecated: true };
  }
}
