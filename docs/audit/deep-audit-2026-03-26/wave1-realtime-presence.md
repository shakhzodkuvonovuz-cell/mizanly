# Wave 1: Realtime Presence / WebSocket Audit

## Summary
14 findings. 2 HIGH, 7 MEDIUM, 5 LOW. Backend gateway well-structured; client-side is half-wired.

## HIGH

### F1: Online/offline broadcasts ignore user's activityStatus privacy setting
- **File:** chat.gateway.ts:264-272 (connect), 345-353 (disconnect) — unconditional broadcast
- **Contrast:** handleTyping and handleRead DO check activityStatus
- **Failure:** Users who disabled activity visibility still appear online/offline

### F4: `new_notification` events emitted by server but NEVER listened for on mobile
- **Evidence:** Grep for `new_notification` across apps/mobile = zero matches
- **Failure:** Notification badges rely on 60-second polling only

## MEDIUM

### F2: Sender receives own messages; clientId dedup silently broken
- Server strips clientId from DTO. Content-matching fallback works for text but fails for media/identical messages.

### F3: join_content/leave_content have no auth or rate-limit checks
### F5: content:update events never subscribed to on mobile
### F8: messages_read event never listened for on mobile — read receipts dead
### F9: message_delivered event never emitted by mobile — delivery receipts dead
### F11: Risalah tab joins rooms without re-triggering on socket connect (race condition)
### F12: Multiple independent socket connections per user (2-4 connections simultaneously)

## LOW

### F6: Typing indicators have no server-side timeout; risalah list has none at all
### F7: WsSendMessageDto.conversationId uses @IsString() instead of @IsUUID()
### F10: host_changed event not listened for (mitigated by quran_room_update)
### F13: Redis adapter falls back to in-memory silently
### F14: Token refresh race condition during reconnection

## Key Gap
Server emits 4 event types (new_notification, messages_read, delivery trigger, content:update) that mobile NEVER listens for. Read receipts, delivery receipts, real-time notifications all non-functional.
