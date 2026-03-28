# Module: Messages (Risalah)

> **The largest module in the API — 47 controller endpoints, 1,103-line service, WhatsApp-level messaging.**

**Files:**
- `apps/api/src/modules/messages/messages.module.ts` (8 lines)
- `apps/api/src/modules/messages/messages.controller.ts` (642 lines)
- `apps/api/src/modules/messages/messages.service.ts` (1,103 lines)
- `apps/api/src/modules/messages/dto/create-dm.dto.ts` (8 lines)
- `apps/api/src/modules/messages/dto/mute-conversation.dto.ts` (8 lines)
- `apps/api/src/modules/messages/dto/archive-conversation.dto.ts` (8 lines)
- `apps/api/src/modules/messages/dto/dm-note.dto.ts` (16 lines)

---

## 1. Module File (`messages.module.ts`)

**Line 1-8:**
```
imports: [NotificationsModule, AiModule]
controllers: [MessagesController]
providers: [MessagesService, ChatGateway]
exports: [MessagesService]
```

### Cross-Module Dependencies
| Dependency | Import Source | Usage |
|-----------|-------------|-------|
| `NotificationsModule` | `../notifications/notifications.module` | Push notifications via `PushTriggerService` |
| `AiModule` | `../ai/ai.module` | Voice message transcription via `AiService` |
| `ChatGateway` | `../../gateways/chat.gateway` | Socket.io events (room_evicted on member kick) |
| `PrismaService` | `../../config/prisma.service` | Database access (injected into service) |
| `ClerkAuthGuard` | `../../common/guards/clerk-auth.guard` | JWT auth on all endpoints |
| `CurrentUser` | `../../common/decorators/current-user.decorator` | Extract userId from JWT |

---

## 2. DTOs (Data Transfer Objects)

### 2.1 DTOs Defined Inline in Controller (Lines 23-175)

#### `SetLockCodeDto` (Line 23-25)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `code` | `string \| null` | `@IsOptional`, `@IsString`, `@Matches(/^\d{4,8}$/)` | 4-8 digit lock code, null to remove |

#### `VerifyLockCodeDto` (Line 27-29)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `code` | `string` | `@IsString`, `@Matches(/^\d{4,8}$/)` | 4-8 digit lock code to verify |

#### `SetHistoryCountDto` (Line 31-33)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `count` | `number` | `@IsInt`, `@Min(0)`, `@Max(100)` | Messages visible to new members |

#### `SetMemberTagDto` (Line 35-37)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `tag` | `string \| null` | `@IsOptional`, `@IsString`, `@MaxLength(30)` | Role label in group |

#### `ForwardMessageDto` (Line 39-41)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `conversationIds` | `string[]` | `@IsArray`, `@IsString({ each: true })`, `@ArrayMaxSize(5)` | Target conversation IDs |

#### `SendViewOnceDto` (Line 43-48)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `mediaUrl` | `string` | `@IsUrl` | Required media URL |
| `mediaType` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(50)` | MIME type |
| `messageType` | `string?` | `@IsOptional`, `@IsEnum(['IMAGE', 'VIDEO', 'VOICE'])` | Media type |
| `content` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(500)` | Optional caption |

#### `SetWallpaperDto` (Line 50-52)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `wallpaperUrl` | `string \| null` | `@IsOptional`, `@IsUrl` | Wallpaper URL, null to remove |

#### `SetToneDto` (Line 54-56)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `tone` | `string \| null` | `@IsOptional`, `@IsString`, `@MaxLength(100)` | Notification tone, null to remove |

#### `SendMessageDto` (Line 64-101)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `content` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(5000)` | Text content |
| `messageType` | `string?` | `@IsOptional`, `@IsEnum(['TEXT','IMAGE','VIDEO','AUDIO','VOICE','FILE','GIF','STICKER','LOCATION'])` | Message type |
| `mediaUrl` | `string?` | `@IsOptional`, `@IsUrl` | Media URL |
| `mediaType` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(50)` | MIME type |
| `replyToId` | `string?` | `@IsOptional`, `@IsUUID` | Reply-to message ID |
| `isSpoiler` | `boolean?` | `@IsOptional`, `@IsBoolean` | Tap to reveal |
| `isViewOnce` | `boolean?` | `@IsOptional`, `@IsBoolean` | Auto-delete after viewing |

#### `CreateGroupDto` (Line 103-114)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `groupName` | `string` | `@IsString`, `@MaxLength(100)` | Group display name |
| `memberIds` | `string[]` | `@IsArray`, `@IsString({ each: true })`, `@ArrayMaxSize(100)` | Initial member user IDs |

#### `UpdateGroupDto` (Line 116-127)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `groupName` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(100)` | New group name |
| `groupAvatarUrl` | `string?` | `@IsOptional`, `@IsUrl` | New group avatar URL |

#### `AddMembersDto` (Line 129-135)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `memberIds` | `string[]` | `@IsArray`, `@IsString({ each: true })`, `@ArrayMaxSize(100)` | User IDs to add |

#### `ReactDto` (Line 137-142)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `emoji` | `string` | `@IsString`, `@MaxLength(10)` | Emoji reaction |

#### `EditMessageDto` (Line 143-148)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `content` | `string` | `@IsString`, `@MaxLength(5000)` | Updated content |

#### `SetDisappearingTimerDto` (Line 150-155)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `duration` | `number \| null` | `@IsOptional`, `@IsNumber` | Duration in seconds, null to turn off |

#### `ScheduleMessageDto` (Line 157-175)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `conversationId` | `string` | `@IsString` | Target conversation |
| `content` | `string` | `@IsString`, `@MaxLength(5000)` | Message content |
| `scheduledAt` | `string` | `@IsISO8601` | ISO 8601 future datetime |
| `messageType` | `string?` | `@IsOptional`, `@IsEnum([...9 types])` | Message type |

### 2.2 DTOs Defined in Separate Files

#### `CreateDmDto` (`dto/create-dm.dto.ts`)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `targetUserId` | `string` | `@IsUUID` | Target user ID for DM |

#### `MuteConversationDto` (`dto/mute-conversation.dto.ts`)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `muted` | `boolean` | `@IsBoolean` | Mute (true) or unmute (false) |

#### `ArchiveConversationDto` (`dto/archive-conversation.dto.ts`)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `archived` | `boolean` | `@IsBoolean` | Archive (true) or unarchive (false) |

#### `CreateDMNoteDto` (`dto/dm-note.dto.ts`)
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `content` | `string` | `@IsString`, `@MaxLength(60)` | Note content |
| `expiresInHours` | `number?` | `@IsOptional`, `@IsInt`, `@Min(1)`, `@Max(72)` | Hours until expiry (default 24) |

---

## 3. Controller — All 47 Endpoints

**Class declaration (Line 177-186):**
- `@ApiTags('Messages (Risalah)')`
- `@Controller('messages')` — base path: `/api/v1/messages`
- `@UseGuards(ClerkAuthGuard)` — ALL endpoints require JWT auth
- `@ApiBearerAuth()`
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` — 60 req/min default

**Constructor injects:** `MessagesService`, `ChatGateway`

### 3.1 Conversation Endpoints

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 1 | `GET` | `/conversations` | 60/min | Query: `limit?` | `getConversations(userId, limit)` | 188-195 | List all conversations for current user |
| 2 | `GET` | `/conversations/archived` | 60/min | Query: `cursor?` | `getArchivedConversations(userId, cursor)` | 197-204 | List archived conversations (cursor paginated) |
| 3 | `GET` | `/conversations/:id` | 60/min | Param: `id` | `getConversation(id, userId)` | 206-210 | Get conversation details |
| 4 | `GET` | `/conversations/:id/messages` | 60/min | Param: `id`, Query: `cursor?` | `getMessages(id, userId, cursor)` | 212-220 | Get messages (cursor paginated) |
| 5 | `POST` | `/conversations/:id/messages` | **30/min** | Param: `id`, Body: `SendMessageDto` | `sendMessage(id, userId, dto)` | 222-231 | Send a message |
| 6 | `DELETE` | `/conversations/:id/messages/:messageId` | 60/min | Param: `messageId` | `deleteMessage(messageId, userId)` | 233-241 | Delete (unsend) a message |
| 7 | `PATCH` | `/conversations/:id/messages/:messageId` | 60/min | Param: `messageId`, Body: `EditMessageDto` | `editMessage(messageId, userId, content)` | 243-251 | Edit message (within 15 min) |
| 8 | `POST` | `/conversations/:id/read` | 60/min | Param: `id` | `markRead(id, userId)` | 276-280 | Mark conversation as read |
| 9 | `POST` | `/conversations/:id/mute` | 60/min | Param: `id`, Body: `MuteConversationDto` | `muteConversation(id, userId, muted)` | 282-290 | Mute/unmute conversation |
| 10 | `POST` | `/conversations/:id/archive` | 60/min | Param: `id`, Body: `ArchiveConversationDto` | `archiveConversation(id, userId, archived)` | 292-300 | Archive/unarchive (toggle via body) |
| 11 | `PUT` | `/conversations/:id/archive` | 60/min | Param: `id` | `archiveConversationForUser(id, userId)` | 447-454 | Archive conversation (dedicated) |
| 12 | `DELETE` | `/conversations/:id/archive` | 60/min | Param: `id` | `unarchiveConversationForUser(id, userId)` | 456-463 | Unarchive conversation (dedicated) |
| 13 | `PUT` | `/conversations/:id/disappearing` | 60/min | Param: `id`, Body: `SetDisappearingTimerDto` | `setDisappearingTimer(id, userId, duration)` | 437-445 | Set disappearing message timer |
| 14 | `PATCH` | `/conversations/:id/lock-code` | 60/min | Param: `id`, Body: `SetLockCodeDto` | `setLockCode(id, userId, code)` | 365-374 | Set/remove secret lock code |
| 15 | `POST` | `/conversations/:id/verify-lock` | **5/5min** | Param: `id`, Body: `VerifyLockCodeDto` | `verifyLockCode(id, userId, code)` | 376-386 | Verify lock code (anti-brute-force) |

### 3.2 Reaction Endpoints

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 16 | `POST` | `/conversations/:id/messages/:messageId/react` | **30/min** | Param: `messageId`, Body: `ReactDto` | `reactToMessage(messageId, userId, emoji)` | 254-263 | React with emoji |
| 17 | `DELETE` | `/conversations/:id/messages/:messageId/react` | 60/min | Param: `messageId`, Body: `ReactDto` | `removeReaction(messageId, userId, emoji)` | 265-274 | Remove emoji reaction |

### 3.3 DM & Group CRUD

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 18 | `POST` | `/dm` | **10/min** | Body: `CreateDmDto` | `createDM(userId, targetUserId)` | 302-310 | Create or retrieve DM conversation |
| 19 | `POST` | `/groups` | **5/min** | Body: `CreateGroupDto` | `createGroup(userId, groupName, memberIds)` | 312-317 | Create group conversation |
| 20 | `PATCH` | `/groups/:id` | 60/min | Param: `id`, Body: `UpdateGroupDto` | `updateGroup(id, userId, dto)` | 319-327 | Update group name/avatar |
| 21 | `POST` | `/groups/:id/members` | 60/min | Param: `id`, Body: `AddMembersDto` | `addGroupMembers(id, userId, memberIds)` | 329-337 | Add members to group |
| 22 | `DELETE` | `/groups/:id/members/me` | 60/min | Param: `id` | `leaveGroup(id, userId)` | 339-344 | Leave group (non-owner only) |
| 23 | `DELETE` | `/groups/:id/members/:userId` | 60/min | Param: `id`, `userId` | `removeGroupMember(id, userId, targetUserId)` | 346-363 | Kick member (creator only) + socket `room_evicted` emit |
| 24 | `PATCH` | `/groups/:id/history-count` | 60/min | Param: `id`, Body: `SetHistoryCountDto` | `setNewMemberHistoryCount(id, userId, count)` | 388-397 | Set new-member visible message count |
| 25 | `PATCH` | `/groups/:id/members/me/tag` | 60/min | Param: `id`, Body: `SetMemberTagDto` | `setMemberTag(id, userId, tag)` | 399-408 | Set your role label in group |

### 3.4 Search, Forward, Delivery

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 26 | `GET` | `/:conversationId/search` | 60/min | Param: `conversationId`, Query: `q`, `cursor?` | `searchMessages(cid, uid, q, cursor)` | 410-414 | Search messages within conversation |
| 27 | `POST` | `/forward/:messageId` | **20/min** | Param: `messageId`, Body: `ForwardMessageDto` | `forwardMessage(mid, uid, conversationIds)` | 416-422 | Forward message to up to 5 conversations |
| 28 | `POST` | `/:messageId/delivered` | 60/min | Param: `messageId` | `markDelivered(mid, uid)` | 424-429 | Mark message as delivered |
| 29 | `GET` | `/:conversationId/media` | 60/min | Param: `conversationId`, Query: `cursor?` | `getMediaGallery(cid, uid, cursor)` | 431-435 | Media gallery (images + videos) |

### 3.5 Scheduled Messages

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 30 | `POST` | `/messages/scheduled` | **10/min** | Body: `ScheduleMessageDto` | `scheduleMessage(conversationId, userId, content, scheduledAt, messageType)` | 465-479 | Schedule a future message |

### 3.6 Starred Messages

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 31 | `GET` | `/messages/starred` | 60/min | Query: `cursor?` | `getStarredMessages(userId, cursor)` | 481-488 | Get all starred messages |
| 32 | `POST` | `/:conversationId/:messageId/star` | 60/min | Param: `messageId` | `starMessage(userId, messageId)` | 490-497 | Star a message |
| 33 | `DELETE` | `/:conversationId/:messageId/star` | 60/min | Param: `messageId` | `unstarMessage(userId, messageId)` | 499-507 | Unstar a message |

### 3.7 Pinned Messages

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 34 | `POST` | `/:conversationId/:messageId/pin` | 60/min | Param: `conversationId`, `messageId` | `pinMessage(conversationId, messageId, userId)` | 510-518 | Pin message (max 3 per conversation) |
| 35 | `DELETE` | `/:conversationId/:messageId/pin` | 60/min | Param: `conversationId`, `messageId` | `unpinMessage(conversationId, messageId, userId)` | 520-529 | Unpin message |
| 36 | `GET` | `/:conversationId/pinned` | 60/min | Param: `conversationId` | `getPinnedMessages(conversationId, userId)` | 531-538 | Get pinned messages |

### 3.8 View-Once Messages

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 37 | `POST` | `/:conversationId/view-once` | **10/min** | Param: `conversationId`, Body: `SendViewOnceDto` | `sendViewOnceMessage(conversationId, userId, dto)` | 541-550 | Send view-once message |
| 38 | `POST` | `/view-once/:messageId/viewed` | 60/min | Param: `messageId` | `markViewOnceViewed(messageId, userId)` | 552-559 | Mark view-once as viewed |

### 3.9 Group Admin (Promote/Demote/Ban)

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 39 | `POST` | `/:conversationId/members/:targetUserId/promote` | 60/min | Param: `conversationId`, `targetUserId` | `promoteToAdmin(conversationId, userId, targetUserId)` | 562-570 | Promote member to admin (owner only) |
| 40 | `POST` | `/:conversationId/members/:targetUserId/demote` | 60/min | Param: `conversationId`, `targetUserId` | `demoteFromAdmin(conversationId, userId, targetUserId)` | 572-580 | Demote admin to member (owner only) |
| 41 | `POST` | `/:conversationId/members/:targetUserId/ban` | **10/min** | Param: `conversationId`, `targetUserId` | `banMember(conversationId, userId, targetUserId)` | 582-591 | Ban member (owner/admin, cannot ban owner) |

### 3.10 Wallpaper & Tone Customization

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 42 | `PATCH` | `/:conversationId/wallpaper` | 60/min | Param: `conversationId`, Body: `SetWallpaperDto` | `setConversationWallpaper(conversationId, userId, wallpaperUrl)` | 593-601 | Set per-user conversation wallpaper |
| 43 | `PATCH` | `/:conversationId/tone` | 60/min | Param: `conversationId`, Body: `SetToneDto` | `setCustomTone(conversationId, userId, tone)` | 603-611 | Set per-user notification tone |

### 3.11 DM Notes

| # | Method | Path | Rate Limit | DTO | Service Method | Lines | Description |
|---|--------|------|-----------|-----|---------------|-------|-------------|
| 44 | `POST` | `/notes` | 60/min | Body: `CreateDMNoteDto` | `createDMNote(userId, content, expiresInHours)` | 614-621 | Create/update DM note |
| 45 | `GET` | `/notes/me` | 60/min | — | `getDMNote(userId)` | 623-627 | Get own DM note |
| 46 | `DELETE` | `/notes/me` | 60/min | — | `deleteDMNote(userId)` | 629-634 | Delete own DM note |
| 47 | `GET` | `/notes/contacts` | 60/min | — | `getDMNotesForContacts(userId)` | 636-640 | Get DM notes from contacts |

---

## 4. Service — All Methods

### 4.1 Constants & Constructor (Lines 1-97)

**Imports (Lines 1-14):**
- `@nestjs/common`: Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger
- `@nestjs/schedule`: Cron, CronExpression
- `../../config/prisma.service`: PrismaService
- `../notifications/push-trigger.service`: PushTriggerService
- `../ai/ai.service`: AiService
- `@prisma/client`: MessageType
- `crypto`: randomBytes, scrypt, timingSafeEqual
- `util`: promisify

**Constants (Lines 16-87):**
- `scryptAsync` — promisified scrypt for lock code hashing
- `LOCK_KEY_LENGTH = 64` — scrypt derived key length
- `CONVERSATION_SELECT` (Lines 19-41) — Prisma select for conversations: `id, isGroup, createdById, groupName, groupAvatarUrl, lastMessageText, lastMessageAt, createdAt` + members with user `{id, username, displayName, avatarUrl, isVerified}`
- `MESSAGE_SELECT` (Lines 43-87) — Prisma select for messages: `id, senderId, content, messageType, mediaUrl, mediaType, voiceDuration, fileName, fileSize, replyToId, isForwarded, isDeleted, isSpoiler, isViewOnce, viewedAt, isPinned, isScheduled, scheduledAt, isEncrypted, forwardCount, editedAt, deliveredAt, transcription, createdAt` + sender `{id, username, displayName, avatarUrl}` + replyTo `{id, content, senderId, sender.username}` + reactions `{id, emoji, userId}`

**Constructor (Lines 93-97):**
- `PrismaService` — database access
- `PushTriggerService` — push notifications
- `AiService` — voice transcription

### 4.2 Conversation Methods

#### `getConversations(userId, limit=50)` — Lines 99-117
- Clamps limit to [1, 100]
- Queries `conversationMember.findMany` where userId, includes conversation with CONVERSATION_SELECT
- Orders by `conversation.lastMessageAt desc`
- Maps to flat object with `isMuted, isArchived, unreadCount, lastReadAt` merged from membership

#### `getConversation(conversationId, userId)` — Lines 119-127
- Calls `requireMembership()` first
- Queries `conversation.findUnique` with CONVERSATION_SELECT
- Returns conversation + membership fields (isMuted, isArchived)

#### `getMessages(conversationId, userId, cursor?, limit=50)` — Lines 129-151
- Calls `requireMembership()` first
- Cursor-based keyset pagination: `take: limit+1`, cursor skip 1
- Filters: `isDeleted: false`
- Orders by `createdAt desc`
- Returns `{ data, meta: { cursor, hasMore } }`

#### `getArchivedConversations(userId, cursor?, limit=20)` — Lines 719-747
- Queries `conversationMember.findMany` where `{ userId, isArchived: true }`
- Cursor uses composite key `conversationId_userId`
- Orders by `conversation.lastMessageAt desc`
- Returns `{ data, meta: { cursor, hasMore } }`

### 4.3 Message CRUD

#### `sendMessage(conversationId, senderId, data)` — Lines 153-282
**The most complex method. 130 lines. Multi-step validation + atomic transaction.**

1. **Membership check** (Line 166) — `requireMembership()`
2. **Block check** (Lines 169-187) — Queries all other members, checks `Block` table for bidirectional blocks between sender and any member
3. **DM privacy check** (Lines 189-210) — For 1:1 DMs only: if sender doesn't follow recipient AND recipient is private, throws 403
4. **Content validation** (Lines 212-214) — Must have content OR mediaUrl
5. **Slow mode enforcement** (Lines 216-233) — If conversation has `slowModeSeconds > 0`, checks sender's last message timestamp and enforces cooldown
6. **Atomic transaction** (Lines 236-268):
   - Creates message with: conversationId, senderId, content, messageType (cast to MessageType enum), mediaUrl, mediaType, replyToId, isSpoiler, isViewOnce, expiresAt (if disappearing enabled)
   - Updates conversation: lastMessageAt, lastMessageText (first 100 chars), lastMessageById
   - Increments unreadCount for all other members
7. **Async voice transcription** (Lines 270-279) — If messageType is VOICE with mediaUrl, fires `ai.transcribeVoiceMessage()` (non-blocking, catch-and-log)
8. Returns created message

#### `deleteMessage(messageId, userId)` — Lines 284-294
- Sender-only check (`senderId !== userId` -> 403)
- Soft delete: sets `isDeleted: true, content: null`
- Returns `{ deleted: true }`

#### `editMessage(messageId, userId, content)` — Lines 296-315
- Validates content not empty
- Sender-only check
- Cannot edit deleted messages
- **15-minute window**: compares `createdAt` against 15 min ago
- Updates content + sets `editedAt`
- Returns `{ message: updated }`

### 4.4 DM & Group Management

#### `createDM(userId, targetUserId)` — Lines 318-361
- Self-DM check
- Target user existence check
- Bidirectional block check
- **Atomic transaction** to prevent duplicate DMs:
  - Searches for existing 1:1 conversation with both users as members
  - If found, returns existing
  - Otherwise creates new conversation with `isGroup: false` and two ConversationMember records

#### `createGroup(userId, groupName, memberIds)` — Lines 363-406
- Validates groupName not empty
- Deduplicates member IDs (always includes creator)
- Validates all member IDs exist as real users (up to 50 checked)
- Checks blocks between creator and any member
- Creates conversation with `isGroup: true` and all members

#### `updateGroup(conversationId, userId, data)` — Lines 408-423
- **Creator-only**: checks `createdById === userId`
- Validates is group
- Updates groupName and/or groupAvatarUrl

#### `addGroupMembers(conversationId, userId, memberIds)` — Lines 425-459
- **Creator-only**
- Validates all member IDs exist
- Block checks
- `createMany` with `skipDuplicates: true`

#### `removeGroupMember(conversationId, userId, targetUserId)` — Lines 461-470
- **Creator-only**
- Deletes ConversationMember by composite key
- Returns `{ removed: true, conversationId, targetUserId }` — used by controller for socket `room_evicted` event

#### `leaveGroup(conversationId, userId)` — Lines 525-538
- Membership check
- **Owner cannot leave** — must transfer ownership first
- Deletes ConversationMember

### 4.5 Lock Code (scrypt-based)

#### `setLockCode(conversationId, userId, code)` — Lines 472-485
- Membership check
- If code provided: generates 16-byte random salt, derives 64-byte key via scrypt, stores as `salt:hex` in `lockCode` field
- If null: removes lock code
- Conversation-level lock (all members share same lock)

#### `verifyLockCode(conversationId, userId, code)` — Lines 487-499
- Membership check
- Fetches stored `lockCode` (format: `salt:derivedKeyHex`)
- Splits salt, re-derives key via scrypt, uses `timingSafeEqual` for constant-time comparison
- Returns `{ valid: boolean }`
- **Rate limited to 5 attempts per 5 minutes** (anti-brute-force)

### 4.6 Group Settings

#### `setNewMemberHistoryCount(conversationId, userId, count)` — Lines 501-514
- **Owner-only** (checks `createdById`)
- Clamps count to [0, 100]
- Stores on Conversation model

#### `setMemberTag(conversationId, userId, tag)` — Lines 516-523
- Membership check
- Truncates to 30 chars
- Stored per-member on ConversationMember

### 4.7 Conversation State

#### `markRead(conversationId, userId)` — Lines 540-547
- Updates `lastReadAt` to now, `unreadCount` to 0

#### `muteConversation(conversationId, userId, muted)` — Lines 549-556
- Updates `isMuted` on ConversationMember

#### `archiveConversation(conversationId, userId, archived)` — Lines 558-565
- Updates `isArchived` on ConversationMember (toggle via boolean param)

#### `archiveConversationForUser(conversationId, userId)` — Lines 701-708
- Sets `isArchived: true` on ConversationMember

#### `unarchiveConversationForUser(conversationId, userId)` — Lines 710-717
- Sets `isArchived: false` on ConversationMember

### 4.8 Reactions

#### `reactToMessage(messageId, userId, emoji)` — Lines 567-578
- Validates message exists and not deleted
- Membership check on message's conversation
- Upserts MessageReaction (unique constraint: `messageId_userId_emoji`)

#### `removeReaction(messageId, userId, emoji)` — Lines 580-588
- Validates message exists
- Membership check
- Deletes matching MessageReaction

### 4.9 Search & Forward

#### `searchMessages(conversationId, userId, query, cursor?, limit=20)` — Lines 599-611
- Query validation (not empty)
- Membership check
- Prisma `contains` with `mode: 'insensitive'` (case-insensitive LIKE)
- Cursor-based: `id: { lt: cursor }`
- Returns `{ data, meta: { cursor, hasMore } }`

#### `forwardMessage(messageId, userId, targetConversationIds)` — Lines 613-661
- Max 5 target conversations
- Validates original message exists
- **View-once messages cannot be forwarded**
- Membership check on source conversation
- For each target: membership check, create new message with `isForwarded: true, forwardedFromId`, update conversation lastMessage
- Increments `forwardCount` on original message

### 4.10 Delivery Tracking

#### `markDelivered(messageId, userId)` — Lines 663-672
- Validates message exists
- Membership check
- **Idempotent**: only sets `deliveredAt` if not already set

### 4.11 Media Gallery

#### `getMediaGallery(conversationId, userId, cursor?, limit=30)` — Lines 674-685
- Membership check
- Filters: `messageType in ['IMAGE', 'VIDEO'], isDeleted: false`
- Cursor-based pagination
- Selects: `id, mediaUrl, mediaType, messageType, createdAt, senderId`

### 4.12 Disappearing Messages

#### `setDisappearingTimer(conversationId, userId, duration)` — Lines 687-699
- Membership check
- Validates duration is null (off) or positive integer in seconds
- Stores on `Conversation.disappearingDuration`
- When set, all new messages get `expiresAt = now + duration` (applied in sendMessage)

### 4.13 Scheduled Messages

#### `scheduleMessage(conversationId, userId, content, scheduledAt, messageType?)` — Lines 749-776
- Membership check
- Content validation
- **Future validation**: `scheduledAt` must be after now
- Creates message with `isScheduled: true, scheduledAt`
- Does NOT update conversation lastMessage (message is not yet "sent")

#### `publishScheduledMessages()` — Lines 1031-1086 (CRON)
- **`@Cron(CronExpression.EVERY_MINUTE)`** — runs automatically
- Finds up to 50 overdue messages (`isScheduled: true, scheduledAt <= now, isDeleted: false`)
- For each (in transaction):
  - Sets `isScheduled: false, scheduledAt: null`
  - Updates conversation lastMessage metadata
  - Increments unreadCount for other members
- Logs count of published messages
- Returns count (for testing)

### 4.14 Starred Messages

#### `starMessage(userId, messageId)` — Lines 778-788
- Validates message exists
- Upserts StarredMessage (join table, unique constraint: `userId_messageId`)

#### `unstarMessage(userId, messageId)` — Lines 790-794
- Deletes StarredMessage matching userId + messageId (idempotent via deleteMany)

#### `getStarredMessages(userId, cursor?, limit=20)` — Lines 796-826
- Queries StarredMessage join table ordered by `createdAt desc`
- Cursor-based pagination on StarredMessage.id
- Fetches full message data for starred entries (filters out deleted)
- **Preserves starred order** via Map + ordered iteration

### 4.15 Pinned Messages

#### `pinMessage(conversationId, messageId, userId)` — Lines 829-850
- Membership check
- Validates message belongs to conversation
- **Max 3 pinned per conversation** — counts existing pinned messages
- Sets `isPinned: true, pinnedAt: now, pinnedById: userId`

#### `unpinMessage(conversationId, messageId, userId)` — Lines 852-865
- Membership check
- Validates message belongs to conversation
- Sets `isPinned: false, pinnedAt: null, pinnedById: null`

#### `getPinnedMessages(conversationId, userId)` — Lines 867-875
- Membership check
- Returns all pinned non-deleted messages (max 50), ordered by `pinnedAt desc`

### 4.16 View-Once Messages

#### `sendViewOnceMessage(conversationId, senderId, data)` — Lines 878-896
- Membership check
- Creates message with `isViewOnce: true`
- Default messageType: IMAGE (if not specified)

#### `markViewOnceViewed(messageId, userId)` — Lines 898-914
- Validates: message exists, is view-once, not sender, not already viewed
- Membership check
- Sets `viewedAt: now`

### 4.17 Group Admin Roles

#### `promoteToAdmin(conversationId, userId, targetUserId)` — Lines 917-928
- Verifies actor has `role: 'owner'`
- Sets target member's `role: 'admin'`

#### `demoteFromAdmin(conversationId, userId, targetUserId)` — Lines 930-941
- Verifies actor has `role: 'owner'`
- Sets target member's `role: 'member'`

#### `banMember(conversationId, userId, targetUserId)` — Lines 943-960
- Verifies actor has `role: 'owner'` or `role: 'admin'`
- **Cannot ban the owner**
- Sets target member's `isBanned: true`
- Banned members are blocked by `requireMembership()` (Line 595)

### 4.18 Wallpaper & Tone

#### `setConversationWallpaper(conversationId, userId, wallpaperUrl)` — Lines 962-968
- Per-user: stored on ConversationMember.wallpaperUrl
- Null to remove

#### `setCustomTone(conversationId, userId, tone)` — Lines 970-976
- Per-user: stored on ConversationMember.customTone
- Null to remove

### 4.19 DM Notes

#### `createDMNote(userId, content, expiresInHours=24)` — Lines 979-986
- Calculates expiresAt from hours
- Upserts on DMNote (unique: userId) — one note per user
- Returns DMNote record

#### `getDMNote(userId)` — Lines 988-992
- Returns null if expired or not found
- Checks `expiresAt < now`

#### `deleteDMNote(userId)` — Lines 994-999
- Validates note exists
- Hard deletes DMNote

#### `getDMNotesForContacts(userId)` — Lines 1001-1023
- Finds all conversations the user is in (up to 50)
- Collects all other member IDs from those conversations
- Deduplicates contact IDs
- Queries DMNote for those contacts where `expiresAt > now`

### 4.20 Message Expiry Job

#### `processExpiredMessages()` — Lines 1089-1102
- **Not cron-decorated** (must be called externally or needs @Cron added)
- Soft-deletes expired disappearing messages: `expiresAt < now` -> `isDeleted: true, content: null, mediaUrl: null`
- Soft-deletes viewed view-once messages older than 30 seconds: `isViewOnce: true, viewedAt < 30s ago`

### 4.21 Helper Methods

#### `requireMembership(conversationId, userId)` — Lines 590-597
- Queries ConversationMember by composite key
- Throws `ForbiddenException('Not a member of this conversation')` if not found
- Throws `ForbiddenException('You are banned from this conversation')` if `isBanned: true`
- Returns member record (used for isMuted, isArchived, etc.)

---

## 5. Prisma Models Referenced

### `Conversation` (schema.prisma:1599-1626)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `cuid()` | PK |
| `isGroup` | `Boolean` | `false` | DM vs group |
| `groupName` | `String?` | — | Group only |
| `groupAvatarUrl` | `String?` | — | Group only |
| `createdById` | `String?` | — | FK -> User, SetNull |
| `lastMessageText` | `String?` | — | Preview text (100 chars) |
| `lastMessageAt` | `DateTime?` | — | For sorting |
| `lastMessageById` | `String?` | — | FK -> User, SetNull |
| `disappearingDuration` | `Int?` | — | Seconds, null = off |
| `slowModeSeconds` | `Int?` | — | 0/30/60/300/900/3600 |
| `lockCode` | `String?` | — | scrypt hash `salt:key` |
| `newMemberHistoryCount` | `Int?` | `25` | 0-100 visible to new members |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Index:** `@@index([lastMessageAt(sort: Desc)])`
**Table:** `conversations`

### `ConversationMember` (schema.prisma:1628-1647)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `conversationId` | `String` | — | Composite PK |
| `userId` | `String` | — | Composite PK |
| `lastReadAt` | `DateTime` | `now()` | |
| `unreadCount` | `Int` | `0` | |
| `isMuted` | `Boolean` | `false` | |
| `isArchived` | `Boolean` | `false` | Per-user |
| `role` | `String` | `"member"` | `VarChar(10)`: owner/admin/member |
| `isBanned` | `Boolean` | `false` | |
| `customTone` | `String?` | — | Per-user notification tone |
| `wallpaperUrl` | `String?` | — | Per-user wallpaper |
| `tag` | `String?` | — | `VarChar(30)`: role label |
| `joinedAt` | `DateTime` | `now()` | |

**PK:** `@@id([conversationId, userId])`
**Index:** `@@index([userId])`
**Table:** `conversation_members`

### `Message` (schema.prisma:1649-1700)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `cuid()` | PK |
| `conversationId` | `String` | — | FK -> Conversation, Cascade |
| `senderId` | `String?` | — | FK -> User, SetNull |
| `content` | `String?` | — | `VarChar(5000)` |
| `messageType` | `MessageType` | `TEXT` | Enum |
| `mediaUrl` | `String?` | — | |
| `mediaType` | `String?` | — | MIME type |
| `voiceDuration` | `Float?` | — | Voice message length |
| `fileName` | `String?` | — | File attachment name |
| `fileSize` | `Int?` | — | File size in bytes |
| `replyToId` | `String?` | — | Self-relation, SetNull |
| `deliveredAt` | `DateTime?` | — | Delivery timestamp |
| `isForwarded` | `Boolean` | `false` | |
| `forwardedFromId` | `String?` | — | Source message ID |
| `forwardCount` | `Int` | `0` | Times forwarded |
| `editableUntil` | `DateTime?` | — | Not used (service calculates 15min) |
| `expiresAt` | `DateTime?` | — | Disappearing message expiry |
| `isDeleted` | `Boolean` | `false` | Soft delete |
| `editedAt` | `DateTime?` | — | Last edit timestamp |
| `isScheduled` | `Boolean` | `false` | |
| `scheduledAt` | `DateTime?` | — | Future send time |
| `starredBy` | `String[]` | `[]` | @deprecated, use StarredMessage |
| `isPinned` | `Boolean` | `false` | |
| `pinnedAt` | `DateTime?` | — | |
| `pinnedById` | `String?` | — | FK -> User, SetNull |
| `isViewOnce` | `Boolean` | `false` | |
| `viewedAt` | `DateTime?` | — | View-once viewed timestamp |
| `isSpoiler` | `Boolean` | `false` | Tap to reveal |
| `isSilent` | `Boolean` | `false` | No notification |
| `isEncrypted` | `Boolean` | `false` | E2EE flag |
| `transcription` | `String?` | — | Voice message transcription |
| `encNonce` | `String?` | — | Encryption nonce |
| `createdAt` | `DateTime` | `now()` | |

**Indexes:**
- `@@index([conversationId, createdAt(sort: Desc)])` — message list
- `@@index([senderId])` — sender lookup
- `@@index([expiresAt])` — expiry job
- `@@index([scheduledAt])` — scheduled message job
**Table:** `messages`

### `MessageReaction` (schema.prisma:2210-2222)
| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | `cuid()` PK |
| `messageId` | `String` | FK -> Message, Cascade |
| `userId` | `String` | FK -> User, Cascade |
| `emoji` | `String` | `VarChar(10)` |
| `createdAt` | `DateTime` | `now()` |

**Unique:** `@@unique([messageId, userId, emoji])` — one reaction per user per emoji per message
**Table:** `message_reactions`

### `StarredMessage` (schema.prisma:4692-4704)
| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | `cuid()` PK |
| `userId` | `String` | FK -> User, Cascade |
| `messageId` | `String` | FK -> Message, Cascade |
| `createdAt` | `DateTime` | `now()` |

**Unique:** `@@unique([userId, messageId])`
**Indexes:** `@@index([userId, createdAt(sort: Desc)])`, `@@index([messageId])`
**Table:** `starred_messages`

### `DMNote` (schema.prisma:3186-3196)
| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | `uuid()` PK |
| `userId` | `String` | `@unique` — one note per user |
| `content` | `String` | `VarChar(60)` |
| `expiresAt` | `DateTime` | Auto-expiry |
| `createdAt` | `DateTime` | `now()` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Table:** `dm_notes`

### `MessageType` Enum (schema.prisma:173-185)
```
TEXT | IMAGE | VOICE | VIDEO | STICKER | FILE | SYSTEM | GIF | STORY_REPLY | LOCATION | CONTACT
```
Note: SendMessageDto validates a subset (no SYSTEM, STORY_REPLY, CONTACT), but the Prisma enum has 11 values.

---

## 6. Rate Limit Summary

| Endpoint | Limit | Window | Justification |
|----------|-------|--------|--------------|
| Default (all endpoints) | 60 | 60s | General protection |
| Send message | 30 | 60s | Write-heavy, prevents spam |
| React to message | 30 | 60s | Prevents reaction spam |
| Create DM | 10 | 60s | Prevents mass DM creation |
| Create group | 5 | 60s | Expensive operation |
| Forward message | 20 | 60s | Multi-target write |
| Schedule message | 10 | 60s | Write operation |
| Send view-once | 10 | 60s | Write operation |
| Ban member | 10 | 60s | Admin action |
| Verify lock code | 5 | 300s (5min) | Anti-brute-force |

---

## 7. Security Features

### 7.1 Lock Code (scrypt)
- 16-byte random salt per conversation
- 64-byte derived key via scrypt
- Stored as `salt:derivedKeyHex` in Conversation.lockCode
- Verification uses `timingSafeEqual` for constant-time comparison
- Rate limited: 5 attempts per 5 minutes

### 7.2 Block Enforcement
- DM creation checks bidirectional blocks
- Message sending checks bidirectional blocks against all conversation members
- Group creation checks blocks between creator and all members
- Adding members checks blocks

### 7.3 DM Privacy
- Private accounts only accept messages from followers
- Checked on every message send in 1:1 DMs

### 7.4 Membership Enforcement
- Every read/write operation calls `requireMembership()`
- Banned members are blocked from all operations

### 7.5 View-Once Protection
- Cannot forward view-once messages
- Sender cannot mark own view-once as viewed
- Already-viewed view-once throws error (no re-view)
- Auto-deleted 30 seconds after viewing (via processExpiredMessages)

---

## 8. Socket.io Integration

**Only one direct socket emission from the controller:**

**Lines 346-363 — `removeMember` endpoint:**
```typescript
if (this.chatGateway.server) {
  this.chatGateway.server
    .to(`user:${targetUserId}`)
    .emit('room_evicted', { conversationId: id, removedBy: userId });
}
```

This emits `room_evicted` to the kicked user's socket room so the client can leave the conversation and show a UI notification.

All other real-time events (new messages, typing indicators, read receipts) are handled by `ChatGateway` directly via Socket.io events, not through this controller.

---

## 9. Cron Jobs

| Job | Schedule | Method | Lines | Description |
|-----|----------|--------|-------|-------------|
| Scheduled message auto-send | `EVERY_MINUTE` | `publishScheduledMessages()` | 1031-1086 | Finds overdue scheduled messages, marks as sent, updates conversation metadata |
| Message expiry | Not cron-decorated | `processExpiredMessages()` | 1089-1102 | Deletes expired disappearing + viewed view-once messages |

**Note:** `processExpiredMessages()` lacks `@Cron` decorator — it is defined but never automatically executed. This is a potential bug; it should either have `@Cron(CronExpression.EVERY_MINUTE)` or be called from another scheduled service.

---

## 10. Key Logic Flows

### 10.1 Send Message Flow
```
1. requireMembership(conversationId, senderId)
2. Check bidirectional blocks with all other members
3. For 1:1 DMs: check sender follows recipient if private
4. Validate content OR mediaUrl present
5. Check slow mode cooldown
6. $transaction:
   a. Create message (with expiresAt if disappearing)
   b. Update conversation lastMessage metadata
   c. Increment unreadCount for other members
7. If VOICE: fire async AI transcription
8. Return message
```

### 10.2 Create DM Flow
```
1. Prevent self-DM
2. Verify target user exists
3. Check bidirectional blocks
4. $transaction:
   a. Search for existing 1:1 conversation with both users
   b. If found -> return existing (idempotent)
   c. If not found -> create conversation + 2 members
```

### 10.3 Group Admin Hierarchy
```
owner  -> can: update group, add/remove members, set history count, promote, demote, ban
admin  -> can: ban members (except owner)
member -> can: send/read/react/star/pin messages, set own tag/wallpaper/tone, leave
banned -> cannot: any operation (blocked at requireMembership)
```

### 10.4 Scheduled Message Lifecycle
```
1. User creates scheduled message (isScheduled=true, scheduledAt=future)
2. @Cron(EVERY_MINUTE) checks for overdue messages
3. For each overdue message (in transaction):
   a. Set isScheduled=false, scheduledAt=null
   b. Update conversation lastMessage metadata
   c. Increment unreadCount for other members
4. Message becomes visible in getMessages() (isDeleted=false check only)
```

### 10.5 Disappearing Message Lifecycle
```
1. Admin sets conversation.disappearingDuration (seconds)
2. On sendMessage: expiresAt = now + disappearingDuration
3. processExpiredMessages() (NOT cron-decorated — bug):
   a. Find messages where expiresAt < now, isDeleted: false
   b. Set isDeleted: true, content: null, mediaUrl: null
```

### 10.6 View-Once Lifecycle
```
1. Sender creates message with isViewOnce: true
2. Recipient calls markViewOnceViewed -> viewedAt = now
3. processExpiredMessages() (30s after viewedAt):
   a. Find isViewOnce messages where viewedAt < 30s ago
   b. Set isDeleted: true, content: null, mediaUrl: null
```

---

## 11. Endpoint Count Verification

| Category | Count | Endpoints |
|----------|-------|-----------|
| Conversation CRUD & State | 15 | GET conversations, GET archived, GET conversation, GET messages, POST send, DELETE message, PATCH edit, POST read, POST mute, POST archive, PUT archive, DELETE archive, PUT disappearing, PATCH lock-code, POST verify-lock |
| Reactions | 2 | POST react, DELETE react |
| DM & Group CRUD | 8 | POST dm, POST groups, PATCH groups, POST add members, DELETE leave, DELETE remove member, PATCH history-count, PATCH member tag |
| Search/Forward/Delivery/Media | 4 | GET search, POST forward, POST delivered, GET media |
| Scheduled | 1 | POST schedule |
| Starred | 3 | GET starred, POST star, DELETE unstar |
| Pinned | 3 | POST pin, DELETE unpin, GET pinned |
| View-Once | 2 | POST send view-once, POST mark viewed |
| Group Admin | 3 | POST promote, POST demote, POST ban |
| Wallpaper & Tone | 2 | PATCH wallpaper, PATCH tone |
| DM Notes | 4 | POST create, GET mine, DELETE mine, GET contacts |
| **Total** | **47** | |

---

## 12. Known Issues & Observations

1. **`processExpiredMessages()` not cron-decorated** (Line 1089) — The method exists but has no `@Cron` decorator, meaning expired disappearing messages and viewed view-once messages are never automatically cleaned up. The `publishScheduledMessages()` above it does have `@Cron(CronExpression.EVERY_MINUTE)`.

2. **Duplicate archive endpoints** — There are three ways to archive/unarchive:
   - `POST /conversations/:id/archive` with `{ archived: boolean }` body (Line 292)
   - `PUT /conversations/:id/archive` (no body, always archives) (Line 447)
   - `DELETE /conversations/:id/archive` (no body, always unarchives) (Line 456)

3. **updateGroup is creator-only** — Uses `createdById` check, not role-based. An admin with `role: 'admin'` cannot update group settings.

4. **removeGroupMember is creator-only** — Same as above, doesn't use the role system.

5. **addGroupMembers is creator-only** — Admins cannot add members.

6. **No ownership transfer** — `leaveGroup` blocks the owner from leaving ("Transfer ownership first"), but no transfer endpoint exists.

7. **Slow mode not settable via API** — `slowModeSeconds` is checked in `sendMessage` but there's no endpoint to set it.

8. **SendMessageDto messageType vs Prisma MessageType** — The DTO allows `AUDIO` which is not in the Prisma enum (enum has: TEXT, IMAGE, VOICE, VIDEO, STICKER, FILE, SYSTEM, GIF, STORY_REPLY, LOCATION, CONTACT). The cast `as MessageType` would cause a Prisma error for AUDIO.

9. **StarredMessage cursor** — Uses StarredMessage.id as cursor, not message.id. This is correct for the starred-messages list but differs from other endpoints that use message.id.

10. **DM Notes expiry** — Expired notes are filtered in `getDMNote` and `getDMNotesForContacts`, but never hard-deleted. They accumulate in the database.
