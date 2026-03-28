Now I have all the data needed to produce the comprehensive cross-reference. Let me compile the full table.

Here is the exhaustive cross-reference of every finding from all 37 audit files against the 4 fix commits. I have organized them by source file, with each unaddressed finding categorized.

---

## SUMMARY

- **Total distinct findings across 37 files:** ~400
- **Fixed by the 4 commits:** ~38 fixes (addressing ~60-70 direct findings)
- **Remaining unaddressed:** ~330 findings

---

## FINDINGS NOT ADDRESSED

| # | Finding | Source File | Category | Why not fixed | Effort |
|---|---------|-----------|----------|---------------|--------|
| **wave1-scheduled-publishing** | | | | | |
| 1 | F1: `enhancedSearch` (feed-transparency) leaks scheduled posts | wave1-scheduled-publishing | A | Missing scheduledAt filter in feed-transparency.service.ts:201 | 15min |
| 2 | F2: `videos.getFeed` (Minbar) has no scheduledAt filter | wave1-scheduled-publishing | A | videos.service.ts:264-278 missed in all patches | 15min |
| 3 | F3: `videos.getRecommended` lacks scheduledAt AND isRemoved | wave1-scheduled-publishing | A | videos.service.ts:816-824 missed | 15min |
| 4 | F4: `getOnThisDay` leaks scheduled posts as memories | wave1-scheduled-publishing | A | feed.service.ts:118-130 missed | 10min |
| 5 | F5: `altProfile.getAltProfilePosts` no scheduledAt filter | wave1-scheduled-publishing | A | alt-profile.service.ts:199 missed | 10min |
| 6 | F6: `suggestedPosts` pgvector hydration no scheduledAt | wave1-scheduled-publishing | A | recommendations.service.ts:598 missed | 10min |
| 7 | F7: `suggestedThreads` pgvector hydration no scheduledAt | wave1-scheduled-publishing | A | recommendations.service.ts:746 missed | 10min |
| 8 | F8: `channels.getVideos`/`channels.getAnalytics` no scheduledAt | wave1-scheduled-publishing | A | channels.service.ts:268-292,380-393 missed | 15min |
| 9 | F9: `audio-tracks.getReelsUsingTrack` no scheduledAt | wave1-scheduled-publishing | A | audio-tracks.service.ts:42 missed | 10min |
| 10 | F10: `publishOverdueContent` erases original scheduledAt timestamp | wave1-scheduled-publishing | A | No originalScheduledAt preservation added | 15min |
| **wave1-queue-noop** | | | | | |
| 11 | F1: Production Redis failure has no circuit breaker | wave1-queue-noop | B | Needs circuit breaker pattern design (e.g. opossum) | 4h |
| 12 | F2: No-op queue stub silently drops ALL jobs in dev | wave1-queue-noop | D | Known dev behavior; production requires REDIS_URL | N/A |
| 13 | F3: 10+ unhandled promise rejections from queue fire-and-forget calls | wave1-queue-noop | A | posts/threads/reels/videos queue calls lack .catch() | 1h |
| 14 | F4: AsyncJobService retry is process-local (lost on restart) | wave1-queue-noop | B | Needs durable queue-based retry architecture | 4h |
| 15 | F5: `addPushNotificationJob` is dead code; push bypasses queue | wave1-queue-noop | B | Push delivery is synchronous; needs queue architecture for retries | 3h |
| 16 | F6: `addMediaJob` does not exist; MediaProcessor is dead code | wave1-queue-noop | C | EXIF stripping needs Cloudflare Worker or queue rewrite; direct-to-R2 bypasses server | 4h |
| 17 | F7: DLQ writes to Redis; fails during Redis outage | wave1-queue-noop | B | Needs Sentry-backed DLQ fallback | 4h |
| 18 | F8: No circuit breaker between queue producers and Redis | wave1-queue-noop | B | Same as F1 — needs opossum or equivalent | 4h |
| 19 | F9: Engagement tracking processor is dead no-op | wave1-queue-noop | A | Dead code; remove or implement | 15min |
| 20 | F10: Unknown job types silently succeed in 5/6 processors | wave1-queue-noop | A | Should throw on unknown types like search-indexing does | 30min |
| **wave1-notification-ownership** | | | | | |
| 21 | F1: 6 call sites bypass NotificationsService (prisma.notification.create direct) | wave1-notification-ownership | A | islamic.service (3), admin.service, reports.service, users.service still use direct create | 3h |
| 22 | F2: Reel LIKE uses wrong type 'LIKE' | wave1-notification-ownership | **FIXED** | Fixed in Tier 3 (3.4) | -- |
| 23 | F3: Reel COMMENT uses wrong type 'COMMENT' | wave1-notification-ownership | **FIXED** | Fixed in Tier 3 (3.4) | -- |
| 24 | F4: bulk-push sends push WITHOUT creating notification record | wave1-notification-ownership | A | notification.processor.ts:84-87 not fixed | 30min |
| 25 | F5-F8: Self-notification guard kills system notifications | wave1-notification-ownership | A | No system actorId or skipSelfCheck flag added | 1h |
| 26 | F9: Verse of Day creates 1000 notifications sequentially | wave1-notification-ownership | A | Should use createMany (pattern exists in same file) | 30min |
| **wave1-payment-webhook** | | | | | |
| 27 | F1: Dedup key set BEFORE handler | wave1-payment-webhook | **FIXED** | Fixed in Tier 1 (1.3) + Tier 3 try/catch | -- |
| 28 | F2: Coin purchase handler not idempotent (no PI dedup) | wave1-payment-webhook | A | No stripePaymentId check before increment; CoinTransaction has no such field | 1h |
| 29 | F3: Tip fallback matches wrong tip under concurrency | wave1-payment-webhook | A | findFirst by senderId+pending picks wrong tip | 1h |
| 30 | F4: Waqf contribution has NO payment collection | wave1-payment-webhook | **FIXED** | Disabled in Tier 1 (1.10) | -- |
| 31 | F5: Charity donations stuck permanently pending | wave1-payment-webhook | **FIXED** | Disabled in Tier 1 (1.10) | -- |
| 32 | F6: No Stripe-to-DB payment reconciliation cron | wave1-payment-webhook | B | Needs dedicated reconciliation service | 4h |
| 33 | F7: Dedup relies solely on Redis (no DB layer) | wave1-payment-webhook | B | Needs DB-backed idempotency keys | 3h |
| 34 | F8: handleInvoicePaymentFailed has no DB fallback | wave1-payment-webhook | A | Silently drops on Redis miss | 1h |
| 35 | F9: Dual tip creation paths (payments vs monetization) | wave1-payment-webhook | **PARTIAL** | sendTip disabled in monetization, but root cause (dual paths) remains | 30min |
| 36 | F10: PaymentIntent ID stored in `stripeSubId` field | wave1-payment-webhook | A | Data quality issue not fixed | 15min |
| **wave1-trending-window** | | | | | |
| 37 | F1: Trending hashtags have NO time window or decay | wave1-trending-window | A | hashtags.service.ts:155-178 still uses lifetime cumulative counters | 2h |
| 38 | F2: Inconsistent trending windows across services (24h/72h/7d) | wave1-trending-window | B | Needs design decision on standardized windows | 4h |
| 39 | F3: In-memory scoring with 200-row candidate ceiling | wave1-trending-window | B | Architectural: needs DB-side ranking or materialized views | 8h |
| 40 | F5: Scoring weights exceed 1.0 when boosts active | wave1-trending-window | A | Additive boosts still push beyond 1.0 | 30min |
| 41 | F6: Exploration slots only in RecommendationsService | wave1-trending-window | A | Main feeds (ForYou, Following, Trending) have zero exploration | 2h |
| 42 | F4: 3+ different decay formulas across services | wave1-trending-window | B | Needs design standardization | 2h |
| 43 | F9: CommunityTrending sorts by likesCount only | wave1-trending-window | A | No decay within 24h window | 30min |
| **wave1-search-indexing** | | | | | |
| 44 | F1: Posts creation does NOT trigger search indexing | wave1-search-indexing | **FIXED** | Fixed in Tier 3 (3.1) — PublishWorkflowService wired | -- |
| 45 | F2: Threads creation does NOT trigger search indexing | wave1-search-indexing | **FIXED** | Fixed in Tier 3 (3.1) | -- |
| 46 | F3: Users are NEVER indexed on create or profile update | wave1-search-indexing | A | Zero addSearchIndexJob calls in users module | 1h |
| 47 | F4: Post and thread updates do NOT re-index | wave1-search-indexing | A | update() methods still missing search index calls | 30min |
| 48 | F5: Video updates do NOT re-index | wave1-search-indexing | A | videos.service.ts update missing | 30min |
| 49 | F6: Trial reel publishTrial() not re-indexed | wave1-search-indexing | A | reels.service.ts publishTrial missing | 15min |
| 50 | F7: Reels field name mismatch (description vs content vs caption) | wave1-search-indexing | A | Reel caption search still broken; field names not unified | 30min |
| 51 | F8: Search reconciliation skips videos, users, hashtags + delete for threads/reels | wave1-search-indexing | A | Reconciliation coverage unchanged | 2h |
| 52 | F10: Document shape inconsistency between real-time and backfill | wave1-search-indexing | A | Shapes still diverge | 1h |
| 53 | F11: Videos indexed as 'PROCESSING', never updated to 'PUBLISHED' | wave1-search-indexing | A | No re-index on stream ready | 30min |
| 54 | F13: Hashtags never incrementally indexed | wave1-search-indexing | A | Still not indexed | 30min |
| 55 | F14: addDocuments ignores async Meilisearch task failures | wave1-search-indexing | A | Fire-and-forget; no error handling | 30min |
| 56 | F12: Channels not in Meilisearch | wave1-search-indexing | A | No channel index exists | 1h |
| **wave1-visibility-lifecycle** | | | | | |
| 57 | F1: isBanned missing from 24+ queries | wave1-visibility-lifecycle | **FIXED** | Fixed in Tier 1 (1.5) — 42 queries patched | -- |
| 58 | F2: isDeleted never checked in any content feed query | wave1-visibility-lifecycle | A | Zero occurrences of isDeleted filter added | 1h |
| 59 | F3: getNearbyContent missing ALL user lifecycle filters | wave1-visibility-lifecycle | A | feed.service.ts:551-574 still has zero user filters | 30min |
| 60 | F7: Hashtag content queries have NO user lifecycle filters | wave1-visibility-lifecycle | **PARTIAL** | isBanned added but isDeleted, isPrivate still missing on hashtag queries | 30min |
| 61 | F4: getCommunityTrending — no user filter, no visibility filter | wave1-visibility-lifecycle | A | feed.service.ts still missing | 30min |
| 62 | F6: getFeaturedFeed — missing isPrivate + isBanned | wave1-visibility-lifecycle | **PARTIAL** | isBanned added; isPrivate still missing | 15min |
| 63 | F8: getRelatedPosts — no user filter, no visibility filter | wave1-visibility-lifecycle | A | Not fixed | 30min |
| 64 | F9: getRecommended videos — missing isRemoved AND user filters | wave1-visibility-lifecycle | A | videos.service.ts:816 still missing | 30min |
| 65 | F10: pgvector hydration — missing lifecycle re-check | wave1-visibility-lifecycle | A | recommendations.service.ts hydration queries still missing | 30min |
| 66 | F11: Following feed — missing visibility filter (PRIVATE posts leak) | wave1-visibility-lifecycle | A | visibility field not filtered on following feed | 15min |
| 67 | F12: Search content queries (13 queries) — no user filter | wave1-visibility-lifecycle | **PARTIAL** | isBanned added to some search; isDeleted/isPrivate still missing | 30min |
| 68 | F14: Block/mute cap at take:50 in 4 services | wave1-visibility-lifecycle | **PARTIAL** | Some raised to 10000 but recommendations still at 50 | 15min |
| 69 | F15: Minbar trending — missing isRemoved check | wave1-visibility-lifecycle | A | Not fixed | 15min |
| 70 | F16: Reel feed block exclusion is one-directional | wave1-visibility-lifecycle | A | Only checks blockerId, not blockedId | 30min |
| 71 | F5: Saved content visibility not checked | wave1-visibility-lifecycle | A | Low priority but not fixed | 15min |
| 72 | F13: Block/mute/restrict caps inconsistent | wave1-visibility-lifecycle | **PARTIAL** | Partially standardized | 15min |
| 73 | F17-F18: scheduledDeletionAt, trending threads | wave1-visibility-lifecycle | A | Not fixed | 15min |
| **wave1-wallet-source-truth** | | | | | |
| 74 | F3: Gift send debit OUTSIDE transaction | wave1-wallet-source-truth | **FIXED** | Fixed in Tier 1 (1.4) | -- |
| 75 | F7: Coin purchase webhook lacks idempotency guard | wave1-wallet-source-truth | A | Same as payment-webhook F2 — not fixed | 1h |
| 76 | F8: Tip webhook diamond credit lacks idempotency | wave1-wallet-source-truth | A | No status check before update | 30min |
| 77 | F9: Cashout never initiates real Stripe payout | wave1-wallet-source-truth | **FIXED** | Disabled in Tier 1 (1.9) | -- |
| 78 | F2: Duplicate cashout endpoints (both reachable) | wave1-wallet-source-truth | A | Both endpoints still exist; redundancy not resolved | 30min |
| 79 | F4: Cashout debit not atomic with transaction log | wave1-wallet-source-truth | **FIXED** | Disabled; no longer reachable | -- |
| 80 | F5: No DB CHECK constraint prevents negative balances | wave1-wallet-source-truth | B | Needs schema migration with CHECK constraint | 30min |
| 81 | F6: No coin/diamond balance reconciliation exists | wave1-wallet-source-truth | B | Needs reconciliation service | 2h |
| **wave1-export-delete** | | | | | |
| 82 | F1: Scheduled deletion cron queries WRONG field | wave1-export-delete | **FIXED** | Fixed in Tier 1 (1.2) | -- |
| 83 | F2: No media files deleted from R2 on deletion | wave1-export-delete | **FIXED** | Fixed in Tier 2 (2.2) + remediation round 2 | -- |
| 84 | F3: No Meilisearch index cleanup on deletion | wave1-export-delete | **FIXED** | Added in Tier 2 | -- |
| 85 | F4: Messages NOT anonymized or deleted | wave1-export-delete | **FIXED** | Fixed in Tier 2 (2.6) | -- |
| 86 | F5: ~30+ tables missed in privacy deletion | wave1-export-delete | **FIXED** | Fixed in Tier 2 (2.1) — unified ~70 tables | -- |
| 87 | F6: Two divergent deletion implementations | wave1-export-delete | **FIXED** | Merged in Tier 2; deleteAccount delegates to privacy | -- |
| 88 | F7: Export missing ~15+ data categories | wave1-export-delete | **PARTIAL** | Truncation indicator added; ~10 categories still missing (per post-fix-audit-tier2 I2) | 2h |
| 89 | F8: Two export endpoints with different completeness | wave1-export-delete | A | Still two endpoints, not unified | 1h |
| 90 | F9: No hard-delete phase; soft-delete only | wave1-export-delete | B | Architectural: needs post-grace-period hard delete | 4h |
| 91 | F10: Chat export can't handle E2E encrypted content | wave1-export-delete | D | Known limitation of E2E encryption architecture | N/A |
| **wave1-unread-counts** | | | | | |
| 92 | F1: Client never listens for `new_notification` socket event | wave1-unread-counts | **FIXED** | Added in Tier 3 (3.6) on risalah.tsx | -- |
| 93 | F2: Socket `read` event never emitted from conversation screen | wave1-unread-counts | **FIXED** | Added messages_read listener in Tier 3 | -- |
| 94 | F3: Single notification read does NOT decrement badge count | wave1-unread-counts | A | notifications.tsx still doesn't call setUnread on markRead | 15min |
| 95 | F6: Message badge stale when Risalah tab is unmounted | wave1-unread-counts | A | No background polling mechanism for conversations | 1h |
| 96 | F4: Deleting unread notification doesn't update count | wave1-unread-counts | A | No decrement on delete | 15min |
| 97 | F7: Notification batching re-marks read as unread (phantom badge) | wave1-unread-counts | A | Not fixed | 30min |
| 98 | F5: No floor constraint on unreadCount | wave1-unread-counts | A | Negative possible with future code | 15min |
| 99 | F8: Unread notification count unbounded | wave1-unread-counts | A | cleanup cron only deletes READ notifications | 15min |
| **wave1-hot-query-indexes** | | | | | |
| 100 | F3: Notification batching — no composite index | wave1-hot-query-indexes | A | @@index([userId, type, createdAt]) not added | 15min |
| 101 | F7: Conversation list — JOIN sort on lastMessageAt | wave1-hot-query-indexes | B | Needs denormalized lastMessageAt on ConversationMember | 2h |
| 102 | F9: Reel feed — no composite [status, isRemoved, isTrial, createdAt] index | wave1-hot-query-indexes | A | Index not added | 15min |
| 103 | F10: Search ILIKE — sequential scan on ALL content tables | wave1-hot-query-indexes | C | Needs pg_trgm GIN indexes or Meilisearch env vars on Railway | 1h |
| 104 | F16: Video trending queries createdAt but index is on publishedAt | wave1-hot-query-indexes | A | Index mismatch not fixed | 15min |
| **wave1-redis-fake-success** | | | | | |
| 105 | F1: Payment mappings Redis-only with TTL | wave1-redis-fake-success | B | Needs DB-backed payment state store | 3h |
| 106 | F2: Device account counter no TTL, lost on Redis flush | wave1-redis-fake-success | A | Still Redis-only, no DB backup | 1h |
| 107 | F5: Analytics events in-memory buffer lost on crash | wave1-redis-fake-success | A | Buffer still unbounded; no OnModuleDestroy | 1h |
| 108 | F6: Rate limiter uses IN-MEMORY storage, not Redis | wave1-redis-fake-success | A | ThrottlerModule still has no storage option | 30min |
| 109 | F10: A/B tests + feature flags 100% Redis | wave1-redis-fake-success | B | Needs DB backup for experiment configs | 3h |
| 110 | F12: Production Redis failure = 500s everywhere | wave1-redis-fake-success | B | No circuit breaker built | 4h |
| 111 | F3: Community dhikr counter Redis-only | wave1-redis-fake-success | A | Recomputable from DB but no recovery mechanism | 30min |
| 112 | F4: Followed mosque data Redis-only | wave1-redis-fake-success | A | No DB backup | 30min |
| 113 | F9: Group invite links Redis-only | wave1-redis-fake-success | A | Flush = all links dead | 1h |
| 114 | F14: Prayer DND silently disabled on cache miss | wave1-redis-fake-success | A | Returns false, user gets notified during prayer | 30min |
| 115 | F16: redis.keys() used in 6+ production paths | wave1-redis-fake-success | A | O(N) blocking scan not replaced with SCAN | 1h |
| 116 | F7: Negative feed signals written but never read (dead data) | wave1-redis-fake-success | A | Dead code; should remove or implement consumer | 15min |
| 117 | F8: Session depth data written but never read | wave1-redis-fake-success | A | Dead code | 15min |
| 118 | F15: Impression tracking returns success on failure | wave1-redis-fake-success | A | Not fixed | 15min |
| **wave1-publication-workflow** | | | | | |
| 119 | F1: PublishWorkflowService dead code | wave1-publication-workflow | **FIXED** | Wired in Tier 3 (3.1) | -- |
| 120 | F2: Scheduled content triggers side effects at creation | wave1-publication-workflow | **FIXED** | Fixed in Tier 3 (3.8) — deferred to publication | -- |
| 121 | F3: getById doesn't check scheduledAt | wave1-publication-workflow | **FIXED** | Fixed in Tier 3 (3.9) | -- |
| 122 | F4: Interaction methods don't guard scheduledAt | wave1-publication-workflow | A | react/save/share/comment still work on scheduled content | 1h |
| 123 | F5: Video getRecommended missing isRemoved filter | wave1-publication-workflow | A | Same as visibility F9 — not fixed | 15min |
| 124 | F6: ThreadsService.getUserThreads hides owner's scheduled threads | wave1-publication-workflow | A | No owner check added | 15min |
| 125 | F7: Draft-to-published has no atomic workflow | wave1-publication-workflow | B | Client-side two-step (save draft, then publish) | 2h |
| 126 | F8: Reel drafts conflate PROCESSING with DRAFT status | wave1-publication-workflow | A | Not fixed | 30min |
| 127 | F9: Video stream error leaves inflated channel videosCount | wave1-publication-workflow | A | No counter correction on stream failure | 30min |
| 128 | F11: Reel hashtag counter increment outside transaction | wave1-publication-workflow | A | Same as transaction-isolation G11 | 30min |
| **wave1-cursor-pagination** | | | | | |
| 129 | F12: ForYou feeds double-interpret cursor | wave1-cursor-pagination | **FIXED** | Fixed in Tier 1 (1.7) | -- |
| 130 | F5: Personalized feed cursor IGNORED | wave1-cursor-pagination | A | Cursor accepted but never used to filter candidates | 2h |
| 131 | F3: Featured feed cursor filters by ID but sorts by featuredAt | wave1-cursor-pagination | A | Wrong items filtered | 1h |
| 132 | F6: Trending feeds use ID cursor but score-sort | wave1-cursor-pagination | **FIXED** | Fixed in Tier 1 (1.8) — offset-based slicing | -- |
| 133 | F10: Blended feed cursor — trending half re-fetched from scratch | wave1-cursor-pagination | A | Still re-fetched every page | 1h |
| 134 | F1: Offset pagination on non-deterministic scored pools | wave1-cursor-pagination | A | Pool changes between pages; duplicates/skips | 2h |
| 135 | F2: 4 different cursor formats across feed endpoints | wave1-cursor-pagination | B | Needs standardization | 2h |
| 136 | F7: Recommendation endpoints have no pagination at all | wave1-cursor-pagination | A | 4 endpoints return unbounded lists | 1h |
| 137 | F8: Block/mute exclusion capped at 50 in recommendations | wave1-cursor-pagination | A | Not raised | 15min |
| 138 | F9: Empty page possible with hasMore=true in personalized feed | wave1-cursor-pagination | A | Not fixed | 30min |
| 139 | F11: 200-item candidate pool ceiling | wave1-cursor-pagination | B | Architectural: needs DB-side scoring | 8h |
| 140 | F4: getNearbyContent hasMore lies | wave1-cursor-pagination | A | Not fixed | 15min |
| **wave1-follower-counters** | | | | | |
| 141 | F1: Reel comment like/unlike NOT atomic | wave1-follower-counters | A | reels.service.ts:719-748 still outside transaction | 30min |
| 142 | F6: Post/Thread viewsCount NEVER incremented | wave1-follower-counters | A | No view tracking code added for posts or threads | 2h |
| 143 | F7: Account deletion does NOT decrement other users' counters | wave1-follower-counters | A | followersCount/followingCount inflated permanently | 1h |
| 144 | F2: Reel comment unlike uses decrement without GREATEST guard | wave1-follower-counters | A | Can go negative | 15min |
| 145 | F3: Series unfollow uses decrement without GREATEST guard | wave1-follower-counters | A | Can go negative | 15min |
| 146 | F4: Circle leave brief negative window | wave1-follower-counters | A | Two-step decrement + post-hoc fix | 15min |
| 147 | F8: Reconciliation only covers 5 of 30+ counter fields | wave1-follower-counters | A | 25+ counters unreconciled | 8h |
| 148 | F9: Broadcast subscribe/unsubscribe not atomic | wave1-follower-counters | A | Not fixed | 30min |
| **wave1-config-misfire** | | | | | |
| 149 | F1: Credentials committed to source control (.env) | wave1-config-misfire | D | .env is NOT tracked by git (verified). The finding was based on .env.example existing; real .env was never committed. FALSE POSITIVE. | N/A |
| 150 | F5: Empty CORS_ORIGINS + production = mobile app failure | wave1-config-misfire | A | No validation that CORS_ORIGINS is non-empty in production | 15min |
| 151 | F7: TOTP secrets stored unencrypted; no key rotation | wave1-config-misfire | B | Needs crypto key rotation mechanism | 4h |
| 152 | F11: Redis connection failure — /health/live always returns 200 | wave1-config-misfire | A | Railway uses /health/live, should use /health/ready | 15min |
| 153 | F12: Webhook idempotency depends on Redis only | wave1-config-misfire | B | Same as redis-fake-success; needs DB backup | 3h |
| 154 | F2: listPaymentMethods/attachPaymentMethod skip Stripe check | wave1-config-misfire | A | No Stripe availability guard | 15min |
| 155 | F3: Stripe SDK initialized with empty key | wave1-config-misfire | A | Zombie SDK on empty key | 15min |
| 156 | F4: Feature flags all return false when Redis down | wave1-config-misfire | A | Silent feature disablement | 30min |
| 157 | F6: APP_URL defaults diverge (mizanly.app vs .com) | wave1-config-misfire | A | Inconsistent defaults | 10min |
| 158 | F10: Email silently drops all messages | wave1-config-misfire | A | No retry on Resend failure | 1h |
| 159 | F13: NODE_ENV unset = Swagger + stack traces in prod | wave1-config-misfire | A | No guard; Railway must set NODE_ENV=production | 15min |
| 160 | F14: Upload S3 client with empty credentials | wave1-config-misfire | A | Opaque errors on misconfigured R2 | 15min |
| **wave1-observability** | | | | | |
| 161 | F1: Correlation IDs NOT propagated beyond HTTP boundary | wave1-observability | B | Needs architectural propagation to queue/socket/cron | 4h |
| 162 | F3: Sentry captures ONLY HTTP filter errors | wave1-observability | A | Queue/socket/cron failures invisible in Sentry | 2h |
| 163 | F2: Dual logging systems (pino-http JSON + NestJS text) | wave1-observability | A | Confuses log aggregation | 1h |
| 164 | F5: No Prisma query-level timing | wave1-observability | B | Needs Prisma middleware or event-based logging | 2h |
| 165 | F6: No queue job duration tracking | wave1-observability | A | Can't measure job latency | 1h |
| 166 | F7: Socket connect/disconnect NOT logged | wave1-observability | A | Can't debug connectivity | 30min |
| 167 | F4: MetricsInterceptor hardcodes status 200 | wave1-observability | A | Always 200 for successful responses | 15min |
| 168 | F8: /health/live does not check dependencies | wave1-observability | A | Same as config-misfire F11 | 15min |
| 169 | F9: In-memory request counters reset on deploy | wave1-observability | A | No persistent error rate | 30min |
| **wave1-media-privacy** | | | | | |
| 170 | F1: addMediaJob() does NOT exist | wave1-media-privacy | C | Needs Cloudflare Worker for post-upload EXIF stripping | 4h |
| 171 | F2: Direct-to-R2 presigned upload bypasses server | wave1-media-privacy | C | Architecture gap; no post-upload hook | 8h |
| 172 | F3: 27 of 28 image picker calls missing exif:false | wave1-media-privacy | **FIXED** | Fixed in Tier 2 (2.4) — all 30 calls patched | -- |
| 173 | F5: Profile photos uploaded with full EXIF | wave1-media-privacy | **PARTIAL** | exif:false on picker (cosmetic fix); original bytes still have EXIF in R2 | C |
| 174 | F6: Chat/DM images uploaded with full EXIF | wave1-media-privacy | **PARTIAL** | Same cosmetic fix | C |
| 175 | F7: Video metadata not explicitly stripped | wave1-media-privacy | C | Needs server-side processing | 4h |
| 176 | F8: BlurHash is average hex color, not real BlurHash | wave1-media-privacy | A | Wrong algorithm; needs blurhash npm package | 1h |
| 177 | F9: Original files with EXIF persist in R2 (no lifecycle rules) | wave1-media-privacy | C | Needs R2 lifecycle configuration | 30min |
| **wave1-realtime-presence** | | | | | |
| 178 | F1: Online/offline broadcasts ignore activityStatus privacy | wave1-realtime-presence | A | chat.gateway.ts connect/disconnect still broadcast unconditionally | 30min |
| 179 | F4: new_notification emitted but never listened for on mobile | wave1-realtime-presence | **FIXED** | Fixed in Tier 3 (3.6) | -- |
| 180 | F2: Sender receives own messages; clientId dedup broken | wave1-realtime-presence | A | Content-matching fallback fails for media/identical messages | 1h |
| 181 | F3: join_content/leave_content no auth or rate-limit | wave1-realtime-presence | A | No auth check on join | 30min |
| 182 | F5: content:update events never subscribed on mobile | wave1-realtime-presence | A | Mobile doesn't listen | 30min |
| 183 | F8: messages_read never listened for on mobile | wave1-realtime-presence | **FIXED** | Fixed in Tier 3 | -- |
| 184 | F9: message_delivered never emitted by mobile | wave1-realtime-presence | A | Delivery receipts completely broken | 30min |
| 185 | F11: Risalah tab joins rooms without re-triggering on reconnect | wave1-realtime-presence | A | Race condition on socket reconnect | 30min |
| 186 | F12: Multiple independent socket connections per user (2-4) | wave1-realtime-presence | B | Needs singleton socket manager | 2h |
| 187 | F6: Typing indicators have no server-side timeout | wave1-realtime-presence | A | Not fixed | 30min |
| 188 | F7: WsSendMessageDto.conversationId uses @IsString() not @IsUUID() | wave1-realtime-presence | A | Weak validation | 10min |
| 189 | F13: Redis adapter falls back to in-memory silently | wave1-realtime-presence | A | No warning/alert | 15min |
| 190 | F14: Token refresh race condition during reconnection | wave1-realtime-presence | A | Not fixed | 1h |
| **wave1-auth-webhook** | | | | | |
| 191 | F1: Race condition — register requires DB user from webhook | wave1-auth-webhook | A | New user signup may get 401 if webhook delayed | 2h |
| 192 | F2: user.deleted webhook only deactivates (no GDPR cascade) | wave1-auth-webhook | A | auth.service.ts:349 only sets isDeactivated; should call deleteAllUserData | 30min |
| 193 | F6: Auto-unban NOT enforced in OptionalClerkAuthGuard | wave1-auth-webhook | A | optional-clerk-auth.guard.ts doesn't auto-unban | 30min |
| 194 | F9: syncClerkUser creates user WITHOUT required fields (COPPA) | wave1-auth-webhook | A | Missing isChildAccount, tosAcceptedAt, etc. | 1h |
| 195 | F3: Phone number never synced from Clerk | wave1-auth-webhook | A | Phone field always null | 15min |
| 196 | F5: session.revoked/removed/ended have no action | wave1-auth-webhook | A | Active sockets persist after session revoke | 1h |
| 197 | F8: user.updated does not sync username changes from Clerk | wave1-auth-webhook | A | Username changes not synced | 30min |
| **wave1-sanitization** | | | | | |
| 198 | F2: SSRF blocklist bypassable | wave1-sanitization | **FIXED** | Fixed in Tier 2 (2.8) — new ssrf.ts utility | -- |
| 199 | F7: og/unfurl follows redirects without re-validation | wave1-sanitization | **FIXED** | Fixed in Tier 2 (2.8) — per-hop re-validation | -- |
| 200 | F1: SanitizePipe does not recurse into nested objects | wave1-sanitization | A | Top-level only | 1h |
| 201 | F3: Sticker generation has no XML delimiter protection | wave1-sanitization | A | AI prompt injection possible | 30min |
| 202 | F6: SanitizePipe only processes body — query/param not sanitized | wave1-sanitization | A | Query string XSS possible | 30min |
| 203 | F10: HTML strip regex incomplete for edge cases | wave1-sanitization | A | Unclosed tags bypass | 15min |
| **wave1-test-blind-spots** | | | | | |
| 204 | F5: ALL tests mock Prisma — zero DB integration tests | wave1-test-blind-spots | B | Needs integration test infrastructure (16h+) | 16h |
| 205 | F1: Tests with ZERO assertions | wave1-test-blind-spots | A | payments.service.spec.ts:225-228 still no assertions | 30min |
| 206 | F4: Concurrency tests assert only "did not crash" | wave1-test-blind-spots | A | Never verify final values | 2h |
| 207 | F6: Payment tests verify routing, not money math | wave1-test-blind-spots | A | $transaction mocked to auto-succeed | 2h |
| 208 | F8: deleteAccount tests don't verify anonymization | wave1-test-blind-spots | A | Only check `{ deleted: true }` | 1h |
| 209 | F3: 379 toBeDefined() assertions | wave1-test-blind-spots | A | Many sole assertions proving nothing | 4h |
| 210 | F7: ContentSafetyService tests always return safe | wave1-test-blind-spots | A | AI path untested | 1h |
| 211 | F11: Push notification chain mocked at every level | wave1-test-blind-spots | A | No end-to-end test | 2h |
| 212 | F12: globalMockProviders set AI to always safe | wave1-test-blind-spots | A | Moderation never tested | 1h |
| 213 | F2: 29 "should be defined" boilerplate tests | wave1-test-blind-spots | A | Count padding | 30min |
| 214 | F9: Missing lifecycle transition tests | wave1-test-blind-spots | A | ban→hide, schedule→publish, delete→anonymize untested | 4h |
| **wave1-mobile-backend-drift** | | | | | |
| 215 | F1: Encryption getBulkKeys POST vs GET | wave1-mobile-backend-drift | **FIXED** | Fixed in Tier 3 (3.5) | -- |
| 216 | F2: Reel archive POST vs PATCH | wave1-mobile-backend-drift | **FIXED** | Fixed in Tier 3 (3.5) | -- |
| 217 | F3: Pin conversation extra path segment | wave1-mobile-backend-drift | **FIXED** | Fixed in Tier 3 (3.5) | -- |
| 218 | F4: Auto-play setting case mismatch | wave1-mobile-backend-drift | **FIXED** | Fixed in Tier 3 (3.5) | -- |
| 219 | F5: Follow requests endpoint path stale (dead code, working path exists) | wave1-mobile-backend-drift | A | Dead code not cleaned | 15min |
| 220 | F6: Hadith bookmark endpoint does not exist (404) | wave1-mobile-backend-drift | A | Mobile calls nonexistent endpoint | 30min |
| 221 | F7: Video cross-publish endpoint does not exist (404) | wave1-mobile-backend-drift | A | Mobile calls nonexistent endpoint | 30min |
| 222 | F8: Search suggestions semantic mismatch | wave1-mobile-backend-drift | A | Returns autocomplete, not users | 30min |
| 223 | F10: Cancel subscription DELETE body may be stripped by CDN | wave1-mobile-backend-drift | A | Edge case but not fixed | 30min |
| **wave1-fanout-amplification** | | | | | |
| 224 | F1: Verse of Day — 1000 sequential notification creates | wave1-fanout-amplification | A | Should use createMany; not changed | 30min |
| 225 | F2: Follower Snapshot — 200K individual upserts | wave1-fanout-amplification | A | Still uses Promise.allSettled with individual upserts | 2h |
| 226 | F4: Chat Presence — 5000 socket emits per connect/disconnect | wave1-fanout-amplification | B | Needs Redis pub/sub broadcast pattern | 3h |
| 227 | F3: Counter Reconciliation — 2500 sequential individual updates | wave1-fanout-amplification | A | Should batch with raw SQL INSERT...ON CONFLICT | 1h |
| 228 | F5: Encryption Key Rotation — 50 sequential message creates | wave1-fanout-amplification | A | Should use createMany | 15min |
| 229 | F9: Broadcast channel sendMessage has NO subscriber notification | wave1-fanout-amplification | A | Missing feature | 1h |
| **wave1-denormalized-state** | | | | | |
| 230 | F1: CounterReconciliationService covers only 6 of 89+ counters | wave1-denormalized-state | A | 83+ counters can drift permanently | 8h |
| 231 | F2: Admin reconciliation endpoint is a dead stub | wave1-denormalized-state | A | Returns success without calling reconciliation | 15min |
| 232 | F3: LIMIT 1000/500 caps prevent full reconciliation | wave1-denormalized-state | A | Not addressed | 30min |
| 233 | F4: User profile cache not invalidated on follow/unfollow | wave1-denormalized-state | A | Only blocks.service invalidates | 15min |
| 234 | F5: Post savesCount/sharesCount documented as repairable but not implemented | wave1-denormalized-state | A | No reconciliation | 1h |
| 235 | F6: Hashtag counters unreconciled; affects trending | wave1-denormalized-state | A | Trending uses wrong counts | 1h |
| 236 | F9: Search reconciliation misses users/videos/hashtags | wave1-denormalized-state | A | Only covers posts/threads/reels | 2h |
| 237 | F10: ConversationMember.unreadCount repairable but not implemented | wave1-denormalized-state | A | No reconciliation | 30min |
| 238 | F11: Redis cache keys have no mutation-based invalidation | wave1-denormalized-state | A | TTL-only expiry | 2h |
| 239 | F12: N+1 update pattern in reconciliation | wave1-denormalized-state | A | Individual UPDATE in loop | 1h |
| 240 | F13: Reel.loopsCount field NEVER incremented (always 0) | wave1-denormalized-state | A | Dead counter | 30min |
| 241 | F14: Hashtag counter increments outside main transaction | wave1-denormalized-state | A | Same as transaction-isolation G9 | 30min |
| **wave2-payment-wallet-webhook** | | | | | |
| 242 | B1: Phantom dedup | wave2-payment-wallet-webhook | **FIXED** | Fixed in Tier 1 (1.3) | -- |
| 243 | B2: Gift send debit OUTSIDE transaction | wave2-payment-wallet-webhook | **FIXED** | Fixed in Tier 1 (1.4) | -- |
| 244 | B3: Cashout never initiates Stripe payout | wave2-payment-wallet-webhook | **FIXED** | Disabled in Tier 1 (1.9) | -- |
| 245 | B4: Waqf/Zakat/Charity/Treasury no payment collection | wave2-payment-wallet-webhook | **FIXED** | Disabled in Tier 1 (1.10) | -- |
| 246 | B5: Tip fallback matches wrong tip under concurrency | wave2-payment-wallet-webhook | A | findFirst by senderId+pending picks wrong tip | 1h |
| 247 | B6: Coin purchase handler not idempotent | wave2-payment-wallet-webhook | A | Same as F2 above | 1h |
| 248 | B7: Dual tip creation paths — MonetizationService stuck pending | wave2-payment-wallet-webhook | **FIXED** | sendTip disabled in Tier 3 | -- |
| 249 | B8: Dual subscription paths — MonetizationService stuck | wave2-payment-wallet-webhook | A | subscribe() in monetization still creates sub without Stripe | 30min |
| 250 | B9: Dual cashout paths — both delete diamonds, neither pays | wave2-payment-wallet-webhook | **FIXED** | Both disabled | -- |
| 251 | B10: Waqf creates NO WaqfDonation record | wave2-payment-wallet-webhook | A | Zero audit trail for waqf (endpoint disabled but code still wrong) | 15min |
| 252 | B11: Charity campaign raisedAmount NEVER updated | wave2-payment-wallet-webhook | A | Donations exist but total stays 0 (endpoint disabled but code still wrong) | 15min |
| **wave2-ban-visibility** | | | | | |
| 253 | #1: Auto-unban does NOT clear isDeactivated | wave2-ban-visibility | **FIXED** | Fixed in Tier 1 (1.6) | -- |
| 254 | #2: Reports ban path incomplete (no isDeactivated, no Clerk ban) | wave2-ban-visibility | A | reports.service.ts:280 still doesn't set isDeactivated or call Clerk banUser() | 30min |
| 255 | #3: 42 content queries missing isBanned | wave2-ban-visibility | **FIXED** | Fixed in Tier 1 (1.5) | -- |
| 256 | #4: No real-time socket disconnection for banned users | wave2-ban-visibility | A | chat.gateway.ts doesn't kick existing connections on ban | 1h |
| 257 | #5: No Meilisearch document removal on ban | wave2-ban-visibility | A | No real-time removal; only weekly sync | 30min |
| **wave2-deletion-cascade** | | | | | |
| 258 | #1-6: Comprehensive deletion gaps | wave2-deletion-cascade | **MOSTLY FIXED** | Tier 2 (2.1) unified ~70 tables. Some gaps remain per post-fix-audit-tier2 | -- |
| 259 | Remaining: ~10 export categories missing (VoicePost, HifzProgress, etc.) | wave2-deletion-cascade | A | Per post-fix-audit-tier2 I2 | 2h |
| 260 | Counters on OTHER users never decremented on deletion | wave2-deletion-cascade | A | followersCount/followingCount inflated | 1h |
| **wave2-scheduled-lifecycle** | | | | | |
| 261 | #1: Zero publication-time side effects | wave2-scheduled-lifecycle | **FIXED** | Fixed in Tier 3 (3.8) — PublishWorkflowService wired to scheduling | -- |
| 262 | #2: Side effects fire at creation not publication | wave2-scheduled-lifecycle | **FIXED** | Fixed in Tier 3 (3.8) | -- |
| 263 | #3: getById exposes scheduled content to anyone | wave2-scheduled-lifecycle | **FIXED** | Fixed in Tier 3 (3.9) | -- |
| 264 | #4: Race condition kills author notification | wave2-scheduled-lifecycle | A | publishOverdueContent runs 1min, notify runs 5min — still a race | 30min |
| 265 | #5: publishOverdueContent erases original scheduledAt | wave2-scheduled-lifecycle | A | No originalScheduledAt preservation | 15min |
| 266 | #6: cancelSchedule immediately publishes | wave2-scheduled-lifecycle | **FIXED** | Fixed in Tier 3 (3.7) — reverts to draft | -- |
| 267 | #7: threads.getUserThreads hides owner's scheduled threads | wave2-scheduled-lifecycle | A | No owner check added | 15min |
| 268 | #8: Video feed/channel/recommendations have no scheduledAt filter | wave2-scheduled-lifecycle | A | videos.service.ts feeds still missing | 30min |
| 269 | #9: "Reel ready!" notification fires regardless of scheduledAt | wave2-scheduled-lifecycle | A | User told "reel is live" for future-scheduled reel | 15min |
| 270 | #10: publishNow and cancelSchedule were semantically identical | wave2-scheduled-lifecycle | **FIXED** | Now distinct (cancel = isRemoved:true) | -- |
| 271 | #11: No publication notification for reels/threads/videos | wave2-scheduled-lifecycle | A | Only posts have notifyScheduledPostsPublished cron | 1h |
| 272 | #12: Cron has no error handling, monitoring, alerting | wave2-scheduled-lifecycle | A | Still true for most crons | 2h |
| 273 | #13: No isRemoved check in publishOverdueContent | wave2-scheduled-lifecycle | A | Removed content gets "published" | 15min |
| **wave2-publication-search** | | | | | |
| 274 | 44 of 51 mutation paths do NOT update search index | wave2-publication-search | **PARTIAL** | Create paths fixed via PublishWorkflowService; updates/deletes/ban/unban/mod-remove still missing for most types | 4h |
| 275 | Users NEVER indexed on create or profile update | wave2-publication-search | A | Zero search index calls in users module | 1h |
| 276 | Reel caption field name chaos (description vs content vs caption) | wave2-publication-search | A | 3 different names; Meilisearch searchable attribute is 'caption'; none match | 30min |
| 277 | Reconciliation misses videos/users/hashtags | wave2-publication-search | A | Only posts/threads/reels covered | 2h |
| 278 | Videos indexed as PROCESSING, never updated to PUBLISHED | wave2-publication-search | A | No re-index on stream ready | 30min |
| **wave2-notification-push-socket** | | | | | |
| 279 | #1-2: Reel like/comment wrong type | wave2-notification-push-socket | **FIXED** | Fixed in Tier 3 (3.4) | -- |
| 280 | #3-4: Thread like/repost → push skipped | wave2-notification-push-socket | **FIXED** | Fixed in Tier 3 (3.4) — threadId fallback | -- |
| 281 | #5: Reel ready notification is dead code (self-notif) | wave2-notification-push-socket | A | No system actorId bypass added | 15min |
| 282 | #6: Messages have NO push notification | wave2-notification-push-socket | **FIXED** | Fixed in Tier 3 (3.3) | -- |
| 283 | #7: Story reply creates NO notification | wave2-notification-push-socket | A | STORY_REPLY type exists but nobody creates it | 30min |
| 284 | #8: Tips/gifts create NO notification | wave2-notification-push-socket | A | Payment webhook credits diamonds but zero notification | 30min |
| 285 | 6 direct Prisma bypasses (admin, reports, islamic x3, users) | wave2-notification-push-socket | A | Still bypass NotificationsService | 3h |
| 286 | Events with ZERO notification (share, save, broadcast, scheduled publish, gift, tip, mod remove) | wave2-notification-push-socket | A | 8 events still have no notification at all | 2h |
| 287 | delivery_receipt: server never emits | wave2-notification-push-socket | A | Delivery receipts completely broken | 30min |
| **wave2-feed-scoring-truth** | | | | | |
| 288 | 3 ForYou page 2+ returns empty | wave2-feed-scoring-truth | **FIXED** | Fixed in Tier 1 (1.7) | -- |
| 289 | 3 trending page 2 = page 1 | wave2-feed-scoring-truth | **FIXED** | Fixed in Tier 1 (1.8) | -- |
| 290 | viewsCount ALWAYS 0 for Posts + Threads | wave2-feed-scoring-truth | A | No view counting code added | 2h |
| 291 | 3 distinct decay formulas across services | wave2-feed-scoring-truth | B | Needs design standardization | 2h |
| 292 | 5 distinct time windows across services | wave2-feed-scoring-truth | B | Needs design decision | 2h |
| 293 | Block/mute caps range from 0 to 10000 | wave2-feed-scoring-truth | **PARTIAL** | Some raised; CommunityTrending/NearbyContent still 0, Recommendations/Videos still 50 | 30min |
| 294 | Scoring weight inconsistencies across endpoints | wave2-feed-scoring-truth | B | Same content gets different scores in different feeds | 2h |
| 295 | 19 of 25 feed endpoints missing isBanned | wave2-feed-scoring-truth | **MOSTLY FIXED** | 42 queries patched in Tier 1; some gaps may remain | 30min |
| 296 | ALL 25 endpoints missing isDeleted check | wave2-feed-scoring-truth | A | Zero isDeleted filters added | 1h |
| 297 | 5 endpoints missing isPrivate check | wave2-feed-scoring-truth | A | Not fixed | 30min |
| 298 | PersonalizedFeed score overflow beyond 1.0 | wave2-feed-scoring-truth | A | Additive boosts uncapped | 15min |
| 299 | Hashtags trending = all-time popularity, NOT trending | wave2-feed-scoring-truth | A | Same as trending-window F1 | 2h |
| **wave2-redis-dependency-map** | | | | | |
| 300 | 15 key patterns have NO DB backup (data loss on flush) | wave2-redis-dependency-map | B | Needs DB-backed alternatives for payment mappings, A/B tests, feature flags, device counters | 8h |
| 301 | 4 patterns are dead data (written but never read) | wave2-redis-dependency-map | A | dm_shares, prayer_queue, session:depth, analytics:events — dead code | 30min |
| 302 | 10+ patterns have no TTL (unbounded memory growth) | wave2-redis-dependency-map | A | community:dhikr:today, post:impressions, device_accounts, etc. | 1h |
| 303 | redis.keys() in 4 locations (O(N) blocking scan) | wave2-redis-dependency-map | A | ab-testing, publish-workflow, feed, cache.ts — should use SCAN | 1h |
| **wave3-cron-reliability** | | | | | |
| 304 | processExpiredMessages was dead code (no @Cron) | wave3-cron-reliability | **FIXED** | Fixed in Tier 2 (2.5) | -- |
| 305 | ZERO Sentry integration in ANY cron job | wave3-cron-reliability | A | All 14 jobs fail silently | 2h |
| 306 | publishScheduledMessages can cause duplicate sends | wave3-cron-reliability | A | No dedup/lock; concurrent runs process same messages | 1h |
| 307 | snapshotFollowerCounts is memory/connection bomb (200K users) | wave3-cron-reliability | A | Still take:200000 + 200K upserts | 2h |
| 308 | processScheduledDeletions — GDPR fails silently | wave3-cron-reliability | A | No Sentry or alerting | 30min |
| 309 | cleanupOldNotifications — unbounded DELETE | wave3-cron-reliability | A | No take limit; table lock at scale | 30min |
| 310 | 8 of 14 cron jobs have NO error handling | wave3-cron-reliability | A | Exceptions go uncaught | 2h |
| 311 | Schedule collisions (3 AM, 4 AM) | wave3-cron-reliability | A | Stagger schedules | 15min |
| 312 | sendVerseOfTheDay: invalid Quran reference calculation | wave3-cron-reliability | A | Math.ceil(verseNumber/50) produces invalid refs | 30min |
| 313 | checkIslamicEventReminders: approximate Hijri conversion unreliable | wave3-cron-reliability | A | Events may fire on wrong days | 1h |
| 314 | sendWeeklyScreenTimeDigest: no dedup on restart | wave3-cron-reliability | A | Restart = duplicate digest | 30min |
| **wave3-memory-connection-leaks** | | | | | |
| 315 | R9: GDPR export — 26 uncapped parallel queries | wave3-memory-connection-leaks | **FIXED** | Fixed in Tier 2 (2.7) — take:10000 caps | -- |
| 316 | R1: AnalyticsService buffer grows unboundedly on Redis failure | wave3-memory-connection-leaks | A | No cap on buffer; no OnModuleDestroy | 1h |
| 317 | R2: AnalyticsService setInterval never cleared | wave3-memory-connection-leaks | A | Class doesn't implement OnModuleDestroy | 15min |
| 318 | R5: 5000-conversation presence fan-out | wave3-memory-connection-leaks | B | Needs Redis pub/sub broadcast | 3h |
| 319 | R16: Prisma connection pool no explicit configuration | wave3-memory-connection-leaks | A | Default pool 3-5 connections; no ?connection_limit in DATABASE_URL | 15min |
| 320 | R6: RedisIoAdapter 2 Redis connections never closed on shutdown | wave3-memory-connection-leaks | A | pub/sub clients not cleaned up | 30min |
| 321 | R7: Redis SHUTDOWN provider onModuleDestroy may not fire | wave3-memory-connection-leaks | A | Plain object may not be invoked by NestJS | 15min |
| 322 | R8: snapshotFollowerCounts — 200K fetch + connection starvation | wave3-memory-connection-leaks | A | Same as cron-reliability | 2h |
| 323 | R12: BullMQ creates 16 Redis connections per instance | wave3-memory-connection-leaks | D | Known BullMQ behavior; acceptable | N/A |
| 324 | R3: AsyncJobService dangling setTimeout timers | wave3-memory-connection-leaks | A | No references stored; can't cancel on shutdown | 30min |
| 325 | R11: findByPhoneNumbers 10K users + 10K SHA-256 hashes | wave3-memory-connection-leaks | A | Performance issue for large address books | 1h |
| 326 | R14: EmbeddingPipelineService infinite backfill loop if API down | wave3-memory-connection-leaks | A | No circuit breaker on embedding API | 30min |
| **wave3-transaction-isolation** | | | | | |
| 327 | G1: Gift send debit OUTSIDE transaction | wave3-transaction-isolation | **FIXED** | Fixed in Tier 1 (1.4) | -- |
| 328 | G2: Cashout debit OUTSIDE transaction log | wave3-transaction-isolation | **FIXED** | Disabled in Tier 1 (1.9) | -- |
| 329 | G3: Channel post like — NO dedup | wave3-transaction-isolation | **FIXED** | Fixed in Tier 3 (3.10) — ChannelPostLike model + unique constraint | -- |
| 330 | G4-G5: Broadcast subscribe/unsubscribe not transactional | wave3-transaction-isolation | A | member.create and counter increment still separate | 30min |
| 331 | G6-G7: Reel comment like/unlike not transactional | wave3-transaction-isolation | A | reels.service.ts:715-749 still outside tx | 30min |
| 332 | G8: Scholar QA voteQuestion no transaction, no P2002 | wave3-transaction-isolation | A | Double-vote possible + votesCount drift | 30min |
| 333 | G9-G10: Hashtag counter decrements outside soft-delete transaction | wave3-transaction-isolation | A | Posts and threads; inflated counts on delete | 30min |
| 334 | G11: Reel hashtag upserts BEFORE reel creation transaction | wave3-transaction-isolation | A | Failed reel creation leaves inflated counts | 30min |
| 335 | G12: Circle leave decrement without GREATEST, separate clamp | wave3-transaction-isolation | A | Brief negative window | 15min |
| 336 | G13: Video view dedup check outside transaction | wave3-transaction-isolation | A | Race condition: double view count | 30min |
| 337 | G14: Gamification awardXP level calculated on stale totalXP | wave3-transaction-isolation | A | Level off by one | 30min |
| 338 | G15: Payment/subscription mappings Redis-only | wave3-transaction-isolation | B | Same as redis-fake-success F1 | 3h |
| 339 | G16: Coin purchase matches by amount+description, not PI ID | wave3-transaction-isolation | A | Wrong pending transaction matched | 30min |
| 340 | G17: Video like dislike-to-like flip stale read outside tx | wave3-transaction-isolation | A | likesCount/dislikesCount off by 1 | 30min |
| 341 | G18: Block cleanup fire-and-forget | wave3-transaction-isolation | A | No retry on failure | 15min |
| 342 | G19: Block follow scan concurrent drift | wave3-transaction-isolation | A | Concurrent follow during block = count drift | 15min |
| 343 | G20: Thread votePoll no P2002 catch | wave3-transaction-isolation | A | 500 error on concurrent votes | 15min |
| **wave3-n1-query-hotpaths** | | | | | |
| 344 | F1: Redundant getExcludedUserIds() across 5 services, no caching | wave3-n1-query-hotpaths | A | 3 queries x take:10000 per feed request, no Redis cache | 2h |
| 345 | F2: PersonalizedFeed double-fetches same content IDs | wave3-n1-query-hotpaths | A | getContentMetadata + hydrateItems overlap | 1h |
| 346 | F3: ForYou feed 4 separate block/mute queries (2 redundant) | wave3-n1-query-hotpaths | A | Not deduplicated | 30min |
| 347 | F4: Following feed caps at 50 follows — DATA BUG | wave3-n1-query-hotpaths | A | Users following 100+ get incomplete feed | 30min |
| 348 | F5: sendMessage 6-9 sequential DB queries waterfall | wave3-n1-query-hotpaths | A | conversation.findUnique called TWICE | 30min |
| 349 | F6: forwardMessage — 5 queries x 5 targets = 25 per forward | wave3-n1-query-hotpaths | A | Not batched | 1h |
| 350 | F7: Hashtag upsert N+1 (1-30 individual queries per post) | wave3-n1-query-hotpaths | A | Per-tag individual upsert | 30min |
| 351 | F8: Recommendations triple-fetch on same table | wave3-n1-query-hotpaths | A | 3 queries for different columns of same table | 30min |
| 352 | F9: Aggregate search — 7 SEQUENTIAL ILIKE scans | wave3-n1-query-hotpaths | A | Not parallelized | 30min |
| 353 | F10: Grouped notifications — 200-row over-fetch to produce 20 | wave3-n1-query-hotpaths | A | 10x over-fetch | 15min |
| 354 | F11: Scheduled messages — per-message transaction loop | wave3-n1-query-hotpaths | A | 150 queries for 50 messages | 30min |
| 355 | F12: Scheduled post notifications — 300 sequential ops | wave3-n1-query-hotpaths | A | 6 ops per post x 50 | 30min |
| 356 | F13: Conversation list loads ALL members (unbounded for groups) | wave3-n1-query-hotpaths | A | 200+ members per group loaded | 30min |
| 357 | F14: Message reactions unbounded (no take limit) | wave3-n1-query-hotpaths | A | Could be hundreds per message | 15min |
| 358 | F15: Recommendations block cap at 50 | wave3-n1-query-hotpaths | A | Same as visibility F14 | 15min |
| **post-fix-audit-tier1** | | | | | |
| 359 | C1: Webhook double-processing if Redis fails AFTER handler success | post-fix-audit-tier1 | **FIXED** | Fixed in Tier 3 remediation — try/catch around setex | -- |
| 360 | I1: Following feed + blended feed missing isBanned filter (2 queries) | post-fix-audit-tier1 | **FIXED** | Fixed in Tier 3 remediation | -- |
| 361 | I2: sendTip not disabled (creates unverifiable records) | post-fix-audit-tier1 | **FIXED** | Disabled in Tier 3 remediation | -- |
| 362 | I3: reactivateAccount leaves dangling scheduledDeletionAt | post-fix-audit-tier1 | **FIXED** | Fixed in Tier 3 remediation — clears scheduledDeletionAt | -- |
| 363 | I4: Auto-unban overwrites user's self-deactivation | post-fix-audit-tier1 | A | No deactivationReason field to distinguish admin ban from user choice | 30min schema migration |
| 364 | I5: ForYou/Trending pool instability across pages | post-fix-audit-tier1 | D | Acknowledged as MVP-acceptable; caching helps | N/A |
| **post-fix-audit-tier2** | | | | | |
| 365 | C1: CoinTransaction DELETED despite being financial record | post-fix-audit-tier2 | **FIXED** | Fixed in Tier 3 remediation — removed deleteMany call | -- |
| 366 | I1: Export doesn't indicate truncation | post-fix-audit-tier2 | **FIXED** | Fixed in remediation round 2 — _meta.truncatedCategories | -- |
| 367 | I2: Export missing ~10 data categories | post-fix-audit-tier2 | A | VoicePost, HifzProgress, HajjProgress, ForumThread, etc. still missing from export | 2h |
| 368 | I3: processExpiredMessages — no error handling + metadata not cleared | post-fix-audit-tier2 | **FIXED** | Fixed in remediation round 2 — try/catch + metadata cleared | -- |
| 369 | I4: R2 media collection missing fields (carouselUrls, hlsUrl, etc.) | post-fix-audit-tier2 | **PARTIAL** | carouselUrls added; hlsUrl, dashUrl, VoicePost.audioUrl may still be missing | 30min |
| 370 | I5: SSRF DNS TOCTOU (inherent limitation) | post-fix-audit-tier2 | D | Known limitation of DNS-based SSRF prevention | N/A |
| 371 | I6: No batch concurrency limit on R2 deletes | post-fix-audit-tier2 | **FIXED** | Fixed in remediation round 2 — batched in chunks of 50 | -- |

---

## SUMMARY BY CATEGORY

| Category | Count | Description |
|----------|-------|-------------|
| **A. Code-fixable but NOT fixed** | ~220 | Things that could be fixed in code but were not addressed by any commit |
| **B. Architectural — needs design work** | ~35 | Circuit breakers, DB-backed Redis alternatives, standardized scoring, integration tests, etc. |
| **C. Infrastructure — needs external work** | ~8 | Cloudflare Worker for EXIF, R2 lifecycle rules, pg_trgm indexes, post-upload processing |
| **D. Already documented as known limitations** | ~7 | E2E encryption export, BullMQ connections, DNS TOCTOU, pool instability at MVP scale |
| **FIXED** | ~60 findings resolved | Across the 4 commits |

## TOP 20 UNFIXED BY SEVERITY

1. **Reports ban path incomplete** (#254) — reports.service.ts doesn't set isDeactivated or call Clerk banUser. Report-banned users bypass isDeactivated filters.
2. **Coin purchase webhook not idempotent** (#28/247) — duplicate webhook = double credit, no stripePaymentId dedup.
3. **Tip webhook fallback matches wrong tip** (#29/246) — concurrent tips = wrong tip completed.
4. **Rate limiter uses in-memory storage** (#108) — resets on deploy, per-instance only.
5. **Post/Thread viewsCount NEVER incremented** (#142/290) — always 0, poisons feed scoring.
6. **6 call sites bypass NotificationsService** (#21/285) — no push/settings/block/mute for islamic/admin/reports/users.
7. **Online/offline broadcasts ignore privacy setting** (#178) — activityStatus not checked on connect/disconnect.
8. **isDeleted never checked in any feed query** (#58/296) — partially-deleted user content visible.
9. **Following feed caps at 50 follows** (#347) — users following 100+ get incomplete feed.
10. **Reel caption field name chaos** (#50/276) — 3 names across codepaths; reel search returns zero.
11. **Users NEVER indexed in search** (#46/275) — username changes invisible.
12. **Webhook signup race condition** (#191) — new users may get 401 if webhook delayed.
13. **user.deleted webhook doesn't cascade GDPR delete** (#192) — Clerk deletion leaves all PII.
14. **AnalyticsService buffer unbounded + no OnModuleDestroy** (#316-317) — memory leak on Redis failure.
15. **Prisma pool no explicit configuration** (#319) — 3-5 connections; exhausted under moderate load.
16. **Scheduled messages duplicate sends (no lock)** (#306) — concurrent cron runs process same messages.
17. **snapshotFollowerCounts 200K users OOM** (#307/322) — Railway 512MB will crash.
18. **ZERO Sentry integration in any cron job** (#305) — all 14 crons fail silently.
19. **getNearbyContent missing ALL user lifecycle filters** (#59) — banned/deactivated/deleted/private all visible.
20. **Trending hashtags have NO time window** (#37/299) — lifetime popularity, not trending.
