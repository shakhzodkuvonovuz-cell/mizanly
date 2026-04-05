# A14: Messages Queries Audit

**Scope:** `messages.service.ts` (getConversationMessages, search, getConversations methods) + `messages.controller.ts` (GET endpoints)
**Files:** `apps/api/src/modules/messages/messages.service.ts` (1928 lines), `apps/api/src/modules/messages/messages.controller.ts` (771 lines)
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] A14-01 -- getConversations has no cursor pagination, only limit-based

**File:** `messages.service.ts` lines 131-149
**Controller:** `messages.controller.ts` line 228-233

`getConversations` accepts only a `limit` parameter (default 50, max 100). There is no `cursor` parameter. To load more conversations, the client has no mechanism to request the next page. Compare with `getArchivedConversations` (line 1264) which correctly implements cursor-based pagination with `hasMore` metadata.

This means:
1. Users with >100 conversations can never see all of them.
2. The response does not include `hasMore` or `cursor` metadata, breaking the API contract described in CLAUDE.md (`{ data: T[], meta: { cursor?, hasMore } }`).

```typescript
// Line 131-149: No cursor, no hasMore, returns raw array
async getConversations(userId: string, limit = 50) {
    limit = Math.min(Math.max(limit, 1), 100);
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, isArchived: false, isBanned: false },
      // ... no cursor logic
      take: limit,
    });
    return memberships.map((m) => ({ ... })); // Raw array, no { data, meta }
}
```

### [HIGH] A14-02 -- searchAllMessages has no pagination and no cursor support

**File:** `messages.service.ts` lines 1058-1084
**Controller:** `messages.controller.ts` line 449-454

`searchAllMessages` accepts only a hardcoded `limit = 20` with no cursor parameter exposed by the controller. The controller passes no cursor:

```typescript
// Controller line 452-453
async searchAllMessages(@CurrentUser('id') uid: string, @Query('q') q: string) {
    return this.messagesService.searchAllMessages(uid, q);
}
```

The service returns a raw array, not `{ data, meta }`. A user searching for a common term like "hello" across all conversations gets only the first 20 results with no way to load more.

### [HIGH] A14-03 -- searchAllMessages does not filter out blocked users' messages

**File:** `messages.service.ts` lines 1058-1084

`getMessages` (line 161) correctly fetches blocks and filters out messages from blocked users via `senderId: { notIn: blockedIds }`. However, `searchAllMessages` performs no block filtering whatsoever. A user who has blocked someone (or been blocked) can still find that person's messages via global search, leaking content that should be invisible.

```typescript
// Line 1070-1083: No block check
return this.prisma.message.findMany({
    where: {
        conversationId: { in: convIds },
        isDeleted: false,
        e2eVersion: null,
        content: { contains: query.trim(), mode: 'insensitive' },
        // MISSING: senderId: { notIn: blockedIds }
    },
    // ...
});
```

### [HIGH] A14-04 -- searchMessages (per-conversation) does not filter blocked users' messages

**File:** `messages.service.ts` lines 1086-1098

Same issue as A14-03 but for the per-conversation search endpoint. `searchMessages` calls `requireMembership` but never queries the `Block` table. Messages from blocked users are returned in search results within a conversation.

### [HIGH] A14-05 -- View-once message media URLs returned to all conversation members, not just intended recipient

**File:** `messages.service.ts` lines 55-108 (MESSAGE_SELECT), lines 161-191 (getMessages)

The `MESSAGE_SELECT` constant includes `mediaUrl: true` at line 62. The `getMessages` method returns all messages including view-once messages with their full `mediaUrl`. In a group conversation, ALL members receive the view-once media URL, not just the intended recipient.

Additionally, even after a view-once message is "viewed" by the recipient, the `mediaUrl` remains in the database and continues to be served to all members who fetch the conversation messages -- until the 30-second cleanup cron runs. During that window, any member can copy the URL.

The media URL itself has no auth gate (R2 direct URLs per CLAUDE.md "Installed but Not Fully Wired" section), so anyone with the URL can access the media.

### [HIGH] A14-06 -- getMediaGallery includes view-once message media

**File:** `messages.service.ts` lines 1219-1230

The media gallery endpoint filters by `messageType: { in: ['IMAGE', 'VIDEO'] }` and `isDeleted: false`, but does NOT exclude `isViewOnce: true` messages. View-once photos and videos appear in the media gallery, defeating the entire purpose of view-once.

```typescript
// Line 1222: Missing isViewOnce filter
where: { conversationId, isDeleted: false, messageType: { in: ['IMAGE', 'VIDEO'] },
    // MISSING: isViewOnce: false
```

### [HIGH] A14-07 -- searchMessages cursor uses `id: { lt: cursor }` but ordering is by `createdAt: 'desc'`

**File:** `messages.service.ts` lines 1089-1098

The search cursor uses `id: { lt: cursor }` for pagination while ordering by `createdAt: 'desc'`. CUIDs are lexicographically ordered by creation time (they embed a timestamp), so `id < cursor` would actually work for CUID ordering. However, this relies on an implementation detail of CUIDs that is not guaranteed across CUID versions and is fragile.

More critically, since the query filters by `content: { contains: query }`, the results are not contiguous by `id` or `createdAt`. Using `id: { lt: cursor }` as the pagination mechanism means messages with matching content but IDs between page boundaries could be skipped entirely. The cursor should use `skip + cursor` (as `getMessages` does) or a proper keyset approach.

### [MEDIUM] A14-08 -- getConversations does not filter conversations with only blocked members

**File:** `messages.service.ts` lines 131-149

`getConversations` filters by `isArchived: false` and `isBanned: false` but does NOT filter out conversations where the other member (in 1:1 DMs) has blocked the current user. The DM conversation still appears in the conversation list with the blocked user's name, avatar, and last message preview. The user cannot send messages (blocked at `sendMessage`), but the conversation metadata is still visible.

### [MEDIUM] A14-09 -- Global search LIKE query with no index -- full table scan on messages.content

**File:** `messages.service.ts` lines 1070-1083
**Schema:** `schema.prisma` lines 2039-2046

`searchAllMessages` uses Prisma `contains` with `mode: 'insensitive'`, which translates to `ILIKE '%query%'` in PostgreSQL. There is no index on `message.content`. The existing indexes on the `messages` table are:

- `[conversationId, createdAt(sort: Desc)]`
- `[conversationId, isPinned, isDeleted]`
- `[senderId]`
- `[expiresAt]`
- `[scheduledAt]`
- `[conversationId, senderId, createdAt(sort: Desc)]`
- `[isScheduled, scheduledAt]`

None of these cover `content`. At scale, `ILIKE '%query%'` on millions of messages rows is a full sequential scan. This is a DoS vector even with the 10 req/min throttle, as each request can hold a DB connection for seconds.

### [MEDIUM] A14-10 -- searchAllMessages caps membership lookup at 200 but user could be in more conversations

**File:** `messages.service.ts` lines 1062-1067

```typescript
const memberships = await this.prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
    take: 200,
});
```

If a user is a member of more than 200 conversations, search silently excludes conversations beyond the first 200 (ordered by default, likely by primary key -- not by recency). This means recent conversations could be excluded from search if the user has many old conversations.

### [MEDIUM] A14-11 -- getMessages limit parameter not exposed via controller -- hardcoded at 50

**File:** `messages.controller.ts` line 250-258, `messages.service.ts` line 161-166

The controller does not accept a `limit` query parameter for message fetching:

```typescript
// Controller line 250-258: No @Query('limit')
getMessages(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
) {
    return this.messagesService.getMessages(id, userId, cursor);
    // Service default: limit = 50
}
```

The service accepts `limit` as parameter 4 (default 50), but the controller never passes it. The client has no way to request fewer or more messages per page. This wastes bandwidth on slow connections (always 50) and prevents optimistic loading of larger batches.

### [MEDIUM] A14-12 -- Starred messages endpoint does not verify membership in message's conversation

**File:** `messages.service.ts` lines 1335-1348 (starMessage), lines 1356-1386 (getStarredMessages)

`starMessage` verifies the message exists but does NOT check that the user is a member of the conversation that message belongs to. Any authenticated user who knows a message ID can star it, even if they are not in the conversation:

```typescript
// Line 1335-1348: No membership check
async starMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true }, // Does not even fetch conversationId
    });
    if (!message) throw new NotFoundException('Message not found');
    // MISSING: requireMembership(message.conversationId, userId)
    return this.prisma.starredMessage.upsert({ ... });
}
```

This is an information leak: if the star succeeds (no error), the attacker confirms the message ID exists. More critically, `getStarredMessages` then fetches the full message content for all starred messages with no membership check, potentially exposing messages from conversations the user was never part of.

### [MEDIUM] A14-13 -- getPinnedMessages does not filter blocked users' pinned messages

**File:** `messages.service.ts` lines 1433-1441

`getPinnedMessages` returns all pinned messages in a conversation without filtering messages from blocked users. If User A blocks User B, and User B had a pinned message, User A still sees it.

### [LOW] A14-14 -- getConversation returns CONVERSATION_SELECT with members `take: 5` but no total count

**File:** `messages.service.ts` lines 27-53 (CONVERSATION_SELECT)

`CONVERSATION_SELECT` limits members to `take: 5`. For groups with 100+ members, the client receives 5 members with no indication of total member count. The client cannot display "and 95 others" without a separate query or a `_count` aggregate.

### [LOW] A14-15 -- searchMessages cursor pagination breaks when multiple messages share the same id prefix

**File:** `messages.service.ts` line 1090

The in-conversation search uses `id: { lt: cursor }` for pagination. While CUIDs are monotonically increasing, concurrent message inserts can produce IDs where the ordering is not strictly by creation time. Combined with the `contains` text filter, this can cause edge-case pagination gaps (same concern as A14-07 but lower severity since it's scoped to a single conversation).

### [LOW] A14-16 -- getArchivedConversations cursor compound key assumes unique conversationId per user

**File:** `messages.service.ts` lines 1264-1292

The cursor uses `conversationId_userId` as the compound cursor key:

```typescript
cursor: { conversationId_userId: { conversationId: cursor, userId } }, skip: 1
```

This is correct since `@@id([conversationId, userId])` is the composite primary key. However, the cursor value comes from `data[data.length - 1].conversationId` which means the client needs to know to pass a `conversationId` as the cursor value. This is inconsistent with other endpoints that use message `id` as cursor, which could confuse API consumers.

### [LOW] A14-17 -- DM Notes for contacts (getDMNotesForContacts) caps at 50 conversations and 50 other members

**File:** `messages.service.ts` lines 1625-1656

Two separate `take: 50` limits truncate the results. First, only the first 50 conversation memberships are fetched. Then, only the first 50 other members. A user in 200 conversations could miss DM notes from contacts in conversations 51-200.

### [INFO] A14-18 -- E2E encrypted fields (Bytes) are returned correctly as Prisma binary

**File:** `messages.service.ts` lines 55-108 (MESSAGE_SELECT)

The `MESSAGE_SELECT` includes `encryptedContent: true`, `e2eSenderRatchetKey: true` etc. Prisma returns `Bytes` fields as `Buffer` objects in Node.js, which serialize to `{ type: 'Buffer', data: [...] }` in JSON. This is correct binary passthrough -- the client decodes accordingly. No base64 string conversion issues observed in the query layer.

### [INFO] A14-19 -- getMessages correctly uses Prisma cursor pagination with skip: 1

**File:** `messages.service.ts` lines 177-191

The main message fetching method correctly implements cursor-based pagination: `cursor: { id: cursor }, skip: 1` with `take: limit + 1` to detect `hasMore`. This follows the standard Prisma relay-style cursor pattern and is well-implemented.

---

## Checklist Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | **Membership checked before returning messages** | PASS | `getMessages` (line 167), `getConversation` (line 152), `searchMessages` (line 1088), `getPinnedMessages` (line 1434), `getMediaGallery` (line 1220) all call `requireMembership`. |
| 2 | **Pagination bounded** | PARTIAL FAIL | `getMessages`: proper cursor pagination (PASS). `getConversations`: limit-only, no cursor, no `hasMore` (FAIL -- A14-01). `searchAllMessages`: no pagination at all (FAIL -- A14-02). `searchMessages`: cursor pagination present (PASS). |
| 3 | **Deleted messages filtered** | PASS | All message queries include `isDeleted: false`. Deletion clears all content and crypto fields (lines 570-596). |
| 4 | **Blocked users filtered** | PARTIAL FAIL | `getMessages` correctly filters blocked senders (lines 170-175). `searchAllMessages` does NOT filter blocked (FAIL -- A14-03). `searchMessages` does NOT filter blocked (FAIL -- A14-04). `getConversations` still shows conversations with blocked members (A14-08). |
| 5 | **Search paginated and scoped** | PARTIAL FAIL | `searchMessages` (per-conversation) has cursor pagination and requires membership (PASS on scoping). `searchAllMessages` has no pagination (FAIL -- A14-02). Neither leaks messages from non-member conversations (PASS on scoping). |
| 6 | **Performance -- N+1 and indexes** | PARTIAL FAIL | No N+1 on author lookup: `sender` is included in `MESSAGE_SELECT` as a nested `select` (PASS). Missing index on `content` for ILIKE search (FAIL -- A14-09). Existing `[conversationId, createdAt]` index covers `getMessages` well (PASS). |
| 7 | **Media exposure without auth** | FAIL | Media URLs (R2 direct) are returned in message queries with no auth layer (A14-05). View-once media appears in media gallery (A14-06). |
| 8 | **E2E fields returned correctly** | PASS | Prisma `Bytes` fields returned as Buffer objects. Encrypted messages excluded from server-side search. No plaintext leakage in query responses (A14-18). |

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 6 |
| MEDIUM | 6 |
| LOW | 4 |
| INFO | 2 |
| **Total** | **19** |
