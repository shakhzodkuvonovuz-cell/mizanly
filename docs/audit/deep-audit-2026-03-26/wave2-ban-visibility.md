# Wave 2 Seam: Ban → Content Visibility Enforcement

## Summary
42 queries missing `isBanned: false` across 9 services. Auto-unban is broken (leaves isDeactivated=true). Reports ban path is incomplete.

## TOP 5 CRITICAL GAPS

### 1. Auto-unban does NOT clear `isDeactivated` — temp-banned users permanently locked out
- **File:** clerk-auth.guard.ts:55-67
- **Evidence:** Guard clears `isBanned: false, banExpiresAt: null` but does NOT clear `isDeactivated: true` (set by admin ban). User hits `isDeactivated` check on line 70 → "Account has been deactivated" forever.
- **Impact:** Every temp-banned user can NEVER return without admin intervention.

### 2. Reports ban path is incomplete
- **File:** reports.service.ts:280-284
- Sets `isBanned: true` but does NOT:
  - Set `isDeactivated: true` (so `isDeactivated` filters don't catch it)
  - Call Clerk `banUser()` (Clerk sessions stay active)
  - Set `banExpiresAt` (TEMP_BAN becomes permanent)

### 3. 42 content queries missing `isBanned: false`
- **Breakdown:** feed.service.ts (6), personalized-feed.service.ts (7), recommendations.service.ts (9), threads.service.ts (4), posts.service.ts (2), reels.service.ts (1), hashtags.service.ts (3), search.service.ts (9), stories.service.ts (1)
- **Impact:** Banned user content appears in trending, explore, recommendations, hashtags, search, stories

### 4. No real-time socket disconnection for banned users
- **File:** chat.gateway.ts:239 blocks NEW connections but doesn't kick existing ones
- **Impact:** Banned user remains in active chats until socket naturally disconnects

### 5. No Meilisearch document removal on ban
- Full re-sync excludes banned users, but no real-time removal. Banned content searchable until next sync.

## BAN ENFORCEMENT MATRIX (42 missing queries)

| Service | Queries Missing isBanned | Total Queries |
|---------|------------------------|---------------|
| feed.service.ts | 6 | getNearby, communityTrending, trending, featured, suggestedUsers, frequentCreators |
| personalized-feed.service.ts | 7 | All 4 getTrendingFeed spaces + all 3 getIslamicEditorialPicks |
| recommendations.service.ts | 9 | 3 exploration + 2 suggestedPeople + 3 suggested fallback + suggestedChannels |
| threads.service.ts | 4 | ForYou, Following, Trending, Blended |
| posts.service.ts | 2 | TrendingFallback, Blended trending half |
| reels.service.ts | 1 | getTrendingReels |
| hashtags.service.ts | 3 | All 3 getXByHashtag methods (NO user filter at all) |
| search.service.ts | 9 | 4 aggregate + 3 dedicated search + explore + trending SQL |
| stories.service.ts | 1 | getFeedStories |

## CORRECTLY FILTERED (23 queries)
posts.service.ts ForYou, reels.service.ts ForYou, videos.service.ts Feed, search.service.ts people/channels, users.service.ts (multiple), follows.service.ts, og.service.ts, clerk-auth.guard.ts, chat.gateway.ts

## KEY INSIGHT
Since admin ban sets BOTH `isBanned: true` AND `isDeactivated: true`, queries that filter `isDeactivated` DO accidentally catch admin-banned users. But reports.service.ts ban does NOT set `isDeactivated`, so those users bypass `isDeactivated` filters entirely. The correct fix is adding `isBanned: false` to all 42 queries — relying on `isDeactivated` as proxy is fragile and semantically wrong.
