# A07: Posts Feed/Trending Audit

Scope: `posts.service.ts` (getFeed, getTrending, getForYou, getTimeline), `feed.service.ts`, `personalized-feed.service.ts`

Date: 2026-04-05

---

## Findings

### [CRITICAL] F01 — Missing `await` on dismiss upsert causes race condition with cache invalidation

**File:** `apps/api/src/modules/feed/feed.service.ts`, line 86

```ts
const result = this.prisma.feedDismissal.upsert({ ... }); // NO await
await this.redis.del(`dismissed:${userId}:${contentType}`); // Cache cleared BEFORE DB write commits
return result; // Returns unresolved Promise
```

The Prisma upsert is not awaited. The execution flow is:
1. DB upsert starts (fire-and-forget Promise)
2. Redis cache is cleared (awaited)
3. Unresolved Promise is returned

If another request calls `getDismissedIds()` between step 2 and the DB write committing, it will re-populate the cache from the DB which does NOT yet contain the new dismissal. The dismissed item will continue appearing in the user's feed until the 120s cache TTL expires.

Additionally, the caller receives a Promise object instead of the upsert result, which may cause serialization issues in the response.

---

### [HIGH] F02 — Favorites feed exposes FOLLOWERS-only posts without verifying follow relationship

**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 388-394

```ts
const posts = await this.prisma.post.findMany({
  where: {
    userId: { in: favoriteIds },
    visibility: { in: ['PUBLIC', 'FOLLOWERS'] },
    // ...
  },
```

The favorites feed shows posts from circle members with `visibility: 'FOLLOWERS'`, but circle membership does NOT imply a follow relationship. A user can add any user to their circle without following them. This means a user could:
1. Add a private account to their "favorites" circle
2. See that account's FOLLOWERS-only posts without actually following them

The fix requires either checking that the viewer follows each circle member, or restricting favorites to `visibility: 'PUBLIC'` only for non-followed members.

---

### [HIGH] F03 — Dismissed posts not filtered in following, chronological, trending fallback, and blended feeds

**File:** `apps/api/src/modules/posts/posts.service.ts`

The `foryou` feed (line 119-133) correctly fetches and filters dismissed posts. However, the following feeds do NOT:

| Feed method | Line | Dismissed filter? |
|---|---|---|
| `getFeed` (following) | 185-201 | NO |
| `getChronologicalFeed` | 337-364 | NO |
| `getTrendingFallback` | 218-259 | NO |
| `getBlendedFeed` | 265-335 | NO |
| `getFavoritesFeed` | 375-409 | NO |

Users who dismiss a post will continue seeing it in all feeds except foryou. The dismiss feature gives false confidence that unwanted content is gone.

---

### [HIGH] F04 — `getRelatedPosts` does not filter blocked/muted users for the viewer

**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 1782-1802

```ts
async getRelatedPosts(postId: string, limit = 5) {
  // ... no viewerId parameter, no block/mute check
  return this.prisma.post.findMany({
    where: {
      user: { isDeactivated: false, isBanned: false, isDeleted: false },
      // NO isPrivate check
      // NO blocked/muted user exclusion
    },
```

This endpoint:
1. Has no `viewerId` parameter, so cannot check blocks/mutes
2. Does not filter `isPrivate` users (their public posts would show, but the omission is inconsistent with all other feed endpoints)
3. A user can see "related posts" from someone who blocked them

---

### [HIGH] F05 — Personalized feed `getContentMetadata` and `hydrateItems` missing `isPrivate` filter

**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`

Line 830:
```ts
const safeUserFilter = { isBanned: false, isDeactivated: false, isDeleted: false };
// Missing: isPrivate: false
```

This filter is used in both `getContentMetadata()` (line 830) and `hydrateItems()` (line 875). Every other feed query in the codebase includes `isPrivate: false` in the user filter. The omission means:
- Private users' content can be scored and served in the personalized feed
- Private users' reels, threads, and posts can be hydrated and returned to the client

Additionally, the reel query in `getContentMetadata` (line 842) is missing a `visibility` check entirely (posts check `visibility: 'PUBLIC'` but reels do not).

---

### [MEDIUM] F06 — `getOnThisDay` misses memories for prolific users due to `take: 100` with JS date filtering

**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 116-136

```ts
const memories = await this.prisma.post.findMany({
  where: {
    userId,
    isRemoved: false,
    createdAt: { lt: new Date(today.getFullYear(), 0, 1) },
  },
  orderBy: { createdAt: 'desc' },
  take: 100,
});

return memories.filter(p => {
  const d = new Date(p.createdAt);
  return d.getMonth() === month && d.getDate() === day;
}).slice(0, 5);
```

The query fetches the 100 most recent posts from previous years, then filters in JS for the current month/day. For a prolific user posting 2+ times daily, 100 posts only covers ~50 days. If today is March 15 but the user's 100 most recent historical posts are all from December-February, no March 15 memories will be found even if they exist in 2024 or earlier.

The correct approach is to use a date range query per historical year, or use SQL date extraction (`EXTRACT(MONTH FROM ...)`) to filter at the DB level.

---

### [MEDIUM] F07 — `enrichPostsForUser` hardcoded `take: 50` silently drops enrichment for large pages

**File:** `apps/api/src/common/utils/enrich.ts`, lines 23-31

```ts
const [reactions, saves] = await Promise.all([
  prisma.postReaction.findMany({
    where: { userId, postId: { in: postIds } },
    select: { postId: true, reaction: true },
    take: 50,  // Hard cap
  }),
  prisma.savedPost.findMany({
    where: { userId, postId: { in: postIds } },
    select: { postId: true },
    take: 50,  // Hard cap
  }),
]);
```

If a caller passes more than 50 posts (e.g., the scored feed cache returns a batch), reactions/saves for posts beyond the 50th will silently be reported as `userReaction: null, isSaved: false`. This produces incorrect UI state (post appears unliked when the user has liked it). The `take` should match the input array length or be removed since the `postId: { in: postIds }` filter already bounds the result set.

---

### [MEDIUM] F08 — `FEED_POST_SELECT` in feed.service.ts leaks `isRemoved` field to API clients

**File:** `apps/api/src/modules/feed/feed.service.ts`, line 31

```ts
const FEED_POST_SELECT = {
  // ...
  isRemoved: true,  // Leaks internal soft-delete status to client
  // ...
};
```

While the DB query filters `isRemoved: false`, the field value (`false`) is still included in every feed response. This:
1. Leaks internal schema information to clients
2. Increases response payload size unnecessarily
3. Could cause confusion if a future bug allows removed posts through -- the client would see `isRemoved: true` instead of the post being filtered server-side

---

### [MEDIUM] F09 — Trending feed cache for unauthenticated users is keyed by cursor string, enabling cache poisoning

**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 303-314

```ts
const cacheKey = !userId ? `trending_feed:${cursor || 'first'}:${limit}` : null;
```

The cache key includes the raw `cursor` string from the request. Since the cursor format is `score:id:timestamp`, an attacker can craft cursor strings that differ slightly (e.g., different whitespace, extra colons) to create many cache entries, wasting Redis memory. Additionally, since `limit` is user-controlled, an attacker can request `limit=1`, `limit=2`, ..., `limit=100` to create 100 separate cached copies of the trending feed.

There is no validation that `limit` is bounded before it enters the cache key. If `limit` is not capped by the controller, this allows unbounded cache key generation.

---

### [MEDIUM] F10 — Dismissed IDs capped at `take: 1000` in `getDismissedIds` and `take: 200` in foryou feed

**File:** `apps/api/src/modules/feed/feed.service.ts`, line 102 and `apps/api/src/modules/posts/posts.service.ts`, line 121

```ts
// feed.service.ts line 102
const d = await this.prisma.feedDismissal.findMany({ ..., take: 1000 });

// posts.service.ts line 121 (foryou feed)
this.prisma.feedDismissal.findMany({ ..., take: 200 }),
```

Two issues:
1. The foryou feed only loads 200 dismissed IDs while `getDismissedIds()` loads 1000. Active users who dismiss many posts will have inconsistent filtering between feeds using different caps.
2. Neither cap handles users with >1000 dismissals. Post #1001 that was dismissed will reappear.

The foryou feed's `take: 200` is particularly aggressive -- a heavy user could easily dismiss 200+ posts in a week.

---

### [MEDIUM] F11 — Blended feed trending section fetches `limit * 3` posts without cap

**File:** `apps/api/src/modules/posts/posts.service.ts`, line 305

```ts
const trendingPosts = await this.prisma.post.findMany({
  // ...
  take: limit * 3,  // If limit=100, fetches 300 posts
  orderBy: { createdAt: 'desc' },
});
```

The `limit` parameter comes from the controller and if not capped upstream, `limit * 3` could fetch an unbounded number of posts. A request with `limit=1000` would fetch 3000 posts into memory, score them all, and sort them -- a potential DoS vector.

---

### [LOW] F12 — `getOnThisDay` uses server timezone for month/day comparison instead of user timezone

**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 112-135

```ts
const today = new Date();
const month = today.getMonth();
const day = today.getDate();
```

`new Date()` uses the server's timezone (UTC in most deployments). A user in UTC+12 (e.g., New Zealand) would see memories for the wrong day for 12 hours. The function should accept the user's timezone or UTC offset.

---

### [LOW] F13 — `getRelatedPosts` has no `isPrivate` filter on the user

**File:** `apps/api/src/modules/posts/posts.service.ts`, line 1796

```ts
user: { isDeactivated: false, isBanned: false, isDeleted: false },
// Missing: isPrivate: false
```

Every other feed endpoint in the codebase filters `isPrivate: false` on the user relation. This endpoint omits it, meaning public posts from private users could appear in related posts. While the post itself is `visibility: 'PUBLIC'`, showing content from private accounts in discovery surfaces is inconsistent with the platform's privacy model.

---

### [LOW] F14 — Scored feed cache stores full post objects in Redis hash, increasing memory pressure

**File:** `apps/api/src/common/utils/scored-feed-cache.ts`, lines 106-107

```ts
hsetArgs.push(item.id, JSON.stringify(item));
```

The `ScoredFeedCache` stores the entire post object (including `content`, `mediaUrls`, `user` relations, etc.) in a Redis hash alongside the sorted set. For the foryou feed, this stores 500 full post objects per user in Redis. With 10K concurrent users, this is 5M serialized post objects in Redis.

A more memory-efficient approach would store only post IDs in the sorted set and re-hydrate from Prisma on page reads.

---

### [LOW] F15 — Personalized feed `hydrateItems` has `take: 50` but receives up to `limit` items (default 20, max unbounded)

**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 882-883

```ts
const posts = await this.prisma.post.findMany({
  where: { id: { in: ids }, ... },
  take: 50,
});
```

The `take: 50` is hardcoded across all content types in `hydrateItems`. If the diversified feed returns more than 50 items (possible if `limit` parameter is not capped by the controller), hydration will silently drop items. The `take` should match `ids.length` since the IN clause already bounds the result.

---

### [LOW] F16 — `getCommunityTrending` scores capped community results but returns enrichment-free items

**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 141-186

The `getCommunityTrending` method fetches and scores posts but does NOT call `enrichPostsForUser`. The returned posts will lack `userReaction` and `isSaved` fields. While this may be intentional (community trending may not need per-user enrichment), it creates an inconsistent API contract compared to all other feed endpoints.

---

### [INFO] F17 — `isRemoved` field is selected but always `false` in feed queries

**File:** `apps/api/src/modules/feed/feed.service.ts`, line 31

The `FEED_POST_SELECT` selects `isRemoved: true` (meaning "include this field"), and all queries filter `isRemoved: false`. Every post in the response will have `isRemoved: false`. This is wasted bytes and leaked schema metadata. Should be removed from the select.

---

### [INFO] F18 — Personalized feed `getPersonalizedFeed` fetches up to 10,000 hashtag follows

**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 259-262

```ts
this.prisma.hashtagFollow.findMany({
  where: { userId },
  select: { hashtagId: true },
  take: 10000,
}),
```

Then resolves all 10,000 IDs to names (line 269). This is excessive for a per-request operation -- most users follow <100 hashtags. The `take: 10000` could be reduced to 500 with negligible accuracy loss, or the resolved names could be cached in Redis.

---

## Checklist Verification

### 1. Blocked user bypass

**PARTIAL PASS.** Most feed methods correctly call `getExcludedUserIds()` which covers blocks (bidirectional), mutes, and restricts. However:
- `getRelatedPosts` (F04) has NO block/mute filtering and no viewer context
- `getContentMetadata` / `hydrateItems` in personalized-feed.service.ts filter excluded users post-fetch (line 295) but only for the pgvector path -- not the trending or cold-start paths

### 2. Missing pagination

**PASS with caveats.** All feed queries use `take: limit + 1` pattern for cursor pagination. However:
- `getOnThisDay` uses `take: 100` with JS filtering (F06) -- not truly paginated
- `blended feed` trending section uses `take: limit * 3` (F11) without upstream cap
- `getCommunityTrending` uses `CANDIDATE_POOL_SIZE.COMMUNITY` (100) as take

### 3. Performance / N+1

**PASS.** No N+1 queries found in feed paths. All use batch queries with `findMany` and `{ in: ids }`. The `enrichPostsForUser` utility batches reactions/saves in two queries. The `getContentMetadata` batches engagement data. The `getFrequentCreatorIds` uses SQL aggregation instead of fetching interactions.

### 4. Privacy

**FAIL.** Two privacy issues:
- F02: Favorites feed shows FOLLOWERS-only posts from non-followed circle members
- F05: Personalized feed missing `isPrivate` filter in metadata and hydration queries

### 5. Soft delete filtering

**PASS.** All feed queries include `isRemoved: false` filter. The `FEED_POST_SELECT` leaks the field value (F08/F17) but does not return removed posts.

### 6. Deactivated users

**PASS.** All feed queries filter `user: { isDeactivated: false, isBanned: false, isDeleted: false }`. The SQL trending query in `feed.service.ts` (line 418-421) also checks these three fields on the users table JOIN.

### 7. Scheduled posts

**PASS.** All feed queries include the `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]` pattern consistently.

### 8. Cache consistency

**FAIL.** Two cache issues:
- F01: Missing `await` on dismiss upsert means cache is cleared before DB write commits
- F09: Trending feed cache key includes raw user input, enabling cache key proliferation
- Scored feed cache (`ScoredFeedCache`) has a proper lock-based population and TTL-based expiry, which is sound. But the dismiss cache race (F01) undermines it.
