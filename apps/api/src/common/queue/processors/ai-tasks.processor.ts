import * as Sentry from "@sentry/node";
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../../modules/ai/ai.service';
import { PrismaService } from '../../../config/prisma.service';
import { ReportReason } from '@prisma/client';
import { QueueService } from '../queue.service';
import { attachCorrelationId } from '../with-correlation';

interface ModerationJobData {
  content: string;
  contentType: 'post' | 'thread' | 'comment' | 'message' | 'reel' | 'video';
  contentId: string;
}

/**
 * AI tasks processor — handles content moderation.
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
    @Inject(forwardRef(() => QueueService)) private queueService: QueueService,
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
        attachCorrelationId(job, this.logger);
        switch (job.name) {
          case 'moderate':
            await this.processModeration(job as Job<ModerationJobData>);
            break;
          default:
            throw new Error(`Unknown AI task job type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        prefix: 'mizanly',
        concurrency: 3,
        lockDuration: 120000,
        maxStalledCount: 3,
        limiter: {
          max: 10,
          duration: 60000, // 10 AI calls per minute to stay within rate limits
        },
        settings: {
          stalledInterval: 120000,
        },
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`AI task ${job.id} completed`);
      const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
      if (duration > 5000) this.logger.warn(`Job ${job.id} (${job.name}) took ${duration}ms`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const maxAttempts = job?.opts?.attempts ?? 2;
      if (job && job.attemptsMade >= maxAttempts) {
        Sentry.captureException(err, {
          tags: { queue: 'ai-tasks', jobName: job.name },
          extra: { jobId: job.id, attemptsMade: job.attemptsMade, data: job.data },
        });
        this.queueService.moveToDlq(job, err, 'ai-tasks').catch((e) => this.logger.error('DLQ routing failed for ai-tasks', e?.message));
      }
      this.logger.error(`AI task ${job?.id} failed (attempt ${job?.attemptsMade ?? '?'}/${maxAttempts}): ${err.message}`);
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error(`AI tasks worker error: ${err.message}`);
      Sentry.captureException(err, { tags: { queue: 'ai-tasks' } });
    });

    this.worker.on('stalled', (jobId: string) => {
      this.logger.warn(`AI task ${jobId} stalled — being re-executed`);
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
          reportedUserId = post?.userId ?? undefined;
        } else if (contentType === 'thread') {
          const thread = await this.prisma.thread.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = thread?.userId ?? undefined;
        } else if (contentType === 'reel') {
          const reel = await this.prisma.reel.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = reel?.userId ?? undefined;
        } else if (contentType === 'comment') {
          const comment = await this.prisma.comment.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = comment?.userId ?? undefined;
        // X08-#24 FIX: Add video content type to AI moderation pipeline
        } else if (contentType === 'video') {
          const video = await this.prisma.video.findUnique({ where: { id: contentId }, select: { userId: true } });
          reportedUserId = video?.userId ?? undefined;
        }

        await this.prisma.report.create({
          data: {
            reporterId: null,
            reason: this.mapFlagsToReason(result.flags),
            description: `AI auto-flagged (${contentType}): ${result.flags.join(', ')} (confidence: ${result.confidence})`,
            ...(contentType === 'post' ? { reportedPostId: contentId } : {}),
            ...(contentType === 'comment' ? { reportedCommentId: contentId } : {}),
            ...(contentType === 'video' ? { reportedVideoId: contentId } : {}),
            ...(reportedUserId ? { reportedUserId } : {}),
          },
        });
      } catch (err) {
        this.logger.error(`Failed to create AI moderation report for ${contentType}/${contentId}: ${err instanceof Error ? err.message : err}`);
      }
    }

    await job.updateProgress(100);
  }

  /**
   * X08-#15: Map AI moderation flags to the closest ReportReason enum value.
   * Falls back to OTHER for unrecognized flags.
   */
  private mapFlagsToReason(flags: string[]): ReportReason {
    const flagMap: Record<string, ReportReason> = {
      hate_speech: 'HATE_SPEECH',
      hate: 'HATE_SPEECH',
      harassment: 'HARASSMENT',
      bullying: 'HARASSMENT',
      violence: 'VIOLENCE',
      gore: 'VIOLENCE',
      spam: 'SPAM',
      misinformation: 'MISINFORMATION',
      nudity: 'NUDITY',
      sexual: 'NUDITY',
      nsfw: 'NUDITY',
      self_harm: 'SELF_HARM',
      terrorism: 'TERRORISM',
      extremism: 'TERRORISM',
      doxxing: 'DOXXING',
      copyright: 'COPYRIGHT',
      impersonation: 'IMPERSONATION',
    };
    for (const flag of flags) {
      const normalized = flag.toLowerCase().trim();
      if (flagMap[normalized]) return flagMap[normalized];
    }
    return 'OTHER';
  }
}
