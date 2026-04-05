# A13: Messages CRUD Audit

**Scope:** `apps/api/src/modules/messages/messages.controller.ts` (772 lines), `apps/api/src/modules/messages/messages.service.ts` (1928 lines)  
**Auditor:** Hostile code audit  
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] A13-01 — Star/Unstar message has no conversation membership check (BOLA)

**File:** `messages.service.ts`, lines 1335-1354  
**Code:**
```ts
async starMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true },  // <-- no conversationId selected
    });
    if (!message) throw new NotFoundException('Message not found');
    return this.prisma.starredMessage.upsert({ ... });
}
```

The `starMessage` and `unstarMessage` methods do NOT verify the calling user is a member of the conversation the message belongs to. Any authenticated user who obtains or guesses a `messageId` (UUIDs are not secrets) can star messages from private conversations they have no access to. `unstarMessage` is even worse: it does not even verify the message exists, just calls `deleteMany`.

This also leaks information: if the upsert succeeds without error, the attacker knows the messageId is valid, confirming a message exists in someone else's conversation.

**Impact:** BOLA (Broken Object Level Authorization). User can confirm existence of messages in conversations they are not a member of.

---

### [HIGH] A13-02 — Delete message does not clean up reactions or starred entries (incomplete cascade)

**File:** `messages.service.ts`, lines 560-597  
**Code:**
```ts
async deleteMessage(messageId: string, userId: string) {
    // ...
    await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null, ... },
    });
    return { deleted: true };
}
```

The `deleteMessage` method soft-deletes the message (sets `isDeleted: true`) and nulls content/media/E2E fields. However it does NOT:
1. Delete `MessageReaction` entries for this message. Reactions remain in the DB with `emoji` and `userId`, leaking who reacted to the deleted message and what emoji they used.
2. Delete `StarredMessage` entries. Other users who starred this message still have a join-table entry pointing to it.
3. Delete or null `replyTo` references. Other messages that reply to this deleted message still hold `replyToId` pointing to it, and the `replyTo` select in `MESSAGE_SELECT` (line 97-102) will return `content: null` for deleted messages, but the reference chain is still queryable.

The `processExpiredMessages` cron (line 1751) has the same gap: it nulls content fields but does not cascade to reactions/stars.

**Impact:** Privacy violation. Reactions (and their user IDs) survive message deletion. In an E2E context, knowing who reacted and with what emoji reveals behavioral metadata about a "deleted" message.

---

### [HIGH] A13-03 — `markDelivered` allows any conversation member to set `deliveredAt`, not just the recipient

**File:** `messages.service.ts`, lines 1205-1217  
**Code:**
```ts
async markDelivered(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ ... });
    if (!message) throw new NotFoundException('Message not found');
    await this.requireMembership(message.conversationId, userId);
    if (!message.deliveredAt) {
      return this.prisma.message.update({ where: { id: messageId }, data: { deliveredAt: new Date() } });
    }
    return message;
}
```

Any member of the conversation can mark any message as delivered, including the **sender** marking their own message as delivered. In a 1:1 DM, the sender should not be able to set `deliveredAt` on their own message, as this field indicates the *recipient* received it. A malicious client could fake delivery receipts.

In a group, any member (not necessarily the intended recipient) can set the single `deliveredAt` timestamp, which then prevents the actual recipients from doing so (idempotency check `if (!message.deliveredAt)`).

**Impact:** Receipt spoofing. Sender can fake delivery confirmation. In groups, first-to-mark wins, preventing accurate delivery tracking.

---

### [HIGH] A13-04 — `setDisappearingTimer` has no admin/owner check for group conversations

**File:** `messages.service.ts`, lines 1232-1244  
**Code:**
```ts
async setDisappearingTimer(conversationId: string, userId: string, duration: number | null) {
    await this.requireMembership(conversationId, userId);
    // ...
    await this.prisma.conversation.update({ ... });
}
```

Any member of a group conversation can set the disappearing message timer. This changes a group-wide setting. Compare with `setMessageExpiry` (line 1899) which correctly checks `if (conv.isGroup && member.role !== 'admin' && member.role !== 'owner' && conv.createdById !== userId)`. The `setDisappearingTimer` method skips this check entirely.

**Impact:** Any group member can silently enable or disable auto-deletion of messages for the entire group, potentially destroying evidence or disabling an important privacy feature.

---

### [MEDIUM] A13-05 — `editMessage` does not verify conversation membership

**File:** `messages.service.ts`, lines 599-638  
**Code:**
```ts
async editMessage(messageId: string, userId: string, content: string) {
    const message = await this.prisma.message.findUnique({ ... });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException();
    // ... no requireMembership call
}
```

While the sender ownership check (`senderId !== userId`) prevents editing others' messages, the method does not call `requireMembership`. If a user sent a message, then was kicked/banned from the conversation, they can still edit their old messages in that conversation. The `deleteMessage` method correctly calls `requireMembership` at line 567, but `editMessage` does not.

**Impact:** Banned/removed users can modify their previously sent messages in conversations they no longer belong to.

---

### [MEDIUM] A13-06 — `SendMessageDto.mediaUrl` accepts any URL without domain/scheme validation

**File:** `messages.controller.ts`, lines 103-105  
**Code:**
```ts
@IsOptional()
@IsUrl()
mediaUrl?: string;
```

The `@IsUrl()` validator from `class-validator` with default options accepts `javascript:`, `data:`, `file:` and other dangerous URI schemes. It also accepts any domain. For a messaging app, `mediaUrl` should be restricted to the app's CDN domain (Cloudflare R2 URLs) to prevent:
1. SSRF if the server ever fetches the URL (e.g., thumbnail generation)
2. XSS if the URL is rendered in a webview or web client
3. Phishing via arbitrary domain URLs displayed as "media"

The same issue exists in `SendViewOnceDto.mediaUrl` (line 45), `UpdateGroupDto.groupAvatarUrl` (line 150), and `SetWallpaperDto.wallpaperUrl` (line 52).

**Impact:** Users can inject arbitrary URLs (including `javascript:` URIs) as media attachments or group avatars.

---

### [MEDIUM] A13-07 — `addGroupMembers` only checks if creator is adding, admins cannot add members

**File:** `messages.service.ts`, lines 761-803  
**Code:**
```ts
async addGroupMembers(conversationId: string, userId: string, memberIds: string[]) {
    // ...
    if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can add members');
    // ...
}
```

The method uses `createdById` check, not role-based authorization. Admins (role `'admin'`) cannot add members to the group. Compare with `updateGroup` (line 750) which correctly checks `member.role !== 'admin' && member.role !== 'owner' && convo.createdById !== userId`. Similarly, `removeGroupMember` (line 812) only allows the creator.

This is inconsistent with `banMember` which allows both owner and admin, and with `changeGroupRole` which requires creator. The authorization model is fragmented: some operations check `createdById`, some check role, some check both.

**Impact:** Functional bug + inconsistent authorization. Group admins cannot perform basic admin operations (add/remove members) despite having admin role.

---

### [MEDIUM] A13-08 — Race condition in `sendMessage` slow-mode check (TOCTOU)

**File:** `messages.service.ts`, lines 401-414  
**Code:**
```ts
if (convo?.slowModeSeconds && convo.slowModeSeconds > 0) {
    const lastMsg = await this.prisma.message.findFirst({
        where: { conversationId, senderId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
    });
    if (lastMsg) {
        const elapsed = (Date.now() - lastMsg.createdAt.getTime()) / 1000;
        if (elapsed < convo.slowModeSeconds) {
            throw new BadRequestException(`Slow mode: wait ...`);
        }
    }
}
```

The slow-mode check reads the last message time, then later creates the new message in a `$transaction`. Between the read and the transaction start, another concurrent request from the same user can pass the slow-mode check. Two rapid requests can both pass if they read the same `lastMsg.createdAt` before either creates a new message.

**Impact:** Slow mode is bypassable with concurrent requests. A script sending 10 parallel requests can get multiple messages through.

---

### [MEDIUM] A13-09 — `searchAllMessages` uses `contains` with `mode: 'insensitive'` which causes full table scan

**File:** `messages.service.ts`, lines 1070-1083  
**Code:**
```ts
return this.prisma.message.findMany({
    where: {
        conversationId: { in: convIds },
        isDeleted: false,
        e2eVersion: null,
        content: { contains: query.trim(), mode: 'insensitive' },
    },
    // ...
    take: limit,
});
```

`contains` with `mode: 'insensitive'` translates to `ILIKE '%query%'` in PostgreSQL. This cannot use any B-tree index and performs a sequential scan across all messages in all user's conversations. With millions of messages, a single search query can take seconds and consume significant DB resources.

The `searchMessages` method (line 1086) has the same issue but scoped to one conversation, making it less severe.

**Impact:** Performance DoS. A user with many conversations can trigger expensive full-table scans. The `@Throttle({ limit: 10, ttl: 60000 })` on the controller helps but 10 concurrent full-scans per minute per user is still harmful at scale.

---

### [MEDIUM] A13-10 — `forwardMessage` increments `forwardCount` outside the transaction

**File:** `messages.service.ts`, lines 1164-1200  
**Code:**
```ts
const results = await this.prisma.$transaction(
    allowedTargets.flatMap(convId => [ ... ])
);
// ...
await this.prisma.message.update({
    where: { id: messageId },
    data: { forwardCount: { increment: allowedTargets.length } },
});
```

The forward count increment (line 1197-1200) happens after the transaction that creates forwarded messages. If this update fails, the forwarded messages exist but the count is wrong. More critically, if two users forward the same message concurrently, the `{ increment: N }` operations can race: both read the same count, both increment, result is correct only due to Prisma's atomic increment. However, if one transaction succeeds and the forward count update fails (network error, timeout), the count is permanently inaccurate with no recovery mechanism.

**Impact:** Data inconsistency. Forward counts can become inaccurate. Not a security issue but a data integrity concern.

---

### [MEDIUM] A13-11 — `SendViewOnceDto.mediaUrl` uses `@IsUrl()` but `messageType` enum allows only 3 values while main `SendMessageDto` allows 9

**File:** `messages.controller.ts`, lines 44-49  
**Code:**
```ts
class SendViewOnceDto {
    @IsUrl() mediaUrl: string;
    @IsOptional() @IsString() @MaxLength(50) mediaType?: string;
    @IsOptional() @IsEnum(['IMAGE', 'VIDEO', 'VOICE']) messageType?: string;
    // ...
}
```

The `messageType` on `SendViewOnceDto` is validated as `@IsEnum(['IMAGE', 'VIDEO', 'VOICE'])` but is `@IsOptional()`. If omitted, `sendViewOnceMessage` (line 1489) defaults to `'IMAGE'`. However, `mediaType` is a free-form string with only `@MaxLength(50)`. An attacker could set `mediaType` to any value (e.g., `text/html`, `application/javascript`) which the client might render unsafely.

**Impact:** The `mediaType` field is not validated against a known set of MIME types, allowing arbitrary MIME types to be stored and potentially rendered by clients.

---

### [LOW] A13-12 — `editMessage` controller ignores `conversationId` path parameter

**File:** `messages.controller.ts`, lines 281-289  
**Code:**
```ts
@Patch('conversations/:id/messages/:messageId')
editMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EditMessageDto,
) {
    return this.messagesService.editMessage(messageId, userId, dto.content);
}
```

The route includes `:id` (conversationId) but the controller method does not extract or use it. The service method `editMessage` only looks up by `messageId`. Similarly, `deleteMessage` (line 271-278) has `:id` in the route but ignores it.

This means a request to `PATCH /conversations/WRONG-ID/messages/REAL-MSG-ID` will succeed if the user owns the message, regardless of the conversation ID in the URL. While not exploitable (the ownership check is on messageId), it violates REST semantics and could mask bugs in client implementations.

**Impact:** API design inconsistency. The conversationId in the URL is not validated against the message's actual conversationId.

---

### [LOW] A13-13 — `pinMessage`/`unpinMessage` does not check user's role in group conversations

**File:** `messages.service.ts`, lines 1389-1431  

The `pinMessage` and `unpinMessage` methods call `requireMembership` but do not check if the user is an admin/owner in group conversations. Any regular member can pin or unpin messages. For DMs this is fine, but in groups, pinning is typically an admin privilege.

Compare with `createGroupTopic` (line 1832) which correctly restricts to admins.

**Impact:** Any group member can pin/unpin messages, potentially disrupting group communication or removing important pinned messages.

---

### [LOW] A13-14 — `getConversations` limit parameter parsed from query string without validation

**File:** `messages.controller.ts`, line 232 + `messages.service.ts`, line 132  
**Controller:**
```ts
getConversations(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.messagesService.getConversations(userId, limit ? parseInt(limit, 10) : undefined);
}
```
**Service:**
```ts
async getConversations(userId: string, limit = 50) {
    limit = Math.min(Math.max(limit, 1), 100);
```

The `limit` parameter is parsed with `parseInt` which returns `NaN` for non-numeric strings. `Math.min(Math.max(NaN, 1), 100)` returns `NaN`, and `take: NaN` will cause a Prisma error. The service clamps between 1-100 which is good, but `NaN` passes through the clamp.

**Impact:** Passing `?limit=abc` causes a Prisma runtime error instead of a clean 400 response.

---

### [LOW] A13-15 — `markViewOnceViewed` allows any conversation member to view, not just the intended recipient

**File:** `messages.service.ts`, lines 1514-1530  

In a group conversation, any member (not just the message's intended recipient) can call `markViewOnceViewed`. Since view-once sets `viewedAt` once and then the cron deletes the message after 30 seconds, a non-intended member could "use up" the single view. The sender check (line 1521) prevents the sender from viewing their own message, but does not restrict viewing to a specific recipient.

For 1:1 DMs this is correct behavior (there's only one other member). For groups, this means any of the N members can be the one to "consume" the view-once message, after which it's marked viewed for everyone.

**Impact:** In group conversations, view-once messages can be consumed by any member, not a specific recipient. This may be intended behavior but differs from WhatsApp/Signal where view-once in groups allows each recipient to view once.

---

### [LOW] A13-16 — Controller `@Throttle` inconsistencies across similar mutation endpoints

**File:** `messages.controller.ts`

| Endpoint | Throttle |
|----------|----------|
| `POST /:id/messages` (send) | 30/min (line 260) |
| `PATCH /:id/messages/:messageId` (edit) | Class default 60/min |
| `DELETE /:id/messages/:messageId` (delete) | Class default 60/min |
| `POST /:id/messages/:messageId/react` | 30/min (line 293) |
| `POST /:conversationId/view-once` | 10/min (line 588) |
| `POST :messageId/delivered` | Class default 60/min |
| `PUT /conversations/:id/disappearing` | Class default 60/min |
| `PATCH /:conversationId/expiry` | Class default 60/min |
| `POST /:conversationId/:messageId/pin` | Class default 60/min |
| `POST /:conversationId/:messageId/star` | Class default 60/min |

The `delivered` endpoint has no dedicated throttle (inherits class-level 60/min), yet it writes to the DB on every call. An attacker could spam delivery confirmations for 60 different messages per minute. Pin and star also lack dedicated throttles.

**Impact:** Some mutation endpoints lack appropriately restrictive rate limits.

---

### [INFO] A13-17 — Duplicate archive endpoint: POST and PUT both archive conversations

**File:** `messages.controller.ts`  
- `POST /conversations/:id/archive` (line 330) calls `archiveConversation(id, userId, dto.archived)` with a body DTO
- `PUT /conversations/:id/archive` (line 493) calls `archiveConversationForUser(id, userId)` with no body

Two different routes perform the same logical operation (archive) with different implementations. The POST version toggles with a boolean body field, the PUT version always sets `archived: true`. The DELETE (line 502) unarchives. This creates API surface confusion and potential for client bugs.

**Impact:** API design duplication. No security impact but increases maintenance burden and client confusion.

---

### [INFO] A13-18 — `sendMessage` content moderation is NOT called on message creation, only on edit

**File:** `messages.service.ts`  
- `editMessage` line 627: `await this.contentSafety.moderateText(content);`
- `sendMessage`: no `contentSafety.moderateText` call anywhere in the method

The `editMessage` path runs content moderation (line 627) to "prevent bait-and-switch", but the original `sendMessage` does not run any content moderation on the initial text. This means the first send is unmoderated, but edits within 15 minutes are moderated.

The comment at line 626 says "X08-#7: Run content moderation on edited text to prevent bait-and-switch" suggesting moderation was intentionally added to prevent initially-benign messages from being edited to harmful content. However, the initial send path is still unmoderated via REST (the WebSocket gateway may have its own moderation).

**Impact:** Messages sent via REST API skip content moderation entirely. Only edits are moderated.

---

## Checklist Verification

### 1. BOLA -- Can user A read/delete messages in conversations they're not members of?

**READ:** `getMessages` and `getConversation` correctly call `requireMembership`. `getMediaGallery`, `getPinnedMessages`, `searchMessages` all call `requireMembership`. PASS.

**DELETE:** `deleteMessage` calls `requireMembership` AND checks `senderId === userId`. PASS.

**STAR (BOLA gap):** `starMessage` and `unstarMessage` do NOT check membership. FAIL -- see A13-01.

**REACT:** `reactToMessage` and `removeReaction` both call `requireMembership` via the message's conversationId. PASS.

### 2. Membership -- Is conversation membership verified on every operation?

Most operations correctly call `requireMembership`. **Exceptions:**
- `starMessage` / `unstarMessage` -- NO membership check (A13-01)
- `editMessage` -- no membership check, only sender check (A13-05)
- `markDelivered` -- has membership check but no recipient-vs-sender distinction (A13-03)

### 3. Rate limit -- Message sending without @Throttle?

The controller class has `@Throttle({ default: { limit: 60, ttl: 60000 } })` (line 213) as a default. `sendMessage` has a stricter `@Throttle({ limit: 30, ttl: 60000 })`. Several mutation endpoints use the class default (60/min) which may be too generous -- see A13-16.

### 4. Race conditions -- Concurrent message sends? Edit conflicts?

- Slow mode has TOCTOU race (A13-08)
- Message creation itself is within a `$transaction` which prevents double-counting unread
- Edit has no optimistic locking -- two concurrent edits both succeed, last-write-wins
- Dedup via `clientMessageId` unique constraint prevents exact duplicate sends (good)

### 5. Cascade -- Message delete cleans up all E2E fields, reactions, read receipts?

E2E fields are correctly nulled on delete. **Reactions and starred entries are NOT cleaned up** -- see A13-02. Read receipts (unread counts) are not affected by delete, which is correct behavior.

### 6. DTO validation -- Message content length limited? Media URLs validated?

- Content: `@MaxLength(5000)` on `SendMessageDto` and `EditMessageDto`. PASS.
- MediaUrl: `@IsUrl()` with default options, accepts dangerous schemes. PARTIAL -- see A13-06.
- `mediaType`: free-form string, only `@MaxLength(50)`. No MIME validation. See A13-11.
- `limit` query param: not validated, can cause NaN. See A13-14.

### 7. Delete-for-all vs delete-for-me -- Is this distinction enforced correctly?

There is **no delete-for-me** functionality. `deleteMessage` is always a soft-delete that nulls content for everyone (delete-for-all). The service does not support per-user message hiding. This is a missing feature, not a bug, but worth noting that any delete is permanent and visible to all conversation members.

### 8. E2E crypto fields -- Are encrypted fields handled correctly on edit/delete?

- **Delete:** All E2E fields correctly nulled (encryptedContent, encNonce, e2eSenderRatchetKey, e2eVersion, e2eSenderDeviceId, e2eCounter, e2ePreviousCounter, e2eSenderKeyId, e2eSealedEphemeralKey, e2eSealedCiphertext). PASS.
- **Edit:** Encrypted messages correctly rejected from plaintext edit (line 613-618). PASS.
- **Expiry cron:** E2E fields correctly nulled (line 1769-1778). PASS.
- **View-once cron:** E2E fields correctly nulled (line 1793-1801). PASS.
- **Send:** Mutual exclusivity enforced (content XOR encryptedContent). E2E enforcement on isE2E conversations. PASS.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1 | A13-01 |
| HIGH | 3 | A13-02, A13-03, A13-04 |
| MEDIUM | 6 | A13-05, A13-06, A13-07, A13-08, A13-09, A13-10 |
| LOW | 5 | A13-12, A13-13, A13-14, A13-15, A13-16 |
| INFO | 2 | A13-17, A13-18 |
| **Total** | **17** | |
