# Agent 67: Saf (Instagram) + Bakra (TikTok) Feed Logic — Backend + Mobile

**Scope:** Complete feed flow for Saf and Bakra spaces
**Files audited:** 22 files, every line read
**Total findings: 62**

---

## Files Audited

### Backend
1. `apps/api/src/modules/posts/posts.service.ts` (all ~800 lines)
2. `apps/api/src/modules/posts/posts.controller.ts` (372 lines)
3. `apps/api/src/modules/posts/dto/create-post.dto.ts` (99 lines)
4. `apps/api/src/modules/posts/dto/add-comment.dto.ts`
5. `apps/api/src/modules/posts/dto/report.dto.ts`
6. `apps/api/src/modules/posts/dto/cross-post.dto.ts`
7. `apps/api/src/modules/stories/stories.service.ts` (462 lines)
8. `apps/api/src/modules/stories/stories.controller.ts` (193 lines)
9. `apps/api/src/modules/stories/dto/create-story.dto.ts` (66 lines)
10. `apps/api/src/modules/reels/reels.service.ts` (all ~700 lines)
11. `apps/api/src/modules/reels/reels.controller.ts` (237 lines)
12. `apps/api/src/modules/reels/dto/create-reel.dto.ts` (67 lines)
13. `apps/api/src/modules/feed/feed.service.ts` (403 lines)
14. `apps/api/src/modules/feed/feed.controller.ts` (195 lines)
15. `apps/api/src/modules/feed/personalized-feed.service.ts` (504 lines)
16. `apps/api/src/modules/feed/feed-transparency.service.ts` (205 lines)
17. `apps/api/src/modules/feed/dto/log-interaction.dto.ts` (15 lines)
18. `apps/api/src/modules/feed/feed.module.ts` (16 lines)

### Mobile
19. `apps/mobile/app/(tabs)/saf.tsx` (636 lines)
20. `apps/mobile/app/(tabs)/bakra.tsx` (~900 lines)
21. `apps/mobile/app/(screens)/story-viewer.tsx` (709 lines)
22. `apps/mobile/app/(screens)/reel-templates.tsx` (514 lines)
23. `apps/mobile/app/(screens)/reel-remix.tsx` (~350 lines)

---

## CRITICAL (P0) — Ship Blockers

### Finding 1: Story Viewer Data Never Reaches Screen — Stories Are Blank
**File:** `apps/mobile/app/(screens)/story-viewer.tsx`, lines 89-105
**Also:** `apps/mobile/app/(tabs)/saf.tsx`, lines 353-360
**Severity:** P0 CRITICAL — Feature completely broken

The `saf.tsx` tab passes story data via Zustand store:
```ts
useStore.getState().setStoryViewerData({ groups: storyGroups, startIndex: storyGroups.indexOf(group) });
router.push('/(screens)/story-viewer');
```

But `story-viewer.tsx` reads from URL params instead:
```ts
const { groupJson, startIndex: startIndexParam, isOwn } = useLocalSearchParams<{
    groupJson: string;
    startIndex?: string;
    isOwn?: string;
}>();
group = groupJson ? JSON.parse(groupJson) : null;
```

The `storyViewerData` from the Zustand store is NEVER read by `story-viewer.tsx`. The `groupJson` param is never passed by `saf.tsx`. Only `profile/[username].tsx` passes `groupJson`.

**Impact:** Tapping any story from the Saf feed opens a blank story viewer screen that shows the EmptyState fallback ("Story unavailable"). The entire story viewing experience from the main feed is broken.

---

### Finding 2: Duplicate Pressable Import — Compile/Runtime Error
**File:** `apps/mobile/app/(screens)/story-viewer.tsx`, lines 3-7
**Severity:** P0 CRITICAL — Import error

```ts
import {
  View, Text, StyleSheet, Pressable,
  Dimensions, TextInput, Platform,
  KeyboardAvoidingView, Alert, FlatList, RefreshControl,
  Pressable,  // <-- DUPLICATE IMPORT
} from 'react-native';
```

`Pressable` is imported twice in the same destructure. Depending on the bundler configuration, this may cause a compile error or silent shadowing. Metro bundler typically throws a syntax/duplicate error for this.

---

### Finding 3: Duplicate Pressable Import in reel-remix.tsx
**File:** `apps/mobile/app/(screens)/reel-remix.tsx`, lines 3-6
**Severity:** P0 CRITICAL — Import error

```ts
import {
  View, Text, StyleSheet, Pressable, TextInput,
  Dimensions, Alert, ScrollView, RefreshControl,
  Pressable,  // <-- DUPLICATE IMPORT
} from 'react-native';
```

Same duplicate `Pressable` import as story-viewer.tsx. Two screens with the same bug.

---

### Finding 4: Bakra Reels Have No Snap/Paging Behavior — Reels Scroll Freely
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 759-773
**Severity:** P0 CRITICAL — Core UX completely wrong

The FlashList for reels has NONE of the required snap properties:
```tsx
<FlashList
  ref={listRef}
  data={reels}
  keyExtractor={keyExtractor}
  onEndReached={onEndReached}
  onEndReachedThreshold={0.4}
  renderItem={renderItem}
  showsVerticalScrollIndicator={false}
  viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
  onViewableItemsChanged={handleViewableItemsChanged}
  ListEmptyComponent={listEmpty}
  ListFooterComponent={listFooter}
  estimatedItemSize={SCREEN_H}
  refreshControl={...}
/>
```

Missing: `pagingEnabled`, `snapToInterval={SCREEN_H}`, `snapToAlignment="start"`, or `decelerationRate="fast"`.

**Impact:** Reels scroll smoothly like a regular feed instead of snapping one-at-a-time like TikTok/Instagram Reels. This is the most fundamental UX behavior of a short-video feed. Without snap, the reel viewing experience is fundamentally broken — users see partial videos, the active video detection via `viewabilityConfig` fires inconsistently, and videos won't properly pause/play at boundaries. FlashList does not support `pagingEnabled` natively, so this needs either `snapToInterval` + `decelerationRate="fast"` or a switch to FlatList with `pagingEnabled={true}`.

---

### Finding 5: Personalized Feed Has ZERO Block/Mute Filtering
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, entire file (504 lines)
**Severity:** P0 CRITICAL — Safety violation

The `getPersonalizedFeed()` method (line 146) and ALL its sub-methods (`getTrendingFeed`, `getColdStartFeed`, `getIslamicEditorialPicks`) have ZERO filtering for blocked or muted users. There is no call to `prisma.block.findMany`, no call to `prisma.mute.findMany`, no `notIn` clause for excluded user IDs anywhere in the file.

A user who has blocked another user will STILL see that blocked user's content in the personalized feed, trending feed, cold start feed, and Islamic editorial picks.

This is the feed served at `/api/v1/feed/personalized` which the mobile app COULD use as its primary "for you" algorithm.

**Impact:** Blocked users' content appears in feed. Harassment/safety violation.

---

### Finding 6: Stories Service getStickerResponses Has Malformed Prisma Query
**File:** `apps/api/src/modules/stories/stories.service.ts`, lines 438-444
**Severity:** P0 CRITICAL — Runtime crash

```ts
return this.prisma.storyStickerResponse.findMany({
  where: { storyId, ...(stickerType ? { stickerType } : {
  take: 50,
}) },
  include: { user: { select: { ... } } },
  orderBy: { createdAt: 'desc' },
});
```

When `stickerType` is undefined/null, the spread expands to `{ take: 50 }` INSIDE the `where` clause. This produces:
```ts
where: { storyId, take: 50 }
```

`take: 50` is not a valid Prisma where-clause field. This will either:
1. Crash at runtime with a Prisma validation error
2. Be silently ignored, returning unbounded results

Additionally, when `stickerType` IS provided, the `take: 50` is lost entirely — the query has no limit and could return unlimited results.

**Correct code should be:**
```ts
where: { storyId, ...(stickerType ? { stickerType } : {}) },
take: 50,
```

---

### Finding 7: Reels Content Moderation References Non-Existent `reel.description` Field
**File:** `apps/api/src/modules/reels/reels.service.ts`, lines 160-161, 176
**Severity:** P0 — Content moderation silently broken

```ts
if (reel.description) {
  this.queueService.addModerationJob({ content: reel.description, contentType: 'reel', contentId: reel.id });
}
```

And:
```ts
document: { id: reel.id, description: reel.description, userId, hashtags: reel.hashtags },
```

The Reel model uses `caption`, not `description`. The REEL_SELECT (line 33) selects `caption: true`. The `reel` object returned from the transaction contains `caption`, not `description`. `reel.description` is always `undefined`.

**Impact:**
1. Content moderation NEVER fires for reels (the `if` condition is always falsy)
2. Search indexing always indexes `description: undefined` instead of the actual caption text, making reels unsearchable by caption

---

## HIGH (P1) — Security & Data Integrity

### Finding 8: Story Feed Does Not Filter Blocked/Muted Users
**File:** `apps/api/src/modules/stories/stories.service.ts`, lines 51-108
**Severity:** P1 HIGH — Safety violation

`getFeedStories()` builds the story feed by:
1. Getting all follows (line 52)
2. Querying stories from followed users (line 59)

There is NO filtering for blocked or muted users. If user A follows user B, then B blocks A, A still sees B's stories. If user A mutes user B, B's stories still appear.

The only block check in the entire stories service is in `replyToStory()` (line 268), which is for messaging, not for viewing.

---

### Finding 9: Story Feed Does Not Filter CloseFriendsOnly/SubscribersOnly Stories
**File:** `apps/api/src/modules/stories/stories.service.ts`, lines 59-67
**Severity:** P1 HIGH — Privacy violation

Stories with `closeFriendsOnly: true` or `subscribersOnly: true` are returned to ALL followers without any check:

```ts
const stories = await this.prisma.story.findMany({
  where: {
    userId: { in: ids },
    expiresAt: { gt: new Date() },
    isArchived: false,
  },
  // No filter for closeFriendsOnly or subscribersOnly
});
```

Close-friends-only stories are shown to all followers, not just close friends. Subscriber-only stories are shown to non-subscribers.

---

### Finding 10: Story View Query Has `take: 50` Limiting View Tracking
**File:** `apps/api/src/modules/stories/stories.service.ts`, lines 86-89
**Severity:** P1 — Data accuracy bug

```ts
const views = await this.prisma.storyView.findMany({
  where: { viewerId: userId, storyId: { in: storyIds } },
  select: { storyId: true },
  take: 50,
});
```

If a user follows many active story posters and there are >50 stories in the feed, only the first 50 view records are checked. Stories beyond position 50 will always show as "unread" (blue ring) even if already viewed.

---

### Finding 11: Story `getById` Has No Auth Guard — Anyone Can View Any Story
**File:** `apps/api/src/modules/stories/stories.controller.ts`, lines 59-63
**Severity:** P1 HIGH — Privacy violation

```ts
@Get(':id')
@ApiOperation({ summary: 'Get story by ID' })
getById(@Param('id') id: string) {
  return this.storiesService.getById(id);
}
```

No `@UseGuards(ClerkAuthGuard)` or `@UseGuards(OptionalClerkAuthGuard)`. No auth check at all. Anyone with a story ID can view it, including:
- Close-friends-only stories
- Subscriber-only stories
- Stories from private accounts
- Stories from users who have blocked the viewer

---

### Finding 12: Story Highlights Endpoint Has No Auth Guard
**File:** `apps/api/src/modules/stories/stories.controller.ts`, lines 45-49
**Severity:** P1 — Minor privacy concern

```ts
@Get('highlights/:userId')
@ApiOperation({ summary: "Get user's highlight albums" })
getHighlights(@Param('userId') userId: string) {
  return this.storiesService.getHighlights(userId);
}
```

No auth guard. Anyone can view any user's highlight albums, even if the user has a private account.

---

### Finding 13: Post Feed `following` Type Does Not Filter `scheduledAt` Posts in `getBlendedFeed`
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 271-281
**Severity:** P1 — Scheduled posts leak

In `getBlendedFeed()`:
```ts
const followingPosts = await this.prisma.post.findMany({
  where: {
    isRemoved: false,
    scheduledAt: null,  // OK - filters scheduled
    userId: { in: visibleUserIds },
  },
  ...
});
```

This is correct, BUT in `getFavoritesFeed()` (line 393):
```ts
const posts = await this.prisma.post.findMany({
  where: {
    userId: { in: favoriteIds },
    isRemoved: false,
    // MISSING: scheduledAt: null
  },
  ...
});
```

Favorites feed does NOT filter out scheduled (future) posts. Users can see scheduled posts of their favorites before publication time.

---

### Finding 14: Post Feed `chronological` Type Does Not Filter `scheduledAt`
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 351-359
**Severity:** P1 — Scheduled posts leak

```ts
const posts = await this.prisma.post.findMany({
  where: {
    userId: { in: visibleUserIds },
    isRemoved: false,
    // MISSING: scheduledAt: null
  },
  ...
});
```

Chronological feed does not filter out scheduled (future) posts.

---

### Finding 15: Follows Query Capped at `take: 50` — Users With >50 Follows Get Incomplete Feed
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 164-165
**Also:** `apps/api/src/modules/stories/stories.service.ts`, lines 52-56
**Severity:** P1 HIGH — Core feature broken for active users

All follow queries use `take: 50`:
```ts
this.prisma.follow.findMany({
  where: { followerId: userId },
  select: { followingId: true },
  take: 50,
})
```

If a user follows 200 people, only posts from 50 of them appear in the feed. The other 150 people's content is invisible. This is a hard cap, not a pagination cursor.

For stories, only stories from 50 followed users are shown.

**Impact:** Users following >50 accounts get an arbitrarily truncated feed with no indication that content is missing.

---

### Finding 16: Feed Admin Feature Endpoint Lacks Admin Role Check
**File:** `apps/api/src/modules/feed/feed.controller.ts`, lines 163-171
**Severity:** P1 HIGH — Authorization bypass

```ts
@UseGuards(ClerkAuthGuard)
@Put('admin/posts/:id/feature')
@ApiOperation({ summary: 'Feature or unfeature a post (admin)' })
async featurePost(
  @Param('id') postId: string,
  @Body() body: { featured: boolean },
) {
  return this.feed.featurePost(postId, body.featured);
}
```

The `admin/` prefix in the route is cosmetic. Any authenticated user can feature or unfeature any post. There is no admin role check (`@Roles('admin')` or similar guard).

---

### Finding 17: `featurePost` Body Has No DTO Validation
**File:** `apps/api/src/modules/feed/feed.controller.ts`, line 168
**Severity:** P1 — Validation bypass

```ts
@Body() body: { featured: boolean }
```

Inline type, no DTO class. The `featured` field is never validated — any value (string, number, undefined) passes through without a `class-validator` `@IsBoolean()` check.

---

### Finding 18: `session-signal` Endpoint Body Has No DTO Validation
**File:** `apps/api/src/modules/feed/feed.controller.ts`, lines 112-113
**Severity:** P1 — Validation bypass / potential abuse

```ts
@Body() body: { contentId: string; action: 'view' | 'like' | 'save' | 'share' | 'skip'; hashtags?: string[]; scrollPosition?: number }
```

Inline type, no DTO class with class-validator decorators. A malicious user could:
- Send unlimited session signals to manipulate their feed
- Inject arbitrary data into the in-memory `sessionSignals` map
- Cause memory growth by sending many unique contentIds (the `viewedIds` Set grows unbounded)

---

### Finding 19: `replyToStory` Controller Reads Body Field Without DTO Validation
**File:** `apps/api/src/modules/stories/stories.controller.ts`, lines 110-112
**Severity:** P1 — No validation

```ts
replyToStory(
  @Param('id') id: string,
  @CurrentUser('id') userId: string,
  @Body('content') content: string,
)
```

`@Body('content')` reads a raw field without any DTO. No `@MaxLength`, no `@IsString()`. Users can send arbitrarily long story replies.

---

### Finding 20: `submitStickerResponse` Controller Has No DTO Validation
**File:** `apps/api/src/modules/stories/stories.controller.ts`, lines 176-177
**Severity:** P1 — Validation bypass

```ts
async submitStickerResponse(@Param('id') id: string, @CurrentUser('id') userId: string,
  @Body() body: { stickerType: string; responseData: Record<string, unknown> }) {
```

Inline type, no DTO. `stickerType` and `responseData` are unvalidated. Arbitrary JSON can be stored in the database.

---

## MEDIUM (P2) — Functional Bugs

### Finding 21: For-You Feed Pagination Produces Duplicates
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 112-159
**Severity:** P2 — UX bug

The for-you feed fetches 200 posts, scores them, sorts by score, then paginates by finding items with `createdAt < cursor`:

```ts
const startIdx = cursor ? scored.findIndex(p => new Date(p.createdAt).toISOString() < cursor) : 0;
const page = scored.slice(Math.max(0, startIdx), Math.max(0, startIdx) + limit + 1);
```

**Problems:**
1. The cursor is `createdAt.toISOString()` but comparison uses string `<` on ISO strings after re-scoring. Between requests, new posts may arrive, scores change, the 200-post window shifts — producing duplicates or skipped items.
2. `findIndex` returns -1 if cursor not found, then `Math.max(0, -1) = 0`, starting from the beginning — returning the same first page again.
3. The same 200-post window is re-fetched and re-scored on every page request. Scoring is non-deterministic (engagement changes between requests).

---

### Finding 22: Reels Feed Has Same Pagination Duplication Bug
**File:** `apps/api/src/modules/reels/reels.service.ts`, lines 233-239
**Severity:** P2 — UX bug

Identical pattern to Finding 21:
```ts
const startIdx = cursor ? scored.findIndex(p => new Date(p.createdAt).toISOString() < cursor) : 0;
const page = scored.slice(Math.max(0, startIdx), Math.max(0, startIdx) + limit + 1);
```

Same problems: duplicates, missed content, cursor-not-found returns page 1 again.

---

### Finding 23: Feed Trending Fetch Loads 200 Posts Into Memory for Application-Level Sorting
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 113-125, 228-240, 286-298
**Also:** `apps/api/src/modules/reels/reels.service.ts`, lines 218-223, 297-311
**Also:** `apps/api/src/modules/feed/feed.service.ts`, lines 159-171
**Severity:** P2 — Performance/scalability

Every trending/for-you feed request fetches 200 items from the database, loads ALL into Node.js memory, scores them with JS math, sorts them, then takes the first 20. This happens on EVERY request (30s cache for for-you only).

At scale with millions of posts, this approach:
- Wastes DB bandwidth (200 rows per request, uses only 20)
- Wastes server memory (200 full post objects with user relations)
- Gets slower as the database grows
- Could be a SQL `ORDER BY` with a composite score expression

---

### Finding 24: Trending Feed `cursor` Using `id < cursor` Only Works With Monotonic IDs
**File:** `apps/api/src/modules/feed/feed.service.ts`, line 166
**Also:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 361, 385, 409
**Severity:** P2 — Pagination may break

```ts
...(cursor ? { id: { lt: cursor } } : {}),
```

Combined with `orderBy: { createdAt: 'desc' }`, this uses `id < cursor` as a pagination cursor. This only works correctly if IDs are monotonically ordered the same as `createdAt`. With `cuid()` (used for core models), IDs are roughly time-ordered but NOT guaranteed to be perfectly monotonic. With `uuid()` (used for newer models), IDs are completely random — `id < cursor` would skip arbitrary items.

---

### Finding 25: Nearby Content Feed Ignores lat/lng and radiusKm Parameters
**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 297-334
**Severity:** P2 — Feature is a stub

```ts
async getNearbyContent(lat: number, lng: number, radiusKm: number, cursor?: string, userId?: string) {
  // Find posts with locationName that were created nearby
  // Since we don't have lat/lng on posts, we search for posts with any locationName
  const posts = await this.prisma.post.findMany({
    where: {
      locationName: { not: null },
      isRemoved: false,
    },
    ...
  });
}
```

The `lat`, `lng`, and `radiusKm` parameters are accepted but completely ignored. The query returns ALL posts with ANY `locationName` regardless of geographic proximity. A user in Sydney gets posts from Tokyo.

---

### Finding 26: FeedService.getNearbyContent Has Wrong hasMore Calculation
**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 326-327
**Severity:** P2 — Infinite scroll bug

```ts
const posts = await this.prisma.post.findMany({ ... take: limit }); // takes exactly 20
const hasMore = posts.length === limit; // true if exactly 20 returned
```

Standard pagination pattern is `take: limit + 1` and `hasMore = posts.length > limit`. Here, when exactly 20 items remain, `hasMore` is `true`, causing the client to fetch another page that returns 0 items (wasted request). When 20 items are returned from a larger set, there's no way to distinguish "exactly 20 left" from "more than 20 left".

---

### Finding 27: Post react() Increments likesCount Even When Changing Reaction Type
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 614-661
**Severity:** P2 — Counter inflation

```ts
if (existing) {
  // Update reaction type — NO counter change
  await this.prisma.postReaction.update({ ... });
} else {
  // New reaction — increment likesCount
  await this.prisma.$transaction([
    this.prisma.postReaction.create({ ... }),
    this.prisma.post.update({ data: { likesCount: { increment: 1 } } }),
  ]);
}
```

This is actually correct for the first reaction. But consider: User reacts LIKE -> unreacts -> reacts LOVE. On unreact, `likesCount` decrements. On the second reaction, it increments again. The `likesCount` counter tracks "like count" but the reaction can be LOVE/SUPPORT/INSIGHTFUL. All reaction types increment `likesCount`. The field name is misleading — it's really "reactionsCount".

---

### Finding 28: Personalized Feed Session Signals Stored In-Memory — Lost on Restart
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 26-31
**Severity:** P2 — Feature degrades

```ts
private sessionSignals = new Map<string, {
  likedCategories: Map<string, number>;
  viewedIds: Set<string>;
  sessionStart: number;
  scrollDepth: number;
}>();
```

Session signals are stored in a `Map` on the service instance. On server restart, all session data is lost. In a multi-instance deployment, different instances have different session data — a user's session signals may go to instance A while their feed request goes to instance B.

---

### Finding 29: Personalized Feed viewedIds Set Grows Without Bound
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 48-61
**Severity:** P2 — Memory leak

```ts
session.viewedIds.add(signal.contentId);
```

The `viewedIds` Set grows without bound per user. There is a 30-minute session timeout (line 50) but within an active session, a user scrolling through thousands of items accumulates thousands of entries. Multiply by concurrent users = unbounded memory growth.

---

### Finding 30: Ramadan Detection Is Hardcoded for 2026/2027 Only
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 129-139
**Severity:** P2 — Feature stops working

```ts
private isRamadanPeriod(date: Date): boolean {
  if (year === 2026 && ((month === 1 && day >= 18) || (month === 2 && day <= 19))) return true;
  if (year === 2027 && ((month === 1 && day >= 8) || (month === 2 && day <= 9))) return true;
  return false;
}
```

After 2027, Ramadan boost never activates. The Islamic feed algorithm silently loses 20% of its boost during the holiest month of the year.

---

### Finding 31: Enhanced Search Has Malformed Prisma `OR` Clause
**File:** `apps/api/src/modules/feed/feed-transparency.service.ts`, lines 177-184
**Severity:** P2 — Query likely fails or returns wrong results

```ts
const posts = await this.prisma.post.findMany({
  where: {
    isRemoved: false,
    visibility: 'PUBLIC',
    OR: keywords.map((kw) => ({
      content: { contains: kw, mode: 'insensitive' as const },
    take: 50,
  })),
  },
  ...
});
```

The `take: 50` is inside the `OR` array element. Each OR condition becomes:
```ts
{ content: { contains: kw, mode: 'insensitive' }, take: 50 }
```

`take` is not a valid field inside a Prisma where-clause `OR` element. This either crashes or silently ignores the extra field.

---

### Finding 32: Post Comments Do Not Filter Blocked/Muted Users
**File:** `apps/api/src/modules/posts/posts.service.ts`, line 737+
**Severity:** P2 — Safety

The `getComments(postId, cursor)` method (called from controller line 170) does not accept a `userId` parameter and does not filter comments from blocked/muted users. Compare with `reels.getComments()` which correctly filters.

---

### Finding 33: Post `getComments` Does Not Filter isRemoved on User
**File:** `apps/api/src/modules/posts/posts.service.ts`, line ~738
**Severity:** P2 — Shows content from banned/deactivated users

Posts feed filters `user: { isPrivate: false, isBanned: false }` but comments do not check if the comment author is banned or deactivated.

---

### Finding 34: CreateStoryDto Allows Arbitrary `stickerData` Without Validation
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts`, lines 58-60
**Severity:** P2 — Data integrity

```ts
@IsOptional()
@IsArray()
stickerData?: object[];
```

`object[]` allows any arbitrary JSON objects. No validation on individual sticker structure, no `@ValidateNested()`, no max array size. A user could send megabytes of sticker data.

---

### Finding 35: CreateStoryDto Missing `subscribersOnly` Field
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts`
**Severity:** P2 — Feature incomplete

The DTO has no `subscribersOnly` field, but `stories.service.ts` line 122 accepts it and line 137 stores it:
```ts
subscribersOnly: data.subscribersOnly ?? false,
```

Since the DTO doesn't declare `subscribersOnly`, the `class-validator` validation pipeline will strip it (with `whitelist: true` option) or it won't be validated. Either way, the field can't be set via the API properly.

---

### Finding 36: For-You Feed Cursor Is createdAt ISO String, Following Feed Cursor Is ID
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 150 vs 215
**Severity:** P2 — Client confusion

For-you feed returns:
```ts
cursor: data[data.length - 1].createdAt.toISOString()  // ISO date string
```

Following feed returns:
```ts
cursor: items[items.length - 1].id  // CUID string
```

The mobile client uses the same `postsApi.getFeed(feedType, cursor)` call for both types. When the user switches feed type mid-session, the cursor from one type is invalid for the other. This either returns wrong results or errors.

---

### Finding 37: Blended Feed `hasMore` Logic Is Incorrect
**File:** `apps/api/src/modules/posts/posts.service.ts`, line 320
**Severity:** P2 — Pagination breaks

```ts
const hasMore = followingPosts.length > halfLimit || scoredTrending.length > halfLimit;
```

`followingPosts` is fetched with `take: halfLimit + 1` (so `> halfLimit` is correct), but `scoredTrending` is the result of scoring all 200 fetched trending posts, then slicing. `scoredTrending.length > halfLimit` is almost always true (as long as there are >10 trending posts), so `hasMore` is almost always `true`, causing the client to infinitely request more pages.

---

### Finding 38: Feed `enrichPostsForUser` Has `take: 50` Limiting Enrichment
**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 417-427
**Severity:** P2 — Incorrect like/save state

```ts
const [reactions, saves] = await Promise.all([
  this.prisma.postReaction.findMany({
    where: { userId, postId: { in: postIds } },
    take: 50,
  }),
  this.prisma.savedPost.findMany({
    where: { userId, postId: { in: postIds } },
    take: 50,
  }),
]);
```

If the feed page has >50 posts (unlikely with normal pagination but possible with blended/trending), not all reactions/saves are fetched. More practically: the `take: 50` is redundant here since `postIds` is already bounded by page size (~20), but it demonstrates a pattern where `take` limits might truncate results.

---

## MODERATE (P3) — UX & Polish

### Finding 39: Post Feed Does Not Return `isFollowing` for Post Authors
**File:** `apps/api/src/modules/posts/posts.service.ts`, POST_SELECT (lines 25-59)
**Severity:** P3 — UX incomplete

The post feed returns user data `{ id, username, displayName, avatarUrl, isVerified }` but NOT `isFollowing`. The mobile Saf tab cannot show a "Follow" button on post cards from non-followed users in the for-you feed.

---

### Finding 40: Reel Feed Returns `createdAt` as Cursor Instead of ID
**File:** `apps/api/src/modules/reels/reels.service.ts`, line 276
**Severity:** P3 — Inconsistency

```ts
cursor: hasMore ? enhancedData[enhancedData.length - 1].createdAt : null,
```

Cursor is `createdAt` (a Date), but the feed request uses cursor comparison `{ createdAt: { lt: new Date(cursor) } }` which can produce duplicates when two reels have the same `createdAt` timestamp.

---

### Finding 41: Bakra Tab Header Is Absolutely Positioned But Not Transparent
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 788-799
**Severity:** P3 — Visual bug

```ts
header: {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  zIndex: 10,
  // No backgroundColor defined
}
```

The header is absolutely positioned over the video but has no background. The "Bakra" logo text and icons overlap directly on the video content without any gradient or background. This makes text unreadable on bright videos. Instagram/TikTok use a top gradient overlay (which is present on the bottom but NOT on top in this implementation).

---

### Finding 42: Bakra Logo Uses fontWeight Instead of fontFamily
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 800-805
**Severity:** P3 — Inconsistency with project rules

```ts
logo: {
  fontWeight: '700',  // Should use fontFamily: 'PlayfairDisplay_700Bold'
}
```

Per CLAUDE.md font rules, bold text should use the registered font family name, not `fontWeight`.

---

### Finding 43: Story Viewer Does Not Handle Multi-Group Navigation
**File:** `apps/mobile/app/(screens)/story-viewer.tsx`
**Severity:** P3 — Missing feature

Instagram's story viewer allows swiping left/right between different users' story groups. This implementation only handles a single group (the one passed via params). When the last story in a group finishes, it calls `router.back()` instead of advancing to the next user's stories.

---

### Finding 44: Story Viewer Progress Resets on Pause/Unpause Incorrectly
**File:** `apps/mobile/app/(screens)/story-viewer.tsx`, lines 266-276
**Severity:** P3 — UX bug

```ts
useEffect(() => {
  if (paused || showViewers || story?.mediaType?.startsWith('video')) {
    cancelAnimation(progressValue);
    return;
  }
  progressValue.value = 0;  // RESETS to 0 every time
  progressValue.value = withTiming(1, { duration: STORY_DURATION }, ...);
}, [storyIndex, paused, showViewers, ...]);
```

When the user pauses (long press) and releases, `paused` changes from `true` to `false`, triggering this effect. The progress resets to 0 and restarts from the beginning instead of resuming from where it was paused. A 5-second image story effectively becomes infinite if the user keeps tapping.

---

### Finding 45: Story Reply Uses messagesApi.createDM Instead of storiesApi.replyToStory
**File:** `apps/mobile/app/(screens)/story-viewer.tsx`, lines 311-319
**Severity:** P3 — Feature mismatch

```ts
const replyMutation = useMutation({
  mutationFn: async () => {
    const convo = await messagesApi.createDM(group!.user.id);
    await messagesApi.sendMessage(convo.id, { content: replyText });
  },
});
```

The backend has a dedicated `POST /stories/:id/reply` endpoint (`storiesApi.replyToStory`) that creates a STORY_REPLY message type with proper context. The mobile app bypasses this and creates a generic DM instead. The story reply loses its STORY_REPLY message type and the link to the specific story.

---

### Finding 46: Story Emoji Reactions Use Generic DM Instead of Dedicated API
**File:** `apps/mobile/app/(screens)/story-viewer.tsx`, lines 322-328
**Severity:** P3 — Feature mismatch

```ts
const reactionMutation = useMutation({
  mutationFn: async (emoji: string) => {
    const convo = await messagesApi.createDM(group!.user.id);
    await messagesApi.sendMessage(convo.id, { content: emoji });
  },
});
```

Emoji reactions to stories are sent as regular DMs containing just the emoji character. There's no STORY_REACTION message type, no link to the specific story. The story owner sees a random emoji in DMs with no context.

---

### Finding 47: Bakra Double-Tap Like Gesture Is Shared Across All ReelItems
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 646-655, 671
**Severity:** P3 — Gesture bug

```ts
const doubleTapGesture = Gesture.Tap()
  .numberOfTaps(2)
  .onEnd(() => {
    const reel = reels[currentIndex];  // Always uses currentIndex from closure
    if (reel && !reel.isLiked) {
      handleLike(reel);
    }
  });
```

This single gesture is passed to ALL ReelItem instances via the `doubleTapGesture` prop. The gesture closure captures `currentIndex`, so double-tapping any reel always likes the reel at `currentIndex`, not necessarily the one being tapped.

Additionally, a new gesture is NOT recreated when `currentIndex` changes (it's not in the deps of `renderItem`'s useCallback). The gesture handler captures a stale `currentIndex`.

---

### Finding 48: Bakra `renderItem` useCallback Dependencies Are Incomplete
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 657-674
**Severity:** P3 — Stale closure bugs

```ts
const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => (
  <ReelItem ... />
), [currentIndex, handleLike, handleBookmark, ...]);
```

`handleLike` is an async function defined directly in the component (line 539), NOT wrapped in useCallback. It's a new reference on every render, causing `renderItem` to be re-created on every render, defeating the memoization. Same for `handleBookmark`, `handleShare`, etc.

---

### Finding 49: Saf Tab `listHeader` useMemo Has Stale Callback Dependencies
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 382
**Severity:** P3 — Performance

```ts
const listHeader = useMemo(() => (...),
  [storyGroups, feedType, setFeedType, user?.id, router, feedTypeAnimStyle, bannerDismissed, dismissBanner]);
```

`FEED_TABS` is recreated on every render (line 215-218, depends on `t()` which changes on language switch). But `FEED_TABS` is used inside the memoized header. If the user changes language, the tab labels won't update because `FEED_TABS` is not in the dependency array.

---

### Finding 50: Feed Transparency `explainPost` Does Simplistic Hashtag Parsing
**File:** `apps/api/src/modules/feed/feed-transparency.service.ts`, lines 80-83
**Severity:** P3 — Inaccurate

```ts
const hashtagMatches = post.content?.match(/#\w+/g) || [];
```

This regex won't match Arabic hashtags (`#العربية`) because `\w` only matches `[a-zA-Z0-9_]`. The app targets the global Muslim community where Arabic hashtags are extremely common.

---

### Finding 51: Story Feed Sort Is Incomplete — No Recency Tiebreaker
**File:** `apps/api/src/modules/stories/stories.service.ts`, lines 99-105
**Severity:** P3 — UX

```ts
result.sort((a, b) => {
  if (a.user.id === userId) return -1;
  if (b.user.id === userId) return 1;
  if (a.hasUnread && !b.hasUnread) return -1;
  if (!a.hasUnread && b.hasUnread) return 1;
  return 0;  // No tiebreaker
});
```

When two users both have unread stories (or both are read), their order is arbitrary (depends on JS engine's sort stability). Should sort by latest story timestamp as a tiebreaker.

---

### Finding 52: Reel Templates Tab Labels Are Hardcoded English
**File:** `apps/mobile/app/(screens)/reel-templates.tsx`, lines 33-37
**Severity:** P3 — i18n violation

```ts
const TABS = [
  { key: 'trending', label: 'Trending' },
  { key: 'recent', label: 'Recent' },
  { key: 'mine', label: 'My Templates' },
] as const;
```

Hardcoded English strings instead of `t('reelTemplates.trending')`, etc. All 8 languages show English tab labels.

---

### Finding 53: Reel Templates Use `fonts.mono` Which May Not Exist
**File:** `apps/mobile/app/(screens)/reel-templates.tsx`, line 485
**Severity:** P3 — Font may not render

```ts
segmentTime: {
  fontFamily: fonts.mono,
}
```

The theme token documentation in CLAUDE.md lists `fonts.headingBold`, `fonts.body`, `fonts.bodyMedium`, `fonts.bodyBold`, `fonts.arabic`, `fonts.arabicBold`. No `fonts.mono` is listed. If undefined, React Native falls back to system default.

---

### Finding 54: Bakra Tab Inline Styles in Render Path
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 202-239, 243-251, 262-263, 281-312
**Severity:** P3 — Performance

Multiple inline `style={{ ... }}` objects inside `ReelItem` which is rendered in a FlashList. Each render creates new style objects, defeating React.memo's shallow comparison. The `ReelItem` component has inline styles for:
- Audio info bar container (line 202)
- Animated view (line 208)
- Audio text (line 209)
- Vinyl disc (line 219-228)
- Inner animated view (line 231)
- Cover image (line 233)
- Trending badge (line 243-250)
- Avatar container (line 262)
- Follow button container (line 281-287)
- Check icon container (line 290-294)
- Gradient container (line 302-306)
- Duet button container (lines 383-389)
- Stitch button container (lines 397-414)

---

### Finding 55: `Icon` Component Passed `music` Which May Not Be a Valid IconName
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 209, 339
**Severity:** P3 — Potential crash

The Icon component uses `name="music"` but the CLAUDE.md icon name list does not include "music". The valid names list has 47+ entries but "music" is not among them. This may render as a blank/missing icon.

---

### Finding 56: Saf `feedCache.set` Called But feedCache Is Never Read Back
**File:** `apps/mobile/app/(tabs)/saf.tsx`, lines 271-274, 279-282
**Severity:** P3 — Dead code

```ts
// Cache first page for offline / stale-while-revalidate
if (!pageParam) {
  feedCache.set(CACHE_KEYS.SAF_FEED + ':' + feedType, res);
}
```

And:
```ts
placeholderData: () => {
  // Show cached data immediately while fetching fresh data
  return undefined;  // Always returns undefined, never reads from feedCache
},
```

The cache is written to but the `placeholderData` callback always returns `undefined`. The offline cache write is dead code.

---

### Finding 57: Feed `buildContentFilterWhere` Returns Wrong Type
**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 133-150
**Severity:** P3 — Never called / type mismatch

```ts
async buildContentFilterWhere(userId: string): Promise<Prisma.JsonObject> {
```

Returns `Prisma.JsonObject` but callers would need `Prisma.PostWhereInput`. Additionally, this method is never called anywhere in the codebase — it's an unused utility.

---

### Finding 58: Nearby Feed Does Not Filter Blocked/Muted Users
**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 297-334
**Severity:** P3 — Safety

`getNearbyContent` accepts a `userId` parameter but never uses it for block/mute filtering. Content from blocked users appears in nearby results.

---

### Finding 59: Feed Controller `nearby` Endpoint Does Not Validate lat/lng
**File:** `apps/api/src/modules/feed/feed.controller.ts`, lines 180-193
**Severity:** P3 — Input validation

```ts
@Query('lat') lat: string,
@Query('lng') lng: string,
```

Raw string params parsed with `parseFloat()`. No validation for:
- NaN values (non-numeric strings)
- Out-of-range coordinates (lat > 90, lng > 180)
- Missing values (returns NaN)

---

### Finding 60: Personalized Feed Diversity Check Skips Items Permanently
**File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 236-243
**Severity:** P3 — Content loss

```ts
for (const item of feedItems) {
  if (diversified.length >= limit) break;
  const author = authorMap.get(item.id) || '';
  if (author === lastAuthor && diversified.length < feedItems.length - 1) continue;
  diversified.push(item);
  lastAuthor = author;
}
```

When an author appears back-to-back, the second item is `continue`d (skipped) permanently. It's never retried later. If a popular creator has many high-scoring items, most are silently dropped. The condition `diversified.length < feedItems.length - 1` attempts to prevent total loss but if the array is mostly from one creator, most of their content vanishes.

---

### Finding 61: Feed Interaction Logging Has Race Condition
**File:** `apps/api/src/modules/feed/feed.service.ts`, lines 47-81
**Severity:** P3 — Data integrity

```ts
const existing = await this.prisma.feedInteraction.findFirst({
  where: { userId, postId: data.postId },
});
if (existing) {
  return this.prisma.feedInteraction.update({ ... });
} else {
  return this.prisma.feedInteraction.create({ ... });
}
```

Read-then-write without transaction or upsert. Two concurrent requests for the same user+post can both pass the `findFirst` check and both try to `create`, resulting in a P2002 unique constraint violation crash.

Should use `prisma.feedInteraction.upsert()` instead.

---

### Finding 62: Anonymous Reel View Endpoint Returns Success Without Recording
**File:** `apps/api/src/modules/reels/reels.controller.ts`, lines 163-173
**Severity:** P3 — Analytics gap

```ts
@Post(':id/view')
@UseGuards(OptionalClerkAuthGuard)
view(@Param('id') id: string, @CurrentUser('id') userId?: string) {
  if (userId) {
    return this.reelsService.view(id, userId);
  }
  return { viewed: true };
}
```

Anonymous views are completely discarded. The `viewsCount` on reels only reflects authenticated user views. For a platform with anonymous browsing, this means:
1. View counts are drastically undercounted
2. Trending algorithm is biased against reels that get many anonymous views
3. Creator analytics are inaccurate

---

## Summary

| Severity | Count | Key themes |
|----------|-------|------------|
| P0 Critical | 7 | Story viewer broken, duplicate imports, no reel snap, no block filtering in personalized feed, malformed Prisma queries, dead moderation |
| P1 High | 12 | No block/mute filtering in stories, privacy violations (close friends leak), follows capped at 50, no admin check on feature endpoint |
| P2 Medium | 12 | Pagination duplicates, 200-row in-memory sort, scheduled posts leak, hardcoded Ramadan dates, malformed search query |
| P3 Moderate | 31 | Missing i18n, stale closures, inline styles, dead code, gesture bugs, font issues |
| **Total** | **62** | |

### Most Impactful Issues (by user-facing severity):
1. **Story viewer completely broken from Saf feed** (Finding 1) — no stories viewable
2. **Reels don't snap** (Finding 4) — core TikTok-like UX broken
3. **Personalized feed ignores blocks** (Finding 5) — safety violation
4. **Close-friends stories visible to everyone** (Finding 9) — privacy breach
5. **Follows capped at 50** (Finding 15) — active users get truncated feeds
6. **Reel moderation never fires** (Finding 7) — references non-existent field
7. **Duplicate Pressable imports** (Findings 2, 3) — screens may crash
