# MASTER AUDIT REPORT — Deep Audit 2026-03-26

**37 findings files. 3 waves. ~400 individual findings. This is the consolidated truth.**

---

## 1. EXECUTIVE VERDICT

Mizanly is not production-ready. The platform has extensive surface area (80 modules, 193 models, 213 screens) but the seams between modules are broken: payments silently lose money, deletions violate GDPR, banned users' content stays visible in 42+ queries, ForYou feed pagination returns zero results beyond page 1, and every uploaded photo leaks GPS coordinates. The 5,311-test suite creates dangerous false confidence because every test mocks Prisma (zero integration tests against a real database), payment tests verify routing but not money math, and deletion tests do not verify PII anonymization. The system cannot be deployed to real users without fixing at minimum the top 20 findings below, which represent data loss, legal liability, and silent financial errors.

---

## 2. TOP 20 HIGHEST-SEVERITY FINDINGS

Ranked by danger (legal exposure, money loss, data loss, user-facing breakage).

| # | Finding | Severity | Source | Evidence |
|---|---------|----------|--------|----------|
| 1 | **Scheduled deletion cron queries WRONG FIELD -- users are NEVER deleted** | P0-LEGAL | wave1-export-delete F1, wave2-deletion-cascade #3 | `privacy.service.ts:18-23` queries `deletedAt` but the field set by `requestAccountDeletion` is `scheduledDeletionAt`. Every GDPR deletion request is a permanent black hole. |
| 2 | **28+ GDPR Article 9 (religious) data models never deleted on account deletion** | P0-LEGAL | wave2-deletion-cascade #2 | QuranReadingPlan, DhikrSession, FastingLog, HajjProgress, HifzProgress, PrayerNotificationSetting, and 22+ more models with special-category personal data survive deletion entirely. |
| 3 | **Every uploaded photo leaks GPS coordinates (EXIF never stripped)** | P0-PRIVACY | wave1-media-privacy F1+F2 | `addMediaJob()` does not exist in `queue.service.ts`. `MediaProcessor` is dead code. Direct-to-R2 presigned upload bypasses server entirely. |
| 4 | **Stripe webhook dedup key set BEFORE handler -- handler failure = permanent money loss** | P0-MONEY | wave1-payment-webhook F1, wave2-payment-wallet-webhook B1 | `stripe-webhook.controller.ts:77` sets Redis dedup key, then calls handler. Handler error + Stripe retry = dedup blocks retry permanently (7-day TTL). Affects ALL 7 webhook event types. |
| 5 | **Gift send debit OUTSIDE transaction -- crash = coins lost with no audit trail** | P0-MONEY | wave1-wallet-source-truth F3, wave3-transaction-isolation G1 | `gifts.service.ts:130` debit is a separate operation from `$transaction` at line 140. Partial failure = permanent coin loss. |
| 6 | **Cashout destroys diamonds but never initiates Stripe payout** | P0-MONEY | wave1-wallet-source-truth F9, wave2-payment-wallet-webhook B3 | `gifts.service.ts:267-318`, `monetization.service.ts:464-519` -- both deduct diamonds, create CoinTransaction, but ZERO Stripe API calls. User sees "success" but no USD transfers. |
| 7 | **Waqf/Zakat/Charity/Treasury accept "donations" with NO payment collection** | P0-MONEY | wave1-payment-webhook F4+F5, wave2-payment-wallet-webhook B4 | `commerce.service.ts:598-636` increments `raisedAmount` from request body. Anyone can POST arbitrary amounts -- free counter inflation. |
| 8 | **ForYou feed pagination returns ZERO results beyond page 1** | P0-UX | wave1-cursor-pagination F12, wave2-feed-scoring-truth | `posts.service.ts:176+193`, `reels.service.ts:317+341`, `threads.service.ts:150+173` -- cursor="20" parsed as `new Date("20")` = Invalid Date, kills all createdAt results. |
| 9 | **Credentials committed to source control (.env tracked by git)** | P0-SECURITY | wave1-config-misfire F1 | Live Neon DB password, Clerk keys, Stripe keys, all API keys, TOTP encryption key in plain text. TOTP key exposure = all 2FA secrets decryptable. |
| 10 | **42 content queries missing `isBanned: false` -- banning users has no effect on content visibility** | P0-TRUST | wave1-visibility-lifecycle F1, wave2-ban-visibility | 42 queries across 9 services (feed, personalized-feed, recommendations, threads, posts, reels, hashtags, search, stories) show banned users' content. |
| 11 | **Auto-unban does NOT clear `isDeactivated` -- temp-banned users permanently locked out** | P0-TRUST | wave2-ban-visibility #1 | `clerk-auth.guard.ts:55-67` clears `isBanned` but NOT `isDeactivated` (set by admin ban). User hits isDeactivated check forever. |
| 12 | **New user signup race: webhook delay = 401 on register** | P0-UX | wave1-auth-webhook F1 | `/auth/register` requires DB user created by `user.created` webhook. Webhook delay (seconds to minutes) = "User not found" for every new signup. |
| 13 | **R2 media NEVER deleted on account deletion -- photos/videos accessible forever** | P1-LEGAL | wave1-export-delete F2, wave2-deletion-cascade #4 | `users.service.ts:238-316`, `privacy.service.ts:199-298` soft-delete DB records only. 50+ URL fields across 27+ models orphaned. |
| 14 | **Messages NOT anonymized or deleted on account deletion** | P1-LEGAL | wave1-export-delete F4, wave2-deletion-cascade #1 | Neither `deleteAccount` nor `deleteAllUserData` touches messages. All DM content remains readable to other conversation members. |
| 15 | **View-once/disappearing messages never expire (processExpiredMessages is dead code)** | P1-PRIVACY | wave3-cron-reliability | `messages.service.ts:1251` has no `@Cron` decorator. View-once messages persist forever. |
| 16 | **Posts and Threads never indexed in search on creation** | P1-UX | wave1-search-indexing F1+F2, wave2-publication-search | `posts.service.ts:477-731`, `threads.service.ts:329-433` -- zero `addSearchIndexJob` calls. New content invisible to search for up to 7 days (weekly reconciliation). |
| 17 | **PublishWorkflowService is dead code -- never called by any content service** | P1-ARCH | wave1-publication-workflow F1, wave1-search-indexing F9, wave2-publication-search | Zero references from posts/reels/threads/stories/videos. This single failure is the root cause of search indexing gaps, inconsistent cache invalidation, and missing publication-time side effects. |
| 18 | **Mobile/backend endpoint method mismatches cause 404s for encryption, reels, conversations** | P1-UX | wave1-mobile-backend-drift F1-F4 | Encryption bulk keys: POST vs GET. Reel archive: POST vs PATCH. Pin conversation: wrong path. Auto-play setting: case mismatch. 4 guaranteed runtime failures. |
| 19 | **Messages have NO push notification** | P1-UX | wave2-notification-push-socket #6 | `messages.service.ts` imports `PushTriggerService` but NEVER calls it. Offline users get zero notification of new messages. |
| 20 | **Channel post like has NO dedup -- unlimited like inflation** | P1-EXPLOIT | wave3-transaction-isolation G3 | `channel-posts.service.ts:72-93` -- no `findUnique` check, no P2002 catch, no unique constraint. Any user can spam unlimited likes. |

---

## 3. SYSTEMIC ROOT CAUSES

These are not individual bugs. They are architectural patterns that generated dozens of bugs each.

### RC1: PublishWorkflowService built but never wired (Dead Orchestration Layer)
- **Built:** `publish-workflow.service.ts` with `onPublish()`/`onUnpublish()` methods for search indexing, cache invalidation, analytics, notifications.
- **Reality:** Zero calls from any content service. Each service independently (and incompletely) handles side effects.
- **Generated bugs:** 44 missing search index paths (wave2-publication-search), inconsistent cache invalidation, scheduled content firing side effects at creation not publication (wave2-scheduled-lifecycle), missing publication-time notifications.
- **Sources:** wave1-publication-workflow F1, wave1-search-indexing F9, wave2-publication-search, wave2-scheduled-lifecycle #1-#2

### RC2: Two independent deletion implementations with different coverage
- **`deleteAccount` (users.service.ts)** and **`deleteAllUserData` (privacy.service.ts)** evolved separately. Each covers tables the other misses. Neither is complete. Together they still miss ~120 of 169 user-linked models.
- **Generated bugs:** GDPR Art 9 religious data persists, messages survive, R2 media orphaned, Redis keys with PII persist, Meilisearch documents survive, counters on other users never decremented.
- **Sources:** wave1-export-delete F1-F9, wave2-deletion-cascade (full matrix)

### RC3: No standard user lifecycle filter applied to queries
- The platform has `isDeactivated`, `isBanned`, `isDeleted`, `isPrivate` fields on User but no shared utility enforces them. Each query author must manually add the right combination.
- **Generated bugs:** 42 queries missing `isBanned` (wave2-ban-visibility), 25 queries missing `isDeleted` (wave2-feed-scoring-truth), 5 queries missing `isPrivate`, 4 missing `visibility` checks, block/mute caps ranging from 0 to 10000 across services.
- **Sources:** wave1-visibility-lifecycle, wave2-ban-visibility, wave2-feed-scoring-truth

### RC4: Redis as sole state store for critical data (no DB backup)
- 15 Redis key patterns hold data with NO database backup: payment mappings, device counters, feature flags, A/B test assignments/conversions, group invite links.
- **Generated bugs:** Redis flush = payment webhooks can't find tips, device limits bypassed, features disappear, experiments invalidated, invite links break.
- **Sources:** wave1-redis-fake-success, wave2-redis-dependency-map

### RC5: No shared API contract between mobile and backend
- Mobile and backend modified independently across 7 sessions. No OpenAPI generation, no type sharing, no contract tests.
- **Generated bugs:** 4 guaranteed 404/405 runtime failures (encryption, reel archive, pin conversation, auto-play), semantic mismatches in search suggestions, dead hadith bookmark endpoint.
- **Sources:** wave1-mobile-backend-drift

### RC6: Notification service bypass paths
- `NotificationsService.create()` correctly handles self-notification guard, settings check, block/mute, dedup, push delivery, socket delivery. But 6 call sites use direct `prisma.notification.create()`, bypassing everything. Additionally, reel/thread likes use wrong notification types, causing push routing to silently skip them.
- **Generated bugs:** No push for verse-of-day, khatm, Islamic events, admin warnings, screen time digest. No push for reel likes/comments, thread likes/reposts. Messages have no push at all.
- **Sources:** wave1-notification-ownership, wave2-notification-push-socket

### RC7: Dual service paths for the same business operation
- Tips: `PaymentsService.sendTip` (creates Stripe PI) vs `MonetizationService.sendTip` (no PI, stuck pending forever). Subscriptions: same pattern. Cashout: two paths, neither pays out.
- **Generated bugs:** Mobile must know which service to call. Wrong choice = permanently stuck payment.
- **Sources:** wave2-payment-wallet-webhook B7-B9

---

## 4. CROSS-MODULE SEAM FAILURES

These are places where two modules assume different truths about the same data.

| Seam | Module A Says | Module B Says | Consequence |
|------|--------------|---------------|-------------|
| **Ban enforcement** | `admin.service.ts` sets `isBanned:true` + `isDeactivated:true` | `reports.service.ts` sets `isBanned:true` only (no isDeactivated) | Report-banned users bypass 65% of filters that only check isDeactivated |
| **Auto-unban** | `clerk-auth.guard.ts` clears `isBanned` + `banExpiresAt` | Does NOT clear `isDeactivated` | Temp-banned users permanently locked out (wave2-ban-visibility #1) |
| **Notification types** | `reels.service.ts` sends type `'LIKE'`/`'COMMENT'` | `PushTriggerService` routes LIKE by checking `postId` (null for reels) | Zero push for reel likes/comments (wave2-notification-push-socket #1-2) |
| **Scheduled content** | Content services fire side effects at creation | `publishOverdueContent` only nullifies scheduledAt (no side effects) | Users notified about content that doesn't exist yet; search indexes future content (wave2-scheduled-lifecycle) |
| **Reel caption field** | `reels.service.ts` indexes as `description` | `meilisearch-sync.service.ts` indexes as `content` | Meilisearch config has `caption` as searchable -- none match, reel search returns zero (wave2-publication-search) |
| **Deletion scope** | `users.service.ts deleteAccount` covers some tables | `privacy.service.ts deleteAllUserData` covers different tables | Together they still miss ~120 models. Neither calls the other. (wave2-deletion-cascade) |
| **Deletion trigger** | `requestAccountDeletion` sets `scheduledDeletionAt` | Cron queries `deletedAt` (wrong field) | Deletions never execute (wave1-export-delete F1) |
| **cancelSchedule vs publishNow** | Both set `scheduledAt: null` | Semantically opposite operations | "Cancel" accidentally publishes (wave2-scheduled-lifecycle #6) |
| **Socket events** | Server emits `new_notification`, `messages_read` | Mobile never listens for either | Real-time notification badges and read receipts dead (wave1-realtime-presence F4, wave1-unread-counts F1) |
| **Following feed cap** | `posts.service.ts:220` takes 50 followings | Users can follow 5000+ accounts | Users following 51+ accounts get incomplete Following feed (wave3-n1-query-hotpaths F4) |

---

## 5. PERFORMANCE & SCALE HAZARDS

What breaks first under load, ordered by likelihood.

| Hazard | Trigger | Impact | Source |
|--------|---------|--------|--------|
| **GDPR export OOM** | Single export request from power user | 26 uncapped parallel queries, hundreds of MB, pool exhaustion. Multiple concurrent exports = server crash. | wave3-memory-connection-leaks R9 |
| **Presence fan-out thundering herd** | 1K concurrent socket connections | 5K emit calls per connect/disconnect = 5M emits. Socket.io adapter overwhelmed. | wave3-memory-connection-leaks R5, wave1-fanout-amplification F4 |
| **Follower snapshot OOM** | Daily 2 AM cron on 200K users | `take:200000` into memory + 200K upserts. OOM on Railway 512MB. | wave3-cron-reliability, wave3-memory-connection-leaks R8 |
| **Prisma pool exhaustion** | 20+ concurrent feed requests | Default pool 3-5 connections. Each feed = 8-14 queries. GDPR export = 26 parallel queries. P2024 timeouts. | wave3-memory-connection-leaks R16 |
| **Search ILIKE sequential scans** | Any search query | `ILIKE '%query%'` = full table scan on posts, threads, reels, videos, users, hashtags, channels. 7 sequential scans per aggregate search. | wave1-hot-query-indexes F10, wave3-n1-query-hotpaths F9 |
| **Block/mute cache miss amplification** | Popular user opens any feed | 3 queries x take:10000 per feed request (Block + Mute + Restrict). No caching. Tab switch = 9 identical queries. | wave3-n1-query-hotpaths F1 |
| **Analytics buffer unbounded growth** | Redis outage | Events pushed back into buffer on flush failure. New events keep arriving. ~1.2 MB/min memory growth until OOM. | wave3-memory-connection-leaks R1 |
| **Unbounded notification DELETE** | `cleanupOldNotifications` cron (3 AM daily) | No `take` limit. Millions of rows = table lock for minutes. | wave3-cron-reliability |
| **redis.keys() blocking scan** | Any A/B test or feed cache operation | O(N) blocking scan in 4+ production paths. At 100K keys, blocks Redis for hundreds of ms. | wave2-redis-dependency-map |
| **ForYou feed 200-row ceiling** | Popular hashtag with 5000+ posts in 72h | Only 200 most recent scored. Most popular content may not be in the 200 window. | wave1-trending-window F3, wave2-feed-scoring-truth |

---

## 6. SECURITY / PRIVACY / TRUST ISSUES

| Issue | Risk Level | Source | Detail |
|-------|-----------|--------|--------|
| **Credentials in git** | CRITICAL | wave1-config-misfire F1 | .env with all production keys committed. TOTP encryption key = all 2FA secrets decryptable. |
| **EXIF GPS leak on all uploads** | CRITICAL | wave1-media-privacy F1-F6 | addMediaJob() doesn't exist. Direct-to-R2 bypass. 27/28 image picker calls missing exif:false (and it doesn't strip file bytes anyway). |
| **SSRF blocklist bypassable** | HIGH | wave1-sanitization F2 | Decimal IP (2130706433), IPv6 mapped, octal notation, DNS rebinding all bypass substring matching. 4 locations. |
| **SSRF redirect bypass** | HIGH | wave1-sanitization F7 | `og.service.ts:278` follows redirects WITHOUT re-validating destination. Allowed domain 301 to internal IP. |
| **Online/offline ignores privacy setting** | HIGH | wave1-realtime-presence F1 | `chat.gateway.ts:264-272` broadcasts unconditionally. Users who disabled activity visibility still appear online. |
| **Rate limiter uses in-memory storage** | HIGH | wave1-redis-fake-success F6 | `ThrottlerModule` with no storage option = default in-memory. Resets on deploy. Per-instance only. |
| **ScholarVerification.documentUrls survive deletion** | HIGH | wave2-deletion-cascade #5 | Identity documents (government IDs) persist after account deletion. |
| **Device account limit bypassed on Redis flush** | MEDIUM | wave1-redis-fake-success F2 | Counter stored in Redis only. Flush = unlimited accounts per device. |
| **NODE_ENV unset = Swagger + stack traces** | MEDIUM | wave1-config-misfire F13 | Development behavior in production: Swagger exposed, stack traces leaked, CORS open. |
| **SanitizePipe skips nested objects** | MEDIUM | wave1-sanitization F1 | Only sanitizes top-level string fields. Nested XSS possible. |

---

## 7. DATA INTEGRITY & TRUTH-BOUNDARY ISSUES

### Counter Drift
- **89 denormalized counters** identified. Only 6 have reconciliation (~7%). The other 83 can drift permanently.
- `Reel.loopsCount` is NEVER incremented (always 0). `Post.viewsCount` and `Thread.viewsCount` are NEVER incremented (always 0), which poisons feed scoring (viewsCount * 0.1 = always 0).
- Account deletion does NOT decrement counters on other users' followersCount/followingCount.
- **Sources:** wave1-denormalized-state, wave1-follower-counters

### Search Index Staleness
- 44 of 51 content mutation paths do NOT update search index. Only deletes are consistently indexed.
- Users are NEVER indexed on create or profile update. Reel caption search returns zero results due to field name mismatch (`description` vs `content` vs `caption`).
- Weekly reconciliation covers posts/threads/reels but NOT videos/users/hashtags. Reconciliation also has wrong field names.
- **Sources:** wave1-search-indexing, wave2-publication-search

### Feed Scoring Inconsistency
- Same content gets different scores across endpoints (100 likes = 300 in ForYou, 100 in Trending).
- 3 distinct decay formulas, 5 distinct time windows across services.
- Trending hashtags have NO time window or decay -- cumulative lifetime counters.
- Score weights can exceed 1.0 when boost flags active (followedHashtag +0.15, verifiedScholar +0.10, newCreator +0.05).
- **Sources:** wave1-trending-window, wave2-feed-scoring-truth

### Pagination Breakage
- 6 feed endpoints have broken pagination: 3 ForYou feeds return empty on page 2+, 3 trending feeds re-serve page 1.
- Personalized feed cursor is accepted but ignored -- same 500 candidates re-scored every page.
- 4 different cursor formats across feed endpoints.
- **Sources:** wave1-cursor-pagination, wave2-feed-scoring-truth

---

## 8. OPERATIONAL & OBSERVABILITY GAPS

### Cron Reliability
- 14 @Cron jobs + 1 dead code method. ZERO have Sentry integration. 8 of 14 have NO error handling.
- No overlap/lock protection. `publishScheduledMessages` can cause duplicate sends.
- `processExpiredMessages` has no @Cron decorator -- disappearing messages never disappear.
- GDPR `processScheduledDeletions` queries the wrong field (never fires), and if it fails silently, no one knows.
- **Sources:** wave3-cron-reliability

### Redis Dependency Brittleness
- 64 Redis key patterns across 25 source files. 15 patterns have NO DB backup.
- 4 patterns are dead data (written but never read): `dm_shares`, `prayer_queue`, `session:depth`, `analytics:events`.
- 10+ patterns have no TTL (unbounded memory growth).
- Production Redis failure after startup has no circuit breaker -- cascading errors on every user action.
- **Sources:** wave2-redis-dependency-map, wave1-redis-fake-success, wave1-queue-noop F1

### Observability Black Holes
- Correlation IDs NOT propagated beyond HTTP boundary. Cannot trace request through queue/socket/cron.
- Sentry captures ONLY HTTP filter errors. Queue failures, socket errors, cron failures invisible.
- 25 occurrences of `.catch(() => {})` across 15 services (silent error swallowing).
- No Prisma query-level timing. No queue job duration tracking. Socket connect/disconnect not logged.
- Health endpoint (`/health/live`) always returns 200 regardless of Redis/DB state. Railway routes traffic based on this.
- **Sources:** wave1-observability

---

## 9. TEST / TOOLING BLIND SPOTS

The 5,311 tests create **significant false confidence**:

| Blind Spot | Evidence | Source |
|-----------|----------|--------|
| **Zero database integration tests** | Every spec mocks Prisma. CI starts PostgreSQL but no test connects to it. WHERE clauses, transaction semantics, cascade deletes all untested against real DB. | wave1-test-blind-spots F5 |
| **Payment tests verify routing, not money math** | `$transaction` callback mocked to auto-succeed. Coin amounts, user IDs never verified. | wave1-test-blind-spots F6 |
| **Tests with zero assertions** | `payments.service.spec.ts:225-228` calls handler, asserts nothing. `push.service.spec.ts:121-133` two error tests with zero assertions. | wave1-test-blind-spots F1 |
| **Concurrency tests assert "did not crash" only** | 10 spec files use Promise.allSettled then check `status.toBeDefined()`. Never verify final counter values. | wave1-test-blind-spots F4 |
| **Deletion tests don't verify anonymization** | Only check `{ deleted: true }` return. PII fields never verified as cleared. | wave1-test-blind-spots F8 |
| **379 toBeDefined() assertions** | Many are the sole assertion in a test, proving the return value is not undefined (always true for objects). | wave1-test-blind-spots F3 |
| **AI moderation always mocked "safe"** | `globalMockProviders` sets ContentSafety to always safe. Moderation integration untested. | wave1-test-blind-spots F12 |
| **29 "should be defined" boilerplate tests** | Pure count padding. | wave1-test-blind-spots F2 |

---

## 10. FIXED vs PARTIAL vs OPEN

### FIXED (confirmed resolved)
| Item | Evidence |
|------|----------|
| Dual CoinBalance system (User.coinBalance removed) | wave1-denormalized-state F8 |
| Webhook signature verification (Clerk + Stripe) | wave1-auth-webhook F7, wave1-payment-webhook positive |
| SQL injection (all $queryRawUnsafe validated) | wave1-sanitization F4 |
| Basic feed scheduledAt filters (70+ queries across 8 services) | wave1-scheduled-publishing "Correctly Filtered" section |
| Block/mute cap raised to 10000 in threads/reels/feed/personalized-feed | wave2-feed-scoring-truth (4 services at 10000) |
| ChatGateway OnModuleDestroy (timer cleanup, Redis unsubscribe) | wave3-memory-connection-leaks R4 |
| Redis production boot requires REDIS_URL | wave2-redis-dependency-map |

### PARTIAL (started but incomplete)
| Item | What's Done | What's Missing |
|------|------------|----------------|
| Scheduled content filtering | 70+ queries filtered | 7+ queries still missing (wave1-scheduled-publishing F1-F9) |
| Counter reconciliation | 6 of 89 counters reconciled | 83 counters can drift permanently |
| Search reconciliation | Posts/threads/reels covered | Videos/users/hashtags not covered; field name mismatches |
| Block/mute enforcement | 4 services at 10000 | 4 services at 50, 2 services at 0 (wave2-feed-scoring-truth) |
| Account deletion | ~49 of 169 models handled | ~120 models survive; R2 media never deleted; Redis/Meilisearch not cleaned |
| Notification pipeline | Core service well-designed | 6 bypass paths, wrong types for reels/threads, no message push |

### OPEN (not addressed at all)
| Item | Source |
|------|--------|
| EXIF stripping (dead code, no architecture for post-upload processing) | wave1-media-privacy |
| ForYou feed pagination (page 2+ returns empty) | wave1-cursor-pagination F12 |
| Trending pagination (page 2 = page 1) | wave2-feed-scoring-truth |
| Credentials in git | wave1-config-misfire F1 |
| All payment atomicity gaps (gift debit, cashout, waqf) | wave3-transaction-isolation |
| All 42 isBanned missing queries | wave2-ban-visibility |
| Auto-unban isDeactivated bug | wave2-ban-visibility #1 |
| All 44 missing search index mutation paths | wave2-publication-search |
| PublishWorkflowService wiring | wave1-publication-workflow F1 |
| Disappearing messages (dead cron) | wave3-cron-reliability |
| All cron Sentry/error handling | wave3-cron-reliability |
| SSRF blocklist bypass | wave1-sanitization F2, F7 |
| In-memory rate limiter | wave1-redis-fake-success F6 |
| Webhook dedup ordering | wave1-payment-webhook F1 |
| Message push notifications | wave2-notification-push-socket #6 |
| Mobile socket event listeners (3 server events never consumed) | wave1-realtime-presence F4, wave1-unread-counts F1 |
| GDPR export uncapped queries | wave3-memory-connection-leaks R9 |
| Prisma pool configuration | wave3-memory-connection-leaks R16 |
| Redis key unbounded memory growth | wave2-redis-dependency-map |

---

## 11. IMMEDIATE REMEDIATION ORDER

Ranked by (risk * breadth) / effort. Fix in this order.

### TIER 1 -- STOP THE BLEEDING (do before any user touches the system)

| Priority | Fix | Effort | Blocks | Sources |
|----------|-----|--------|--------|---------|
| 1.1 | **Rotate all credentials; remove .env from git; add to .gitignore** | 2h | Everything -- any leaked key compromises the entire platform | wave1-config-misfire F1 |
| 1.2 | **Fix scheduled deletion cron: query `scheduledDeletionAt` not `deletedAt`** | 15min | GDPR compliance | wave1-export-delete F1 |
| 1.3 | **Move webhook dedup key AFTER handler success** | 30min | All payment reliability | wave1-payment-webhook F1 |
| 1.4 | **Move gift debit INSIDE $transaction** | 30min | Gift send money safety | wave3-transaction-isolation G1 |
| 1.5 | **Add `isBanned: false` to all 42 queries** (extract shared filter utility) | 2h | Ban enforcement across platform | wave2-ban-visibility |
| 1.6 | **Fix auto-unban to also clear `isDeactivated`** | 15min | Temp-banned user recovery | wave2-ban-visibility #1 |
| 1.7 | **Fix ForYou cursor: parse as offset integer, not Date** | 1h | Feed pagination for 3 endpoints | wave1-cursor-pagination F12 |
| 1.8 | **Fix trending cursor: use keyset (score:id:ts) pagination** | 2h | Trending pagination for 3 endpoints | wave2-feed-scoring-truth |
| 1.9 | **Disable cashout endpoints until real Stripe payout wired** | 15min | Prevents diamond destruction | wave2-payment-wallet-webhook B3 |
| 1.10 | **Disable waqf/zakat/charity/treasury "donation" endpoints until payment wired** | 15min | Prevents fake donation inflation | wave2-payment-wallet-webhook B4 |

### TIER 2 -- LEGAL AND PRIVACY (within first week)

| Priority | Fix | Effort | Sources |
|----------|-----|--------|---------|
| 2.1 | **Unify deletion into single comprehensive function covering all 169 models** | 8h | wave2-deletion-cascade |
| 2.2 | **Add R2 deleteObject calls for all media URL fields on deletion** | 4h | wave1-export-delete F2, wave2-deletion-cascade #4 |
| 2.3 | **Add Meilisearch document removal on user ban/delete** | 2h | wave2-deletion-cascade |
| 2.4 | **Add EXIF stripping via Cloudflare Worker on R2 bucket** | 4h | wave1-media-privacy |
| 2.5 | **Add @Cron to processExpiredMessages** | 15min | wave3-cron-reliability |
| 2.6 | **Anonymize messages on account deletion** | 2h | wave1-export-delete F4 |
| 2.7 | **Cap GDPR export queries with take limits** | 1h | wave3-memory-connection-leaks R9 |
| 2.8 | **Fix SSRF blocklist (use resolved IP, not hostname; re-validate after redirect)** | 2h | wave1-sanitization F2, F7 |

### TIER 3 -- WIRING AND CORRECTNESS (within first two weeks)

| Priority | Fix | Effort | Sources |
|----------|-----|--------|---------|
| 3.1 | **Wire PublishWorkflowService into all content services** | 4h | wave1-publication-workflow F1 |
| 3.2 | **Fix reel caption field name to match Meilisearch config** | 30min | wave2-publication-search |
| 3.3 | **Add message push notifications** | 2h | wave2-notification-push-socket #6 |
| 3.4 | **Fix reel/thread notification types (REEL_LIKE, REEL_COMMENT, THREAD_LIKE, THREAD_REPOST)** | 1h | wave2-notification-push-socket #1-4 |
| 3.5 | **Fix mobile/backend endpoint mismatches** (encryption, reel archive, pin conversation, auto-play) | 1h | wave1-mobile-backend-drift F1-F4 |
| 3.6 | **Add new_notification + messages_read socket listeners on mobile** | 2h | wave1-realtime-presence F4, wave1-unread-counts |
| 3.7 | **Fix cancelSchedule to revert to draft (not publish)** | 30min | wave2-scheduled-lifecycle #6 |
| 3.8 | **Defer scheduled content side effects to publication time** | 4h | wave2-scheduled-lifecycle #1-#2 |
| 3.9 | **Add scheduledAt guards to getById methods** | 1h | wave2-scheduled-lifecycle #3 |
| 3.10 | **Add channel post like dedup** (unique constraint + P2002 catch) | 30min | wave3-transaction-isolation G3 |

### TIER 4 -- RELIABILITY AND SCALE (within first month)

| Priority | Fix | Effort | Sources |
|----------|-----|--------|---------|
| 4.1 | **Configure Prisma pool (`?connection_limit=20`)** | 15min | wave3-memory-connection-leaks R16 |
| 4.2 | **Move rate limiter storage to Redis** | 30min | wave1-redis-fake-success F6 |
| 4.3 | **Add Sentry captureException to all 14 cron jobs** | 2h | wave3-cron-reliability |
| 4.4 | **Cache getExcludedUserIds() in Redis (60s TTL)** | 2h | wave3-n1-query-hotpaths F1 |
| 4.5 | **Replace presence fan-out with Redis pub/sub** | 3h | wave1-fanout-amplification F4 |
| 4.6 | **Persist payment mappings in DB (not Redis-only)** | 3h | wave1-redis-fake-success F1 |
| 4.7 | **Add Post/Thread view counting** | 2h | wave1-follower-counters F6 |
| 4.8 | **Add missing notification bypasses to route through NotificationsService** | 3h | wave1-notification-ownership F1 |
| 4.9 | **Cap AnalyticsService buffer; implement OnModuleDestroy** | 1h | wave3-memory-connection-leaks R1-R2 |
| 4.10 | **Replace redis.keys() with SCAN in all 4 locations** | 1h | wave2-redis-dependency-map |
| 4.11 | **Add Sentry-backed dead letter queue fallback for when Redis is down** | 4h | wave1-queue-noop F7 |
| 4.12 | **Expand counter reconciliation from 6 to all 89 counters** | 8h | wave1-denormalized-state F1 |
| 4.13 | **Write integration tests that hit real PostgreSQL** | 16h+ | wave1-test-blind-spots F5 |

---

*This report was compiled from 37 findings files across 3 audit waves. Finding references use the format `{filename} F{number}` or `{filename} #{number}` or `{filename} B{number}` or `{filename} G{number}` depending on the source file's convention. When a finding appears in multiple files, all sources are cited.*
