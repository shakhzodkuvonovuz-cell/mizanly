# Agent #69 (Bonus) — Risalah Messaging Flow: End-to-End Deep Audit

**Scope:** Complete messaging flow — backend service, controller, gateway, DTOs, mobile screens
**Files audited:**
- `apps/api/src/modules/messages/messages.service.ts` (873 lines)
- `apps/api/src/modules/messages/messages.controller.ts` (567 lines)
- `apps/api/src/modules/messages/messages.module.ts` (8 lines)
- `apps/api/src/modules/messages/dto/create-dm.dto.ts` (8 lines)
- `apps/api/src/modules/messages/dto/archive-conversation.dto.ts` (8 lines)
- `apps/api/src/modules/messages/dto/mute-conversation.dto.ts` (8 lines)
- `apps/api/src/modules/messages/dto/dm-note.dto.ts` (16 lines)
- `apps/api/src/gateways/chat.gateway.ts` (529 lines)
- `apps/api/src/gateways/dto/send-message.dto.ts` (28 lines)
- `apps/api/src/gateways/dto/chat-events.dto.ts` (63 lines)
- `apps/api/src/gateways/dto/quran-room-events.dto.ts` (20 lines)
- `apps/mobile/app/(tabs)/risalah.tsx` (633 lines)
- `apps/mobile/app/(screens)/conversation/[id].tsx` (~1800 lines)
- `apps/mobile/app/(screens)/conversation-info.tsx` (~500 lines)
- `apps/mobile/app/(screens)/conversation-media.tsx` (535 lines)
- `apps/mobile/app/(screens)/new-conversation.tsx` (233 lines)
- `apps/mobile/app/(screens)/create-group.tsx` (384 lines)
- `apps/mobile/app/(screens)/chat-lock.tsx` (385 lines)
- `apps/mobile/app/(screens)/saved-messages.tsx` (273 lines)
- `apps/mobile/app/(screens)/pinned-messages.tsx` (267 lines)
- `apps/mobile/app/(screens)/starred-messages.tsx` (367 lines)
- `apps/mobile/src/services/api.ts` (messagesApi section, lines 569-629)
- `apps/api/prisma/schema.prisma` (Conversation, ConversationMember, Message, MessageReaction, DMNote models)

**Total findings: 68**

---

## TIER 0 — SHIP BLOCKERS (14 findings)

### Finding 69-001: MESSAGE_SELECT omits isSpoiler, isViewOnce, isPinned, starredBy — features broken on read path
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 37-71
- **Code:**
```typescript
const MESSAGE_SELECT = {
  id: true, content: true, messageType: true, mediaUrl: true, mediaType: true,
  voiceDuration: true, fileName: true, fileSize: true, replyToId: true,
  isForwarded: true, isDeleted: true, editedAt: true, transcription: true,
  createdAt: true,
  sender: { ... },
  replyTo: { ... },
  reactions: { ... },
};
```
- **Problem:** `isSpoiler`, `isViewOnce`, `viewedAt`, `isPinned`, `pinnedAt`, `pinnedById`, `starredBy`, `isScheduled`, `scheduledAt`, `expiresAt`, `deliveredAt`, `forwardCount`, `isEncrypted`, `encNonce`, `isSilent` are all missing from MESSAGE_SELECT. When getMessages/sendMessage return data using this select, the client never receives these fields. The mobile conversation screen checks `message.isSpoiler`, `message.isViewOnce`, `message.viewedAt`, `message.isPinned`, `message.starredBy`, `message.expiresAt` — all will be undefined.
- **Impact:** Spoiler text never shows overlay (isSpoiler always undefined/falsy). View-once badge never shows. Pinned message indicator never works in-line. Star functionality broken. Disappearing message timer invisible. Delivery receipts broken. E2E encryption badge never shows.
- **Severity:** CRITICAL — 7+ features completely broken on the read path.

### Finding 69-002: View-once messages can be forwarded — view-once privacy violation
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 481-528
- **Code:**
```typescript
async forwardMessage(messageId: string, userId: string, targetConversationIds: string[]) {
  const original = await this.prisma.message.findUnique({ where: { id: messageId }, ... });
  // No check for original.isViewOnce
  ...
  const msg = await this.prisma.message.create({ data: { ... isForwarded: true ... } });
```
- **Problem:** The forwardMessage method has no check for `isViewOnce`. A user can forward a view-once message to any conversation, completely defeating the privacy guarantee. WhatsApp explicitly blocks forwarding of view-once messages.
- **Impact:** View-once feature is a privacy promise to the sender. Allowing forward breaks this promise entirely.
- **Severity:** CRITICAL — privacy violation.

### Finding 69-003: Lock code stored in PLAINTEXT — brute-force vulnerability
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 350-367
- **Code:**
```typescript
async setLockCode(conversationId: string, userId: string, code: string | null) {
  await this.prisma.conversation.update({
    where: { id: conversationId },
    data: { lockCode: code }, // Stored as plaintext
  });
}
async verifyLockCode(conversationId: string, userId: string, code: string) {
  const convo = await this.prisma.conversation.findUnique({ ... });
  return { valid: convo.lockCode === code }; // Plaintext comparison
}
```
- **Problem:** Lock code is stored as plaintext in the database and compared with simple equality. Anyone with DB read access sees all lock codes. Additionally, there is no specific rate limiting on the verify-lock endpoint (only the global 100 req/min), making it brute-forceable for short numeric codes.
- **Impact:** Chat lock feature provides false sense of security. A 4-digit PIN can be brute-forced in 100 requests/minute = cracked in ~2 minutes.
- **Severity:** CRITICAL — security.

### Finding 69-004: Conversation lock-code endpoint accepts raw `@Body('code')` — no validation
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 315-335
- **Code:**
```typescript
@Patch('conversations/:id/lock-code')
setLockCode(
  @Param('id') id: string,
  @CurrentUser('id') userId: string,
  @Body('code') code: string | null, // No DTO, no @IsString, no @MaxLength
) {
  return this.messagesService.setLockCode(id, userId, code);
}

@Post('conversations/:id/verify-lock')
verifyLockCode(
  @Param('id') id: string,
  @CurrentUser('id') userId: string,
  @Body('code') code: string, // No DTO, no validation
) {
```
- **Problem:** Both lock-code endpoints use inline `@Body('code')` extraction with no DTO class and no validation decorators. This bypasses NestJS's global validation pipe entirely. Any data type can be passed as `code`, including objects, arrays, or extremely long strings.
- **Impact:** Can store arbitrary JSON objects as lock codes; potential NoSQL injection or storage abuse.
- **Severity:** HIGH — validation bypass.

### Finding 69-005: View-once endpoint body has no DTO — validation bypassed
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 469-477
- **Code:**
```typescript
@Post(':conversationId/view-once')
async sendViewOnceMessage(
  @Param('conversationId') conversationId: string,
  @CurrentUser('id') userId: string,
  @Body() body: { mediaUrl: string; mediaType?: string; messageType?: string; content?: string },
) {
```
- **Problem:** The view-once send endpoint uses an inline type `{ mediaUrl: string; ... }` instead of a DTO class. NestJS validation pipe only validates instances of classes with class-validator decorators. This means `mediaUrl` is not validated as a URL, no `@MaxLength` on content, no `@IsEnum` on messageType.
- **Impact:** Arbitrary data can be passed; SSRF via unvalidated mediaUrl.
- **Severity:** HIGH — validation bypass, potential SSRF.

### Finding 69-006: Wallpaper and tone endpoints use inline body — no validation
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 519-537
- **Code:**
```typescript
@Patch(':conversationId/wallpaper')
async setWallpaper(
  @Body() body: { wallpaperUrl: string | null }, // No DTO
)
@Patch(':conversationId/tone')
async setTone(
  @Body() body: { tone: string | null }, // No DTO
)
```
- **Problem:** Same pattern — inline types bypass validation. wallpaperUrl is not validated as URL. tone has no max length.
- **Impact:** Can store arbitrary strings; SSRF via wallpaperUrl.
- **Severity:** HIGH.

### Finding 69-007: Saved-messages screen uses raw `fetch()` without auth — always 401
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 24-31, 53-58, 70-72, 81-83
- **Code:**
```typescript
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

async function fetchSavedMessages(cursor?: string) {
  const res = await fetch(`${API_BASE}/saved-messages?${params}`);
  return res.json();
}
// Also save, delete, pin mutations all use raw fetch without auth headers
```
- **Problem:** All 4 API calls in saved-messages.tsx use raw `fetch()` without attaching the Clerk auth token. The backend requires `ClerkAuthGuard` on all endpoints. Every request will return 401 Unauthorized.
- **Impact:** Entire saved-messages screen is non-functional — cannot load, save, delete, or pin messages.
- **Severity:** CRITICAL — feature completely broken.

### Finding 69-008: Saved-messages calls non-existent endpoint `/saved-messages`
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, line 29
- **Code:**
```typescript
const res = await fetch(`${API_BASE}/saved-messages?${params}`);
```
- **Problem:** The API endpoint `/saved-messages` does not exist in the messages controller. The controller paths are under `/messages/` prefix. There is no saved-messages controller at all in the codebase.
- **Impact:** Even if auth was added, the endpoint doesn't exist — always 404.
- **Severity:** CRITICAL — entire screen points to non-existent API.

### Finding 69-009: Duplicate Pressable import — runtime crash
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 4-6
- **Code:**
```typescript
import {
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, FlatList, Alert, LayoutAnimation, RefreshControl,
  Pressable, // DUPLICATE
} from 'react-native';
```
- **Problem:** `Pressable` is imported twice from 'react-native'. While modern bundlers (Metro) may not crash on this, it's a code error that can cause confusing behavior and fails strict TypeScript duplicate identifier checks.
- **Impact:** Potential compilation warning or runtime confusion.
- **Severity:** HIGH — code quality/potential crash.

### Finding 69-010: Duplicate Pressable import in conversation-media.tsx
- **File:** `apps/mobile/app/(screens)/conversation-media.tsx`, lines 3-6
- **Code:**
```typescript
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl, Linking,
  Pressable, // DUPLICATE
} from 'react-native';
```
- **Problem:** Same duplicate Pressable import.
- **Severity:** HIGH.

### Finding 69-011: Duplicate Pressable import in saved-messages.tsx
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 3-5
- **Code:**
```typescript
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  TextInput, Keyboard,
  Pressable, // DUPLICATE
} from 'react-native';
```
- **Severity:** HIGH.

### Finding 69-012: Duplicate Pressable import in create-group.tsx
- **File:** `apps/mobile/app/(screens)/create-group.tsx`, lines 3-5
- **Code:**
```typescript
import {
  View, Text, StyleSheet, Pressable,
  TextInput, FlatList, RefreshControl, Alert, ScrollView,
  Pressable, // DUPLICATE
} from 'react-native';
```
- **Severity:** HIGH.

### Finding 69-013: Pinned-messages screen has SYNTAX ERROR — missing closing brace in import
- **File:** `apps/mobile/app/(screens)/pinned-messages.tsx`, lines 3-4
- **Code:**
```typescript
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
import { useLocalSearchParams, useRouter } from 'expo-router';
```
- **Problem:** The `import` from 'react-native' is missing its closing `} from 'react-native'` and immediately starts another import statement. This is a syntax error that will crash at import time.
- **Impact:** Pinned-messages screen is completely broken — will never render.
- **Severity:** CRITICAL — screen cannot load.

### Finding 69-014: Starred-messages screen has same SYNTAX ERROR
- **File:** `apps/mobile/app/(screens)/starred-messages.tsx`, lines 3-4
- **Code:**
```typescript
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
import { useLocalSearchParams, useRouter } from 'expo-router';
```
- **Problem:** Same syntax error — missing `} from 'react-native'` before next import.
- **Impact:** Starred-messages screen completely broken.
- **Severity:** CRITICAL.

---

## TIER 1 — SECURITY ISSUES (10 findings)

### Finding 69-015: Removed/banned group members stay in socket rooms
- **File:** `apps/api/src/gateways/chat.gateway.ts` (entire file)
- **Problem:** When a user is removed from a group (`removeGroupMember`) or banned (`banMember`), there is no socket event emitted to force-disconnect them from the `conversation:{id}` room. The member's socket remains in the room and continues to receive all `new_message`, `user_typing`, and `delivery_receipt` events.
- **Impact:** Removed/banned members continue to eavesdrop on all group messages in real-time until they manually disconnect.
- **Severity:** HIGH — privacy violation.

### Finding 69-016: No rate limit on verify-lock endpoint
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 326-335
- **Problem:** The `POST /conversations/:id/verify-lock` endpoint has no specific `@Throttle()` decorator. It falls through to the global 100 req/min limit. For a 4-digit numeric lock code (10,000 possibilities), this can be cracked in ~100 minutes. For a 4-char alphanumeric code, longer but still feasible.
- **Impact:** Lock codes are brute-forceable.
- **Severity:** HIGH.

### Finding 69-017: Forward endpoint body uses inline type — no validation on conversationIds
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, line 368
- **Code:**
```typescript
async forward(@Param('messageId') mid: string, @CurrentUser('id') uid: string, @Body('conversationIds') cids: string[]) {
```
- **Problem:** `@Body('conversationIds')` extracts a raw value without DTO validation. No `@IsArray()`, `@IsString({ each: true })`, `@ArrayMaxSize()`. An attacker can pass thousands of conversation IDs, causing the service to iterate and perform DB queries for each one.
- **Impact:** DoS vector — send `conversationIds` with 10,000 entries to trigger 10,000 DB queries per request.
- **Severity:** HIGH.

### Finding 69-018: getConversations limit parameter parsed from query string without bounds
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 150-155
- **Code:**
```typescript
getConversations(
  @CurrentUser('id') userId: string,
  @Query('limit') limit?: string,
) {
  return this.messagesService.getConversations(userId, limit ? parseInt(limit, 10) : undefined);
}
```
- **Problem:** The `limit` query parameter is parsed as integer with no max bounds check. A user can pass `?limit=999999999` to load the entire conversation list. The service accepts any number:
```typescript
async getConversations(userId: string, limit = 50) {
  // ...
  take: limit, // No cap
```
- **Impact:** Memory exhaustion on large accounts. DoS vector.
- **Severity:** MEDIUM.

### Finding 69-019: WsCallEndDto.participants has no @ArrayMaxSize — DoS via large participant list
- **File:** `apps/api/src/gateways/dto/chat-events.dto.ts`, lines 48-55
- **Code:**
```typescript
export class WsCallEndDto {
  @IsUUID() sessionId: string;
  @IsArray() @IsString({ each: true }) participants: string[];
  // No @ArrayMaxSize
}
```
- **Problem:** No limit on participants array size. An attacker can emit `call_end` with thousands of participant IDs, each triggering a Redis lookup (`getUserSockets`) and potential socket emit.
- **Impact:** DoS via Redis pipeline abuse.
- **Severity:** MEDIUM.

### Finding 69-020: CreateDmDto requires @IsUUID but Mizanly uses cuid IDs
- **File:** `apps/api/src/modules/messages/dto/create-dm.dto.ts`, line 6
- **Code:**
```typescript
@IsUUID()
targetUserId: string;
```
- **Problem:** Mizanly's User model uses `@default(cuid())` for IDs, which produces strings like `clxyz123abc`. `@IsUUID()` validates against UUID v4 format (e.g., `550e8400-e29b-41d4-a716-446655440000`). A valid cuid user ID will always fail UUID validation, meaning createDM will reject every valid user ID.
- **Impact:** CRITICAL — createDM endpoint is completely non-functional because all valid user IDs are rejected by validation.
- **Severity:** CRITICAL.

### Finding 69-021: WsSendMessageDto and all WsDto classes use @IsUUID for conversationId — same cuid mismatch
- **Files:** `apps/api/src/gateways/dto/send-message.dto.ts` line 4, `apps/api/src/gateways/dto/chat-events.dto.ts` lines 4, 9, 17, 22, 28, 37, 49, 57
- **Problem:** Every WebSocket DTO uses `@IsUUID()` for conversationId, targetUserId, sessionId, callerId. Mizanly uses cuid IDs for core models. All WebSocket message validation will fail for valid cuid IDs.
- **Impact:** If validation is enforced (which it is — `validate(dto)` is called in every handler), ALL websocket events will be rejected with "Invalid data" for conversations/users with cuid IDs.
- **Severity:** CRITICAL — all real-time messaging broken if validation is enforced. In practice, `validate()` returns errors which cause early return with error emit, but the handler continues to work because validation errors are handled as soft errors (client.emit('error')) — the actual message sending still might not proceed because of the early return.

### Finding 69-022: Online status broadcast leaks to all connected users
- **File:** `apps/api/src/gateways/chat.gateway.ts`, line 137
- **Code:**
```typescript
this.server.emit('user_online', { userId, isOnline: true });
```
- **Problem:** `this.server.emit()` broadcasts to ALL connected clients, not just contacts. Any connected user can track when any other user comes online/offline. This is a privacy violation — users should only see online status of their contacts.
- **Impact:** Privacy leak — stalkers can monitor any user's online/offline status.
- **Severity:** MEDIUM.

### Finding 69-023: Typing indicator broadcasts without checking restrict/block status
- **File:** `apps/api/src/gateways/chat.gateway.ts`, lines 237-253
- **Problem:** When a user emits `typing`, it's broadcast to the entire conversation room. There's no check if the typing user is blocked or restricted by other members. Blocked users who are still in a conversation (joined room before being blocked) will see typing indicators.
- **Impact:** Privacy violation for blocked/restricted users.
- **Severity:** LOW.

### Finding 69-024: message_delivered handler uses fire-and-forget without error propagation
- **File:** `apps/api/src/gateways/chat.gateway.ts`, lines 385-388
- **Code:**
```typescript
this.prisma.message.updateMany({
  where: { id: data.messageId, conversationId: data.conversationId },
  data: { deliveredAt: now },
}).catch((e) => this.logger.error('Failed to update delivery', e));
```
- **Problem:** The delivery status update is fire-and-forget. If the update fails (e.g., wrong messageId), the `delivery_receipt` event is still emitted to the room at line 389, falsely indicating delivery.
- **Impact:** False delivery receipts — UI shows "delivered" when message delivery wasn't actually recorded.
- **Severity:** MEDIUM.

---

## TIER 2 — DATA INTEGRITY ISSUES (12 findings)

### Finding 69-025: Unread count can go below zero if markRead is called on a conversation with 0 unread
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 408-415
- **Code:**
```typescript
async markRead(conversationId: string, userId: string) {
  await this.prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date(), unreadCount: 0 },
  });
}
```
- **Problem:** This always sets unreadCount to 0, which is correct. However, the `sendMessage` method increments unreadCount for all non-sender members (line 183), and if a member calls `markRead` between the message create and the unread increment (race condition in the $transaction), the count can get out of sync. More critically: there's no mechanism to recount if the count drifts.
- **Impact:** Minor — unread counts may drift over time.
- **Severity:** LOW.

### Finding 69-026: Read receipts logic is incorrect — readByMembers check is wrong
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 354-358
- **Code:**
```typescript
const getMessageStatus = (msg: Message, readByMembers: ConversationMember[], deliveredMessages: Set<string>): 'sent' | 'delivered' | 'read' => {
  if (readByMembers && readByMembers.length > 0) return 'read';
  if (deliveredMessages.has(msg.id)) return 'delivered';
  return 'sent';
};
```
And lines 1418-1422:
```typescript
const readByMembers = convoQuery.data?.members?.filter(member =>
  member.userId !== user?.id &&
  member.lastReadAt &&
  new Date(member.lastReadAt) >= new Date(item.message.createdAt)
).slice(0, 3) ?? [];
```
- **Problem:** The read receipt logic compares `member.lastReadAt >= message.createdAt`. This means if a member has read ANY message after this one's creation time, ALL previous messages show as "read" — even if the member only read the latest message. This is technically correct for a "has seen up to this point" model, but it produces false "read" indicators for messages that were sent while the user was offline and scrolled past.
- **Impact:** Read receipts may show "read" prematurely. Minor accuracy issue.
- **Severity:** LOW.

### Finding 69-027: Conversation list read-receipt icon logic is reversed/incomplete
- **File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 109
- **Code:**
```typescript
const lastMessageRead = otherMember && item.lastMessageAt && otherMember.lastReadAt && new Date(otherMember.lastReadAt) >= new Date(item.lastMessageAt);
```
- **Problem:** `otherMember` is the OTHER user in the conversation (the recipient). But `item.lastMessageAt` is the time of the last message in the conversation, regardless of who sent it. If the OTHER user sent the last message, `otherMember.lastReadAt >= item.lastMessageAt` will always be true (they read their own message), showing a blue checkmark even though you didn't get a read receipt.
- **Impact:** Double blue check shows even when the recipient hasn't read your message — if the last message was theirs.
- **Severity:** MEDIUM — misleading UI.

### Finding 69-028: Conversation media screen uses different query key and pagination than conversation screen
- **File:** `apps/mobile/app/(screens)/conversation-media.tsx`, line 131
- **Code:**
```typescript
queryKey: ['conversation-messages', conversationId],
```
vs conversation screen line 793:
```typescript
queryKey: ['messages', id],
```
- **Problem:** Conversation media screen uses query key `['conversation-messages', conversationId]` while the conversation screen uses `['messages', id]`. These caches are completely separate. When new media messages arrive in the conversation, invalidating `['messages', id]` does NOT invalidate the media gallery cache. The media gallery will be stale until manually refreshed.
- **Impact:** Stale media gallery.
- **Severity:** LOW.

### Finding 69-029: Conversation media screen reads `id` from params but param is named `conversationId` in navigation
- **File:** `apps/mobile/app/(screens)/conversation-media.tsx`, line 109
- **Code:**
```typescript
const { id: conversationId } = useLocalSearchParams<{ id: string }>();
```
But the navigation from conversation-info passes `conversationId`:
```typescript
router.push(`/(screens)/conversation-media?conversationId=${convo?.id}`)
```
- **Problem:** conversation-info.tsx line 423 passes `conversationId` as the query param, but conversation-media.tsx reads `id`. The param name mismatch means `conversationId` will be undefined, and all API calls will use `undefined` as the conversation ID.
- **Impact:** CRITICAL — conversation media screen always fails to load because it reads the wrong param name.
- **Severity:** CRITICAL.

### Finding 69-030: Pinned messages screen uses reaction-based filtering instead of isPinned field
- **File:** `apps/mobile/app/(screens)/pinned-messages.tsx`, lines 37-43
- **Code:**
```typescript
queryFn: async ({ pageParam }) => {
  const response = await messagesApi.getMessages(conversationId, pageParam);
  const filtered = response.data.filter((msg) =>
    msg.reactions?.some((r) => r.emoji === '\u{1F4CC}')
  );
  return { ...response, data: filtered };
},
```
- **Problem:** The backend has a proper `getPinnedMessages` endpoint that queries `isPinned: true`. But the mobile pinned-messages screen fetches ALL messages and client-side filters for pushpin emoji reactions. This is:
  1. Extremely inefficient (loads all messages to find pins)
  2. Semantically wrong (a pushpin reaction is not the same as "pinned by admin")
  3. Missing the actual pinned messages (which use `isPinned` field)
  4. The API service already has `messagesApi.getPinned(conversationId)` but it's not used here.
- **Impact:** Pinned messages screen shows wrong data — reactions with pushpin emoji instead of actually pinned messages.
- **Severity:** HIGH — feature completely wrong.

### Finding 69-031: Starred messages screen uses same wrong pattern — reaction filtering instead of starredBy field
- **File:** `apps/mobile/app/(screens)/starred-messages.tsx`, lines 37-43
- **Code:**
```typescript
const filtered = response.data.filter((msg) =>
  msg.reactions?.some((r) => r.emoji === '\u2B50')
);
```
- **Problem:** Same pattern as pinned messages. The backend has a proper `getStarredMessages` endpoint that queries `starredBy: { has: userId }`. But the screen fetches ALL messages and client-side filters for star emoji reactions. The API service has `messagesApi.getStarredMessages()`.
- **Impact:** Starred messages screen shows wrong data.
- **Severity:** HIGH.

### Finding 69-032: toggleStar API endpoint doesn't exist
- **File:** `apps/mobile/src/services/api.ts`, line 621
- **Code:**
```typescript
toggleStar: (conversationId: string, messageId: string) => api.post(`/messages/${conversationId}/${messageId}/star`),
```
- **Problem:** The controller has no `POST /:conversationId/:messageId/star` endpoint. The starring is done via the `starredBy` array field on Message, but there's no controller endpoint to toggle it. The `toggleStar` API call will always 404.
- **Impact:** Star/unstar from conversation context menu silently fails.
- **Severity:** HIGH.

### Finding 69-033: setDisappearingTimer API path mismatch between mobile and backend
- **File:** `apps/mobile/src/services/api.ts`, line 607-608
- **Code:**
```typescript
setDisappearingTimer: (conversationId: string, duration: number) =>
  api.patch(`/messages/conversations/${conversationId}/disappearing-timer`, { duration }),
```
vs backend controller line 385:
```typescript
@Put('conversations/:id/disappearing')
```
- **Problem:** Mobile calls `PATCH /messages/conversations/:id/disappearing-timer` but the backend endpoint is `PUT /messages/conversations/:id/disappearing`. Both the HTTP method (PATCH vs PUT) and the path (`disappearing-timer` vs `disappearing`) are wrong.
- **Impact:** Disappearing messages feature completely non-functional from mobile.
- **Severity:** HIGH.

### Finding 69-034: Archive endpoint has two competing implementations — POST and PUT
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, lines 251-258 (POST) and 395-402 (PUT)
- **Code:**
```typescript
// Line 251 — POST version
@Post('conversations/:id/archive')
archive(...) { return this.messagesService.archiveConversation(id, userId, dto.archived); }

// Line 395 — PUT version
@Put('conversations/:id/archive')
archiveConversation(...) { return this.messagesService.archiveConversationForUser(id, userId); }
```
- **Problem:** Two endpoints on the same path but different HTTP methods. The POST version takes a `dto.archived` boolean (archive/unarchive), while the PUT version always archives. The mobile uses different methods for different things:
  - `archiveConversation: api.post(...)` — matches POST version but sends no body (missing `archived` field)
  - `unarchiveConversation: api.delete(...)` — matches DELETE version (line 404)
- **Impact:** Confusing API, mobile archive call sends POST without body so `dto.archived` is undefined.
- **Severity:** MEDIUM.

### Finding 69-035: scheduleMessage mobile API path doesn't match backend
- **File:** `apps/mobile/src/services/api.ts`, line 615-616
- **Code:**
```typescript
scheduleMessage: (conversationId: string, content: string, scheduledAt: string, messageType?: string) =>
  api.post<Message>(`/messages/conversations/${conversationId}/schedule`, { content, scheduledAt, messageType }),
```
vs backend controller line 413:
```typescript
@Post('messages/scheduled')
async scheduleMessage(@CurrentUser('id') userId: string, @Body() dto: ScheduleMessageDto) {
```
- **Problem:** Mobile calls `POST /messages/conversations/:id/schedule` but backend is `POST /messages/messages/scheduled` (with conversationId in the body DTO). Path and parameter location are completely different.
- **Impact:** Schedule message feature non-functional from mobile.
- **Severity:** HIGH.

### Finding 69-036: No scheduled message auto-publisher job
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 612-639
- **Problem:** The `scheduleMessage` method creates a message with `isScheduled: true` and `scheduledAt` timestamp. However, there is no job/cron/queue that checks for scheduled messages whose `scheduledAt` has passed and "publishes" them (sets `isScheduled: false` and triggers socket events). The message is created in the DB but will never actually be sent.
- **Impact:** Scheduled messages are stored but never delivered. Feature is a dead end.
- **Severity:** HIGH.

---

## TIER 3 — FUNCTIONAL ISSUES (16 findings)

### Finding 69-037: Conversation list socket doesn't join conversation rooms — typing indicators show wrong data
- **File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 233-249
- **Code:**
```typescript
socket.on('user_typing', ({ conversationId, userId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
  setTypingUsers(prev => { ... });
});
```
- **Problem:** The risalah.tsx socket connects but never joins any conversation rooms (no `emit('join_conversation')`). The `user_typing` event is emitted to `conversation:{id}` room (chat.gateway.ts line 249), so the risalah screen will never receive these events. The typing indicator code is dead.
- **Impact:** Typing indicators never show on conversation list.
- **Severity:** MEDIUM.

### Finding 69-038: VoicePlayer waveform uses Math.random() in render — changes every re-render
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 233-241
- **Code:**
```typescript
{Array.from({ length: 20 }).map((_, i) => (
  <View key={i} style={[
    styles.voiceBar,
    { height: 4 + Math.sin(i * 0.8) * 8 + Math.random() * 4 }, // Random!
    ...
  ]} />
))}
```
- **Problem:** `Math.random()` is called during render, meaning the waveform visualization changes randomly every time the component re-renders (e.g., when parent state updates). This creates a flickering/unstable UI.
- **Impact:** Visual glitch — voice waveform flickers on every re-render.
- **Severity:** LOW.

### Finding 69-039: listEmpty useMemo has missing dependencies
- **File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 315
- **Code:**
```typescript
const listEmpty = useMemo(() => (...), [isLoading, activeTab, router]);
```
- **Problem:** The memoized component references `t` (translation function) inside but `t` is not in the dependency array. If the language changes, the empty state text won't update.
- **Impact:** Stale translations in empty state.
- **Severity:** LOW.

### Finding 69-040: listHeader useMemo has missing dependencies
- **File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 333
- **Code:**
```typescript
const listHeader = useMemo(() => (...), [archivedCount, router]);
```
- **Problem:** References `t`, `isRTL`, `colors` but they're not in the dependency array.
- **Impact:** Stale content if language or theme changes.
- **Severity:** LOW.

### Finding 69-041: Conversation screen creates new socket on every mount — no connection pooling
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 878-938
- **Problem:** Every time a conversation screen mounts, it creates a brand new socket.io connection to `/chat`. When navigating between conversations, this creates/destroys connections. The risalah.tsx tab ALSO creates its own socket. A user with the conversation open will have 2 simultaneous socket connections.
- **Impact:** Redundant connections, wasted resources, potential for duplicate message handling.
- **Severity:** MEDIUM.

### Finding 69-042: Pending message retry on reconnect sends messages twice
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 886-896
- **Code:**
```typescript
socket.on('connect', () => {
  socket.emit('join_conversation', { conversationId: id });
  const pending = pendingMessagesRef.current.filter(p => p.status === 'pending');
  pending.forEach(pending => {
    socket.emit('send_message', { ... });
  });
});
```
- **Problem:** On reconnect, ALL pending messages are re-sent. But the original send might have already been processed by the server (the server processed it before the disconnect). There's no server-side deduplication based on `clientId`. The server will create duplicate messages.
- **Impact:** Message duplication on reconnect.
- **Severity:** HIGH.

### Finding 69-043: 5-second undo window delays all messages by 5 seconds
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 1063-1066
- **Code:**
```typescript
const timer = setTimeout(() => {
  commitSend(undoPayload);
}, 5000);
```
- **Problem:** Every message has a mandatory 5-second delay before being sent to the server. This means the recipient won't see the message for at least 5 seconds. In a real-time chat app, this creates a terrible user experience — the sender sees an "undo" bar for 5 seconds while the recipient sees nothing.
- **Impact:** 5-second minimum latency on ALL messages. Completely breaks the real-time feel of a chat app.
- **Severity:** HIGH — UX.

### Finding 69-044: Pending message + undo window + reconnect retry = triple-send risk
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
- **Problem:** The message flow has three independent send mechanisms:
  1. `commitSend()` after 5-second undo timer (line 1064)
  2. Reconnect retry in `socket.on('connect')` (line 888)
  3. Network-back retry in `useEffect` watching `isOffline` (line 1074)
  All three can fire for the same pending message, leading to triple delivery.
- **Impact:** Messages sent multiple times.
- **Severity:** HIGH.

### Finding 69-045: Undo send only works for text — media and voice bypass it
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 1085-1111 (media), 1150-1193 (voice)
- **Problem:** The `pickAndSendMedia` function calls `messagesApi.sendMessage()` directly (HTTP POST, immediate), bypassing the 5-second undo window. Voice messages are sent via socket immediately (`socketRef.current.emit('send_message')`). Only text messages go through the undo flow.
- **Impact:** Inconsistent behavior — text has undo, media/voice don't. Users may expect undo on all message types.
- **Severity:** LOW (feature inconsistency, not a bug).

### Finding 69-046: Group creator restriction is too strict — only creator can manage, no admin delegation
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 319, 331, 343
- **Code:**
```typescript
if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can update');
if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can add members');
if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can remove members');
```
- **Problem:** While there are `promoteToAdmin`/`demoteFromAdmin` methods that use role-based checks, the core group management operations (update, add members, remove members) still check `createdById` directly instead of using the role system. Admins promoted via `promoteToAdmin` cannot add/remove members or update the group.
- **Impact:** Admin role is decorative for core group management.
- **Severity:** MEDIUM.

### Finding 69-047: processExpiredMessages is never called — disappearing messages never expire
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 859-872
- **Problem:** The `processExpiredMessages` method exists but is never registered as a cron job, queue processor, or scheduled task. No code anywhere in the codebase calls this method periodically. Disappearing messages and viewed view-once messages will accumulate forever.
- **Impact:** Disappearing messages feature doesn't work (messages never actually disappear). View-once messages are never cleaned up after being viewed.
- **Severity:** HIGH.

### Finding 69-048: Conversation `lastMessageText` truncated to 100 chars but no indicator
- **File:** `apps/api/src/modules/messages/messages.service.ts`, line 176
- **Code:**
```typescript
lastMessageText: data.content?.slice(0, 100) ?? null,
```
- **Problem:** Message preview in conversation list is silently truncated to 100 characters. The mobile UI shows this as-is without an ellipsis or "..." indicator. Long messages will appear to end mid-sentence.
- **Impact:** Minor UX issue — confusing truncated previews.
- **Severity:** LOW.

### Finding 69-049: sendMessage via REST doesn't emit socket event — recipients don't see it in real-time
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 136-201
- **Problem:** The `sendMessage` service method creates the message and updates the conversation, but does NOT emit a socket event. Only the gateway handler (`handleMessage` in chat.gateway.ts, line 229) emits `new_message`. When media messages are sent via REST (as the mobile does for images at line 1098: `messagesApi.sendMessage()`), recipients will NOT receive the message in real-time — only on next poll/refresh.
- **Impact:** Media messages (images, voice via REST path) don't appear in real-time for recipients.
- **Severity:** HIGH.

### Finding 69-050: deleteMessage doesn't emit socket event — deleted messages stay visible
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 203-213
- **Problem:** `deleteMessage` sets `isDeleted: true` but does not emit any socket event. Recipients will continue to see the message content until they refresh. WhatsApp immediately shows "This message was deleted" to all participants.
- **Impact:** Deleted messages remain visible to other users until they refresh.
- **Severity:** MEDIUM.

### Finding 69-051: editMessage doesn't emit socket event — edits not visible in real-time
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 215-233
- **Problem:** Same pattern — edit is persisted but no socket event. Other participants won't see the edit until refresh.
- **Impact:** Message edits not visible in real-time.
- **Severity:** MEDIUM.

### Finding 69-052: reactToMessage doesn't emit socket event — reactions not visible in real-time
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 435-456
- **Problem:** Reaction upsert/delete happens in DB but no socket event is emitted. Other participants won't see reactions until refresh.
- **Impact:** Reactions not visible in real-time.
- **Severity:** MEDIUM.

---

## TIER 4 — UX/POLISH ISSUES (16 findings)

### Finding 69-053: Hardcoded English strings in conversation screen
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
- Locations:
  - Line 1472: `"Send a message to start the conversation"` (not i18n)
  - Line 1397: `"Pinned Message"` (not i18n)
  - Line 1518: `"Editing message"` (not i18n)
  - Line 1674: `"Slide to cancel"` (not i18n)
  - Line 1749: `'Unpin Message'` / `'Pin Message'` (not i18n)
  - Line 1767: `'Unstar'` / `'Star Message'` (not i18n)
- **Impact:** 6+ hardcoded English strings that won't translate for Arabic/Turkish/etc users.
- **Severity:** MEDIUM.

### Finding 69-054: Hardcoded English strings in saved-messages screen
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`
- Locations:
  - Line 111: `"Pinned"` (not i18n)
  - Line 117: `"Forwarded from"` (not i18n)
  - Line 156-158: `"Your personal cloud notepad..."` (not i18n)
  - Line 232: `'Unpin'` / `'Pin'` (not i18n)
- **Severity:** LOW.

### Finding 69-055: Message input max length is 2000 on mobile but 5000 on backend
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 1612
- **Code:**
```typescript
<TextInput ... maxLength={2000} />
```
vs backend `SendMessageDto` line 32: `@MaxLength(5000)`
- **Problem:** Mobile limits input to 2000 characters but backend accepts 5000. This means the mobile app unnecessarily restricts users.
- **Impact:** Users can't send messages longer than 2000 chars from mobile even though backend supports 5000.
- **Severity:** LOW.

### Finding 69-056: Missing search in conversation list
- **File:** `apps/mobile/app/(tabs)/risalah.tsx`
- **Problem:** There is no search bar or search functionality on the conversation list screen. Users cannot search for specific conversations by name, message content, etc. The only way to find a conversation is to scroll through the list. WhatsApp, Telegram, and all competitors have prominent search bars.
- **Impact:** Poor discoverability for users with many conversations.
- **Severity:** MEDIUM.

### Finding 69-057: New message screen requires minimum 2 characters to search
- **File:** `apps/mobile/app/(screens)/new-conversation.tsx`, line 43
- **Code:**
```typescript
enabled: debouncedQuery.trim().length >= 2,
```
- **Problem:** Users need to type at least 2 characters before search results appear. For single-character usernames (common in some cultures), this prevents finding users.
- **Impact:** Minor UX limitation.
- **Severity:** LOW.

### Finding 69-058: Create group MIN_MEMBERS is 2 but this excludes the creator
- **File:** `apps/mobile/app/(screens)/create-group.tsx`, lines 27-28
- **Code:**
```typescript
const MIN_MEMBERS = 2;
```
- **Problem:** `MIN_MEMBERS = 2` means the user must add 2 OTHER people besides themselves. But the backend's `createGroup` adds the creator automatically: `const allMemberIds = Array.from(new Set([userId, ...memberIds]))`. So the minimum group size is actually 3 (creator + 2 others). WhatsApp allows groups of 2 (creator + 1 other).
- **Impact:** Users can't create 2-person groups from the create-group screen (they'd use createDM instead, but the UX is confusing).
- **Severity:** LOW.

### Finding 69-059: Group name validation allows empty spaces
- **File:** `apps/api/src/modules/messages/messages.service.ts`, line 282
- **Code:**
```typescript
if (!groupName?.trim()) throw new BadRequestException('Group name is required');
```
- **Problem:** While `trim()` is checked, the `CreateGroupDto` in the controller (line 69) has `@IsString() @MaxLength(100)` but no `@MinLength(1)` and no `@IsNotEmpty()`. The DTO validation happens before the service, and `@IsString()` accepts empty string `""`. The service check for `trim()` catches this, but the validation is incomplete.
- **Impact:** Minor — double validation covers the gap.
- **Severity:** LOW.

### Finding 69-060: Conversation header navigates to conversation-info with query param but info screen reads route param
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 1324
- **Code:**
```typescript
onPress={() => router.push(`/(screens)/conversation-info?id=${id}`)}
```
And `apps/mobile/app/(screens)/conversation-info.tsx`, line 43:
```typescript
const { id } = useLocalSearchParams<{ id: string }>();
```
- **Problem:** The navigation passes `id` as a query parameter (`?id=xxx`). `useLocalSearchParams` should pick this up for screens defined with query params. This should work, but it's inconsistent with the dynamic route pattern used for conversation/[id].tsx.
- **Impact:** Works but is fragile — if the screen is moved to a dynamic route, this breaks.
- **Severity:** LOW.

### Finding 69-061: Conversation screen `onLayout` scrolls to end on every layout event
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 1477
- **Code:**
```typescript
onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
```
- **Problem:** `onLayout` fires on every layout change (keyboard open/close, orientation change, etc.). Every time the keyboard opens, the list will force-scroll to the end. If the user was reading old messages, they'll be jerked to the bottom.
- **Impact:** Disruptive UX — user's scroll position is lost on keyboard events.
- **Severity:** MEDIUM.

### Finding 69-062: Conversation screen doesn't handle slow mode
- **File:** `apps/api/prisma/schema.prisma`, line 1102
- **Code:**
```typescript
slowModeSeconds       Int? // 0 = off, 30, 60, 300, 900, 3600
```
- **Problem:** The Conversation model has a `slowModeSeconds` field, but neither the backend `sendMessage` method nor the mobile UI enforce slow mode. Any member can send messages at any rate regardless of the slow mode setting.
- **Impact:** Slow mode feature is non-functional.
- **Severity:** MEDIUM.

### Finding 69-063: No push notifications for new messages
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 136-201
- **Problem:** The `sendMessage` method creates the message and increments unread counts, but never calls `this.pushTrigger` (which is injected in the constructor at line 79). `PushTriggerService` is available but never used for message delivery. Users who don't have the app open will never know they received a message.
- **Impact:** No push notifications for messages — users only see messages when opening the app.
- **Severity:** HIGH.

### Finding 69-064: DM notes contacts query is inefficient — N+1 pattern
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 834-856
- **Code:**
```typescript
async getDMNotesForContacts(userId: string) {
  const memberships = await this.prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
    take: 50,
  });
  const convIds = memberships.map((m) => m.conversationId);
  const otherMembers = await this.prisma.conversationMember.findMany({
    where: { conversationId: { in: convIds }, userId: { not: userId } },
    select: { userId: true },
    take: 50,
  });
```
- **Problem:** Two sequential queries with a `take: 50` cap on each. If a user has 100 conversations, only 50 are checked. The second query also has `take: 50` which may miss contact IDs if many conversations share members. The function could be a single query with a join.
- **Impact:** May miss contacts beyond the first 50 conversations. Performance issue.
- **Severity:** LOW.

### Finding 69-065: Conversation member `role` has no enum validation
- **File:** `apps/api/prisma/schema.prisma`, line 1126
- **Code:**
```typescript
role           String       @default("member") @db.VarChar(10)
```
- **Problem:** The `role` field is a plain String with no enum constraint. The service code checks for `'owner'`, `'admin'`, `'member'` but nothing prevents storing arbitrary values like `'superadmin'` or `'god'`.
- **Impact:** Data integrity risk — invalid roles can be stored.
- **Severity:** LOW.

### Finding 69-066: createGroup doesn't check block status between members
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 281-309
- **Problem:** When creating a group, the method validates that all member IDs correspond to real users, but doesn't check if any pair of members has blocked each other. Two users who have blocked each other can be forced into the same group.
- **Impact:** Privacy violation — blocked users can be put in the same group.
- **Severity:** MEDIUM.

### Finding 69-067: Conversation screen `renderItem` not memoized — performance issue
- **File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 336-366
- **Problem:** The `renderItem` callback for the conversation list creates a new `Swipeable` component with an inline `renderRightActions` function on every render. While `renderItem` itself is wrapped in `useCallback`, the `renderRightActions` is created fresh inside it on every call, and `Swipeable` + `ConversationRow` receive new function references.
- **Impact:** Performance — unnecessary re-renders of list items.
- **Severity:** LOW.

### Finding 69-068: Message search in conversation is client-side only — doesn't use backend search API
- **File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 873-875
- **Code:**
```typescript
const filteredMessages = searchQuery.trim()
  ? combinedMessages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
  : combinedMessages;
```
- **Problem:** The conversation screen has a search feature that filters messages client-side using `Array.filter()`. This only searches messages already loaded in memory (the current page). The backend has a proper `searchMessages` endpoint that can search across ALL messages in the conversation using database `contains` query. This is not used.
- **Impact:** Search only finds matches in currently loaded messages — misses older messages not yet paginated into view.
- **Severity:** MEDIUM.

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 9 |
| HIGH | 18 |
| MEDIUM | 18 |
| LOW | 23 |
| **Total** | **68** |

## Top 10 Most Critical Findings

1. **69-001:** MESSAGE_SELECT omits isSpoiler/isViewOnce/isPinned/starredBy — 7+ features broken on read path
2. **69-020:** CreateDmDto uses @IsUUID but Mizanly uses cuid IDs — createDM completely non-functional
3. **69-021:** All WebSocket DTOs use @IsUUID — all real-time messaging potentially broken
4. **69-007 + 69-008:** Saved-messages uses raw fetch() without auth AND calls non-existent endpoint
5. **69-013 + 69-014:** Pinned-messages and starred-messages have syntax errors — screens cannot load
6. **69-029:** Conversation-media reads wrong param name (`id` vs `conversationId`)
7. **69-002:** View-once messages can be forwarded — privacy violation
8. **69-003:** Lock code stored in plaintext — brute-forceable
9. **69-049:** REST sendMessage doesn't emit socket event — media not delivered in real-time
10. **69-047:** processExpiredMessages never called — disappearing messages never disappear
