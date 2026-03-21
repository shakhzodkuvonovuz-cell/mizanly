# Audit Agent #6 — Messaging / Real-time

**Scope:** messages, gateways (chat.gateway), calls, telegram-features, encryption, broadcast, discord-features, chat-export
**Files audited:** 35 files, line-by-line
**Date:** 2026-03-21
**Total findings:** 78

---

## CRITICAL (P0) — Ship Blockers

### 1. isSpoiler / isViewOnce NOT in MESSAGE_SELECT — features completely broken on read
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 37-71
**Severity:** P0
**Category:** Data / Feature broken
**Description:** The `MESSAGE_SELECT` constant, used by `getMessages()`, `sendMessage()`, `editMessage()`, `searchMessages()`, `getStarredMessages()`, `getPinnedMessages()`, and `sendViewOnceMessage()`, does NOT include `isSpoiler`, `isViewOnce`, or `viewedAt`. This means:
- Spoiler messages are stored with `isSpoiler: true` but the client never receives this flag, so the tap-to-reveal UI can never render.
- View-once messages are stored with `isViewOnce: true` but the client never knows a message is view-once, breaking the entire feature.
- `viewedAt` is never returned, so `markViewOnceViewed()` updates the DB but the client can't distinguish viewed vs unviewed.

Also missing from MESSAGE_SELECT: `senderId` (only nested sender object), `deliveredAt`, `isPinned`, `pinnedAt`, `isScheduled`, `scheduledAt`, `starredBy`, `isSilent`, `isEncrypted`, `forwardCount`, `forwardedFromId`.

```ts
// MESSAGE_SELECT is missing these fields:
// isSpoiler, isViewOnce, viewedAt, senderId, deliveredAt,
// isPinned, pinnedAt, isScheduled, scheduledAt, starredBy,
// isSilent, isEncrypted, forwardCount, forwardedFromId
```

### 2. View-once messages can be forwarded — privacy violation
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 481-528
**Severity:** P0
**Category:** Privacy / Security
**Description:** `forwardMessage()` fetches the original message and copies its content/media to target conversations. There is NO check for `isViewOnce` on the original message. View-once messages (designed to be ephemeral) can be forwarded to unlimited conversations, completely defeating the privacy feature.

```ts
// Line 490-498: No isViewOnce check
const original = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: {
    conversationId: true, content: true, messageType: true, mediaUrl: true,
    // isViewOnce NOT checked
  },
});
```

**Fix:** Add `isViewOnce` to the select, and throw `BadRequestException('View-once messages cannot be forwarded')` if true.

### 3. Lock code stored and compared in plaintext — brute-forceable
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 350-367
**Severity:** P0
**Category:** Security
**Description:** `setLockCode()` stores the lock code as plaintext in the database. `verifyLockCode()` compares with `===` (plaintext comparison). Combined with no specific rate limit on the verify-lock endpoint (only global throttle at 100/min), the 4-6 digit code can be brute-forced in minutes.

```ts
// Line 354: Stored as plaintext
data: { lockCode: code },

// Line 366: Plaintext comparison
return { valid: convo.lockCode === code };
```

**Fix:** Hash the code with scrypt/bcrypt before storing. Use constant-time comparison. Add specific rate limit (e.g., 5 attempts per minute).

### 4. Removed group members stay in socket rooms — can read all future messages
**File:** `apps/api/src/gateways/chat.gateway.ts` + `apps/api/src/modules/messages/messages.service.ts`, line 344-348
**Severity:** P0
**Category:** Security / Authorization
**Description:** When `removeGroupMember()` is called, it only deletes the `ConversationMember` DB record. The removed user's socket(s) remain joined to the `conversation:{id}` socket.io room. All subsequent `new_message`, `user_typing`, `messages_read`, and `delivery_receipt` events are still broadcast to the removed user in real-time. There is no mechanism to force-leave a socket from a room.

Similarly, `leaveGroup()` and `banMember()` do not evict the user from the socket room.

```ts
// removeGroupMember only deletes DB record — socket rooms untouched
async removeGroupMember(conversationId: string, userId: string, targetUserId: string) {
  // ...
  await this.prisma.conversationMember.delete({...});
  return { removed: true };
  // ❌ No socket room eviction
}
```

### 5. WebSocket send_message omits isSpoiler/isViewOnce — features unavailable via real-time
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 191-234 + `apps/api/src/gateways/dto/send-message.dto.ts`
**Severity:** P0
**Category:** Feature broken
**Description:** The WebSocket `send_message` handler and its DTO (`WsSendMessageDto`) do not include `isSpoiler` or `isViewOnce` fields. Since most messaging apps send via WebSocket (not REST), the spoiler and view-once features are completely inaccessible through the real-time path.

```ts
// WsSendMessageDto — missing fields:
export class WsSendMessageDto {
  conversationId: string;
  content?: string;
  messageType?: string;
  mediaUrl?: string;
  mediaType?: string;
  replyToId?: string;
  // ❌ isSpoiler missing
  // ❌ isViewOnce missing
}
```

---

## HIGH (P1) — Security & Data Integrity

### 6. No block check on sendMessage — blocked users can message in existing conversations
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 136-201
**Severity:** P1
**Category:** Security / Privacy
**Description:** `sendMessage()` only calls `requireMembership()` which checks the ConversationMember table. There is no block check. If User A blocks User B, but they are already in a shared group or existing DM, User B can continue sending messages to User A. The block check only exists in `createDM()` (line 244).

### 7. No block check on calls — blocked users can call each other
**File:** `apps/api/src/modules/calls/calls.service.ts`, lines 25-59
**Severity:** P1
**Category:** Security / Privacy
**Description:** `initiate()` only checks for self-calling and active calls. There is no check whether the caller has blocked the target or vice versa. A blocked user can continuously initiate calls.

### 8. Typing indicator leaks to blocked/restricted users
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 236-253
**Severity:** P1
**Category:** Privacy
**Description:** The `typing` handler broadcasts `user_typing` to all clients in the conversation room. There is no filtering for blocked or restricted users. If User A blocks User B but they share a group, User A's typing indicator is visible to User B.

### 9. Read receipt broadcast leaks to all members — no privacy control
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 255-271
**Severity:** P1
**Category:** Privacy
**Description:** The `read` handler broadcasts `messages_read` with the userId to all clients in the conversation room. There is no "read receipt privacy" setting. Users cannot disable read receipts. In production messaging apps, this is a core privacy feature.

### 10. Online/offline status broadcast to ALL connected clients — no privacy control
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 137, 167
**Severity:** P1
**Category:** Privacy
**Description:** `user_online` and `user_offline` events are broadcast via `this.server.emit()` which sends to ALL connected clients across ALL namespaces, not just friends/contacts. Any authenticated user can see when any other user comes online/offline. There is no "last seen" privacy setting.

```ts
// Line 137: Broadcast to EVERYONE
this.server.emit('user_online', { userId, isOnline: true });

// Line 167: Broadcast to EVERYONE
this.server.emit('user_offline', { userId, isOnline: false, lastSeenAt: ... });
```

### 11. get_online_status has no membership/friendship check — status scraping
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 273-290
**Severity:** P1
**Category:** Privacy
**Description:** The `get_online_status` handler accepts up to 100 arbitrary user IDs and returns their online status. There is no check that the requester is a friend, contact, or even knows these users. Any authenticated user can bulk-scrape the online status of up to 100 users per request.

### 12. call_initiate has no block/friendship check — anyone can call anyone
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 292-307
**Severity:** P1
**Category:** Security
**Description:** The WebSocket `call_initiate` handler sends an `incoming_call` event to the target user with zero authorization checks. Any authenticated user can ring any other user, even if blocked or not connected. No consent or contact relationship required.

### 13. Encryption status endpoint has no auth check on conversation membership
**File:** `apps/api/src/modules/encryption/encryption.controller.ts`, lines 139-145
**Severity:** P1
**Category:** Authorization
**Description:** `GET /encryption/status/:conversationId` returns whether each member has encryption keys, including member userIds. It does not verify the requester is a member of the conversation. Any authenticated user can enumerate members of any conversation.

```ts
@Get('status/:conversationId')
async getConversationStatus(
  @Param('conversationId') conversationId: string,
  // ❌ No userId check — any authenticated user can query any conversation
) {
  return this.encryptionService.getConversationEncryptionStatus(conversationId);
}
```

### 14. Forum thread lock/pin has no authorization check — any user can lock any thread
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 79-89
**Severity:** P1
**Category:** Authorization
**Description:** `lockForumThread()` accepts a `userId` parameter but never uses it — does not verify the user is the thread author, a moderator, or even a member of the circle. Any authenticated user can lock any forum thread. Same issue with `pinForumThread()`.

```ts
async lockForumThread(threadId: string, userId: string) {
  // userId is completely ignored!
  return this.prisma.forumThread.update({ where: { id: threadId }, data: { isLocked: true } });
}
```

### 15. Webhook execution has no HMAC signature verification
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 117-129
**Severity:** P1
**Category:** Security
**Description:** `executeWebhook()` accepts any request with the correct token. The Webhook model has a `secret` field (for HMAC-SHA256), but the execute method does not verify any signature. Any party who discovers or guesses the token UUID can post messages.

### 16. Broadcast channel messages endpoint is unauthenticated — anyone can read
**File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`, line 132
**Severity:** P1 (or by design — depends on whether broadcast channels are intended as public)
**Category:** Authorization
**Description:** `GET :id/messages` uses `OptionalClerkAuthGuard` — messages are readable without authentication. This may be intentional for public channels, but there's no private channel type or subscriber-only viewing option.

### 17. No slow mode enforcement on message sending
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 136-201
**Severity:** P1
**Category:** Feature broken
**Description:** The `Conversation` model has a `slowModeSeconds` field that can be set via `TelegramFeaturesService.setSlowMode()`. However, `sendMessage()` never checks this field. Users can send messages at any rate regardless of slow mode setting.

### 18. No disappearing message expiry scheduling — messages only expire on manual job run
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 550-562, 859-872
**Severity:** P1
**Category:** Feature incomplete
**Description:** `setDisappearingTimer()` sets `disappearingDuration` on the conversation, but `sendMessage()` never sets `expiresAt` on individual messages based on this duration. The `processExpiredMessages()` method only processes messages that already have `expiresAt` set. The disappearing messages feature is wired halfway — the conversation has the timer but messages never get expiry timestamps.

---

## MEDIUM (P2) — Data Integrity & Logic Bugs

### 19. Scheduled messages never auto-send — no job processor
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 612-639
**Severity:** P2
**Category:** Feature incomplete
**Description:** `scheduleMessage()` creates a message with `isScheduled: true` and `scheduledAt`. However, there is no BullMQ job, cron, or processor that checks for scheduled messages whose `scheduledAt` has passed and sends them. Scheduled messages stay forever as invisible drafts.

### 20. Starred messages use String[] array — O(n) scan, no index
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 641-658
**Severity:** P2
**Category:** Performance
**Description:** `starredBy` is a `String[]` field on Message using Postgres `@default([])`. The query `{ starredBy: { has: userId } }` requires a full table scan since Postgres GIN indexes on text arrays are not auto-created. For a messaging app with millions of messages, this will be extremely slow. A separate `StarredMessage` join table would be proper.

### 21. No star/unstar endpoint exists — starredBy array is unmodifiable by API
**File:** `apps/api/src/modules/messages/messages.service.ts` + `messages.controller.ts`
**Severity:** P2
**Category:** Feature broken
**Description:** `getStarredMessages()` reads the `starredBy` array, but there is no `starMessage()` or `unstarMessage()` method in the service, and no corresponding endpoint in the controller. Users can read starred messages but cannot star/unstar anything.

### 22. Group creation does not check for blocked users in memberIds
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 281-309
**Severity:** P2
**Category:** Privacy
**Description:** `createGroup()` validates that member IDs exist but does not check blocks between the creator and any member, or between any members. A user can create a group with people who have blocked them.

### 23. addGroupMembers does not validate member IDs exist
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 328-338
**Severity:** P2
**Category:** Data Integrity
**Description:** `addGroupMembers()` creates `ConversationMember` records with `skipDuplicates: true` but never validates that the user IDs correspond to actual users. Invalid/nonexistent user IDs create orphaned membership records with foreign key violations (if FK constraints exist) or dangling references.

### 24. markDelivered has no idempotency — overwrites deliveredAt on repeat calls
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 530-535
**Severity:** P2
**Category:** Data Integrity
**Description:** `markDelivered()` unconditionally sets `deliveredAt` to `new Date()`. If called multiple times (e.g., by multiple devices), it keeps overwriting the timestamp. It should only set `deliveredAt` if it's currently null.

### 25. message_delivered WebSocket event uses fire-and-forget — delivery can silently fail
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 369-389
**Severity:** P2
**Category:** Reliability
**Description:** The `message_delivered` handler calls `this.prisma.message.updateMany(...).catch(...)` as fire-and-forget but still immediately emits the `delivery_receipt` event to the room. If the DB update fails, clients receive a false delivery confirmation.

### 26. Conversation limit query parameter not capped — potential DoS
**File:** `apps/api/src/modules/messages/messages.controller.ts`, line 154
**Severity:** P2
**Category:** Security / Performance
**Description:** The `getConversations` endpoint parses `limit` from query string with `parseInt()` and passes it directly to the service. No maximum cap is enforced at the controller level. A client can pass `limit=999999` to force a massive query. The service defaults to 50 but accepts any value.

```ts
return this.messagesService.getConversations(userId, limit ? parseInt(limit, 10) : undefined);
```

### 27. Route ambiguity — DELETE groups/:id/members/:userId vs DELETE groups/:id/members/me
**File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 297-313
**Severity:** P2
**Category:** Routing bug
**Description:** `DELETE groups/:id/members/:userId` and `DELETE groups/:id/members/me` both exist. When a user calls `DELETE groups/123/members/me`, NestJS may match the `:userId` parameter route first, treating "me" as a literal userId string. The `leaveGroup` route should be ordered before `removeMember`, or `removeMember` should validate that `:userId` is a UUID.

### 28. View-once body DTO uses inline type — no class-validator validation
**File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 469-477
**Severity:** P2
**Category:** Validation bypass
**Description:** The `sendViewOnceMessage` endpoint uses an inline object type for `@Body()` instead of a DTO class. NestJS class-validator only validates class instances with decorators. This means `mediaUrl`, `mediaType`, `messageType`, and `content` are completely unvalidated — any value or type is accepted.

```ts
@Body() body: { mediaUrl: string; mediaType?: string; messageType?: string; content?: string },
// ❌ No @IsUrl, @MaxLength, @IsEnum — completely unvalidated
```

### 29. Wallpaper and tone endpoints use inline types — no validation
**File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 519-537
**Severity:** P2
**Category:** Validation bypass
**Description:** `setWallpaper` and `setTone` endpoints accept inline body types without DTO classes. `wallpaperUrl` is not validated as a URL, `tone` has no max length.

### 30. Forward endpoint body not validated — conversationIds not typed
**File:** `apps/api/src/modules/messages/messages.controller.ts`, line 368
**Severity:** P2
**Category:** Validation bypass
**Description:** `@Body('conversationIds') cids: string[]` extracts a field directly without a DTO class. No `@IsArray()`, `@IsString({ each: true })`, or `@ArrayMaxSize()` validation.

### 31. History count body not validated
**File:** `apps/api/src/modules/messages/messages.controller.ts`, line 344
**Severity:** P2
**Category:** Validation bypass
**Description:** `@Body('count') count: number` is extracted directly with no DTO class. No `@IsInt()`, `@Min()`, `@Max()` validation. The service clamps 0-100 but a non-numeric value could cause issues.

### 32. Member tag body not validated
**File:** `apps/api/src/modules/messages/messages.controller.ts`, line 354
**Severity:** P2
**Category:** Validation bypass
**Description:** `@Body('tag') tag: string | null` has no DTO class, no `@MaxLength()`, no `@IsString()`.

### 33. Lock code body not validated
**File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 321, 332
**Severity:** P2
**Category:** Validation bypass
**Description:** Both `setLockCode` and `verifyLockCode` extract `@Body('code')` directly without DTO validation. No length limit, no format check. A user could set a lock code of any length (including an empty string).

### 34. Mute endpoint body not validated
**File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`, line 149
**Severity:** P2
**Category:** Validation bypass
**Description:** `@Body('muted') muted: boolean` is extracted directly without a DTO class — no `@IsBoolean()` validation.

### 35. Chat export fetches ALL messages unbounded — potential memory OOM
**File:** `apps/api/src/modules/chat-export/chat-export.service.ts`, lines 83-118
**Severity:** P2
**Category:** Performance / DoS
**Description:** `generateExport()` loops through ALL messages in a conversation in batches of 100, accumulating them ALL in memory (`allMessages` array). A group conversation with millions of messages will cause an out-of-memory crash. No total limit is enforced.

### 36. Chat export body uses interface not class — no validation
**File:** `apps/api/src/modules/chat-export/chat-export.controller.ts`, lines 18-21
**Severity:** P2
**Category:** Validation bypass
**Description:** `GenerateExportBody` is a TypeScript interface, not a class with class-validator decorators. The `format` field is manually validated in the controller but `includeMedia` has no validation at all.

### 37. Encryption getPublicKey endpoint has no rate limit for enumeration
**File:** `apps/api/src/modules/encryption/encryption.controller.ts`, line 92
**Severity:** P2
**Category:** Security
**Description:** `GET /encryption/keys/:userId` returns a user's public key given their userId. While public keys are designed to be shared, this can be used to enumerate valid userIds in the system. The controller has a 60/min rate limit but the endpoint accepts any userId without checking relationship.

### 38. getBulkKeys accepts unlimited userIds via comma-separated query param
**File:** `apps/api/src/modules/encryption/encryption.controller.ts`, lines 84-88
**Severity:** P2
**Category:** Performance
**Description:** `GET /encryption/keys/bulk?userIds=a,b,c,...` splits by comma with no limit on count. The service calls `findMany({ where: { userId: { in: ids } } })` with a `take: 50` limit, but the `WHERE IN (...)` clause with thousands of IDs is still expensive. Should cap the array size.

### 39. promoteToAdmin allows admin to promote — privilege escalation
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 750-761
**Severity:** P2
**Category:** Authorization
**Description:** `promoteToAdmin()` allows both "owner" and "admin" roles to promote members. This means an admin can promote others to admin without owner consent, effectively creating unlimited admins. Most messaging apps restrict promotion to owner only.

### 40. Quran room has no participant limit — potential resource exhaustion
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 392-433
**Severity:** P2
**Category:** Performance
**Description:** `join_quran_room` has no limit on participant count. The Redis set `quran:room:{roomId}:participants` can grow unbounded. With thousands of participants, the `quran_room_update` broadcast to `quran:{roomId}` room could cause performance issues.

### 41. Quran room host not transferred on disconnect — room becomes uncontrollable
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 435-469
**Severity:** P2
**Category:** Feature bug
**Description:** When the host disconnects from a Quran room (via `leave_quran_room`), the room persists with remaining participants but the `hostId` still points to the departed user. No host transfer occurs. Only the host can sync verses and change reciter, so the room becomes frozen.

### 42. Quran room cleanup on general disconnect not handled
**File:** `apps/api/src/gateways/chat.gateway.ts`, lines 145-169
**Severity:** P2
**Category:** Feature bug
**Description:** `handleDisconnect()` removes the user from presence but does NOT remove them from any Quran room participant sets. If a user disconnects without explicitly sending `leave_quran_room`, their socket ID remains in the Redis participant set until the TTL expires (1 hour), inflating the participant count.

### 43. Group call has no block check
**File:** `apps/api/src/modules/calls/calls.service.ts`, lines 199-222
**Severity:** P2
**Category:** Privacy
**Description:** `createGroupCall()` does not verify blocks between any participants. A user can be added to a group call with someone who blocked them.

### 44. Group call missing controller endpoint — unreachable
**File:** `apps/api/src/modules/calls/calls.controller.ts`
**Severity:** P2
**Category:** Feature incomplete
**Description:** `CallsService.createGroupCall()` and `shareScreen()`/`stopScreenShare()` exist in the service but have no corresponding controller endpoints. These features are unreachable via HTTP.

### 45. Screen share and group call endpoints missing — service-only dead code
**File:** `apps/api/src/modules/calls/calls.controller.ts`
**Severity:** P2
**Category:** Dead code
**Description:** The controller only exposes `initiate`, `answer`, `decline`, `end`, `getHistory`, `getActiveCall`, `getIceServers`. The service methods `createGroupCall`, `shareScreen`, `stopScreenShare`, `missedCall` have no HTTP routes.

### 46. missedCall has no authorization — any service can mark any call as missed
**File:** `apps/api/src/modules/calls/calls.service.ts`, lines 116-120
**Severity:** P2
**Category:** Authorization
**Description:** `missedCall(sessionId)` accepts only a sessionId with no userId parameter. There is no check that the caller is a participant. While this is likely intended for internal/system use, it's a public method on the service that could be exposed later without auth.

---

## LOW (P3) — Polish, UX, Best Practices

### 47. CORS origin from env var — empty array if CORS_ORIGINS not set
**File:** `apps/api/src/gateways/chat.gateway.ts`, line 39
**Severity:** P3
**Category:** Configuration
**Description:** `process.env.CORS_ORIGINS?.split(',') ?? []` — if `CORS_ORIGINS` is not set, CORS is restricted to nothing. If set to `*`, it becomes `['*']` which Socket.io treats differently than `true`. Should default to a sensible value for development.

### 48. User online/offline events leak lastSeenAt timestamp
**File:** `apps/api/src/gateways/chat.gateway.ts`, line 167
**Severity:** P3
**Category:** Privacy
**Description:** `user_offline` includes `lastSeenAt: new Date().toISOString()` in the broadcast. This exposes the exact second a user went offline to all connected clients.

### 49. No pagination on getMessages in REST — default 50 messages, no max cap
**File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 172-180
**Severity:** P3
**Category:** Performance
**Description:** The `getMessages` endpoint doesn't accept a `limit` query param — it hardcodes the default of 50 from the service. While 50 is reasonable, the client cannot request fewer for initial load optimization.

### 50. Saved message search has no pagination
**File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 65-78
**Severity:** P3
**Category:** Performance
**Description:** `searchSavedMessages()` uses `take: limit` but has no cursor parameter for pagination. Searching with many results returns only the first page with no way to fetch more.

### 51. Topic list capped at 50 but group can have 100 topics
**File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 252-258, 244
**Severity:** P3
**Category:** Data loss
**Description:** `createTopic()` allows up to 100 topics per group, but `getTopics()` has `take: 50`. Topics 51-100 are invisible.

### 52. CustomEmojiPack `usageCount` never incremented
**File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`
**Severity:** P3
**Category:** Feature incomplete
**Description:** `getEmojiPacks()` sorts by `usageCount` desc, but no method ever increments this counter. All packs will have `usageCount: 0` forever, making the sorting useless.

### 53. Webhook execute is a stub — returns success but creates no message
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 117-129
**Severity:** P3
**Category:** Feature incomplete
**Description:** `executeWebhook()` validates the token and updates `lastUsedAt`, but the comment says "In production, this would create a message." It returns `{ success: true }` without actually creating any content. The feature is a facade.

### 54. Stage session audience count never updated
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Severity:** P3
**Category:** Feature incomplete
**Description:** The `StageSession` model has `audienceCount` used for sorting in `getActiveStageSessions()`, but no method increments or decrements it when users join/leave. The count is always 0.

### 55. Forum thread creation has no circle membership check
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 13-17
**Severity:** P2
**Category:** Authorization
**Description:** `createForumThread()` accepts a `circleId` but does not verify the user is a member of the circle. Any authenticated user can create threads in any community.

### 56. Webhook creation has no circle membership/admin check
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 94-101
**Severity:** P2
**Category:** Authorization
**Description:** `createWebhook()` does not verify the user is an admin or member of the circle. Any authenticated user can create webhooks for any community.

### 57. Stage session creation has no circle membership check
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 133-143
**Severity:** P2
**Category:** Authorization
**Description:** `createStageSession()` does not verify the user is a member of the circle.

### 58. Broadcast channel update DTO uses Partial<CreateBroadcastChannelDto> — allows slug change
**File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`, line 83
**Severity:** P3
**Category:** Data integrity
**Description:** The update endpoint uses `Partial<CreateBroadcastChannelDto>` which includes `slug`. Changing a channel's slug could break existing bookmarks/links. The service `update()` passes `data` directly to Prisma, so slug changes are silently accepted.

### 59. Chat export rate limit is too generous — 60 exports per minute
**File:** `apps/api/src/modules/chat-export/chat-export.controller.ts`, line 24
**Severity:** P3
**Category:** Performance
**Description:** Chat exports are expensive (fetch all messages in batches). The rate limit of 60/min is very generous. Should be something like 3-5/hour.

### 60. Encryption key registration allows any string as publicKey
**File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 29-31
**Severity:** P3
**Category:** Validation
**Description:** `registerKey()` only checks `publicKey.length < 32`. It does not validate the key is valid base64, a valid X25519/Ed25519 key, or has a reasonable max length. A user could register a multi-megabyte string as their "public key."

### 61. Safety number algorithm uses hex-to-decimal conversion — inconsistent digit distribution
**File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 84-94
**Severity:** P3
**Category:** Correctness
**Description:** The safety number generation converts each hex character to its decimal representation (e.g., 'f' -> '15', 'a' -> '10'). This produces digits with uneven distribution — '1' appears far more often than other digits because hex chars a-f all start with '1'. Signal uses a proper numeric encoding scheme.

### 62. Encryption key notify creates messages as the user — confusing UX
**File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 152-161
**Severity:** P3
**Category:** UX
**Description:** `notifyKeyChange()` creates messages with `senderId: userId` (the user who changed their key). These look like regular messages from that user rather than system notifications. Should use a system/bot sender or a distinct message type.

### 63. Conversation lockCode exposed via CONVERSATION_SELECT
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 13-35 + Prisma schema
**Severity:** P3
**Category:** Security
**Description:** `CONVERSATION_SELECT` does not explicitly list fields, so Prisma returns all scalar fields on Conversation by default when using `include` vs `select`. Actually, looking again, the getConversation method uses `select: CONVERSATION_SELECT` which only picks specific fields — `lockCode` is NOT in CONVERSATION_SELECT, so it's not leaked. This is fine.

*Retracted — CONVERSATION_SELECT correctly omits lockCode.*

### 64. Duplicate archive functionality
**File:** `apps/api/src/modules/messages/messages.service.ts + messages.controller.ts`
**Severity:** P3
**Category:** Code smell
**Description:** There are TWO archive implementations:
1. `archiveConversation()` at line 426 (POST endpoint, accepts boolean)
2. `archiveConversationForUser()` / `unarchiveConversationForUser()` at lines 564-580 (PUT/DELETE endpoints)

Both do the same thing. The controller has `POST conversations/:id/archive` AND `PUT conversations/:id/archive` AND `DELETE conversations/:id/archive`.

### 65. No unread count decrement on conversation delete/leave
**File:** `apps/api/src/modules/messages/messages.service.ts`
**Severity:** P3
**Category:** Data integrity
**Description:** When a user leaves a group (line 393-406) or is removed, their unread count is not zeroed out. While the membership record is deleted, this could affect aggregate unread counts if stored elsewhere.

### 66. DM note contacts lookup is double-bounded at 50
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 834-856
**Severity:** P3
**Category:** Performance / Data loss
**Description:** `getDMNotesForContacts()` fetches memberships with `take: 50`, then fetches other members with `take: 50`. For a user with many conversations, contacts beyond 50 are silently excluded from DM note retrieval.

### 67. Message edit does not validate content is non-empty
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 215-233
**Severity:** P3
**Category:** Validation
**Description:** `editMessage()` accepts any content string including empty string `""`. A user could effectively blank out a message by editing it to empty, bypassing the soft-delete mechanism.

### 68. searchMessages cursor uses `{ id: { lt: cursor } }` — wrong pagination strategy
**File:** `apps/api/src/modules/messages/messages.service.ts`, line 471
**Severity:** P3
**Category:** Bug
**Description:** The search query uses `{ id: { lt: cursor } }` but does NOT use Prisma's `cursor: { id: cursor }, skip: 1` pattern. Since results are `orderBy: { createdAt: 'desc' }`, using `id: { lt: cursor }` assumes IDs are sequential, which is not guaranteed with CUIDs.

### 69. Forward count increment is not atomic with message creation
**File:** `apps/api/src/modules/messages/messages.service.ts`, lines 501-527
**Severity:** P3
**Category:** Data integrity
**Description:** `forwardMessage()` creates messages in a loop, then increments `forwardCount` in a separate query. If the loop fails partway through, some forwarded messages exist but the count is not incremented. The entire operation should be in a transaction.

### 70. WebSocket call_end participants array not capped
**File:** `apps/api/src/gateways/dto/chat-events.dto.ts`, lines 48-55
**Severity:** P3
**Category:** Validation
**Description:** `WsCallEndDto.participants` is validated as `@IsArray() @IsString({ each: true })` but has no `@ArrayMaxSize()`. A malicious client could send an array of thousands of IDs, causing the gateway to loop through all of them and query Redis for each.

### 71. Quran room roomId is @IsString() not @IsUUID() — allows arbitrary keys
**File:** `apps/api/src/gateways/dto/quran-room-events.dto.ts`
**Severity:** P3
**Category:** Validation
**Description:** All Quran room DTOs validate `roomId` with `@IsString()` only. Since room IDs are used as Redis keys (`quran:room:{roomId}`), a malicious user could inject Redis key separators or very long strings to pollute the Redis keyspace.

### 72. Encryption notifyKeyChange has no batch limit — 50 conversations max
**File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 145-148
**Severity:** P3
**Category:** Performance
**Description:** `notifyKeyChange()` fetches memberships with `take: 50` then loops through them creating system messages sequentially. For a user in exactly 50 conversations, this creates 50 sequential Prisma queries. Should use `createMany` or a transaction.

### 73. Encryption envelope version logic bug — always reuses version 1
**File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 216-244
**Severity:** P2
**Category:** Bug
**Description:** In `storeEnvelope()`, the code finds the latest version for a conversation+recipient, then upserts at that version. On first call, `existing` is null, so `version = 1`. On second call, it finds version 1, so `version = 1` again (not incrementing). The upsert then updates instead of creating a new version. This means new envelopes always overwrite version 1 instead of creating new versions.

```ts
const version = existing ? existing.version : 1;
// ❌ Should be: const version = existing ? existing.version + 1 : 1;
// But then the upsert should be a create, not an upsert at the same version
```

### 74. Broadcast getSubscribers pagination uses userId for cursor — inconsistent
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`, lines 97-111
**Severity:** P3
**Category:** Bug
**Description:** `getSubscribers()` uses `where.userId = { gt: cursor }` for pagination but sorts by `joinedAt: 'desc'`. Cursor-based pagination with `gt` on userId and DESC sort by joinedAt produces inconsistent page boundaries, potentially skipping or duplicating results.

### 75. No max length on encryption fields
**File:** `apps/api/src/modules/encryption/encryption.controller.ts`, StoreEnvelopeDto, RegisterKeyDto
**Severity:** P3
**Category:** Validation
**Description:** `encryptedKey`, `nonce`, `publicKey`, `conversationId`, `recipientId` all use `@IsString()` with no `@MaxLength()`. Extremely large values could be stored in the DB.

### 76. Saved message mediaUrl not validated as URL
**File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts`, line 9
**Severity:** P3
**Category:** Validation
**Description:** `SaveMessageDto.mediaUrl` is `@IsString()` but not `@IsUrl()`. Any string is accepted.

### 77. AddEmojiDto imageUrl not validated as URL
**File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts`, line 58
**Severity:** P3
**Category:** Validation
**Description:** `AddEmojiDto.imageUrl` is `@IsString()` but not `@IsUrl()`.

### 78. CreateWebhookDto avatarUrl not validated as URL
**File:** `apps/api/src/modules/discord-features/dto/discord-features.dto.ts`, line 18
**Severity:** P3
**Category:** Validation
**Description:** `CreateWebhookDto.avatarUrl` is `@IsString()` but not `@IsUrl()`.

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| P0 — Ship Blocker | 5 |
| P1 — Security / Auth | 13 |
| P2 — Data Integrity / Logic | 22 |
| P3 — Polish / Best Practice | 28 |
| **Total** | **78** |

## Top 10 Findings by Impact

1. **isSpoiler/isViewOnce not in MESSAGE_SELECT** — Two headline features completely broken
2. **View-once messages can be forwarded** — Privacy violation, defeats ephemeral messaging
3. **Lock code stored/compared in plaintext** — Brute-forceable chat lock
4. **Removed members stay in socket rooms** — Can eavesdrop on all future messages
5. **No block check on sendMessage** — Blocked users can message in groups/existing DMs
6. **Online status broadcast to all clients** — No privacy controls on presence
7. **No slow mode enforcement** — Feature set but never checked
8. **Disappearing messages half-wired** — Timer set on conversation, never applied to messages
9. **Forum lock/pin no auth** — Any user can lock/pin any thread
10. **Encryption status leaks conversation members** — No membership check
