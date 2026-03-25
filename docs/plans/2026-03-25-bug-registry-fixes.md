# Bug Registry Fixes — 70 Verified Bugs from ARCHITECTURE.md Section 89

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all verified bugs from the 82-bug registry (Section 89 of ARCHITECTURE.md). 6 bugs eliminated as false, ~70 remain.

**Architecture:** Backend-first fixes in NestJS services/controllers, then frontend fixes in React Native screens. Every fix gets tests. Every commit gets a plain-English explanation table.

**Tech Stack:** NestJS 10, Prisma, Jest, React Native (Expo SDK 52), TypeScript

**Rules:**
- Every fix MUST have tests
- No `as any` in non-test code
- No subagents for code — do it directly
- Run `npx jest --passWithNoTests --forceExit --silent` after each fix
- Commit after each group with explanation table
- No Co-Authored-By lines

---

## Eliminated Bugs (NOT REAL — skip these)

| # | Bug | Why False |
|---|-----|-----------|
| 10 | 2FA disconnected from Clerk | sign-in.tsx correctly calls attemptSecondFactor |
| 13 | Socket notification delivery not wired | Gateway subscribes to Redis 'notification:new' and emits — fully wired |
| 17 | Subscription creates without payment | Status stays 'pending', getSubscribers filters by 'active' — low risk |
| 49 | TOTP secrets in plaintext | AES-256-GCM encryption implemented, TOTP_ENCRYPTION_KEY is set |
| 50 | backupSalt not migrated | New codes use salted HMAC-SHA256, legacy verified via fallback |
| 60 | StoryChain no service methods | story-chains.service.ts has 199 lines, full CRUD + trending |

---

## Group 1: WebRTC Calls (P0 — Bugs 1, 2)

**Impact:** Calls completely non-functional. 3 missing socket emits + 3-way enum mismatch.

### Task 1.1: Fix CallType enum consistency

**Files:**
- Modify: `apps/api/src/gateways/dto/chat-events.dto.ts` — change `@IsIn(['AUDIO', 'VIDEO'])` to `@IsIn(['VOICE', 'VIDEO'])`
- Modify: `apps/mobile/src/services/api.ts` — change `'voice' | 'video'` to `'VOICE' | 'VIDEO'`
- Modify: `apps/mobile/app/(screens)/call/[id].tsx` — change `type CallType = 'voice' | 'video'` to use Prisma-consistent values, fix `receiverId` → `targetUserId`

**What to fix:**
- Socket DTO: `AUDIO` → `VOICE` (match Prisma enum)
- Mobile api.ts: `voice`/`video` → `VOICE`/`VIDEO` (match Prisma enum)
- Mobile call screen: lowercase → uppercase, `receiverId` → `targetUserId`

### Task 1.2: Add missing socket emits to mobile

**Files:**
- Modify: `apps/mobile/app/(screens)/call/[id].tsx`

**What to add:**
After each REST API call, also emit the corresponding socket event so the OTHER party gets notified in real-time:

```typescript
// After initiating a call (or replace REST with socket):
socket.emit('call_initiate', { targetUserId, callType, sessionId });

// After answering:
socket.emit('call_answer', { sessionId, callerId });

// After ending:
socket.emit('call_end', { sessionId, participants });

// After declining:
socket.emit('call_reject', { sessionId, callerId });
```

The REST calls handle DB state. The socket emits handle real-time notification to the other party. Both are needed.

### Task 1.3: Write tests

**Files:**
- Modify: `apps/api/src/modules/calls/calls-webrtc.spec.ts` — add tests for DTO enum values
- New: `apps/api/src/gateways/chat-gateway-calls.spec.ts` — test socket DTO validation with VOICE/VIDEO

**Commit message:** `fix: WebRTC calls — 3 missing socket emits + CallType enum unified to VOICE/VIDEO`

---

## Group 2: Payment Webhook Fixes (P0-P1 — Bugs 3, 14, 15, 16, 18)

**Impact:** Users pay real money, nothing happens. 5 broken payment flows.

### Task 2.1: Implement coin purchase webhook crediting (Bug 3)

**Files:**
- Modify: `apps/api/src/modules/payments/payments.service.ts`

**What to fix:**
In `handlePaymentIntentSucceeded()`, check `paymentIntent.metadata.type`:
- If `'coin_purchase'`: look up pending CoinTransaction by paymentIntentId, credit CoinBalance via upsert
- If `'tip'`: existing tip logic (already works)
- If `'marketplace_order'`: handle order (Task 2.3)

The gifts.service.ts must also store paymentIntentId in metadata when creating the PaymentIntent.

### Task 2.2: Fix premium activation to require payment (Bug 14)

**Files:**
- Modify: `apps/api/src/modules/commerce/commerce.service.ts`

**What to fix:**
In `subscribePremium()`, change status from `ACTIVE` to `PENDING`. Create a Stripe PaymentIntent or Subscription. Only activate via webhook confirmation.

### Task 2.3: Handle marketplace order webhook (Bug 15)

**Files:**
- Modify: `apps/api/src/modules/payments/payments.service.ts`

**What to fix:**
Add branch in `handlePaymentIntentSucceeded()` for `metadata.type === 'marketplace_order'`. Update order status from PENDING to PAID. Notify seller.

### Task 2.4: Credit receiver on tip completion (Bug 16)

**Files:**
- Modify: `apps/api/src/modules/payments/payments.service.ts`

**What to fix:**
After updating tip to 'completed', increment receiver's earnings:
```typescript
await this.prisma.coinBalance.upsert({
  where: { userId: tip.receiverId },
  update: { diamonds: { increment: tip.diamondAmount } },
  create: { userId: tip.receiverId, diamonds: tip.diamondAmount },
});
```

### Task 2.5: Fix zakat fund.raisedAmount update (Bug 18)

**Files:**
- Modify: `apps/api/src/modules/commerce/commerce.service.ts`

**What to fix:**
In `donateZakat()`, wrap in `$transaction` and increment `zakatFund.raisedAmount` atomically, like `contributeWaqf()` already does.

### Task 2.6: Write tests for all 5 payment fixes

**Files:**
- New/Modify: `apps/api/src/modules/payments/payments-webhook.spec.ts`
- New/Modify: `apps/api/src/modules/commerce/commerce-premium.spec.ts`

**Commit message:** `fix: 5 payment flows — coin webhook crediting, premium requires payment, order webhook, tip credits receiver, zakat updates fund`

---

## Group 3: Waqf Route + Payment (P0 — Bug 4)

### Task 3.1: Fix waqf route mismatch and add payment

**Files:**
- Modify: `apps/api/src/modules/commerce/commerce.controller.ts` — verify route is `waqf/funds/:id/contribute`
- Modify: `apps/mobile/app/(screens)/waqf.tsx` — fix API calls to use correct route
- Modify: `apps/api/src/modules/commerce/commerce.service.ts` — add Stripe PaymentIntent to `contributeWaqf()`

**Commit message:** `fix: waqf contribution — route mismatch fixed + Stripe payment integration`

---

## Group 4: Dual CoinBalance Cleanup (P0 — Bug 5)

### Task 4.1: Remove legacy User.coinBalance and User.diamondBalance

**Files:**
- Modify: `apps/api/prisma/schema.prisma` — remove `coinBalance Int @default(0)` and `diamondBalance Int @default(0)` from User model

**Note:** This is a schema change. Needs `prisma db push` (dev) or migration (prod). The fields are confirmed unused by any service code.

**Commit message:** `fix: remove legacy User.coinBalance/diamondBalance — CoinBalance table is authoritative`

---

## Group 5: Feed Query Fixes (P1-P2 — Bugs 6, 19, 20, 48)

### Task 5.1: Fix owner scheduled content visibility (Bug 6)

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

**What to fix:**
In `getUserPosts()`: when `isOwn === true`, skip the scheduledAt filter entirely.
In `getUserThreads()`: move `OR` clause INSIDE the `where` block (currently outside = silently ignored = leaks scheduled threads to everyone).

### Task 5.2: Fix videos getFeed isRemoved filter (Bug 19)

**Files:**
- Modify: `apps/api/src/modules/videos/videos.service.ts`

**What to fix:** Add `isRemoved: false` to `getFeed()` where clause.

### Task 5.3: Fix videos channelIds unused (Bug 20)

**Files:**
- Modify: `apps/api/src/modules/videos/videos.service.ts`

**What to fix:** Use `channelIds` in the query to prioritize subscribed channels, or add as OR condition.

### Task 5.4: Fix trial reel owner visibility (Bug 48)

**Files:**
- Modify: `apps/api/src/modules/reels/reels.service.ts`

**What to fix:** In `getUserReels()`, if requesting user is the owner, don't filter by `isTrial: false`.

### Task 5.5: Write tests

**Commit message:** `fix: feed queries — owner sees scheduled content, videos filter isRemoved, subscriptions affect feed, trial reels visible to owner`

---

## Group 6: Frontend Comment Permission (P1 — Bug 7)

### Task 6.1: Hide comment input when NOBODY

**Files:**
- Modify: `apps/mobile/app/(screens)/post/[id].tsx`
- Modify: `apps/mobile/app/(screens)/reel/[id].tsx`

**What to fix:** Check `post.commentPermission` / `reel.commentPermission`. If `NOBODY`, don't render the comment input. If `FOLLOWERS`, only show if user follows the creator.

**Commit message:** `fix: hide comment input when commentPermission is NOBODY/FOLLOWERS`

---

## Group 7: Tag Approval Workflow (P1 — Bug 8)

### Task 7.1: Add approve/decline endpoints

**Files:**
- Modify: `apps/api/src/modules/posts/posts.controller.ts` — add PATCH /posts/tags/:tagId/respond
- Modify: `apps/api/src/modules/posts/posts.service.ts` — add respondToTag(tagId, userId, status)

**What to build:**
- `PATCH /posts/tags/:tagId/respond` — body `{ status: 'APPROVED' | 'DECLINED' }`
- Validate tagged user === current user
- Update PostTaggedUser/ReelTaggedUser status
- Send notification to post author on response

**Commit message:** `feat: tag approval workflow — approve/decline endpoints for PostTaggedUser and ReelTaggedUser`

---

## Group 8: Moderation Fixes (P1-P2 — Bugs 11, 21, 34, 47)

### Task 8.1: Add pre-save text moderation to reels (Bug 11)

**Files:**
- Modify: `apps/api/src/modules/reels/reels.service.ts`

**What to fix:** In `create()`, add `await this.contentSafety.moderateText(dto.caption)` before the prisma.reel.create call, same pattern as posts.service.ts.

### Task 8.2: Add moderation to videos.update (Bug 21)

**Files:**
- Modify: `apps/api/src/modules/videos/videos.service.ts`

**What to fix:** In `update()`, add `await this.contentSafety.moderateText()` for title and description before the update.

### Task 8.3: Add moderation to crossPost (Bug 34)

**Files:**
- Modify: `apps/api/src/modules/posts/posts.service.ts`

**What to fix:** In `crossPost()`, moderate the caption override if provided.

### Task 8.4: Fix story moderation to soft-delete (Bug 47)

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts`

**What to fix:** Change `prisma.story.delete()` to `prisma.story.update({ data: { isRemoved: true } })` in the image moderation BLOCK handler. If Story model doesn't have isRemoved, use the existing deletion but log for audit.

**Commit message:** `fix: moderation — reels pre-save check, videos.update check, crossPost check, story soft-delete`

---

## Group 9: Missing Endpoints (P2 — Bugs 22, 23, 38)

### Task 9.1: Add DELETE video comment endpoint (Bug 22)

**Files:**
- Modify: `apps/api/src/modules/videos/videos.controller.ts`

### Task 9.2: Add GET video chapters endpoint (Bug 23)

**Files:**
- Modify: `apps/api/src/modules/videos/videos.controller.ts`

### Task 9.3: Add PATCH thread endpoint (Bug 38)

**Files:**
- Modify: `apps/api/src/modules/threads/threads.controller.ts`

**Commit message:** `feat: missing endpoints — DELETE video comment, GET video chapters, PATCH thread`

---

## Group 10: Video Premiere/Share Fixes (P2 — Bugs 24, 25, 26, 27)

### Task 10.1: Fix startPremiere to publish video (Bug 24)
### Task 10.2: Add premiere viewerCount increment (Bug 25)
### Task 10.3: Fix end screen DTO max size (Bug 26) — change DTO to @ArrayMaxSize(4) to match service
### Task 10.4: Fix hardcoded share link (Bug 27) — use APP_URL env var

**Commit message:** `fix: video premiere publishes, viewerCount increments, end screen DTO matches service, share link uses APP_URL`

---

## Group 11: Notification/Push Fixes (P2 — Bugs 33, 53, 54)

### Task 11.1: Add COLLAB_INVITE to NotificationType enum and use it (Bug 33)
### Task 11.2: Fix REEL_LIKE/REEL_COMMENT duplicate switch cases (Bug 53)
### Task 11.3: Wire notification i18n templates into push-trigger (Bug 54)

**Commit message:** `fix: notifications — COLLAB_INVITE type, dedupe reel switch cases, wire i18n templates`

---

## Group 12: Message/Chat Fixes (P2 — Bugs 42, 43, 44)

### Task 12.1: Add block check to forward message (Bug 42)
### Task 12.2: Add AUDIO type to transcription (Bug 43)
### Task 12.3: Add room_evicted on ban (Bug 44)

**Note:** Bug 41 (lock code per-user) requires schema migration — defer to post-launch.

**Commit message:** `fix: messages — forward checks blocks, AUDIO transcription, ban evicts from rooms`

---

## Group 13: Story Fixes (P2 — Bugs 46, 61)

### Task 13.1: Increment repliesCount on story reply (Bug 46)
### Task 13.2: Add @@unique constraint to StoryStickerResponse (Bug 61)

**Commit message:** `fix: stories — reply increments count, sticker response unique constraint`

---

## Group 14: DTO Enum Mismatches (P2 — Bugs 36, 56, 62)

### Task 14.1: Fix share postType to preserve original type (Bug 36)
### Task 14.2: Fix community notes rating values (Bug 56) — DTO to use NOTE_HELPFUL etc.
### Task 14.3: Fix events DTO enum values (Bug 62) — UpdateEventDto to use uppercase matching Prisma

**Commit message:** `fix: DTO enum mismatches — share preserves postType, community notes ratings, events enums`

---

## Group 15: Security/Extension Fixes (P2 — Bugs 51, 57, 58)

### Task 15.1: Fix envelope store race condition (Bug 51) — wrap in $transaction with serializable isolation
### Task 15.2: Fix scholar Q&A verification check (Bug 57) — VERIFICATION_PENDING → APPROVED
### Task 15.3: Add scholar vote dedup (Bug 58) — use ScholarQuestionVote join table

**Commit message:** `fix: security — envelope store transaction, scholar verification check, vote dedup`

---

## Group 16: Thread Chaining (P2 — Bug 59)

### Task 16.1: Wire thread chaining — add endpoint to create continuation threads

**Commit message:** `feat: thread chaining — continuation threads with chainId and chainPosition`

---

## Group 17: Privacy & Legal (Bugs 63-69)

### Task 17.1: Wire EXIF stripping on upload pipeline (Bug 63)
- Add `addMediaJob()` method to QueueService
- Call it from upload service after presigned URL upload completes
- Alternatively: strip EXIF client-side before upload (mobile already sets exif:false on picker, but need it on all upload paths)

### Task 17.2: Fix contact sync hash mismatch (Bug 64)
- Backend needs to hash stored phone numbers with SHA-256 before comparison
- Or: store phone hashes alongside raw numbers for fast lookup

### Task 17.3: Add ToS acceptance tracking fields (Bug 65)
- Add `tosAcceptedAt DateTime?` and `tosVersion String?` to User model
- Set on registration

### Task 17.4: Complete GDPR export (Bug 66)
- Add missing categories: reel reactions, Islamic data, gamification, communities, etc.
- Remove notification 5000 cap

### Task 17.5: Implement deletion cron job (Bug 67)
- Add @Cron job to process users where deletedAt < now - 30 days
- Hard-delete anonymized records, purge R2/Stream storage

### Task 17.6: Wire blurhash generation (Bug 69)
- Add `addMediaJob()` to QueueService
- Use actual blurhash library (not average color)
- Install `blurhash` package on backend

**Note:** Bug 68 (CSAM/terrorism) requires legal/compliance decisions — document as known gap, defer actual NCMEC integration.

**Commit message:** `fix: privacy — EXIF stripping, contact hash matching, ToS tracking, GDPR export complete, deletion cron, blurhash pipeline`

---

## Group 18: Remaining P2 Cleanup (Bugs 28-32, 35, 37, 39, 40, 45, 55)

### Task 18.1: Remove duplicate video recordProgress endpoint (Bug 28)
- Delete or alias POST recordProgress since PATCH updateProgress does the same

### Task 18.2: Add Meilisearch index on video create (Bug 29)
- In videos.service.ts create(), add search index creation (guarded by MEILISEARCH_HOST check)

### Task 18.3: Add cache invalidation for video feed (Bug 30)
- Invalidate 30s cache key when new video is created/removed

### Task 18.4: Remove dead PushTriggerService injection (Bug 31)
- Remove unused injection from posts.service.ts

### Task 18.5: Remove dead GamificationService injection (Bug 32)
- Remove unused injection from posts.service.ts (uses queue instead)

### Task 18.6: Add scored cache for foryou feed (Bug 35)
- Cache scored results in Redis for 60s to avoid re-scoring 200 candidates per request

### Task 18.7: Add TAG notification type (Bug 37)
- Add TAG to NotificationType enum, use it instead of MENTION for tag notifications

### Task 18.8: Fix thread report to use FK (Bug 39)
- Store threadId as proper field instead of string in report description

### Task 18.9: Wire moderateThreadImage (Bug 40)
- Call existing private method from thread create() when imageUrls present

### Task 18.10: Fix closeFriendsOnly with membership check (Bug 45)
- In stories feed, check if viewer is in creator's close friends list before filtering

### Task 18.11: Fix trending SQL to filter scheduledAt (Bug 55)
- Add WHERE scheduledAt IS NULL OR scheduledAt <= NOW() to the raw SQL trending query

**Commit message:** `fix: P2 cleanup — 11 remaining bugs (dead injections, cache invalidation, trending SQL, close friends filter)`

---

## Group 19: Low-Risk Remaining (Bugs 41, 52)

### Task 19.1: Document lock code limitation (Bug 41)
- Add comment in schema.prisma documenting that lockCode is per-conversation not per-user
- Add TODO for per-member lock codes in future schema migration

### Task 19.2: Document safety numbers limitation (Bug 52)
- SHA-256 truncation is acceptable for MVP — add comment noting Signal SAS is the upgrade path

**Commit message:** `docs: document known limitations — chat lock code per-conversation, safety number truncation`

---

## Execution Order

1. **Group 2** (Payments) — money bugs first, highest user harm
2. **Group 1** (WebRTC) — calls completely broken
3. **Group 5** (Feed queries) — data leaks + broken visibility
4. **Group 8** (Moderation) — safety gaps
5. **Group 4** (Dual CoinBalance) — schema cleanup
6. **Group 3** (Waqf) — route + payment
7. **Group 6** (Comment permission) — frontend
8. **Group 7** (Tag approval) — new endpoint
9. **Group 14** (DTO mismatches) — quick fixes
10. **Group 11** (Notifications) — push quality
11. **Group 12** (Messages) — block/transcription/ban
12. **Group 13** (Stories) — count + constraint
13. **Group 9** (Missing endpoints) — video/thread
14. **Group 10** (Video premiere) — premiere fixes
15. **Group 15** (Security) — race condition + scholar
16. **Group 16** (Thread chaining) — new feature
17. **Group 17** (Privacy) — legal compliance
