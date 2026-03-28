# Module: Posts (Saf Feed)

> Extracted from `apps/api/src/modules/posts/`
> Files: posts.module.ts, posts.controller.ts, posts.service.ts, dto/*.ts

---

## 1. Module File (`posts.module.ts`, 16 lines)

```ts
@Module({
  imports: [NotificationsModule, GamificationModule, AiModule, ModerationModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
```

### Imports (4 modules)
| Module | Purpose |
|--------|---------|
| `NotificationsModule` | Creates notifications for likes, comments, mentions, tags, collabs |
| `GamificationModule` | XP awards + streak updates via queue jobs |
| `AiModule` | Image moderation via Claude Vision API (`ai.moderateImage`) |
| `ModerationModule` | Text content safety pre-save (`contentSafety.moderateText`) |

### Providers
- `PostsService` — single service provider

### Exports
- `PostsService` — exported (used by no other modules directly based on grep; only test files reference it outside this module)

### Imported By
- `AppModule` (line 116 of `app.module.ts`) — registered at application root

---

## 2. Controller (`posts.controller.ts`, 389 lines)

**Decorator:** `@ApiTags('Posts (Saf)')`, `@Controller('posts')`
**Base path:** `/api/v1/posts`
**Constructor:** `PostsService` injected

### Inline DTO Classes (defined in controller file, lines 26-49)

#### `ReactDto` (line 26)
| Field | Type | Validators |
|-------|------|------------|
| `reaction` | `string` | `@IsEnum(['LIKE', 'LOVE', 'SUPPORT', 'INSIGHTFUL'])` |

#### `EditCommentDto` (line 31)
| Field | Type | Validators |
|-------|------|------------|
| `content` | `string` | `@IsString()`, `@MaxLength(1000)` |

#### `ShareDto` (line 37)
| Field | Type | Validators |
|-------|------|------------|
| `content?` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(2000)` |

#### `UpdatePostDto` (line 44)
| Field | Type | Validators |
|-------|------|------------|
| `content?` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(2000)` |

### Endpoints (25 total)

| # | Method | Path | Auth Guard | Rate Limit | DTO | Service Method | Line | Purpose |
|---|--------|------|-----------|------------|-----|---------------|------|---------|
| 1 | `GET` | `/posts/feed` | `OptionalClerkAuthGuard` | default | Query: `type`, `cursor` | `getFeed(userId, type, cursor)` | 56 | Get paginated feed (following/foryou/chronological/favorites). Supports anonymous. |
| 2 | `GET` | `/posts/archived` | `ClerkAuthGuard` | default | Query: `cursor` | `getArchived(userId, cursor)` | 68 | Get archived posts (cursor paginated) |
| 3 | `POST` | `/posts` | `ClerkAuthGuard` | 10/60s | `CreatePostDto` | `create(userId, dto)` | 76 | Create a post |
| 4 | `GET` | `/posts/:id` | `OptionalClerkAuthGuard` | default | — | `getById(id, viewerId)` | 85 | Get post by ID |
| 5 | `PATCH` | `/posts/:id` | `ClerkAuthGuard` | default | `UpdatePostDto` | `update(id, userId, dto)` | 96 | Edit post content |
| 6 | `DELETE` | `/posts/:id` | `ClerkAuthGuard` | default | — | `delete(id, userId)` | 108 | Delete (soft-remove) a post |
| 7 | `POST` | `/posts/:id/react` | `ClerkAuthGuard` | 30/60s | `ReactDto` | `react(id, userId, dto.reaction)` | 117 | React to a post (LIKE/LOVE/SUPPORT/INSIGHTFUL) |
| 8 | `DELETE` | `/posts/:id/react` | `ClerkAuthGuard` | default | — | `unreact(id, userId)` | 130 | Remove reaction from a post |
| 9 | `POST` | `/posts/:id/save` | `ClerkAuthGuard` | 30/60s | — | `save(id, userId)` | 139 | Save/bookmark a post |
| 10 | `DELETE` | `/posts/:id/save` | `ClerkAuthGuard` | default | — | `unsave(id, userId)` | 148 | Unsave a post |
| 11 | `POST` | `/posts/:id/share` | `ClerkAuthGuard` | 30/60s | `ShareDto` | `share(id, userId, dto.content)` | 157 | Share/repost a post |
| 12 | `GET` | `/posts/:id/comments` | `OptionalClerkAuthGuard` | default | Query: `cursor` | `getComments(id, cursor)` | 170 | Get top-level comments (cursor paginated) |
| 13 | `POST` | `/posts/:id/comments` | `ClerkAuthGuard` | 30/60s | `AddCommentDto` | `addComment(id, userId, dto)` | 177 | Add a comment |
| 14 | `GET` | `/posts/:id/comments/hidden` | `ClerkAuthGuard` | default | Query: `cursor` | `getHiddenComments(id, userId, cursor)` | 190 | Get hidden comments on your post (author only) |
| 15 | `GET` | `/posts/:id/comments/:commentId/replies` | `OptionalClerkAuthGuard` | default | Query: `cursor` | `getCommentReplies(commentId, cursor)` | 202 | Get replies to a comment |
| 16 | `PATCH` | `/posts/:id/comments/:commentId` | `ClerkAuthGuard` | default | `EditCommentDto` | `editComment(commentId, userId, dto.content)` | 212 | Edit a comment |
| 17 | `DELETE` | `/posts/:id/comments/:commentId` | `ClerkAuthGuard` | default | — | `deleteComment(commentId, userId)` | 224 | Delete a comment |
| 18 | `POST` | `/posts/:id/comments/:commentId/like` | `ClerkAuthGuard` | 30/60s | — | `likeComment(commentId, userId)` | 236 | Like a comment |
| 19 | `DELETE` | `/posts/:id/comments/:commentId/like` | `ClerkAuthGuard` | default | — | `unlikeComment(commentId, userId)` | 248 | Unlike a comment |
| 20 | `POST` | `/posts/:id/report` | `ClerkAuthGuard` | 10/60s | `ReportDto` | `report(id, userId, dto.reason)` | 260 | Report a post |
| 21 | `POST` | `/posts/:id/dismiss` | `ClerkAuthGuard` | default | — | `dismiss(id, userId)` | 274 | Dismiss a post from feed (not interested) |
| 22 | `POST` | `/posts/:id/archive` | `ClerkAuthGuard` | default | — | `archivePost(id, userId)` | 286 | Archive a post |
| 23 | `DELETE` | `/posts/:id/archive` | `ClerkAuthGuard` | default | — | `unarchivePost(id, userId)` | 295 | Unarchive a post |
| 24 | `POST` | `/posts/:id/comments/:commentId/pin` | `ClerkAuthGuard` | default | — | `pinComment(id, commentId, userId)` | 304 | Pin a comment on a post |
| 25 | `DELETE` | `/posts/:id/comments/:commentId/pin` | `ClerkAuthGuard` | default | — | `unpinComment(id, commentId, userId)` | 317 | Unpin a comment |
| 26 | `POST` | `/posts/:id/comments/:commentId/hide` | `ClerkAuthGuard` | default | — | `hideComment(commentId, userId)` | 331 | Hide a comment on your post (author only) |
| 27 | `DELETE` | `/posts/:id/comments/:commentId/hide` | `ClerkAuthGuard` | default | — | `unhideComment(commentId, userId)` | 344 | Unhide a comment on your post (author only) |
| 28 | `GET` | `/posts/:id/share-link` | `ClerkAuthGuard` | default | — | `getShareLink(id)` | 357 | Get shareable link for a post |
| 29 | `POST` | `/posts/:id/share-as-story` | `ClerkAuthGuard` | 10/60s | — | `shareAsStory(id, userId)` | 365 | Share a post as a story |
| 30 | `POST` | `/posts/:id/cross-post` | `ClerkAuthGuard` | 5/60s | `CrossPostDto` | `crossPost(userId, id, dto)` | 377 | Cross-post to other spaces (Saf, Majlis, Bakra, Minbar) |

**Note:** 30 endpoints total (the table numbers were corrected — the controller has endpoints 1-30, some were miscounted above as 25 in the original controller analysis. The actual unique endpoints: 6 GET + 14 POST + 3 PATCH + 7 DELETE = 30).

**Correction on count:** Let me recount precisely:
- GET: feed, archived, :id, :id/comments, :id/comments/hidden, :id/comments/:commentId/replies, :id/share-link = **7 GET**
- POST: create, :id/react, :id/save, :id/share, :id/comments, :id/comments/:commentId/like, :id/report, :id/dismiss, :id/archive, :id/comments/:commentId/pin, :id/comments/:commentId/hide, :id/share-as-story, :id/cross-post = **13 POST**
- PATCH: :id, :id/comments/:commentId = **2 PATCH**
- DELETE: :id, :id/react, :id/save, :id/comments/:commentId, :id/comments/:commentId/like, :id/archive, :id/comments/:commentId/pin, :id/comments/:commentId/hide = **8 DELETE**

**Total: 30 endpoints**

---

## 3. DTOs

### `CreatePostDto` (`dto/create-post.dto.ts`, 177 lines)

| Field | Type | Required | Validators | Constraints |
|-------|------|----------|------------|-------------|
| `postType` | `string` | YES | `@IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'])` | — |
| `content` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(2000)` | Max 2000 chars |
| `visibility` | `string` | no | `@IsOptional()`, `@IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE'])` | Default PUBLIC |
| `circleId` | `string` | no | `@IsOptional()`, `@IsString()` | — |
| `mediaUrls` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsUrl({}, { each: true })`, `@ArrayMaxSize(10)` | Max 10 URLs |
| `mediaTypes` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(10)` | Max 10 |
| `thumbnailUrl` | `string` | no | `@IsOptional()`, `@IsUrl()` | — |
| `mediaWidth` | `number` | no | `@IsOptional()`, `@IsNumber()`, `@Min(1)`, `@Max(10000)` | 1-10000 |
| `mediaHeight` | `number` | no | `@IsOptional()`, `@IsNumber()`, `@Min(1)`, `@Max(10000)` | 1-10000 |
| `videoDuration` | `number` | no | `@IsOptional()`, `@IsNumber()`, `@Min(0)`, `@Max(600)` | 0-600 seconds |
| `hashtags` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(20)` | Max 20 |
| `mentions` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@ArrayMaxSize(50)`, `@IsString({ each: true })`, `@MaxLength(50, { each: true })` | Max 50 usernames |
| `locationName` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(200)` | Max 200 chars |
| `locationLat` | `number` | no | `@IsOptional()`, `@IsNumber()`, `@Min(-90)`, `@Max(90)` | -90 to 90 |
| `locationLng` | `number` | no | `@IsOptional()`, `@IsNumber()`, `@Min(-180)`, `@Max(180)` | -180 to 180 |
| `isSensitive` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | Default false |
| `altText` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(1000)` | Max 1000 chars |
| `hideLikesCount` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | Default false |
| `commentsDisabled` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | Legacy field |
| `commentPermission` | `string` | no | `@IsOptional()`, `@IsEnum(['EVERYONE', 'FOLLOWERS', 'NOBODY'])` | Default EVERYONE |
| `taggedUserIds` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(20)` | Max 20 user IDs/usernames |
| `collaboratorUsername` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(50)` | Max 50 chars |
| `brandedContent` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | Default false |
| `brandPartner` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(100)` | Max 100 chars, only set when brandedContent=true |
| `remixAllowed` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | Default true |
| `shareToFeed` | `boolean` | no | `@IsOptional()`, `@IsBoolean()` | Default true |
| `topics` | `string[]` | no | `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize(3)`, `@MaxLength(50, { each: true })` | Max 3 topics, 50 chars each |
| `scheduledAt` | `string` | no | `@IsOptional()`, `@IsDateString()` | ISO 8601 datetime |

### `AddCommentDto` (`dto/add-comment.dto.ts`, 14 lines)

| Field | Type | Required | Validators |
|-------|------|----------|------------|
| `content` | `string` | YES | `@IsString()`, `@MaxLength(1000)` |
| `parentId` | `string` | no | `@IsOptional()`, `@IsUUID()` |

### `ReportDto` (`dto/report.dto.ts`, 10 lines)

| Field | Type | Required | Validators |
|-------|------|----------|------------|
| `reason` | `string` | YES | `@IsString()`, `@MinLength(3)`, `@MaxLength(500)` |

### `CrossPostDto` (`dto/cross-post.dto.ts`, 17 lines)

| Field | Type | Required | Validators |
|-------|------|----------|------------|
| `targetSpaces` | `string[]` | YES | `@IsArray()`, `@ArrayMinSize(1)`, `@ArrayMaxSize(4)`, `@IsString({ each: true })` |
| `captionOverride` | `string` | no | `@IsOptional()`, `@IsString()`, `@MaxLength(2000)` |

---

## 4. Service (`posts.service.ts`, 1449 lines)

### Constructor Dependencies (9 injections, lines 74-84)

| Dependency | Type | Injection | Purpose |
|-----------|------|-----------|---------|
| `prisma` | `PrismaService` | standard | Database access |
| `notifications` | `NotificationsService` | standard | Create notification records |
| `pushTrigger` | `PushTriggerService` | standard | **Injected but never called in service** (push is dispatched via queueService instead) |
| `redis` | `Redis` (ioredis) | `@Inject('REDIS')` | Feed caching, cache invalidation |
| `gamification` | `GamificationService` | standard | **Injected but not called directly** (gamification dispatched via queueService) |
| `ai` | `AiService` | standard | Image moderation via `ai.moderateImage()` |
| `contentSafety` | `ContentSafetyService` | standard | Pre-save text moderation via `contentSafety.moderateText()` |
| `queueService` | `QueueService` | standard | Dispatch async jobs (push, gamification, moderation, search index) |
| `analytics` | `AnalyticsService` | standard | Event tracking + counter increments |

### Constants

#### `POST_SELECT` (lines 26-69)
The standard Prisma select object used across all post queries:
```
id, postType, content, visibility, mediaUrls, mediaTypes, thumbnailUrl,
mediaWidth, mediaHeight, hashtags, mentions, locationName, locationLat,
locationLng, scheduledAt, likesCount, commentsCount, sharesCount,
savesCount, viewsCount, hideLikesCount, commentsDisabled, commentPermission,
brandedContent, brandPartner, remixAllowed, shareToFeed, topics, altText,
isSensitive, createdAt, updatedAt,
user: { id, username, displayName, avatarUrl, isVerified },
circle: { id, name, slug }
```

### Service Methods (31 methods)

---

#### `getFeed(userId, type, cursor?, limit=20)` — lines 86-238
**Parameters:** `userId: string`, `type: 'following' | 'foryou' | 'chronological' | 'favorites'`, `cursor?: string`, `limit = 20`
**Returns:** `{ data: Post[], meta: { cursor, hasMore } }`

**Logic flow by feed type:**

1. **`chronological`** → delegates to `getChronologicalFeed()` (line 93)
2. **`favorites`** → delegates to `getFavoritesFeed()` (line 97)
3. **`foryou`** (lines 101-183):
   - Check Redis cache: key `feed:foryou:${userId}:${cursor ?? 'first'}`, 30s TTL
   - If cache hit → return parsed JSON (with corrupted cache fallback: delete and fall through)
   - Fetch blocks (bidirectional), mutes, feed dismissals in parallel (4 queries)
   - Query `Post` model: last 72 hours, `isRemoved: false`, scheduledAt filter (`OR: [null, lte now]`), public visibility, non-banned non-private users, excluding blocked/muted/dismissed
   - Fetch 200 candidates, score each: `engagement / ageHours^1.5` where engagement = `likes*3 + comments*5 + shares*7 + saves*2 + views*0.1`
   - Sort by score descending, paginate using offset (not cursor-based for foryou)
   - Enrich with user reaction/saved status via `enrichPostsForUser()`
   - Cache result in Redis with 30s TTL
4. **`following`** (lines 186-238):
   - Fetch follows (max 50), blocks (bidirectional, max 1000 each), mutes (max 1000)
   - **Zero follows** → `getTrendingFallback()` (line 203)
   - **Few follows (<10)** → `getBlendedFeed()` (line 208)
   - **Normal** → query posts from followed users + self, cursor-based pagination, chronological order
   - Enrich with user reaction/saved status

**Prisma models used:** `Post`, `Block`, `Mute`, `FeedDismissal`, `Follow`, `PostReaction`, `SavedPost`
**Redis operations:** GET + SETEX (30s TTL) for foryou cache; DEL not done here

---

#### `getTrendingFallback(userId, excludedIds, cursor?, limit=20)` — lines 244-278 (private)
**Purpose:** Feed for users with zero follows — trending posts from last 7 days
**Logic:**
- Query public posts from last 7 days, non-removed, non-deactivated, non-private users
- Fetch 200 candidates, score: `engagement / ageHours` (simpler formula than foryou)
- Sort by score, take top `limit`
- Enrich via `enrichPostsForUser()`

**Prisma models:** `Post`

---

#### `getBlendedFeed(userId, followingIds, excludedIds, cursor?, limit=20)` — lines 284-346 (private)
**Purpose:** Feed for users with <10 follows — 50% following + 50% trending, interleaved
**Logic:**
- Fetch `halfLimit` posts from followed users
- Fetch trending posts from last 7 days (excluding already-seen IDs), score by engagement rate
- Interleave: alternating following/trending items
- Enrich via `enrichPostsForUser()`

**Prisma models:** `Post`

---

#### `getChronologicalFeed(userId, cursor?, limit=20)` — lines 348-392 (private)
**Purpose:** Pure chronological feed from followed users
**Logic:**
- Fetch follows (max 50), blocks (max 1000), mutes (max 1000)
- Query posts from visible users (followed + self minus blocked/muted)
- scheduledAt filter: `AND: [{ OR: [null, lte now] }, { OR: [own, PUBLIC, FOLLOWERS] }]`
- Cursor-based pagination, chronological order
- Enrich via `enrichPostsForUser()`

**Prisma models:** `Post`, `Follow`, `Block`, `Mute`

---

#### `getFavoritesFeed(userId, cursor?, limit=20)` — lines 394-436 (private)
**Purpose:** Feed from close friends / circle members
**Logic:**
- Fetch circle members (circles owned by user, max 50), blocks, mutes
- Filter out blocked/muted from circle member IDs
- If no favorite IDs → return empty
- Query posts from favorite users, `PUBLIC` or `FOLLOWERS` visibility, scheduledAt filtered
- Cursor-based pagination, chronological order
- Enrich via `enrichPostsForUser()`

**Prisma models:** `Post`, `CircleMember`, `Block`, `Mute`

---

#### `enrichPostsForUser(posts, userId)` — lines 438-442 (private)
**Purpose:** Wrapper that delegates to shared utility `enrichPostsForUser()` from `@/common/utils/enrich`
**Logic:** Batch-fetches `PostReaction` and `SavedPost` for the user, appends `userReaction` and `isSaved` to each post

---

#### `create(userId, dto: CreatePostDto)` — lines 444-676
**Parameters:** `userId: string`, `dto: CreatePostDto`
**Returns:** Created post object (POST_SELECT shape)

**Logic (detailed step-by-step):**

1. **Content safety check** (lines 446-454): `contentSafety.moderateText(dto.content)` — if not safe, throws `BadRequestException` with flags + suggestion. **Blocks post creation** (fails closed).

2. **Extract hashtags** (line 457): `extractHashtags(dto.content)` — regex parses `#tag` from content, supports Latin + Arabic chars

3. **Transaction** (lines 459-562):
   a. **Upsert hashtags** (lines 461-471): For each extracted hashtag name, `tx.hashtag.upsert()` — creates with `postsCount: 1` or increments existing
   b. **Map commentPermission** (lines 475-478): DTO string → `CommentPermission` enum. Sets `commentsDisabled` boolean for backward compat (true when NOBODY)
   c. **Create Post** (lines 480-511): `tx.post.create()` with all fields from DTO, sanitized content, defaults: `isSensitive=false`, `hideLikesCount=false`, `remixAllowed=true`, `shareToFeed=true`, `brandPartner=null` when `brandedContent=false`
   d. **Create tagged users** (lines 514-535): If `taggedUserIds` provided, resolves both user IDs and usernames via `tx.user.findMany()` with OR clause. Creates `PostTaggedUser` join records via `createMany(skipDuplicates)`
   e. **Create collaborator invite** (lines 538-554): If `collaboratorUsername` provided, looks up user by username. Creates `CollabInvite` record (postId, inviterId, inviteeId). Catches unique constraint errors silently.
   f. **Increment user's postsCount** (lines 556-559): `tx.user.update({ postsCount: { increment: 1 } })`

4. **Mention notifications** (lines 566-592): For each mentioned username, fetch user IDs. For each (excluding self), create notification type `MENTION` with `postId`, dispatch push notification job via `queueService.addPushNotificationJob()`

5. **Tag notifications** (lines 599-621): Query `PostTaggedUser` records for the new post. For each tagged user (excluding self), create notification type `MENTION` (titled "Tagged you"), dispatch push job. Fire-and-forget (catch errors).

6. **Collaborator invite notification** (lines 623-643): If collaboratorUsername provided, look up invitee. Create notification type `COMMENT` (no COLLAB_INVITE type exists), dispatch push job. Fire-and-forget.

7. **Gamification jobs** (lines 646-647):
   - `queueService.addGamificationJob({ type: 'award-xp', userId, action: 'post_created' })`
   - `queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' })`

8. **Moderation job** (lines 650-652): If content exists, `queueService.addModerationJob({ content, contentType: 'post', contentId: post.id })` — async, non-blocking

9. **Image moderation** (lines 655-663): For each media URL with image MIME type, call `moderatePostImage()` (async, fire-and-forget, catches errors)

10. **Analytics** (lines 666-671):
    - `analytics.track('post_created', userId, { postType, hasMedia, visibility })`
    - `analytics.increment('posts:daily')`

11. **Cache invalidation** (line 674): `redis.del(feed:foryou:${userId}:first)` — invalidates author's foryou feed cache

**Prisma models used:** `Post`, `Hashtag`, `User`, `PostTaggedUser`, `CollabInvite`, `PostReaction`, `SavedPost`
**Notifications created:** `MENTION` (for mentions + tags), `COMMENT` (for collab invites, as workaround for missing COLLAB_INVITE type)
**Queue jobs:** `addPushNotificationJob`, `addGamificationJob` (x2: award-xp, update-streak), `addModerationJob`
**Redis operations:** `DEL feed:foryou:${userId}:first`

---

#### `getById(postId, viewerId?)` — lines 678-719
**Parameters:** `postId: string`, `viewerId?: string`
**Returns:** Post object + `userReaction: string | null`, `isSaved: boolean`

**Logic:**
1. `findUnique` with `POST_SELECT + isRemoved + sharedPost` select
2. If not found or removed → `NotFoundException`
3. **Block check** (lines 690-700): If viewerId exists and is not post owner, check bidirectional block. If blocked → `NotFoundException` (hides post existence)
4. If viewerId exists, batch-fetch `PostReaction` and `SavedPost` to get `userReaction` and `isSaved`

**Prisma models:** `Post`, `Block`, `PostReaction`, `SavedPost`

---

#### `update(postId, userId, data)` — lines 721-738
**Parameters:** `postId: string`, `userId: string`, `data: Partial<CreatePostDto>`
**Returns:** Updated post (POST_SELECT)

**Logic:**
1. Find post, check exists + not removed + ownership
2. Update only: `content` (sanitized), `hideLikesCount`, `commentsDisabled`, `isSensitive`, `altText`

**Prisma models:** `Post`

---

#### `delete(postId, userId)` — lines 740-770
**Parameters:** `postId: string`, `userId: string`
**Returns:** `{ deleted: true }`

**Logic:**
1. Find post, check exists + ownership
2. **Transaction:** Soft-delete (`isRemoved: true`, `removedAt`, `removedById`) + decrement user's `postsCount` via raw SQL `GREATEST(...-1, 0)`
3. Decrement hashtag `postsCount` for each hashtag in the post (raw SQL, prevents negative counts)
4. Invalidate foryou feed cache: `redis.del(feed:foryou:${userId}:first)`
5. Queue search index deletion: `queueService.addSearchIndexJob({ action: 'delete', indexName: 'posts', documentId: postId })`

**Prisma models:** `Post`, `User` (raw SQL), `Hashtag` (raw SQL)
**Redis operations:** `DEL feed:foryou:${userId}:first`
**Queue jobs:** `addSearchIndexJob` (delete)

---

#### `react(postId, userId, reaction='LIKE')` — lines 772-824
**Parameters:** `postId: string`, `userId: string`, `reaction: string = 'LIKE'`
**Returns:** `{ reaction }`

**Logic:**
1. Find post, check exists + not removed
2. **Self-react prevention** (line 777): `BadRequestException` if post.userId === userId
3. Check existing reaction:
   - If exists → **update** reaction type (no count change)
   - If not exists → **transaction**: create `PostReaction` + increment `Post.likesCount`
4. On new reaction: notify post owner (type `LIKE`), dispatch push job
5. P2002 (duplicate key race condition) → return success silently

**Prisma models:** `Post`, `PostReaction`
**Notifications:** `LIKE` type
**Queue jobs:** `addPushNotificationJob`

---

#### `unreact(postId, userId)` — lines 826-839
**Logic:** Find existing reaction → if not found return `{ reaction: null }` (idempotent). Transaction: delete `PostReaction` + decrement `Post.likesCount` via raw SQL with GREATEST.

**Prisma models:** `Post` (raw SQL), `PostReaction`

---

#### `save(postId, userId)` — lines 841-857
**Logic:** Find post (exists + not removed). Transaction: create `SavedPost` + increment `Post.savesCount`. P2002 → `ConflictException('Post already saved')`.

**Prisma models:** `Post`, `SavedPost`

---

#### `unsave(postId, userId)` — lines 859-870
**Logic:** Find existing saved record → `NotFoundException` if not found. Transaction: delete `SavedPost` + decrement `Post.savesCount` via raw SQL with GREATEST.

**Prisma models:** `Post` (raw SQL), `SavedPost`

---

#### `share(postId, userId, content?)` — lines 872-911
**Parameters:** `postId: string`, `userId: string`, `content?: string`
**Returns:** New post (POST_SELECT shape, a repost)

**Logic:**
1. Find original post (exists + not removed)
2. **Block check** (bidirectional) — returns NotFoundException if blocked
3. Check for existing share (same user, same `sharedPostId`, not removed) → `ConflictException`
4. Transaction: Create new `Post` (type TEXT, `sharedPostId` set) + increment original `Post.sharesCount`

**Prisma models:** `Post`, `Block`

---

#### `shareAsStory(postId, userId)` — lines 913-974
**Returns:** Created story object

**Logic:**
1. Find post (with user relation). Check exists + not removed
2. **Block check** (bidirectional)
3. Require at least one media URL → `BadRequestException` if no media
4. Create `Story` record: `mediaUrl` (first from post), `mediaType`, `thumbnailUrl`, `textOverlay` ("Shared from @username"), `expiresAt` (24 hours from now)
5. Increment original `Post.sharesCount`

**Prisma models:** `Post`, `Story`, `Block`

---

#### `getComments(postId, cursor?, limit=20)` — lines 976-1002
**Logic:** Query `Comment` where `postId`, `parentId: null` (top-level only), `isRemoved: false`, `isHidden: false`. Include user select + `_count.replies`. Cursor-based pagination, descending by `createdAt`.

**Prisma models:** `Comment`

---

#### `getCommentReplies(commentId, cursor?, limit=20)` — lines 1004-1029
**Logic:** Query `Comment` where `parentId = commentId`, `isRemoved: false`. Include user select. Cursor-based pagination, ascending by `createdAt`.

**Prisma models:** `Comment`

---

#### `addComment(postId, userId, dto: AddCommentDto)` — lines 1031-1115
**Parameters:** `postId: string`, `userId: string`, `dto: AddCommentDto`
**Returns:** Created comment (with user relation)

**Logic:**
1. Find post (exists + not removed)
2. **Comment permission enforcement** (lines 1036-1048):
   - Read `post.commentPermission` (default `EVERYONE`)
   - **Owner always allowed** (bypasses all restrictions)
   - `NOBODY` or legacy `commentsDisabled=true` → `ForbiddenException`
   - `FOLLOWERS` → check `Follow` record exists. If not following → `ForbiddenException`
3. Transaction: Create `Comment` (sanitized content, parentId if reply, empty mentions array) + increment `Post.commentsCount`
4. **Notifications** (lines 1077-1109):
   - If reply (`parentId` set): notify parent comment author (type `REPLY`, body = first 100 chars)
   - If top-level (no parentId): notify post owner (type `COMMENT`, body = first 100 chars)
   - Skip self-notifications
   - Dispatch push jobs via `queueService.addPushNotificationJob()`
5. **Gamification** (line 1112): `queueService.addGamificationJob({ type: 'award-xp', userId, action: 'comment_posted' })`

**Prisma models:** `Post`, `Comment`, `Follow`, `PostReaction`
**Notifications:** `REPLY` (for replies), `COMMENT` (for top-level comments)
**Queue jobs:** `addPushNotificationJob`, `addGamificationJob` (award-xp for comment_posted)

---

#### `editComment(commentId, userId, content)` — lines 1117-1129
**Logic:** Find comment (exists + not removed + ownership check). Update content (sanitized). Return with user select.

**Prisma models:** `Comment`

---

#### `deleteComment(commentId, userId)` — lines 1131-1148
**Logic:**
1. Find comment including `post.userId`
2. **Both comment author AND post owner can delete** (line 1138)
3. Transaction: soft-delete (`isRemoved: true`) + decrement `Post.commentsCount` via raw SQL with GREATEST

**Prisma models:** `Comment`, `Post` (raw SQL)

---

#### `likeComment(commentId, userId)` — lines 1150-1177
**Logic:**
1. Find comment (exists)
2. Check existing `CommentReaction` → `ConflictException('Already liked')`
3. Transaction: create `CommentReaction` (reaction: 'LIKE') + increment `Comment.likesCount`
4. P2002 race condition → `ConflictException`

**Prisma models:** `Comment`, `CommentReaction`

---

#### `unlikeComment(commentId, userId)` — lines 1179-1192
**Logic:** Find existing `CommentReaction` → `NotFoundException` if not found. Transaction: delete `CommentReaction` + decrement `Comment.likesCount` via raw SQL with GREATEST.

**Prisma models:** `Comment` (raw SQL), `CommentReaction`

---

#### `report(postId, userId, reason)` — lines 1194-1216
**Logic:**
1. Find post (exists)
2. Check for duplicate report (`Report` where reporterId + reportedPostId)
3. Map reason string to `ReportReason` enum via lookup table: `SPAM→SPAM`, `MISINFORMATION→MISINFORMATION`, `INAPPROPRIATE→OTHER`, `HATE_SPEECH→HATE_SPEECH`, fallback `OTHER`
4. Create `Report` record

**Prisma models:** `Post`, `Report`

---

#### `dismiss(postId, userId)` — lines 1218-1225
**Logic:** `FeedDismissal.upsert()` with composite key `userId_contentId_contentType`, contentType `'POST'`. Idempotent.

**Prisma models:** `FeedDismissal`

---

#### `archivePost(postId, userId)` — lines 1227-1238
**Logic:** Find post (exists + not removed + ownership). `SavedPost.upsert()` — update collectionName to `'archive'` or create with `'archive'`.

**Prisma models:** `Post`, `SavedPost`

---

#### `unarchivePost(postId, userId)` — lines 1240-1251
**Logic:** Find `SavedPost` → verify `collectionName === 'archive'`. Delete the `SavedPost` record.

**Prisma models:** `SavedPost`

---

#### `getArchived(userId, cursor?, limit=20)` — lines 1253-1270
**Logic:** Query `SavedPost` where `userId` and `collectionName = 'archive'`, include `post` with POST_SELECT. Cursor-based pagination using composite key `userId_postId`.

**Prisma models:** `SavedPost`, `Post`

---

#### `pinComment(postId, commentId, userId)` — lines 1272-1292
**Logic:**
1. Find post (ownership check)
2. Find comment (verify belongs to post)
3. Unpin all currently pinned comments on post (`Comment.updateMany` where `postId, isPinned: true`)
4. Pin target comment (`isPinned: true`)

**Prisma models:** `Post`, `Comment`

---

#### `unpinComment(postId, commentId, userId)` — lines 1294-1309
**Logic:** Find post (ownership). Find comment (verify belongs to post). Set `isPinned: false`.

**Prisma models:** `Post`, `Comment`

---

#### `hideComment(commentId, userId)` — lines 1312-1320
**Logic:** Find comment (include `post.userId`). Verify caller is **post author** (not comment author). Set `isHidden: true`.

**Prisma models:** `Comment`

---

#### `unhideComment(commentId, userId)` — lines 1322-1330
**Logic:** Same as hideComment but sets `isHidden: false`.

**Prisma models:** `Comment`

---

#### `getHiddenComments(postId, userId, cursor?, limit=20)` — lines 1332-1355
**Logic:** Find post (ownership check — author only). Query `Comment` where `postId, isHidden: true, isRemoved: false`. Include user select + reply count. Cursor-based pagination.

**Prisma models:** `Post`, `Comment`

---

#### `getShareLink(postId)` — lines 1357-1361
**Logic:** Find post (exists + not removed). Return `{ url: 'https://mizanly.app/post/${postId}' }`.

**Prisma models:** `Post`

---

#### `crossPost(userId, postId, dto)` — lines 1363-1399
**Parameters:** `userId: string`, `postId: string`, `dto: { targetSpaces: string[]; captionOverride?: string }`
**Returns:** Array of newly created posts

**Logic:**
1. Find post (owned by user, not removed)
2. Filter target spaces to valid set `['SAF', 'MAJLIS', 'BAKRA', 'MINBAR']`, excluding the post's current space
3. For each valid target space, create a new `Post` with: same media/hashtags/mentions, optional captionOverride, `space` set to target
4. Increment user's `postsCount` by number of new posts (raw SQL)

**Prisma models:** `Post`, `User` (raw SQL)

---

#### `moderatePostImage(userId, postId, imageUrl)` — lines 1406-1448 (private)
**Purpose:** Background image moderation via Claude Vision API
**Logic:**
1. Call `ai.moderateImage(imageUrl)` — returns `{ classification, reason }`
2. If `BLOCK`: Auto-remove post (`isRemoved: true`, `isSensitive: true`), queue search index deletion, create auto-moderation `Report` record with status `RESOLVED`, actionTaken `CONTENT_REMOVED`
3. If `WARNING`: Mark post as sensitive (`isSensitive: true`) — blurred in feed, tap to reveal
4. On error: log, don't block — post remains visible

**Prisma models:** `Post`, `Report`
**Cross-module calls:** `ai.moderateImage()`
**Queue jobs:** `addSearchIndexJob` (delete, on BLOCK)

---

## 5. Cross-Module Dependencies

### This module imports from:
| Module | Services Used | Methods Called |
|--------|--------------|---------------|
| `NotificationsModule` | `NotificationsService`, `PushTriggerService` | `notifications.create()` |
| `GamificationModule` | `GamificationService` | (injected but dispatched via queue, not called directly) |
| `AiModule` | `AiService` | `ai.moderateImage()` |
| `ModerationModule` | `ContentSafetyService` | `contentSafety.moderateText()` |

### Global providers used (not via module imports):
| Provider | Injection | Methods Called |
|----------|-----------|---------------|
| `PrismaService` | standard | All database operations |
| `Redis` | `@Inject('REDIS')` | `get`, `del`, `setex` |
| `QueueService` | standard | `addPushNotificationJob`, `addGamificationJob`, `addModerationJob`, `addSearchIndexJob` |
| `AnalyticsService` | standard | `track`, `increment` |

### What imports this module:
| Module | Purpose |
|--------|---------|
| `AppModule` | Root application module registration |

### PostsService exported and used by:
- No other modules import `PostsService` directly (only test files reference it outside this module)

---

## 6. Notifications Created

| NotificationType | Created In | Condition | Title/Body |
|-----------------|------------|-----------|------------|
| `MENTION` | `create()` line 579 | For each @mentioned user (not self) | "Mentioned you" / "@username mentioned you in a post" |
| `MENTION` | `create()` line 608 | For each tagged user (not self) | "Tagged you" / "@username tagged you in a post" |
| `COMMENT` | `create()` line 631 | For collaborator invite (workaround, no COLLAB_INVITE type) | "Collaboration invite" / "@username invited you to collaborate on a post" |
| `LIKE` | `react()` line 806 | On new reaction (not update, not self) | — (no title/body set) |
| `REPLY` | `addComment()` line 1086 | Reply to a comment (parent author, not self) | — (body = first 100 chars of comment) |
| `COMMENT` | `addComment()` line 1098 | Top-level comment on post (post owner, not self) | — (body = first 100 chars of comment) |

---

## 7. Queue Jobs Dispatched

| Job Type | Method | Dispatched In | Data |
|----------|--------|---------------|------|
| `addPushNotificationJob` | Push notification | `create()` (mentions, tags, collabs), `react()`, `addComment()` | `{ notificationId }` |
| `addGamificationJob` (award-xp) | XP award | `create()` line 646 | `{ type: 'award-xp', userId, action: 'post_created' }` |
| `addGamificationJob` (update-streak) | Streak update | `create()` line 647 | `{ type: 'update-streak', userId, action: 'posting' }` |
| `addGamificationJob` (award-xp) | XP award | `addComment()` line 1112 | `{ type: 'award-xp', userId, action: 'comment_posted' }` |
| `addModerationJob` | Text moderation | `create()` line 651 | `{ content, contentType: 'post', contentId }` |
| `addSearchIndexJob` (delete) | Search deindex | `delete()` line 766 | `{ action: 'delete', indexName: 'posts', documentId }` |
| `addSearchIndexJob` (delete) | Search deindex | `moderatePostImage()` line 1419 | `{ action: 'delete', indexName: 'posts', documentId }` |

---

## 8. Socket Events

**None.** The posts module does not emit any socket events directly. Push notifications are dispatched via the queue service, which handles delivery.

---

## 9. Key Business Logic

### scheduledAt Filtering
Every feed query includes the scheduledAt filter pattern:
```ts
OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]
```
This ensures:
- Posts without a scheduled date appear immediately
- Scheduled posts only appear after their scheduled time

Applied in: `getFeed` (foryou, following), `getTrendingFallback`, `getBlendedFeed`, `getChronologicalFeed`, `getFavoritesFeed`

### Comment Permission Enforcement (addComment, lines 1035-1048)
1. Read `post.commentPermission` (defaults to `EVERYONE`)
2. **Owner bypass:** Post author can always comment regardless of setting
3. `NOBODY` OR legacy `commentsDisabled=true` → `ForbiddenException`
4. `FOLLOWERS` → Check `Follow` record. Non-followers get `ForbiddenException`
5. `EVERYONE` → no restriction

### Block Checking (bidirectional)
Applied in:
- **getFeed (foryou):** Blocks out + blocks in + mutes, all excluded from feed
- **getFeed (following):** Same pattern
- **getChronologicalFeed:** Blocks + mutes excluded
- **getFavoritesFeed:** Blocks + mutes excluded from circle members
- **getById:** Bidirectional block check → `NotFoundException` (hides existence)
- **share:** Bidirectional block check → `NotFoundException`
- **shareAsStory:** Bidirectional block check → `NotFoundException`

### Counter Updates
All counter increments/decrements use transactions to maintain consistency:

| Counter | Increment | Decrement |
|---------|-----------|-----------|
| `Post.likesCount` | `react()` (transaction) | `unreact()` (raw SQL GREATEST) |
| `Post.commentsCount` | `addComment()` (transaction) | `deleteComment()` (raw SQL GREATEST) |
| `Post.sharesCount` | `share()` (transaction), `shareAsStory()` | — |
| `Post.savesCount` | `save()` (transaction) | `unsave()` (raw SQL GREATEST) |
| `User.postsCount` | `create()` (transaction) | `delete()` (raw SQL GREATEST) |
| `Hashtag.postsCount` | `create()` (upsert + increment) | `delete()` (raw SQL GREATEST) |
| `Comment.likesCount` | `likeComment()` (transaction) | `unlikeComment()` (raw SQL GREATEST) |

All decrements use `GREATEST(count - 1, 0)` to prevent negative values.

### Redis Operations Summary

| Operation | Key Pattern | TTL | Method |
|-----------|------------|-----|--------|
| GET | `feed:foryou:${userId}:${cursor}` | — | `getFeed` (foryou cache read) |
| SETEX | `feed:foryou:${userId}:${cursor}` | 30s | `getFeed` (foryou cache write) |
| DEL | `feed:foryou:${userId}:first` | — | `create()`, `delete()` (cache invalidation) |

### Content Moderation Pipeline
1. **Pre-save (synchronous, blocking):** `contentSafety.moderateText()` — blocks post creation if unsafe
2. **Post-save (async, non-blocking):** `queueService.addModerationJob()` — re-checks content in background
3. **Image moderation (async, non-blocking):** `ai.moderateImage()` via `moderatePostImage()` — BLOCK removes post, WARNING marks sensitive

### Feed Scoring Algorithm (foryou)
```
engagement = likes*3 + comments*5 + shares*7 + saves*2 + views*0.1
score = engagement / ageHours^1.5
```
Where `ageHours = max(1, hoursOld)`, window = 72 hours, fetches 200 candidates, sorts by score descending.

### Feed Scoring Algorithm (trending fallback + blended)
```
engagement = likes + comments*2 + shares*3 + saves*2
score = engagement / ageHours
```
Simpler formula, 7-day window, 200 candidates.

---

## 10. Prisma Models Accessed

| Model | Operations |
|-------|-----------|
| `Post` | findMany, findUnique, findFirst, create, update, updateMany, $executeRaw |
| `Comment` | findMany, findUnique, create, update, updateMany |
| `PostReaction` | findUnique, findMany, create, update, delete |
| `CommentReaction` | findUnique, findMany, create, delete |
| `SavedPost` | findUnique, findMany, create, delete, upsert |
| `Follow` | findMany, findUnique |
| `Block` | findMany, findFirst |
| `Mute` | findMany |
| `FeedDismissal` | findMany, upsert |
| `Hashtag` | upsert, $executeRaw |
| `User` | findUnique, findMany, update, $executeRaw |
| `Report` | findFirst, create |
| `Story` | create |
| `PostTaggedUser` | createMany, findMany |
| `CollabInvite` | create |
| `CircleMember` | findMany |

---

## 11. Utility Imports

| Utility | Source | Purpose |
|---------|--------|---------|
| `sanitizeText` | `@/common/utils/sanitize` | Strip null bytes, control chars, HTML, collapse newlines |
| `extractHashtags` | `@/common/utils/hashtag` | Regex extract #hashtags (Latin + Arabic) |
| `enrichPostsForUser` | `@/common/utils/enrich` | Batch-fetch user reactions + saves for post list |

---

## 12. Test Files (for reference)

| File | Lines | Scope |
|------|-------|-------|
| `posts.controller.spec.ts` | 9,235 | Controller endpoint routing |
| `posts.service.spec.ts` | 46,675 | Main service tests |
| `posts.service.auth.spec.ts` | 8,146 | Auth guard tests |
| `posts.service.blocked.spec.ts` | 12,263 | Block checking tests |
| `posts.service.concurrency.spec.ts` | 6,071 | Race condition / P2002 tests |
| `posts.service.edge.spec.ts` | 10,749 | Edge case tests |
| `posts.service.abuse.spec.ts` | 5,579 | Abuse prevention tests |
| `posts.comment-permission.spec.ts` | 7,251 | Comment permission enforcement tests |
| `posts.publish-fields.spec.ts` | 21,132 | Publish field (session 5) tests |
| `posts.schedule.spec.ts` | 14,631 | scheduledAt filtering tests |
| `posts.dto-validation.spec.ts` | 9,436 | DTO validation tests |

**Total test file size:** ~151,168 lines across 11 test files

---

## 13. Known Issues / Technical Debt

1. **PushTriggerService injected but never called** (line 77) — push is dispatched via `queueService.addPushNotificationJob()` instead
2. **GamificationService injected but never called directly** (line 79) — dispatched via `queueService.addGamificationJob()`
3. **Collaborator invite uses COMMENT notification type** (line 633) — no `COLLAB_INVITE` type exists in the enum
4. **foryou feed re-scores all 200 candidates per request** (comment at line 129) — TODO: cache scored results in Redis with 60s TTL
5. **Trending fallback/blended feeds not cached in Redis** — only foryou has caching
6. **Cross-post doesn't run content moderation** — new posts created via crossPost skip the moderation pipeline
7. **Tag notification uses MENTION type** instead of a dedicated TAG type (line 608)
8. **Share creates a TEXT postType** (line 898) — regardless of original post type
