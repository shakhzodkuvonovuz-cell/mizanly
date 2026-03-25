import { Injectable, Logger, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { MeilisearchService } from '../../../modules/search/meilisearch.service';
import { QueueService } from '../queue.service';

interface SearchIndexJobData {
  action: 'index' | 'update' | 'delete';
  indexName: string;
  documentId: string;
  document?: Record<string, unknown>;
}

/**
 * Search indexing processor — handles Meilisearch document operations.
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
    @Inject(forwardRef(() => QueueService)) private queueService: QueueService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — search indexing worker disabled');
      return;
    }

    this.worker = new Worker(
      'search-indexing',
      async (job: Job<SearchIndexJobData>) => {
        await this.processSearchIndex(job);
      },
      {
        connection: { url: redisUrl },
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Search index job ${job.id} completed`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Search index job ${job?.id} failed: ${err.message}`);
      this.queueService.moveToDlq(job, err, 'search-indexing').catch(() => {});
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
