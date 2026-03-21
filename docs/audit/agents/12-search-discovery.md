# Agent #12 — Search/Discovery Deep Audit

**Scope:** `apps/api/src/modules/search/`, `apps/api/src/modules/hashtags/`, `apps/api/src/modules/og/`, plus queue integration
**Files audited:** 18 files, every line read
**Date:** 2026-03-21
**Total findings:** 38

---

## CRITICAL (P0) — Ship Blockers

### F01: `safeLimit` computed but NEVER used — unbounded queries via `limit` parameter
**File:** `apps/api/src/modules/search/search.service.ts`, line 165
**Severity:** P0 — Data exfiltration / DoS
**Category:** Unbounded Query

`safeLimit` is correctly computed with `Math.min(Math.max(limit, 1), 50)` on line 165, but every subsequent query in the method uses the raw unclamped `limit` variable instead:
- Line 175: `this.meilisearch.search(indexName, query, { limit })` — raw limit to Meilisearch
- Line 185: `const take = limit + 1` — raw limit for Prisma `take`
- Line 303: `take: isAggregate ? 5 : limit` — raw limit for people search
- Line 372: `take: type ? limit : 10` — raw limit for hashtags

An attacker can pass `?limit=100000` and dump the entire database through search.

```typescript
// Line 165 — computed but dead
const safeLimit = Math.min(Math.max(limit, 1), 50);
// Line 185 — uses raw `limit`, NOT `safeLimit`
const take = limit + 1;
```

**Fix:** Replace all `limit` references after line 165 with `safeLimit`.

---

### F02: `@Query('limit')` returns string — causes string concatenation in `take`
**File:** `apps/api/src/modules/search/search.controller.ts`, lines 49, 60, 70, 79
**Severity:** P0 — Runtime Bug
**Category:** Type Mismatch

NestJS `@Query()` returns raw string values from HTTP query parameters. The controller declares `@Query('limit') limit = 20` with a default number, but when a query param is present, `limit` is a string like `"50"`.

In the service, `take = limit + 1` becomes string concatenation: `"50" + 1 = "501"` (string). Prisma's `take` parameter expects a number. This either:
- Silently coerces `"501"` to `501` (returning 500 extra records)
- Throws a runtime Prisma type error

This affects ALL endpoints: `/search/posts`, `/search/threads`, `/search/reels`, `/search/explore`.

```typescript
// Controller (line 49) — limit is string when provided via ?limit=50
@Query('limit') limit = 20,
// Service — string concatenation bug
const take = limit + 1; // "50" + 1 = "501" (string)
```

**Fix:** Use `@Query('limit', new ParseIntPipe({ optional: true }))` or create a DTO with `@Type(() => Number)`.

---

### F03: Search for people leaks banned, deactivated, and deleted users
**File:** `apps/api/src/modules/search/search.service.ts`, lines 294-306, 562-581
**Severity:** P0 — Privacy Violation
**Category:** Private Account Leak

The `search(type='people')` query (line 294) and `getSuggestions()` (line 562) return users with NO filtering on:
- `isBanned: false`
- `isDeactivated: false`
- `isDeleted: false`
- `isPrivate: false` (only `suggestedUsers` filters this)

Banned users, deactivated accounts, and soft-deleted users appear in search results and autocomplete suggestions. This leaks user existence and profile data after account deletion (GDPR "right to be forgotten" violation).

```typescript
// Line 294-305 — NO ban/deactivated/deleted/private filter
results.people = await this.prisma.user.findMany({
  where: {
    OR: [
      { username: { contains: query, mode: 'insensitive' } },
      { displayName: { contains: query, mode: 'insensitive' } },
    ],
  }, // Missing: isBanned: false, isDeactivated: false, isDeleted: false
```

**Fix:** Add `isBanned: false, isDeactivated: false, isDeleted: false` to both user search queries.

---

### F04: OG endpoints expose removed/private content
**File:** `apps/api/src/modules/og/og.service.ts`, lines 27-108
**Severity:** P0 — Content Leak
**Category:** Removed Content Exposure

All four OG methods (`getPostOg`, `getReelOg`, `getThreadOg`, `getProfileOg`) use `findUnique` with NO checks for:
- `isRemoved: false` (shows removed/moderated content in OG previews)
- `visibility: 'PUBLIC'` (shows private posts in OG link previews)
- `isBanned`/`isDeactivated`/`isDeleted` (shows banned user profiles)

When content is shared via a link on Twitter/Discord/Slack, the OG preview renders moderated content that was deliberately removed.

```typescript
// Line 28-36 — NO isRemoved or visibility check
const post = await this.prisma.post.findUnique({
  where: { id: postId },
  // Missing: isRemoved: false, visibility: 'PUBLIC'
});
```

**Fix:** Add `where: { id: postId, isRemoved: false, visibility: 'PUBLIC' }` for posts/threads, and `isRemoved: false, status: 'READY'` for reels. Check `isBanned`/`isDeactivated` on user profile OG.

---

### F05: Search-indexing queue has NO processor — all index jobs silently lost
**File:** `apps/api/src/common/queue/queue.module.ts` (no search processor registered)
**Severity:** P0 — Feature Dead
**Category:** Missing Implementation

The `QUEUE_SEARCH_INDEXING` queue is defined and jobs can be enqueued via `QueueService.addSearchIndexJob()`, but there is NO processor in `apps/api/src/common/queue/processors/`. The 5 registered processors are: `notification`, `media`, `webhook`, `analytics`, `ai-tasks`. Search indexing has no worker.

All `addSearchIndexJob` calls silently enqueue jobs that are never processed, meaning Meilisearch indexes are never updated after content creation/deletion. The search index becomes stale immediately.

**Fix:** Create `apps/api/src/common/queue/processors/search-indexing.processor.ts` that calls `MeilisearchService.addDocuments`/`deleteDocument`.

---

## HIGH (P1) — Security & Data Integrity

### F06: Reel search does not filter `isRemoved` — removed reels appear in results
**File:** `apps/api/src/modules/search/search.service.ts`, lines 269-278, 332-340, 524-542
**Severity:** P1 — Content Leak
**Category:** Removed Content Exposure

Three reel search paths only check `status: 'READY'` but NOT `isRemoved: false`:
1. `search(type='reels')` — line 269
2. Aggregate search reels — line 332
3. `searchReels()` — line 524

Removed reels (e.g., content taken down for policy violations) are still findable via search.

```typescript
// Line 269-272 — Missing isRemoved check
where: {
  caption: { contains: query, mode: 'insensitive' },
  status: 'READY',
  // Missing: isRemoved: false
},
```

**Fix:** Add `isRemoved: false` to all three reel search `where` clauses.

---

### F07: Video search does not filter `isRemoved`
**File:** `apps/api/src/modules/search/search.service.ts`, lines 227-239, 343-353
**Severity:** P1 — Content Leak
**Category:** Removed Content Exposure

Video search only checks `status: 'PUBLISHED'` but not `isRemoved: false`. A video marked as removed but still having PUBLISHED status appears in results.

```typescript
// Line 227-234 — Missing isRemoved check
where: {
  OR: [...],
  status: 'PUBLISHED',
  // Missing: isRemoved: false
},
```

**Fix:** Add `isRemoved: false` to both video search paths.

---

### F08: Hashtag posts/reels/threads endpoints leak private/followers-only content
**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 212-221, 246-255, 280-289
**Severity:** P1 — Privacy Violation
**Category:** Visibility Bypass

`getPostsByHashtag`, `getReelsByHashtag`, and `getThreadsByHashtag` filter by `isRemoved: false` but do NOT filter by `visibility: 'PUBLIC'`. Posts and threads marked as `FOLLOWERS_ONLY` or `CLOSE_FRIENDS` are returned to anyone who searches the hashtag.

```typescript
// Line 212-221 — Missing visibility filter
const posts = await this.prisma.post.findMany({
  where: {
    hashtags: { has: hashtagName },
    isRemoved: false,
    // Missing: visibility: 'PUBLIC'
  },
```

**Fix:** Add `visibility: 'PUBLIC'` to all three hashtag content queries.

---

### F09: Sitemap exposes private posts and removed content
**File:** `apps/api/src/modules/og/og.service.ts`, lines 119-129
**Severity:** P1 — Privacy Violation / SEO Poisoning
**Category:** Information Disclosure

The `getSitemapXml()` method:
1. **Posts** (line 119): Only filters `isAltProfile: false` — does NOT filter `visibility: 'PUBLIC'`, `isRemoved: false`. Private and removed posts get indexed by Google.
2. **Threads** (line 125): Has NO `where` clause at all — every thread including private, removed, and sensitive ones is in the sitemap.
3. **Users** (line 113): Filters `isPrivate: false` but NOT `isBanned`, `isDeactivated`, `isDeleted`.

```typescript
// Line 119-124 — Missing visibility/removed filter
this.prisma.post.findMany({
  where: { isAltProfile: false }, // ONLY filter
  // Missing: visibility: 'PUBLIC', isRemoved: false
}),
// Line 125-129 — NO filter at all
this.prisma.thread.findMany({
  select: { id: true, createdAt: true }, // Returns ALL threads
}),
```

**Fix:** Add proper visibility and removal filters to all three sitemap queries.

---

### F10: `suggestedUsers` loads ALL follows into memory — OOM risk
**File:** `apps/api/src/modules/search/search.service.ts`, lines 458-461
**Severity:** P1 — Performance / DoS
**Category:** Unbounded Query

The `suggestedUsers` method fetches ALL follows for a user with no `take` limit:

```typescript
const myFollowing = await this.prisma.follow.findMany({
  where: { followerId: userId },
  select: { followingId: true },
  // Missing: take limit
});
```

A user following 100K accounts loads 100K records into memory. The resulting `notIn: [...]` array with 100K IDs also creates a massive SQL query that can hit PostgreSQL parameter limits.

**Fix:** Either add `take: 10000` or use a subquery approach instead of loading IDs into memory.

---

### F11: `suggestedUsers` does not filter banned users
**File:** `apps/api/src/modules/search/search.service.ts`, lines 471-484
**Severity:** P1 — Content Integrity
**Category:** Banned User Leak

The `suggestedUsers` query filters `isPrivate: false` and `isDeactivated: false` but does NOT filter:
- `isBanned: false` — banned users are suggested to follow
- `isDeleted: false` — soft-deleted users are suggested

```typescript
where: {
  id: { notIn: [...myFollowingIds, userId] },
  isPrivate: false,
  isDeactivated: false,
  // Missing: isBanned: false, isDeleted: false
},
```

---

### F12: No authentication on main search endpoint — abuse vector
**File:** `apps/api/src/modules/search/search.controller.ts`, lines 16-24
**Severity:** P1 — Abuse
**Category:** Missing Auth

The main `@Get()` search endpoint has NO auth guard at all — not even `OptionalClerkAuthGuard`. Anyone can scrape the entire search index without authentication. Combined with F01 (unbounded limit), this allows unauthenticated mass data extraction.

```typescript
@Get()
@Throttle({ default: { ttl: 60000, limit: 30 } })
search(  // No @UseGuards at all
  @Query('q') query: string,
```

The throttle of 30 req/minute provides minimal protection — a scraper can extract 30 * unlimited_records per minute.

**Fix:** Add `@UseGuards(OptionalClerkAuthGuard)` at minimum, or require auth for non-aggregate search.

---

### F13: No authentication on trending and hashtag endpoints
**File:** `apps/api/src/modules/search/search.controller.ts`, lines 26-37
**Severity:** P1 — Abuse
**Category:** Missing Auth

`@Get('trending')` and `@Get('hashtag/:tag')` have no auth guards. While public endpoints may be intentional, combined with no rate limiting per-IP (throttle is global), they are scraping vectors.

---

## MEDIUM (P2) — Functional Bugs

### F14: Meilisearch `channels` index missing from search index map
**File:** `apps/api/src/modules/search/search.service.ts`, lines 169-172
**Severity:** P2 — Feature Gap
**Category:** Missing Mapping

The `indexMap` maps search types to Meilisearch index names but omits `channels`:

```typescript
const indexMap: Record<string, string> = {
  people: 'users', posts: 'posts', threads: 'threads',
  reels: 'reels', videos: 'videos', tags: 'hashtags',
  // Missing: channels: 'channels'
};
```

When Meilisearch IS available, channel searches always fall through to the slow Prisma path.

---

### F15: Meilisearch passes raw `limit` (not `safeLimit`) — unbounded Meilisearch results
**File:** `apps/api/src/modules/search/search.service.ts`, line 175
**Severity:** P2 — Data Leak
**Category:** Unbounded Query

```typescript
const result = await this.meilisearch.search(indexName, query, { limit });
// Should be: { limit: safeLimit }
```

---

### F16: Meilisearch bypasses Prisma visibility/removal filters
**File:** `apps/api/src/modules/search/search.service.ts`, lines 174-179
**Severity:** P2 — Content Leak
**Category:** Filter Bypass

When Meilisearch returns results (line 176), they are returned directly without any post-filtering for `isRemoved`, `visibility`, `isBanned`, etc. The Meilisearch index may contain removed or private content that was indexed before removal. The function returns raw Meilisearch hits as-is.

```typescript
if (result && result.hits.length > 0) {
  return { data: result.hits, meta: { hasMore: result.hits.length === limit, cursor: undefined } };
  // Raw hits — no isRemoved/visibility filtering
}
```

**Fix:** Either filter Meilisearch results through visibility checks, or ensure the search index is updated on content removal.

---

### F17: No DTO validation anywhere in search module
**File:** `apps/api/src/modules/search/search.controller.ts` (entire file)
**Severity:** P2 — Validation Bypass
**Category:** Missing Validation

The search controller uses inline `@Query()` parameters with no DTO class:
- No `@IsString()`, `@IsOptional()`, `@MaxLength()` validation
- No `@IsEnum()` for the `type` parameter — any string is accepted
- No `@IsInt()` / `@Min()` / `@Max()` for `limit`
- The `type` parameter accepts any string value; invalid types like `type=admin` silently fall through to the aggregate search path

**Fix:** Create `SearchQueryDto` with proper class-validator decorators.

---

### F18: No DTO validation in hashtags controller
**File:** `apps/api/src/modules/hashtags/hashtags.controller.ts` (entire file)
**Severity:** P2 — Validation Bypass
**Category:** Missing Validation

All parameters are inline `@Query()` with manual parseInt. No class-validator, no `@MaxLength()` on hashtag names, no `@IsString()` on query.

---

### F19: Hashtag `decrementCount` can produce negative counts
**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 311-318
**Severity:** P2 — Data Integrity
**Category:** Counter Race Condition

`decrementCount` uses `{ decrement: 1 }` without a floor check. If counts are already 0 (due to race conditions or bugs), they go negative. Negative hashtag counts would appear in trending/search rankings.

```typescript
data: { [field]: { decrement: 1 } },
// Can produce postsCount = -1
```

**Fix:** Use `$executeRaw` with `GREATEST(0, "postsCount" - 1)` or check current value first.

---

### F20: `getHashtagPosts` in search.service uses `tag.toLowerCase()` but hashtags may not be lowercased
**File:** `apps/api/src/modules/search/search.service.ts`, lines 434, 438
**Severity:** P2 — Data Mismatch
**Category:** Case Sensitivity Bug

`getHashtagPosts` lowercases the tag for both the hashtag lookup and the `has` filter, but the `HashtagsService.getPostsByHashtag` does NOT lowercase. This means the same hashtag query returns different results depending on which endpoint is called.

```typescript
// SearchService — lowercases
const hashtag = await this.prisma.hashtag.findUnique({ where: { name: tag.toLowerCase() } });
// HashtagsService — does NOT lowercase (line 207-210)
const hashtag = await this.prisma.hashtag.findUnique({ where: { name: hashtagName } });
```

---

### F21: `trending()` method limited to 500 posts — misses actual trending content
**File:** `apps/api/src/modules/search/search.service.ts`, lines 382-389
**Severity:** P2 — Functional
**Category:** Incomplete Results

The trending algorithm fetches only 500 recent posts to count hashtag frequency. On a platform with significant traffic, this is a tiny sample. A hashtag could be trending in posts 501-10000 but never appear in results.

```typescript
const recentPosts = await this.prisma.post.findMany({
  where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  take: 500, // Arbitrary cap — misses the rest
});
```

**Fix:** Use a `GROUP BY` aggregation query in SQL rather than loading posts and counting in-memory.

---

### F22: `trending()` only counts post hashtags — ignores threads, reels, videos
**File:** `apps/api/src/modules/search/search.service.ts`, lines 380-430
**Severity:** P2 — Incomplete Feature
**Category:** Partial Implementation

The trending calculation counts hashtags from posts only. Threads, reels, and videos with hashtags are ignored. A hashtag trending in reels would not appear as trending.

---

### F23: Channel search has no visibility or user state filtering
**File:** `apps/api/src/modules/search/search.service.ts`, lines 247-267, 355-366
**Severity:** P2 — Data Integrity
**Category:** Missing Filter

Channel search queries have no filtering at all beyond text matching. There's no `Channel.isRemoved` field in the schema, but the owning `User` could be banned/deactivated. Channels of banned users still appear in search.

---

### F24: `getSuggestions` has no input validation — empty query fetches all users/hashtags
**File:** `apps/api/src/modules/search/search.service.ts`, lines 562-582
**Severity:** P2 — Data Leak / DoS
**Category:** Missing Validation

`getSuggestions('')` (empty string) uses `startsWith: ''` which matches everything. Combined with no limit cap, this can return a large dataset. The controller (line 84-91) does not validate the query either.

```typescript
async getSuggestions(query: string, limit = 10) {
  // No validation on query — '' matches all
  // No cap on limit
```

---

### F25: `searchPosts`, `searchThreads`, `searchReels` accept raw uncapped `limit`
**File:** `apps/api/src/modules/search/search.service.ts`, lines 487, 505, 524
**Severity:** P2 — Unbounded Query
**Category:** Missing Limit Cap

These three dedicated search methods accept `limit` as a raw parameter with no capping:

```typescript
async searchPosts(query: string, userId?: string, cursor?: string, limit = 20) {
  const take = limit + 1; // If limit=100000, take=100001
```

Combined with F02 (string type from controller), the actual behavior is unpredictable.

---

### F26: `getExploreFeed` has no user-specific filtering
**File:** `apps/api/src/modules/search/search.service.ts`, lines 544-560
**Severity:** P2 — Content Quality
**Category:** Missing Feature

The explore feed returns the same posts for every user — no personalization, no block/mute filtering, no content the user has already seen excluded. It also does not accept a `userId` parameter.

---

### F27: Meilisearch `onModuleInit` only configures 3 of 6 indexes
**File:** `apps/api/src/modules/search/meilisearch.service.ts`, lines 51-78
**Severity:** P2 — Incomplete Setup
**Category:** Missing Configuration

The `onModuleInit` creates 6 indexes but only configures searchable/filterable attributes for `users`, `posts`, and `threads`. The `reels`, `videos`, and `hashtags` indexes have no configured searchable attributes, meaning Meilisearch would use default settings (search all fields).

```typescript
const indexes = ['users', 'posts', 'threads', 'reels', 'videos', 'hashtags'];
// Only configures: users, posts, threads
// Missing: reels, videos, hashtags
```

---

### F28: Meilisearch `search` silently returns `null` on errors — no logging
**File:** `apps/api/src/modules/search/meilisearch.service.ts`, lines 111-113
**Severity:** P2 — Observability
**Category:** Silent Failure

```typescript
} catch {
  return null; // No logging of the error
}
```

Search errors are silently swallowed. If Meilisearch is misconfigured or has errors, there's no way to know.

---

## LOW (P3) — Code Quality & Hardening

### F29: OG `renderHtml` has potential XSS in JavaScript context
**File:** `apps/api/src/modules/og/og.service.ts`, line 280
**Severity:** P3 — XSS (Low Risk)
**Category:** Output Encoding

The `safeUrl` is HTML-escaped but used inside a JavaScript string literal within a `<script>` tag. While `escapeHtml` converts `'` to `&#039;` (which does protect against single-quote breakout in JS), this is defense-by-accident. The proper approach is JavaScript-specific escaping for values inside `<script>` tags.

```typescript
var appUrl = 'mizanly://${safeUrl.replace(/https?:\/\/[^/]+/, '')}';
// safeUrl is HTML-escaped, not JS-escaped
```

---

### F30: `HashtagsService.getTrendingRaw` raw SQL `LIMIT` uses tagged template — safe but inflexible
**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 155-176
**Severity:** P3 — Info
**Category:** Code Quality

The `$queryRaw` tagged template literal properly parameterizes `${limit}`. This is safe (Prisma parameterizes tagged template literals). Documented here to confirm it was reviewed and is NOT a SQL injection.

---

### F31: `enrichPosts`/`enrichReels`/`enrichThreads` have `take: 50` — can miss enrichments
**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 326, 329, 346, 349, 404, 408
**Severity:** P3 — Data Integrity
**Category:** Hard-coded Limit

The enrichment queries use `take: 50` but the parent queries can return up to `limit + 1` items. If `limit > 49`, some items won't be enriched (userReaction and isSaved will be wrong).

```typescript
this.prisma.postReaction.findMany({
  where: { userId, postId: { in: postIds } },
  take: 50, // But postIds could have 51+ items
}),
```

---

### F32: Duplicate search endpoints — `search(type='posts')` vs `searchPosts()`
**File:** `apps/api/src/modules/search/search.service.ts` + `search.controller.ts`
**Severity:** P3 — Code Quality
**Category:** Redundant Code

The same functionality exists in two places:
- `search(query, 'posts', cursor)` via `GET /search?q=x&type=posts`
- `searchPosts(query, cursor)` via `GET /search/posts?q=x`

Both query the same data with the same filters but have slightly different limit handling and the aggregate endpoint lacks `userId` for personalization.

---

### F33: Meilisearch `addDocuments` doesn't check response status
**File:** `apps/api/src/modules/search/meilisearch.service.ts`, lines 119-131
**Severity:** P3 — Silent Failure
**Category:** Error Handling

```typescript
await fetch(`${this.host}/indexes/${indexName}/documents`, {
  method: 'POST', ...
});
// Response status not checked — 400/500 silently ignored
```

---

### F34: `OgService` uses `process.env.APP_URL` at module load time — not configurable
**File:** `apps/api/src/modules/og/og.service.ts`, line 5
**Severity:** P3 — Configuration
**Category:** Initialization

```typescript
const APP_URL = process.env.APP_URL || 'https://mizanly.com';
```

This is evaluated at module load time, not through NestJS `ConfigService`. In testing, `process.env.APP_URL` may not be set, and in deployment the value is frozen at startup.

---

### F35: Sitemap includes deactivated and banned user profiles
**File:** `apps/api/src/modules/og/og.service.ts`, lines 113-118
**Severity:** P2 — Privacy
**Category:** Information Disclosure

Users query in sitemap only filters `isPrivate: false`:

```typescript
this.prisma.user.findMany({
  where: { isPrivate: false },
  // Missing: isBanned: false, isDeactivated: false, isDeleted: false
});
```

Google would index profiles of banned and deactivated users.

---

### F36: `getFollowedHashtags` cursor pagination uses composite key — fragile
**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 379-398
**Severity:** P3 — Fragility
**Category:** API Design

The cursor is `hashtagId` but the pagination uses the composite key `userId_hashtagId`. If the cursor value doesn't match a valid follow record, the query silently returns results from the beginning instead of throwing.

---

### F37: Hashtag `unfollowHashtag` doesn't verify hashtag exists first
**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 374-377
**Severity:** P3 — Consistency
**Category:** Missing Validation

`followHashtag` checks if the hashtag exists before following, but `unfollowHashtag` does not check — it calls `deleteMany` which silently does nothing if the record doesn't exist. This is not a bug per se but is inconsistent.

---

### F38: Meilisearch `deleteDocument` path-injects `documentId` without encoding
**File:** `apps/api/src/modules/search/meilisearch.service.ts`, line 137
**Severity:** P3 — Injection
**Category:** Path Traversal

```typescript
await fetch(`${this.host}/indexes/${indexName}/documents/${documentId}`, {
  method: 'DELETE', ...
});
```

If `documentId` contains `/` or special characters, it could modify the request path. While document IDs are typically CUIDs, this should use `encodeURIComponent`.

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| **P0 — Ship Blocker** | 5 | safeLimit never used, @Query string type, user search leaks banned/deleted, OG exposes removed content, search-indexing processor missing |
| **P1 — High** | 8 | Reels/videos missing isRemoved, hashtag content leaks private posts, sitemap exposes private data, suggestedUsers unbounded, no auth on search |
| **P2 — Medium** | 14 | Missing DTOs, Meilisearch filter bypass, negative counters, explore feed not personalized, trending only counts posts |
| **P3 — Low** | 11 | XSS risk in OG JS context, silent failures, duplicate endpoints, enrichment limit cap, code quality |

## Files Audited

1. `apps/api/src/modules/search/search.service.ts` (583 lines)
2. `apps/api/src/modules/search/search.controller.ts` (92 lines)
3. `apps/api/src/modules/search/search.module.ts` (11 lines)
4. `apps/api/src/modules/search/meilisearch.service.ts` (175 lines)
5. `apps/api/src/modules/search/search.service.spec.ts` (899 lines)
6. `apps/api/src/modules/search/search.controller.spec.ts` (94 lines)
7. `apps/api/src/modules/search/search.service.edge.spec.ts` (95 lines)
8. `apps/api/src/modules/hashtags/hashtags.service.ts` (420 lines)
9. `apps/api/src/modules/hashtags/hashtags.controller.ts` (103 lines)
10. `apps/api/src/modules/hashtags/hashtags.module.ts` (12 lines)
11. `apps/api/src/modules/hashtags/hashtags.service.spec.ts` (259 lines)
12. `apps/api/src/modules/hashtags/hashtags.controller.spec.ts` (160 lines)
13. `apps/api/src/modules/hashtags/hashtags.service.edge.spec.ts` (80 lines)
14. `apps/api/src/modules/og/og.service.ts` (305 lines)
15. `apps/api/src/modules/og/og.controller.ts` (79 lines)
16. `apps/api/src/modules/og/og.module.ts` (9 lines)
17. `apps/api/src/modules/og/og.service.spec.ts` (199 lines)
18. `apps/api/src/modules/og/og.controller.spec.ts` (116 lines)
