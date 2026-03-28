# Wave 1: Notification Ownership & Duplication Audit

## Summary
9 findings. 1 HIGH, 3 MEDIUM, 5 LOW. Core NotificationsService is well-designed but has bypass paths and wrong types.

## HIGH

### F1: 6 call sites bypass NotificationsService — no push, no settings, no block/mute
- **Files:**
  - `islamic.service.ts:605` — Khatm celebration
  - `islamic.service.ts:1965` — Verse of the Day (1000 sequential creates!)
  - `islamic.service.ts:2024` — Islamic event notifications (createMany batch)
  - `admin.service.ts:180` — WARNING notification
  - `reports.service.ts:297` — WARNING notification
  - `users.service.ts:880` — Screen time digest (createMany batch)
- **Evidence:** Direct `prisma.notification.create` bypasses: self-notification guard, settings check, block/mute check, dedup, push delivery, socket delivery
- **Failure:** Users never get push notifications for these. Block/mute not respected. No real-time socket delivery.
- **Systemic:** 6 call sites across 4 services

## MEDIUM

### F2: Reel LIKE uses type 'LIKE' instead of 'REEL_LIKE' — no push sent
- **File:** `reels.service.ts:589`
- **Evidence:** PushTriggerService routes 'LIKE' to `buildLikeNotification` which checks `notification.postId`. Since reel has `reelId`, push condition fails.
- **Failure:** Zero push notifications for reel likes. Dedup collision with post likes.

### F3: Reel COMMENT uses type 'COMMENT' instead of 'REEL_COMMENT' — no push sent
- **File:** `reels.service.ts:688`
- **Failure:** Zero push notifications for reel comments. Same routing bug as F2.

### F4: bulk-push sends push WITHOUT creating notification record
- **File:** `notification.processor.ts:84-87`
- **Failure:** Ghost push — user taps notification, opens app, nothing in notification list.

## LOW

### F5-F8: Self-notification pattern makes system notifications dead code
- Scheduled post publish (`posts.service.ts:109`), content removal (`posts.service.ts:1692`, `reels.service.ts:1175`), reel ready (`reels.service.ts:237,250`) all pass `userId === actorId`, which the self-notification guard correctly suppresses.
- **Root cause:** System-originated notifications need a system actorId or `skipSelfCheck` flag.

### F9: Verse of Day creates 1000 notifications sequentially (performance)
- **File:** `islamic.service.ts:1964-1972`
- Correct pattern exists nearby (Islamic events uses `createMany` in batches of 500)

## Architecture Assessment
Core NotificationsService is sound: proper self-notif guard, settings check, block/mute, Redis dedup (5min TTL), batching, push delivery, socket delivery. Problems are bypass paths and wrong notification types.
