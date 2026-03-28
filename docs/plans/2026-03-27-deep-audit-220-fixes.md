# Deep Audit 220 Code-Fixable Findings — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix ALL ~220 code-fixable findings from `docs/audit/deep-audit-2026-03-26/UNFIXED_FINDINGS.md` — every Category A item, no exceptions.

**Architecture:** Batches grouped by affected service files (not severity). Many findings from different audit waves touch the same file — grouping avoids re-reading and merge conflicts. Each batch verifies current state first (Session 9 fixed ~40 items that the doc doesn't reflect), then fixes what remains.

**Tech Stack:** NestJS 10, Prisma, PostgreSQL, Redis (Upstash), Meilisearch, Socket.io, React Native Expo

**Source of truth:** `docs/audit/deep-audit-2026-03-26/UNFIXED_FINDINGS.md` — finding numbers (#N) reference rows in that table.

**IMPORTANT — Verification-first workflow:** Many findings were fixed in Session 9 but the UNFIXED doc wasn't updated. For EVERY finding: grep/read the current code first. If already fixed, mark it and move on. Do NOT blindly apply fixes to already-correct code.

**Testing rule:** Every batch MUST have tests. Write tests for the ENTIRE scope of the batch, not just the fixes. Run `npx jest --passWithNoTests --forceExit --silent` after each batch and confirm pass count.

**Commit rule:** One commit per batch. No Co-Authored-By lines. Explain changes in plain English with a table before committing.

---

## Batch 1: Scheduled Publishing Residuals & Publication Workflow
**Findings:** #1-10, #122-128, #264-273
**Files:** `feed.service.ts`, `videos.service.ts`, `recommendations.service.ts`, `feed-transparency.service.ts`, `alt-profile.service.ts`, `channels.service.ts`, `audio-tracks.service.ts`, `reels.service.ts`, `threads.service.ts`, `scheduling.service.ts`

### Pre-check (Session 9 may have fixed #1-9)
Grep each file for `scheduledAt` — if the OR filter pattern is present, mark fixed and skip.

### Findings to fix

| # | Finding | Fix |
|---|---------|-----|
| 1 | `enhancedSearch` in feed-transparency leaks scheduled posts | Add `scheduledAt` OR filter to query in `feed-transparency.service.ts` |
| 2 | `videos.getFeed` no scheduledAt | Add scheduledAt OR filter to `videos.service.ts:getFeed` |
| 3 | `videos.getRecommended` lacks scheduledAt AND isRemoved | Add both filters |
| 4 | `getOnThisDay` leaks scheduled posts | Add scheduledAt filter |
| 5 | `altProfile.getAltProfilePosts` no scheduledAt | Add scheduledAt OR filter |
| 6 | `suggestedPosts` hydration no scheduledAt | Add to `recommendations.service.ts` hydration query |
| 7 | `suggestedThreads` hydration no scheduledAt | Same |
| 8 | `channels.getVideos`/`getAnalytics` no scheduledAt | Add to both methods in `channels.service.ts` |
| 9 | `audio-tracks.getReelsUsingTrack` no scheduledAt | Add to `audio-tracks.service.ts` |
| 10 | `publishOverdueContent` erases original scheduledAt | Before setting `scheduledAt: null`, copy current value to new field or log. If no `originalScheduledAt` field exists, just don't null out the value — set `status` to published instead |
| 122 | Interaction methods (react/save/share/comment) don't guard scheduledAt | In post/reel/thread react/save/share/comment methods: check if content `scheduledAt > new Date()` and throw ForbiddenException |
| 123 | Video getRecommended missing isRemoved | Add `isRemoved: false` to videos.service.ts getRecommended query |
| 124 | `getUserThreads` hides owner's scheduled threads | Add owner check: if requesting user === thread author, don't filter scheduledAt |
| 126 | Reel drafts conflate PROCESSING with DRAFT status | Add `status` check: don't treat PROCESSING reels as drafts in feed queries |
| 127 | Video stream error leaves inflated `videosCount` | In stream error/failure handler, decrement `channel.videosCount` using GREATEST(0) |
| 128 | Reel hashtag counter increment outside transaction | Move hashtag upsert+increment inside the reel creation `$transaction` |
| 264 | publishOverdueContent race with notify cron | Merge notification into publishOverdueContent itself (notify inline after publish, don't rely on separate cron) |
| 265 | publishOverdueContent erases original scheduledAt | Same as #10 |
| 267 | getUserThreads hides owner's scheduled | Same as #124 |
| 268 | Video feed/channel/recommendations no scheduledAt | Same as #2, #3, #8 |
| 269 | "Reel ready!" notification fires for future-scheduled reel | Add scheduledAt check before sending reel-ready notification |
| 271 | No publication notification for reels/threads/videos | Add `notifyScheduledPublished` for reels, threads, videos in scheduling.service.ts (posts already have it) |
| 272 | Crons have no error handling | Wrap each cron handler body in try/catch with `Sentry.captureException(error)` |
| 273 | No isRemoved check in publishOverdueContent | Add `isRemoved: false` to the query that fetches overdue content |

### Tests
- Test that scheduled content (scheduledAt in future) is NOT returned by each patched query
- Test that owner CAN see their own scheduled content
- Test that interactions (like/save/comment) throw on scheduled content
- Test publishOverdueContent skips isRemoved content
- Test reel-ready notification suppressed for scheduled reels

---

## Batch 2: Queue & Job Processing Hardening
**Findings:** #13, #19, #20
**Files:** `queue.service.ts`, processors (`posts.processor.ts`, `threads.processor.ts`, `reels.processor.ts`, `videos.processor.ts`, `notification.processor.ts`, `engagement.processor.ts`)

| # | Finding | Fix |
|---|---------|-----|
| 13 | 10+ unhandled promise rejections from queue fire-and-forget | Add `.catch(err => this.logger.error(...))` to every `addXJob()` call site in posts/threads/reels/videos services |
| 19 | Engagement tracking processor is dead no-op | Remove dead code OR implement the actual tracking logic. If the processor has no meaningful work, delete the file and its registration |
| 20 | Unknown job types silently succeed in 5/6 processors | Add `default: throw new Error(\`Unknown job type: ${job.data.type}\`)` to every processor switch/if chain |

### Tests
- Test each processor throws on unknown job type
- Test queue error handling doesn't crash the service

---

## Batch 3: Notification Ownership & Missing Notifications
**Findings:** #21, #24, #25, #26, #281, #283-287
**Files:** `notifications.service.ts`, `notification.processor.ts`, `islamic.service.ts`, `admin.service.ts`, `reports.service.ts`, `users.service.ts`, `stories.service.ts`, `payments-webhook.service.ts`, `monetization.service.ts`, `channels.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 21 | 6 call sites bypass NotificationsService with direct prisma.notification.create | Replace all 6 with `this.notificationsService.create()`. Inject NotificationsService where needed. Files: islamic.service (3 places), admin.service (1), reports.service (1), users.service (1) |
| 24 | bulk-push sends push WITHOUT creating notification record | In notification.processor.ts bulk-push handler: create notification records before/after sending push |
| 25 | Self-notification guard kills system notifications | **VERIFY FIRST** — Session 9 may have added null actorId support. If not: add `if (!actorId) skip self-check` in NotificationsService.create |
| 26 | Verse of Day creates 1000 notifications sequentially | **VERIFY FIRST** — Session 9 may have added createMany. If not: replace sequential creates with `prisma.notification.createMany()` in batches of 500 |
| 281 | Reel ready notification is dead code (self-notif) | Use `actorId: null` (system notification) for reel-ready, so self-check doesn't kill it |
| 283 | Story reply creates NO notification | In stories.service.ts reply method: call `notificationsService.create({ type: 'STORY_REPLY', ... })` |
| 284 | Tips/gifts create NO notification | In payments-webhook handler for tips/gifts: call `notificationsService.create({ type: 'TIP_RECEIVED' / 'GIFT_RECEIVED', ... })` |
| 285 | 6 direct Prisma bypasses | Same as #21 — ensure ALL are replaced |
| 286 | 8 events with ZERO notification (share, save, broadcast, scheduled publish, gift, tip, mod remove) | Add notification creation for: POST_SHARED, POST_SAVED (optional), BROADCAST_MESSAGE, SCHEDULED_PUBLISHED, GIFT_RECEIVED, TIP_RECEIVED, CONTENT_REMOVED |
| 287 | delivery_receipt: server never emits | In chat.gateway.ts message handler: after saving message, emit `delivery_receipt` to sender's socket room |

### Tests
- Test NotificationsService.create is called (not direct prisma) for each of the 6 bypass sites
- Test story reply creates notification
- Test tip/gift payment creates notification
- Test delivery_receipt emitted after message save
- Test system notifications (null actorId) bypass self-check

---

## Batch 4: Payments & Wallet Fixes
**Findings:** #28-29, #34-36, #75-76, #78, #246-247, #249, #251-252
**Files:** `payments-webhook.service.ts`, `payments.service.ts`, `monetization.service.ts`, `wallet.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 28/247 | Coin purchase webhook not idempotent | Before incrementing coinBalance: check if CoinTransaction with same `stripePaymentIntentId` already exists. If yes, skip. Add `stripePaymentIntentId` field to CoinTransaction if needed |
| 29/246 | Tip fallback matches wrong tip under concurrency | Use `stripePaymentIntentId` to match tip instead of `findFirst({ where: { senderId, status: 'PENDING' } })`. Store PI ID when creating the tip |
| 34 | handleInvoicePaymentFailed has no DB fallback | When Redis lookup fails for subscription mapping: query DB for subscription with matching stripeSubId |
| 35 | Dual tip paths remain | Remove remaining dead code path. Ensure only ONE tip creation flow exists (payments module) |
| 36 | PaymentIntent ID stored in `stripeSubId` field | Store PI ID in correct field. If no dedicated field exists, add one or use metadata |
| 75 | Coin purchase webhook lacks idempotency | Same as #28 |
| 76 | Tip diamond credit lacks idempotency | Before crediting diamonds: check tip status. If already COMPLETED, skip |
| 78 | Duplicate cashout endpoints | Remove the redundant endpoint. Keep one canonical path |
| 249 | Dual subscription paths — monetization creates without Stripe | Add guard: `subscribe()` in monetization must verify Stripe subscription exists before creating local record. Or disable and route through payments module only |
| 251 | Waqf creates no WaqfDonation record | In waqf contribution handler: create WaqfDonation record in the transaction (even though endpoint is disabled, fix the code) |
| 252 | Charity raisedAmount never updated | In charity donation handler: increment `campaign.raisedAmount` in the transaction |

### Tests
- Test coin purchase idempotency (duplicate webhook = no double credit)
- Test tip matching uses PI ID, not findFirst
- Test invoice payment failed falls back to DB
- Test waqf creates donation record
- Test charity increments raisedAmount

---

## Batch 5: Trending, Scoring & Feed Quality
**Findings:** #37, #40-41, #43, #290, #293, #295-299
**Files:** `hashtags.service.ts`, `feed.service.ts`, `personalized-feed.service.ts`, `recommendations.service.ts`, `videos.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 37/299 | Trending hashtags = all-time popularity, no time window | Add `createdAt > NOW() - INTERVAL '48 hours'` filter to trending hashtag query. Use 48h window with decay |
| 40/298 | Scoring weights exceed 1.0 with boosts | Clamp final score: `Math.min(score, 1.0)` after all boosts applied |
| 41 | Exploration slots only in RecommendationsService | Add 10-15% exploration slots to ForYou and Trending feeds: randomly replace N items with random recent content |
| 43 | CommunityTrending sorts by likesCount only | Add time decay: multiply likesCount by `1 / (1 + hoursAge/24)` or similar decay factor |
| 290 | viewsCount always 0 for Posts + Threads | **VERIFY FIRST** — Session 9 added recordView. If fixed, skip. If not: add `recordView()` to posts.service.ts and threads.service.ts getById methods |
| 293 | Block/mute caps inconsistent (0 to 10000) | Standardize ALL block/mute exclusion queries to `take: 10000`. Check: CommunityTrending, NearbyContent, Recommendations, Videos |
| 295 | Remaining isBanned gaps | Grep for feed queries missing `isBanned: false` on user relation. Add where missing |
| 296 | ALL 25 endpoints missing isDeleted check | **VERIFY FIRST** — Session 9 may have added these. Grep for `isDeleted` in feed services. Add `isDeleted: false` to user filter on any query still missing it |
| 297 | 5 endpoints missing isPrivate check | Add `OR: [{ visibility: 'PUBLIC' }, { userId: currentUserId }]` or `visibility: { not: 'PRIVATE' }` to: following feed, hashtag queries, featured feed, search content, related posts |

### Tests
- Test trending hashtags only count recent activity (48h)
- Test score clamping never exceeds 1.0
- Test exploration slots appear in ForYou feed
- Test block/mute exclusion uses consistent cap
- Test isDeleted/isPrivate users hidden from all feeds

---

## Batch 6: Search Indexing Completeness
**Findings:** #46-56, #274-278
**Files:** `users.service.ts`, `videos.service.ts`, `reels.service.ts`, `threads.service.ts`, `posts.service.ts`, `hashtags.service.ts`, `channels.service.ts`, `queue.service.ts`, `search-reconciliation.service.ts`, `meilisearch.service.ts`, `meilisearch-sync.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 46/275 | Users NEVER indexed on create or profile update | In users.service.ts: after user creation and after `updateProfile()`, call `queueService.addSearchIndexJob('users', userId, { username, displayName, bio })` |
| 47 | Post and thread updates don't re-index | In posts.service.ts `update()` and threads.service.ts `update()`: call `addSearchIndexJob` after successful update |
| 48 | Video updates don't re-index | In videos.service.ts `update()`: call `addSearchIndexJob` |
| 49 | Trial reel publishTrial() not re-indexed | In reels.service.ts `publishTrial()`: call `addSearchIndexJob` |
| 50/276 | Reel caption field name chaos | Standardize: use `caption` as the field name in Meilisearch index. In reel indexing code, map from whatever DB field (description/content/caption) to `caption` |
| 51/277 | Reconciliation skips videos, users, hashtags | Extend `search-reconciliation.service.ts` to cover all 6 index types |
| 52 | Document shape inconsistency between real-time and backfill | Ensure the same document builder function is used for both real-time indexing and backfill |
| 53/278 | Videos indexed as PROCESSING, never updated to PUBLISHED | In video stream-ready webhook/handler: re-index the video with updated status |
| 54 | Hashtags never incrementally indexed | After hashtag creation/update, call `addSearchIndexJob('hashtags', ...)` |
| 55 | addDocuments ignores async Meilisearch task failures | Add `.catch(err => { this.logger.error(...); Sentry.captureException(err); })` to all Meilisearch addDocuments/deleteDocuments calls |
| 56 | Channels not in Meilisearch | **VERIFY** — check if channel index exists. If not: add channel index configuration, index channels on create/update |
| 274 | 44 of 51 mutation paths don't update search | For update/delete/ban/unban/mod-remove on posts/threads/reels/videos: add search index update or delete call |

### Tests
- Test user profile update triggers search indexing
- Test post/thread/reel/video update triggers re-indexing
- Test video status change to PUBLISHED triggers re-index
- Test reconciliation covers all 6 types
- Test Meilisearch errors are caught and logged

---

## Batch 7: Visibility & Lifecycle Filter Gaps
**Findings:** #58-73 (verify which remain after Session 9)
**Files:** `feed.service.ts`, `videos.service.ts`, `recommendations.service.ts`, `reels.service.ts`, `search.service.ts`, `hashtags.service.ts`, `posts.service.ts`

### Pre-check
Session 9 confirmed isDeleted is present in feed.service.ts, personalized-feed.service.ts, videos.service.ts, reels.service.ts, threads.service.ts. Verify remaining gaps:

| # | Finding | Fix |
|---|---------|-----|
| 58 | isDeleted never checked | **VERIFY** — likely fixed in Session 9. Check remaining services |
| 59 | getNearbyContent missing ALL filters | **VERIFY** — confirmed fixed with scheduledAt + isDeleted |
| 60 | Hashtag queries missing isDeleted, isPrivate | Add both to hashtag content queries |
| 61 | getCommunityTrending missing filters | **VERIFY** — may be fixed |
| 62 | getFeaturedFeed missing isPrivate | Add `visibility` filter |
| 63 | getRelatedPosts no filters | Add user lifecycle + visibility filters to related posts query |
| 64 | getRecommended videos missing isRemoved + user filters | Add both |
| 65 | pgvector hydration missing lifecycle re-check | After hydrating IDs from pgvector, re-filter for isBanned/isDeleted/isDeactivated |
| 66 | Following feed missing visibility (PRIVATE posts leak) | Add visibility filter: exclude PRIVATE posts unless from followed users |
| 67 | Search content queries missing isDeleted/isPrivate | Add to search.service.ts content queries |
| 68 | Block/mute cap at 50 in recommendations | Raise to 10000 |
| 69 | Minbar trending missing isRemoved | Add `isRemoved: false` to videos trending query |
| 70 | Reel feed block exclusion one-directional | Check BOTH directions: `blockerId` AND `blockedId` |
| 71 | Saved content visibility not checked | When fetching saved/bookmarked items: filter out items from banned/deleted users |
| 72 | Block/mute caps inconsistent | Standardize all to 10000 |
| 73 | scheduledDeletionAt, trending threads | Add scheduledDeletionAt check to user queries; add thread lifecycle filters to trending |

### Tests
- Test each feed endpoint hides content from banned/deleted/deactivated users
- Test private content not visible to non-followers
- Test saved content filters out removed items
- Test block exclusion is bidirectional

---

## Batch 8: GDPR Export & Account Deletion
**Findings:** #88-89, #259-260, #367, #369, #363
**Files:** `privacy.service.ts`, `users.service.ts`, `export.service.ts` (or wherever GDPR export lives)

| # | Finding | Fix |
|---|---------|-----|
| 88 | Export missing ~10 data categories | Add to GDPR export: VoicePost, HifzProgress, HajjProgress, ForumThread, ForumReply, ScholarQuestion, ScholarAnswer, BookmarkCollection, WaqfDonation, CharityDonation |
| 89 | Two export endpoints with different completeness | Merge into single endpoint. Have one delegate to the other, or unify the data collection |
| 259 | ~10 export categories missing | Same as #88 |
| 260 | Counters on OTHER users never decremented on deletion | In privacy.service.ts deleteAllUserData, BEFORE deleting follows: query all followings/followers, then batch-decrement their counts using raw SQL `UPDATE users SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE id IN (...)` |
| 367 | Export missing categories | Same as #88 |
| 369 | R2 media collection missing hlsUrl, dashUrl, VoicePost.audioUrl | Add these fields to the R2 media URL collection for deletion |
| 363 | Auto-unban overwrites user's self-deactivation | Add `deactivationReason` or `isManuallyDeactivated` field check. If user self-deactivated, auto-unban should NOT clear isDeactivated |

### Tests
- Test GDPR export includes all data categories
- Test account deletion decrements follower/following counts on affected users
- Test R2 media deletion includes all URL types
- Test auto-unban respects self-deactivation

---

## Batch 9: Unread Counts & Badge Management
**Findings:** #94-99
**Files:** `notifications.tsx` (mobile), `notifications.service.ts`, `risalah.tsx` (mobile), Zustand store

| # | Finding | Fix |
|---|---------|-----|
| 94 | Single notification read doesn't decrement badge | In mobile notifications.tsx `markAsRead` handler: call `setUnreadNotifications(prev => Math.max(0, prev - 1))` |
| 95 | Message badge stale when Risalah unmounted | Add periodic polling (30s interval) for unread conversation count, or rely on socket reconnect to refresh |
| 96 | Deleting unread notification doesn't update count | In delete notification handler: if notification was unread, decrement badge count |
| 97 | Notification batching re-marks read as unread | When batching notifications: don't include already-read notifications in the unread count update |
| 98 | No floor constraint on unreadCount | Use `Math.max(0, count)` everywhere unreadCount is decremented |
| 99 | Unread notification count unbounded | In cleanup cron: also consider capping notification count. In badge calculation: cap at 99+ for display |

### Tests
- Test markAsRead decrements unread count
- Test delete of unread notification decrements count
- Test unread count never goes negative
- Test badge re-fetch on socket reconnect

---

## Batch 10: Database Indexes
**Findings:** #100, #102, #104
**Files:** `schema.prisma`

| # | Finding | Fix |
|---|---------|-----|
| 100 | Notification no composite index | Add `@@index([userId, type, createdAt])` to Notification model |
| 102 | Reel feed no composite index | Add `@@index([status, isRemoved, isTrial, createdAt])` to Reel model |
| 104 | Video trending queries createdAt but index on publishedAt | Add `@@index([status, isRemoved, createdAt])` to Video model |

### After adding indexes
Run `npx prisma db push` to sync schema (dev). In production these will be added on next deploy.

### Tests
- Verify prisma generate succeeds
- Verify existing tests still pass

---

## Batch 11: Redis Hardening & Dead Data Cleanup
**Findings:** #106-118, #301-303
**Files:** `security.service.ts` (device counter), `analytics.service.ts`, `cache.service.ts`, `islamic.service.ts`, `messages.service.ts`, `feed.service.ts`, `ab-testing.service.ts`, `publish-workflow.service.ts`, various services with Redis

| # | Finding | Fix |
|---|---------|-----|
| 106 | Device account counter no TTL, lost on flush | Add TTL (30 days) to device counter Redis keys. Also persist device-account mappings to DB |
| 107 | Analytics buffer unbounded + no OnModuleDestroy | **VERIFY** — may be fixed. If not: add buffer cap (10000), implement OnModuleDestroy to flush |
| 108 | Rate limiter uses in-memory storage | Install `@nestjs/throttler-storage-redis` and configure: `ThrottlerModule.forRoot({ storage: new ThrottlerStorageRedisService(redisClient) })` |
| 111 | Community dhikr counter Redis-only | Add daily DB persistence: cron that copies Redis dhikr count to DB table |
| 112 | Followed mosque data Redis-only | Persist mosque follows to DB. Redis as cache, DB as source of truth |
| 113 | Group invite links Redis-only | Store invite links in DB (ConversationInviteLink model or similar). Redis as cache |
| 114 | Prayer DND silently disabled on cache miss | On Redis miss: query DB for user's DND setting instead of returning false |
| 115 | redis.keys() in 6+ production paths | Replace ALL `redis.keys()` calls with `redis.scan()` or pattern-specific alternatives. Check: ab-testing, publish-workflow, feed, cache.ts |
| 116 | Negative feed signals written but never read (dead data) | Remove dead code writing negative signals to Redis, OR implement the consumer that reads them |
| 117 | Session depth data written but never read | Remove dead code, OR implement consumer |
| 118 | Impression tracking returns success on failure | Return actual success/failure from impression tracking Redis ops |
| 301 | 4 dead data patterns | Remove: dm_shares, prayer_queue, session:depth, analytics:events dead writes |
| 302 | 10+ patterns have no TTL | Add TTLs: community:dhikr:today (24h), post:impressions (7d), device_accounts (30d), etc. |
| 303 | redis.keys() in 4 locations | Same as #115 |

### Tests
- Test ThrottlerModule uses Redis storage
- Test device counter has TTL
- Test redis.keys() not used in production code (grep verification)
- Test prayer DND falls back to DB on cache miss

---

## Batch 12: Cursor Pagination Fixes
**Findings:** #130-131, #133-134, #136-140
**Files:** `personalized-feed.service.ts`, `feed.service.ts`, `recommendations.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 130 | Personalized feed cursor ignored | Use cursor to filter out already-seen content IDs from previous pages |
| 131 | Featured feed cursor filters by ID but sorts by featuredAt | Change cursor to featuredAt-based: `{ featuredAt: { lt: cursorFeaturedAt } }` |
| 133 | Blended feed trending half re-fetched | Cache trending results in Redis for the session/page-sequence, use offset for subsequent pages |
| 134 | Offset pagination on non-deterministic scored pools | For scored feeds: use score-based cursor `{ score: { lt: lastScore } }` or cache the pool |
| 136 | 4 recommendation endpoints have no pagination | Add `take` + `cursor` parameters to all recommendation endpoints |
| 137 | Block/mute exclusion capped at 50 in recommendations | Raise to 10000 |
| 138 | Empty page possible with hasMore=true | After filtering, if result is empty but DB has more: fetch another batch before returning |
| 140 | getNearbyContent hasMore lies | Calculate hasMore based on actual remaining count, not just `results.length >= take` |

### Tests
- Test cursor pagination returns different results on page 2
- Test recommendations have take/cursor params
- Test hasMore is accurate
- Test empty pages don't occur when content exists

---

## Batch 13: Counter Atomicity & Transaction Isolation
**Findings:** #141-148, #330-343
**Files:** `reels.service.ts`, `posts.service.ts`, `threads.service.ts`, `follows.service.ts`, `circles.service.ts`, `channels.service.ts`, `videos.service.ts`, `gamification.service.ts`, `blocks.service.ts`, `payments.service.ts`, `privacy.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 141/331 | Reel comment like/unlike NOT atomic | Wrap in `$transaction`: create/delete reaction + increment/decrement count |
| 142 | Post/Thread viewsCount never incremented | **VERIFY** — Session 9 added recordView(). If present, skip |
| 143/260 | Account deletion doesn't decrement others' counters | Batch decrement follower/following counts (see Batch 8) |
| 144 | Reel comment unlike no GREATEST guard | **VERIFY** — Session 9 may have added. Use `GREATEST("likesCount" - 1, 0)` |
| 145 | Series unfollow no GREATEST guard | Add GREATEST(0) to series unfollow counter decrement |
| 146/335 | Circle leave brief negative window | Wrap decrement in transaction with GREATEST(0) |
| 147 | Reconciliation covers only 5 of 30+ counters | Extend CounterReconciliationService to cover: threadRepliesCount, reelCommentsCount, reelLikesCount, videoLikesCount, videoCommentsCount, channelSubscribersCount, channelVideosCount, hashtagPostsCount, hashtagReelsCount, hashtagThreadsCount, circleMembersCount, playlistItemsCount, etc. |
| 148/330 | Broadcast subscribe/unsubscribe not atomic | Wrap member.create + counter increment in $transaction |
| 332 | Scholar QA voteQuestion no transaction, no P2002 | Wrap in $transaction. Add `.catch(e => { if (e.code === 'P2002') throw ConflictException })` |
| 333 | Hashtag counter decrements outside soft-delete transaction | Move hashtag counter decrement inside the post/thread soft-delete transaction |
| 334 | Reel hashtag upserts before reel creation | Move hashtag upserts to AFTER successful reel creation, inside the transaction |
| 336 | Video view dedup check outside transaction | Wrap view check + viewsCount increment in transaction |
| 337 | Gamification awardXP level calculated on stale totalXP | Read totalXP inside the $transaction that awards XP, not before it |
| 339 | Coin purchase matches by amount+description, not PI ID | Match by `stripePaymentIntentId` (see Batch 4) |
| 340 | Video like dislike-to-like flip stale read | Wrap the flip (remove dislike + add like + update counts) in single $transaction |
| 341 | Block cleanup fire-and-forget | Add `.catch()` error handler to block cleanup operations |
| 342 | Block follow scan concurrent drift | Use $transaction for the block operation that unfollows |
| 343 | Thread votePoll no P2002 catch | Add P2002 catch for duplicate vote, throw ConflictException |

### Tests
- Test reel comment like/unlike is atomic (mock transaction)
- Test counter decrements use GREATEST(0)
- Test duplicate vote returns 409 not 500
- Test video view dedup prevents double counting
- Test XP level calculation is accurate

---

## Batch 14: Config Validation & Startup Guards
**Findings:** #150, #152, #154-160
**Files:** `main.ts`, `app.module.ts`, `config/`, `health.controller.ts`, `payments.service.ts`, `upload.service.ts`, `email.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 150 | Empty CORS_ORIGINS in production = failure | In main.ts: validate `CORS_ORIGINS` is non-empty when `NODE_ENV=production`, throw on startup if missing |
| 152 | /health/live always returns 200 regardless of Redis | Make /health/live check Redis connection. Or switch Railway healthcheck to /health/ready |
| 154 | listPaymentMethods skips Stripe check | Add guard: if `!this.stripe` throw ServiceUnavailableException |
| 155 | Stripe SDK initialized with empty key | Guard in constructor: if STRIPE_SECRET_KEY is empty, set `this.stripe = null` and guard all methods |
| 156 | Feature flags return false on Redis down | Log warning when Redis fails for feature flags. Consider fallback to env-var based defaults |
| 157 | APP_URL defaults diverge (mizanly.app vs .com) | Standardize all defaults to `mizanly.app` |
| 158 | Email silently drops all messages | Add error logging + Sentry capture when Resend fails. Queue for retry if possible |
| 159 | NODE_ENV unset = Swagger + stack traces in prod | Add startup guard: warn if NODE_ENV is not set. Disable Swagger unless NODE_ENV=development explicitly |
| 160 | Upload S3 client with empty credentials | Guard: if R2 credentials missing, throw on startup or disable upload endpoints |

### Tests
- Test CORS_ORIGINS validation fails on empty in production
- Test Stripe guard returns 503 when unconfigured
- Test APP_URL consistency
- Test Swagger disabled in production

---

## Batch 15: Observability & Cron Reliability
**Findings:** #162-169, #305-314
**Files:** `metrics.interceptor.ts`, `chat.gateway.ts`, cron services (scheduling, islamic, analytics, notifications, privacy, feed), `app.module.ts`

| # | Finding | Fix |
|---|---------|-----|
| 162 | Sentry captures ONLY HTTP errors | Add `Sentry.captureException()` to: queue processor error handlers, socket error handlers, cron catch blocks |
| 163 | Dual logging systems | Remove one. Keep pino-http for structured JSON logging. Remove NestJS default logger OR configure NestJS to use pino |
| 165 | No queue job duration tracking | Add timing to queue processors: `const start = Date.now()` at beginning, log duration at end |
| 166 | Socket connect/disconnect not logged | In chat.gateway.ts handleConnection/handleDisconnect: add `this.logger.log(\`Socket connected: ${client.id}\`)` |
| 167 | MetricsInterceptor hardcodes status 200 | Use `response.statusCode` from the actual response instead of hardcoded 200 |
| 168 | /health/live doesn't check dependencies | Same as #152 — add Redis ping to /health/live |
| 169 | In-memory request counters reset on deploy | Move request counters to Redis with INCR, or accept this limitation with a comment |
| 305 | ZERO Sentry in cron jobs | **VERIFY** — Session 9 added Sentry to scheduling.service.ts. Add to ALL other cron services |
| 306 | publishScheduledMessages duplicate sends | Add Redis lock: `SET scheduled_messages_lock NX EX 120` before processing. Skip if lock exists |
| 307/322 | snapshotFollowerCounts 200K OOM | Paginate: fetch users in batches of 1000, upsert per batch. Use cursor pagination |
| 308 | processScheduledDeletions — GDPR fails silently | Add Sentry.captureException + alerting for deletion failures |
| 309 | cleanupOldNotifications unbounded DELETE | Add `take: 10000` limit per run. Run more frequently if needed |
| 310 | 8 of 14 cron jobs no error handling | Wrap every @Cron handler in try/catch with Sentry.captureException |
| 311 | Schedule collisions (3 AM, 4 AM) | Stagger: spread crons across different minutes (0, 5, 10, 15, 20...) |
| 312 | sendVerseOfTheDay invalid Quran reference | Fix the Math.ceil calculation to produce valid surah:ayah references |
| 313 | checkIslamicEventReminders Hijri conversion | Add validation: verify computed Hijri date is within +/-1 day tolerance |
| 314 | sendWeeklyScreenTimeDigest no dedup | Add Redis key `digest_sent:{userId}:{weekId}` with 8d TTL to prevent duplicate sends |

### Tests
- Test Sentry captures exceptions in cron jobs
- Test scheduled messages lock prevents duplicate processing
- Test follower snapshot paginates (doesn't load all users)
- Test notification cleanup has take limit
- Test cron schedules don't overlap
- Test Quran verse reference calculation

---

## Batch 16: Real-time & Presence
**Findings:** #178, #180-182, #184-185, #187-190
**Files:** `chat.gateway.ts`, mobile socket files

| # | Finding | Fix |
|---|---------|-----|
| 178 | Online/offline broadcasts ignore privacy | **VERIFY** — Session 9 may have fixed. Check `activityStatus` in gateway |
| 180 | Sender receives own messages; clientId dedup broken | Use socket.id for dedup: emit to room EXCEPT sender's socket. Use `socket.to(room).emit()` instead of `server.to(room).emit()` |
| 181 | join_content/leave_content no auth | Add auth check: verify user has access to the content before allowing room join |
| 182 | content:update events never subscribed on mobile | Add socket.on('content:update') listener in relevant mobile screens |
| 184 | message_delivered never emitted by mobile | In mobile conversation screen: emit `message_delivered` when message is rendered/visible |
| 185 | Risalah tab joins rooms without re-triggering on reconnect | Add socket reconnect handler that re-joins conversation rooms |
| 187 | Typing indicators no server-side timeout | Add 10s timeout: if no new typing event in 10s, emit `stop_typing` automatically |
| 188 | WsSendMessageDto.conversationId uses @IsString() not @IsUUID() | Change to `@IsUUID()` |
| 189 | Redis adapter falls back to in-memory silently | Log warning: `this.logger.warn('Redis adapter fallback to in-memory')` |
| 190 | Token refresh race condition during reconnection | Queue reconnection attempts: if refresh in progress, wait for it to complete before reconnecting |

### Tests
- Test sender doesn't receive own messages
- Test join_content requires auth
- Test typing indicator timeout (10s)
- Test conversationId validation rejects non-UUID
- Test Redis adapter logs warning on fallback

---

## Batch 17: Auth, Webhooks & Ban Enforcement
**Findings:** #191-197, #254, #256-257
**Files:** `auth.service.ts`, `optional-clerk-auth.guard.ts`, `reports.service.ts`, `chat.gateway.ts`

| # | Finding | Fix |
|---|---------|-----|
| 191 | Race condition — signup requires DB user from webhook | Add retry with backoff in auth guard: if user not found, wait 1s and retry once (webhook may be in flight) |
| 192 | user.deleted webhook only deactivates | In auth.service.ts handleUserDeleted: call `privacyService.deleteAllUserData(userId)` instead of just setting isDeactivated |
| 193 | Auto-unban NOT enforced in OptionalClerkAuthGuard | Copy auto-unban logic from ClerkAuthGuard to OptionalClerkAuthGuard |
| 194 | syncClerkUser creates user without COPPA fields | Add default values: `isChildAccount: false`, `tosAcceptedAt: new Date()` when creating user from Clerk sync |
| 195 | Phone number never synced from Clerk | In webhook handler: extract `phone_numbers[0]` from Clerk event data and update user.phone |
| 196 | session.revoked/removed/ended have no action | In webhook handler: on session revocation, emit `force_disconnect` to user's socket rooms |
| 197 | user.updated doesn't sync username changes | In handleUserUpdated: check if username changed, update in DB + create UsernameHistory record if model exists |
| 254 | Reports ban path incomplete | In reports.service.ts ban action: set `isDeactivated: true`, call Clerk `banUser()` API |
| 256 | No real-time socket disconnection for banned users | In ban flow: emit `force_disconnect` to user's socket rooms via Redis pub/sub |
| 257 | No Meilisearch removal on ban | After banning: call `meilisearchService.deleteDocuments` for all user's content |

### Tests
- Test user.deleted webhook triggers full GDPR deletion
- Test OptionalClerkAuthGuard auto-unbans
- Test phone number synced from Clerk webhook
- Test session revocation disconnects sockets
- Test ban removes user from Meilisearch
- Test reports ban sets isDeactivated + calls Clerk

---

## Batch 18: Input Sanitization
**Findings:** #200-203
**Files:** `sanitize.pipe.ts`, `sticker-generation.service.ts` (or AI prompt service)

| # | Finding | Fix |
|---|---------|-----|
| 200 | SanitizePipe doesn't recurse into nested objects | Add recursive traversal: if value is object, recurse. If array, map and recurse each element |
| 201 | Sticker generation no XML delimiter protection | Escape `<`, `>`, `&` in user input before inserting into AI prompt XML |
| 202 | SanitizePipe only processes body — query/param not sanitized | Bind SanitizePipe globally with `APP_PIPE` or add `@UsePipes(SanitizePipe)` to controllers. Or add separate query/param sanitization |
| 203 | HTML strip regex incomplete | Use a proper HTML stripping library like `striptags` or `sanitize-html` instead of regex |

### Tests
- Test SanitizePipe recursion on nested objects
- Test XML special characters escaped in AI prompts
- Test query parameters are sanitized
- Test edge case HTML (unclosed tags, nested tags) is stripped

---

## Batch 19: Test Quality Improvements
**Findings:** #205-214
**Files:** Various `*.spec.ts` files

| # | Finding | Fix |
|---|---------|-----|
| 205 | Tests with ZERO assertions | Add meaningful assertions to payments.service.spec.ts and any other tests with zero assertions |
| 206 | Concurrency tests only assert "did not crash" | Add final value assertions: after concurrent operations, verify counters/balances are correct |
| 207 | Payment tests verify routing not money math | Add assertions for actual amounts: verify coinBalance change equals expected amount |
| 208 | deleteAccount tests don't verify anonymization | Assert: username matches `deleted_*`, email matches `@deleted.local`, website/madhab/location are null |
| 209 | 379 toBeDefined() sole assertions | Replace `expect(result).toBeDefined()` with meaningful checks (field values, array lengths, types) — do 50+ in this batch |
| 210 | ContentSafetyService tests always return safe | Add test case where AI returns unsafe content, verify content is flagged/rejected |
| 211 | Push notification chain mocked at every level | Add at least one test that verifies the full chain (create notification → format push → queue job) |
| 212 | globalMockProviders set AI to always safe | Add test variant that sets AI mock to return unsafe, verify moderation kicks in |
| 213 | 29 "should be defined" boilerplate tests | Remove or replace with meaningful behavior tests |
| 214 | Missing lifecycle transition tests | Add tests: ban→content hidden, schedule→publish triggers side effects, delete→anonymize verifies PII removal |

### Tests
This IS the test batch. Target: replace/enhance 100+ weak assertions across the test suite.

---

## Batch 20: Mobile-Backend Endpoint Drift
**Findings:** #219-223
**Files:** Mobile API service files, backend controllers

| # | Finding | Fix |
|---|---------|-----|
| 219 | Follow requests endpoint path stale | Remove dead code path from mobile API service. Keep only the working endpoint |
| 220 | Hadith bookmark endpoint 404 | Either: create the backend endpoint (HadithBookmark controller method), or remove the mobile API call |
| 221 | Video cross-publish endpoint 404 | Either: create the backend endpoint, or remove the mobile API call |
| 222 | Search suggestions semantic mismatch | Fix mobile to use the correct endpoint for user suggestions, or rename backend endpoint |
| 223 | Cancel subscription DELETE body stripped by CDN | Change from DELETE with body to POST `/subscriptions/:id/cancel` |

### Tests
- Test new/fixed endpoints return expected responses
- Test mobile API service methods point to valid endpoints

---

## Batch 21: Fan-out & Batching Optimization
**Findings:** #224-225, #227-229
**Files:** `islamic.service.ts`, `analytics.service.ts`, `counter-reconciliation.service.ts`, `encryption.service.ts`, `channels.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 224 | Verse of Day 1000 sequential creates | **VERIFY** — Session 9 may have fixed with createMany. If not: use createMany in batches of 500 |
| 225 | Follower Snapshot 200K individual upserts | Paginate users (1000/batch). Use raw SQL `INSERT INTO ... ON CONFLICT DO UPDATE` for each batch |
| 227 | Counter Reconciliation 2500 sequential updates | Use raw SQL batch: `UPDATE users SET "followersCount" = (SELECT COUNT(*) FROM follows WHERE "followingId" = users.id) WHERE id = ANY($1)` |
| 228 | Encryption Key Rotation 50 sequential creates | Use `prisma.message.createMany()` |
| 229 | Broadcast channel sendMessage no subscriber notification | After saving broadcast message: notify subscribers via push. Use createMany for notifications, batch push jobs |

### Tests
- Test follower snapshot pagination (batch size 1000)
- Test counter reconciliation uses batch SQL
- Test broadcast message triggers subscriber notifications

---

## Batch 22: Denormalized State & Cache Invalidation
**Findings:** #230-241
**Files:** `counter-reconciliation.service.ts`, `admin.service.ts`, `follows.service.ts`, `cache.service.ts`, `search-reconciliation.service.ts`, `reels.service.ts`, `hashtags.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 230 | Reconciliation covers only 6 of 89+ counters | **VERIFY** — Session 9 expanded to 17. Extend further to cover ALL model counters: Post.commentsCount, Post.savesCount, Post.sharesCount, Reel.loopsCount, Reel.savesCount, Thread.repliesCount, Video.likesCount, etc. |
| 231 | Admin reconciliation endpoint is dead stub | Wire the endpoint to actually call CounterReconciliationService |
| 232 | LIMIT 1000/500 caps prevent full reconciliation | Use cursor-based pagination: process all records in 1000-item pages |
| 233 | User profile cache not invalidated on follow/unfollow | In follows.service.ts: after follow/unfollow, delete Redis cache key for both users |
| 234 | Post savesCount/sharesCount not repairable | Add to reconciliation: `UPDATE posts SET "savesCount" = (SELECT COUNT(*) FROM bookmarks WHERE "postId" = posts.id)` |
| 235 | Hashtag counters unreconciled | Add hashtag counter reconciliation: count actual posts/reels/threads per hashtag |
| 236 | Search reconciliation misses users/videos/hashtags | Extend search reconciliation to all 6 index types |
| 237 | ConversationMember.unreadCount not repairable | Add: `UPDATE conversation_members SET "unreadCount" = (SELECT COUNT(*) FROM messages WHERE "conversationId" = ... AND "createdAt" > conversation_members."lastReadAt")` |
| 238 | Redis cache keys no mutation-based invalidation | After key mutations (follow, like, save, etc.): delete relevant cache keys |
| 239 | N+1 update pattern in reconciliation | Replace individual UPDATE loops with batch raw SQL |
| 240 | Reel.loopsCount NEVER incremented | Add `recordLoop()` method to reels.service.ts. Increment loopsCount on reel completion/loop |
| 241 | Hashtag counter increments outside transaction | Move inside the parent content creation transaction |

### Tests
- Test reconciliation covers all counter types
- Test admin endpoint triggers reconciliation
- Test cache invalidated after follow/unfollow
- Test loopsCount incremented on reel loop

---

## Batch 23: Memory & Connection Leak Prevention
**Findings:** #316-317, #319-321, #324-326
**Files:** `analytics.service.ts`, `redis-io.adapter.ts`, `async-job.service.ts`, `users.service.ts`, `embeddings.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 316 | AnalyticsService buffer unbounded + no OnModuleDestroy | **VERIFY** — may be fixed. If not: add buffer cap (10000 items), implement OnModuleDestroy to flush |
| 317 | AnalyticsService setInterval never cleared | Store interval reference, clear in OnModuleDestroy |
| 319 | Prisma connection pool no explicit configuration | Add `?connection_limit=10` to DATABASE_URL, or configure in Prisma client instantiation |
| 320 | RedisIoAdapter 2 Redis connections never closed | Implement OnModuleDestroy: `this.pubClient.quit(); this.subClient.quit()` |
| 321 | Redis SHUTDOWN provider onModuleDestroy may not fire | Convert to a proper NestJS provider class that implements OnModuleDestroy |
| 324 | AsyncJobService dangling setTimeout timers | Store timer references in a Set. In OnModuleDestroy: clear all timers |
| 325 | findByPhoneNumbers 10K users + 10K hashes | Paginate: process phone numbers in batches of 500. Use SQL `ANY()` instead of Prisma `in` |
| 326 | EmbeddingPipelineService infinite loop if API down | Add exponential backoff. After N failures, stop and alert via Sentry |

### Tests
- Test AnalyticsService cleanup on module destroy
- Test Redis connections closed on shutdown
- Test phone number lookup pagination
- Test embedding pipeline backs off on API failure

---

## Batch 24: N+1 Query Hotpath Optimization
**Findings:** #344-358
**Files:** `feed.service.ts`, `personalized-feed.service.ts`, `messages.service.ts`, `notifications.service.ts`, `recommendations.service.ts`, `hashtags.service.ts`, `search.service.ts`, `scheduling.service.ts`

| # | Finding | Fix |
|---|---------|-----|
| 344 | Redundant getExcludedUserIds() across 5 services | **VERIFY** — Session 9 may have added Redis cache. If not: cache excluded IDs in Redis (60s TTL) per user |
| 345 | PersonalizedFeed double-fetches content | Merge getContentMetadata and hydrateItems into single query |
| 346 | ForYou feed 4 separate block/mute queries | Combine into single query returning all excluded IDs |
| 347 | Following feed caps at 50 follows | Raise to 10000 or use cursor-based fetch for user's follows |
| 348 | sendMessage 6-9 sequential queries | Remove duplicate `conversation.findUnique`. Cache first result |
| 349 | forwardMessage 5 queries x 5 targets | Batch: create all forwarded messages with createMany, then batch-update conversations |
| 350 | Hashtag upsert N+1 | Batch: collect all hashtags, upsert with single `createMany({ skipDuplicates: true })` + raw SQL bulk increment |
| 351 | Recommendations triple-fetch same table | Merge 3 queries into 1 with `select` picking all needed columns |
| 352 | Aggregate search 7 sequential ILIKE scans | Use `Promise.all()` to parallelize all 7 searches |
| 353 | Grouped notifications 200-row over-fetch | Reduce initial fetch: use GROUP BY in query to get grouped counts, then hydrate only needed rows |
| 354 | Scheduled messages per-message transaction loop | Batch: fetch all due messages, createMany for outgoing, updateMany for status |
| 355 | Scheduled post notifications 300 sequential ops | Batch: createMany notifications, then queue push jobs in bulk |
| 356 | Conversation list loads ALL members | Add `take: 5` to member includes (show "John, Sarah, and 48 others") |
| 357 | Message reactions unbounded | Add `take: 50` to reaction includes |
| 358 | Recommendations block cap at 50 | Raise to 10000 |

### Tests
- Test excluded IDs cached in Redis
- Test following feed handles 100+ follows
- Test search queries run in parallel
- Test conversation list limits member count
- Test message reactions are capped

---

## Execution Summary

| Batch | Area | Findings | Est. Time |
|-------|------|----------|-----------|
| 1 | Scheduled Publishing & Workflow | #1-10, #122-128, #264-273 | 4h |
| 2 | Queue & Job Processing | #13, #19, #20 | 1h |
| 3 | Notifications | #21, #24-26, #281, #283-287 | 4h |
| 4 | Payments & Wallet | #28-29, #34-36, #75-76, #78, #246-252 | 4h |
| 5 | Trending & Scoring | #37, #40-41, #43, #290-299 | 3h |
| 6 | Search Indexing | #46-56, #274-278 | 4h |
| 7 | Visibility & Lifecycle | #58-73 | 3h |
| 8 | GDPR Export & Deletion | #88-89, #259-260, #363, #367, #369 | 3h |
| 9 | Unread Counts | #94-99 | 2h |
| 10 | Database Indexes | #100, #102, #104 | 30min |
| 11 | Redis Hardening | #106-118, #301-303 | 5h |
| 12 | Cursor Pagination | #130-140 | 4h |
| 13 | Counter Atomicity | #141-148, #330-343 | 5h |
| 14 | Config Validation | #150-160 | 2h |
| 15 | Observability & Crons | #162-169, #305-314 | 5h |
| 16 | Real-time & Presence | #178-190 | 3h |
| 17 | Auth & Webhooks | #191-197, #254, #256-257 | 3h |
| 18 | Sanitization | #200-203 | 2h |
| 19 | Test Quality | #205-214 | 4h |
| 20 | Mobile-Backend Drift | #219-223 | 2h |
| 21 | Fan-out & Batching | #224-229 | 3h |
| 22 | Denormalized State | #230-241 | 5h |
| 23 | Memory & Leaks | #316-326 | 3h |
| 24 | N+1 Hotpaths | #344-358 | 4h |
| **TOTAL** | | **~220 findings** | **~73h** |

---

## Cross-Reference: Duplicate Findings (Same Issue in Multiple Waves)

These findings appear under different wave names but are the SAME underlying issue. Fix once:

| Primary | Duplicates | Issue |
|---------|-----------|-------|
| #3 | #123, #64, #268 | videos.getRecommended missing filters |
| #10 | #265 | publishOverdueContent erases scheduledAt |
| #28 | #75, #247 | Coin purchase not idempotent |
| #29 | #246 | Tip matches wrong tip |
| #37 | #299 | Trending hashtags no time window |
| #46 | #275 | Users never indexed |
| #50 | #276 | Reel caption field chaos |
| #51 | #236, #277 | Search reconciliation incomplete |
| #58 | #296 | isDeleted missing from feeds |
| #124 | #267 | getUserThreads hides owner scheduled |
| #142 | #290 | viewsCount never incremented |
| #143 | #260 | Deletion doesn't decrement counters |
| #147 | #230 | Reconciliation covers few counters |
| #307 | #322 | snapshotFollowerCounts OOM |

**After deduplication: ~190 unique fixes across 24 batches.**
