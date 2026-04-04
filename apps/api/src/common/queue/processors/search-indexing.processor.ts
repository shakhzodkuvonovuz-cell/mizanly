import * as Sentry from "@sentry/node";
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { MeilisearchService } from '../../../modules/search/meilisearch.service';
import { DlqService } from '../dlq.service';
import { attachCorrelationId } from '../with-correlation';

interface SearchIndexJobData {
  action: 'index' | 'update' | 'delete';
  indexName: string;
  documentId: string;
  document?: Record<string, unknown>;
}

/**
 * Search indexing processor -- handles Meilisearch document operations.
 *
 * Processes index/update/delete jobs enqueued by QueueService.addSearchIndexJob().
 * Falls back gracefully if Meilisearch is unavailable.
 */
@Injectable()
export class SearchIndexingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchIndexingProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private config: ConfigService,
    private meilisearch: MeilisearchService,
    private dlq: DlqService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set -- search indexing worker disabled');
      return;
    }

    this.worker = new Worker(
      'search-indexing',
      async (job: Job<SearchIndexJobData>) => {
        attachCorrelationId(job, this.logger);
        await this.processSearchIndex(job);
      },
      {
        connection: { url: redisUrl },
        prefix: 'mizanly',
        concurrency: 5,
        lockDuration: 60000,
        maxStalledCount: 3,
        
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Search index job ${job.id} completed`);
      const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
      if (duration > 5000) this.logger.warn(`Job ${job.id} (${job.name}) took ${duration}ms`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const maxAttempts = job?.opts?.attempts ?? 3;
      if (job && job.attemptsMade >= maxAttempts) {
        Sentry.captureException(err, {
          tags: { queue: 'search-indexing', jobName: job.name },
          extra: { jobId: job.id, attemptsMade: job.attemptsMade, data: job.data },
        });
        this.dlq.moveToDlq(job, err, 'search-indexing').catch((e) => this.logger.error('DLQ routing failed for search-indexing', e?.message));
      }
      this.logger.error(`Search index job ${job?.id} failed (attempt ${job?.attemptsMade ?? '?'}/${maxAttempts}): ${err.message}`);
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error(`Search indexing worker error: ${err.message}`);
      Sentry.captureException(err, { tags: { queue: 'search-indexing' } });
    });

    this.worker.on('stalled', (jobId: string) => {
      this.logger.warn(`Search index job ${jobId} stalled -- being re-executed`);
    });

    this.logger.log('Search indexing worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processSearchIndex(job: Job<SearchIndexJobData>): Promise<void> {
    const { action, indexName, documentId, document } = job.data;

    if (!indexName || !documentId) {
      this.logger.warn(`Invalid search index job: missing indexName or documentId`);
      return;
    }

    switch (action) {
      case 'index':
      case 'update':
        if (document) {
          await this.meilisearch.addDocuments(indexName, [{ id: documentId, type: indexName, ...document }]);
          this.logger.debug(`Indexed document ${documentId} in ${indexName}`);
        } else {
          // X07-#13 FIX: Warn when document is falsy instead of silently skipping
          this.logger.warn(`Search index job ${action} skipped -- document is empty for ${indexName}/${documentId}`);
        }
        break;
      case 'delete':
        await this.meilisearch.deleteDocument(indexName, documentId);
        this.logger.debug(`Deleted document ${documentId} from ${indexName}`);
        break;
      default:
        throw new Error(`Unknown search index action: '${action}'. Valid actions: index, update, delete. Fix the producer.`);
    }

    await job.updateProgress(100);
  }
}
