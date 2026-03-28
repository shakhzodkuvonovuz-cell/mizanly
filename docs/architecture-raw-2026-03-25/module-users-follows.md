# Module Architecture: Users, Follows, Blocks, Mutes, Restricts

> Extracted 2026-03-25 from source code. Every endpoint, service method, DTO field, and Prisma operation documented with line numbers.

---

## Table of Contents

1. [Users Module](#1-users-module)
2. [Follows Module](#2-follows-module)
3. [Blocks Module](#3-blocks-module)
4. [Mutes Module](#4-mutes-module)
5. [Restricts Module](#5-restricts-module)
6. [Prisma Schema Models](#6-prisma-schema-models)
7. [Cross-Module Dependencies](#7-cross-module-dependencies)
8. [Key Architectural Patterns](#8-key-architectural-patterns)

---

## 1. Users Module

### Files

| File | Path | Lines |
|------|------|-------|
| Module | `apps/api/src/modules/users/users.module.ts` | 11 |
| Controller | `apps/api/src/modules/users/users.controller.ts` | 351 |
| Service | `apps/api/src/modules/users/users.service.ts` | 1127 |
| UpdateProfileDto | `apps/api/src/modules/users/dto/update-profile.dto.ts` | 75 |
| ContactSyncDto | `apps/api/src/modules/users/dto/contact-sync.dto.ts` | 27 |
| ReportDto | `apps/api/src/modules/users/dto/report.dto.ts` | 10 |
| NasheedModeDto | `apps/api/src/modules/users/dto/nasheed-mode.dto.ts` | 9 |

### 1.1 Module Definition (users.module.ts)

```
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- **Imports:** None (relies on global PrismaService and REDIS injection)
- **Exports:** `UsersService` — consumed by other modules needing user data
- **No dependency** on FollowsModule, BlocksModule, MutesModule, or RestrictsModule (queries Block/Follow/Mute/Restrict tables directly via PrismaService)

### 1.2 Service Dependencies (users.service.ts, lines 53-58)

```typescript
constructor(
  private prisma: PrismaService,
  @Inject('REDIS') private redis: Redis,
)
```

- `PrismaService` — all database operations
- `Redis` (ioredis) — profile caching (`user:{username}` keys, 300s TTL), cache invalidation on update/deactivate/delete

### 1.3 Constants (users.service.ts, lines 16-50)

**PUBLIC_USER_FIELDS** (lines 16-36): Shared select object for public profile data:
```
id, username, displayName, bio, avatarUrl, coverUrl, website, location,
isVerified, isPrivate, followersCount, followingCount, postsCount,
role, createdAt, lastSeenAt, isDeleted, isBanned, isDeactivated
```

**CHANNEL_SELECT** (lines 38-50): Minbar channel fields:
```
id, handle, name, description, avatarUrl, bannerUrl, subscribersCount,
videosCount, totalViews, isVerified, createdAt
```

### 1.4 DTOs

#### UpdateProfileDto (dto/update-profile.dto.ts)

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| `username` | string? | `@Matches(/^[a-zA-Z0-9_.]{3,30}$/)` | 3-30 chars, alphanumeric + underscores + periods |
| `displayName` | string? | `@MaxLength(50)` | |
| `bio` | string? | `@MaxLength(160)` | |
| `avatarUrl` | string? | `@IsUrl()` + `@Matches(MEDIA_URL_PATTERN)` | Must be R2 or Clerk CDN URL (SSRF prevention) |
| `coverUrl` | string? | `@IsUrl()` + `@Matches(MEDIA_URL_PATTERN)` | Must be R2 or Clerk CDN URL |
| `website` | string? | `@IsUrl()` | |
| `location` | string? | `@MaxLength(100)` | |
| `language` | string? | `@IsIn(['en','ar','tr','ur','bn','fr','id','ms'])` | 8 supported languages |
| `theme` | string? | `@IsIn(['dark','light','system'])` | |
| `isPrivate` | boolean? | `@IsBoolean()` | Toggle private account |
| `madhab` | string? | `@IsIn(['hanafi','maliki','shafii','hanbali'])` | Islamic school of thought |

**MEDIA_URL_PATTERN** (line 8): `/^https:\/\/(.*\.r2\.cloudflarestorage\.com|.*\.r2\.dev|img\.clerk\.com|images\.clerk\.dev|pub-[a-z0-9]+\.r2\.dev)\//` — prevents SSRF and external image hotlinking.

#### ContactSyncDto (dto/contact-sync.dto.ts)

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| `phoneNumbers` | string[] | `@IsArray()`, `@ArrayMaxSize(500)`, `@IsString({ each: true })`, `@MaxLength(20, { each: true })` | Max 500 phone numbers per sync |

**GDPR Warning** (lines 7-17): Raw phone numbers of non-users transmitted to server. TODO: implement client-side SHA-256 hashing before transmission.

#### ReportDto (dto/report.dto.ts)

| Field | Type | Validation |
|-------|------|------------|
| `reason` | string | `@MinLength(3)`, `@MaxLength(500)` |

#### NasheedModeDto (dto/nasheed-mode.dto.ts)

| Field | Type | Validation |
|-------|------|------------|
| `nasheedMode` | boolean | `@IsBoolean()` |

### 1.5 Controller Endpoints (users.controller.ts)

Default throttle: **60 req/min** (line 26)

| # | Method | Path | Auth | Rate Limit | Handler | DTO/Params | Response | Line |
|---|--------|------|------|------------|---------|------------|----------|------|
| 1 | GET | `/users/me` | ClerkAuthGuard | 60/min | `getMe` | — | Full user profile + settings | 31 |
| 2 | PATCH | `/users/me` | ClerkAuthGuard | **10/min** | `updateProfile` | `UpdateProfileDto` | Updated PUBLIC_USER_FIELDS | 40 |
| 3 | GET | `/users/me/data-export` | ClerkAuthGuard | **1/24h** | `exportData` | — | GDPR JSON export | 52 |
| 4 | DELETE | `/users/me/deactivate` | ClerkAuthGuard | 60/min | `deactivate` | — | `{ message }` | 61 |
| 5 | DELETE | `/users/me` | ClerkAuthGuard | **1/24h** | `deleteAccount` | — | `{ deleted: true }` | 76 |
| 6 | GET | `/users/me/saved-posts` | ClerkAuthGuard | 60/min | `getSavedPosts` | `?cursor` | Cursor-paginated posts | 86 |
| 7 | GET | `/users/me/saved-threads` | ClerkAuthGuard | 60/min | `getSavedThreads` | `?cursor` | Cursor-paginated threads | 97 |
| 8 | GET | `/users/me/saved-reels` | ClerkAuthGuard | 60/min | `getSavedReels` | `?cursor` | Cursor-paginated reels | 108 |
| 9 | GET | `/users/me/saved-videos` | ClerkAuthGuard | 60/min | `getSavedVideos` | `?cursor` | Cursor-paginated videos | 119 |
| 10 | GET | `/users/me/watch-later` | ClerkAuthGuard | 60/min | `getWatchLater` | `?cursor` | Cursor-paginated videos | 132 |
| 11 | POST | `/users/me/watch-later/:videoId` | ClerkAuthGuard | 60/min | `addWatchLater` | `:videoId` | `{ added: true }` | 143 |
| 12 | DELETE | `/users/me/watch-later/:videoId` | ClerkAuthGuard | 60/min | `removeWatchLater` | `:videoId` | `{ removed: true }` | 154 |
| 13 | GET | `/users/me/watch-history` | ClerkAuthGuard | 60/min | `getWatchHistory` | `?cursor` | Cursor-paginated videos + progress | 165 |
| 14 | DELETE | `/users/me/watch-history` | ClerkAuthGuard | 60/min | `clearWatchHistory` | — | `{ cleared: true }` | 176 |
| 15 | GET | `/users/me/drafts` | ClerkAuthGuard | 60/min | `getDrafts` | — | Array of DraftPost (max 50) | 184 |
| 16 | GET | `/users/me/qr-code` | ClerkAuthGuard | 60/min | `getQrCode` | — | `{ username, deeplink, profileUrl }` | 192 |
| 17 | GET | `/users/me/analytics` | ClerkAuthGuard | 60/min | `getAnalytics` | — | Last 30 days CreatorStat | 200 |
| 18 | POST | `/users/contacts/sync` | ClerkAuthGuard | **5/hour** | `syncContacts` | `ContactSyncDto` | Matched users array | 208 |
| 19 | GET | `/users/me/liked-posts` | ClerkAuthGuard | 60/min | `getLikedPosts` | `?cursor` | Cursor-paginated posts | 217 |
| 20 | POST | `/users/me/delete-account` | ClerkAuthGuard | **1/24h** | `requestAccountDeletion` | — | `{ requested, scheduledDeletionDate, message }` | 234 |
| 21 | POST | `/users/me/cancel-deletion` | ClerkAuthGuard | 60/min | `cancelAccountDeletion` | — | `{ cancelled: true }` | 243 |
| 22 | POST | `/users/me/reactivate` | ClerkAuthGuard | 60/min | `reactivateAccount` | — | `{ reactivated: true }` | 251 |
| 23 | PATCH | `/users/me/nasheed-mode` | ClerkAuthGuard | 60/min | `updateNasheedMode` | `NasheedModeDto` | `{ id, nasheedMode }` | 259 |
| 24 | GET | `/users/:username` | **OptionalClerkAuthGuard** | 60/min | `getProfile` | `:username`, `?currentUserId` (from auth) | Public profile + isFollowing + followRequestPending | 271 |
| 25 | GET | `/users/:username/posts` | **OptionalClerkAuthGuard** | 60/min | `getUserPosts` | `:username`, `?cursor` | Cursor-paginated posts (visibility-filtered) | 281 |
| 26 | GET | `/users/:username/threads` | **OptionalClerkAuthGuard** | 60/min | `getUserThreads` | `:username`, `?cursor` | Cursor-paginated threads (visibility-filtered) | 292 |
| 27 | GET | `/users/:username/followers` | **OptionalClerkAuthGuard** | 60/min | `getFollowers` | `:username`, `?cursor` | Cursor-paginated follower list | 303 |
| 28 | GET | `/users/:username/following` | **OptionalClerkAuthGuard** | 60/min | `getFollowing` | `:username`, `?cursor` | Cursor-paginated following list | 314 |
| 29 | GET | `/users/:username/mutual-followers` | ClerkAuthGuard | 60/min | `getMutualFollowers` | `:username`, `?limit` | Array of mutual followers (max 50) | 325 |
| 30 | POST | `/users/:id/report` | ClerkAuthGuard | **10/min** | `report` | `:id`, `ReportDto` | `{ reported: true }` | 337 |

### 1.6 Service Methods (users.service.ts)

#### touchLastSeen (line 60)
- **Params:** `userId: string`
- **Return:** void (fire-and-forget)
- **Logic:** Updates `lastSeenAt` to `new Date()`. `.catch()` swallows errors.
- **Prisma:** `user.update({ where: { id }, data: { lastSeenAt } })`

#### getMe (line 67)
- **Params:** `userId: string`
- **Return:** User with public fields + email, language, theme, lastSeenAt, profileLinks (ordered by position), settings
- **Prisma:** `user.findUnique` with extended select
- **Throws:** `NotFoundException` if user not found

#### updateProfile (line 84)
- **Params:** `userId: string`, `dto: UpdateProfileDto`
- **Return:** Updated user (PUBLIC_USER_FIELDS)
- **Logic:**
  1. Sanitizes `displayName`, `bio`, `location`, `website` via `sanitizeText()` (line 86-89)
  2. If `username` changed: checks uniqueness, stores `previousUsername` for redirect (line 93-118)
  3. Updates user record
  4. Invalidates Redis cache for old + new username (lines 127-131)
- **Prisma:** `user.findUnique` (for current username), `user.findUnique` (uniqueness check), `user.update`
- **Throws:** `NotFoundException` (user not found), `ConflictException` (username taken)

#### deactivate (line 134)
- **Params:** `userId: string`
- **Return:** `{ message: 'Account deactivated' }`
- **Logic:** Sets `isDeactivated: true`, `deactivatedAt: new Date()`. Invalidates Redis cache.
- **Prisma:** `user.findUnique`, `user.update`

#### exportData (line 154)
- **Params:** `userId: string`
- **Return:** GDPR-compliant JSON export object
- **Logic:** Parallel fetch of 11 data categories (Promise.all):
  - user profile, posts (5000 cap), comments (5000), messages (5000), followers (5000), following (5000), likes (5000), bookmarks (5000), threads (5000), reels (5000), videos (5000)
  - Total max rows: 55,000 (11 * 5000) to prevent OOM
- **Prisma:** 11 parallel queries: `user.findUnique`, `post.findMany`, `comment.findMany`, `message.findMany`, `follow.findMany` x2, `postReaction.findMany`, `savedPost.findMany`, `thread.findMany`, `reel.findMany`, `video.findMany`
- **Response shape:**
  ```
  { exportedAt, profile, posts, threads, reels, videos, comments, messages,
    followers: string[], following: string[], likes, bookmarks }
  ```

#### deleteAccount (line 237)
- **Params:** `userId: string`
- **Return:** `{ deleted: true }`
- **Logic:** Full transactional soft-delete (GDPR Article 17):
  1. Anonymize PII: username -> `deleted_{userId}`, displayName -> 'Deleted User', bio -> '', nullify avatar/cover/website/email/phone/expoPushToken
  2. Soft-delete all content: posts, threads, comments, reels, videos (set `isRemoved: true`)
  3. Hard-delete stories, profile links, 2FA secrets, encryption keys, devices
  4. Remove social graph: all follows, blocks, circle memberships, mutes, restricts, follow requests
  5. Delete bookmarks and reactions: savedPosts, threadBookmarks, videoBookmarks, postReactions
  6. Invalidate Redis cache
- **Prisma:** Single `$transaction(async (tx) => { ... })` with ~15 operations
- **Throws:** `NotFoundException` if user not found or already deleted

#### getProfile (line 318)
- **Params:** `username: string`, `currentUserId?: string`
- **Return:** Public profile + `isFollowing`, `followRequestPending`, optional `redirectedFrom`
- **Logic:**
  1. Try Redis cache first (`user:{username}`, 300s TTL)
  2. If miss, query DB. If not found, try `previousUsername` field (redirect support)
  3. Reject deleted/banned/deactivated profiles
  4. Bidirectional block check (if currentUserId provided)
  5. Check follow status and pending follow request
- **Prisma:** `user.findUnique` (with profileLinks + channel), `user.findFirst` (previousUsername fallback), `block.findFirst` (bidirectional), `follow.findUnique`, `followRequest.findUnique`
- **Redis:** `GET user:{username}`, `SETEX user:{username} 300 {json}`

#### getUserPosts (line 408)
- **Params:** `username: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated posts
- **Logic:**
  1. Resolve username to user
  2. Bidirectional block check (line 413-423)
  3. Visibility filter based on relationship: owner sees all, followers see PUBLIC + FOLLOWERS, others see PUBLIC only
  4. Filters out removed posts and not-yet-scheduled posts (`OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]`)
- **Prisma:** `user.findUnique`, `block.findFirst`, `follow.findUnique`, `post.findMany`

#### getUserThreads (line 464)
- **Params:** `username: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated threads
- **Logic:** Same pattern as getUserPosts with ThreadVisibility. Only returns chain heads (`isChainHead: true`). Also filters scheduledAt.
- **Prisma:** `user.findUnique`, `block.findFirst`, `follow.findUnique`, `thread.findMany`

#### getSavedPosts (line 520)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated saved posts with user info
- **Prisma:** `savedPost.findMany` with `include: { post: { select: { ..., user: { select } } } }`
- **Cursor:** `userId_postId` compound key

#### getSavedThreads (line 554)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated bookmarked threads
- **Prisma:** `threadBookmark.findMany` with `include: { thread: { select: { ..., user: { select } } } }`
- **Cursor:** `userId_threadId` compound key

#### getSavedReels (line 586)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated saved reels (adds `isBookmarked: true`)
- **Prisma:** `reelInteraction.findMany` where `saved: true` with `include: { reel: { select: { ..., user: { select } } } }`
- **Cursor:** `userId_reelId` compound key

#### getSavedVideos (line 629)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated saved videos with channel info (adds `isBookmarked: true`)
- **Prisma:** `videoBookmark.findMany` with `include: { video: { select: { ..., channel: { select: CHANNEL_SELECT } } } }`
- **Cursor:** `userId_videoId` compound key

#### getFollowRequests (line 676)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated pending follow requests with sender info
- **Note:** This method exists in service but is NOT exposed via controller (comment on line 130: "Follow requests moved to FollowsController")
- **Prisma:** `followRequest.findMany` where `receiverId: userId, status: 'PENDING'`

#### getWatchLater (line 706)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated watch-later videos with channel info
- **Prisma:** `watchLater.findMany` with `include: { video: { select: { ..., channel } } }`
- **Cursor:** `userId_videoId` compound key

#### addWatchLater (line 738)
- **Params:** `userId: string`, `videoId: string`
- **Return:** `{ added: true }`
- **Prisma:** `watchLater.upsert` — idempotent (create if not exists, no-op update)

#### removeWatchLater (line 747)
- **Params:** `userId: string`, `videoId: string`
- **Return:** `{ removed: true }`
- **Prisma:** `watchLater.deleteMany` — idempotent

#### getWatchHistory (line 754)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated watch history with progress + completed + watchedAt
- **Prisma:** `watchHistory.findMany` with `include: { video: { select } }`, ordered by `watchedAt: 'desc'`

#### clearWatchHistory (line 791)
- **Params:** `userId: string`
- **Return:** `{ cleared: true }`
- **Prisma:** `watchHistory.deleteMany({ where: { userId } })`

#### getDrafts (line 796)
- **Params:** `userId: string`
- **Return:** Array of DraftPost (max 50)
- **Prisma:** `draftPost.findMany` ordered by `updatedAt: 'desc'`, take 50

#### getQrCode (line 804)
- **Params:** `userId: string`
- **Return:** `{ username, deeplink: 'mizanly://profile/{username}', profileUrl: 'https://mizanly.app/@{username}' }`
- **Prisma:** `user.findUnique` (select username only)

#### getAnalytics (line 817)
- **Params:** `userId: string`
- **Return:** `{ stats: CreatorStat[] }` (last 30 days)
- **Prisma:** `creatorStat.findMany` ordered by `date: 'desc'`, take 30

#### getFollowers (line 836)
- **Params:** `username: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated follower list
- **Logic:** Resolves username to userId via `resolveUsernameToUserId()`, then delegates to `queryFollowers()`
- **Note:** This is the username-based public endpoint. The FollowsService has a userId-based version.

#### getFollowing (line 845)
- **Params:** `username: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated following list
- **Logic:** Same as getFollowers, delegates to `queryFollowing()`

#### resolveUsernameToUserId (private, line 854)
- **Params:** `username: string`, `viewerId?: string`
- **Return:** `Promise<string>` (userId)
- **Logic:**
  1. Find user by username, check isDeleted/isBanned/isDeactivated
  2. Bidirectional block check
  3. Private account check: only owner or followers can proceed
- **Throws:** `NotFoundException`, `ForbiddenException`

#### queryFollowers (private, line 877)
- **Params:** `userId: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: User[], meta: { cursor, hasMore } }`
- **Prisma:** `follow.findMany` where `followingId: userId`, include follower, cursor on composite `followerId_followingId`

#### queryFollowing (private, line 897)
- **Params:** `userId: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: User[], meta: { cursor, hasMore } }`
- **Prisma:** `follow.findMany` where `followerId: userId`, include following, cursor on composite `followerId_followingId`

#### report (line 917)
- **Params:** `reporterId: string`, `reportedUserId: string`, `reason: string`
- **Return:** `{ reported: true }` or `{ reported: false }` (self-report)
- **Logic:** Maps string reason to `ReportReason` enum via `reasonMap` (12 mappings: spam, impersonation, inappropriate, harassment, nudity, violence, hate_speech, self_harm, misinformation, terrorism, doxxing, copyright). Unmapped reasons default to `OTHER`.
- **Prisma:** `report.create({ data: { reporterId, reportedUserId, reason: mappedReason } })`

#### getMutualFollowers (line 940)
- **Params:** `currentUserId: string`, `targetUsername: string`, `limit = 20`
- **Return:** `{ data: User[], meta: { cursor: null, hasMore: false } }`
- **Logic:**
  1. Resolve target user, check deleted/banned/deactivated
  2. Bidirectional block check
  3. Raw SQL query for mutual followers (joins follows table twice)
  4. Limit clamped to 1-50 range
- **Prisma:** `$queryRaw` SQL:
  ```sql
  SELECT u.id, u.username, u."displayName", u."avatarUrl"
  FROM follows f1
  INNER JOIN follows f2 ON f1."followerId" = f2."followerId"
  INNER JOIN users u ON f1."followerId" = u.id
  WHERE f1."followingId" = $currentUserId AND f2."followingId" = $targetId
    AND u."isDeleted" = false AND u."isBanned" = false AND u."isDeactivated" = false
  LIMIT $safeLimit
  ```

#### getLikedPosts (line 970)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated liked posts
- **Prisma:** `postReaction.findMany` where `{ userId, reaction: "LIKE" }` with `include: { post: { select } }`
- **Cursor:** `userId_postId` compound key

#### requestAccountDeletion (line 1004)
- **Params:** `userId: string`
- **Return:** `{ requested: true, scheduledDeletionDate, message }`
- **Logic:** Sets `deletedAt` to now + 30 days, `isDeactivated: true`, `deactivatedAt: now`. Invalidates cache.
- **Prisma:** `user.findUnique`, `user.update`

#### cancelAccountDeletion (line 1032)
- **Params:** `userId: string`
- **Return:** `{ cancelled: true }`
- **Logic:** Sets `deletedAt: null`, `isDeactivated: false`, `deactivatedAt: null`
- **Throws:** `NotFoundException` if already permanently deleted

#### reactivateAccount (line 1047)
- **Params:** `userId: string`
- **Return:** `{ reactivated: true }`
- **Logic:** Clears deactivation + deletion flags. Returns early if already active.
- **Throws:** `NotFoundException` if permanently deleted

#### updateNasheedMode (line 1063)
- **Params:** `userId: string`, `enabled: boolean`
- **Return:** `{ id, nasheedMode }`
- **Prisma:** `user.update({ data: { nasheedMode: enabled } })`

#### findByPhoneNumbers (line 1077)
- **Params:** `userId: string`, `phoneNumbers: string[]`
- **Return:** Array of matched users with `isFollowing` flag
- **Logic:**
  1. Normalize: strip non-digits, take last 10 digits, reject < 7 digits (lines 1079-1081)
  2. Deduplicate (line 1086)
  3. Query users by phone, exclude self, exclude deleted/banned (line 1088-1092)
  4. Parallel fetch of follows and blocks for matched users (lines 1097-1113)
  5. Filter out blocked users, add `isFollowing` flag (lines 1115-1125)
- **Prisma:** `user.findMany`, `follow.findMany`, `block.findMany` (parallel Promise.all)

---

## 2. Follows Module

### Files

| File | Path | Lines |
|------|------|-------|
| Module | `apps/api/src/modules/follows/follows.module.ts` | 13 |
| Controller | `apps/api/src/modules/follows/follows.controller.ts` | 123 |
| Service | `apps/api/src/modules/follows/follows.service.ts` | 493 |

### 2.1 Module Definition (follows.module.ts)

```
@Module({
  imports: [NotificationsModule],
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
```

- **Imports:** `NotificationsModule` — for follow/follow-request notifications
- **Exports:** `FollowsService`

### 2.2 Service Dependencies (follows.service.ts, lines 16-24)

```typescript
constructor(
  private prisma: PrismaService,
  private notifications: NotificationsService,
  private pushTrigger: PushTriggerService,
  private queueService: QueueService,
  private analytics: AnalyticsService,
)
```

- `PrismaService` — all database operations
- `NotificationsService` — creates in-app notifications (FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED)
- `PushTriggerService` — (injected but not directly called in service — push triggered via QueueService)
- `QueueService` — queues push notification delivery jobs
- `AnalyticsService` — tracks follow events + daily increment counter

### 2.3 Controller Endpoints (follows.controller.ts)

Default throttle: **30 req/min** (line 20). All routes require `ClerkAuthGuard`.

**Route ordering note** (line 27): Static routes (`requests/*`, `suggestions`) are declared before param routes (`:userId`) to avoid NestJS route matching conflicts.

| # | Method | Path | Auth | Rate Limit | Handler | Params | Response | Line |
|---|--------|------|------|------------|---------|--------|----------|------|
| 1 | GET | `/follows/requests/incoming` | ClerkAuthGuard | 30/min | `getOwnRequests` | `?cursor` | Cursor-paginated follow requests | 29 |
| 2 | POST | `/follows/requests/:id/accept` | ClerkAuthGuard | 30/min | `acceptRequest` | `:id` (requestId) | `{ message }` | 38 |
| 3 | POST | `/follows/requests/:id/decline` | ClerkAuthGuard | 30/min | `declineRequest` | `:id` (requestId) | `{ message }` | 47 |
| 4 | DELETE | `/follows/requests/:id` | ClerkAuthGuard | 30/min | `cancelRequest` | `:id` (requestId) | `{ message }` | 56 |
| 5 | GET | `/follows/suggestions` | ClerkAuthGuard | 30/min | `getSuggestions` | — | Array of suggested users | 66 |
| 6 | POST | `/follows/:userId` | ClerkAuthGuard | 30/min | `follow` | `:userId` | `{ type: 'follow'|'request', follow|request }` | 74 |
| 7 | DELETE | `/follows/:userId` | ClerkAuthGuard | 30/min | `unfollow` | `:userId` | `{ message }` | 83 |
| 8 | DELETE | `/follows/:userId/remove-follower` | ClerkAuthGuard | 30/min | `removeFollower` | `:userId` (followerUserId) | `{ message }` | 93 |
| 9 | GET | `/follows/:userId/followers` | ClerkAuthGuard | 30/min | `getFollowers` | `:userId`, `?cursor` | Cursor-paginated followers | 103 |
| 10 | GET | `/follows/:userId/following` | ClerkAuthGuard | 30/min | `getFollowing` | `:userId`, `?cursor` | Cursor-paginated following | 113 |

### 2.4 Service Methods (follows.service.ts)

#### follow (line 26)
- **Params:** `currentUserId: string`, `targetUserId: string`
- **Return:** `{ type: 'follow', follow }` or `{ type: 'request', request }`
- **Logic:**
  1. Self-follow check → `BadRequestException` (line 27-29)
  2. Target existence check (reject deactivated/banned) (lines 31-37)
  3. **Bidirectional block check** (lines 40-48) — blocks in EITHER direction prevent following
  4. Existing follow check — **idempotent**: returns existing follow (lines 51-59)
  5. **Private account path** (lines 61-106):
     - Check existing request: PENDING → return idempotent; DECLINED → throw BadRequestException
     - Create FollowRequest + notification (FOLLOW_REQUEST type)
     - Handle P2002 (unique constraint race) — return existing request
  6. **Public account path** (lines 108-147):
     - `$transaction`: create Follow + increment followingCount + increment followersCount
     - Create notification (FOLLOW type) + queue push job
     - Analytics: `user_followed` event + `follows:daily` increment
     - Handle P2002 race — return existing follow
- **Prisma operations:** `user.findUnique`, `block.findFirst`, `follow.findUnique`, `followRequest.findUnique`, `followRequest.create`, `$transaction([follow.create, user.update x2])`
- **Counter updates:** Atomic `{ increment: 1 }` on User.followingCount and User.followersCount within transaction

#### unfollow (line 149)
- **Params:** `currentUserId: string`, `targetUserId: string`
- **Return:** `{ message: 'Unfollowed' }`
- **Logic:**
  1. Check existing follow — if not following, clean up pending follow requests and return (idempotent)
  2. Transaction: delete follow + decrement counters using `$executeRaw` with `GREATEST(count - 1, 0)` to prevent negative counts
- **Prisma:** `follow.findUnique`, `followRequest.deleteMany`, `$transaction([follow.delete, $executeRaw x2])`
- **Counter updates:** `$executeRaw` SQL: `UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = $1`

#### getFollowers (line 183)
- **Params:** `userId: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: User[], meta: { cursor, hasMore } }`
- **Logic:**
  1. Check user exists
  2. **Private account gate**: only owner or followers can see the followers list (lines 187-193)
  3. Cursor pagination on composite PK `followerId_followingId`
- **Prisma:** `user.findUnique`, `follow.findUnique` (privacy check), `follow.findMany` with include `follower`

#### getFollowing (line 234)
- **Params:** `userId: string`, `cursor?: string`, `viewerId?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: User[], meta: { cursor, hasMore } }`
- **Logic:** Same pattern as getFollowers, checks private account visibility
- **Prisma:** `user.findUnique`, `follow.findUnique`, `follow.findMany` with include `following`

#### getOwnRequests (line 285)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: FollowRequest[], meta: { cursor, hasMore } }`
- **Logic:** Returns incoming PENDING follow requests with sender info
- **Prisma:** `followRequest.findMany` where `{ receiverId: userId, status: 'PENDING' }` with include `sender`

#### acceptRequest (line 315)
- **Params:** `currentUserId: string`, `requestId: string`
- **Return:** `{ message: 'Follow request accepted' }`
- **Logic:**
  1. Find request, verify receiver is current user (lines 316-325)
  2. Idempotent: if already ACCEPTED, return success
  3. **Block check** — if a block now exists between the users, decline the request and throw (lines 328-342)
  4. Transaction: update request status to ACCEPTED, create Follow, increment both counters
  5. Handle P2002 (concurrent accept) — idempotent
  6. Notify requester (FOLLOW_REQUEST_ACCEPTED) + queue push job
- **Prisma:** `followRequest.findUnique`, `block.findFirst`, `$transaction([followRequest.update, follow.create, user.update x2])`
- **Counter updates:** Atomic `{ increment: 1 }` within transaction

#### declineRequest (line 384)
- **Params:** `currentUserId: string`, `requestId: string`
- **Return:** `{ message: 'Follow request declined' }`
- **Logic:** Verify ownership, update status to DECLINED
- **Prisma:** `followRequest.findUnique`, `followRequest.update`

#### cancelRequest (line 398)
- **Params:** `currentUserId: string`, `requestId: string`
- **Return:** `{ message: 'Follow request cancelled' }`
- **Logic:** Verify sender is current user, hard-delete the request
- **Prisma:** `followRequest.findUnique`, `followRequest.delete`

#### getSuggestions (line 409)
- **Params:** `userId: string`, `limit = 20`
- **Return:** Array of suggested users
- **Logic:** Friends-of-friends algorithm:
  1. Get up to 200 of current user's followings (widened from 50 for quality)
  2. Find users NOT already followed who have at least one follower from the user's following list
  3. Exclude self, deactivated, banned users
  4. Order by `followersCount DESC` (most popular first)
- **Prisma:** `follow.findMany` (get followings), `user.findMany` with `where: { followers: { some: { followerId: { in: followingIds } } } }`

#### removeFollower (line 445)
- **Params:** `currentUserId: string`, `followerUserId: string`
- **Return:** `{ message: 'Follower removed' }`
- **Logic:** Reverse follow delete — removes someone from YOUR followers (not unfollowing them). Idempotent.
  1. Self-check
  2. Find follow where `followerUserId → currentUserId`
  3. Transaction: delete follow + decrement counters with `$executeRaw GREATEST(..., 0)`
- **Prisma:** `follow.findUnique`, `$transaction([follow.delete, $executeRaw x2])`

#### checkFollowing (line 481)
- **Params:** `followerId: string`, `followingId: string`
- **Return:** `{ isFollowing: boolean }`
- **Logic:** Single PK lookup on compound `@@id([followerId, followingId])` — O(1)
- **Prisma:** `follow.findUnique`
- **Note:** Not exposed via controller — used internally by other modules

---

## 3. Blocks Module

### Files

| File | Path | Lines |
|------|------|-------|
| Module | `apps/api/src/modules/blocks/blocks.module.ts` | 11 |
| Controller | `apps/api/src/modules/blocks/blocks.controller.ts` | 54 |
| Service | `apps/api/src/modules/blocks/blocks.service.ts` | 246 |

### 3.1 Module Definition (blocks.module.ts)

```
@Module({
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
```

- **Imports:** None
- **Exports:** `BlocksService` — consumed by other modules for block checking

### 3.2 Service Dependencies (blocks.service.ts, lines 13-18)

```typescript
constructor(
  private prisma: PrismaService,
  @Inject('REDIS') private redis: Redis,
)
```

### 3.3 Controller Endpoints (blocks.controller.ts)

Default throttle: **60 req/min**. All routes require `ClerkAuthGuard`.

| # | Method | Path | Auth | Rate Limit | Handler | Params | Response | Line |
|---|--------|------|------|------------|---------|--------|----------|------|
| 1 | POST | `/blocks/:userId` | ClerkAuthGuard | 60/min | `block` | `:userId` | `{ message: 'User blocked' }` | 26 |
| 2 | DELETE | `/blocks/:userId` | ClerkAuthGuard | 60/min | `unblock` | `:userId` | `{ message: 'User unblocked' }` | 35 |
| 3 | GET | `/blocks` | ClerkAuthGuard | 60/min | `getBlockedList` | `?cursor` | Cursor-paginated blocked users | 45 |

### 3.4 Service Methods (blocks.service.ts)

#### block (line 20)
- **Params:** `blockerId: string`, `blockedId: string`
- **Return:** `{ message: 'User blocked' }`
- **Logic:** The most complex social operation — full transactional cleanup:
  1. Self-block check → `BadRequestException`
  2. Target existence check → `NotFoundException`
  3. **Idempotent:** if already blocked, return success (lines 33-36)
  4. **Pre-count follows to delete** (lines 39-57): Determine which direction(s) follow exists:
     - `blockerWasFollowing`: blocker followed blocked
     - `blockedWasFollowing`: blocked followed blocker
  5. **Transaction** (lines 59-90):
     - Create Block record
     - Delete ALL follows in BOTH directions (`follow.deleteMany`)
     - Delete ALL follow requests in BOTH directions (`followRequest.deleteMany`)
     - Conditionally decrement counter pairs using `$executeRaw GREATEST(count - 1, 0)`:
       - If blockerWasFollowing: blocker.followingCount--, blocked.followersCount--
       - If blockedWasFollowing: blocked.followingCount--, blocker.followersCount--
  6. Handle P2002 concurrent block race — idempotent
  7. **Cache invalidation** (lines 99-110): Invalidate Redis for both users' profiles
  8. **Post-block cleanup** (non-blocking, lines 113-115): `cleanupAfterBlock()` fire-and-forget
- **Prisma:** `user.findUnique` x2, `block.findUnique`, `follow.findMany`, `$transaction([block.create, follow.deleteMany, followRequest.deleteMany, $executeRaw x0-4])`

#### cleanupAfterBlock (private, line 124)
- **Params:** `blockerId: string`, `blockedId: string`
- **Return:** `Promise<void>`
- **Logic:**
  1. Remove blocked user from blocker's circles (lines 126-142):
     - Find blocker's circles → delete CircleMember records → decrement membersCount
  2. Archive shared 1:1 DM conversations (lines 144-166):
     - Find non-group conversations where both users are members
     - Set `isArchived: true` for both parties' ConversationMember records
- **Prisma:** `circle.findMany`, `circleMember.deleteMany`, `$executeRaw` (circle count), `conversation.findMany`, `conversationMember.updateMany`

#### unblock (line 168)
- **Params:** `blockerId: string`, `blockedId: string`
- **Return:** `{ message: 'User unblocked' }`
- **Logic:** Idempotent — if not blocked, return success. Otherwise delete Block record.
- **Prisma:** `block.findUnique`, `block.delete`
- **Note:** Unblock does NOT restore follows or unarchive conversations

#### getBlockedList (line 181)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: User[], meta: { cursor, hasMore } }`
- **Logic:** Returns blocked users with basic profile info (id, username, displayName, avatarUrl)
- **Prisma:** `block.findMany` where `blockerId: userId` with include `blocked`
- **Cursor:** Compound key `blockerId_blockedId`

#### isBlocked (line 215)
- **Params:** `userA: string`, `userB: string`
- **Return:** `Promise<boolean>`
- **Logic:** **Bidirectional** check — returns true if EITHER user blocked the other
- **Prisma:** `block.findFirst` with `OR: [{ blockerId: userA, blockedId: userB }, { blockerId: userB, blockedId: userA }]`
- **Used by:** Multiple modules for access control

#### getBlockedIds (line 227)
- **Params:** `userId: string`
- **Return:** `Promise<string[]>`
- **Logic:** Returns ALL user IDs involved in blocks (both directions) — used for feed filtering
  - Fetches up to 1000 blocks
  - Returns the "other" user's ID from each block record
- **Prisma:** `block.findMany` with `OR: [{ blockerId: userId }, { blockedId: userId }]`
- **Used by:** Feed algorithms, search, recommendations

---

## 4. Mutes Module

### Files

| File | Path | Lines |
|------|------|-------|
| Module | `apps/api/src/modules/mutes/mutes.module.ts` | 11 |
| Controller | `apps/api/src/modules/mutes/mutes.controller.ts` | 54 |
| Service | `apps/api/src/modules/mutes/mutes.service.ts` | 80 |

### 4.1 Module Definition (mutes.module.ts)

```
@Module({
  controllers: [MutesController],
  providers: [MutesService],
  exports: [MutesService],
})
export class MutesModule {}
```

- **Imports:** None
- **Exports:** `MutesService`

### 4.2 Service Dependencies (mutes.service.ts, line 12)

```typescript
constructor(private prisma: PrismaService) {}
```

Only PrismaService — no Redis, no notifications. Muting is silent (the muted user is never notified).

### 4.3 Controller Endpoints (mutes.controller.ts)

Default throttle: **60 req/min**. All routes require `ClerkAuthGuard`.

| # | Method | Path | Auth | Rate Limit | Handler | Params | Response | Line |
|---|--------|------|------|------------|---------|--------|----------|------|
| 1 | POST | `/mutes/:userId` | ClerkAuthGuard | 60/min | `mute` | `:userId` | `{ message: 'User muted' }` | 26 |
| 2 | DELETE | `/mutes/:userId` | ClerkAuthGuard | 60/min | `unmute` | `:userId` | `{ message: 'User unmuted' }` | 35 |
| 3 | GET | `/mutes` | ClerkAuthGuard | 60/min | `getMutedList` | `?cursor` | Cursor-paginated muted users | 45 |

### 4.4 Service Methods (mutes.service.ts)

#### mute (line 14)
- **Params:** `userId: string`, `mutedId: string`
- **Return:** `{ message: 'User muted' }`
- **Logic:**
  1. Self-mute check → `BadRequestException`
  2. Target existence check → `NotFoundException`
  3. Create mute record. Handle P2002 (already muted) — idempotent
- **Prisma:** `user.findUnique`, `mute.create`
- **Note:** No granularity options (story/message muting) — the current model mutes the user entirely. The Prisma Mute model only has `userId`, `mutedId`, `createdAt`.

#### unmute (line 38)
- **Params:** `userId: string`, `mutedId: string`
- **Return:** `{ message: 'User unmuted' }`
- **Logic:** Idempotent — `deleteMany` returns success even if nothing deleted
- **Prisma:** `mute.deleteMany({ where: { userId, mutedId } })`

#### getMutedList (line 46)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: User[], meta: { cursor, hasMore } }`
- **Logic:** Returns muted users with basic profile info
- **Prisma:** `mute.findMany` where `userId` with include `muted`, cursor on `userId_mutedId`

---

## 5. Restricts Module

### Files

| File | Path | Lines |
|------|------|-------|
| Module | `apps/api/src/modules/restricts/restricts.module.ts` | 11 |
| Controller | `apps/api/src/modules/restricts/restricts.controller.ts` | 54 |
| Service | `apps/api/src/modules/restricts/restricts.service.ts` | 115 |

### 5.1 Module Definition (restricts.module.ts)

```
@Module({
  controllers: [RestrictsController],
  providers: [RestrictsService],
  exports: [RestrictsService],
})
export class RestrictsModule {}
```

- **Imports:** None
- **Exports:** `RestrictsService`

### 5.2 Service Dependencies (restricts.service.ts, line 7)

```typescript
constructor(private readonly prisma: PrismaService) {}
```

Only PrismaService. Like muting, restricting is silent.

### 5.3 Controller Endpoints (restricts.controller.ts)

Default throttle: **60 req/min**. All routes require `ClerkAuthGuard`.

| # | Method | Path | Auth | Rate Limit | Handler | Params | Response | Line |
|---|--------|------|------|------------|---------|--------|----------|------|
| 1 | POST | `/restricts/:userId` | ClerkAuthGuard | 60/min | `restrict` | `:userId` | `{ message: 'User restricted' }` | 26 |
| 2 | DELETE | `/restricts/:userId` | ClerkAuthGuard | 60/min | `unrestrict` | `:userId` | `{ message: 'User unrestricted' }` | 35 |
| 3 | GET | `/restricts` | ClerkAuthGuard | 60/min | `getRestrictedList` | `?cursor` | Cursor-paginated restricted users | 45 |

### 5.4 Service Methods (restricts.service.ts)

#### restrict (line 9)
- **Params:** `restricterId: string`, `restrictedId: string`
- **Return:** `{ message: 'User restricted' }`
- **Logic:**
  1. Self-restrict check → `BadRequestException`
  2. Target existence check → `NotFoundException`
  3. Create restrict record. Handle P2002 (already restricted) — idempotent
- **Prisma:** `user.findUnique`, `restrict.create`
- **Note:** Unlike Instagram's restrict (which hides comments from you + restricts DMs), this model only marks the relationship. Actual restrict behavior (comment visibility, DM filtering) must be enforced by the consuming services.

#### unrestrict (line 34)
- **Params:** `restricterId: string`, `restrictedId: string`
- **Return:** `{ message: 'User unrestricted' }`
- **Logic:** Idempotent — `deleteMany` returns success even if nothing deleted
- **Prisma:** `restrict.deleteMany({ where: { restricterId, restrictedId } })`

#### getRestrictedList (line 42)
- **Params:** `userId: string`, `cursor?: string`, `limit = 20`
- **Return:** Cursor-paginated `{ data: User[], meta: { cursor, hasMore } }`
- **Logic:**
  1. Query restrict records (chronological)
  2. Fetch user data for restricted IDs in a separate query
  3. **Preserve chronological order** using a Map + ordered map lookup (lines 76-79) — necessary because `user.findMany` doesn't guarantee order
- **Prisma:** `restrict.findMany` (cursor on `restricterId_restrictedId`), `user.findMany` (where `id: { in: userIds }`)

#### isRestricted (line 90)
- **Params:** `restricterId: string`, `restrictedId: string`
- **Return:** `Promise<boolean>`
- **Logic:** **Unidirectional** check — only checks if A restricted B (unlike block which is bidirectional)
- **Prisma:** `restrict.findUnique({ where: { restricterId_restrictedId } })`
- **Used by:** Comment and DM services for content visibility filtering

#### getRestrictedIds (line 106)
- **Params:** `userId: string`
- **Return:** `Promise<string[]>`
- **Logic:** Returns all user IDs that the given user has restricted (max 50)
- **Prisma:** `restrict.findMany` where `restricterId: userId`, select `restrictedId`
- **Used by:** Feed/story/comment services to filter restricted users' content

---

## 6. Prisma Schema Models

### 6.1 User (schema.prisma line 662)

Key fields relevant to these modules:
```prisma
model User {
  id               String   @id @default(cuid())
  clerkId          String   @unique
  email            String   @unique
  username         String   @unique
  previousUsername String?                          // For old-username redirect
  displayName      String
  bio              String   @default("") @db.VarChar(500)
  avatarUrl        String?
  coverUrl         String?
  website          String?
  location         String?
  phone            String?
  followersCount   Int      @default(0)
  followingCount   Int      @default(0)
  postsCount       Int      @default(0)
  isVerified       Boolean  @default(false)
  isPrivate        Boolean  @default(false)
  isBanned         Boolean  @default(false)
  isDeactivated    Boolean  @default(false)
  deactivatedAt    DateTime?
  isDeleted        Boolean  @default(false)
  deletedAt        DateTime?
  nasheedMode      Boolean  @default(false)
  madhab           String?  @db.VarChar(20)
  lastSeenAt       DateTime @default(now())
  // ... many relations omitted
}
```

### 6.2 Follow (schema.prisma line 943)

```prisma
model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  follower    User     @relation("Follower", fields: [followerId], references: [id], onDelete: Cascade)
  following   User     @relation("Following", fields: [followingId], references: [id], onDelete: Cascade)

  @@id([followerId, followingId])       // Composite PK
  @@index([followingId])                // For "who follows userId" queries
  @@index([createdAt(sort: Desc)])      // For chronological listing
  @@map("follows")
}
```

- **Composite PK:** `[followerId, followingId]` — index-backed O(1) lookup for checkFollowing
- **Cascade deletes:** If either user is deleted, follow is removed

### 6.3 FollowRequest (schema.prisma line 2087)

```prisma
model FollowRequest {
  id            String              @id @default(cuid())
  senderId      String
  receiverId    String
  status        FollowRequestStatus @default(PENDING)
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  sender        User                @relation("SentFollowRequests", ...)
  receiver      User                @relation("ReceivedFollowRequests", ...)
  notifications Notification[]

  @@unique([senderId, receiverId])
  @@index([receiverId, status])       // For incoming requests query
  @@map("follow_requests")
}
```

**FollowRequestStatus enum** (line 200):
```
PENDING | ACCEPTED | DECLINED
```

### 6.4 Block (schema.prisma line 2013)

```prisma
model Block {
  blockerId String
  blockedId String
  createdAt DateTime @default(now())
  blocker   User     @relation("Blocker", ...)
  blocked   User     @relation("Blocked", ...)

  @@id([blockerId, blockedId])         // Composite PK
  @@index([blockedId])                 // For "who blocked userId" queries
  @@map("blocks")
}
```

### 6.5 Mute (schema.prisma line 2025)

```prisma
model Mute {
  userId    String
  mutedId   String
  createdAt DateTime @default(now())
  user      User     @relation("Muter", ...)
  muted     User     @relation("Muted", ...)

  @@id([userId, mutedId])              // Composite PK
  @@index([mutedId])
  @@map("mutes")
}
```

**Note:** No granularity fields (e.g., `muteStories`, `muteMessages`, `mutePosts`). Current model is all-or-nothing.

### 6.6 Restrict (schema.prisma line 3174)

```prisma
model Restrict {
  restricterId String
  restricter   User     @relation("restrictsCreated", ...)
  restrictedId String
  restricted   User     @relation("restrictsReceived", ...)
  createdAt    DateTime @default(now())

  @@id([restricterId, restrictedId])   // Composite PK
  @@index([restrictedId])
  @@map("restricts")
}
```

### 6.7 Report (schema.prisma line 1943)

```prisma
model Report {
  id                    String           @id @default(cuid())
  reporterId            String?
  reportedUserId        String?
  reportedPostId        String?
  reportedCommentId     String?
  reportedMessageId     String?
  reportedThreadId      String?
  reportedReelId        String?
  reportedVideoId       String?
  reason                ReportReason
  description           String?          @db.VarChar(1000)
  status                ReportStatus     @default(PENDING)
  reviewedById          String?
  reviewedAt            DateTime?
  actionTaken           ModerationAction @default(NONE)
  moderatorNotes        String?
  explanationToReporter String?
  explanationToReported String?
  createdAt             DateTime         @default(now())

  @@index([status, createdAt])
  @@index([reportedUserId])
}
```

**ReportReason enum** (line 123):
```
HATE_SPEECH | HARASSMENT | VIOLENCE | SPAM | MISINFORMATION | NUDITY |
SELF_HARM | TERRORISM | DOXXING | COPYRIGHT | IMPERSONATION | OTHER
```

**ReportStatus enum** (line 116): `PENDING | REVIEWING | RESOLVED | DISMISSED`

**ModerationAction enum** (line 138): `WARNING | CONTENT_REMOVED | TEMP_MUTE | TEMP_BAN | PERMANENT_BAN | NONE`

---

## 7. Cross-Module Dependencies

### Who calls whom (runtime data flow)

```
UsersModule
  └── Queries Block, Follow, FollowRequest tables directly via PrismaService
  └── No imports of other social modules

FollowsModule
  ├── imports NotificationsModule
  │   ├── NotificationsService.create() — FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED
  │   └── QueueService.addPushNotificationJob()
  ├── Queries Block table directly for bidirectional checks
  └── AnalyticsService.track() + .increment()

BlocksModule
  └── Queries Follow, FollowRequest, Circle, CircleMember, Conversation,
      ConversationMember tables directly for cleanup on block
  └── Redis for cache invalidation

MutesModule
  └── PrismaService only (no cross-module deps)

RestrictsModule
  └── PrismaService only (no cross-module deps)
```

### Who consumes these services (exported)

All five services are exported and consumed by:
- **BlocksService.isBlocked()** — Used by posts, threads, reels, videos, chat, stories, search, feed, recommendations
- **BlocksService.getBlockedIds()** — Used by feed algorithms, search, personalized recommendations
- **FollowsService.checkFollowing()** — Used by content visibility checks, notification filtering
- **MutesService** — Used by feed/notification services to hide muted users' content
- **RestrictsService.isRestricted() / getRestrictedIds()** — Used by comment services, feed, story visibility

---

## 8. Key Architectural Patterns

### 8.1 Idempotency

ALL write operations are idempotent:
- **Follow/Block/Mute/Restrict:** Check for existing record before create; catch P2002 (unique constraint violation) as success
- **Unfollow/Unblock/Unmute/Unrestrict:** Check existence first; if not found, return success message anyway
- **Accept request:** If already ACCEPTED, return success

### 8.2 Counter Management

Two strategies used:

1. **Increment (follow, acceptRequest):** Prisma atomic `{ increment: 1 }` within `$transaction`
2. **Decrement (unfollow, removeFollower, block):** Raw SQL `$executeRaw` with `GREATEST(count - 1, 0)` to prevent negative counts

The block operation is the most complex counter case — must handle 0, 1, or 2 follow directions being deleted simultaneously.

### 8.3 Cursor Pagination

All list endpoints use the same pattern:
```typescript
take: limit + 1,                              // Fetch one extra
...(cursor ? { cursor: { compound_key }, skip: 1 } : {}),
orderBy: { createdAt: 'desc' },
// Then:
const hasMore = items.length > limit;
const data = hasMore ? items.slice(0, limit) : items;
return { data, meta: { cursor: hasMore ? lastItem.key : null, hasMore } };
```

Compound cursor keys used: `followerId_followingId`, `blockerId_blockedId`, `userId_mutedId`, `restricterId_restrictedId`, `userId_postId`, `userId_threadId`, `userId_videoId`, `userId_reelId`.

### 8.4 Bidirectional vs Unidirectional Checks

| Relationship | Check Direction | Reason |
|-------------|-----------------|--------|
| **Block** | Bidirectional (A→B or B→A) | Blocked user also cannot interact with blocker |
| **Follow** | Unidirectional (A→B) | Following is one-way |
| **Mute** | Unidirectional (A→B) | Muting only affects muter's view |
| **Restrict** | Unidirectional (A→B) | Restricting only affects restricter's view of restricted's content |

### 8.5 Account Lifecycle

```
Active → Deactivated (soft, reversible via reactivate)
Active → Scheduled Deletion (30-day grace, reversible via cancel-deletion)
Active → Immediate Deletion (hard delete, irreversible)
Deactivated → Active (reactivate)
Scheduled Deletion → Active (cancel-deletion within 30 days)
```

Deletion flow (deleteAccount):
1. Anonymize PII (username → `deleted_{id}`, email → `deleted_{id}@deleted.local`, null all optional fields)
2. Soft-delete content (isRemoved: true)
3. Hard-delete sensitive data (2FA secrets, encryption keys, devices, stories)
4. Remove entire social graph (follows, blocks, mutes, restricts, follow requests, circle memberships)
5. Delete bookmarks and reactions
6. Invalidate Redis cache

### 8.6 Privacy Controls on Profile Viewing

The `getProfile` endpoint respects:
1. **Deleted/Banned/Deactivated** → 404 (user not found)
2. **Bidirectional blocks** → 403 (user not available)
3. **Private accounts** → show profile but followers/following lists gated (only owner or followers)
4. **Follow request state** → returned as `followRequestPending` flag for UI
5. **Previous username redirect** → if username not found, check `previousUsername` field

### 8.7 Visibility Filtering for Posts/Threads

```
Owner → sees all (including scheduled, any visibility)
Follower → PUBLIC + FOLLOWERS visibility, only published (scheduledAt null or lte now)
Unauthenticated/Non-follower → PUBLIC only, only published
```

### 8.8 Notification Flow (Follows only)

Mutes, blocks, and restricts are **silent** — no notifications sent. Only follows generate notifications:

| Action | Notification Type | Recipient |
|--------|-------------------|-----------|
| Follow (public account) | `FOLLOW` | Target user |
| Follow request (private account) | `FOLLOW_REQUEST` | Target user |
| Accept follow request | `FOLLOW_REQUEST_ACCEPTED` | Requester |

All notifications are created fire-and-forget (`.then().catch()`) to not block the response. Push notification delivery is queued via `QueueService.addPushNotificationJob()`.

### 8.9 Block Side Effects

Blocking is the most destructive social operation:
1. Creates Block record
2. Deletes ALL follows in BOTH directions
3. Deletes ALL follow requests in BOTH directions
4. Decrements follower/following counts accurately
5. Removes blocked user from blocker's circles
6. Archives shared 1:1 DM conversations

**Unblocking does NOT reverse any of these side effects** — the users start with a clean slate and must re-follow, re-join circles, etc.

### 8.10 Race Condition Handling

P2002 (Prisma unique constraint violation) is caught at every create operation:
- `follow.create` → return existing follow (idempotent)
- `followRequest.create` → return existing request (idempotent)
- `block.create` → return success message (idempotent)
- `mute.create` → return success message (idempotent)
- `restrict.create` → return success message (idempotent)

This prevents double-tap and concurrent request failures from surfacing as errors.

### 8.11 Redis Usage

| Module | Redis Usage |
|--------|-------------|
| Users | Profile cache (`user:{username}`, 300s TTL), cache invalidation on update/deactivate/delete |
| Blocks | Cache invalidation for both users on block (follower counts changed) |
| Follows | None (no caching) |
| Mutes | None |
| Restricts | None |

---

## Test Files (reference)

| File | Module |
|------|--------|
| `users.controller.spec.ts` | Users |
| `users.service.spec.ts` | Users |
| `users.service.auth.spec.ts` | Users (auth edge cases) |
| `users.service.edge.spec.ts` | Users (edge cases) |
| `users.service.abuse.spec.ts` | Users (abuse scenarios) |
| `dto/update-profile.dto.spec.ts` | Users DTO validation |
| `follows.controller.spec.ts` | Follows |
| `follows.service.spec.ts` | Follows |
| `follows.service.edge.spec.ts` | Follows (edge cases) |
| `follows.service.abuse.spec.ts` | Follows (abuse scenarios) |
| `follows.service.concurrency.spec.ts` | Follows (race conditions) |
| `blocks.controller.spec.ts` | Blocks |
| `blocks.service.spec.ts` | Blocks |
| `mutes.controller.spec.ts` | Mutes |
| `mutes.service.spec.ts` | Mutes |
| `restricts.controller.spec.ts` | Restricts |
| `restricts.service.spec.ts` | Restricts |
