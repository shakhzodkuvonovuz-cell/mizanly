# Wave 1: Fan-Out / Write Amplification Audit

## Summary
10 findings. 3 HIGH, 3 MEDIUM, 3 LOW, 1 INFO. Key hotspots: presence broadcast, verse-of-day, follower snapshots.

## HIGH

### F1: Verse of the Day — 1,000 sequential individual notification creates
- **File:** islamic.service.ts:1964-1973
- **Evidence:** `for...of` loop with individual `prisma.notification.create()`. 5 seconds at 5ms/query.
- **Fix:** Replace with `createMany` (pattern exists nearby in same file for Islamic events)

### F2: Follower Snapshot — 200K individual upserts via Promise.allSettled
- **File:** users.service.ts:837-858
- **Evidence:** `take: 200000` fetch + 100-parallel individual upserts. 200MB+ heap at scale.
- **Fix:** Raw SQL `INSERT...ON CONFLICT` with batch VALUES

### F4: Chat Presence — 5,000 socket emits per connect/disconnect
- **File:** chat.gateway.ts:265-272, 346-353
- **Evidence:** Fetches up to 5,000 conversation memberships, emits `user_online` to each individually
- **Fix:** Single Redis pub/sub event per user, not per-room emit

## MEDIUM

### F3: Counter Reconciliation — up to 2,500 sequential individual updates
### F5: Encryption Key Rotation — 50 sequential message creates (should be createMany)
### F9: Broadcast channel sendMessage has NO subscriber notification at all (missing feature)

## LOW

### F6: Search Reconciliation — 3,500 sequential queue jobs (Redis LPUSH, fast)
### F7: Post mention/tag notifications — sequential per-user creates (bounded by take:50)
### F10: Alt Profile access grant — sequential upserts (bounded by ~50)

## INFO
### F8: Post/Reel/Video creation does NOT notify followers (correct design — not a bug)
- PublishWorkflowService docstring says "Notification to followers" but never implements it
- Channel/broadcast subscribers never get notified of new content

## POSITIVE
- Islamic event reminders correctly use createMany with batch 500
- Screen time digest correctly uses createMany with batch 500
- Message send unreadCount uses single updateMany
- Follow/unfollow is O(1) writes (no fan-out)
