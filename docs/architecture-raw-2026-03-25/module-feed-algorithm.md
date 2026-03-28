# Feed, Personalized Feed, Embeddings & Recommendations — Complete Architecture

> Extracted 2026-03-25 by architecture agent. Source files:
> - `apps/api/src/modules/feed/` (12 files)
> - `apps/api/src/modules/embeddings/` (8 files)
> - `apps/api/src/modules/recommendations/` (5 files)
> - `apps/api/src/modules/islamic/prayer-calculator.ts` (dependency)

---

## Table of Contents

1. [Module Structure & Dependencies](#1-module-structure--dependencies)
2. [Feed Module — FeedController](#2-feed-module--feedcontroller)
3. [FeedService — Core Feed Logic](#3-feedservice--core-feed-logic)
4. [PersonalizedFeedService — The Algorithm](#4-personalizedfeedservice--the-algorithm)
5. [FeedTransparencyService — Explainability & Search](#5-feedtransparencyservice--explainability--search)
6. [EmbeddingsService — Vector Operations](#6-embeddingsservice--vector-operations)
7. [EmbeddingPipelineService — Backfill System](#7-embeddingpipelineservice--backfill-system)
8. [RecommendationsService — Content Recommendations](#8-recommendationsservice--content-recommendations)
9. [RecommendationsController](#9-recommendationscontroller)
10. [Scoring Formulas — Complete Reference](#10-scoring-formulas--complete-reference)
11. [Redis Keys](#11-redis-keys)
12. [Islamic Boost — Complete Reference](#12-islamic-boost--complete-reference)
13. [K-Means Clustering — Complete Reference](#13-k-means-clustering--complete-reference)
14. [Pagination Patterns](#14-pagination-patterns)
15. [Content Filtering & Safety](#15-content-filtering--safety)
16. [Test Coverage](#16-test-coverage)
17. [DTOs](#17-dtos)
18. [Cross-Module Dependency Graph](#18-cross-module-dependency-graph)
19. [Constants & Magic Numbers — Master List](#19-constants--magic-numbers--master-list)

---

## 1. Module Structure & Dependencies

### Feed Module (`feed.module.ts`, line 1-14)
```
FeedModule
  imports: [EmbeddingsModule]
  controllers: [FeedController]
  providers: [FeedService, FeedTransparencyService, PersonalizedFeedService]
  exports: [FeedService, FeedTransparencyService, PersonalizedFeedService]
```

### Embeddings Module (`embeddings.module.ts`, line 1-11)
```
EmbeddingsModule
  controllers: [EmbeddingsController]
  providers: [EmbeddingsService, EmbeddingPipelineService]
  exports: [EmbeddingsService, EmbeddingPipelineService]
```

### Recommendations Module (`recommendations.module.ts`, line 1-12)
```
RecommendationsModule
  imports: [EmbeddingsModule]
  controllers: [RecommendationsController]
  providers: [RecommendationsService]
  exports: [RecommendationsService]
```

### Dependency Chain
```
RecommendationsModule → EmbeddingsModule
FeedModule → EmbeddingsModule
PersonalizedFeedService → EmbeddingsService (getUserInterestVector, findSimilarByMultipleVectors)
PersonalizedFeedService → prayer-calculator (calculatePrayerTimes)
RecommendationsService → EmbeddingsService (getUserInterestVector, findSimilarByMultipleVectors)
```

---

## 2. Feed Module — FeedController

**File:** `apps/api/src/modules/feed/feed.controller.ts` (235 lines)
**Swagger Tag:** `Feed Intelligence`
**Base Path:** `/api/v1/feed`

### Endpoints

| Method | Path | Auth | Throttle | Handler | Line |
|--------|------|------|----------|---------|------|
| POST | `/feed/interaction` | ClerkAuthGuard | 60/min | `log()` → `feed.logInteraction()` | 24-30 |
| POST | `/feed/dismiss/:contentType/:contentId` | ClerkAuthGuard | 30/min | `dismiss()` → `feed.dismiss()` | 32-46 |
| DELETE | `/feed/dismiss/:contentType/:contentId` | ClerkAuthGuard | 30/min | `undismiss()` → `feed.undismiss()` | 48-62 |
| GET | `/feed/explain/post/:postId` | ClerkAuthGuard | 30/min | `explainPost()` → `transparency.explainPost()` | 64-73 |
| GET | `/feed/explain/thread/:threadId` | ClerkAuthGuard | 30/min | `explainThread()` → `transparency.explainThread()` | 75-84 |
| GET | `/feed/search/enhanced` | OptionalClerkAuthGuard | 30/min | `enhancedSearch()` → `transparency.enhancedSearch()` | 86-101 |
| GET | `/feed/personalized` | OptionalClerkAuthGuard | 30/min | `getPersonalized()` → `personalizedFeed.getPersonalizedFeed()` | 103-133 |
| POST | `/feed/session-signal` | ClerkAuthGuard | 60/min | `trackSessionSignal()` → `personalizedFeed.trackSessionSignal()` | 135-145 |
| GET | `/feed/trending` | OptionalClerkAuthGuard | 30/min | `getTrending()` → `feed.getTrendingFeed()` | 147-160 |
| GET | `/feed/featured` | OptionalClerkAuthGuard | 30/min | `getFeatured()` → `feed.getFeaturedFeed()` | 162-175 |
| GET | `/feed/suggested-users` | OptionalClerkAuthGuard | 30/min | `getSuggestedUsers()` → `feed.getSuggestedUsers()` | 177-188 |
| GET | `/feed/frequent-creators` | ClerkAuthGuard | 30/min | `getFrequentCreators()` → `feed.getFrequentCreators()` | 190-196 |
| PUT | `/feed/admin/posts/:id/feature` | ClerkAuthGuard | — | `featurePost()` → `feed.featurePost()` | 198-207 |
| GET | `/feed/nearby` | OptionalClerkAuthGuard | 30/min | `getNearby()` → `feed.getNearbyContent()` | 209-234 |

### Query Parameter Validation (controller level)

- **`/feed/personalized`** (line 112-132):
  - `space`: validated against `['saf', 'bakra', 'majlis', 'minbar']`, defaults to `'saf'` if invalid
  - `limit`: `Math.min(Math.max(1, parsed), 50)` — clamped to [1, 50], default 20
  - `lat`/`lng`: parsed via `parseFloat()`, passed as `undefined` if `NaN`

- **`/feed/trending`** and **`/feed/featured`** (line 158, 173):
  - `limit`: clamped to [1, 50], default 20

- **`/feed/suggested-users`** (line 186):
  - `limit`: clamped to [1, 50], default 5

- **`/feed/nearby`** (line 224-226):
  - `lat`: clamped to [-90, 90], default 0
  - `lng`: clamped to [-180, 180], default 0
  - `radiusKm`: clamped to [1, 500], default 25

- **`/feed/dismiss`** and **`/feed/undismiss`** (line 41-43, 57-59):
  - `contentType`: validated against `['post', 'reel', 'thread', 'video']`, throws `BadRequestException` if invalid

---

## 3. FeedService — Core Feed Logic

**File:** `apps/api/src/modules/feed/feed.service.ts` (554 lines)
**Dependencies:** PrismaService, Redis (`@Inject('REDIS')`)

### FEED_POST_SELECT constant (line 6-42)
Standard select shape for posts in feed queries. Includes:
- All post fields (content, media, engagement counts, flags)
- `user`: { id, username, displayName, avatarUrl, isVerified }
- `circle`: { id, name, slug }

### Service Methods

#### `logInteraction(userId, data)` — line 51-89
- **Purpose:** Log or update a feed interaction (view, like, comment, share, save)
- **Behavior:** Uses `findFirst` + `update/create` pattern (no `@@unique([userId, postId])` on FeedInteraction)
- **Only sets defined fields** — avoids overwriting with `undefined`
- **Input validation:** `space` is cast to `ContentSpace` enum (validated by DTO)

#### `dismiss(userId, contentId, contentType)` — line 91-97
- **Purpose:** Dismiss content from feed
- **Uses:** `feedDismissal.upsert()` with composite unique `userId_contentId_contentType`

#### `getDismissedIds(userId, contentType)` — line 99-102
- **Purpose:** Get all dismissed content IDs for a user + content type
- **Limit:** `take: 1000` max dismissed IDs per type

#### `getUserInterests(userId)` — line 104-129
- **Purpose:** Compute behavioral interest scores by space and hashtag
- **Queries:** Last 200 interactions where `liked OR saved OR viewDurationMs >= 5000`
- **Weight formula (line 121):**
  ```
  w = (liked ? 2 : 0) + (commented ? 3 : 0) + (shared ? 4 : 0) + (saved ? 3 : 0) + min(viewDurationMs / 10000, 5)
  ```
  - liked = 2 points
  - commented = 3 points
  - shared = 4 points (highest)
  - saved = 3 points
  - view duration = viewDurationMs / 10000, capped at 5 (so 50+ seconds = max view weight)
- **Output:** `{ bySpace: Record<string, number>, byHashtag: Record<string, number> }`

#### `undismiss(userId, contentId, contentType)` — line 131-142
- **Purpose:** Remove a dismissal (idempotent)
- **Handles P2025** (record not found) gracefully

#### `getContentFilter(userId)` — line 148-152
- **Purpose:** Load user's ContentFilterSetting for feed filtering

#### `buildContentFilterWhere(userId)` — line 158-175
- **Purpose:** Build Prisma where-clause additions from content filter settings
- **Filters applied:**
  - `hideMusic: true` → `audioTrackId: null`
  - `strictnessLevel: 'STRICT' | 'FAMILY'` → `contentWarning: null`

#### `getExcludedUserIds(userId)` — line 178-208 (private)
- **Purpose:** Get user IDs to exclude from feeds
- **Queries (parallel):**
  - Blocks (bidirectional): `take: 50`
  - Mutes: `take: 50`
  - Restricts: `take: 50`
- **Returns:** Deduplicated Set → array of excluded IDs

#### `getTrendingFeed(cursor?, limit, userId?)` — line 215-335
- **Purpose:** Trending posts scored by engagement rate, 7-day window
- **Works without auth** (anonymous browsing + cold start)
- **Redis cache for unauthenticated:** key `trending_feed:{cursor}:{limit}`, TTL 300s (5 min)
  - Cache key for first page: `trending_feed:first:20`
  - Authenticated users **bypass cache entirely** (line 217)
  - Corrupted cache (invalid JSON) falls through to recompute (line 222-224)
- **Time window:** 7 days (`Date.now() - 7 * 24 * 60 * 60 * 1000`) (line 229)
- **Candidate pool:** `take: 200` posts ordered by `createdAt: 'desc'` (line 275)
- **Filters:** `isRemoved: false`, `visibility: PUBLIC`, `scheduledAt: null OR lte now`, `user.isDeactivated: false, isPrivate: false`
- **Scoring formula (line 281-289):**
  ```
  ageHours = max(1, (scoreTimestamp - createdAt) / 3600000)
  engagementTotal = likesCount + commentsCount * 2 + sharesCount * 3 + savesCount * 2
  engagementRate = engagementTotal / ageHours
  ```
  - Engagement weights: likes=1, comments=2, shares=3, saves=2
- **Sort:** by `_score` descending, then `id` ascending (line 292)
- **Cursor-based keyset pagination (line 246-306):**
  - Cursor format: `score:id:timestamp` (e.g., `5.5:abc123:1711180800000`)
  - Timestamp ensures consistent scoring across page requests
  - Epsilon tolerance `1e-9` for float comparison (line 299)
  - Filters items: `item._score < cursorScore - eps` OR `(|item._score - cursorScore| < eps AND item.id > cursorId)`
  - `limit + 1` fetch pattern for hasMore detection

#### `getFeaturedFeed(cursor?, limit, userId?)` — line 340-373
- **Purpose:** Staff-picked / editorial featured posts
- **Query:** `isFeatured: true`, ordered by `featuredAt: 'desc'`
- **Pagination:** Simple ID cursor (`id: { lt: cursor }`)
- **No scoring** — pure editorial control

#### `featurePost(postId, featured, userId?)` — line 378-396
- **Purpose:** Admin-only post featuring/unfeaturing
- **Auth:** Checks `user.role === 'ADMIN'`, throws `ForbiddenException` if not
- **Sets:** `isFeatured` and `featuredAt` (null when unfeatured)

#### `getSuggestedUsers(userId?, limit)` — line 402-443
- **Purpose:** Suggested users to follow (for in-feed cards)
- **Works without auth** for anonymous users
- **Excludes:** Self, already followed, blocked/muted/restricted
- **Sort:** `isVerified: 'desc'` → `followersCount: 'desc'` → `postsCount: 'desc'`
- **Limit:** `take: limit` (default 5)

#### `getUserFollowingCount(userId)` — line 448-453
- **Purpose:** Simple count of users a user follows

#### `getNearbyContent(lat, lng, radiusKm, cursor?, userId?)` — line 455-502
- **Purpose:** Location-tagged posts (STUB — no actual distance filtering)
- **Current implementation:** Returns all posts with `locationName: { not: null }`
- **Known limitation:** Post model lacks lat/lng fields. Comments describe PostGIS migration path.
- **Pagination:** ISO timestamp cursor on `createdAt`
- **Limit:** Hardcoded 20

#### `getFrequentCreatorIds(userId)` — line 508-528
- **Purpose:** Find creators the user frequently interacts with
- **SQL aggregation** (raw query, not Prisma ORM):
  ```sql
  SELECT p."userId" as "creatorId"
  FROM "FeedInteraction" fi
  JOIN "Post" p ON fi."postId" = p.id
  WHERE fi."userId" = $1
    AND fi."createdAt" >= $2
    AND (fi."viewed" = true OR fi."liked" = true OR fi."commented" = true OR fi."shared" = true OR fi."saved" = true)
    AND p."userId" != $1
  GROUP BY p."userId"
  HAVING COUNT(*) >= 10
  ```
- **Threshold:** 10+ interactions in last 7 days
- **Returns:** `Set<string>` of creator IDs

#### `getFrequentCreators(userId)` — line 533-553
- **Purpose:** Profile info for frequent creators
- **Excludes:** Blocked/muted users
- **Limit:** `take: 50`

---

## 4. PersonalizedFeedService — The Algorithm

**File:** `apps/api/src/modules/feed/personalized-feed.service.ts` (741 lines)
**Dependencies:** PrismaService, EmbeddingsService, Redis
**Import:** `calculatePrayerTimes` from `../islamic/prayer-calculator`

### Constants (line 24-36)

```typescript
const ISLAMIC_HASHTAGS = new Set([
  'quran', 'hadith', 'sunnah', 'islam', 'muslim', 'dua', 'salah', 'ramadan',
  'jummah', 'eid', 'hajj', 'umrah', 'zakat', 'sadaqah', 'dawah', 'seerah',
  'tafsir', 'fiqh', 'aqeedah', 'dhikr', 'tawbah', 'hijab', 'halal', 'masjid',
  'islamic', 'alhamdulillah', 'subhanallah', 'mashallah', 'bismillah',
]);
// 29 hashtags total

static readonly MAX_VIEWED_IDS = 1000;  // line 35
static readonly SESSION_TTL = 1800;     // 30 minutes in seconds (line 36)
```

### FeedItem Interface (line 8-14)
```typescript
interface FeedItem {
  id: string;
  type: 'post' | 'reel' | 'thread' | 'video';
  score: number;
  reasons: string[];
  content?: Record<string, unknown>;
}
```

### SessionData Interface (line 16-21)
```typescript
interface SessionData {
  likedCategories: Record<string, number>;
  viewedIds: string[];
  sessionStart: number;
  scrollDepth: number;
}
```

### Redis Session Storage (line 44-65)

- **Key format:** `session:{userId}` (line 47)
- **Storage:** Redis hash with single field `json` containing serialized SessionData
- **TTL:** 1800 seconds (30 minutes), reset on every write (line 64)
- **Read:** `hgetall` + `JSON.parse(data.json)` (line 50-58)
- **Write:** `hset(key, 'json', JSON.stringify(session))` + `expire(key, 1800)` (line 62-64)

### `getExcludedUserIds(userId)` — line 67-98 (private)
- Same bidirectional block/mute/restrict pattern as FeedService
- Queries: blocks (bidirectional, take 50), mutes (take 50), restricts (take 50)

### `trackSessionSignal(userId, signal)` — line 106-139
- **Purpose:** Track in-session signals for real-time feed adaptation
- **Signal types:** `'view' | 'like' | 'save' | 'share' | 'skip'`
- **Session lifecycle:**
  - Creates new session if none exists or expired (30 min inactivity, line 113)
  - Caps viewedIds at `MAX_VIEWED_IDS` (1000) to prevent unbounded growth (line 124)
  - Deduplicates viewedIds (line 125)
  - Tracks `scrollDepth` from `signal.scrollPosition` (line 129)
- **Category boosting (line 132-136):**
  - Only on `'like'` or `'save'` actions
  - Increments `likedCategories[tag]` count for each hashtag
  - `'view'` and `'skip'` do NOT boost categories

### `getSessionBoostFromData(session, hashtags)` — line 141-150 (private)
- **Formula:**
  ```
  boost = sum(session.likedCategories[tag] * 0.05) for each matching tag
  ```
  - 5% boost per in-session like of same category
  - **Cap:** `Math.min(boost, 0.3)` — maximum 30% session boost
- **Returns 0** for null session

### `getIslamicBoost(hashtags, userLat?, userLng?)` — line 159-208
- **Complete logic (see Section 12 for full breakdown)**
- **Base boost:** 0.1 (10%) for any Islamic content
- **Friday (Jummah) boost:** +0.15 base, +0.1 extra during 11:00-14:00
- **Prayer time boost:** +0.1 if within ±30 min of any prayer time
  - Location-aware: Uses `calculatePrayerTimes()` when lat/lng provided
  - Fallback: Hardcoded hour ranges (Fajr 4-6, Dhuhr 12-13, Asr 15-16, Maghrib 18-19, Isha 20-21)
- **Ramadan boost:** +0.2
- **Cap:** `Math.min(boost, 0.5)` — maximum 50%

### `isRamadanPeriod(date)` — line 216-244 (private)
- **Known dates lookup table (line 219-226):**
  ```
  2026: [1, 18]  → Feb 18
  2027: [1, 8]   → Feb 8
  2028: [0, 28]  → Jan 28
  2029: [0, 16]  → Jan 16
  2030: [0, 6]   → Jan 6
  2031: [11, 26] → Dec 26
  ```
- **Duration:** 30 days from start date
- **Approximation for years beyond table:** Uses lunar cycle shift of ~10.87 days/year from 2026 base

### `getPersonalizedFeed(userId?, space, cursor?, limit, userLat?, userLng?)` — line 251-398

**The main algorithm. 3-stage pipeline:**

#### Stage 0: Auth & Cold Start Routing (line 259-279)
1. **Unauthenticated users** → `getTrendingFeed(space)` (line 261)
2. **Parallel queries** (line 266-269):
   - `getExcludedUserIds(userId)`
   - `feedInteraction.count({ where: { userId } })`
   - `embeddingsService.getUserInterestVector(userId)`
3. **Cold start** (< 10 interactions, line 272) → `getColdStartFeed()`
4. **No interest vector** → `getTrendingFeed(space)` (line 278)

#### Stage 1: pgvector KNN (line 285-291)
```typescript
const candidates = await this.embeddingsService.findSimilarByMultipleVectors(
  interestCentroids,  // 2-3 centroids from k-means
  500,                // top 500 candidates
  [contentType],      // filter by space content type
  sessionViewedIds,   // exclude already-viewed in session
);
```

#### Stage 2: Weighted Scoring (line 293-339)
```
score = similarity * 0.35       // 35% vector similarity
      + engagementScore * 0.25  // 25% engagement rate
      + recencyScore * 0.15     // 15% recency decay
      + islamicBoost * 0.15     // 15% Islamic content boost
      + sessionBoost * 0.10     // 10% session adaptation
```

- **engagementScore** (line 649-653):
  ```
  total = likesCount + commentsCount * 2 + sharesCount * 3
  rate = viewsCount > 0 ? total / viewsCount : 0
  score = min(rate * 10, 1)
  ```
  - Capped at 1.0

- **recencyScore** (line 319-321):
  ```
  ageHours = (now - createdAt) / (1000 * 60 * 60)
  recencyScore = max(0, 1 - ageHours / 168)
  ```
  - Decays linearly over 168 hours (7 days)
  - 0 at 7 days old, 1 at brand new

- **Reasons tracking:** Each scoring component adds a human-readable reason:
  - `'Similar to your interests'` (always)
  - `'Popular in community'` (when engScore > 0.5)
  - `'Islamic content boost'` (when islamicBoost > 0.1)
  - `'Trending in your session'` (when sessionBoost > 0)

#### Stage 3: Diversity Injection (line 344-372)
- **No same-author back-to-back:** Uses `diversifyAuthorMap` from engagement data
- **Backfill:** Skipped items are appended at the end if diversified list is short
- **Session viewed update:** Marks served items as viewed in Redis session (line 375-384)

#### Hydration (line 387)
- Fetches full content data (post/reel/thread/video) for the diversified items

### `getColdStartFeed(userId, space, cursor?, limit, excludedUserIds)` — line 402-437
- **Mix:** 70% trending + 30% Islamic editorial picks
- **Partial Fisher-Yates shuffle:** Swaps ~30% of items randomly to mix trending with Islamic picks (line 426-431)
- **Deduplication:** `seenIds` Set prevents duplicates between trending and Islamic picks

### `getIslamicEditorialPicks(space, limit, excludedUserIds)` — line 439-495
- **Purpose:** Curated Islamic content for cold start feeds
- **Uses:** `hashtags: { hasSome: islamicTagArray }` (all 29 Islamic hashtags)
- **Additional filter:** `user: { isVerified: true }` for saf space (line 454)
- **Sort:** By engagement (likesCount or viewsCount) descending
- **Score:** Fixed 0.8 with reason `'Islamic editorial pick'`
- **Space-specific queries:**
  - saf → Post (likesCount desc)
  - bakra → Reel (viewsCount desc, isTrial: false, status: READY)
  - majlis → Thread (likesCount desc, isChainHead: true)
  - minbar → (falls through to majlis/thread query — no separate video path in editorial picks)

### `getTrendingFeed(space, cursor?, limit, excludedUserIds)` — line 497-612 (private, personalized-feed variant)
- **Window:** 24 hours (NOT 7 days like FeedService.getTrendingFeed)
- **Per-space queries with space-specific models:**
  - saf → Post (likesCount desc + createdAt desc)
  - bakra → Reel (viewsCount desc + createdAt desc, status READY, isTrial false)
  - minbar → Video (viewsCount desc + createdAt desc, status 'PUBLISHED')
  - majlis → Thread (likesCount desc + createdAt desc, isChainHead true, visibility PUBLIC)
- **Fetch size:** `(limit + 1) * 2` to account for re-ranking after decay (line 519)
- **Applies `applyTrendingDecay()`** to score candidates

### `applyTrendingDecay(engagementCount, createdAt)` — line 619-626
```typescript
ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
engagementScore = log10(max(engagementCount, 1) + 1) / 5
decayFactor = ageHours <= 12 ? 1.0 : max(0.5, 1.0 - (ageHours - 12) / 24)
return engagementScore * decayFactor
```
- **No decay** for posts younger than 12 hours (decayFactor = 1.0)
- **Linear decay** from 12h to 36h: at 24h decayFactor = 0.5
- **Floor:** decayFactor never goes below 0.5
- **Log scale** for engagement to dampen outliers (log10(n+1)/5)
  - 10 engagement → ~0.208
  - 100 engagement → ~0.413
  - 10000 engagement → ~0.800

### Helper Methods

#### `spaceToContentType(space)` — line 630-637
```
saf → EmbeddingContentType.POST
bakra → EmbeddingContentType.REEL
majlis → EmbeddingContentType.THREAD
minbar → EmbeddingContentType.VIDEO
```

#### `contentTypeToFeedType(ct)` — line 639-647
```
POST → 'post'
REEL → 'reel'
THREAD → 'thread'
VIDEO → 'video'
default → 'post'
```

#### `calculateEngagementScore(meta)` — line 649-653
```
total = likesCount + (commentsCount || 0) * 2 + (sharesCount || 0) * 3
rate = viewsCount > 0 ? total / viewsCount : 0
return min(rate * 10, 1)
```

#### `getContentMetadata(ids, contentType)` — line 655-695
- Single query per content type fetching engagement + userId + hashtags + createdAt
- `take: 500` per query
- Thread: maps `repliesCount` → `commentsCount`, `repostsCount` → `sharesCount`

#### `hydrateItems(items, contentType)` — line 697-737
- Fetches full content data for the final feed items
- `take: 50` per query
- Includes user select: `{ id, username, displayName, avatarUrl, isVerified }`

---

## 5. FeedTransparencyService — Explainability & Search

**File:** `apps/api/src/modules/feed/feed-transparency.service.ts` (229 lines)
**Dependencies:** PrismaService only

### ISLAMIC_TAGS constant (line 45-49)
```typescript
static readonly ISLAMIC_TAGS = new Set([
  'quran', 'hadith', 'sunnah', 'islam', 'muslim', 'dua', 'salah', 'ramadan',
  'jummah', 'eid', 'hajj', 'umrah', 'zakat', 'sadaqah', 'dawah', 'seerah',
  'tafsir', 'fiqh', 'aqeedah', 'dhikr', 'halal', 'masjid', 'islamic',
]);
// 23 hashtags (subset of PersonalizedFeedService's 29)
// Missing from this set vs PersonalizedFeedService: tawbah, hijab, alhamdulillah, subhanallah, mashallah, bismillah
```

### `explainPost(userId, postId)` — line 51-121
- **Purpose:** Generate human-readable reasons for why a post appeared in feed
- **Reason sources (checked in order):**
  1. **Follow:** `follow.findUnique()` → "Posted by @{username}, who you follow"
  2. **High engagement:** `likesCount > 100` → "Popular post with {n} likes"
  3. **Moderate engagement:** `likesCount > 10` → "Engaging post in your network"
  4. **Islamic content:** hashtag match → "Islamic content — boosted for the community"
  5. **Hashtags:** Content regex `/#\w+/g` → "Tagged with #tag1, #tag2" (only if NOT Islamic)
  6. **Recency:** `ageHours < 4` → "Recently posted"
  7. **Interests:** `userInterest.findMany()` → "Matches your interests"
  8. **Default:** "Recommended for you"
- **Cap:** 3 reasons maximum (line 120)

### `explainThread(userId, threadId)` — line 123-158
- **Purpose:** Explain thread placement
- **Reasons:** Follow, trending (likesCount > 50), hashtags, default
- **Cap:** 3 reasons maximum

### `enhancedSearch(query, cursor?, limit, userId?)` — line 160-228
- **Purpose:** Enhanced keyword search across posts
- **Keyword parsing:** Split by whitespace, filter words < 2 chars (line 166-169)
- **Search method:** Prisma `contains` with `mode: 'insensitive'` (OR across keywords)
- **Block/mute filtering:** Same bidirectional block pattern when authenticated
- **Sort:** `likesCount: 'desc'`
- **Pagination:** Prisma cursor-based (`cursor: { id }, skip: 1`)
- **Output:** `EnhancedSearchResult { data, meta: { cursor, hasMore } }`

---

## 6. EmbeddingsService — Vector Operations

**File:** `apps/api/src/modules/embeddings/embeddings.service.ts` (551 lines)
**Dependencies:** PrismaService, ConfigService

### Constants (line 23-24)
```typescript
private readonly MODEL = 'text-embedding-004';   // Gemini model
private readonly DIMENSION = 768;                 // Vector dimensions
```

### Configuration (line 26-42)
- Reads `GEMINI_API_KEY` from ConfigService
- If not set: logs warning, disables all embedding features (`apiAvailable = false`)
- API key passed as URL query parameter (Google's required method)
- Security warning about not logging full URLs to prevent key leakage

### `generateEmbedding(text)` — line 48-81
- **Input validation:** Returns null for empty/whitespace-only text
- **Text truncation:** 32,000 chars (~8K tokens, Gemini embedding limit) (line 53)
- **API call:**
  ```
  POST https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={apiKey}
  Body: { model: "models/text-embedding-004", content: { parts: [{ text }] }, outputDimensionality: 768 }
  ```
- **Timeout:** 30,000ms (line 67)
- **Error handling:** Returns null on API error, network failure, or malformed response

### `generateBatchEmbeddings(texts)` — line 86-118
- **API endpoint:** `batchEmbedContents`
- **Timeout:** 60,000ms (double single embed)
- **Returns:** Array of vectors (or null for each on failure)

### `buildContentText(content)` — line 123-136
- **Combines:** text + hashtags (space-joined) + locationName + category
- **Used for:** Building text representation before embedding

### `storeEmbedding(contentId, contentType, vector, metadata?)` — line 141-156
- **SQL (pgvector):**
  ```sql
  INSERT INTO embeddings (id, "contentId", "contentType", vector, metadata, "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), $contentId, $contentType::"EmbeddingContentType", $vectorStr::vector, $metaJson::jsonb, NOW(), NOW())
  ON CONFLICT ("contentId", "contentType")
  DO UPDATE SET vector = $vectorStr::vector, metadata = $metaJson::jsonb, "updatedAt" = NOW()
  ```
- **Upsert pattern:** ON CONFLICT updates existing embedding

### `embedPost(postId)` — line 161-181
- Fetches post: `{ id, content, hashtags, mentions, locationName }`
- Builds text via `buildContentText()`
- Generates embedding + stores with metadata `{ hashtags }`

### `embedReel(reelId)` — line 186-206
- Fetches reel: `{ id, caption, hashtags, mentions, audioTitle }`
- `audioTitle` goes into `category` field of buildContentText

### `embedThread(threadId)` — line 211-230
- Fetches thread: `{ id, content, hashtags, mentions }`

### `embedVideo(videoId)` — line 235-254
- Fetches video: `{ id, title, description, tags, category }`
- Text: `"${title} ${description || ''}"`
- Metadata: `{ tags, category }`

### `validateFilterTypes(filterTypes?)` — line 257-261 (private)
- **SQL injection prevention:** Filters against `Object.values(EmbeddingContentType)` whitelist
- Only allows: POST, REEL, THREAD, VIDEO

### `validateIds(ids?)` — line 264-268 (private)
- **SQL injection prevention:** Pattern `/^[a-zA-Z0-9_-]+$/`
- Rejects IDs with spaces, quotes, semicolons, parentheses, etc.

### `findSimilar(contentId, contentType, limit, filterTypes?)` — line 278-305
- **Purpose:** Find similar content to a given content item
- **SQL (pgvector cosine similarity):**
  ```sql
  SELECT e2."contentId", e2."contentType", 1 - (e1.vector <=> e2.vector) AS similarity
  FROM embeddings e1
  JOIN embeddings e2 ON e1.id != e2.id
  WHERE e1."contentId" = $1 AND e1."contentType" = $2::"EmbeddingContentType"
  [AND e2."contentType" IN (...)]
  ORDER BY e1.vector <=> e2.vector
  LIMIT $3
  ```
- **Operator `<=>`:** pgvector cosine distance operator
- **Similarity:** `1 - cosine_distance` (0 = unrelated, 1 = identical)
- **Performance note (line 273-276):** For >100K embeddings, create HNSW index:
  ```sql
  CREATE INDEX embeddings_vector_idx ON embeddings USING hnsw (vector vector_cosine_ops);
  ```

### `findSimilarByVector(vector, limit, filterTypes?, excludeIds?)` — line 310-343
- **Purpose:** Find similar content given a raw vector (for user interest matching)
- **SQL:**
  ```sql
  SELECT "contentId", "contentType", 1 - (vector <=> $1::vector) AS similarity
  FROM embeddings
  [WHERE conditions...]
  ORDER BY vector <=> $1::vector
  LIMIT $2
  ```
- **Conditions built dynamically:** type filter + exclude IDs

### `getUserInterestVector(userId)` — line 356-419
- **Purpose:** Compute multi-cluster interest vectors using k-means
- **Returns null when:** API not available, no interactions, no embedding rows
- **Queries (line 361-373):**
  - Last 50 interactions where `liked OR saved OR viewDurationMs >= 5000`
  - Ordered by `createdAt: 'desc'`
- **Vector fetching (line 380-385):**
  ```sql
  SELECT vector::text AS vector_text FROM embeddings WHERE "contentId" = ANY($1)
  ```
- **Vector parsing (line 391-399):**
  - Strips brackets, splits by comma, maps to Number
  - NaN values replaced with 0 (`Number.isFinite(v) ? v : 0`)
- **Clustering decision (line 404-411):**
  - < 5 vectors: single centroid (average)
  - >= 5 vectors: k-means with `k = min(3, ceil(count / 5))`
    - 5-9 vectors → k=1 (ceil(5/5)=1, ceil(9/5)=2)
    - 10-14 vectors → k=2
    - 15+ vectors → k=3

### `findSimilarByMultipleVectors(vectors, limit, filterTypes?, excludeIds?)` — line 425-459
- **Purpose:** Query each centroid independently, merge results
- **Single centroid:** Delegates directly to `findSimilarByVector`
- **Multiple centroids:**
  - Per-centroid limit: `ceil(limit / vectors.length) + ceil(limit * 0.2)` (20% extra)
  - Parallel queries via `Promise.all`
  - Merge: keeps highest similarity per contentId
  - Sort by similarity descending, slice to limit

### `kMeansClustering(vectors, k, maxIterations=10)` — line 468-510
- **See Section 13 for complete details**

### `cosineDistance(a, b)` — line 516-532
- Returns `1 - dot(a,b) / (|a| * |b|)`
- Returns 1.0 for zero-magnitude or mismatched-dimension vectors

### `averageVectors(vectors)` — line 538-550
- Element-wise average
- Returns copy for single vector (no aliasing)

---

## 7. EmbeddingPipelineService — Backfill System

**File:** `apps/api/src/modules/embeddings/embedding-pipeline.service.ts` (187 lines)
**Dependencies:** PrismaService, EmbeddingsService

### Constants
```typescript
private readonly BATCH_SIZE = 20;  // line 10
private isRunning = false;          // Concurrency guard (line 9)
```

### `backfillAll()` — line 21-46
- **Concurrency:** `isRunning` flag prevents parallel runs
- **Order:** Posts → Reels → Threads → Videos (sequential)
- **Returns:** `{ posts: number, reels: number, threads: number, videos: number }`

### `backfillPosts()` — line 59-86 (private)
- **SQL (NOT EXISTS for efficient filtering):**
  ```sql
  SELECT p.id FROM "Post" p
  WHERE p."isRemoved" = false AND p."visibility" = 'PUBLIC' AND p."content" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e."contentId" = p.id AND e."contentType" = 'POST')
  ORDER BY p."createdAt" DESC
  LIMIT $1
  ```
- **Rate limiting:** 100ms sleep between each embed (line 79)
- **Batched:** Processes BATCH_SIZE (20) items at a time

### `backfillReels()` — line 88-112
- Filter: `isRemoved = false AND status = 'READY'`

### `backfillThreads()` — line 114-138
- Filter: `isRemoved = false AND visibility = 'PUBLIC'`

### `backfillVideos()` — line 140-164
- Filter: `status = 'PUBLISHED'`

### `embedNewContent(contentId, contentType)` — line 169-182
- **Purpose:** Embed a single piece of content on creation
- Switches on contentType to call appropriate embed method

---

## 8. RecommendationsService — Content Recommendations

**File:** `apps/api/src/modules/recommendations/recommendations.service.ts` (778 lines)
**Dependencies:** PrismaService, EmbeddingsService

### Select Constants (line 6-148)
- `POST_SELECT` (line 6-40): Full post select including user + circle
- `THREAD_SELECT` (line 42-93): Full thread select including user + circle + poll + repostOf
- `REEL_SELECT` (line 95-124): Full reel select including user
- `CHANNEL_SELECT` (line 126-148): Full channel select including user

### `getExcludedUserIds(userId)` — line 167-189 (private)
- Blocks (bidirectional, take 50) + Mutes (take 50)
- Note: Does NOT include restricts (unlike FeedService and PersonalizedFeedService)

### `multiStageRank(userId, contentType, limit)` — line 198-312 (private)

**3-stage ranking pipeline:**

#### Stage 1: Candidate Generation (line 204-227)
- Gets user interest centroids via `embeddingsService.getUserInterestVector()`
- Gets excluded user IDs
- Gets seen post IDs (last 200 viewed interactions)
- KNN search: `findSimilarByMultipleVectors(centroids, 500, [contentType], [...seenSet])`

#### Stage 2: Scoring (line 229-249)
```
finalScore = similarity * 0.4 + engagement.score * 0.35 + recencyScore * 0.25
```
**Note:** Different weights from PersonalizedFeedService!
- Similarity: **40%** (vs 35% in PersonalizedFeed)
- Engagement: **35%** (vs 25% in PersonalizedFeed)
- Recency: **25%** (vs 15% in PersonalizedFeed)
- **No Islamic boost** (0%)
- **No session boost** (0%)

Recency decay: `max(0, 1 - ageHours / 168)` — 7-day linear decay

#### Stage 3: Diversity Reranking (line 251-301)
Two-pass diversity:

**Pass 1 — Author dedup (line 259-274):**
- No same author back-to-back
- Skipped items appended at end

**Pass 2 — Hashtag diversity (line 277-299):**
- Maintains `recentHashtags` sliding window of last 6 tags
- If post has 2+ tags overlapping with recent window → deferred
- Deferred items backfilled at end

#### Error handling (line 302-311)
- Critical errors (SQL, null pointer) re-thrown
- Non-critical (embeddings unavailable) → returns empty array (falls back to engagement sort)

### `getEngagementScores(contentIds, contentType)` — line 314-357 (private)
- **Post formula:** `(likes + comments*2 + shares*3 + saves*2) / views * 10`, capped at 1
- **Reel formula:** `(likes + comments*2 + shares*3) / views * 10`, capped at 1 (NO saves)
- **Thread formula:** `(likes + replies*2 + reposts*3) / views * 10`, capped at 1

### Exploration System (line 395-507)

#### `getExplorationPosts(excludedUserIds, userId?, count)` — line 401-425
- **Freshness window:** 6 hours
- **View threshold:** < 100 views
- **Filters:** `isRemoved: false`, `visibility: PUBLIC`, `scheduledAt: null OR lte now`, `user.isDeactivated: false, isPrivate: false`
- **Sort:** `createdAt: 'desc'`

#### `getExplorationReels(excludedUserIds, userId?, count)` — line 430-454
- Same criteria + `status: READY`, `scheduledAt` OR filter

#### `getExplorationThreads(excludedUserIds, userId?, count)` — line 459-484
- Same criteria + `visibility: 'PUBLIC'`, `isChainHead: true`

#### `interleaveExploration(mainResults, explorationItems)` — line 490-507
- **Insertion pattern:** Every ~7th position
  ```typescript
  const insertAt = Math.min((i + 1) * 7, result.length);
  result.splice(insertAt, 0, item);
  ```
  - First exploration item at position 7
  - Second at position 14
  - Third at position 21
- **Deduplication:** Removes exploration items already in main results

### Public Methods

#### `suggestedPeople(userId?, limit)` — line 511-584
- **Unauthenticated:** Popular users sorted by `followersCount: 'desc'`
- **Authenticated:** Friends-of-friends algorithm
  - Gets user's following (take 200)
  - Gets follows of followings (excluding already-followed, self, blocked/muted)
  - Counts mutual connections per candidate
  - Sorts by mutual count descending
- **Output:** Users with `mutualFollowers` count appended

#### `suggestedPosts(userId?, limit)` — line 586-643
- **Exploration slots:** `ceil(limit * 0.15)` = 15% of total
- **Main slots:** `limit - explorationCount`
- **Authenticated path:** `multiStageRank()` → hydrate → interleave exploration
- **Fallback:** Engagement-sorted posts from last 48 hours
  - Sort: `likesCount desc → commentsCount desc → sharesCount desc → createdAt desc`

#### `suggestedReels(userId?, limit)` — line 645-702
- Same pattern as suggestedPosts
- **Fallback window:** 72 hours (not 48 like posts)
- **Sort:** `viewsCount desc → likesCount desc → commentsCount desc → createdAt desc`

#### `suggestedChannels(userId?, limit)` — line 704-727
- **No pgvector ranking** — simple engagement sort
- **Sort:** `subscribersCount desc → totalViews desc`
- **No exploration slots**

#### `suggestedThreads(userId?, limit)` — line 732-777
- Same pattern as suggestedPosts
- **Fallback window:** 48 hours
- **Sort:** `likesCount desc → repliesCount desc → createdAt desc`

---

## 9. RecommendationsController

**File:** `apps/api/src/modules/recommendations/recommendations.controller.ts` (73 lines)
**Swagger Tag:** `Recommendations`
**Base Path:** `/api/v1/recommendations`

| Method | Path | Auth | Throttle | Handler | Line |
|--------|------|------|----------|---------|------|
| GET | `/recommendations/people` | OptionalClerkAuthGuard | 20/min | `suggestedPeople()` | 14-24 |
| GET | `/recommendations/posts` | OptionalClerkAuthGuard | 20/min | `suggestedPosts()` | 26-36 |
| GET | `/recommendations/reels` | OptionalClerkAuthGuard | 20/min | `suggestedReels()` | 38-48 |
| GET | `/recommendations/channels` | OptionalClerkAuthGuard | 20/min | `suggestedChannels()` | 50-60 |
| GET | `/recommendations/threads` | OptionalClerkAuthGuard | 20/min | `suggestedThreads()` | 62-72 |

All endpoints: `limit` clamped to [1, 50], default 20.

---

## 10. Scoring Formulas — Complete Reference

### Formula 1: Trending Feed Engagement Rate (FeedService)
```
ageHours = max(1, (scoreTimestamp - createdAt) / 3600000)
engagementTotal = likes*1 + comments*2 + shares*3 + saves*2
score = engagementTotal / ageHours
```
**Used in:** `FeedService.getTrendingFeed()` (line 281-289)

### Formula 2: Trending Decay (PersonalizedFeedService)
```
ageHours = (now - createdAt) / (1000 * 60 * 60)
engagementScore = log10(max(engagementCount, 1) + 1) / 5
decayFactor = ageHours <= 12 ? 1.0 : max(0.5, 1.0 - (ageHours - 12) / 24)
score = engagementScore * decayFactor
```
**Used in:** `PersonalizedFeedService.applyTrendingDecay()` (line 619-626)

### Formula 3: Personalized Feed Composite Score
```
score = similarity * 0.35
      + engagementScore * 0.25
      + recencyScore * 0.15
      + islamicBoost * 0.15
      + sessionBoost * 0.10
```
**Weights:** 35% / 25% / 15% / 15% / 10%
**Used in:** `PersonalizedFeedService.getPersonalizedFeed()` (line 310-331)

### Formula 4: Recommendations Composite Score
```
finalScore = similarity * 0.4 + engagement * 0.35 + recency * 0.25
```
**Weights:** 40% / 35% / 25%
**Used in:** `RecommendationsService.multiStageRank()` (line 244)

### Formula 5: Engagement Rate (shared)
```
total = likes + comments*2 + shares*3
rate = views > 0 ? total / views : 0
engagementScore = min(rate * 10, 1)
```
**Used in:** Both PersonalizedFeedService (line 649-653) and RecommendationsService (line 314-357)
**Note:** Post engagement in RecommendationsService also includes `saves*2`

### Formula 6: Recency Score
```
recencyScore = max(0, 1 - ageHours / 168)
```
**Linear decay over 7 days (168 hours)**

### Formula 7: User Interest Weight (FeedService)
```
w = (liked ? 2) + (commented ? 3) + (shared ? 4) + (saved ? 3) + min(viewDurationMs / 10000, 5)
```
**Used in:** `FeedService.getUserInterests()` (line 121)

### Formula 8: Session Boost
```
boost = sum(likedCategories[tag] * 0.05) for matching tags
boost = min(boost, 0.3)
```
**5% per in-session like of same category, capped at 30%**

---

## 11. Redis Keys

| Key Format | TTL | Purpose | Module | Line |
|-----------|-----|---------|--------|------|
| `session:{userId}` | 1800s (30 min) | Session data (likedCategories, viewedIds, sessionStart, scrollDepth) | PersonalizedFeedService | 47 |
| `trending_feed:{cursor\|'first'}:{limit}` | 300s (5 min) | Cached trending feed for unauthenticated users | FeedService | 217, 331 |

### Session Key Details
- **Storage type:** Redis hash
- **Fields:** Single field `json` containing serialized JSON
- **TTL renewal:** On every write (trackSessionSignal or getPersonalizedFeed)
- **Session reset:** New session created if `Date.now() - sessionStart > 30 * 60 * 1000` (line 113)
- **Max viewedIds:** 1000 (line 35, checked at line 124)

### Trending Cache Details
- **Cache hit:** Authenticated users bypass cache entirely (line 217)
- **Corrupted cache:** Falls through to recompute (try/catch around JSON.parse, line 222)
- **Cache key includes cursor:** Different cache per page

---

## 12. Islamic Boost — Complete Reference

**Source:** `PersonalizedFeedService.getIslamicBoost()` (line 159-208)

### Islamic Hashtags (29 total, line 24-29)
```
quran, hadith, sunnah, islam, muslim, dua, salah, ramadan,
jummah, eid, hajj, umrah, zakat, sadaqah, dawah, seerah,
tafsir, fiqh, aqeedah, dhikr, tawbah, hijab, halal, masjid,
islamic, alhamdulillah, subhanallah, mashallah, bismillah
```

### Hashtag Matching (line 160-163)
- Case-insensitive: `tag.toLowerCase()`
- Strips leading `#`: `.replace('#', '')`
- Exact match against Set (NOT substring — 'islamabad' does NOT match 'islam')
- Returns 0 if NO hashtag matches

### Boost Calculation

| Condition | Boost Amount | Cumulative Max |
|-----------|-------------|----------------|
| Any Islamic hashtag present | +0.10 (base) | 0.10 |
| Friday (any time, dayOfWeek === 5) | +0.15 | 0.25 |
| Friday 11:00-14:00 (Jummah window) | +0.10 extra | 0.35 |
| Within ±30 min of prayer time | +0.10 | 0.45 |
| During Ramadan period | +0.20 | 0.50 (cap) |
| **Maximum possible boost** | | **0.50** |

### Prayer Time Window Detection

**Location-aware path (when lat/lng provided, line 180-189):**
- Calls `calculatePrayerTimes(now, userLat, userLng)` from prayer-calculator
- Gets 5 prayer times: fajr, dhuhr, asr, maghrib, isha
- Each prayer time parsed to fractional hours via `parseTimeToHours("HH:MM")`
- Window: `Math.abs(currentTimeInHours - prayerHour) <= 0.5` (±30 minutes)

**Fallback path (no coordinates, line 191-200):**
```
Fajr:    4:00 - 6:00
Dhuhr:   12:00 - 13:00
Asr:     15:00 - 16:00
Maghrib: 18:00 - 19:00
Isha:    20:00 - 21:00
```

### Ramadan Detection (line 216-244)

**Known dates lookup table:**
```
2026: Feb 18 start
2027: Feb 8 start
2028: Jan 28 start
2029: Jan 16 start
2030: Jan 6 start
2031: Dec 26 start
```
Duration: 30 days from start.

**Approximation for years beyond table:**
```
baseStart = new Date(2026, 1, 18)  // Feb 18, 2026
yearDiff = year - 2026
approxStart = baseStart - yearDiff * 10.87 days
approxEnd = approxStart + 30 days
```

### FeedTransparencyService Islamic Tags (23 total, line 45-49)
**Subset** — missing 6 tags present in PersonalizedFeedService:
`tawbah, hijab, alhamdulillah, subhanallah, mashallah, bismillah`

---

## 13. K-Means Clustering — Complete Reference

**Source:** `EmbeddingsService.kMeansClustering()` (line 468-510)

### Parameters
- `vectors: number[][]` — input embedding vectors
- `k: number` — number of clusters
- `maxIterations: number = 10` — convergence limit

### Algorithm

1. **Edge cases:**
   - `k <= 0` or empty vectors → return `[]`
   - `k >= vectors.length` → return each vector as its own cluster

2. **Initialization (line 473-474):**
   - Pick k evenly-spaced vectors from input
   - `step = floor(vectors.length / k)`
   - Centroids: `vectors[0], vectors[step], vectors[2*step], ...`

3. **Iteration loop (line 478-507):**
   - Reset clusters
   - **Assignment:** Each vector assigned to nearest centroid (cosine distance)
   - **Update:** Recompute centroids as element-wise average of cluster members
   - Empty clusters keep their old centroid
   - **Convergence check:** All centroids moved < 0.001 cosine distance

### Clustering Decision in getUserInterestVector (line 404-411)
```
if vectors.length < 5 → single centroid (average)
if vectors.length >= 5 → k = min(3, ceil(count / 5))
```

| Vector Count | k Value | Centroids |
|-------------|---------|-----------|
| 1-4 | 1 (skip k-means) | 1 (average) |
| 5-9 | 1-2 | 1-2 |
| 10-14 | 2 | 2 |
| 15-24 | 3 | 3 |
| 25-50 | 3 (capped) | 3 |

### Multi-Centroid Query (findSimilarByMultipleVectors, line 425-459)
- Per-centroid limit: `ceil(limit / centroids.length) + ceil(limit * 0.2)`
- Example: limit=500, 3 centroids → per-centroid = ceil(500/3) + ceil(500*0.2) = 167 + 100 = 267
- Merge: Deduplicate by contentId, keep highest similarity
- Final sort by similarity descending, slice to limit

---

## 14. Pagination Patterns

### Pattern 1: Score-based Keyset (FeedService.getTrendingFeed)
**Cursor format:** `score:id:timestamp`
- `score`: float engagement rate
- `id`: post ID for tiebreaking
- `timestamp`: reference time for consistent scoring across pages
- **Epsilon tolerance:** 1e-9 for float comparison
- **Fetch strategy:** Get 200 candidates, score all, cursor-filter in memory

### Pattern 2: ID Cursor (FeedService.getFeaturedFeed)
**Cursor format:** post ID
- `where: { id: { lt: cursor } }`
- Combined with `orderBy: { featuredAt: 'desc' }`
- Standard `limit + 1` for hasMore detection

### Pattern 3: Prisma Cursor (FeedTransparencyService.enhancedSearch)
**Cursor format:** post ID
- Uses Prisma's built-in cursor: `{ cursor: { id: cursor }, skip: 1 }`
- Combined with `orderBy: { likesCount: 'desc' }`

### Pattern 4: ISO Timestamp Cursor (FeedService.getNearbyContent)
**Cursor format:** ISO 8601 string
- `where: { createdAt: { lt: new Date(cursor) } }`

### Pattern 5: Simple ID Cursor (PersonalizedFeedService.getTrendingFeed)
**Cursor format:** last item ID
- `where: { id: { lt: cursor } }`
- Same as Pattern 2

### Pattern 6: Score-based (PersonalizedFeedService.getPersonalizedFeed)
**Cursor format:** last item ID
- Items scored in memory, cursor is last served item ID
- Session viewedIds prevent re-serving across pages

---

## 15. Content Filtering & Safety

### Block/Mute/Restrict Exclusion
All three services implement similar exclusion patterns:

| Service | Blocks | Mutes | Restricts | Take Limit |
|---------|--------|-------|-----------|------------|
| FeedService | Bidirectional | Yes | Yes | 50 each |
| PersonalizedFeedService | Bidirectional | Yes | Yes | 50 each |
| RecommendationsService | Bidirectional | Yes | **No** | 50 each |
| FeedTransparencyService (search) | Bidirectional | Yes | **No** | 50 each |

### Content Filter Settings (FeedService only)
- `hideMusic: true` → exclude posts with `audioTrackId`
- `strictnessLevel: 'STRICT' | 'FAMILY'` → exclude posts with `contentWarning`

### Post Visibility Filtering
All feed queries include:
- `isRemoved: false`
- `visibility: PostVisibility.PUBLIC` (or `'PUBLIC'` for threads)
- `scheduledAt: null OR scheduledAt <= now` (session 5 fix)
- `user.isDeactivated: false`
- `user.isPrivate: false` (for trending/suggestions)

### Content Type Specific
- **Reels:** `status: ReelStatus.READY`, `isTrial: false` (for editorial picks)
- **Threads:** `isChainHead: true`, `visibility: 'PUBLIC'`
- **Videos:** `status: 'PUBLISHED'`

---

## 16. Test Coverage

### Test Files & Counts

| File | Tests | Lines |
|------|-------|-------|
| `feed.controller.spec.ts` | ~25 | 183 |
| `feed.service.spec.ts` | ~30 | 497 |
| `personalized-feed.service.spec.ts` | ~40 | 657 |
| `feed-transparency.service.spec.ts` | ~25 | 268 |
| `embeddings.service.spec.ts` | ~45 | 717 |
| `embeddings.service.security.spec.ts` | ~15 | 254 |
| `embedding-pipeline.service.spec.ts` | ~10 | 129 |
| `embeddings.controller.spec.ts` | ~5 | 76 |
| `recommendations.service.spec.ts` | ~40 | 768 |
| `recommendations.controller.spec.ts` | ~10 | 97 |
| **Total** | **~245** | **~3,646** |

### Key Test Categories
- Algorithm correctness (scoring formulas, decay, boost calculations)
- Redis session storage (creation, expiry, cap, deduplication)
- Cold start path routing
- Block/mute/restrict filtering (bidirectional)
- Pagination (cursor format, no duplicates across pages)
- SQL injection prevention (filterTypes + excludeIds)
- K-means clustering (convergence, edge cases)
- Multi-centroid vector search (merge, dedup, limit)
- Exploration interleaving (position, dedup)
- Hashtag diversity reranking

---

## 17. DTOs

### LogInteractionDto (`dto/log-interaction.dto.ts`, 20 lines)
```typescript
postId: string                          // @IsString
space: 'SAF' | 'BAKRA' | 'MAJLIS' | 'MINBAR'  // @IsEnum, auto-uppercased via @Transform
viewed?: boolean                        // @IsBoolean @IsOptional
viewDurationMs?: number                 // @IsNumber @Min(0) @Max(3600000) — max 1 hour
completionRate?: number                 // @IsNumber @Min(0) @Max(1) — 0-100%
liked?: boolean
commented?: boolean
shared?: boolean
saved?: boolean
```

### TrackSessionSignalDto (`dto/track-session-signal.dto.ts`, 24 lines)
```typescript
contentId: string                       // @IsString
action: 'view' | 'like' | 'save' | 'share' | 'skip'  // @IsEnum
hashtags?: string[]                     // @IsOptional @ArrayMaxSize(30)
scrollPosition?: number                 // @IsOptional @Min(0) @Max(100000)
```

### FeaturePostDto (`dto/feature-post.dto.ts`, 8 lines)
```typescript
featured: boolean                       // @IsBoolean
```

---

## 18. Cross-Module Dependency Graph

```
FeedController
  ├── FeedService (Redis, Prisma)
  │   ├── logInteraction
  │   ├── dismiss / undismiss
  │   ├── getTrendingFeed (Redis cached)
  │   ├── getFeaturedFeed
  │   ├── getSuggestedUsers
  │   ├── getFrequentCreators
  │   ├── getNearbyContent
  │   └── featurePost (admin)
  │
  ├── FeedTransparencyService (Prisma)
  │   ├── explainPost
  │   ├── explainThread
  │   └── enhancedSearch
  │
  └── PersonalizedFeedService (Redis, Prisma, EmbeddingsService)
      ├── getPersonalizedFeed
      │   ├── getUserInterestVector (→ EmbeddingsService)
      │   ├── findSimilarByMultipleVectors (→ EmbeddingsService)
      │   ├── getIslamicBoost (→ prayer-calculator)
      │   ├── getSessionBoostFromData (← Redis session)
      │   └── hydrateItems (→ Prisma)
      └── trackSessionSignal (→ Redis)

EmbeddingsController
  └── EmbeddingPipelineService
      └── backfillAll → EmbeddingsService.embed{Post|Reel|Thread|Video}

RecommendationsController
  └── RecommendationsService (Prisma, EmbeddingsService)
      ├── suggestedPeople (friends-of-friends)
      ├── suggestedPosts (multiStageRank → EmbeddingsService)
      ├── suggestedReels (multiStageRank → EmbeddingsService)
      ├── suggestedChannels (no pgvector)
      └── suggestedThreads (multiStageRank → EmbeddingsService)

EmbeddingsService (Prisma, ConfigService/GEMINI_API_KEY)
  ├── generateEmbedding → Gemini text-embedding-004
  ├── generateBatchEmbeddings → Gemini batch API
  ├── storeEmbedding → pgvector INSERT/UPSERT
  ├── embed{Post|Reel|Thread|Video} → fetch + embed + store
  ├── findSimilar → pgvector KNN (content → content)
  ├── findSimilarByVector → pgvector KNN (vector → content)
  ├── findSimilarByMultipleVectors → multi-centroid merge
  ├── getUserInterestVector → k-means clustering
  ├── kMeansClustering → pure computation
  ├── cosineDistance → pure computation
  └── averageVectors → pure computation
```

---

## 19. Constants & Magic Numbers — Master List

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| ISLAMIC_HASHTAGS count | 29 | personalized-feed.service.ts:24-29 | Islamic content detection |
| FeedTransparency ISLAMIC_TAGS count | 23 | feed-transparency.service.ts:45-49 | Transparency explainability |
| MAX_VIEWED_IDS | 1000 | personalized-feed.service.ts:35 | Session viewed ID cap |
| SESSION_TTL | 1800 (30 min) | personalized-feed.service.ts:36 | Redis session expiry |
| Trending cache TTL | 300 (5 min) | feed.service.ts:331 | Unauthenticated trending cache |
| Trending window (FeedService) | 7 days | feed.service.ts:229 | Trending candidate pool |
| Trending window (PersonalizedFeed) | 24 hours | personalized-feed.service.ts:504 | Per-space trending |
| Candidate pool size | 200 | feed.service.ts:275 | Trending feed candidate fetch |
| KNN candidate limit | 500 | personalized-feed.service.ts:288, recommendations.service.ts:220 | pgvector KNN top-k |
| Cold start threshold | 10 interactions | personalized-feed.service.ts:272 | When to use cold start feed |
| Cold start trending ratio | 70% | personalized-feed.service.ts:410 | Trending portion of cold start |
| Cold start Islamic ratio | 30% | personalized-feed.service.ts:413 | Islamic editorial portion |
| Cold start shuffle ratio | 30% | personalized-feed.service.ts:426 | Partial Fisher-Yates swaps |
| Exploration slot percentage | 15% | recommendations.service.ts:591, 649, 736 | New creator discovery |
| Exploration freshness window | 6 hours | recommendations.service.ts:407 | Max age for exploration |
| Exploration view threshold | < 100 | recommendations.service.ts:410 | Max views for exploration |
| Exploration insert interval | Every 7th position | recommendations.service.ts:503 | Interleave frequency |
| Frequent creator threshold | 10 interactions | feed.service.ts:522 | Min interactions to qualify |
| Frequent creator window | 7 days | feed.service.ts:510 | Time window for counting |
| Interaction fetch limit | 200 | feed.service.ts:109 | getUserInterests |
| Interest vector interactions | 50 | embeddings.service.ts:372 | getUserInterestVector |
| Min vectors for clustering | 5 | embeddings.service.ts:405 | Below = single centroid |
| Max k (centroids) | 3 | embeddings.service.ts:410 | K-means max clusters |
| K-means max iterations | 10 | embeddings.service.ts:468 | Convergence limit |
| K-means convergence threshold | 0.001 | embeddings.service.ts:503 | Cosine distance threshold |
| Gemini model | text-embedding-004 | embeddings.service.ts:23 | Embedding model |
| Embedding dimensions | 768 | embeddings.service.ts:24 | Vector size |
| Text truncation limit | 32,000 chars | embeddings.service.ts:53 | ~8K tokens |
| Single embed timeout | 30,000ms | embeddings.service.ts:67 | API timeout |
| Batch embed timeout | 60,000ms | embeddings.service.ts:103 | API timeout |
| Backfill batch size | 20 | embedding-pipeline.service.ts:10 | Items per batch |
| Backfill rate limit sleep | 100ms | embedding-pipeline.service.ts:79 | Between each embed |
| Trending score epsilon | 1e-9 | feed.service.ts:299 | Float comparison tolerance |
| Trending decay no-decay period | 12 hours | personalized-feed.service.ts:624 | No decay zone |
| Trending decay floor | 0.5 | personalized-feed.service.ts:624 | Minimum decay factor |
| Log engagement normalization | /5 | personalized-feed.service.ts:622 | log10(n+1)/5 |
| Recency decay period | 168 hours (7 days) | personalized-feed.service.ts:320, recommendations.service.ts:236 | Linear decay to 0 |
| Session boost per like | 0.05 (5%) | personalized-feed.service.ts:147 | Per in-session category like |
| Session boost cap | 0.30 (30%) | personalized-feed.service.ts:149 | Maximum session boost |
| Islamic base boost | 0.10 (10%) | personalized-feed.service.ts:171 | Always for Islamic content |
| Islamic Friday boost | +0.15 | personalized-feed.service.ts:175 | Additional on Fridays |
| Islamic Friday Jummah extra | +0.10 | personalized-feed.service.ts:176 | 11:00-14:00 Friday |
| Islamic prayer time boost | +0.10 | personalized-feed.service.ts:189, 200 | Within ±30 min of prayer |
| Islamic Ramadan boost | +0.20 | personalized-feed.service.ts:205 | During Ramadan period |
| Islamic boost cap | 0.50 (50%) | personalized-feed.service.ts:207 | Maximum Islamic boost |
| Prayer window tolerance | ±30 min (0.5h) | personalized-feed.service.ts:187 | Prayer time proximity |
| Ramadan duration | 30 days | personalized-feed.service.ts:232 | Fixed duration estimate |
| Lunar cycle shift | 10.87 days/year | personalized-feed.service.ts:241 | For year approximation |
| Dismiss IDs limit | 1000 | feed.service.ts:100 | Max dismissed per type |
| Block/mute/restrict fetch | 50 each | Multiple locations | Safety filter limit |
| Max seen interactions | 200 | recommendations.service.ts:214 | Exclude seen content |
| Hashtag diversity window | 6 tags | recommendations.service.ts:284 | Recent tag tracking |
| Hashtag overlap threshold | 2 tags | recommendations.service.ts:287 | Defer if >= 2 overlap |
| Fallback post window | 48 hours | recommendations.service.ts:619 | Engagement fallback |
| Fallback reel window | 72 hours | recommendations.service.ts:679 | Engagement fallback |
| Fallback thread window | 48 hours | recommendations.service.ts:764 | Engagement fallback |
| Multi-centroid extra limit | 20% | embeddings.service.ts:439 | Extra candidates per centroid |
| Explainability reasons cap | 3 | feed-transparency.service.ts:120 | Max reasons per explanation |
| Explainability popular threshold | 100 likes | feed-transparency.service.ts:83 | "Popular post" threshold |
| Explainability engaging threshold | 10 likes | feed-transparency.service.ts:85 | "Engaging post" threshold |
| Explainability trending thread | 50 likes | feed-transparency.service.ts:147 | "Trending thread" threshold |
| Explainability recent threshold | 4 hours | feed-transparency.service.ts:105 | "Recently posted" threshold |
| Search min word length | 2 chars | feed-transparency.service.ts:169 | Keyword filter |
| Default limit | 20 | Multiple locations | Standard page size |
| Max limit | 50 | Multiple controllers | Clamped upper bound |
| Nearby default radius | 25 km | feed.controller.ts:226 | Default search radius |
| Nearby max radius | 500 km | feed.controller.ts:226 | Clamped upper bound |
| Nearby min radius | 1 km | feed.controller.ts:226 | Clamped lower bound |
| Suggested users default limit | 5 | feed.controller.ts:186 | In-feed suggestion cards |

### Scoring Weight Comparison

| Component | PersonalizedFeed | Recommendations |
|-----------|-----------------|-----------------|
| Similarity | 35% | 40% |
| Engagement | 25% | 35% |
| Recency | 15% | 25% |
| Islamic boost | 15% | 0% |
| Session boost | 10% | 0% |
| **Total** | **100%** | **100%** |

### Engagement Weight Comparison

| Action | FeedService (getTrending) | PersonalizedFeed | Recommendations (Post) | Recommendations (Reel) | Recommendations (Thread) |
|--------|--------------------------|------------------|----------------------|----------------------|------------------------|
| Like | 1x | 1x | 1x | 1x | 1x |
| Comment | 2x | 2x | 2x | 2x | 2x (replies) |
| Share | 3x | 3x | 3x | 3x | 3x (reposts) |
| Save | 2x | — | 2x | — | — |

---

*End of architecture extraction. 741 + 554 + 229 + 551 + 187 + 778 + 73 + 306 = 3,419 lines of source code documented.*
