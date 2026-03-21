import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QueueService } from './queue.service';
import { NotificationProcessor } from './processors/notification.processor';
import { MediaProcessor } from './processors/media.processor';
import { WebhookProcessor } from './processors/webhook.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { AiTasksProcessor } from './processors/ai-tasks.processor';
import { SearchIndexingProcessor } from './processors/search-indexing.processor';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { GamificationModule } from '../../modules/gamification/gamification.module';
import { AiModule } from '../../modules/ai/ai.module';
import { SearchModule } from '../../modules/search/search.module';

/**
 * QueueModule — global BullMQ queue infrastructure.
 *
 * Creates 6 named queues backed by Redis:
 * - notifications: push notification delivery
 * - media-processing: image resize, BlurHash generation
 * - analytics: engagement tracking, gamification XP/streaks
 * - webhooks: webhook delivery with HMAC-SHA256 signing
 * - search-indexing: Meilisearch index updates
 * - ai-tasks: content moderation, caption generation
 *
 * Each queue has a dedicated Worker that processes jobs with
 * appropriate concurrency limits and retry strategies.
 */

const QUEUE_DEFINITIONS = [
  { name: 'notifications', token: 'QUEUE_NOTIFICATIONS' },
  { name: 'media-processing', token: 'QUEUE_MEDIA_PROCESSING' },
  { name: 'analytics', token: 'QUEUE_ANALYTICS' },
  { name: 'webhooks', token: 'QUEUE_WEBHOOKS' },
  { name: 'search-indexing', token: 'QUEUE_SEARCH_INDEXING' },
  { name: 'ai-tasks', token: 'QUEUE_AI_TASKS' },
] as const;

const queueProviders = QUEUE_DEFINITIONS.map(({ name, token }) => ({
  provide: token,
  useFactory: (config: ConfigService) => {
    const redisUrl = config.get<string>('REDIS_URL');
    if (!redisUrl) {
      // Return a no-op queue stub when Redis is unavailable (dev without Redis)
      const logger = new (require('@nestjs/common').Logger)(`Queue:${name}`);
      logger.warn(`Queue '${name}' running in no-op mode — REDIS_URL not set. Jobs will be silently dropped.`);
      return {
        add: async (_jobName: string, data: unknown): Promise<{ id: string }> => {
          logger.debug(`Job dropped (no-op): ${_jobName}`);
          return { id: `noop_${Date.now()}` };
        },
        close: async (): Promise<void> => {},
        getWaitingCount: async (): Promise<number> => 0,
        getActiveCount: async (): Promise<number> => 0,
        getCompletedCount: async (): Promise<number> => 0,
        getFailedCount: async (): Promise<number> => 0,
        getDelayedCount: async (): Promise<number> => 0,
      };
    }

    return new Queue(name, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        removeOnComplete: { count: 1000, age: 86400 }, // keep 1000 or 24h
        removeOnFail: { count: 5000, age: 604800 },    // keep 5000 or 7d
      },
    });
  },
  inject: [ConfigService],
}));

@Global()
@Module({
  imports: [
    NotificationsModule,
    GamificationModule,
    AiModule,
    SearchModule,
  ],
  providers: [
    ...queueProviders,
    QueueService,
    NotificationProcessor,
    MediaProcessor,
    WebhookProcessor,
    AnalyticsProcessor,
    AiTasksProcessor,
    SearchIndexingProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}
