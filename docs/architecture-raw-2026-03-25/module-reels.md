# Module: Reels — Complete Architecture Extraction

> Extracted from `apps/api/src/modules/reels/` — every line, every method, every field.

---

## 1. File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `reels.module.ts` | 15 | Module definition, imports, providers, exports |
| `reels.controller.ts` | 289 | 22 HTTP endpoints |
| `reels.service.ts` | 1163 | All business logic, 22 public methods + 1 private |
| `dto/create-reel.dto.ts` | 168 | DTO for reel creation (27 fields) |
| `dto/create-comment.dto.ts` | 14 | DTO for comment creation (2 fields) |
| `dto/report.dto.ts` | 10 | DTO for reporting (1 field) |
| `reels.service.spec.ts` | — | Unit tests for service |
| `reels.controller.spec.ts` | — | Unit tests for controller |
| `reels.service.concurrency.spec.ts` | — | Concurrency race condition tests |
| `reels.service.edge.spec.ts` | — | Edge case tests |
| `reels.service.auth.spec.ts` | — | Auth/permission tests |
| `reels.publish-fields.spec.ts` | — | Publish field wiring tests |
| `reels.comment-permission.spec.ts` | — | Comment permission enforcement tests |
| `reels.carousel.spec.ts` | — | Carousel feature tests |
| `reels.carousel-validation.spec.ts` | — | Carousel validation tests |

---

## 2. Module Definition (`reels.module.ts`, lines 1–15)

```typescript
@Module({
  imports: [NotificationsModule, StreamModule, GamificationModule, AiModule],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService],
})
export class ReelsModule {}
```

### Imports (line 10)
| Module | Purpose |
|--------|---------|
| `NotificationsModule` | Send LIKE, COMMENT, MENTION notifications |
| `StreamModule` | Cloudflare Stream video ingestion |
| `GamificationModule` | XP awards, streak updates |
| `AiModule` | Image moderation (thumbnail NSFW check) |

### Providers (line 12)
- `ReelsService` — sole service

### Exports (line 13)
- `ReelsService` — exported for other modules to consume (currently only referenced in comments in `content-safety.service.ts`)

### Imported by
- `AppModule` (`app.module.ts` line 19, 119)

---

## 3. Controller (`reels.controller.ts`, 289 lines)

**Prefix:** `/reels` (line 14)
**Tags:** `@ApiTags('reels')` (line 12)
**Global Auth:** `@ApiBearerAuth()` (line 13)

### All Endpoints (22 total)

| # | Method | Path | Guard | Rate Limit | DTO | Handler | Service Method | Lines |
|---|--------|------|-------|------------|-----|---------|----------------|-------|
| 1 | `POST` | `/reels` | `ClerkAuthGuard` | 5/60s | `CreateReelDto` | `create()` | `create()` | 18–27 |
| 2 | `GET` | `/reels/feed` | `OptionalClerkAuthGuard` | default | — | `getFeed()` | `getFeed()` | 31–39 |
| 3 | `GET` | `/reels/trending` | `OptionalClerkAuthGuard` | 30/60s | — (query: cursor, limit) | `getTrending()` | `getTrendingReels()` | 41–52 |
| 4 | `GET` | `/reels/user/:username` | `OptionalClerkAuthGuard` | default | — (query: cursor) | `getUserReels()` | `getUserReels()` | 54–63 |
| 5 | `GET` | `/reels/audio/:audioTrackId` | `OptionalClerkAuthGuard` | default | — (query: cursor) | `getByAudioTrack()` | `getByAudioTrack()` | 65–74 |
| 6 | `PATCH` | `/reels/:id` | `ClerkAuthGuard` | 10/60s | inline `{ caption?, hashtags? }` | `updateReel()` | `updateReel()` | 78–89 |
| 7 | `GET` | `/reels/:id` | `OptionalClerkAuthGuard` | default | — | `getById()` | `getById()` | 91–99 |
| 8 | `DELETE` | `/reels/:id` | `ClerkAuthGuard` | default | — | `delete()` | `delete()` | 101–106 |
| 9 | `POST` | `/reels/:id/like` | `ClerkAuthGuard` | 30/60s | — | `like()` | `like()` | 108–114 |
| 10 | `DELETE` | `/reels/:id/like` | `ClerkAuthGuard` | default | — | `unlike()` | `unlike()` | 116–121 |
| 11 | `POST` | `/reels/:id/comment` | `ClerkAuthGuard` | 30/60s | `CreateCommentDto` | `comment()` | `comment()` | 123–133 |
| 12 | `GET` | `/reels/:id/comments` | `OptionalClerkAuthGuard` | default | — (query: cursor) | `getComments()` | `getComments()` | 135–144 |
| 13 | `POST` | `/reels/:id/comments/:commentId/like` | `ClerkAuthGuard` | 30/60s | — | `likeComment()` | `likeComment()` | 146–156 |
| 14 | `DELETE` | `/reels/:id/comments/:commentId/like` | `ClerkAuthGuard` | default | — | `unlikeComment()` | `unlikeComment()` | 158–167 |
| 15 | `DELETE` | `/reels/:id/comments/:commentId` | `ClerkAuthGuard` | default | — | `deleteComment()` | `deleteComment()` | 169–178 |
| 16 | `POST` | `/reels/:id/share` | `ClerkAuthGuard` | 30/60s | — | `share()` | `share()` | 180–186 |
| 17 | `POST` | `/reels/:id/bookmark` | `ClerkAuthGuard` | 30/60s | — | `bookmark()` | `bookmark()` | 188–194 |
| 18 | `DELETE` | `/reels/:id/bookmark` | `ClerkAuthGuard` | default | — | `unbookmark()` | `unbookmark()` | 196–201 |
| 19 | `POST` | `/reels/:id/view` | `OptionalClerkAuthGuard` | 10/60s | — | `view()` | `view()` | 203–214 |
| 20 | `POST` | `/reels/:id/report` | `ClerkAuthGuard` | 10/60s | `ReportDto` | `report()` | `report()` | 216–226 |
| 21 | `GET` | `/reels/:id/duets` | `OptionalClerkAuthGuard` | default | — (query: cursor) | `getDuets()` | `getDuets()` | 228–237 |
| 22 | `GET` | `/reels/:id/stitches` | `OptionalClerkAuthGuard` | default | — (query: cursor) | `getStitches()` | `getStitches()` | 239–248 |
| 23 | `PATCH` | `/reels/:id/archive` | `ClerkAuthGuard` | default | — | `archive()` | `archive()` | 250–258 |
| 24 | `PATCH` | `/reels/:id/publish-trial` | `ClerkAuthGuard` | default | — | `publishTrial()` | `publishTrial()` | 260–268 |
| 25 | `PATCH` | `/reels/:id/unarchive` | `ClerkAuthGuard` | default | — | `unarchive()` | `unarchive()` | 270–278 |
| 26 | `GET` | `/reels/:id/share-link` | `OptionalClerkAuthGuard` | default | — | `getShareLink()` | `getShareLink()` | 280–287 |

**Note on routing:** Static GET routes (`feed`, `trending`, `user/:username`, `audio/:audioTrackId`) are placed BEFORE parameterized `:id` routes (comment on line 29) to avoid NestJS route matching ambiguity.

### Controller-level Logic
- **Anonymous view handling (lines 208–214):** The `view()` endpoint checks `if (userId)` before calling service — anonymous users get `{ viewed: true }` without any DB write.

---

## 4. DTOs

### `CreateReelDto` (`dto/create-reel.dto.ts`, 168 lines)

27 fields total:

| # | Field | Type | Required | Validators | Lines |
|---|-------|------|----------|------------|-------|
| 1 | `videoUrl` | `string` | YES | `@IsUrl()` | 19–21 |
| 2 | `thumbnailUrl` | `string` | no | `@IsOptional()`, `@IsUrl()` | 23–26 |
| 3 | `duration` | `number` | YES | `@IsNumber()`, `@Min(1)`, `@Max(180)` | 28–32 |
| 4 | `caption` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(500)` | 34–38 |
| 5 | `mentions` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(20)` | 40–45 |
| 6 | `hashtags` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(20)` | 47–52 |
| 7 | `audioTrackId` | `string` | no | `@IsOptional()`, `@IsUUID()` | 54–57 |
| 8 | `isDuet` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | 59–62 |
| 9 | `isStitch` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | 64–67 |
| 10 | `normalizeAudio` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | 69–72 |
| 11 | `isPhotoCarousel` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | 76–79 |
| 12 | `carouselUrls` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsUrl({}, { each: true })`, `@ArrayMaxSize(35)` | 81–86 |
| 13 | `carouselTexts` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(35)`, `@MaxLength(200, { each: true })` | 88–94 |
| 14 | `altText` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(1000)` | 96–100 |
| 15 | `locationName` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(200)` | 102–106 |
| 16 | `locationLat` | `number` | no | `@IsOptional()`, `@IsNumber()`, `@Min(-90)`, `@Max(90)` | 108–113 |
| 17 | `locationLng` | `number` | no | `@IsOptional()`, `@IsNumber()`, `@Min(-180)`, `@Max(180)` | 115–120 |
| 18 | `commentPermission` | `string` | no | `@IsOptional()`, `@IsEnum(['EVERYONE', 'FOLLOWERS', 'NOBODY'])` | 122–125 |
| 19 | `brandedContent` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | 127–130 |
| 20 | `brandPartner` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(100)` | 132–136 |
| 21 | `remixAllowed` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | 138–141 |
| 22 | `topics` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(3)`, `@MaxLength(50, { each: true })` | 143–149 |
| 23 | `taggedUserIds` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(20)` | 151–156 |
| 24 | `scheduledAt` | `string` | no | `@IsOptional()`, `@IsDateString()` | 158–161 |
| 25 | `isTrial` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | 163–166 |

### `CreateCommentDto` (`dto/create-comment.dto.ts`, 14 lines)

| # | Field | Type | Required | Validators | Lines |
|---|-------|------|----------|------------|-------|
| 1 | `content` | `string` | YES | `@IsString()`, `@MaxLength(500)` | 5–8 |
| 2 | `parentId` | `string` | no | `@IsOptional()`, `@IsString()` | 10–13 |

### `ReportDto` (`dto/report.dto.ts`, 10 lines)

| # | Field | Type | Required | Validators | Lines |
|---|-------|------|----------|------------|-------|
| 1 | `reason` | `string` | YES | `@IsString()`, `@MinLength(3)`, `@MaxLength(500)` | 5–9 |

---

## 5. Service (`reels.service.ts`, 1163 lines)

### Imports (lines 1–20)

```typescript
import { Injectable, Logger, Inject, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateReelDto } from './dto/create-reel.dto';
import { Prisma, ReelStatus, CommentPermission, ReactionType, ReportReason } from '@prisma/client';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';
import { sanitizeText } from '@/common/utils/sanitize';
import { extractHashtags } from '@/common/utils/hashtag';
import { GamificationService } from '../gamification/gamification.service';
import { AiService } from '../ai/ai.service';
import { QueueService } from '../../common/queue/queue.service';
```

### Constructor Dependencies (lines 77–85)

| Dependency | Injection | Purpose |
|------------|-----------|---------|
| `PrismaService` | direct | All database operations |
| `Redis` | `@Inject('REDIS')` | Feed caching |
| `NotificationsService` | direct | LIKE, COMMENT, MENTION notifications |
| `StreamService` | direct | Cloudflare Stream video upload/delete |
| `GamificationService` | direct | XP and streak tracking |
| `AiService` | direct | Image moderation (thumbnail) |
| `QueueService` | direct | Gamification jobs, moderation jobs, search indexing jobs |

### `REEL_SELECT` Constant (lines 22–71)

Standard select object used across all reel queries. Fields selected:

```
id, videoUrl, streamId, hlsUrl, dashUrl, qualities, isLooping, normalizeAudio,
thumbnailUrl, duration, caption, mentions, hashtags, status, isRemoved,
isPhotoCarousel, carouselUrls, carouselTexts, altText, locationName,
locationLat, locationLng, commentPermission, brandedContent, brandPartner,
remixAllowed, topics, isTrial, scheduledAt, audioTrackId, audioTitle,
audioArtist, isDuet, isStitch, likesCount, commentsCount, sharesCount,
viewsCount, createdAt,
user: { id, username, displayName, avatarUrl, isVerified }
```

---

### Method-by-Method Documentation

---

#### `create(userId, dto)` — Lines 87–267

**Purpose:** Create a new reel with full publish field support, carousel validation, tagging, moderation, Stream ingestion, gamification, and search indexing.

**Parameters:**
- `userId: string` — authenticated user ID
- `dto: CreateReelDto` — 27-field DTO

**Returns:** Reel object with `isLiked: false`, `isBookmarked: false` appended

**Logic flow:**

1. **Carousel validation (lines 89–96):** If `isPhotoCarousel`, requires `carouselUrls` with >= 2 items. If `carouselTexts` provided, count must be <= `carouselUrls` count. Throws `BadRequestException`.

2. **Hashtag extraction + upsert (lines 98–113):** Extracts hashtags from caption via `extractHashtags()`, merges with explicit `dto.hashtags` (lowercased, deduplicated via `Set`). Each hashtag upserted into `Hashtag` table with `reelsCount` incremented.

3. **Comment permission parsing (lines 115–117):** Maps string enum to `CommentPermission` Prisma enum. Defaults to `EVERYONE`.

4. **Transaction: Create reel + increment user reelsCount (lines 119–155):**
   - `prisma.reel.create()` with all 27+ fields
   - `prisma.user.update()` incrementing `reelsCount`
   - Initial status: `ReelStatus.PROCESSING`
   - `brandPartner` only set if `brandedContent` is true (line 142)
   - `remixAllowed` defaults to `true` (line 143)
   - `scheduledAt` parsed from ISO string to Date (line 145)

5. **Actor username lookup (lines 157–161):** Fetched once if tag or mention notifications needed.

6. **Tagged user records (lines 163–194):**
   - Resolves `taggedUserIds` which can be user IDs OR usernames (OR query on both fields)
   - Filters out deleted/banned users
   - Creates `ReelTaggedUser` join records via `createMany` with `skipDuplicates`
   - Creates `MENTION` notification for each tagged user (skips self)

7. **Mention notifications (lines 196–215):**
   - Looks up mentioned usernames in DB
   - Creates `MENTION` notification for each (skips self)
   - Capped at 50 users (`take: 50`)

8. **Cloudflare Stream ingestion (lines 217–232):**
   - Async (non-blocking): calls `stream.uploadFromUrl()`
   - On success: updates reel with `streamId`
   - On failure: sets reel status to `READY` (fallback — video still available via direct URL)

9. **Gamification jobs (lines 234–236):**
   - `addGamificationJob({ type: 'award-xp', userId, action: 'reel_created' })`
   - `addGamificationJob({ type: 'update-streak', userId, action: 'posting' })`

10. **Content moderation (lines 238–243):**
    - If caption exists: `addModerationJob({ content: reel.caption, contentType: 'reel', contentId: reel.id })`

11. **Thumbnail moderation (lines 245–250):**
    - If thumbnailUrl exists: calls private `moderateReelThumbnail()` (async, non-blocking)

12. **Search indexing (lines 252–260):**
    - `addSearchIndexJob({ action: 'index', indexName: 'reels', documentId, document: { id, description: caption, userId, hashtags } })`

**Prisma operations:**
- `prisma.hashtag.upsert` (per hashtag)
- `prisma.reel.create`
- `prisma.user.update` (increment reelsCount)
- `prisma.user.findMany` (resolve taggedUserIds)
- `prisma.reelTaggedUser.createMany`
- `prisma.user.findMany` (resolve mentions)
- `prisma.user.findUnique` (actor username)
- `prisma.reel.update` (streamId)

**Cross-module calls:**
- `notifications.create()` (MENTION — for tags and mentions)
- `stream.uploadFromUrl()`
- `queueService.addGamificationJob()` (2 calls)
- `queueService.addModerationJob()`
- `queueService.addSearchIndexJob()`
- `ai.moderateImage()` (via `moderateReelThumbnail`)

---

#### `getFeed(userId, cursor?, limit=20)` — Lines 269–372

**Purpose:** Scored reels feed with Redis caching, block/mute filtering, engagement scoring.

**Parameters:**
- `userId: string | undefined` — optional (anonymous access)
- `cursor?: string` — offset-based (number as string, NOT cursor ID)
- `limit: number` (default 20)

**Returns:** `{ data: Reel[], meta: { cursor, hasMore } }`

**Logic flow:**

1. **Redis cache check (lines 271–275):** If `userId`, checks `feed:reels:{userId}:{cursor ?? 'first'}`. TTL: 30 seconds.

2. **Block/mute loading (lines 277–289):** Loads up to 50 blocks + 50 mutes for the user. Combined into `excludedIds`.

3. **Where clause (lines 291–299):**
   - `status: ReelStatus.READY`
   - `isRemoved: false`
   - `isTrial: false` — trial reels excluded from feed
   - `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]` — scheduled reels only shown after their time
   - `user.isPrivate: false`
   - `createdAt >= now - 72h` — last 3 days only
   - If cursor: `createdAt < cursor date` (AND still >= 72h ago)
   - If excludedIds: `userId NOT IN excludedIds`

4. **Fetch 200 recent reels (lines 302–308):** Ordered by `createdAt desc`.

5. **Scoring (lines 310–316):**
   ```
   engagement = (likesCount * 2) + (commentsCount * 4) + (sharesCount * 6) + (viewsCount * 0.1)
   score = engagement / ageHours^1.2
   ```

6. **Sort by score descending (line 319).**

7. **Offset-based pagination (lines 322–326):** Cursor is parsed as integer offset (NOT ID cursor). Slice `[offset, offset + limit + 1]`.

8. **isLiked/isBookmarked enrichment (lines 331–356):** Batch query `ReelReaction` and `ReelInteraction` for the current user.

9. **Redis cache write (lines 366–369):** `setex(cacheKey, 30, JSON.stringify(result))`.

**Redis operations:**
- `redis.get(cacheKey)` — read cache
- `redis.setex(cacheKey, 30, ...)` — write cache (30s TTL)

**Prisma operations:**
- `prisma.block.findMany` (blocks, take 50)
- `prisma.mute.findMany` (mutes, take 50)
- `prisma.reel.findMany` (200 reels)
- `prisma.reelReaction.findMany` (liked check, take 50)
- `prisma.reelInteraction.findMany` (bookmarked check, take 50)

---

#### `getTrendingReels(cursor?, limit=20)` — Lines 379–431

**Purpose:** Trending reels scored by completion rate proxy + engagement. Anonymous-safe (no auth required).

**Parameters:**
- `cursor?: string` — ID-based cursor (`id < cursor`)
- `limit: number` (default 20)

**Returns:** `{ data: Reel[], meta: { hasMore, cursor } }`

**Logic flow:**

1. **7-day window (line 380).**

2. **Where clause (lines 383–391):**
   - `status: READY`, `isRemoved: false`, `isTrial: false`
   - `scheduledAt` OR filter
   - `createdAt >= 7 days ago`
   - `user.isDeactivated: false`, `user.isPrivate: false`
   - ID cursor pagination

3. **Fetch 200 reels (line 396).**

4. **Scoring (lines 401–414):**
   ```
   completionProxy = min(1, (likes + comments) / views * 5)  // 0 if no views
   engagement = completionProxy * 2.0 + likes * 1.0 + shares * 3.0 + comments * 1.5
   engagementRate = engagement / ageHours
   ```
   Note: Also selects `savesCount` (line 394) but doesn't use it in scoring.

5. **Sort, paginate, return (lines 417–431).** Cursor is last item's ID.

**Prisma operations:**
- `prisma.reel.findMany` (200 reels, includes `savesCount`)

---

#### `updateReel(reelId, userId, data)` — Lines 433–448

**Purpose:** Update reel caption and/or hashtags.

**Parameters:**
- `reelId: string`
- `userId: string`
- `data: { caption?: string; hashtags?: string[] }`

**Returns:** Updated reel with REEL_SELECT

**Logic:**
1. Find reel, verify ownership, check not removed
2. Update only provided fields + touch `updatedAt`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.reel.update`

---

#### `getById(reelId, userId?)` — Lines 450–487

**Purpose:** Get single reel by ID with block check and isLiked/isBookmarked.

**Logic:**
1. Find reel with REEL_SELECT
2. Verify READY status and not removed
3. If viewer is authenticated and not the owner: check bidirectional block (lines 458–468)
4. If authenticated: batch check ReelReaction + ReelInteraction for isLiked/isBookmarked

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.block.findFirst` (bidirectional OR query)
- `prisma.reelReaction.findUnique` (composite key)
- `prisma.reelInteraction.findUnique` (composite key)

---

#### `delete(reelId, userId)` — Lines 489–524

**Purpose:** Soft-delete reel (sets `isRemoved: true`).

**Logic:**
1. Verify ownership
2. Transaction: set `isRemoved: true` + decrement `User.reelsCount` via raw SQL `GREATEST(reelsCount - 1, 0)`
3. Decrement hashtag counters for all reel hashtags (raw SQL per hashtag)
4. If `streamId`: delete from Cloudflare Stream (async, non-blocking)
5. Queue search index deletion

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.reel.update` (isRemoved)
- `prisma.$executeRaw` (User reelsCount decrement)
- `prisma.$executeRaw` (Hashtag reelsCount decrement, per hashtag)

**Cross-module calls:**
- `stream.deleteVideo(streamId)`
- `queueService.addSearchIndexJob({ action: 'delete' })`

---

#### `publishTrial(reelId, userId)` — Lines 526–539

**Purpose:** Convert a trial reel to a published reel (sets `isTrial: false`).

**Logic:**
1. Verify ownership
2. Verify reel IS a trial (`!reel.isTrial` throws `BadRequestException`)
3. Update `isTrial: false`

**Returns:** `{ published: true }`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.reel.update`

---

#### `like(reelId, userId)` — Lines 541–580

**Purpose:** Like a reel with notification.

**Logic:**
1. Verify reel exists, READY, not removed
2. **Self-like prevention (lines 546–548):** Throws `BadRequestException`
3. Transaction:
   - Create `ReelReaction` with `ReactionType.LIKE`
   - Upsert `ReelInteraction` with `liked: true`
   - Raw SQL increment `likesCount` (GREATEST(0, +1))
4. Create `LIKE` notification (skip self)
5. On P2002 (unique violation): throw `ConflictException('Already liked')`

**Notifications:** `type: 'LIKE'`, `reelId`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.reelReaction.create`
- `prisma.reelInteraction.upsert`
- `prisma.$executeRaw` (likesCount increment)

---

#### `unlike(reelId, userId)` — Lines 582–610

**Purpose:** Remove like from a reel.

**Logic:**
1. Verify reel exists, READY, not removed
2. Transaction:
   - Delete `ReelReaction`
   - Upsert `ReelInteraction` with `liked: false`
   - Raw SQL decrement `likesCount` (GREATEST(0, -1))
3. On P2025 (not found): throw `NotFoundException('Like not found')`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.reelReaction.delete` (composite key)
- `prisma.reelInteraction.upsert`
- `prisma.$executeRaw` (likesCount decrement)

---

#### `comment(reelId, userId, content, parentId?)` — Lines 612–674

**Purpose:** Add a comment to a reel with comment permission enforcement.

**Logic:**
1. Verify reel exists, READY, not removed

2. **Comment permission enforcement (lines 617–629):**
   - `perm = reel.commentPermission ?? 'EVERYONE'`
   - Owner always allowed (`isOwner` check)
   - If `NOBODY` and not owner: `ForbiddenException('Comments are disabled on this reel')`
   - If `FOLLOWERS` and not owner: checks `Follow` table. No follow = `ForbiddenException('Only followers can comment on this reel')`

3. **Parent validation (lines 632–635):** If `parentId`, verifies parent comment exists AND belongs to same reel.

4. Transaction:
   - Create `ReelComment` with sanitized content
   - Raw SQL increment `Reel.commentsCount`

5. Create `COMMENT` notification (skip self). Body is first 100 chars of content.

**Returns:** Comment object with `{ id, content, createdAt, user: { id, username, displayName, avatarUrl } }`

**Notifications:** `type: 'COMMENT'`, `reelId`, `body: content.substring(0, 100)`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.follow.findUnique` (for FOLLOWERS permission check)
- `prisma.reelComment.findUnique` (parent validation)
- `prisma.reelComment.create`
- `prisma.$executeRaw` (commentsCount increment)

---

#### `deleteComment(reelId, commentId, userId)` — Lines 676–694

**Purpose:** Delete a comment (soft-delete: sets content to `[deleted]`).

**Logic:**
1. Find comment, verify belongs to reel
2. **Dual authorization (lines 684–687):** Comment author OR reel owner can delete
3. Transaction: update comment content to `'[deleted]'` + decrement `Reel.commentsCount`

**Prisma operations:**
- `prisma.reelComment.findUnique`
- `prisma.reel.findUnique` (owner check)
- `prisma.reelComment.update` (content → '[deleted]')
- `prisma.$executeRaw` (commentsCount decrement)

---

#### `likeComment(reelId, commentId, userId)` — Lines 696–715

**Purpose:** Like a reel comment.

**Logic:**
1. Verify comment exists and belongs to reel
2. Create `ReelCommentReaction` record
3. Increment `ReelComment.likesCount`
4. On P2002 (already liked): silently return `{ liked: true }` (no error)

**Prisma operations:**
- `prisma.reelComment.findUnique`
- `prisma.reelCommentReaction.create`
- `prisma.reelComment.update` (likesCount increment)

---

#### `unlikeComment(reelId, commentId, userId)` — Lines 717–731

**Purpose:** Unlike a reel comment.

**Logic:**
1. Verify comment exists and belongs to reel
2. `deleteMany` on `ReelCommentReaction` (where commentId + userId)
3. If deleted count > 0: decrement `ReelComment.likesCount`

**Prisma operations:**
- `prisma.reelComment.findUnique`
- `prisma.reelCommentReaction.deleteMany`
- `prisma.reelComment.update` (likesCount decrement)

---

#### `getComments(reelId, userId, cursor?, limit=20)` — Lines 733–780

**Purpose:** Get paginated comments for a reel with block/mute filtering.

**Logic:**
1. If authenticated: load blocks (50) + mutes (50) into `excludedUserIds`
2. Query `ReelComment` with:
   - `reelId`
   - Excluded user filter
   - Cursor pagination (skip 1 after cursor)
   - Order by `createdAt desc`
   - Select: `id, content, createdAt, user: { id, username, displayName, avatarUrl }`

**Returns:** `{ data: Comment[], meta: { cursor, hasMore } }`

**Prisma operations:**
- `prisma.block.findMany` (50)
- `prisma.mute.findMany` (50)
- `prisma.reelComment.findMany`

---

#### `share(reelId, userId)` — Lines 782–807

**Purpose:** Record a share with atomic double-count prevention.

**Logic:**
1. Verify reel exists, READY, not removed
2. Interactive transaction:
   - Check if `ReelInteraction.shared` is already true → skip
   - Upsert `ReelInteraction` with `shared: true`
   - Raw SQL increment `Reel.sharesCount`

**Prisma operations:**
- `prisma.reel.findUnique`
- `tx.reelInteraction.findUnique`
- `tx.reelInteraction.upsert`
- `tx.$executeRaw` (sharesCount increment)

---

#### `bookmark(reelId, userId)` — Lines 809–836

**Purpose:** Bookmark a reel with atomic double-count prevention.

**Logic:**
1. Verify reel exists, READY, not removed
2. Interactive transaction:
   - Check if `ReelInteraction.saved` is already true → return true (already bookmarked)
   - Upsert `ReelInteraction` with `saved: true`
   - Raw SQL increment `Reel.savesCount`
3. If already bookmarked: throw `ConflictException('Already bookmarked')`

**Prisma operations:**
- `prisma.reel.findUnique`
- `tx.reelInteraction.findUnique`
- `tx.reelInteraction.upsert`
- `tx.$executeRaw` (savesCount increment)

---

#### `unbookmark(reelId, userId)` — Lines 838–861

**Purpose:** Remove bookmark from a reel with atomic count management.

**Logic:**
1. Interactive transaction:
   - Check if `ReelInteraction.saved` is true
   - If not saved: return false
   - Update `ReelInteraction.saved` to false
   - Raw SQL decrement `Reel.savesCount` (GREATEST(0, -1))
2. If was not bookmarked: throw `NotFoundException('Bookmark not found')`

**Prisma operations:**
- `tx.reelInteraction.findUnique`
- `tx.reelInteraction.update`
- `tx.$executeRaw` (savesCount decrement)

---

#### `view(reelId, userId)` — Lines 863–888

**Purpose:** Record a view with atomic double-count prevention.

**Logic:**
1. Verify reel exists, READY, not removed
2. Interactive transaction:
   - Check if `ReelInteraction.viewed` is already true → skip
   - Upsert `ReelInteraction` with `viewed: true`
   - Raw SQL increment `Reel.viewsCount`

**Returns:** `{ viewed: true }`

**Prisma operations:**
- `prisma.reel.findUnique`
- `tx.reelInteraction.findUnique`
- `tx.reelInteraction.upsert`
- `tx.$executeRaw` (viewsCount increment)

---

#### `getUserReels(username, cursor?, limit=20, userId?)` — Lines 890–936

**Purpose:** Get reels by username with isLiked/isBookmarked enrichment.

**Logic:**
1. Look up user by username
2. Query reels with:
   - `userId: user.id`, `status: READY`, `isRemoved: false`, `isTrial: false`
   - `scheduledAt` OR filter (null or past)
   - Cursor pagination (ID-based)
   - Order by `createdAt desc`
3. If viewer authenticated: batch check liked/bookmarked

**Prisma operations:**
- `prisma.user.findUnique` (by username)
- `prisma.reel.findMany`
- `prisma.reelReaction.findMany` (take 50)
- `prisma.reelInteraction.findMany` (take 50)

---

#### `report(reelId, userId, reason)` — Lines 938–959

**Purpose:** Report a reel.

**Logic:**
1. Verify reel exists
2. Check for duplicate report (by `reporterId` + `description: 'reel:{reelId}'`)
3. Map reason string to `ReportReason` enum via lookup table:
   - `SPAM` → `SPAM`
   - `MISINFORMATION` → `MISINFORMATION`
   - `INAPPROPRIATE` → `OTHER`
   - `HATE_SPEECH` → `HATE_SPEECH`
   - Fallback → `OTHER`
4. Create `Report` record

**Returns:** `{ reported: true }`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.report.findFirst` (duplicate check)
- `prisma.report.create`

---

#### `getByAudioTrack(audioTrackId, cursor?, limit=20, userId?)` — Lines 961–1004

**Purpose:** Get all reels using a specific audio track.

**Logic:** Same pattern as `getUserReels` — query by `audioTrackId`, filter READY/not removed/not trial/scheduledAt, cursor pagination, isLiked/isBookmarked enrichment.

**Where clause:** `{ audioTrackId, status: READY, isRemoved: false, isTrial: false, OR: [scheduledAt null/past] }`

**Prisma operations:**
- `prisma.reel.findMany`
- `prisma.reelReaction.findMany` (take 50)
- `prisma.reelInteraction.findMany` (take 50)

---

#### `getDuets(reelId, cursor?, limit=20, userId?)` — Lines 1006–1054

**Purpose:** Get all duets of a specific reel.

**Logic:**
1. Verify parent reel exists, READY, not removed
2. Query by `duetOfId: reelId` with standard filters (isTrial false, scheduledAt OR)
3. Cursor pagination + isLiked/isBookmarked enrichment

**Prisma operations:**
- `prisma.reel.findUnique` (parent check)
- `prisma.reel.findMany` (duets)
- `prisma.reelReaction.findMany` (take 50)
- `prisma.reelInteraction.findMany` (take 50)

---

#### `getStitches(reelId, cursor?, limit=20, userId?)` — Lines 1056–1104

**Purpose:** Get all stitches of a specific reel.

**Logic:** Same as `getDuets` but queries `stitchOfId: reelId`.

**Prisma operations:**
- `prisma.reel.findUnique` (parent check)
- `prisma.reel.findMany` (stitches)
- `prisma.reelReaction.findMany` (take 50)
- `prisma.reelInteraction.findMany` (take 50)

---

#### `archive(reelId, userId)` — Lines 1106–1116

**Purpose:** Archive a reel (sets `isArchived: true`).

**Logic:** Verify ownership, update `isArchived: true`.

**Returns:** `{ archived: true }`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.reel.update`

---

#### `unarchive(reelId, userId)` — Lines 1118–1128

**Purpose:** Unarchive a reel (sets `isArchived: false`).

**Logic:** Verify ownership, update `isArchived: false`.

**Returns:** `{ archived: false }`

**Prisma operations:**
- `prisma.reel.findUnique`
- `prisma.reel.update`

---

#### `getShareLink(reelId)` — Lines 1130–1134

**Purpose:** Get shareable deep link URL for a reel.

**Logic:** Verify reel exists and not removed. Returns hardcoded domain URL.

**Returns:** `{ url: 'https://mizanly.app/reel/{reelId}' }`

**Prisma operations:**
- `prisma.reel.findUnique` (select: id, isRemoved)

---

#### `moderateReelThumbnail(userId, reelId, imageUrl)` (PRIVATE) — Lines 1136–1161

**Purpose:** AI-based image moderation on reel thumbnails.

**Logic:**
1. Call `ai.moderateImage(imageUrl)`
2. If `BLOCK`: set reel `isRemoved: true`, `isSensitive: true`, queue search index deletion
3. If `WARNING`: set reel `isSensitive: true`
4. Errors caught and logged (non-fatal)

**Cross-module calls:**
- `ai.moderateImage(imageUrl)`
- `queueService.addSearchIndexJob({ action: 'delete' })` (on BLOCK only)

**Prisma operations:**
- `prisma.reel.update` (isRemoved/isSensitive)

---

## 6. Notification Types Used

| Type | Where | Recipient | Body |
|------|-------|-----------|------|
| `MENTION` | `create()` line 186 | Tagged user | `@{username} tagged you in a reel` |
| `MENTION` | `create()` line 210 | Mentioned user | `@{username} mentioned you in a reel` |
| `LIKE` | `like()` line 569 | Reel owner | (no body) |
| `COMMENT` | `comment()` line 669 | Reel owner | First 100 chars of comment |

All notification calls are fire-and-forget with `.catch()` error logging.

---

## 7. Queue Jobs

| Job Type | Method | Where | Payload |
|----------|--------|-------|---------|
| Gamification: award-xp | `addGamificationJob` | `create()` line 235 | `{ type: 'award-xp', userId, action: 'reel_created' }` |
| Gamification: update-streak | `addGamificationJob` | `create()` line 236 | `{ type: 'update-streak', userId, action: 'posting' }` |
| Moderation | `addModerationJob` | `create()` line 240 | `{ content: caption, contentType: 'reel', contentId: reel.id }` |
| Search index | `addSearchIndexJob` | `create()` line 253 | `{ action: 'index', indexName: 'reels', documentId, document }` |
| Search delete | `addSearchIndexJob` | `delete()` line 519 | `{ action: 'delete', indexName: 'reels', documentId }` |
| Search delete | `addSearchIndexJob` | `moderateReelThumbnail()` line 1147 | `{ action: 'delete', indexName: 'reels', documentId }` |

---

## 8. Redis Operations

| Operation | Method | Key Pattern | TTL | Purpose |
|-----------|--------|-------------|-----|---------|
| `redis.get` | `getFeed()` line 273 | `feed:reels:{userId}:{cursor\|'first'}` | — | Cache read |
| `redis.setex` | `getFeed()` line 368 | `feed:reels:{userId}:{cursor\|'first'}` | 30s | Cache write |

---

## 9. Key Business Logic Details

### isTrial Filtering
- `isTrial: false` is enforced in ALL list queries: `getFeed` (line 294), `getTrendingReels` (line 386), `getUserReels` (line 895), `getByAudioTrack` (line 963), `getDuets` (line 1013), `getStitches` (line 1063)
- Trial reels are invisible in all feeds until explicitly published via `publishTrial()`
- `publishTrial()` simply sets `isTrial: false` — no other side effects

### scheduledAt Handling
- All list queries use: `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]`
- Applied in: `getFeed` (line 295), `getTrendingReels` (line 387), `getUserReels` (line 895), `getByAudioTrack` (line 963), `getDuets` (line 1013), `getStitches` (line 1063)
- Scheduled reels are hidden from all feeds until their scheduled time passes

### isPhotoCarousel Handling
- Validated on create: requires >= 2 `carouselUrls` (line 90), `carouselTexts` count must be <= `carouselUrls` count (line 93)
- Stored as fields on the Reel model: `isPhotoCarousel`, `carouselUrls[]`, `carouselTexts[]`
- No special filtering in feeds — carousels appear in same feeds as video reels

### Duet/Stitch
- `isDuet` and `isStitch` are boolean flags on the Reel (lines 130–131)
- Duets are queried via `duetOfId` relation (line 1013)
- Stitches are queried via `stitchOfId` relation (line 1063)
- Both have dedicated GET endpoints: `/reels/:id/duets` and `/reels/:id/stitches`
- `remixAllowed` field (default true) controls whether duets/stitches are permitted — NOT enforced server-side (only stored)

### Comment Permission
- Enum: `EVERYONE | FOLLOWERS | NOBODY` (from `CommentPermission` Prisma enum)
- Enforced in `comment()` method (lines 617–629)
- Owner always bypasses permission check
- `FOLLOWERS` check queries the `Follow` table with composite key
- `NOBODY` blocks everyone except owner

### Archive/Unarchive
- Sets `isArchived` boolean flag on reel
- **NOT filtered in any feed queries** — archived reels still appear in feeds. This may be a bug or intentional (archive for personal organization, not hiding).

### Soft Delete
- `delete()` sets `isRemoved: true` (NOT Prisma delete)
- All queries filter `isRemoved: false`
- Hashtag counters decremented on delete
- Cloudflare Stream video deleted on delete
- Search index entry removed on delete

### Engagement Scoring (Feed)
```
engagement = likes*2 + comments*4 + shares*6 + views*0.1
score = engagement / ageHours^1.2
```

### Trending Scoring
```
completionProxy = min(1, (likes + comments) / views * 5)
engagement = completionProxy*2.0 + likes*1.0 + shares*3.0 + comments*1.5
score = engagement / ageHours
```

### Concurrency Safety
- `like/unlike`: P2002/P2025 error handling for race conditions
- `share/bookmark/unbookmark/view`: Interactive transactions with check-then-update to prevent double-counting
- All counter updates use raw SQL with `GREATEST(0, ...)` to prevent negative counts

---

## 10. Cross-Module Dependency Map

### Imports FROM other modules (used by ReelsService)
| Module | Service | Usage |
|--------|---------|-------|
| `notifications` | `NotificationsService` | LIKE, COMMENT, MENTION notifications |
| `stream` | `StreamService` | `uploadFromUrl()`, `deleteVideo()` |
| `gamification` | `GamificationService` | (injected but accessed via QueueService) |
| `ai` | `AiService` | `moderateImage()` for thumbnail |
| `common/queue` | `QueueService` | gamification, moderation, search index jobs |
| `common/utils` | `sanitizeText` | Caption sanitization |
| `common/utils` | `extractHashtags` | Hashtag extraction from caption |
| `config` | `PrismaService` | All DB access |

### Imported BY other modules
| Module | How |
|--------|-----|
| `AppModule` | `imports: [ReelsModule]` |
| (No other module imports ReelsModule or injects ReelsService) |

### Prisma Models Touched
| Model | Operations |
|-------|-----------|
| `Reel` | create, findUnique, findMany, update, $executeRaw |
| `ReelReaction` | create, delete, findUnique, findMany |
| `ReelInteraction` | upsert, findUnique, findMany, update |
| `ReelComment` | create, findUnique, findMany, update |
| `ReelCommentReaction` | create, deleteMany |
| `ReelTaggedUser` | createMany |
| `User` | findUnique, findMany, update |
| `Hashtag` | upsert, $executeRaw |
| `Block` | findFirst, findMany |
| `Mute` | findMany |
| `Follow` | findUnique |
| `Report` | findFirst, create |

---

## 11. Prisma Enums Used

| Enum | Values Used | Where |
|------|-------------|-------|
| `ReelStatus` | `READY`, `PROCESSING` | create (PROCESSING), all queries (READY) |
| `CommentPermission` | `EVERYONE`, `FOLLOWERS`, `NOBODY` | create, comment |
| `ReactionType` | `LIKE` | like |
| `ReportReason` | `SPAM`, `MISINFORMATION`, `OTHER`, `HATE_SPEECH` | report |

---

## 12. Error Handling Summary

| Exception | Where | Condition |
|-----------|-------|-----------|
| `BadRequestException` | `create()` | Carousel < 2 images, texts > urls |
| `BadRequestException` | `updateReel()` | Reel is removed |
| `BadRequestException` | `publishTrial()` | Reel is not a trial |
| `BadRequestException` | `like()` | Self-like attempt |
| `NotFoundException` | `getById()` | Reel not found, not READY, removed, or blocked |
| `NotFoundException` | `delete()` | Reel not found |
| `NotFoundException` | `publishTrial()` | Reel not found |
| `NotFoundException` | `like/unlike()` | Reel not found/not READY/removed |
| `NotFoundException` | `comment()` | Reel not found, parent comment not found |
| `NotFoundException` | `deleteComment()` | Comment not found |
| `NotFoundException` | `likeComment/unlikeComment()` | Comment not found |
| `NotFoundException` | `share/bookmark()` | Reel not found/not READY/removed |
| `NotFoundException` | `unbookmark()` | Bookmark not found |
| `NotFoundException` | `view()` | Reel not found/not READY/removed |
| `NotFoundException` | `getUserReels()` | User not found |
| `NotFoundException` | `report()` | Reel not found |
| `NotFoundException` | `getDuets/getStitches()` | Parent reel not found |
| `NotFoundException` | `getShareLink()` | Reel not found or removed |
| `NotFoundException` | `unlike()` | Like not found (P2025) |
| `ForbiddenException` | `updateReel/delete/archive/unarchive/publishTrial()` | Not owner |
| `ForbiddenException` | `comment()` | Comments disabled (NOBODY) or not a follower (FOLLOWERS) |
| `ForbiddenException` | `deleteComment()` | Not comment author and not reel owner |
| `ConflictException` | `like()` | Already liked (P2002) |
| `ConflictException` | `bookmark()` | Already bookmarked |

---

## 13. Test Files

| Test File | Focus |
|-----------|-------|
| `reels.service.spec.ts` | Core service unit tests |
| `reels.controller.spec.ts` | Controller unit tests |
| `reels.service.concurrency.spec.ts` | Race conditions on like/unlike/share/view/bookmark |
| `reels.service.edge.spec.ts` | Edge cases (removed reels, missing data, etc.) |
| `reels.service.auth.spec.ts` | Auth guard behavior, permission checks |
| `reels.publish-fields.spec.ts` | Publish field wiring (taggedUsers, topics, branded, etc.) |
| `reels.comment-permission.spec.ts` | EVERYONE/FOLLOWERS/NOBODY enforcement |
| `reels.carousel.spec.ts` | Carousel creation and retrieval |
| `reels.carousel-validation.spec.ts` | Carousel validation edge cases |

---

## 14. Known Issues / Architecture Notes

1. **Archive not filtered in feeds:** `isArchived` is not checked in any `where` clause for feeds (`getFeed`, `getTrendingReels`, `getUserReels`, etc.). Archived reels still appear everywhere.

2. **Feed pagination uses offset, not cursor:** `getFeed()` uses score-sorted array with integer offset pagination (line 322–323), while claiming cursor pagination in the API response. The cursor value is actually an offset number cast to string.

3. **Trending scoring uses completion proxy:** Real completion rate requires view-duration tracking which is not implemented. The proxy (`(likes + comments) / views * 5`) is approximate.

4. **savesCount selected but unused in trending:** `getTrendingReels` selects `savesCount` (line 394) but doesn't include it in scoring formula.

5. **remixAllowed not enforced:** The `remixAllowed` field is stored but not checked when creating duets/stitches. Enforcement would need to be in `create()` when `isDuet` or `isStitch` is true.

6. **Report description field overloaded:** Reports use `description: 'reel:{reelId}'` as a composite key for dedup, rather than having proper foreign key fields.

7. **Comment deletion is soft-delete:** Sets content to `'[deleted]'` rather than actually removing the record. The comment still takes up space and is still returned in queries.

8. **Block check only on getById:** Bidirectional block is checked in `getById()` but NOT in list endpoints (`getFeed`, `getUserReels`, etc. use one-directional block via `excludedIds`).

9. **No notification for share/bookmark/view:** Only like, comment, and mention generate notifications.

10. **Feed cache is per-user per-cursor:** Key pattern `feed:reels:{userId}:{cursor}` means each scroll position is cached independently. No global cache invalidation on new reel creation.
