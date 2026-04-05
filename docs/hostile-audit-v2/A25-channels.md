# A25: Channels & Channel Posts Audit

**Scope:** `apps/api/src/modules/channels/` (13 files), `apps/api/src/modules/channel-posts/` (7 files)
**Auditor:** Hostile code audit — every line read
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] A25-01 — Recommended channels limit parameter unbounded (DoS vector)

**File:** `channels.controller.ts:58`, `channels.service.ts:451-473`

The `GET /channels/recommended?limit=<N>` endpoint parses the query parameter with `parseInt(limit, 10)` but never clamps it. The value is passed directly to a raw SQL `LIMIT ${limit}` clause and then to `prisma.channel.findMany({ take: 50 })`.

An attacker can send `?limit=999999` which flows directly into the raw SQL:
```
LIMIT 999999
```
The raw SQL at line 473 will attempt to return up to 999,999 rows. While the subsequent `findMany` is capped at `take: 50`, the raw SQL query itself is uncapped and will cause PostgreSQL to scan and return an arbitrarily large result set.

Additionally, `parseInt("NaN", 10)` returns `NaN`, and `parseInt("-5", 10)` returns `-5`. Neither is validated.

The cache key at line 453 includes the raw limit: `recommended:channels:${userId}:${limit}`. An attacker can send `?limit=1`, `?limit=2`, ..., `?limit=10000` to pollute Redis with thousands of unique cache entries per user.

**Impact:** Database DoS via expensive unbounded query. Redis cache pollution.
**Fix:** Clamp limit: `const safeLim = Math.min(Math.max(limitNum || 10, 1), 50);`

---

### [HIGH] A25-02 — getVideos limit parameter never validated (internal default bypass)

**File:** `channels.service.ts:258`

The `getVideos` method signature is `async getVideos(handle, userId?, cursor?, limit = 20)`. The `limit` parameter defaults to 20 but is never exposed as a query parameter in the controller (line 124-130). However, since `limit` is a function parameter with no clamp, any future caller (another service, internal API) could pass `limit=999999` and query would use `take: 1000000` at line 308.

More importantly, unlike `getFeed` in channel-posts which uses `Math.min(Math.max(limit, 1), 50)`, this method has zero validation. If the controller ever exposes `limit` as a query param, it becomes an instant DoS.

**Impact:** Latent DoS vector. Defense-in-depth violation.
**Fix:** Add `const safeLim = Math.min(Math.max(limit, 1), 50);` at top of `getVideos`.

---

### [HIGH] A25-03 — Channel post delete only checks post author, not channel owner

**File:** `channel-posts.service.ts:88-92`

```typescript
async delete(postId: string, userId: string) {
    const post = await this.getPostForPermissionCheck(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    await this.prisma.channelPost.delete({ where: { id: postId } });
```

Only the post author (`post.userId`) can delete the post. The channel owner cannot delete posts from their own channel. This is inconsistent with `pin`/`unpin` (lines 95-112) which correctly allow both post author and channel owner. A channel owner should always be able to moderate their own channel by deleting any post.

**Impact:** Channel owner cannot moderate their own community feed. Abusive posts can only be removed by their author.
**Fix:** Add channel owner fallback check, matching the pattern used in `pin`/`unpin`.

---

### [MEDIUM] A25-04 — mediaUrls in CreateChannelPostDto has no URL validation or array size cap

**File:** `channel-posts/dto/create-channel-post.dto.ts:10-15`

```typescript
@IsArray()
@IsString({ each: true })
@MaxLength(2000, { each: true })
@IsOptional()
mediaUrls?: string[];
```

Two issues:
1. **No `@IsUrl()` validation** on array elements. Arbitrary strings (including `javascript:`, `data:`, `file:///`) are accepted as media URLs. The `UpdateChannelDto` (lines 19-20) correctly uses `@IsUrl()` for `avatarUrl` and `bannerUrl`, but channel post media does not.
2. **No `@ArrayMaxSize()` limit**. An attacker can submit an array with 10,000 strings of 2,000 chars each (20MB of URL data) in a single post. This bypasses the `@MaxLength(5000)` on content.

**Impact:** XSS via `javascript:` URLs if rendered client-side. Storage abuse via unbounded array size.
**Fix:** Add `@IsUrl({}, { each: true })` and `@ArrayMaxSize(10)`.

---

### [MEDIUM] A25-05 — No @Throttle on unsubscribe, setTrailer, removeTrailer, getAnalytics, getSubscribers endpoints

**File:** `channels.controller.ts:110-176`

The following authenticated endpoints have NO rate limiting:
- `DELETE :handle/subscribe` (unsubscribe) — line 110
- `GET :handle/analytics` — line 132
- `GET :handle/subscribers` — line 143
- `PUT :handle/trailer` — line 155
- `DELETE :handle/trailer` — line 169

While `subscribe` has `@Throttle({ default: { limit: 30, ttl: 60000 } })`, `unsubscribe` does not. An attacker could rapidly subscribe/unsubscribe in a loop (subscribe is throttled at 30/min, but unsubscribe is unlimited). `getAnalytics` and `getSubscribers` involve database queries that could be hammered.

**Impact:** Resource exhaustion via unthrottled endpoints. Subscribe/unsubscribe churn can desync counter.
**Fix:** Add `@Throttle()` to all five endpoints.

---

### [MEDIUM] A25-06 — Notification fan-out capped at 200 subscribers silently drops the rest

**File:** `channel-posts.service.ts:39-55`

```typescript
this.prisma.subscription.findMany({
    where: { channelId },
    select: { userId: true },
    take: 200,
}).then((subscribers) => {
```

When a channel has >200 subscribers, only the first 200 (by default Prisma order, which is unpredictable without `orderBy`) receive the notification. The remaining subscribers silently get nothing. There is no logging, no pagination to cover remaining subscribers, and no queue job to handle the overflow.

**Impact:** Subscribers beyond the first 200 never receive post notifications. Inconsistent user experience. No indication to the channel owner that notifications were partially delivered.
**Fix:** Use a queue job for fan-out (e.g., `queueService.addNotificationFanoutJob`) that paginates through all subscribers, or at minimum log when the cap is reached.

---

### [MEDIUM] A25-07 — Subscribe/unsubscribe counter update uses find-then-check pattern (TOCTOU race)

**File:** `channels.service.ts:196-219` (subscribe), `channels.service.ts:233-256` (unsubscribe)

The subscribe flow:
1. `findUnique` to check if channel exists (line 197)
2. `findUnique` to check if already subscribed (line 205)
3. `$transaction` to create subscription + increment counter (line 210)

Steps 1-2 are outside the transaction. Two concurrent requests from the same user can both pass step 2 (both see no existing subscription), then both enter the transaction. The unique constraint `@@id([userId, channelId])` on Subscription will cause one to fail with a Prisma unique constraint error, but the `subscribersCount` increment in the other branch of the transaction will succeed — leaving the counter incremented without a matching subscription row, or throwing an unhandled Prisma error (P2002) that surfaces as a 500 Internal Server Error instead of a clean 409 Conflict.

**Impact:** Counter desync under concurrent requests. Unhandled P2002 errors surface as 500s.
**Fix:** Wrap the entire flow in a serializable transaction, or catch P2002 and return ConflictException.

---

### [MEDIUM] A25-08 — Channel userId is nullable (SetNull) — orphan channel can never be updated or deleted

**File:** Prisma schema line 1651: `userId String? @unique`, relation `onDelete: SetNull`

When a user is deleted, `Channel.userId` is set to `null` (SetNull). After this:
- `update()` at service line 155: `channel.userId !== userId` — `null !== 'any-user-id'` is always true, so ForbiddenException. Nobody can update the orphan channel.
- `delete()` at service line 186: same check — nobody can delete the orphan channel.
- `subscribe()` at line 201: `channel.userId === userId` — `null === userId` is always false, so nobody gets the "cannot subscribe to own channel" protection (minor, since the owner no longer exists).
- `getAnalytics()` at line 369: ForbiddenException always.
- `getSubscribers()` at line 416: ForbiddenException always.

The orphan channel continues to appear in `getByHandle`, `getRecommended`, and video listings indefinitely, with no mechanism to clean it up except direct database intervention.

**Impact:** Orphan channels are permanently stuck. Admin cannot manage them through the API.
**Fix:** Either add an admin endpoint to claim/delete orphan channels, or change `onDelete` to `Cascade` (which would auto-delete the channel when the user is deleted).

---

### [MEDIUM] A25-09 — Channel handle has no MinLength validation — empty string accepted

**File:** `channels/dto/create-channel.dto.ts:8`

```typescript
@Matches(/^[a-zA-Z0-9_]+$/, { message: '...' })
handle: string;
```

The regex `/^[a-zA-Z0-9_]+$/` requires at least one character (`+` not `*`), so empty string is technically rejected. However, there is no `@MinLength(3)` or similar. A handle like `"a"` or `"_"` is valid. Single-character handles are poor UX (hard to search, easily squatted) and could conflict with route patterns.

**Impact:** Handle squatting with 1-2 character handles.
**Fix:** Add `@MinLength(3)` to the handle field.

---

### [LOW] A25-10 — getByHandle uses public cache header but returns user-specific isSubscribed

**File:** `channels.controller.ts:64`

```typescript
@Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
```

The response includes `isSubscribed` which is user-specific. A CDN or shared proxy caching this response with `public` would serve user A's subscription status to user B. The `OptionalClerkAuthGuard` means the endpoint serves both anonymous and authenticated users.

For anonymous users, `isSubscribed` is always `false`, so the cached response is correct. But for authenticated users, the `public` cache header is incorrect — the response varies by `Authorization` header.

**Impact:** Shared caches (CDN, proxy) could serve stale subscription status to wrong users.
**Fix:** Use `Cache-Control: private, max-age=60` or add `Vary: Authorization` header. Or return `isSubscribed` only for authenticated requests and keep `public` for anonymous.

---

### [LOW] A25-11 — Channel post getFeed does not verify channel exists

**File:** `channel-posts.service.ts:60-77`

```typescript
async getFeed(channelId: string, userId?: string, cursor?: string, limit = 20) {
    const safeLim = Math.min(Math.max(limit, 1), 50);
    // ... query channel_posts where channelId = channelId
```

Unlike `getVideos` in channels.service.ts (which verifies the channel exists at line 259-262), `getFeed` never checks if the `channelId` actually exists. It queries directly against the `channelId` foreign key. If the channel does not exist, it returns `{ data: [], meta: { cursor: null, hasMore: false } }` — an empty success response instead of a 404.

**Impact:** No error feedback for invalid channel IDs. Client cannot distinguish "channel has no posts" from "channel does not exist."
**Fix:** Add a channel existence check before querying posts.

---

### [LOW] A25-12 — ChannelPostsModule does not import ModerationModule but service injects ContentSafetyService

**File:** `channel-posts.module.ts:5-10`, `channel-posts.service.ts:5,17`

```typescript
// channel-posts.module.ts
@Module({
  controllers: [ChannelPostsController],
  providers: [ChannelPostsService],
  exports: [ChannelPostsService],
})
```

The module does not import `ModerationModule`, yet `ChannelPostsService` injects `ContentSafetyService` (line 17). This works only because the providers are resolved from the global scope (likely `ModerationModule` is `@Global()` or imported elsewhere in the app module). This is a fragile dependency — if the global registration changes, `ChannelPostsService` will fail at runtime with a dependency injection error.

Compare with `channels.module.ts` (line 8) which explicitly imports `ModerationModule`.

**Impact:** Fragile dependency resolution. Could break on module restructuring.
**Fix:** Add `imports: [ModerationModule]` to `ChannelPostsModule`.

---

### [LOW] A25-13 — Channel post like/unlike does not check if user is blocked by channel owner

**File:** `channel-posts.service.ts:125-159`

The `like()` and `unlike()` methods only check if the post exists and if the like already exists. They do not check if the current user is blocked by the channel owner. A blocked user can still like/unlike posts on a channel whose owner has blocked them.

Compare with `getFeed` (line 62) which uses `getExcludedUserIds` to filter blocked users from the feed. But `like`/`unlike` have no such check.

**Impact:** Blocked users can interact with channel posts via likes.
**Fix:** Add block check before allowing like/unlike.

---

### [LOW] A25-14 — Notification on subscribe uses 'FOLLOW' type — misclassified

**File:** `channels.service.ts:223-228`

```typescript
this.notifications.create({
    userId: channel.userId,
    actorId: userId,
    type: 'FOLLOW', // reuse follow notification type for subscription
}).catch(...)
```

The comment explicitly acknowledges reusing `FOLLOW` for subscriptions. This means the channel owner receives "X followed you" when they should receive "X subscribed to your channel." This conflates two different concepts (user follows vs channel subscriptions) and makes notification filtering/settings impossible to distinguish.

**Impact:** Incorrect notification text. Cannot filter subscription notifications separately from follow notifications.
**Fix:** Add a `CHANNEL_SUBSCRIBE` notification type.

---

### [INFO] A25-15 — Hard delete on channel does not clean up R2 media assets

**File:** `channels.service.ts:188-193`

```typescript
await this.prisma.channel.delete({ where: { handle } });
```

Prisma cascade deletes Subscription, Video, ChannelPost, Playlist rows (via `onDelete: Cascade` in schema). However, the actual media files (avatarUrl, bannerUrl, video files, thumbnails) stored in Cloudflare R2 are not cleaned up. The database rows are gone but the R2 objects remain as orphans, consuming storage indefinitely.

**Impact:** Storage cost leak from orphaned R2 objects after channel deletion.
**Fix:** Queue an R2 cleanup job before or after the delete that removes all media associated with the channel's videos, avatar, and banner.

---

### [INFO] A25-16 — videosCount on Channel is never incremented/decremented by these modules

**File:** Prisma schema line 1659: `videosCount Int @default(0)`, channels.service.ts (no references to incrementing videosCount)

The `subscribersCount` is correctly managed via `$executeRaw` in subscribe/unsubscribe. However, `videosCount` is never updated anywhere in the channels or channel-posts modules. If it is updated in the videos module, this is fine — but it means the counter could drift if videos are created/deleted through a different code path.

**Impact:** Potential counter drift if video creation/deletion does not consistently update `videosCount`.
**Fix:** Verify the videos module correctly increments/decrements `videosCount` in all video creation/deletion paths.

---

## Checklist Verification

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | **BOLA — Can non-owners post in channel?** | PASS | `channel-posts.service.ts:24` — `if (channel.userId !== userId) throw new ForbiddenException('Only channel owner can post')` |
| 1 | **BOLA — Can non-owners edit channel settings?** | PASS | `channels.service.ts:155` — `if (channel.userId !== userId) throw new ForbiddenException()` on update, delete, analytics, subscribers, trailer endpoints |
| 2 | **Subscriber management — Can non-admins manage subscribers?** | PASS | `getSubscribers` at line 416 checks `channel.userId !== userId`. No endpoint exists for removing subscribers (kick). Only the owner can view subscribers. |
| 3 | **Rate limit — Channel post creation without @Throttle?** | PASS (class-level) | `channel-posts.controller.ts:11` — `@Throttle({ default: { limit: 30, ttl: 60000 } })` applied at class level covers all channel-post endpoints. PARTIAL FAIL for channels: 5 endpoints missing individual `@Throttle` (A25-05). |
| 4 | **Cascade — Channel delete cleans up posts, subscribers?** | PASS (DB level) | Prisma schema: `Video` (line 1682), `Subscription` (line 1792), `ChannelPost` (line 2996) all have `onDelete: Cascade` referencing Channel. FAIL for R2 media assets (A25-15). |
| 5 | **Privacy — Private channel content visible to non-subscribers?** | N/A | Channel model has no `isPrivate` field. All channels are public. All videos are visible to anyone via `getByHandle` and `getVideos` (OptionalClerkAuthGuard). This is by design — no privacy model exists for channels. |
| 6 | **Pagination — Subscriber lists, post lists bounded?** | PASS | `getSubscribers` uses `take: limit + 1` with default `limit = 20`. `getFeed` uses `safeLim = Math.min(Math.max(limit, 1), 50)`. `getVideos` uses `take: limit + 1` with default 20 but no clamp (A25-02). `getRecommended` is unbounded (A25-01). |
| 7 | **Counter sync — subscribersCount accurate?** | PARTIAL | Atomic `$executeRaw` with `GREATEST(0, ...)` guard in transaction. But TOCTOU race (A25-07) can cause desync under concurrent requests. `videosCount` not managed here (A25-16). |
| 8 | **Moderation — Channel posts moderated?** | PASS | `channel-posts.service.ts:28-31` — `contentSafety.moderateText()` called before `create()`. `channels.service.ts:87-94` — moderation on channel create. `channels.service.ts:159-163` — moderation on channel update. |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 6 |
| LOW | 5 |
| INFO | 2 |
| **Total** | **16** |
