# Wave 1: Denormalized State & Repairability Audit

## Summary
14 findings. 2 HIGH, 7 MEDIUM, 4 LOW, 1 resolved. 89 counters identified; only 6 have reconciliation (~7%).

## HIGH

### F1: CounterReconciliationService covers only 6 of 89+ counters
- **Reconciled:** User.followersCount, followingCount (daily), Post.likesCount, commentsCount (monthly), User.postsCount (weekly)
- **NOT reconciled:** ALL Reel counters (6), ALL Thread counters (6), ALL Video counters (6), ALL Story counters (2), Channel.*, Circle.*, Community.*, Hashtag.*, ConversationMember.unreadCount, and 50+ more
- **Failure:** 83+ counters can drift permanently with no repair mechanism

### F2: Admin reconciliation endpoint is a dead stub — returns success but never calls reconciliation
- **File:** admin.controller.ts:133-139
- **Evidence:** `CounterReconciliationService` never injected, never called. Response is a lie.
- Same for Meilisearch sync endpoint — dead stub.

## MEDIUM

### F3: LIMIT 1000/500 caps prevent full reconciliation in single run
### F4: User profile cache (5-min TTL) not invalidated on follow/unfollow
- blocks.service.ts DOES invalidate (pattern exists) — follows doesn't
### F5: Post savesCount/sharesCount documented as REPAIRABLE but not implemented
### F6: Hashtag counters unreconciled — affects trending ranking accuracy
- Decrement is fire-and-forget with silent catch. Trending uses these wrong counts.
### F9: Search reconciliation misses users/videos/hashtags (3 of 6 types)
### F10: ConversationMember.unreadCount documented as repairable but not implemented
### F11: Redis cache keys have no mutation-based invalidation — TTL-only expiry

## LOW

### F12: N+1 update pattern in reconciliation (individual UPDATE in loop)
### F13: Reel.loopsCount field exists but is NEVER incremented (always 0)
### F14: Hashtag counter increments outside main transaction (can under-count on failure)
### F7: Trending scores computed on-the-fly (CORRECT — no stale stored scores)

## RESOLVED
### F8: CoinBalance dual-balance resolved — User.coinBalance removed, CoinBalance table sole source

## 89 Counter Inventory
User(5), Post(5), Reel(6), Thread(6), ThreadReply(1), Story(2), Video(6), Channel(3), Playlist(1), ConversationMember(1), Message(1), BroadcastChannel(2), ChannelPost(2), Circle(2), Community(2), Hashtag(4), AudioTrack(1), ReelTemplate(1), ForumThread(2), Poll(1), Challenge(2), StoryChain(2), WaqfFund(1), LiveBroadcast(2), + ~30 others
