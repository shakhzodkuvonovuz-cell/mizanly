# Wave 1: Queue No-Op / Disabled Behavior Audit

## Summary
10 findings. 1 CRITICAL, 3 HIGH, 3 MEDIUM, 2 LOW. Queue system has fundamental reliability gaps.

## CRITICAL

### F1: Production Redis failure after startup has no halt/circuit breaker
- **File:** `redis.module.ts:37-48`
- **Evidence:** Error handler only logs "Redis connection error (CRITICAL)" but says "Don't crash here". BullMQ queues will throw on every `queue.add()`.
- **Failure:** Cascading errors on every user action that triggers queue jobs. No circuit breaker — system keeps throwing.
- **Systemic:** Yes — affects all content creation paths

## HIGH

### F2: No-op queue stub silently drops ALL jobs in dev
- **File:** `queue.module.ts:44-59`
- **Evidence:** Without REDIS_URL, all queues return `{ id: 'noop_${Date.now()}' }` — indistinguishable from success
- **Failure:** Every queue-dependent feature silently does nothing in dev. No signal jobs are dropped.
- **Systemic:** All 6 queues

### F3: 10+ unhandled promise rejections from queue calls
- **Files:** `posts.service.ts:702-707`, `threads.service.ts:429-430`, `reels.service.ts:258-259`, `videos.service.ts:204-205`
- **Evidence:** Fire-and-forget queue calls without `.catch()` — if Redis is down, unhandled rejections crash Node.js 15+
- **Failure:** Process crash potential. 2 gamification + 1 moderation call per content creation = 3 unhandled rejections per user action.

### F4: AsyncJobService retry is process-local — lost on restart
- **File:** `async-jobs.service.ts:31-58`
- **Evidence:** Uses `setTimeout` for backoff, `jobCounts` is plain object — all lost on restart
- **Failure:** Data loss on any process restart during retry backoff

## MEDIUM

### F5: `addPushNotificationJob` is dead code — push bypasses queue
- **File:** `queue.service.ts:41`, `notifications.service.ts:288`
- **Evidence:** Push delivery goes direct `NotificationsService.create() → pushTrigger.triggerPush()`, never through queue
- **Failure:** No retry on transient Expo push API failures. Push latency added to API response.

### F6: `addMediaJob` does not exist — media processor is dead code
- **File:** `queue.service.ts` (method absent), `media.processor.ts` (handler exists)
- **Failure:** EXIF stripping, image resize, BlurHash generation never run. GPS coordinates leak.

### F7: DLQ writes to Redis — fails during Redis outage
- **File:** `queue.service.ts:141-147`
- **Evidence:** `moveToDlq` calls `redis.lpush` with empty catch. If Redis is down, DLQ write fails silently.
- **Failure:** Complete data loss — job fails, can't retry (Redis down), can't record in DLQ (also Redis down).

### F8: No circuit breaker between queue producers and Redis
- **Failure:** During Redis brownout, each content creation pays 4x Redis timeout latency

## LOW

### F9: Engagement tracking processor is a no-op with no producer
- **File:** `analytics.processor.ts:97-106` — handler exists but does nothing and can never be reached

### F10: Unknown job types silently succeed in 5/6 processors
- **Evidence:** Most processors `logger.warn` and return. Only search-indexing throws on unknown types.
- **Failure:** Typos in job names cause silent data loss

## What Degrades Without Redis
| Feature | Effect | Recovery |
|---------|--------|----------|
| Gamification XP/Streaks | Never earned | Permanently lost |
| AI Content Moderation | Never runs | Content goes unmoderated |
| Search Indexing | New content never indexed | Weekly reconciliation (also needs Redis) |
| Webhook Delivery | Silently dropped | Permanently lost |
| Media Processing | Already dead (no producer) | N/A |
