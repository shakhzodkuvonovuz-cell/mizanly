# Wave 1: Follower/Counter Integrity Audit

## Summary
11 findings checked. 3 HIGH, 4 MEDIUM, 2 LOW, 2 self-corrected/safe.

## HIGH

### F1: Reel comment like/unlike NOT atomic (outside transaction)
- **File:** reels.service.ts:719-748
- **Contrast:** Post comment like correctly uses $transaction

### F6: Post/Thread viewsCount NEVER incremented — always 0
- **Files:** posts.service.ts (no view() method), threads.service.ts (no view() method)
- **Evidence:** Reels and Videos have view tracking. Posts and Threads don't.
- **Failure:** Feed scoring uses viewsCount*0.1 term — always 0. Analytics show 0 views on every post.

### F7: Account deletion does NOT decrement other users' counters
- **File:** users.service.ts:299 — deleteMany for follows but no counter decrements on affected users
- **Failure:** Every follower keeps inflated followingCount. Every followed user keeps inflated followersCount. Engagement counters on affected posts/threads/videos also inflated.

## MEDIUM

### F2: Reel comment unlike uses `decrement: 1` without GREATEST guard (can go negative)
### F3: Series unfollow uses `decrement: 1` without GREATEST guard
### F4: Circle leave uses two-step decrement + post-hoc negative fix (brief negative window)
### F8: Reconciliation only covers 5 of 30+ counter fields
- CounterReconciliationService reconciles: followersCount, followingCount, postsCount, Post.likesCount, Post.commentsCount
- NOT reconciled: 25+ other counters (Reel.*, Thread.*, Video.*, Channel.*, Hashtag.*, Circle.*, etc.)

## LOW
### F9: Broadcast subscribe/unsubscribe not atomic
### F10: Story repliesCount not transactional (mitigated by 24h expiry)

## POSITIVE: Follow/unfollow, post operations, thread operations, video operations, channel subscribe, reel operations all correctly use transactions + GREATEST guards.
