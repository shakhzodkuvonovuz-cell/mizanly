# Wave 1: Unread Count Integrity Audit

## Summary
8 findings. 1 HIGH, 3 MEDIUM, 2 LOW-MEDIUM, 2 LOW. Real-time notification pipeline only half-wired.

## HIGH

### F1: Client never listens for `new_notification` socket event
- **File:** `saf.tsx:335` (polling only), `chat.gateway.ts:100` (server emits)
- **Evidence:** Grep for `new_notification` across apps/mobile = zero matches
- **Failure:** Notification badge relies on 60-second polling. Up to 60s delay.
- **Systemic:** Server-side event exists but client never subscribes

## MEDIUM

### F2: Socket `read` event never emitted from conversation screen
- **File:** `conversation/[id].tsx:1038` uses REST markRead only
- **Evidence:** chat.gateway.ts:491 has handleRead handler, but client never emits `read`
- **Failure:** Read receipts (double-check marks) are dead code. Never appear in real-time.

### F3: Single notification read does NOT decrement badge count
- **File:** `notifications.tsx:213-215` — calls markRead but NOT setUnread
- **Failure:** Badge shows old count until next 60s poll

### F6: Message badge stale when Risalah tab is unmounted
- **Evidence:** Socket connection lifecycle tied to tab mount/unmount. No polling mechanism for conversations.
- **Failure:** User on Saf tab receives 3 messages. Risalah badge doesn't update until tab is opened.

## LOW-MEDIUM

### F4: Deleting unread notification doesn't update count
### F7: Notification batching re-marks read notifications as unread (phantom badge)

## LOW

### F5: No floor constraint on ConversationMember.unreadCount (negative possible with future code)
### F8: Unread notification count unbounded — cleanup cron only deletes READ notifications
