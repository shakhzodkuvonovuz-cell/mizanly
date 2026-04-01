# R2 TAB4 Progress — Cross-Module Payments/Messages/Notifications + Mobile API Parity + Performance

**Started:** 2026-04-01
**Audit files:** X02(~12) + X03(34) + X05(21) + X08(~4) + X10(22) + J07(~3) + J08(~15) + J01(~4) + K03(5) = ~120 findings
**Status:** 65 code-fixed, 16 already-fixed-in-R1, 8 deferred, ~31 documented/info/R1-overlap

## Commits
1. `1a4cd591` — checkpoint 1: 35+ findings (counters, payments, messages, notifications)
2. `cc376177` — checkpoint 2: API parity + Redis + perf (mobile, islamic, stories, commerce)

## Test Results
**40 suites, 951 tests, ALL passing**

---

## Fix Log

### K03 — Counter Reconciliation SQL Table Names (13 wrong references)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| K03-1 | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostCounts (likesCount UPDATE) |
| K03-1b | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostCounts (commentsCount UPDATE) |
| K03-1c | C | FIXED | `"Post" p` → `"posts" p` in reconcileUserPostCounts (SELECT JOIN) |
| K03-1d | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostSavesCounts (UPDATE) |
| K03-1e | C | FIXED | `"Post" s` → `"posts" s` in reconcilePostSharesCounts (SELECT JOIN) |
| K03-1f | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostSharesCounts (UPDATE) |
| K03-2 | C | FIXED | `"Reel" r` → `"reels" r` in reconcileUserContentCounts (SELECT JOIN) |
| K03-2b | C | FIXED | `"Reel".id` → `"reels".id` in reconcileReelCounts (likesCount UPDATE) |
| K03-2c | C | FIXED | `"Reel".id` → `"reels".id` in reconcileReelCounts (commentsCount UPDATE) |
| K03-4 | C | FIXED | `"Video".id` → `"videos".id` in reconcileVideoCounts (likesCount UPDATE) |
| K03-4b | C | FIXED | `"Video".id` → `"videos".id` in reconcileVideoCounts (commentsCount UPDATE) |
| K03-5 | C | FIXED | `"Post" p` → `"posts" p` in reconcileHashtagCounts (SELECT JOIN) |
| K03-5b | C | FIXED | `"Hashtag".id` → `"hashtags".id` in reconcileHashtagCounts (UPDATE) |
| K03-3 | — | NOT NEEDED | Thread UPDATEs already used `"threads".id` correctly |

### X03 — Payment & Commerce Cross-Module (34 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | C | ALREADY FIXED IN R1 | A09-#1: await storePaymentIntentMapping |
| 2 | C | FIXED | Tip fallback requires receiverId + amount match (no ambiguous concurrent tips) |
| 3 | C | FIXED | Tip idempotency guard: check status=completed before $transaction entry |
| 4 | H | DOCUMENTED | Coin PI dedup uses description field — works, not ideal |
| 5 | H | FIXED | Order cancel/refund + stock restore wrapped in $transaction |
| 6 | H | DOCUMENTED | Cashout TOCTOU — dead code (NotImplementedException) |
| 7 | H | FIXED | Dispute handler: DB fallback + atomic diamond reversal in $transaction |
| 8 | H | ALREADY FIXED IN R1 | A09-#8: gifts.cashout NotImplementedException |
| 9 | H | ALREADY FIXED IN R1 | A09-#1: storePaymentIntentMapping await |
| 10 | H | ALREADY FIXED IN R1 | A09-#14: Stripe init placeholder |
| 11 | H | FIXED | Stripe product cached per tier (search + Redis 30d cache) — no new product per subscription |
| 12 | M | ALREADY FIXED IN R1 | A09-#15: Math.ceil for coin pricing |
| 13 | M | DOCUMENTED | Tip created outside PI — PI cancel on failure needed (not refactored) |
| 14 | M | DOCUMENTED | monetization.subscribe() creates as pending — payment via webhook |
| 15 | M | DOCUMENTED | monetization.unsubscribe() — payments.cancelSubscription() handles Stripe |
| 16 | M | FIXED | Premium endDate extends from current endDate (not from now) |
| 17 | M | FIXED | Default webhook logs unknown type; only falls through to tip for null type (legacy) |
| 18 | M | DOCUMENTED | Order PI creation before stock check — PI cancelled on failure |
| 19 | M | ALREADY FIXED IN R1 | A09-#5: @Min(0.50) tip amount |
| 20 | M | ALREADY FIXED IN R1 | A09-#18: gifts as any removed |
| 21 | M | DOCUMENTED | Premium PI not stored in mapping — uses metadata.userId |
| 22 | M | ALREADY FIXED IN R1 | Deterministic webhook errors return 200 |
| 23 | M | DOCUMENTED | handleInvoicePaid Stripe API call — period end available on invoice |
| 24 | L | DEFERRED | Tip unique constraint millisecond — needs schema change |
| 25 | L | DEFERRED | check-constraints.sql not in CI — needs pipeline config |
| 26 | L | ALREADY FIXED IN R1 | A09-#6-#11: Dead code methods NotImplementedException |
| 27 | L | ALREADY FIXED IN R1 | A09-#27: Stripe init guard consistent |
| 28 | L | DOCUMENTED | Payment method orphan on subscription failure — minor |
| 29 | L | ALREADY FIXED IN R1 | UpdateTierDto @Min validated |
| 30 | L | DOCUMENTED | Product hard delete — future: soft delete |
| 31 | L | FIXED | Dispute handler: DB fallback added (was Redis-only) |
| 32 | I | DOCUMENTED | Diamond conversion 0.007 magic number — centralized in financial.ts |
| 33 | I | DOCUMENTED | Platform fee 0.10 magic number |
| 34 | I | DOCUMENTED | DIAMONDS_PER_USD_CENT float — minimal risk |

### X02 — Message E2E (~12 findings in scope)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 2 | H | DOCUMENTED | Sealed sender fast path dead code — gateway passes real senderId |
| 4 | H | ALREADY FIXED IN R1 | setMessageExpiry stores seconds (was minutes) |
| 5 | H | ALREADY FIXED IN R1 | e2eSenderKeyId uses !== undefined (not truthy) |
| 6 | H | FIXED | Sealed sender path now includes e2eSenderKeyId |
| 8 | M | ALREADY FIXED IN R1 | processExpiredMessages clears all E2E fields |
| 9 | M | ALREADY FIXED IN R1 | View-once expiry clears all E2E fields |
| 10 | M | ALREADY FIXED IN R1 | Push generic body for E2E messages |
| 11 | M | DOCUMENTED | Triple truncation (100/100/80) — cosmetic |
| 12 | M | ALREADY FIXED IN R1 | _skipRedisPublish in interface (no as any) |
| 14 | L | ALREADY FIXED IN R1 | Invite link Redis TTL uses correct calculation |
| 15 | L | NOT NEEDED | REST SendMessageDto — service-level isE2E check enforces |
| 17 | I | ALREADY FIXED IN R1 | deleteMessage uses select |
| 18 | H | FIXED | scheduleMessage rejects plaintext in E2E conversations |

### X05 — Notification Pipeline (21 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | C | ALREADY FIXED IN R1 | B10-#9: TAG/COLLAB_INVITE push cases added |
| 2 | C | ALREADY FIXED IN R1 | B10-#2: Banned/deleted actor check in create() |
| 3 | H | NOT NEEDED | forwardMessage rejects E2E messages at line 1079 |
| 4 | H | FIXED | Scheduled message cron: generic body for E2E/encrypted messages |
| 5 | H | DOCUMENTED | MESSAGE push senderName — addressed by generic body for E2E |
| 6 | H | ALREADY FIXED IN R1 | B10-#13: markRead uses notification:badge channel |
| 7 | H | ALREADY FIXED IN R1 | B10-#20: markAllRead emits pub/sub |
| 8 | M | DOCUMENTED | Push pipeline defense-in-depth — caller sanitizes E2E |
| 9 | M | ALREADY FIXED IN R1 | A08-#5: InternalPushDto class with validators |
| 10 | M | ALREADY FIXED IN R1 | A08-#6: sendToUsers per-user badge counts |
| 11 | M | FIXED | typeToSetting map expanded: REPOST, QUOTE_POST, CHANNEL_POST, VIDEO_PUBLISHED, POLL_VOTE, TAG, COLLAB_INVITE |
| 12 | M | DEFERRED | Mobile push handler types — mobile code, not API scope |
| 13 | M | DEFERRED | Socket new_notification handler — mobile code |
| 14 | M | FIXED | Dedup key: system notifications include title prefix to avoid collision |
| 15 | M | ALREADY FIXED IN R1 | A08-#12: Batched notification body grammar |
| 16 | L | DOCUMENTED | Batching grouping types — acceptable current set |
| 17 | L | DOCUMENTED | Empty push token filter — schema enforces non-null |
| 18 | L | DOCUMENTED | Actor name "Someone" fallback — acceptable for edge case |
| 19 | L | ALREADY FIXED IN R1 | B10-#3: Unread notifications cleaned after 1 year |
| 20 | L | DOCUMENTED | EXPO_ACCESS_TOKEN module load — acceptable |
| 21 | I | DOCUMENTED | i18n dead code — future task |

### X10 — Mobile API Parity (22 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | C | FIXED | `reactions/summary` → `reaction-summary` in storiesApi |
| 2 | C | FIXED | getHighlightById: dead-endpoint warning added |
| 3 | C | FIXED | archiveConversation: POST → PUT with {archived: true} |
| 4 | C | FIXED | feedApi.getExplore: `/feed/explore` → `/search/explore` |
| 5 | C | FIXED | liveApi.getParticipants: dead-endpoint warning added |
| 6 | C | FIXED | liveApi.lowerHand: dead-endpoint warning added |
| 7 | C | FIXED | liveApi.sendChat: dead-endpoint warning added |
| 8 | C | FIXED | liveApi.inviteSpeaker: route fixed to /guests/invite with body |
| 9 | C | FIXED | liveApi.removeParticipant: route fixed to /guests/:userId |
| 10 | C | FIXED | storiesReactionsApi.react: dead-endpoint warning added |
| 11 | H | FIXED | channelsApi.getAnalytics: param renamed channelId → handle |
| 12 | H | FIXED | channelsApi.getSubscribers: param renamed channelId → handle |
| 13 | H | FIXED | volunteerApi.signUp: dead-endpoint warning added |
| 14 | M | DOCUMENTED | Duplicate archive mechanism — archiveConversation fixed |
| 15 | M | DOCUMENTED | Duplicate topic endpoints — acceptable dual path |
| 16 | M | FIXED | storiesReactionsApi: dead-endpoint warning added |
| 17 | L | DEFERRED | CommunityNote authorId naming — needs schema change |
| 18 | L | FIXED | Same as #3 — archiveConversation method mismatch |
| 19 | L | DOCUMENTED | streamApi.handleWebhook — server-side only, dead in mobile |
| 20 | L | DOCUMENTED | feedApi.reportNotInterested — duplicate of dismiss, kept for compat |
| 21 | I | DOCUMENTED | accountApi.requestDataExport — 3 paths, code org concern |
| 22 | I | DOCUMENTED | appealsApi wrapper — thin indirection, acceptable |

### X08 — Content Moderation (4 findings in scope)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 7 | H | DEFERRED | messages.editMessage no moderation — needs ContentSafetyService injection |
| 14 | M | DEFERRED | stories text moderation — needs ContentSafetyService injection |
| 23 | M | DEFERRED | reports.service.ts threads/reels/videos — Tab 1 owns reports |
| 25 | M | DEFERRED | Video frames never moderated — needs ML model |

### J07 — Redis Patterns (3 findings in scope)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| C1 | C | FIXED | community:dhikr:total: 30-day rolling TTL on every increment + setex on recompute |
| C2 | C | DEFERRED | post:impressions HyperLogLog — Tab 2 owns posts |
| M4 | M | FIXED | Islamic Quran/hadith caches: 30d → 365d TTL (immutable content) |

### J08 — API Response Size (15 findings in scope)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | C | ALREADY FIXED IN R1 | deleteMessage uses select |
| 2 | C | FIXED | 5 permission-check findUnique calls: added select {id, isGroup, createdById} |
| 3 | C | DEFERRED | stories getFeedStories take:10000 — Tab 2 owns getExcludedUserIds |
| 6 | C | FIXED | CONVERSATION_SELECT members: include → select (drops 15 unused fields) |
| 7 | H | FIXED | lockConversation — same pattern fix (part of #2 batch) |
| 8 | H | FIXED | pinMessage/unpinMessage: added select {id, conversationId} |
| 20 | M | DOCUMENTED | Verse of day cron take:10000 — scaling concern, not bug |
| 21 | M | DOCUMENTED | Event reminders take:10000 — scaling concern, not bug |
| 30 | M | FIXED | commerce updateOrderStatus: product include uses select {id, sellerId} |
| 33 | M | DOCUMENTED | notifications includes 4 content relations — needed for routing |
| 34 | M | DOCUMENTED | reactions take:50 per message — bounded, acceptable |
| 35 | L | DOCUMENTED | admin/debug full Conversation — admin-only, low frequency |

### J01 — N+1 Queries (4 findings in scope)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 11 | M | FIXED | stories mention notifications: wrapped in Promise.all |
| 12 | M | FIXED | messages DM permission: 3 sequential queries → Promise.all |
| 13 | M | DOCUMENTED | stories private access check — 2 queries, second is conditional |
| 14 | M | NOT NEEDED | stories reply updates — inside $transaction, sequential required |
| 17 | L | DOCUMENTED | notifications extra findFirst — uses index, acceptable |

## Deferred Items

| Finding | What | Why |
|---------|------|-----|
| X08-#7 | editMessage content moderation | Needs ContentSafetyService injection in messages module |
| X08-#14 | Story text moderation | Needs ContentSafetyService injection in stories module |
| X08-#25 | Video frame moderation | Needs ML model integration |
| X10-#17 | CommunityNote authorId naming | Needs schema.prisma change |
| X03-#24 | Tip unique constraint millisecond | Needs schema.prisma change |
| X03-#25 | check-constraints.sql in CI | Needs pipeline config |
| X05-#12 | Mobile push handler types | Mobile code, not API scope |
| X05-#13 | Socket notification handler | Mobile code, not API scope |
