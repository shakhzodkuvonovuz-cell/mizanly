# A39 -- Queue & Processors Hostile Audit

**Scope:** `apps/api/src/common/queue/` -- `queue.service.ts`, `queue.module.ts`, `dlq.service.ts`, `with-correlation.ts`, and all 6 processors in `processors/`

**Files read:** 20 (8 source + 8 spec + 4 supporting)
**Lines reviewed:** ~1,950 source, ~1,350 test

---

## CRITICAL

### C1. `content-length` header bypass allows 50MB OOM check to be skipped (media.processor.ts:165-167, 237-239)

**Lines:** media.processor.ts L165-167 and L237-239

The OOM guard relies on `content-length` header:
```ts
const contentLength = Number(response.headers.get('content-length') || '0');
if (contentLength > 50 * 1024 * 1024) {
  throw new Error(`Image too large: ${contentLength} bytes (max 50MB)`);
}
```

If the server does not send a `content-length` header (e.g., chunked transfer encoding), the fallback is `'0'`, which passes the check. The subsequent `Buffer.from(await response.arrayBuffer())` then loads the entire body into memory unbounded. A malicious or misconfigured upstream could serve a 500MB response that passes the check and OOMs the worker process.

**Fix:** After `await response.arrayBuffer()`, check `buffer.byteLength` against the limit before proceeding. Or stream the response with a byte counter that aborts when exceeded.

---

### C2. `addBulkPushJob` has no payload size limit -- unbounded userIds array (queue.service.ts:117-131)

**Lines:** queue.service.ts L117-131

`addBulkPushJob` accepts `userIds: string[]` with no upper bound. A caller (admin.service.ts L478, broadcast.service.ts L194) can pass millions of user IDs. The entire array is serialized into a single BullMQ job payload stored in Redis. A 1M-user broadcast produces a ~30MB Redis value, and the notification processor (L112-129) then does:
```ts
await this.prisma.notification.createMany({
  data: userIds.map(userId => ({ ... })),
});
```
This creates a single Prisma `createMany` with millions of rows -- a guaranteed OOM or DB timeout.

**Fix:** Chunk into batches (e.g., 500 users per job) at the producer side. Add a hard cap (e.g., 10,000) with validation.

---

### C3. Webhook HMAC signature in Redis job data is not a secret, but webhook `payload` data IS exposed (webhook.processor.ts:79, queue.service.ts:186-193)

**Lines:** queue.service.ts L186-193, webhook.processor.ts L79

While K04-#1 correctly removed the webhook `secret` from job data, the full `payload` (which may contain user PII, financial data, etc.) is still stored in Redis and forwarded to Sentry `extra.data`:
```ts
extra: { jobId: job.id, attemptsMade: job.attemptsMade, data: job.data },
```
Every processor does this (6 instances). For webhook jobs, `job.data.payload` contains the original event payload. For notification jobs, `job.data` may contain user IDs. For moderation jobs, `job.data.content` contains the actual user-generated text. All of this is sent to Sentry as unredacted `extra`.

**Fix:** Sanitize `job.data` before passing to `Sentry.captureException` -- strip `payload`, `content`, `userIds` (or truncate to count).

---

## HIGH

### H1. `processEngagementTracking` is a no-op -- jobs are queued, consumed, and silently dropped (analytics.processor.ts:122-131)

**Lines:** analytics.processor.ts L122-131

```ts
private async processEngagementTracking(job: Job<EngagementJobData>): Promise<void> {
    const { type, userId, contentType, contentId } = job.data;
    this.logger.debug(`Tracked engagement: ${type} by ${userId} on ${contentType}/${contentId}`);
    // ...comment explaining it does nothing...
}
```

Every `addEngagementTrackingJob` call (posts.controller.ts L115, reels.controller.ts L126, videos.controller.ts L82, stories.controller.ts L125, threads.controller.ts L108) consumes Redis resources to enqueue a job that is immediately discarded. This creates the illusion of analytics tracking without actually tracking anything. At scale, thousands of wasted Redis operations per minute.

**Fix:** Either wire it to a real storage backend (ClickHouse, Redis time-series, etc.) or remove the queue calls entirely and use the existing `AnalyticsService` Redis pipeline directly.

---

### H2. `message` content type accepted by `ModerationJobData` interface but not handled in report creation (ai-tasks.processor.ts:12, 122-138)

**Lines:** ai-tasks.processor.ts L12 and L122-138

The `ModerationJobData` interface declares:
```ts
contentType: 'post' | 'thread' | 'comment' | 'message' | 'reel' | 'video';
```

But the `processModeration` if-else chain (L122-138) handles `post`, `thread`, `reel`, `comment`, and `video` -- but NOT `message`. If a moderation job is enqueued with `contentType: 'message'`:
1. `reportedUserId` will be `undefined` (no lookup attempted)
2. The report will be created with NO `reportedPostId`, NO `reportedCommentId`, NO `reportedVideoId` -- just a dangling report with no link to the offending content
3. The report is un-actionable: moderators cannot find what was flagged

**Fix:** Add a `message` branch that looks up the sender via `prisma.message.findUnique` and links the report appropriately. Or remove `message` from the accepted types and add `reportedMessageId` to the Report model.

---

### H3. `stalledInterval` not configured on any worker -- relies on BullMQ default of 30s (all 6 processors)

**Lines:** notification.processor.ts L39-68, media.processor.ts L72-106, webhook.processor.ts L46-66, analytics.processor.ts L46-72, ai-tasks.processor.ts L42-65, search-indexing.processor.ts L40-53

All 6 workers set `maxStalledCount: 3` but none configure `stalledInterval`. BullMQ defaults to 30,000ms. For the media processor with `lockDuration: 120000` (2 minutes for image processing), a stall check every 30s is reasonable. But for the AI tasks processor (also `lockDuration: 120000`) with the `limiter` restricting to 10 jobs/min, jobs waiting for the limiter could falsely appear stalled.

More critically, the webhook processor has `lockDuration: 30000` with `concurrency: 25`. Twenty-five concurrent outbound HTTP requests with a 15s timeout each could leave the worker unable to renew locks in time, triggering false stalls and duplicate deliveries.

**Fix:** Set `stalledInterval` explicitly on each worker. For webhook processor, increase `lockDuration` to at least 60000 (2x the fetch timeout of 15s plus safety margin).

---

### H4. DLQ `moveToDlq` stores unsanitized `job.data` in PostgreSQL `FailedJob.data` column (dlq.service.ts:78)

**Lines:** dlq.service.ts L73-85

The Redis DLQ path (L42-46) strips sensitive fields (`secret`, `token`, `signingSecret`, `apiKey`, `webhookSecret`). But the DB path does NOT:
```ts
const dbDone = this.prisma.failedJob.create({
  data: {
    ...
    data: JSON.parse(JSON.stringify(job.data ?? {})),  // <-- UNSANITIZED
    ...
  },
});
```

`job.data` here is the ORIGINAL data, not the sanitized copy. So while Redis gets clean data, PostgreSQL stores the raw job payload including any secrets that were in the original job data. The `sanitizedData` variable on L42 is only used for the Redis path.

**Fix:** Use `sanitizedData` for the DB path as well. Change L78 to `data: JSON.parse(JSON.stringify(sanitizedData))`.

---

## MEDIUM

### M1. No dedup jobId on `addBulkPushJob` -- duplicate broadcasts possible (queue.service.ts:123-128)

**Lines:** queue.service.ts L123-128

`addPushNotificationJob` has `jobId: push:${data.notificationId}` for dedup. `addWebhookDeliveryJob` has `jobId: wh:${payloadHash}` for dedup. But `addBulkPushJob` has NO `jobId`:
```ts
this.notificationsQueue.add('bulk-push', this.withCorrelation(data), {
  attempts: 3,
  backoff: { type: 'custom' },
}),
```

If the same bulk-push is accidentally enqueued twice (e.g., admin double-clicks, network retry), all users receive the notification twice.

**Fix:** Add a `jobId` based on a content hash of `{title, body, userIds.sort().join(',')}`.

---

### M2. No dedup jobId on `addGamificationJob` or `addEngagementTrackingJob` -- duplicate XP/streak awards possible (queue.service.ts:140-147, 160-166)

**Lines:** queue.service.ts L140-147, L160-166

Neither gamification nor engagement tracking jobs have a `jobId`. If the same action is enqueued twice (e.g., circuit breaker retry at the HTTP layer), a user gets double XP. At minimum, gamification jobs should use `jobId: xp:${userId}:${action}:${Date.now()}` or similar to bound duplicates.

---

### M3. No dedup jobId on `addSearchIndexJob` -- duplicate indexing under retry (queue.service.ts:219-225)

**Lines:** queue.service.ts L219-225

Search index jobs have no `jobId`. If the same document is indexed twice in quick succession (e.g., rapid edits), both jobs run. This is mostly harmless for Meilisearch (idempotent upsert) but wastes resources. More importantly, a `delete` followed by an `index` could race and the delete could win, leaving the document missing.

**Fix:** Use `jobId: search:${action}:${indexName}:${documentId}`.

---

### M4. No dedup jobId on `addModerationJob` -- duplicate moderation reports possible (queue.service.ts:235-241)

**Lines:** queue.service.ts L235-241

If moderation is enqueued twice for the same content (e.g., on edit + on create), two separate AI calls are made and potentially two reports are created for the same content. No `jobId` for dedup.

**Fix:** Use `jobId: mod:${contentType}:${contentId}`.

---

### M5. `video-transcode` job type in MediaProcessor is dead code with no producer (media.processor.ts:83-92)

**Lines:** media.processor.ts L83-92

The switch handles `'video-transcode'` but QueueService has no method to enqueue a video-transcode job. The `addMediaProcessingJob` only enqueues `image-resize` and `blurhash`. The comment says "delegated to Cloudflare Stream" but a consumer exists for a job type that can never arrive through the typed API. Dead code that confuses auditors.

---

### M6. Webhook processor concurrency of 25 is aggressive for outbound HTTP (webhook.processor.ts:55)

**Lines:** webhook.processor.ts L55

`concurrency: 25` means 25 simultaneous outbound HTTP requests. If all 25 hit a slow endpoint, they hold 25 Node.js connections open for up to 15s each. Combined with BullMQ's worker event loop, this can starve other operations. The webhook processor also uses `lockDuration: 30000` (30s) -- if a request takes 15s and BullMQ needs time to process the result, the lock could expire during the last few requests, causing stall detection and duplicate delivery.

**Fix:** Reduce to 10 concurrent. Increase lockDuration to 60000.

---

### M7. `thread` and `reel` content types flagged by AI moderation create reports without linking to the reported content (ai-tasks.processor.ts:140-149)

**Lines:** ai-tasks.processor.ts L140-149

The report creation spreads content-type-specific fields:
```ts
...(contentType === 'post' ? { reportedPostId: contentId } : {}),
...(contentType === 'comment' ? { reportedCommentId: contentId } : {}),
...(contentType === 'video' ? { reportedVideoId: contentId } : {}),
```

But `thread` and `reel` content types are NOT mapped to any `reportedXId` field. When AI flags a thread or reel, the report is created with only `reportedUserId` -- no direct link to the offending content. Moderators must search by user to find what was flagged.

---

### M8. BlurHash enqueue failure is silently caught, no Sentry alert (queue.service.ts:94-105)

**Lines:** queue.service.ts L94-105

```ts
this.circuitBreaker.exec('redis', () =>
  this.mediaQueue.add('blurhash', ...)
).catch((err) => {
  this.logger.warn(`Failed to enqueue BlurHash job for ${data.mediaKey}: ${err...}`);
});
```

The `.catch()` logs a warning but does not report to Sentry. If Redis is intermittently failing, BlurHash generation will silently stop for all new uploads without any alerting. Since BlurHash is important for UX (progressive loading), this should at least increment a Sentry counter.

---

## LOW

### L1. `with-correlation.ts` Sentry scope is scoped to the callback, not the job lifetime (with-correlation.ts:11-13)

**Lines:** with-correlation.ts L11-13

```ts
Sentry.withScope((scope) => {
  scope.setTag('correlationId', correlationId);
});
```

`Sentry.withScope` creates a temporary scope that is discarded after the callback returns. Any `Sentry.captureException` calls later in the processor (e.g., in the `failed` handler) will NOT have the `correlationId` tag because they execute outside this scope. The correlation ID is effectively attached to nothing.

**Fix:** Use `Sentry.getCurrentScope().setTag('correlationId', correlationId)` or use `Sentry.withScope` to wrap the entire job processing function.

---

### L2. No-op queue stub in development drops jobs silently with wrong return type (queue.module.ts:62-66)

**Lines:** queue.module.ts L62-66

```ts
add: async (_jobName: string, data: unknown): Promise<{ id: string }> => {
  logger.debug(`Job dropped (no-op): ${_jobName}`);
  return { id: `noop_${Date.now()}` };
},
```

The stub's `add` method signature takes `(_jobName, data)` but the real `Queue.add` takes `(name, data, opts)`. More importantly, the stub does not conform to the full BullMQ `Queue` interface. If any code accesses other Queue methods beyond the ones stubbed (e.g., `getJob`, `pause`, `drain`), it will get a runtime `TypeError` with no useful error message.

---

### L3. `removeOnComplete: { count: 1000, age: 86400 }` may accumulate stale data in high-throughput queues (queue.module.ts:79)

**Lines:** queue.module.ts L79-80

The notifications and analytics queues handle thousands of jobs per day. `count: 1000` means BullMQ keeps the last 1000 completed jobs in Redis. With 6 queues, that's up to 6,000 completed jobs in Redis at any time. This is manageable now but should be monitored. The `removeOnFail: { count: 5000, age: 604800 }` is more concerning -- 5,000 failed jobs retained for 7 days per queue, up to 30,000 failed job records in Redis.

---

### L4. `notification.processor.ts` -- `processBulkPush` does not validate `userIds` are non-empty strings (notification.processor.ts:112-129)

**Lines:** notification.processor.ts L112-129

```ts
const { userIds, title, body, pushData } = job.data;
```

No validation that `userIds` contains valid, non-empty strings. If a caller passes `['', null, undefined]`, the processor creates invalid notification records in the DB and attempts to send push notifications to invalid user IDs.

---

### L5. `processModeration` silently returns on empty content -- should complete job with progress (ai-tasks.processor.ts:106-108)

**Lines:** ai-tasks.processor.ts L106-108

```ts
if (!content || !contentType || !contentId) {
  this.logger.warn(`Invalid moderation job ${job.id}: missing required fields`);
  return;  // <-- no job.updateProgress(100)
}
```

When the job returns early without calling `updateProgress(100)`, the job appears stuck at 0% in any monitoring dashboard. This is inconsistent with other early-return paths (webhook.processor.ts L114-117 also returns early without updateProgress). Both should mark progress as 100 or use a distinct "skipped" status.

---

### L6. `attachCorrelationId` return value is used by zero callers (with-correlation.ts:8-17)

**Lines:** with-correlation.ts L8-17

The function returns `string | undefined` (the correlation ID), but every caller ignores the return value:
```ts
attachCorrelationId(job, this.logger);  // return value discarded
```

Dead return value. Not a bug but unnecessary code.

---

## INFO

### I1. Producer/Consumer parity verified -- all 8 job types match

| Producer Method | Queue | Job Name(s) | Processor | Match? |
|---|---|---|---|---|
| `addPushNotificationJob` | notifications | `push-trigger` | NotificationProcessor | Yes |
| `addBulkPushJob` | notifications | `bulk-push` | NotificationProcessor | Yes |
| `addMediaProcessingJob` | media-processing | `image-resize`, `blurhash` | MediaProcessor | Yes |
| `addGamificationJob` | analytics | `award-xp`, `update-streak` | AnalyticsProcessor | Yes |
| `addEngagementTrackingJob` | analytics | `track-engagement` | AnalyticsProcessor | Yes (no-op) |
| `addWebhookDeliveryJob` | webhooks | `deliver` | WebhookProcessor | Yes |
| `addSearchIndexJob` | search-indexing | `index`/`update`/`delete` | SearchIndexingProcessor | Yes |
| `addModerationJob` | ai-tasks | `moderate` | AiTasksProcessor | Yes |

No orphan producer or consumer. One dead consumer (`video-transcode`) noted in M5.

### I2. Retry limits are reasonable and bounded

| Queue | Attempts | Backoff | Max Wait |
|---|---|---|---|
| notifications (push-trigger) | 3 | Custom: 1s, 10s, 60s | ~71s |
| notifications (bulk-push) | 3 | Custom: 1s, 10s, 60s | ~71s |
| media (image-resize) | 3 | Exponential: 2s base | ~14s |
| media (blurhash) | 2 | Exponential: 1s base | ~3s |
| analytics | 2 | Exponential: 1s base | ~3s |
| webhooks | 5 | Custom: 1s, 5s, 30s, 5m, 30m | ~35min |
| search-indexing | 3 | Exponential: 1s base | ~7s |
| ai-tasks | 2 | Exponential: 3s base | ~9s |

No infinite retry loops possible. All bounded.

### I3. Error handling audit -- all processors have: `on('failed')`, `on('error')`, `on('stalled')`, `on('completed')` with duration warning

### I4. Test coverage is thorough -- 8 spec files, ~200 assertions covering happy paths, edge cases, DLQ routing, SSRF, lifecycle, and security

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 4 |
| MEDIUM | 8 |
| LOW | 6 |
| INFO | 4 |
| **Total** | **25** |
