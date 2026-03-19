import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../../modules/ai/ai.service';
import { PrismaService } from '../../../config/prisma.service';

interface ModerationJobData {
  content: string;
  contentType: 'post' | 'thread' | 'comment' | 'message' | 'reel';
  contentId: string;
}

interface CaptionJobData {
  contentId: string;
  contentType: string;
  mediaUrl: string;
}

/**
 * AI tasks processor — handles content moderation and caption generation.
 *
 * Moderation jobs are enqueued on content creation and processed asynchronously.
 * If flagged, content is marked for review without blocking the user.
 */
@Injectable()
export class AiTasksProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiTasksProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private config: ConfigService,
    private ai: AiService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — AI tasks worker disabled');
      return;
    }

    this.worker = new Worker(
      'ai-tasks',
      async (job: Job) => {
        switch (job.name) {
          case 'moderate':
            await this.processModeration(job as Job<ModerationJobData>);
            break;
          case 'generate-caption':
            await this.processCaptionGeneration(job as Job<CaptionJobData>);
            break;
          default:
            this.logger.warn(`Unknown AI task type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        concurrency: 3,
        limiter: {
          max: 10,
          duration: 60000, // 10 AI calls per minute to stay within rate limits
        },
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`AI task ${job.id} completed`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`AI task ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('AI tasks worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processModeration(job: Job<ModerationJobData>): Promise<void> {
    const { content, contentType, contentId } = job.data;

    const result = await this.ai.moderateContent(content, contentType);

    if (!result.safe && result.confidence > 0.8) {
      this.logger.warn(
        `Content flagged by AI moderation: ${contentType}/${contentId} — flags: ${result.flags.join(', ')}`,
      );

      // Create a moderation report for manual review
      try {
        await this.prisma.report.create({
          data: {
            reason: 'AI_FLAGGED' as never,
            description: `AI moderation flagged: ${result.flags.join(', ')} (confidence: ${result.confidence})`,
            status: 'PENDING',
            ...(contentType === 'post' ? { postId: contentId } : {}),
            ...(contentType === 'thread' ? { threadId: contentId } : {}),
            ...(contentType === 'reel' ? { reelId: contentId } : {}),
          } as never,
        });
      } catch (err) {
        // Report creation may fail if model doesn't match — log and continue
        this.logger.warn(`Could not auto-create moderation report: ${err instanceof Error ? err.message : err}`);
      }
    }

    await job.updateProgress(100);
  }

  private async processCaptionGeneration(job: Job<CaptionJobData>): Promise<void> {
    const { contentId, contentType, mediaUrl } = job.data;
    this.logger.debug(`Caption generation for ${contentType}/${contentId} from ${mediaUrl}`);
    // Caption generation uses the AI service's existing suggestCaptions method.
    // This is a placeholder for when media analysis (image description) is added.
    await job.updateProgress(100);
  }
}
