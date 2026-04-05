# X07 — Transaction Completeness Audit

**Scope:** Every multi-step mutation across the NestJS API that should be wrapped in `$transaction` but isn't, plus transaction quality issues in existing transactions.

**Method:** Read every `.service.ts` file containing `increment`, `decrement`, `$transaction`, `$executeRaw`, `create` + `update` sequences. Traced every balance change, counter mutation, status + side-effect pair, and multi-write sequence.

**Files audited:** 90+ service files, ~25,000 lines of mutation logic.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 7 |
| MEDIUM | 8 |
| LOW | 6 |
| **Total** | **26** |

---

## CRITICAL Findings

### X07-C1: `monetization.service.ts` — `requestCashout()` deduct + record NOT in transaction (dead code path)
**File:** `apps/api/src/modules/monetization/monetization.service.ts` lines 498-528
**Pattern:** Balance deducted via `coinBalance.updateMany`, then post-balance checked, then separate `coinTransaction.create` — three steps NOT in a `$transaction`. If the app crashes after line 502 (balance deducted) but before line 520 (transaction record created), diamonds vanish with no audit trail. The manual "integrity violation" rollback (lines 512-516) is itself non-atomic — if the rollback crashes, balance stays negative.
**Note:** This code is currently unreachable (behind `throw new NotImplementedException` at line 462), but the moment Stripe Connect is wired, this becomes exploitable. The identical pattern in `gifts.service.ts cashout()` IS properly wrapped in `$transaction`.
**Fix:** Wrap lines 499-528 in a single `$transaction` (exactly like `gifts.service.ts` line 309-341 already does).

### X07-C2: `commerce.service.ts` — `reviewProduct()` rating aggregation NOT in transaction
**File:** `apps/api/src/modules/commerce/commerce.service.ts` lines 147-163
**Pattern:** `productReview.create` runs, then `productReview.aggregate` runs, then `product.update` runs — three separate DB calls. If two concurrent reviews arrive, both aggregate at the same time, and one overwrites the other's result. The `rating` and `reviewCount` on the product can drift permanently from reality.
**Same bug at:** `reviewBusiness()` lines 433-448 — identical non-transactional aggregate + update.
**Fix:** Wrap the create + aggregate + update in an interactive `$transaction`. Or better: use raw SQL `UPDATE products SET rating = (SELECT AVG(rating) FROM product_reviews WHERE "productId" = $1), "reviewCount" = (SELECT COUNT(*) FROM product_reviews WHERE "productId" = $1) WHERE id = $1` in a single atomic query.

### X07-C3: `posts.service.ts` — `shareAsStory()` sharesCount increment NOT in transaction with story creation
**File:** `apps/api/src/modules/posts/posts.service.ts` lines 1216-1242
**Pattern:** Story created at line 1216, then share count incremented at line 1239 as a separate call. If the increment fails (network timeout, PG error), the story exists but the original post's `sharesCount` is never incremented. If the story creation fails but somehow the increment runs (shouldn't with await, but defensive coding), the count inflates.
**Contrast with:** `share()` at line 1137 which correctly uses `$transaction` for the same create + increment pattern.
**Fix:** Wrap the `story.create` + `post.update({ sharesCount: increment })` in a `$transaction`.

### X07-C4: `reels.service.ts` — hashtag counter increment OUTSIDE the reel creation transaction
**File:** `apps/api/src/modules/reels/reels.service.ts` lines 166-173
**Pattern:** Reel is created inside `$transaction` (lines 119-155), but hashtag `createMany` + `$executeRaw` counter increment runs OUTSIDE the transaction (lines 166-173). If the hashtag counter update fails, reels exist but hashtag counts are wrong. If the reel creation transaction rolls back (e.g., user counter increment fails), the hashtag counts were never modified (OK), BUT if the transaction succeeds and then the hashtag update crashes, the counts are permanently off.
**Same pattern in:** `threads.service.ts` lines 404-413 — hashtag upserts run after the thread creation transaction.
**Contrast with:** `posts.service.ts` lines 457-464 which correctly puts hashtag operations INSIDE the `$transaction`.
**Fix:** Move hashtag operations inside the reel/thread creation `$transaction`.

### X07-C5: `live.service.ts` — `join()` participant create/update + viewer counter NOT in transaction
**File:** `apps/api/src/modules/live/live.service.ts` lines 262-284
**Pattern:** `liveParticipant.update` (re-join) or `liveParticipant.create` (first join) runs, then `$executeRaw UPDATE currentViewers` runs as a separate call. If the counter update fails, the participant is recorded but the viewer count is wrong. If a user rapidly joins/leaves, the counter can drift. The `leave()` method (lines 299-308) has the same issue — participant update and counter decrement are separate calls.
**Fix:** Wrap participant mutation + counter update in a `$transaction`.

---

## HIGH Findings

### X07-H1: `posts.service.ts` — `delete()` hashtag decrement OUTSIDE the deletion transaction
**File:** `apps/api/src/modules/posts/posts.service.ts` lines 867-877
**Pattern:** Post soft-delete + user postsCount decrement are in a `$transaction` (lines 867-873), but the hashtag `postsCount` decrement (line 877) runs AFTER the transaction. If the hashtag update fails, the post is deleted but hashtag counts are permanently inflated.
**Same pattern in:** `reels.service.ts` lines 612-618 — hashtag `reelsCount` decrement runs after the reel deletion transaction.
**Fix:** Move the hashtag decrement inside the `$transaction`.

### X07-H2: `reels.service.ts` — `delete()` audio track counter decrement fire-and-forget
**File:** `apps/api/src/modules/reels/reels.service.ts` lines 606-608
**Pattern:** Audio track `reelsCount` decrement runs as a fire-and-forget `.catch()` — completely outside the reel deletion transaction. If it fails, the audio track's reel count is permanently inflated. No retry, no reconciliation.
**Fix:** Move inside the `$transaction`, or at minimum queue it for reliable retry.

### X07-H3: `bookmarks.service.ts` — `savePost()` check-then-act race condition
**File:** `apps/api/src/modules/bookmarks/bookmarks.service.ts` lines 26-62
**Pattern:** Reads `savedPost.findUnique` (line 27), then decides whether to create + increment (line 43-51) based on the read result. Between the read and the write, another request could save the same post. The P2002 handler (line 55) catches the duplicate, but the `savesCount` may have been double-incremented if both requests passed the `!existing` check. The `$transaction` on line 43 protects create+increment atomicity but NOT the read-before-write race.
**Fix:** Use an interactive `$transaction` that reads inside the transaction: `await prisma.$transaction(async (tx) => { const existing = await tx.savedPost.findUnique(...); if (existing) return existing; ... })`.

### X07-H4: `playlists.service.ts` — `removeItem()` count floor runs OUTSIDE transaction
**File:** `apps/api/src/modules/playlists/playlists.service.ts` lines 337-350
**Pattern:** Delete + decrement run in `$transaction` (lines 337-345), but the floor clamp (`updateMany where videosCount < 0`) runs AFTER the transaction (lines 347-350). If the count goes negative inside the transaction, the subsequent floor is a separate call. Under concurrent deletes, the count can temporarily be negative (visible to reads between the two calls). More importantly, if the floor update fails, the count stays negative.
**Fix:** Use `GREATEST` in raw SQL inside the transaction instead of a separate floor clamp, or use an interactive transaction that checks after decrement.

### X07-H5: `threads.service.ts` — hashtag upserts use N+1 individual queries instead of batch
**File:** `apps/api/src/modules/threads/threads.service.ts` lines 404-413
**Pattern:** Each hashtag is upserted individually via `Promise.all(hashtagNames.map(name => prisma.hashtag.upsert(...)))`. This is N separate queries outside any transaction. Under concurrent thread creation with the same hashtags, the `threadsCount` increment can be applied multiple times or lost due to non-atomic read-modify-write in the upsert.
**Contrast with:** `posts.service.ts` which uses `createMany` + single `$executeRaw UPDATE ... WHERE name = ANY(...)` for atomic batch increment.
**Fix:** Use `createMany({ skipDuplicates: true })` + single `$executeRaw` batch increment, like the posts service does.

### X07-H6: `posts.service.ts` — `pinPost()` unpin + pin NOT in transaction
**File:** `apps/api/src/modules/posts/posts.service.ts` lines 1813-1825
**Pattern:** `updateMany` unpins all posts (line 1815), then `update` pins the new post (line 1821). Two separate calls. If the second call fails, all posts are unpinned and none is pinned. Under concurrent pin requests, both could unpin each other's target.
**Fix:** Wrap in `$transaction`.

### X07-H7: `monetization.service.ts` — `subscribe()` expiry check + status update + upsert NOT in transaction
**File:** `apps/api/src/modules/monetization/monetization.service.ts` lines 315-349
**Pattern:** Reads existing subscription (line 315), checks if expired (line 319), updates status to expired (line 323), then upserts new subscription (line 336). Three separate DB calls. Under concurrent subscribe requests, both could read `status: 'active'`, both could try to create a new subscription, leading to duplicate active subscriptions.
**Fix:** Wrap the read + conditional update + upsert in an interactive `$transaction`.

---

## MEDIUM Findings

### X07-M1: No `$transaction` timeout configured anywhere
**Pattern:** Prisma's default interactive transaction timeout is 5 seconds. No service overrides this. For complex transactions (e.g., `blocks.service.ts block()` which does 7+ operations), a slow query could cause the transaction to time out and partially roll back with an unhelpful error.
**Files affected:** All interactive transactions across the codebase.
**Fix:** Set explicit timeouts on long transactions: `prisma.$transaction(async (tx) => { ... }, { timeout: 15000 })`.

### X07-M2: `commerce.service.ts` — `createOrder()` PaymentIntent created BEFORE transaction
**File:** `apps/api/src/modules/commerce/commerce.service.ts` lines 191-249
**Pattern:** Stripe PaymentIntent is created (line 192) BEFORE the stock-decrement transaction (line 214). If the transaction fails (out of stock), the orphaned PaymentIntent is cancelled (lines 242-249). But if the cancellation fails (Stripe API down), there's an orphaned PaymentIntent that could be completed by the user for a product that wasn't reserved. The error handler catches this and logs, but doesn't retry cancellation.
**Severity:** Mitigated by the fact that the order doesn't exist in the DB, so the webhook handler would find no matching order and log a reconciliation error. But money was still charged.
**Fix:** Create the transaction first (reserving stock), THEN create the PaymentIntent. If PI creation fails, roll back stock in a new transaction.

### X07-M3: `gamification.service.ts` — `updateChallengeProgress()` progress update + XP award NOT atomic
**File:** `apps/api/src/modules/gamification/gamification.service.ts` lines 401-424
**Pattern:** `challengeParticipant.update` (line 401) runs, then if completed, `awardXP` (line 412) runs as a separate call. If `awardXP` fails, the challenge is marked complete but XP was never awarded. No retry mechanism.
**Fix:** Move the XP award inside a transaction with the progress update, or queue the XP award for reliable delivery.

### X07-M4: `gamification.service.ts` — `unlockAchievement()` achievement create + XP award NOT atomic
**File:** `apps/api/src/modules/gamification/gamification.service.ts` lines 209-230
**Pattern:** `userAchievement.create` (line 214) runs, then if the achievement has an XP reward, `awardXP` (line 226) runs separately. If `awardXP` fails, the achievement is unlocked but XP was never given.
**Fix:** Wrap in a transaction or queue the XP award.

### X07-M5: `gamification.service.ts` — `leaveChallenge()` count floor runs OUTSIDE transaction
**File:** `apps/api/src/modules/gamification/gamification.service.ts` lines 452-473
**Pattern:** Delete + decrement in `$transaction` (lines 452-460), then `challenge.updateMany` clamp to 0 (lines 468-470) runs AFTER. Same issue as X07-H4 — the floor is a separate call that can fail independently.
**Fix:** Use `GREATEST` in raw SQL inside the transaction.

### X07-M6: `posts.service.ts` — `archivePost()` and `unarchivePost()` save operation race
**File:** `apps/api/src/modules/posts/posts.service.ts` lines 1576-1610
**Pattern:** `archivePost` checks if already saved (line 1583), then either updates or creates+increments (lines 1587-1597). The check and the create are separate calls outside a transaction. Under concurrent archive requests, both could pass the `!existing` check and double-increment `savesCount`.
**Fix:** Use an interactive `$transaction` for the check + create + increment.

### X07-M7: `stickers.service.ts` — `importFromUrl()` sticker create + count increment
**File:** `apps/api/src/modules/stickers/stickers.service.ts` lines ~330-340
**Pattern:** The `addStickerToPack()` and `removeStickerFromPack()` methods correctly use `$transaction`. But `importFromUrl()` calls `sticker.create` and `stickerPack.update` separately. If the count update fails, the count drifts.
**Fix:** Use `$transaction` consistently, like the other methods in the same file.

### X07-M8: `bookmarks.service.ts` — `unsavePost()` decrement + floor clamp separate operations
**File:** `apps/api/src/modules/bookmarks/bookmarks.service.ts` lines 68-86
**Pattern:** Inside the interactive transaction, `post.update` decrements savesCount (line 73), then `post.updateMany` clamps to 0 (lines 82-84). The clamp is technically inside the transaction so it's atomic. However, the decrement itself can go negative before the clamp — if another concurrent unsave sees the negative value, it clamps again. This is safe but wasteful.
**Better pattern:** Use `$executeRaw` with `GREATEST` like the other services do: `UPDATE posts SET "savesCount" = GREATEST("savesCount" - 1, 0) WHERE id = $1`.

---

## LOW Findings

### X07-L1: No nested transaction protection
**Pattern:** Some services call other services that contain their own `$transaction`. Prisma does NOT support nested transactions — the inner `$transaction` runs independently. Example: `gamification.awardXP()` uses `$transaction`, and is called from within `unlockAchievement()` which could be wrapped in its own `$transaction`. If both are interactive transactions, the inner one could commit even if the outer one rolls back.
**Files affected:** Any service method that calls another service's transactional method.
**Fix:** Accept a `tx` parameter (Prisma transaction client) in reusable methods so they can participate in the caller's transaction.

### X07-L2: Read-for-update patterns without `SELECT FOR UPDATE`
**Pattern:** Many services read a record, check a condition, then update. Without `SELECT FOR UPDATE` (or interactive transactions that implicitly hold locks), concurrent requests can both pass the check. Prisma interactive transactions use `READ COMMITTED` isolation by default, which does NOT prevent this.
**Examples:**
- `follows.service.ts` line 53: reads existing follow, returns if found, then creates — the P2002 handler catches the race but it's defense-in-depth, not prevention.
- `stories.service.ts` line 352: reads `alreadyViewed`, skips if true — but concurrent views could both read false.
**Fix:** These are all LOW because the P2002 handlers or idempotent behavior make them safe. The counters are the concern, and those are protected by transactions.

### X07-L3: `posts.service.ts` — `react()` existing reaction check OUTSIDE transaction
**File:** `apps/api/src/modules/posts/posts.service.ts` lines 935-972
**Pattern:** Reads `postReaction.findUnique` (line 935), then conditionally creates via `$transaction` (line 947). If the read finds nothing but a concurrent request creates the reaction between the read and the write, the P2002 handler catches it (line 968). The `likesCount` is safe because the create + increment are in the transaction and P2002 prevents double-create. However, the UPDATE path (line 941 — changing reaction type) is NOT in a transaction, so the reaction type could be overwritten by a concurrent request.
**Fix:** Move the read + conditional create/update into an interactive `$transaction`.

### X07-L4: `feeds` and `scoring` cached queries could serve stale counter values
**Pattern:** Feed queries read `likesCount`, `commentsCount`, etc. from materialized values on the post/reel/thread rows. These are updated by the transactional mutations above. However, because Neon uses connection pooling with potential replica lag, feed reads could see pre-transaction values for a few hundred milliseconds.
**Impact:** Cosmetic — like counts might show 99 instead of 100 for a brief moment.
**Fix:** Acceptable. Document as expected eventual consistency.

### X07-L5: `gamification.service.ts` — `addEpisode()` uses batched transaction but episode number has TOCTOU
**File:** `apps/api/src/modules/gamification/gamification.service.ts` lines 503-528
**Pattern:** Reads `lastEpisode` (line 504) to determine the next episode number, then creates the episode with `number: (lastEpisode?.number || 0) + 1` inside a batched `$transaction`. The read is OUTSIDE the transaction, so concurrent `addEpisode` calls could both read `number: 5` and both try to create `number: 6`. The unique constraint (if any) would catch this, but if there's no unique constraint on `(seriesId, number)`, both episodes would get number 6.
**Fix:** Use an interactive `$transaction` that reads `lastEpisode` inside the transaction, or use `MAX(number)` in a raw SQL INSERT.

### X07-L6: Fire-and-forget counter operations across multiple services
**Pattern:** Several counter operations use `.catch()` to swallow errors, making them effectively fire-and-forget:
- `reels.service.ts` line 607-608: audio track count decrement
- `blocks.service.ts` line 139: circle member count decrement
- Various Redis cache invalidations
**Impact:** Counters can drift over time. The `counter-reconciliation.service.ts` exists to periodically fix these, so the impact is limited to the window between the miss and the next reconciliation run.
**Fix:** Ensure the counter reconciliation cron covers all these cases. Consider queuing failed counter ops for retry.

---

## Correctly Transacted Operations (for reference)

These services properly use `$transaction` for their multi-step mutations:

| Service | Method | Pattern |
|---------|--------|---------|
| `gifts.service.ts` | `sendGift()` | Interactive tx: deduct coins + check balance + create gift + credit diamonds + audit trail |
| `gifts.service.ts` | `cashout()` | Interactive tx: conditional decrement + balance check + audit trail |
| `follows.service.ts` | `follow()` | Batched tx: create follow + increment both user counters |
| `follows.service.ts` | `unfollow()` | Batched tx: delete follow + decrement both counters with GREATEST |
| `follows.service.ts` | `acceptRequest()` | Batched tx: update request + create follow + increment counters |
| `follows.service.ts` | `removeFollower()` | Batched tx: delete follow + decrement counters |
| `blocks.service.ts` | `block()` | Interactive tx: create block + delete follows + delete requests + adjust counters |
| `posts.service.ts` | `create()` | Interactive tx: hashtags + post + tagged users + collab invites + user counter |
| `posts.service.ts` | `react()/unreact()` | Batched tx: create/delete reaction + increment/decrement counter |
| `posts.service.ts` | `save()/unsave()` | Batched tx: create/delete save + increment/decrement counter |
| `posts.service.ts` | `share()` | Batched tx: create share post + increment counter + user counter |
| `posts.service.ts` | `addComment()/deleteComment()` | Batched tx: create/soft-delete comment + increment/decrement counter |
| `posts.service.ts` | `likeComment()/unlikeComment()` | Batched tx: create/delete reaction + increment/decrement counter |
| `posts.service.ts` | `crossPost()` | Interactive tx: create N posts + increment user counter |
| `reels.service.ts` | `create()` | Batched tx: create reel + increment user counter |
| `reels.service.ts` | `delete()` | Batched tx: soft-delete reel + decrement user counter |
| `reels.service.ts` | `like()/unlike()` | Batched tx: create/delete reaction + upsert interaction + counter |
| `reels.service.ts` | `share()/bookmark()/unbookmark()/view()` | Interactive tx: check-then-act + upsert + counter |
| `reels.service.ts` | `likeComment()/unlikeComment()` | Batched tx: create/delete reaction + counter |
| `threads.service.ts` | `create()` | Batched tx: create thread + increment user counter |
| `threads.service.ts` | `like()/unlike()` | Batched tx: create/delete reaction + counter |
| `threads.service.ts` | `repost()/unrepost()` | Batched tx: create/delete repost + counters |
| `videos.service.ts` | `create()` | Batched tx: create video + increment channel counter |
| `videos.service.ts` | `like()/dislike()` | Interactive tx: read-inside-tx + conditional create/update + counter |
| `videos.service.ts` | `comment()` | Batched tx: create comment + increment counter |
| `videos.service.ts` | `recordView()` | Interactive tx: check existing + upsert + conditional increment |
| `stories.service.ts` | `markViewed()` | Batched tx: create view + increment counter |
| `communities.service.ts` | `join()/leave()` | Batched tx: create/delete member + increment/decrement counter |
| `gamification.service.ts` | `awardXP()` | Interactive tx: upsert + level calc + history |
| `gamification.service.ts` | `joinChallenge()/leaveChallenge()` | Batched tx: create/delete participant + counter |
| `gamification.service.ts` | `followSeries()/unfollowSeries()` | Batched tx: create/delete follower + counter |
| `gamification.service.ts` | `addEpisode()/removeEpisode()` | Batched tx: create/delete episode + counter |
| `gamification.service.ts` | `updateStreak()` | Interactive tx: raw SQL update + re-read |
| `polls.service.ts` | `vote()/retractVote()` | Batched tx: create/delete vote + option counter + poll total counter |
| `bookmarks.service.ts` | All methods | Batched or interactive tx for create/delete + counter |
| `playlists.service.ts` | `addItem()/removeItem()` | Batched tx: create/delete item + counter |
| `stickers.service.ts` | `addStickerToPack()/removeStickerFromPack()` | Interactive tx: count + create/delete + counter |
| `community-notes.service.ts` | `rateNote()` | Interactive tx: create rating + counter + auto-promote |
| `commerce.service.ts` | `createOrder()` | Interactive tx: atomic stock decrement + order creation |
| `commerce.service.ts` | `updateOrderStatus()` | Interactive tx (for cancel/refund): stock restore + status change |
| `commerce.service.ts` | `donateZakat()/contributeTreasury()/contributeWaqf()` | Interactive tx: create donation + increment raised + auto-complete |
| `payments.service.ts` | `handleCoinPurchaseSucceeded()` | Interactive tx: claim-first idempotency + credit + audit trail |

---

## Checklist Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Every balance change in `$transaction`? | **NO.** `monetization.requestCashout()` is not (dead code). `gifts.sendGift()` and `gifts.cashout()` are. `payments` webhook handlers are. |
| 2 | Every counter atomic? | **NO.** 7 cases where counters are incremented/decremented outside the primary transaction (hashtag counts on reel/thread create/delete, audio track count, live viewer count, review aggregates). |
| 3 | Status + side effect in transaction? | **Mostly.** Challenge progress + XP award is not atomic. Achievement unlock + XP award is not atomic. |
| 4 | Crash between steps corrupts state? | **YES for 5 CRITICAL findings.** The monetization cashout, review rating, shareAsStory, reel hashtags, and live viewer counters can all leave inconsistent state on crash. |
| 5 | Transaction timeout? | **No explicit timeouts set anywhere.** Relies on Prisma default (5s for interactive, none for batched). |
| 6 | Nested transactions avoided? | **Not consistently.** `awardXP()` uses `$transaction` and is called from other methods that could be in transactions. No `tx` parameter passing pattern exists. |
| 7 | Read-for-update patterns? | **Widespread but mitigated.** Most use P2002 handlers or conditional `updateMany` as defense. Some (bookmarks.savePost, monetization.subscribe) have genuine TOCTOU issues. |
| 8 | `updateMany` + `create` without tx? | **Yes.** Commerce review pattern (aggregate + update), monetization subscribe pattern. |
