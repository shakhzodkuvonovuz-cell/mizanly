# X04 — Queue Producer/Consumer Parity Audit

**Auditor:** Claude Opus 4.6 (hostile, paranoid mode)
**Date:** 2026-04-05
**Scope:** All BullMQ queues in `apps/api` -- producer/consumer mapping, DLQ, type safety, unbounded growth, dead code

## Architecture Summary

6 named BullMQ queues registered in `queue.module.ts`, backed by Redis (prefix `mizanly`):

| Queue Name | Token | Producer Methods | Consumer (Processor) |
|---|---|---|---|
| `notifications` | `QUEUE_NOTIFICATIONS` | `addPushNotificationJob`, `addBulkPushJob` | `NotificationProcessor` |
| `media-processing` | `QUEUE_MEDIA_PROCESSING` | `addMediaProcessingJob` | `MediaProcessor` |
| `analytics` | `QUEUE_ANALYTICS` | `addGamificationJob`, `addEngagementTrackingJob` | `AnalyticsProcessor` |
| `webhooks` | `QUEUE_WEBHOOKS` | `addWebhookDeliveryJob` | `WebhookProcessor` |
| `search-indexing` | `QUEUE_SEARCH_INDEXING` | `addSearchIndexJob` | `SearchIndexingProcessor` |
| `ai-tasks` | `QUEUE_AI_TASKS` | `addModerationJob` | `AiTasksProcessor` |

All workers use `OnModuleInit` / `OnModuleDestroy` lifecycle, custom `Worker` instances (not `@Processor` decorator -- BullMQ native API).

---

## Findings

### CRITICAL

#### X04-C1: Entire `webhooks` queue is dead -- zero production callers
- **Severity:** Critical (wasted infrastructure, false sense of webhook delivery)
- **Location:** `queue.service.ts:171` (`addWebhookDeliveryJob`), `webhook.processor.ts`
- **Evidence:** `addWebhookDeliveryJob` has ZERO callers in any module service or controller. Grep confirms only test files and the method declaration itself reference it. The `Webhook` Prisma model exists (schema line 4735), but no service ever enqueues delivery jobs.
- **Impact:** The webhook queue starts a Worker on boot, consumes a Redis connection, and does nothing. The webhook feature is completely inert despite having a model, processor, HMAC signing logic, SSRF validation, and tests.
- **Risk:** Developers may assume webhooks work. They do not. Nothing fires `addWebhookDeliveryJob` when events occur (post.created, follow, etc).

#### X04-C2: Engagement tracking processor is a no-op -- jobs queued but discarded
- **Severity:** Critical (silent data loss, false analytics guarantees)
- **Location:** `analytics.processor.ts:122-131` (`processEngagementTracking`)
- **Evidence:** The method body is:
  ```typescript
  this.logger.debug(`Tracked engagement: ${type} by ${userId} on ${contentType}/${contentId}`);
  // ...comment saying "has no separate storage target yet"
  ```
  It logs a debug line and returns. No database write, no Redis write, no analytics service call.
- **Impact:** 4 controller endpoints (`videos.controller.ts:82`, `threads.controller.ts:108`, `reels.controller.ts:126`, `stories.controller.ts:125`) enqueue engagement tracking jobs that consume Redis memory, network bandwidth, and worker concurrency but produce zero output. Every view/like/comment/share tracked this way is silently discarded.
- **Risk:** Product team may believe engagement analytics are being collected durably. They are not.

### HIGH

#### X04-H1: Type mismatch -- `addModerationJob` producer excludes `'video'` but processor handles it
- **Severity:** High (type gap prevents video moderation)
- **Location:** Producer: `queue.service.ts:232` -- `contentType: 'post' | 'thread' | 'comment' | 'message' | 'reel'`. Consumer: `ai-tasks.processor.ts:13` -- includes `'video'`.
- **Evidence:** The processor at line 135 has `else if (contentType === 'video')` to look up the video author and create a moderation report. But the producer's TypeScript union type does not include `'video'`, making it impossible to call `addModerationJob({ contentType: 'video', ... })` without a type error.
- **Impact:** Videos are never moderated via the AI queue. No caller in `videos.service.ts` calls `addModerationJob`.

#### X04-H2: BlurHash processor silently drops thread content type
- **Severity:** High (wasted computation, missing feature)
- **Location:** `media.processor.ts:254-265` (`processBlurHash`)
- **Evidence:** The switch handles `reel`, `post`, `story`, `video` but NOT `thread`. `threads.service.ts:420` enqueues media processing jobs with `contentType: 'thread'`. The BlurHash is computed (image downloaded, resized, encoded) but the result is silently discarded because no `if (contentType === 'thread')` branch exists.
- **Mitigation note:** The `Thread` Prisma model has no `blurhash` column, so even if handled, there's nowhere to write it. The wasted computation (download + sharp resize + BlurHash encode) occurs on every thread with media.

#### X04-H3: Most notification push delivery bypasses the queue entirely
- **Severity:** High (no durable retry for main notification path)
- **Location:** `notifications.service.ts:374`
- **Evidence:** `NotificationsService.create()` -- the main notification creation path used by ~20 services -- calls `pushTrigger.triggerPush(notification.id)` directly (fire-and-forget, `.catch()` swallows errors). Only `islamic.service.ts` (2 call sites) uses the queue-backed `addPushNotificationJob`. All other push notifications have no durable retry if the Expo/FCM/APNs call fails.
- **Impact:** Transient push delivery failures for likes, comments, follows, mentions, messages, etc. are permanently lost. The queue infrastructure exists but is mostly unused for its intended purpose.

#### X04-H4: Moderation coverage is incomplete -- only posts and reels are moderated
- **Severity:** High (content safety gap)
- **Location:** `addModerationJob` callers
- **Evidence:** Only 2 content types are moderated via queue:
  - `posts.service.ts:661` -- posts
  - `reels.service.ts:315` -- reels
  
  NOT moderated: threads (with text content), comments, messages, videos (descriptions/titles). The producer type allows `'thread' | 'comment' | 'message'` but no service ever sends those types.
- **Impact:** Hate speech, harassment, or other violations in threads, comments, and messages bypass AI moderation entirely.

### MEDIUM

#### X04-M1: `video-transcode` job type handled by consumer but never produced
- **Severity:** Medium (dead code)
- **Location:** `media.processor.ts:83-92`
- **Evidence:** The media worker has a `case 'video-transcode'` branch that logs a debug message about Cloudflare Stream delegation. But `addMediaProcessingJob` only ever enqueues `image-resize` and `blurhash` job names. No producer sends `video-transcode`.
- **Impact:** Dead code in the processor. Low risk but creates confusion about the video pipeline.

#### X04-M2: No jobId deduplication on gamification, engagement, and moderation jobs
- **Severity:** Medium (potential duplicate processing)
- **Location:** `queue.service.ts:140-141` (gamification), `160-161` (engagement), `235-236` (moderation)
- **Evidence:** These producers do NOT set a `jobId` option. Only `addPushNotificationJob` (line 60), `addMediaProcessingJob` (lines 87, 99), and `addWebhookDeliveryJob` (line 203) use dedup `jobId`s. Without `jobId`, BullMQ assigns a random ID -- retried requests or race conditions can create duplicate jobs.
- **Impact:** A user could receive double XP for the same action, or the same content could be moderated twice. Low probability in normal operation but exploitable under high load or retry storms.

#### X04-M3: Redis DLQ list has no consumer or admin retrieval endpoint
- **Severity:** Medium (DLQ accumulates forever with no drain mechanism)
- **Location:** `dlq.service.ts:64` (lpush to `mizanly:dlq`), `dlq.service.ts:67` (7-day TTL)
- **Evidence:** Failed jobs are pushed to `mizanly:dlq` Redis list with a 7-day TTL and capped at 1000 entries. The DB `FailedJob` table stores them durably. But there is NO admin endpoint to list, inspect, retry, or resolve failed jobs from either Redis or the DB. The `resolvedAt` and `resolution` columns in the `FailedJob` model are never written to.
- **Impact:** Dead-lettered jobs are invisible to operators. The `FailedJob` table grows unbounded (no cleanup cron, no `resolvedAt` pruning).

#### X04-M4: Notification queue `backoff: { type: 'custom' }` but analytics/search use `exponential` without `backoffStrategy`
- **Severity:** Medium (inconsistent retry behavior)
- **Location:** 
  - `queue.service.ts:62` -- `push-trigger` uses `backoff: { type: 'custom' }`, `notification.processor.ts:61` defines matching `backoffStrategy`
  - `queue.service.ts:126` -- `bulk-push` uses `backoff: { type: 'custom' }`, same worker handles it
  - `queue.service.ts:142` -- gamification uses `backoff: { type: 'exponential', delay: 1000 }`, analytics worker has NO `backoffStrategy` in settings
- **Evidence:** Analytics and search workers have empty `settings: {}` blocks (commented-out trailing commas at lines 70 and 52 respectively). They rely on BullMQ's built-in exponential backoff, which works but has no jitter. Under load, all retries fire at the same exponential intervals creating thundering herd effects.
- **Impact:** Low at current scale. At high volume, synchronized retries can overwhelm downstream services.

#### X04-M5: `addMediaProcessingJob` BlurHash enqueue failure is fire-and-forget
- **Severity:** Medium (silent data loss)
- **Location:** `queue.service.ts:94-105`
- **Evidence:** The BlurHash job is enqueued with `.catch()` that only logs a warning. If Redis circuit breaker is open or Redis is down, the BlurHash job is silently dropped. The image-resize job throws on failure (propagates to caller), but the BlurHash job does not.
- **Impact:** Content can have resized variants but no BlurHash placeholder. The UI may show a blank/jarring loading state instead of a smooth blur placeholder.

### LOW

#### X04-L1: Webhook processor concurrency=25 is disproportionately high
- **Severity:** Low (resource waste for dead queue)
- **Location:** `webhook.processor.ts:55` -- `concurrency: 25`
- **Evidence:** All other processors use concurrency 3-5. The webhook processor reserves 25 concurrent workers. Since no jobs are ever enqueued (finding X04-C1), this wastes Worker capacity and Redis connections.

#### X04-L2: Development no-op queue stub has no `addBulk` method
- **Severity:** Low (future breakage risk)
- **Location:** `queue.module.ts:61-72`
- **Evidence:** The dev stub returns `{ add, close, getWaitingCount, ... }` but not `addBulk`. If any future producer uses `addBulk()`, development mode will throw.

#### X04-L3: Redis lpush lists in retention and live services have no consumers
- **Severity:** Low (non-BullMQ queues)
- **Location:** `retention.service.ts:39` (`session:${userId}:${date}`), `live.service.ts:602` (live chat), `islamic-notifications.service.ts:83` (Islamic notification feed)
- **Evidence:** These are Redis lists used as append-only logs, not work queues. They have TTLs (7 days for retention, probably similar for others) but no background worker consumes them. The retention data is queried on-read via `lrange`, so they function as caches, not queues. Including for completeness since the term "queue" is overloaded.

#### X04-L4: `FailedJob` table grows unbounded
- **Severity:** Low (slow DB bloat)
- **Location:** `dlq.service.ts:73`, `schema.prisma:5387`
- **Evidence:** Every permanently failed job creates a `FailedJob` row. There is no cleanup cron, no archival, no `resolvedAt` auto-cleanup. At scale with failing jobs, this table can grow indefinitely. Redis DLQ has a 1000-entry cap and 7-day TTL, but the DB store does not.

### INFO

#### X04-I1: Queue infrastructure is well-structured overall
- All 6 queues have matching producers and consumers
- All workers handle `on('error')`, `on('stalled')`, `on('completed')`, `on('failed')` events
- All workers use `maxStalledCount: 3`
- DLQ routing works (dual Redis + DB storage with Sentry fallback)
- Circuit breaker protects all enqueue operations
- Correlation ID propagation from request to job to Sentry
- `removeOnComplete: { count: 1000, age: 86400 }` and `removeOnFail: { count: 5000, age: 604800 }` prevent Redis OOM
- Webhook secret stripped from job data before Redis storage (K04-#1 fix)
- Content-hash dedup on webhook delivery jobs (#118 fix)
- `onModuleDestroy` gracefully closes all queues and workers

#### X04-I2: No re-entrant queue loops
- No processor injects or calls `QueueService`. Processors only call downstream services (PushTriggerService, GamificationService, MeilisearchService, AiService, PrismaService). No risk of infinite job chains.

---

## Producer/Consumer Parity Matrix

| Job Name | Queue | Producer Location | Consumer Handler | Status |
|---|---|---|---|---|
| `push-trigger` | notifications | `addPushNotificationJob` (only islamic.service.ts) | `processPushTrigger` | WORKS but barely used (H3) |
| `bulk-push` | notifications | `addBulkPushJob` (admin.service.ts, broadcast.service.ts) | `processBulkPush` | WORKS |
| `image-resize` | media-processing | `addMediaProcessingJob` (posts, reels, threads, stories, videos) | `processImageResize` | WORKS |
| `blurhash` | media-processing | `addMediaProcessingJob` (same callers) | `processBlurHash` | PARTIAL -- thread type silently dropped (H2) |
| `video-transcode` | media-processing | NONE | `case 'video-transcode'` (no-op) | DEAD CODE (M1) |
| `award-xp` | analytics | `addGamificationJob` (11+ callers across 5 services) | `processAwardXP` | WORKS |
| `update-streak` | analytics | `addGamificationJob` (11+ callers across 5 services) | `processUpdateStreak` | WORKS |
| `track-engagement` | analytics | `addEngagementTrackingJob` (4 controller callers) | `processEngagementTracking` | NO-OP -- processor does nothing (C2) |
| `deliver` | webhooks | `addWebhookDeliveryJob` (ZERO callers) | `deliverWebhook` | ENTIRE QUEUE DEAD (C1) |
| `index` / `update` / `delete` | search-indexing | `addSearchIndexJob` (auth, publish, search-reconciliation, privacy, reports) | `processSearchIndex` | WORKS |
| `moderate` | ai-tasks | `addModerationJob` (posts.service.ts, reels.service.ts, reports.service.ts) | `processModeration` | WORKS but incomplete coverage (H4) |

## DLQ Checklist

| Check | Status | Notes |
|---|---|---|
| DLQ configured? | YES | Dual: Redis list (`mizanly:dlq`, 1000 cap, 7d TTL) + `FailedJob` DB table |
| DLQ consumer/viewer? | NO | No admin endpoint to inspect, retry, or resolve dead-lettered jobs (M3) |
| FailedJob cleanup? | NO | DB table grows unbounded; `resolvedAt`/`resolution` columns never written (L4) |
| Sentry fallback? | YES | If both Redis and DB DLQ fail, Sentry.captureException fires |

## Retry/Backoff Summary

| Queue | maxAttempts | Backoff | maxStalledCount | Concurrency | lockDuration |
|---|---|---|---|---|---|
| notifications (push-trigger) | 3 | Custom: 1s, 10s, 60s | 3 | 5 | 60s |
| notifications (bulk-push) | 3 | Custom: 1s, 10s, 60s | 3 | 5 | 60s |
| media-processing (resize) | 3 | Exponential, 2s base | 3 | 3 | 120s |
| media-processing (blurhash) | 2 | Exponential, 1s base | 3 | 3 | 120s |
| analytics (gamification) | 2 | Exponential, 1s base | 3 | 5 | 30s |
| analytics (engagement) | 2 | Exponential, 1s base | 3 | 5 | 30s |
| webhooks | 5 | Custom: 1s, 5s, 30s, 5m, 30m | 3 | 25 | 30s |
| search-indexing | 3 | Exponential, 1s base | 3 | 5 | 60s |
| ai-tasks (moderate) | 2 | Exponential, 3s base | 3 | 3 | 120s |

## Severity Summary

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 4 |
| Medium | 5 |
| Low | 4 |
| Info | 2 |
| **Total** | **17** |
