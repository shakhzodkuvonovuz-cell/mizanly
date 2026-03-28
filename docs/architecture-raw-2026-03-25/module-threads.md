# Module: Threads (Majlis)

> Extracted from `apps/api/src/modules/threads/` — every line read, every method documented.

---

## 1. Module File

**File:** `apps/api/src/modules/threads/threads.module.ts` (9 lines)

```typescript
@Module({
  imports: [NotificationsModule, GamificationModule, AiModule, ModerationModule],
  controllers: [ThreadsController],
  providers: [ThreadsService],
  exports: [ThreadsService],
})
export class ThreadsModule {}
```

### Imports
| Module | Purpose |
|--------|---------|
| `NotificationsModule` | Send MENTION, LIKE, REPOST, THREAD_REPLY notifications |
| `GamificationModule` | XP awards + streak updates via QueueService |
| `AiModule` | Image moderation via Claude Vision (AiService.moderateImage) |
| `ModerationModule` | Pre-save text moderation (ContentSafetyService.moderateText) |

### Exports
- `ThreadsService` — exported for use by other modules (search, personalized-feed, etc.)

---

## 2. Controller

**File:** `apps/api/src/modules/threads/threads.controller.ts` (287 lines)
**Tag:** `@ApiTags('Threads (Majlis)')` — Swagger group
**Prefix:** `@Controller('threads')` → `/api/v1/threads`

### Endpoint Table

| # | Method | Path | Auth | Rate Limit | DTO/Params | Response | Lines |
|---|--------|------|------|------------|------------|----------|-------|
| 1 | GET | `/threads/feed` | OptionalClerkAuth | default | `?type=foryou\|following\|trending`, `?cursor` | `{ data: Thread[], meta: { cursor, hasMore } }` | 32-42 |
| 2 | GET | `/threads/trending` | OptionalClerkAuth | 30/60s | `?cursor`, `?limit` | `{ data: Thread[], meta: { cursor, hasMore } }` | 44-55 |
| 3 | GET | `/threads/user/:username` | OptionalClerkAuth | default | `:username`, `?cursor` | `{ data: Thread[], meta: { cursor, hasMore } }` | 57-66 |
| 4 | POST | `/threads/polls/:optionId/vote` | ClerkAuth | default | `:optionId` | `{ voted: true }` | 68-77 |
| 5 | POST | `/threads` | ClerkAuth | 10/60s | `CreateThreadDto` | Thread object | 79-86 |
| 6 | GET | `/threads/:id` | OptionalClerkAuth | default | `:id` | Thread + userReaction + isBookmarked | 90-95 |
| 7 | DELETE | `/threads/:id` | ClerkAuth | default | `:id` | `{ deleted: true }` | 97-104 |
| 8 | POST | `/threads/:id/like` | ClerkAuth | 30/60s | `:id` | `{ liked: true }` | 106-113 |
| 9 | DELETE | `/threads/:id/like` | ClerkAuth | default | `:id` | `{ liked: false }` | 115-122 |
| 10 | POST | `/threads/:id/repost` | ClerkAuth | 30/60s | `:id` | Repost Thread object | 124-131 |
| 11 | DELETE | `/threads/:id/repost` | ClerkAuth | default | `:id` | `{ reposted: false }` | 133-140 |
| 12 | POST | `/threads/:id/bookmark` | ClerkAuth | 30/60s | `:id` | `{ bookmarked: true }` | 142-149 |
| 13 | DELETE | `/threads/:id/bookmark` | ClerkAuth | default | `:id` | `{ bookmarked: false }` | 151-158 |
| 14 | GET | `/threads/:id/replies` | OptionalClerkAuth | default | `:id`, `?cursor` | `{ data: Reply[], meta: { cursor, hasMore } }` | 160-169 |
| 15 | POST | `/threads/:id/replies/:replyId/like` | ClerkAuth | 30/60s | `:id`, `:replyId` | `{ liked: true }` | 171-182 |
| 16 | DELETE | `/threads/:id/replies/:replyId/like` | ClerkAuth | default | `:id`, `:replyId` | `{ liked: false }` | 184-195 |
| 17 | POST | `/threads/:id/replies` | ClerkAuth | 30/60s | `AddReplyDto` | Reply object | 197-208 |
| 18 | DELETE | `/threads/:id/replies/:replyId` | ClerkAuth | default | `:replyId` | `{ deleted: true }` | 210-220 |
| 19 | POST | `/threads/:id/report` | ClerkAuth | 10/60s | `ReportDto` | `{ reported: true }` | 222-234 |
| 20 | POST | `/threads/:id/dismiss` | ClerkAuth | default | `:id` | `{ dismissed: true }` | 236-246 |
| 21 | PUT | `/threads/:id/reply-permission` | ClerkAuth | default | Body: `{ permission }` | `{ updated: true, permission }` | 248-258 |
| 22 | GET | `/threads/:id/can-reply` | OptionalClerkAuth | default | `:id` | `{ canReply: bool, reason: string }` | 260-268 |
| 23 | GET | `/threads/:id/share-link` | OptionalClerkAuth | default | `:id` | `{ url: string }` | 270-275 |
| 24 | GET | `/threads/:id/bookmarked` | ClerkAuth | default | `:id` | `{ bookmarked: bool }` | 277-286 |

### Static vs Param Route Ordering
Lines 30-77: Static routes (`feed`, `trending`, `user/:username`, `polls/:optionId/vote`) declared BEFORE `:id` param routes (line 90+) to prevent NestJS from matching "feed" as an ID.

### Auth Pattern
- **OptionalClerkAuthGuard** — anonymous browsing for feeds, thread detail, replies, can-reply, share-link
- **ClerkAuthGuard** — required for all write operations (create, like, repost, bookmark, reply, report, dismiss, permissions)

---

## 3. DTOs

### 3a. CreateThreadDto
**File:** `apps/api/src/modules/threads/dto/create-thread.dto.ts` (110 lines)

| Field | Type | Validation | Required | Description |
|-------|------|------------|----------|-------------|
| `content` | `string` | `@IsString`, `@MaxLength(500)` | YES | Thread text content |
| `visibility` | `string` | `@IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE'])` | no | Default: PUBLIC |
| `circleId` | `string` | `@IsUUID` | no | Circle ID for CIRCLE visibility |
| `mediaUrls` | `string[]` | `@IsUrl({}, { each: true })`, `@ArrayMaxSize(4)` | no | Up to 4 media URLs |
| `mediaTypes` | `string[]` | `@IsString({ each: true })`, `@ArrayMaxSize(4)` | no | MIME types matching mediaUrls |
| `hashtags` | `string[]` | `@IsString({ each: true })`, `@ArrayMaxSize(20)` | no | Pre-extracted hashtags |
| `mentions` | `string[]` | `@IsString({ each: true })`, `@ArrayMaxSize(20)` | no | Pre-extracted @mentions (usernames) |
| `isQuotePost` | `boolean` | `@IsBoolean` | no | Whether this is a quote post |
| `quoteText` | `string` | `@MaxLength(500)` | no | Quote commentary text |
| `repostOfId` | `string` | `@IsUUID` | no | Original thread ID being reposted/quoted |
| `poll` | `CreatePollDto` | `@ValidateNested`, `@Type(() => CreatePollDto)` | no | Inline poll |
| `scheduledAt` | `string` | `@IsDateString` | no | ISO 8601 datetime for scheduled publishing |

#### Nested: CreatePollDto (lines 15-37)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `question` | `string` | `@MaxLength(300)` | YES |
| `options` | `PollOptionDto[]` | `@ArrayMaxSize(4)`, `@ValidateNested` | YES |
| `endsAt` | `string` | `@IsDateString` | no |
| `allowMultiple` | `boolean` | `@IsBoolean` | no (default false) |

#### Nested: PollOptionDto (lines 8-13)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `text` | `string` | `@MaxLength(100)` | YES |

### 3b. AddReplyDto
**File:** `apps/api/src/modules/threads/dto/add-reply.dto.ts` (13 lines)

| Field | Type | Validation | Required | Description |
|-------|------|------------|----------|-------------|
| `content` | `string` | `@IsString`, `@MaxLength(500)` | YES | Reply text |
| `parentId` | `string` | `@IsString` | no | Parent reply ID for nested/threaded replies |

### 3c. ReportDto
**File:** `apps/api/src/modules/threads/dto/report.dto.ts` (9 lines)

| Field | Type | Validation | Required | Description |
|-------|------|------------|----------|-------------|
| `reason` | `string` | `@IsString`, `@MinLength(3)`, `@MaxLength(500)` | YES | Report reason text |

---

## 4. Service

**File:** `apps/api/src/modules/threads/threads.service.ts` (1,009 lines)

### Constructor Dependencies (lines 97-104)

| Dependency | Type | Purpose |
|------------|------|---------|
| `prisma` | `PrismaService` | Database access |
| `notifications` | `NotificationsService` | Create notifications for mentions, likes, reposts, replies |
| `gamification` | `GamificationService` | (injected but accessed via QueueService) |
| `ai` | `AiService` | Image moderation via `moderateImage()` |
| `queueService` | `QueueService` | Gamification jobs + Meilisearch index deletion |
| `contentSafety` | `ContentSafetyService` | Pre-save text moderation via `moderateText()` |

### Constants

#### THREAD_SELECT (lines 21-73)
Full select object for Thread queries. Includes:
- All scalar fields: id, content, mediaUrls, mediaTypes, visibility, isChainHead, chainId, chainPosition, isQuotePost, quoteText, repostOfId, hashtags, mentions, likesCount, repliesCount, repostsCount, quotesCount, viewsCount, bookmarksCount, hideLikesCount, isPinned, isSensitive, isRemoved, replyPermission, createdAt, updatedAt
- Relations: `user` (id, username, displayName, avatarUrl, isVerified), `circle` (id, name, slug), `poll` (with options + vote counts), `repostOf` (id, content, user)

#### REPLY_SELECT (lines 75-92)
Select object for ThreadReply queries. Includes:
- Scalars: id, content, mediaUrls, likesCount, createdAt, parentId
- Relations: `user` (id, username, displayName, avatarUrl, isVerified)
- Count: `_count: { select: { replies: true } }` — child reply count

### Private Methods

#### `getExcludedUserIds(userId: string): Promise<string[]>` (lines 107-124)
Returns combined set of user IDs that should be excluded from feeds:
- Users blocked by the caller (`Block.blockerId = userId`)
- Users who blocked the caller (`Block.blockedId = userId`)
- Users muted by the caller (`Mute.userId = userId`)
- All queries have `take: 50` limit
- Returns deduplicated array via `Set`

#### `getTrendingThreads(excludedIds, cursor?, limit=20)` (lines 239-286)
Scoring algorithm for trending threads:
- Time window: **7 days**
- Fetches up to **200 threads**, scores in-memory
- **Scoring formula:**
  - `replyDepthScore = repliesCount * 3` (strongest signal for thread conversations)
  - `engagementScore = likesCount * 1.0 + replyDepthScore + repostsCount * 2.0 + quotesCount * 2.5`
  - `engagementRate = engagementScore / ageHours`
- Filters: `isRemoved: false`, `isChainHead: true`, `visibility: PUBLIC`, `user.isPrivate: false`, `user.isDeactivated: false`, scheduled filter
- Cursor: `id: { lt: cursor }` (ID-based)
- Returns sorted page with hasMore

#### `getBlendedThreadFeed(userId, followingIds, excludedIds, cursor?, limit=20)` (lines 292-331)
Used when user follows < 10 accounts:
- Fetches `ceil(limit/2)` from following users
- Fetches `ceil(limit/2)` from trending
- Deduplicates by `seenIds` Set
- **Interleaves** alternating: following[0], trending[0], following[1], trending[1], ...
- hasMore = either source has more

#### `moderateThreadImage(userId, threadId, imageUrl): Promise<void>` (lines 983-1008)
Post-save image moderation (Finding 44):
- Calls `this.ai.moderateImage(imageUrl)`
- `BLOCK` → sets `isRemoved: true`, queues Meilisearch deletion
- `WARNING` → sets `isSensitive: true`
- Errors caught and logged (non-fatal)
- **Note:** This is a private method but NOT called from `create()` — pre-save moderation in `create()` already blocks harmful images before persisting. This method exists for background/async moderation.

### Public Methods

#### `getFeed(userId, type, cursor?, limit=20)` (lines 126-233)

Three feed algorithms:

**For You (lines 144-192):**
- Time window: **72 hours**
- Fetches up to **200 threads** from PUBLIC, non-removed, non-private, non-deactivated users
- **Scoring formula:** `score = engagement / ageHours^1.5`
  - `engagement = (likesCount * 3) + (repliesCount * 5) + (repostsCount * 4)`
  - Uses `Math.pow(ageHours, 1.5)` gravity decay
- Excludes blocked/muted users
- **Pagination:** offset-based via cursor (parsed as int), NOT keyset
- Sorts scored results, slices `[offset, offset + limit + 1]`

**Following (lines 195-229):**
- **Zero follows** → falls through to `getTrendingThreads()` (never-empty feed)
- **< 10 follows** → `getBlendedThreadFeed()` (50/50 following + trending interleave)
- **>= 10 follows** → chronological from `[userId, ...followingIds]`
- Filters: `isChainHead: true`, `isRemoved: false`, scheduled filter, `user.isDeactivated: false`
- Keyset pagination via Prisma cursor

**Trending:**
- Delegates to `getTrendingThreads()` (7-day window, engagement-rate scoring)

#### `create(userId, dto: CreateThreadDto)` (lines 333-437)

1. **Pre-save text moderation** (lines 335-343): `contentSafety.moderateText(content)` → throws `BadRequestException` if unsafe
2. **Pre-save image moderation** (lines 346-356): For each image mediaUrl → `ai.moderateImage(url)` → throws if BLOCK
3. **Hashtag upsert** (lines 358-370): `extractHashtags(content)` → upsert each with `threadsCount: { increment: 1 }`
4. **Transaction** (lines 372-409):
   - Creates Thread with all DTO fields, sanitized content, poll (nested create with options)
   - Increments `User.threadsCount`
5. **Mention notifications** (lines 411-430): Lookup mentioned usernames → create MENTION notification for each (skip self)
6. **Gamification** (lines 433-434): Queues `award-xp` (action: `thread_created`) + `update-streak` (action: `posting`)
7. Returns created Thread

**Data flow for poll creation:**
- `dto.poll.options` → `create: options.map((o, i) => ({ text: o.text, position: i }))` — position assigned by array index
- `dto.poll.endsAt` → `new Date(dto.poll.endsAt)` if provided
- `dto.poll.allowMultiple` → defaults `false`

**Data flow for quote/repost:**
- `isQuotePost: dto.isQuotePost ?? false`
- `quoteText: sanitizeText(dto.quoteText)` if provided
- `repostOfId: dto.repostOfId` — FK to original thread

**scheduledAt:** `new Date(dto.scheduledAt)` if provided, else `null`. All feed queries exclude scheduled threads via `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]`.

#### `getById(threadId, viewerId?)` (lines 439-474)
- Fetches thread with THREAD_SELECT
- Throws 404 if not found or `isRemoved`
- If viewer authenticated:
  - Checks bidirectional block → throws 404 if blocked
  - Fetches `ThreadReaction` and `ThreadBookmark` for viewer
- Returns `{ ...thread, userReaction, isBookmarked }`

#### `updateThread(threadId, userId, content)` (lines 476-487)
- Ownership check → ForbiddenException
- isRemoved check → BadRequestException
- Updates content with `sanitizeText()`
- **Note:** No controller endpoint maps to this method — it exists but is unreachable via REST API

#### `delete(threadId, userId)` (lines 489-517)
- Ownership check → ForbiddenException
- Transaction: soft-delete (`isRemoved: true`) + decrement `User.threadsCount` (GREATEST to prevent negative)
- Decrements `Hashtag.threadsCount` for all thread hashtags
- Queues Meilisearch index deletion via `queueService.addSearchIndexJob`

#### `like(threadId, userId)` (lines 519-557)
- Thread existence + isRemoved check
- **Self-like prevention** (line 524): throws BadRequestException
- Duplicate check via `ThreadReaction.findUnique` → ConflictException
- Transaction: create reaction (LIKE) + increment `Thread.likesCount`
- P2002 (unique constraint) caught → returns `{ liked: true }` (race condition safe)
- Notification: LIKE to thread owner (skip self)

#### `unlike(threadId, userId)` (lines 559-572)
- Checks existing reaction → NotFoundException if not found
- Transaction: delete reaction + decrement likesCount (GREATEST to prevent negative)

#### `repost(threadId, userId)` (lines 574-617)
- Original thread existence check
- **Self-repost prevention** (line 579)
- **Duplicate repost prevention** (lines 582-585): `findFirst` with `userId + repostOfId + !isRemoved`
- Transaction: create new Thread (empty content, `repostOfId` set, `isChainHead: true`) + increment `original.repostsCount` + increment `User.threadsCount`
- Notification: REPOST to original owner

#### `unrepost(threadId, userId)` (lines 619-633)
- Finds user's repost of this thread
- Transaction: soft-delete repost (`isRemoved: true`) + decrement `repostsCount` (GREATEST)

#### `bookmark(threadId, userId)` (lines 635-654)
- Thread existence check
- Transaction: create `ThreadBookmark` + increment `Thread.bookmarksCount`
- P2002 caught → ConflictException("Already bookmarked")

#### `unbookmark(threadId, userId)` (lines 656-669)
- Existing bookmark check → NotFoundException
- Transaction: delete bookmark + decrement bookmarksCount (GREATEST)

#### `getReplies(threadId, cursor?, limit=20, viewerId?)` (lines 671-707)
- Fetches **top-level replies only** (`parentId: null`)
- Filters out blocked/muted users via `getExcludedUserIds`
- Keyset pagination via Prisma cursor, ordered by `createdAt: 'asc'` (chronological)
- If viewer authenticated: batch-fetches `ThreadReplyLike` for all reply IDs → attaches `isLiked` boolean
- Each reply includes `_count: { select: { replies: true } }` — child reply count for "show N replies" UI

#### `likeReply(threadId, replyId, userId)` (lines 709-726)
- Reply existence + threadId match check
- Duplicate check → ConflictException
- Transaction: create `ThreadReplyLike` + increment `ThreadReply.likesCount`

#### `unlikeReply(threadId, replyId, userId)` (lines 728-741)
- Existing like check → NotFoundException
- Transaction: delete like + decrement likesCount (GREATEST)

#### `addReply(threadId, userId, content, parentId?)` (lines 743-793)

**Reply permission enforcement (lines 748-764):**
- Owner always allowed (bypasses all checks)
- `EVERYONE` → no check
- `FOLLOWING` → checks `Follow.findUnique({ followerId: userId, followingId: thread.userId })` — replier must follow the thread author
- `MENTIONED` → fetches replier's username, checks `thread.mentions.includes(username)`
- `NONE` → throws ForbiddenException("Replies are disabled")

**Parent reply validation (lines 766-769):**
- If `parentId` provided, validates parent exists and belongs to same thread

**Transaction (lines 771-780):**
- Creates `ThreadReply` with sanitized content + parentId
- Increments `Thread.repliesCount`

**Post-create:**
- Gamification: `award-xp` for `thread_reply_created`
- Notification: `THREAD_REPLY` to thread owner (body = first 100 chars of content)

#### `deleteReply(replyId, userId)` (lines 795-805)
- Ownership check → ForbiddenException
- Transaction: sets content to `'[deleted]'` (soft delete — preserves reply structure) + decrements `Thread.repliesCount` (GREATEST)
- **Note:** Does NOT hard-delete — preserves the reply in the chain with `[deleted]` content

#### `votePoll(optionId, userId)` (lines 807-843)
- Option existence check (includes poll)
- **Poll expiry check** (line 814): `poll.endsAt < new Date()` → BadRequestException
- Duplicate vote check (per-option) → ConflictException
- **Multi-vote check** (lines 824-829): if `!poll.allowMultiple`, checks for ANY existing vote on ANY option in the poll → ConflictException
- Transaction: create `PollVote` + increment `PollOption.votesCount` + increment `Poll.totalVotes`

#### `getUserThreads(username, cursor?, limit=20, viewerId?)` (lines 845-876)
- User lookup by username → NotFoundException
- Bidirectional block check if viewer is authenticated
- Fetches threads: `isRemoved: false`, `isChainHead: true`, scheduled filter
- Keyset pagination, ordered by `createdAt: 'desc'`

#### `report(threadId, userId, reason)` (lines 878-900)
- Thread existence check
- **Duplicate report prevention** (lines 883-886): checks `Report.findFirst` where `reporterId = userId` and `description = "thread:{threadId}"`
- Maps reason string to `ReportReason` enum: SPAM, MISINFORMATION, HATE_SPEECH → direct map; INAPPROPRIATE → OTHER; unknown → OTHER
- Creates Report record with `description: "thread:{threadId}"`

#### `dismiss(threadId, userId)` (lines 902-909)
- Upserts `FeedDismissal` with `contentType: 'THREAD'`
- Idempotent (upsert with empty update)

#### `setReplyPermission(threadId, userId, permission)` (lines 911-926)
- Thread existence + ownership check
- Validates permission is one of: `everyone`, `following`, `mentioned`, `none`
- Updates thread's `replyPermission` field (casts string to `ReplyPermission` enum)

#### `canReply(threadId, userId?)` (lines 928-963)
Returns `{ canReply: boolean, reason: string }`:
- `author` → always true (owner)
- `none` → always false (NONE permission)
- `everyone` → always true
- `following` → checks if userId follows thread.userId
- `mentioned` → checks if user's username is in thread.mentions
- `not_following` / `not_mentioned` / `unknown` → false

#### `getShareLink(threadId)` (lines 965-969)
- Thread existence check
- Returns `{ url: "https://mizanly.app/thread/{threadId}" }`

#### `isBookmarked(threadId, userId)` (lines 971-976)
- Checks `ThreadBookmark.findUnique` by composite key
- Returns `{ bookmarked: boolean }`

---

## 5. Cross-Module Dependencies

### Incoming (other modules use ThreadsService)
- Exported via `exports: [ThreadsService]` — available to any module that imports ThreadsModule

### Outgoing (ThreadsService depends on)

| Module | Service | Usage |
|--------|---------|-------|
| **Notifications** | `NotificationsService` | `create()` for MENTION, LIKE, REPOST, THREAD_REPLY notifications |
| **Gamification** | `GamificationService` | Injected but not directly called (used via QueueService) |
| **AI** | `AiService` | `moderateImage()` — pre-save image moderation in create() |
| **Moderation** | `ContentSafetyService` | `moderateText()` — pre-save text moderation in create() |
| **Common/Queue** | `QueueService` | `addGamificationJob()` for XP/streaks, `addSearchIndexJob()` for Meilisearch |
| **Common/Config** | `PrismaService` | All database operations |

### Utilities Used
- `sanitizeText` from `@/common/utils/sanitize` — XSS/injection sanitization on content, quoteText
- `extractHashtags` from `@/common/utils/hashtag` — extracts #hashtag names from content string

---

## 6. Notifications Created

| Event | Type | Recipient | Actor | Data | Lines |
|-------|------|-----------|-------|------|-------|
| Thread created with @mentions | `MENTION` | Each mentioned user (not self) | Creator | `threadId`, body: "@username mentioned you in a thread" | 418-429 |
| Thread liked | `LIKE` | Thread owner (not self) | Liker | `threadId` | 544-548 |
| Thread reposted | `REPOST` | Original thread owner | Reposter | `threadId` | 610-614 |
| Reply added | `THREAD_REPLY` | Thread owner (not self) | Replier | `threadId`, body: first 100 chars of reply | 785-790 |

All notifications fire-and-forget (`.catch()` logs errors).

---

## 7. Queue Jobs

| Job Type | Action | Triggered By | Lines |
|----------|--------|-------------|-------|
| `award-xp` | `thread_created` | `create()` | 433 |
| `update-streak` | `posting` | `create()` | 434 |
| `award-xp` | `thread_reply_created` | `addReply()` | 782 |
| `search-index-delete` | Delete from `threads` index | `delete()` | 512-514 |
| `search-index-delete` | Delete from `threads` index | `moderateThreadImage()` (BLOCK) | 995-997 |

---

## 8. Prisma Models Used

### Thread (schema.prisma lines 1248-1296)
- Table: `threads`
- PK: `id` (cuid)
- Key fields: `userId?` (nullable, SetNull on user delete), `content` (VARCHAR 500), `isChainHead` (default true), `chainId?`, `chainPosition` (default 0), `repostOfId?` (self-relation), `isQuotePost`, `quoteText?`, `visibility` (ThreadVisibility enum), `replyPermission` (ReplyPermission enum), `scheduledAt?`, `isRemoved` (soft delete)
- Counters: likesCount, repliesCount, repostsCount, quotesCount, viewsCount, bookmarksCount
- Indexes: `[userId, createdAt DESC]`, `[createdAt DESC]`, `[chainId]`, `[circleId, createdAt DESC]`, `[hashtags]`
- Relations: user, circle, reactions, replies, poll, bookmarks, notifications, reposts (self-relation)

### ThreadReaction (lines 1298-1309)
- Table: `thread_reactions`
- Composite PK: `[userId, threadId]`
- `reaction` field: `ReactionType` enum (LIKE, LOVE, SUPPORT, INSIGHTFUL) — default LIKE
- Index: `[threadId]`

### ThreadReply (lines 1311-1329)
- Table: `thread_replies`
- PK: `id` (cuid)
- Self-relation: `parentId` → `ThreadReply` ("ThreadReplyChain") — supports nested/threaded replies
- `content` VARCHAR 500, `mediaUrls` String[], `likesCount` Int
- Indexes: `[threadId, createdAt]`, `[parentId]`

### ThreadReplyLike (lines 1331-1341)
- Table: `thread_reply_likes`
- Composite PK: `[userId, replyId]`
- Index: `[replyId]`

### ThreadBookmark (lines 2159-2169)
- Table: `thread_bookmarks`
- Composite PK: `[userId, threadId]`
- Index: `[userId, createdAt DESC]`

### Poll (lines 2103-2115)
- Table: `polls`
- PK: `id` (cuid)
- `threadId` unique — one poll per thread
- Fields: question (VARCHAR 300), endsAt?, totalVotes, allowMultiple
- Relation: options (PollOption[])

### PollOption (lines 2117-2128)
- Table: `poll_options`
- PK: `id` (cuid)
- Fields: text (VARCHAR 100), votesCount, position
- Index: `[pollId]`

### PollVote (lines 2131-2141)
- Table: `poll_votes`
- Composite PK: `[userId, optionId]`
- Index: `[optionId]`

### FeedDismissal (lines 2264-2275)
- Table: `feed_dismissals`
- Unique: `[userId, contentId, contentType]`
- Used with `contentType: 'THREAD'`

### Report (used at lines 892-898)
- `reporterId`, `description: "thread:{threadId}"`, `reason: ReportReason`

---

## 9. Enums

### ThreadVisibility
```
PUBLIC | FOLLOWERS | CIRCLE
```

### ReplyPermission
```
EVERYONE | FOLLOWING | MENTIONED | NONE
```

### ReactionType
```
LIKE | LOVE | SUPPORT | INSIGHTFUL
```

### ReportReason
```
HATE_SPEECH | HARASSMENT | VIOLENCE | SPAM | MISINFORMATION | NUDITY | SELF_HARM | TERRORISM | DOXXING | COPYRIGHT
```

---

## 10. Key Logic Deep-Dive

### Chain Threading System
The Thread model supports Twitter-style thread chains via three fields:
- `isChainHead` (Boolean, default true) — whether this is the first thread in a chain
- `chainId` (String?) — shared ID linking all threads in a chain
- `chainPosition` (Int, default 0) — position within the chain

**Current usage:** All feed queries filter `isChainHead: true` to only show chain heads. The chainId and chainPosition fields are included in THREAD_SELECT but there is NO endpoint to create chain continuations — all threads created via `create()` get `isChainHead: true` by default. Chain threading is schema-ready but not wired in the API.

### Repost/Quote Mechanics
Two types of sharing:
1. **Repost** (`POST :id/repost`): Creates a new Thread with empty content, `repostOfId` set to original. The repost is its own `isChainHead: true` entry visible in feeds. `repostsCount` on original is incremented.
2. **Quote Post** (via `create()` with `isQuotePost: true`): Creates a new Thread with `quoteText` commentary and `repostOfId` linking to quoted thread. `quotesCount` on original is NOT explicitly incremented in create() — only `repostsCount` is updated on the original when `repostOfId` is set. **Potential gap:** quotesCount is never incremented.

### Reply Permission Enforcement
The `replyPermission` field on Thread controls who can reply:
- **Enforcement in `addReply()`** (lines 748-764): Checked before creating the reply
- **Pre-flight check via `canReply()`** (lines 928-963): Returns boolean without side effects, for UI

Direction semantics:
- `FOLLOWING`: The replier must follow the thread author (`followerId: replier, followingId: author`). This is the correct X/Twitter semantic — "people I follow can reply."
- `MENTIONED`: Checks `thread.mentions.includes(replier.username)` — mentions stored as username strings

### Poll Integration
- Poll is **inline** within thread creation — NOT a separate endpoint for poll creation
- Poll options limited to 4 (`@ArrayMaxSize(4)` on DTO)
- Voting is by option ID, not poll ID (`POST /threads/polls/:optionId/vote`)
- Multi-vote logic: if `allowMultiple: false`, checks ALL options in the poll for ANY existing vote
- Poll expiry: `endsAt` checked at vote time, NOT retroactively

### scheduledAt
- Stored as `DateTime?` on Thread
- Feed queries use: `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]`
- This pattern is applied in: getFeed (foryou), getFeed (following), getTrendingThreads, getBlendedThreadFeed, getUserThreads
- **Note:** Owner's own scheduled threads are also hidden from their profile feed (getUserThreads uses same filter) — see Session 5 bug #6

### Bookmark System
- Separate `ThreadBookmark` join table with composite PK `[userId, threadId]`
- `bookmarksCount` counter on Thread maintained via transactions
- Three endpoints: bookmark, unbookmark, isBookmarked
- Bookmark status also returned in `getById()` for authenticated viewers

### Feed Dismissal
- Uses generic `FeedDismissal` model with `contentType: 'THREAD'`
- Upsert (idempotent) — dismissing twice is safe
- **Note:** Dismissed threads are NOT filtered from feed queries currently — the dismissal is recorded but not applied

### Soft Delete Pattern
- Threads: `isRemoved: true` (not hard deleted)
- Replies: content set to `'[deleted]'` (preserves structure in chain)
- All feed/detail queries check `isRemoved: false`

### Counter Safety
All decrement operations use `GREATEST(count - 1, 0)` via `$executeRaw` to prevent negative counts.

### Content Moderation Pipeline
1. **Text moderation** (pre-save): `ContentSafetyService.moderateText()` → blocks thread creation if unsafe
2. **Image moderation** (pre-save): `AiService.moderateImage()` → blocks thread creation if classification is BLOCK
3. **Image moderation** (post-save, unused path): `moderateThreadImage()` → sets isRemoved or isSensitive (private method, not called from create)

---

## 11. Scoring Algorithms Summary

### For You Feed
```
engagement = (likes * 3) + (replies * 5) + (reposts * 4)
score = engagement / (ageHours ^ 1.5)
```
- Window: 72 hours
- Fetch: 200, score in-memory, sort, paginate
- Replies weighted highest (5x) — conversation-driving content wins

### Trending Feed
```
replyDepthScore = replies * 3
engagement = (likes * 1.0) + replyDepthScore + (reposts * 2.0) + (quotes * 2.5)
score = engagement / ageHours
```
- Window: 7 days
- Fetch: 200, score in-memory, sort, paginate
- Linear decay (no exponent) — slower decay than For You
- Quotes weighted highest (2.5x) — sparking new conversations valued

### Following Feed
- **0 follows:** Falls back to Trending
- **< 10 follows:** 50/50 interleaved blend of Following + Trending
- **>= 10 follows:** Pure chronological from followed users + self

---

## 12. Known Issues / Gaps

1. **quotesCount never incremented:** When creating a quote post (isQuotePost: true with repostOfId), the original thread's quotesCount is not updated. Only `repostsCount` is incremented on the original in the `repost()` method, but `create()` with `repostOfId` does not touch the original thread at all.

2. **updateThread() unreachable:** The method exists (lines 476-487) but no controller endpoint maps to it. Threads cannot be edited via API.

3. **Chain threading incomplete:** `chainId` and `chainPosition` fields exist in schema and THREAD_SELECT but no API endpoint creates chain continuations. All threads are `isChainHead: true`.

4. **FeedDismissal not applied:** `dismiss()` records dismissals but feed queries don't filter dismissed content.

5. **moderateThreadImage() orphaned:** Private method exists for post-save moderation but is never called — pre-save moderation in `create()` handles the same use case.

6. **Owner can't see own scheduled threads:** `getUserThreads()` uses the same `scheduledAt` filter that hides scheduled content, meaning the thread owner can't see their own upcoming scheduled threads on their profile.

7. **Report description format:** Reports use `description: "thread:{threadId}"` (string encoding) rather than a typed `threadId` FK — relies on string parsing for report resolution.

8. **Pagination inconsistency:** For You feed uses offset-based pagination (cursor is an integer offset), while Following and Trending use keyset pagination (cursor is thread ID). This means For You can show duplicates if new content is inserted between pages.
