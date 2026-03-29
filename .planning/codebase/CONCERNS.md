# Codebase Concerns

**Analysis Date:** 2026-03-30

## Summary

This codebase has been through 37+ audit files producing ~400 findings. Approximately 60 were fixed, ~220 remain code-fixable but unaddressed, ~35 need architectural work, and ~8 need infrastructure changes. The primary tracking document is `docs/audit/DEFERRED_FIXES.md` (741 lines) and `docs/audit/deep-audit-2026-03-26/UNFIXED_FINDINGS.md` (~464 lines, ~371 distinct unfixed findings).

---

## Tech Debt

### 1. Visibility/Lifecycle Filters Missing Across Feed Queries

- Issue: `isDeleted` is never checked in any content feed query. `isPrivate` is missing from 5+ feed endpoints. `isBanned` was patched (42 queries) but gaps remain in community trending, nearby content, related posts, video recommendations, and pgvector hydration.
- Files: `apps/api/src/modules/feed/feed.service.ts`, `apps/api/src/modules/feed/personalized-feed.service.ts`, `apps/api/src/modules/videos/videos.service.ts`, `apps/api/src/modules/recommendations/recommendations.service.ts`
- Impact: Banned, deleted, and private user content appears in public feeds. Content from soft-deleted users remains visible.
- Fix approach: Add `isDeleted: false`, `isBanned: false`, `isDeactivated: false` WHERE clauses to all content queries that return user-facing data. Centralize into a shared `userLifecycleFilter` utility.

### 2. Scheduled Content Leaks Into Public Feeds

- Issue: 10+ feed/recommendation endpoints do not filter by `scheduledAt`. Scheduled posts appear in trending, video feeds, channel analytics, recommendations, "On This Day" memories, alt profile, and audio track listings.
- Files: `apps/api/src/modules/videos/videos.service.ts` (lines 264-278, 816-824), `apps/api/src/modules/feed/feed.service.ts` (lines 118-130), `apps/api/src/modules/recommendations/recommendations.service.ts` (line 598, 746), `apps/api/src/modules/channels/channels.service.ts` (lines 268-292), `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`
- Impact: Users see unpublished future-scheduled content. Breaks content creator workflow.
- Fix approach: Add `scheduledAt: null` or `scheduledAt: { lte: new Date() }` to all content-fetching queries. Create a shared `publishedContentFilter` Prisma fragment.

### 3. Search Indexing Broken for Most Content Mutations

- Issue: 44 of 51 content mutation paths do not update the Meilisearch search index. Users are never indexed on create or profile update. Video status changes (PROCESSING to PUBLISHED) never re-index. Reel caption field has 3 different names across codepaths (`description`, `content`, `caption`) causing zero search results for reels.
- Files: `apps/api/src/modules/users/users.service.ts`, `apps/api/src/modules/videos/videos.service.ts`, `apps/api/src/modules/reels/reels.service.ts`, `apps/api/src/modules/search/search.service.ts`, `apps/api/src/common/services/search-reconciliation.service.ts`
- Impact: Search results are stale and incomplete. Username changes invisible. New content only appears after weekly reconciliation (if configured).
- Fix approach: Wire `QueueService.addSearchIndexJob()` into all create/update/delete/ban/unban mutations via `PublishWorkflowService`. Unify reel caption field name.

### 4. Denormalized Counters Drift and Are Unreconciled

- Issue: `CounterReconciliationService` covers only 6 of 89+ denormalized counter fields. `viewsCount` for posts and threads is NEVER incremented (always 0, poisoning feed scoring). `Reel.loopsCount` is never incremented. Account deletion does not decrement other users' `followersCount`/`followingCount`. Counter decrements lack `GREATEST(0, ...)` guards (can go negative).
- Files: `apps/api/src/common/services/counter-reconciliation.service.ts` (610 lines), `apps/api/src/modules/posts/posts.service.ts`, `apps/api/src/modules/threads/threads.service.ts`, `apps/api/src/modules/reels/reels.service.ts`
- Impact: Feed ranking uses incorrect engagement signals. Follower counts inflate over time. Negative counter values possible.
- Fix approach: Implement view tracking for posts/threads. Add `GREATEST(0, ...)` to all decrement queries. Expand reconciliation to cover all 89+ counters. Add counter correction to account deletion cascade.

### 5. Dual/Deprecated Code Paths

- Issue: Multiple deprecated/dead code paths remain:
  - `apps/api/src/common/services/async-jobs.service.ts` — marked `@deprecated`, dead code
  - `apps/api/src/modules/moderation/content-safety.service.ts` — `moderateImage()` deprecated, duplicates `AiService`
  - `apps/mobile/src/services/encryption.ts` — entire file deprecated, replaced by `src/services/signal/`
  - Dual monetization paths (MonetizationService `subscribe()` creates subscriptions without Stripe)
  - Dual moderation systems (`moderation.service.ts` and `content-safety.service.ts`)
  - `apps/api/prisma/schema.prisma:1746` — `starredBy String[]` deprecated, should be join table
- Impact: Confusion about which code path is canonical. Some dead paths still callable.
- Fix approach: Delete dead code. Consolidate dual systems. Convert `starredBy` to `StarredMessage` join table in schema migration.

### 6. God Services (Excessive Size)

- Issue: Several services exceed 1000+ lines with too many responsibilities:
  - `apps/api/src/modules/islamic/islamic.service.ts` — 2,317 lines
  - `apps/api/src/modules/posts/posts.service.ts` — 2,004 lines
  - `apps/api/src/modules/messages/messages.service.ts` — 1,719 lines
  - `apps/api/src/modules/reels/reels.service.ts` — 1,352 lines
  - `apps/api/src/modules/users/users.service.ts` — 1,309 lines
  - `apps/mobile/src/services/api.ts` — 1,536 lines
  - `apps/mobile/src/services/signal/storage.ts` — 1,482 lines
- Impact: Hard to test individual behaviors. High merge conflict risk. Difficult to reason about.
- Fix approach: Extract sub-services (e.g., `IslamicPrayerService`, `IslamicQuranService`, `IslamicHadithService` from `islamic.service.ts`). Split mobile `api.ts` into domain-specific API modules.

### 7. Prisma Schema Debt (5,037 lines)

- Issue: Multiple schema-level problems documented in audit 15:
  - 8 dangling FK references without explicit Prisma relation fields
  - 3 `String[]` arrays should be proper join tables (starred messages, media URLs)
  - `Float` used for money fields (`CoinBalance.balance`, `Product.price`) instead of `Decimal`
  - Missing indexes on hot query paths (`Notification [userId, type, createdAt]`, `Reel [status, isRemoved, isTrial, createdAt]`, `Video` trending on `createdAt` but index on `publishedAt`)
  - No pgvector HNSW index on embeddings table
  - Mixed `cuid`/`uuid` primary key strategy
- Files: `apps/api/prisma/schema.prisma`
- Impact: Float precision errors on financial calculations. Slow queries at scale. Orphaned data from missing FKs.
- Fix approach: Requires coordinated schema migration. Prioritize: money fields to Decimal, hot-path indexes, join table conversions.

---

## Known Bugs

### 1. Feed Pagination Broken for Multiple Endpoints

- Symptoms: ForYou page 2+ returns empty or duplicates. Featured feed cursor filters by ID but sorts by `featuredAt` (wrong items filtered). Personalized feed cursor accepted but never used. Blended feed trending half re-fetched from scratch every page. 4 different cursor formats across feed endpoints.
- Files: `apps/api/src/modules/feed/feed.service.ts`, `apps/api/src/modules/feed/personalized-feed.service.ts`, `apps/api/src/modules/recommendations/recommendations.service.ts`
- Trigger: Load page 2+ of any feed. Most visible on trending/personalized.
- Fix approach: Standardize cursor format. Use score-based cursors for scored feeds. Cache candidate pools server-side with TTL.

### 2. Following Feed Caps at 50 Follows

- Symptoms: Users following 100+ people get an incomplete Following feed (only shows content from first 50 followees).
- Files: `apps/api/src/modules/feed/personalized-feed.service.ts`
- Trigger: User follows more than 50 accounts.
- Fix approach: Paginate follow fetch or use a JOIN-based query instead of pre-fetching follow IDs.

### 3. Reel Search Returns Zero Results

- Symptoms: Searching for reels by content finds nothing despite reels existing.
- Files: `apps/api/src/modules/reels/reels.service.ts`, `apps/api/src/modules/search/search.service.ts`
- Trigger: Search for any reel content text.
- Cause: Reel caption stored as `description` in some paths, `content` in others, but Meilisearch searchable attribute is `caption`. None match.
- Fix approach: Unify to `caption` everywhere. Re-index all reels.

### 4. Delivery Receipts Completely Broken

- Symptoms: Message delivery status never updates for recipients.
- Files: `apps/api/src/gateways/chat.gateway.ts`, `apps/mobile/app/(tabs)/risalah.tsx`
- Trigger: Send any message.
- Cause: `message_delivered` event is never emitted by mobile. Server emits `delivery_receipt` but mobile never listens.
- Fix approach: Emit `message_delivered` from mobile conversation screen. Listen for `delivery_receipt` events.

### 5. Mobile-Backend Route Drift (404s)

- Symptoms: Several mobile API calls hit nonexistent backend endpoints, returning 404.
- Files: `apps/mobile/src/services/api.ts`
- Trigger: Hadith bookmarks, video cross-publish features.
- Specific: Hadith bookmark endpoint does not exist. Video cross-publish endpoint does not exist.
- Fix approach: Create missing backend endpoints or remove dead mobile code.

---

## Security Considerations

### 1. TOTP Secrets Stored in Plaintext

- Risk: Database breach exposes all 2FA secrets, allowing attackers to generate valid TOTP codes.
- Files: `apps/api/src/modules/two-factor/two-factor.service.ts`
- Current mitigation: Clerk handles primary 2FA in production. Custom 2FA is a secondary system.
- Recommendations: Encrypt TOTP secrets with a server-side key. Implement key rotation.

### 2. Online/Offline Broadcasts Ignore Privacy Settings

- Risk: User's `activityStatus` privacy setting (who can see online status) is not checked during WebSocket connect/disconnect broadcasts. All connected users see presence changes regardless of privacy settings.
- Files: `apps/api/src/gateways/chat.gateway.ts`
- Current mitigation: None.
- Recommendations: Check `activityStatus` privacy setting before emitting `user_online`/`user_offline` events.

### 3. SanitizePipe Only Processes Top-Level Body

- Risk: Nested object properties and query/param values bypass HTML sanitization. XSS via deeply nested input or query strings.
- Files: `apps/api/src/common/pipes/sanitize.pipe.ts`
- Current mitigation: class-validator on DTOs catches most invalid input.
- Recommendations: Make SanitizePipe recursive. Apply to query and param sources.

### 4. Webhook Signup Race Condition

- Risk: New user registration requires a Clerk webhook to create the DB user record. If the webhook is delayed, the user's first API call gets a 401 (user not found in DB), breaking onboarding.
- Files: `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/auth/webhooks.controller.ts`
- Current mitigation: None.
- Recommendations: Implement a sync-user-on-first-request fallback that calls Clerk API to verify the user and create the DB record if the webhook hasn't arrived.

### 5. Call Encryption is Server-Mediated, Not True E2EE

- Risk: Go server generates and distributes call encryption keys. A compromised server can decrypt all call media.
- Files: `apps/livekit-server/internal/handler/handler.go`, `apps/mobile/src/hooks/useLiveKitCall.ts`
- Current mitigation: Keys wiped on call end. SFrame encrypts client-side media. Protects against passive observers, CDN, and LiveKit Cloud.
- Recommendations: Implement ECDH key exchange between clients via LiveKit data channel. Server never sees key material. Documented in CLAUDE.md as medium-term goal.

### 6. E2E Verification Code Not Implemented (Go Server)

- Risk: The verify-code endpoint in the Go E2E key server has a TODO instead of actual verification logic.
- Files: `apps/e2e-server/internal/handler/handler.go:441`
- Current mitigation: None. Code verification is a stub.
- Recommendations: Implement actual code comparison against stored verification codes.

### 7. user.deleted Webhook Does Not Cascade GDPR Delete

- Risk: When a user is deleted in Clerk, the webhook handler only sets `isDeactivated: true` but does not trigger the full GDPR data deletion cascade (`deleteAllUserData`). All PII remains in the database.
- Files: `apps/api/src/modules/auth/auth.service.ts:349`
- Current mitigation: Users can also delete through the app's own flow, which does cascade properly.
- Recommendations: Call `privacyService.deleteAllUserData()` from the `user.deleted` webhook handler.

---

## Performance Bottlenecks

### 1. N+1 Query Patterns in Hot Paths

- Problem: `sendMessage` makes 6-9 sequential DB queries including calling `conversation.findUnique` twice. `forwardMessage` runs 5 queries per target (25 for 5 targets). Hashtag upserts run 1-30 individual queries per post. `getExcludedUserIds()` runs 3 queries per feed request with no caching.
- Files: `apps/api/src/modules/messages/messages.service.ts`, `apps/api/src/modules/posts/posts.service.ts`, `apps/api/src/modules/feed/personalized-feed.service.ts`
- Cause: Sequential individual queries instead of batched operations.
- Improvement path: Deduplicate conversation lookups. Batch hashtag upserts with `createMany`. Cache excluded user IDs in Redis per request.

### 2. snapshotFollowerCounts OOM Risk

- Problem: Cron job fetches `take:200000` users and runs 200K individual upserts. On Railway's 512MB plan, this will crash.
- Files: `apps/api/src/modules/scheduling/scheduling.service.ts`
- Cause: Unbatched bulk operation loading entire user table.
- Improvement path: Paginate in chunks of 1000. Use raw SQL `INSERT...ON CONFLICT` for batch upserts.

### 3. Chat Presence Fan-Out

- Problem: Each WebSocket connect/disconnect broadcasts to up to 5000 conversation rooms. At scale, this means 5000 socket emits per connection event.
- Files: `apps/api/src/gateways/chat.gateway.ts`
- Cause: Direct fan-out instead of Redis pub/sub broadcast pattern.
- Improvement path: Use Redis pub/sub for presence broadcasts. Move to Elixir/Phoenix at 50-100K concurrent users (documented in CLAUDE.md scale roadmap).

### 4. Aggregate Search — 7 Sequential Full-Text Scans

- Problem: Search runs 7 sequential ILIKE scans across all content tables (posts, threads, reels, videos, users, channels, hashtags).
- Files: `apps/api/src/modules/search/search.service.ts`
- Cause: Meilisearch not deployed; fallback to Postgres ILIKE.
- Improvement path: Deploy Meilisearch on Railway (or configure `MEILISEARCH_HOST` env var). Add `pg_trgm` GIN indexes as interim.

### 5. Redis Dependency Without Circuit Breaker

- Problem: Multiple critical paths depend on Redis with no fallback or circuit breaker. Production Redis failure = 500 errors everywhere. Feature flags all return `false` when Redis is down (silent feature disablement). Payment webhook idempotency depends solely on Redis.
- Files: `apps/api/src/config/redis.module.ts`, `apps/api/src/common/services/feature-flags.service.ts`, `apps/api/src/modules/payments/stripe-webhook.controller.ts`
- Cause: No circuit breaker pattern (opossum package is installed but not wired to Redis).
- Improvement path: Wrap Redis calls with opossum circuit breaker. Add DB fallback for payment idempotency keys.

---

## Fragile Areas

### 1. Payment Webhook Handling

- Files: `apps/api/src/modules/payments/stripe-webhook.controller.ts`, `apps/api/src/modules/payments/payments.service.ts`
- Why fragile: Coin purchase webhook lacks idempotency guard (duplicate webhook = double credit). Tip fallback uses `findFirst` by `senderId` + `pending` status, which matches the wrong tip under concurrency. Payment/subscription mapping stored only in Redis (lost on flush). `stripePaymentId` stored in wrong schema field (`stripeSubId`).
- Safe modification: Always add idempotency checks before crediting. Use DB-backed dedup keys, not Redis-only.
- Test coverage: Tests mock `$transaction` to auto-succeed. No real money math verification.

### 2. Cron Job System (14 Jobs)

- Files: `apps/api/src/modules/scheduling/scheduling.service.ts`, `apps/api/src/modules/islamic/islamic-notifications.service.ts`
- Why fragile: Zero Sentry integration in any cron job (all fail silently). 8 of 14 jobs have no error handling. `publishScheduledMessages` can duplicate sends (no distributed lock). `sendVerseOfTheDay` has invalid Quran reference calculation. `checkIslamicEventReminders` uses approximate Hijri conversion (events may fire on wrong days). Schedule collisions at 3 AM and 4 AM.
- Safe modification: Always wrap cron logic in try/catch with Sentry capture. Add distributed locks for mutation crons.
- Test coverage: No cron-specific tests exist.

### 3. Chat WebSocket Gateway

- Files: `apps/api/src/gateways/chat.gateway.ts` (1,020 lines)
- Why fragile: Multiple independent socket connections per user (2-4). Token refresh race condition during reconnection. `join_content`/`leave_content` events have no auth check or rate limit. Redis adapter falls back to in-memory silently (no warning). Typing indicators have no server-side timeout. `WsSendMessageDto.conversationId` validated with `@IsString()` not `@IsUUID()`.
- Safe modification: Add auth checks to all event handlers. Implement singleton socket manager on mobile.
- Test coverage: Rate limit tests exist but no end-to-end WebSocket integration tests.

### 4. useLiveKitCall Hook (Mobile)

- Files: `apps/mobile/src/hooks/useLiveKitCall.ts` (719 lines)
- Why fragile: Cannot be tested in Jest (`@livekit/react-native` requires native modules). All logic is in one monolithic hook. Zero runtime testing has ever been done (no EAS build exists). Base64 key string exposed on JS heap for 5-30s (V8 GC window).
- Safe modification: Extract state machine to pure `callStateMachine.ts`. Test state transitions independently.
- Test coverage: Utility tests only (49 tests for base64, emoji, active room registry, callkit). Core hook logic untested.

---

## Scaling Limits

### 1. WebSocket Gateway (Node.js)

- Current capacity: ~10K concurrent connections.
- Limit: Node.js single-threaded event loop cannot handle fan-out at 50K+ concurrent users. Each connection costs ~10KB. 100K concurrent = 1GB connection state.
- Scaling path: Documented in CLAUDE.md. Migrate chat gateway to Elixir/Phoenix at 50-100K users. BEAM VM handles 2KB per process.

### 2. Feed Scoring (In-Memory)

- Current capacity: 200-row candidate ceiling for trending/personalized feeds.
- Limit: All scoring happens in-memory in Node.js after fetching candidates. Cannot scale beyond ~200 candidates without DB-side scoring.
- Scaling path: Move scoring to PostgreSQL with materialized views or precomputed score columns. Documented as "50-100K users: Go workers" in CLAUDE.md.

### 3. Prisma Connection Pool

- Current capacity: Default 3-5 connections (no explicit `?connection_limit` in `DATABASE_URL`).
- Limit: Moderate concurrent load exhausts pool. Neon serverless has its own limits.
- Scaling path: Add `?connection_limit=20` to `DATABASE_URL`. Use Neon's connection pooler (pgbouncer).

---

## Dependencies at Risk

### 1. Redis as Single Point of Failure

- Risk: 15 key patterns have NO database backup. Data loss on Redis flush includes: payment intent mappings, A/B test configs, feature flags, device account counters, group invite links, followed mosque data, community dhikr counters, prayer DND status.
- Impact: Redis failure or flush = broken payments, disabled features, lost ephemeral data.
- Migration plan: Add DB-backed fallback for critical patterns (payments, feature flags). Accept Redis-only for non-critical caches.

### 2. AsyncJobService (Dead Code)

- Risk: `apps/api/src/common/services/async-jobs.service.ts` is marked `@deprecated` but still injected in health controller. Has dangling `setTimeout` timers with no `OnModuleDestroy` cleanup.
- Impact: Memory leak from uncancellable timers. Confusion about queue architecture.
- Migration plan: Delete entirely. Remove from health controller.

### 3. Zero Real-Device Testing

- Risk: All E2E encryption code (22 files, ~10K lines), LiveKit calling (hook + Go server), CallKit/ConnectionService integration, and cert pinning are untested on actual hardware. Blocked on Apple Developer enrollment ($99).
- Impact: Unknown number of runtime failures await first EAS build.
- Migration plan: Purchase Apple Developer enrollment. Create EAS build. Execute runtime verification checklist documented in CLAUDE.md.

---

## Missing Critical Features

### 1. No Scheduled Content Auto-Publisher

- Problem: Posts with `scheduledAt` in the past are published by a cron job, but the cron has no distributed lock (duplicate sends), no error handling, and no Sentry monitoring. Scheduled messages also lack an auto-send mechanism.
- Blocks: Content scheduling feature is unreliable.
- Files: `apps/api/src/modules/scheduling/scheduling.service.ts`

### 2. No Dead Letter Queue for Failed Jobs

- Problem: BullMQ jobs that exhaust retries are silently lost. No DLQ mechanism exists.
- Blocks: Failed push notifications, search indexing, and moderation jobs are invisible.
- Files: `apps/api/src/common/queue/queue.module.ts`

### 3. EXIF Stripping Not Wired

- Problem: `sharp` is installed but not wired into the upload pipeline. Direct-to-R2 presigned uploads bypass the server entirely. No post-upload hook exists to strip EXIF metadata.
- Blocks: User location data leaks via photo EXIF metadata.
- Files: `apps/api/src/common/queue/processors/media.processor.ts`

---

## Test Coverage Gaps

### 1. API: All Tests Mock Prisma (Zero DB Integration Tests)

- What's not tested: Actual SQL queries, constraint enforcement, transaction isolation, cascade behavior.
- Files: All 315 test files in `apps/api/src/` mock Prisma.
- Risk: SQL column mismatches, failed transactions, and constraint violations only caught in production.
- Priority: High. Go microservices (`apps/e2e-server`, `apps/livekit-server`) have the same issue — raw SQL queries tested against mock stores, not real databases.

### 2. Payment Money Math Untested

- What's not tested: Actual financial calculations (coin credits, diamond conversions, tip fee subtraction). Tests mock `$transaction` to auto-succeed.
- Files: `apps/api/src/modules/payments/payments.service.ts`, `apps/api/src/modules/monetization/monetization.service.ts`
- Risk: Financial calculation errors (double credits, wrong fees) only caught in production.
- Priority: High.

### 3. Mobile Screens Have 19 Test Files for 218 Screens

- What's not tested: 199 screens have zero test coverage. All screen-level testing relies on TypeScript compilation only.
- Files: `apps/mobile/app/` (218 `.tsx` files), `apps/mobile/src/` (19 test files)
- Risk: Runtime crashes, broken navigation, incorrect data display.
- Priority: Medium. TypeScript compilation catches type errors but not logic bugs.

### 4. Cron Jobs Have Zero Tests

- What's not tested: All 14 scheduled cron jobs (`@Cron()` decorated methods).
- Files: `apps/api/src/modules/scheduling/scheduling.service.ts`, `apps/api/src/modules/islamic/islamic-notifications.service.ts`
- Risk: Silent failures, duplicate operations, invalid calculations (Verse of Day, Hijri events).
- Priority: High.

### 5. WebSocket Gateway End-to-End Untested

- What's not tested: Full WebSocket lifecycle (connect, auth, join room, send message, receive, disconnect). Rate limiting tested in isolation only.
- Files: `apps/api/src/gateways/chat.gateway.ts`
- Risk: Connection management bugs, race conditions, dropped messages.
- Priority: Medium.

### 6. Content Moderation Path Untested

- What's not tested: `globalMockProviders` forces AI moderation to always return "safe". No test ever exercises the "unsafe content detected" path.
- Files: `apps/api/src/common/test/mock-providers.ts:123`, `apps/api/src/modules/moderation/moderation.service.ts`
- Risk: Moderation failures or bypasses not caught by tests.
- Priority: Medium.

---

## Redis Data at Risk (No DB Backup)

| Key Pattern | Risk Level | Impact |
|-------------|-----------|--------|
| `payment_intent:*` | Critical | Lost = double-charge or lost payment |
| `stripe_customer:*` | High | Lost = orphaned Stripe customers |
| `subscription:*` | High | Lost = subscription state unknown |
| `group_invite:*` | Medium | Lost = all invite links dead |
| `feature_flag:*` | Medium | Lost = all features disabled |
| `ab_test:*` | Medium | Lost = experiment configs gone |
| `device_accounts:*` | Low | Lost = device counter reset |
| `community:dhikr:today` | Low | Lost = daily counter reset |
| `mosque:followed:*` | Low | Lost = followed mosque data gone |
| `prayer:dnd:*` | Low | Lost = prayer DND disabled silently |

Files: `apps/api/src/common/services/feature-flags.service.ts`, `apps/api/src/modules/payments/payments.service.ts`, `apps/api/src/modules/islamic/islamic.service.ts`

---

## Process.env Direct Access (Bypasses ConfigService)

Several files still read `process.env` directly instead of using NestJS `ConfigService`, creating coupling to environment and making testing harder:

- `apps/api/src/main.ts` — 8 direct reads (NODE_ENV, CORS_ORIGINS, API_URL, PORT)
- `apps/api/src/app.module.ts` — 3 direct reads (NODE_ENV, REDIS_URL)
- `apps/api/src/config/sentry.ts` — 6 direct reads
- `apps/api/src/config/socket-io-adapter.ts` — 1 direct read (REDIS_URL)
- `apps/api/src/config/redis.module.ts` — 2 direct reads
- `apps/api/src/gateways/chat.gateway.ts` — 2 direct reads (CORS_ORIGINS, NODE_ENV)
- `apps/api/src/modules/notifications/push.service.ts` — 1 direct read (EXPO_ACCESS_TOKEN)

Fix approach: Migrate to ConfigService injection. For `main.ts` (bootstrap), this is acceptable since ConfigService is not yet available.

---

## External Blockers (No Code Fix Possible)

| Blocker | Impact | Status |
|---------|--------|--------|
| Apple Developer ($99) | No EAS build, no TestFlight, no cert pinning, no VoIP push | Blocked |
| Device attestation modules | Play Integrity / App Attest stubs ready, need native modules + device | Blocked |
| Formal verification (Tamarin/ProVerif) | Signal Protocol unverified | $50-100K project |
| Professional security audit | No third-party validation | $50-100K project |
| Zero real-device testing | All E2E, LiveKit, CallKit code untested on hardware | Blocked on Apple Developer |
| NCMEC registration | CSAM reporting legally required for US launch | Legal process |
| AU eSafety Commissioner | Required for Australian user base | Legal process |

---

*Concerns audit: 2026-03-30*
