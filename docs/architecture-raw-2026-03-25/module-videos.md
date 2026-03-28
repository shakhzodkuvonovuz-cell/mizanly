# Module: Videos (Minbar)

> Extraction date: 2026-03-25
> Source: `apps/api/src/modules/videos/`
> Service file: 1,007 lines | Controller: 331 lines | 6 DTOs | 1 module file

---

## 1. Module File

**File:** `apps/api/src/modules/videos/videos.module.ts` (17 lines)

```
Line 1-16
```

### Imports (other modules)
| Module | Purpose |
|--------|---------|
| `NotificationsModule` | Send VIDEO_LIKE, VIDEO_COMMENT notifications |
| `StreamModule` | Cloudflare Stream upload/delete |
| `GamificationModule` | Award XP + streak on video creation |
| `ModerationModule` | Pre-save content safety (text + image) |
| `AiModule` | Image moderation for thumbnails |

### Providers
- `VideosService`

### Controllers
- `VideosController`

### Exports
- `VideosService` (consumed by other modules)

---

## 2. Controller

**File:** `apps/api/src/modules/videos/videos.controller.ts` (331 lines)
**Swagger tag:** `Videos (Minbar)`
**Route prefix:** `/videos`

### Endpoint Summary (28 endpoints)

| # | Method | Path | Auth | Rate Limit | DTO | Handler | Line |
|---|--------|------|------|------------|-----|---------|------|
| 1 | POST | `/videos` | ClerkAuthGuard | 5/60s | CreateVideoDto | `create()` | 32-42 |
| 2 | GET | `/videos/feed` | OptionalClerkAuth | default | — | `getFeed()` | 44-53 |
| 3 | GET | `/videos/comments/:commentId/replies` | OptionalClerkAuth | default | — | `getCommentReplies()` | 55-65 |
| 4 | GET | `/videos/:id` | OptionalClerkAuth | default | — | `getById()` | 67-75 |
| 5 | PATCH | `/videos/:id` | ClerkAuthGuard | default | UpdateVideoDto | `update()` | 77-87 |
| 6 | DELETE | `/videos/:id` | ClerkAuthGuard | default | — | `delete()` | 89-98 |
| 7 | POST | `/videos/:id/like` | ClerkAuthGuard | 30/60s | — | `like()` | 100-110 |
| 8 | POST | `/videos/:id/dislike` | ClerkAuthGuard | 30/60s | — | `dislike()` | 112-122 |
| 9 | DELETE | `/videos/:id/reaction` | ClerkAuthGuard | default | — | `removeReaction()` | 124-133 |
| 10 | POST | `/videos/:id/comment` | ClerkAuthGuard | 30/60s | CreateVideoCommentDto | `comment()` | 135-146 |
| 11 | GET | `/videos/:id/comments` | OptionalClerkAuth | default | — | `getComments()` | 148-156 |
| 12 | POST | `/videos/:id/bookmark` | ClerkAuthGuard | 30/60s | — | `bookmark()` | 158-168 |
| 13 | DELETE | `/videos/:id/bookmark` | ClerkAuthGuard | default | — | `unbookmark()` | 170-179 |
| 14 | POST | `/videos/:id/view` | OptionalClerkAuth | 10/60s | — | `view()` | 181-195 |
| 15 | PATCH | `/videos/:id/progress` | ClerkAuthGuard | 30/60s | VideoProgressDto | `updateProgress()` | 197-208 |
| 16 | POST | `/videos/:id/report` | ClerkAuthGuard | 10/60s | ReportDto | `report()` | 210-221 |
| 17 | GET | `/videos/:id/recommended` | OptionalClerkAuth | default | — | `getRecommended()` | 223-233 |
| 18 | POST | `/videos/:id/record-progress` | ClerkAuthGuard | 30/60s | VideoProgressDto | `recordProgress()` | 235-246 |
| 19 | GET | `/videos/:id/share-link` | OptionalClerkAuth | default | — | `getShareLink()` | 248-253 |
| 20 | POST | `/videos/:id/premiere` | ClerkAuthGuard | default | CreatePremiereDto | `createPremiere()` | 257-266 |
| 21 | GET | `/videos/:id/premiere` | OptionalClerkAuth | default | — | `getPremiere()` | 268-273 |
| 22 | POST | `/videos/:id/premiere/reminder` | ClerkAuthGuard | default | — | `setPremiereReminder()` | 275-280 |
| 23 | DELETE | `/videos/:id/premiere/reminder` | ClerkAuthGuard | default | — | `removePremiereReminder()` | 282-287 |
| 24 | POST | `/videos/:id/premiere/start` | ClerkAuthGuard | default | — | `startPremiere()` | 289-294 |
| 25 | GET | `/videos/:id/premiere/viewers` | OptionalClerkAuth | default | — | `getPremiereViewerCount()` | 296-301 |
| 26 | PUT | `/videos/:id/end-screens` | ClerkAuthGuard | default | SetEndScreensDto | `setEndScreens()` | 305-315 |
| 27 | GET | `/videos/:id/end-screens` | OptionalClerkAuth | default | — | `getEndScreens()` | 317-322 |
| 28 | DELETE | `/videos/:id/end-screens` | ClerkAuthGuard | default | — | `deleteEndScreens()` | 324-330 |

### Route Ordering Notes
- `/videos/feed` (line 44) and `/videos/comments/:commentId/replies` (line 55) are placed BEFORE the `/:id` wildcard (line 67) to avoid route collision.

### Controller-level Logic
- **Line 63-64:** `getCommentReplies` parses `limit` query string to integer, defaults to 20.
- **Line 189-194:** `view()` — anonymous users get `{ viewed: true }` without recording. Only authenticated users trigger service call.
- **Line 231:** `getRecommended` parses `limit` query string, defaults to 10.
- **Line 314:** `setEndScreens` passes `dto.items` (the array) to service, not the full DTO.

---

## 3. DTOs

### 3.1 CreateVideoDto

**File:** `apps/api/src/modules/videos/dto/create-video.dto.ts` (65 lines)

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `channelId` | `string` | `@IsUUID()` | YES | Must reference a Channel the user owns |
| `title` | `string` | `@IsString()`, `@MaxLength(100)` | YES | |
| `description` | `string` | `@IsString()`, `@MaxLength(5000)` | no | |
| `videoUrl` | `string` | `@IsUrl()` | YES | R2 presigned URL or external |
| `thumbnailUrl` | `string` | `@IsUrl()` | no | Moderated by AI before save |
| `duration` | `number` | `@IsNumber()`, `@Min(1)`, `@Max(43200)` | YES | Seconds, max 12 hours |
| `category` | `VideoCategory` | `@IsEnum(VideoCategory)` | no | Defaults to OTHER |
| `tags` | `string[]` | `@IsArray()`, `@IsString({each})`, `@ArrayMaxSize(20)` | no | |
| `normalizeAudio` | `boolean` | `@IsBoolean()` | no | Defaults to false |

### 3.2 UpdateVideoDto

**File:** `apps/api/src/modules/videos/dto/update-video.dto.ts` (37 lines)

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `title` | `string` | `@MaxLength(100)` | no | |
| `description` | `string` | `@MaxLength(5000)` | no | |
| `thumbnailUrl` | `string` | `@IsUrl()` | no | |
| `category` | `VideoCategory` | `@IsEnum(VideoCategory)` | no | |
| `tags` | `string[]` | `@ArrayMaxSize(20)`, `@MaxLength(50, {each})` | no | Per-tag max 50 chars |

**Note:** UpdateVideoDto does NOT extend PartialType(CreateVideoDto). It's independently defined. Missing fields: `channelId`, `videoUrl`, `duration`, `normalizeAudio` are not updatable.

### 3.3 CreateVideoCommentDto

**File:** `apps/api/src/modules/videos/dto/create-video-comment.dto.ts` (11 lines)

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `content` | `string` | `@IsString()`, `@MaxLength(2000)` | YES | |
| `parentId` | `string` | `@IsString()` | no | For threaded replies |

### 3.4 ReportDto

**File:** `apps/api/src/modules/videos/dto/report.dto.ts` (10 lines)

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `reason` | `string` | `@IsString()`, `@MinLength(3)`, `@MaxLength(500)` | YES | Mapped to ReportReason enum in service |

### 3.5 VideoProgressDto

**File:** `apps/api/src/modules/videos/dto/video-progress.dto.ts` (10 lines)

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `progress` | `number` | `@IsNumber()`, `@Min(0)`, `@Max(1)` | YES | 0.0 to 1.0 (percentage) |

### 3.6 EndScreenItemDto + SetEndScreensDto

**File:** `apps/api/src/modules/videos/dto/end-screen.dto.ts` (17 lines)

**EndScreenItemDto:**

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `type` | `string` | `@IsIn(['subscribe','watch_next','playlist','link'])` | YES | Maps to EndScreenType enum |
| `targetId` | `string` | `@IsString()` | no | Video/playlist/channel ID |
| `label` | `string` | `@IsString()`, `@MaxLength(60)` | YES | |
| `url` | `string` | `@IsUrl()` | no | For 'link' type |
| `position` | `string` | `@IsIn([6 positions])` | YES | top-left, top-right, bottom-left, bottom-right, center-left, center-right |
| `showAtSeconds` | `number` | `@IsNumber()`, `@Min(5)`, `@Max(30)` | YES | When to show (seconds before end) |

**SetEndScreensDto:**

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `items` | `EndScreenItemDto[]` | `@IsArray()`, `@ArrayMaxSize(6)`, `@ValidateNested({each})`, `@Type(() => EndScreenItemDto)` | YES | Max 6 in DTO but service enforces max 4 |

**DISCREPANCY:** DTO allows `@ArrayMaxSize(6)` but service `setEndScreens()` at line 924 throws if `items.length > 4`. The controller Swagger summary also says "max 4". The DTO should be `@ArrayMaxSize(4)`.

### 3.7 CreatePremiereDto

**File:** `apps/api/src/modules/videos/dto/premiere.dto.ts` (8 lines)

| Field | Type | Validators | Required | Notes |
|-------|------|-----------|----------|-------|
| `scheduledAt` | `string` | `@IsDateString()` | YES | Must be in the future (validated in service) |
| `chatEnabled` | `boolean` | `@IsBoolean()` | no | Defaults to true |
| `countdownTheme` | `string` | `@IsIn(['EMERALD','GOLD','COSMIC'])` | no | Defaults to EMERALD |
| `trailerUrl` | `string` | `@IsUrl()` | no | Optional trailer video |

---

## 4. Service — Method-by-Method

**File:** `apps/api/src/modules/videos/videos.service.ts` (1,007 lines)

### 4.0 Constants and Constructor

**Lines 24-68: `VIDEO_SELECT`** — Prisma select object used across queries. Fields:
- `id, userId, channelId, title, description, videoUrl, streamId, hlsUrl, dashUrl, qualities, isLooping, normalizeAudio, thumbnailUrl, duration, category, tags, chapters, viewsCount, likesCount, dislikesCount, commentsCount, status, isRemoved, publishedAt, createdAt`
- Nested `user`: `id, username, displayName, avatarUrl, isVerified`
- Nested `channel`: `id, handle, name, avatarUrl, isVerified`

**Line 70:** `VideoWithRelations` type derived from `Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>`

**Lines 76-85: Constructor injection:**
| Dependency | Type | Usage |
|-----------|------|-------|
| `prisma` | `PrismaService` | All DB operations |
| `redis` | `Redis` (via `@Inject('REDIS')`) | Feed caching (30s TTL) |
| `notifications` | `NotificationsService` | VIDEO_LIKE, VIDEO_COMMENT notifications |
| `stream` | `StreamService` | Cloudflare Stream upload/delete |
| `gamification` | `GamificationService` | (injected but used via QueueService) |
| `contentSafety` | `ContentSafetyService` | Pre-save text moderation |
| `ai` | `AiService` | Pre-save image moderation (thumbnails) |
| `queueService` | `QueueService` | Async gamification jobs + search index |

---

### 4.1 `enhanceVideos(videos, userId?)` — private helper

**Lines 87-111**

- **Purpose:** Batch-fetch user's reactions and bookmarks for a list of videos, attach `isLiked`, `isDisliked`, `isBookmarked` booleans.
- **Params:** `videos: VideoWithRelations[]`, `userId?: string`
- **Returns:** Array of videos with added boolean flags
- **Logic:**
  1. Early return if no userId or empty array
  2. `Promise.all`: fetch `videoReaction` and `videoBookmark` (both `take: 50`)
  3. Split reactions into liked/disliked by `isLike` boolean
  4. Map each video with `isLiked`, `isDisliked`, `isBookmarked`

---

### 4.2 `create(userId, dto)` — POST /videos

**Lines 113-193**

- **Params:** `userId: string`, `dto: CreateVideoDto`
- **Returns:** Video with `isLiked: false, isDisliked: false, isBookmarked: false`
- **Prisma models:** `Channel`, `Video`, `Channel` (update count)
- **Cross-module calls:** `contentSafety.moderateText()`, `ai.moderateImage()`, `stream.uploadFromUrl()`, `queueService.addGamificationJob()` (x2)

**Logic flow:**
1. **Line 115-119:** Verify channel exists and user owns it. Throws `NotFoundException` or `ForbiddenException`.
2. **Lines 121-131:** Pre-save text moderation — concatenates title + description, calls `contentSafety.moderateText()`. If not safe, throws `BadRequestException` with flag details.
3. **Lines 133-140:** Pre-save thumbnail moderation — if `thumbnailUrl` provided, calls `ai.moderateImage()`. If `BLOCK`, throws `BadRequestException`.
4. **Lines 142-163:** `$transaction` — creates Video (status: `PROCESSING`) + increments `Channel.videosCount`.
5. **Lines 166-181:** Fire-and-forget Cloudflare Stream ingestion via `stream.uploadFromUrl()`. On success: updates `video.streamId`. On failure: falls back to `status: 'PUBLISHED'` with raw URL.
6. **Lines 183-185:** Queue gamification jobs: `video_created` XP + `posting` streak.
7. **Lines 187-193:** Return video with default reaction flags.

**Initial video status:** `PROCESSING` (transitions to PUBLISHED via Stream webhook or fallback).

---

### 4.3 `getFeed(userId?, category?, cursor?, limit=20)` — GET /videos/feed

**Lines 195-298**

- **Params:** `userId?: string`, `category?: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `{ data: Video[], meta: { cursor, hasMore } }`
- **Caching:** Redis key `feed:videos:${userId}:${category}:${cursor}`, 30s TTL (only for logged-in users)

**Logic flow:**
1. **Lines 197-201:** Check Redis cache (logged-in users only).
2. **Lines 203-210:** Fetch blocks + mutes to build `excludedIds` (both `take: 50`).
3. **Lines 218-222:** Fetch subscribed channels (`take: 50`). Note: `channelIds` is computed but NOT used in the where clause (potential oversight — subscriptions don't affect feed ordering).
4. **Lines 226-237:** Build where clause: `status: PUBLISHED`, `user.isPrivate: false`, exclude blocked/muted users, filter by category (validates against `VideoCategory` enum).
5. **Lines 240-251:** Cursor pagination with `take: limit + 1`, ordered by `publishedAt DESC, viewsCount DESC`.
6. **Lines 253-278:** Compute pagination metadata + fetch user reactions/bookmarks.
7. **Lines 280-297:** Enhance data, cache result for 30s, return.

**Category validation:** Line 232-233 validates category against `Object.values(VideoCategory)`, throws `BadRequestException` for invalid values.

**NOTE:** `scheduledAt` filter is NOT applied — scheduled/unpublished videos would need `status: PUBLISHED` to appear, so they're effectively filtered by status. However, a video could be set to PUBLISHED + have a future `scheduledAt` and it would appear in the feed.

---

### 4.4 `getById(videoId, userId?)` — GET /videos/:id

**Lines 300-350**

- **Params:** `videoId: string`, `userId?: string`
- **Returns:** Video with `isLiked, isDisliked, isBookmarked, isSubscribed`
- **Prisma models:** `Video`, `Block`, `VideoReaction`, `VideoBookmark`, `Subscription`

**Logic flow:**
1. **Lines 301-305:** Fetch video. Throws `NotFoundException` if not found, not PUBLISHED, or isRemoved.
2. **Lines 307-318:** Bi-directional block check — if either user blocked the other, return NotFoundException (hides video from blocked users).
3. **Lines 325-341:** If authenticated, fetch reaction + bookmark + subscription in parallel.
4. **Lines 343-349:** Return video with all flags including `isSubscribed` (unique to this endpoint — not returned by feed).

---

### 4.5 `update(videoId, userId, dto)` — PATCH /videos/:id

**Lines 352-386**

- **Params:** `videoId: string`, `userId: string`, `dto: UpdateVideoDto`
- **Returns:** Updated video with reaction/bookmark flags

**Logic flow:**
1. **Lines 353-357:** Ownership check (NotFoundException + ForbiddenException).
2. **Lines 359-369:** Update with `sanitizeText()` on title and description. Does NOT re-run content moderation on updates (potential gap).
3. **Lines 372-385:** Re-fetch reaction/bookmark state and return.

**NOTE:** No content moderation on update path. A user could create a clean video then edit title/description to include harmful content.

---

### 4.6 `delete(videoId, userId)` — DELETE /videos/:id

**Lines 388-418**

- **Params:** `videoId: string`, `userId: string`
- **Returns:** `{ deleted: true }`
- **Cross-module calls:** `stream.deleteVideo()`, `queueService.addSearchIndexJob()`

**Logic flow:**
1. **Lines 389-391:** Ownership check.
2. **Lines 393-403:** `$transaction`: soft-delete (`isRemoved: true`) + decrement `Channel.videosCount` (raw SQL with GREATEST to prevent negative).
3. **Lines 406-410:** Fire-and-forget Cloudflare Stream deletion.
4. **Lines 412-415:** Queue search index deletion job (Meilisearch).

**Soft delete pattern:** Sets `isRemoved: true` rather than hard-deleting the row. All query methods check for `status: PUBLISHED` but not all check `isRemoved` — `getById()` checks at line 305, but `getFeed()` does NOT check `isRemoved` (bug: deleted videos could appear in feed until status changes).

---

### 4.7 `like(videoId, userId)` — POST /videos/:id/like

**Lines 420-475**

- **Params:** `videoId: string`, `userId: string`
- **Returns:** `{ liked: true }`
- **Prisma models:** `Video`, `VideoReaction`
- **Cross-module:** `notifications.create()` (VIDEO_LIKE)

**Logic flow:**
1. **Lines 421-422:** Video existence + PUBLISHED check.
2. **Lines 424-427:** Check existing reaction. If already liked, throw `ConflictException`.
3. **Lines 430-456:** Interactive `$transaction`:
   - If existing dislike: update to like + decrement dislikesCount + increment likesCount (GREATEST protects against negative).
   - If new: create reaction + increment likesCount.
4. **Lines 458-466:** Notify video owner (not self-like). Fire-and-forget.
5. **Lines 467-471:** P2002 (unique constraint) race condition handling — returns success.

**Like/Dislike model:** Uses `VideoReaction` with `isLike: boolean` (true=like, false=dislike). NOT the generic reaction system (emoji-based). This is YouTube-style binary like/dislike.

---

### 4.8 `dislike(videoId, userId)` — POST /videos/:id/dislike

**Lines 477-511**

- Same pattern as `like()` but inverted.
- Does NOT send notification for dislikes (intentional — YouTube also hides dislike notifications).
- If existing like, switches to dislike: decrement likesCount + increment dislikesCount.

---

### 4.9 `removeReaction(videoId, userId)` — DELETE /videos/:id/reaction

**Lines 513-537**

- **Params:** `videoId: string`, `userId: string`
- **Returns:** `{ removed: true }`

**Logic:**
1. Find existing reaction. Throw NotFoundException if none.
2. `$transaction`: Delete reaction + decrement appropriate count (likesCount if was like, dislikesCount if was dislike).

---

### 4.10 `comment(videoId, userId, content, parentId?)` — POST /videos/:id/comment

**Lines 539-583**

- **Params:** `videoId: string`, `userId: string`, `content: string`, `parentId?: string`
- **Returns:** Comment object with user data
- **Cross-module:** `notifications.create()` (VIDEO_COMMENT)

**Logic:**
1. Video existence + PUBLISHED check.
2. `$transaction`: Create comment (with `sanitizeText()`) + increment `video.commentsCount`.
3. Comment select: `id, content, createdAt, user { id, username, displayName, avatarUrl }`.
4. Notify video owner (not self-comment). Body truncated to 100 chars.

**Threading:** `parentId` enables nested comments. Top-level comments have `parentId: null`. The model `VideoComment` has self-referential relation `VideoCommentThread`.

---

### 4.11 `getComments(videoId, cursor?, limit=20)` — GET /videos/:id/comments

**Lines 585-625**

- **Returns:** `{ data: Comment[], meta: { cursor, hasMore } }`
- **Filtering:** `parentId: null` (top-level only)
- **Ordering:** `likesCount DESC` (most popular first)
- **Includes:** `_count.replies` mapped to `repliesCount`
- **User fields:** `id, username, displayName, avatarUrl, isVerified`

---

### 4.12 `deleteComment(videoId, commentId, userId)` — NOT exposed via controller

**Lines 627-643**

- **IMPORTANT:** This method exists in the service but is NOT mapped to any controller endpoint.
- **Auth:** Both comment author AND video owner can delete.
- **Soft delete:** Sets content to `'[deleted]'` + decrements `video.commentsCount`.

---

### 4.13 `bookmark(videoId, userId)` — POST /videos/:id/bookmark

**Lines 645-664**

- Video existence + PUBLISHED check.
- ConflictException if already bookmarked.
- `$transaction`: Create bookmark + increment `video.savesCount`.
- Returns `{ bookmarked: true }`.

---

### 4.14 `unbookmark(videoId, userId)` — DELETE /videos/:id/bookmark

**Lines 666-679**

- NotFoundException if no existing bookmark.
- `$transaction`: Delete bookmark + decrement `savesCount` (GREATEST protects negative).
- Returns `{ bookmarked: false }`.

---

### 4.15 `view(videoId, userId)` — POST /videos/:id/view

**Lines 681-716**

- **Deduplication:** Checks `WatchHistory` — only increments view count if last watch was >24 hours ago.
- **Logic:**
  1. Video existence + PUBLISHED check.
  2. Find existing WatchHistory by composite unique `[userId, videoId]`.
  3. Determine `isNewView` (no history OR >24h since last watch).
  4. `$transaction`: Upsert WatchHistory + conditionally increment `video.viewsCount` AND `channel.totalViews`.
- Returns `{ viewed: true }`.

**Note:** The controller (line 189-194) gates this — anonymous users get immediate success without calling this method.

---

### 4.16 `updateProgress(videoId, userId, progress)` — PATCH /videos/:id/progress

**Lines 718-725**

- **Upsert** on WatchHistory: sets `progress` and `completed: progress >= 95`.
- The 95% threshold means a video is considered "completed" at 95% watched.
- Returns `{ updated: true }`.

---

### 4.17 `report(videoId, userId, reason)` — POST /videos/:id/report

**Lines 727-754**

- Video existence check.
- **Deduplication:** Checks for existing report by `reporterId + description = "video:{videoId}"`. Returns `{ reported: true }` if already reported (idempotent).
- **Reason mapping:** Maps string reason to `ReportReason` enum via lookup table. Unrecognized reasons fall back to `OTHER`.
- Creates `Report` record (not `VideoReport` — uses the shared `Report` model with description-based targeting).
- Returns `{ reported: true }`.

**Report reasons supported:** SPAM, HARASSMENT, HATE_SPEECH, VIOLENCE, MISINFORMATION, NUDITY, IMPERSONATION, OTHER.

---

### 4.18 `getRecommended(videoId, limit=10, userId?)` — GET /videos/:id/recommended

**Lines 756-782**

- Finds similar videos by: same channel OR same category OR overlapping tags (`hasSome`).
- Excludes the source video.
- Ordered by `viewsCount DESC` (most popular).
- Enhanced with user reaction/bookmark flags via `enhanceVideos()`.
- Returns flat array (not paginated).

---

### 4.19 `getCommentReplies(commentId, cursor?, limit=20)` — GET /videos/comments/:commentId/replies

**Lines 784-818**

- Validates comment exists.
- Fetches `VideoComment` where `parentId = commentId`.
- Ordered by `createdAt ASC` (chronological for replies).
- Cursor-paginated.
- Returns `{ data, meta: { cursor, hasMore } }`.

---

### 4.20 `recordProgress(videoId, userId, progress)` — POST /videos/:id/record-progress

**Line 820-822**

- Delegates to `updateProgress()`. This is a **duplicate endpoint** — POST vs PATCH semantics.

---

### 4.21 `getShareLink(videoId)` — GET /videos/:id/share-link

**Lines 824-831**

- Video existence check.
- Returns `{ url: "https://mizanly.app/video/${videoId}" }`.
- **Hardcoded domain** — should use `APP_URL` env variable.

---

### 4.22 `createPremiere(videoId, userId, dto)` — POST /videos/:id/premiere

**Lines 835-856**

- **Auth:** Verifies user owns the video via `findFirst({ id, userId })`.
- **Validation:** `scheduledAt` must be in the future.
- Creates `VideoPremiere` record with: scheduledAt, chatEnabled (default true), countdownTheme (default EMERALD), trailerUrl.
- Also updates `Video.isPremiereEnabled = true` and `Video.scheduledAt`.
- Returns the premiere object.

---

### 4.23 `getPremiere(videoId)` — GET /videos/:id/premiere

**Lines 858-867**

- Finds premiere by `videoId` (unique constraint).
- Includes: `video.title, video.thumbnailUrl, video.userId, video.channel { name, handle, avatarUrl }`.
- NotFoundException if no premiere.

---

### 4.24 `setPremiereReminder(videoId, userId)` — POST /videos/:id/premiere/reminder

**Lines 869-887**

- Premiere existence check.
- `$transaction`: Create `PremiereReminder` + increment `premiere.reminderCount` (raw SQL on `video_premieres` table).
- P2002 handling: if already set, returns `{ success: true }` (idempotent).

---

### 4.25 `removePremiereReminder(videoId, userId)` — DELETE /videos/:id/premiere/reminder

**Lines 889-900**

- Premiere existence check.
- `$transaction`: Delete reminder by composite PK `[premiereId, userId]` + decrement `reminderCount` (GREATEST protects negative).

---

### 4.26 `startPremiere(videoId, userId)` — POST /videos/:id/premiere/start

**Lines 902-912**

- Ownership check via `findFirst({ id, userId })`.
- Updates `VideoPremiere.isLive = true`.
- Does NOT update video status or publish the video (potential gap — starting a premiere should likely set video to PUBLISHED).

---

### 4.27 `getPremiereViewerCount(videoId)` — GET /videos/:id/premiere/viewers

**Lines 914-917**

- Returns `{ viewerCount: premiere?.viewerCount || 0 }`.
- Returns 0 even if premiere doesn't exist (no NotFoundException).

---

### 4.28 `setEndScreens(videoId, userId, items)` — PUT /videos/:id/end-screens

**Lines 921-945**

- Ownership check.
- Max 4 items (service-level validation, overrides DTO's max 6).
- **Replace-all pattern:** Deletes existing end screens then creates new ones.
- Each item: type cast to `EndScreenType` enum, position stored as string, showAtSeconds as float.
- Returns array of created EndScreen records.

---

### 4.29 `getEndScreens(videoId)` — GET /videos/:id/end-screens

**Lines 947-953**

- Returns all end screens for video, ordered by `showAtSeconds DESC`, `take: 50`.
- No auth required beyond OptionalClerkAuth.

---

### 4.30 `deleteEndScreens(videoId, userId)` — DELETE /videos/:id/end-screens

**Lines 955-960**

- Ownership check.
- `deleteMany` all end screens for video.
- Returns `{ success: true }`.

---

### 4.31 `getChapters(videoId)` — NOT exposed via controller

**Lines 964-970**

- Fetches `VideoChapter` records ordered by `timestampSeconds ASC`.
- `take: 50` limit.
- **Not exposed** — no controller endpoint maps to this.

---

### 4.32 `parseChaptersFromDescription(videoId, userId)` — NOT exposed via controller

**Lines 972-1006**

- **Purpose:** Parses YouTube-style timestamp chapters from video description.
- **Regex pattern:** `/(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/g` — matches `0:00 Title`, `2:30 Title`, `1:05:30 Title`.
- **Logic:**
  1. Ownership check.
  2. Parse timestamps from description.
  3. Convert to seconds (supports HH:MM:SS and MM:SS).
  4. Delete existing chapters, create new ones with `createMany`.
  5. Return chapters via `getChapters()`.
- Returns empty array if no description or no matches.

---

## 5. Prisma Models Referenced

### 5.1 Video (schema line 1376)
```
id, userId?, channelId, title (VarChar 200), description? (VarChar 10000),
videoUrl, streamId?, hlsUrl?, dashUrl?, qualities[] (default []),
isLooping (default false), normalizeAudio (default false),
thumbnailUrl?, blurhash?, duration (Float), width?, height?,
status (VideoStatus default DRAFT), category (VideoCategory default OTHER),
tags[] (default []), language (default "en"), chapters? (Json),
viewsCount (default 0), likesCount (default 0), dislikesCount (default 0),
commentsCount (default 0), sharesCount (default 0), savesCount (default 0),
avgWatchDuration?, completionRate?,
isRemoved (default false), isAgeRestricted (default false),
isPremiereEnabled (default false), scheduledAt?,
publishedAt?, createdAt, updatedAt
```

**Indexes:** `[channelId, publishedAt DESC]`, `[status, publishedAt DESC]`, `[category, viewsCount DESC]`, `[tags]`

### 5.2 VideoComment (schema line 1441)
```
id, videoId, userId, parentId? (self-ref VideoCommentThread),
content (VarChar 2000), likesCount (default 0), timestamp? (Float),
isPinned (default false), createdAt
```

### 5.3 VideoReaction (schema line 1462)
```
Composite PK: [userId, videoId]
isLike (Boolean), createdAt
```

### 5.4 VideoBookmark (schema line 2171)
```
Composite PK: [userId, videoId]
createdAt
```

### 5.5 WatchHistory (schema line 2183)
```
id, userId, videoId, watchedAt, progress (Float default 0), completed (Boolean default false)
Unique: [userId, videoId]
```

### 5.6 VideoPremiere (schema line 3253)
```
id (uuid), videoId (unique), scheduledAt, isLive (default false),
chatEnabled (default true), reminderCount (default 0), viewerCount (default 0),
countdownTheme (CountdownTheme default EMERALD), trailerUrl?,
createdAt, updatedAt
```

### 5.7 PremiereReminder (schema line 3272)
```
Composite PK: [premiereId, userId]
createdAt
```

### 5.8 EndScreen (schema line 3307)
```
id (uuid), videoId, type (EndScreenType), targetId?,
label (VarChar 60), url?, position (default "bottom-right"),
showAtSeconds (Float default 10), createdAt
```

### 5.9 VideoChapter (schema line 4304)
```
id, videoId, title (VarChar 200), timestampSeconds (Int),
order (Int default 0), createdAt
```

### 5.10 Channel (schema line 1348)
```
id, userId? (unique), handle (unique), name (VarChar 100),
description? (VarChar 5000), avatarUrl?, bannerUrl?,
subscribersCount (default 0), videosCount (default 0),
totalViews (default 0), isMonetized (default false),
isVerified (default false), createdAt, updatedAt, trailerVideoId?
```

### 5.11 Subscription (schema line 1476)
```
Composite PK: [userId, channelId]
notificationsOn (default true), createdAt
```

---

## 6. Enums

### VideoStatus
```
DRAFT | PROCESSING | PUBLISHED | UNLISTED | PRIVATE
```

### VideoCategory
```
EDUCATION | QURAN | LECTURE | VLOG | NEWS | DOCUMENTARY | ENTERTAINMENT | SPORTS | COOKING | TECH | OTHER
```

### EndScreenType
```
SUBSCRIBE | WATCH_NEXT | PLAYLIST | LINK
```

### CountdownTheme
```
EMERALD | GOLD | COSMIC
```

### ReportReason
```
HATE_SPEECH | HARASSMENT | VIOLENCE | SPAM | MISINFORMATION | NUDITY | SELF_HARM | TERRORISM | DOXXING | COPYRIGHT | IMPERSONATION | OTHER
```

---

## 7. Cross-Module Dependencies

| Dependency | Direction | Methods Called |
|-----------|-----------|---------------|
| `NotificationsModule` → `NotificationsService` | outbound | `create({ type: 'VIDEO_LIKE' \| 'VIDEO_COMMENT', ... })` |
| `StreamModule` → `StreamService` | outbound | `uploadFromUrl(url, metadata)`, `deleteVideo(streamId)` |
| `GamificationModule` → `GamificationService` | injected but not directly called | (used via QueueService) |
| `ModerationModule` → `ContentSafetyService` | outbound | `moderateText(text)` |
| `AiModule` → `AiService` | outbound | `moderateImage(url)` |
| `QueueService` (from common) | outbound | `addGamificationJob()`, `addSearchIndexJob()` |
| Redis (`@Inject('REDIS')`) | outbound | `get()`, `setex()` for feed caching |

---

## 8. Key Architecture Patterns

### 8.1 Video Lifecycle
```
CREATE → status: PROCESSING
  ├─ Stream upload succeeds → streamId saved (status stays PROCESSING until webhook)
  ├─ Stream upload fails → status: PUBLISHED (fallback to raw R2 URL)
  └─ (Stream webhook would set PUBLISHED + hlsUrl/dashUrl — handled in StreamModule)

PUBLISHED → visible in feed, getById, recommendations
SOFT DELETE → isRemoved: true (row preserved, Stream video deleted async)
```

### 8.2 Channel Requirement
- Every video MUST belong to a channel (`channelId` required in DTO).
- User must OWN the channel (`channel.userId === userId`).
- Channel counters maintained: `videosCount` incremented on create, decremented (GREATEST 0) on delete.
- `totalViews` incremented on each unique view.

### 8.3 Like/Dislike System (YouTube-style)
- Binary: `VideoReaction.isLike` = true (like) or false (dislike).
- Switching: like→dislike or dislike→like updates in-place, adjusts both counters atomically.
- Remove: deletes reaction, decrements appropriate counter.
- Only likes trigger notifications. Dislikes are silent.

### 8.4 Comment Threading
- `VideoComment.parentId` self-referential relation.
- Top-level comments: `parentId: null`, ordered by `likesCount DESC`.
- Replies: `parentId = commentId`, ordered by `createdAt ASC`.
- `_count.replies` returned as `repliesCount` for top-level comments.
- Delete is soft: content set to `'[deleted]'`.
- Both comment author AND video owner can delete.

### 8.5 Watch Progress Tracking
- `WatchHistory` table: `userId + videoId` unique.
- `progress`: 0.0 to 1.0 float.
- `completed`: auto-set when `progress >= 0.95` (95%).
- View deduplication: same user can only increment viewCount once per 24 hours.
- Two endpoints for updating progress (PATCH `/progress` and POST `/record-progress`) — both call same service method.

### 8.6 Premiere System
- One premiere per video (`videoId` unique in `VideoPremiere`).
- Must be scheduled in the future.
- Countdown themes: EMERALD, GOLD, COSMIC.
- Reminders tracked per-user via `PremiereReminder` join table.
- `isLive` flag set by `startPremiere()`.
- Viewer count available (but no mechanism to increment it — would need Socket.io integration).

### 8.7 End Screens
- Max 4 items per video (service-level, DTO allows 6).
- Types: subscribe, watch_next, playlist, link.
- 6 position slots: top-left, top-right, bottom-left, bottom-right, center-left, center-right.
- showAtSeconds: 5-30 seconds before video end.
- Replace-all on PUT (delete existing + create new).

### 8.8 Chapters
- Parsed from description using YouTube-style timestamps.
- `VideoChapter` model with `timestampSeconds` and `order`.
- `parseChaptersFromDescription()` is NOT exposed via controller (needs endpoint).
- `getChapters()` is NOT exposed via controller (needs endpoint).

### 8.9 Share Links
- Hardcoded to `https://mizanly.app/video/${videoId}`.
- Should use `APP_URL` environment variable.

### 8.10 Feed Caching
- Redis, 30-second TTL.
- Key: `feed:videos:${userId}:${category}:${cursor}`.
- Only for authenticated users.
- No cache invalidation on new video creation.

---

## 9. Identified Issues / Gaps

| # | Severity | Issue | Line(s) |
|---|----------|-------|---------|
| 1 | **BUG** | `getFeed()` does not filter `isRemoved: true` — deleted videos could appear in feed | 226-237 |
| 2 | **BUG** | `getFeed()` computes `channelIds` (subscriptions) but never uses them in the where clause | 218-237 |
| 3 | **GAP** | `update()` does NOT run content moderation — harmful content can be edited in after initial clean creation | 352-369 |
| 4 | **GAP** | `deleteComment()` exists in service (line 627) but has NO controller endpoint | 627-643 |
| 5 | **GAP** | `getChapters()` and `parseChaptersFromDescription()` exist in service but have NO controller endpoints | 964-1006 |
| 6 | **DISCREPANCY** | End screen DTO allows 6 items (`@ArrayMaxSize(6)`) but service enforces max 4 | DTO line 15 vs service line 924 |
| 7 | **HARDCODED** | Share link domain hardcoded to `mizanly.app` — should use `APP_URL` env | 830 |
| 8 | **GAP** | `startPremiere()` sets `isLive: true` but does not publish the video or update video status | 902-912 |
| 9 | **GAP** | `getPremiereViewerCount()` returns data but no mechanism exists to INCREMENT viewer count (needs Socket.io) | 914-917 |
| 10 | **DUPLICATE** | `recordProgress()` (POST) duplicates `updateProgress()` (PATCH) — identical behavior | 820-822 |
| 11 | **PERF** | `enhanceVideos()` uses `.includes()` on arrays — O(n) per video. Should use Set for O(1) lookup | 102-110 |
| 12 | **PERF** | `getFeed()` also uses `.includes()` for the same pattern | 282-284 |
| 13 | **GAP** | No search index creation on `create()` — only deletion is queued on `delete()` | 412-415 |
| 14 | **GAP** | Feed cache has no invalidation — new videos won't appear for up to 30s | 293-294 |
| 15 | **NOTE** | Report uses shared `Report` model with string-encoded target `"video:{id}"` — not a proper FK | 746-752 |

---

## 10. Test Files

| File | Lines | Description |
|------|-------|-------------|
| `videos.controller.spec.ts` | 9,520 | Controller unit tests |
| `videos.service.spec.ts` | 42,282 | Main service tests |
| `videos.service.auth.spec.ts` | 5,837 | Authorization/ownership tests |
| `videos.service.concurrency.spec.ts` | 5,689 | Race condition / P2002 handling tests |
| `videos.service.edge.spec.ts` | 9,402 | Edge cases (empty data, limits, malformed input) |
| `videos.service.enum.spec.ts` | 2,656 | Enum validation tests |
| **Total** | **~75,386** | |

---

## 11. File Size Summary

| File | Lines | Tokens (approx) |
|------|-------|-----------------|
| `videos.service.ts` | 1,007 | ~10,400 |
| `videos.controller.ts` | 331 | ~3,300 |
| `videos.module.ts` | 17 | ~170 |
| `dto/create-video.dto.ts` | 65 | ~650 |
| `dto/update-video.dto.ts` | 37 | ~370 |
| `dto/create-video-comment.dto.ts` | 11 | ~110 |
| `dto/report.dto.ts` | 10 | ~100 |
| `dto/video-progress.dto.ts` | 10 | ~100 |
| `dto/end-screen.dto.ts` | 17 | ~170 |
| `dto/premiere.dto.ts` | 8 | ~80 |
| **Total source** | **1,513** | **~15,450** |
