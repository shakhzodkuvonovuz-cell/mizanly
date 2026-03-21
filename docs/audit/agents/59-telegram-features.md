# Agent 59 — Telegram Feature Parity Deep Audit

**Scope:** All Telegram-inspired features — saved messages, chat folders, slow mode, admin log, group topics, custom emoji packs
**Files audited:**
- `apps/api/src/modules/telegram-features/telegram-features.service.ts` (359 lines)
- `apps/api/src/modules/telegram-features/telegram-features.controller.ts` (156 lines)
- `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts` (60 lines)
- `apps/api/src/modules/telegram-features/telegram-features.module.ts` (12 lines)
- `apps/api/src/modules/telegram-features/telegram-features.controller.spec.ts` (136 lines)
- `apps/api/src/modules/telegram-features/telegram-features.service.spec.ts` (193 lines)
- `apps/api/src/modules/telegram-features/telegram-features.service.edge.spec.ts` (69 lines)
- `apps/api/src/gateways/chat.gateway.ts` (529 lines) — for slow mode enforcement check
- `apps/api/src/modules/messages/messages.service.ts` (lines 136-201) — for slow mode enforcement check
- `apps/api/prisma/schema.prisma` — SavedMessage, ChatFolder, AdminLog, GroupTopic, CustomEmoji, CustomEmojiPack models
- `apps/mobile/app/(screens)/saved-messages.tsx` (272 lines)
- `apps/mobile/app/(screens)/chat-folders.tsx` (235 lines)

**Total findings: 35**

---

## CRITICAL (P0) — Ship Blockers

### Finding 1: Slow Mode is NEVER Enforced — Feature is Decorative Only
- **File:** `apps/api/src/gateways/chat.gateway.ts`, lines 191-234
- **File:** `apps/api/src/modules/messages/messages.service.ts`, lines 136-201
- **Severity:** P0 — Advertised feature is completely non-functional
- **Code (chat.gateway.ts, send_message handler):**
```typescript
@SubscribeMessage('send_message')
async handleMessage(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { ... },
) {
  // ... validates DTO, checks rate limit ...
  const message = await this.messagesService.sendMessage(
    dto.conversationId, client.data.userId, { ... },
  );
  // NO slow mode check anywhere
}
```
- **Code (messages.service.ts, sendMessage):**
```typescript
async sendMessage(conversationId, senderId, data) {
  await this.requireMembership(conversationId, senderId);
  // NO slow mode check — doesn't read conversation.slowModeSeconds
  // NO check of user's last message timestamp
  const message = await this.prisma.$transaction(async (tx) => { ... });
}
```
- **Impact:** An admin can set slow mode to 3600 seconds (1 hour), but users can still send messages at unlimited speed. The `slowModeSeconds` field in the Conversation model is written but NEVER read by the messaging pipeline. The entire slow mode feature is a database write that does nothing.
- **Fix:** In `messagesService.sendMessage()`, after `requireMembership()`, query the conversation's `slowModeSeconds` and compare against the user's last message timestamp. If within the slow mode window and user is not admin/owner, throw `BadRequestException('Slow mode active. Wait X seconds')`.

---

### Finding 2: Group Topics Are Completely Disconnected from Messages — Cannot Organize Messages
- **File:** `apps/api/prisma/schema.prisma` — Message model (no topicId field)
- **File:** `apps/api/prisma/schema.prisma`, lines 3531-3548 — GroupTopic model
- **Severity:** P0 — Feature is structurally broken
- **Evidence:** The `Message` model has NO `topicId` field. The `GroupTopic` model has no relation to `Message`. Topics can be created, listed, updated, and deleted, but there is no way to:
  1. Send a message to a specific topic
  2. Query messages within a topic
  3. Track `messageCount` or `lastMessageAt` (these fields exist on GroupTopic but are never updated)
- **Impact:** Group topics are pure metadata — they organize nothing. The `messageCount` field is always 0, `lastMessageAt` is always null. Users see a list of topics but clicking one would show nothing because messages cannot be filtered by topic.
- **Fix:** Add `topicId String?` + `topic GroupTopic? @relation(...)` to the Message model. Update `sendMessage` to accept optional topicId. Update GroupTopic `messageCount` and `lastMessageAt` on each message send. Add query endpoint for messages-by-topic.

---

### Finding 3: Mobile Saved Messages Screen — Raw Fetch Without Auth Headers (Always 401)
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 26-31, 54-58, 71-72, 82-83
- **Severity:** P0 — Screen is completely non-functional for authenticated users
- **Code:**
```typescript
async function fetchSavedMessages(cursor?: string) {
  const res = await fetch(`${API_BASE}/saved-messages?${params}`);
  // NO Authorization header — ClerkAuthGuard on backend will reject with 401
  return res.json();
}
```
```typescript
const saveMutation = useMutation({
  mutationFn: async () => {
    const res = await fetch(`${API_BASE}/saved-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // NO Authorization: Bearer token
      body: JSON.stringify({ content: newMessage }),
    });
    return res.json();
  },
});
```
- **Impact:** Every API call on this screen (list, save, delete, pin) will return 401 Unauthorized. The screen displays empty or errors. All 4 mutations and the query are broken.
- **Fix:** Use the app's API service layer (which attaches auth tokens) instead of raw `fetch`. Import from `@/services/api.ts` and use `api.get()`, `api.post()`, `api.delete()`, `api.patch()`.

---

### Finding 4: Mobile Chat Folders Screen — Raw Fetch Without Auth Headers (Always 401)
- **File:** `apps/mobile/app/(screens)/chat-folders.tsx`, lines 37-40, 44-49, 61-62
- **Severity:** P0 — Screen is completely non-functional for authenticated users
- **Code:**
```typescript
const foldersQuery = useQuery({
  queryFn: async () => {
    const res = await fetch(`${API_BASE}/chat-folders`);
    // NO Authorization header
    return res.json();
  },
});
```
- **Impact:** Identical to Finding 3. All operations (list, create, delete) fail with 401. The folder list is always empty.
- **Fix:** Same as Finding 3 — use the app's authenticated API service.

---

## HIGH (P1) — Security / Data Integrity

### Finding 5: Custom Emoji imageUrl Has No URL Validation — XSS via SVG and SSRF
- **File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts`, line 58
- **Code:**
```typescript
export class AddEmojiDto {
  @ApiProperty() @IsString() @MaxLength(50) shortcode: string;
  @ApiProperty() @IsString() imageUrl: string;  // NO @IsUrl() validation
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnimated?: boolean;
}
```
- **Impact:**
  1. **XSS via SVG:** An attacker can supply `imageUrl: "data:image/svg+xml,<svg onload='alert(1)'>"` or a URL pointing to a malicious SVG with embedded JavaScript. When rendered on mobile or web, this executes arbitrary code.
  2. **SSRF:** An attacker can supply `imageUrl: "http://169.254.169.254/latest/meta-data/"` to probe internal infrastructure.
  3. **Protocol injection:** `imageUrl: "javascript:alert(1)"` or `imageUrl: "file:///etc/passwd"` could be stored and rendered.
- **Fix:** Add `@IsUrl()` to validate the URL format. Additionally, add a whitelist of allowed protocols (`https://`) and domains (e.g., your R2 bucket domain). For SVG specifically, consider rejecting SVG MIME types or sanitizing SVG content.

---

### Finding 6: Custom Emoji savedMessage mediaUrl Has No URL Validation — Same SSRF/XSS Vector
- **File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts`, line 9
- **Code:**
```typescript
export class SaveMessageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mediaUrl?: string;  // NO @IsUrl()
  @ApiPropertyOptional() @IsOptional() @IsString() mediaType?: string;
```
- **Impact:** Same as Finding 5 — stored SSRF and XSS vectors via saved message media URLs.
- **Fix:** Add `@IsUrl()` to mediaUrl field.

---

### Finding 7: getTopics Endpoint Has No Membership Check — Leaks Group Topic Names to Non-Members
- **File:** `apps/api/src/modules/telegram-features/telegram-features.controller.ts`, lines 112-116
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 252-258
- **Code (controller):**
```typescript
@Get('conversations/:id/topics')
@ApiOperation({ summary: 'Get group topics' })
getTopics(@Param('id') conversationId: string) {
  return this.service.getTopics(conversationId);
  // NOTE: @CurrentUser('id') is NOT extracted — no userId available
}
```
- **Code (service):**
```typescript
async getTopics(conversationId: string) {
  return this.prisma.groupTopic.findMany({
    where: { conversationId },
    // NO membership check — anyone authenticated can enumerate topics
  });
}
```
- **Impact:** Any authenticated user who knows (or brute-forces) a conversation ID can see all topic names and metadata for ANY group, even private groups they're not members of. This leaks group structure and discussion categories.
- **Fix:** Add `@CurrentUser('id') userId: string` to the controller handler. In the service, verify membership before returning topics.

---

### Finding 8: conversationIds Array in Chat Folders Has No Size Limit — Memory/DoS Attack
- **File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts`, lines 22, 30
- **Code:**
```typescript
// CreateChatFolderDto
@ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) conversationIds?: string[];
// NO @ArrayMaxSize — unbounded array

// UpdateChatFolderDto
@ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) conversationIds?: string[];
// NO @ArrayMaxSize — unbounded array
```
- **Impact:** An attacker can send a request with `conversationIds` containing millions of strings, causing memory exhaustion on the server. The array is stored as `String[]` in PostgreSQL, bloating the database row.
- **Fix:** Add `@ArrayMaxSize(500)` (or whatever the reasonable limit is) to both DTOs.

---

### Finding 9: conversationIds Are Not Validated — User Can Add Other Users' Conversations to Their Folders
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 104-114
- **Code:**
```typescript
return this.prisma.chatFolder.create({
  data: {
    userId,
    name: dto.name.trim(),
    conversationIds: dto.conversationIds || [],
    // conversationIds are stored as-is — no verification that the user is actually
    // a member of these conversations
  },
});
```
- **Impact:** A user can store arbitrary conversation IDs in their folder, including conversations they don't belong to. While this doesn't directly expose message content (the folder just stores IDs), it means the folder's "chat count" display is misleading. More importantly, if folder filtering ever queries conversations by these IDs, it could leak data.
- **Fix:** Validate that the user is a member of each conversation in the `conversationIds` array before storing. Query `conversationMember` to verify.

---

### Finding 10: Admin Log Entries Expose Details Without Verifying Target User Existence
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 223-227
- **Code:**
```typescript
async logAdminAction(groupId: string, adminId: string, action: string, targetId?: string, details?: string) {
  return this.prisma.adminLog.create({
    data: { groupId, adminId, action, targetId, details },
    // NO verification that groupId is a valid conversation
    // NO verification that adminId is actually an admin of the group
    // NO validation of the action string — any freeform string accepted
  });
}
```
- **Impact:** `logAdminAction` is a public method on the exported service. Any module that imports `TelegramFeaturesService` can create fake admin log entries with arbitrary groupId, adminId, action, and details. The `action` field has no enum validation — any string is accepted.
- **Fix:** Validate that the adminId belongs to an admin/owner of the groupId. Use a string enum or `@IsIn()` for the action field.

---

### Finding 11: SetSlowModeDto Allows 0-86400 but Service Only Accepts 6 Values — DTO/Service Mismatch
- **File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts`, lines 35-37
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 175-177
- **Code (DTO):**
```typescript
export class SetSlowModeDto {
  @ApiProperty() @IsInt() @Min(0) @Max(86400) seconds: number;
  // Allows ANY integer 0-86400
}
```
- **Code (Service):**
```typescript
const validIntervals = [0, 30, 60, 300, 900, 3600];
if (!validIntervals.includes(seconds)) {
  throw new BadRequestException('Invalid slow mode interval');
}
```
- **Impact:** The DTO gives a false API contract — Swagger docs show any value 0-86400 is acceptable, but the service rejects most values. This causes confusing 400 errors for API consumers who trust the Swagger documentation.
- **Fix:** Either use `@IsIn([0, 30, 60, 300, 900, 3600])` in the DTO (preferred — fail fast at validation layer), or update `@Max` to `3600` to at least narrow the range.

---

## MEDIUM (P2) — Functional Gaps / Logic Bugs

### Finding 12: Admin Log is ONLY Written by setSlowMode — All Other Admin Actions Are Unlogged
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 185-193
- **Evidence:** Full codebase grep for `adminLog.create` and `logAdminAction`:
  - `setSlowMode()` (line 186) — logs `slow_mode_changed` action (**only caller**)
  - `logAdminAction()` (line 224) — public helper method, but **never called from anywhere else in the codebase**
- The following admin actions are NOT logged:
  - Member added/removed/banned
  - Title/photo changed
  - Message pinned/unpinned
  - Permissions changed
  - Topic created/updated/deleted
  - Emoji pack created
- **Impact:** The admin log is nearly empty — only slow mode changes appear. The Prisma schema comment says actions include `member_added | member_removed | member_banned | title_changed | photo_changed | pin_message | unpin_message | slow_mode_changed | permissions_changed`, but only one of these is ever logged.
- **Fix:** Integrate `logAdminAction` calls into all admin-level operations across the messaging, community, and telegram-features modules.

---

### Finding 13: Chat Folder Filtering is Not Implemented — Folders Are Just Lists of IDs
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 82-88
- **Code:**
```typescript
async getChatFolders(userId: string) {
  return this.prisma.chatFolder.findMany({
    where: { userId },
    orderBy: { position: 'asc' },
    take: 50,
  });
  // Returns the folder metadata only — NOT the filtered conversations
}
```
- **Impact:** Chat folders store `conversationIds[]`, `includeGroups`, `includeChannels`, and `filterType`, but there is NO endpoint to get "conversations matching this folder's filters." The mobile client would need to:
  1. Fetch the folder
  2. Fetch ALL conversations
  3. Client-side filter by the IDs and flags
  This defeats the purpose. Telegram's folders auto-filter the conversation list server-side.
- **Missing:** A `GET /chat-folders/:id/conversations` endpoint that queries conversations matching the folder's criteria.

---

### Finding 14: filterType and includeBots Schema Fields Are Not Exposed in DTO or Service
- **File:** `apps/api/prisma/schema.prisma`, lines 3502, 3506
- **Code (schema):**
```prisma
filterType      String   @default("include") // include | exclude
includeBots     Boolean  @default(false)
```
- **File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts` — CreateChatFolderDto and UpdateChatFolderDto
- **Impact:** The `filterType` field (include/exclude mode for Telegram-style folder filtering) and `includeBots` field exist in the database but are NOT in any DTO and NOT set by the service. They will always be their defaults (`"include"` and `false`). Dead schema fields.
- **Fix:** Add `filterType` and `includeBots` to the DTOs and service methods, or remove from schema if not needed.

---

### Finding 15: Group Topics — isClosed Flag Not Enforced in Messaging
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, line 260
- **Evidence:** The `isClosed` boolean exists on GroupTopic and can be toggled via `updateTopic`, but since topics are completely disconnected from messages (Finding 2), closing a topic has no effect. Even if topics were connected, there is no check in `sendMessage` to reject messages to a closed topic.
- **Impact:** Admins can "close" a topic, but this is purely cosmetic. Members can continue posting (once topic-message linking is implemented).
- **Fix:** Once topicId is added to Message model, add a check in `sendMessage` that rejects messages to closed topics.

---

### Finding 16: reorderChatFolders Does Not Validate Complete Set — Partial Reorder Causes Position Gaps
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 139-163
- **Code:**
```typescript
async reorderChatFolders(userId: string, folderIds: string[]) {
  // Verifies all provided IDs belong to user
  const folders = await this.prisma.chatFolder.findMany({ where: { userId } });
  const ownedIds = new Set(folders.map((f) => f.id));
  for (const id of folderIds) {
    if (!ownedIds.has(id)) throw new ForbiddenException();
  }
  // BUT: does NOT verify that ALL folders are included
  // If user has folders [A, B, C] and sends [A, C], folder B keeps its old position
}
```
- **Impact:** If a user sends only a subset of their folder IDs, the omitted folders keep their old `position` values, leading to duplicate positions or gaps. For example: folders A(pos=0), B(pos=1), C(pos=2) → reorder with [C, A] → C becomes pos=0, A becomes pos=1, B stays at pos=1. Now B and A have the same position.
- **Fix:** Validate that `folderIds.length === folders.length` and that the sets are identical (just reordered).

---

### Finding 17: Emoji Pack Has No Delete/Update Endpoint — Creator Cannot Edit or Remove Packs
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts` — entire file
- **File:** `apps/api/src/modules/telegram-features/telegram-features.controller.ts` — entire file
- **Evidence:** Available emoji pack operations:
  - `createEmojiPack` — yes
  - `addEmojiToPack` — yes
  - `getEmojiPacks` (public browse) — yes
  - `getMyEmojiPacks` — yes
  - **deleteEmojiPack** — MISSING
  - **updateEmojiPack** — MISSING
  - **deleteEmoji** — MISSING
  - **togglePackVisibility** — MISSING
- **Impact:** Once an emoji pack is created, the creator cannot delete it, rename it, update its description, remove individual emojis, or toggle it between public/private. The `isPublic` field defaults to `true` and cannot be changed.
- **Fix:** Add CRUD endpoints for pack updates, pack deletion, emoji removal, and visibility toggle.

---

### Finding 18: Emoji Pack usageCount Is Never Incremented — Sorting by Usage Produces Random Order
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, line 337
- **Code:**
```typescript
const packs = await this.prisma.customEmojiPack.findMany({
  where,
  orderBy: { usageCount: 'desc' },  // usageCount is always 0
  take: limit + 1,
});
```
- **Evidence:** Full grep for `usageCount` in the codebase shows no increment operation. The field is `@default(0)` in the schema and never modified.
- **Impact:** The "browse emoji packs" endpoint claims to sort by popularity but returns them in arbitrary order (all have usageCount=0). This affects pack discoverability.
- **Fix:** Increment `usageCount` when a user adds a pack to their collection or uses an emoji from the pack in a message.

---

### Finding 19: No Mobile Screens for Group Topics, Admin Log, or Custom Emoji Packs
- **Evidence:** Full grep for topic/admin-log/emoji-pack screens in `apps/mobile/`:
  - `getTopics` / `group-topics` — 0 mobile files
  - `admin-log` / `adminLog` — 0 mobile files
  - `emoji-packs` / `emojiPack` / `customEmoji` — 0 mobile files
- **Impact:** These features have backend APIs but zero mobile UI. Users cannot:
  - View or create group topics
  - View admin logs
  - Browse, create, or use custom emoji packs
  The features are backend-only with no user-facing interface.
- **Fix:** Create mobile screens for each of these features.

---

### Finding 20: Saved Messages Search Has No Pagination — Returns Unbounded Results
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 65-78
- **Code:**
```typescript
async searchSavedMessages(userId: string, query: string, limit = 20) {
  return this.prisma.savedMessage.findMany({
    where: {
      userId,
      content: { contains: query.trim(), mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  // Returns flat array — no cursor, no hasMore, no pagination metadata
}
```
- **Controller (line 27-28):**
```typescript
searchSavedMessages(@CurrentUser('id') userId: string, @Query('q') query: string) {
  return this.service.searchSavedMessages(userId, query);
  // No limit parameter exposed — always uses default 20
}
```
- **Impact:** Search results cannot be paginated — user always gets at most 20 results with no way to load more. If the query matches many messages, results are truncated silently.
- **Fix:** Add cursor-based pagination to search (consistent with `getSavedMessages`). Expose `limit` and `cursor` query parameters.

---

## LOW (P3) — Code Quality / Polish

### Finding 21: Duplicate Pressable Import in saved-messages.tsx — Compilation Warning/Error
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 2-6
- **Code:**
```typescript
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  TextInput, Keyboard,
  Pressable,   // DUPLICATE import
} from 'react-native';
```
- **Impact:** Duplicate named import. Depending on the bundler/linter configuration, this may produce a warning or error. Metro bundler typically handles this silently, but it's a code quality issue.
- **Fix:** Remove the duplicate `Pressable` import.

---

### Finding 22: Unused FadeOut Import in saved-messages.tsx
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, line 7
- **Code:**
```typescript
import Animated, { FadeInUp, FadeIn, FadeOut, SlideOutRight } from 'react-native-reanimated';
```
- **Evidence:** `FadeOut` is never used in the file (only `FadeInUp`, `FadeIn`, and `SlideOutRight` are used).
- **Fix:** Remove `FadeOut` from the import.

---

### Finding 23: Hardcoded English Strings in saved-messages.tsx
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 155-157, 232
- **Code:**
```typescript
<Text style={styles.infoText}>
  Your personal cloud notepad. Save messages, links, and files — accessible on all devices.
</Text>
```
```typescript
<Text style={styles.pinText}>Pinned</Text>
```
```typescript
<Text style={styles.forwardText}>Forwarded from {item.forwardedFromType as string}</Text>
```
- **Impact:** These strings are not localized via `t()`. Arabic, Turkish, Urdu, etc. users see English text.
- **Fix:** Replace with i18n keys: `t('risalah.cloudNotepadInfo')`, `t('risalah.pinned')`, `t('risalah.forwardedFrom')`.

---

### Finding 24: Hardcoded English Strings in chat-folders.tsx
- **File:** `apps/mobile/app/(screens)/chat-folders.tsx`, lines 116-118, 124, 152
- **Code:**
```typescript
<Text style={styles.infoText}>
  Organize your chats into custom folders. Drag to reorder. Max 10 folders.
</Text>
```
```typescript
<Text style={styles.createTitle}>New Folder</Text>
```
```typescript
<Text style={styles.cancelText}>Cancel</Text>
```
```typescript
actionLabel="Create Folder"
```
- **Impact:** Same as Finding 23 — not localized.
- **Fix:** Replace with i18n keys.

---

### Finding 25: Test Bug — logAdminAction Called with Object Instead of String
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.spec.ts`, line 182
- **Code:**
```typescript
await service.logAdminAction('conv-1', 'user-1', 'KICK', { targetUserId: 'user-2' });
// 4th arg is { targetUserId: 'user-2' } (object)
// But method signature is: logAdminAction(groupId, adminId, action, targetId?: string, details?: string)
// 4th arg should be a string, not an object
```
- **Service signature (line 223):**
```typescript
async logAdminAction(groupId: string, adminId: string, action: string, targetId?: string, details?: string)
```
- **Impact:** The test passes because TypeScript's `as any` on the mock hides the type mismatch. In production, the `targetId` column would receive `[object Object]` as a string (JavaScript coercion), corrupting the admin log data.
- **Fix:** Change test to: `service.logAdminAction('conv-1', 'user-1', 'KICK', 'user-2', 'Kicked from group')`.

---

### Finding 26: Cursor Pagination Bug — Uses `id < cursor` Instead of `createdAt`-Based Ordering
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 16-17, 209-210, 333-334
- **Code (getSavedMessages):**
```typescript
const where: Record<string, unknown> = { userId };
if (cursor) where.id = { lt: cursor };  // id-based cursor
// But ordering is: orderBy: { createdAt: 'desc' }
```
- **Impact:** UUIDs are not lexicographically ordered by creation time (unlike CUIDs). Since these models use `@default(uuid())`, `id < cursor` does NOT correspond to "created before cursor." This means:
  1. Pages may skip records
  2. Pages may return duplicate records
  3. Pagination is non-deterministic
  This applies to: `getSavedMessages`, `getAdminLog`, `getEmojiPacks`.
- **Fix:** Either: (a) switch cursor to `createdAt`-based, or (b) switch IDs to `@default(cuid())` which ARE lexicographically time-ordered, or (c) use `createdAt` + `id` compound cursor.

---

### Finding 27: getSavedMessages — Cursor Points to Last Item Even When Result is Empty
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, line 27
- **Code:**
```typescript
return { data: messages, meta: { cursor: messages[messages.length - 1]?.id || null, hasMore } };
// When hasMore is false but messages has items, cursor is still set to last item's id
// When messages is empty, messages[messages.length - 1] is undefined, so cursor is null — correct
```
- **Impact:** Minor — the cursor is set even when `hasMore` is false, which is misleading but doesn't cause data issues since the client should check `hasMore` first. However, it's inconsistent with the empty-array case.
- **Fix:** Set `cursor: hasMore ? messages[messages.length - 1]?.id : null`.

---

### Finding 28: No Rate Limiting on Most Telegram Feature Endpoints
- **File:** `apps/api/src/modules/telegram-features/telegram-features.controller.ts`
- **Evidence:** Only 2 of 16 endpoints have `@Throttle` decorators:
  - `createChatFolder` — `@Throttle({ default: { limit: 10, ttl: 60000 } })` (line 70)
  - `createEmojiPack` — `@Throttle({ default: { limit: 5, ttl: 60000 } })` (line 139)
  - All other 14 endpoints rely only on global throttle (100 req/min)
- **Impact:** The `addEmoji` endpoint (line 145-148) has no specific throttle — an attacker can rapidly add 120 emojis to a pack before the global rate limit kicks in. `saveMessage` has no throttle — allows rapid creation of thousands of saved messages. `reorderChatFolders` has no throttle — allows rapid reorder requests.
- **Fix:** Add specific rate limits to write endpoints, especially `addEmoji` and `saveMessage`.

---

### Finding 29: Topic Creation Allows Any Member — No Admin-Only Restriction Option
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 231-249
- **Code:**
```typescript
async createTopic(conversationId: string, userId: string, dto: { name: string; iconColor?: string }) {
  const member = await this.prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw new NotFoundException('Not a member of this group');
  // ANY member can create topics — no admin/owner check
  // Telegram allows admins to restrict topic creation to admins only
```
- **Impact:** In a 10,000-member group, any member can create topics up to the 100 limit, potentially filling all topic slots with spam. There's no way for admins to restrict topic creation to admins only (as Telegram supports).
- **Fix:** Add a `topicCreationRestricted: Boolean @default(false)` field to Conversation. When true, only admin/owner can create topics.

---

### Finding 30: iconColor Field Has No Format Validation — Allows Invalid Hex Colors and Injection
- **File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts`, lines 41, 46
- **Code:**
```typescript
export class CreateTopicDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(7) iconColor?: string;
  // MaxLength(7) limits to "#RRGGBB" but doesn't validate hex format
  // Could be "abcdefg" or "<scrip" (7 chars, not a color)
}
```
- **Impact:** The `iconColor` is stored and sent to clients, who may inject it into style attributes without sanitization. While not a direct XSS vector in React Native (which uses JS objects not CSS strings), it's a data integrity issue and could cause rendering bugs.
- **Fix:** Add `@Matches(/^#[0-9A-Fa-f]{6}$/)` to validate hex color format.

---

### Finding 31: Emoji Shortcode Uniqueness Not Enforced Within Pack
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 315-329
- **Code:**
```typescript
async addEmojiToPack(packId: string, userId: string, dto: { shortcode: string; imageUrl: string; isAnimated?: boolean }) {
  const pack = await this.prisma.customEmojiPack.findFirst({ where: { id: packId, creatorId: userId } });
  if (!pack) throw new NotFoundException('Emoji pack not found or not yours');
  // Validates shortcode format
  // Checks pack emoji count limit (120)
  // BUT: does NOT check if shortcode already exists in this pack
  return this.prisma.customEmoji.create({ ... });
}
```
- **Evidence:** The `CustomEmoji` model has no `@@unique([packId, shortcode])` constraint in the schema.
- **Impact:** The same shortcode (e.g., `pepe_smile`) can be added multiple times to the same pack, causing ambiguity when resolving `:pepe_smile:` in messages.
- **Fix:** Either add `@@unique([packId, shortcode])` to the Prisma schema, or check for existing shortcode before creating.

---

### Finding 32: Saved Messages — forwardedFromId Not Validated
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 30-47
- **Code:**
```typescript
async saveMessage(userId: string, dto: { ...; forwardedFromType?: string; forwardedFromId?: string; }) {
  // Validates forwardedFromType is in ['post', 'thread', 'reel', 'video', 'message']
  // BUT: does NOT validate that forwardedFromId actually exists
  // AND: forwardedFromType can be set without forwardedFromId and vice versa
  return this.prisma.savedMessage.create({ data: { userId, ...dto } });
}
```
- **Impact:** Users can save "forwarded" messages with fake source IDs that point to non-existent or private content. If the UI ever tries to link to the original content, it will 404.
- **Fix:** Either: (a) validate that both fields are present or both absent, (b) verify the source exists, or at minimum (c) add `forwardedFromId` required when `forwardedFromType` is set.

---

### Finding 33: Edge Test Suite Is Thin — Only 6 Tests for Entire Module
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.edge.spec.ts`
- **Evidence:** The edge test file has only 6 tests:
  1. Arabic saved message content
  2. Arabic folder name
  3. Empty folder name
  4. Empty saved messages list
  5. Delete non-existent saved message
  6. Empty chat folders list
- **Missing edge cases:**
  - Slow mode with 0 seconds (disable)
  - Slow mode with invalid interval
  - Max 10 folders limit hit
  - Max 100 topics limit hit
  - Max 120 emoji per pack limit hit
  - Shortcode regex edge cases (2 chars min, 32 chars max, special chars)
  - Emoji with animated flag
  - Topic operations on non-existent conversation
  - Admin log with cursor pagination
  - Reorder with duplicate folder IDs
  - Reorder with empty array
  - Search with single character
  - Unicode/emoji in topic names
  - XSS payloads in emoji imageUrl
- **Fix:** Expand edge test coverage significantly.

---

### Finding 34: Controller Spec Covers Only 8 of 16 Endpoints
- **File:** `apps/api/src/modules/telegram-features/telegram-features.controller.spec.ts`
- **Evidence:** Tested endpoints:
  1. `getSavedMessages` — tested
  2. `saveMessage` — tested
  3. `getChatFolders` — tested
  4. `createChatFolder` — tested
  5. `setSlowMode` — tested
  6. `getAdminLog` — tested
  7. `createTopic` — tested
  8. `createEmojiPack` — tested
- **Untested endpoints (8):**
  1. `searchSavedMessages`
  2. `pinSavedMessage`
  3. `deleteSavedMessage`
  4. `reorderChatFolders`
  5. `updateChatFolder`
  6. `deleteChatFolder`
  7. `updateTopic`
  8. `deleteTopic`
  9. `getTopics`
  10. `addEmoji`
  11. `getEmojiPacks`
  12. `getMyEmojiPacks`
- **Fix:** Add controller tests for all 16 endpoints.

---

### Finding 35: Slow Mode setSlowMode Does Not Verify Conversation Exists or Is a Group
- **File:** `apps/api/src/modules/telegram-features/telegram-features.service.ts`, lines 167-196
- **Code:**
```typescript
async setSlowMode(conversationId: string, adminId: string, seconds: number) {
  const member = await this.prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: adminId } },
  });
  if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
    throw new ForbiddenException('Only admins can set slow mode');
  }
  // Does NOT check if the conversation is a group (isGroup: true)
  // Slow mode on a DM (1:1 conversation) makes no sense
  await this.prisma.conversation.update({
    where: { id: conversationId },
    data: { slowModeSeconds: seconds === 0 ? null : seconds },
  });
```
- **Impact:** An admin of a DM conversation (if such a role exists) could set slow mode on a 1:1 chat, which is nonsensical. While this may not occur in practice (DMs typically don't have admin roles), it's a logic gap.
- **Fix:** Check `conversation.isGroup === true` before allowing slow mode to be set.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| P0 (Ship Blocker) | 4 | Slow mode decorative, topics disconnected, mobile screens 401 |
| P1 (Security) | 7 | XSS via emoji SVG, SSRF via URLs, topic data leak, DoS via arrays |
| P2 (Functional) | 9 | Admin log incomplete, folders don't filter, no delete for emoji packs, pagination broken |
| P3 (Code Quality) | 15 | Hardcoded strings, thin tests, duplicate imports, cursor bugs |
| **Total** | **35** | |

### Top 5 Must-Fix Items:
1. **Slow mode enforcement** — Add check in `sendMessage` for `slowModeSeconds` (P0)
2. **Mobile auth headers** — Switch saved-messages and chat-folders from raw fetch to authenticated API service (P0)
3. **Group topics disconnected** — Add `topicId` to Message model to make topics functional (P0)
4. **Custom emoji XSS** — Add `@IsUrl()` validation to `imageUrl` in AddEmojiDto (P1)
5. **getTopics auth** — Add membership check to prevent topic enumeration by non-members (P1)
