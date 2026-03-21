# Agent #21 — Prisma Query Performance Audit

**Scope:** All 87 service files in `apps/api/src/modules/**/*.service.ts`
**Date:** 2026-03-21
**Total Findings:** 47

---

## CRITICAL (P0) — 5 findings

### 1. SQL Injection in `findSimilar` via string interpolation
- **File:** `apps/api/src/modules/embeddings/embeddings.service.ts`
- **Lines:** 255-272
- **Category:** SQL Injection / Raw Query
- **Severity:** P0 CRITICAL
- **Description:** `filterTypes` array values are interpolated directly into a `$queryRawUnsafe` SQL string without parameterization. The `filterTypes` come from `EmbeddingContentType` enum values which are internal, but the pattern is dangerous — any future caller passing user input would create a SQL injection vector.
- **Code:**
  ```ts
  const typeFilter = filterTypes?.length
    ? `AND e2."contentType" IN (${filterTypes.map(t => `'${t}'`).join(',')})`
    : '';
  // ...used in $queryRawUnsafe
  ```
- **Fix:** Use parameterized `$queryRaw` with `Prisma.sql` tagged template or `Prisma.join()` for the IN clause.

### 2. SQL Injection in `findSimilarByVector` via string interpolation of excludeIds
- **File:** `apps/api/src/modules/embeddings/embeddings.service.ts`
- **Lines:** 280-311
- **Category:** SQL Injection / Raw Query
- **Severity:** P0 CRITICAL
- **Description:** Both `filterTypes` AND `excludeIds` arrays are string-interpolated into `$queryRawUnsafe`. The `excludeIds` come from user session data (session-viewed content IDs), making this a real injection vector. An attacker who can control a contentId (e.g., by creating content with a crafted ID) could inject SQL.
- **Code:**
  ```ts
  conditions.push(`"contentId" NOT IN (${excludeIds.map(id => `'${id}'`).join(',')})`);
  // ...used in $queryRawUnsafe
  ```
- **Fix:** Use parameterized queries with `ANY($N)` array syntax instead of string interpolation.

### 3. No pgvector index for KNN search — full table scan on every feed load
- **File:** `apps/api/prisma/schema.prisma`
- **Lines:** 3666-3678
- **Category:** Missing Index / Performance
- **Severity:** P0 CRITICAL
- **Description:** The `Embedding` model has `@@index([contentType])` but NO vector index (IVFFlat or HNSW) on the `vector` column. Every `ORDER BY vector <=> query_vector` performs a full sequential scan of the entire embeddings table. At scale (100K+ embeddings), this will take seconds per query and make the personalized feed unusable.
- **Fix:** Add `CREATE INDEX embeddings_vector_idx ON embeddings USING hnsw (vector vector_cosine_ops)` via a raw migration. Prisma's `Unsupported` type cannot express this natively.

### 4. Trending/For-You feeds fetch 200 rows then sort in JS — O(n log n) in application layer
- **File:** `apps/api/src/modules/posts/posts.service.ts` (lines 113-125), `apps/api/src/modules/threads/threads.service.ts` (lines 159-164), `apps/api/src/modules/reels/reels.service.ts` (lines 218-223), `apps/api/src/modules/feed/feed.service.ts` (lines 159-171)
- **Category:** Application-layer sorting / Performance
- **Severity:** P0 HIGH
- **Description:** Every "for you" and "trending" feed variant fetches `take: 200` rows ordered by `createdAt DESC`, then scores them in JavaScript and re-sorts. This means:
  1. The DB sorts by createdAt (not by what the user wants)
  2. The server materializes 200 full post objects with user relations
  3. JS sorts them again by engagement score
  4. Only 20 are returned, wasting 90% of the work
  At scale with concurrent users, this creates unnecessary DB and memory pressure. The scoring should happen in SQL (computed column or raw query) so the DB can do the sort and only return `limit` rows.
- **Fix:** Move engagement scoring into a SQL expression (e.g., `ORDER BY (likesCount * 3 + commentsCount * 5 + ...) / POWER(EXTRACT(EPOCH FROM NOW() - "createdAt") / 3600, 1.5) DESC LIMIT 20`).

### 5. GDPR data export fetches ALL user content without limits — OOM risk
- **File:** `apps/api/src/modules/users/users.service.ts`
- **Lines:** 115-170
- **Category:** Missing Pagination / OOM
- **Severity:** P0 HIGH
- **Description:** `exportData()` runs 11 parallel `findMany` queries with NO `take` limit. A power user with 100K posts, 500K messages, and 1M likes will cause the server to load all records into memory simultaneously, likely triggering an OOM crash. The comment says "GDPR requires ALL data — no take limits" but this should be streamed or batched, not loaded into a single JSON response.
- **Code:**
  ```ts
  this.prisma.post.findMany({ where: { userId, isRemoved: false }, ... }),
  this.prisma.comment.findMany({ where: { userId, isRemoved: false }, ... }),
  this.prisma.message.findMany({ where: { senderId: userId }, ... }),
  // ... 8 more unbounded queries, all in Promise.all
  ```
- **Fix:** Either (a) paginate into a streaming response, (b) generate a downloadable file via a background job, or (c) at minimum add a hard cap (e.g., `take: 50000`) per entity type.

---

## HIGH (P1) — 12 findings

### 6. N+1 query pattern in embedding backfill pipeline
- **File:** `apps/api/src/modules/embeddings/embedding-pipeline.service.ts`
- **Lines:** 59-91
- **Category:** N+1 Query
- **Severity:** P1
- **Description:** `backfillPosts()` fetches post IDs in batches of 20, then calls `this.embeddings.embedPost(post.id)` in a loop. Each `embedPost` call does its own `prisma.post.findUnique` to re-fetch the post data, resulting in N+1 queries (20 IDs fetched, then 20 individual findUnique calls). Same pattern in `backfillReels`, `backfillThreads`, `backfillVideos`.
- **Fix:** Fetch full post data in the batch query and pass it to the embedding function instead of just IDs.

### 7. Personalized feed makes 5 sequential DB roundtrips per request
- **File:** `apps/api/src/modules/feed/personalized-feed.service.ts`
- **Lines:** 146-253
- **Category:** Sequential Queries / Latency
- **Severity:** P1
- **Description:** `getPersonalizedFeed()` makes these serial calls:
  1. `feedInteraction.count` (cold-start check)
  2. `getUserInterestVector` (fetches interactions + raw SQL)
  3. `findSimilarByVector` (pgvector KNN)
  4. `getContentMetadata` (fetch post/reel/thread data for 500 candidates)
  5. `getAuthorMap` (fetch userId for diversity injection)

  Steps 4 and 5 could be combined into a single query that fetches both metadata and userId. Steps 1 and 2 could be parallelized.
- **Fix:** Combine getContentMetadata + getAuthorMap into a single query. Parallelize the cold-start check with the interest vector computation.

### 8. Duplicate queries for blocks/mutes in every feed method
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 99-106, 163-173, 330-342, 372-384
- **Category:** Redundant Queries
- **Severity:** P1
- **Description:** Every feed variant (following, for-you, chronological, favorites) independently queries `block.findMany` and `mute.findMany`. A user switching between feed tabs causes 2 additional queries per tab switch. The blocks/mutes should be cached at the request level or fetched once per request.
- **Fix:** Extract a `getExcludedUserIds(userId)` helper (as threads.service.ts does) and cache the result for the duration of the request using a request-scoped provider or simple in-method memoization.

### 9. Recommendations service makes 3 separate queries for the same content IDs
- **File:** `apps/api/src/modules/recommendations/recommendations.service.ts`
- **Lines:** 265-323
- **Category:** Redundant Queries
- **Severity:** P1
- **Description:** `multiStageRank()` calls `getEngagementScores()` (fetches posts by ID with engagement fields) and then `getAuthorMap()` (fetches the same posts by ID but only `userId`). These could be a single query fetching both sets of fields.
- **Fix:** Merge `getEngagementScores` and `getAuthorMap` into a single method that returns both engagement data and userId.

### 10. Search aggregate query runs 7 parallel full-text scans
- **File:** `apps/api/src/modules/search/search.service.ts`
- **Lines:** 294-375
- **Category:** Sequential Full-Table Scans
- **Severity:** P1
- **Description:** When no `type` is specified, the aggregate search runs 7 separate `findMany` queries (users, threads, posts, reels, videos, channels, hashtags) each using `{ contains: query, mode: 'insensitive' }` which translates to `ILIKE '%query%'` — a full table scan on every table. With no Meilisearch (which is the common case per credential status), every search request scans 7 tables.
- **Fix:** (a) Ensure Meilisearch is deployed for production search, (b) add GIN trigram indexes (`pg_trgm`) on content/title/caption fields, (c) use `startsWith` instead of `contains` for autocomplete.

### 11. `suggestedUsers` in search.service.ts fetches ALL following without limit
- **File:** `apps/api/src/modules/search/search.service.ts`
- **Lines:** 457-461
- **Category:** Missing Pagination
- **Severity:** P1
- **Description:** `suggestedUsers()` fetches `this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })` with NO `take` limit. A user following 50K accounts would load all 50K rows into memory just to build an exclusion list.
- **Fix:** Add `take: 5000` or use a subquery approach where the exclusion is done in SQL.

### 12. `getFrequentCreatorIds` loads 500 interactions with full post relations
- **File:** `apps/api/src/modules/feed/feed.service.ts`
- **Lines:** 340-383
- **Category:** Over-fetching / N+1
- **Severity:** P1
- **Description:** `getFrequentCreatorIds()` fetches 500 `FeedInteraction` records with `post: { select: { userId: true } }` included. This joins to the Post table for each interaction. The entire purpose is just to count interactions per creator — this could be done with a `groupBy` or raw SQL aggregation instead of loading 500 objects and counting in JS.
- **Fix:** Use `prisma.feedInteraction.groupBy({ by: ['postId'], _count: true, ... })` then look up post authors, or use a single raw SQL query with a JOIN and GROUP BY.

### 13. `getAudienceDemographics` fetches 1000 followers with nested user data
- **File:** `apps/api/src/modules/creator/creator.service.ts`
- **Lines:** 130-149
- **Category:** Over-fetching
- **Severity:** P1
- **Description:** Fetches 1000 follow records with nested `follower.location` just to count locations. This could be done with a `groupBy` on the User table joined through Follow, avoiding loading 1000 full user objects.
- **Fix:** Use a raw SQL query: `SELECT u.location, COUNT(*) FROM "Follow" f JOIN "User" u ON f."followerId" = u.id WHERE f."followingId" = $1 GROUP BY u.location ORDER BY COUNT(*) DESC LIMIT 10`.

### 14. Trending hashtags in search.service fetches 500 posts to count hashtags in JS
- **File:** `apps/api/src/modules/search/search.service.ts`
- **Lines:** 380-414
- **Category:** Application-layer aggregation
- **Severity:** P1
- **Description:** `trending()` fetches 500 recent posts with their `hashtags` arrays, then iterates in JS to count frequency. This could be done in a single SQL query using `unnest(hashtags)` and `GROUP BY`.
- **Fix:** Use raw SQL: `SELECT unnest(hashtags) as tag, COUNT(*) as freq FROM "Post" WHERE "createdAt" > NOW() - INTERVAL '24 hours' GROUP BY tag ORDER BY freq DESC LIMIT 20`.

### 15. `getEmbeddedIds` loads ALL existing embedding IDs into a Set in memory
- **File:** `apps/api/src/modules/embeddings/embedding-pipeline.service.ts`
- **Lines:** 51-57
- **Category:** Unbounded Query / Memory
- **Severity:** P1
- **Description:** `getEmbeddedIds()` uses `$queryRawUnsafe` to `SELECT "contentId" FROM embeddings WHERE "contentType" = $1` with no limit. With 1M embeddings, this loads 1M strings into a JavaScript Set. This runs 4 times (once per content type) during backfill.
- **Fix:** Instead of pre-loading all IDs, use a NOT EXISTS subquery in the backfill query itself: `WHERE NOT EXISTS (SELECT 1 FROM embeddings WHERE "contentId" = post.id AND "contentType" = 'POST')`.

### 16. Chat folder reorder does N individual updates instead of batch
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`
- **Lines:** 157-161
- **Category:** N+1 Write
- **Severity:** P1
- **Description:** `reorderChatFolders()` uses `Promise.all` to fire N individual `updateMany` queries (one per folder). With 10 folders, this is 10 DB roundtrips. Should use a single transaction with bulk update or a raw SQL `CASE WHEN` update.
- **Fix:** Wrap in `$transaction` and use a single raw SQL: `UPDATE "ChatFolder" SET position = CASE id WHEN $1 THEN 0 WHEN $2 THEN 1 ... END WHERE "userId" = $userId`.

### 17. `logInteraction` does findFirst + conditional update/create instead of upsert
- **File:** `apps/api/src/modules/feed/feed.service.ts`
- **Lines:** 47-81
- **Category:** Race Condition / Extra Query
- **Severity:** P1
- **Description:** `logInteraction()` first does `feedInteraction.findFirst({ where: { userId, postId } })`, then conditionally creates or updates. This is a classic read-then-write race condition — two concurrent views of the same post could both read "no existing" and both try to create, causing a P2002 error. Also, it's 2 queries when `upsert` would be 1.
- **Fix:** Use `prisma.feedInteraction.upsert({ where: { userId_postId: { userId, postId } }, ... })` if a compound unique exists, or add one.

---

## MEDIUM (P2) — 18 findings

### 18. For-You feed cursor is createdAt timestamp — produces duplicates after re-scoring
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 137-150
- **Category:** Pagination Bug
- **Severity:** P2
- **Description:** The for-you feed uses `createdAt.toISOString()` as cursor. After scoring and re-sorting by engagement, the createdAt cursor doesn't correspond to the engagement-sorted position. Users scrolling will see duplicate posts or miss posts entirely because the cursor skips based on time, not score rank.
- **Fix:** Use a score+id based cursor, or cache the scored feed and paginate by offset within the cached result.

### 19. Same pagination bug in threads for-you feed
- **File:** `apps/api/src/modules/threads/threads.service.ts`
- **Lines:** 175-190
- **Category:** Pagination Bug
- **Severity:** P2
- **Description:** Same issue as #18 — `createdAt` cursor after engagement re-sorting causes duplicates/gaps.

### 20. Same pagination bug in reels feed
- **File:** `apps/api/src/modules/reels/reels.service.ts`
- **Lines:** 237-238
- **Category:** Pagination Bug
- **Severity:** P2
- **Description:** Same issue as #18 — `createdAt` cursor after engagement re-sorting.

### 21. `getNearbyContent` ignores lat/lng entirely — returns all posts with any locationName
- **File:** `apps/api/src/modules/feed/feed.service.ts`
- **Lines:** 297-334
- **Category:** Feature Not Implemented / Waste
- **Severity:** P2
- **Description:** `getNearbyContent` accepts `lat`, `lng`, `radiusKm` but the actual query just filters by `locationName: { not: null }` — no geo filtering whatsoever. This returns posts from any location worldwide, ordered by recency. The comment says "In production, you'd use PostGIS" but this is misleading — it implies the nearby feed works.
- **Fix:** Either implement Haversine-based filtering (as mosques service does) or clearly mark endpoint as stub.

### 22. `getDismissedIds` has no take limit
- **File:** `apps/api/src/modules/feed/feed.service.ts`
- **Lines:** 91-94
- **Category:** Missing Pagination
- **Severity:** P2
- **Description:** `getDismissedIds()` fetches all dismissed content IDs for a user without any limit. A user who dismisses thousands of items over time would load all IDs into memory.
- **Fix:** Add `take: 5000` or use time-based pruning.

### 23. `getFollowedHashtags` does two queries when one would suffice
- **File:** `apps/api/src/modules/hashtags/hashtags.service.ts`
- **Lines:** 379-398
- **Category:** Redundant Queries
- **Severity:** P2
- **Description:** First fetches `hashtagFollow` records, extracts IDs, then does a second `hashtag.findMany({ where: { id: { in: hashtagIds } } })`. This could be a single query using `include: { hashtag: { select: ... } }` on the hashtagFollow query.
- **Fix:** Add `include: { hashtag: true }` to the initial findMany.

### 24. enrichPosts/enrichReels/enrichThreads pattern duplicated across 4 services
- **File:** `apps/api/src/modules/hashtags/hashtags.service.ts` (lines 321-418), `apps/api/src/modules/posts/posts.service.ts` (lines 413-435), `apps/api/src/modules/reels/reels.service.ts` (lines 249-265), `apps/api/src/modules/videos/videos.service.ts` (lines 83-107)
- **Category:** Code Duplication
- **Severity:** P2
- **Description:** The "enrich with user reaction/saved status" pattern is copy-pasted across 4 services with slight variations. Each independently queries `postReaction/reelReaction/videoReaction` and `savedPost/reelInteraction/videoBookmark`. Should be a shared utility.
- **Fix:** Extract into a shared `EnrichmentService` or utility functions.

### 25. Stories feed loads ALL stories from ALL followed users then groups in JS
- **File:** `apps/api/src/modules/stories/stories.service.ts`
- **Lines:** 51-107
- **Category:** Over-fetching
- **Severity:** P2
- **Description:** `getFeedStories()` fetches up to 100 stories from all followed users (capped at 50 follows), then groups by user in JS, then checks which are viewed by querying `storyView.findMany`. At scale, this loads stories + views for the entire social graph on every feed load.
- **Fix:** Use a SQL query that groups stories by user and checks view status in a single query, or cache the story feed.

### 26. `getUserInterestVector` always runs even when embeddings are disabled
- **File:** `apps/api/src/modules/embeddings/embeddings.service.ts`
- **Lines:** 316-354
- **Category:** Unnecessary Query
- **Severity:** P2
- **Description:** `getUserInterestVector()` queries `feedInteraction.findMany` and then `$queryRawUnsafe` on the embeddings table even when `GEMINI_API_KEY` is not set and the embeddings table is empty. This wastes a DB roundtrip for every personalized feed request when embeddings are disabled.
- **Fix:** Check `this.apiAvailable` or add a quick `count` check before running the full query.

### 27. Blended feed makes two separate queries that could be unified
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 265-327
- **Category:** Redundant Queries
- **Severity:** P2
- **Description:** `getBlendedFeed()` makes two separate `post.findMany` queries (one for following, one for trending with `take: 200`), then interleaves them in JS. The trending query fetches 200 posts just to take ~10.
- **Fix:** Use a single UNION query or reduce the trending fetch to `take: halfLimit * 3` instead of 200.

### 28. `getProducts` and similar listing methods use cursor on `id` with `lt` — unreliable ordering
- **File:** `apps/api/src/modules/commerce/commerce.service.ts`
- **Lines:** 26-42
- **Category:** Incorrect Cursor Pagination
- **Severity:** P2
- **Description:** `getProducts()` orders by `createdAt: 'desc'` but uses cursor `where.id = { lt: cursor }`. Since the cursor is the last item's `id` and IDs are CUIDs/UUIDs (not monotonically related to creation time), the `id < cursor` filter doesn't correlate with `createdAt DESC` ordering. Items will be skipped or duplicated.
- **Fix:** Use Prisma's native cursor pagination: `cursor: { id: cursor }, skip: 1` (as used in other services), or use `createdAt` as the cursor field.

### 29. Same cursor pagination bug in `getBusinesses`
- **File:** `apps/api/src/modules/commerce/commerce.service.ts`
- **Lines:** 185-199
- **Category:** Incorrect Cursor Pagination
- **Severity:** P2
- **Description:** Orders by `rating: 'desc'` but cursors by `id < cursor`. Same issue as #28.

### 30. Same cursor pagination bug in multiple community.service.ts methods
- **File:** `apps/api/src/modules/community/community.service.ts`
- **Lines:** 17-29, 81-93, 109-116, 139-151, 165-177
- **Category:** Incorrect Cursor Pagination
- **Severity:** P2
- **Description:** `getBoards()`, `getStudyCircles()`, `getFatwaQuestions()`, `getOpportunities()`, `getEvents()` all use `where.id = { lt: cursor }` but order by different fields (membersCount, createdAt, startDate). Cursor doesn't match sort order.

### 31. `getForumThreads` uses cursor `{ lt: cursor }` but orders by `[isPinned, lastReplyAt]`
- **File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
- **Lines:** 20-33
- **Category:** Incorrect Cursor Pagination
- **Severity:** P2
- **Description:** Forum threads are ordered by `isPinned DESC, lastReplyAt DESC` but cursor is `id < cursor`. This will produce incorrect pagination since pinned items appear first regardless of ID.

### 32. Admin `getReports` uses createdAt cursor but doesn't use Prisma cursor pagination
- **File:** `apps/api/src/modules/admin/admin.service.ts`
- **Lines:** 23-63
- **Category:** Incorrect Cursor Pagination
- **Severity:** P2
- **Description:** Uses `where.createdAt = { lt: new Date(cursor) }` which has precision issues (multiple reports at the same millisecond). Should use `cursor: { id: cursor }, skip: 1`.

### 33. Communities list uses createdAt cursor with ISO string parsing
- **File:** `apps/api/src/modules/communities/communities.service.ts`
- **Lines:** 144-146
- **Category:** Cursor Precision
- **Severity:** P2
- **Description:** `where.createdAt = { lt: new Date(cursor) }` — if multiple communities are created in the same millisecond, some will be skipped.

### 34. `suggestedPeople` in recommendations.service calls `getExcludedUserIds` twice for unauthenticated path
- **File:** `apps/api/src/modules/recommendations/recommendations.service.ts`
- **Lines:** 327-399
- **Category:** Redundant Queries
- **Severity:** P2
- **Description:** The `suggestedPeople()` method calls `getExcludedUserIds(userId)` to get blocks/mutes, then also uses `excludedIds` in the user query. But the `friends-of-friends` query at line 361-368 already includes `followingId: { notIn: [...myFollowingIds, userId, ...excludedIds] }` — so the exclusion is applied twice (once in the fof query, once in the final user fetch at line 382).

### 35. `findMany` without `orderBy` in `getReceivedGifts`
- **File:** `apps/api/src/modules/gifts/gifts.service.ts`
- **Lines:** 251-268
- **Category:** Non-deterministic Results
- **Severity:** P2 LOW
- **Description:** `giftRecord.groupBy` inherently doesn't have ordering issues, but the enrichment and sort happen in JS. This is fine for a `groupBy` but worth noting the pattern.

---

## LOW (P3) — 12 findings

### 36. Session signals stored in process memory — lost on restart, not shared across instances
- **File:** `apps/api/src/modules/feed/personalized-feed.service.ts`
- **Lines:** 26-31
- **Category:** In-Memory State
- **Severity:** P3
- **Description:** `sessionSignals` is a `Map` in process memory. In a multi-instance deployment (Railway scales horizontally), session signals are not shared. Also lost on every deploy/restart.
- **Fix:** Use Redis for session signal storage.

### 37. `getTrendingRaw` in hashtags.service uses raw SQL but could use Prisma
- **File:** `apps/api/src/modules/hashtags/hashtags.service.ts`
- **Lines:** 154-177
- **Category:** Unnecessary Raw SQL
- **Severity:** P3
- **Description:** The `$queryRaw` computes `postsCount + reelsCount + threadsCount + videosCount` and orders by it. This could be done with Prisma `orderBy` using a computed field or just ordering by `postsCount` (the dominant signal).

### 38. `getExcludedUserIds` in threads.service gets bi-directional blocks but posts.service only gets one direction
- **File:** `apps/api/src/modules/threads/threads.service.ts` (lines 106-123) vs `apps/api/src/modules/posts/posts.service.ts` (lines 99-110)
- **Category:** Inconsistency
- **Severity:** P3
- **Description:** Threads service correctly fetches both `blockerId = me` AND `blockedId = me` (bi-directional), but posts service only fetches `blockerId = me` (one direction). This means users who blocked the current user can still appear in the post feed.
- **Fix:** Standardize on the bi-directional block check across all services.

### 39. `include: { _count: { select: { votes: true } } }` in poll options — fetched even when no poll
- **File:** `apps/api/src/modules/threads/threads.service.ts` (lines 57-64), `apps/api/src/modules/recommendations/recommendations.service.ts` (lines 78-86)
- **Category:** Over-fetching
- **Severity:** P3
- **Description:** THREAD_SELECT includes poll with nested options and vote counts. For threads without polls, this adds unnecessary LEFT JOINs to every thread query.

### 40. `repostOf` included in every thread query even when most threads aren't reposts
- **File:** `apps/api/src/modules/threads/threads.service.ts` (lines 65-71)
- **Category:** Over-fetching
- **Severity:** P3
- **Description:** THREAD_SELECT includes `repostOf: { select: { ... } }` which adds a LEFT JOIN on every thread query. Most threads are not reposts, so this JOIN returns NULL for the majority.

### 41. `include: { members: { include: { user } } }` in CONVERSATION_SELECT
- **File:** `apps/api/src/modules/messages/messages.service.ts` (lines 13-35)
- **Category:** Over-fetching
- **Severity:** P3
- **Description:** Every conversation query includes ALL members with their user profiles. For group chats with 100+ members, this returns 100+ nested user objects per conversation. The `getConversations` endpoint (listing all user's chats) would fetch member lists for every conversation.
- **Fix:** Only include members when fetching a single conversation detail, not in the list view.

### 42. `getMyOrders` uses `{ lt: cursor }` cursor but orders by `createdAt DESC`
- **File:** `apps/api/src/modules/commerce/commerce.service.ts`
- **Lines:** 125-138
- **Category:** Incorrect Cursor Pagination
- **Severity:** P3
- **Description:** Same pattern as #28 — ID-based cursor doesn't match createdAt ordering.

### 43. `video.findMany` with full VIDEO_SELECT including channel relation for feed
- **File:** `apps/api/src/modules/videos/videos.service.ts`
- **Lines:** ~171-200
- **Category:** Over-fetching
- **Severity:** P3
- **Description:** Video feed queries include full `channel` relation (id, handle, name, avatarUrl, isVerified) for every video. For the feed, a simpler select without channel details would be faster.

### 44. `getSavedMessages` uses `{ lt: cursor }` cursor
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`
- **Lines:** 15-28
- **Category:** Incorrect Cursor Pagination
- **Severity:** P3
- **Description:** Uses `where.id = { lt: cursor }` without Prisma's native cursor. Works for CUIDs (which are time-sortable) but is less reliable than `cursor: { id }, skip: 1`.

### 45. Multiple calls to `this.prisma.user.findUnique` for the same user in a single request
- **File:** `apps/api/src/modules/users/users.service.ts`
- **Lines:** 280-281, 323-324
- **Category:** Redundant Queries
- **Severity:** P3
- **Description:** `getUserPosts` and `getUserThreads` each start by fetching the user by username, then check if the viewer follows them. The user lookup could be cached across related calls (e.g., when a profile page loads both posts and threads).

### 46. `isFollower` check uses `.then(Boolean)` on a potentially null findUnique
- **File:** `apps/api/src/modules/users/users.service.ts`
- **Lines:** 284-286
- **Category:** Readability / Minor Performance
- **Severity:** P3
- **Description:** `await this.prisma.follow.findUnique({...}).then(Boolean)` works but fetches the full Follow record just to check existence. `prisma.follow.count({ where: ... })` would be more efficient.

### 47. `getSuggestions` in follows.service uses `followers: { some: { followerId: { in: followingIds } } }` — potentially expensive
- **File:** `apps/api/src/modules/follows/follows.service.ts`
- **Lines:** 379-407
- **Category:** Expensive Subquery
- **Severity:** P3
- **Description:** The `where` clause uses a `some` relation filter with `in` array, which generates a correlated subquery. For users following 50 people, this checks if each candidate user has any follower whose ID is in a 50-element array — this can be slow without proper indexing on the Follow table's followerId column.

---

## Summary by Category

| Category | Count | Severity Range |
|----------|-------|---------------|
| SQL Injection / Raw Query | 2 | P0 |
| Missing Index | 1 | P0 |
| Application-layer Sorting (fetch 200, sort in JS) | 1 | P0 |
| Missing Pagination / OOM Risk | 3 | P0-P2 |
| N+1 Query Pattern | 2 | P1 |
| Sequential Queries / Latency | 1 | P1 |
| Redundant / Duplicate Queries | 6 | P1-P2 |
| Over-fetching (unnecessary includes/relations) | 5 | P2-P3 |
| Incorrect Cursor Pagination | 8 | P2-P3 |
| Pagination Bug (cursor after re-sort) | 3 | P2 |
| Application-layer Aggregation | 1 | P1 |
| In-Memory State | 1 | P3 |
| Feature Not Implemented | 1 | P2 |
| Code Duplication | 1 | P2 |
| Inconsistency | 1 | P3 |
| Unnecessary Raw SQL | 1 | P3 |
| Expensive Subquery | 1 | P3 |
| Minor Performance | 1 | P3 |

---

## Top 5 Fixes by Impact

1. **Add HNSW vector index on embeddings table** — Without this, the entire personalized feed is O(n) on table size. Single migration, massive impact.

2. **Fix SQL injection in embeddings findSimilar/findSimilarByVector** — Use parameterized queries. Security + correctness fix.

3. **Move trending/for-you scoring into SQL** — Eliminate the "fetch 200, sort in JS, return 20" anti-pattern across 4 feed services. Reduces DB transfer and server CPU by ~10x per feed request.

4. **Fix cursor pagination across 8+ methods** — The `id < cursor` pattern with non-ID ordering is broken. Users see duplicates and miss content.

5. **Stream or batch GDPR data export** — Current implementation will OOM for any active user. Background job + streaming response.
