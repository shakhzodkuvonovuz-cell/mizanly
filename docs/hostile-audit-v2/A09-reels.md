# A09: Reels Module Audit

**Scope:** `apps/api/src/modules/reels/reels.controller.ts` (357 lines), `apps/api/src/modules/reels/reels.service.ts` (1391 lines), `apps/api/src/modules/reels/dto/create-reel.dto.ts` (168 lines)

**Date:** 2026-04-05

---

## Findings

### [CRITICAL] F1 — Double View Count Inflation on `GET /reels/:id`

**File:** `reels.controller.ts` line 123, `reels.service.ts` lines 574-581

The `getById` controller method calls `this.reelsService.recordView(id)` on every `GET /reels/:id` request. `recordView()` does an unconditional `UPDATE "reels" SET "viewsCount" = "viewsCount" + 1` with no deduplication. This means:

1. Every page refresh, every API call, every bot crawl inflates `viewsCount`.
2. The dedicated `POST /reels/:id/view` endpoint (line 240) uses the separate `view()` method (line 986) which **does** deduplicate via `reelInteraction`. So there are two competing view-tracking paths -- one deduplicated, one not.
3. The `recordView()` call on line 123 is fire-and-forget (no `await`), but more importantly there is no authentication check -- it fires even for anonymous users via `OptionalClerkAuthGuard`.
4. An attacker can inflate any reel's view count by repeatedly hitting `GET /reels/:id` with no auth. No rate limit on this GET endpoint.

The view count feeds into the trending algorithm score (line 382: `reel.viewsCount * 0.1` and line 464: `reel.viewsCount` in completion proxy denominator), so inflation directly manipulates feed ranking.

---

### [CRITICAL] F2 — Route Shadowing: `DELETE /reels/drafts/:id` Is Unreachable

**File:** `reels.controller.ts` lines 136-141 vs lines 348-356

NestJS resolves routes top-to-bottom within a controller. `@Delete(':id')` is declared at line 136. `@Delete('drafts/:id')` is declared at line 348. When a client sends `DELETE /reels/drafts/some-uuid`, NestJS matches `@Delete(':id')` first with `id = "drafts"`. The request hits `reelsService.delete("drafts", userId)`, which will throw `NotFoundException` because there is no reel with `id = "drafts"`. The actual `deleteDraft` handler is never reached.

This means the draft deletion feature is completely broken at the routing level.

---

### [HIGH] F3 — No Comment Content Moderation

**File:** `reels.service.ts` lines 741-804

The `comment()` method sanitizes input via `sanitizeText(content)` (line 772) but never calls `contentSafety.moderateText()`. Reel captions are moderated on both create (line 99) and update (line 497), but comments bypass moderation entirely. Users can post hate speech, spam, CSAM text, or any violating content in comments without triggering the content safety pipeline.

---

### [HIGH] F4 — `getDownloadUrl` Exposes Raw R2 URLs Without Authorization Checks

**File:** `reels.service.ts` lines 1357-1374

The `getDownloadUrl` method returns the raw `reel.videoUrl` (the Cloudflare R2 storage URL) to any authenticated user. Issues:

1. **No block check:** A blocked user can call `GET /reels/:id/download` and get the video URL, bypassing the block enforced in `getById` (line 543-553).
2. **No scheduled content check:** Future-scheduled reels are accessible via download even though `getById` hides them from non-owners (line 538-539).
3. **No private account check:** Reels from private accounts are downloadable if you know the reel ID, even if you don't follow the account.
4. **No status check:** The method only checks `isRemoved`, not `status === READY`. A `PROCESSING` or `DRAFT` reel can be downloaded.
5. **Raw R2 URL leak:** Returns the actual storage URL. If R2 bucket is public, anyone with this URL can access the video indefinitely without going through the app. Should use time-limited signed URLs.

---

### [HIGH] F5 — `getTrending` Limit Parameter Has No Upper Bound

**File:** `reels.controller.ts` line 76

```typescript
return this.reelsService.getTrendingReels(cursor, limit ? parseInt(limit, 10) : 20);
```

The `limit` query parameter is parsed from a string with no validation. A client can pass `limit=999999` which flows into `scoredFeedCache.getPage()`. While the underlying query fetches max 500 reels (line 459: `take: 500`), the page size calculation in `ScoredFeedCache` may return all 500 items in a single page, causing an oversized response. More importantly, `parseInt("NaN", 10)` returns `NaN`, and `parseInt("-1", 10)` returns `-1`, both of which can cause unexpected behavior in pagination math.

No `@Min`/`@Max` validation, no `ParseIntPipe`, no DTO. Applies only to the trending endpoint; other list endpoints hardcode `limit = 20`.

---

### [HIGH] F6 — Soft-Delete Leaves Orphan Data (Comments, Reactions, Interactions, Tags)

**File:** `reels.service.ts` lines 592-639

The `delete()` method soft-deletes by setting `isRemoved: true`. It correctly cleans up:
- User's `reelsCount` (line 602)
- Audio track's `reelsCount` (line 607)
- Hashtag counters (line 614)
- Cloudflare Stream video (line 622)
- Translation cache (line 628)
- Search index (line 632)

But it does NOT clean up:
- `reelReaction` records (likes remain in DB, `likesCount` stays inflated)
- `reelComment` records (comments remain accessible if queried directly)
- `reelInteraction` records (bookmarks, views, shares remain)
- `reelTaggedUser` records (tag associations remain)
- `reelCommentReaction` records (comment likes remain)

While the soft-deleted reel is filtered from feeds via `isRemoved: false`, the orphan data wastes storage and the stale `likesCount`/`commentsCount`/`sharesCount` values on the reel record are never zeroed. If the reel is ever "un-removed" (e.g., by a moderator reversing a decision), it would show inflated counts from before+after deletion.

---

### [MEDIUM] F7 — Missing Rate Limits on 6 Endpoints

**File:** `reels.controller.ts`

The following endpoints have no `@Throttle` decorator:

| Line | Endpoint | Risk |
|------|----------|------|
| 47-52 | `GET /reels/drafts` | Unlimited reads on draft list |
| 56-64 | `GET /reels/feed` | Unlimited feed fetches (heavy DB query with scoring) |
| 79-88 | `GET /reels/user/:username` | Unlimited user profile scraping |
| 90-99 | `GET /reels/audio/:audioTrackId` | Unlimited audio page reads |
| 116-134 | `GET /reels/:id` | Unlimited single-reel fetch + view inflation (see F1) |
| 171-180 | `GET /reels/:id/comments` | Unlimited comment list reads |
| 194-203 | `DELETE /reels/:id/comments/:commentId/like` | Unlike comment without throttle |
| 274-283 | `GET /reels/:id/duets` | Unlimited duet list reads |
| 285-294 | `GET /reels/:id/stitches` | Unlimited stitch list reads |
| 296-304 | `PATCH /reels/:id/archive` | Archive without throttle |
| 306-314 | `PATCH /reels/:id/publish-trial` | Publish trial without throttle |
| 316-324 | `PATCH /reels/:id/unarchive` | Unarchive without throttle |
| 326-333 | `GET /reels/:id/share-link` | Unlimited share link generation |
| 348-356 | `DELETE /reels/drafts/:id` | Draft deletion without throttle (also unreachable per F2) |

The `GET /reels/feed` endpoint is the most expensive -- it calls `getExcludedUserIds` (3 DB queries), fetches up to 500 reels for scoring, then does engagement lookups. Without rate limiting, a single client can hammer this repeatedly.

---

### [MEDIUM] F8 — No `@Param` UUID Validation on Any Endpoint

**File:** `reels.controller.ts` (all `:id` params)

No endpoint uses `@Param('id', ParseUUIDPipe)`. All `id` parameters are accepted as raw strings and passed directly to Prisma `findUnique({ where: { id } })`. While Prisma will return `null` for a non-UUID string (which then throws `NotFoundException`), this means:

1. Invalid IDs reach the database layer unnecessarily.
2. The error message from Prisma on a malformed UUID may leak internal details.
3. The `commentId` parameter is similarly unvalidated.

---

### [MEDIUM] F9 — Blocked Users' Reels Not Filtered From Feed, Trending, Audio Track, Duets, Stitches

**File:** `reels.service.ts`

Block filtering via `getExcludedUserIds` is used in:
- `getFeed()` (line 361) -- YES
- `getComments()` (line 870) -- YES

Block filtering is **missing** from:
- `getTrendingReels()` (line 433) -- NO block filter. Blocked users' reels appear in trending.
- `getByAudioTrack()` (line 1104) -- NO block filter. `user: { isPrivate: false, ... }` filters banned/deleted but not users blocked by the viewer.
- `getDuets()` (line 1149) -- NO block filter.
- `getStitches()` (line 1199) -- NO block filter.
- `getUserReels()` (line 1013) -- Checks block in the profile-level privacy check (lines 1025-1031 check `isPrivate`) but does NOT check if the viewer has blocked the profile owner or vice versa.

A blocked user's reels will appear in trending feeds and audio track listings. The `getById()` method (line 543) does check blocks, so individual reel access is protected, but list endpoints are not.

---

### [MEDIUM] F10 — `recordView` in `getById` Is Not Awaited -- Silent Failures Possible

**File:** `reels.controller.ts` line 123

```typescript
this.reelsService.recordView(id);
```

This is called without `await`. If `recordView` throws (e.g., reel doesn't exist, DB connection error), the promise rejection is unhandled. While `recordView` internally catches errors (line 578), the outer call in the controller creates an unhandled promise. Node.js will eventually crash on unhandled rejections in production (`--unhandled-rejections=throw`).

Additionally, `recordView` is called BEFORE `getById` checks if the reel exists (line 133). So a request for a non-existent reel ID still triggers a database UPDATE attempt, which silently fails inside the catch.

---

### [MEDIUM] F11 — `saveDraft` Bypasses Content Moderation and Carousel Validation

**File:** `reels.service.ts` lines 1316-1332

The `saveDraft()` method:
1. Does NOT call `contentSafety.moderateText(dto.caption)` even though drafts may later be published.
2. Does NOT validate `isPhotoCarousel` + `carouselUrls` integrity (the `create()` method does at line 106-113).
3. Accepts `dto.videoUrl || ''` (line 1320), allowing empty video URLs, bypassing the `@IsStorageUrl()` validation which would normally reject empty strings.

While drafts are not publicly visible, a user could save a draft with violating content and later convert it to a published reel (if a "publish draft" endpoint exists or is added).

---

### [MEDIUM] F12 — `UpdateReelDto` Allows Larger Caption Than `CreateReelDto`

**File:** `dto/update-reel.dto.ts` line 6 vs `dto/create-reel.dto.ts` line 37

- `CreateReelDto.caption` has `@MaxLength(500)`
- `UpdateReelDto.caption` has `@MaxLength(2200)`

A user can create a reel with a 500-char caption, then immediately update it to 2200 characters. This is either intentional (allowing longer captions on edit) or an inconsistency. If intentional, the `CreateReelDto` limit is unnecessarily restrictive. If not, it's a validation bypass.

Additionally, `UpdateReelDto.hashtags` uses `@ArrayMaxSize(30)` while `CreateReelDto.hashtags` uses `@ArrayMaxSize(20)`. Same inconsistency -- update allows 10 more hashtags than create.

---

### [MEDIUM] F13 — `create()` Increments `reelsCount` Even for Scheduled/Trial Reels

**File:** `reels.service.ts` lines 119-155

The `$transaction` at line 119 always increments the user's `reelsCount` by 1 (line 152), regardless of whether the reel is:
- Scheduled for the future (`dto.scheduledAt` set)
- A trial reel (`dto.isTrial = true`)
- Still in PROCESSING status

This means a user's public reel count includes reels that aren't yet visible to anyone. When a scheduled reel eventually publishes, the count is already incremented, which is correct. But if the scheduled reel is deleted before publishing, the count was incremented at creation and decremented at deletion, so it balances out. However, at any point in time, the count may be misleadingly high.

---

### [LOW] F14 — `getShareLink` Does Not Check Scheduled/Trial/Private Status

**File:** `reels.service.ts` lines 1273-1277

`getShareLink()` only checks `isRemoved`. It does not check:
- `status !== READY` (PROCESSING/DRAFT reels get share links)
- `scheduledAt > now` (future reels get share links)
- `isTrial === true` (trial reels get share links)
- Whether the reel owner's account is private

The generated URL `https://mizanly.app/reel/${reelId}` is returned for any non-removed reel, even though the deep link handler may not be able to display the reel.

---

### [LOW] F15 — Report Uses Free-Text `description` Field as Reel Identifier

**File:** `reels.service.ts` lines 1081-1102

The `report()` method stores the reel ID inside the `description` field as `reel:${reelId}` (line 1097) and uses that same string to check for duplicate reports (line 1086). This is a convention-based foreign key, not a proper `reelId` column on the Report model. Issues:

1. If the `description` field is used for other types of reports (posts, users, comments), namespace collisions are possible.
2. Searching reports by reel ID requires string pattern matching instead of a proper index.
3. The duplicate check uses `findFirst` which scans without a targeted index.

---

### [LOW] F16 — `comment()` Does Not Check Block Status Between Commenter and Reel Owner

**File:** `reels.service.ts` lines 741-804

The `comment()` method checks `commentPermission` and validates `parentId`, but does not check if the commenter is blocked by the reel owner (or vice versa). A blocked user can comment on a reel they can't even view via `getById()` (which does check blocks at line 543).

The `getComments()` method filters out blocked users' comments (line 876 via `getExcludedUserIds`), so the comment would be invisible to the reel owner in the comments list, but it still exists in the database and increments `commentsCount`.

---

### [LOW] F17 — `like()` Does Not Check Block Status

**File:** `reels.service.ts` lines 669-708

Similar to F16, the `like()` method checks if the reel exists and prevents self-likes (line 675), but does not check if the liker is blocked by the reel owner. A blocked user can like a reel, which increments `likesCount` and generates a notification to the reel owner (line 697-701). The notification event fires even from a blocked user.

---

### [LOW] F18 — Video Content Itself Is Never Moderated

**File:** `reels.service.ts` lines 96-348

The `create()` method moderates:
- Caption text (line 99, `contentSafety.moderateText`)
- Thumbnail image (line 322, `moderateReelThumbnail`)

But the actual video content (`dto.videoUrl`) is never moderated. There is no frame extraction, no video content analysis, no NSFW detection on the video itself. A user can upload a clean thumbnail and a violating video. The Cloudflare Stream upload (line 277) provides transcoding but not content moderation.

---

### [INFO] F19 — `getTrending` Does Not Accept `userId` -- No Personalization or Block Filtering

**File:** `reels.controller.ts` lines 66-77, `reels.service.ts` lines 433-487

The `getTrending` controller uses `OptionalClerkAuthGuard` but does not extract `@CurrentUser('id')` and does not pass `userId` to `getTrendingReels()`. The service method has no `userId` parameter. This means:

1. No block/mute filtering on trending (see F9).
2. No `isLiked`/`isBookmarked` status in the response (unlike `getFeed` which enriches items).
3. Every user sees the exact same trending page (cached for 120 seconds).

---

### [INFO] F20 — `savesCount` Increment in `bookmark()` Is Not Wrapped in `GREATEST(0, ...)`

**File:** `reels.service.ts` line 951

```sql
SET "savesCount" = "savesCount" + 1
```

All other counter increments use `GREATEST(0, ...)` for the decrement path, but the `savesCount` increment in `bookmark()` does not. While incrementing can't go negative, this is inconsistent with the pattern used everywhere else. The corresponding `unbookmark()` at line 976 correctly uses `GREATEST("savesCount" - 1, 0)`.

---

## Checklist Verification

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | **BOLA -- Can user A delete user B's reel?** | PASS | `delete()` line 595: `if (reel.userId !== userId) throw new ForbiddenException()`. Same check in `updateReel` (492), `archive` (1252), `unarchive` (1264), `publishTrial` (645), `deleteDraft` (1349). |
| 2 | **Pagination -- Reel feed unbounded?** | PASS (with caveats) | Feed uses `ScoredFeedCache` with page-based pagination (default 20 items). Trending has no upper limit validation on `limit` param (F5). All list endpoints use `take: limit + 1` pattern. However, the scoring lambda fetches up to 500 reels from DB (line 377, 459) regardless of page size. |
| 3 | **Rate limit -- Reel creation without @Throttle?** | PASS for create | `create` has `@Throttle({ limit: 5, ttl: 60000 })` (line 25). But 14 other endpoints lack throttling (F7). |
| 4 | **Race conditions -- View count increments atomic?** | PARTIAL PASS | `recordView()` uses Prisma `{ increment: 1 }` which generates atomic SQL. The `view()` method uses interactive transaction for deduplication (line 991). However, `recordView()` has no deduplication (F1). Like/unlike/share/bookmark use transactions (PASS). |
| 5 | **Cascade -- Reel delete cleans up likes, comments, bookmarks?** | FAIL | Soft-delete (`isRemoved: true`) does NOT clean up `reelReaction`, `reelComment`, `reelInteraction`, `reelTaggedUser`, or `reelCommentReaction` records (F6). |
| 6 | **DTO validation -- videoUrl/thumbnailUrl validated as storage URLs? Duration limits?** | PASS | `videoUrl` has `@IsStorageUrl()` (line 20-21). `thumbnailUrl` has `@IsStorageUrl()` (line 26-27). `duration` has `@Min(1) @Max(180)` (line 30-31). Carousel URLs have `@IsStorageUrl({ each: true })` (line 85). |
| 7 | **Privacy -- Blocked users' reels filtered from feed?** | PARTIAL PASS | `getFeed()` filters via `getExcludedUserIds` (PASS). Trending, audio track, duets, stitches do NOT filter blocked users (FAIL -- F9). |
| 8 | **Moderation -- Video content moderated? Thumbnail moderated?** | PARTIAL PASS | Thumbnail moderated via `moderateReelThumbnail()` (PASS). Caption moderated via `contentSafety.moderateText()` (PASS). Video content itself NOT moderated (FAIL -- F18). Comments NOT moderated (FAIL -- F3). |
