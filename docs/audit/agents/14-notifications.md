# Agent #14 — Notification System Deep Audit

**Scope:** `apps/api/src/modules/notifications/`, `apps/api/src/modules/devices/`, notification-related code across all modules, mobile notification screen
**Files audited:** 15 files, every line read
**Date:** 2026-03-21
**Total findings:** 31

---

## CRITICAL (8 findings)

### C-01: Per-type notification settings are COMPLETELY IGNORED (dead code)
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (lines 97-134)
**File:** `apps/api/src/modules/notifications/push-trigger.service.ts` (entire file)
**Category:** Dead Feature / Privacy Violation

The `Settings` model has per-type notification toggles (`notifyLikes`, `notifyComments`, `notifyFollows`, `notifyMentions`, `notifyMessages`, `notifyLiveStreams`) that users can set from the mobile Settings screen (settings.tsx lines 425-458). These settings are stored in the database via `settingsApi.updateNotifications`.

However, **neither `NotificationsService.create()` nor `PushTriggerService.triggerPush()` ever queries the Settings table**. Notifications are always created in the database and push is always sent regardless of user preference.

This means:
- A user who disables "Likes" notifications will still receive every like notification
- A user who disables "Messages" notifications will still get message push notifications
- The toggle UI is a placebo that does nothing

**Impact:** Users cannot control their notifications. This is a privacy/UX violation and could cause notification fatigue leading to app uninstalls.

```typescript
// notifications.service.ts:97-134 — create() never checks settings
async create(params: { userId: string; ... }) {
    if (params.userId === params.actorId) return null;
    // NO settings check here — should query Settings for notifyLikes/etc
    const notification = await this.prisma.notification.create({ ... });
    this.pushTrigger.triggerPush(notification.id).catch(...);
    return notification;
}
```

---

### C-02: 8 of 22 notification types are NEVER fired from any service
**Files:** All service files across `apps/api/src/modules/`
**Category:** Dead Code / Missing Functionality

The `NotificationType` enum has 22 values. The `PushTriggerService` has switch cases for all 22. But only 14 are actually created by any service:

| Type | Fired by | Status |
|------|----------|--------|
| `LIKE` | posts, threads, reels (reusing generic LIKE) | ACTIVE |
| `COMMENT` | posts, reels (reusing generic COMMENT) | ACTIVE |
| `FOLLOW` | follows, channels (reuses for subscriptions) | ACTIVE |
| `FOLLOW_REQUEST` | follows | ACTIVE |
| `FOLLOW_REQUEST_ACCEPTED` | follows | ACTIVE |
| `MENTION` | posts, threads, reels | ACTIVE |
| `REPLY` | posts (comment replies) | ACTIVE |
| `THREAD_REPLY` | threads | ACTIVE |
| `REPOST` | threads | ACTIVE |
| `VIDEO_LIKE` | videos | ACTIVE |
| `VIDEO_COMMENT` | videos | ACTIVE |
| **`CIRCLE_INVITE`** | **NOBODY** | **DEAD** |
| **`CIRCLE_JOIN`** | **NOBODY** | **DEAD** |
| **`MESSAGE`** | **NOBODY** | **DEAD** |
| **`CHANNEL_POST`** | **NOBODY** | **DEAD** |
| **`LIVE_STARTED`** | **NOBODY** | **DEAD** |
| **`VIDEO_PUBLISHED`** | **NOBODY** | **DEAD** |
| **`REEL_LIKE`** | **NOBODY** | **DEAD** |
| **`REEL_COMMENT`** | **NOBODY** | **DEAD** |
| **`STORY_REPLY`** | **NOBODY** | **DEAD** |
| **`POLL_VOTE`** | **NOBODY** | **DEAD** |
| **`QUOTE_POST`** | **NOBODY** | **DEAD** |
| **`SYSTEM`** | **NOBODY** | **DEAD** |

Key observations:
- **MESSAGE**: The messaging service (messages.service.ts) and chat gateway never create notification records. Users get NO push notification for new messages when offline.
- **CIRCLE_INVITE/CIRCLE_JOIN**: The circles service never calls `notifications.create`.
- **REEL_LIKE/REEL_COMMENT**: Reels service uses generic `LIKE`/`COMMENT` types instead of the dedicated types, so the push trigger's `REEL_LIKE`/`REEL_COMMENT` cases never execute.
- **STORY_REPLY**: Stories service creates a message with `MessageType.STORY_REPLY` but never creates a Notification record.
- **LIVE_STARTED/VIDEO_PUBLISHED**: Live and video services never notify followers.
- **POLL_VOTE/QUOTE_POST**: No service creates these.

---

### C-03: ZERO real-time socket delivery for notifications
**File:** `apps/api/src/gateways/chat.gateway.ts` (entire file)
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (lines 97-134)
**Category:** Missing Feature

The chat gateway handles messaging events (`new_message`, `user_typing`, `delivery_receipt`) but has **NO notification events**. When a notification is created:
1. It's saved to the database
2. Push notification is sent via Expo

There is NO `socket.emit('new_notification', ...)` anywhere in the codebase. This means:
- Users with the app open don't see new notifications until they manually refresh
- The unread count badge on the bell icon doesn't update in real-time
- The Zustand store's `unreadNotifications` counter is only set when the screen refreshes

Every modern social app delivers notifications via WebSocket for instant in-app display.

---

### C-04: Push token hijacking — any authenticated user can register any token
**File:** `apps/api/src/modules/devices/devices.controller.ts` (lines 23-30)
**File:** `apps/api/src/modules/devices/devices.service.ts` (lines 10-17)
**Category:** Security

The device registration endpoint accepts any `pushToken` string without validation:

```typescript
class RegisterDeviceDto {
  @IsString() @IsNotEmpty() pushToken: string;  // No format validation
  @IsString() @IsNotEmpty() platform: string;   // No whitelist validation
  @IsString() @IsOptional() deviceId?: string;
}
```

The `register` method uses `upsert` with `where: { pushToken }`, meaning:
1. User A registers their legitimate token `ExponentPushToken[abc123]`
2. User B calls the same endpoint with User A's token
3. The upsert **updates** the existing record, changing `userId` to User B
4. User A stops receiving push notifications
5. User B receives User A's push notifications

This is a push token theft vulnerability. Expo push tokens are not secret (they can be observed on the network).

**Fix needed:** Validate token format with `@Matches(/^ExponentPushToken\[.+\]$/)` and prevent re-assignment of tokens already owned by another active user.

---

### C-05: Notification spam — no deduplication or rate limiting on creation
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (lines 97-134)
**File:** `apps/api/prisma/schema.prisma` (lines 1387-1419)
**Category:** Spam / Abuse

There is:
- No `@@unique` constraint on any combination of notification fields
- No deduplication check before creating a notification
- No rate limit on notification creation (only on the controller endpoints, not on the `create()` method called internally)

Scenarios:
1. **Like spam:** User rapidly likes/unlikes/likes a post → each like creates a new notification (the like may have a unique constraint on PostReaction, but unlike+re-like creates a new reaction each time)
2. **Mention flooding:** A user who creates many posts mentioning the same person generates unbounded notifications
3. **Follow/unfollow cycling:** Follow → notification created. Unfollow. Follow → another notification. No dedup.

The Notification model has no way to collapse or deduplicate. Over time, active users will accumulate thousands of notification rows with no cleanup mechanism.

---

### C-06: `notificationsOn: false` on User model is never checked
**File:** `apps/api/prisma/schema.prisma` (line 256)
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (lines 97-134)
**Category:** Dead Feature

The User model has `notificationsOn Boolean @default(true)` but this field is ONLY set to `false` during account deletion (privacy.service.ts line 78). It is never checked when creating notifications or sending push. Even if a user could set this to `false`, they would still receive all notifications.

---

### C-07: Reel notifications use wrong types — REEL_LIKE/REEL_COMMENT never match
**File:** `apps/api/src/modules/reels/reels.service.ts` (lines 419, 496)
**File:** `apps/api/src/modules/notifications/push-trigger.service.ts` (lines 156-170)
**Category:** Logic Bug

Reels service creates notifications with `type: 'LIKE'` and `type: 'COMMENT'`, passing `reelId` as a field. But the `PushTriggerService` switch statement handles:
- `NotificationType.LIKE` case checks `notification.postId` — so reel likes with no `postId` will silently skip the push (the `if (notification.postId)` guard fails)
- `NotificationType.REEL_LIKE` case checks `notification.reelId` — but this type is never created

Result: **Reel like notifications are saved to the database but push notifications are never sent** because the LIKE case requires `postId` and reel notifications only have `reelId`.

Similarly for reel comments: the COMMENT case requires `postId`.

```typescript
// push-trigger.service.ts:30-37
case NotificationType.LIKE:
    if (notification.postId) {    // ← fails for reel likes (reelId only, no postId)
        await this.sendSafe(...)
    }
    break;
```

---

### C-08: No Expo access token — push delivery will fail in production
**File:** `apps/api/src/modules/notifications/push.service.ts` (lines 82-90)
**Category:** Missing Configuration

The Expo push API request does not include an `expo-access-token` header:

```typescript
const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Missing: 'expo-access-token': process.env.EXPO_ACCESS_TOKEN
    },
    body: JSON.stringify(batch),
});
```

While Expo allows unauthenticated push requests in development, production apps should use the access token to:
- Prevent unauthorized use of push tokens
- Enable enhanced push security mode
- Get higher rate limits

No `EXPO_ACCESS_TOKEN` env var exists in the codebase.

---

## MODERATE (14 findings)

### M-01: DevicesService injected but never used in NotificationsService
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (lines 14-15)
**Category:** Dead Code

`DevicesService` is imported and injected into `NotificationsService` constructor but `this.devices` is never called anywhere in the class. The `PushService` has its own duplicate token-fetching methods.

---

### M-02: Duplicate token-fetching logic between PushService and DevicesService
**File:** `apps/api/src/modules/notifications/push.service.ts` (lines 139-156)
**File:** `apps/api/src/modules/devices/devices.service.ts` (lines 26-42)
**Category:** Code Duplication

Both services have identical `getActiveTokensForUser` and `getActiveTokensForUsers` methods that query `prisma.device.findMany` with the same parameters. `PushService` should delegate to `DevicesService` instead of duplicating.

---

### M-03: EXPO_PUSH_URL declared twice, used in wrong file
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (line 7)
**File:** `apps/api/src/modules/notifications/push.service.ts` (line 5)
**Category:** Dead Code

`EXPO_PUSH_URL` is declared in both files but only used in `push.service.ts`. The constant in `notifications.service.ts` is dead code.

---

### M-04: `sendToUsers` does not include badge count
**File:** `apps/api/src/modules/notifications/push.service.ts` (lines 57-72)
**Category:** Inconsistency

`sendToUser` fetches the unread count for the badge (line 42), but `sendToUsers` does not. Multi-user push notifications will have no badge count, causing incorrect badge display on iOS.

---

### M-05: Push notification data types are wrong for multiple builders
**File:** `apps/api/src/modules/notifications/push.service.ts` (lines 211-279)
**Category:** Data Integrity

Multiple `build*Notification` methods set incorrect `data.type` values:
- `buildRepostNotification` → `data: { type: 'like' }` (should be `'repost'`)
- `buildQuotePostNotification` → `data: { type: 'like' }` (should be `'quote_post'`)
- `buildVideoPublishedNotification` → `data: { type: 'like' }` (should be `'video_published'`)
- `buildChannelPostNotification` → `data: { type: 'like' }` (should be `'channel_post'`)
- `buildPollVoteNotification` → `data: { type: 'like' }` (should be `'poll_vote'`)

This means the mobile app cannot distinguish these notification types when navigating on tap. All these would route to a "like" destination.

---

### M-06: `getActiveTokensForUsers` take:50 silently drops tokens for multi-user broadcasts
**File:** `apps/api/src/modules/notifications/push.service.ts` (lines 149-155)
**File:** `apps/api/src/modules/devices/devices.service.ts` (lines 35-41)
**Category:** Silent Data Loss

When sending push to multiple users (e.g., broadcasting to 100 channel subscribers), `getActiveTokensForUsers` has `take: 50`. If 100 users have 1 device each, only the first 50 get the push. The rest are silently dropped.

For `getActiveTokensForUser`, `take: 50` is reasonable (one user won't have 50 devices). But for multi-user queries, 50 is far too low.

---

### M-07: No notification cleanup/retention policy
**File:** `apps/api/prisma/schema.prisma` (lines 1387-1419)
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (entire file)
**Category:** Scalability

There is no mechanism to:
- Delete old notifications (no TTL, no cleanup job)
- Cap notifications per user (no limit)
- Archive read notifications after N days

With millions of users and 10-50 notifications per day, the `notifications` table will grow without bound. The index on `[userId, createdAt]` will help reads, but storage will balloon.

---

### M-08: `notifyLiveStreams` exists in Settings/DTO but no matching toggle in mobile UI
**File:** `apps/api/src/modules/settings/dto/update-notifications.dto.ts` (line 16)
**File:** `apps/api/prisma/schema.prisma` (line 1993)
**File:** `apps/mobile/app/(screens)/settings.tsx` (lines 417-465)
**Category:** Incomplete Feature

The backend has a `notifyLiveStreams` boolean field in the Settings model and the DTO accepts it. But the mobile Settings screen only shows toggles for: Likes, Comments, New Followers, Mentions, Messages. There is no "Live Streams" toggle.

Additionally, `emailDigest` exists in the DTO but has no mobile toggle either.

---

### M-09: `unread-counts` endpoint referenced in mobile but doesn't exist in backend
**File:** `apps/mobile/src/services/api.ts` (line 636)
**File:** `apps/api/src/modules/notifications/notifications.controller.ts` (entire file)
**Category:** Missing Endpoint

The mobile API service calls:
```typescript
getUnreadCounts: () => api.get<Record<string, number>>('/notifications/unread-counts'),
```

But the controller only has:
```typescript
@Get('unread')
getUnreadCount(@CurrentUser('id') userId: string) { ... }
```

There is no `unread-counts` (plural) endpoint. The mobile call will always 404.

---

### M-10: Mobile notification screen missing labels for 6 notification types
**File:** `apps/mobile/app/(screens)/notifications.tsx` (lines 34-52, 54-68)
**Category:** Incomplete UI

The `notificationLabel` and `notificationIcon` functions handle: LIKE, COMMENT, FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED, MENTION, REPLY, REPOST, QUOTE_POST, THREAD_REPLY, CIRCLE_INVITE, CIRCLE_JOIN, MESSAGE, CHANNEL_POST, LIVE_STARTED.

Missing from the label function: VIDEO_PUBLISHED, REEL_LIKE, REEL_COMMENT, VIDEO_LIKE, VIDEO_COMMENT, STORY_REPLY, POLL_VOTE, SYSTEM. These will all show "interacted with you" as a generic fallback.

Missing from the icon function: MESSAGE, CHANNEL_POST, LIVE_STARTED, CIRCLE_INVITE, CIRCLE_JOIN, and all the ones above. These will show a generic bell icon.

---

### M-11: Notification-tones screen is cosmetic only
**File:** `apps/mobile/app/(screens)/notification-tones.tsx` (entire file)
**Category:** Stub Feature

The notification-tones screen:
- Stores selected tone in AsyncStorage locally (line 93)
- Has no audio files (line 82: "Audio files not yet available")
- Has no backend integration
- The selected tone is never read by the push notification handler

The preview button triggers a visual-only 1500ms indicator but plays no sound.

---

### M-12: No notification grouping/collapsing server-side
**File:** `apps/api/src/modules/notifications/notifications.service.ts`
**Category:** UX / Performance

The mobile app does client-side like aggregation (notifications.tsx `aggregateLikes` function), but only for consecutive LIKE notifications with the same `postId`. The server sends every notification individually.

This means:
- If 100 people like a post, 100 notification rows are created
- 100 push notifications are sent
- The mobile client tries to aggregate on display, but only consecutive ones

Instagram, Twitter, etc. aggregate server-side: "John and 99 others liked your post" — one notification, one push.

---

### M-13: Platform field on RegisterDeviceDto has no validation/whitelist
**File:** `apps/api/src/modules/devices/devices.controller.ts` (line 11)
**Category:** Data Quality

```typescript
@IsString() @IsNotEmpty() platform: string;
```

The `platform` field accepts any string. It should be validated against a whitelist like `@IsIn(['ios', 'android', 'web'])` to prevent garbage data in the devices table.

---

### M-14: `staleTokens` cleanup only deletes inactive tokens, never prunes truly stale active ones
**File:** `apps/api/src/modules/devices/devices.service.ts` (lines 109-130)
**Category:** Data Hygiene

`cleanupStaleTokens` only deletes devices where `isActive: false` AND `updatedAt < cutoff`. But a device can be `isActive: true` with a token that expired long ago (e.g., user reinstalled the app, getting a new token, but the old one was never deactivated).

The only way old active tokens get deactivated is when Expo returns `DeviceNotRegistered` — but that only happens when a push is actually attempted. If no notifications are sent, stale active tokens accumulate indefinitely.

---

## MINOR (9 findings)

### m-01: Notification model has `circleId` field that is never populated
**File:** `apps/api/prisma/schema.prisma` (line 1394)
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (lines 98-110)
**Category:** Dead Field

The Notification model has a `circleId` FK field, but the `create()` method doesn't accept `circleId` as a parameter. Even if `CIRCLE_INVITE`/`CIRCLE_JOIN` notifications were fired, the `circleId` could never be set through the service.

---

### m-02: `expoPushToken` on User model is redundant with Device table
**File:** `apps/api/prisma/schema.prisma` (line 255)
**Category:** Schema Debt

The User model has `expoPushToken String?` which appears to be a legacy field from before the Device table was created. All push token logic now uses the `Device` model. This field is only set to `null` during account deletion and is never used for actual push delivery.

---

### m-03: `filter` query param has no validation on the controller
**File:** `apps/api/src/modules/notifications/notifications.controller.ts` (line 31)
**Category:** Input Validation

```typescript
@Query('filter') filter?: 'all' | 'mentions' | 'verified',
```

TypeScript union types are not enforced at runtime. Any string value passes through (e.g., `?filter=malicious`). The service handles unknown values by not applying any filter (equivalent to 'all'), so it's not exploitable, but it should use `@IsIn(['all', 'mentions', 'verified'])` with a DTO.

---

### m-04: `limit` parameter in `getNotifications` not exposed via controller
**File:** `apps/api/src/modules/notifications/notifications.service.ts` (line 22)
**File:** `apps/api/src/modules/notifications/notifications.controller.ts` (lines 28-33)
**Category:** Missing Feature

The service accepts a `limit` parameter (default 30), but the controller doesn't expose it as a query param. Clients are locked to 30 notifications per page with no way to customize.

---

### m-05: PushTriggerService test doesn't mock all push builder methods
**File:** `apps/api/src/modules/notifications/push-trigger.service.spec.ts` (lines 26-32)
**Category:** Test Coverage

The test mock for PushService only includes: `buildLikeNotification`, `buildCommentNotification`, `buildFollowNotification`, `buildMessageNotification`, `buildMentionNotification`, `buildReplyNotification`. But `PushService` has 20 builder methods. Tests for REPOST, QUOTE_POST, REEL_LIKE, etc. would fail with "not a function" if they ran those paths.

---

### m-06: No notification for tips, gifts, or commerce events
**File:** All commerce/gifts modules
**Category:** Missing Feature

`PushService` has `buildTipNotification` and `buildEventNotification` builder methods (lines 315-329), but no service ever creates TIP or EVENT type notifications. Similarly, gifts, purchases, and order updates generate no notifications.

---

### m-07: `handlePushResponse` doesn't handle `MismatchSenderId` error
**File:** `apps/api/src/modules/notifications/push.service.ts` (lines 108-123)
**Category:** Incomplete Error Handling

The response handler checks for `DeviceNotRegistered` and `InvalidCredentials` but not `MismatchSenderId` or `MessageTooBig` or `MessageRateExceeded`. These are valid Expo error types that should be handled (at minimum logged differently from generic errors).

---

### m-08: Notification-tones screen has duplicate type in ToneOption interface
**File:** `apps/mobile/app/(screens)/notification-tones.tsx` (line 27)
**Category:** Type Bug (minor)

```typescript
interface ToneOption {
  id: string;
  labelKey: string;
  icon: 'bell' | 'volume-x' | 'volume-x';  // 'volume-x' listed twice
}
```

---

### m-09: Settings screen uses `user-plus` icon name not in the Icon component's valid names list
**File:** `apps/mobile/app/(screens)/settings.tsx` (line 441)
**Category:** Potential Runtime Warning

```typescript
icon={<Icon name="user-plus" size="sm" color={colors.gold} />}
```

Per CLAUDE.md, the valid Icon names include `user` and `users` but NOT `user-plus`. This may render a fallback or empty icon depending on the Icon component's error handling.

---

## SUMMARY TABLE

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 8 | Per-type settings ignored, 8 notification types dead, no socket delivery, push token hijacking, no dedup |
| Moderate | 14 | Duplicate code, wrong push data types, missing endpoint, incomplete UI, no cleanup |
| Minor | 9 | Dead fields, type bugs, test coverage gaps, missing commerce notifications |
| **Total** | **31** | |

## TOP 5 FIX PRIORITIES

1. **C-01 + C-06:** Check `Settings.notifyLikes/Comments/etc` in `NotificationsService.create()` before writing to DB and triggering push
2. **C-02:** Wire `notifications.create()` calls in circles, stories, live, messages, polls, and broadcast services for all 8 dead types
3. **C-07:** Fix reel notifications to use `REEL_LIKE`/`REEL_COMMENT` types OR update `PushTriggerService.LIKE`/`COMMENT` cases to also check `reelId`
4. **C-03:** Add `socket.emit('new_notification', ...)` in `NotificationsService.create()` via the gateway server for real-time in-app delivery
5. **C-04:** Validate push token format and prevent token reassignment across users in `DevicesService.register()`
