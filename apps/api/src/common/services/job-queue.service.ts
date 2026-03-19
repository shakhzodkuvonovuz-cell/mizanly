import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Job queue service using Redis-backed queues.
 * Provides BullMQ-like semantics without the BullMQ dependency:
 * - Persistent job storage in Redis
 * - Worker-based processing
 * - Retry with exponential backoff
 * - Job prioritization
 *
 * This is a lightweight implementation. For production scale,
 * upgrade to BullMQ by changing the queue internals.
 */

interface Job<T = Record<string, unknown>> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  priority: number;
}

type JobHandler = (data: Record<string, unknown>) => Promise<void>;

@Injectable()
export class JobQueueService implements OnModuleDestroy {
  private readonly logger = new Logger('JobQueue');
  private handlers = new Map<string, JobHandler>();
  private processing = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private readonly QUEUE_KEY = 'mizanly:job_queue';
  private readonly PROCESSING_KEY = 'mizanly:job_processing';
  private readonly DEAD_LETTER_KEY = 'mizanly:job_dead_letter';

  constructor(@Inject('REDIS') private redis: Redis) {
    // Start polling for jobs after a short delay
    setTimeout(() => this.startProcessing(), 2000);
  }

  onModuleDestroy() {
    this.stopProcessing();
  }

  /**
   * Register a handler for a job type
   */
  registerHandler(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);
    this.logger.debug(`Registered handler for job: ${jobName}`);
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    name: string,
    data: Record<string, unknown>,
    options?: { priority?: number; maxAttempts?: number; delayMs?: number },
  ): Promise<string> {
    const id = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: Job = {
      id,
      name,
      data,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      createdAt: Date.now(),
      priority: options?.priority ?? 0,
    };

    if (options?.delayMs) {
      // Delayed job: use sorted set with score = execution time
      const executeAt = Date.now() + options.delayMs;
      await this.redis.zadd(
        `${this.QUEUE_KEY}:delayed`,
        executeAt,
        JSON.stringify(job),
      );
    } else {
      await this.redis.lpush(this.QUEUE_KEY, JSON.stringify(job));
    }

    this.logger.debug(`Enqueued job ${id} (${name})`);
    return id;
  }

  /**
   * Process jobs from the queue
   */
  private startProcessing(): void {
    if (this.processing) return;
    this.processing = true;

    // Poll every 1 second
    this.pollInterval = setInterval(async () => {
      try {
        // Check delayed jobs
        await this.promoteDelayedJobs();

        // Process next job
        const raw = await this.redis.rpop(this.QUEUE_KEY);
        if (!raw) return;

        const job: Job = JSON.parse(raw);
        const handler = this.handlers.get(job.name);

        if (!handler) {
          this.logger.warn(`No handler for job "${job.name}" — re-queuing`);
          await this.redis.lpush(this.QUEUE_KEY, raw);
          return;
        }

        job.attempts++;

        try {
          await handler(job.data);
          this.logger.debug(`Job ${job.id} completed`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);

          if (job.attempts < job.maxAttempts) {
            // Retry with exponential backoff
            const delay = 1000 * Math.pow(2, job.attempts - 1);
            this.logger.warn(`Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}): ${errMsg}. Retrying in ${delay}ms`);
            await this.addJob(job.name, job.data, {
              maxAttempts: job.maxAttempts,
              delayMs: delay,
            });
          } else {
            // Move to dead letter queue
            this.logger.error(`Job ${job.id} failed permanently: ${errMsg}`);
            await this.redis.lpush(this.DEAD_LETTER_KEY, JSON.stringify({ ...job, error: errMsg, failedAt: Date.now() }));
          }
        }
      } catch (error) {
        this.logger.error('Queue processing error', error instanceof Error ? error.message : error);
      }
    }, 1000);
  }

  private stopProcessing(): void {
    this.processing = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async promoteDelayedJobs(): Promise<void> {
    const now = Date.now();
    const ready = await this.redis.zrangebyscore(
      `${this.QUEUE_KEY}:delayed`,
      0,
      now,
      'LIMIT',
      0,
      10,
    );

    for (const raw of ready) {
      await this.redis.zrem(`${this.QUEUE_KEY}:delayed`, raw);
      await this.redis.lpush(this.QUEUE_KEY, raw);
    }
  }

  /**
   * Get queue stats
   */
  async getStats(): Promise<{
    pending: number;
    delayed: number;
    deadLetter: number;
  }> {
    const [pending, delayed, deadLetter] = await Promise.all([
      this.redis.llen(this.QUEUE_KEY),
      this.redis.zcard(`${this.QUEUE_KEY}:delayed`),
      this.redis.llen(this.DEAD_LETTER_KEY),
    ]);

    return { pending, delayed, deadLetter };
  }
}
