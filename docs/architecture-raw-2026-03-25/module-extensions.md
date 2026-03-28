# Module Extensions — Telegram Features, Discord Features, Alt Profile, Mosques, Scholar Q&A

> Extracted 2026-03-25 by architecture agent. Covers 5 modules, 73 endpoints, 5 services, 10 DTOs.

---

## Table of Contents

1. [Telegram Features Module](#1-telegram-features-module)
2. [Discord Features Module](#2-discord-features-module)
3. [Alt Profile Module](#3-alt-profile-module)
4. [Mosques Module](#4-mosques-module)
5. [Scholar Q&A Module](#5-scholar-qa-module)
6. [Cross-Module Observations](#6-cross-module-observations)
7. [Test Coverage Summary](#7-test-coverage-summary)

---

## 1. Telegram Features Module

**Files:**
- `apps/api/src/modules/telegram-features/telegram-features.module.ts` (10 lines)
- `apps/api/src/modules/telegram-features/telegram-features.controller.ts` (191 lines)
- `apps/api/src/modules/telegram-features/telegram-features.service.ts` (570 lines)
- `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts` (77 lines)
- `apps/api/src/modules/telegram-features/telegram-features.controller.spec.ts` (269 lines)
- `apps/api/src/modules/telegram-features/telegram-features.service.spec.ts` (668 lines)
- `apps/api/src/modules/telegram-features/telegram-features.service.edge.spec.ts` (346 lines)

**Module setup:** Simple module exporting `TelegramFeaturesService`. Controller uses `@Controller()` (no prefix) — routes are at the global `/api/v1/` level. All endpoints require `ClerkAuthGuard`. Global throttle: 30 req/min.

**Prisma enums used:** `ForwardedFromType`, `ChatFolderFilterType`, `AdminLogAction`

### 1.1 Saved Messages (Cloud Notepad)

Telegram-style "Saved Messages" — users can save text/media snippets as a personal cloud notepad.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 1 | `GET` | `/saved-messages/search` | 30/min | Required | L26-34 | `searchSavedMessages(userId, query, cursor)` | L81-104 |
| 2 | `GET` | `/saved-messages` | 30/min | Required | L36-40 | `getSavedMessages(userId, cursor)` | L25-39 |
| 3 | `POST` | `/saved-messages` | 20/min | Required | L42-47 | `saveMessage(userId, dto)` | L41-64 |
| 4 | `PATCH` | `/saved-messages/:id/pin` | 30/min | Required | L49-53 | `pinSavedMessage(userId, id)` | L72-79 |
| 5 | `DELETE` | `/saved-messages/:id` | 30/min | Required | L55-59 | `deleteSavedMessage(userId, id)` | L66-70 |

#### DTOs

**`SaveMessageDto`** (dto/telegram-features.dto.ts L7-16)
| Field | Type | Validators | Notes |
|-------|------|------------|-------|
| `content` | `string?` | `@IsOptional @IsString @MaxLength(10000)` | Text content |
| `mediaUrl` | `string?` | `@IsOptional @IsUrl` | Media URL |
| `mediaType` | `string?` | `@IsOptional @IsIn(['image','video','audio','document','voice'])` | Media type enum |
| `forwardedFromType` | `string?` | `@IsOptional @IsIn(['FWD_POST','FWD_THREAD','FWD_REEL','FWD_VIDEO','FWD_MESSAGE'])` | Forward source type |
| `forwardedFromId` | `string?` | `@ValidateIf(o => o.forwardedFromType !== undefined) @IsString` | Required when forwardedFromType set |

#### Service Logic

- **saveMessage** (L41-64): Validates at least `content` or `mediaUrl` provided. Content max 10,000 chars. Validates `forwardedFromType` against enum. Validates `forwardedFromId` required when `forwardedFromType` is set (Finding 32). Creates `SavedMessage` record.
- **getSavedMessages** (L25-39): Cursor-based keyset pagination, `take: limit+1` pattern, ordered by `createdAt desc`. Default limit 20.
- **searchSavedMessages** (L81-104): Full-text search via `contains` + `mode: 'insensitive'`. Requires non-empty query. Uses `id: { lt: cursor }` for pagination (not Prisma cursor/skip). Default limit 20.
- **pinSavedMessage** (L72-79): Toggles `isPinned` boolean. Ownership verified via `findFirst({ where: { id, userId } })`.
- **deleteSavedMessage** (L66-70): Ownership verified before delete. Returns deleted record.

### 1.2 Chat Folders

Telegram-style chat organization. Users create folders to filter/group conversations.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 6 | `PATCH` | `/chat-folders/reorder` | 30/min | Required | L63-67 | `reorderChatFolders(userId, folderIds)` | L241-280 |
| 7 | `GET` | `/chat-folders` | 30/min | Required | L69-73 | `getChatFolders(userId)` | L108-114 |
| 8 | `GET` | `/chat-folders/:id/conversations` | 30/min | Required | L75-83 | `getFolderConversations(userId, folderId, cursor)` | L116-158 |
| 9 | `POST` | `/chat-folders` | 10/min | Required | L85-90 | `createChatFolder(userId, dto)` | L160-202 |
| 10 | `PATCH` | `/chat-folders/:id` | 30/min | Required | L92-96 | `updateChatFolder(userId, id, dto)` | L204-233 |
| 11 | `DELETE` | `/chat-folders/:id` | 30/min | Required | L98-102 | `deleteChatFolder(userId, id)` | L235-239 |

#### DTOs

**`CreateChatFolderDto`** (dto L22-30)
| Field | Type | Validators |
|-------|------|------------|
| `name` | `string` | `@IsString @MaxLength(50)` |
| `icon` | `string?` | `@IsOptional @IsString @MaxLength(20)` |
| `conversationIds` | `string[]?` | `@IsOptional @IsArray @ArrayMaxSize(200) @IsString({each})` |
| `includeGroups` | `boolean?` | `@IsOptional @IsBoolean` |
| `includeChannels` | `boolean?` | `@IsOptional @IsBoolean` |
| `filterType` | `string?` | `@IsOptional @IsIn(['INCLUDE','EXCLUDE'])` |
| `includeBots` | `boolean?` | `@IsOptional @IsBoolean` |

**`UpdateChatFolderDto`** (dto L32-40) — Same fields, all optional.

**`ReorderChatFoldersDto`** (dto L18-20)
| Field | Type | Validators |
|-------|------|------------|
| `folderIds` | `string[]` | `@IsArray @IsString({each}) @ArrayMaxSize(50)` |

#### Service Logic

- **createChatFolder** (L160-202): Name validation (non-empty, max 50, trimmed). Max 10 folders per user. **Validates conversationIds** — verifies user is a member of every listed conversation (Finding 9). Position set to current count. FilterType defaults to `INCLUDE`.
- **updateChatFolder** (L204-233): Ownership via `findFirst({ id, userId })`. Re-validates conversationIds membership if changed (Finding 9). Name trimmed on update.
- **deleteChatFolder** (L235-239): Ownership verified before delete.
- **reorderChatFolders** (L241-280): **Complete set validation** — requires ALL owned folders in the array (Finding 16). Validates no duplicates. Validates all IDs are owned. Batch update via `$transaction` of `updateMany` calls.
- **getChatFolders** (L108-114): Returns user's folders ordered by `position asc`, max 50.
- **getFolderConversations** (L116-158): Applies folder filter logic:
  - If `conversationIds` present: uses `INCLUDE`/`EXCLUDE` filter on conversation IDs
  - If `includeGroups` XOR `includeChannels`: filters by `isGroup` boolean
  - Ordered by `lastMessageAt desc`. Cursor-based pagination, limit 50.

### 1.3 Slow Mode

Rate-limit message sending in group conversations.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 12 | `PATCH` | `/conversations/:id/slow-mode` | 30/min | Required | L106-110 | `setSlowMode(conversationId, userId, seconds)` | L284-316 |

#### DTO

**`SetSlowModeDto`** (dto L42-47)
| Field | Type | Validators |
|-------|------|------------|
| `seconds` | `number` | `@IsInt @IsIn([0, 30, 60, 300, 900, 3600])` |

#### Service Logic

- **setSlowMode** (L284-316): Admin/owner role check via `ConversationMember`. Verifies conversation exists and `isGroup === true` (Finding 35). Valid intervals: 0 (disable), 30s, 60s, 300s (5min), 900s (15min), 3600s (1hr). Setting 0 stores `null`. Logs `SLOW_MODE_CHANGED` admin action.

### 1.4 Admin Log

Audit trail for group administrative actions.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 13 | `GET` | `/conversations/:id/admin-log` | 30/min | Required | L114-118 | `getAdminLog(conversationId, userId, cursor)` | L320-344 |

#### Service Logic

- **getAdminLog** (L320-344): Admin/owner role required. Cursor-based pagination via `id: { lt: cursor }`. Limit 50.
- **logAdminAction** (L346-361): Internal method. Validates against 17 valid action types (L10-17): `MEMBER_ADDED`, `MEMBER_REMOVED`, `MEMBER_BANNED`, `TITLE_CHANGED`, `PHOTO_CHANGED`, `PIN_MESSAGE`, `UNPIN_MESSAGE`, `SLOW_MODE_CHANGED`, `PERMISSIONS_CHANGED`, `TOPIC_CREATED`, `TOPIC_UPDATED`, `TOPIC_DELETED`, `EMOJI_PACK_CREATED`, `EMOJI_PACK_UPDATED`, `EMOJI_PACK_DELETED`, `EMOJI_ADDED`, `EMOJI_REMOVED` (Finding 10).

### 1.5 Group Topics

Telegram-style topic threads within group conversations.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 14 | `POST` | `/conversations/:id/topics` | 30/min | Required | L122-126 | `createTopic(conversationId, userId, dto)` | L365-389 |
| 15 | `GET` | `/conversations/:id/topics` | 30/min | Required | L128-132 | `getTopics(conversationId, userId)` | L391-403 |
| 16 | `PATCH` | `/topics/:id` | 30/min | Required | L134-138 | `updateTopic(id, userId, dto)` | L405-436 |
| 17 | `DELETE` | `/topics/:id` | 30/min | Required | L140-144 | `deleteTopic(id, userId)` | L438-458 |

#### DTOs

**`CreateTopicDto`** (dto L49-52)
| Field | Type | Validators |
|-------|------|------------|
| `name` | `string` | `@IsString @MaxLength(100)` |
| `iconColor` | `string?` | `@IsOptional @IsString @Matches(/^#[0-9A-Fa-f]{6}$/)` |

**`UpdateTopicDto`** (dto L54-59) — Same fields plus:
| Field | Type | Validators |
|-------|------|------------|
| `isPinned` | `boolean?` | `@IsOptional @IsBoolean` |
| `isClosed` | `boolean?` | `@IsOptional @IsBoolean` |

#### Service Logic

- **createTopic** (L365-389): Membership check (any member can create). Name validation (non-empty, max 100, trimmed). Max 100 topics per group. Logs `TOPIC_CREATED` admin action (Finding 12).
- **getTopics** (L391-403): Membership verification (Finding 7). Ordered by `isPinned desc, lastMessageAt desc`. Max 100.
- **updateTopic** (L405-436): Admin/owner role required. Name trimmed on update. Logs `TOPIC_UPDATED` with changed fields listed.
- **deleteTopic** (L438-458): Admin/owner role required. Logs `TOPIC_DELETED` with topic name.

### 1.6 Custom Emoji Packs

User-created emoji packs with custom shortcodes and images.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 18 | `GET` | `/emoji-packs/me` | 30/min | Required | L148-152 | `getMyEmojiPacks(userId)` | L562-569 |
| 19 | `POST` | `/emoji-packs` | 5/min | Required | L154-159 | `createEmojiPack(userId, dto)` | L462-473 |
| 20 | `PATCH` | `/emoji-packs/:id` | 30/min | Required | L161-165 | `updateEmojiPack(id, userId, dto)` | L475-486 |
| 21 | `DELETE` | `/emoji-packs/:id` | 30/min | Required | L167-171 | `deleteEmojiPack(id, userId)` | L488-492 |
| 22 | `POST` | `/emoji-packs/:id/emojis` | 10/min | Required | L173-178 | `addEmojiToPack(packId, userId, dto)` | L507-538 |
| 23 | `DELETE` | `/emojis/:id` | 30/min | Required | L180-184 | `deleteEmoji(id, userId)` | L494-505 |
| 24 | `GET` | `/emoji-packs` | 30/min | **None** (public) | L186-190 | `getEmojiPacks(cursor)` | L540-560 |

#### DTOs

**`CreateEmojiPackDto`** (dto L61-64)
| Field | Type | Validators |
|-------|------|------------|
| `name` | `string` | `@IsString @MaxLength(100)` |
| `description` | `string?` | `@IsOptional @IsString @MaxLength(300)` |

**`UpdateEmojiPackDto`** (dto L66-70) — Same fields plus `isPublic: boolean?`.

**`AddEmojiDto`** (dto L72-76)
| Field | Type | Validators |
|-------|------|------------|
| `shortcode` | `string` | `@IsString @MaxLength(50)` |
| `imageUrl` | `string` | `@IsUrl` |
| `isAnimated` | `boolean?` | `@IsOptional @IsBoolean` |

#### Service Logic

- **createEmojiPack** (L462-473): Name validation (non-empty, max 100, trimmed). Creator stored as `creatorId`.
- **updateEmojiPack** (L475-486): Creator ownership check. Name trimmed on update. Supports `isPublic` toggle.
- **deleteEmojiPack** (L488-492): Creator ownership check. Cascade deletes handled by Prisma.
- **addEmojiToPack** (L507-538): Creator ownership check. Shortcode validation: regex `/^[a-zA-Z0-9_]{2,32}$/` (2-32 alphanumeric + underscores). Duplicate check via `@@unique` composite key `packId_shortcode` (Finding 31). Max 120 emoji per pack. **Increments `usageCount`** on the pack (Finding 18).
- **deleteEmoji** (L494-505): Loads emoji with pack creator via include. Creator-only delete.
- **getEmojiPacks** (L540-560): Public browse, ordered by `usageCount desc`. Includes creator profile + first 5 emojis. Cursor pagination.
- **getMyEmojiPacks** (L562-569): Returns user's packs with all emojis and emoji count. Max 50.

---

## 2. Discord Features Module

**Files:**
- `apps/api/src/modules/discord-features/discord-features.module.ts` (10 lines)
- `apps/api/src/modules/discord-features/discord-features.controller.ts` (214 lines)
- `apps/api/src/modules/discord-features/discord-features.service.ts` (382 lines)
- `apps/api/src/modules/discord-features/dto/discord-features.dto.ts` (38 lines)
- `apps/api/src/modules/discord-features/discord-features.controller.spec.ts` (146 lines)
- `apps/api/src/modules/discord-features/discord-features.service.spec.ts` (806 lines)
- `apps/api/src/modules/discord-features/discord-features.service.edge.spec.ts` (139 lines)

**Module setup:** Simple module exporting `DiscordFeaturesService`. Controller uses `@Controller()` (no prefix) — routes at `/api/v1/`. Global throttle: 30 req/min. Mixed auth: some endpoints use `ClerkAuthGuard` (required), some use `OptionalClerkAuthGuard` (public/optional).

**Prisma enums used:** `StageSessionStatus`

**Constants:** `USER_SELECT` (L5) — `{ id, username, displayName, avatarUrl, isVerified }`, `MAX_STAGE_SPEAKERS = 20` (L6).

### 2.1 Forum Threads

Discord-style forum threads within Circle communities.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 1 | `POST` | `/circles/:circleId/forum` | 10/min | Required | L25-33 | `createForumThread(userId, circleId, dto)` | L14-24 |
| 2 | `GET` | `/circles/:circleId/forum` | 30/min | Optional | L35-40 | `getForumThreads(circleId, cursor)` | L26-44 |
| 3 | `GET` | `/forum/:threadId` | 30/min | Optional | L42-47 | `getForumThread(threadId)` | L46-53 |
| 4 | `POST` | `/forum/:threadId/reply` | 15/min | Required | L49-57 | `replyToForumThread(userId, threadId, content)` | L55-81 |
| 5 | `GET` | `/forum/:threadId/replies` | 30/min | Optional | L59-64 | `getForumReplies(threadId, cursor)` | L83-100 |
| 6 | `PATCH` | `/forum/:threadId/lock` | 10/min | Required | L66-73 | `lockForumThread(threadId, userId)` | L122-129 |
| 7 | `PATCH` | `/forum/:threadId/pin` | 10/min | Required | L75-82 | `pinForumThread(threadId, userId)` | L131-137 |
| 8 | `DELETE` | `/forum/:threadId` | 10/min | Required | L84-92 | `deleteForumThread(threadId, userId)` | L139-144 |
| 9 | `DELETE` | `/forum/replies/:replyId` | 10/min | Required | L94-102 | `deleteForumReply(replyId, userId)` | L146-178 |

#### DTOs

**`CreateForumThreadDto`** (dto L6-10)
| Field | Type | Validators |
|-------|------|------------|
| `title` | `string` | `@IsString @MaxLength(200)` |
| `content` | `string` | `@IsString @MaxLength(10000)` |
| `tags` | `string[]?` | `@IsOptional @IsArray @IsString({each}) @ArrayMaxSize(10)` |

**`ForumReplyDto`** (dto L12-14)
| Field | Type | Validators |
|-------|------|------------|
| `content` | `string` | `@IsString @MaxLength(10000)` |

#### Service Logic

- **createForumThread** (L14-24): Verifies `CircleMember` membership. Creates `ForumThread` with `authorId`, default `tags: []`. Includes author profile.
- **getForumThreads** (L26-44): Ordered by `isPinned desc, lastReplyAt desc`. Uses Prisma skip+cursor pagination. Includes author + reply count. Default limit 20.
- **getForumThread** (L46-53): Single thread with author. Throws `NotFoundException`.
- **replyToForumThread** (L55-81): Checks thread exists and not locked. Verifies circle membership. Creates reply + increments `replyCount` + updates `lastReplyAt` in `$transaction`.
- **getForumReplies** (L83-100): Ordered by `createdAt asc`. Skip+cursor pagination. Default limit 50.
- **requireThreadModerator** (L103-120): Private helper. Allows thread author OR circle OWNER/ADMIN/MODERATOR. Used by lock/pin/delete.
- **lockForumThread** (L122-129): Toggles `isLocked` boolean. Requires moderator.
- **pinForumThread** (L131-137): Toggles `isPinned` boolean. Requires moderator.
- **deleteForumThread** (L139-144): Deletes all replies first (`deleteMany`), then thread. Requires moderator.
- **deleteForumReply** (L146-178): Author can delete own. Circle OWNER/ADMIN/MODERATOR can delete any. Decrements `replyCount` on parent thread.

### 2.2 Circle Webhooks

Discord-style webhook integrations for Circle communities. External services can post messages via webhook token.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 10 | `POST` | `/circles/:circleId/webhooks` | 5/min | Required | L106-113 | `createWebhook(userId, circleId, dto)` | L182-199 |
| 11 | `GET` | `/circles/:circleId/webhooks` | 30/min | Required | L115-122 | `getWebhooks(circleId, userId)` | L201-214 |
| 12 | `DELETE` | `/webhooks/:id` | 30/min | Required | L124-130 | `deleteWebhook(id, userId)` | L216-233 |
| 13 | `POST` | `/webhooks/:token/execute` | 30/min | **None** (public) | L132-137 | `executeWebhook(token, dto)` | L235-260 |

#### DTOs

**`CreateWebhookDto`** (dto L16-20)
| Field | Type | Validators |
|-------|------|------------|
| `name` | `string` | `@IsString @MaxLength(100)` |
| `avatarUrl` | `string?` | `@IsOptional @IsUrl` |
| `targetChannelId` | `string?` | `@IsOptional @IsString` |

**`ExecuteWebhookDto`** (dto L22-25)
| Field | Type | Validators |
|-------|------|------------|
| `content` | `string` | `@IsString @MaxLength(4000)` |
| `username` | `string?` | `@IsOptional @IsString @MaxLength(100)` |

#### Service Logic

- **createWebhook** (L182-199): Requires OWNER or ADMIN role in circle. Max 15 webhooks per circle. Stores `createdById`, `name`, `avatarUrl`, `targetChannelId`.
- **getWebhooks** (L201-214): Returns active webhooks only (`isActive: true`). Verifies membership if userId provided.
- **deleteWebhook** (L216-233): Creator can delete own. Circle OWNER/ADMIN can delete any.
- **executeWebhook** (L235-260): **No auth required** — uses token-based authentication. Content validation (non-empty, max 4000). Looks up webhook by `token`. Rejects inactive webhooks. Updates `lastUsedAt` timestamp. If `targetChannelId` is set, creates a `SYSTEM` type `Message` in that conversation.

### 2.3 Stage Sessions (Moderated Audio Rooms)

Clubhouse/Discord Stage-style moderated audio sessions within Circle communities.

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 14 | `POST` | `/circles/:circleId/stage` | 5/min | Required | L141-149 | `createStageSession(userId, circleId, dto)` | L264-279 |
| 15 | `POST` | `/stage/:id/start` | 5/min | Required | L151-158 | `startStageSession(id, userId)` | L281-291 |
| 16 | `POST` | `/stage/:id/end` | 5/min | Required | L160-167 | `endStageSession(id, userId)` | L293-302 |
| 17 | `POST` | `/stage/:id/speaker` | 10/min | Required | L169-177 | `inviteSpeaker(id, userId, speakerId)` | L304-324 |
| 18 | `DELETE` | `/stage/:id/speaker` | 10/min | Required | L179-188 | `removeSpeaker(id, userId, speakerId)` | L326-336 |
| 19 | `POST` | `/stage/:id/join` | 10/min | Required | L190-197 | `joinStageAsListener(id, userId)` | L338-349 |
| 20 | `POST` | `/stage/:id/leave` | 10/min | Required | L199-206 | `leaveStageAsListener(id, userId)` | L351-364 |
| 21 | `GET` | `/stage/active` | 30/min | Optional | L208-213 | `getActiveStageSessions(circleId?)` | L366-381 |

#### DTOs

**`CreateStageSessionDto`** (dto L27-30)
| Field | Type | Validators |
|-------|------|------------|
| `title` | `string` | `@IsString @MaxLength(200)` |
| `scheduledAt` | `string?` | `@IsOptional @IsDateString` |

**`InviteSpeakerDto`** (dto L32-34) / **`RemoveSpeakerDto`** (dto L36-38)
| Field | Type | Validators |
|-------|------|------------|
| `speakerId` | `string` | `@IsString` |

#### Service Logic — Stage Session Lifecycle

```
STAGE_SCHEDULED  ──[startStageSession]──>  STAGE_LIVE  ──[endStageSession]──>  STAGE_ENDED
     │                                        │
     │ host auto-added to speakerIds          │ speakers can be invited/removed
     │                                        │ listeners can join/leave
```

- **createStageSession** (L264-279): Verifies circle membership. Host auto-added to `speakerIds`. Optional `scheduledAt`. Includes host profile.
- **startStageSession** (L281-291): Host-only. Rejects if already `STAGE_LIVE` or `STAGE_ENDED`. Sets `status: 'STAGE_LIVE'`, records `startedAt`.
- **endStageSession** (L293-302): Host-only. Rejects if already `STAGE_ENDED`. Sets `status: 'STAGE_ENDED'`, records `endedAt`.
- **inviteSpeaker** (L304-324): Host-only, session must be `STAGE_LIVE`. Validates speaker user exists. Max 20 speakers. Deduplicates via `Set`.
- **removeSpeaker** (L326-336): Host-only. Cannot remove the host from speakers. Filters out speaker from array.
- **joinStageAsListener** (L338-349): Session must be `STAGE_LIVE`. Increments `audienceCount`.
- **leaveStageAsListener** (L351-364): Guards against negative count (`audienceCount > 0` check before decrement).
- **getActiveStageSessions** (L366-381): Returns `STAGE_LIVE` sessions. With circleId filter OR only from `PUBLIC` privacy circles. Ordered by `audienceCount desc`, max 50. Includes host profile.

---

## 3. Alt Profile Module (Flipside)

Instagram "Flipside"-style alternate profiles. Users maintain a secondary identity visible only to granted users.

**Files:**
- `apps/api/src/modules/alt-profile/alt-profile.module.ts` (10 lines)
- `apps/api/src/modules/alt-profile/alt-profile.controller.ts` (166 lines)
- `apps/api/src/modules/alt-profile/alt-profile.service.ts` (224 lines)
- `apps/api/src/modules/alt-profile/alt-profile.controller.spec.ts` (201 lines)
- `apps/api/src/modules/alt-profile/alt-profile.service.spec.ts` (168 lines)
- `apps/api/src/modules/alt-profile/alt-profile.service.edge.spec.ts` (51 lines)
- `apps/api/src/modules/alt-profile/alt-profile.service.auth.spec.ts` (67 lines)

**Module setup:** Two controllers — `AltProfileController` (`/users/me/alt-profile`) and `AltProfileViewerController` (`/users/:userId/alt-profile`). All endpoints require `ClerkAuthGuard`. Throttle: 60 req/min.

**DTOs:** Defined inline in controller file (not in separate DTO file).

### 3.1 Own Profile Management

#### Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 1 | `POST` | `/users/me/alt-profile` | 60/min | Required | L74-81 | `create(userId, dto)` | L14-29 |
| 2 | `PUT` | `/users/me/alt-profile` | 60/min | Required | L83-90 | `update(userId, dto)` | L31-43 |
| 3 | `DELETE` | `/users/me/alt-profile` | 60/min | Required | L92-97 | `delete(userId)` | L45-51 |
| 4 | `GET` | `/users/me/alt-profile` | 60/min | Required | L99-103 | `getOwn(userId)` | L53-63 |
| 5 | `POST` | `/users/me/alt-profile/access` | 60/min | Required | L105-112 | `addAccess(userId, userIds)` | L95-126 |
| 6 | `DELETE` | `/users/me/alt-profile/access/:targetUserId` | 60/min | Required | L114-122 | `removeAccess(userId, targetUserId)` | L128-146 |
| 7 | `GET` | `/users/me/alt-profile/access` | 60/min | Required | L124-128 | `getAccessList(userId)` | L148-177 |
| 8 | `GET` | `/users/me/alt-profile/posts` | 60/min | Required | L130-137 | `getAltPosts(userId, userId, cursor)` | L179-223 |

### 3.2 View Other User's Profile

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 9 | `GET` | `/users/:userId/alt-profile` | 60/min | Required | L148-155 | `getForUser(targetUserId, viewerId)` | L65-93 |
| 10 | `GET` | `/users/:userId/alt-profile/posts` | 60/min | Required | L157-165 | `getAltPosts(targetUserId, viewerId, cursor)` | L179-223 |

#### Inline DTOs

**`CreateAltProfileDto`** (controller L21-38)
| Field | Type | Validators |
|-------|------|------------|
| `displayName` | `string` | `@IsString @MinLength(1) @MaxLength(50)` |
| `bio` | `string?` | `@IsOptional @IsString @MaxLength(500)` |
| `avatarUrl` | `string?` | `@IsOptional @IsString` |

**`UpdateAltProfileDto`** (controller L40-57) — Same fields, all optional.

**`AddAccessDto`** (controller L59-64)
| Field | Type | Validators |
|-------|------|------------|
| `userIds` | `string[]` | `@IsArray @IsString({each})` |

#### Service Logic

- **create** (L14-29): One profile per user enforced via `findUnique({ where: { userId } })`. Throws `ConflictException` for duplicates.
- **update** (L31-43): Only updates provided fields. Throws `NotFoundException` if no profile.
- **delete** (L45-51): Throws `NotFoundException` if no profile. Returns `{ deleted: true }`.
- **getOwn** (L53-63): Returns profile with access list. Returns null if no profile.
- **getForUser** (L65-93): Access-controlled viewing. Returns null for inactive profiles. Owner can always view own. Non-owners need `AltProfileAccess` record. Throws `ForbiddenException` if no access. Returns sanitized view (id, displayName, bio, avatarUrl, createdAt).
- **addAccess** (L95-126): Max 100 users per batch. Uses `upsert` for idempotency. Returns per-user result array `{ userId, added: boolean }`. Throws `NotFoundException` if no profile.
- **removeAccess** (L128-146): Idempotent delete (catches error if already removed). Returns `{ removed: true }`.
- **getAccessList** (L148-177): Returns access records with user details. Fetches users separately (no direct relation). Max 50.
- **getAltPosts** (L179-223): Access-verified. Queries posts where `isAltProfile: true, isRemoved: false`. Cursor pagination. Limit 20. Returns post fields: id, content, postType, mediaUrls, mediaTypes, likesCount, commentsCount, createdAt.

---

## 4. Mosques Module

Mosque community micro-networks. Users can discover nearby mosques, join communities, post announcements, and manage members.

**Files:**
- `apps/api/src/modules/mosques/mosques.module.ts` (9 lines)
- `apps/api/src/modules/mosques/mosques.controller.ts` (119 lines)
- `apps/api/src/modules/mosques/mosques.service.ts` (176 lines)
- `apps/api/src/modules/mosques/mosques.controller.spec.ts` (145 lines)
- `apps/api/src/modules/mosques/mosques.service.spec.ts` (145 lines)

**Module setup:** Controller at `/mosques`. Mixed auth (some endpoints optional). No separate DTO file — DTOs inline in controller.

### 4.1 Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 1 | `GET` | `/mosques/nearby` | 30/min | Optional | L36-52 | `findNearby(lat, lng, radius)` | L8-27 |
| 2 | `POST` | `/mosques` | 5/min | Required | L54-60 | `create(userId, dto)` | L41-64 |
| 3 | `GET` | `/mosques/my/memberships` | default | Required | L62-67 | `getMyMosques(userId)` | L168-175 |
| 4 | `GET` | `/mosques/:id` | default | Optional | L69-74 | `getById(id)` | L66-72 |
| 5 | `POST` | `/mosques/:id/join` | default | Required | L76-82 | `join(userId, mosqueId)` | L74-94 |
| 6 | `DELETE` | `/mosques/:id/leave` | default | Required | L84-89 | `leave(userId, mosqueId)` | L96-112 |
| 7 | `GET` | `/mosques/:id/feed` | 30/min | Optional | L91-98 | `getFeed(mosqueId, cursor)` | L114-133 |
| 8 | `POST` | `/mosques/:id/posts` | 10/min | Required | L100-110 | `createPost(userId, mosqueId, content, mediaUrls)` | L135-145 |
| 9 | `GET` | `/mosques/:id/members` | default | Optional | L112-118 | `getMembers(mosqueId, cursor)` | L147-166 |

### 4.2 Inline DTOs

**`CreateMosqueDto`** (controller L10-22)
| Field | Type | Validators |
|-------|------|------------|
| `name` | `string` | `@IsString @MaxLength(200)` |
| `address` | `string` | `@IsString @MaxLength(500)` |
| `city` | `string` | `@IsString @MaxLength(100)` |
| `country` | `string` | `@IsString @MaxLength(100)` |
| `latitude` | `number` | `@IsNumber @Min(-90) @Max(90)` |
| `longitude` | `number` | `@IsNumber @Min(-180) @Max(180)` |
| `madhab` | `string?` | `@IsOptional @IsString @MaxLength(50)` |
| `language` | `string?` | `@IsOptional @IsString @MaxLength(10)` |
| `phone` | `string?` | `@IsOptional @IsString @MaxLength(30)` |
| `website` | `string?` | `@IsOptional @IsString @IsUrl` |
| `imageUrl` | `string?` | `@IsOptional @IsString @IsUrl` |

**`CreateMosquePostDto`** (controller L24-27)
| Field | Type | Validators |
|-------|------|------------|
| `content` | `string` | `@IsString @MaxLength(5000)` |
| `mediaUrls` | `string[]?` | `@IsOptional @IsArray @ArrayMaxSize(10) @IsString({each})` |

### 4.3 Service Logic

- **findNearby** (L8-27): Bounding box filter using lat/lng deltas (`radiusKm / 111` for latitude, adjusted for longitude by `cos(lat)`). Default radius 15km. Max 50 results. Post-filter sorts by **haversine distance** (L29-39) — proper great-circle distance calculation using Earth radius 6371km. Returns `distanceKm` rounded to 1 decimal.
- **create** (L41-64): Creates `MosqueCommunity` with `memberCount: 1`. Auto-creates `MosqueMembership` for creator with `role: 'admin'`.
- **getById** (L66-72): Simple findUnique. Throws `NotFoundException`.
- **join** (L74-94): Checks mosque exists. Checks not already member (`ConflictException`). `$transaction`: creates membership (role: 'member') + increments `memberCount`.
- **leave** (L96-112): Checks membership exists. `$transaction`: deletes membership + decrements `memberCount` (with `memberCount > 0` guard via `updateMany`).
- **getFeed** (L114-133): Cursor-based by `createdAt`. Ordered by `isPinned desc, createdAt desc`. Limit 20. Cursor is ISO timestamp string.
- **createPost** (L135-145): Membership check. Creates `MosquePost` with content + mediaUrls.
- **getMembers** (L147-166): Cursor-based by `createdAt`. Ordered by `createdAt asc`. Limit 50. Cursor is ISO timestamp string.
- **getMyMosques** (L168-175): Returns user's memberships with mosque data. Flattens to `{ ...mosque, role }`. Max 50.

---

## 5. Scholar Q&A Module

Live Q&A sessions where verified scholars answer community questions. Questions are upvoted for prioritization.

**Files:**
- `apps/api/src/modules/scholar-qa/scholar-qa.module.ts` (9 lines)
- `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts` (100 lines)
- `apps/api/src/modules/scholar-qa/scholar-qa.service.ts` (132 lines)
- `apps/api/src/modules/scholar-qa/scholar-qa.controller.spec.ts` (116 lines)
- `apps/api/src/modules/scholar-qa/scholar-qa.service.spec.ts` (196 lines)

**Module setup:** Controller at `/scholar-qa`. Mixed auth. DTOs inline in controller.

**Prisma enums used:** `ScholarQACategory`, `ScholarQAStatus`, `ScholarVerificationStatus`

### 5.1 Endpoints

| # | Method | Route | Throttle | Auth | Controller Line | Service Method | Service Line |
|---|--------|-------|----------|------|-----------------|----------------|--------------|
| 1 | `POST` | `/scholar-qa` | 5/min | Required | L28-34 | `schedule(scholarId, dto)` | L9-39 |
| 2 | `GET` | `/scholar-qa/upcoming` | default | Optional | L36-41 | `getUpcoming()` | L41-50 |
| 3 | `GET` | `/scholar-qa/recordings` | default | Optional | L43-48 | `getRecordings()` | L125-132 |
| 4 | `GET` | `/scholar-qa/:id` | default | Optional | L50-55 | `getById(id)` | L52-64 |
| 5 | `POST` | `/scholar-qa/:id/questions` | 20/min | Required | L57-67 | `submitQuestion(userId, qaId, question)` | L66-73 |
| 6 | `POST` | `/scholar-qa/:id/questions/:qid/vote` | 30/min | Required | L69-76 | `voteQuestion(userId, questionId)` | L75-87 |
| 7 | `PUT` | `/scholar-qa/:id/start` | 5/min | Required | L78-84 | `startSession(scholarId, qaId)` | L89-98 |
| 8 | `PUT` | `/scholar-qa/:id/end` | 5/min | Required | L86-92 | `endSession(scholarId, qaId)` | L100-109 |
| 9 | `PUT` | `/scholar-qa/:id/questions/:qid/answered` | default | Required | L94-99 | `markAnswered(scholarId, questionId)` | L111-123 |

### 5.2 Inline DTOs

**`ScheduleQADto`** (controller L10-16)
| Field | Type | Validators |
|-------|------|------------|
| `title` | `string` | `@IsString @MaxLength(200)` |
| `description` | `string?` | `@IsOptional @IsString @MaxLength(2000)` |
| `category` | `string` | `@IsIn(['fiqh','aqeedah','tafsir','seerah','family','youth','women','converts'])` |
| `language` | `string?` | `@IsOptional @IsString @MaxLength(10)` |
| `scheduledAt` | `string` | `@IsDateString` |

**`SubmitQuestionDto`** (controller L18-20)
| Field | Type | Validators |
|-------|------|------------|
| `question` | `string` | `@IsString @MaxLength(1000)` |

### 5.3 Service Logic — Q&A Session Lifecycle

```
QA_SCHEDULED  ──[startSession]──>  QA_LIVE  ──[endSession]──>  QA_ENDED
                                     │                            │
                                     │ questions can be submitted  │ recordingUrl may be set
                                     │ questions can be voted      │
                                     │ questions can be marked answered
```

- **schedule** (L9-39): **Scholar verification check** — queries `ScholarVerification` for user with status `VERIFICATION_PENDING` (NOTE: this may be a bug — likely should check `APPROVED` status, not `PENDING`). Validates category against 8 valid values. Default language: `'en'`. Creates `ScholarQA` record.
- **getUpcoming** (L41-50): Returns sessions with status `QA_SCHEDULED` or `QA_LIVE` where `scheduledAt >= now()`. Ordered by `scheduledAt asc`. Max 20.
- **getById** (L52-64): Returns session with questions sorted by `votes desc`. Max 50 questions. Throws `NotFoundException`.
- **submitQuestion** (L66-73): Verifies QA session exists. Creates `ScholarQuestion` with `userId`, `qaId`, `question` text.
- **voteQuestion** (L75-87): Verifies question exists. **Prevents self-voting** (`question.userId === userId`). Increments `votes` count. NOTE: No proper vote deduplication — comment in code (L82) acknowledges `ScholarQuestionVote` join table is needed.
- **startSession** (L89-98): Scholar-only (matches `qa.scholarId`). Sets status to `QA_LIVE`, records `startedAt`.
- **endSession** (L100-109): Scholar-only. Sets status to `QA_ENDED`, records `endedAt`.
- **markAnswered** (L111-123): Scholar-only (via `question.qa.scholarId`). Sets `isAnswered: true`, records `answeredAt`.
- **getRecordings** (L125-132): Returns ended sessions that have a `recordingUrl`. Ordered by `endedAt desc`. Max 50.

### 5.4 Q&A Categories

8 Islamic knowledge categories:
1. `fiqh` — Islamic jurisprudence
2. `aqeedah` — Islamic creed/theology
3. `tafsir` — Quran exegesis
4. `seerah` — Prophet's biography
5. `family` — Family matters
6. `youth` — Youth issues
7. `women` — Women's issues
8. `converts` — New Muslim guidance

---

## 6. Cross-Module Observations

### 6.1 Architecture Patterns

| Pattern | Telegram | Discord | Alt Profile | Mosques | Scholar Q&A |
|---------|----------|---------|-------------|---------|-------------|
| Route prefix | _(none)_ | _(none)_ | `/users/me/alt-profile` + `/users/:userId/alt-profile` | `/mosques` | `/scholar-qa` |
| Auth guard | ClerkAuthGuard | Mixed (Clerk + Optional) | ClerkAuthGuard | Mixed | Mixed |
| DTO location | Separate file | Separate file | Inline in controller | Inline in controller | Inline in controller |
| Pagination style | Cursor (id-based) | Cursor (Prisma skip+cursor) | Cursor (Prisma skip+cursor) | Cursor (createdAt ISO) | No pagination (max 20/50) |
| Throttle (global) | 30/min | 30/min | 60/min | varies | varies |

### 6.2 Authorization Model

| Module | Ownership Model | Role Hierarchy |
|--------|----------------|----------------|
| Telegram Features | User owns messages/folders/packs | Conversation: owner > admin > member |
| Discord Features | Circle membership | Circle: OWNER > ADMIN > MODERATOR > MEMBER |
| Alt Profile | User owns profile | Access grant list (binary) |
| Mosques | Creator is admin | admin > member |
| Scholar Q&A | Scholar owns session | ScholarVerification required |

### 6.3 Notable Design Decisions

1. **Telegram controller has no route prefix** — endpoints like `/saved-messages`, `/chat-folders`, `/conversations/:id/slow-mode` are at root API level.
2. **Discord controller has no route prefix** — endpoints like `/circles/:circleId/forum`, `/forum/:threadId`, `/stage/:id/start` are at root API level.
3. **Webhook execution is unauthenticated** — uses token-based auth, enabling external CI/CD and bot integrations.
4. **Stage session uses array for speakerIds** — not a join table. Limited to 20 speakers. Deduplication done in application code.
5. **Mosque nearby search uses bounding box + Haversine** — no PostGIS. Bounding box filters in Prisma, then sorts by computed Haversine distance.
6. **Alt Profile uses two controllers** — self-management at `/users/me/alt-profile` and viewer access at `/users/:userId/alt-profile`.
7. **Chat folder reorder requires complete set** — all folder IDs must be provided (Finding 16), preventing partial reorders.

### 6.4 Potential Issues / Bugs Identified

1. **Scholar Q&A schedule checks `VERIFICATION_PENDING`** (service L19) — likely should be checking an approved status, not pending. This means only pending (unverified) scholars can schedule sessions.
2. **Vote dedup missing** — `voteQuestion` increments without checking if user already voted. Self-vote is blocked, but multi-vote is not.
3. **Mosque feed cursor uses ISO timestamp** — not as reliable as ID-based cursors for items created at the exact same millisecond.
4. **Webhook execution creates `SYSTEM` message with no `senderId`** — the Message model has optional `senderId`, so this works, but the message has no attribution.
5. **Stage session `audienceCount`** — incremented/decremented without tracking which users are actually listening. Users could inflate count by calling join repeatedly.

---

## 7. Test Coverage Summary

### 7.1 Test File Inventory

| Module | Test File | Test Count | Scope |
|--------|-----------|------------|-------|
| **Telegram Features** | `controller.spec.ts` | 20 | All 24 controller→service delegations |
| | `service.spec.ts` | 68 | Saved messages (14), search (4), folders (14), folder conversations (2), reorder (5), slow mode (8), topics (14), emoji packs (10), add emoji (7), delete emoji (3), admin log (5) |
| | `service.edge.spec.ts` | 30 | Arabic/Unicode content, boundary lengths, whitespace, slow mode intervals, topic limits, shortcode validation, admin action types |
| **Discord Features** | `controller.spec.ts` | 8 | Key controller→service delegations |
| | `service.spec.ts` | 54 | Forum CRUD (16), lock/pin (8), replies (8), webhooks (16), stage lifecycle (16), speaker management (10), listeners (6), active sessions (2) |
| | `service.edge.spec.ts` | 9 | Arabic titles, empty lists, pagination, webhook execution, stage edge cases |
| **Alt Profile** | `controller.spec.ts` | 12 | Both controllers (owner: 8, viewer: 4) |
| | `service.spec.ts` | 12 | CRUD (4), access management (4), authorization (4) |
| | `service.edge.spec.ts` | 3 | Arabic names, cross-user access denial, delete non-existent |
| | `service.auth.spec.ts` | 6 | Authorization matrix (create self, duplicate, update non-existent, forbidden view, owner view, delete non-existent) |
| **Mosques** | `controller.spec.ts` | 9 | All controller→service delegations |
| | `service.spec.ts` | 11 | Nearby, create, getById, join, leave, feed, createPost, members, myMosques |
| **Scholar Q&A** | `controller.spec.ts` | 7 | Key controller→service delegations |
| | `service.spec.ts` | 16 | Schedule (3), upcoming (1), getById (2), submitQuestion (2), vote (2), start (3), end (3), markAnswered (3), recordings (2), default language (1) |

**Total tests across 5 modules: ~265 tests in 14 test files.**

### 7.2 Test Quality Notes

- All tests use Jest mocks with `globalMockProviders` from `../../common/test/mock-providers`
- Controller tests verify service method delegation and parameter passing
- Service tests verify business logic: validation, authorization, error handling, database interaction
- Edge case tests cover: Arabic/Unicode content, boundary values, empty states, concurrent access patterns
- Auth matrix test for Alt Profile verifies cross-user access control scenarios
- Missing: integration tests, E2E tests, load/stress tests for throttle verification
