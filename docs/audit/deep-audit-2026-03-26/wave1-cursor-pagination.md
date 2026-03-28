# Wave 1: Recommendation Cursor & Pagination Audit

## Summary
12 findings. 2 CRITICAL, 4 HIGH, 5 MEDIUM, 1 LOW. ForYou feeds completely broken beyond page 1.

## CRITICAL

### F12: ForYou feeds double-interpret cursor as both createdAt AND offset — page 2+ returns ZERO results
- **Files:** posts.service.ts:176+193, reels.service.ts:317+341, threads.service.ts:150+173
- **Evidence:** cursor="20" → `new Date("20")` = Invalid Date or 1970 → createdAt filter kills all results → scored.slice(20) on empty array
- **Failure:** ForYou feed pagination completely broken. User sees max 20 items despite hundreds available.

### F5: Personalized feed cursor is IGNORED — no real pagination
- **File:** personalized-feed.service.ts:252-431
- **Evidence:** cursor parameter accepted but never used to filter pgvector KNN candidates. Same 500 candidates re-scored every page. Dedup relies on 30min session TTL.
- **Failure:** After session expiry, same items resurface. hasMore can be true with empty data.

## HIGH

### F3: Featured feed cursor filters by ID but sorts by featuredAt — skips items
### F6: Trending feeds use ID cursor but score-sort — wrong items filtered (4 endpoints)
### F10: Blended feed cursor — trending half re-fetched from scratch every page (2 endpoints)
### F1: Offset pagination on non-deterministic scored pools — duplicates/skips guaranteed (3 endpoints)

## MEDIUM

### F2: 4 different cursor formats across feed endpoints (cuid, offset string, score:id:ts, ISO timestamp)
### F7: Recommendation endpoints have no pagination at all (4 endpoints)
### F8: Block/mute exclusion capped at 50 in recommendations (vs 10000 elsewhere)
### F9: Empty page possible with hasMore=true in personalized feed
### F11: 200-item candidate pool ceiling silently truncates ranking (7 endpoints)

## LOW
### F4: getNearbyContent hasMore lies when exactly limit items exist

## CORRECT IMPLEMENTATIONS
Posts following/chronological/favorites feeds, all hashtag feeds, user profile feeds — proper keyset cursor pagination. FeedService.getTrendingFeed uses correct score:id:timestamp keyset.
