# Wave 3: Transaction Isolation & Atomicity Gaps

## Summary
20 gaps found. 8 P0 (including 2 monetary), 9 P1, 3 P2. The gift/cashout split-operations are the most dangerous.

## P0 — Critical Atomicity Gaps

### G1: Gift send — debit OUTSIDE transaction (MONETARY)
- **File:** gifts.service.ts:130-172
- `coinBalance.updateMany` (debit) at line 130 is SEPARATE from `$transaction` at line 140 (gift record + receiver credit + logs)
- **Failure:** Crash between the two → coins lost, no record, no recovery

### G2: Cashout — debit OUTSIDE transaction log (MONETARY)
- **File:** gifts.service.ts:278-306, monetization.service.ts:497-514
- Diamond deduction and CoinTransaction log creation are separate operations
- **Failure:** Diamonds deducted, no audit trail on partial failure

### G3: Channel post like/unlike — NO dedup, ANY user can spam unlimited likes
- **File:** channel-posts.service.ts:72-93
- No `findUnique` check, no P2002 catch, no unique constraint enforcement
- **Failure:** Unlimited like inflation. Most exploitable bug in the codebase.

### G4-G5: Broadcast subscribe/unsubscribe — member CRUD and counter not transactional
- **File:** broadcast.service.ts:69-106
- `member.create` then `$executeRaw INCREMENT` as separate operations

### G6-G7: Reel comment like/unlike — create/delete and counter not transactional
- **File:** reels.service.ts:715-749
- Compare: post comment like correctly uses `$transaction`

### G8: Scholar QA voteQuestion — no transaction, no P2002 catch
- **File:** scholar-qa.service.ts:88-94
- Double-vote possible + votesCount drift

## P1 — High

### G9-G10: Hashtag counter decrements outside soft-delete transaction (posts + threads)
- posts.service.ts:822-828, threads.service.ts:540-543
- If post delete succeeds but hashtag decrement fails → inflated hashtag counts

### G11: Reel hashtag upserts BEFORE reel creation transaction
- reels.service.ts:109-123 vs 129
- Failed reel creation leaves inflated hashtag counts

### G12: Circle leave — decrement without GREATEST, clamp is separate operation
- communities.service.ts:333 — brief negative window between decrement and clamp

### G13: Video view — dedup check outside transaction
- videos.service.ts:734-768 — findUnique for duplicate check, then transaction for view creation
- Race: two simultaneous views both pass dedup check, both create views → double count

### G14: Gamification awardXP — level calculated on stale totalXP
- gamification.service.ts:149-155 — reads old XP, awards new, calculates level on pre-increment value

### G15: Payment/subscription mappings — Redis-only, no DB persistence
- payments.service.ts:83-96 — Redis flush = lost mappings, no recovery

### G16: Coin purchase webhook — matches pending transaction by amount+description, not by PI ID
- payments.service.ts:461-471 — wrong pending transaction can be matched

### G17: Video like dislike-to-like flip — stale existingReaction read outside tx
- videos.service.ts:473-525 — likesCount/dislikesCount off by 1

## P2 — Medium

### G18: Block cleanup — fire-and-forget circle/follow removal, no retry
### G19: Block follow scan — concurrent follow operations during block can cause count drift
### G20: Thread votePoll — no P2002 catch, 500 error on concurrent votes

## POSITIVE PATTERNS (Correctly Implemented)
- Follow/unfollow: $transaction with P2002 handling, GREATEST for decrements
- Post like/unlike/save/share/comment: all properly transactional
- Thread like/repost/bookmark: properly transactional
- Reel like/unlike/bookmark/share/view: properly transactional (interactive tx)
- Channel subscribe/unsubscribe: properly transactional
- Video like/dislike (non-flip case): properly transactional
