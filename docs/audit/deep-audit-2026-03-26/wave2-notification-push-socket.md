# Wave 2 Seam: Notification → Push → Socket Complete Delivery Matrix

## Summary
45 notification events traced end-to-end. 4 push-broken (wrong type), 1 dead code (self-notif), 6 direct-Prisma bypasses, 8 events with ZERO notification, 3 socket events mobile never listens for. Messages have NO push notification at all.

## P0 — Push Completely Broken for Specific Types

### 1-2. Reel like/comment use wrong notification type → push silently skipped
- `reels.service.ts:589` sends `type: 'LIKE'` (should be `REEL_LIKE`)
- `reels.service.ts:688` sends `type: 'COMMENT'` (should be `REEL_COMMENT`)
- PushTrigger routes LIKE/COMMENT by checking `notification.postId` which is null for reels → push skipped

### 3-4. Thread like/repost → push silently skipped
- `threads.service.ts:582` sends `type: 'LIKE'` → PushTrigger checks `postId` (null for threads) → skipped
- `threads.service.ts:648` sends `type: 'REPOST'` → same `postId` guard → skipped

### 5. Reel ready notification is dead code (self-notification)
- `reels.service.ts:237` passes `userId === actorId` → NS.create returns null

## P0 — No Push/Socket for Critical Events

### 6. Messages have NO push notification
- messages.service.ts imports PushTriggerService but NEVER calls it
- Offline users get zero notification of new messages

### 7. Story reply creates NO notification
- Only creates a DM message. STORY_REPLY type exists in enum + PushTrigger has a case. Nobody creates it.

### 8. Tips/gifts create NO notification
- Payment webhook credits diamonds but sends zero notification. `buildTipNotification()` exists but is never called.

## P1 — 6 Direct Prisma Bypasses (no push, no socket, no settings)
| Service | Line | Event | Impact |
|---------|------|-------|--------|
| admin.service.ts | 180 | Admin warning | No push, no settings check |
| reports.service.ts | 297 | Report warning | No push, no settings check |
| islamic.service.ts | 605 | Khatm celebration | No push |
| islamic.service.ts | 1965 | Verse of the day (1000 rows) | No push |
| islamic.service.ts | 2024 | Islamic event reminders (batch) | No push |
| users.service.ts | 880 | Screen time digest (batch) | No push |

## P1 — Events with ZERO Notification
| Event | Expected Notification | Reality |
|-------|----------------------|---------|
| Post share | "X shared your post" | None |
| Post save | "X saved your post" | None |
| Broadcast message | "New broadcast from X" | None |
| Scheduled post published | "Your post is live" | None |
| Content removed by moderation | "Your content was removed" | None |
| Gift received | "X sent you a gift" | None |
| Tip received | "X tipped you" | None |
| Reel ready | "Your reel is ready" | Dead code (self-notif guard) |

## P1 — Mobile Socket Gaps
| Server Event | Emitted? | Mobile Listens? | Impact |
|-------------|----------|-----------------|--------|
| `new_notification` | YES (gateway:100) | **NO** | Real-time notification badges never update |
| `messages_read` | YES (gateway:500) | **NO** | Read receipts never shown |
| `delivery_receipt` | **NO** (server never emits) | YES (conversation:1004) | Delivery receipts completely broken |

## Correctly Working (22 events)
Post like/comment/reply/mention, reel mention/tag, thread reply/mention, video like/comment, follow/follow-request/accepted, circle invite, mentorship request, fatwa answered, event RSVP, challenge joined/completed, order received/status, story mention — all go through NotificationsService correctly with proper push delivery. **But mobile never listens for `new_notification` socket event, so real-time display is broken for ALL of them.**

## Root Cause
1. PushTriggerService routes by checking content-specific FK fields (postId, reelId, threadId) but notification creators use generic types (LIKE, COMMENT) that default to postId routing
2. System/self notifications pass userId === actorId, hitting the self-notification guard
3. Messages service injects PushTriggerService but has a TODO to actually use it
4. Mobile socket client subscribes to 3 events (new_message, user_typing, delivery_receipt) but server emits different event names for 2 of them
