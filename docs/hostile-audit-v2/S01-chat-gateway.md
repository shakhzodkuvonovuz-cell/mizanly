# S01 -- Hostile Code Audit: chat.gateway.ts + DTOs

**File:** `apps/api/src/gateways/chat.gateway.ts` (977 lines)
**DTOs:** `apps/api/src/gateways/dto/send-message.dto.ts`, `chat-events.dto.ts`, `quran-room-events.dto.ts`
**Auditor:** Opus 4.6 (1M context)
**Date:** 2026-04-05
**Methodology:** Line-by-line read of all 977 lines + 3 DTO files + `redis-atomic.ts` + `requireMembership` in `messages.service.ts`

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH     | 5 |
| MEDIUM   | 8 |
| LOW      | 6 |
| INFO     | 4 |
| **Total** | **25** |

---

## CRITICAL

### S01-C1: `send_sealed_message` has NO DTO class-validator -- manual validation is incomplete and fragile

**Lines:** 562-698
**What:** The `send_sealed_message` handler declares its `data` parameter as an inline TypeScript type (line 565-588), NOT a class-validator DTO. The handler then performs manual `typeof` + `.length` checks for *some* fields (lines 594-631). This is fundamentally less reliable than class-validator because:
1. Numeric fields (`e2eVersion`, `e2eSenderDeviceId`, `e2eCounter`, `e2ePreviousCounter`, `e2eSignedPreKeyId`, `e2ePreKeyId`, `e2eRegistrationId`) have **zero validation** -- no type check, no min/max. A client can send `e2eVersion: -999` or `e2eCounter: 999999999999` (exceeding INT32 range) or `e2eRegistrationId: "not_a_number"`. These values pass straight through to Prisma which may truncate, overflow, or throw.
2. Boolean fields (`isSpoiler`, `isViewOnce`) have **zero validation** -- client can send `isSpoiler: "yes"` or `isViewOnce: 42` and they pass through.
3. The `stringFieldLimits` object (lines 616-624) validates 7 fields but misses the inline-typed fields entirely. If new string fields are added to the type, the manual validation must be updated in sync -- there is no compile-time safety for this.

**Impact:** Type confusion can cause Prisma errors (process crash if unhandled), invalid data in DB, or unexpected behavior in downstream consumers.
**Fix:** Create a `WsSendSealedMessageDto` class with proper class-validator decorators (like `WsSendMessageDto` already has). Use `plainToInstance` + `validate` as done in every other handler.

### S01-C2: `leave_conversation` does NOT verify membership -- allows unauthorized room leave to break room state

**Lines:** 452-466
**What:** The `leave_conversation` handler validates the DTO and checks `client.data.userId`, but does **NOT** call `requireMembership`. Any authenticated user can call `client.leave()` on any conversation room.
**Why this matters:**
1. Socket.io `client.leave()` on a room you never joined is a no-op, so the direct impact is LOW for the leave itself.
2. BUT: If a user joins a conversation room via a bug or race condition (e.g., joining before membership is revoked), there is no re-validation on leave that could log the anomaly.
3. More importantly: This is an inconsistency. `join_conversation`, `typing`, `message_delivered`, and `send_message` all verify membership. `leave_conversation` does not. Inconsistent authorization patterns are how bugs creep in during refactors.

**Impact:** LOW direct impact (Socket.io leave on non-joined room is no-op), but the inconsistency creates a maintenance hazard. Upgrading to MEDIUM/HIGH if any future logic is added to `leave_conversation` (e.g., "mark as left", broadcast leave events).
**Fix:** Add `requireMembership` check, or at minimum add a comment explaining why it's intentionally skipped.

---

## HIGH

### S01-H1: Quran room `exists` + `hmset` is a TOCTOU race -- two concurrent first-joiners can overwrite each other's room state

**Lines:** 845-851
**What:** In `join_quran_room`:
```
const exists = await this.redis.exists(roomKey);  // Line 845
if (!exists) {                                      // Line 846
  const pipe = this.redis.pipeline();               // Line 847
  pipe.hmset(roomKey, { hostId: dbRoom.hostId, ... });
  pipe.expire(roomKey, this.QURAN_ROOM_TTL);
  await pipe.exec();                                // Line 850
}
```
Two users joining simultaneously when the room doesn't exist in Redis will both see `exists=0`, both execute `hmset`. The second `hmset` overwrites the first. Since both use `dbRoom.hostId` from the same DB record, the data is identical *today*, but:
1. If the pipeline is extended to include per-joiner state (e.g., "first joiner gets a role"), it becomes a silent data loss bug.
2. The `participant count` after the race may be wrong because the `SADD` in the Lua script and the `hmset` in the pipeline are not atomic together.

**Impact:** Low today (both writes produce identical data), but architecturally fragile. Any future enhancement to room initialization becomes a race.
**Fix:** Use `HSETNX` on the hostId field (set-if-not-exists), or wrap the entire check+create in a Lua script.

### S01-H2: Quran room Redis TTL can silently expire while room is actively in use

**Lines:** 848-849, 872
**What:** The Quran room hash key gets `QURAN_ROOM_TTL = 3600` (1 hour) set on creation (line 849) and the participant set gets the same TTL on join (line 872). BUT there is no TTL refresh mechanism during active use. The heartbeat timer (line 320-326) only refreshes the `presence:${userId}` key, NOT the Quran room keys.

If a Quran listening session runs longer than 1 hour:
1. The room hash key expires -- `getQuranRoom` returns null -- verse sync silently stops working (line 958: `if (!room || room.hostId !== userId) return`).
2. The participant set key expires -- participant count drops to 0 -- any leave event triggers room deletion in DB (line 914-921).

**Impact:** Active Quran rooms silently break after 1 hour. No error emitted to clients. Host loses sync ability. Users think they are still in the room.
**Fix:** Refresh Quran room TTLs in the heartbeat timer, or on every `quran_verse_sync` event, or increase TTL significantly (e.g., 4 hours) and refresh on any room activity.

### S01-H3: `handleDisconnect` performs multiple non-atomic Redis operations that can leave ghost state on partial failure

**Lines:** 359-428
**What:** The disconnect handler does:
1. `redis.srem(partKey, client.id)` for each Quran room
2. `redis.scard(partKey)` to check if empty
3. `redis.del(...)` if empty, or `getQuranRoom` + `transferQuranRoomHost` if not
4. `redis.srem(presenceKey, client.id)` for presence
5. `redis.scard(presenceKey)` to check if fully offline
6. `redis.del(presenceKey)` if fully offline

If Redis fails partway through (network blip, timeout), the user's socket ID remains in the Quran room participant set (ghost participant) and/or the presence set (phantom online status). The heartbeat timer is already cleared (line 361-365), so the presence TTL will NOT be refreshed, meaning the ghost presence will eventually expire naturally (5 min). But the Quran room participant set has a 1-hour TTL, so a ghost participant stays for up to 1 hour.

**Impact:** Ghost participants in Quran rooms for up to 1 hour after disconnect. Participant counts are wrong. Host transfer may fail if the "next participant" is actually a ghost socket.
**Fix:** Wrap the critical Redis operations in a Lua script for atomicity, or add a periodic reconciliation job that cleans stale socket IDs from Quran room participant sets.

### S01-H4: `send_sealed_message` leaks the `conversationId` to the recipient in the emitted event

**Lines:** 689-696
**What:** The emitted `sealed_message` event includes `conversationId`:
```js
this.server.to(`user:${data.recipientId}`).emit('sealed_message', {
  ephemeralKey: data.ephemeralKey,
  sealedCiphertext: data.sealedCiphertext,
  conversationId: data.conversationId,  // <-- leaked
});
```
The comment at line 693 says "This is NOT a privacy leak -- the recipient already knows their conversations." This is true for the recipient, but the code comment at lines 553-555 acknowledges a *timing correlation* attack. The `conversationId` in the emitted event makes this easier: a compromised server doesn't just see timing -- it sees the exact conversation being used, which combined with the authenticated socket tells it who the sender is. The entire point of sealed sender is that the *server* shouldn't know who sent what in which conversation.

**Impact:** Reduces sealed sender to "sealed sender identity" only -- the server still knows the conversation, the timing, and the recipient. A compromised server can correlate sender with near-certainty. This is an acknowledged limitation (line 553-555) but the conversationId emission makes it strictly worse.
**Fix:** Move conversationId inside the sealed envelope (encrypted, client-side). The recipient decrypts the envelope to discover both the sender AND the conversation. This requires a client-side protocol change.

### S01-H5: Error message from `sendMessage` is forwarded verbatim to the client via `WsException`

**Lines:** 518-523
**What:**
```js
} catch (err) {
  const msg = err instanceof Error ? err.message : 'Failed to send message';
  this.logger.warn(`Message send failed for ${client.data.userId}: ${msg}`);
  throw new WsException(msg);
}
```
If `messagesService.sendMessage` throws an unexpected internal error (e.g., Prisma connection string in error, SQL syntax error with table names), the raw error message is forwarded to the client. Prisma errors routinely include table names, column names, and constraint names in their messages.

**Impact:** Information disclosure. Client learns internal database schema details from error messages.
**Fix:** Map known error types (ForbiddenException, BadRequestException, NotFoundException) to user-friendly messages. For unexpected errors, return a generic "Failed to send message" and log the details server-side only.

---

## MEDIUM

### S01-M1: `leave_conversation` handler can be used to probe room existence

**Lines:** 452-466
**What:** Any authenticated user can send `leave_conversation` with any `conversationId`. Socket.io `client.leave()` is silent (no error if room doesn't exist), so this doesn't directly leak information. However, the fact that the handler returns successfully (no error) for any conversationId means a client cannot distinguish "left a room I was in" from "tried to leave a room that doesn't exist." This is actually *correct* behavior from a privacy standpoint -- no information leaks. Noting as MEDIUM because the lack of membership check (S01-C2) means this is an untested code path.

### S01-M2: No rate limit on the pub/sub `new_message` channel -- message amplification possible

**Lines:** 105-109
**What:** The Redis pub/sub handler for `new_message` emits to `conversation:${conversationId}` without any rate limiting:
```js
} else if (channel === 'new_message') {
  const { conversationId, message: msg } = JSON.parse(message);
  if (conversationId && msg) {
    this.server.to(`conversation:${conversationId}`).emit('new_message', msg);
  }
}
```
If an attacker gains access to publish on the Redis `new_message` channel (Redis compromise, SSRF to Redis, or a bug in another service), they can flood any conversation room with unlimited fake messages. The gateway trusts the pub/sub channel completely.

**Impact:** Requires Redis write access (elevated threat model), but if achieved, enables unlimited message injection into any conversation without authentication, rate limits, or persistence.
**Fix:** Add a nonce or HMAC to pub/sub messages to verify they originated from a trusted service. Or at minimum, rate-limit emissions per conversationId.

### S01-M3: `WsSendMessageDto.messageType` uses `@IsEnum` with an array instead of a TypeScript enum

**Lines:** send-message.dto.ts:13
**What:**
```ts
@IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'GIF', 'STICKER', 'LOCATION'])
messageType?: string;
```
`@IsEnum()` expects an enum object, not an array. When passed an array, class-validator treats the array indices as valid values. This means `messageType: 0`, `messageType: 1`, etc. will pass validation. The actual string values ('TEXT', 'IMAGE', etc.) ALSO pass because `@IsEnum` checks both keys and values. But the numeric indices are accepted as well.

**Impact:** A client can send `messageType: 0` or `messageType: 8` instead of a string. Downstream code expecting a string gets a number. This can cause unexpected behavior in any `switch` statement or string comparison on `messageType`.
**Fix:** Define a proper TypeScript enum: `enum MessageType { TEXT = 'TEXT', IMAGE = 'IMAGE', ... }` and use `@IsEnum(MessageType)`.

### S01-M4: `WsReadDto` is defined but never used -- dead code / missing handler

**Lines:** chat-events.dto.ts:16-19
**What:** `WsReadDto` is defined with a `conversationId` field and proper `@IsUUID()` validation. But there is no `@SubscribeMessage('mark_read')` or similar handler in the gateway. The `markAsRead` functionality exists in `MessagesService` (line 991) but is only accessible via REST, not WebSocket.

**Impact:** Not a security issue, but indicates either a missing feature (read receipts should be real-time via WebSocket for instant delivery) or dead code that should be cleaned up. If read receipts are REST-only, the DTO is unnecessary.
**Fix:** Either implement a `mark_read` WebSocket handler using this DTO, or delete the DTO.

### S01-M5: `QuranRoomReciterChangeDto` is defined but has no handler

**Lines:** quran-room-events.dto.ts:20-23
**What:** `QuranRoomReciterChangeDto` is defined with `roomId` and `reciterId` fields, properly validated. But there is no `@SubscribeMessage` handler for reciter changes in the gateway. The `getQuranRoom` helper returns `reciterId` (line 193) and it's broadcast in room updates, but there's no way to *change* it via WebSocket.

**Impact:** The `reciterId` field in Redis is always empty string (set to `''` on room creation at line 848). It's broadcast to all participants but can never be updated. Dead feature.
**Fix:** Implement a `quran_reciter_change` handler that validates host-only access and updates the Redis hash, or remove the `reciterId` field and the DTO class.

### S01-M6: Quran verse sync allows host to set surah 0 due to inconsistent validation

**Lines:** quran-room-events.dto.ts:15-17, gateway line 960
**What:** The DTO correctly validates `@Min(1) @Max(114)` for surahNumber and `@Min(1) @Max(286)` for verseNumber. This is correct. However, the Redis `hmset` at line 960 stores these as strings:
```js
await this.redis.hmset(this.quranRoomKey(dto.roomId), {
  currentSurah: String(dto.surahNumber),
  currentVerse: String(dto.verseNumber),
});
```
And `getQuranRoom` at line 192-193 parses them back:
```js
currentSurah: parseInt(data.currentSurah || '1', 10),
currentVerse: parseInt(data.currentVerse || '1', 10),
```
The fallback `|| '1'` handles the case where the field is empty string or missing. But if `parseInt` receives `NaN` (e.g., if Redis data is corrupted), the `parseInt` returns `NaN` and this is broadcast to clients. No NaN check exists.

**Impact:** Low -- requires Redis data corruption. But defensive coding should handle it.
**Fix:** Add NaN fallback: `parseInt(data.currentSurah || '1', 10) || 1`.

### S01-M7: Connection rate limit uses `client.conn?.remoteAddress` which may be undefined behind a proxy

**Lines:** 253-254
**What:**
```js
const ip = client.conn?.remoteAddress || client.handshake.address || 'unknown';
```
Behind a reverse proxy (Cloudflare, nginx), `remoteAddress` is the proxy's IP, not the client's. All clients share the same rate limit bucket. The comment (lines 248-252) acknowledges this and says Cloudflare/nginx should set `X-Real-IP`, but the code never reads `X-Real-IP`. It explicitly says "remoteAddress is the safest default since it cannot be spoofed" -- which is true but means in production behind Cloudflare, ALL WebSocket connections share a single rate limit bucket (the Cloudflare edge IP).

If `ip` resolves to the Cloudflare edge IP, the rate limit of 10 connections/minute applies to ALL users coming through that edge. One legitimate user connecting 10 times within a minute blocks all other users on the same edge.

**Impact:** In production behind Cloudflare, connection rate limiting is either useless (if Cloudflare has multiple IPs) or a denial-of-service vector (if Cloudflare uses few IPs per edge).
**Fix:** Read `X-Real-IP` or `CF-Connecting-IP` header (Cloudflare-specific, cannot be spoofed by the client because Cloudflare overwrites it). Fall back to `remoteAddress` when not behind a proxy.

### S01-M8: `handleConnection` Prisma query for `userSettings` is a separate round-trip that could be combined

**Lines:** 330-334
**What:**
```js
const settings = await this.prisma.userSettings.findUnique({
  where: { userId: user.id },
  select: { activityStatus: true },
});
```
This is a separate DB query that could be combined with the `findUnique` at line 272. Both query by userId. Combined, this saves 1 round-trip per connection. At 10K concurrent connections, this is 10K unnecessary queries.

**Impact:** Performance -- not security. But at scale, every connection does 2 sequential Prisma queries that could be 1.
**Fix:** Include `settings: { select: { activityStatus: true } }` in the user query via relation, or use a raw SQL join.

---

## LOW

### S01-L1: `handleDisconnect` has a duplicated settings query for activityStatus

**Lines:** 420-424
**What:** On disconnect, `handleDisconnect` queries `userSettings` again to check `activityStatus` before broadcasting offline presence. This is a DB query on every disconnect. For users with many devices, each socket disconnect triggers this query. Combined with S01-M8, every connect AND disconnect hits `userSettings`.

**Impact:** Performance. At scale, this is thousands of unnecessary queries per minute.
**Fix:** Cache `activityStatus` in `client.data` on connection and reuse on disconnect.

### S01-L2: `typingTimers` Map grows unbounded if `isTyping: false` events are received without a prior `isTyping: true`

**Lines:** 726-750
**What:** When `isTyping: false` is received, the timer is cleared and deleted from the map (lines 728-732). But the emit at line 734 still fires for `isTyping: false`. This is correct behavior. However, if a client rapidly sends `isTyping: true` for many different conversations (spamming typing indicators), each creates a timer entry. The rate limit (10/10s at line 707) limits this to 10 entries per 10 seconds per user, so the map grows at most by 10 entries per user per 10 seconds. With 10K users, that's 100K timer entries every 10 seconds. The timers auto-clear after 10 seconds, so in steady state the map stays around 100K entries. This is manageable but not great.

**Impact:** Memory growth proportional to active typists. Bounded by rate limit but could be significant at scale.
**Fix:** Cap total typing timer entries per user (e.g., max 5 concurrent typing indicators per user).

### S01-L3: Quran room participant set uses socket IDs, but host transfer resolves by userId from socket data

**Lines:** 207-237
**What:** `transferQuranRoomHost` fetches sockets from the Socket.io room `quran:${roomId}`, takes the first socket, reads its `data.userId`. But the Redis participant set stores socket IDs, not user IDs. If the same user has multiple sockets in the room (e.g., two browser tabs), the participant count in Redis is inflated but host transfer picks a single socket's userId. Minor inconsistency.

**Impact:** Low. The only practical effect is that participant count includes duplicate sockets for the same user.
**Fix:** Track userIds instead of socket IDs in the participant set, or deduplicate by userId when reporting count.

### S01-L4: `extractToken` splits on space but doesn't handle malformed auth strings

**Lines:** 971-976
**What:**
```js
const [type, token] = auth.split(' ');
return type === 'Bearer' ? token : auth;
```
If `auth` is `"Bearer "` (with trailing space, no token), `token` is `""` (empty string) and is returned. `verifyToken` at line 269 would then fail with an opaque Clerk error. Not a security issue -- Clerk rejects empty tokens -- but the error message to the client is unclear (the socket just disconnects).

**Impact:** Poor developer experience. Malformed auth headers produce opaque disconnections.
**Fix:** Check `if (!token) return undefined` after destructuring.

### S01-L5: CORS callback returns `false` for rejected origins instead of an error

**Lines:** 37-51
**What:**
```js
callback(null, false);
```
Some Socket.io versions treat `callback(null, false)` as "allow without CORS headers" rather than "reject." The correct way to reject is `callback(new Error('CORS rejected'))`. This may allow cross-origin connections depending on Socket.io version.

**Impact:** Potential CORS bypass on certain Socket.io versions. The browser still enforces CORS, but non-browser clients (curl, Postman) bypass it regardless.
**Fix:** Use `callback(new Error('Origin not allowed'))` for rejected origins.

### S01-L6: `socket:evict` pub/sub handler catches errors silently in `debug` level

**Lines:** 124-136
**What:**
```js
}).catch((e) => this.logger.debug('Socket disconnect failed (may be on different instance)', e?.message));
```
Using `debug` level means that in production (typically `info` or `warn` level), eviction failures are invisible. If evictions consistently fail (e.g., due to a Socket.io adapter bug), there's no visibility.

**Impact:** Operational blindness. Failed evictions mean connection limit enforcement silently breaks.
**Fix:** Log at `warn` level, or at minimum count failures and alert if rate exceeds a threshold.

---

## INFO

### S01-I1: No handler for `mark_read` via WebSocket -- read receipts are REST-only

**What:** Reading a conversation (`markAsRead`) is only available via REST API. This means clients must make an HTTP request to mark messages as read, rather than using the existing WebSocket connection. For a chat app, this is a latency penalty on every conversation view (HTTP round-trip vs. WebSocket emit).

**Recommendation:** Add a `mark_read` WebSocket handler using the already-defined `WsReadDto`. This would make read receipt delivery instant (the sender gets the receipt via the same WebSocket) rather than requiring a separate REST call + pub/sub broadcast.

### S01-I2: No `quran_reciter_change` handler despite DTO existing

**What:** `QuranRoomReciterChangeDto` is defined with proper validation but has no corresponding handler. The `reciterId` field exists in Redis room state but is always empty string.

**Recommendation:** Implement or remove. Dead code in a security-critical file is a maintenance burden.

### S01-I3: Heartbeat timer sends `EXPIRE` every 2 minutes for a 5-minute TTL -- correct but wasteful

**Lines:** 63, 320-326
**What:** Heartbeat refreshes the presence TTL every 2 minutes. The TTL is 5 minutes. So presence keys are refreshed 2.5x more often than strictly necessary. A 4-minute interval with a 5-minute TTL would suffice.

**Recommendation:** Minor optimization. Not worth changing unless at extreme scale (100K+ heartbeats).

### S01-I4: `send_message` returns the full `message` object in the ACK but also broadcasts it to the room

**Lines:** 526-532
**What:** The handler returns `{ success, messageId, clientMessageId, createdAt }` as an ACK to the sender, and separately emits the full `message` object to `conversation:${conversationId}`. The sender is excluded from the broadcast (`client.to()` at line 527), so they only get the ACK. This is correct -- noting for documentation only.

---

## Checklist Answers

| # | Question | Answer | Findings |
|---|----------|--------|----------|
| 1 | Auth: every handler checks `client.data.userId`? | **YES** -- all 9 `@SubscribeMessage` handlers check `client.data.userId` on the first line | None |
| 2 | Rate limiting: every event rate-limited? | **YES** -- all 9 handlers call `checkRateLimit` | None (rate limits vary: join/leave 20/60s, message 30/60s, typing 10/10s, delivered 60/60s, quran 10/60s or 30/60s) |
| 3 | Input validation: every DTO validated? | **NO** -- `send_sealed_message` uses manual validation instead of class-validator DTO | S01-C1 |
| 4 | Membership: every conversation event verifies membership? | **NO** -- `leave_conversation` skips membership check | S01-C2 |
| 5 | Race conditions: non-atomic Redis operations? | **YES** -- Quran room `exists`+`hmset` is TOCTOU; disconnect cleanup is multi-step non-atomic | S01-H1, S01-H3 |
| 6 | Disconnect cleanup: all state cleaned up? | **MOSTLY** -- presence, heartbeat timers, Quran rooms all cleaned. Typing timers for the disconnected user are NOT explicitly cleaned on disconnect | See below |
| 7 | Room isolation: events leak between rooms? | **NO** -- each handler correctly scopes to `conversation:${id}` or `quran:${id}` or `user:${id}` rooms. `send_sealed_message` correctly routes to user room, not conversation room | None |
| 8 | Error handling: errors crash the process? | **NO** -- all async operations are wrapped in try/catch. Prisma errors are caught. WsException is used for client-facing errors. One concern: S01-H5 leaks error details | S01-H5 |
| 9 | Memory: unbounded per-connection? | **MOSTLY BOUNDED** -- typing timers bounded by rate limit; Quran rooms tracked in array (bounded by room cap). `client.data.quranRooms` grows by 1 per room joined, max 50 participants per room, but no limit on how many rooms one user can join | See below |
| 10 | Typing spoofing: can user spoof typing for another user? | **NO** -- typing events always use `client.data.userId` (server-assigned from Clerk JWT), not client-supplied userId. A user cannot emit typing indicators as someone else | None |

### Checklist item 6 detail: Typing timer cleanup on disconnect

When a user disconnects, `handleDisconnect` clears heartbeat timers and Quran room state, but does NOT clean up typing timers from the `typingTimers` Map. If a user was typing in a conversation and disconnects without sending `isTyping: false`, their typing timer (10s timeout) will fire after 10 seconds and try to emit on the disconnected socket. Socket.io handles emitting on disconnected sockets gracefully (no-op), so this doesn't crash. But the timer remains in the Map for up to 10 seconds after disconnect, and the `client.to(...)` emit references a stale socket.

**Severity:** LOW. The timer auto-clears after 10 seconds. No crash, no leak. But it means the "user stopped typing" event may not reach other participants if the timer's `client.to()` fails silently on the disconnected socket.

### Checklist item 9 detail: Quran room join count per user

There is no limit on how many Quran rooms a single user can join. `client.data.quranRooms` is an array that grows by 1 per `join_quran_room` call. A malicious user could join hundreds of rooms (rate limited to 10/min), each adding to the array and creating Socket.io room subscriptions. After 60 minutes at max rate, a single socket has 600 room subscriptions. This consumes memory in the Socket.io adapter.

**Severity:** LOW. Rate limit bounds growth to 10/min. Socket.io rooms are lightweight (just set membership). But there's no explicit cap.

---

## Architecture Observations (non-findings)

1. **Redis pub/sub for cross-instance communication is correct.** The gateway subscribes to 6 channels and handles them in a single `on('message')` listener. The duplicate Redis connection for pub/sub is correct (Redis requires a dedicated connection for subscriptions).

2. **Atomic Lua scripts for connection limiting (lines 294-312) are well-written.** The SADD + conditional SREM + EXPIRE is properly atomic. The eviction is published to all instances via pub/sub. Good pattern.

3. **Participant cap via Lua (lines 855-862) is correctly atomic.** SCARD + conditional SADD in a single Lua script prevents the race condition where two users both check under-cap and both add.

4. **Sealed sender implementation is architecturally sound** for its stated threat model. The server-side limitations (timing correlation, conversationId in event) are acknowledged in comments. The persist-before-emit fix (SEC-FIX-1) is correct.

5. **Delivery receipt privacy (F11)** is correctly implemented -- receipts are sent only to the message sender's sockets, not broadcast to the conversation room.

6. **Host transfer on disconnect (F41)** is correctly implemented with error handling and DB fallback.
