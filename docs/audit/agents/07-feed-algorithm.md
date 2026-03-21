# Agent #7 — Feed/Algorithm/Recommendations Deep Audit

**Scope:** `apps/api/src/modules/feed/`, `apps/api/src/modules/recommendations/`, `apps/api/src/modules/embeddings/`
**Files audited:** 17 source files + 7 test files (24 total), every line read
**Date:** 2026-03-21

---

## Summary

| Severity | Count |
|----------|-------|
| P0 — Critical / Security | 6 |
| P1 — High | 12 |
| P2 — Medium | 18 |
| P3 — Low / Quality | 18 |
| **Total** | **54** |

---

## P0 — Critical / Security

### F-001: SQL Injection in `findSimilar` — filterTypes interpolated directly into query
**File:** `apps/api/src/modules/embeddings/embeddings.service.ts` **Line:** 256
**Category:** Security — SQL Injection
**Description:** `filterTypes` are string-interpolated directly into a `$queryRawUnsafe` SQL string without parameterization. An attacker who controls the `filterTypes` array could inject arbitrary SQL. Although the enum is typed as `EmbeddingContentType`, it originates from user-controlled input in the recommendations pipeline.
```ts
const typeFilter = filterTypes?.length
  ? `AND e2."contentType" IN (${filterTypes.map(t => `'${t}'`).join(',')})`
  : '';
// ...
const results = await this.prisma.$queryRawUnsafe<...>(
  `SELECT ... ${typeFilter} ORDER BY ...`,
  contentId, contentType, limit,
);
```
**Fix:** Use parameterized query with `$queryRaw` tagged template literal, or validate `filterTypes` against the enum before interpolation.

---

### F-002: SQL Injection in `findSimilarByVector` — filterTypes AND excludeIds interpolated
**File:** `apps/api/src/modules/embeddings/embeddings.service.ts` **Lines:** 289-293
**Category:** Security — SQL Injection
**Description:** Both `filterTypes` and `excludeIds` are string-interpolated directly into the SQL WHERE clause. The `excludeIds` array comes from user session data (viewed content IDs), meaning a crafted contentId with SQL could break out.
```ts
if (filterTypes?.length) {
  conditions.push(`"contentType" IN (${filterTypes.map(t => `'${t}'`).join(',')})`);
}
if (excludeIds?.length) {
  conditions.push(`"contentId" NOT IN (${excludeIds.map(id => `'${id}'`).join(',')})`);
}
```
**Fix:** Use parameterized `$queryRaw` with `ANY($N)` arrays for both filterTypes and excludeIds.

---

### F-003: Personalized feed has ZERO block/mute filtering
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 146-254
**Category:** Privacy / Safety
**Description:** `getPersonalizedFeed()` never queries the `Block` or `Mute` tables. A blocked or muted user's content will appear in the personalized feed pipeline. The entire method — including `getTrendingFeed()`, `getColdStartFeed()`, and `getIslamicEditorialPicks()` — has zero block/mute filtering. This means:
1. Content from users you blocked appears in your feed
2. Content from users who blocked YOU appears in their feed
3. Content from muted users is never filtered
**Fix:** Add `getExcludedUserIds(userId)` call (like `RecommendationsService` does) and add `userId: { notIn: excludedIds }` to all queries.

---

### F-004: Trending feed in `FeedService.getTrendingFeed()` has zero block/mute filtering
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 156-199
**Category:** Privacy / Safety
**Description:** The public trending feed `getTrendingFeed()` does not accept a userId and therefore never filters blocked/muted users. Even when called by authenticated users via the controller, no userId is passed. Blocked user content always appears.
```ts
async getTrendingFeed(cursor?: string, limit = 20) {
  // No userId parameter, no block/mute filtering
```
**Fix:** Add optional `userId` parameter and filter blocked/muted users when authenticated.

---

### F-005: Featured feed has zero block/mute filtering
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 204-228
**Category:** Privacy / Safety
**Description:** `getFeaturedFeed()` does not accept a userId and never filters blocked/muted users. Identical issue to F-004.

---

### F-006: Admin feature/unfeature endpoint has no admin guard
**File:** `apps/api/src/modules/feed/feed.controller.ts` **Lines:** 163-171
**Category:** Security — Missing Authorization
**Description:** The `PUT feed/admin/posts/:id/feature` endpoint only uses `ClerkAuthGuard` — any authenticated user can feature or unfeature any post. There is no admin role check.
```ts
@UseGuards(ClerkAuthGuard) // No admin guard!
@Put('admin/posts/:id/feature')
async featurePost(@Param('id') postId: string, @Body() body: { featured: boolean }) {
  return this.feed.featurePost(postId, body.featured);
}
```
**Fix:** Add an admin role guard or `@Roles('admin')` decorator.

---

## P1 — High

### F-007: `enhancedSearch` has misplaced `take: 50` inside OR clause — malformed Prisma query
**File:** `apps/api/src/modules/feed/feed-transparency.service.ts` **Lines:** 181-184
**Category:** Bug — Broken Query
**Description:** The `take: 50` from a previous linting pass was accidentally placed INSIDE the `OR` keyword mapping closure. It becomes an invalid property on each OR condition object. Prisma silently ignores unknown properties, so this doesn't crash, but the intended `take` limit on the block/mute queries (lines 157-163) is lost — it is literally on the wrong scope.
```ts
OR: keywords.map((kw) => ({
  content: { contains: kw, mode: 'insensitive' as const },
take: 50,       // <-- This is INSIDE the OR map closure! Wrong scope
})),
```
**Fix:** Remove `take: 50` from inside the OR map. The outer `take` variable (line 176) is correct.

---

### F-008: Trending feed pagination produces duplicates due to score-based reordering
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 156-199
**Category:** Bug — Pagination
**Description:** `getTrendingFeed()` fetches 200 posts ordered by `createdAt: 'desc'`, then re-sorts by engagement score, then paginates using cursor-based `id`. But the cursor is an `id` from the re-sorted list, and subsequent pages use `{ id: { lt: cursor } }` on `createdAt: 'desc'` ordering. Since score ordering differs from id ordering, users will see duplicates or miss posts across pages.
```ts
const posts = await this.prisma.post.findMany({
  orderBy: { createdAt: 'desc' },
  take: 200,      // Fetches 200 every time
  ...(cursor ? { id: { lt: cursor } } : {}),
});
// Then re-sorts by engagement score — cursor from previous page is meaningless
```
**Fix:** Either use offset-based pagination for score-sorted feeds, or sort by a deterministic column and paginate by it.

---

### F-009: Trending feed fetches 200 rows on every request — unbounded memory & DB load
**File:** `apps/api/src/modules/feed/feed.service.ts` **Line:** 170
**Category:** Performance
**Description:** Every call to `getTrendingFeed()` loads 200 posts into memory regardless of the requested `limit` (default 20). For 7 days of content on an active platform, this is a significant load. The in-memory scoring and sorting defeats the purpose of database pagination.
**Fix:** Use a database-level scoring (e.g., a computed column or materialized view), or cache scored results in Redis.

---

### F-010: Session signals stored in unbounded in-memory Map — memory leak
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 26-31
**Category:** Performance — Memory Leak
**Description:** `sessionSignals` is a `Map<string, ...>` that only creates new sessions when 30 min passes, but never removes old sessions. Over time with many users, this Map grows unboundedly and will consume all server memory. There is no eviction, no TTL, no maximum size.
```ts
private sessionSignals = new Map<string, {
  likedCategories: Map<string, number>;
  viewedIds: Set<string>;
  sessionStart: number;
  scrollDepth: number;
}>();
```
**Fix:** Use an LRU cache with a max size, or store session signals in Redis with TTL.

---

### F-011: `viewedIds` Set per user session grows unboundedly
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Line:** 61
**Category:** Performance — Memory Leak
**Description:** Each user session's `viewedIds` Set accumulates every viewed content ID. A power user scrolling for 29 minutes (just under session reset) could add thousands of IDs. This is multiplied across all concurrent users.
**Fix:** Cap `viewedIds` at a reasonable maximum (e.g., 1000).

---

### F-012: Nearby feed ignores actual coordinates — fake geolocation
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 297-334
**Category:** Feature — Non-functional
**Description:** `getNearbyContent()` accepts `lat`, `lng`, `radiusKm` but completely ignores them. It just returns all posts with a non-null `locationName`, sorted by recency. Any user in Tokyo sees posts from New York. The geo-parameters are decorative.
```ts
// Since we don't have lat/lng on posts, we search for posts with any locationName
// and sort by recency. In production, you'd use PostGIS or a geo index.
```
**Fix:** Either store lat/lng on posts and use Haversine/PostGIS, or remove the endpoint to avoid misleading API consumers.

---

### F-013: Embeddings controller uses double prefix `api/v1/embeddings`
**File:** `apps/api/src/modules/embeddings/embeddings.controller.ts` **Line:** 8
**Category:** Bug — Unreachable Endpoint
**Description:** The global prefix is `api/v1` (set in `main.ts:60`), and the controller uses `@Controller('api/v1/embeddings')`. This creates a double-prefixed route: `api/v1/api/v1/embeddings/backfill`. The endpoint is unreachable at its expected URL.
**Fix:** Change to `@Controller('embeddings')`.

---

### F-014: Embeddings backfill endpoint lacks admin guard — any user can trigger
**File:** `apps/api/src/modules/embeddings/embeddings.controller.ts` **Lines:** 15-21
**Category:** Security — Missing Authorization
**Description:** The `POST backfill` endpoint only requires `ClerkAuthGuard` (any authenticated user). A regular user can trigger a full-table scan backfill that will:
1. Process ALL content in the database
2. Make potentially thousands of Gemini API calls (cost)
3. Lock the `isRunning` flag, blocking legitimate backfills
The comment says "In production, this should be restricted to admin users" — it never was.
**Fix:** Add admin role guard.

---

### F-015: `getExcludedUserIds` in recommendations only gets one-directional blocks
**File:** `apps/api/src/modules/recommendations/recommendations.service.ts` **Lines:** 167-179
**Category:** Privacy / Safety
**Description:** The `getExcludedUserIds` method only queries blocks where `blockerId: userId` — i.e., users that the current user blocked. It does NOT exclude users who blocked the current user (`blockedId: userId`). This means content from users who blocked you will still appear in your recommendations.
```ts
this.prisma.block.findMany({ where: { blockerId: userId }, ... })
// Missing: OR: [{ blockerId: userId }, { blockedId: userId }]
```
**Fix:** Query both directions of blocks, like `enhancedSearch` already does (line 154 of feed-transparency.service.ts).

---

### F-016: `limit` query param not validated or capped — denial of service
**File:** `apps/api/src/modules/feed/feed.controller.ts` **Lines:** 83, 103, 128, 141, 153
**Category:** Security — DoS
**Description:** All feed endpoints accept `limit` as a string query parameter and parse it with `parseInt()` but never validate or cap the value. A user can pass `limit=999999999` and force the server to load enormous result sets.
```ts
limit ? parseInt(limit, 10) : 20  // No upper bound check
```
**Fix:** Cap limit at a reasonable maximum (e.g., `Math.min(Math.max(1, parsedLimit), 50)`).

---

### F-017: `limit` in recommendations controller is raw `number` from query — no validation
**File:** `apps/api/src/modules/recommendations/recommendations.controller.ts` **Lines:** 19, 31, 42, 53
**Category:** Security — DoS
**Description:** All recommendations endpoints accept `limit` as `@Query('limit') limit?: number` with no `@Max()` validator. NestJS will parse it as a number but a user can request `limit=100000`, potentially loading unbounded data.
**Fix:** Add DTO with `@IsInt() @Min(1) @Max(50)` validation.

---

### F-018: `session-signal` endpoint accepts unvalidated body — no DTO
**File:** `apps/api/src/modules/feed/feed.controller.ts` **Lines:** 108-116
**Category:** Validation — Missing DTO
**Description:** The `POST session-signal` endpoint uses an inline type `{ contentId, action, hashtags?, scrollPosition? }` instead of a validated DTO class. This bypasses all NestJS validation pipes. An attacker can send arbitrary data, including extremely large `hashtags` arrays or negative `scrollPosition` values.
```ts
@Body() body: { contentId: string; action: 'view' | 'like' | 'save' | 'share' | 'skip'; hashtags?: string[]; scrollPosition?: number }
```
**Fix:** Create a `TrackSessionSignalDto` class with proper decorators.

---

## P2 — Medium

### F-019: Personalized feed returns only IDs — not full content objects
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 188-253
**Category:** Architecture — Incomplete
**Description:** `getPersonalizedFeed()` returns `FeedItem[]` which only contains `{ id, type, score, reasons }`. The client would need to make a separate API call for each item to get actual content (post body, media, user info). This defeats the purpose of a feed endpoint. By contrast, the recommendations service returns full `POST_SELECT` / `REEL_SELECT` objects.
**Fix:** Hydrate feed items with full content before returning.

---

### F-020: Diversity injection can produce fewer items than requested
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 233-243
**Category:** Bug — UX
**Description:** The diversity filter skips same-author consecutive items. If a single author dominates the scored results, the diversified list may return significantly fewer items than `limit`. For example, if one author has the top 40 scores and limit is 20, only 2 items may survive.
```ts
if (author === lastAuthor && diversified.length < feedItems.length - 1) continue;
```
**Fix:** Keep skipped items in a queue and backfill from them when the diversified list is short.

---

### F-021: Same diversity injection logic duplicated in 3 places
**File:** `personalized-feed.service.ts:233-243`, `recommendations.service.ts:244-255`, `personalized-feed.service.ts:233`
**Category:** Code Quality — DRY
**Description:** The author-dedup diversity injection is copy-pasted across `PersonalizedFeedService`, `RecommendationsService.multiStageRank()`, and the getAuthorMap helper. All three have identical logic with identical bugs.
**Fix:** Extract to a shared utility function.

---

### F-022: Ramadan detection is hardcoded to 2026-2027 only
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 129-139
**Category:** Feature — Time Bomb
**Description:** `isRamadanPeriod()` only has hardcoded dates for 2026 and 2027. After March 2027, Islamic content will never get the Ramadan boost again. The comment says "compute from Hijri calendar" but it is never done.
```ts
if (year === 2026 && ...) return true;
if (year === 2027 && ...) return true;
return false; // Always false after 2027
```
**Fix:** Use an actual Hijri calendar library, or at minimum compute approximate dates for future years.

---

### F-023: Friday (Jummah) boost uses wrong day number
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Line:** 104
**Category:** Bug — Logic
**Description:** The code checks `dayOfWeek === 5` for Friday. In JavaScript's `Date.getDay()`, 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday. So `5` IS correct. However, this note is included because the prayer time windows use server timezone, which may differ wildly from the user's timezone. A user in Sydney (UTC+11) will get Fajr boost at 4-6 AM server time, which could be mid-afternoon in their local time.
**Fix:** Accept user timezone or coordinates and compute prayer windows per-user.

---

### F-024: Nearby content endpoint doesn't validate lat/lng
**File:** `apps/api/src/modules/feed/feed.controller.ts` **Lines:** 180-194
**Category:** Validation
**Description:** `lat` and `lng` are parsed with `parseFloat()` but never validated for range. Invalid values like `lat=999` or `lng=NaN` are silently passed through. Since the method ignores coordinates anyway (F-012), this doesn't cause a crash, but it's still a validation gap.
**Fix:** Validate `-90 <= lat <= 90` and `-180 <= lng <= 180`.

---

### F-025: `logInteraction` overwrites ALL fields even if not provided
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 53-63
**Category:** Bug — Data Loss
**Description:** When updating an existing interaction, the `update` call sets all fields from the DTO, including `undefined` values. Prisma treats `undefined` as "don't update", which is actually OK — but `data.viewed` could explicitly be `false`, overwriting a previously `true` value. More importantly, if the client only sends `{ liked: true }`, other fields like `viewDurationMs` will be set to `undefined` (no change) on update but the semantics are ambiguous.
**Fix:** Only spread defined fields: `Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined))`.

---

### F-026: `logInteraction` uses `findFirst` + `update` instead of `upsert` — race condition
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 49-80
**Category:** Bug — Race Condition
**Description:** Two concurrent requests for the same user+post could both see `findFirst` return null, and both attempt `create`, causing a unique constraint violation (if there is one) or duplicate records (if there isn't). The `FeedInteraction` model has no `@@unique([userId, postId])` constraint, so duplicates WILL be created.
**Fix:** Add `@@unique([userId, postId])` to schema and use `upsert`.

---

### F-027: FeedInteraction has no unique constraint on [userId, postId]
**File:** `apps/api/prisma/schema.prisma` **Lines:** 1533-1553
**Category:** Data Integrity
**Description:** The `FeedInteraction` model has indexes on `[userId, createdAt]` and `[postId]` but no unique constraint on `[userId, postId]`. This means duplicate interaction records per user-post pair can accumulate, wasting storage and skewing analytics.
**Fix:** Add `@@unique([userId, postId])`.

---

### F-028: `getUserInterests` scores by space, not by content topic
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 96-104
**Category:** Feature — Shallow
**Description:** `getUserInterests()` aggregates scores by `ContentSpace` (SAF, BAKRA, MAJLIS) not by actual content topic/hashtag. It tells you "user likes Bakra" but not "user likes cooking content". The return value is unused by any personalization logic — it's a dead feature.
**Fix:** Either aggregate by hashtag/topic, or remove the dead method.

---

### F-029: `buildContentFilterWhere` returns `Prisma.JsonObject` but is never called
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 133-150
**Category:** Dead Code
**Description:** `buildContentFilterWhere()` builds a filter object based on user content settings (hideMusic, strictnessLevel) but is never called by any feed, recommendation, or trending method. Users' content filter preferences are completely ignored.
**Fix:** Call this in `getTrendingFeed()`, `getFeaturedFeed()`, and `getNearbyContent()`.

---

### F-030: `getFrequentCreatorIds` loads 500 interaction objects with nested post relation
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 345-382
**Category:** Performance — N+1
**Description:** `getFrequentCreatorIds()` loads up to 500 FeedInteraction records each with a nested `post` relation (to get `post.userId`). This is an N+1 query pattern that will generate hundreds of JOINs. A raw SQL `GROUP BY` would be far more efficient.
**Fix:** Use `$queryRaw` with a `GROUP BY` on the join of feedInteraction and post.

---

### F-031: `suggestedPeople` friends-of-friends limited to `take: 50` on both hops
**File:** `apps/api/src/modules/recommendations/recommendations.service.ts` **Lines:** 354-368
**Category:** Algorithm — Truncation Bias
**Description:** Both the initial following query and the friends-of-friends query are limited to `take: 50`. For a user who follows 500+ people, only the first 50 followings are considered for recommendations, introducing significant bias toward whatever Prisma returns first (usually by insertion order).
**Fix:** Remove the `take: 50` on the first hop or increase it substantially, or use a more sophisticated sampling strategy.

---

### F-032: Suggested users (`FeedService.getSuggestedUsers`) doesn't exclude blocked/muted
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 248-285
**Category:** Privacy / Safety
**Description:** `getSuggestedUsers()` only excludes already-followed users and the user themselves. Blocked and muted users can appear as "suggested to follow."
**Fix:** Add block/mute filtering.

---

### F-033: `getFrequentCreators` doesn't filter blocked/muted users
**File:** `apps/api/src/modules/feed/feed.service.ts` **Lines:** 388-403
**Category:** Privacy / Safety
**Description:** Users you have blocked or muted can still appear in your "frequent creators" list.
**Fix:** Filter out blocked/muted IDs.

---

### F-034: Islamic editorial picks only consider first 10 hashtags from set of 29
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Line:** 298
**Category:** Algorithm — Truncation
**Description:** `ISLAMIC_HASHTAGS` has 29 entries, but `getIslamicEditorialPicks()` slices to only the first 10 (`islamicTagArray.slice(0, 10)`). This means Islamic content tagged with `halal`, `masjid`, `islamic`, `alhamdulillah`, `subhanallah`, `mashallah`, `bismillah` etc. (the last 19 entries) will NEVER appear as editorial picks.
**Fix:** Use all hashtags, or if there's a performance reason, randomly sample 10 from the full set.

---

### F-035: `enhancedSearch` block query is bidirectional but recommendations block query is unidirectional
**File:** `feed-transparency.service.ts:153-163` vs `recommendations.service.ts:167-175`
**Category:** Inconsistency
**Description:** `enhancedSearch` correctly queries blocks in BOTH directions: `OR: [{ blockerId: userId }, { blockedId: userId }]`. But `getExcludedUserIds` in recommendations only queries `{ blockerId: userId }`. This inconsistency means blocked users appear in recommendations but not in search.
**Fix:** Make `getExcludedUserIds` bidirectional.

---

### F-036: IVFFlat index requires training data to be effective
**File:** `apps/api/prisma/migrations/0002_pgvector_embeddings/migration.sql` **Line:** 28
**Category:** Performance
**Description:** The IVFFlat index with `lists = 100` requires the table to already have data when the index is created. If the migration runs on an empty table (which it does at setup), the index centroids are computed on zero rows, making the index useless until rebuilt. After adding data, a `REINDEX INDEX embeddings_vector_idx` is needed. HNSW would be a better choice as it works incrementally.
**Fix:** Document the need to rebuild the IVFFlat index after initial data load, or switch to HNSW.

---

## P3 — Low / Quality

### F-037: `logInteraction` DTO space enum uses uppercase but feed uses lowercase
**File:** `apps/api/src/modules/feed/dto/log-interaction.dto.ts` **Line:** 7
**Category:** Inconsistency
**Description:** The DTO validates space as `['SAF', 'BAKRA', 'MAJLIS', 'MINBAR']` (uppercase), but the personalized feed controller accepts `'saf' | 'bakra' | 'majlis'` (lowercase). There's no normalization between them. The `ContentSpace` enum in Prisma uses uppercase. If a client sends lowercase to `logInteraction`, validation fails.
**Fix:** Normalize to uppercase in the DTO or accept both cases.

---

### F-038: `logInteraction` DTO includes MINBAR space but personalized feed doesn't support it
**File:** `dto/log-interaction.dto.ts:7` vs `personalized-feed.service.ts:148`
**Category:** Inconsistency
**Description:** The DTO allows `MINBAR` as a space, but the personalized feed only supports `'saf' | 'bakra' | 'majlis'`. Interactions logged for MINBAR can never be used for personalization.
**Fix:** Add MINBAR support to personalized feed, or document the gap.

---

### F-039: `space` query parameter not validated in personalized feed endpoint
**File:** `apps/api/src/modules/feed/feed.controller.ts` **Line:** 95
**Category:** Validation
**Description:** `@Query('space') space: 'saf' | 'bakra' | 'majlis'` is TypeScript-only typing. At runtime, NestJS does not enforce this — any string is passed through. Passing `space=invalid` would hit the `spaceToContentType` switch with no default case, returning `undefined` and causing the pgvector query to fail.
**Fix:** Add a validation pipe or enum validation.

---

### F-040: `enhancedSearch` filters words <= 2 chars — breaks CJK/Arabic single-word searches
**File:** `apps/api/src/modules/feed/feed-transparency.service.ts` **Lines:** 142-145
**Category:** i18n
**Description:** `keywords.filter(w => w.length > 2)` removes words of 2 or fewer characters. For Arabic, many meaningful words are 2 characters (e.g., "في" = "in", "من" = "from"). This prevents Arabic users from searching for common terms.
**Fix:** Don't filter by character length for RTL scripts, or lower the threshold.

---

### F-041: `getUserInterestVector` only considers `FeedInteraction.postId` — not reels/threads
**File:** `apps/api/src/modules/embeddings/embeddings.service.ts` **Lines:** 316-354
**Category:** Feature — Incomplete
**Description:** The user interest vector is computed from `feedInteraction.postId`, which only maps to Post embeddings. Interactions with reels and threads are not factored in because `FeedInteraction` uses `postId` as the FK — even if the interacted content is a reel or thread, the embedding lookup only searches for posts.
**Fix:** Use the `space` field on `FeedInteraction` to determine the content type and look up the correct embedding table.

---

### F-042: Personalized feed `getContentMetadata` makes 3 sequential queries
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 450-485
**Category:** Performance
**Description:** `getContentMetadata()` and `getAuthorMap()` are called sequentially, each making a Prisma query. For the full personalized feed pipeline, this means:
1. `getUserInterestVector` — 2 queries
2. `findSimilarByVector` — 1 raw SQL query
3. `getContentMetadata` — 1 query
4. `getAuthorMap` — 1 query
Total: 5 sequential queries per feed request. These could be parallelized or combined.
**Fix:** Use `Promise.all()` where possible, or combine metadata + author in a single query.

---

### F-043: `RecommendationsService.multiStageRank` catches ALL errors and returns empty
**File:** `apps/api/src/modules/recommendations/recommendations.service.ts` **Lines:** 258-262
**Category:** Observability
**Description:** The entire multi-stage ranking pipeline is wrapped in a try-catch that logs a warning and returns `[]`. SQL injection errors, null pointer exceptions, and other bugs will be silently swallowed, making the feed silently degrade to fallback mode with no alerting.
**Fix:** Re-throw critical errors (e.g., SQL errors), only catch expected failures (e.g., no embeddings available).

---

### F-044: `suggestedThreads` has no controller endpoint
**File:** `apps/api/src/modules/recommendations/recommendations.service.ts` **Line:** 515
**Category:** Dead Code
**Description:** `RecommendationsService.suggestedThreads()` is implemented (with pgvector ranking and fallback) but has no corresponding endpoint in `RecommendationsController`. The method is unreachable from the API.
**Fix:** Add a `@Get('threads')` endpoint in the controller.

---

### F-045: `featurePost` body `{ featured: boolean }` has no DTO validation
**File:** `apps/api/src/modules/feed/feed.controller.ts` **Line:** 169
**Category:** Validation — Missing DTO
**Description:** The `featurePost` endpoint accepts `@Body() body: { featured: boolean }` without a DTO class. The validation pipe is bypassed — any payload is accepted.
**Fix:** Create a `FeaturePostDto` with `@IsBoolean()`.

---

### F-046: `dismiss` endpoint doesn't validate `contentType` parameter
**File:** `apps/api/src/modules/feed/feed.controller.ts` **Lines:** 30-38
**Category:** Validation
**Description:** The `contentType` path parameter accepts any string. There's no enum validation to restrict it to valid types (post, reel, thread, video).
**Fix:** Use `@IsEnum()` or a Pipes validation.

---

### F-047: `isRemoved: false` not checked in featured feed
**File:** `apps/api/src/modules/feed/feed.service.ts` **Line:** 207
**Category:** Bug
**Description:** Wait — actually `isRemoved: false` IS in the featured feed query (line 207). False alarm upon re-read. However, the featured feed does not filter `scheduledAt: null`, meaning scheduled-but-not-yet-published posts that are featured will appear.
**Fix:** Add `scheduledAt: null` to the featured feed where clause.

---

### F-048: Prayer time windows use server timezone — not user's location
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 97-119
**Category:** Feature — Inaccurate
**Description:** `new Date().getHours()` uses the server's timezone. A user in New York will get Islamic content boosted based on server time (likely UTC or a US data center timezone), not their local prayer times. This makes the prayer window boost meaningless for most users.
**Fix:** Accept user timezone or coordinates and calculate per-user.

---

### F-049: `getPersonalizedFeed` cursor is meaningless for score-sorted feeds
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 246-248
**Category:** Bug — Pagination
**Description:** The cursor returned from `getPersonalizedFeed()` is the last item's `id`. But on the next request, this cursor is not used to filter candidates (the method doesn't use it for the pgvector search). The cursor only affects the `getTrendingFeed()` fallback path. For the full personalized pipeline, pagination is broken — page 2 will return the same items as page 1.
**Fix:** Implement proper offset-based pagination or use the session's `viewedIds` to exclude previously served items.

---

### F-050: Embedding table has no FK to Post/Reel/Thread/Video — orphaned rows accumulate
**File:** `apps/api/prisma/schema.prisma` **Lines:** 3666-3678
**Category:** Data Integrity
**Description:** The `Embedding` model stores `contentId` as a plain `String` with no foreign key relation. When a post/reel/thread/video is deleted, its embedding row remains forever (orphaned). Over time, the embeddings table will accumulate stale data, wasting storage and degrading KNN search quality.
**Fix:** Add an `onDelete` cleanup hook in the delete logic of posts/reels/threads/videos, or add periodic cleanup jobs.

---

### F-051: Cold start feed randomization is biased
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` **Lines:** 281-285
**Category:** Algorithm
**Description:** The "shuffle" in `getColdStartFeed()` uses `Math.random() > 0.7` to decide whether to swap. This is not a proper shuffle — it creates a biased distribution where items near the end of the array are more likely to be swapped. The Fisher-Yates algorithm requires unconditional swapping.
**Fix:** Use a proper partial shuffle or interleave algorithm.

---

### F-052: `explainPost`/`explainThread` don't explain WHY post is in personalized feed
**File:** `apps/api/src/modules/feed/feed-transparency.service.ts` **Lines:** 45-134
**Category:** Feature — Shallow
**Description:** The transparency explanations are generic (follows author, popular, has hashtags, matches interests). They don't surface the actual personalization signals — similarity score, session boost, Islamic boost, recency score. The personalized feed pipeline calculates rich `reasons[]` arrays, but the transparency service doesn't use them.
**Fix:** Pass the reasons from the personalized feed pipeline to the transparency response.

---

### F-053: Test coverage gaps — no tests for block/mute filtering in feeds
**Category:** Test Quality
**Description:** Tests for `PersonalizedFeedService` don't test block/mute filtering (because the feature is missing, F-003). Tests for `FeedService.getTrendingFeed()` don't exist at all. Tests for `getNearbyContent` don't verify that coordinates are used (because they aren't, F-012). The test suite provides false confidence.

---

### F-054: `Throttle` only on some feed endpoints — inconsistent rate limiting
**File:** `apps/api/src/modules/feed/feed.controller.ts`
**Category:** Security
**Description:** `@Throttle` is only applied to `trending`, `featured`, and `suggested-users` endpoints. The `personalized`, `session-signal`, `nearby`, `interaction`, `dismiss`, `explain/*`, and `search/enhanced` endpoints rely only on the global throttle (100/min), which is too generous for expensive operations like personalized feed (which runs 5+ queries) or session-signal (which writes to memory).
**Fix:** Add specific `@Throttle` decorators to all feed endpoints.

---

## Cross-Reference Summary

| Finding | Previous Audit #7 Reference | Status |
|---------|---------------------------|--------|
| SQL injection in embeddings | Previously reported | Still present, with detailed code paths |
| Personalized feed ignores blocks | Previously reported | Still present, zero block/mute filtering |
| Pagination duplicates in trending/for-you | Previously reported | Still present, root cause identified |
| Session signals memory leak | New finding | |
| Admin endpoint unprotected | New finding | |
| Enhanced search malformed query | New finding | |
| Nearby feed fake geolocation | New finding | |
| Embeddings double prefix | New finding | |
| Unidirectional block in recommendations | New finding | |

---

## Recommended Fix Priority

1. **F-001, F-002**: SQL injection in embeddings — parameterize all raw queries
2. **F-003, F-004, F-005**: Add block/mute filtering to ALL feed methods
3. **F-006, F-014**: Add admin guards to admin endpoints
4. **F-007**: Fix misplaced `take: 50` in enhancedSearch
5. **F-008, F-049**: Fix pagination for score-sorted feeds
6. **F-010**: Replace in-memory session Map with Redis + TTL
7. **F-013**: Fix double prefix on embeddings controller
8. **F-015**: Make block queries bidirectional in recommendations
9. **F-016, F-017, F-018**: Add limit caps and DTO validation
10. **F-026, F-027**: Add upsert + unique constraint for FeedInteraction
