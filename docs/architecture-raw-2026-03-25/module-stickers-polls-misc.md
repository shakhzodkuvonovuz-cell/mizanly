# Module Group: Stickers, Polls, Bookmarks, Collabs, Story Chains, Reel Templates, Video Replies

> Extracted from `apps/api/src/modules/{stickers,polls,bookmarks,collabs,story-chains,reel-templates,video-replies}/`
> Every endpoint, service method, DTO field, and Prisma model documented with line numbers.

---

## 1. STICKERS MODULE

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `stickers.module.ts` | 1-10 | NestJS module — exports StickersService |
| `stickers.controller.ts` | 1-153 | 13 endpoints: CRUD packs, AI generation, Islamic presets, user library |
| `stickers.service.ts` | 1-423 | Business logic: pack CRUD, AI SVG generation via Claude, fallback sticker, content moderation |
| `dto/create-pack.dto.ts` | 1-40 | CreateStickerPackDto + StickerItemDto |
| `stickers.controller.spec.ts` | 1-136 | 10 controller tests |
| `stickers.service.spec.ts` | 1-148 | 14 service tests |
| `stickers.service.edge.spec.ts` | 1-49 | 3 edge case tests |

### Prisma Models

**StickerPack** (schema.prisma L2360-2373, table: `sticker_packs`)
```
id            String    @id @default(cuid())
name          String    @db.VarChar(100)
coverUrl      String?
stickersCount Int       @default(0)
isFree        Boolean   @default(true)
ownerId       String?
createdAt     DateTime  @default(now())
stickers      Sticker[]
users         UserStickerPack[]
@@index([ownerId])
```

**Sticker** (schema.prisma L2375-2386, table: `stickers`)
```
id        String      @id @default(cuid())
packId    String
pack      StickerPack @relation(...)
url       String
name      String?     @db.VarChar(50)
position  Int         @default(0)
createdAt DateTime    @default(now())
@@index([packId])
```

**UserStickerPack** (schema.prisma L2388-2398, table: `user_sticker_packs`)
```
userId  String
packId  String
addedAt DateTime    @default(now())
user    User        @relation(...)
pack    StickerPack @relation(...)
@@id([userId, packId])
```

**GeneratedSticker** (schema.prisma L2400-2411, table: `generated_stickers`)
```
id        String   @id @default(cuid())
userId    String
user      User     @relation("generatedStickers", ...)
imageUrl  String
prompt    String
style     String   @default("cartoon")
createdAt DateTime @default(now())
@@index([userId, createdAt(sort: Desc)])
```

### DTOs

**CreateStickerPackDto** (`dto/create-pack.dto.ts` L18-40)
| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `name` | string | `@IsString()`, `@MaxLength(100)` | Pack name |
| `coverUrl` | string? | `@IsOptional()`, `@IsUrl()` | Cover image URL |
| `isFree` | boolean? | `@IsBoolean()`, `@IsOptional()` | Default true |
| `stickers` | StickerItemDto[] | `@IsArray()`, `@ArrayMaxSize(100)`, `@ValidateNested` | List of stickers |

**StickerItemDto** (`dto/create-pack.dto.ts` L5-16)
| Field | Type | Validation |
|-------|------|------------|
| `url` | string | `@IsString()`, `@MaxLength(500000)` |
| `name` | string? | `@IsString()`, `@IsOptional()`, `@MaxLength(50)` |

**GenerateStickerDto** (inline in controller L11-23)
| Field | Type | Validation |
|-------|------|------------|
| `prompt` | string | `@IsString()`, `@MinLength(3)`, `@MaxLength(200)` |
| `style` | enum? | `@IsOptional()`, `@IsIn(['cartoon','calligraphy','emoji','geometric','kawaii'])` |

### Endpoints

| # | Method | Route | Guard | Throttle | Controller L# | Service Method | Description |
|---|--------|-------|-------|----------|---------------|----------------|-------------|
| 1 | POST | `/stickers/packs` | ClerkAuthGuard | 5/60s | L30-37 | `createPack(dto, userId)` | Create sticker pack |
| 2 | GET | `/stickers/packs` | OptionalClerkAuth | default | L39-44 | `browsePacks(cursor)` | Browse all packs, cursor pagination |
| 3 | GET | `/stickers/packs/featured` | OptionalClerkAuth | default | L46-51 | `getFeaturedPacks()` | Top 10 free packs by sticker count |
| 4 | GET | `/stickers/packs/search` | OptionalClerkAuth | default | L53-58 | `searchPacks(query)` | Search packs by name (ILIKE) |
| 5 | GET | `/stickers/packs/:id` | OptionalClerkAuth | default | L60-65 | `getPack(id)` | Get pack with all stickers |
| 6 | DELETE | `/stickers/packs/:id` | ClerkAuthGuard | default | L67-74 | `deletePack(id, userId)` | Delete pack (ADMIN only) |
| 7 | GET | `/stickers/my` | ClerkAuthGuard | default | L76-82 | `getMyPacks(userId)` | Get user's collected packs |
| 8 | GET | `/stickers/my/recent` | ClerkAuthGuard | default | L84-90 | `getRecentStickers(userId)` | Recent stickers from user's packs |
| 9 | POST | `/stickers/my/:packId` | ClerkAuthGuard | default | L92-99 | `addToCollection(userId, packId)` | Add pack to user's library |
| 10 | DELETE | `/stickers/my/:packId` | ClerkAuthGuard | default | L101-108 | `removeFromCollection(userId, packId)` | Remove pack from library |
| 11 | POST | `/stickers/generate` | ClerkAuthGuard | 10/day | L112-122 | `generateSticker(userId, prompt, style)` | AI sticker generation |
| 12 | POST | `/stickers/save/:stickerId` | ClerkAuthGuard | default | L124-134 | `saveGeneratedSticker(userId, stickerId)` | Save generated sticker to "My Stickers" pack |
| 13 | GET | `/stickers/generated` | ClerkAuthGuard | default | L136-145 | `getMyGeneratedStickers(userId, cursor)` | List user's generated stickers |
| 14 | GET | `/stickers/islamic-presets` | OptionalClerkAuth | default | L147-152 | `getIslamicPresetStickers()` | 20 hardcoded Islamic calligraphy/geometric presets |

### Service Methods (Detail)

**`createPack(data, userId?)`** — `stickers.service.ts` L30-45
- Creates StickerPack with nested `createMany` for stickers
- Sets `stickersCount` from array length
- Stickers ordered by `position` (array index)

**`getPack(packId)`** — L47-54
- Finds pack by ID with stickers ordered by position
- Throws `NotFoundException` if not found

**`browsePacks(cursor?, limit=20)`** — L56-65
- Cursor-based keyset pagination
- Ordered by `createdAt desc`
- Returns `{ data, meta: { cursor, hasMore } }`

**`searchPacks(query)`** — L67-74
- Returns empty `[]` for empty/whitespace-only queries (L69)
- Case-insensitive contains search on `name`
- Max 20 results

**`addToCollection(userId, packId)`** — L76-83
- Validates pack exists via `getPack()`
- Upserts `UserStickerPack` — idempotent

**`removeFromCollection(userId, packId)`** — L85-98
- Deletes `UserStickerPack`
- Handles P2025 (not found) -> `NotFoundException`

**`getMyPacks(userId)`** — L100-108
- Returns up to 50 packs the user has collected
- Ordered by `addedAt desc`
- Maps `userStickerPack.pack` to flat pack array

**`getRecentStickers(userId)`** — L110-125
- Gets 10 most recent user packs
- Returns up to 30 stickers from those packs
- Returns `[]` if user has no packs

**`getFeaturedPacks()`** — L127-133
- Top 10 free packs ordered by `stickersCount desc`

**`deletePack(packId, userId?)`** — L135-155
- If `userId` provided, checks `user.role === 'ADMIN'`
- Non-admin gets `BadRequestException('Not authorized')`
- Handles P2025 -> `NotFoundException`

**`generateSticker(userId, prompt, style)`** — L164-227
- **Content moderation**: Checks prompt against 29 BLOCKED_TERMS (L9-19) — covers NSFW, violence, drugs, alcohol, gambling, religious sensitivity, hate speech
- **Rate limiting**: Counts `GeneratedSticker` records for today; max 10/day per user
- **AI generation**: Calls Claude API (`claude-haiku-4-5-20251001` model) to generate SVG (L341-379)
  - System prompt specifies 512x512 viewBox, style-specific instructions
  - Extracts `<svg>` from response with regex
  - **SVG sanitization** (L382-395): strips `<script>`, event handlers (`on*=`), `javascript:`/`data:` URIs, `<foreignObject>`, `<embed>`, `<object>`, `<iframe>`
- **Fallback**: Generates simple SVG circle with prompt text if no API key (L397-422)
  - XML-escapes text to prevent SVG injection
- Returns `{ id, imageUrl, prompt, style }` — imageUrl is base64 data URI

**`saveGeneratedSticker(userId, stickerId)`** — L232-280
- Verifies ownership of generated sticker
- **Atomic transaction**: finds/creates "My Stickers - {userId}" pack
- Position derived from `tx.sticker.count()` inside transaction to prevent races
- Atomically increments `stickersCount`

**`getMyGeneratedStickers(userId, cursor?)`** — L285-304
- Cursor-based pagination, 20 per page
- Returns `{ data, meta: { cursor, hasMore } }`

**`getIslamicPresetStickers()`** — L309-337
- Returns 20 hardcoded presets (NOT from database)
- Categories: praise (5), celebration (3), greeting (1), thanks (1), opening (1), hope (1), faith (1), forgiveness (1), blessings (1), trust (1), patience (1), gratitude (1), symbol (3)
- Styles: calligraphy (12), geometric (5), kawaii (3)

### Sticker Styles (5 options)
| Style | AI Prompt Description | Fallback Colors |
|-------|----------------------|-----------------|
| cartoon | cute cartoon, bold outlines, bright colors | bg: #FFE4B5, fg: #D2691E |
| calligraphy | elegant Arabic-inspired calligraphy, decorative borders | bg: #1C2333, fg: #C8963E |
| emoji | emoji-like round design, expressive features | bg: #FFF8DC, fg: #FF6347 |
| geometric | Islamic geometric pattern, interlocking shapes | bg: #0A7B4F, fg: #C8963E |
| kawaii | Japanese kawaii, big eyes, pastel colors | bg: #FFB6C1, fg: #FF69B4 |

### Test Coverage
- **Controller**: 10 tests (stickers.controller.spec.ts) — delegates to service correctly
- **Service**: 14 tests (stickers.service.spec.ts) — createPack, getPack, addToCollection, removeFromCollection, browse, myPacks, search, recent, featured, delete
- **Edge**: 3 tests (stickers.service.edge.spec.ts) — not found pack, empty browse, empty search query

---

## 2. POLLS MODULE

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `polls.module.ts` | 1-10 | NestJS module — exports PollsService |
| `polls.controller.ts` | 1-91 | 4 endpoints: get poll, vote, retract, voters |
| `polls.service.ts` | 1-248 | Vote/retract logic with atomic transactions, expiry checks |
| `polls.controller.spec.ts` | 1-85 | 5 controller tests |
| `polls.service.spec.ts` | 1-307 | 12 service tests |
| `polls.service.edge.spec.ts` | 1-92 | 6 edge case tests |

### Prisma Models

**Poll** (schema.prisma L2103-2115, table: `polls`)
```
id            String       @id @default(cuid())
threadId      String       @unique
thread        Thread       @relation(...)
question      String       @db.VarChar(300)
endsAt        DateTime?
totalVotes    Int          @default(0)
allowMultiple Boolean      @default(false)
createdAt     DateTime     @default(now())
options       PollOption[]
```

**PollOption** (schema.prisma L2117-2129, table: `poll_options`)
```
id         String     @id @default(cuid())
pollId     String
poll       Poll       @relation(...)
text       String     @db.VarChar(100)
votesCount Int        @default(0)
position   Int        @default(0)
createdAt  DateTime   @default(now())
votes      PollVote[]
@@index([pollId])
```

**PollVote** (schema.prisma L2131-2141, table: `poll_votes`)
```
userId    String
optionId  String
createdAt DateTime   @default(now())
user      User       @relation(...)
option    PollOption @relation(...)
@@id([userId, optionId])     -- composite PK
@@index([optionId])
```

### DTOs

**VoteDto** (inline in controller L22-25)
| Field | Type | Validation |
|-------|------|------------|
| `optionId` | string | `@IsString()` |

### Endpoints

| # | Method | Route | Guard | Throttle | Controller L# | Service Method | Description |
|---|--------|-------|-------|----------|---------------|----------------|-------------|
| 1 | GET | `/polls/:id` | OptionalClerkAuth | default | L32-42 | `getPoll(pollId, userId?)` | Get poll with options, percentages, user's vote |
| 2 | POST | `/polls/:id/vote` | ClerkAuthGuard | 10/60s | L44-59 | `vote(pollId, optionId, userId)` | Cast a vote |
| 3 | DELETE | `/polls/:id/vote` | ClerkAuthGuard | default | L61-73 | `retractVote(pollId, userId)` | Retract (undo) a vote |
| 4 | GET | `/polls/:id/voters` | ClerkAuthGuard | default | L75-90 | `getVoters(pollId, optionId, cursor?)` | Paginated voter list for an option |

### Service Methods (Detail)

**`getPoll(pollId, userId?)`** — `polls.service.ts` L15-70
- Includes options (ordered by position) and thread context
- Calculates `percentage` for each option: `(votesCount / totalVotes) * 100`
- If userId provided, queries `PollVote` to find user's votes
- Returns `userVotedOptionId` (first vote) and `userVotedOptionIds` (all votes for multi-choice)
- Returns `isExpired: boolean` based on `endsAt`

**`vote(pollId, optionId, userId)`** — L72-156
- Validates poll exists and option belongs to poll (L74-94)
- **Expiry check**: rejects votes on expired polls (L88-90)
- **Duplicate prevention**:
  - Single-choice: rejects if any vote exists in this poll (L108-111)
  - Multi-choice: allows voting on different options, rejects same option twice (L112-118)
- **Atomic transaction** (L123-147): creates PollVote + increments PollOption.votesCount + increments Poll.totalVotes
- **Race condition handling**: catches P2002 (unique constraint violation) -> ConflictException (L149-151)

**`retractVote(pollId, userId)`** — L158-194
- Validates poll exists and is not expired
- Finds user's vote via `pollVote.findFirst` with `option.pollId` filter
- **Atomic transaction** (L180-191): deletes vote + uses raw SQL `GREATEST(count - 1, 0)` to prevent negative counts
- Throws `BadRequestException` if user hasn't voted

**`getVoters(pollId, optionId, cursor?)`** — L196-247
- Validates poll and option exist
- Cursor-based pagination (20 per page) using composite cursor `userId_optionId`
- Returns user profiles: `{ id, username, displayName, avatarUrl }`
- Ordered by `createdAt desc`

### Test Coverage
- **Controller**: 5 tests — getPoll, vote, retractVote, getVoters, getVoters missing optionId
- **Service**: 12 tests — getPoll with/without userId, vote success/not-found/invalid-option/already-voted, retractVote success/not-voted, getVoters with/without cursor/not-found
- **Edge**: 6 tests — not found poll, expired poll voting, Arabic text, retract non-existent vote, empty voters list

---

## 3. BOOKMARKS MODULE

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `bookmarks.module.ts` | 1-10 | NestJS module — exports BookmarksService |
| `bookmarks.controller.ts` | 1-155 | 14 endpoints: save/unsave/list/status for posts, threads, videos + collections |
| `bookmarks.service.ts` | 1-415 | Cross-content bookmark logic with atomic count management |
| `dto/bookmark.dto.ts` | 1-21 | SavePostDto + MoveCollectionDto |
| `bookmarks.controller.spec.ts` | 1-43 | 5 controller tests |
| `bookmarks.service.spec.ts` | 1-313 | 15 service tests |
| `bookmarks.service.edge.spec.ts` | 1-108 | 6 edge case tests |
| `bookmarks.service.auth.spec.ts` | 1-86 | 6 authorization matrix tests |

### Prisma Models

**SavedPost** (schema.prisma L1582-1593, table: `saved_posts`)
```
userId         String
postId         String
collectionName String   @default("default")
createdAt      DateTime @default(now())
user           User     @relation(...)
post           Post     @relation(...)
@@id([userId, postId])    -- composite PK
@@index([userId, createdAt(sort: Desc)])
```

**ThreadBookmark** (schema.prisma L2159-2169, table: `thread_bookmarks`)
```
userId    String
threadId  String
createdAt DateTime @default(now())
user      User     @relation(...)
thread    Thread   @relation(...)
@@id([userId, threadId])    -- composite PK
@@index([userId, createdAt(sort: Desc)])
```

**VideoBookmark** (schema.prisma L2171-2181, table: `video_bookmarks`)
```
userId    String
videoId   String
createdAt DateTime @default(now())
user      User     @relation(...)
video     Video    @relation(...)
@@id([userId, videoId])    -- composite PK
@@index([userId, createdAt(sort: Desc)])
```

### DTOs

**SavePostDto** (`dto/bookmark.dto.ts` L4-14)
| Field | Type | Validation | Default |
|-------|------|------------|---------|
| `postId` | string | `@IsString()` | required |
| `collectionName` | string? | `@IsOptional()`, `@IsString()`, `@MaxLength(50)` | `'default'` |

**MoveCollectionDto** (`dto/bookmark.dto.ts` L16-21)
| Field | Type | Validation |
|-------|------|------------|
| `collectionName` | string | `@IsString()`, `@MaxLength(50)` |

### Endpoints

All endpoints require `ClerkAuthGuard`. Global throttle: 30/60s.

| # | Method | Route | Controller L# | Service Method | Description |
|---|--------|-------|---------------|----------------|-------------|
| **Posts** | | | | | |
| 1 | POST | `/bookmarks/posts` | L41-44 | `savePost(userId, postId, collectionName)` | Save post to collection |
| 2 | GET | `/bookmarks/posts` | L47-57 | `getSavedPosts(userId, collection?, cursor?, limit?)` | Get saved posts |
| 3 | GET | `/bookmarks/posts/:postId/status` | L60-64 | `isPostSaved(userId, postId)` | Check if post is saved |
| 4 | PATCH | `/bookmarks/posts/:postId/move` | L67-75 | `moveToCollection(userId, postId, collectionName)` | Move post between collections |
| 5 | DELETE | `/bookmarks/posts/:postId` | L78-83 | `unsavePost(userId, postId)` | Remove saved post |
| **Threads** | | | | | |
| 6 | GET | `/bookmarks/threads` | L88-96 | `getSavedThreads(userId, cursor?, limit?)` | Get saved threads |
| 7 | GET | `/bookmarks/threads/:threadId/status` | L99-103 | `isThreadSaved(userId, threadId)` | Check if thread saved |
| 8 | POST | `/bookmarks/threads/:threadId` | L106-109 | `saveThread(userId, threadId)` | Save thread |
| 9 | DELETE | `/bookmarks/threads/:threadId` | L112-118 | `unsaveThread(userId, threadId)` | Unsave thread |
| **Videos** | | | | | |
| 10 | GET | `/bookmarks/videos` | L123-131 | `getSavedVideos(userId, cursor?, limit?)` | Get saved videos |
| 11 | GET | `/bookmarks/videos/:videoId/status` | L134-138 | `isVideoSaved(userId, videoId)` | Check if video saved |
| 12 | POST | `/bookmarks/videos/:videoId` | L141-145 | `saveVideo(userId, videoId)` | Save video |
| 13 | DELETE | `/bookmarks/videos/:videoId` | L148-153 | `unsaveVideo(userId, videoId)` | Unsave video |
| **Collections** | | | | | |
| 14 | GET | `/bookmarks/collections` | L33-36 | `getCollections(userId)` | List all collection names + counts |

### Service Methods (Detail)

**`savePost(userId, postId, collectionName='default')`** — `bookmarks.service.ts` L15-62
- Validates post exists (`isRemoved: false`)
- Checks for existing saved post (L26-27)
- If already saved with different collection: updates collection name (L32-38)
- If already saved with same collection: returns existing (idempotent)
- New save: **atomic transaction** — creates SavedPost + increments `post.savesCount` (L42-50)
- **Race condition handling**: catches P2002 -> returns existing record (L53-59)

**`unsavePost(userId, postId)`** — L65-93
- **Interactive transaction** (L67-85):
  - Deletes SavedPost record
  - Decrements `post.savesCount`
  - Clamps to 0 with `updateMany` where `savesCount < 0` (prevents negative)
- Handles P2025 -> `NotFoundException('Post not saved')`

**`saveThread(userId, threadId)`** — L96-124
- Validates thread exists (`isRemoved: false`)
- **Atomic transaction**: creates ThreadBookmark + increments `thread.bookmarksCount`
- P2002 -> returns existing (idempotent)

**`unsaveThread(userId, threadId)`** — L127-142
- **Batch transaction**: deletes ThreadBookmark + raw SQL `GREATEST(bookmarksCount - 1, 0)`
- P2025 -> `NotFoundException`

**`saveVideo(userId, videoId)`** — L145-173
- Validates video exists (`isRemoved: false`)
- **Atomic transaction**: creates VideoBookmark + increments `video.savesCount`
- P2002 -> returns existing (idempotent)

**`unsaveVideo(userId, videoId)`** — L176-199
- **Interactive transaction**: deletes VideoBookmark + decrements + clamps to 0
- P2025 -> `NotFoundException`

**`getSavedPosts(userId, collectionName?, cursor?, limit=20)`** — L202-253
- Optional collection filter
- Cursor-based pagination using composite cursor `userId_postId`
- Includes post data: content, media, thumbnails, engagement counts, user profile (id, username, displayName, avatarUrl, isVerified)
- Returns `{ data: Post[], meta: { cursor, hasMore } }`

**`getSavedThreads(userId, cursor?, limit=20)`** — L256-301
- Cursor: composite `userId_threadId`
- Includes thread: content, media, likes, replies, user profile

**`getSavedVideos(userId, cursor?, limit=20)`** — L304-360
- Cursor: composite `userId_videoId`
- Includes video: title, description, thumbnail, duration, views, likes, saves, user profile, channel info (id, name, avatarUrl)

**`getCollections(userId)`** — L363-373
- Uses `groupBy` on `collectionName` with `_count.postId`
- Returns `Array<{ name: string, count: number }>`
- NOTE: Collections are implicit (no separate Collection model) — just distinct collectionName values on SavedPost

**`moveToCollection(userId, postId, collectionName)`** — L376-386
- Finds existing SavedPost or throws NotFoundException
- Updates `collectionName` field

**`isPostSaved(userId, postId)`** — L389-395
- Returns `{ saved: boolean, collectionName?: string }`

**`isThreadSaved(userId, threadId)`** — L398-404
- Returns `{ saved: boolean }`

**`isVideoSaved(userId, videoId)`** — L407-413
- Returns `{ saved: boolean }`

### Key Design Patterns
1. **Cross-content bookmarks**: Three separate join tables (SavedPost, ThreadBookmark, VideoBookmark) rather than a polymorphic bookmark table
2. **Collections are post-only**: Only `SavedPost` has `collectionName`; threads and videos have flat bookmarks
3. **Atomic count management**: Save/unsave always atomically increment/decrement the parent entity's count
4. **Negative count prevention**: Uses `GREATEST(count - 1, 0)` in raw SQL or clamp-to-0 updateMany

### Test Coverage
- **Controller**: 5 tests — definition, route prefix, save post, check status, get collections
- **Service**: 15 tests — savePost (success, not found, update collection), unsavePost (success, P2025), saveThread (success, not found), unsaveThread, saveVideo (success, not found), unsaveVideo, getSavedPosts (paginated, collection filter), getCollections, moveToCollection (success, not found), isPostSaved (true, false)
- **Edge**: 6 tests — not found post, unsave not-saved, empty posts, empty threads, empty collections, not-saved status
- **Auth**: 6 tests — own bookmarks isolation (posts, threads, videos), per-user status, own collections, not-found post save

---

## 4. COLLABS MODULE (Post Collaborations)

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `collabs.module.ts` | 1-10 | NestJS module — exports CollabsService |
| `collabs.controller.ts` | 1-62 | 7 endpoints: invite, accept, decline, remove, pending, accepted, post collabs |
| `collabs.service.ts` | 1-111 | Invitation workflow with ownership checks |
| `dto/invite-collab.dto.ts` | 1-12 | InviteCollabDto |
| `collabs.controller.spec.ts` | 1-103 | 7 controller tests |
| `collabs.service.spec.ts` | 1-107 | 9 service tests |

### Prisma Models

**PostCollab** (schema.prisma L2468-2480, table: `post_collabs`)
```
id        String       @id @default(cuid())
postId    String
userId    String       -- the invited collaborator (NOT the post owner)
status    CollabStatus @default(PENDING)
createdAt DateTime     @default(now())
post      Post         @relation(...)
user      User         @relation(...)
@@unique([postId, userId])
@@index([userId])
```

**CollabStatus enum** (schema.prisma L219-223)
```
PENDING
ACCEPTED
DECLINED
```

### DTOs

**InviteCollabDto** (`dto/invite-collab.dto.ts` L4-12)
| Field | Type | Validation |
|-------|------|------------|
| `postId` | string | `@IsString()` |
| `targetUserId` | string | `@IsString()` |

### Endpoints

All endpoints require `ClerkAuthGuard`. Global throttle: 30/60s.

| # | Method | Route | Controller L# | Service Method | Description |
|---|--------|-------|---------------|----------------|-------------|
| 1 | GET | `/collabs/pending` | L17-21 | `getMyPending(userId)` | Get my pending collab invites |
| 2 | GET | `/collabs/accepted` | L23-27 | `getAcceptedCollabs(userId, cursor?)` | Get my accepted collabs |
| 3 | GET | `/collabs/post/:postId` | L29-33 | `getPostCollabs(postId)` | Get collaborators on a post |
| 4 | POST | `/collabs/invite` | L35-39 | `invite(userId, postId, targetUserId)` | Invite user to collaborate |
| 5 | POST | `/collabs/:id/accept` | L41-46 | `accept(id, userId)` | Accept collab invite |
| 6 | POST | `/collabs/:id/decline` | L48-53 | `decline(id, userId)` | Decline collab invite |
| 7 | DELETE | `/collabs/:id` | L55-60 | `remove(id, userId)` | Remove collaboration |

### Service Methods (Detail)

**`invite(userId, postId, targetUserId)`** — `collabs.service.ts` L9-31
- **Self-invite prevention**: `userId === targetUserId` -> `BadRequestException`
- **Ownership check**: Only post owner can invite (`post.userId !== userId` -> ForbiddenException)
- Creates PostCollab with `status: PENDING`
- Includes user profile and post preview in response
- **Race condition handling**: P2002 -> `ConflictException('User already invited')`

**`accept(collabId, userId)`** — L33-42
- Verifies collab exists and belongs to accepting user
- Only PENDING collabs can be accepted (`status !== PENDING` -> BadRequestException)
- Updates status to `ACCEPTED`

**`decline(collabId, userId)`** — L44-52
- Verifies collab exists and belongs to declining user
- Updates status to `DECLINED`
- NOTE: No status check — can decline even if already accepted

**`remove(collabId, userId)`** — L54-66
- **Dual authorization**: either the invited user OR the post owner can remove
- If not the invited user, looks up the post to verify caller is post owner
- Hard deletes the PostCollab record

**`getMyPending(userId)`** — L68-79
- Returns up to 50 pending invites for the user
- Includes post content, media, and post owner profile
- Ordered by `createdAt desc`

**`getPostCollabs(postId)`** — L81-88
- Returns all collabs for a post (any status)
- Includes collaborator profiles with `isVerified`
- Ordered by `createdAt asc`, max 50

**`getAcceptedCollabs(userId, cursor?, limit=20)`** — L90-104
- Cursor-based pagination using `id < cursor`
- Filters by `status: ACCEPTED`
- Includes post content, media, creation date, and post owner profile
- Returns `{ data, meta: { cursor, hasMore } }`

### Test Coverage
- **Controller**: 7 tests — defined, invite, accept, decline, remove, pending, accepted, postCollabs
- **Service**: 9 tests — invite (success, self-invite, non-owner, P2002 duplicate), accept (success, wrong user), decline, remove, getPostCollabs (with/without collabs), getAcceptedCollabs

---

## 5. STORY CHAINS MODULE ("Add Yours" Chains)

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `story-chains.module.ts` | 1-11 | NestJS module — exports StoryChainsService |
| `story-chains.controller.ts` | 1-79 | 5 endpoints: create, trending, get chain, join, stats |
| `story-chains.service.ts` | 1-200 | Chain lifecycle with transactional joins |
| `story-chains.controller.spec.ts` | 1-92 | 5 controller tests |
| `story-chains.service.spec.ts` | 1-194 | 16 service tests |

### Prisma Models

**StoryChain** (schema.prisma L2778-2792, table: `story_chains`)
```
id               String            @id @default(cuid())
prompt           String            @db.VarChar(300)
coverUrl         String?
createdById      String
createdBy        User              @relation("storyChains", ...)
participantCount Int               @default(0)
viewsCount       Int               @default(0)
createdAt        DateTime          @default(now())
entries          StoryChainEntry[]
@@index([participantCount(sort: Desc)])
@@index([createdById])
```

**StoryChainEntry** (schema.prisma L2794-2808, table: `story_chain_entries`)
```
id        String     @id @default(cuid())
chainId   String
chain     StoryChain @relation(...)
storyId   String
story     Story      @relation(...)
userId    String
user      User       @relation("storyChainEntries", ...)
createdAt DateTime   @default(now())
@@unique([chainId, userId])   -- one entry per user per chain
@@index([chainId])
@@index([storyId])
```

### DTOs (inline in controller)

**CreateChainDto** (controller L19-21)
| Field | Type | Validation |
|-------|------|------------|
| `prompt` | string | `@IsString()`, `@MaxLength(300)` |
| `coverUrl` | string? | `@IsOptional()`, `@IsUrl()` |

**JoinChainDto** (controller L23-25)
| Field | Type | Validation |
|-------|------|------------|
| `storyId` | string | `@IsString()`, `@MaxLength(50)` |

### Endpoints

Global throttle: 60/60s.

| # | Method | Route | Guard | Controller L# | Service Method | Description |
|---|--------|-------|-------|---------------|----------------|-------------|
| 1 | POST | `/story-chains` | ClerkAuthGuard | L33-42 | `createChain(userId, body)` | Create new story chain |
| 2 | GET | `/story-chains/trending` | OptionalClerkAuth | L44-49 | `getTrending(cursor?)` | Get trending chains (7-day window) |
| 3 | GET | `/story-chains/:chainId` | OptionalClerkAuth | L51-59 | `getChain(chainId, cursor?)` | Get chain with paginated entries |
| 4 | POST | `/story-chains/:chainId/join` | ClerkAuthGuard | L61-71 | `joinChain(chainId, userId, storyId)` | Join chain with your story |
| 5 | GET | `/story-chains/:chainId/stats` | OptionalClerkAuth | L73-78 | `getStats(chainId)` | Get chain statistics |

### Service Methods (Detail)

**`createChain(userId, data)`** — `story-chains.service.ts` L12-28
- Validates prompt: non-empty, max 300 chars (trims whitespace)
- Creates StoryChain with `createdById: userId`

**`getTrending(cursor?, limit=20)`** — L30-55
- **7-day window**: only chains created within last 7 days
- **Trending sort**: primary `participantCount desc`, secondary `createdAt desc`
- Cursor-based pagination using `id < cursor`
- Returns `{ data, meta: { cursor, hasMore } }`

**`getChain(chainId, cursor?, limit=20)`** — L57-127
- Returns chain metadata + paginated entries
- Entries cursor: `id > cursor` (ascending by id)
- **Efficient hydration**: batch-fetches stories and users with `Promise.all` + Map lookup
  - Stories: `id, mediaUrl, mediaType, thumbnailUrl, viewsCount, createdAt`
  - Users: `id, username, displayName, avatarUrl, isVerified`
- Returns `{ chain, entries: { data: [...with story + user], meta: { cursor, hasMore } } }`

**`joinChain(chainId, userId, storyId)`** — L129-181
- Validates chain exists, story exists, and story belongs to user
- **Transactional upsert** (L153-178):
  - Upserts StoryChainEntry on composite unique `[chainId, userId]`
  - If updating existing entry: replaces storyId (user can change their story)
  - **New entry detection**: checks if `createdAt` is within last 1 second (L169)
  - Only increments `participantCount` for genuinely new entries
- NOTE: The new-entry detection heuristic (`createdAt > Date.now() - 1000`) is approximate and could miss edge cases with clock skew

**`getStats(chainId)`** — L183-198
- Returns `{ participantCount, viewsCount, createdAt, createdBy }`
- Throws NotFoundException if chain doesn't exist

### Test Coverage
- **Controller**: 5 tests — createChain, getTrending, getChain, joinChain, getStats
- **Service**: 16 tests — createChain (success, empty prompt, too long), getTrending (basic, pagination hasMore, empty, cursor pass-through), getChain (with entries, not found, entries pagination), joinChain (transaction, increment new, no increment existing, story not yours, chain not found, story not found), getStats (success, not found), createChain with coverUrl

---

## 6. REEL TEMPLATES MODULE

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `reel-templates.module.ts` | 1-11 | NestJS module — exports ReelTemplatesService |
| `reel-templates.controller.ts` | 1-96 | 5 endpoints: browse, get, create, mark used, delete |
| `reel-templates.service.ts` | 1-117 | Template CRUD with segment validation |
| `reel-templates.controller.spec.ts` | 1-100 | 5 controller tests |
| `reel-templates.service.spec.ts` | 1-98 | 8 service tests |

### Prisma Models

**ReelTemplate** (schema.prisma L2810-2824, table: `reel_templates`)
```
id           String   @id @default(cuid())
name         String   @db.VarChar(100)
sourceReelId String
sourceReel   Reel     @relation("ReelTemplateSource", ...)
userId       String
user         User     @relation("reelTemplates", ...)
segments     Json     -- array of { startMs, endMs, text? }
useCount     Int      @default(0)
createdAt    DateTime @default(now())
@@index([useCount(sort: Desc)])
@@index([userId])
```

### DTOs (inline in controller)

**TemplateSegmentDto** (controller L22-26)
| Field | Type | Validation |
|-------|------|------------|
| `startMs` | number | `@IsNumber()`, `@Min(0)`, `@Max(600000)` |
| `endMs` | number | `@IsNumber()`, `@Min(0)`, `@Max(600000)` |
| `text` | string? | `@IsOptional()`, `@IsString()`, `@MaxLength(500)` |

**CreateReelTemplateDto** (controller L28-32)
| Field | Type | Validation |
|-------|------|------------|
| `sourceReelId` | string | `@IsString()`, `@MaxLength(50)` |
| `segments` | TemplateSegmentDto[] | `@IsArray()`, `@ArrayMinSize(1)`, `@ArrayMaxSize(20)`, `@ValidateNested` |
| `name` | string | `@IsString()`, `@MaxLength(200)` |

### Endpoints

Global throttle: 60/60s.

| # | Method | Route | Guard | Controller L# | Service Method | Description |
|---|--------|-------|-------|---------------|----------------|-------------|
| 1 | GET | `/reel-templates` | OptionalClerkAuth | L40-52 | `browse(cursor?, limit, trending)` | Browse templates (recent or trending) |
| 2 | GET | `/reel-templates/:id` | OptionalClerkAuth | L54-59 | `getById(id)` | Get template by ID |
| 3 | POST | `/reel-templates` | ClerkAuthGuard | L61-70 | `create(userId, body)` | Create reel template |
| 4 | POST | `/reel-templates/:id/use` | ClerkAuthGuard | L72-82 | `markUsed(id, userId)` | Increment use counter |
| 5 | DELETE | `/reel-templates/:id` | ClerkAuthGuard | L84-94 | `delete(id, userId)` | Delete own template |

### Service Methods (Detail)

**`create(userId, data)`** — `reel-templates.service.ts` L25-53
- Validates name non-empty, at least 1 segment
- **Segment validation**: each segment must have non-negative times and `startMs < endMs`
- Stores segments as JSON (`JSON.parse(JSON.stringify(data.segments))`)
- NOTE: Does not validate that sourceReelId exists (no FK check at application layer)

**`browse(cursor?, limit=20, trending=false)`** — L55-76
- Trending mode: sorted by `useCount desc`
- Default: sorted by `createdAt desc`
- Limit clamped to 1-50 range
- Cursor-based pagination

**`getById(id)`** — L78-86
- Simple findUnique, throws NotFoundException

**`markUsed(id, _userId)`** — L88-100
- Validates template exists
- Atomically increments `useCount`
- NOTE: `_userId` parameter is accepted but not used (no per-user tracking)

**`delete(id, userId)`** — L102-116
- **Ownership check**: only template creator can delete
- Hard deletes the template

### Test Coverage
- **Controller**: 5 tests — browse (trending flag), getById, create, markUsed, delete
- **Service**: 8 tests — create (success, empty name, no segments, invalid segment), browse, getById (success, not found), markUsed, delete (success, non-owner ForbiddenException)

---

## 7. VIDEO REPLIES MODULE

### Files
| File | Lines | Purpose |
|------|-------|---------|
| `video-replies.module.ts` | 1-11 | NestJS module — exports VideoRepliesService |
| `video-replies.controller.ts` | 1-69 | 4 endpoints: create, get by comment, get by ID, delete |
| `video-replies.service.ts` | 1-176 | Polymorphic video reply targeting Post or Reel comments |
| `video-replies.controller.spec.ts` | 1-80 | 4 controller tests |
| `video-replies.service.spec.ts` | 1-108 | 10 service tests |

### Prisma Models

**VideoReply** (schema.prisma L2831-2848, table: `video_replies`)
```
id           String            @id @default(cuid())
userId       String
user         User              @relation("videoReplies", ...)
commentId    String            -- polymorphic FK (Comment or ReelComment)
commentType  CommentTargetType -- POST or REEL
mediaUrl     String
thumbnailUrl String?
duration     Float?
viewsCount   Int               @default(0)
likesCount   Int               @default(0)
isDeleted    Boolean           @default(false)
createdAt    DateTime          @default(now())
@@index([commentId])
@@index([userId])
```

**CommentTargetType enum** (schema.prisma L491-494)
```
POST
REEL
```

### DTOs

**CreateVideoReplyBody** (inline in controller L30-37, no class-validator)
| Field | Type | Required |
|-------|------|----------|
| `commentId` | string | yes |
| `commentType` | `'POST' \| 'REEL'` | yes |
| `mediaUrl` | string | yes |
| `thumbnailUrl` | string? | no |
| `duration` | number? | no |

NOTE: No formal DTO class with class-validator decorators — uses inline type in controller. Validation is done manually in the service.

### Endpoints

Global throttle: 60/60s.

| # | Method | Route | Guard | Controller L# | Service Method | Description |
|---|--------|-------|-------|---------------|----------------|-------------|
| 1 | POST | `/video-replies` | ClerkAuthGuard | L25-40 | `create(userId, body)` | Create video reply to a comment |
| 2 | GET | `/video-replies/comment/:commentId` | OptionalClerkAuth | L42-49 | `getByComment(commentId, cursor?)` | Get video replies for a comment |
| 3 | GET | `/video-replies/:id` | OptionalClerkAuth | L51-57 | `getById(id)` | Get single video reply |
| 4 | DELETE | `/video-replies/:id` | ClerkAuthGuard | L59-67 | `delete(id, userId)` | Soft-delete own video reply |

### Service Methods (Detail)

**`create(userId, data)`** — `video-replies.service.ts` L37-91
- **Manual validation**:
  - commentType must be 'POST' or 'REEL' (L40-42)
  - mediaUrl must be non-empty (L44-46)
  - mediaUrl must be valid URL via `new URL()` (L49-53)
  - duration must be 0-300 seconds if provided (L55-57)
- **Polymorphic comment lookup**:
  - If `commentType === 'POST'`: queries `prisma.comment.findUnique`
  - If `commentType === 'REEL'`: queries `prisma.reelComment.findUnique`
  - Throws NotFoundException if comment doesn't exist
- Creates VideoReply with `VIDEO_REPLY_SELECT` fields (L18-29)

**`getByComment(commentId, cursor?, limit=20)`** — L93-135
- Filters by `commentId` and `isDeleted: false`
- Cursor-based pagination
- **User hydration**: batch-fetches unique userIds with `Promise.all` + Map
- Returns `{ data: [...with user], meta: { cursor, hasMore } }`

**`getById(id)`** — L137-152
- Finds by ID, includes `isDeleted` check
- Throws NotFoundException if not found or soft-deleted
- Strips `isDeleted` from response

**`delete(id, userId)`** — L154-175
- **Soft delete**: sets `isDeleted: true` (does not remove record)
- **Ownership check**: only reply author can delete
- Returns `{ deleted: true }`

### VIDEO_REPLY_SELECT constant (L18-29)
```typescript
{
  id: true,
  userId: true,
  commentId: true,
  commentType: true,
  mediaUrl: true,
  thumbnailUrl: true,
  duration: true,
  viewsCount: true,
  likesCount: true,
  createdAt: true,
}
```

### Key Design Notes
1. **Polymorphic FK**: `commentId` can reference either `Comment` (Post comments) or `ReelComment` (Reel comments), disambiguated by `commentType` enum. This is the same polymorphic pattern noted in CLAUDE.md as unfixable at the Prisma level.
2. **Soft delete**: Unlike other modules that hard-delete, video replies use `isDeleted` flag — preserves data integrity for comment threads.
3. **No formal DTO validation**: Uses inline body type in controller instead of class-validator DTOs. Service handles all validation manually.

### Test Coverage
- **Controller**: 4 tests — create, getByComment, getById, delete
- **Service**: 10 tests — create (POST comment, REEL comment, invalid commentType, empty mediaUrl, invalid URL, duration out of range, comment not found), getByComment, getById (success, deleted), delete (success, non-owner ForbiddenException)

---

## CROSS-MODULE SUMMARY

### Total Test Count
| Module | Controller | Service | Edge/Auth | Total |
|--------|-----------|---------|-----------|-------|
| Stickers | 10 | 14 | 3 | **27** |
| Polls | 5 | 12 | 6 | **23** |
| Bookmarks | 5 | 15 | 12 | **32** |
| Collabs | 7 | 9 | 0 | **16** |
| Story Chains | 5 | 16 | 0 | **21** |
| Reel Templates | 5 | 8 | 0 | **13** |
| Video Replies | 4 | 10 | 0 | **14** |
| **TOTAL** | **41** | **84** | **21** | **146** |

### Pagination Patterns
All modules use **cursor-based keyset pagination**:
- `take: limit + 1` (fetch one extra to detect hasMore)
- Pop last element if `length > limit`
- Return `{ data, meta: { cursor: lastId | null, hasMore: boolean } }`

Cursor strategies vary:
- **Simple ID cursor**: Stickers (browsePacks), Story Chains (getTrending, getChain entries), Reel Templates, Video Replies
- **Composite cursor**: Bookmarks (userId_postId, userId_threadId, userId_videoId), Polls voters (userId_optionId)
- **ID comparison**: Collabs accepted (`id < cursor`), Story Chains trending (`id < cursor`)

### Auth Guard Patterns
| Pattern | Usage |
|---------|-------|
| `ClerkAuthGuard` (required) | All mutations (create, save, vote, delete), user-specific reads (my packs, pending, accepted) |
| `OptionalClerkAuthGuard` (optional) | Public reads (browse, search, get by ID, trending). userId available if authenticated (used for poll vote status) |
| Controller-level guard | Bookmarks, Collabs apply `@UseGuards(ClerkAuthGuard)` at class level |
| Method-level guard | Stickers, Polls, Story Chains, Reel Templates, Video Replies apply per-method |

### Throttle Rates
| Module | Rate | Scope |
|--------|------|-------|
| Stickers (createPack) | 5/60s | Per endpoint |
| Stickers (generate) | 10/day (86400000ms) | Per endpoint |
| Polls (vote) | 10/60s | Per endpoint |
| Bookmarks | 30/60s | All endpoints (class-level) |
| Collabs | 30/60s | All endpoints (class-level) |
| Story Chains | 60/60s | All endpoints (class-level) |
| Reel Templates | 60/60s | All endpoints (class-level) |
| Video Replies | 60/60s | All endpoints (class-level) |

### Content Moderation
- **Stickers AI generation**: 29 blocked terms covering NSFW, violence, drugs, alcohol, gambling, religious sensitivity, hate speech (stickers.service.ts L9-19)
- **SVG sanitization**: Strips `<script>`, event handlers, `javascript:` URIs, dangerous elements (L382-395)
- **Video replies**: URL validation (must be valid URL format), duration capping (0-300s)

### Atomic Operations
| Module | Operation | Mechanism |
|--------|-----------|-----------|
| Stickers | Save generated to pack | Interactive transaction (find/create pack + add sticker + increment count) |
| Polls | Vote | Batch transaction (create vote + increment option + increment poll) |
| Polls | Retract | Batch transaction (delete vote + raw SQL GREATEST decrement) |
| Bookmarks | Save post | Batch transaction (create + increment savesCount) |
| Bookmarks | Unsave post | Interactive transaction (delete + decrement + clamp to 0) |
| Bookmarks | Save/unsave thread | Batch transaction / raw SQL GREATEST |
| Bookmarks | Save/unsave video | Batch transaction / interactive transaction + clamp |
| Story Chains | Join | Interactive transaction (upsert entry + conditional increment participantCount) |

### Known Issues / Design Limitations
1. **Sticker deletePack**: Only checks `role === 'ADMIN'` — no pack ownership concept. The `ownerId` field on StickerPack is in the schema but unused in the service.
2. **Poll multi-choice detection**: Uses two separate queries (findFirst for any vote, findUnique for specific option) instead of a single query, causing a minor inefficiency.
3. **Story Chain join new-entry heuristic**: Compares `createdAt` to `Date.now() - 1000` to detect if the upsert created a new record or updated an existing one. This is fragile under clock skew or slow database responses.
4. **Video Reply no formal DTO**: Controller accepts raw body without class-validator decorators — validation is entirely manual in the service.
5. **Reel Template sourceReelId**: No application-layer validation that the source reel exists — relies on Prisma FK constraint at database level.
6. **Bookmarks collection model**: Collections are implicit (just a string field on SavedPost) — no collection metadata, no ordering, no sharing. Thread and video bookmarks have no collection support.
7. **Reel Template markUsed**: Accepts userId parameter but does not use it — no per-user usage tracking, just a global counter.
