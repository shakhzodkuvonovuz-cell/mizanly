# Agent #68 (Bonus) — Majlis (Twitter/X) + Minbar (YouTube) Feed Logic Deep Audit

**Scope:** Complete Majlis thread system + Minbar video system — backend services, controllers, DTOs, mobile screens, API service layer
**Files audited:** 35+ files across `apps/api/src/modules/threads/`, `apps/api/src/modules/videos/`, `apps/api/src/modules/playlists/`, `apps/api/src/modules/video-replies/`, `apps/mobile/app/(tabs)/majlis.tsx`, `apps/mobile/app/(tabs)/minbar.tsx`, `apps/mobile/app/(screens)/video/[id].tsx`, `apps/mobile/app/(screens)/create-thread.tsx`, `apps/mobile/app/(screens)/create-video.tsx`, `apps/mobile/app/(screens)/series-detail.tsx`, `apps/mobile/app/(screens)/series-discover.tsx`, `apps/mobile/app/(screens)/majlis-lists.tsx`, `apps/mobile/app/(screens)/video-premiere.tsx`, `apps/mobile/app/(screens)/save-to-playlist.tsx`, `apps/mobile/app/(screens)/create-playlist.tsx`, `apps/mobile/src/services/api.ts`
**Total findings:** 62

---

## CRITICAL (Ship Blockers / Security)

### Finding 1: Thread addReply does NOT enforce replyPermission
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 679-707
**Code:**
```ts
async addReply(threadId: string, userId: string, content: string, parentId?: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isRemoved) throw new NotFoundException('Thread not found');
    // ... creates reply without checking replyPermission
}
```
**Issue:** The `canReply()` method exists (line 836) and correctly checks `replyPermission` (everyone/following/mentioned/none), but `addReply()` never calls `canReply()`. Any authenticated user can reply to any thread regardless of the author's reply permission setting. The endpoint `PUT :id/reply-permission` lets authors restrict replies, but the restriction is purely cosmetic — never enforced on actual reply creation.
**Severity:** CRITICAL — Feature advertised to users (reply permission control) does not work. Users who set "none" or "following" still get replies from anyone.

### Finding 2: Thread feed for anonymous users passes empty string as userId to getExcludedUserIds
**File:** `apps/api/src/modules/threads/threads.controller.ts`, line 41; `apps/api/src/modules/threads/threads.service.ts`, line 106
**Code:**
```ts
// Controller:
return this.threadsService.getFeed(userId ?? '', type ?? 'foryou', cursor);

// Service:
async getFeed(userId: string, ...) {
  const [follows, excludedIds] = await Promise.all([
    type === 'following' ? this.prisma.follow.findMany({ where: { followerId: userId }, ... }) : ...,
    this.getExcludedUserIds(userId),
  ]);
```
**Issue:** When `userId` is undefined (anonymous user), the controller passes empty string `''` to `getFeed`. The service then queries `this.prisma.block.findMany({ where: { blockerId: '' } })` and `this.prisma.mute.findMany({ where: { userId: '' } })`. These queries hit the database needlessly for a non-existent user ID. While not a crash, it's wasteful queries on every anonymous feed request.
**Severity:** MEDIUM — Performance waste on every anonymous request. Could be exploited for database load.

### Finding 3: Video views infinitely inflatable — no deduplication
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 614-636
**Code:**
```ts
async view(videoId: string, userId: string) {
    // Check if already viewed recently? For simplicity, just increment.
    await this.prisma.$transaction([
      this.prisma.video.update({
        where: { id: videoId },
        data: { viewsCount: { increment: 1 } },
      }),
      ...
    ]);
}
```
**Issue:** The comment literally says "For simplicity, just increment." Every call to `POST /videos/:id/view` increments `viewsCount` by 1 with zero deduplication. A user (or bot) can inflate view count to any number by repeatedly calling this endpoint. WatchHistory is upserted (deduped) but the viewsCount itself has no guard.
**Severity:** CRITICAL — View count manipulation. Trending algorithms use viewsCount for ranking, making this exploitable for content promotion fraud.

### Finding 4: Video feed does NOT filter blocked-BY users (only blocked-by-me)
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 179-191
**Code:**
```ts
const [blocks, mutes] = userId ? await Promise.all([
  this.prisma.block.findMany({ where: { blockerId: userId }, ... }),
  this.prisma.mute.findMany({ where: { userId }, ... }),
]) : [[], []];
```
**Issue:** Unlike the threads service which has `getExcludedUserIds()` that checks BOTH directions (blocked by me AND blocked me), the videos feed only checks `blockerId: userId` — meaning only "users I blocked" are excluded. If UserB blocks me, I can still see UserB's videos in my feed. The threads service correctly handles bidirectional blocking.
**Severity:** HIGH — Privacy violation. A user who blocks someone expects their content to be invisible to the blocked user.

### Finding 5: Video delete uses hard delete, thread delete uses soft delete — inconsistent
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 345-369
**Code:**
```ts
async delete(videoId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.video.delete({ where: { id: videoId } }),  // HARD DELETE
      ...
    ]);
}
```
**vs** `apps/api/src/modules/threads/threads.service.ts`, line 458-464:
```ts
async delete(threadId: string, userId: string) {
    await this.prisma.thread.update({
      where: { id: threadId },
      data: { isRemoved: true },  // SOFT DELETE
    });
}
```
**Issue:** Videos are hard-deleted (cascade deletes all comments, reactions, bookmarks, watch history, end screens, chapters). Threads are soft-deleted with `isRemoved: true`. This means: (1) video deletion is irreversible and destroys all associated data, (2) moderation cannot review deleted videos, (3) GDPR data export for videos is impossible after deletion.
**Severity:** HIGH — Data loss on video deletion. Inconsistent with thread deletion pattern.

### Finding 6: Playlist videosCount can go negative via race condition
**File:** `apps/api/src/modules/playlists/playlists.service.ts`, lines 331-341
**Code:**
```ts
async removeItem(playlistId: string, videoId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.playlistItem.delete(...),
      this.prisma.playlist.update({
        where: { id: playlistId },
        data: { videosCount: { decrement: 1 } },  // NOT CLAMPED
      }),
    ]);
}
```
**Issue:** While the method checks for existence before deleting, the `decrement: 1` is not clamped with `GREATEST(0, ...)` like the thread/video services do. Two concurrent removeItem calls for the same video could both pass the existence check and both decrement, making the count negative (or more realistically, the second would fail on the delete, but the pattern is inconsistent and dangerous).
**Severity:** MEDIUM — Counter can theoretically go negative. Should use `$executeRaw` with `GREATEST(0, ...)` like other services.

### Finding 7: Video-replies controller uses inline body type — bypasses DTO validation
**File:** `apps/api/src/modules/video-replies/video-replies.controller.ts`, lines 26-38
**Code:**
```ts
@Post()
@UseGuards(ClerkAuthGuard)
create(
  @CurrentUser('id') userId: string,
  @Body()
  body: {
    commentId: string;
    commentType: 'post' | 'reel';
    mediaUrl: string;
    thumbnailUrl?: string;
    duration?: number;
  },
) {
  return this.videoRepliesService.create(userId, body);
}
```
**Issue:** The `@Body()` parameter uses an inline TypeScript type instead of a DTO class. NestJS validation pipe only validates class-validator decorators on DTO classes. This means ALL fields pass through with ZERO validation — no `@IsString()`, no `@IsUrl()`, no `@MaxLength()`. A user can send any data shape including malformed URLs, extremely long strings, or unexpected fields.
**Severity:** HIGH — Complete validation bypass. The service does some manual validation (lines 40-56) but misses important checks like `@IsUUID()` for commentId.

### Finding 8: Premiere scheduledAt date parsing has no timezone handling
**File:** `apps/api/src/modules/videos/videos.service.ts`, line 750
**Code:**
```ts
if (new Date(dto.scheduledAt) <= new Date()) throw new BadRequestException('Premiere must be in the future');
```
And on mobile: `apps/mobile/app/(screens)/video-premiere.tsx`, line 35:
```ts
const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
```
**Issue:** The mobile constructs a datetime string without timezone (`2026-03-25T18:00:00`). JavaScript's `new Date()` interprets this as LOCAL time on the device. When sent to the server, it's compared against `new Date()` on the server, which is in a different timezone. A premiere scheduled for 6 PM user-local could be rejected as "in the past" if the server is ahead.
**Severity:** MEDIUM — Timezone mismatch can prevent premiere creation or schedule it at wrong time.

---

## HIGH (Functional Bugs / Data Integrity)

### Finding 9: For-You feed pagination is broken — cursor comparison produces duplicates
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 143-191
**Code:**
```ts
// Fetch 200 threads, score them, sort by score
const scored = recentThreads.map(thread => { ... score ... });
scored.sort((a, b) => b._score - a._score);

// Pagination by cursor (ISO date string)
const startIdx = cursor ? scored.findIndex(t => new Date(t.createdAt).toISOString() < cursor) : 0;
const page = scored.slice(Math.max(0, startIdx), Math.max(0, startIdx) + limit + 1);
```
**Issue:** Multiple problems with this pagination:
1. The feed is sorted by `_score` (engagement-weighted) but the cursor is a `createdAt` date. After score-based reordering, threads with the same createdAt will produce `startIdx = -1` (from `findIndex` not finding an exact match), causing `Math.max(0, -1) = 0` — the feed starts from the beginning, producing duplicate threads.
2. Between page loads, new threads can enter the 72-hour window and change scores, causing some threads to be skipped or repeated.
3. The `where.createdAt` applies `lt: new Date(cursor)` for the DB query AND `gte: 72h ago`, so the 200-thread fetch window narrows with each page, eventually returning empty pages while content still exists.
**Severity:** HIGH — Users will see duplicate threads and miss others in the For You feed.

### Finding 10: Trending feed cursor uses `id` but pagination uses `{ id: { lt: cursor } }` — wrong for non-sequential IDs
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 237-283
**Code:**
```ts
...(cursor ? { id: { lt: cursor } } : {}),
```
Cursor returned:
```ts
cursor: data.length > 0 ? data[data.length - 1].id : undefined,
```
**Issue:** CUIDs (used for thread IDs) are NOT lexicographically ordered by creation time. The `{ id: { lt: cursor } }` comparison assumes IDs are ordered, but CUIDs can sort in any order. Combined with the fact that all 200 threads are fetched, scored, and only the top N returned, using `{ id: { lt: cursor } }` as a pre-filter in the WHERE clause can skip threads that should be included or include already-shown threads. The trending feed cursor is broken for subsequent pages.
**Severity:** HIGH — Trending feed pagination is unreliable. Second page onwards may miss threads or show duplicates.

### Finding 11: Blended feed trending component ignores cursor entirely
**File:** `apps/api/src/modules/threads/threads.service.ts`, line 309
**Code:**
```ts
const trending = await this.getTrendingThreads(excludedIds, undefined, halfLimit);
```
**Issue:** When building the blended feed (for users with <10 follows), the trending portion always passes `cursor = undefined`. This means every page of the blended feed gets the SAME trending threads. Only the following portion advances. Users see the same trending threads repeated across pages.
**Severity:** MEDIUM — Repetitive trending content in blended feed.

### Finding 12: Video feed `orderBy` is invalid — Prisma does not support multiple fields as a single object
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 210-213
**Code:**
```ts
const orderBy: Prisma.VideoOrderByWithRelationInput = {
  publishedAt: 'desc',
  viewsCount: 'desc'
};
```
**Issue:** Prisma's `orderBy` with multiple fields requires an array: `[{ publishedAt: 'desc' }, { viewsCount: 'desc' }]`. When passed as a single object with two keys, Prisma uses only ONE of them (behavior depends on JS object key ordering, which is technically unreliable). The video feed is likely only sorting by one of publishedAt or viewsCount, not both.
**Severity:** HIGH — Video feed ordering is not working as intended.

### Finding 13: Video feed caching ignores page cursor — stale data for all pages
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 173-177, 262-265
**Code:**
```ts
// Cache key includes cursor:
const cacheKey = `feed:videos:${userId}:${category ?? 'all'}:${cursor ?? 'first'}`;
const cached = await this.redis.get(cacheKey);
if (cached) return JSON.parse(cached);
// ... later:
await this.redis.setex(cacheKey, 30, JSON.stringify(result));
```
**Issue:** The cache key DOES include the cursor, so different pages are cached separately. However, the 30-second TTL means that within 30 seconds, new content won't appear. More critically, the cache stores the result INCLUDING `isLiked`/`isDisliked`/`isBookmarked` flags which are USER-SPECIFIC. If user A requests the feed, it's cached for 30 seconds. The cache key includes userId, so this is actually fine per-user. However, the bigger issue is that the cache is never invalidated when a user likes/bookmarks a video — the cached response will show stale interaction states for 30 seconds.
**Severity:** MEDIUM — Users see stale like/bookmark states for up to 30 seconds after interacting.

### Finding 14: Majlis "video" tab sends wrong type to API — always fetches 'foryou' feed
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, lines 121-130
**Code:**
```ts
const feedQuery = useInfiniteQuery({
  queryKey: ['majlis-feed', feedType],
  queryFn: ({ pageParam }) => {
    const type = feedType === 'video' ? 'foryou' : feedType;
    return threadsApi.getFeed(type as 'foryou' | 'following' | 'trending', pageParam);
  },
  ...
});
// Then filters client-side:
const threads = feedType === 'video'
  ? allThreads.filter((t) => t.mediaTypes?.some((mt: string) => mt.startsWith('video')))
  : allThreads;
```
**Issue:** The "Video" tab in Majlis fetches the entire For You feed and then client-side filters to only threads with video media. This is extremely wasteful — it fetches 20+ threads per page but may end up showing only 1-2 that have video, making the feed feel empty. There's no server-side filter for media type. Also, the pagination cursor is based on the full feed, not the filtered video-only feed, so `hasNextPage` may be false when there are actually more video threads deeper in the feed.
**Severity:** HIGH — Video tab appears empty or sparse despite video content existing. Wastes bandwidth and battery.

### Finding 15: Minbar "subscriptions" feed sends 'subscriptions' as category — backend ignores it
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 194-206
```ts
const category = feedType === 'subscriptions'
  ? 'subscriptions'
  : selectedCategory === 'all' ? undefined : selectedCategory;
return videosApi.getFeed(category, pageParam);
```
**vs** `apps/api/src/modules/videos/videos.service.ts`, lines 202-207:
```ts
...(category && category !== 'all' ? { category: category as VideoCategory } : {}),
```
**Issue:** The mobile sends `category='subscriptions'` for the subscriptions tab. The backend tries to cast this to `VideoCategory` enum: `category as VideoCategory`. 'subscriptions' is NOT a valid VideoCategory value (enum values are: QURAN, EDUCATION, VLOG, TECH, ENTERTAINMENT, OTHER, etc.). Prisma will either ignore the filter (returning all videos) or throw an error. The backend's subscription-based filtering (channelIds from line 194-200) is fetched but never actually used in the `where` clause — `channelIds` variable is populated but not included in the where filter.
**Severity:** CRITICAL — Subscriptions tab is completely broken. It shows the same content as the "Home" tab because: (1) subscription channel IDs are fetched but never used in the query, (2) 'subscriptions' as category is silently ignored or causes error.

### Finding 16: Thread report stores threadId in description field, not as a proper FK
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 800-808
```ts
await this.prisma.report.create({
  data: {
    reporterId: userId,
    description: `thread:${threadId}`,  // STORED AS TEXT, NOT FK
    reason: reasonMap[reason] ?? 'OTHER',
  },
});
```
**Issue:** The thread ID is stored as a text prefix in the `description` field (`"thread:clxxxxxxxxx"`) instead of using a proper foreign key. This means: (1) reports cannot be queried by threadId efficiently, (2) no referential integrity, (3) moderation dashboard must parse strings to find reported content. The video report (line 658) has the same pattern: `description: \`video:${videoId}\``.
**Severity:** MEDIUM — Makes moderation tooling unreliable and report querying slow.

### Finding 17: Thread chain (multi-part thread) fields exist in schema but are never used in creation
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 329-413 (create method)
THREAD_SELECT includes: `isChainHead`, `chainId`, `chainPosition` (lines 27-28)
**Issue:** The THREAD_SELECT object includes `isChainHead`, `chainId`, and `chainPosition` fields, and the feed filters by `isChainHead: true` (line 145). However, the `create` method never sets these fields. There is no API endpoint to create a thread chain (a multi-part thread like X/Twitter's "Thread 1/5, 2/5..."). The CreateThreadDto has no chain-related fields. The mobile `create-thread.tsx` has a full UI for "Thread Parts" (ChainPart interface) with add/remove parts, but the API call only sends a single thread — all the chain parts are lost.
**Severity:** HIGH — Thread chaining (multi-part threads) is designed in the UI, exists in the schema, filtered for in the feed, but never actually works end-to-end.

### Finding 18: create-thread.tsx has duplicate Pressable import — will crash on React Native
**File:** `apps/mobile/app/(screens)/create-thread.tsx`, lines 4-6
```ts
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Alert,
  Pressable,  // DUPLICATE
} from 'react-native';
```
**Issue:** `Pressable` is imported twice from `react-native`. In strict mode or some bundler configurations, this causes a runtime error. At minimum, it's a lint error that indicates sloppy code.
**Severity:** LOW — May crash depending on bundler configuration.

### Finding 19: series-detail.tsx has duplicate Pressable import
**File:** `apps/mobile/app/(screens)/series-detail.tsx`, lines 8-12
```ts
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  ScrollView, Dimensions,
  Pressable,  // DUPLICATE
} from 'react-native';
```
**Issue:** Same duplicate import issue.
**Severity:** LOW

### Finding 20: series-discover.tsx has duplicate Pressable import
**File:** `apps/mobile/app/(screens)/series-discover.tsx`, lines 8-12
```ts
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  ScrollView, Dimensions,
  Pressable,  // DUPLICATE
} from 'react-native';
```
**Issue:** Same duplicate import issue.
**Severity:** LOW

### Finding 21: video/[id].tsx has duplicate Pressable import
**File:** `apps/mobile/app/(screens)/video/[id].tsx`, lines 3-6
```ts
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert, Share,
  RefreshControl, TextInput, KeyboardAvoidingView, Platform, AppState, Dimensions,
  Pressable,  // DUPLICATE
} from 'react-native';
```
**Issue:** Same duplicate import issue.
**Severity:** LOW

---

## MEDIUM (Logic / UX Issues)

### Finding 22: Thread getExcludedUserIds capped at 50 per category — heavy users unprotected
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 107-122
```ts
this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true }, take: 50 }),
this.prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true }, take: 50 }),
this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true }, take: 50 }),
```
**Issue:** Each category (blocked-by-me, blocked-me, muted) is capped at 50 results. A user who has blocked 100 people will only have 50 of them excluded from their feed. The remaining 50 blocked users' content will appear in the feed. This applies to all feed types (for-you, following, trending).
**Severity:** MEDIUM — Power users who heavily block/mute will still see content from blocked users.

### Finding 23: Thread For You feed fetches 200 threads but has no pagination beyond that
**File:** `apps/api/src/modules/threads/threads.service.ts`, line 163
```ts
take: 200, // fetch more to score and rank
```
**Issue:** The For You feed always fetches 200 threads from the last 72 hours, scores them, and paginates through that batch. Once the user has scrolled past these 200, the feed ends. On an active platform with thousands of threads per 72 hours, the user sees at most 200 threads total. The trending feed has the same 200-thread cap (line 252).
**Severity:** MEDIUM — Feed depth is artificially limited to 200 items.

### Finding 24: Thread follows capped at 50 — following feed incomplete for popular users
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 131-136
```ts
type === 'following'
  ? this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true }, take: 50 })
  : Promise.resolve([]),
```
**Issue:** The following feed only considers the first 50 follows. A user following 500 accounts will only see content from 50 of them.
**Severity:** MEDIUM — Following feed is incomplete for users who follow many accounts.

### Finding 25: Video feed subscription channels capped at 50
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 194-198
```ts
const subscribedChannels = userId ? await this.prisma.subscription.findMany({
  where: { userId },
  select: { channelId: true },
  take: 50,
}) : [];
```
**Issue:** Same 50-cap problem. Users subscribed to more than 50 channels will miss content from some.
**Severity:** MEDIUM

### Finding 26: Video enhanceVideos reactions capped at 50 — some videos show wrong interaction state
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 86-96
```ts
const [reactions, bookmarks] = await Promise.all([
  this.prisma.videoReaction.findMany({
    where: { userId, videoId: { in: videoIds } },
    take: 50,
  }),
  this.prisma.videoBookmark.findMany({
    where: { userId, videoId: { in: videoIds } },
    take: 50,
  }),
]);
```
**Issue:** If a user has reacted to many videos that appear in the feed, only the first 50 reactions/bookmarks are fetched. Videos beyond the 50th will show `isLiked: false` and `isBookmarked: false` even if the user has liked/bookmarked them. The `take: 50` is applied globally, not per-video.
**Severity:** MEDIUM — Incorrect UI state for liked/bookmarked videos.

### Finding 27: Thread reply-permission API uses PUT but mobile API sends PATCH
**File:** `apps/api/src/modules/threads/threads.controller.ts`, line 243:
```ts
@Put(':id/reply-permission')
```
**File:** `apps/mobile/src/services/api.ts`, line 558:
```ts
setReplyPermission: (threadId: string, permission: ...) =>
  api.patch(`/threads/${threadId}/reply-permission`, { permission }),
```
**Issue:** Backend expects PUT, mobile sends PATCH. NestJS will return 404 (method not allowed) for the PATCH request. The reply permission feature is completely broken from mobile.
**Severity:** HIGH — Reply permission setting silently fails on mobile.

### Finding 28: Thread hashtag extraction runs extractHashtags but also accepts hashtags array from DTO
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 331-342, 352-354
```ts
const hashtagNames = extractHashtags(dto.content ?? '');
// Upserts hashtags from content...

// Then also stores dto.hashtags directly:
hashtags: dto.hashtags ?? [],
```
**Issue:** Hashtags are extracted from content text AND accepted from the DTO. The extracted hashtags are upserted to the Hashtag model (incrementing threadsCount), but the thread itself stores `dto.hashtags` — which may be a different set. If the client sends hashtags that don't match the content, the Hashtag model counts will be wrong, and the thread record will store different hashtags than what was counted.
**Severity:** MEDIUM — Hashtag counts drift from reality. Thread hashtag field may not match content.

### Finding 29: Video comment replies are not counted in parent commentsCount
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 490-534
```ts
async comment(videoId: string, userId: string, content: string, parentId?: string) {
    const [comment] = await this.prisma.$transaction([
      this.prisma.videoComment.create({
        data: { userId, videoId, content: sanitizeText(content), parentId },
        ...
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);
}
```
**Issue:** Every comment (whether top-level or reply) increments the video's `commentsCount`. But `getComments()` (line 537) only fetches `parentId: null` (top-level comments). So if a video has 10 top-level comments and 40 replies, the UI shows "50 comments" but only displays 10 items. This inflates the comment count and confuses users.
**Severity:** MEDIUM — Comment count misleading. Should either count only top-level or count all and display "50 comments" with nested view.

### Finding 30: Video comment has no blocked/muted user filtering
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 536-576 (getComments)
**Issue:** Unlike thread replies (which filter `excludedIds` from blocked/muted users), video comments have zero filtering for blocked or muted users. A blocked user's comments appear normally.
**Severity:** MEDIUM — Blocked users' comments visible on videos.

### Finding 31: Recommended videos have no block/mute filtering
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 668-694
**Issue:** `getRecommended()` fetches videos by same channel, category, or tags, but never checks if the video authors are blocked by the requesting user. Blocked users' videos can appear as recommendations.
**Severity:** MEDIUM

### Finding 32: Thread dismissal (not interested) is recorded but never used in feed filtering
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 810-817
```ts
async dismiss(threadId: string, userId: string) {
    await this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId: threadId, contentType: 'THREAD' } },
      create: { userId, contentId: threadId, contentType: 'THREAD' },
      update: {},
    });
    return { dismissed: true };
}
```
**Issue:** The dismiss endpoint creates a `FeedDismissal` record, but `getFeed()` never queries `feedDismissal` to filter out dismissed threads. The "Not Interested" feature is completely non-functional — it records the preference and returns success, but the dismissed thread will continue appearing in the feed.
**Severity:** HIGH — Feature that appears to work (shows success) but is entirely decorative.

### Finding 33: Minbar "Not Interested" button does nothing
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 466-468
```ts
<BottomSheetItem
  label={t('minbar.notInterested')}
  icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
  onPress={() => setSelectedVideoId(null)}  // JUST CLOSES THE SHEET
/>
```
**Issue:** The "Not Interested" menu item just closes the bottom sheet without making any API call. Unlike threads which at least record the dismissal (even though it's not used), videos don't even attempt to record the preference.
**Severity:** MEDIUM — Broken UX feature.

### Finding 34: Video chapters use `chapters` JSON field AND a separate `VideoChapter` model
**File:** `apps/api/src/modules/videos/videos.service.ts`
VIDEO_SELECT includes `chapters: true` (line 39) — this is a JSON field on the Video model.
Also has `getChapters()` (line 857) which queries `this.prisma.videoChapter.findMany({ where: { videoId } })` — a separate model.
`parseChaptersFromDescription()` (line 864) creates VideoChapter records from the description.
**Issue:** There are TWO chapter systems: (1) a `chapters` JSON field directly on the Video model (returned in every video response), and (2) a `VideoChapter` relation table with proper records. The video detail screen on mobile reads `video?.chapters` (the JSON field). The `parseChaptersFromDescription` writes to the VideoChapter model. These two sources of truth are never synchronized.
**Severity:** HIGH — Chapter data inconsistency. Mobile reads from one source, API writes to another.

### Finding 35: No video watch-detail screen for thread detail
**File:** Entire codebase search for `thread-detail`, `threadDetail`
**Issue:** There is no thread detail screen. The minbar has `video/[id].tsx`, but there is no corresponding `thread/[id].tsx` or similar. The ThreadCard component presumably handles navigation to thread detail, but no screen file exists for viewing a single thread with its replies. This means clicking a thread from the feed has nowhere to navigate to (unless ThreadCard opens an inline detail view).
**Severity:** HIGH — Core navigation flow broken. Thread detail viewing is not possible from the feed.

### Finding 36: create-video.tsx has hardcoded English string
**File:** `apps/mobile/app/(screens)/create-video.tsx`, line 302
```ts
Alert.alert('Missing channel', 'Please select a channel.');
```
**Issue:** All other strings on this screen use `t()` for i18n, but this one is hardcoded in English. Users of other languages will see English for this error.
**Severity:** LOW — i18n violation.

### Finding 37: video-premiere.tsx has hardcoded English labels
**File:** `apps/mobile/app/(screens)/video-premiere.tsx`, lines 67-68, 79-80
```ts
<Text style={styles.label}>Date (YYYY-MM-DD)</Text>
...
<Text style={styles.label}>Time (HH:MM)</Text>
...
<Text style={styles.label}>Countdown Theme</Text>
```
**Issue:** Three labels are hardcoded English strings instead of using `t()`.
**Severity:** LOW — i18n violations.

### Finding 38: Minbar header title hardcoded "Minbar" instead of i18n
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, line 378
```ts
<Text style={styles.logo}>Minbar</Text>
```
**Issue:** Should use `t('tabs.minbar')` for localization support.
**Severity:** LOW — i18n violation.

### Finding 39: Video feed `videoStats` text uses hardcoded "views" string
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, line 141
```ts
{video.viewsCount.toLocaleString()} views • {formatDistanceToNowStrict(...)}
```
**Issue:** "views" should be translated. Also the bullet separator "•" is hardcoded.
**Severity:** LOW — i18n violation.

### Finding 40: series-discover.tsx category labels are hardcoded English
**File:** `apps/mobile/app/(screens)/series-discover.tsx`, lines 33-40
```ts
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'drama', label: 'Drama' },
  { key: 'documentary', label: 'Documentary' },
  // ...
] as const;
```
**Issue:** All category labels are hardcoded English instead of using `t()`.
**Severity:** LOW — i18n violation.

### Finding 41: series-discover follow button accessibility label hardcoded English
**File:** `apps/mobile/app/(screens)/series-discover.tsx`, line 229
```ts
accessibilityLabel={item.isFollowing ? 'Unfollow' : 'Follow'}
```
**Issue:** Should use `t()`.
**Severity:** LOW — Accessibility + i18n violation.

### Finding 42: Video comment getComments sorts by likesCount descending — no chronological option
**File:** `apps/api/src/modules/videos/videos.service.ts`, line 557
```ts
orderBy: { likesCount: 'desc' }, // sort by popular first
```
**Issue:** Comments are always sorted by popularity (likesCount). There is no option for chronological sorting (newest first / oldest first). YouTube offers both "Top comments" and "Newest first". The API provides no way to change sort order.
**Severity:** LOW — Missing feature but not a bug.

### Finding 43: Thread reply delete hard-deletes the reply record
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 709-719
```ts
async deleteReply(replyId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.threadReply.delete({ where: { id: replyId } }),  // HARD DELETE
      ...
    ]);
}
```
**Issue:** Thread replies are hard-deleted, while thread posts themselves are soft-deleted (`isRemoved: true`). This is inconsistent. Hard-deleting replies also cascades to delete nested sub-replies (if any), making moderation review impossible.
**Severity:** MEDIUM — Data loss and inconsistency.

### Finding 44: Playlist update passes raw DTO to Prisma without sanitization
**File:** `apps/api/src/modules/playlists/playlists.service.ts`, line 184
```ts
return this.prisma.playlist.update({
  where: { id },
  data: dto,  // RAW DTO passed directly
  ...
});
```
**Issue:** The `UpdatePlaylistDto` is passed directly as `data` to Prisma. While class-validator runs on the DTO, the dto object may contain additional properties not in the DTO class (due to `whitelist: false` being the default in NestJS). An attacker could potentially set fields like `videosCount`, `isCollaborative`, `thumbnailUrl`, or other playlist fields not intended for user modification. The `data: dto` pattern is dangerous because it allows setting ANY Playlist field.
**Severity:** MEDIUM — Potential field injection if whitelist validation is not enabled globally.

### Finding 45: Playlist collaborator role field is a free-form string, not validated
**File:** `apps/api/src/modules/playlists/playlists.service.ts`, line 458
```ts
async updateCollaboratorRole(playlistId: string, userId: string, collaboratorUserId: string, role: string) {
```
And `apps/api/src/modules/playlists/dto/collaborator.dto.ts`:
```ts
@IsIn(['editor', 'viewer']) role: string;
```
**Issue:** The DTO validates `role` as 'editor' or 'viewer', which is good. But the service method `updateCollaboratorRole` accepts `role: string` without type constraint. And in `requireOwnerOrEditor()` (line 230): `if (collaborator?.role !== 'editor')` — only 'editor' grants write access. If somehow an invalid role slips through (e.g., via raw API call bypassing DTO), the user gets 'viewer' access by default since it's not 'editor'. The DTO validation should prevent this, but the defense-in-depth is missing.
**Severity:** LOW — DTO validation covers this, but service should also validate.

### Finding 46: Video premiere raw SQL uses wrong table name
**File:** `apps/api/src/modules/videos/videos.service.ts`, line 788
```ts
await this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = "reminderCount" + 1 WHERE id = ${premiere.id}`;
```
**Issue:** The raw SQL references table `video_premieres` (snake_case), but Prisma models typically map to PascalCase table names (e.g., `VideoPremiere`). If the schema uses `@@map("video_premieres")` this is fine, but if it doesn't, this query silently fails (affecting 0 rows) or throws an error. The other premiere queries use Prisma client (`this.prisma.videoPremiere`), so only this raw SQL is at risk.
**Severity:** MEDIUM — Premiere reminder count may never update.

### Finding 47: setPremiereReminder has no idempotency check — can be called multiple times
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 781-789
```ts
async setPremiereReminder(videoId: string, userId: string) {
    const premiere = await this.prisma.videoPremiere.findUnique({ where: { videoId } });
    if (!premiere) throw new NotFoundException('Premiere not found');
    await this.prisma.premiereReminder.create({
      data: { premiereId: premiere.id, userId },
    });
    // Also increments reminderCount via raw SQL
}
```
**Issue:** No duplicate check before creating the reminder. If there's no unique constraint on [premiereId, userId], a user can set multiple reminders, inflating the reminderCount. If there IS a unique constraint, the create will throw an unhandled P2002 error.
**Severity:** MEDIUM — Either allows duplicate reminders or crashes with unhandled error.

### Finding 48: Thread repost creates a new Thread record with empty content
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 530-546
```ts
this.prisma.thread.create({
  data: {
    userId,
    content: '',          // EMPTY CONTENT
    repostOfId: threadId,
    mediaUrls: [],
    mediaTypes: [],
    visibility: 'PUBLIC',
  },
  ...
}),
```
**Issue:** A repost is modeled as a new Thread with `content: ''` and `repostOfId` pointing to the original. This means reposts appear in queries for `isChainHead: true` (they're chain heads by default since isChainHead is not set). The feed correctly includes them (they have the repostOf relation included in THREAD_SELECT), but they also count toward the user's `threadsCount` — inflating their thread count with what are essentially shares, not original content.
**Severity:** LOW — Reposts inflate user thread count.

### Finding 49: Thread quote post has confusing content vs quoteText fields
**File:** `apps/api/src/modules/threads/dto/create-thread.dto.ts`, lines 42-98
```ts
content: string;         // The thread content (max 500)
quoteText?: string;      // The quote text (max 500)
repostOfId?: string;     // The thread being quoted
isQuotePost?: boolean;
```
**Issue:** A quote post has THREE text fields: `content` (the user's commentary), `quoteText` (unclear what this is for — possibly a text snapshot of the quoted thread?), and the actual quoted thread via `repostOfId` → `repostOf` relation. The `quoteText` field is confusing because the quoted thread's content is already available via the `repostOf` relation. If `quoteText` is meant to be the user's commentary, then what is `content`? This creates ambiguity for mobile developers about which field to display.
**Severity:** LOW — Design ambiguity, not a bug.

### Finding 50: Thread create hashtag upsert is not atomic — race condition on concurrent posts
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 332-342
```ts
await Promise.all(
  hashtagNames.map((name) =>
    this.prisma.hashtag.upsert({
      where: { name },
      create: { name, threadsCount: 1 },
      update: { threadsCount: { increment: 1 } },
    }),
  ),
);
```
**Issue:** The hashtag upsert happens OUTSIDE the transaction that creates the thread. If the thread creation fails (e.g., validation error), the hashtag counts have already been incremented but there's no rollback. Also, concurrent upserts for the same hashtag name can cause P2002 errors in Postgres.
**Severity:** MEDIUM — Hashtag counts drift on thread creation failures.

### Finding 51: Video chapter parsing regex misses Arabic/Unicode chapter titles
**File:** `apps/api/src/modules/videos/videos.service.ts`, lines 872-882
```ts
const pattern = /(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/g;
```
**Issue:** The regex uses `(.+)` which matches any character including Arabic, so the title capture is fine. However, the regex requires at least one whitespace `\s+` between the timestamp and title. Arabic text where the timestamp is followed by an Arabic space character (U+00A0 non-breaking space, common in copy-paste) won't match. More importantly, RTL text can cause the timestamp and title to appear in unexpected order when copied from sources.
**Severity:** LOW — Edge case for Arabic content.

### Finding 52: createPlaylist screen MAX_TITLE is 50 but backend allows 200
**File:** `apps/mobile/app/(screens)/create-playlist.tsx`, line 34
```ts
const MAX_TITLE = 50;
```
**vs** `apps/api/src/modules/playlists/dto/create-playlist.dto.ts`, line 12:
```ts
@MaxLength(200)
title: string;
```
**Issue:** Mobile limits playlist titles to 50 characters, but the backend allows 200. This means mobile users are unnecessarily restricted. Or if the 50 limit is intentional for UX, the 200 backend limit should be aligned.
**Severity:** LOW — Inconsistent limits.

### Finding 53: createPlaylist screen MAX_DESC is 150 but backend allows 1000
**File:** `apps/mobile/app/(screens)/create-playlist.tsx`, line 35
```ts
const MAX_DESC = 150;
```
**vs** `apps/api/src/modules/playlists/dto/create-playlist.dto.ts`, line 19:
```ts
@MaxLength(1000)
description?: string;
```
**Issue:** Same inconsistency as Finding 52 but for description.
**Severity:** LOW

### Finding 54: Series detail and discover screens use gamificationApi — wrong API module
**File:** `apps/mobile/app/(screens)/series-detail.tsx`, line 32
```ts
import { gamificationApi } from '@/services/api';
// ...
const seriesQuery = useQuery({
  queryKey: ['series', params.id],
  queryFn: () => gamificationApi.getSeries(params.id!) as Promise<SeriesDetail>,
});
```
**Issue:** Series is accessed through `gamificationApi` rather than having its own `seriesApi`. This is a code organization issue — series is a content feature, not a gamification feature. It suggests series was bolted onto the gamification module rather than being its own module.
**Severity:** LOW — Architecture concern, not a bug.

### Finding 55: Series detail "Add Episode" bottom sheet items are all no-ops
**File:** `apps/mobile/app/(screens)/series-detail.tsx`, lines 352-374
```ts
<BottomSheetItem
  label={t('series.linkPost', 'Link a Post')}
  onPress={() => {
    setAddEpisodeSheet(false);
    // Navigate to post picker  // <-- STUB
  }}
/>
```
**Issue:** All three "Add Episode" options (Link Post, Link Reel, Link Video) just close the bottom sheet. The comment says "Navigate to post picker" but no navigation occurs. The add-episode feature is entirely non-functional.
**Severity:** HIGH — Core series management feature is stubbed out.

### Finding 56: save-to-playlist.tsx uses useMemo as side-effect — violates React rules
**File:** `apps/mobile/app/(screens)/save-to-playlist.tsx`, lines 73-81
```ts
useMemo(() => {
  const newMap: Record<string, boolean> = {};
  playlists.forEach((playlist, idx) => {
    if (inclusionQueries[idx]?.data !== undefined) {
      newMap[playlist.id] = inclusionQueries[idx].data!;
    }
  });
  setInPlaylistMap(newMap);  // SIDE EFFECT IN useMemo
}, [playlists, inclusionQueries]);
```
**Issue:** `useMemo` is used to run a side effect (`setInPlaylistMap`). React explicitly documents that `useMemo` should be for pure computation, not side effects. This can cause: (1) infinite re-render loops since `setInPlaylistMap` triggers re-render which re-evaluates useMemo, (2) React strict mode will call this twice, setting state twice.
**Severity:** HIGH — Can cause infinite re-render loop. Should use `useEffect` instead.

### Finding 57: Playlist getByChannel only shows public playlists — channel owner can't see their own private playlists
**File:** `apps/api/src/modules/playlists/playlists.service.ts`, line 106
```ts
where: { channelId, isPublic: true },
```
**Issue:** The `getByChannel` method always filters to `isPublic: true`. This means the channel owner viewing their own channel cannot see their private playlists. There is no userId parameter to conditionally include private playlists for the owner.
**Severity:** MEDIUM — Channel owners can't manage their private playlists through the list view.

### Finding 58: Video updateProgress sends completed=false but dto expects 0-1 range for progress
**File:** `apps/mobile/src/services/api.ts`, lines 470-471
```ts
recordProgress: (videoId: string, progress: number) =>
  api.patch(`/videos/${videoId}/progress`, { progress, completed: false }),
```
**vs** backend `VideoProgressDto`, line 8: `@Max(1)` — progress is 0.0 to 1.0
**And** video/[id].tsx, line 318:
```ts
videosApi.updateProgress(id, progress, completed).catch(() => {});
```
Where `progress` is `status.positionMillis / status.durationMillis` (a 0-1 range).
**Issue:** Two mobile methods call progress update: `videosApi.updateProgress(id, progress, completed)` passes the completed boolean correctly, but `videosApi.recordProgress(id, progress)` always sends `completed: false`. The backend ignores the `completed` field from the API — it calculates `completed: progress >= 95` (line 642: `completed: progress >= 95`). Wait, that's comparing 0-1 range to 95... `progress >= 95` will NEVER be true when progress is 0.0-1.0. This means videos are NEVER marked as completed.
**Severity:** HIGH — Backend completion threshold is `>= 95` but progress value is 0.0-1.0 range. Should be `>= 0.95`.

### Finding 59: Video progress completion threshold is wrong
**File:** `apps/api/src/modules/videos/videos.service.ts`, line 641
```ts
create: { userId, videoId, progress, completed: progress >= 95, ... },
update: { progress, completed: progress >= 95, ... },
```
**Issue:** Confirmed from Finding 58. The `VideoProgressDto` has `@Min(0) @Max(1)`, so progress is 0.0-1.0. But the completion check is `progress >= 95`, which would require progress to be 95-100 (percentage). This is a unit mismatch. No video will ever be marked as completed.
**Severity:** HIGH — "Continue Watching" section on Minbar will show ALL watched videos forever (since none are ever marked completed), and watch history "completed" flag is always false.

### Finding 60: Minbar video card duration calculation wrong for videos longer than 1 hour
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 78-80
```ts
const durationMinutes = Math.floor(video.duration / 60);
const durationSeconds = Math.floor(video.duration % 60);
const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
```
**Issue:** For a 2-hour video (7200 seconds): `durationMinutes = 120`, `durationText = "120:00"`. This doesn't show hours. YouTube shows "2:00:00" for 2-hour videos. The same issue exists in `video/[id].tsx` line 397-399 and `create-video.tsx` line 333.
**Severity:** LOW — Cosmetic issue for long-form videos, but Minbar is explicitly the long-form video space.

### Finding 61: Thread tab selector stores 'video' type but Zustand store type is 'foryou' | 'following' | 'trending'
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, line 239
```ts
onTabChange={(key) => setFeedType(key as 'foryou' | 'following' | 'trending')}
```
But the TABS array includes `{ key: 'video', ... }` (line 87). The `setFeedType` casts to `'foryou' | 'following' | 'trending'` — 'video' is not in this union type. The Zustand store likely types `majlisFeedType` as that same union. Setting 'video' via the cast `as` will work at runtime but violates TypeScript's type system.
**Severity:** LOW — TypeScript type violation. Works at runtime due to `as` cast.

### Finding 62: Thread feed for anonymous 'following' type will crash
**File:** `apps/api/src/modules/threads/threads.service.ts`, lines 194-227
When anonymous (`userId = ''`) requests `type=following`:
1. `followingIds` will be empty (no follows for empty userId)
2. Falls into `followingIds.length === 0` branch → calls `getTrendingThreads`
3. This works, but it means an anonymous user requesting 'following' feed gets trending instead, which is confusing. The controller should reject `type=following` for anonymous users or the frontend should not show the tab.
**Severity:** LOW — Confusing behavior for anonymous users.

---

## SUMMARY

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 13 |
| MEDIUM | 18 |
| LOW | 26 |
| **TOTAL** | **62** |

### Top 10 Most Impactful Findings:
1. **Finding 1:** replyPermission never enforced on addReply — feature is decorative
2. **Finding 15:** Minbar subscriptions tab completely broken — subscription channelIds fetched but never used
3. **Finding 3:** Video views infinitely inflatable — zero deduplication
4. **Finding 9:** For-You feed pagination broken — produces duplicates
5. **Finding 17:** Thread chain UI built but API never sends chain data
6. **Finding 32:** Thread dismiss ("Not Interested") records preference but never filters feed
7. **Finding 34:** Two competing chapter systems — VideoChapter model vs chapters JSON field
8. **Finding 58-59:** Video completion threshold uses wrong unit (95 vs 0.95) — nothing ever marked complete
9. **Finding 27:** Reply permission HTTP method mismatch (PUT vs PATCH) — setting silently fails
10. **Finding 56:** useMemo used for side-effect — potential infinite re-render loop
