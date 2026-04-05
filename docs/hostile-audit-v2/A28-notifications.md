# A28: Notifications Audit

**Scope:** `notifications.controller.ts` (86 lines), `notifications.service.ts` (554 lines), `notification.events.ts` (64 lines)
**Supporting files reviewed:** `push-trigger.service.ts`, `push.service.ts`, `messages.service.ts`, `follows.service.ts`, `posts.service.ts`, `circles.service.ts`, Prisma schema (Notification model)
**Date:** 2026-04-05

---

## Findings

### [MEDIUM] F1 -- Push trigger does not pass isE2E flag for MESSAGE notifications

**File:** `push-trigger.service.ts`, lines 83-94
**Issue:** When the push trigger handles `NotificationType.MESSAGE`, it calls `this.push.buildMessageNotification(actorName, notification.conversationId, this.truncate(notification.body || '', 80))` without passing the fourth `isE2E` parameter. The `buildMessageNotification` method (push.service.ts:296) accepts an `isE2E = false` default. Although `messages.service.ts` already substitutes "New message" as the notification body for encrypted messages (line 496-500), the push builder's E2E path (`senderName sent you a message` vs `senderName: preview`) is never activated. This means the push notification format differs for E2E vs plaintext messages, creating a metadata side-channel: an observer of push notifications (APNs/FCM transit, notification center) can distinguish "New message" bodies from content-bearing bodies and infer which conversations are E2E-encrypted vs plaintext. The `isE2E` flag should be propagated so the push builder can apply consistent formatting.

### [MEDIUM] F2 -- getGroupedNotifications does not filter banned/deactivated actors

**File:** `notifications.service.ts`, lines 433-484
**Issue:** The `getNotifications` method (line 74) explicitly filters out notifications where `n.actor?.isBanned || n.actor?.isDeactivated`. However, `getGroupedNotifications` (line 433) returns actors directly without any such filter. It also does not select `isBanned` or `isDeactivated` from the actor relation (line 443), so even if filtering were added, the data is not available. A banned user who liked/commented before being banned will still appear in grouped notifications with their username, displayName, and avatarUrl visible to the recipient.

### [LOW] F3 -- Notification body stored in DB leaks plaintext for E2E reply/thread notifications

**File:** `push-trigger.service.ts`, lines 107-114
**Issue:** For `THREAD_REPLY` and `REPLY` notification types, the push body is `"${actorName} replied: ${this.truncate(notification.body || '', 80)}"`. The `notification.body` field is whatever was passed during `create()`. If the caller passes reply content as the body (which callers in threads.service.ts do), this plaintext is persisted in the `notifications` table (`body` column) and transmitted via push. For E2E-encrypted threads, this would leak plaintext. The current mitigation relies on callers passing safe bodies, but there is no server-side enforcement that E2E conversation notification bodies do not contain plaintext content.

### [LOW] F4 -- Socket real-time notification includes body field for all message types

**File:** `notifications.service.ts`, lines 381-397
**Issue:** The Redis `notification:new` publish payload includes `body: params.body` unconditionally. For message notifications in E2E conversations, the `body` was already sanitized to "New message" by the caller (messages.service.ts:496). However, there is no defense-in-depth check at the notification service level. If any future caller passes actual message content for a conversationId-bearing notification, it will be broadcast over Redis pub/sub and the WebSocket to the client. A defense-in-depth approach would strip/replace body when `conversationId` is present and the conversation is E2E.

### [LOW] F5 -- Pagination cursor mismatch after banned-actor filtering

**File:** `notifications.service.ts`, lines 60-88
**Issue:** Line 61 slices `items` from the raw query: `const items = hasMore ? notifications.slice(0, limit) : notifications`. Line 74 then filters: `enrichedItems = items.filter(n => !n.actor?.isBanned && !n.actor?.isDeactivated)`. The cursor on line 87 is computed from `items[items.length - 1].id` (pre-filter), but the actual returned data is `enrichedItems` (post-filter). If 5 out of 30 items are from banned actors, the client receives 25 items but `hasMore: true`. On the next page request, the cursor skips correctly, but the client may perceive inconsistent page sizes. In a pathological case where all items on a page are from banned actors, the client receives 0 items with `hasMore: true`, creating an infinite empty-page loop.

### [LOW] F6 -- Batch notification counter key has no upper bound

**File:** `notifications.service.ts`, lines 291-343
**Issue:** The batching logic at line 311 calls `atomicIncr(this.redis, countKey, 1800)` which increments indefinitely within the 30-minute TTL. If a viral post receives 10,000 likes in 30 minutes, the body becomes "and 9999 others liked your post" and the existing notification row is updated 10,000 times (line 328-336). Each update is a Prisma `notification.update` call with a DB write. There is no cap on how many times a single notification row can be updated within the batch window. At extreme scale, this creates a hot-row problem on the notifications table. A reasonable cap (e.g., stop updating after 100 batches, just increment the Redis counter) would prevent DB contention.

### [LOW] F7 -- Deduplication key does not include actorId

**File:** `notifications.service.ts`, lines 276-289
**Issue:** The dedup key is `notif:dedup:${params.userId}:${params.type}:${targetId}`. It does not include `actorId`. This means if user A likes a post and user B likes the same post within 5 minutes, user B's notification is suppressed by the dedup check. This is partially mitigated by the batching logic (lines 291-343) which updates the existing notification instead. However, for non-batchable types (e.g., MENTION, TAG, FOLLOW), the dedup key without actorId means two different users mentioning the recipient on the same post within 5 minutes results in only one notification. The second mention is silently dropped.

### [INFO] F8 -- Three overlapping unread count endpoints

**File:** `notifications.controller.ts`, lines 40-56
**Issue:** There are three separate endpoints that return unread counts: `GET /notifications/unread` (line 40), `GET /notifications/unread-count` (line 47), and `GET /notifications/unread-counts` (line 52). The first returns `{ unread: count }`, the second returns `{ total: count }`, and the third returns `Record<string, number>` by type. This API surface is confusing and creates maintenance burden. The first two return effectively the same scalar in different shapes. Consider consolidating into a single endpoint that returns both the total and the per-type breakdown.

### [INFO] F9 -- Redis dedup failure is silently swallowed during SET

**File:** `notifications.service.ts`, lines 365-367
**Issue:** The Redis SET for the dedup key (line 365) catches and logs at debug level. This is intentional (notification creation should not fail on Redis errors). However, if Redis is down, both the GET check (line 281, also caught) and the SET (line 365) will fail, meaning dedup is completely disabled. Under Redis outage, every single notification event creates a new DB row with no deduplication. The 30-minute batching logic (line 297) also depends on Redis (`atomicIncr`), so batch counters would also fail. Combined, a Redis outage during high activity (e.g., viral post) could result in thousands of duplicate notifications flooding a user's inbox.

---

## Checklist Verification

### 1. BOLA -- Can user A read user B's notifications?

**PASS.** All controller endpoints use `@CurrentUser('id')` to extract the authenticated user's ID from the JWT (lines 29, 42, 48, 54, 60, 66, 74, 83). The service methods filter by `userId` in all queries:
- `getNotifications`: `where: { userId }` (line 26)
- `getUnreadCount`: `where: { userId, isRead: false }` (line 133)
- `getUnreadCounts`: `where: { userId, isRead: false }` (line 140)
- `getGroupedNotifications`: `where: { userId }` (line 438)
- `markRead`: Checks `notification.userId !== userId` and throws `ForbiddenException` (line 97)
- `markAllRead`: `where: { userId, isRead: false }` (line 118)
- `deleteNotification`: Checks `notification.userId !== userId` and throws `ForbiddenException` (line 165)

No BOLA vulnerability found.

### 2. Spam -- Can one action generate unlimited notifications? Fan-out capped?

**PARTIAL PASS.**
- Message fan-out is capped at 1024 members (`take: 1024` in messages.service.ts:534).
- Circle notifications capped at 50 members (circles.service.ts:157, 169, 210).
- Post mention notifications capped at 50 users (`take: 50` in posts.service.ts:572).
- Notification dedup via Redis key with 5-minute TTL (service line 279).
- Batch/aggregate for LIKE/COMMENT types within 30-minute window (service line 293).
- **Gap (F6):** No cap on batch update count for viral content -- can cause thousands of DB updates to a single row.
- **Gap (F7):** Dedup key without actorId silently drops legitimate notifications from different actors on the same target for non-batchable types.

### 3. Privacy -- Do notifications leak content from private/E2E conversations?

**PARTIAL PASS.**
- Messages.service.ts correctly substitutes "New message" as body for E2E messages (line 496-500).
- **Gap (F1):** Push trigger does not pass `isE2E` flag, creating a metadata side-channel.
- **Gap (F3):** Reply/thread notification bodies may contain plaintext from E2E conversations if callers pass content.
- **Gap (F4):** Socket notification payload includes body unconditionally; no defense-in-depth for E2E conversations.
- Notification actor data is properly scoped (username, displayName, avatar only -- no email, phone, or location).

### 4. Blocked users -- Do notifications arrive from blocked users?

**PASS.** The `create()` method checks both directions of the block relationship at lines 233-239:
```
OR: [
  { blockerId: params.userId, blockedId: params.actorId },
  { blockedId: params.userId, blockerId: params.actorId },
]
```
If a block exists in either direction, the notification is silently dropped (line 272). System notifications (actorId=null) skip the block check correctly (line 232). Additionally, banned actors are checked at lines 213-218 and filtered from display at line 74.

### 5. Muted -- Are muted conversation notifications suppressed?

**PASS.** Two-level muting is implemented:
- **User-level mute:** The `create()` method checks `Mute` table for actor-to-recipient muting (lines 244-248). If the recipient has muted the actor, notification is dropped (line 272).
- **Conversation-level mute:** `messages.service.ts` queries `conversationMember` with `isMuted: false` filter (line 531) before emitting notification events. Muted conversation members never receive message notifications.
- **Per-type suppression:** User settings (`notifyLikes`, `notifyComments`, etc.) are checked at lines 252-265.
- **Global disable:** `user.notificationsOn` check at line 269.

### 6. Cascade -- User delete cleans up their notifications?

**PASS.** The Prisma schema defines `onDelete: Cascade` on both notification relations:
- `user User @relation("NotificationRecipient", ..., onDelete: Cascade)` (schema line 2272) -- deleting the recipient deletes all their notifications.
- `actor User? @relation("NotificationActor", ..., onDelete: Cascade)` (schema line 2273) -- deleting the actor deletes all notifications they triggered.
- Content cascades also work: `post`, `comment`, `reel`, `video`, `thread`, `conversation`, `followRequest`, `circle` all have `onDelete: Cascade` (schema lines 2274-2281).

### 7. Pagination -- Notification list bounded?

**PASS.** 
- `getNotifications`: Limit clamped to `Math.min(Math.max(1, ...), 50)` at controller line 36. Service uses cursor-based pagination with `take: limit + 1` (line 55).
- `getGroupedNotifications`: Fixed `limit = 20` default (not exposed as query param). Raw fetch capped at `Math.min(limit * 3, 100)` = 60 rows max (line 446).
- Cleanup cron deletes read notifications > 90 days and unread > 1 year (lines 491-553), preventing unbounded table growth.

### 8. Mark read -- Can user mark other user's notifications as read?

**PASS.** `markRead()` fetches the notification, checks `notification.userId !== userId`, and throws `ForbiddenException` if they don't match (line 97). `markAllRead()` uses `where: { userId, isRead: false }` so it only affects the authenticated user's notifications (line 118). `deleteNotification()` similarly checks ownership at line 165.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | -- |
| HIGH | 0 | -- |
| MEDIUM | 2 | F1, F2 |
| LOW | 5 | F3, F4, F5, F6, F7 |
| INFO | 2 | F8, F9 |
| **Total** | **9** | |

**Overall assessment:** The notification system is well-designed with solid BOLA protection, bidirectional block checking, two-level mute suppression, cascade deletes, and bounded pagination. The main gaps are in E2E privacy consistency (push metadata side-channel, no defense-in-depth for body content) and the grouped notifications endpoint missing the banned/deactivated actor filter that the main endpoint has. No critical or high-severity issues found.
