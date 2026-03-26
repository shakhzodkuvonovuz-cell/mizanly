import { Job } from 'bullmq';
import * as Sentry from '@sentry/node';

/**
 * Extract correlationId from job data and attach to Sentry scope.
 * Call at the top of every processor handler for end-to-end traceability.
 */
export function attachCorrelationId(job: Job, logger: { debug: (...args: unknown[]) => void }): string | undefined {
  const correlationId = (job.data as Record<string, unknown>)?.correlationId as string | undefined;
  if (correlationId) {
    Sentry.withScope((scope) => {
      scope.setTag('correlationId', correlationId);
    });
    logger.debug(`[${correlationId}] Processing job ${job.id} (${job.name})`);
  }
  return correlationId;
}
