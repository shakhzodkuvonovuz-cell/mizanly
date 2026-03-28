# Wave 1: Visibility/Lifecycle Filtering Audit

## Summary
20 findings. 4 CRITICAL, 10 HIGH, 4 MEDIUM. 60+ queries with missing lifecycle filters. Systemic: `isBanned` missing from 24+ queries.

## CRITICAL

### F1: `isBanned` missing from ALL feed/recommendation/hashtag queries
- **Files:** feed.service.ts, personalized-feed.service.ts, recommendations.service.ts, hashtags.service.ts
- **Evidence:** 24+ queries check `isDeactivated: false` but NOT `isBanned: false`
- **Failure:** Banned users' content appears in trending, recommendations, hashtag pages, explore, suggested users
- **Impact:** Banning a user has NO effect on content visibility in most feeds

### F2: `isDeleted` never checked in any content feed query
- **Evidence:** Zero occurrences of `isDeleted` filter in any feed service
- **Failure:** If account deletion transaction partially commits (user deleted but some content rows not marked isRemoved), content remains visible

### F3: `getNearbyContent` missing ALL user lifecycle filters
- **File:** `feed.service.ts:551-574`
- **Evidence:** Zero user-level filtering: no isDeactivated, isBanned, isPrivate, isDeleted, no block/mute exclusion
- **Failure:** Banned, deactivated, deleted, private users' location-tagged posts all visible

### F7: Hashtag content queries have NO user lifecycle filters
- **File:** `hashtags.service.ts:213, 249, 286`
- **Evidence:** All 3 methods (posts/reels/threads by hashtag) have ZERO user filters
- **Failure:** Hashtag pages show content from banned, deactivated, deleted users

## HIGH (10 findings)

### F4: `getCommunityTrending` — no user filter, no visibility filter
### F6: `getFeaturedFeed` — missing isPrivate + isBanned
### F8: `getRelatedPosts` — no user filter, no visibility filter
### F9: `getRecommended` videos — missing isRemoved AND user filters
### F10: pgvector hydration — missing lifecycle re-check on all 3 content types
### F11: Following feed — missing visibility filter (PRIVATE posts leak to followers)
### F12: Search content queries (13 queries) — no user filter on any content search
### F14: Block/mute exclusion capped at take:50 in 4 services (should be 10000)
### F15: Minbar trending — missing isRemoved check
### F16: Reel feed block exclusion is one-directional (only checks blockerId, not blockedId)

## MEDIUM (4 findings)
### F5, F13, F17-F18: Saved content, watch history, trending threads, scheduledDeletionAt

## SYSTEMIC ROOT CAUSE
Standard user filter for ALL public queries should be:
`user: { isDeactivated: false, isBanned: false, isDeleted: false, isPrivate: false }`
Block/mute caps should be uniformly `take: 10000`.
