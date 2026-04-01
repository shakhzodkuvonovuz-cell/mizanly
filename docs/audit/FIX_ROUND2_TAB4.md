# FIX SESSION — Round 2 Tab 4: Cross-Module Payments/Messages/Notifications + Mobile API Parity + Performance

> Paste into a fresh Claude Code session. This session fixes ~110 findings across cross-module payment flows, message E2E gaps, notification pipeline, mobile API mismatches, and performance hot spots.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Integrity Rules, Standing Rules, and payments section
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read Round 1 progress files to know what was ALREADY FIXED:
   - `docs/audit/v2/fixes/TAB3_PROGRESS.md` (Round 1 fixed messages/stories/videos Wave 1+2)
   - `docs/audit/v2/fixes/TAB4_PROGRESS.md` (Round 1 fixed payments/notifications/islamic Wave 1+2)
4. Read ALL of your audit finding files IN FULL before writing a single line of code:
   - `docs/audit/v2/wave3/X02.md` (18 findings — Message & E2E — YOUR portion: messages.service.ts + push files)
   - `docs/audit/v2/wave3/X03.md` (34 findings — Payment & Commerce cross-module)
   - `docs/audit/v2/wave3/X05.md` (21 findings — Notification Pipeline cross-module)
   - `docs/audit/v2/wave3/X08.md` (32 findings — Content Moderation — YOUR portion only)
   - `docs/audit/v2/wave3/X10.md` (22 findings — Mobile API Parity)
   - `docs/audit/v2/wave9/J07.md` (20 findings — Redis Patterns — YOUR modules only)
   - `docs/audit/v2/wave9/J08.md` (38 findings — API Response Size — YOUR modules only)
   - `docs/audit/v2/wave9/J01.md` (22 findings — N+1 Queries — YOUR modules only)
   - `docs/audit/v2/wave10/K03.md` (35 findings — Cron Jobs — counter-reconciliation portion)
5. Create your progress file: `docs/audit/v2/fixes/R2_TAB4_PROGRESS.md`
6. Read this ENTIRE prompt before touching any source code

---

## YOUR SCOPE — THESE FILES ONLY

### Primary modules (cross-module fixes for Round 1 modules)
```
apps/api/src/modules/messages/         (X02 message E2E + J08 response size)
apps/api/src/modules/chat-export/
apps/api/src/modules/stickers/
apps/api/src/modules/videos/           (X08 moderation + J08)
apps/api/src/modules/stories/          (X08 moderation + J08)
apps/api/src/modules/video-editor/
apps/api/src/modules/video-replies/
apps/api/src/modules/subtitles/
apps/api/src/modules/thumbnails/
apps/api/src/modules/story-chains/
apps/api/src/modules/payments/         (X03 payment cross-module)
apps/api/src/modules/monetization/     (X03 payment cross-module)
apps/api/src/modules/gifts/            (X03 payment cross-module)
apps/api/src/modules/commerce/         (X03 payment cross-module)
apps/api/src/modules/notifications/    (X05 notification pipeline)
apps/api/src/modules/webhooks/
apps/api/src/modules/islamic/          (J07 Redis + J08 response size)
apps/api/src/modules/mosques/
apps/api/src/modules/halal/
apps/api/src/modules/scholar-qa/
apps/api/src/modules/upload/           (J06 orphan cleanup)
apps/api/src/common/services/push.service.ts        (X05 push)
apps/api/src/common/services/push-trigger.service.ts (X05 push)
apps/api/src/common/services/counter-reconciliation.service.ts (K03)
```

### Mobile API client file (X10 only)
```
apps/mobile/src/services/api.ts        (X10 mobile API parity fixes)
apps/mobile/src/services/livekit.ts    (C04 LiveKit URL fix)
```

### FORBIDDEN — DO NOT TOUCH
- `schema.prisma` — note as DEFERRED
- `chat.gateway.ts` — Tab 1 owns it
- `posts.service.ts`, `reels.service.ts`, `threads.service.ts` — Tab 2 owns them
- `feed.service.ts`, `personalized-feed.service.ts`, `search.service.ts` — Tab 2 owns them
- `admin.service.ts`, `moderation.service.ts`, `reports.service.ts` — Tab 1 owns them
- `apps/mobile/src/services/signal/` — Tab 3 owns it
- `apps/e2e-server/`, `apps/livekit-server/` — Tab 3 owns them
- Any other `apps/mobile/` files except api.ts and livekit.ts

---

## FINDING ASSIGNMENT — WHAT YOU FIX FROM EACH AUDIT FILE

### X02 — YOUR PORTION (~12 of 18 findings, messages.service.ts + push files)
Fix ONLY findings in YOUR files:
- X02-#2 (H): messages.service.ts sealed sender fast path is dead code (senderId always non-null)
- X02-#4 (H): messages.service.ts unit mismatch — setMessageExpiry stores minutes, consumed as seconds
- X02-#5 (H, partial): messages.service.ts e2eSenderKeyId falsy check (messages portion)
- X02-#6 (H): messages.service.ts sealed sender path omits e2eSenderKeyId
- X02-#8 (M): messages.service.ts processExpiredMessages doesn't clear E2E fields
- X02-#9 (M): messages.service.ts view-once expiry doesn't clear E2E fields
- X02-#10 (M): push-trigger.service.ts + push.service.ts — push includes senderName metadata
- X02-#11 (M): messages.service.ts preview truncation inconsistent
- X02-#12 (M): messages.service.ts _skipRedisPublish `as any` bypass
- X02-#14 (L): messages.service.ts invite link Redis TTL calculation
- X02-#15 (L): messages.controller.ts REST SendMessageDto
- X02-#17 (I): messages.service.ts deleteMessage dead code path
- X02-#18 (H): messages.service.ts scheduleMessage bypasses E2E enforcement

DEFER to Tab 1: X02-#1, #3, #5(partial), #7, #13, #16 (chat.gateway.ts findings)

CHECK R1 OVERLAP: Round 1 Tab3 (TAB3_PROGRESS.md) already fixed many messages.service.ts findings. Verify before touching.

### X03 — ALL 34 findings (Payment & Commerce cross-module)
CHECK R1 OVERLAP CAREFULLY. Round 1 Tab4 (TAB4_PROGRESS.md) fixed A09 (29 findings) and B08 (23 findings). Many X03 findings are the SAME bugs from a cross-module perspective:
- X03-#1 (C): Fire-and-forget PaymentMapping → LIKELY FIXED as A09-#1
- X03-#3 (C): Tip idempotency → LIKELY FIXED as A09-#3
- X03-#9 (H): storePaymentIntentMapping missing await → LIKELY FIXED as A09-#1/17

For each X03 finding, CHECK TAB4_PROGRESS.md. If fixed, mark "ALREADY FIXED IN R1."

Likely NEW findings:
- X03-#2 (C): Tip fallback matches by senderId + most-recent — ambiguous concurrent tips
- X03-#5 (H): Order cancel/refund + stock restore NOT atomic
- X03-#6 (H): Cashout TOCTOU race — deducts then non-atomic reversal
- X03-#7 (H): Dispute handler does NOT reverse diamond credit
- X03-#8 (H): Gifts cashout starts with throw — all code unreachable (LIKELY FIXED as A09-#8)
- X03-#11 (H): New Stripe product created per subscription
- X03-#14 (M): subscribe() creates active subscription without payment
- X03-#15 (M): unsubscribe() doesn't cancel on Stripe
- X03-#16 (M): Premium endDate from now, not currentEndDate
- X03-#17 (M): Default webhook routes unknown types to tip handler
- X03-#22 (M): Webhook re-throws causing Stripe retry on permanent failures

### X05 — ALL 21 findings (Notification Pipeline cross-module)
CHECK R1 OVERLAP with TAB4_PROGRESS.md (A08 + B10 fixes).

Key findings likely NEW:
- X05-#1 (C): TAG and COLLAB_INVITE push types have no push mapping — CHECK if fixed in R1 (B10-#9)
- X05-#2 (C): No banned/deleted/deactivated recipient check — CHECK if fixed in R1 (B10-#2)
- X05-#3 (H): Forward message to E2E conversation leaks plaintext in push
- X05-#4 (H): Scheduled message cron leaks plaintext for E2E conversations
- X05-#5 (H): MESSAGE push includes sender name for sealed sender
- X05-#6 (H): markRead emits fake notification — badge increments instead of decrements
- X05-#7 (H): markAllRead doesn't broadcast to other devices
- X05-#11 (M): typeToSetting map incomplete — 10+ types bypass per-type settings
- X05-#12 (M): Mobile push handler missing 14+ server notification types
- X05-#19 (L): Cleanup cron only deletes read notifications — unread persist forever

### X08 — YOUR PORTION (~4 of 32 findings)
Fix ONLY findings in YOUR files:
- X08-#7 (H): messages.service.ts editMessage() no content moderation — CHECK if fixed in R1 Tab3
- X08-#14 (M): stories.service.ts text content (textOverlay, stickerData) no moderation
- X08-#25 (M): videos.service.ts video frames never moderated (DEFER — needs ML model)
- X08-#23 (M): reports.service.ts urgent auto-hide doesn't handle threads/reels/videos (DEFER to Tab 1)

### X10 — ALL 22 findings (Mobile API Parity)
This is YOUR exclusive domain — api.ts in mobile.

10 CRITICAL ghost calls (endpoints that don't exist):
- X10-#1 (C): Route mismatch: mobile calls /reactions/summary, backend is /reaction-summary
- X10-#2 (C): getHighlightById calls album/:albumId but backend expects /:userId
- X10-#3 (C): HTTP method mismatch: archive POST vs backend PUT
- X10-#4 (C): feedApi.getExplore calls /feed/explore — endpoint at /search/explore
- X10-#5 through #10 (C): 6 ghost calls — liveApi.getParticipants, lowerHand, sendChat, inviteSpeaker, removeParticipant, storiesReactionsApi.react — all call non-existent endpoints

Fix: correct the API client URLs/methods to match backend, or mark as DEAD CODE with `// @dead-code: backend endpoint does not exist — remove when feature is built` and add a `console.warn` that fires if called.

- X10-#11/#12 (H): channelsApi passes UUID but backend expects handle slug
- X10-#13 (H): volunteerApi.signUp — no signup route exists

### K03 — Counter Reconciliation SQL (5 key findings)
From `docs/audit/v2/wave10/K03.md`, counter-reconciliation.service.ts has 5 raw SQL UPDATEs using Prisma model names instead of @@map table names:
```sql
-- WRONG examples found:
UPDATE "Post" SET ...       -- should be "posts"
UPDATE "Thread" SET ...     -- should be "threads"
UPDATE "Reel" SET ...       -- should be "reels"
UPDATE "Video" SET ...      -- should be "videos"
UPDATE "Channel" SET ...    -- should be "channels"
```
All counter reconciliation is silently failing. Fix ALL table names.

### J07 — YOUR PORTION (~3 of 20 findings, Redis)
- J07-C1 (C): islamic.service.ts dhikr counter NO TTL
- J07-C2 (C): posts.service.ts impressions HyperLogLog NO TTL — DEFER to Tab 2 (they own posts)
- J07-M4 (M): islamic.service.ts Quran/hadith caches 30d TTL for immutable data

### J08 — YOUR PORTION (~15 of 38 findings, API Response Size)
- J08-#1 (C): messages.service.ts deleteMessage fetches full row for senderId check
- J08-#2 (C): messages.service.ts 5 endpoints fetch full Conversation for permission
- J08-#3 (C): stories.service.ts getFeedStories 4 findMany take:10000, no exclusion
- J08-#6 (C): messages.service.ts CONVERSATION_SELECT uses include not select
- J08-#7 (H): messages.service.ts lockConversation no select
- J08-#8 (H): messages.service.ts pinMessage/unpinMessage fetches full Message w/ crypto fields
- J08-#15 (H): users.service.ts getUserPosts full User row — DEFER to Tab 1 (they own users)
- J08-#20 (M): islamic.service.ts verse of day cron device.findMany take:10000
- J08-#21 (M): islamic.service.ts event reminders cron user.findMany take:10000
- J08-#30 (M): commerce.service.ts updateOrderStatus includes full Product
- J08-#33 (M): notifications.service.ts includes 4 content relations per row
- J08-#34 (M): messages.service.ts reactions take:50 per message
- J08-#35 (L): messages.service.ts admin/debug full Conversation

### J01 — YOUR PORTION (~4 of 22 findings, N+1 Queries)
- J01-#11 (M): stories.service.ts sequential notification for mentions
- J01-#12 (M): messages.service.ts 3 sequential independent queries for DM permission
- J01-#13 (M): stories.service.ts 2 sequential queries for private access
- J01-#14 (M): stories.service.ts 2 sequential independent updates after reply
- J01-#17 (L): notifications.service.ts extra findFirst for batching

---

## CROSS-MODULE OVERLAP CHECK — CRITICAL

This tab has the MOST overlap with Round 1. Before fixing ANY finding, check:

```bash
# Check Round 1 Tab 3 (messages, stories, videos)
grep -i "expiry\|disappear\|sealed\|e2eSenderKeyId\|moderateText\|processExpired\|view.once" docs/audit/v2/fixes/TAB3_PROGRESS.md

# Check Round 1 Tab 4 (payments, notifications, islamic)
grep -i "fire.and.forget\|idempoten\|diamond\|cashout\|badge\|markRead\|markAllRead\|COLLAB_INVITE\|TAG.*push" docs/audit/v2/fixes/TAB4_PROGRESS.md
```

If a finding IS already fixed:
```
### X03-#1 (C) — Fire-and-forget PaymentMapping
**Status:** ALREADY FIXED IN R1 — See TAB4_PROGRESS.md A09-#1
**Verification:** grep -n "await.*paymentMapping" apps/api/src/modules/payments/payments.service.ts → line XX confirms await
```

---

## ENFORCEMENT RULES

### E1-E10: Same as Round 1 + Round 2 additions

### Additional for Tab 4:

#### PAYMENT FLOW TRACING (inherited from R1 Tab4)
After each payment fix, trace the FULL money flow:
```
Does money come in correctly? (payment → coins credited)
Does money move correctly? (coins → gift → diamonds)
Does money go out correctly? (diamonds → cashout → bank)
Can any step fail silently? (no fire-and-forget)
Can any step be exploited? (no double-spend, no negative balance)
Is every multi-step operation atomic? ($transaction)
```

#### E2E MESSAGE INTEGRITY
When fixing message-related findings (X02), verify:
1. Encrypted fields are NEVER included in push notification bodies
2. Sealed sender messages NEVER leak senderId in ANY code path
3. Expired/deleted messages have ALL E2E fields cleared (encryptedContent, e2eSenderRatchetKey, e2eCounter, e2ePreviousCounter, e2eSenderDeviceId, e2eSenderKeyId)

#### MOBILE API.TS FIXES
When fixing X10 (api.ts ghost calls):
1. Read the backend controller to verify the ACTUAL route exists and its exact path/method
2. If the backend endpoint exists: fix the mobile API client to match
3. If the backend endpoint DOES NOT exist: comment out the method with `// @dead-endpoint: no backend route exists`
4. DO NOT delete the method — other mobile code may reference it. Just comment and add warning.

---

## MODULE-SPECIFIC INSTRUCTIONS

### Payments — DISPUTE + SUBSCRIPTION GAPS
X03 adds findings beyond R1. The key NEW payment issues:
- **Dispute handler** (X03-#7): When Stripe disputes a payment, the diamond credit to the receiver is NOT reversed. Fix: on dispute, create a CoinTransaction deducting diamonds within a $transaction.
- **Subscription without payment** (X03-#14): subscribe() creates an active subscription record before any payment. Fix: create as 'pending', only activate in webhook.
- **Subscription cancellation** (X03-#15): unsubscribe() only cancels locally, not on Stripe. Fix: call stripe.subscriptions.cancel() before updating DB.
- **Premium extension** (X03-#16): Premium endDate calculated from now, not currentEndDate. Fix: `new Date(Math.max(Date.now(), existing.endDate.getTime()) + durationMs)`.

### Messages — E2E FIELD CLEANUP
X02-#8/#9 are about message expiry leaving E2E fields behind:
```typescript
// BEFORE — only clears plaintext
await tx.message.updateMany({
  where: { id: { in: expiredIds } },
  data: { content: '[expired]', isDeleted: true }
});

// AFTER — clears ALL E2E fields
await tx.message.updateMany({
  where: { id: { in: expiredIds } },
  data: {
    content: '[expired]',
    encryptedContent: null,
    e2eSenderRatchetKey: null,
    e2eCounter: null,
    e2ePreviousCounter: null,
    e2eSenderDeviceId: null,
    e2eSenderKeyId: null,
    e2eVersion: null,
    isDeleted: true,
  }
});
```

### Notifications — BADGE REGRESSION
X05-#6 is critical UX: markRead broadcasts a `notification:new` event instead of a badge sync. This causes the badge to INCREMENT on read. Fix:
1. Read notifications.service.ts markRead method
2. The Redis publish should emit `notification:badge` with `{ userId, count: actualUnreadCount }`, NOT create a fake notification

### Counter Reconciliation — TABLE NAME PATTERN
K03 counter-reconciliation.service.ts has the same raw SQL table name bug found in live/stream/polls. Grep for ALL table references:
```bash
grep -n '"Post"\|"Thread"\|"Reel"\|"Video"\|"Channel"\|"Comment"\|"Story"' apps/api/src/common/services/counter-reconciliation.service.ts
```
Replace ALL with their @@map equivalents (posts, threads, reels, videos, channels, post_comments/reel_comments, stories).

### Mobile API Parity — GHOST CALLS
X10 has 10 Critical ghost calls. For each:
1. Search backend for the endpoint: `grep -rn "route_path" apps/api/src/ --include="*.ts" | grep -v spec`
2. If found: fix api.ts to match exact path + method
3. If NOT found: the feature was never built on backend. Comment out with explanation.

---

## FIX ORDER (priority)

1. **K03 counter-reconciliation**: 5 raw SQL table names — all counter maintenance silently failing
2. **X03 payment criticals**: tip ambiguity (#2), dispute reversal (#7), subscription gaps (#14/#15)
3. **X02 message criticals**: unit mismatch (#4), E2E field cleanup (#8/#9), scheduled message bypass (#18)
4. **X05 notification criticals**: badge regression (#6), E2E push leaks (#3/#4/#5)
5. **X10 API parity**: 10 ghost calls, 3 type mismatches
6. **X03 remaining**: payment medium/low findings (CHECK R1 overlap)
7. **X05 remaining**: notification settings, batching, cleanup
8. **X08 Tab4 portion**: moderation on message/story edit
9. **J07/J08 performance**: Redis TTLs, response size reductions
10. **J01 N+1 queries**: message permission checks, story notifications

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=messages
cd apps/api && pnpm test -- --testPathPattern=stories
cd apps/api && pnpm test -- --testPathPattern=videos
cd apps/api && pnpm test -- --testPathPattern=payments
cd apps/api && pnpm test -- --testPathPattern=gifts
cd apps/api && pnpm test -- --testPathPattern=monetization
cd apps/api && pnpm test -- --testPathPattern=commerce
cd apps/api && pnpm test -- --testPathPattern=notifications
cd apps/api && pnpm test -- --testPathPattern=islamic
cd apps/api && pnpm test -- --testPathPattern=counter-recon
cd apps/api && pnpm test  # full at checkpoints
cd apps/api && npx tsc --noEmit

# Mobile TypeScript check (for api.ts changes)
cd apps/mobile && npx tsc --noEmit
```

---

## THE STANDARD

~110 findings across the most user-facing systems: payments, messages, notifications, and the mobile API client. Every payment bug is a potential charge dispute. Every message E2E leak is a privacy violation. Every ghost API call is a feature that crashes silently.

The counter-reconciliation fix alone unblocks: post likes count, thread replies count, reel shares count, video views count, and channel subscriber count from EVER being correct. These counters have been silently wrong since the reconciliation cron was written.

**~110 findings. Payments trace completely. Messages clear E2E fields. Notifications respect user preferences. API calls reach real endpoints. Zero shortcuts. Begin.**
