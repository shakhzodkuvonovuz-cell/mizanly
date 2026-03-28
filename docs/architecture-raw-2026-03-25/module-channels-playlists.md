# Modules: Channels, Playlists, Channel-Posts, Clips

> Extracted 2026-03-25 by architecture agent. Covers the Minbar (YouTube-equivalent) space backend modules.

---

## 1. CHANNELS MODULE

### 1.1 Module Definition

**File:** `apps/api/src/modules/channels/channels.module.ts` (13 lines)

```
imports: [NotificationsModule, ModerationModule]
controllers: [ChannelsController]
providers: [ChannelsService]
exports: [ChannelsService]
```

**Cross-module dependencies:**
- `NotificationsModule` — used for subscriber notifications (FOLLOW type reused)
- `ModerationModule` — `ContentSafetyService` for pre-save text moderation on channel creation

**Injected providers (via PrismaModule global + Redis global):**
- `PrismaService` — database access
- `Redis` (ioredis, injected via `@Inject('REDIS')`) — cacheAside for recommended channels
- `NotificationsService` — subscriber notification
- `QueueService` — gamification XP job
- `ContentSafetyService` — text moderation

---

### 1.2 DTOs

#### CreateChannelDto
**File:** `apps/api/src/modules/channels/dto/create-channel.dto.ts` (21 lines)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `handle` | `string` | `@IsString()`, `@MaxLength(50)`, `@Matches(/^[a-zA-Z0-9_]+$/)` | YES |
| `name` | `string` | `@IsString()`, `@MaxLength(50)` | YES |
| `description` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(5000)` | NO |

#### UpdateChannelDto
**File:** `apps/api/src/modules/channels/dto/update-channel.dto.ts` (26 lines)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `name` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(50)` | NO |
| `description` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(5000)` | NO |
| `avatarUrl` | `string` | `@IsOptional()`, `@IsUrl()` | NO |
| `bannerUrl` | `string` | `@IsOptional()`, `@IsUrl()` | NO |

#### SetTrailerDto
**File:** `apps/api/src/modules/channels/dto/set-trailer.dto.ts` (8 lines)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `videoId` | `string` | `@IsString()` | YES |

---

### 1.3 Controller — Endpoints

**File:** `apps/api/src/modules/channels/channels.controller.ts` (173 lines)

**Base path:** `/api/v1/channels`
**Swagger tag:** `Channels (Minbar)`

| # | Method | Path | Auth | Rate Limit | DTO | Summary | Line |
|---|--------|------|------|-----------|-----|---------|------|
| 1 | `POST` | `/channels` | `ClerkAuthGuard` | 5/60s | `CreateChannelDto` | Create a channel | L28-38 |
| 2 | `GET` | `/channels/me/channels` | `ClerkAuthGuard` | global | — | Get current user channels | L41-47 |
| 3 | `GET` | `/channels/recommended` | `ClerkAuthGuard` | global | — (query: `?limit`) | Get recommended channels (excludes subscribed) | L49-59 |
| 4 | `GET` | `/channels/:handle` | `OptionalClerkAuthGuard` | global | — | Get channel by handle | L61-69 |
| 5 | `PATCH` | `/channels/:handle` | `ClerkAuthGuard` | global | `UpdateChannelDto` | Update channel details | L71-81 |
| 6 | `DELETE` | `/channels/:handle` | `ClerkAuthGuard` | global | — | Delete a channel | L83-92 |
| 7 | `POST` | `/channels/:handle/subscribe` | `ClerkAuthGuard` | 30/60s | — | Subscribe to a channel | L94-104 |
| 8 | `DELETE` | `/channels/:handle/subscribe` | `ClerkAuthGuard` | global | — | Unsubscribe from a channel | L106-115 |
| 9 | `GET` | `/channels/:handle/videos` | `OptionalClerkAuthGuard` | global | — (query: `?cursor`) | Get channel videos (paginated) | L117-126 |
| 10 | `GET` | `/channels/:handle/analytics` | `ClerkAuthGuard` | global | — | Get channel analytics (owner only) | L128-137 |
| 11 | `GET` | `/channels/:handle/subscribers` | `ClerkAuthGuard` | global | — (query: `?cursor`) | Get channel subscribers (owner only, paginated) | L139-149 |
| 12 | `PUT` | `/channels/:handle/trailer` | `ClerkAuthGuard` | global | `SetTrailerDto` | Set channel trailer video (owner only) | L151-161 |
| 13 | `DELETE` | `/channels/:handle/trailer` | `ClerkAuthGuard` | global | — | Remove channel trailer video (owner only) | L163-172 |

**Route ordering note:** Static routes (`me/channels`, `recommended`) are placed ABOVE the `:handle` wildcard parameter route to avoid NestJS capturing them as handle values.

---

### 1.4 Service — Methods

**File:** `apps/api/src/modules/channels/channels.service.ts` (524 lines)

**Constants defined at module level:**
- `CHANNEL_SELECT` (L21-44) — Standard select for channel queries. Includes `id, userId, handle, name, description, avatarUrl, bannerUrl, subscribersCount, videosCount, totalViews, isVerified, createdAt, trailerVideoId` + nested `user { id, username, displayName, avatarUrl, isVerified }`.
- `TRAILER_VIDEO_SELECT` (L46-53) — Select for trailer video: `id, title, thumbnailUrl, hlsUrl, videoUrl, duration`.

#### Method 1: `create(userId, dto)` — L67-113
- **Params:** `userId: string`, `dto: CreateChannelDto`
- **Returns:** Channel object with `isSubscribed: false`
- **Logic:**
  1. Check `userId` uniqueness in Channel model (each user can have at most 1 channel). Throws `ConflictException('User already has a channel')`.
  2. Check handle availability. Throws `ConflictException('Handle already taken')`.
  3. **Pre-save content moderation:** Concatenates `dto.name` + `dto.description`, calls `this.contentSafety.moderateText()`. If not safe, throws `BadRequestException` with flags.
  4. Creates channel via `prisma.channel.create()` with `sanitizeText()` on name and description.
  5. Queues gamification XP job: `{ type: 'award-xp', userId, action: 'channel_created' }` (fire-and-forget with `.catch()`).
- **Prisma ops:** `channel.findUnique` (x2), `channel.create`
- **Side effects:** `queueService.addGamificationJob()`

#### Method 2: `getByHandle(handle, userId?)` — L115-147
- **Params:** `handle: string`, `userId?: string`
- **Returns:** Channel + `trailerVideo` (nullable) + `isSubscribed` boolean
- **Logic:**
  1. Find channel by handle. Throws `NotFoundException`.
  2. If `userId` provided, check subscription status via `subscription.findUnique` on composite key `userId_channelId`.
  3. If `trailerVideoId` exists, manually fetch the video (no Prisma relation to avoid ambiguity).
- **Prisma ops:** `channel.findUnique`, `subscription.findUnique` (conditional), `video.findUnique` (conditional)

#### Method 3: `update(handle, userId, dto)` — L149-169
- **Params:** `handle: string`, `userId: string`, `dto: UpdateChannelDto`
- **Returns:** Updated channel with `isSubscribed: false`
- **Logic:**
  1. Find channel, verify ownership (`userId` match). Throws `NotFoundException` / `ForbiddenException`.
  2. Update with `sanitizeText()` on name/description, direct pass-through for `avatarUrl`/`bannerUrl`.
- **Prisma ops:** `channel.findUnique`, `channel.update`

#### Method 4: `delete(handle, userId)` — L171-184
- **Params:** `handle: string`, `userId: string`
- **Returns:** `{ deleted: true }`
- **Logic:** Find channel, verify ownership, **hard delete** (no soft-delete field on Channel model).
- **Prisma ops:** `channel.findUnique`, `channel.delete`

#### Method 5: `subscribe(handle, userId)` — L186-221
- **Params:** `handle: string`, `userId: string`
- **Returns:** `{ subscribed: true }`
- **Logic:**
  1. Find channel. Throws `NotFoundException`.
  2. Prevents self-subscription. Throws `BadRequestException('Cannot subscribe to your own channel')`.
  3. Check for existing subscription. Throws `ConflictException('Already subscribed')`.
  4. **Transaction:** Create `Subscription` row + raw SQL `UPDATE "Channel" SET "subscribersCount" = GREATEST(0, "subscribersCount" + 1)`.
  5. Creates notification for channel owner: `{ type: 'FOLLOW', userId: channel.userId, actorId: userId }` (fire-and-forget).
- **Prisma ops:** `channel.findUnique`, `subscription.findUnique`, `$transaction([ subscription.create, $executeRaw ])`
- **Side effects:** `notifications.create()` (FOLLOW type reused for subscriptions)

#### Method 6: `unsubscribe(handle, userId)` — L223-246
- **Params:** `handle: string`, `userId: string`
- **Returns:** `{ subscribed: false }`
- **Logic:**
  1. Find channel. Throws `NotFoundException`.
  2. Find existing subscription. Throws `NotFoundException('Not subscribed')`.
  3. **Transaction:** Delete subscription + decrement `subscribersCount` with `GREATEST(0, ...)`.
- **Prisma ops:** `channel.findUnique`, `subscription.findUnique`, `$transaction([ subscription.delete, $executeRaw ])`

#### Method 7: `getVideos(handle, userId?, cursor?, limit=20)` — L248-351
- **Params:** `handle: string`, `userId?: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `{ data: Video[], meta: { cursor, hasMore } }`
- **Logic:**
  1. Find channel by handle.
  2. If `userId`: fetch blocks + mutes (up to 50 each) to build `excludedIds` for content filtering.
  3. Query `video.findMany` where `channelId` = channel.id, `status` = `PUBLISHED`, user not in excluded IDs. Cursor-based keyset pagination. Order by `publishedAt desc`.
  4. If `userId` and results exist: batch-fetch `videoReaction` (likes/dislikes) and `videoBookmark` for the user across returned video IDs.
  5. Enhance each video with `isLiked`, `isDisliked`, `isBookmarked` flags.
- **Prisma ops:** `channel.findUnique`, `block.findMany`, `mute.findMany`, `video.findMany`, `videoReaction.findMany`, `videoBookmark.findMany`
- **Select fields on video:** `id, title, description, videoUrl, thumbnailUrl, duration, viewsCount, likesCount, dislikesCount, commentsCount, category, tags, publishedAt` + nested `user` + nested `channel`

#### Method 8: `getMyChannels(userId)` — L353-362
- **Params:** `userId: string`
- **Returns:** Array of channels with `isSubscribed: false`
- **Logic:** Find all channels by `userId` (max 50). Maps with `isSubscribed: false`.
- **Prisma ops:** `channel.findMany`

#### Method 9: `getAnalytics(handle, userId)` — L364-404
- **Params:** `handle: string`, `userId: string`
- **Returns:** `{ subscribersCount, videosCount, totalViews, recentSubs, averageViewsPerVideo, topVideos }`
- **Logic:**
  1. Find channel, verify ownership.
  2. Parallel queries: count subscriptions in last 7 days + top 5 videos by views.
  3. Compute `averageViewsPerVideo`.
- **Prisma ops:** `channel.findUnique`, `subscription.count`, `video.findMany`

#### Method 10: `getSubscribers(handle, userId, cursor?, limit=20)` — L406-444
- **Params:** `handle: string`, `userId: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `{ data: [{ user, subscribedAt }], meta: { cursor, hasMore } }`
- **Logic:**
  1. Find channel, verify ownership.
  2. Paginated query on `subscription` with composite cursor `userId_channelId`. Order by `createdAt desc`.
  3. Maps output to `{ user, subscribedAt: createdAt }`.
- **Prisma ops:** `channel.findUnique`, `subscription.findMany`
- **Cursor strategy:** Composite cursor `{ userId, channelId }` on the Subscription table.

#### Method 11: `getRecommended(userId, limit=10)` — L446-449
- **Params:** `userId: string`, `limit: number = 10`
- **Returns:** Array of channels with `isSubscribed: false`
- **Logic:** Uses `cacheAside()` with Redis key `recommended:channels:${userId}:${limit}`, TTL 600 seconds (10 minutes). Delegates to `fetchRecommendedChannels()`.

#### Method 12 (private): `fetchRecommendedChannels(userId, limit)` — L451-483
- **Params:** `userId: string`, `limit: number`
- **Returns:** Array of channels ordered by popularity
- **Logic:**
  1. Raw SQL query: select channel IDs where `userId != current user` AND no existing subscription. Order by `subscribersCount DESC, totalViews DESC`.
  2. If no results, return empty array.
  3. Fetch full channel data via `channel.findMany` with `{ id: { in: ids } }`.
  4. Preserve raw SQL order using a Map + reorder.
- **Prisma ops:** `$queryRaw`, `channel.findMany`

#### Method 13: `setTrailer(handle, userId, videoId)` — L485-508
- **Params:** `handle: string`, `userId: string`, `videoId: string`
- **Returns:** `{ trailerVideoId: string }`
- **Logic:**
  1. Find channel, verify ownership.
  2. Find video, verify it belongs to this channel (`video.channelId === channel.id`).
  3. Update channel's `trailerVideoId`.
- **Prisma ops:** `channel.findUnique`, `video.findUnique`, `channel.update`

#### Method 14: `removeTrailer(handle, userId)` — L510-523
- **Params:** `handle: string`, `userId: string`
- **Returns:** `{ trailerVideoId: null }`
- **Logic:** Find channel, verify ownership, set `trailerVideoId` to null.
- **Prisma ops:** `channel.findUnique`, `channel.update`

---

### 1.5 Prisma Models Used

- `Channel` — core model (fields: id, userId, handle, name, description, avatarUrl, bannerUrl, subscribersCount, videosCount, totalViews, isVerified, createdAt, trailerVideoId)
- `Subscription` — composite PK: `userId_channelId`
- `Video` — queried for channel videos + trailer
- `VideoReaction` — for like/dislike status
- `VideoBookmark` — for bookmark status
- `Block` — content filtering
- `Mute` — content filtering
- `User` — nested select in most responses

---

### 1.6 Test Files

- `channels.controller.spec.ts`
- `channels.service.spec.ts`
- `channels.service.edge.spec.ts`
- `channels.service.concurrency.spec.ts`
- `channels.service.auth.spec.ts`

---

## 2. PLAYLISTS MODULE

### 2.1 Module Definition

**File:** `apps/api/src/modules/playlists/playlists.module.ts` (10 lines)

```
imports: [] (none)
controllers: [PlaylistsController]
providers: [PlaylistsService]
exports: [PlaylistsService]
```

**Cross-module dependencies:** None (only PrismaService via global module).

---

### 2.2 DTOs

#### CreatePlaylistDto
**File:** `apps/api/src/modules/playlists/dto/create-playlist.dto.ts` (26 lines)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `channelId` | `string` | `@IsString()`, `@IsNotEmpty()` | YES |
| `title` | `string` | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(200)` | YES |
| `description` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(1000)` | NO |
| `isPublic` | `boolean` | `@IsOptional()`, `@IsBoolean()` (default true) | NO |

#### UpdatePlaylistDto
**File:** `apps/api/src/modules/playlists/dto/update-playlist.dto.ts` (21 lines)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `title` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(200)` | NO |
| `description` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(1000)` | NO |
| `isPublic` | `boolean` | `@IsOptional()`, `@IsBoolean()` | NO |

#### AddCollaboratorDto
**File:** `apps/api/src/modules/playlists/dto/collaborator.dto.ts` (L1-6)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `userId` | `string` | `@IsString()` | YES |
| `role` | `string` | `@IsOptional()`, `@IsIn(['editor', 'viewer'])` | NO (default 'editor') |

#### UpdateCollaboratorDto
**File:** `apps/api/src/modules/playlists/dto/collaborator.dto.ts` (L8-10)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `role` | `string` | `@IsIn(['editor', 'viewer'])` | YES |

---

### 2.3 Controller — Endpoints

**File:** `apps/api/src/modules/playlists/playlists.controller.ts` (163 lines)

**Base path:** `/api/v1/playlists`
**Swagger tag:** `Playlists (Minbar)`

| # | Method | Path | Auth | Rate Limit | DTO | Summary | Line |
|---|--------|------|------|-----------|-----|---------|------|
| 1 | `POST` | `/playlists` | `ClerkAuthGuard` | 5/60s | `CreatePlaylistDto` | Create a playlist | L20-30 |
| 2 | `GET` | `/playlists/channel/:channelId` | `OptionalClerkAuthGuard` | global | — (query: `?cursor`) | Get playlists by channel | L33-41 |
| 3 | `GET` | `/playlists/:id/items` | `OptionalClerkAuthGuard` | global | — (query: `?cursor`) | Get playlist items (cursor paginated) | L44-52 |
| 4 | `GET` | `/playlists/:id/collaborators` | `OptionalClerkAuthGuard` | global | — | List collaborators of a playlist | L54-59 |
| 5 | `POST` | `/playlists/:id/items/:videoId` | `ClerkAuthGuard` | global | — | Add a video to a playlist | L61-71 |
| 6 | `DELETE` | `/playlists/:id/items/:videoId` | `ClerkAuthGuard` | global | — | Remove a video from a playlist | L73-83 |
| 7 | `POST` | `/playlists/:id/collaborative` | `ClerkAuthGuard` | global | — | Toggle collaborative mode on a playlist | L85-94 |
| 8 | `POST` | `/playlists/:id/collaborators` | `ClerkAuthGuard` | global | `AddCollaboratorDto` | Add a collaborator to a playlist | L96-106 |
| 9 | `DELETE` | `/playlists/:id/collaborators/:userId` | `ClerkAuthGuard` | global | — | Remove a collaborator from a playlist | L108-118 |
| 10 | `PATCH` | `/playlists/:id/collaborators/:userId` | `ClerkAuthGuard` | global | `UpdateCollaboratorDto` | Update collaborator role | L120-131 |
| 11 | `GET` | `/playlists/:id` | `OptionalClerkAuthGuard` | global | — | Get playlist by ID | L134-139 |
| 12 | `PATCH` | `/playlists/:id` | `ClerkAuthGuard` | global | `UpdatePlaylistDto` | Update playlist details | L141-151 |
| 13 | `DELETE` | `/playlists/:id` | `ClerkAuthGuard` | global | — | Delete a playlist | L153-162 |

**Route ordering note:** Compound sub-routes (`:id/items`, `:id/collaborators`, `channel/:channelId`) are placed before simple `:id` routes.

---

### 2.4 Service — Methods

**File:** `apps/api/src/modules/playlists/playlists.service.ts` (481 lines)

**TypeScript interfaces defined:**
- `PlaylistItemResponse` (L8-26) — shape for items with nested video + channel
- `PlaylistResponse` (L28-38) — shape for playlist metadata
- `PaginatedResponse<T>` (L40-43) — generic paginated response `{ data: T[], meta: { cursor, hasMore } }`

#### Method 1: `create(userId, dto)` — L49-75
- **Params:** `userId: string`, `dto: CreatePlaylistDto`
- **Returns:** Playlist object
- **Logic:**
  1. Find channel by `dto.channelId`. Throws `NotFoundException`.
  2. Verify channel ownership (`channel.userId === userId`). Throws `ForbiddenException('Not your channel')`.
  3. Create playlist with `isPublic` defaulting to `true`.
- **Prisma ops:** `channel.findUnique`, `playlist.create`

#### Method 2: `getById(id)` — L77-102
- **Params:** `id: string`
- **Returns:** Playlist + nested `channel { id, handle, name, userId }`
- **Logic:** Find by ID, throw `NotFoundException`.
- **Prisma ops:** `playlist.findUnique`

#### Method 3: `getByChannel(channelId, cursor?, limit=20)` — L104-129
- **Params:** `channelId: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `PaginatedResponse<PlaylistResponse>`
- **Logic:** Paginated query on `playlist` where `channelId` and `isPublic: true`. Cursor-based with `{ cursor: { id }, skip: 1 }`. Order by `createdAt desc`.
- **Prisma ops:** `playlist.findMany`

#### Method 4: `getItems(playlistId, cursor?, limit=20)` — L131-173
- **Params:** `playlistId: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `PaginatedResponse<PlaylistItemResponse>`
- **Logic:**
  1. Verify playlist exists.
  2. Query `playlistItem.findMany` with nested video + channel. Order by `position asc`.
- **Prisma ops:** `playlist.findUnique`, `playlistItem.findMany`

#### Method 5: `update(id, userId, dto)` — L175-198
- **Params:** `id: string`, `userId: string`, `dto: UpdatePlaylistDto`
- **Returns:** Updated playlist
- **Logic:** Find playlist with channel (to check ownership). Verify `channel.userId === userId`. Update with raw `dto` passed to `data`.
- **Prisma ops:** `playlist.findUnique (include channel)`, `playlist.update`

#### Method 6: `delete(id, userId)` — L200-210
- **Params:** `id: string`, `userId: string`
- **Returns:** `{ deleted: true }`
- **Logic:** Find playlist with channel, verify ownership, hard delete.
- **Prisma ops:** `playlist.findUnique (include channel)`, `playlist.delete`

#### Method 7 (private): `requireOwnerOrEditor(playlistId, userId)` — L212-235
- **Params:** `playlistId: string`, `userId: string`
- **Returns:** Playlist object (with channel userId)
- **Logic:**
  1. Find playlist with channel.
  2. If not owner, check `playlistCollaborator` for `role === 'editor'`.
  3. Throws `ForbiddenException('Not authorized to modify this playlist')` if neither.
- **Prisma ops:** `playlist.findUnique (include channel)`, `playlistCollaborator.findUnique` (conditional)
- **Used by:** `addItem`, `removeItem`

#### Method 8: `addItem(playlistId, videoId, userId)` — L237-318
- **Params:** `playlistId: string`, `videoId: string`, `userId: string`
- **Returns:** Created PlaylistItem with nested video + channel
- **Logic:**
  1. Call `requireOwnerOrEditor()` for authorization.
  2. Get max position via `playlistItem.aggregate({ _max: { position: true } })`.
  3. **Transaction:** Create `playlistItem` at `maxPosition + 1` + increment `playlist.videosCount`.
  4. **Idempotent:** Catches Prisma `P2002` (unique constraint violation on `playlistId_videoId`), returns existing item instead.
- **Prisma ops:** `playlistItem.aggregate`, `$transaction([ playlistItem.create, playlist.update ])`, `playlistItem.findUnique` (on P2002)

#### Method 9: `removeItem(playlistId, videoId, userId)` — L320-341
- **Params:** `playlistId: string`, `videoId: string`, `userId: string`
- **Returns:** `{ removed: true }`
- **Logic:**
  1. Call `requireOwnerOrEditor()`.
  2. Verify item exists before deleting (avoids decrementing count for nonexistent items).
  3. **Transaction:** Delete `playlistItem` + decrement `playlist.videosCount`.
- **Prisma ops:** `playlistItem.findUnique`, `$transaction([ playlistItem.delete, playlist.update ])`

#### Method 10: `toggleCollaborative(playlistId, userId)` — L343-366
- **Params:** `playlistId: string`, `userId: string`
- **Returns:** `{ id, isCollaborative }`
- **Logic:**
  1. Find playlist with channel, verify ownership.
  2. Toggle `isCollaborative` boolean.
  3. If disabling collaborative mode, delete all collaborators via `playlistCollaborator.deleteMany`.
- **Prisma ops:** `playlist.findUnique (include channel)`, `playlist.update`, `playlistCollaborator.deleteMany` (conditional)

#### Method 11: `addCollaborator(playlistId, userId, dto)` — L368-412
- **Params:** `playlistId: string`, `userId: string` (owner), `dto: AddCollaboratorDto`
- **Returns:** PlaylistCollaborator with nested user
- **Logic:**
  1. Find playlist with channel, verify ownership.
  2. Verify `isCollaborative` is true. Throws `BadRequestException('Playlist is not collaborative')`.
  3. Prevent adding self. Throws `BadRequestException('Cannot add yourself as collaborator')`.
  4. Verify target user exists.
  5. Create collaborator with `role` defaulting to `'editor'`, `addedById` = current user.
  6. **Idempotent:** Catches `P2002`, returns existing collaborator.
- **Prisma ops:** `playlist.findUnique (include channel)`, `user.findUnique`, `playlistCollaborator.create`, `playlistCollaborator.findUnique` (on P2002)

#### Method 12: `removeCollaborator(playlistId, userId, collaboratorUserId)` — L414-436
- **Params:** `playlistId: string`, `userId: string` (current user), `collaboratorUserId: string`
- **Returns:** `{ removed: true }`
- **Logic:**
  1. Find playlist with channel.
  2. Check if current user is owner OR is removing themselves (self-removal allowed).
  3. Delete collaborator. Catches `P2025` (not found) and throws `NotFoundException`.
- **Prisma ops:** `playlist.findUnique (include channel)`, `playlistCollaborator.delete`

#### Method 13: `getCollaborators(playlistId)` — L438-456
- **Params:** `playlistId: string`
- **Returns:** `{ data: PlaylistCollaborator[] }` with nested users
- **Logic:** Verify playlist exists, then query all collaborators (max 50), ordered by `addedAt asc`.
- **Prisma ops:** `playlist.findUnique`, `playlistCollaborator.findMany`

#### Method 14: `updateCollaboratorRole(playlistId, userId, collaboratorUserId, role)` — L458-480
- **Params:** `playlistId: string`, `userId: string`, `collaboratorUserId: string`, `role: string`
- **Returns:** Updated collaborator with nested user
- **Logic:**
  1. Find playlist with channel, verify ownership.
  2. Find collaborator. Throws `NotFoundException`.
  3. Update role.
- **Prisma ops:** `playlist.findUnique (include channel)`, `playlistCollaborator.findUnique`, `playlistCollaborator.update`

---

### 2.5 Prisma Models Used

- `Playlist` — core model (fields: id, channelId, title, description, thumbnailUrl, isPublic, isCollaborative, videosCount, createdAt, updatedAt)
- `PlaylistItem` — join table with `playlistId + videoId` composite unique, `position` field
- `PlaylistCollaborator` — join table with `playlistId + userId` composite unique, `role`, `addedById`, `addedAt`
- `Channel` — ownership verification
- `Video` — nested in playlist items
- `User` — nested in collaborators

---

### 2.6 Test Files

- `playlists.controller.spec.ts`
- `playlists.service.spec.ts`
- `playlists.service.edge.spec.ts`
- `playlists.service.auth.spec.ts`

---

## 3. CHANNEL-POSTS MODULE

### 3.1 Module Definition

**File:** `apps/api/src/modules/channel-posts/channel-posts.module.ts` (10 lines)

```
imports: [] (none)
controllers: [ChannelPostsController]
providers: [ChannelPostsService]
exports: [ChannelPostsService]
```

**Cross-module dependencies:** None (only PrismaService via global module).

---

### 3.2 DTOs

#### CreateChannelPostDto
**File:** `apps/api/src/modules/channel-posts/dto/create-channel-post.dto.ts` (14 lines)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `content` | `string` | `@IsString()`, `@MaxLength(5000)` | YES |
| `mediaUrls` | `string[]` | `@IsArray()`, `@IsString({ each: true })`, `@IsOptional()` | NO |

---

### 3.3 Controller — Endpoints

**File:** `apps/api/src/modules/channel-posts/channel-posts.controller.ts` (81 lines)

**Base path:** `/api/v1/channel-posts`
**Swagger tag:** `Channel Community Posts`
**Controller-level rate limit:** 30/60s (all endpoints)

| # | Method | Path | Auth | Rate Limit | DTO | Summary | Line |
|---|--------|------|------|-----------|-----|---------|------|
| 1 | `POST` | `/channel-posts/:channelId` | `ClerkAuthGuard` | 30/60s | `CreateChannelPostDto` | Create community post | L16-22 |
| 2 | `GET` | `/channel-posts/channel/:channelId` | `OptionalClerkAuthGuard` | 30/60s | — (query: `?cursor`) | Get channel community feed | L24-29 |
| 3 | `GET` | `/channel-posts/:id` | `OptionalClerkAuthGuard` | 30/60s | — | Get community post | L31-36 |
| 4 | `DELETE` | `/channel-posts/:id` | `ClerkAuthGuard` | 30/60s | — | Delete community post | L38-45 |
| 5 | `PATCH` | `/channel-posts/:id/pin` | `ClerkAuthGuard` | 30/60s | — | Pin post | L47-53 |
| 6 | `DELETE` | `/channel-posts/:id/pin` | `ClerkAuthGuard` | 30/60s | — | Unpin post | L55-62 |
| 7 | `POST` | `/channel-posts/:id/like` | `ClerkAuthGuard` | 30/60s | — | Like post | L64-70 |
| 8 | `DELETE` | `/channel-posts/:id/like` | `ClerkAuthGuard` | 30/60s | — | Unlike post | L72-80 |

**HttpCode decorators:** DELETE endpoints explicitly set `HttpStatus.OK` (200) instead of default 204.

---

### 3.4 Service — Methods

**File:** `apps/api/src/modules/channel-posts/channel-posts.service.ts` (95 lines)

#### Method 1: `create(channelId, userId, data)` — L9-17
- **Params:** `channelId: string`, `userId: string`, `data: { content: string; mediaUrls?: string[] }`
- **Returns:** ChannelPost with nested user
- **Logic:**
  1. Find channel. Throws `NotFoundException`.
  2. Verify ownership (`channel.userId !== userId`). Throws `ForbiddenException('Only channel owner can post')`.
  3. Create post with content and mediaUrls (default `[]`).
- **Prisma ops:** `channel.findUnique`, `channelPost.create (include user)`

#### Method 2: `getFeed(channelId, cursor?, limit=20)` — L19-29
- **Params:** `channelId: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `{ data: ChannelPost[], meta: { cursor, hasMore } }`
- **Logic:** Paginated query using `id < cursor` pattern (NOT Prisma cursor API). Order by `createdAt desc`. Includes user.
- **Prisma ops:** `channelPost.findMany (include user)`
- **Pagination note:** Uses `{ id: { lt: cursor } }` instead of Prisma's `cursor` + `skip` pattern used elsewhere.

#### Method 3: `getById(postId)` — L31-38
- **Params:** `postId: string`
- **Returns:** ChannelPost with user + channel
- **Logic:** Find by ID, throw `NotFoundException('Community post not found')`. Includes channel `{ id, handle, name }`.
- **Prisma ops:** `channelPost.findUnique (include user, channel)`

#### Method 4: `delete(postId, userId)` — L40-45
- **Params:** `postId: string`, `userId: string`
- **Returns:** `{ deleted: true }`
- **Logic:** Calls `getById()` to verify existence, checks `post.userId === userId`, hard delete.
- **Prisma ops:** `channelPost.findUnique` (via getById), `channelPost.delete`

#### Method 5: `pin(postId, userId)` — L47-55
- **Params:** `postId: string`, `userId: string`
- **Returns:** Updated ChannelPost
- **Logic:**
  1. Get post via `getById()`.
  2. If `post.userId !== userId`, check channel ownership (allows both author and channel owner to pin).
  3. Set `isPinned: true`.
- **Prisma ops:** `channelPost.findUnique` (via getById), `channel.findUnique` (conditional), `channelPost.update`

#### Method 6: `unpin(postId, userId)` — L57-65
- **Params:** `postId: string`, `userId: string`
- **Returns:** Updated ChannelPost
- **Logic:** Same auth as `pin()` but sets `isPinned: false`.
- **Prisma ops:** Same as `pin()`

#### Method 7: `like(postId, userId)` — L72-82
- **Params:** `postId: string`, `userId: string`
- **Returns:** `{ liked: true }`
- **Logic:**
  1. Verify post exists.
  2. Verify user exists.
  3. Raw SQL: `UPDATE "channel_posts" SET "likesCount" = "likesCount" + 1 WHERE id = ${postId}`.
- **Prisma ops:** `channelPost.findUnique`, `user.findUnique`, `$executeRaw`
- **KNOWN ISSUE (documented in code, L67-70):** No per-user reaction junction table (ChannelPostReaction). Likes cannot be deduplicated. A schema migration is needed.

#### Method 8: `unlike(postId, userId)` — L84-94
- **Params:** `postId: string`, `userId: string`
- **Returns:** `{ unliked: true }`
- **Logic:** Same as `like()` but decrements with `GREATEST("likesCount" - 1, 0)`.
- **Prisma ops:** Same as `like()`
- **KNOWN ISSUE:** Same dedup issue as `like()`.

---

### 3.5 Prisma Models Used

- `ChannelPost` — core model (fields: id, channelId, userId, content, mediaUrls, likesCount, isPinned, createdAt)
  - **Table name:** `"channel_posts"` (used in raw SQL)
- `Channel` — ownership verification for create/pin/unpin
- `User` — nested in responses, verified in like/unlike

---

### 3.6 Test Files

- `channel-posts.controller.spec.ts`
- `channel-posts.service.spec.ts`

---

## 4. CLIPS MODULE

### 4.1 Module Definition

**File:** `apps/api/src/modules/clips/clips.module.ts` (10 lines)

```
imports: [] (none)
controllers: [ClipsController]
providers: [ClipsService]
exports: [ClipsService]
```

**Cross-module dependencies:** None (only PrismaService via global module).

---

### 4.2 DTOs

#### CreateClipDto
**File:** `apps/api/src/modules/clips/dto/create-clip.dto.ts` (7 lines)

| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `startTime` | `number` | `@IsNumber()`, `@Min(0)` | YES |
| `endTime` | `number` | `@IsNumber()`, `@Min(0.5)` | YES |
| `title` | `string` | `@IsOptional()`, `@IsString()`, `@MaxLength(100)` | NO |

---

### 4.3 Controller — Endpoints

**File:** `apps/api/src/modules/clips/clips.controller.ts` (74 lines)

**Base path:** `/api/v1/clips`
**Swagger tag:** `Clips (Minbar)`
**Controller-level rate limit:** 60/60s (all endpoints)

| # | Method | Path | Auth | Rate Limit | DTO | Summary | Line |
|---|--------|------|------|-----------|-----|---------|------|
| 1 | `POST` | `/clips/video/:videoId` | `ClerkAuthGuard` | 60/60s | `CreateClipDto` | Create a clip from a video | L25-35 |
| 2 | `GET` | `/clips/video/:videoId` | `OptionalClerkAuthGuard` | 60/60s | — (query: `?cursor`, `?limit`) | Get clips for a video | L37-46 |
| 3 | `GET` | `/clips/me` | `ClerkAuthGuard` | 60/60s | — (query: `?cursor`, `?limit`) | Get clips created by current user | L48-58 |
| 4 | `DELETE` | `/clips/:id` | `ClerkAuthGuard` | 60/60s | — | Delete a clip | L60-66 |
| 5 | `GET` | `/clips/:id/share` | `OptionalClerkAuthGuard` | 60/60s | — | Get share link for a clip | L68-73 |

---

### 4.4 Service — Methods

**File:** `apps/api/src/modules/clips/clips.service.ts` (99 lines)

#### Method 1: `create(userId, videoId, dto)` — L14-42
- **Params:** `userId: string`, `videoId: string`, `dto: CreateClipDto`
- **Returns:** VideoClip with nested user + sourceVideo + channel
- **Logic:**
  1. Find video. Throws `NotFoundException('Video not found')`.
  2. Verify `video.status === 'PUBLISHED'`. Throws `ForbiddenException('Video not available')`.
  3. Validate: `endTime > startTime`. Throws `BadRequestException`.
  4. Validate: clip duration max 60 seconds. Throws `BadRequestException`.
  5. Validate: if video has duration, `endTime <= video.duration`. Throws `BadRequestException`.
  6. Compute `duration = endTime - startTime`.
  7. Create `videoClip` with generated `clipUrl` (if `hlsUrl` exists): `${video.hlsUrl}?start=${startTime}&end=${endTime}`.
  8. Uses `video.thumbnailUrl` as clip thumbnail.
  9. Title defaults to `Clip from ${video.title}` if not provided.
- **Prisma ops:** `video.findUnique`, `videoClip.create (include user, sourceVideo.channel)`

#### Method 2: `getByVideo(videoId, cursor?, limit=20)` — L44-64
- **Params:** `videoId: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `{ data: VideoClip[], meta: { cursor, hasMore } }`
- **Logic:** Paginated query using `id < cursor`. Order by `createdAt desc`. Includes user.
- **Prisma ops:** `videoClip.findMany (include user)`
- **Pagination:** Uses `{ id: { lt: cursor } }` pattern (same as channel-posts).

#### Method 3: `getByUser(userId, cursor?, limit=20)` — L66-86
- **Params:** `userId: string`, `cursor?: string`, `limit: number = 20`
- **Returns:** `{ data: VideoClip[], meta: { cursor, hasMore } }`
- **Logic:** Paginated query on user's clips. Includes sourceVideo `{ id, title, thumbnailUrl, duration }`.
- **Prisma ops:** `videoClip.findMany (include sourceVideo)`
- **Pagination:** Same `{ id: { lt: cursor } }` pattern.

#### Method 4: `delete(clipId, userId)` — L88-92
- **Params:** `clipId: string`, `userId: string`
- **Returns:** Deleted VideoClip object
- **Logic:** Find clip with `findFirst({ where: { id, userId } })` — ensures ownership. Throws `NotFoundException`. Hard delete.
- **Prisma ops:** `videoClip.findFirst`, `videoClip.delete`
- **Note:** Returns the deleted record (Prisma `.delete()` returns the row). No `{ deleted: true }` wrapper.

#### Method 5: `getShareLink(clipId)` — L94-98
- **Params:** `clipId: string`
- **Returns:** `{ url: string }`
- **Logic:** Find clip, construct share URL: `https://mizanly.app/video/${clip.sourceVideoId}?t=${clip.startTime}`.
- **Prisma ops:** `videoClip.findUnique`
- **Note:** Uses hardcoded domain `mizanly.app`. Does not use `APP_URL` env var.

---

### 4.5 Prisma Models Used

- `VideoClip` — core model (fields: id, userId, sourceVideoId, title, startTime, endTime, duration, clipUrl, thumbnailUrl, createdAt)
- `Video` — source video (checked for existence, status, duration)
- `User` — nested in responses
- `Channel` — nested via sourceVideo in create response

---

### 4.6 Test Files

- `clips.controller.spec.ts`
- `clips.service.spec.ts`

---

## 5. CROSS-MODULE DEPENDENCY GRAPH

```
ChannelsModule
  ├── imports: NotificationsModule (→ NotificationsService for subscriber notifications)
  ├── imports: ModerationModule (→ ContentSafetyService for text moderation)
  ├── injects: PrismaService (global)
  ├── injects: Redis (global)
  ├── injects: QueueService (global) → gamification XP jobs
  └── exports: ChannelsService

PlaylistsModule
  ├── injects: PrismaService (global)
  └── exports: PlaylistsService

ChannelPostsModule
  ├── injects: PrismaService (global)
  └── exports: ChannelPostsService

ClipsModule
  ├── injects: PrismaService (global)
  └── exports: ClipsService
```

**Inter-module relationships:**
- Channels → Playlists: via `channelId` FK. A channel owns playlists.
- Channels → Videos: via `channelId` FK. Channel videos, trailer video.
- Channels → ChannelPosts: via `channelId` FK. Community posts on channel.
- Playlists → Videos: via `PlaylistItem` join table.
- Clips → Videos: via `sourceVideoId` FK. Clips are segments of videos.

**Notification types used:**
- `FOLLOW` — reused for channel subscription notifications (channels.service L213)

**Queue jobs dispatched:**
- `award-xp` with `action: 'channel_created'` — from channels.service on create (L107)

**Cache keys:**
- `recommended:channels:${userId}:${limit}` — Redis, TTL 600s (10 min) — channels.service L448

---

## 6. KNOWN ISSUES AND ARCHITECTURAL NOTES

1. **Channel-posts like dedup missing** (channel-posts.service.ts L67-70): No `ChannelPostReaction` junction table exists. Like/unlike operations increment/decrement a counter without checking if the user already liked. Users can like the same post multiple times.

2. **Clips share URL hardcoded** (clips.service.ts L97): Uses `https://mizanly.app` instead of `process.env.APP_URL`. Should be updated for environment portability.

3. **Channel-posts pagination inconsistency**: Uses `{ id: { lt: cursor } }` while channels.service uses Prisma's `{ cursor: { id }, skip: 1 }`. Both work but the codebase is inconsistent.

4. **Trailer video manual fetch** (channels.service.ts L130-144): No Prisma relation defined for `trailerVideoId → Video` to avoid schema ambiguity. Manual `video.findUnique` call instead.

5. **Clip URL generation** (clips.service.ts L34): Generated as `${hlsUrl}?start=N&end=N` which may not be a valid HLS segment URL. This appears to be a placeholder for actual clipping logic (likely needs Cloudflare Stream API or FFmpeg server-side processing).

6. **Delete return inconsistency**: Channels/ChannelPosts/Playlists return `{ deleted: true }`, but Clips returns the full deleted record object (Prisma's default `.delete()` behavior).

7. **One channel per user** (channels.service.ts L68-73): The `userId` field on Channel is unique. Each user can only have one channel. `getMyChannels()` still returns an array (for API consistency) but will always contain 0 or 1 items.

---

## 7. ENDPOINT COUNT SUMMARY

| Module | Endpoints | Auth-required | Public/Optional |
|--------|-----------|---------------|-----------------|
| Channels | 13 | 10 | 3 |
| Playlists | 13 | 9 | 4 |
| Channel-Posts | 8 | 6 | 2 |
| Clips | 5 | 3 | 2 |
| **Total** | **39** | **28** | **11** |
