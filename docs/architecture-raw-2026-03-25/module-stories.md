# Module: Stories (Saf Space)

> Extracted 2026-03-25. Source: `apps/api/src/modules/stories/`

## 1. Module File

**File:** `apps/api/src/modules/stories/stories.module.ts` (6 lines)

```typescript
@Module({
  imports: [AiModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
```

- **Imports:** `AiModule` (for image moderation via `AiService.moderateImage()`)
- **Controllers:** `StoriesController`
- **Providers:** `StoriesService`
- **Exports:** `StoriesService` (consumed by integration tests, not directly by other modules currently)
- **Registered in:** `app.module.ts` line 117

### Implicit Dependencies (injected via global providers)
- `PrismaService` — global, no import needed
- `QueueService` — global, no import needed

---

## 2. Controller

**File:** `apps/api/src/modules/stories/stories.controller.ts` (209 lines)

**Swagger Tag:** `Stories (Saf)`
**Base Path:** `/api/v1/stories`

### Inline DTOs (defined in controller file)

**StoryReplyDto** (lines 25-27):
| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `content` | `string` | `@IsString() @MaxLength(2000)` | Reply text content |

**StickerResponseDto** (lines 29-32):
| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `stickerType` | `string` | `@IsString() @MaxLength(50)` | Sticker type identifier (e.g., 'poll', 'quiz', 'emoji') |
| `responseData` | `Record<string, unknown>` | `@IsObject()` | Arbitrary JSON response data |

### Endpoints

#### 1. GET `/stories/feed` (lines 39-45)
- **Auth:** `ClerkAuthGuard` (required)
- **Rate Limit:** default (100 req/min global)
- **Params:** none
- **Query:** none
- **DTO:** none
- **Response:** Array of `{ user, stories[], hasUnread }` grouped by user
- **Purpose:** Get stories feed for current user, grouped by author, with unread indicators
- **Calls:** `storiesService.getFeedStories(userId)`

#### 2. POST `/stories` (lines 47-54)
- **Auth:** `ClerkAuthGuard` (required)
- **Rate Limit:** `@Throttle({ default: { limit: 10, ttl: 60000 } })` — 10 per minute
- **Body DTO:** `CreateStoryDto`
- **Response:** Created story object with STORY_SELECT fields
- **Purpose:** Create a new story (24h auto-expiry)
- **Calls:** `storiesService.create(userId, dto)`

#### 3. GET `/stories/highlights/:userId` (lines 56-61)
- **Auth:** `OptionalClerkAuthGuard` (optional)
- **Rate Limit:** default
- **Params:** `userId` — target user's ID
- **Response:** Array of `StoryHighlightAlbum` with latest story per album
- **Purpose:** Get a user's highlight albums (public)
- **Calls:** `storiesService.getHighlights(userId)`

#### 4. GET `/stories/me/archived` (lines 63-69)
- **Auth:** `ClerkAuthGuard` (required)
- **Rate Limit:** default
- **Response:** Array of archived stories for current user
- **Purpose:** View own archived stories
- **Calls:** `storiesService.getArchived(userId)`

#### 5. GET `/stories/:id` (lines 71-76)
- **Auth:** `OptionalClerkAuthGuard` (optional)
- **Params:** `id` — story ID
- **Response:** Story object (full)
- **Purpose:** Get story by ID (checks expiry, archive, private account)
- **Calls:** `storiesService.getById(id, userId)`

#### 6. DELETE `/stories/:id` (lines 78-85)
- **Auth:** `ClerkAuthGuard` (required)
- **HTTP Code:** 200 (explicit)
- **Params:** `id` — story ID
- **Response:** `{ archived: true }`
- **Purpose:** Soft-delete (archive) a story. Does NOT hard delete.
- **Calls:** `storiesService.delete(id, userId)`

#### 7. PATCH `/stories/:id/unarchive` (lines 87-94)
- **Auth:** `ClerkAuthGuard` (required)
- **HTTP Code:** 200
- **Params:** `id` — story ID
- **Response:** `{ unarchived: true }`
- **Purpose:** Unarchive a previously archived story
- **Calls:** `storiesService.unarchive(id, userId)`

#### 8. POST `/stories/:id/view` (lines 96-103)
- **Auth:** `ClerkAuthGuard` (required)
- **Rate Limit:** `@Throttle({ default: { ttl: 60000, limit: 10 } })` — 10 per minute
- **Params:** `id` — story ID
- **Response:** `{ viewed: true }`
- **Purpose:** Mark a story as viewed (idempotent, with P2002 handling)
- **Calls:** `storiesService.markViewed(id, userId)`

#### 9. GET `/stories/:id/viewers` (lines 105-115)
- **Auth:** `ClerkAuthGuard` (required)
- **Params:** `id` — story ID
- **Query:** `cursor?` — pagination cursor (viewerId)
- **Response:** `{ data: [{ user, viewedAt }], meta: { cursor, hasMore } }`
- **Purpose:** Get story viewers list (owner only). Cursor-based pagination.
- **Calls:** `storiesService.getViewers(id, userId, cursor)`

#### 10. POST `/stories/:id/reply` (lines 117-128)
- **Auth:** `ClerkAuthGuard` (required)
- **Rate Limit:** `@Throttle({ default: { limit: 30, ttl: 60000 } })` — 30 per minute
- **Body DTO:** `StoryReplyDto` (`content` max 2000 chars)
- **Response:** Created message with sender info
- **Purpose:** Reply to a story (creates or finds DM conversation, sends STORY_REPLY message)
- **Calls:** `storiesService.replyToStory(id, userId, dto.content)`

#### 11. GET `/stories/:id/reaction-summary` (lines 130-139)
- **Auth:** `ClerkAuthGuard` (required)
- **Params:** `id` — story ID
- **Response:** Array of `{ emoji, count }` sorted by count DESC
- **Purpose:** Get emoji reaction summary for a story (owner only). Uses raw SQL.
- **Calls:** `storiesService.getReactionSummary(id, userId)`

#### 12. POST `/stories/highlights` (lines 141-150)
- **Auth:** `ClerkAuthGuard` (required)
- **Body DTO:** `CreateHighlightDto`
- **Response:** Created `StoryHighlightAlbum`
- **Purpose:** Create a new highlight album
- **Calls:** `storiesService.createHighlight(userId, dto.title, dto.coverUrl)`

#### 13. PATCH `/stories/highlights/:albumId` (lines 152-162)
- **Auth:** `ClerkAuthGuard` (required)
- **Params:** `albumId` — highlight album ID
- **Body DTO:** `UpdateHighlightDto`
- **Response:** Updated `StoryHighlightAlbum`
- **Purpose:** Update highlight album title/cover
- **Calls:** `storiesService.updateHighlight(albumId, userId, dto)`

#### 14. DELETE `/stories/highlights/:albumId` (lines 164-174)
- **Auth:** `ClerkAuthGuard` (required)
- **HTTP Code:** 200
- **Params:** `albumId` — highlight album ID
- **Response:** `{ deleted: true }`
- **Purpose:** Delete a highlight album (hard delete)
- **Calls:** `storiesService.deleteHighlight(albumId, userId)`

#### 15. POST `/stories/highlights/:albumId/stories/:storyId` (lines 176-186)
- **Auth:** `ClerkAuthGuard` (required)
- **Params:** `albumId`, `storyId`
- **Response:** Updated story object
- **Purpose:** Add a story to a highlight album (sets `highlightAlbumId`, `isHighlight=true`, `isArchived=true`)
- **Calls:** `storiesService.addStoryToHighlight(storyId, albumId, userId)`

#### 16. POST `/stories/:id/sticker-response` (lines 188-194)
- **Auth:** `ClerkAuthGuard` (required)
- **Rate Limit:** `@Throttle({ default: { limit: 30, ttl: 60000 } })` — 30 per minute
- **HTTP Code:** 200
- **Params:** `id` — story ID
- **Body DTO:** `StickerResponseDto`
- **Response:** Created or updated `StoryStickerResponse`
- **Purpose:** Submit a response to a story sticker (upsert — one response per user per sticker type)
- **Calls:** `storiesService.submitStickerResponse(id, userId, dto.stickerType, dto.responseData)`

#### 17. GET `/stories/:id/sticker-responses` (lines 196-201)
- **Auth:** `ClerkAuthGuard` (required)
- **Params:** `id` — story ID
- **Query:** `type?` — filter by sticker type
- **Response:** Array of sticker responses with user info
- **Purpose:** Get sticker responses for a story (owner only)
- **Calls:** `storiesService.getStickerResponses(id, userId, type)`

#### 18. GET `/stories/:id/sticker-summary` (lines 203-208)
- **Auth:** `ClerkAuthGuard` (required)
- **Params:** `id` — story ID
- **Response:** `Record<stickerType, Record<answer, count>>` — aggregated summary
- **Purpose:** Get aggregated sticker summary (owner only)
- **Calls:** `storiesService.getStickerSummary(id, userId)`

---

## 3. Service

**File:** `apps/api/src/modules/stories/stories.service.ts` (555 lines)

### Dependencies (constructor, lines 49-53)
- `PrismaService` — database access
- `AiService` — image moderation (`moderateImage()`)
- `QueueService` — gamification job queue (`addGamificationJob()`)

### Constants

**STORY_SELECT** (lines 14-43): Standard select object for story queries.
```
Fields: id, userId, mediaUrl, mediaType, thumbnailUrl, duration, textOverlay, textColor,
        bgColor, viewsCount, repliesCount, isHighlight, highlightName, highlightAlbumId,
        stickerData, closeFriendsOnly, isArchived, expiresAt, createdAt,
        user: { id, username, displayName, avatarUrl, isVerified }
```

### Methods

#### 3.1 `getFeedStories(userId: string)` — lines 55-154
**Returns:** Array of `{ user, stories[], hasUnread }` grouped by user

**Logic:**
1. **Parallel fetch** (4 queries via `Promise.all`):
   - `follow.findMany` — get followed users (take 50)
   - `block.findMany` — get blocks in both directions (take 50)
   - `mute.findMany` — get muted users (take 50)
   - `restrict.findMany` — get restricted users (take 50)
2. **Build excluded set:** blocked (bidirectional) + muted + restricted users
3. **Build target IDs:** `[userId, ...followingIds]` (self + non-excluded follows)
4. **Fetch stories:** `story.findMany` where userId in target IDs, not expired (`expiresAt > now()`), not archived, take 100, order by `createdAt desc`. Selects `STORY_SELECT` plus `closeFriendsOnly` and `subscribersOnly`.
5. **Filter close-friends/subscribers:** Own stories always shown. Others' `closeFriendsOnly` stories hidden (TODO: check circle membership). Others' `subscribersOnly` stories hidden (TODO: check subscription).
6. **Group by user:** Map keyed by user ID with `{ user, stories[], hasUnread }`
7. **Check views:** Batch fetch `storyView` for all story IDs for current user
8. **Set `hasUnread`:** true if any story in group not in viewed set
9. **Sort:** Own stories first, then unread groups first

**Prisma models touched:** Follow, Block, Mute, Restrict, Story, StoryView
**Cross-module calls:** none

#### 3.2 `create(userId, data)` — lines 156-200
**Params:** `userId: string`, data object with `mediaUrl, mediaType, thumbnailUrl?, duration?, textOverlay?, textColor?, bgColor?, stickerData?, closeFriendsOnly?, subscribersOnly?`
**Returns:** Created story with STORY_SELECT

**Logic:**
1. **Create story** in DB with 24h expiry: `expiresAt = Date.now() + 24 * 60 * 60 * 1000`
2. **stickerData** cast to `Prisma.InputJsonValue`
3. **closeFriendsOnly** defaults to `false`
4. **subscribersOnly** defaults to `false`
5. **Async image moderation** (non-blocking `.catch()`): if `mediaType` starts with `'image'`, calls `moderateStoryImage()`
6. **Gamification queue job** (non-blocking `.catch()`): `{ type: 'award-xp', userId, action: 'story_created' }`

**Prisma models touched:** Story (create)
**Cross-module calls:** `AiService.moderateImage()`, `QueueService.addGamificationJob()`

#### 3.3 `moderateStoryImage(userId, storyId, imageUrl)` — lines 202-219 (private)
**Returns:** void

**Logic:**
1. Calls `this.ai.moderateImage(imageUrl)`
2. If classification is `BLOCK`: **hard deletes** the story, logs warning
3. If classification is `WARNING`: sets `isSensitive = true` on story
4. On error: logs error, does NOT delete/modify story (fail-open for errors)

**Prisma models touched:** Story (delete or update)
**Cross-module calls:** `AiService.moderateImage()`

#### 3.4 `getById(storyId, viewerId?)` — lines 221-258
**Returns:** Story object (full, no STORY_SELECT)

**Logic:**
1. Fetch story by ID. Throw `NotFoundException` if not found.
2. **Non-owner access checks:**
   - If archived: throw `NotFoundException`
   - If expired (`expiresAt < now()`): throw `NotFoundException`
   - **Private account check** (lines 233-244): Fetch author's `isPrivate` flag. If private, require viewer is authenticated AND has a Follow record. Otherwise throw `ForbiddenException`.
3. **Auto-record view** (lines 248-254): If viewer is authenticated and not owner, upsert `StoryView` (non-blocking `.catch()`)

**Prisma models touched:** Story, User (for isPrivate), Follow, StoryView (upsert)
**Key behavior:** Returns full story (not STORY_SELECT) — includes all fields from Prisma

#### 3.5 `delete(storyId, userId)` — lines 260-270
**Returns:** `{ archived: true }`

**Logic:**
1. Find story. Throw `NotFoundException` if missing, `ForbiddenException` if not owner.
2. **Soft delete:** Sets `isArchived = true`. Does NOT hard delete.

**Prisma models touched:** Story (findUnique, update)

#### 3.6 `unarchive(storyId, userId)` — lines 272-282
**Returns:** `{ unarchived: true }`

**Logic:**
1. Find story. Throw `NotFoundException` if missing, `ForbiddenException` if not owner.
2. Sets `isArchived = false`.

**Prisma models touched:** Story (findUnique, update)

#### 3.7 `markViewed(storyId, viewerId)` — lines 284-313
**Returns:** `{ viewed: true }`

**Logic:**
1. Find story. Throw `NotFoundException` if missing.
2. Validate: throw `BadRequestException` if expired or archived.
3. Check if already viewed via `storyView.findUnique` on composite key `storyId_viewerId`.
4. If NOT already viewed: **transaction** to create `StoryView` + increment `story.viewsCount`.
5. **P2002 handling** (line 305): Catches `PrismaClientKnownRequestError` with code `P2002` (unique constraint violation from concurrent duplicate view). Returns `{ viewed: true }` idempotently instead of throwing.

**Prisma models touched:** Story (findUnique, update), StoryView (findUnique, create)
**Key behavior:** Transactional view creation + counter increment. Race-condition safe via P2002 catch.

#### 3.8 `getViewers(storyId, ownerId, cursor?, limit=20)` — lines 315-348
**Returns:** `{ data: [{ user, viewedAt }], meta: { cursor, hasMore } }`

**Logic:**
1. Find story. Throw `NotFoundException` if missing, `ForbiddenException` if not owner.
2. Fetch `storyView.findMany` with `take: limit + 1`, ordered by `createdAt desc`.
3. **Cursor pagination:** Uses composite cursor `storyId_viewerId` with `skip: 1`.
4. Fetch user details separately for viewer IDs (select: id, username, displayName, avatarUrl, isVerified, take 50).
5. Map viewers to users, include `viewedAt` from view's `createdAt`.
6. `hasMore = views.length > limit`, cursor is last item's `viewerId`.

**Prisma models touched:** Story, StoryView, User

#### 3.9 `replyToStory(storyId, senderId, content)` — lines 350-430
**Returns:** Message object with sender info

**Logic:**
1. Find story. Throw `NotFoundException` if missing or owner is null.
2. **Self-reply check:** Throw `BadRequestException` if sender is the story owner.
3. **Block check:** Check bidirectional block. Throw `ForbiddenException` if blocked.
4. **Find/create DM conversation:**
   - Search for existing non-group conversation with both members
   - If not found: create conversation with `isGroup: false`, `createdById: senderId`, and two members
5. **Create message:** `messageType: MessageType.STORY_REPLY`, content sanitized via `sanitizeText()`.
6. **Update conversation:** Sets `lastMessageAt`, `lastMessageText` (truncated to 100 chars), `lastMessageById`.

**Prisma models touched:** Story, Block, Conversation, ConversationMember (implicit via create), Message
**Cross-module calls:** `sanitizeText()` from common utils
**Notable:** Creates DMs as a side effect. Does NOT increment `repliesCount` on the story.

#### 3.10 `getReactionSummary(storyId, userId)` — lines 432-451
**Returns:** Array of `{ emoji: string, count: number }`

**Logic:**
1. Find story. Throw `NotFoundException` if missing, `ForbiddenException` if not owner.
2. **Raw SQL query** on `story_sticker_responses` table:
   ```sql
   SELECT response_data->>'emoji' as emoji, COUNT(*) as count
   FROM story_sticker_responses
   WHERE story_id = $1 AND sticker_type = 'emoji'
   GROUP BY response_data->>'emoji'
   ORDER BY count DESC
   ```
3. Converts `bigint` count to `Number`.

**Prisma models touched:** Story (findUnique), StoryStickerResponse (raw query)

#### 3.11 `getHighlights(userId)` — lines 453-467
**Returns:** Array of `StoryHighlightAlbum` with latest archived story per album

**Logic:**
1. `storyHighlightAlbum.findMany` where `userId`, include stories (only archived, take 1, latest).
2. Ordered by `position asc`, take 50.

**Prisma models touched:** StoryHighlightAlbum, Story (via include)

#### 3.12 `createHighlight(userId, title, coverUrl?)` — lines 469-474
**Returns:** Created `StoryHighlightAlbum`

**Logic:**
1. Count existing albums for user to determine `position`.
2. Create album with `{ userId, title, coverUrl, position: count }`.

**Prisma models touched:** StoryHighlightAlbum (count, create)

#### 3.13 `updateHighlight(albumId, userId, data)` — lines 476-482
**Returns:** Updated `StoryHighlightAlbum`

**Logic:**
1. Find album. Throw `NotFoundException` if missing, `ForbiddenException` if not owner.
2. Update with provided `{ title?, coverUrl? }`.

**Prisma models touched:** StoryHighlightAlbum (findUnique, update)

#### 3.14 `deleteHighlight(albumId, userId)` — lines 484-491
**Returns:** `{ deleted: true }`

**Logic:**
1. Find album. Throw `NotFoundException` if missing, `ForbiddenException` if not owner.
2. **Hard delete** the album (cascade will remove album reference from stories).

**Prisma models touched:** StoryHighlightAlbum (findUnique, delete)

#### 3.15 `addStoryToHighlight(storyId, albumId, userId)` — lines 493-505
**Returns:** Updated story

**Logic:**
1. **Parallel fetch** story and album.
2. Throw `NotFoundException` if either missing, `ForbiddenException` if either not owned by user.
3. Update story: `highlightAlbumId = albumId`, `isHighlight = true`, `isArchived = true`.

**Prisma models touched:** Story (findUnique, update), StoryHighlightAlbum (findUnique)
**Key behavior:** Adding to highlight auto-archives the story.

#### 3.16 `getArchived(userId)` — lines 507-517
**Returns:** Array of archived stories with STORY_SELECT

**Logic:**
1. `story.findMany` where `userId` and `isArchived = true`, ordered by `createdAt desc`, take 50.

**Prisma models touched:** Story

#### 3.17 `submitStickerResponse(storyId, userId, stickerType, responseData)` — lines 519-527
**Returns:** Created or updated `StoryStickerResponse`

**Logic:**
1. Find story. Throw `NotFoundException` if missing.
2. Check for existing response: `storyStickerResponse.findFirst` where `storyId, userId, stickerType`.
3. If exists: **update** the response data (upsert behavior).
4. If not: **create** new response.

**Prisma models touched:** Story (findUnique), StoryStickerResponse (findFirst, update or create)
**Key behavior:** One response per user per sticker type per story. Users can change their answer.

#### 3.18 `getStickerResponses(storyId, ownerId, stickerType?)` — lines 529-538
**Returns:** Array of `StoryStickerResponse` with user info

**Logic:**
1. Find story. Throw `ForbiddenException` if missing OR not owner.
2. Fetch responses, optionally filtered by `stickerType`.
3. Includes user info: `{ id, username, displayName, avatarUrl }`.
4. Ordered by `createdAt desc`, take 50.

**Prisma models touched:** Story (findUnique), StoryStickerResponse

#### 3.19 `getStickerSummary(storyId, ownerId)` — lines 540-554
**Returns:** `Record<stickerType, Record<answer, count>>`

**Logic:**
1. Find story. Throw `ForbiddenException` if missing OR not owner.
2. Fetch all responses (select: stickerType, responseData), take 50.
3. Aggregate: Group by `stickerType`, then count each `answer` or `option` from response data.
4. Falls back to `'unknown'` if neither `answer` nor `option` key exists.

**Prisma models touched:** Story (findUnique), StoryStickerResponse

---

## 4. DTOs

### 4.1 CreateStoryDto

**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts` (72 lines)

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `mediaUrl` | `string` | YES | `@IsUrl()` | URL of story media (image/video) |
| `mediaType` | `string` | YES | `@IsString() @MaxLength(20)` | Media type (e.g., 'IMAGE', 'VIDEO') |
| `thumbnailUrl` | `string` | no | `@IsUrl()` | Thumbnail URL for video stories |
| `duration` | `number` | no | `@IsNumber() @Min(1) @Max(60)` | Duration in seconds (1-60) |
| `textOverlay` | `string` | no | `@IsString() @MaxLength(200)` | Text overlay content |
| `textColor` | `string` | no | `@IsString() @MaxLength(7)` | Text color hex code |
| `bgColor` | `string` | no | `@IsString() @MaxLength(7)` | Background color hex code |
| `fontFamily` | `string` | no | `@IsString() @MaxLength(50)` | Font family identifier |
| `filter` | `string` | no | `@IsString() @MaxLength(50)` | Filter identifier |
| `bgGradient` | `string` | no | `@IsString() @MaxLength(500)` | Background gradient JSON |
| `stickerData` | `object[]` | no | `@IsArray() @ArrayMaxSize(20)` | Array of sticker objects (max 20) |
| `closeFriendsOnly` | `boolean` | no | `@IsBoolean()` | Close friends only flag |

**Note:** `fontFamily`, `filter`, and `bgGradient` are in the DTO but NOT consumed by `StoriesService.create()` — they exist for future use or client-side rendering metadata. The service only reads: `mediaUrl, mediaType, thumbnailUrl, duration, textOverlay, textColor, bgColor, stickerData, closeFriendsOnly, subscribersOnly`.

**Note:** `subscribersOnly` is NOT in the DTO but IS accepted by the service. It would need to be added to the DTO for client submission (currently always defaults to `false`).

### 4.2 CreateHighlightDto

**File:** `apps/api/src/modules/stories/dto/create-highlight.dto.ts` (14 lines)

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `title` | `string` | YES | `@IsString() @MaxLength(50)` | Highlight album title |
| `coverUrl` | `string` | no | `@IsUrl()` | Cover image URL |

### 4.3 UpdateHighlightDto

**File:** `apps/api/src/modules/stories/dto/update-highlight.dto.ts` (15 lines)

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `title` | `string` | no | `@IsString() @MaxLength(50)` | New title |
| `coverUrl` | `string` | no | `@IsUrl()` | New cover image URL |

### 4.4 StoryReplyDto (inline in controller, lines 25-27)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `content` | `string` | YES | `@IsString() @MaxLength(2000)` |

### 4.5 StickerResponseDto (inline in controller, lines 29-32)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `stickerType` | `string` | YES | `@IsString() @MaxLength(50)` |
| `responseData` | `Record<string, unknown>` | YES | `@IsObject()` |

---

## 5. Prisma Models

### 5.1 Story (schema.prisma lines 1056-1089, table: `stories`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `@default(cuid())` | PK |
| `userId` | `String?` | — | FK to User (nullable, SetNull on delete) |
| `mediaUrl` | `String` | — | Required |
| `mediaType` | `String` | — | Required |
| `thumbnailUrl` | `String?` | — | |
| `duration` | `Float?` | — | |
| `textOverlay` | `String?` | — | |
| `textColor` | `String?` | — | |
| `bgColor` | `String?` | — | |
| `musicId` | `String?` | — | Not used by service currently |
| `viewsCount` | `Int` | `@default(0)` | |
| `repliesCount` | `Int` | `@default(0)` | Never incremented by service |
| `expiresAt` | `DateTime` | — | Set to now + 24h on create |
| `isHighlight` | `Boolean` | `@default(false)` | |
| `highlightName` | `String?` | — | |
| `highlightAlbumId` | `String?` | — | FK to StoryHighlightAlbum (SetNull) |
| `stickerData` | `Json?` | — | Arbitrary sticker array |
| `blurhash` | `String?` | — | Not set by service |
| `closeFriendsOnly` | `Boolean` | `@default(false)` | |
| `subscribersOnly` | `Boolean` | `@default(false)` | |
| `isSensitive` | `Boolean` | `@default(false)` | Set by AI moderation |
| `isArchived` | `Boolean` | `@default(false)` | Soft delete flag |
| `createdAt` | `DateTime` | `@default(now())` | |

**Relations:** `user → User`, `highlightAlbum → StoryHighlightAlbum`, `views → StoryView[]`, `stickerResponses → StoryStickerResponse[]`, `chainEntries → StoryChainEntry[]`

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])` — feed queries
- `@@index([expiresAt])` — expiry cleanup

### 5.2 StoryView (schema.prisma lines 1091-1101, table: `story_views`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `storyId` | `String` | — | Composite PK part 1 |
| `viewerId` | `String` | — | Composite PK part 2 |
| `createdAt` | `DateTime` | `@default(now())` | |

**PK:** `@@id([storyId, viewerId])` — ensures one view per user per story
**Relations:** `viewer → User (storyViews)`, `story → Story` (both Cascade on delete)
**Index:** `@@index([viewerId])`

### 5.3 StoryHighlightAlbum (schema.prisma lines 2224-2236, table: `story_highlight_albums`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `@default(cuid())` | PK |
| `userId` | `String` | — | FK to User (Cascade) |
| `title` | `String` | — | `@db.VarChar(50)` |
| `coverUrl` | `String?` | — | |
| `position` | `Int` | `@default(0)` | Order position |
| `createdAt` | `DateTime` | `@default(now())` | |

**Relations:** `user → User`, `stories → Story[]`
**Index:** `@@index([userId])`

### 5.4 StoryStickerResponse (schema.prisma lines 2238-2250, table: `story_sticker_responses`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `@default(cuid())` | PK |
| `storyId` | `String` | — | FK to Story (Cascade) |
| `userId` | `String` | — | FK to User (Cascade) |
| `stickerType` | `String` | — | e.g., 'poll', 'quiz', 'emoji', 'question' |
| `responseData` | `Json` | — | Arbitrary response payload |
| `createdAt` | `DateTime` | `@default(now())` | |

**Relations:** `story → Story`, `user → User`
**Index:** `@@index([storyId])`
**Note:** No unique constraint on `[storyId, userId, stickerType]` — deduplication is handled at application layer in `submitStickerResponse()`.

### 5.5 StoryChain (schema.prisma lines 2778-2792, table: `story_chains`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `@default(cuid())` | PK |
| `prompt` | `String` | — | `@db.VarChar(300)` |
| `coverUrl` | `String?` | — | |
| `createdById` | `String` | — | FK to User (Cascade) |
| `participantCount` | `Int` | `@default(0)` | |
| `viewsCount` | `Int` | `@default(0)` | |
| `createdAt` | `DateTime` | `@default(now())` | |

**Relations:** `createdBy → User (storyChains)`, `entries → StoryChainEntry[]`
**Indexes:** `@@index([participantCount(sort: Desc)])`, `@@index([createdById])`
**Note:** No service methods for StoryChain CRUD — schema exists but not wired.

### 5.6 StoryChainEntry (schema.prisma lines 2794-2808, table: `story_chain_entries`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `@default(cuid())` | PK |
| `chainId` | `String` | — | FK to StoryChain (Cascade) |
| `storyId` | `String` | — | FK to Story (Cascade) |
| `userId` | `String` | — | FK to User (Cascade) |
| `createdAt` | `DateTime` | `@default(now())` | |

**Unique:** `@@unique([chainId, userId])` — one entry per user per chain
**Indexes:** `@@index([chainId])`, `@@index([storyId])`
**Note:** No service methods wired — the "Add Yours" sticker on mobile uses `StoryStickerResponse` instead.

---

## 6. Cross-Module Dependencies

| Dependency | Direction | Usage |
|------------|-----------|-------|
| `AiModule` → `AiService` | Import | `moderateImage()` for post-create image moderation |
| `QueueService` (global) | Inject | `addGamificationJob()` for XP award on story creation |
| `PrismaService` (global) | Inject | All database operations |
| `sanitizeText` | Import (util) | Used in `replyToStory()` to strip HTML/control chars from reply content |

### Models from other domains touched by StoriesService:
- **Follow** — used in `getFeedStories()` and `getById()` (private account check)
- **Block** — used in `getFeedStories()` and `replyToStory()`
- **Mute** — used in `getFeedStories()`
- **Restrict** — used in `getFeedStories()`
- **User** — used in `getById()` (isPrivate check), `getViewers()`, `getStickerResponses()`
- **Conversation + ConversationMember** — used in `replyToStory()` (find/create DM)
- **Message** — used in `replyToStory()` (create STORY_REPLY message)

---

## 7. Notifications / Queue Jobs

| Job Type | Trigger | Payload | Queue |
|----------|---------|---------|-------|
| `award-xp` | Story creation (line 197) | `{ type: 'award-xp', userId, action: 'story_created' }` | `analyticsQueue` via `QueueService.addGamificationJob()` |

**No other notifications are sent.** Notably:
- No push notification when someone views your story
- No push notification when someone replies to your story
- No push notification for sticker responses
- The gamification job is fire-and-forget (`.catch()` swallows errors)

---

## 8. Key Logic Details

### 8.1 24-Hour Expiry
- **Set on create** (line 184): `expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)`
- **Enforced on feed** (line 94): `expiresAt: { gt: new Date() }`
- **Enforced on getById** (line 230): `if (story.expiresAt < new Date()) throw NotFoundException`
- **Enforced on markViewed** (line 287): `if (story.expiresAt < new Date()) throw BadRequestException`
- **No cron job** for cleanup — expired stories remain in DB, filtered at query time

### 8.2 Highlight Flow
1. Create highlight album (`createHighlight`) — auto-positions at end
2. Add story to highlight (`addStoryToHighlight`) — sets `isHighlight=true`, `highlightAlbumId`, **auto-archives** (`isArchived=true`)
3. Get highlights (`getHighlights`) — returns albums with latest archived story as cover preview
4. Update highlight (`updateHighlight`) — change title/cover
5. Delete highlight (`deleteHighlight`) — hard deletes album, stories remain (FK is SetNull)

### 8.3 Sticker Responses
- **Upsert pattern** (line 522-527): `findFirst` then update or create — one response per user per stickerType per story
- **No unique DB constraint** — dedup is application-level only (race condition possible)
- **Response format:** `{ stickerType: string, responseData: Json }` — completely flexible
- **Summary aggregation** (line 546-552): Groups by stickerType, counts `answer` or `option` field from responseData
- **Emoji reactions** use raw SQL (line 437-445): Queries `response_data->>'emoji'` with GROUP BY
- **Owner-only access** for responses and summaries

### 8.4 Close Friends Filtering
- Stories with `closeFriendsOnly=true` are **hidden from non-owners** in the feed (line 107)
- **TODO marker** (line 107): `// TODO: check circle membership when circles are integrated`
- Currently acts as a complete block — no circle/close-friends membership check exists
- Own close-friends stories always visible (line 106: `if (story.userId === userId) return true`)

### 8.5 Subscribers-Only Filtering
- Stories with `subscribersOnly=true` are **hidden from non-owners** in the feed (line 108)
- **TODO marker** (line 108): `// TODO: check subscription when subscriptions are integrated`
- Same pattern as close friends — currently complete block

### 8.6 Private Account Checks
- In `getById()` (lines 233-244): Fetches author's `isPrivate` flag
- If private: requires viewer to be authenticated AND have a Follow record
- Unauthenticated viewers get `ForbiddenException('This account is private')`
- Non-followers get `ForbiddenException('This account is private')`
- **Not enforced in feed** — feed already filters to followed users, so private accounts are implicitly covered

### 8.7 View Counting with P2002 Handling
- **markViewed()** (lines 284-313):
  1. Pre-check: `storyView.findUnique` for existing view
  2. If not found: `$transaction` to create view + increment counter
  3. **P2002 catch** (line 305): If concurrent request creates the view between check and insert, catches the unique constraint violation and returns success
  4. **Idempotent:** Multiple calls for same user+story always return `{ viewed: true }`
- **getById() also records views** (lines 249-253): Separate non-blocking upsert (no counter increment) — creates view record but does NOT increment `viewsCount`. This means `viewsCount` only increments via explicit `markViewed()` calls.

### 8.8 Image Moderation
- **Async, non-blocking** — fires after story is created and returned to client
- **BLOCK classification:** Hard deletes story (user sees it briefly, then it vanishes)
- **WARNING classification:** Marks story `isSensitive=true` (story remains visible)
- **Error handling:** Logs error, story stays as-is (fail-open on moderation errors)
- Only runs for `mediaType` starting with `'image'` — video stories are NOT moderated

### 8.9 Soft Delete Pattern
- `delete()` sets `isArchived=true` (soft delete)
- `unarchive()` sets `isArchived=false`
- Feed filters out `isArchived: false`
- `getById()` throws NotFoundException for archived stories (non-owners)
- Owner can access archived via `getArchived()`
- Adding to highlight auto-archives

### 8.10 Reply Creates DM
- `replyToStory()` finds or creates a 1:1 DM conversation
- Message type: `MessageType.STORY_REPLY`
- Content is sanitized (HTML stripped, control chars removed)
- Does NOT increment `story.repliesCount` — this counter is never updated
- Does NOT send any real-time socket event or push notification

---

## 9. Test Files

| File | Tests | Focus |
|------|-------|-------|
| `stories.controller.spec.ts` (8,227 bytes) | Controller endpoint routing |
| `stories.service.spec.ts` (18,415 bytes) | Core service logic |
| `stories.service.auth.spec.ts` (4,432 bytes) | Auth/permission checks |
| `stories.service.concurrency.spec.ts` (4,901 bytes) | P2002 handling, concurrent views |
| `stories.service.edge.spec.ts` (6,943 bytes) | Edge cases |
| `stories.service.expiry.spec.ts` (14,333 bytes) | 24h expiry logic |
| `story-stickers.spec.ts` (15,359 bytes) | Sticker responses, summaries |
| `publish-fields.spec.ts` (10,427 bytes) | Publishing field validation |
| `giphy-service.spec.ts` (13,850 bytes) | GIPHY service tests |
| `create-sheet.spec.ts` (5,955 bytes) | Create sheet component tests |

---

## 10. Known Gaps / TODOs

1. **Close friends not enforced** — `closeFriendsOnly` stories are hidden from everyone except owner (no circle membership check)
2. **Subscribers-only not enforced** — `subscribersOnly` stories hidden from everyone except owner
3. **`repliesCount` never incremented** — `replyToStory()` creates a DM message but never updates the story's `repliesCount`
4. **No reply notification** — story owner gets no notification of replies (only a DM message appears)
5. **No view notification** — story owner gets no notification of views
6. **No sticker response notification** — story owner gets no notification of new sticker responses
7. **Video stories not moderated** — only image moderation runs on create
8. **StoryChain/StoryChainEntry models exist** but have no service methods — "Add Yours" uses StoryStickerResponse instead
9. **`fontFamily`, `filter`, `bgGradient` in DTO** but not consumed by service create method
10. **`subscribersOnly` accepted by service** but not in CreateStoryDto — cannot be set by clients
11. **No expiry cleanup cron** — expired stories remain in DB, filtered at query time
12. **`blurhash`, `musicId` fields on Story model** are never populated by service
13. **StoryStickerResponse has no unique constraint** on `[storyId, userId, stickerType]` — dedup is application-level with race condition
14. **`getById()` returns full Prisma story** (no STORY_SELECT) while other methods use STORY_SELECT — inconsistent response shape
15. **Feed limited to 100 stories, 50 follows** — hard limits may miss content for users following many accounts
