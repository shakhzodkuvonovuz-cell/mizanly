# Audit Agent #19: Queue/Job Processing

**Scope:** All BullMQ queue infrastructure, processor files, competing job systems, scheduling service, and integration points.

**Files Audited:**
- `apps/api/src/common/queue/queue.module.ts` (84 lines)
- `apps/api/src/common/queue/queue.service.ts` (185 lines)
- `apps/api/src/common/queue/processors/notification.processor.ts` (85 lines)
- `apps/api/src/common/queue/processors/media.processor.ts` (159 lines)
- `apps/api/src/common/queue/processors/webhook.processor.ts` (112 lines)
- `apps/api/src/common/queue/processors/analytics.processor.ts` (100 lines)
- `apps/api/src/common/queue/processors/ai-tasks.processor.ts` (122 lines)
- `apps/api/src/common/services/async-jobs.service.ts` (65 lines)
- `apps/api/src/common/services/async-jobs.module.ts` (9 lines)
- `apps/api/src/common/services/job-queue.service.ts` (185 lines)
- `apps/api/src/modules/scheduling/scheduling.service.ts` (209 lines)
- `apps/api/src/modules/scheduling/scheduling.controller.ts` (84 lines)
- `apps/api/src/common/test/mock-providers.ts` (callers/integration)
- `apps/api/src/modules/posts/posts.service.ts` (callers)
- `apps/api/src/modules/threads/threads.service.ts` (callers)
- `apps/api/src/modules/reels/reels.service.ts` (callers)
- `apps/api/src/modules/videos/videos.service.ts` (callers)
- `apps/api/src/modules/follows/follows.service.ts` (callers)
- `apps/api/src/modules/reports/reports.service.ts` (callers)
- `apps/api/src/modules/health/health.controller.ts` (callers)
- `apps/api/src/app.module.ts` (registration)

**Total Findings: 28**

---

## Critical Findings (6)

### C1. search-indexing queue has NO processor -- all jobs permanently lost
- **File:** `apps/api/src/common/queue/queue.module.ts`, lines 34, 73-81
- **Severity:** Critical
- **Category:** Data Loss / Feature Broken
- **Description:** Six queues are defined (line 34: `search-indexing`), and five have dedicated processor classes registered as providers (lines 73-80: `NotificationProcessor`, `MediaProcessor`, `WebhookProcessor`, `AnalyticsProcessor`, `AiTasksProcessor`). There is **no** `SearchIndexingProcessor`. The `search-indexing` queue has a BullMQ `Queue` instance that accepts jobs, but no `Worker` ever reads from it. Jobs pile up in Redis and are never processed. The only caller, `reels.service.ts` (line 172), calls `addSearchIndexJob()` on every reel creation, meaning all reel search indexing silently fails.
- **Code:**
```typescript
// queue.module.ts line 34 -- queue defined
{ name: 'search-indexing', token: 'QUEUE_SEARCH_INDEXING' },

// queue.module.ts lines 73-80 -- NO SearchIndexingProcessor in providers
providers: [
  ...queueProviders,
  QueueService,
  NotificationProcessor,   // notifications
  MediaProcessor,           // media-processing
  WebhookProcessor,         // webhooks
  AnalyticsProcessor,       // analytics
  AiTasksProcessor,         // ai-tasks
  // MISSING: SearchIndexingProcessor for 'search-indexing'
],
```

### C2. AI moderation Report creation always fails -- missing required fields + invalid enum + wrong FK names
- **File:** `apps/api/src/common/queue/processors/ai-tasks.processor.ts`, lines 96-105
- **Severity:** Critical
- **Category:** Data Integrity / Feature Broken
- **Description:** When AI flags content, the processor tries to create a `Report` record, but this always fails for three separate reasons: (1) `reporterId` is a required field on the `Report` model but is never provided; (2) `'AI_FLAGGED'` is not a valid value in the `ReportReason` enum (valid values: `HATE_SPEECH`, `HARASSMENT`, `VIOLENCE`, `SPAM`, etc.); (3) `threadId` and `reelId` are not fields on the `Report` model (it has `reportedPostId`, `reportedCommentId`, `reportedMessageId` -- no thread or reel FK). The triple `as never` casting hides all three type errors. The `catch` block at line 106 silently swallows the failure, meaning flagged content is **never** recorded for review.
- **Code:**
```typescript
// ai-tasks.processor.ts lines 96-105
await this.prisma.report.create({
  data: {
    reason: 'AI_FLAGGED' as never,        // Not in ReportReason enum
    description: `AI moderation flagged: ${result.flags.join(', ')}`,
    status: 'PENDING',
    ...(contentType === 'post' ? { postId: contentId } : {}),      // Field is 'reportedPostId'
    ...(contentType === 'thread' ? { threadId: contentId } : {}),    // Field doesn't exist on Report
    ...(contentType === 'reel' ? { reelId: contentId } : {}),       // Field doesn't exist on Report
    // Missing: reporterId (required String)
  } as never,
});
```

### C3. Three overlapping job systems -- two are dead code
- **File:** `apps/api/src/common/services/async-jobs.service.ts` (entire file), `apps/api/src/common/services/job-queue.service.ts` (entire file)
- **Severity:** Critical
- **Category:** Dead Code / Architecture Confusion
- **Description:** The codebase has three competing job processing systems:
  1. **QueueService + BullMQ processors** (`common/queue/`) -- the actual system in use
  2. **AsyncJobService** (`common/services/async-jobs.service.ts`) -- in-process retry runner, imported by 5 services (posts, threads, reels, videos, follows) but **never called** by any of them. The `this.jobs` property is injected but `this.jobs.enqueue()` is never invoked anywhere except the health controller's `getStats()`.
  3. **JobQueueService** (`common/services/job-queue.service.ts`) -- a Redis-backed polling queue with dead letter support, but **never imported by any module** and **never used** by any service. Has zero registered handlers, meaning even if jobs were added, they'd be re-queued forever (line 111-113).

  This wastes ~250 lines of dead code and creates confusion about which system to use.

### C4. No scheduled content auto-publisher -- scheduled posts never go live
- **File:** `apps/api/src/modules/scheduling/scheduling.service.ts` (entire file)
- **Severity:** Critical
- **Category:** Feature Broken
- **Description:** The scheduling service allows users to set `scheduledAt` dates on posts, threads, reels, and videos. However, there is **no cron job, no periodic task, no BullMQ repeatable job, and no `@nestjs/schedule` integration** that checks for content past its `scheduledAt` date and actually publishes it. Content with a `scheduledAt` in the past simply stays in "scheduled" state forever. The `publishNow` method (line 159-174) just sets `scheduledAt: null` -- it does not set any `isPublished` flag, doesn't trigger feed indexing, and doesn't send notifications. The `@nestjs/schedule` package is not even installed -- there are zero `@Cron` decorators in the entire codebase. Scheduled content is **permanently invisible**.

### C5. Webhook SSRF -- no URL validation before server-side fetch
- **File:** `apps/api/src/common/queue/processors/webhook.processor.ts`, line 81
- **Severity:** Critical
- **Category:** Security / SSRF
- **Description:** The webhook processor fetches any URL provided in the job data without validation. An attacker who can register a webhook URL can point it at internal services (e.g., `http://localhost:3000/api/v1/admin/...`, `http://169.254.169.254/latest/meta-data/` on AWS, `http://10.0.0.1/...` for internal network scanning). There is no URL validation, no allowlist, no check for private/loopback/link-local IP ranges. The `AbortSignal.timeout(15000)` only limits time, not target.
- **Code:**
```typescript
// webhook.processor.ts line 81
const response = await fetch(url, {  // 'url' from job data, completely unvalidated
  method: 'POST',
  headers: { ... },
  body,
  signal: AbortSignal.timeout(15000),
});
```

### C6. Media processor SSRF -- fetches arbitrary URLs for image processing
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 81, 117
- **Severity:** Critical
- **Category:** Security / SSRF
- **Description:** Both `processImageResize` (line 81) and `processBlurHash` (line 117) fetch `mediaUrl` from job data without any URL validation. An attacker who can submit media processing jobs (by creating content with controlled media URLs) can cause the server to make HTTP requests to arbitrary internal endpoints, cloud metadata services, or other services on the internal network.
- **Code:**
```typescript
// media.processor.ts line 81
const response = await fetch(mediaUrl);  // Unvalidated URL from job data
```

---

## Moderate Findings (12)

### M1. Webhook HMAC signature does not include timestamp -- replay attacks possible
- **File:** `apps/api/src/common/queue/processors/webhook.processor.ts`, lines 78-79
- **Severity:** Moderate
- **Category:** Security / Cryptographic Weakness
- **Description:** The HMAC signature is computed over the body only (`createHmac('sha256', secret).update(body)`), but the timestamp is computed separately and sent as a header. The timestamp is NOT included in the signed payload. An attacker who intercepts a webhook delivery can replay it indefinitely with the original signature -- the receiver has no way to verify the timestamp wasn't modified. Industry standard (GitHub, Stripe, Svix) is to sign `${timestamp}.${body}`.
- **Code:**
```typescript
const signature = createHmac('sha256', secret).update(body).digest('hex');  // body only
const timestamp = Math.floor(Date.now() / 1000).toString();                  // not signed
```

### M2. No-op queue stub silently drops all jobs when Redis is unavailable
- **File:** `apps/api/src/common/queue/queue.module.ts`, lines 42-52
- **Severity:** Moderate
- **Category:** Reliability / Silent Failure
- **Description:** When `REDIS_URL` is not set, the factory returns a stub object whose `add()` method silently returns a fake ID. No warning is logged at the point jobs are dropped. The caller receives a seemingly-valid job ID (e.g., `noop_1711036800000`) with no indication that the job will never be processed. In production, if Redis goes down temporarily, all jobs (notifications, moderation, media processing) are permanently lost without any error or alert.
- **Code:**
```typescript
return {
  add: async (): Promise<{ id: string }> => ({ id: `noop_${Date.now()}` }),
  // ... all stats return 0
};
```

### M3. `backoff: { type: 'custom' }` in QueueService without backoffStrategy -- default backoff used instead
- **File:** `apps/api/src/common/queue/queue.service.ts`, lines 39, 108
- **Severity:** Moderate
- **Category:** Configuration Bug
- **Description:** Two methods (`addPushNotificationJob` line 39 and `addWebhookDeliveryJob` line 108) specify `backoff: { type: 'custom' }` in their job options. However, `backoffStrategy` is configured on the **Worker** (processor), not on the Queue. The Queue's `defaultJobOptions` (set in `queue.module.ts`) don't include a backoff strategy, and the individual job options' `type: 'custom'` references a strategy that may or may not be defined on the Worker. For notifications, the Worker does define a `backoffStrategy` (notification.processor.ts line 50), so it works. For webhooks, the Worker also defines one (webhook.processor.ts line 48), so it works. However, this is fragile: if a job is enqueued before the worker starts or if the worker is in a different process, the `custom` backoff type would throw an error. Using `type: 'exponential'` would be more robust.

### M4. Caption generation processor is a no-op stub
- **File:** `apps/api/src/common/queue/processors/ai-tasks.processor.ts`, lines 115-121
- **Severity:** Moderate
- **Category:** Incomplete Feature
- **Description:** The `processCaptionGeneration` method only logs and marks progress as 100% without doing any actual caption generation. The `AiService.suggestCaptions` method exists and is functional, but is never called here. Jobs enqueued via `addCaptionGenerationJob` are silently dropped.
- **Code:**
```typescript
private async processCaptionGeneration(job: Job<CaptionJobData>): Promise<void> {
  this.logger.debug(`Caption generation for ${contentType}/${contentId} from ${mediaUrl}`);
  // This is a placeholder
  await job.updateProgress(100);
}
```

### M5. Engagement tracking processor is a no-op -- jobs consumed but nothing recorded
- **File:** `apps/api/src/common/queue/processors/analytics.processor.ts`, lines 94-99
- **Severity:** Moderate
- **Category:** Incomplete Feature
- **Description:** The `processEngagementTracking` method only logs a debug message and returns. It claims "engagement tracking is handled by the AnalyticsService in real-time" and this queue is for "durable recording for delayed/batch analytics," but no durable recording actually happens. Jobs are consumed and discarded.

### M6. Five QueueService methods never called from any service module
- **File:** `apps/api/src/common/queue/queue.service.ts`
- **Severity:** Moderate
- **Category:** Dead Code / Incomplete Integration
- **Description:** The following QueueService methods are defined and mocked in tests but never called from any actual service:
  - `addBulkPushJob` (line 45) -- 0 callers
  - `addMediaProcessingJob` (line 55) -- 0 callers
  - `addEngagementTrackingJob` (line 84) -- 0 callers
  - `addWebhookDeliveryJob` (line 99) -- 0 callers
  - `addCaptionGenerationJob` (line 142) -- 0 callers

  This means: media processing never happens, webhook delivery is never triggered, engagement tracking queue is unused, bulk push is unused, and caption generation is unused. The processors exist but starve.

### M7. Image resize generates variants but never uploads them
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 93-100
- **Severity:** Moderate
- **Category:** Incomplete Feature
- **Description:** The `processImageResize` method downloads the image, resizes it to three variants (thumb/150, medium/600, large/1200), but the resized buffers are discarded immediately. The comment on line 98 says "In production: upload each variant to R2" but the upload is never implemented. The job succeeds and marks 100% progress even though no variants were persisted.
- **Code:**
```typescript
await sharp.default(buffer)
  .resize(size.width, size.height, { fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 80 })
  .toBuffer();
// In production: upload each variant to R2
// For now, the resizing pipeline is validated
```

### M8. BlurHash generation computes average color but never stores it
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 111-148
- **Severity:** Moderate
- **Category:** Incomplete Feature
- **Description:** The `processBlurHash` method computes an average color from the image but the result (`avgColor`) is only logged -- never written to the database or returned. The `blurhash` field exists in the Prisma schema on several models (Post, Reel) but is never populated by this processor.

### M9. Video transcode processor is a complete stub
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 150-158
- **Severity:** Moderate
- **Category:** Incomplete Feature
- **Description:** The `processVideoTranscode` method logs a debug message and marks progress 100% without performing any work. The comment says "Cloudflare Stream handles transcoding automatically" but doesn't extract thumbnails or compute duration as mentioned. Job is silently completed with no output.

### M10. JobQueueService has no registered handlers -- infinite re-queue loop
- **File:** `apps/api/src/common/services/job-queue.service.ts`, lines 108-113
- **Severity:** Moderate
- **Category:** Logic Bug (Dead Code)
- **Description:** `JobQueueService` is dead code (never imported outside its own file), but if it were ever activated, any jobs added to it would enter an infinite re-queue loop. When `startProcessing()` pops a job and finds no handler, it `lpush`es the job back onto the queue (line 112). The next 1-second poll cycle picks it up again. This loops forever, consuming Redis operations and CPU.
- **Code:**
```typescript
if (!handler) {
  this.logger.warn(`No handler for job "${job.name}" — re-queuing`);
  await this.redis.lpush(this.QUEUE_KEY, raw);
  return;
}
```

### M11. AsyncJobService injected into 5 services but never called
- **File:** `apps/api/src/modules/posts/posts.service.ts` (line 71), `threads.service.ts` (line 101), `reels.service.ts` (line 70), `videos.service.ts` (line 79), `follows.service.ts` (line 23)
- **Severity:** Moderate
- **Category:** Dead Code
- **Description:** `AsyncJobService` is imported, injected as `private jobs: AsyncJobService`, and present as a constructor parameter in 5 major services, but `this.jobs.enqueue()` is never called in any of them. These services exclusively use `QueueService` for their async work. The `AsyncJobService` is only actually consumed by `health.controller.ts` (for `getStats()`), making it nearly entirely dead weight.

### M12. No dead letter queue or alerting in the BullMQ system
- **File:** `apps/api/src/common/queue/queue.module.ts`, `apps/api/src/common/queue/queue.service.ts`
- **Severity:** Moderate
- **Category:** Reliability / Observability
- **Description:** The BullMQ queues have `removeOnFail: { count: 5000, age: 604800 }` which keeps failed jobs in Redis for 7 days, but there is: (1) no dead letter queue mechanism for permanently failed jobs, (2) no alerting when jobs exhaust all retry attempts, (3) no way to inspect or retry failed jobs via an admin endpoint. The `failed` event handler on each Worker only logs an error message. Compare with `job-queue.service.ts` (the dead code system) which actually has a dead letter queue (`mizanly:job_dead_letter` key). The production system lacks this entirely.

---

## Minor Findings (10)

### m1. Zero test coverage for all queue infrastructure
- **File:** `apps/api/src/common/queue/` (all files)
- **Severity:** Minor
- **Category:** Test Coverage
- **Description:** There are zero `.spec.ts` files for any queue-related code: `queue.service.ts`, `queue.module.ts`, and all 5 processor files have no unit tests. The only test file that references queue code is `health.controller.spec.ts` which mocks `QueueService.getStats()`. Processor logic (notification routing, image processing, webhook delivery, AI moderation report creation, analytics gamification calls) is entirely untested.

### m2. ReportsModule redundantly imports @Global QueueModule
- **File:** `apps/api/src/modules/reports/reports.module.ts`, line 8
- **Severity:** Minor
- **Category:** Code Quality
- **Description:** `ReportsModule` imports `QueueModule` explicitly, but `QueueModule` is decorated with `@Global()` (queue.module.ts line 66), making it available everywhere without explicit import. This is harmless but misleading.

### m3. No job data validation in any processor
- **File:** `apps/api/src/common/queue/processors/*.ts` (all processors)
- **Severity:** Minor
- **Category:** Robustness
- **Description:** None of the 5 processors validate the structure of `job.data` before processing. If a malformed job is enqueued (missing `notificationId`, missing `url`, etc.), the processor will throw an unhandled error that results in a retry cycle. There is no defensive validation or early rejection of invalid job payloads. This is especially risky since the no-op queue stub doesn't validate data types either.

### m4. QueueService.getStats() error handling hides real failures
- **File:** `apps/api/src/common/queue/queue.service.ts`, lines 178-179
- **Severity:** Minor
- **Category:** Observability
- **Description:** The `catch` block in `getStats()` returns all zeros on any error, with no logging. This masks Redis connection failures, queue corruption, or other issues that would be important to diagnose.
- **Code:**
```typescript
} catch {
  stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
}
```

### m5. QueueEvents imported but never used
- **File:** `apps/api/src/common/queue/queue.service.ts`, line 2
- **Severity:** Minor
- **Category:** Dead Import
- **Description:** `QueueEvents` is imported from `bullmq` but never used anywhere in the file.
- **Code:**
```typescript
import { Queue, QueueEvents } from 'bullmq';
```

### m6. Scheduling controller `type` param not validated against allowed values
- **File:** `apps/api/src/modules/scheduling/scheduling.controller.ts`, lines 47, 65, 80
- **Severity:** Minor
- **Category:** Input Validation
- **Description:** The `@Param('type') type: 'post' | 'thread' | 'reel' | 'video'` annotation provides TypeScript type safety but no runtime validation. A request with `type=anything` passes through to the service, which will throw a `BadRequestException`. Adding a `@IsIn` validation pipe or NestJS `ParseEnumPipe` would give better error messages and earlier rejection.

### m7. media.processor uses dynamic import for sharp on every job
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 80, 116
- **Severity:** Minor
- **Category:** Performance
- **Description:** Both `processImageResize` and `processBlurHash` use `await import('sharp')` on every single job invocation. While Node.js caches dynamic imports, this adds unnecessary overhead. Importing `sharp` once at module initialization (with a try/catch for environments where it's not installed) would be cleaner and faster.

### m8. Webhook processor concurrency of 10 may overwhelm single-endpoint receivers
- **File:** `apps/api/src/common/queue/processors/webhook.processor.ts`, line 46
- **Severity:** Minor
- **Category:** Configuration
- **Description:** The webhook worker runs at `concurrency: 10`, meaning up to 10 simultaneous HTTP requests to webhook endpoints. If multiple webhooks target the same endpoint, this could overwhelm the receiver. Industry practice is to use lower concurrency (3-5) with per-domain rate limiting.

### m9. JobQueueService starts polling immediately on construction
- **File:** `apps/api/src/common/services/job-queue.service.ts`, line 40
- **Severity:** Minor
- **Category:** Resource Waste (Dead Code)
- **Description:** Even though `JobQueueService` is dead code, if it were ever registered as a provider, it starts a `setInterval` polling loop 2 seconds after construction (`setTimeout(() => this.startProcessing(), 2000)`). This would poll Redis every 1 second forever, consuming resources, even with zero registered handlers.

### m10. Scheduling service `getScheduled` query shape error
- **File:** `apps/api/src/modules/scheduling/scheduling.service.ts`, lines 38-47
- **Severity:** Minor
- **Category:** Potential Runtime Error
- **Description:** The `findMany` calls use `take: 50` at the same indentation level as the `where` and `select` parameters, but the way the code is formatted, `take: 50` appears to be inside the `select` block rather than as a top-level `findMany` option. Looking more carefully, the `take: 50` is at the correct level (after the closing `}` of `select`), but the lack of explicit line separation makes it confusing and error-prone during future edits.

---

## Summary Table

| Severity | Count | Key Theme |
|----------|-------|-----------|
| Critical | 6 | Missing search-indexing processor, broken AI moderation reports, dead code systems, no scheduled publisher, SSRF in webhook+media processors |
| Moderate | 12 | HMAC replay attacks, silent job drops, 5 unused queue methods, stub processors, no dead letter queue |
| Minor | 10 | Zero tests, dead imports, no job data validation, performance issues |
| **Total** | **28** | |

## Architecture Summary

The queue system has a well-structured BullMQ setup (6 named queues, 5 processor workers) but suffers from three systemic issues:

1. **Incomplete wiring:** Only 4 of 9 `QueueService` methods are actually called from service code (`addPushNotificationJob`, `addGamificationJob`, `addModerationJob`, `addSearchIndexJob`). The other 5 (bulk push, media processing, engagement tracking, webhook delivery, caption generation) have processors but zero callers. Meanwhile, `search-indexing` has a caller but no processor.

2. **Three competing systems:** The codebase contains `QueueService` (BullMQ, actually used), `AsyncJobService` (in-process retries, imported but never called), and `JobQueueService` (Redis polling, completely unused). Only one system should exist.

3. **Missing scheduled execution:** Content scheduling is half-built -- users can set `scheduledAt` dates via the API, but nothing ever checks those dates to trigger publication. There is no `@nestjs/schedule` integration, no cron, no repeatable BullMQ job.
