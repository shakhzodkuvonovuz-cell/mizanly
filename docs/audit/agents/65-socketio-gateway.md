# Audit Agent #65 — Socket.io Gateway Deep Audit

**Auditor:** Agent #65 of 67+
**Date:** 2026-03-21
**Scope:** All gateway files in `apps/api/src/gateways/` and any file importing Socket.io or referencing WebSocketGateway
**Files audited:**
- `apps/api/src/gateways/chat.gateway.ts` (529 lines)
- `apps/api/src/gateways/chat.gateway.spec.ts` (453 lines)
- `apps/api/src/gateways/dto/send-message.dto.ts` (28 lines)
- `apps/api/src/gateways/dto/chat-events.dto.ts` (63 lines)
- `apps/api/src/gateways/dto/quran-room-events.dto.ts` (20 lines)
- `apps/api/src/config/socket-io-adapter.ts` (55 lines)

---

## Finding Index

| # | Severity | Category | Summary |
|---|----------|----------|---------|
| 1 | **P0** | Privacy/Security | `user_online`/`user_offline` broadcast to ALL connected clients — leaks online status globally |
| 2 | **P0** | Authorization | `call_initiate` — no check that caller has permission to call target (blocks, mutes, privacy) |
| 3 | **P0** | Authorization | `call_answer`, `call_reject`, `call_end` — no verification caller/answerer relationship |
| 4 | **P0** | Authorization | `call_signal` — arbitrary WebRTC signaling to any userId without authorization |
| 5 | **P1** | Room Cleanup | Quran room participants NOT cleaned up on socket disconnect |
| 6 | **P1** | Authorization | `send_message` does NOT check membership before emitting — delegates to service but emits with raw `data.conversationId` |
| 7 | **P1** | Privacy | Typing indicator does not respect blocks/mutes — blocked user can see target typing |
| 8 | **P1** | Rate Limiting | Only `send_message` has rate limiting — 13 other events have zero rate limiting |
| 9 | **P1** | Input Validation | `message_delivered` uses raw `data.messageId` and `data.conversationId` without DTO validation |
| 10 | **P1** | Security | `get_online_status` has no auth check — unauthenticated sockets can query online status |
| 11 | **P2** | Privacy | `delivery_receipt` broadcast to entire conversation room — reveals who is online to all members |
| 12 | **P2** | Input Validation | `WsCallEndDto.participants` has no max size — attacker can pass thousands of user IDs |
| 13 | **P2** | Input Validation | Quran room DTOs use `@IsString()` for `roomId` not `@IsUUID()` — allows arbitrary Redis key injection |
| 14 | **P2** | Memory | `heartbeatTimers` Map grows indefinitely if disconnect handler fails before clearing timer |
| 15 | **P2** | CORS | CORS origins fallback to empty array `[]` when `CORS_ORIGINS` unset — may block all WS connections |
| 16 | **P2** | Error Handling | `handleTyping` calls `requireMembership` without try/catch — unhandled rejection crashes socket |
| 17 | **P2** | Authorization | No `leave_conversation` event — once joined, socket stays in room forever until disconnect |
| 18 | **P2** | Security | `read` event has no rate limiting — spammable to trigger DB writes |
| 19 | **P3** | Input Validation | `QuranRoomVerseSyncDto.verseNumber` has `@Min(1)` but no `@Max()` — accepts impossibly high verse numbers |
| 20 | **P3** | Input Validation | `QuranRoomReciterChangeDto.reciterId` is `@IsString()` — no whitelist or format validation |
| 21 | **P3** | Error Handling | `handleDisconnect` does NOT await `prisma.user.update` — fire-and-forget with `.catch()` swallows failures silently |
| 22 | **P3** | Error Handling | `handleMessageDelivered` uses fire-and-forget `prisma.message.updateMany().catch()` — delivery status may silently fail |
| 23 | **P3** | Architecture | Single gateway handles chat + calls + Quran rooms — God-gateway pattern, should be split |
| 24 | **P3** | Test Coverage | No tests for Quran room events (join, leave, verse sync, reciter change) |
| 25 | **P3** | Test Coverage | No tests for `call_signal` event |
| 26 | **P3** | Test Coverage | No tests for `message_delivered` with valid membership (only tests error paths) |
| 27 | **P3** | Security | Redis adapter silently swallows connection failure — no retry, no health check |
| 28 | **P3** | Scalability | `this.server.emit('user_online', ...)` broadcasts to ALL sockets globally — O(N) for every connect |

---

## Detailed Findings

---

### Finding #1 — P0 — `user_online`/`user_offline` Broadcast to ALL Clients

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 137, 167

**Code:**
```typescript
// Line 137 — handleConnection
this.server.emit('user_online', { userId, isOnline: true });

// Line 167 — handleDisconnect
this.server.emit('user_offline', { userId, isOnline: false, lastSeenAt: new Date().toISOString() });
```

**Problem:** `this.server.emit()` broadcasts to EVERY connected socket on the server. This means:
1. Every user's online/offline status is leaked to every other connected user, regardless of whether they follow each other, are blocked, or have privacy settings.
2. A malicious client connecting to the socket can passively monitor when ANY user on the platform goes online/offline.
3. Users who have "hide online status" or "hide last seen" privacy settings are completely ignored.
4. With Redis adapter for horizontal scaling, this broadcasts across ALL server instances.

**Impact:** Complete privacy violation. Users who block someone will still have their online status visible. Stalkers can monitor target's activity patterns.

**Fix:** Only emit to users who are in the target user's follower list / contacts, and check privacy settings. Use room-based emission (`this.server.to(room).emit(...)`) to target specific users who have a relationship.

---

### Finding #2 — P0 — `call_initiate` Has No Authorization Check

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 292-307

**Code:**
```typescript
@SubscribeMessage('call_initiate')
async handleCallInitiate(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; callType: string; sessionId: string }) {
  if (!client.data.userId) throw new WsException('Unauthorized');
  const dto = plainToInstance(WsCallInitiateDto, data);
  const errors = await validate(dto);
  if (errors.length > 0) {
    client.emit('error', { message: 'Invalid call_initiate data' });
    return;
  }
  const targetSockets = await this.getUserSockets(dto.targetUserId);
  if (targetSockets.length > 0) {
    for (const socketId of targetSockets) {
      this.server.to(socketId).emit('incoming_call', { sessionId: dto.sessionId, callType: dto.callType, callerId: client.data.userId });
    }
  }
}
```

**Problem:** The only check is `client.data.userId` exists (auth). There is NO check for:
1. Is the caller blocked by the target? A blocked user can call their blocker.
2. Is the target user on the caller's block list? (should not allow calling users you've blocked)
3. Does the caller have a conversation/follow relationship with the target?
4. Has the target disabled calls from strangers?
5. Is the target a minor with parental controls restricting calls?
6. Is there an existing active call with this target? (allows call bombing/harassment)

**Impact:** Any authenticated user can call any other user on the platform. This enables harassment via call spam, bypasses block functionality for audio/video contact, and violates user privacy settings.

**Fix:** Before emitting `incoming_call`, check Block model for both directions, check Mute/Restrict models, verify a shared conversation exists, and check target's call privacy settings.

---

### Finding #3 — P0 — `call_answer`, `call_reject`, `call_end` No Relationship Verification

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 309-348

**Code (call_answer):**
```typescript
@SubscribeMessage('call_answer')
async handleCallAnswer(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; callerId: string }) {
  if (!client.data.userId) throw new WsException('Unauthorized');
  // ... validation ...
  const callerSockets = await this.getUserSockets(dto.callerId);
  if (callerSockets.length > 0) { for (const s of callerSockets) { this.server.to(s).emit('call_answered', { sessionId: dto.sessionId, answeredBy: client.data.userId }); } }
}
```

**Problem:** Any authenticated user can emit `call_answered`, `call_rejected`, or `call_ended` to ANY other user by simply providing their userId as `callerId`. There is:
1. No server-side call session tracking — there's no verification that `sessionId` corresponds to an actual active call.
2. No verification the answerer was actually the call recipient.
3. An attacker can spoof `call_answered` events to interfere with legitimate calls.
4. `call_end` accepts a `participants` array — any user can send `call_ended` to arbitrary lists of users.

**Impact:** Call state spoofing. A malicious user could disrupt active calls by sending fake `call_ended` events. No call session integrity.

**Fix:** Implement server-side call session state (Redis hash with caller/callee) and verify each participant's role before forwarding events.

---

### Finding #4 — P0 — `call_signal` Allows Arbitrary WebRTC Signaling to Any User

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 350-367

**Code:**
```typescript
@SubscribeMessage('call_signal')
async handleCallSignal(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; signal: unknown }) {
  if (!client.data.userId) throw new WsException('Unauthorized');
  // Size check only...
  const targetSockets = await this.getUserSockets(dto.targetUserId);
  if (targetSockets.length > 0) { for (const s of targetSockets) { this.server.to(s).emit('call_signal', { fromUserId: client.data.userId, signal: dto.signal }); } }
}
```

**Problem:**
1. Any authenticated user can send arbitrary WebRTC signaling data to ANY other user.
2. The `signal` field is typed as `unknown` with only a size check (64KB) — it could contain anything.
3. No verification that an active call session exists between the two users.
4. No check for blocks, mutes, or relationship.
5. Combined with Finding #2, an attacker can initiate a call and send SDP offers to discover the target's IP address (WebRTC IP leak), bypassing any application-level privacy.

**Impact:** WebRTC IP address leak vulnerability. An attacker can craft SDP offers to trick target clients into making STUN requests that reveal their real IP address, even behind a VPN (if TURN is not enforced). This is a known WebRTC attack vector.

**Fix:** Enforce server-side call sessions. Only forward signals when both parties have accepted the call. Consider forcing all connections through TURN servers to prevent IP leaks.

---

### Finding #5 — P1 — Quran Room Participants Not Cleaned Up on Disconnect

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 145-169

**Code (handleDisconnect):**
```typescript
async handleDisconnect(client: Socket) {
  // Stop heartbeat for this socket
  const timer = this.heartbeatTimers.get(client.id);
  if (timer) {
    clearInterval(timer);
    this.heartbeatTimers.delete(client.id);
  }

  const userId = client.data.userId;
  if (!userId) return;

  const presenceKey = `presence:${userId}`;
  await this.redis.srem(presenceKey, client.id);
  // ... presence cleanup only ...
}
```

**Problem:** When a socket disconnects, the handler only cleans up:
1. Heartbeat timer
2. Redis presence set
3. Last seen timestamp

It does NOT:
1. Remove the socket from Quran room participant sets in Redis (`quran:room:{roomId}:participants`)
2. Leave any Quran Socket.io rooms the client was in
3. Broadcast updated participant count to remaining Quran room members
4. Check if the disconnecting user was the Quran room host (no host migration)

The `quran:room:{roomId}:participants` Redis set stores socket IDs, not user IDs. When a socket disconnects, its ID remains in the set until the TTL expires (1 hour). During that hour:
- Participant count is inflated (ghost participants)
- The room may never clean up if the host disconnects (room data persists for 1 hour with stale host)
- Other participants see wrong participant counts

**Fix:** In `handleDisconnect`, iterate all Quran rooms the socket was in (track room memberships on the socket or scan Redis) and remove the socket from participant sets. If the disconnecting user was host, either migrate host or close the room.

---

### Finding #6 — P1 — `send_message` Emits with Raw `data.conversationId` Instead of Validated DTO

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 229-231

**Code:**
```typescript
this.server
  .to(`conversation:${data.conversationId}`)  // ← uses raw `data`, not validated `dto`
  .emit('new_message', message);
```

**Problem:** After validating input into `dto` (line 205), the emit on line 230 uses `data.conversationId` (the raw user input) instead of `dto.conversationId`. While in this specific case the values should be identical (class-transformer copies the value), this is a defense-in-depth violation. If there's ever a transformer that normalizes the conversationId, the emit would use the un-normalized value.

Additionally, the `send_message` handler does NOT call `requireMembership` itself — it delegates to `messagesService.sendMessage()` which internally calls `requireMembership`. This means:
1. If `sendMessage` throws (not a member), the error propagates as an unhandled promise rejection since there's no try/catch.
2. The error is not returned as a user-friendly `client.emit('error', ...)` — it becomes a WsException that the client may not handle.

**Fix:** Use `dto.conversationId` instead of `data.conversationId` on line 230. Wrap the `sendMessage` call in try/catch and emit a user-friendly error.

---

### Finding #7 — P1 — Typing Indicator Does Not Respect Blocks/Mutes

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 236-253

**Code:**
```typescript
@SubscribeMessage('typing')
async handleTyping(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { conversationId: string; isTyping: boolean },
) {
  if (!client.data.userId) throw new WsException('Unauthorized');
  // ... validation ...
  await this.messagesService.requireMembership(dto.conversationId, client.data.userId);
  client.to(`conversation:${dto.conversationId}`).emit('user_typing', {
    userId: client.data.userId,
    isTyping: dto.isTyping,
  });
}
```

**Problem:** The typing event is broadcast to ALL members in the conversation room. There is no check for:
1. **Blocks:** If User A has blocked User B, User B's typing indicators still show to User A (and vice versa). A blocked user should not see the blocker's typing status.
2. **Mutes:** If User A has muted a conversation, they still receive typing events (wasted bandwidth, potential UI noise).
3. **Restricts:** If User A has restricted User B, User B should not be able to see typing indicators from User A.

In a group chat context, this means a blocked user in the same group can still monitor when their blocker is typing — a privacy violation.

**Fix:** Before emitting, filter out sockets belonging to users who have blocked the typer, or whom the typer has blocked. In DMs, check the block/restrict relationship.

---

### Finding #8 — P1 — Only 1 of 14 Socket Events Has Rate Limiting

**File:** `apps/api/src/gateways/chat.gateway.ts`

**Events and their rate limiting status:**

| Event | Rate Limited? | Line |
|-------|--------------|------|
| `send_message` | YES (30/min) | 212 |
| `join_conversation` | NO | 171 |
| `typing` | NO | 236 |
| `read` | NO | 255 |
| `get_online_status` | NO | 273 |
| `call_initiate` | NO | 292 |
| `call_answer` | NO | 309 |
| `call_reject` | NO | 322 |
| `call_end` | NO | 335 |
| `call_signal` | NO | 350 |
| `message_delivered` | NO | 369 |
| `join_quran_room` | NO | 392 |
| `leave_quran_room` | NO | 435 |
| `quran_verse_sync` | NO | 471 |
| `quran_reciter_change` | NO | 499 |

**Problem:** 13 of 14 events have zero rate limiting. An attacker can:
1. Spam `typing` events to trigger thousands of broadcasts per second.
2. Spam `join_conversation` to flood the room join system.
3. Spam `get_online_status` with 100 user IDs per request to perform mass surveillance.
4. Spam `call_initiate` to call-bomb a target user.
5. Spam `call_signal` to flood a target with WebRTC signaling data (64KB each).
6. Spam `read` to trigger thousands of DB writes.
7. Spam `message_delivered` to trigger thousands of DB writes.

**Impact:** Denial-of-service via event flooding. DB write amplification via `read` and `message_delivered` spam. User harassment via call spam.

**Fix:** Apply `checkRateLimit` (or a per-event variant) to all events. Suggested limits:
- `typing`: 10/min (coalesce on client side)
- `read`: 30/min
- `call_initiate`: 5/min
- `call_signal`: 100/min (WebRTC needs frequent signaling)
- `get_online_status`: 10/min
- `join_conversation`: 30/min
- `message_delivered`: 60/min

---

### Finding #9 — P1 — `message_delivered` Uses Raw Data Without DTO Validation

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 369-390

**Code:**
```typescript
@SubscribeMessage('message_delivered')
async handleMessageDelivered(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string; conversationId: string }) {
  if (!client.data.userId) throw new WsException('Unauthorized');
  if (!data.messageId || !data.conversationId) {
    client.emit('error', { message: 'Invalid message_delivered data' });
    return;
  }

  // Verify membership before updating delivery status
  try {
    await this.messagesService.requireMembership(data.conversationId, client.data.userId);
  } catch {
    throw new WsException('Not a member of this conversation');
  }

  const now = new Date();
  this.prisma.message.updateMany({
    where: { id: data.messageId, conversationId: data.conversationId },
    data: { deliveredAt: now },
  }).catch((e) => this.logger.error('Failed to update delivery', e));
  this.server.to(`conversation:${data.conversationId}`).emit('delivery_receipt', { messageId: data.messageId, deliveredAt: now.toISOString(), deliveredTo: client.data.userId });
}
```

**Problem:**
1. Unlike every other event handler, `message_delivered` does NOT use `plainToInstance` + `validate` with a DTO. It only checks truthiness (`!data.messageId`).
2. The `messageId` and `conversationId` are not validated as UUIDs — an attacker could pass SQL injection strings (though Prisma parameterizes queries, so SQL injection is unlikely, but it's a defense-in-depth violation).
3. An empty string `""` would pass the truthiness check in JavaScript for `!data.messageId` — wait, no, empty string is falsy. But a single space `" "` would pass.
4. No validation that `data.messageId` is actually a valid message format.

**Fix:** Create a `WsMessageDeliveredDto` with `@IsUUID()` decorators and use `plainToInstance` + `validate` like every other handler.

---

### Finding #10 — P1 — `get_online_status` Has No Authentication Check

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 273-290

**Code:**
```typescript
@SubscribeMessage('get_online_status')
async handleGetOnlineStatus(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { userIds: string[] },
) {
  // Cap at 100 user IDs to prevent abuse
  const userIds = (data.userIds || []).slice(0, 100);
  const pipeline = this.redis.pipeline();
  for (const id of userIds) {
    pipeline.scard(`presence:${id}`);
  }
  const results = await pipeline.exec();
  const statuses = userIds.map((id, i) => ({
    userId: id,
    isOnline: (results?.[i]?.[1] as number) > 0,
  }));
  client.emit('online_status', statuses);
}
```

**Problem:** This is the ONLY event handler that does NOT check `if (!client.data.userId) throw new WsException('Unauthorized');`. While `handleConnection` requires auth, if there's any race condition where an event is processed before `handleConnection` completes (or if `handleConnection` partially succeeds), an unauthenticated socket could query online status.

Additionally, even with auth, there is NO privacy check:
1. Any authenticated user can query the online status of ANY other user.
2. No check for blocks — a blocked user can check if their blocker is online.
3. No check for "hide online status" user privacy settings.
4. The `userIds` array values are not validated — they're passed directly to Redis key construction (`presence:${id}`). While Redis key injection is unlikely to cause harm here, an attacker could craft IDs like `*` or use pattern characters.

**Fix:** Add the standard auth check. Filter out users who have blocked the requester or have "hide online status" enabled. Validate each ID as UUID.

---

### Finding #11 — P2 — `delivery_receipt` Reveals Online Status to All Conversation Members

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Line:** 389

**Code:**
```typescript
this.server.to(`conversation:${data.conversationId}`).emit('delivery_receipt', { messageId: data.messageId, deliveredAt: now.toISOString(), deliveredTo: client.data.userId });
```

**Problem:** The delivery receipt is broadcast to the ENTIRE conversation room, including the sender and ALL other members. This reveals:
1. `deliveredTo: client.data.userId` — confirms which user has their app open (is online).
2. `deliveredAt` timestamp — confirms exact time the user was active.

In a group conversation, this means every member learns exactly when each other member last opened the conversation, even if that member has "hide online status" enabled.

**Fix:** Only emit the delivery receipt to the message sender, not the entire room. Use `this.server.to(senderSocketIds).emit(...)` instead of broadcasting to the room.

---

### Finding #12 — P2 — `WsCallEndDto.participants` Has No Size Limit

**File:** `apps/api/src/gateways/dto/chat-events.dto.ts`
**Lines:** 48-55

**Code:**
```typescript
export class WsCallEndDto {
  @IsUUID()
  sessionId: string;

  @IsArray()
  @IsString({ each: true })
  participants: string[];
}
```

**Problem:** The `participants` array has `@IsArray()` and `@IsString({ each: true })` but:
1. No `@ArrayMaxSize()` decorator — an attacker can pass thousands or millions of user IDs.
2. No `@IsUUID('4', { each: true })` — participants aren't validated as UUIDs.
3. For each participant, the handler calls `this.getUserSockets(pid)` which is a Redis `SMEMBERS` call. With 10,000 participants, that's 10,000 Redis calls.

**Impact:** Resource exhaustion / DoS. An attacker can send a `call_end` event with 100,000 participants to trigger 100,000 Redis SMEMBERS queries.

**Fix:** Add `@ArrayMaxSize(10)` (practical max for a group call) and `@IsUUID('4', { each: true })`.

---

### Finding #13 — P2 — Quran Room DTOs Use `@IsString()` for `roomId` — Redis Key Injection Risk

**File:** `apps/api/src/gateways/dto/quran-room-events.dto.ts`
**Lines:** 4, 8, 12, 18

**Code:**
```typescript
export class JoinQuranRoomDto {
  @IsString() roomId: string;
}
```

**Problem:** `roomId` is validated only as `@IsString()`, not `@IsUUID()` or `@Matches(/^[a-zA-Z0-9-]+$/)`. The `roomId` is directly interpolated into Redis keys:

```typescript
private quranRoomKey(roomId: string) { return `quran:room:${roomId}`; }
private quranParticipantsKey(roomId: string) { return `quran:room:${roomId}:participants`; }
```

An attacker could pass `roomId` values like:
1. `../../some:other:key` — while Redis doesn't use filesystem paths, the key namespace could collide with other application keys.
2. Very long strings (megabytes) — no `@MaxLength()` constraint, could cause Redis memory issues.
3. `*` or pattern characters — while not exploitable in `HMSET`/`SADD`, it creates messy key namespaces.

Similarly, `reciterId` in `QuranRoomReciterChangeDto` is just `@IsString()` with no format validation or `@MaxLength()`.

**Fix:** Use `@IsUUID()` or `@Matches(/^[a-zA-Z0-9_-]{1,64}$/)` for `roomId`. Add `@MaxLength(100)` to `reciterId`.

---

### Finding #14 — P2 — `heartbeatTimers` Map Memory Leak on Disconnect Failure

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 51, 127-134, 145-151

**Code:**
```typescript
private heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>(); // socketId → timer

// In handleConnection (line 127):
const timer = setInterval(async () => {
  try {
    await this.redis.expire(presenceKey, this.PRESENCE_TTL);
  } catch {
    // Redis unavailable — presence will expire naturally
  }
}, this.HEARTBEAT_INTERVAL);
this.heartbeatTimers.set(client.id, timer);

// In handleDisconnect (line 147):
const timer = this.heartbeatTimers.get(client.id);
if (timer) {
  clearInterval(timer);
  this.heartbeatTimers.delete(client.id);
}
```

**Problem:**
1. If `handleDisconnect` throws BEFORE the timer cleanup code (which is at the top, so unlikely for current code), the interval continues running forever.
2. More concerning: if a socket connects successfully (timer created at line 134) but then `handleConnection` fails AFTER setting the timer (e.g., at line 139 `client.join(...)` throws), the timer is set but `handleDisconnect` may not be called or may not have `userId` set, leading to an orphaned interval.
3. The `heartbeatTimers` Map is an in-memory data structure. In a horizontally scaled environment with Redis adapter, each server instance maintains its own map. This is correct but means if a server restarts, all heartbeat timers for sockets connected to that instance are lost (presence keys expire naturally, so not a critical issue, but worth noting).

**Fix:** Wrap the entire `handleConnection` in a try/catch that cleans up the timer on failure. Consider using a `Set` to track socket IDs with timers and a periodic sweep to clean orphans.

---

### Finding #15 — P2 — CORS Origins Falls Back to Empty Array

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Line:** 39

**Code:**
```typescript
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGINS?.split(',') ?? [] },
  namespace: '/chat',
  // ...
})
```

**Problem:** When `CORS_ORIGINS` is not set (which is the case per credential audit — many env vars are empty), the fallback is `[]` (empty array). Socket.io behavior with an empty origin array means NO origins are allowed — all CORS preflight requests will be rejected.

Contrast with `main.ts` line 64:
```typescript
origin: process.env.CORS_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:8081', 'http://localhost:8082'],
```

The main HTTP server has sensible localhost defaults. The WebSocket gateway does not.

Additionally, the gateway doesn't call `.filter(Boolean)` so a trailing comma in `CORS_ORIGINS=http://localhost:8081,` would produce `['http://localhost:8081', '']`, and an empty string origin could be problematic.

**Fix:** Use the same fallback as `main.ts`: `process.env.CORS_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:8081']`.

---

### Finding #16 — P2 — `handleTyping` Throws Unhandled Rejection on Membership Failure

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 248

**Code:**
```typescript
await this.messagesService.requireMembership(dto.conversationId, client.data.userId);
```

**Problem:** In `handleTyping`, the `requireMembership` call is NOT wrapped in try/catch. If the user is not a member, `requireMembership` throws a `ForbiddenException` (NestJS HTTP exception). This exception will propagate as an unhandled rejection in the WebSocket context — NestJS WebSocket exception filters don't automatically catch HTTP exceptions.

Compare with `handleJoin` (lines 183-187) which properly wraps in try/catch:
```typescript
try {
  await this.messagesService.requireMembership(dto.conversationId, client.data.userId);
} catch {
  throw new WsException('Not a member of this conversation');
}
```

`handleTyping` (line 248) does NOT have this try/catch pattern.

**Fix:** Wrap `requireMembership` in try/catch and throw `WsException` instead, matching the pattern used in `handleJoin` and `handleMessageDelivered`.

---

### Finding #17 — P2 — No `leave_conversation` Event

**File:** `apps/api/src/gateways/chat.gateway.ts`

**Problem:** The gateway has `join_conversation` (line 171) but NO corresponding `leave_conversation` event. Once a socket joins a conversation room via `client.join('conversation:...')`, it stays in that room until the socket disconnects.

This means:
1. If a user is removed from a conversation while their socket is connected, they continue to receive `new_message`, `user_typing`, `messages_read`, and `delivery_receipt` events for that conversation until they reconnect.
2. If a user opens 10 conversations and only leaves UI for each, they remain joined to all 10 Socket.io rooms, receiving all events for all of them.
3. There's no way for the client to explicitly leave a conversation room to reduce event noise.

Socket.io does clean up all room memberships on disconnect, but not while the connection is active.

**Impact:** After being removed/banned from a conversation, a user continues to receive messages in real-time. Privacy violation and authorization bypass.

**Fix:** Add a `leave_conversation` event. Also, in `handleJoin`, check that the user hasn't been banned from the conversation.

---

### Finding #18 — P2 — `read` Event Has No Rate Limiting — DB Write Amplification

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 255-271

**Code:**
```typescript
@SubscribeMessage('read')
async handleRead(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { conversationId: string },
) {
  if (!client.data.userId) throw new WsException('Unauthorized');
  // ... validation ...
  await this.messagesService.markRead(dto.conversationId, client.data.userId);
  this.server
    .to(`conversation:${dto.conversationId}`)
    .emit('messages_read', { userId: client.data.userId });
}
```

**Problem:** Each `read` event triggers:
1. A database write via `messagesService.markRead()` (updates `ConversationMember.unreadCount` and possibly `Message.readAt` fields)
2. A broadcast to the entire conversation room

With no rate limiting, a malicious client can spam this event to:
1. Generate thousands of DB writes per minute
2. Flood the conversation room with `messages_read` events

**Fix:** Apply the `checkRateLimit` function (or a variant) to the `read` event. A reasonable limit would be 30/min per user.

---

### Finding #19 — P3 — `verseNumber` in `QuranRoomVerseSyncDto` Has No Max Bound

**File:** `apps/api/src/gateways/dto/quran-room-events.dto.ts`
**Lines:** 13-14

**Code:**
```typescript
export class QuranRoomVerseSyncDto {
  @IsString() roomId: string;
  @IsInt() @Min(1) @Max(114) surahNumber: number;
  @IsInt() @Min(1) verseNumber: number;
}
```

**Problem:** `surahNumber` is correctly bounded `@Min(1) @Max(114)` (Quran has 114 surahs), but `verseNumber` only has `@Min(1)` with no `@Max()`. The longest surah (Al-Baqarah, surah 2) has 286 verses. An attacker could send `verseNumber: 999999999` which would be stored in Redis.

While this doesn't cause a security vulnerability per se (it's stored as a string in Redis), it violates data integrity — other participants would receive an impossible verse number.

**Fix:** Add `@Max(286)` to `verseNumber` (or ideally validate surah-verse combinations, but max 286 covers all surahs).

---

### Finding #20 — P3 — `reciterId` Has No Format Validation or Whitelist

**File:** `apps/api/src/gateways/dto/quran-room-events.dto.ts`
**Lines:** 18-19

**Code:**
```typescript
export class QuranRoomReciterChangeDto {
  @IsString() roomId: string;
  @IsString() reciterId: string;
}
```

**Problem:** `reciterId` is only validated as `@IsString()`. No `@MaxLength()`, no format validation, no whitelist. Per the CLAUDE.md, there are 4 Quran reciters. An attacker could set `reciterId` to an arbitrarily long string that gets stored in Redis and broadcast to all participants.

**Fix:** Add `@MaxLength(100)` and ideally `@IsIn(['reciter-1', 'reciter-2', 'reciter-3', 'reciter-4'])` or `@IsUUID()` depending on the reciter ID format.

---

### Finding #21 — P3 — `handleDisconnect` Fire-and-Forget DB Update

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 163-166

**Code:**
```typescript
this.prisma.user.update({
  where: { id: userId },
  data: { lastSeenAt: new Date() },
}).catch((e) => this.logger.error('Failed to update lastSeenAt', e));
```

**Problem:** The Prisma update is fire-and-forget (not awaited). The `.catch()` only logs the error. If the update fails:
1. `lastSeenAt` becomes stale — the user's "last seen" time shows an older value.
2. The error is only logged, not retried.
3. Since it's not awaited, the disconnect handler proceeds to emit `user_offline` with a `lastSeenAt` that may not match the DB.

While fire-and-forget is acceptable for non-critical operations, `lastSeenAt` is a user-visible field shown in conversation lists.

**Fix:** Consider awaiting the update or implementing a queue-based approach for reliability. At minimum, the `lastSeenAt` in the emitted event should come from the DB update result, not `new Date()`.

---

### Finding #22 — P3 — `message_delivered` Fire-and-Forget DB Update

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 385-388

**Code:**
```typescript
this.prisma.message.updateMany({
  where: { id: data.messageId, conversationId: data.conversationId },
  data: { deliveredAt: now },
}).catch((e) => this.logger.error('Failed to update delivery', e));
```

**Problem:** Same fire-and-forget pattern as Finding #21. The delivery receipt is emitted to the room (line 389) regardless of whether the DB update succeeded. This means:
1. Client sees "delivered" checkmark but DB doesn't reflect it.
2. On reconnect, the message may show as "sent" not "delivered" because the DB wasn't updated.
3. `updateMany` doesn't verify the message exists — if `messageId` doesn't exist, it silently updates 0 rows.

**Fix:** Await the Prisma call and only emit `delivery_receipt` if the update succeeded. Also verify at least 1 row was updated.

---

### Finding #23 — P3 — God-Gateway Pattern — Single Class Handles 14 Event Types

**File:** `apps/api/src/gateways/chat.gateway.ts`

**Problem:** The `ChatGateway` class handles 14 distinct event types across 3 unrelated domains:
1. **Chat:** `join_conversation`, `send_message`, `typing`, `read`, `message_delivered` (5 events)
2. **Calls:** `call_initiate`, `call_answer`, `call_reject`, `call_end`, `call_signal` (5 events)
3. **Quran Rooms:** `join_quran_room`, `leave_quran_room`, `quran_verse_sync`, `quran_reciter_change` (4 events)

Plus `get_online_status` (presence).

The class is 529 lines with mixed concerns. This makes it:
1. Hard to maintain — changes to call logic risk breaking chat logic.
2. Hard to test — the test file (453 lines) doesn't even test Quran room events or `call_signal`.
3. Impossible to independently scale — all events share the same rate limits and connection handling.

**Fix:** Split into `ChatGateway`, `CallGateway`, `QuranRoomGateway`, and `PresenceGateway`. They can share the same namespace or use sub-namespaces.

---

### Finding #24 — P3 — No Tests for Quran Room Events

**File:** `apps/api/src/gateways/chat.gateway.spec.ts`

**Problem:** The test file (453 lines) covers:
- `handleJoin` (3 tests)
- `handleMessage` (3 tests)
- `handleTyping` (2 tests)
- `handleRead` (2 tests)
- Online presence (5 tests)
- `handleConnection` error cases (4 tests)
- `handleDisconnect` no userId (1 test)
- `handleCallInitiate` (2 tests)
- `handleCallAnswer` (2 tests)
- `handleCallReject` (2 tests)
- `handleCallEnd` (2 tests)
- `handleMessageDelivered` (2 tests)

Missing test coverage:
- `join_quran_room` — 0 tests
- `leave_quran_room` — 0 tests
- `quran_verse_sync` — 0 tests
- `quran_reciter_change` — 0 tests
- `call_signal` — 0 tests
- `message_delivered` happy path (with valid membership) — 0 tests

That's 5 event handlers with zero test coverage.

---

### Finding #25 — P3 — No Tests for `call_signal` Event

**File:** `apps/api/src/gateways/chat.gateway.spec.ts`

The `call_signal` handler has a unique 64KB size check (lines 353-358) and relays `signal: unknown` data. There are no tests for:
1. Successful signal forwarding
2. Signal payload exceeding 64KB
3. Signal payload at exactly 64KB boundary
4. Target user has no connected sockets

---

### Finding #26 — P3 — `message_delivered` Only Tests Error Paths

**File:** `apps/api/src/gateways/chat.gateway.spec.ts`
**Lines:** 439-452

The test file has 2 tests for `handleMessageDelivered`:
1. Throws WsException when unauthorized
2. Emits error for missing messageId

There are NO tests for:
1. Successful delivery receipt (membership verified, DB updated, receipt emitted)
2. Non-member attempting delivery receipt
3. Invalid/non-existent messageId
4. Fire-and-forget DB failure behavior

---

### Finding #27 — P3 — Redis Adapter Silently Swallows Connection Failure

**File:** `apps/api/src/config/socket-io-adapter.ts`
**Lines:** 33-35

**Code:**
```typescript
} catch (error) {
  this.logger.error('Failed to connect Socket.io Redis adapter — falling back to in-memory');
}
```

**Problem:**
1. The error object is logged in the message string but not passed to the logger — the actual error details are lost.
2. There is no retry mechanism — if Redis is temporarily unavailable at startup, the adapter permanently falls back to in-memory mode.
3. There is no health check — if Redis reconnects later, the adapter doesn't upgrade.
4. In production with multiple instances, falling back to in-memory silently means WebSocket events won't propagate between instances — users connected to different instances won't see each other's messages. This is a silent data loss scenario.

**Fix:** Pass `error` to the logger: `this.logger.error('Failed to connect Socket.io Redis adapter', error.stack)`. Consider implementing a retry loop with exponential backoff. Add a health check endpoint that reports adapter mode.

---

### Finding #28 — P3 — Global Broadcast for Online/Offline is O(N) Per Connection

**File:** `apps/api/src/gateways/chat.gateway.ts`
**Lines:** 137, 167

**Problem:** `this.server.emit('user_online', ...)` sends a packet to EVERY connected socket. If there are 10,000 concurrent connections, each connect/disconnect triggers 10,000 emit operations.

With the Redis adapter for horizontal scaling, this becomes even worse — the event is pub/sub'd across all server instances first, then each instance emits to all its local sockets.

For a platform targeting millions of users, this pattern will not scale. Each user connecting triggers a global broadcast — this is O(N) per connection event, leading to O(N^2) total traffic for N users connecting.

**Fix:** Replace global broadcast with targeted room-based emission. Each user should be in rooms like `contacts:{userId}` containing only their friends/contacts. Online status updates should only be sent to these rooms.

---

## Summary

**Total findings:** 28

| Severity | Count | Key Issues |
|----------|-------|------------|
| P0 | 4 | Online status privacy leak, call authorization missing (initiate/answer/reject/signal) |
| P1 | 6 | Quran room cleanup, raw data emission, typing privacy, 13/14 events unrated-limited, message_delivered no DTO, get_online_status no auth check |
| P2 | 8 | Delivery receipt privacy, participants unbounded array, Redis key injection, heartbeat memory leak, CORS fallback, typing exception handling, no leave_conversation, read event spam |
| P3 | 10 | Verse number unbounded, reciterId unvalidated, fire-and-forget DB updates, god-gateway, missing tests (5 handlers), Redis adapter no retry, O(N) broadcast |

**Critical architectural concern:** The gateway has zero server-side call session state. All call events (initiate, answer, reject, end, signal) are pure relay with no state tracking, no authorization beyond "is authenticated", and no relationship checks. This means any user can call any user, spoof call events, and send WebRTC signaling data to any user — enabling IP address discovery attacks.
