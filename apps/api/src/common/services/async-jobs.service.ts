import { Injectable, Logger } from '@nestjs/common';

/**
 * AsyncJobService — lightweight async job runner with retry and logging.
 *
 * Replaces fire-and-forget `.catch(() => {})` patterns with proper:
 * - Error logging (not swallowed)
 * - Retry with exponential backoff
 * - Job counting for monitoring
 *
 * To upgrade to BullMQ: replace enqueue() internals with queue.add(),
 * move job handlers to @Processor() classes.
 */
@Injectable()
export class AsyncJobService {
  private readonly logger = new Logger('AsyncJobs');
  private jobCounts = { enqueued: 0, completed: 0, failed: 0, retried: 0 };

  /**
   * Enqueue an async job with retry.
   * The job runs in-process but doesn't block the caller.
   */
  enqueue(
    jobName: string,
    fn: () => Promise<unknown>,
    options: { maxRetries?: number; retryDelayMs?: number } = {},
  ): void {
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
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        this.logger.warn(`Job "${jobName}" failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(jobName, fn, maxRetries, baseDelay, attempt + 1);
      }
      throw err;
    }
  }

  /** Get job statistics for monitoring/health checks */
  getStats() {
    return { ...this.jobCounts };
  }
}
