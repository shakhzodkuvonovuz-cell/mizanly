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
    if (!content || !contentType || !contentId) {
      this.logger.warn(`Invalid moderation job ${job.id}: missing required fields`);
      return;
    }

    const result = await this.ai.moderateContent(content, contentType);

    if (!result.safe && result.confidence > 0.8) {
      this.logger.warn(
        `Content flagged by AI moderation: ${contentType}/${contentId} — flags: ${result.flags.join(', ')}`,
      );

      // Create a moderation report for manual review using correct schema fields
      try {
        // Look up the content author to set as reportedUserId
        let reportedUserId: string | undefined;
        if (contentType === 'post') {
          const post = await this.prisma.post.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = post?.userId;
        } else if (contentType === 'thread') {
          const thread = await this.prisma.thread.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = thread?.userId;
        } else if (contentType === 'reel') {
          const reel = await this.prisma.reel.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = reel?.userId;
        } else if (contentType === 'comment') {
          const comment = await this.prisma.comment.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = comment?.userId;
        }

        await this.prisma.report.create({
          data: {
            reporterId: 'system',
            reason: 'HATE_SPEECH',
            description: `AI auto-flagged (${contentType}): ${result.flags.join(', ')} (confidence: ${result.confidence})`,
            ...(contentType === 'post' ? { reportedPostId: contentId } : {}),
            ...(contentType === 'comment' ? { reportedCommentId: contentId } : {}),
            ...(reportedUserId ? { reportedUserId } : {}),
          },
        });
      } catch (err) {
        this.logger.error(`Failed to create AI moderation report for ${contentType}/${contentId}: ${err instanceof Error ? err.message : err}`);
      }
    }

    await job.updateProgress(100);
  }

  private async processCaptionGeneration(job: Job<CaptionJobData>): Promise<void> {
    const { contentId, contentType, mediaUrl } = job.data;
    this.logger.debug(`Caption generation for ${contentType}/${contentId} from ${mediaUrl}`);
    // TODO: Implement caption generation pipeline:
    // 1. Download media from mediaUrl (validate URL first via validateMediaUrl pattern)
    // 2. For images: send to Claude Vision API via this.ai.moderateImage() style call
    //    to generate a text description, then pass to this.ai.suggestCaptions()
    // 3. For videos: extract keyframes with ffmpeg or Cloudflare Stream thumbnails,
    //    describe each frame, concatenate descriptions, then suggestCaptions()
    // 4. Write generated captions back to the content record:
    //    - Post: prisma.post.update({ data: { content: caption } })
    //    - Reel: prisma.reel.update({ data: { caption } })
    // 5. Caller: wire QueueService.addCaptionGenerationJob() into content creation
    //    flows in posts.service.ts and reels.service.ts
    await job.updateProgress(100);
  }
}
