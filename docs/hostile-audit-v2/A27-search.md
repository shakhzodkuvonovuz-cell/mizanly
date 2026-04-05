# A27: Search Module Audit

**Files reviewed:**
- `apps/api/src/modules/search/search.controller.ts` (111 lines)
- `apps/api/src/modules/search/search.service.ts` (715 lines)
- `apps/api/src/modules/search/dto/search-query.dto.ts` (49 lines)
- `apps/api/src/modules/search/meilisearch.service.ts` (214 lines)
- `apps/api/src/common/utils/excluded-users.ts` (75 lines)

**Auditor:** Claude Opus 4.6  
**Date:** 2026-04-05  
**Verdict:** 11 findings (2 HIGH, 5 MEDIUM, 3 LOW, 1 INFO)

---

## Findings

### [HIGH] A27-F01 — suggestedUsers does NOT exclude blocked/muted users

**File:** `search.service.ts` lines 546-578  
**Controller:** `search.controller.ts` line 46-48

The `suggestedUsers()` method filters out users the caller already follows and private/banned/deactivated/deleted users, but it never calls `getExcludedUserIds()`. Blocked and muted users will appear in follow suggestions.

This is a privacy violation: if User A blocks User B, User B should never appear in User A's suggested users list (and vice versa, since blocks are bidirectional in `getExcludedUserIds`).

**Evidence (service lines 562-577):**
```typescript
return this.prisma.user.findMany({
  where: {
    id: { notIn: [...myFollowingIds, userId] },
    isPrivate: false,
    isDeactivated: false,
    isBanned: false,
    isDeleted: false,
    // NO getExcludedUserIds() call — blocked/muted users leak through
  },
  ...
});
```

**Impact:** Blocked users appear as follow suggestions. Muted users appear as follow suggestions. Violates user expectation that blocking someone makes them invisible everywhere.

---

### [HIGH] A27-F02 — Meilisearch post-filter misses isDeactivated and isDeleted users

**File:** `search.service.ts` lines 188-199

When Meilisearch is available (first-page, typed queries), the post-filter checks `isRemoved`, `visibility`, `isBanned`, and excluded user IDs. But it does NOT check `isDeactivated` or `isDeleted`. Content from deactivated or soft-deleted users will appear in search results via the Meilisearch path, even though the Prisma fallback path correctly filters them.

**Evidence (lines 191-199):**
```typescript
filtered = filtered.filter((hit: Record<string, unknown>) => {
  const h = hit as Record<string, unknown>;
  if (h.isRemoved === true) return false;
  if (h.visibility && h.visibility !== 'PUBLIC') return false;
  if (h.isBanned === true) return false;
  // MISSING: h.isDeactivated, h.isDeleted
  const hitUserId = h.userId as string | undefined;
  if (hitUserId && excludedSet.has(hitUserId)) return false;
  return true;
});
```

**Impact:** Deactivated users' content visible in search. Soft-deleted users' content visible in search. Inconsistent behavior between Meilisearch path and Prisma fallback.

---

### [MEDIUM] A27-F03 — Trending hashtag SQL counts private/non-public posts

**File:** `search.service.ts` lines 459-480

The trending hashtag raw SQL aggregation scans `posts` and `threads` tables with `isRemoved = false` and `scheduledAt` filters, but does NOT filter by `visibility = 'PUBLIC'`. Hashtags from private posts and followers-only posts contribute to trending counts.

**Evidence (lines 460-467):**
```sql
SELECT unnest(hashtags) as tag, COUNT(*) as cnt
FROM "posts"
WHERE "createdAt" >= ${twentyFourHoursAgo}
  AND array_length(hashtags, 1) > 0
  AND ("scheduledAt" IS NULL OR "scheduledAt" <= NOW())
  AND "isRemoved" = false
-- MISSING: AND "visibility" = 'PUBLIC'
GROUP BY tag
```

Same issue on the threads subquery (lines 468-475): no `visibility` filter.

**Impact:** Hashtag counts inflated by non-public content. A hashtag used only in private posts could appear as "trending" to the public. Partial information leak about private content volume.

---

### [MEDIUM] A27-F04 — Trending hashtag SQL does not exclude banned/deactivated users' posts

**File:** `search.service.ts` lines 459-480

The trending SQL aggregation has no JOIN to the `users` table and thus cannot filter out posts from banned, deactivated, or deleted users. A banned user's posts (with `isRemoved = false` if not explicitly removed) still contribute to trending hashtag counts.

**Impact:** Banned/deactivated users' content influences public trending. Could be exploited for hashtag manipulation before ban takes effect.

---

### [MEDIUM] A27-F05 — People and tags search types have no cursor pagination

**File:** `search.service.ts` lines 429-451

When `type === 'people'` or `type === 'tags'`, the search returns results without cursor pagination metadata. The `people` query (line 430-444) uses `take: safeLimit` but no `cursor` parameter. The `tags` query (lines 445-451) likewise has no cursor.

Unlike the `posts`, `threads`, `reels`, `videos`, and `channels` types which all return `{ data, meta: { cursor, hasMore } }`, `people` and `tags` return raw results in the `SearchResults` format with no way to page through.

**Evidence (lines 429-451):**
```typescript
} else if (type === 'people') {
  results.people = await this.prisma.user.findMany({
    ...
    take: safeLimit,
    // NO cursor, NO hasMore, NO meta
    orderBy: { followers: { _count: 'desc' } },
  });
} else if (type === 'tags') {
  results.hashtags = await this.prisma.hashtag.findMany({
    ...
    take: safeLimit,
    // NO cursor, NO hasMore, NO meta
  });
}
return results; // Returns SearchResults, not { data, meta }
```

**Impact:** Users searching for people or hashtags cannot load more results beyond the first page. Inconsistent API response shape between types.

---

### [MEDIUM] A27-F06 — Meilisearch 'channels' index never created

**File:** `meilisearch.service.ts` line 55, `search.service.ts` line 183

The Meilisearch initialization creates 6 indexes: `users, posts, threads, reels, videos, hashtags`. But the search service maps `channels` type to a `channels` index (line 183). When a user searches with `type=channels` and Meilisearch is available, it will try to search an index that was never created.

**Evidence:**
- `meilisearch.service.ts` line 55: `const indexes = ['users', 'posts', 'threads', 'reels', 'videos', 'hashtags'];` -- no `channels`
- `search.service.ts` line 183: `channels: 'channels'` in `indexMap`

The circuit breaker likely catches the error and returns `null`, causing a silent fallback to Prisma. But this means channel searches are always slower via Prisma when Meilisearch is deployed.

**Impact:** Channel search silently degrades when Meilisearch is active. No `searchableAttributes` configured for channels even if index were created.

---

### [MEDIUM] A27-F07 — Meilisearch path has no cursor pagination support

**File:** `search.service.ts` lines 178, 186-201

The Meilisearch fast-path is only used when `!cursor` (line 178: `this.meilisearch.isAvailable() && type && !cursor`). For page 1 it uses Meilisearch, for page 2+ it falls back to Prisma. But the Meilisearch path returns `cursor: null` (line 201), so the client has no cursor to request page 2.

**Evidence (line 178):**
```typescript
if (this.meilisearch.isAvailable() && type && !cursor) {
```

And line 201:
```typescript
return { data: page, meta: { hasMore: filtered.length > safeLimit, cursor: null } };
```

**Impact:** When Meilisearch returns `hasMore: true`, the client has no cursor to fetch the next page. The `hasMore` flag is misleading -- it says there's more data but provides no way to get it. Client would need to re-request with a cursor it doesn't have.

---

### [LOW] A27-F08 — REEL_SEARCH_SELECT leaks internal 'status' field

**File:** `search.service.ts` line 66

The `REEL_SEARCH_SELECT` includes `status: true`. While the query filters for `status: 'READY'`, the field value is still returned in the API response. This leaks internal content lifecycle state to clients.

**Evidence (line 55-77):**
```typescript
const REEL_SEARCH_SELECT = {
  ...
  status: true,   // Leaks internal state (always 'READY' in results, but still exposed)
  ...
};
```

**Impact:** Minor information leak. Clients see internal status values. If filtering logic ever changes, non-READY statuses could be exposed.

---

### [LOW] A27-F09 — Explore feed endpoint uses raw @Query params without DTO validation

**File:** `search.controller.ts` lines 86-97

The `exploreFeed` endpoint uses `@Query('cursor')` and `@Query('limit')` directly instead of a DTO class. Unlike all other endpoints which use `SearchQueryDto` or `HashtagSearchDto` with class-validator decorators (`@MaxLength`, `@IsString`, `@IsNumberString`), explore accepts any string of any length for cursor.

**Evidence (lines 90-93):**
```typescript
exploreFeed(
  @Query('cursor') cursor?: string,   // No @MaxLength, no @IsString DTO
  @Query('limit') limit?: string,     // No @IsNumberString DTO
  @CurrentUser('id') userId?: string,
)
```

**Impact:** Oversized cursor strings (~MB) can be sent to Prisma. Prisma will reject invalid IDs, but the request still consumes resources parsing and transmitting the payload. Non-numeric limit strings are handled by the `parseInt || 20` fallback.

---

### [LOW] A27-F10 — getHashtagPosts limit is not user-configurable

**File:** `search.controller.ts` line 42, `search.service.ts` line 518

The controller calls `getHashtagPosts(tag, dto.cursor, undefined, userId)` with `undefined` for the limit parameter. The `HashtagSearchDto` has no `limit` field. Users cannot control page size for hashtag post listings -- it's always hardcoded to 20.

This is inconsistent with all other paginated endpoints that accept a user-provided limit (capped at 50).

**Impact:** Clients can't request smaller page sizes (e.g., 5 for preview) or larger page sizes (e.g., 50 for infinite scroll). API inconsistency.

---

### [INFO] A27-F11 — Aggregate search fires 7 parallel full-table ILIKE scans

**File:** `search.service.ts` lines 333-421

When `type` is not specified (aggregate mode), the service fires 7 `findMany` queries in parallel, each using `contains` (ILIKE `%query%`) across different tables. Without Meilisearch, this means 7 sequential full-table scans on PostgreSQL for every untyped search.

The code already has a comment acknowledging this (lines 325-329), and Meilisearch is the intended mitigation. However, the Meilisearch fast-path only activates when `type` is specified (line 178: `this.meilisearch.isAvailable() && type && !cursor`). Aggregate searches (no type) ALWAYS go through Prisma, even when Meilisearch is available.

**Evidence (line 178):**
```typescript
if (this.meilisearch.isAvailable() && type && !cursor) {
```

The `!type` case (aggregate) is never sent to Meilisearch.

**Impact:** Performance. Aggregate search is always slow (7 ILIKE scans) regardless of Meilisearch availability. At scale with large tables and no trigram indexes, each query could take 100ms+, making total response time 700ms+.

---

## Checklist Verification

### 1. Injection
- **SQL Injection:** PASS. All raw SQL uses `$queryRaw` tagged template literals (Prisma auto-parameterizes). No string concatenation in queries.
- **Regex Injection:** PASS. No regex construction from user input. All text search uses Prisma `contains` mode (ILIKE).
- **Meilisearch Injection:** PASS. Index names from hardcoded map. Query passed via `JSON.stringify` body. No filter strings constructed from user input in this module.

### 2. Privacy (blocked/muted filtering)
- **FAIL.** `suggestedUsers` does NOT filter blocked/muted users (F01).
- PASS for `search()`, `searchPosts()`, `searchThreads()`, `searchReels()`, `trending()`, `getHashtagPosts()`, `getExploreFeed()`, `getSuggestions()` -- all call `getExcludedUserIds`.

### 3. Pagination
- **PARTIAL FAIL.** `people` and `tags` search types have no cursor pagination (F05). Meilisearch path returns `cursor: null` even when `hasMore: true` (F07).
- PASS for `posts`, `threads`, `reels`, `videos`, `channels` types -- all have proper cursor + hasMore.

### 4. Rate limiting
- **PASS (marginal).** All endpoints have `@Throttle` except `suggestedUsers` (line 46), which falls back to the global 100/min limit. The global limit is adequate but looser than the explicit 30/min on other search endpoints.

### 5. Performance
- **CONCERN.** Aggregate search (no type) always fires 7 ILIKE full-table scans even when Meilisearch is available (F11). No trigram/GIN index optimization mentioned.
- PASS for typed queries -- Meilisearch fast-path with circuit breaker and 10s timeout.

### 6. Deleted content
- **PASS (Prisma path).** All Prisma queries filter `isRemoved: false` for posts/threads/reels/videos.
- **PARTIAL FAIL (Meilisearch path).** Meilisearch post-filter checks `isRemoved` but not `isDeactivated`/`isDeleted` on the user (F02).

### 7. Private content
- **PARTIAL FAIL.** Prisma queries correctly filter `visibility: 'PUBLIC'` and `scheduledAt`. But trending SQL does not filter by visibility (F03).
- PASS for scheduled posts -- all queries check `scheduledAt IS NULL OR scheduledAt <= NOW()`.

### 8. Suggestions (autocomplete)
- **PASS.** `getSuggestions()` (line 681-714) excludes blocked/muted users via `getExcludedUserIds`. Empty query returns empty results immediately. Limit capped at 20.

---

## Summary Table

| ID | Severity | Title | Line(s) |
|----|----------|-------|---------|
| F01 | HIGH | suggestedUsers does not exclude blocked/muted users | service:546-578 |
| F02 | HIGH | Meilisearch post-filter misses isDeactivated/isDeleted | service:188-199 |
| F03 | MEDIUM | Trending SQL counts private/non-public posts | service:459-480 |
| F04 | MEDIUM | Trending SQL does not exclude banned/deactivated users' posts | service:459-480 |
| F05 | MEDIUM | People and tags types have no cursor pagination | service:429-451 |
| F06 | MEDIUM | Meilisearch 'channels' index never created | meili:55, service:183 |
| F07 | MEDIUM | Meilisearch path returns null cursor with hasMore:true | service:178-201 |
| F08 | LOW | REEL_SEARCH_SELECT leaks internal status field | service:66 |
| F09 | LOW | Explore feed uses raw @Query without DTO validation | controller:86-97 |
| F10 | LOW | getHashtagPosts limit not user-configurable | controller:42, service:518 |
| F11 | INFO | Aggregate search always uses 7 ILIKE scans, skips Meilisearch | service:178,333-421 |
