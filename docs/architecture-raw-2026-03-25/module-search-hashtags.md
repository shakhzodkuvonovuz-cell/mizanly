# Module: Search, Hashtags & Recommendations — Complete Architecture

> Extracted 2026-03-25 by architecture agent. Covers every endpoint, service method, query, algorithm, and cross-module dependency.

---

## Table of Contents

1. [Module Structure & File Map](#1-module-structure--file-map)
2. [Search Module](#2-search-module)
   - 2.1 [SearchController — Endpoints](#21-searchcontroller--endpoints)
   - 2.2 [SearchService — Methods](#22-searchservice--methods)
   - 2.3 [MeilisearchService — Integration](#23-meilisearchservice--integration)
   - 2.4 [Meilisearch vs Prisma LIKE Fallback](#24-meilisearch-vs-prisma-like-fallback)
   - 2.5 [scheduledAt Filtering](#25-scheduledat-filtering)
   - 2.6 [Select Constants (Field Projections)](#26-select-constants-field-projections)
3. [Hashtags Module](#3-hashtags-module)
   - 3.1 [HashtagsController — Endpoints](#31-hashtagscontroller--endpoints)
   - 3.2 [HashtagsService — Methods](#32-hashtagsservice--methods)
   - 3.3 [Trending Algorithm](#33-trending-algorithm)
   - 3.4 [Hashtag Follow/Unfollow Mechanics](#34-hashtag-followunfollow-mechanics)
   - 3.5 [Content Enrichment](#35-content-enrichment)
   - 3.6 [DTO Validation](#36-dto-validation)
4. [Recommendations Module](#4-recommendations-module)
   - 4.1 [RecommendationsController — Endpoints](#41-recommendationscontroller--endpoints)
   - 4.2 [RecommendationsService — Methods](#42-recommendationsservice--methods)
   - 4.3 [Multi-Stage Ranking Pipeline](#43-multi-stage-ranking-pipeline)
   - 4.4 [Exploration Slots](#44-exploration-slots)
   - 4.5 [Block/Mute Exclusion](#45-blockmute-exclusion)
   - 4.6 [Engagement Score Computation](#46-engagement-score-computation)
   - 4.7 [Diversity Reranking](#47-diversity-reranking)
5. [Cross-Module Dependencies](#5-cross-module-dependencies)
6. [Shared Utilities](#6-shared-utilities)
   - 6.1 [enrichPostsForUser / enrichReelsForUser / enrichThreadsForUser](#61-enrichment-utilities)
   - 6.2 [cacheAside (Stampede Protection)](#62-cacheaside-stampede-protection)
7. [Test Coverage Summary](#7-test-coverage-summary)
8. [Known Issues & Limitations](#8-known-issues--limitations)

---

## 1. Module Structure & File Map

```
apps/api/src/modules/
├── search/
│   ├── search.module.ts              (L1-11)   Module definition
│   ├── search.controller.ts          (L1-118)  8 endpoints
│   ├── search.service.ts             (L1-657)  9 service methods, 7 select constants
│   ├── meilisearch.service.ts        (L1-197)  Meilisearch HTTP client
│   ├── search.controller.spec.ts     (L1-110)  Controller tests
│   ├── search.service.spec.ts        (L1-985)  Service tests (35 tests)
│   ├── search.service.edge.spec.ts   (L1-99)   Edge case tests (6 tests)
│   └── meilisearch.service.spec.ts   (L1-464)  Meilisearch tests (21 tests)
├── hashtags/
│   ├── hashtags.module.ts            (L1-10)   Module definition
│   ├── hashtags.controller.ts        (L1-105)  9 endpoints
│   ├── hashtags.service.ts           (L1-404)  13 service methods
│   ├── dto/hashtag-query.dto.ts      (L1-14)   3 DTO classes
│   ├── hashtags.controller.spec.ts   (L1-161)  Controller tests (10 tests)
│   ├── hashtags.service.spec.ts      (L1-265)  Service tests (14 tests)
│   └── hashtags.service.edge.spec.ts (L1-80)   Edge case tests (6 tests)
├── recommendations/
│   ├── recommendations.module.ts           (L1-12)   Module definition (imports EmbeddingsModule)
│   ├── recommendations.controller.ts       (L1-73)   5 endpoints
│   ├── recommendations.service.ts          (L1-778)  12+ service methods, multi-stage ranking
│   ├── recommendations.controller.spec.ts  (L1-97)   Controller tests (7 tests)
│   └── recommendations.service.spec.ts     (L1-768)  Service tests (24 tests)
```

---

## 2. Search Module

### Module Definition

**File:** `search.module.ts` (L1-11)

```
SearchModule
  controllers: [SearchController]
  providers:   [SearchService, MeilisearchService]
  exports:     [SearchService, MeilisearchService]
```

No imports from other NestJS modules. Dependencies: `PrismaService` (global), `ConfigService` (global).

---

### 2.1 SearchController — Endpoints

**File:** `search.controller.ts` (L1-118)

**Swagger Tag:** `Search & Discover`
**Controller Prefix:** `/search`

| # | Method | Path | Auth | Rate Limit | Handler | Response Format | Line |
|---|--------|------|------|------------|---------|-----------------|------|
| 1 | `GET` | `/search` | OptionalClerk | 30/60s | `search()` | `SearchResults \| { data, meta }` | L17-30 |
| 2 | `GET` | `/search/trending` | OptionalClerk | 20/60s | `trending()` | `{ hashtags, threads }` | L32-36 |
| 3 | `GET` | `/search/hashtag/:tag` | OptionalClerk | 30/60s | `getHashtagPosts()` | `{ hashtag, data, meta }` | L38-47 |
| 4 | `GET` | `/search/suggested-users` | **ClerkAuthGuard** | default | `suggestedUsers()` | `User[]` | L49-52 |
| 5 | `GET` | `/search/posts` | OptionalClerk | 30/60s | `searchPosts()` | `{ data, meta }` | L54-66 |
| 6 | `GET` | `/search/threads` | OptionalClerk | 30/60s | `searchThreads()` | `{ data, meta }` | L68-79 |
| 7 | `GET` | `/search/reels` | OptionalClerk | 30/60s | `searchReels()` | `{ data, meta }` | L81-92 |
| 8 | `GET` | `/search/explore` | OptionalClerk | 30/60s | `exploreFeed()` | `{ data, meta }` | L94-105 |
| 9 | `GET` | `/search/suggestions` | OptionalClerk | 30/60s | `querySuggestions()` | `{ users, hashtags }` | L107-117 |

**Query Parameter Validation (controller-level):**
- `type`: validated against `VALID_TYPES` array: `['people', 'threads', 'posts', 'tags', 'reels', 'videos', 'channels']`. Invalid types silently become `undefined` (L27).
- `limit`: parsed from string, clamped to `[1, 50]`, default `20`. Suggestions endpoint uses `[1, 20]`, default `10` (L115).
- `cursor`: passthrough string (Prisma keyset cursor).

---

### 2.2 SearchService — Methods

**File:** `search.service.ts` (L1-657)

**Dependencies:** `PrismaService`, `MeilisearchService`

#### Method: `search(query, type?, cursor?, limit=20)` — L153-403

**Validation:**
- Empty/whitespace query: `BadRequestException('Search query is required')` (L159-161)
- Query > 200 chars: `BadRequestException('Search query must be under 200 characters')` (L162-164)
- Limit re-parsed/clamped at service level too (L166-167): defense-in-depth

**Meilisearch Fast Path (L170-183):**
- Conditions: `meilisearch.isAvailable() && type && !cursor` (only first page, typed queries)
- Index mapping: `{ people:'users', posts:'posts', threads:'threads', reels:'reels', videos:'videos', tags:'hashtags' }`
- Note: `channels` type has NO Meilisearch index mapping -- always falls through to Prisma
- Returns `{ data: hits, meta: { hasMore, cursor: undefined } }` if hits > 0
- Falls through to Prisma if Meilisearch returns 0 results or is unavailable

**Typed Paginated Queries (L186-297):**

When `type` is `posts`, `threads`, `reels`, `videos`, or `channels`, returns `{ data, meta: { cursor, hasMore } }`:

| Type | Table | Where Filter | Search Field | OrderBy | scheduledAt | Extra Filters |
|------|-------|-------------|--------------|---------|-------------|---------------|
| `posts` | `Post` | content ILIKE | `content` | `likesCount DESC` | YES | `visibility:PUBLIC, isRemoved:false` |
| `threads` | `Thread` | content ILIKE | `content` | `likesCount DESC` | YES | `visibility:PUBLIC, isChainHead:true, isRemoved:false` |
| `videos` | `Video` | title OR desc ILIKE | `title`, `description` | `viewsCount DESC` | YES (AND pattern) | `status:PUBLISHED, isRemoved:false` |
| `channels` | `Channel` | handle/name/desc ILIKE | `handle`, `name`, `description` | `subscribersCount DESC` | NO | `user.isBanned:false, isDeleted:false, isDeactivated:false` |
| `reels` | `Reel` | caption ILIKE | `caption` | `createdAt DESC` | YES | `status:READY, isRemoved:false, isTrial:false` |

Pagination: `take = limit + 1`, `hasMore = results.length > limit`, cursor = last item ID.

**Aggregate Query (no type specified) — L305-402:**
- Returns `SearchResults` object with all content types
- Takes: `people:5, threads:5, posts:5, reels:5, videos:5, channels:5, hashtags:10`
- Each query runs independently (no parallelization with `Promise.all` -- sequential)
- All content type queries include `scheduledAt` filter
- People query: `take: isAggregate ? 5 : safeLimit`
- Hashtags: `take: type ? safeLimit : 10`

**Type `people` (standalone) — L308-323:**
- Table: `User`
- Where: `username OR displayName` ILIKE, `isBanned:false, isDeactivated:false, isDeleted:false`
- OrderBy: `followers._count DESC`
- No `scheduledAt` (users don't have it)

**Type `tags` (standalone) — L394-400:**
- Table: `Hashtag`
- Where: `name` ILIKE
- OrderBy: `postsCount DESC`
- No `scheduledAt` (hashtags don't have it)

---

#### Method: `trending()` — L405-453

**Trending Hashtags (raw SQL):**
```sql
SELECT tag, SUM(cnt) as cnt FROM (
  SELECT unnest(hashtags) as tag, COUNT(*) as cnt
  FROM "Post"
  WHERE "createdAt" >= ${twentyFourHoursAgo}
    AND array_length(hashtags, 1) > 0
  GROUP BY tag
  UNION ALL
  SELECT unnest(hashtags) as tag, COUNT(*) as cnt
  FROM "Thread"
  WHERE "createdAt" >= ${twentyFourHoursAgo}
    AND array_length(hashtags, 1) > 0
  GROUP BY tag
) combined
GROUP BY tag
ORDER BY cnt DESC
LIMIT 20
```

- Uses `$queryRaw` tagged template literal (safe from injection)
- Time window: **24 hours**
- Sources: Posts + Threads (NOT reels, NOT videos)
- Top 20 tags by combined usage count
- Enriches with Hashtag table records: merges `recentCount` from SQL with stored hashtag metadata
- Returns `{ hashtags, threads }` where threads = top 10 public threads from last 24h sorted by likes

**Trending Threads query (L440-451):**
- Where: `visibility:PUBLIC, isChainHead:true, isRemoved:false, createdAt >= 24h, scheduledAt filter`
- OrderBy: `likesCount DESC`
- Take: 10

---

#### Method: `getHashtagPosts(tag, cursor?, limit=20)` — L456-480

- Lowercases tag for lookup: `tag.toLowerCase()`
- First fetches Hashtag metadata via `findUnique({ where: { name } })` -- returns null if not found (does NOT throw)
- Queries posts: `hashtags: { has: tag.toLowerCase() }` (Prisma array contains)
- Where: `visibility:PUBLIC, isRemoved:false, scheduledAt filter`
- OrderBy: `createdAt DESC`
- Returns: `{ hashtag, data, meta: { cursor, hasMore } }`

---

#### Method: `suggestedUsers(userId)` — L482-514

- **Auth required** (ClerkAuthGuard on controller)
- Step 1: Fetch user's followings (up to 1000)
- Step 2: Fetch user's interest categories from `UserInterest` table
- Step 3: Query users NOT in following list + self, filtering:
  - `isPrivate:false, isDeactivated:false, isBanned:false, isDeleted:false`
  - If user has interests: `interests: { some: { category: { in: categories } } }`
- OrderBy: `followers._count DESC`
- Take: 20
- No pagination (single page)

---

#### Method: `searchPosts(query, userId?, cursor?, limit=20)` — L516-534

- Independent endpoint (not through `search()`)
- Where: content ILIKE, `visibility:PUBLIC, isRemoved:false, scheduledAt filter`
- OrderBy: `likesCount DESC`
- Note: `userId` parameter accepted but NOT used in the query (no personalization)

---

#### Method: `searchThreads(query, cursor?, limit=20)` — L536-555

- Where: content ILIKE, `visibility:PUBLIC, isChainHead:true, isRemoved:false, scheduledAt filter`
- OrderBy: `likesCount DESC`

---

#### Method: `searchReels(query, cursor?, limit=20)` — L557-578

- **Different from typed search**: uses AND/OR pattern to search BOTH caption AND hashtags
- Where: `(caption ILIKE query OR hashtags has query.toLowerCase()) AND scheduledAt filter`
- Extra: `status:READY, isRemoved:false, isTrial:false`
- OrderBy: `createdAt DESC`

---

#### Method: `getExploreFeed(cursor?, limit=20, userId?)` — L580-626

- Explore/discover feed: recent public posts from last **7 days**
- If authenticated: excludes blocked/muted users (bidirectional blocks, up to 50 each)
- Also excludes own posts: `userId: { not: userId }`
- Where: `visibility:PUBLIC, isRemoved:false, scheduledAt filter, user.isDeactivated:false`
- OrderBy: `likesCount DESC`
- Block/mute resolution: builds `excluded` Set from both Block directions + Mute
- Note: Only returns posts (no reels, threads, videos in explore feed)

---

#### Method: `getSuggestions(query, limit=10)` — L628-655

- **Autocomplete/typeahead** endpoint
- Returns BOTH users and hashtags in parallel (`Promise.all`)
- Users: `username startsWith OR displayName startsWith` (case-insensitive)
  - Excludes: `isBanned, isDeactivated, isDeleted`
  - OrderBy: `followers._count DESC`
  - Take: `ceil(limit / 2)`
- Hashtags: `name startsWith` (case-insensitive)
  - OrderBy: `postsCount DESC`
  - Take: `ceil(limit / 2)`
- Empty query returns `{ users: [], hashtags: [] }` immediately (no DB query)

---

### 2.3 MeilisearchService — Integration

**File:** `meilisearch.service.ts` (L1-197)

**Implements:** `OnModuleInit`
**Dependencies:** `ConfigService`
**Configuration:** `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`

#### Constructor (L37-41)
- Reads `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` from env
- Sets `available = !!host` (boolean flag)

#### `onModuleInit()` — L43-96
- If not available: logs warning, returns immediately
- Creates 6 indexes: `users`, `posts`, `threads`, `reels`, `videos`, `hashtags`
- Configures per-index settings:

| Index | searchableAttributes | filterableAttributes | sortableAttributes |
|-------|---------------------|---------------------|--------------------|
| `users` | username, displayName, bio | isVerified | followerCount |
| `posts` | content, hashtags, username | userId, postType, visibility, isRemoved | likesCount, createdAt |
| `threads` | content, hashtags, username | userId, visibility, isRemoved, isChainHead | likesCount, createdAt |
| `reels` | caption, hashtags, username | userId, status, isRemoved | likesCount, viewsCount, createdAt |
| `videos` | title, description, tags, username | userId, channelId, category, status, isRemoved | viewsCount, likesCount, publishedAt, createdAt |
| `hashtags` | name | (none) | postsCount, createdAt |

- All errors during init are caught and logged (non-fatal)
- Uses HTTP `fetch` API (not a client library)

#### `isAvailable()` — L98-100
- Returns boolean based on whether `MEILISEARCH_HOST` was configured

#### `search(indexName, query, options?)` — L102-136
- POST to `{host}/indexes/{indexName}/search`
- Options: `limit` (default 20), `offset` (default 0), `filter`, `sort`
- Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- **Timeout:** `AbortSignal.timeout(10000)` (10 second hard timeout)
- Returns `MeilisearchSearchResult | null`
- On error (network, non-200, timeout): returns `null` (graceful degradation)

#### `addDocuments(indexName, documents)` — L138-153
- POST to `{host}/indexes/{indexName}/documents`
- Skips if not available or empty array
- Fire-and-forget (no response processing, errors logged)

#### `deleteDocument(indexName, documentId)` — L155-166
- DELETE to `{host}/indexes/{indexName}/documents/{documentId}`
- URL-encodes both index name and document ID
- Skips if not available, errors logged

**MeilisearchDocument interface:**
```typescript
interface MeilisearchDocument {
  id: string;
  type: string;       // user, post, thread, reel, video, hashtag
  title?: string;
  content?: string;
  username?: string;
  hashtags?: string[];
  language?: string;
  createdAt?: string;
  [key: string]: unknown;
}
```

**MeilisearchSearchResult interface:**
```typescript
interface MeilisearchSearchResult {
  hits: MeilisearchDocument[];
  estimatedTotalHits: number;
  processingTimeMs: number;
  query: string;
}
```

---

### 2.4 Meilisearch vs Prisma LIKE Fallback

**Decision Flow in `search()`:**

```
1. Is Meilisearch available? (host configured)
   ├── NO → Always use Prisma ILIKE
   └── YES
       2. Is type specified AND no cursor?
          ├── NO → Prisma ILIKE (aggregate/paginated queries bypass Meilisearch)
          └── YES
              3. Does index exist for this type?
                 ├── NO (type='channels') → Prisma ILIKE
                 └── YES
                     4. Does Meilisearch return hits?
                        ├── YES → Return Meilisearch results
                        └── NO → Fall through to Prisma ILIKE
```

**Key limitation:** Meilisearch is ONLY used for first-page typed queries (no cursor). All paginated pages always use Prisma. Aggregate search (no type) always uses Prisma.

**Current status:** `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are EMPTY in production. ALL search uses Prisma ILIKE fallback. At scale, this means 7 parallel ILIKE table scans per aggregate query.

---

### 2.5 scheduledAt Filtering

Every content query in search module applies:
```typescript
OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]
```

**Coverage by method:**

| Method | Post | Thread | Reel | Video | Channel | Hashtag |
|--------|------|--------|------|-------|---------|---------|
| `search()` typed posts | YES | - | - | - | - | - |
| `search()` typed threads | - | YES | - | - | - | - |
| `search()` typed videos | - | - | - | YES (AND) | - | - |
| `search()` typed reels | - | - | YES | - | - | - |
| `search()` typed channels | - | - | - | - | NO (N/A) | - |
| `search()` aggregate | YES | YES | YES | YES (AND) | NO (N/A) | NO (N/A) |
| `trending()` | via SQL | YES | - | - | - | - |
| `getHashtagPosts()` | YES | - | - | - | - | - |
| `searchPosts()` | YES | - | - | - | - | - |
| `searchThreads()` | - | YES | - | - | - | - |
| `searchReels()` | - | - | YES | - | - | - |
| `getExploreFeed()` | YES | - | - | - | - | - |

**Note:** The raw SQL in `trending()` does NOT filter by scheduledAt on Post/Thread -- it uses only `createdAt >= 24h`. This means scheduled-but-not-yet-published posts can contribute to trending hashtags.

---

### 2.6 Select Constants (Field Projections)

**File:** `search.service.ts` (L6-132)

| Constant | Table | Fields | Relations |
|----------|-------|--------|-----------|
| `USER_SEARCH_SELECT` | User | id, username, displayName, avatarUrl, bio, isVerified | `_count.followers` |
| `THREAD_SEARCH_SELECT` | Thread | id, content, mediaUrls, likesCount, repliesCount, repostsCount, createdAt | `user(id, username, displayName, avatarUrl, isVerified)` |
| `POST_SEARCH_SELECT` | Post | id, postType, content, mediaUrls, mediaTypes, likesCount, commentsCount, createdAt | `user(id, username, avatarUrl)` |
| `REEL_SEARCH_SELECT` | Reel | id, videoUrl, thumbnailUrl, duration, caption, mentions, likesCount, commentsCount, sharesCount, viewsCount, status, createdAt | `user(id, username, displayName, avatarUrl, isVerified)` |
| `VIDEO_SEARCH_SELECT` | Video | id, title, description, thumbnailUrl, duration, category, tags, viewsCount, likesCount, dislikesCount, commentsCount, publishedAt, createdAt | `user(...)`, `channel(id, handle, name, avatarUrl, isVerified)` |
| `CHANNEL_SEARCH_SELECT` | Channel | id, handle, name, description, avatarUrl, bannerUrl, subscribersCount, videosCount, totalViews, isVerified, createdAt | `user(id, username, displayName, avatarUrl, isVerified)` |

**Note:** `POST_SEARCH_SELECT` in the search module is LIGHTER than the one in the hashtags module (fewer fields). The hashtags module includes: thumbnailUrl, mediaWidth, mediaHeight, hashtags, mentions, locationName, sharesCount, savesCount, viewsCount, hideLikesCount, commentsDisabled, isSensitive, isRemoved, updatedAt, circle relation.

---

## 3. Hashtags Module

### Module Definition

**File:** `hashtags.module.ts` (L1-10)

```
HashtagsModule
  controllers: [HashtagsController]
  providers:   [HashtagsService]
  exports:     [HashtagsService]
```

No imports. Dependencies: `PrismaService` (global), `REDIS` (injected token).

---

### 3.1 HashtagsController — Endpoints

**File:** `hashtags.controller.ts` (L1-105)

**Swagger Tag:** `Hashtags`
**Controller Prefix:** `/hashtags`
**Default Rate Limit:** 60/60s (controller-level)

| # | Method | Path | Auth | Handler | Response | Line |
|---|--------|------|------|---------|----------|------|
| 1 | `GET` | `/hashtags/trending` | OptionalClerk | `getTrending()` | `Hashtag[]` with totals | L16-22 |
| 2 | `GET` | `/hashtags/search` | OptionalClerk | `search()` | `Hashtag[]` or `{ data:[], meta:{total:0} }` | L24-31 |
| 3 | `GET` | `/hashtags/following` | **ClerkAuthGuard** | `getFollowedHashtags()` | `{ data, meta }` | L33-42 |
| 4 | `GET` | `/hashtags/:name` | OptionalClerk | `getByName()` | `Hashtag` | L44-49 |
| 5 | `GET` | `/hashtags/:name/posts` | OptionalClerk | `getPosts()` | `{ data, meta }` | L51-60 |
| 6 | `GET` | `/hashtags/:name/reels` | OptionalClerk | `getReels()` | `{ data, meta }` | L62-71 |
| 7 | `GET` | `/hashtags/:name/threads` | OptionalClerk | `getThreads()` | `{ data, meta }` | L73-82 |
| 8 | `POST` | `/hashtags/:id/follow` | **ClerkAuthGuard** | `followHashtag()` | `{ followed: true }` | L84-93 |
| 9 | `DELETE` | `/hashtags/:id/follow` | **ClerkAuthGuard** | `unfollowHashtag()` | `{ followed: false }` | L95-104 |

**Controller-level query parsing:**
- `trending`: limit parsed from DTO string, capped at 100, default 50
- `search`: if `q` is falsy, returns `{ data: [], meta: { total: 0 } }` without calling service. Limit capped at 50, default 20.
- Follow/unfollow: use `:id` (hashtag ID), NOT `:name`

---

### 3.2 HashtagsService — Methods

**File:** `hashtags.service.ts` (L1-404)

**Dependencies:** `PrismaService`, `Redis` (injected via `@Inject('REDIS')`)
**Imports:** `cacheAside` from `../../common/utils/cache`, `enrichPostsForUser`, `enrichReelsForUser` from `../../common/utils/enrich`

---

#### Method: `getTrendingRaw(limit=50)` — L150-153

- **Cached via `cacheAside`**: key=`trending:hashtags:${limit}`, TTL=**300 seconds** (5 minutes)
- Delegates to `fetchTrendingHashtags()` on cache miss

#### Private: `fetchTrendingHashtags(limit)` — L155-178

- Raw SQL query via `$queryRaw`:
```sql
SELECT
  id, name, "postsCount", "reelsCount", "threadsCount", "videosCount",
  ("postsCount" + "reelsCount" + "threadsCount" + "videosCount") as total
FROM "hashtags"
ORDER BY total DESC, "postsCount" DESC
LIMIT ${limit}
```
- Returns all-time totals across 4 content types, NOT time-windowed
- Ordered by total usage (sum of all counts) then by posts count as tiebreaker
- **Key difference from search.trending():** This is all-time totals. Search trending uses 24h SQL aggregation.

---

#### Method: `search(query, limit=20)` — L180-192

- Prefix match: `name: { startsWith: query, mode: 'insensitive' }`
- OrderBy: `postsCount DESC`
- No pagination (single page)
- Returns raw `Hashtag[]`

---

#### Method: `getByName(name)` — L194-200

- Exact match: `hashtag.findUnique({ where: { name } })`
- Throws `NotFoundException('Hashtag not found')` if null

---

#### Method: `getPostsByHashtag(hashtagName, userId?, cursor?, limit=20)` — L202-236

- First validates hashtag exists via `findUnique` -- throws `NotFoundException` if not found
- Query: `hashtags: { has: hashtagName }` (Prisma array contains)
- Where: `isRemoved:false, scheduledAt filter, visibility:PUBLIC`
- OrderBy: `createdAt DESC`
- **Enrichment:** If `userId` provided, enriches with `userReaction` and `isSaved` via `enrichPostsForUser()`
- Returns: `{ data: EnrichedPost[], meta: { cursor, hasMore } }`

---

#### Method: `getReelsByHashtag(hashtagName, userId?, cursor?, limit=20)` — L238-273

- Same pattern as posts: validates hashtag, queries reels
- Extra where: `isTrial:false, status:READY`
- Enrichment via `enrichReelsForUser()` if userId provided
- OrderBy: `createdAt DESC`

---

#### Method: `getThreadsByHashtag(hashtagName, userId?, cursor?, limit=20)` — L275-309

- Same pattern: validates hashtag, queries threads
- Where: `isRemoved:false, scheduledAt filter, visibility:PUBLIC`
- Enrichment via inline `enrichThreads()` private method (NOT shared utility)
- OrderBy: `createdAt DESC`

---

#### Method: `incrementCount(name, field)` — L311-317

- Upserts hashtag record: creates if not exists (with count=1), increments if exists
- Field: `'postsCount' | 'reelsCount' | 'threadsCount' | 'videosCount'`
- Called from other modules (posts, reels, threads, videos) when content is created

---

#### Method: `decrementCount(name, field)` — L319-333

- Updates hashtag record, decrementing the specified field
- **Floor protection:** After decrement, runs `updateMany` to set field to 0 if it went negative
- Silently catches errors (e.g., hashtag doesn't exist) -- just logs warning

---

#### Method: `followHashtag(userId, hashtagId)` — L345-354

- Validates hashtag exists by ID: `findUnique({ where: { id: hashtagId } })`
- Throws `NotFoundException` if not found
- Uses `hashtagFollow.upsert` with composite key `userId_hashtagId`
- Idempotent: `update: {}` (no-op if already following)
- Returns `{ followed: true }`

---

#### Method: `unfollowHashtag(userId, hashtagId)` — L356-359

- Uses `hashtagFollow.deleteMany({ where: { userId, hashtagId } })`
- Does NOT validate if hashtag exists (idempotent delete)
- Does NOT throw if not following
- Returns `{ followed: false }`

---

#### Method: `getFollowedHashtags(userId, cursor?, limit=20)` — L361-382

- Two-step query:
  1. Fetch `hashtagFollow` records with cursor pagination on composite key `userId_hashtagId`
  2. Batch-fetch hashtag details: `{ id, name, postsCount }`
- Returns: `{ data: Hashtag[], meta: { cursor: lastHashtagId, hasMore } }`
- Cursor is the `hashtagId` from the last follow record

---

#### Private: `enrichPosts(posts, userId)` — L336-338

- Delegates to shared `enrichPostsForUser()` utility

#### Private: `enrichReels(reels, userId)` — L341-343

- Delegates to shared `enrichReelsForUser()` utility

#### Private: `enrichThreads(threads, userId)` — L384-403

- **Inline implementation** (does NOT use shared `enrichThreadsForUser`)
- Batch fetches: `threadReaction` + `threadBookmark` for user
- Returns threads with `userReaction` and `isSaved` appended

---

### 3.3 Trending Algorithm

**Two distinct trending algorithms exist:**

#### A. HashtagsService.getTrendingRaw() — All-time totals (cached 5 min)
- Source: `hashtags` table stored counts
- Formula: `total = postsCount + reelsCount + threadsCount + videosCount`
- Sorted by: `total DESC, postsCount DESC`
- Time window: NONE (all-time)
- Cache: Redis `trending:hashtags:{limit}` with 300s TTL and stampede protection

#### B. SearchService.trending() — 24-hour SQL aggregation (no cache)
- Source: Raw SQL unnest on `Post.hashtags[]` + `Thread.hashtags[]`
- Formula: `COUNT(*)` of posts/threads using each hashtag in last 24h
- Sorted by: `SUM(cnt) DESC`
- Time window: **24 hours**
- Merges with Hashtag table records for metadata
- Also returns top 10 trending threads
- **NOT cached** (runs fresh on every request)

**Key differences:**
- A includes reels and videos counts; B only counts posts and threads
- A is cached; B is not
- A uses stored denormalized counts; B aggregates from raw data
- B also returns trending threads alongside hashtags; A returns only hashtags

---

### 3.4 Hashtag Follow/Unfollow Mechanics

**Database Model:** `HashtagFollow` join table with composite PK `(userId, hashtagId)`

**Follow flow:**
1. Controller receives `POST /hashtags/:id/follow` with authenticated userId
2. Service validates hashtag exists by ID (not name)
3. Upserts `HashtagFollow` record (idempotent)
4. Returns `{ followed: true }`

**Unfollow flow:**
1. Controller receives `DELETE /hashtags/:id/follow` with authenticated userId
2. Service runs `deleteMany` (idempotent -- no error if not following)
3. Returns `{ followed: false }`

**Note:** Follow uses hashtag **ID**, not name. But `getByName` returns the full hashtag object with ID, so client can chain: GET by name -> follow by ID.

**Missing functionality:** No follower count on hashtags. No notification when followed hashtag gets new content. No "posts from followed hashtags" feed endpoint.

---

### 3.5 Content Enrichment

When a `userId` is provided to hashtag content endpoints, each item is enriched with:

| Field | Type | Source |
|-------|------|--------|
| `userReaction` | `string \| null` | PostReaction / ReelReaction / ThreadReaction table |
| `isSaved` | `boolean` | SavedPost / ReelInteraction(saved:true) / ThreadBookmark table |

Enrichment is batched: single query per reaction type for all items in the page.

**Posts enrichment:** Uses shared `enrichPostsForUser()` utility
**Reels enrichment:** Uses shared `enrichReelsForUser()` utility
**Threads enrichment:** Uses INLINE implementation (not shared utility) -- queries `threadReaction` and `threadBookmark` tables

---

### 3.6 DTO Validation

**File:** `dto/hashtag-query.dto.ts` (L1-14)

```typescript
class TrendingQueryDto {
  @IsOptional() @IsNumberString() limit?: string;
}

class SearchQueryDto {
  @IsString() @MaxLength(100) q: string;
  @IsOptional() @IsNumberString() limit?: string;
}

class HashtagContentQueryDto {
  @IsOptional() @IsString() cursor?: string;
}
```

**Note:** `HashtagContentQueryDto` is defined but NOT used in the controller -- cursor is extracted via `@Query('cursor')` directly.

---

## 4. Recommendations Module

### Module Definition

**File:** `recommendations.module.ts` (L1-12)

```
RecommendationsModule
  imports:     [EmbeddingsModule]    <-- cross-module dependency
  controllers: [RecommendationsController]
  providers:   [RecommendationsService]
  exports:     [RecommendationsService]
```

---

### 4.1 RecommendationsController — Endpoints

**File:** `recommendations.controller.ts` (L1-73)

**Swagger Tag:** `Recommendations`
**Controller Prefix:** `/recommendations`
**Global:** `@ApiBearerAuth()` on class (Swagger docs)

| # | Method | Path | Auth | Rate Limit | Handler | Response | Line |
|---|--------|------|------|------------|---------|----------|------|
| 1 | `GET` | `/recommendations/people` | OptionalClerk | 20/60s | `suggestedPeople()` | `User[] (+ mutualFollowers)` | L14-24 |
| 2 | `GET` | `/recommendations/posts` | OptionalClerk | 20/60s | `suggestedPosts()` | `Post[]` | L26-36 |
| 3 | `GET` | `/recommendations/reels` | OptionalClerk | 20/60s | `suggestedReels()` | `Reel[]` | L38-48 |
| 4 | `GET` | `/recommendations/channels` | OptionalClerk | 20/60s | `suggestedChannels()` | `Channel[]` | L50-60 |
| 5 | `GET` | `/recommendations/threads` | OptionalClerk | 20/60s | `suggestedThreads()` | `Thread[]` | L62-72 |

All endpoints: limit clamped to `[1, 50]`, default 20. `userId` is optional (anonymous users get popularity-based results).

**Note:** No cursor-based pagination on recommendations. Returns a flat array, not `{ data, meta }`.

---

### 4.2 RecommendationsService — Methods

**File:** `recommendations.service.ts` (L1-778)

**Dependencies:** `PrismaService`, `EmbeddingsService` (from embeddings module)

---

#### Method: `suggestedPeople(userId?, limit=20)` — L511-584

**Unauthenticated path (L513-532):**
- Query: all active, public users ordered by `followersCount DESC`
- Select: id, username, displayName, avatarUrl, isVerified, bio, followersCount
- Appends `mutualFollowers: 0` to each result

**Authenticated path (L534-584) -- Friends-of-Friends algorithm:**
1. Get excluded IDs (blocked + muted, bidirectional)
2. Fetch user's followings (up to 200)
3. Fetch friends-of-friends: who do my followings follow that I don't? (up to 200)
4. Count mutual connections per suggested user
5. Sort by mutual count descending
6. Fetch user profiles for top candidates
7. Return with `mutualFollowers` count

---

#### Method: `suggestedPosts(userId?, limit=20)` — L586-643

**Flow:**
1. Get excluded user IDs (if authenticated)
2. Calculate exploration slots: `ceil(limit * 0.15)` (~15%)
3. `mainCount = limit - explorationCount`
4. If authenticated: try `multiStageRank()` for POST type
   - If ranked IDs returned: hydrate posts + fetch exploration posts in parallel
   - Re-order hydrated posts to match ranked order
   - Interleave exploration posts
5. Fallback (unauthenticated OR pgvector returned nothing):
   - Posts from last 48h, ordered by engagement: `[likesCount, commentsCount, sharesCount, createdAt]`
   - Exclude own posts and blocked/muted users
   - Interleave exploration posts

---

#### Method: `suggestedReels(userId?, limit=20)` — L645-702

- Same pattern as posts but with reels
- Fallback window: **72 hours** (vs 48h for posts)
- OrderBy: `[viewsCount, likesCount, commentsCount, createdAt]`
- Extra filters: `status:READY, isTrial:false`
- **Bug at L660:** The `OR` for scheduledAt and `isTrial:false` are at the wrong nesting level -- they're siblings of `where` instead of inside `where`. This is a TypeScript type error that Prisma may still accept at runtime depending on version.

---

#### Method: `suggestedChannels(userId?, limit=20)` — L704-727

- **No pgvector ranking** (no embeddings for channels)
- Simple engagement sort: `[subscribersCount DESC, totalViews DESC]`
- Excludes own channel + blocked/muted users (if authenticated)
- No exploration slots
- No scheduledAt filter (channels don't have it)
- No time window constraint

---

#### Method: `suggestedThreads(userId?, limit=20)` — L732-777

- Same multi-stage pattern as posts
- Fallback window: **48 hours**
- OrderBy: `[likesCount, repliesCount, createdAt]`
- Exploration slots: 15% for fresh threads

---

### 4.3 Multi-Stage Ranking Pipeline

**Method:** `multiStageRank(userId, contentType, limit)` — L198-312

**3-stage pipeline:**

#### Stage 1: Candidate Generation (pgvector KNN) — L204-225
1. Get user's interest centroids via `embeddingsService.getUserInterestVector(userId)`
   - Returns `number[][]` (multiple centroids from k-means clustering)
   - Returns `null` if user has no interest vector -> pipeline returns `[]`
2. Get excluded user IDs (blocked/muted)
3. Get seen post IDs from `FeedInteraction` table (up to 200, ordered by recency)
4. KNN search: `findSimilarByMultipleVectors(centroids, 500, [contentType], seenIds)`
   - Searches across ALL interest centroids
   - Retrieves top **500** candidates
   - Excludes already-seen content

#### Stage 2: Behavioral Scoring — L229-249
For each candidate, compute:
- `similarity`: from pgvector distance (stage 1)
- `engagementScore`: normalized engagement rate (0-1 range, capped)
- `recencyScore`: linear decay over 7 days (`max(0, 1 - ageHours/168)`)

**Final Score Formula:**
```
finalScore = similarity * 0.4 + engagementScore * 0.35 + recencyScore * 0.25
```

Weights: **40% similarity, 35% engagement, 25% recency**

Sort by `finalScore DESC`.

#### Stage 3: Diversity Reranking — L251-301

**Pass 1: Author Deduplication (L259-274)**
- No same author back-to-back
- Skipped items appended at end (not lost)
- Also filters out blocked/muted authors

**Pass 2: Hashtag Diversity (L277-299)**
- Maintains rolling window of last 6 hashtags
- If a post has 2+ hashtags overlapping with recent window -> deferred
- Deferred items fill remaining slots at the end
- Prevents "filter bubble" of same topic cluster

**Error handling (L302-311):**
- Critical errors (SQL, null pointer, Cannot read): re-thrown
- Non-critical (embeddings unavailable): swallowed, returns `[]` -> triggers fallback

---

### 4.4 Exploration Slots

**Concept:** Reserve 15% of feed slots for fresh, low-visibility content to give new creators a chance.

**Calculation:** `explorationCount = ceil(limit * 0.15)` (for limit=20 -> 3 slots)

**Exploration Criteria (posts, reels, threads):**
- Created within last **6 hours**
- `viewsCount < 100` (low visibility)
- `isRemoved: false`
- Public/active user
- scheduledAt filter applied
- Excludes own content and blocked/muted users
- OrderBy: `createdAt DESC`

**Interleaving:** `interleaveExploration()` method (L490-507)
- Inserts exploration items at every ~7th position: `insertAt = min((i+1) * 7, result.length)`
- Deduplicates: removes any exploration items already present in main results

**Applied to:** Posts (L598-610), Reels (L657-670), Threads (L742-752)
**NOT applied to:** Channels (no exploration), People (different algorithm)

---

### 4.5 Block/Mute Exclusion

**Method:** `getExcludedUserIds(userId)` — L167-189

- Fetches up to 50 blocks (bidirectional: where blocker=me OR blocked=me)
- Fetches up to 50 mutes (where userId=me)
- Returns deduplicated array of excluded user IDs

**Bidirectional blocking:**
- If I blocked someone -> exclude them
- If someone blocked me -> also exclude them
- Prevents content from appearing for either party

**Applied in:** All recommendation methods (suggestedPeople, Posts, Reels, Channels, Threads)

---

### 4.6 Engagement Score Computation

**Method:** `getEngagementScores(contentIds, contentType)` — L314-357

| Content Type | Engagement Formula | Normalization |
|-------------|-------------------|---------------|
| POST | `likes + comments*2 + shares*3 + saves*2` | `min(totalEngagement / viewsCount * 10, 1)` |
| REEL | `likes + comments*2 + shares*3` | `min(totalEngagement / viewsCount * 10, 1)` |
| THREAD | `likes + replies*2 + reposts*3` | `min(totalEngagement / viewsCount * 10, 1)` |

**Weights rationale:**
- Shares/reposts (3x): highest intent signal (actively redistributing)
- Comments/replies + saves (2x): medium intent (active engagement)
- Likes (1x): lowest intent (passive engagement)

**Normalization:** Engagement rate = totalEngagement / views, scaled by 10, capped at 1.0.
If `viewsCount == 0`, engagement rate = 0.

---

### 4.7 Diversity Reranking

**Author deduplication:**
- Iterates scored candidates in order
- If current author == last inserted author -> skip to `skippedByAuthor` list
- After main pass, appended skipped items to end
- Effect: no two consecutive items from same author

**Hashtag cluster diversity:**
- Maintains `recentHashtags` array (rolling window)
- For each candidate, checks overlap of its hashtags with last 6 tags in window
- If overlap >= 2 tags -> defer to `deferredByHashtag` list
- Stops when `diversified.length >= limit`
- Backfills from deferred items

**Helper methods:**
- `getAuthorMap(contentIds, contentType)` — L359-375: batch-fetches userId for each content ID
- `getHashtagMap(contentIds, contentType)` — L377-393: batch-fetches hashtags[] for each content ID

---

## 5. Cross-Module Dependencies

```
SearchModule
  ├── PrismaService (global)
  ├── ConfigService (global)
  └── MeilisearchService (internal)

HashtagsModule
  ├── PrismaService (global)
  ├── Redis (global 'REDIS' token)
  ├── enrichPostsForUser (../../common/utils/enrich)
  ├── enrichReelsForUser (../../common/utils/enrich)
  └── cacheAside (../../common/utils/cache)

RecommendationsModule
  ├── PrismaService (global)
  ├── EmbeddingsModule → EmbeddingsService
  │   ├── getUserInterestVector()
  │   └── findSimilarByMultipleVectors()
  └── (no Redis, no Meilisearch)
```

**Who depends on HashtagsService:**
- `HashtagsService.incrementCount()` / `decrementCount()` are called from:
  - `PostsService` (on post create/delete with hashtags)
  - `ReelsService` (on reel create/delete with hashtags)
  - `ThreadsService` (on thread create/delete with hashtags)
  - `VideosService` (on video create/delete with tags)

**Who depends on SearchService / MeilisearchService:**
- `MeilisearchService.addDocuments()` could be called from content services to index new content -- but NO calls found in codebase. Meilisearch indexing is NOT wired to content creation. Only onModuleInit creates indexes.

**Who depends on RecommendationsService:**
- Only the controller. Not consumed by other modules.

---

## 6. Shared Utilities

### 6.1 Enrichment Utilities

**File:** `apps/api/src/common/utils/enrich.ts` (L1-126)

Four exported functions, all follow the same pattern:
1. Extract IDs from content array
2. Batch-fetch reactions + saved/bookmarked status for userId
3. Map results back onto content items

| Function | Reaction Table | Saved Table | Reaction Key |
|----------|---------------|-------------|-------------|
| `enrichPostsForUser` | `postReaction` (postId, reaction) | `savedPost` (postId) | `reaction` string |
| `enrichReelsForUser` | `reelReaction` (reelId, reaction) | `reelInteraction` (reelId, saved:true) | `reaction` string |
| `enrichThreadsForUser` | `threadReaction` (threadId, reaction) | `threadBookmark` (threadId) | `reaction` string |
| `enrichVideosForUser` | `videoReaction` (videoId, isLike) | `videoBookmark` (videoId) | `isLike ? 'LIKE' : 'DISLIKE'` |

All batch queries capped at `take: 50`.

### 6.2 cacheAside (Stampede Protection)

**File:** `apps/api/src/common/utils/cache.ts` (L1-63)

```typescript
cacheAside<T>(redis, key, ttlSeconds, fetcher)
```

**Algorithm:**
1. Try Redis GET -- return if cached
2. Cache miss: acquire Redis SET NX lock (`lock:{key}`, 10s TTL)
3. If lock acquired: call fetcher, cache result with TTL, release lock
4. If lock NOT acquired (another caller holds it): wait 100ms, retry cache GET
5. If still no cache after retry: call fetcher directly (prevent starvation)

**Used by:** HashtagsService.getTrendingRaw() (TTL=300s)

Also exports:
- `invalidateCache(redis, ...keys)` -- DEL specific keys
- `invalidateCachePattern(redis, pattern)` -- KEYS + DEL (use sparingly)

---

## 7. Test Coverage Summary

| Test File | Tests | Focus |
|-----------|-------|-------|
| `search.controller.spec.ts` | 5 | Param validation, limit capping, type rejection |
| `search.service.spec.ts` | 35 | All search types, pagination, trending, hashtag posts, suggestions, error paths |
| `search.service.edge.spec.ts` | 6 | Arabic queries, regex injection, boundary lengths |
| `meilisearch.service.spec.ts` | 21 | Constructor, onModuleInit, search, addDocuments, deleteDocument, availability |
| `hashtags.controller.spec.ts` | 10 | All endpoints, param parsing, limit defaults |
| `hashtags.service.spec.ts` | 14 | CRUD, trending, search, follow/unfollow, enrichment |
| `hashtags.service.edge.spec.ts` | 6 | 404s, empty states, Arabic names |
| `recommendations.controller.spec.ts` | 7 | Limit capping, default values |
| `recommendations.service.spec.ts` | 24 | People (fof, blocks), posts (engagement, pgvector, exploration, interleaving, dedup), reels, channels, threads, edge cases |
| **Total** | **~128** | |

---

## 8. Known Issues & Limitations

### Search Module
1. **No Meilisearch indexing pipeline**: `addDocuments()` is never called from content creation flows. Even with Meilisearch deployed, the indexes would be empty.
2. **Aggregate search is sequential**: 7 Prisma ILIKE queries run sequentially (not Promise.all). At scale, this creates latency.
3. **No search history**: User search queries are not stored for personalization or analytics.
4. **Channels not in Meilisearch**: `channels` type has no index mapping, always uses Prisma.
5. **Trending hashtags SQL ignores scheduledAt**: Posts with `scheduledAt` in the future can contribute to trending counts.
6. **Explore feed is posts-only**: No reels, threads, or mixed content in explore feed.
7. **`searchReels` uses both caption AND hashtag search**: Different from other typed searches that only search one field. This inconsistency means reels have broader search coverage.

### Hashtags Module
1. **Two different trending algorithms**: `HashtagsService.getTrendingRaw()` (all-time, cached) vs `SearchService.trending()` (24h, uncached) return different results.
2. **Thread enrichment is inline, not shared**: `HashtagsService.enrichThreads()` duplicates logic from `enrichThreadsForUser()` utility.
3. **No hashtag follower count**: HashtagFollow join table exists but no count is surfaced on the Hashtag model.
4. **No feed for followed hashtags**: Can follow hashtags but no endpoint to get a feed of content from followed hashtags.
5. **`HashtagContentQueryDto` defined but unused**: Cursor is extracted via `@Query('cursor')` directly.

### Recommendations Module
1. **Bug in suggestedReels L660**: `OR` and `isTrial` are at wrong nesting level in the `where` clause for pgvector-ranked reels.
2. **No pagination**: All recommendation endpoints return flat arrays. Client must request different limits for "load more".
3. **No cursor-based continuation**: Cannot resume recommendations from where left off.
4. **FeedInteraction only tracks postId**: `seenIds` in multiStageRank always reads `postId`, even for REEL and THREAD content types. Seen reels/threads are NOT filtered from candidates.
5. **Exploration has hard-coded thresholds**: 6-hour window and <100 views are not configurable.
6. **Channel recommendations have no personalization**: Always popularity-sorted, no pgvector or interest-based ranking.
7. **getExcludedUserIds caps at 50**: Users who have >50 blocks or >50 mutes will not have all exclusions applied.
