# Wave 3: N+1 Query & Unbounded Query Hot Paths

## Summary
17 findings. 2 P0-CRITICAL, 6 P1-HIGH, 7 P2-MEDIUM, 3 P3-LOW. Estimated 50-60% query reduction possible with caching + batching.

## P0 — Critical

### F1: Redundant getExcludedUserIds() across 5 services, no caching
- **Files:** feed.service.ts, personalized-feed.service.ts, threads.service.ts, recommendations.service.ts, posts.service.ts
- 3 parallel queries (Block + Mute + Restrict) x `take:10000` on EVERY feed request
- User scrolling Saf → Bakra → Majlis = 9 identical block/mute queries
- **Fix:** Cache in Redis with 60s TTL per user. Single shared utility.

### F2: PersonalizedFeed double-fetches same content IDs
- **File:** personalized-feed.service.ts:312+421
- `getContentMetadata(500 IDs)` then `hydrateItems(20 IDs)` — same table, overlapping fields
- **Fix:** Single query, store in Map, pick from it for both scoring and hydration.

## P1 — High

### F3: ForYou feed — 4 separate block/mute queries (2 redundant)
### F4: Following feed caps at 50 follows — users following 100+ get incomplete feed (DATA BUG)
- posts.service.ts:220, threads.service.ts:130, feed.service.ts:489
### F5: sendMessage — 6-9 sequential DB queries waterfall
- messages.service.ts:165-293 — conversation.findUnique called TWICE
### F6: forwardMessage — 5 queries x 5 targets = 25 queries per forward
- messages.service.ts:763-801
### F7: Hashtag upsert N+1 — per-tag individual upsert (1-30 queries per creation)
### F8: Recommendations triple-fetch — 3 queries on same table for different columns
- recommendations.service.ts:314-393

## P2 — Medium

### F9: Aggregate search — 7 SEQUENTIAL full-table ILIKE scans (not parallelized)
### F10: Grouped notifications — 200-row over-fetch to produce 20 groups (10x)
### F11: Scheduled messages — per-message transaction loop (150 queries for 50 messages)
### F12: Scheduled post notifications — 6 ops per post x 50 posts = 300 sequential ops
### F13: Conversation list loads ALL members (unbounded for group chats with 200+ members)
### F14: Message reactions — unbounded (no take limit on reactions per message)

## P3 — Low
### F15: Recommendations block cap at 50 (data correctness bug)
### F16: EndScreen/Thumbnail per-item create (small N, use createMany)
### F17: OnThisDay JS filter of 100 rows (should use SQL EXTRACT)

## Estimated Impact

| Operation | Current Queries | Optimal | Reduction |
|-----------|----------------|---------|-----------|
| Open Saf ForYou | ~12 | ~5 | 58% |
| Open Bakra | ~8 | ~3 | 63% |
| Open Majlis | ~10 | ~4 | 60% |
| Personalized feed | ~14 | ~6 | 57% |
| Send message (1:1 DM) | ~9 sequential | ~4 | 56% |
| Search (no type) | ~7 sequential scans | ~1 (Meilisearch) | 86% |

## Top 3 Fixes by Impact
1. **Cache getExcludedUserIds() in Redis** (60s TTL) — 30-40% total feed DB load reduction
2. **Merge double-fetch in personalized-feed + triple-fetch in recommendations** — 3-4 fewer queries per request
3. **Parallelize sendMessage checks + aggregate search queries** — eliminate sequential waterfalls
