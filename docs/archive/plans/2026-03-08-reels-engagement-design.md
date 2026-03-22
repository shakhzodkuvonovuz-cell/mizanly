# Reels Feed Engagement Scoring Design

## Date
2026-03-08

## Context
As part of Batch 17 (Platform Intelligence), Step 6 requires replacing the chronological reels feed with an engagement‑scored TikTok‑style feed.

## Current State
- Endpoint: `GET /reels/feed` (no `type` parameter, unlike posts/threads)
- Ordering: `createdAt DESC` (pure chronological)
- Caching: 30‑second Redis cache per user+cursor
- Filtering: Blocks, mutes, private/deactivated users already excluded

## Design

### Algorithm
```
engagement = (likesCount * 2) + (commentsCount * 4) + (sharesCount * 6) + (viewsCount * 0.1)
ageHours = max(1, (now - createdAt) / 3600000)
score = engagement / pow(ageHours, 1.2)
```

### Key Decisions
1. **No feed‑type parameter** – Apply engagement scoring to the entire feed (TikTok model).
2. **Freshness window** – Only reels from last 72 h are eligible.
3. **Weighting** – Shares > comments > likes > views (0.1×), matching step‑6 spec.
4. **Decay exponent** – 1.2 (slower than posts/threads 1.5), allowing reels to stay relevant longer.

### Implementation Plan
1. Modify `apps/api/src/modules/reels/reels.service.ts` `getFeed` method:
   - Fetch up to 200 recent reels (last 72h)
   - Score each reel using above formula
   - Sort by `score DESC`
   - Paginate using `createdAt` cursor (same pattern as step 4)
2. Keep existing:
   - Redis cache (key unchanged)
   - Block/mute filtering
   - Authentication/authorization
3. No API changes – backward compatible.

### Pagination
- Cursor remains `createdAt` ISO string.
- When cursor present: filter `createdAt < cursor AND createdAt >= now - 72h`.
- After scoring & sorting, find first reel with `createdAt < cursor`, slice `limit+1`.
- Return `meta.cursor` = last item’s `createdAt`.

### Performance
- Fetching 200 reels per page is acceptable given 30‑s cache.
- Scoring is O(n) where n ≤ 200.
- No database‑side ranking needed.

### Verification
- Feed returns reels ordered by engagement score, not chronology.
- High‑engagement recent reels appear first.
- Views weighted lower than active engagement.
- Reels older than 72 h excluded.
- Cache still works (30 s).
- Block/mute filters still apply.

## Notes
- Follows Batch 17 Step 6 spec exactly.
- No mobile‑side changes required.
- Admin/recommendations modules (steps 1‑3) are independent.