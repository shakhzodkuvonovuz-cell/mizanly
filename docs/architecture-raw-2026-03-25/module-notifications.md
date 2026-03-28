# Module: Notifications — Complete Architecture

> Extracted from `apps/api/src/modules/notifications/` (5 source files, 4 test files)
> Plus `apps/api/src/gateways/chat.gateway.ts` (socket delivery) and
> `apps/api/src/modules/islamic/islamic-notifications.service.ts` (prayer DND)

---

## 1. Module Structure

**File:** `apps/api/src/modules/notifications/notifications.module.ts` (13 lines)

```
NotificationsModule
  imports: [DevicesModule]
  controllers: [NotificationsController]
  providers: [NotificationsService, PushService, PushTriggerService]
  exports: [NotificationsService, PushService, PushTriggerService]
```

All three services are exported, allowing any module in the app to create notifications by importing `NotificationsModule` and injecting `NotificationsService`.

### Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `notifications.module.ts` | 13 | NestJS module wiring |
| `notifications.controller.ts` | 77 | 7 REST endpoints |
| `notifications.service.ts` | 331 | CRUD + create + cleanup cron |
| `push-trigger.service.ts` | 264 | Switch-case push router (22 notification types) |
| `push.service.ts` | 412 | Expo Push API client + 21 builder methods + i18n templates |
| `notifications.controller.spec.ts` | 104 | Controller tests |
| `notifications.service.spec.ts` | 803 | Service tests (30 cases) |
| `push-trigger.service.spec.ts` | 139 | Push trigger tests |
| `push.service.spec.ts` | 211 | Push service tests |

---

## 2. REST API Endpoints (7 total)

All endpoints are under `@Controller('notifications')` (resolved to `/api/v1/notifications`).
All require `@UseGuards(ClerkAuthGuard)` + `@ApiBearerAuth()`.
Global throttle: `60 requests / 60 seconds`.

### 2.1 GET /api/v1/notifications
**Line:** controller L26-38

| Field | Value |
|-------|-------|
| Method | GET |
| Path | `/api/v1/notifications` |
| Auth | ClerkAuthGuard (Bearer JWT) |
| Query params | `filter` (optional: `'all'` \| `'mentions'` \| `'verified'`), `cursor` (optional: string), `limit` (optional: 1-50, default 30) |
| Response | `{ data: Notification[], meta: { cursor: string|null, hasMore: boolean } }` |
| Notes | Filter validation rejects invalid values silently (falls back to undefined). Limit clamped to [1, 50]. |

**Filter logic (service L23-29):**
- `'mentions'` → `type IN ('MENTION', 'THREAD_REPLY', 'REPLY')`
- `'verified'` → `actor.isVerified = true`
- `'all'` / undefined → no type filter

**Conditional relation includes (service L285-306):**
- `'mentions'` filter → only `post` + `thread` relations included (no `reel`/`video` JOINs)
- `'all'`/`'verified'`/undefined → all 4 content relations: `post`, `reel`, `thread`, `video`

**Actor enrichment (service L59-73):**
- Batch-fetches Follow records for all unique actorIds
- Adds `isFollowing: boolean` to each actor object (for follow-back buttons)

**Pagination:** Cursor-based keyset pagination. Fetches `limit + 1` records; if overflow exists, `hasMore: true` and cursor is last item's ID.

### 2.2 GET /api/v1/notifications/unread
**Line:** controller L40-44

| Field | Value |
|-------|-------|
| Method | GET |
| Path | `/api/v1/notifications/unread` |
| Auth | ClerkAuthGuard |
| Response | `{ unread: number }` |
| Notes | Simple count of `isRead: false` notifications for user |

### 2.3 GET /api/v1/notifications/unread-count
**Line:** controller L46-50

| Field | Value |
|-------|-------|
| Method | GET |
| Path | `/api/v1/notifications/unread-count` |
| Auth | ClerkAuthGuard |
| Response | `{ total: number }` |
| Notes | Same as `/unread` but returns `total` key instead of `unread` |

### 2.4 GET /api/v1/notifications/unread-counts
**Line:** controller L52-56

| Field | Value |
|-------|-------|
| Method | GET |
| Path | `/api/v1/notifications/unread-counts` |
| Auth | ClerkAuthGuard |
| Response | `Record<string, number>` — keys are NotificationType values + `total` |
| Notes | Groups unread notifications by type using `groupBy`. Returns per-type counts with a computed `total`. |

### 2.5 POST /api/v1/notifications/:id/read
**Line:** controller L58-62

| Field | Value |
|-------|-------|
| Method | POST |
| Path | `/api/v1/notifications/:id/read` |
| Auth | ClerkAuthGuard |
| Response | Updated Notification object with `isRead: true`, `readAt: Date` |
| Errors | 404 if notification not found, 403 if user is not the owner |

### 2.6 POST /api/v1/notifications/read-all
**Line:** controller L64-68

| Field | Value |
|-------|-------|
| Method | POST |
| Path | `/api/v1/notifications/read-all` |
| Auth | ClerkAuthGuard |
| Response | `{ updated: true }` |
| Notes | Batch updates all unread notifications for user |

### 2.7 DELETE /api/v1/notifications/:id
**Line:** controller L70-75

| Field | Value |
|-------|-------|
| Method | DELETE |
| Path | `/api/v1/notifications/:id` |
| Auth | ClerkAuthGuard |
| Response | `{ deleted: true }` (HTTP 200) |
| Errors | 404 if notification not found, 403 if user is not the owner |

---

## 3. Service Methods (NotificationsService)

**File:** `notifications.service.ts` (331 lines)

### 3.1 getNotifications(userId, filter?, cursor?, limit?)
**Line:** L17-79

Fetches paginated notifications with:
1. Filter application (mentions/verified/all)
2. Conditional content relation includes (optimized JOINs)
3. Cursor-based keyset pagination (limit+1 pattern)
4. Batch follow-status enrichment (isFollowing on each actor)

### 3.2 markRead(notificationId, userId)
**Line:** L81-92

Finds notification, verifies ownership, sets `isRead: true` and `readAt: new Date()`.

### 3.3 markAllRead(userId)
**Line:** L94-100

Batch `updateMany` on all unread notifications for user.

### 3.4 getUnreadCount(userId)
**Line:** L102-107

Returns `{ unread: count }`.

### 3.5 getUnreadCounts(userId)
**Line:** L109-121

Uses `groupBy(['type'])` to return per-type counts plus computed `total`.

### 3.6 getUnreadCountTotal(userId)
**Line:** L123-128

Returns `{ total: count }`.

### 3.7 deleteNotification(notificationId, userId)
**Line:** L130-139

Finds, verifies ownership, deletes. Returns `{ deleted: true }`.

### 3.8 create(params) — Internal API
**Line:** L150-278

**The core notification creation method.** Not exposed as a REST endpoint; called internally by other services (posts, reels, threads, follows, circles, commerce, gamification, channels, events, community, videos).

**Parameters:**
```typescript
{
  userId: string;      // Recipient
  actorId: string;     // Who triggered the notification
  type: string;        // NotificationType enum value (validated at runtime)
  postId?: string;
  threadId?: string;
  commentId?: string;
  reelId?: string;
  videoId?: string;
  conversationId?: string;
  followRequestId?: string;
  title?: string;
  body?: string;
}
```

**Pre-creation check pipeline (all in parallel via Promise.all, L174-194):**
1. Fetch UserSettings (per-type notification preferences)
2. Fetch User (global notificationsOn flag)
3. Check Block (bidirectional — either direction blocks notifications)
4. Check Mute (recipient has muted the actor)

**Returns `null` (skip) if:**
- `userId === actorId` (self-notification skip, L164)
- Invalid notification type (L167-171)
- Per-type setting is `false` (L197-208)
- Global `notificationsOn` is `false` (L211)
- Block exists in either direction (L214)
- Mute exists (L214)
- Redis deduplication key exists (L221-225)

**On success:**
1. Create DB record (L231-246)
2. Set Redis dedup key with 300s TTL (L249-251) — non-blocking
3. Fire push via `pushTrigger.triggerPush(notification.id)` (L254) — non-blocking
4. Publish to Redis `notification:new` channel for socket delivery (L259-275) — non-blocking

### 3.9 cleanupOldNotifications() — Cron
**Line:** L313-330

| Field | Value |
|-------|-------|
| Schedule | `@Cron(CronExpression.EVERY_DAY_AT_3AM)` |
| What gets deleted | Notifications where `isRead: true` AND `createdAt < (now - 90 days)` |
| Retention | 90 days for read notifications; unread notifications are never auto-deleted |
| Logging | Logs count only when > 0 |

---

## 4. Notification Creation Flow

```
Caller Service (e.g. posts.service.ts)
    │
    ▼
NotificationsService.create(params)
    │
    ├─ 1. Self-notification check: userId === actorId → return null
    ├─ 2. Type validation: Object.values(NotificationType).includes(type)
    ├─ 3. Parallel pre-checks (Promise.all):
    │     ├─ UserSettings → per-type prefs
    │     ├─ User → global notificationsOn
    │     ├─ Block → bidirectional check
    │     └─ Mute → recipient muted actor
    ├─ 4. Per-type setting check → return null if disabled
    ├─ 5. Global notifications check → return null if off
    ├─ 6. Block/Mute check → return null if blocked or muted
    ├─ 7. Redis deduplication check (GET notif_dedup:{userId}:{type}:{targetId})
    │     → return null if duplicate within 5 min
    │
    ├─ 8. prisma.notification.create() → DB record
    │
    ├─ 9. Redis SET notif_dedup:{userId}:{type}:{targetId} EX 300  [non-blocking]
    │
    ├─ 10. PushTriggerService.triggerPush(notificationId)  [non-blocking]
    │       │
    │       ├─ Fetch notification + actor from DB
    │       ├─ Switch on notification.type (22 cases)
    │       ├─ Build push payload via PushService.build*() methods
    │       └─ PushService.sendToUser(userId, payload)
    │             │
    │             ├─ Fetch active Device tokens from DB
    │             ├─ Fetch unread count for badge number
    │             ├─ Send via Expo Push API (batch, max 100/request)
    │             └─ Handle response: deactivate invalid tokens
    │
    └─ 11. Redis PUBLISH 'notification:new' { userId, notification }  [non-blocking]
            │
            └─ ChatGateway subscriber (onModuleInit)
                 │
                 └─ server.to(`user:${userId}`).emit('new_notification', notification)
```

---

## 5. Callers of NotificationsService.create() (27 call sites)

| Module | File | Call Sites | Notification Types |
|--------|------|------------|-------------------|
| posts | `posts.service.ts` | L576, L607, L630, L805, L1085, L1097 | LIKE, COMMENT, REPLY, MENTION, REPOST, QUOTE_POST |
| reels | `reels.service.ts` | L183, L205, L568, L667 | REEL_LIKE, REEL_COMMENT, MENTION |
| videos | `videos.service.ts` | L460, L573 | VIDEO_LIKE, VIDEO_COMMENT |
| threads | `threads.service.ts` | L420, L545, L611, L786 | THREAD_REPLY, MENTION, LIKE |
| follows | `follows.service.ts` | L86, L124, L370 | FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED |
| circles | `circles.service.ts` | L139 | CIRCLE_INVITE |
| channels | `channels.service.ts` | L213 | CHANNEL_POST |
| community | `community.service.ts` | L53, L151 | CIRCLE_JOIN, SYSTEM |
| commerce | `commerce.service.ts` | L243, L324 | SYSTEM (purchase, gift) |
| events | `events.service.ts` | L339 | SYSTEM (event reminder) |
| gamification | `gamification.service.ts` | L354, L409 | SYSTEM (badge, achievement) |

---

## 6. Push Template Builders (PushService — 21 methods)

**File:** `push.service.ts` (L245-411)

| # | Method | Line | Title | Body Template | Data Type Key |
|---|--------|------|-------|---------------|---------------|
| 1 | `buildLikeNotification(actorName, postId)` | L245 | `"New like"` | `"{actor} liked your post"` | `like` |
| 2 | `buildCommentNotification(actorName, postId, preview)` | L253 | `"New comment"` | `"{actor} commented: {preview}"` | `comment` |
| 3 | `buildFollowNotification(actorName, userId)` | L261 | `"New follower"` | `"{actor} started following you"` | `follow` |
| 4 | `buildMessageNotification(senderName, conversationId, preview)` | L269 | `"New message"` | `"{sender}: {preview}"` | `message` |
| 5 | `buildMentionNotification(actorName, targetId, targetType)` | L277 | `"You were mentioned"` | `"{actor} mentioned you in a {targetType}"` | `mention` |
| 6 | `buildRepostNotification(actorName, postId)` | L285 | `"Repost"` | `"{actor} reposted your post"` | `repost` |
| 7 | `buildQuotePostNotification(actorName, postId)` | L293 | `"Quote post"` | `"{actor} quoted your post"` | `quote_post` |
| 8 | `buildReelLikeNotification(actorName, reelId)` | L301 | `"New like"` | `"{actor} liked your reel"` | `reel_like` |
| 9 | `buildReelCommentNotification(actorName, reelId, preview)` | L309 | `"New comment"` | `"{actor} commented on your reel: {preview}"` | `comment` |
| 10 | `buildVideoLikeNotification(actorName, videoId)` | L317 | `"New like"` | `"{actor} liked your video"` | `video_like` |
| 11 | `buildVideoCommentNotification(actorName, videoId, preview)` | L325 | `"New comment"` | `"{actor} commented on your video: {preview}"` | `comment` |
| 12 | `buildVideoPublishedNotification(actorName, videoId, videoTitle)` | L333 | `"New video"` | `"{actor} published: {videoTitle}"` | `video_published` |
| 13 | `buildLiveStartedNotification(actorName, liveId)` | L341 | `"Live now"` | `"{actor} is live now!"` | `live` |
| 14 | `buildChannelPostNotification(actorName, channelName, postId)` | L349 | `"{channelName}"` | `"{actor} posted in {channelName}"` | `channel_post` |
| 15 | `buildStoryReplyNotification(actorName, preview)` | L357 | `"Story reply"` | `"{actor} replied to your story: {preview}"` | `message` |
| 16 | `buildCircleInviteNotification(actorName, circleName)` | L365 | `"Circle invite"` | `"{actor} invited you to join {circleName}"` | `system` |
| 17 | `buildCircleJoinNotification(actorName, circleName)` | L373 | `"New member"` | `"{actor} joined {circleName}"` | `system` |
| 18 | `buildPollVoteNotification(actorName, postId)` | L381 | `"Poll vote"` | `"{actor} voted on your poll"` | `poll_vote` |
| 19 | `buildTipNotification(senderName, amount)` | L389 | `"New tip"` | `"{sender} sent you a tip of ${amount}"` | `tip` |
| 20 | `buildEventNotification(eventTitle, eventId)` | L397 | `"Event reminder"` | `"Event \"{eventTitle}\" is starting soon"` | `event` |
| 21 | `buildPrayerNotification(prayerName)` | L405 | `"Prayer time"` | `"It's time for {prayerName}"` | `prayer` |

**Additional inline push payloads in PushTriggerService (not via builder):**

| # | Type | Title | Body | Line |
|---|------|-------|------|------|
| 22 | FOLLOW_REQUEST | `"Follow request"` | `"{actor} requested to follow you"` | push-trigger L64-68 |
| 23 | FOLLOW_REQUEST_ACCEPTED | `"Follow request accepted"` | `"{actor} accepted your follow request"` | push-trigger L71-76 |
| 24 | THREAD_REPLY / REPLY | `"New reply"` | `"{actor} replied: {body truncated to 80}"` | push-trigger L103-110 |
| 25 | SYSTEM | `notification.title \|\| "Mizanly"` | `notification.body` | push-trigger L224-231 |
| 26 | default (fallback) | `notification.title \|\| "New notification"` | `notification.body` | push-trigger L236-241 |

---

## 7. PushTriggerService — Type-to-Builder Routing

**File:** `push-trigger.service.ts` (264 lines)

The `triggerPush(notificationId)` method (L16-244) is a large switch statement that routes each NotificationType to the appropriate PushService builder.

| NotificationType | Builder Used | Guard Condition |
|-----------------|-------------|-----------------|
| `LIKE` | `buildLikeNotification` | `postId \|\| reelId` must exist |
| `REEL_LIKE` (first match at L30) | `buildLikeNotification` | `postId \|\| reelId` must exist |
| `COMMENT` | `buildCommentNotification` | `postId \|\| reelId` must exist |
| `REEL_COMMENT` (first match at L41) | `buildCommentNotification` | `postId \|\| reelId` must exist |
| `FOLLOW` | `buildFollowNotification` | `actorId` must exist |
| `FOLLOW_REQUEST` | inline payload | always fires |
| `FOLLOW_REQUEST_ACCEPTED` | inline payload | always fires |
| `MESSAGE` | `buildMessageNotification` | `conversationId` must exist |
| `MENTION` | `buildMentionNotification` | always (targetId defaults to `''`) |
| `THREAD_REPLY` / `REPLY` | inline payload | `threadId` must exist |
| `REPOST` | `buildRepostNotification` | `postId` must exist |
| `QUOTE_POST` | `buildQuotePostNotification` | `postId` must exist |
| `CHANNEL_POST` | `buildChannelPostNotification` | `postId` must exist |
| `LIVE_STARTED` | `buildLiveStartedNotification` | `videoId` must exist |
| `VIDEO_PUBLISHED` | `buildVideoPublishedNotification` | `videoId` must exist |
| `REEL_LIKE` (second match at L158) | `buildReelLikeNotification` | `reelId` must exist |
| `REEL_COMMENT` (second match at L167) | `buildReelCommentNotification` | `reelId` must exist |
| `VIDEO_LIKE` | `buildVideoLikeNotification` | `videoId` must exist |
| `VIDEO_COMMENT` | `buildVideoCommentNotification` | `videoId` must exist |
| `STORY_REPLY` | `buildStoryReplyNotification` | always fires |
| `POLL_VOTE` | `buildPollVoteNotification` | `postId` must exist |
| `CIRCLE_INVITE` | `buildCircleInviteNotification` | always fires |
| `CIRCLE_JOIN` | `buildCircleJoinNotification` | always fires |
| `SYSTEM` | inline payload | `title \|\| body` must exist |

**Note: Bug — REEL_LIKE and REEL_COMMENT appear twice in the switch.** The first match (L30, L41) catches them as fallthrough cases of LIKE/COMMENT and routes to generic `buildLikeNotification`/`buildCommentNotification`. The second match (L158, L167) for REEL_LIKE/REEL_COMMENT with reel-specific builders is unreachable dead code. The effect: reel likes/comments use post-oriented builder text ("liked your post") instead of reel-specific text ("liked your reel").

**Actor name fallback (L27):** `notification.actor?.displayName || 'Someone'`

**Body truncation (L260-263):** All comment/reply/message bodies are truncated to 80 characters with Unicode ellipsis (`\u2026`).

**Error handling (L246-258):** `sendSafe()` wraps every `push.sendToUser()` call in try/catch to prevent push failures from crashing the trigger pipeline.

---

## 8. Per-Type Notification Preferences

**File:** `notifications.service.ts` L198-207

The mapping from `NotificationType` to `UserSettings` fields:

| NotificationType | UserSettings Field | Effect When `false` |
|------------------|--------------------|---------------------|
| `LIKE` | `notifyLikes` | Skip notification |
| `REEL_LIKE` | `notifyLikes` | Skip notification |
| `VIDEO_LIKE` | `notifyLikes` | Skip notification |
| `COMMENT` | `notifyComments` | Skip notification |
| `REEL_COMMENT` | `notifyComments` | Skip notification |
| `VIDEO_COMMENT` | `notifyComments` | Skip notification |
| `REPLY` | `notifyComments` | Skip notification |
| `THREAD_REPLY` | `notifyComments` | Skip notification |
| `FOLLOW` | `notifyFollows` | Skip notification |
| `FOLLOW_REQUEST` | `notifyFollows` | Skip notification |
| `FOLLOW_REQUEST_ACCEPTED` | `notifyFollows` | Skip notification |
| `MENTION` | `notifyMentions` | Skip notification |
| `MESSAGE` | `notifyMessages` | Skip notification |
| `STORY_REPLY` | `notifyMessages` | Skip notification |
| `LIVE_STARTED` | `notifyLiveStreams` | Skip notification |

**Types with NO per-type setting (always delivered unless global off):**
- `REPOST`
- `QUOTE_POST`
- `CHANNEL_POST`
- `VIDEO_PUBLISHED`
- `POLL_VOTE`
- `CIRCLE_INVITE`
- `CIRCLE_JOIN`
- `SYSTEM`

**Global override:** `User.notificationsOn: Boolean @default(true)` — when `false`, ALL notification types are suppressed regardless of per-type settings (L211).

**UserSettings notification fields (Prisma schema L2522-2528):**
```prisma
notifyLikes       Boolean @default(true)
notifyComments    Boolean @default(true)
notifyFollows     Boolean @default(true)
notifyMentions    Boolean @default(true)
notifyMessages    Boolean @default(true)
notifyLiveStreams Boolean @default(true)
emailDigest       Boolean @default(false)
```

---

## 9. Redis Deduplication

**File:** `notifications.service.ts` L216-229, L248-251

### Key Format
```
notif_dedup:{userId}:{type}:{targetId}
```

Where `targetId` is resolved by priority chain:
```typescript
const targetId = params.postId || params.threadId || params.reelId || params.videoId
  || params.commentId || params.conversationId || params.followRequestId || params.actorId;
```

### TTL
**300 seconds (5 minutes)**

### Behavior
1. Before creating a notification, `GET notif_dedup:{key}`
2. If key exists → suppress (return null), log debug message
3. If key does not exist → proceed with creation
4. After creation, `SET notif_dedup:{key} '1' EX 300` (non-blocking, failures logged but ignored)

### Redis Failure Handling
- GET failure: logs debug, proceeds with notification creation (L226-229)
- SET failure: caught by `.catch()`, logged debug (L250-251)

Redis is treated as best-effort; if Redis is down, deduplication is disabled and notifications flow through.

---

## 10. Self-Notification Skip

**File:** `notifications.service.ts` L164

```typescript
if (params.userId === params.actorId) return null; // No self-notifications
```

This is the **first check** in `create()`, before any DB queries. Simple string equality comparison on the internal user ID. Prevents:
- Liking your own post generating a notification to yourself
- Commenting on your own post generating a notification
- Following yourself (prevented elsewhere, but belt-and-suspenders)

---

## 11. Block/Mute Check

**File:** `notifications.service.ts` L183-194, L214

### Block Check (L183-189)
```typescript
this.prisma.block.findFirst({
  where: {
    OR: [
      { blockerId: params.userId, blockedId: params.actorId },
      { blockedId: params.userId, blockerId: params.actorId },
    ],
  },
})
```
**Bidirectional:** If EITHER party has blocked the other, no notification is created. This prevents:
- A blocked user's actions generating notifications for the blocker
- A blocker's actions leaking to the blocked user

### Mute Check (L191-193)
```typescript
this.prisma.mute.findFirst({
  where: { userId: params.userId, mutedId: params.actorId },
})
```
**Unidirectional:** Only checks if the recipient has muted the actor. (The actor may still receive notifications from the recipient.)

### Combined Gate (L214)
```typescript
if (blockExists || muteExists) return null;
```

Both checks run in parallel via `Promise.all` (L174) alongside UserSettings and User fetch — no sequential penalty.

---

## 12. Cleanup Cron

**File:** `notifications.service.ts` L308-330

```typescript
@Cron(CronExpression.EVERY_DAY_AT_3AM)
async cleanupOldNotifications(): Promise<number>
```

| Property | Value |
|----------|-------|
| Schedule | Daily at 3:00 AM server time |
| Criteria | `isRead: true` AND `createdAt < (now - 90 days)` |
| Operation | `prisma.notification.deleteMany(...)` |
| Returns | Count of deleted records |
| Logging | Only logs when `count > 0`: `"Cleaned up N old read notification(s)"` |

**Key design decisions:**
- **Only read notifications are deleted.** Unread notifications are never auto-cleaned, no matter how old.
- **90-day retention.** Matches typical social platform retention for read notifications.
- **3 AM scheduling.** Low-traffic window to minimize DB impact on production workload.

---

## 13. Islamic DND (Prayer Window Notification Queuing)

**File:** `apps/api/src/modules/islamic/islamic-notifications.service.ts` (266 lines)

This is a **separate service** from the notifications module, but directly impacts notification delivery.

### isInPrayerDND(userId) — L25-55

1. Fetch `PrayerNotificationSetting` for user
2. Check `dndDuringPrayer` flag — if `false` or no settings, return `false`
3. Fetch cached prayer times from Redis key `prayer_times:{userId}`
4. Parse cached JSON containing `{ fajr, dhuhr, asr, maghrib, isha }` as `"HH:MM"` strings
5. Compare current time (hours*60 + minutes) against each prayer time
6. If within **15 minutes** of any prayer time → return `true` (user is in DND)

### queueNotificationForAfterPrayer(userId, notification) — L61-68

```typescript
const key = `prayer_queue:${userId}`;
await this.redis.lpush(key, JSON.stringify(notification));
await this.redis.expire(key, 3600); // 1 hour TTL
```

Queues the notification payload in a Redis list. TTL is 1 hour — if not delivered by then, it expires.

**Redis key format:** `prayer_queue:{userId}`
**TTL:** 3600 seconds (1 hour)

### shouldShowPrayFirstNudge(userId) — L76-119

Returns `{ show: boolean, prayerName?: string }` for a gentle "pray first" reminder in the UI. Uses `adhanEnabled` as the opt-in flag. Same 15-minute window logic as `isInPrayerDND`.

### Integration Status

The `IslamicNotificationsService` is built and tested, but the integration with `NotificationsService.create()` is **not wired**. The main notification creation flow does NOT call `isInPrayerDND` before sending. This means:
- Prayer DND checking exists as infrastructure but is not enforced on push notifications
- The queue exists but no cron or trigger delivers queued notifications after prayer ends
- This is a **known gap** — the service is ready for integration

---

## 14. Redis Pub/Sub for Socket Delivery

### Publisher (NotificationsService.create)

**File:** `notifications.service.ts` L259-275

```typescript
this.redis.publish('notification:new', JSON.stringify({
  userId: params.userId,
  notification: {
    id: notification.id,
    type: notification.type,
    actorId: notification.actorId,
    postId: notification.postId,
    threadId: notification.threadId,
    reelId: notification.reelId,
    videoId: notification.videoId,
    commentId: notification.commentId,
    conversationId: notification.conversationId,
    title: params.title,
    body: params.body,
    createdAt: notification.createdAt,
  },
}))
```

**Channel name:** `notification:new`

**Message format (JSON):**
```json
{
  "userId": "recipient-id",
  "notification": {
    "id": "cuid",
    "type": "LIKE",
    "actorId": "actor-id",
    "postId": "post-id | null",
    "threadId": "thread-id | null",
    "reelId": "reel-id | null",
    "videoId": "video-id | null",
    "commentId": "comment-id | null",
    "conversationId": "conversation-id | null",
    "title": "optional title",
    "body": "optional body",
    "createdAt": "ISO datetime"
  }
}
```

### Subscriber (ChatGateway.onModuleInit)

**File:** `apps/api/src/gateways/chat.gateway.ts` L82-101

```typescript
async onModuleInit() {
  const subscriber = this.redis.duplicate();
  await subscriber.subscribe('notification:new');
  subscriber.on('message', (_channel, message) => {
    const { userId, notification } = JSON.parse(message);
    if (userId && notification) {
      this.server.to(`user:${userId}`).emit('new_notification', notification);
    }
  });
}
```

**Key details:**
- Uses `redis.duplicate()` — creates a dedicated Redis connection for pub/sub (required by Redis protocol; a subscribing connection cannot issue other commands)
- Subscribes to `notification:new` channel
- On message: parses JSON, emits to Socket.io room `user:{userId}`
- Socket.io event name: `new_notification`
- Room assignment: users join `user:{userId}` room on connection (L236: `client.join(\`user:${user.id}\`)`)

### Socket Delivery Path
```
NotificationsService.create()
    │
    ├─ redis.publish('notification:new', JSON.stringify({ userId, notification }))
    │
    ▼
Redis Pub/Sub Channel: notification:new
    │
    ▼
ChatGateway subscriber (onModuleInit)
    │
    ├─ JSON.parse(message)
    ├─ server.to(`user:${userId}`).emit('new_notification', notification)
    │
    ▼
Socket.io room: user:{userId}
    │
    ▼
Connected client(s) receive 'new_notification' event
```

### Failure Handling
- Publisher: `.catch()` logs debug on Redis failure (L275) — notification still exists in DB and push still fires
- Subscriber: Try/catch in `onModuleInit` — if subscribe fails, logs warning, real-time socket notifications disabled but push still works
- Message parsing: Try/catch in message handler — malformed messages logged and discarded

---

## 15. Push Service — Expo Push API Integration

**File:** `push.service.ts` (412 lines)

### Transport
- **API:** Expo Push Notification Service (`https://exp.host/--/api/v2/push/send`)
- **Auth:** Optional `EXPO_ACCESS_TOKEN` env var → `Authorization: Bearer {token}` header
- **Batch size:** Max 100 messages per HTTP request
- **Priority:** All messages sent as `"high"` priority
- **Sound:** `"default"` on all push notifications

### sendToUser(userId, notification) — L74-94

1. Fetch active device tokens: `prisma.device.findMany({ where: { userId, isActive: true }, take: 50 })`
2. Fetch unread count for badge: `prisma.notification.count({ where: { userId, isRead: false } })`
3. Build messages array (one per device token)
4. Send via `sendBatch()`

### sendToUsers(userIds, notification) — L97-113

Bulk send to multiple users. Fetches up to 1000 tokens across all provided user IDs. Badge hardcoded to `1` (unlike single-user which fetches actual count).

### sendBatch(messages) — L116-152

Splits messages into chunks of 100, sends each chunk via `fetch()` to Expo API. Returns collected tickets.

### handlePushResponse(batch, tickets) — L155-175

Processes Expo push tickets:
- `DeviceNotRegistered`, `InvalidCredentials`, `MismatchSenderId` → deactivate token
- `MessageTooBig` → log error
- `MessageRateExceeded` → log warning
- Other errors → log warning

### deactivateTokens(tokens) — L178-188

```typescript
prisma.device.updateMany({
  where: { pushToken: { in: tokens } },
  data: { isActive: false },
})
```

Marks invalid tokens as inactive so they won't be selected for future pushes.

### i18n Template Resolution — L221-241

**`getLocalizedTemplate(type, locale, vars)`**

Resolves notification text from `NOTIFICATION_TEMPLATES` constant. Currently supports 3 locales (en, ar, tr) for 6 types:

| Type | Locales |
|------|---------|
| LIKE | en, ar, tr |
| COMMENT | en, ar, tr |
| FOLLOW | en, ar, tr |
| MESSAGE | en, ar, tr |
| MENTION | en, ar, tr |
| PRAYER | en, ar, tr |

Falls back to `'en'` for unsupported locales. Returns `null` for unknown types.

**Variable substitution:** `{{varName}}` → value from `vars` object.

**TODO (L141-147, L12-14):** User model has no `locale` field yet. When added, fetch user locale before constructing push text. Currently all push notifications use hardcoded English strings from builder methods (templates are defined but not yet wired into the trigger pipeline).

---

## 16. Prisma Schema — Notification Model

**File:** `apps/api/prisma/schema.prisma` L1900-1930

```prisma
model Notification {
  id              String           @id @default(cuid())
  userId          String
  actorId         String?
  type            NotificationType
  postId          String?
  commentId       String?
  circleId        String?
  conversationId  String?
  threadId        String?
  reelId          String?
  videoId         String?
  followRequestId String?
  title           String?
  body            String?
  isRead          Boolean          @default(false)
  readAt          DateTime?
  createdAt       DateTime         @default(now())

  // Relations
  user            User             @relation("NotificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  actor           User?            @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)
  post            Post?            @relation(fields: [postId], references: [id], onDelete: Cascade)
  comment         Comment?         @relation(fields: [commentId], references: [id], onDelete: Cascade)
  circle          Circle?          @relation(fields: [circleId], references: [id], onDelete: Cascade)
  conversation    Conversation?    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  thread          Thread?          @relation(fields: [threadId], references: [id], onDelete: Cascade)
  reel            Reel?            @relation(fields: [reelId], references: [id], onDelete: Cascade)
  video           Video?           @relation(fields: [videoId], references: [id], onDelete: Cascade)
  followRequest   FollowRequest?   @relation(fields: [followRequestId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, isRead])
}
```

### NotificationType Enum (22 values)

**File:** `apps/api/prisma/schema.prisma` L147-171

```
LIKE, COMMENT, FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED,
MENTION, REPLY, CIRCLE_INVITE, CIRCLE_JOIN, MESSAGE,
THREAD_REPLY, REPOST, QUOTE_POST, CHANNEL_POST, LIVE_STARTED,
VIDEO_PUBLISHED, REEL_LIKE, REEL_COMMENT, VIDEO_LIKE,
VIDEO_COMMENT, STORY_REPLY, POLL_VOTE, SYSTEM
```

### Device Model (for push tokens)

**File:** `apps/api/prisma/schema.prisma` L2303-2322

```prisma
model Device {
  id           String   @id @default(cuid())
  userId       String
  platform     String
  pushToken    String   @unique
  deviceId     String?
  deviceName   String?
  os           String?
  ipAddress    String?
  location     String?
  lastActiveAt DateTime @default(now())
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId])
  @@index([userId, lastActiveAt(sort: Desc)])
  @@map("devices")
}
```

---

## 17. Test Coverage Summary

| Test File | Test Count | Key Scenarios |
|-----------|-----------|---------------|
| `notifications.controller.spec.ts` | 5 | Filter validation, default params, all endpoints delegate correctly |
| `notifications.service.spec.ts` | 30 | Pagination, cursor, filter logic, markRead ownership, self-skip, per-type prefs (6 types), global notificationsOn, block skip, mute skip, invalid type reject, cleanup cron (5 tests) |
| `push-trigger.service.spec.ts` | 10 | LIKE/COMMENT/FOLLOW/MESSAGE routing, missing notification, null displayName, body truncation, FOLLOW_REQUEST_ACCEPTED |
| `push.service.spec.ts` | 14 | No tokens skip, single/multi device, badge count, custom data, multi-user broadcast, Expo API failure, network error, auth header, localized templates (8 tests) |
| **Total** | **59 tests** | |

---

## 18. Known Issues and Gaps

### Bugs
1. **REEL_LIKE / REEL_COMMENT double-match in switch** — push-trigger.service.ts L30-37 catches REEL_LIKE as LIKE fallthrough, then L158-165 is unreachable. Reel likes get "liked your post" instead of "liked your reel".

### Missing Features
2. **i18n templates defined but not wired** — `NOTIFICATION_TEMPLATES` and `getLocalizedTemplate()` exist but are never called. All push text is hardcoded English from builder methods.
3. **User.locale field does not exist** — prerequisite for push i18n.
4. **Prayer DND not integrated** — `IslamicNotificationsService.isInPrayerDND()` exists but `NotificationsService.create()` never calls it. Prayer queue delivery cron does not exist.
5. **No batch notification aggregation** — "User and 5 others liked your post" grouping not implemented.
6. **emailDigest setting exists but no email digest cron** — `UserSettings.emailDigest` field is in schema but no service sends digest emails.
7. **No notification channel categories for Android** — `channelId` field exists on `ExpoPushMessage` but is never set.
8. **Badge count not updated after mark-read** — silent push to update badge not sent when user reads notifications.

### Performance Considerations
9. **N+1 on create pre-checks** — 4 parallel queries per notification creation (settings, user, block, mute). For bulk notifications (e.g., post to 1000 followers), this means 4000 queries. No batch-create API exists.
10. **Device token limit** — `sendToUser` fetches up to 50 tokens per user, `sendToUsers` up to 1000 total. Adequate for current scale.

---

## 19. Redis Key Reference

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `notif_dedup:{userId}:{type}:{targetId}` | Deduplication lock | 300s (5 min) |
| `notification:new` (pub/sub channel) | Real-time socket delivery | N/A (pub/sub) |
| `prayer_times:{userId}` | Cached prayer times for DND check | Set externally |
| `prayer_queue:{userId}` | Queued notifications during prayer DND | 3600s (1 hour) |
| `presence:{userId}` | User socket presence (set of socketIds) | 300s (5 min, refreshed by heartbeat) |
| `ws:ratelimit:{event}:{userId}` | WebSocket event rate limiting | 60s (varies by event) |

---

## 20. Socket.io Event Reference

| Event | Direction | Room | Payload |
|-------|-----------|------|---------|
| `new_notification` | Server → Client | `user:{userId}` | `{ id, type, actorId, postId, threadId, reelId, videoId, commentId, conversationId, title, body, createdAt }` |

The client joins `user:{userId}` room on WebSocket connection (chat.gateway.ts L236). All notification events for that user are delivered to this room via Redis pub/sub bridge.
