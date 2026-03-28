# Calls Module & Chat Gateway — Complete Architecture

> Extracted from source code on 2026-03-25. Every endpoint, method, event, DTO, Redis key, and room pattern documented with line numbers.

---

## Table of Contents
1. [Calls Module Overview](#1-calls-module-overview)
2. [Calls Controller — Every Endpoint](#2-calls-controller--every-endpoint)
3. [Calls Service — Every Method](#3-calls-service--every-method)
4. [DTOs — Calls](#4-dtos--calls)
5. [Prisma Schema — Call Models](#5-prisma-schema--call-models)
6. [Chat Gateway — Overview & Configuration](#6-chat-gateway--overview--configuration)
7. [Chat Gateway — Connection Lifecycle](#7-chat-gateway--connection-lifecycle)
8. [Chat Gateway — Every @SubscribeMessage Handler](#8-chat-gateway--every-subscribemessage-handler)
9. [Chat Gateway — DTOs](#9-chat-gateway--dtos)
10. [Socket Event Catalog](#10-socket-event-catalog)
11. [Room Patterns](#11-room-patterns)
12. [Presence System](#12-presence-system)
13. [Quran Room Management](#13-quran-room-management)
14. [Rate Limiting](#14-rate-limiting)
15. [Notification Pub/Sub](#15-notification-pubsub)
16. [Known Issues & Gaps](#16-known-issues--gaps)
17. [Test Coverage](#17-test-coverage)

---

## 1. Calls Module Overview

**Files:**
- `apps/api/src/modules/calls/calls.module.ts` (10 lines)
- `apps/api/src/modules/calls/calls.controller.ts` (91 lines)
- `apps/api/src/modules/calls/calls.service.ts` (281 lines)
- `apps/api/src/modules/calls/dto/initiate-call.dto.ts` (13 lines)
- `apps/api/src/modules/calls/calls.controller.spec.ts` (93 lines)
- `apps/api/src/modules/calls/calls.service.spec.ts` (226 lines)
- `apps/api/src/modules/calls/calls-webrtc.spec.ts` (110 lines)

**Module registration** (`calls.module.ts`):
```typescript
@Module({
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
```
- Exports `CallsService` so other modules (e.g., gateway) can import it.
- Dependencies: `PrismaService` (injected via global module), `ConfigService` (injected via global ConfigModule).

---

## 2. Calls Controller — Every Endpoint

**File:** `apps/api/src/modules/calls/calls.controller.ts` (91 lines)

**Class-level decorators:**
- `@ApiTags('Calls')` — Swagger group
- `@ApiBearerAuth()` — requires JWT
- `@UseGuards(ClerkAuthGuard)` — Clerk JWT authentication on ALL endpoints
- `@Throttle({ default: { limit: 30, ttl: 60000 } })` — default 30 req/min

### Endpoint Table

| # | Method | Route | Throttle | Lines | Service Call | Description |
|---|--------|-------|----------|-------|-------------|-------------|
| 1 | `GET` | `/calls/ice-servers` | 5/min | 26-31 | `getIceServers()` | Get ICE (STUN/TURN) server configuration for WebRTC |
| 2 | `GET` | `/calls/active` | 30/min (default) | 33-37 | `getActiveCall(userId)` | Get user's current active call |
| 3 | `GET` | `/calls/history` | 30/min (default) | 39-43 | `getHistory(userId, cursor)` | Paginated call history. Query param: `?cursor=<id>` |
| 4 | `POST` | `/calls` | 30/min (default) | 45-49 | `initiate(userId, dto.targetUserId, dto.callType)` | Initiate a 1:1 call. Body: `InitiateCallDto` |
| 5 | `POST` | `/calls/group` | 30/min (default) | 51-55 | `createGroupCall(dto.conversationId, userId, dto.participantIds, dto.callType)` | Create group call (up to 8). Body: `CreateGroupCallDto` |
| 6 | `POST` | `/calls/:id/answer` | 30/min (default) | 57-62 | `answer(id, userId)` | Answer a ringing call. HttpCode 200. |
| 7 | `POST` | `/calls/:id/decline` | 30/min (default) | 64-69 | `decline(id, userId)` | Decline a ringing call. HttpCode 200. |
| 8 | `POST` | `/calls/:id/end` | 30/min (default) | 71-76 | `end(id, userId)` | End a ringing or active call. HttpCode 200. |
| 9 | `POST` | `/calls/:id/screen-share` | 30/min (default) | 78-83 | `shareScreen(id, userId)` | Start screen sharing. HttpCode 200. |
| 10 | `POST` | `/calls/:id/screen-share/stop` | 30/min (default) | 85-90 | `stopScreenShare(id, userId)` | Stop screen sharing. HttpCode 200. |

**Route ordering note** (line 25): Static routes (`ice-servers`, `active`, `history`) are declared BEFORE parameterized `:id` routes to prevent NestJS matching "ice-servers" as an `:id` param.

### Inline DTO: CreateGroupCallDto (lines 11-15)

```typescript
class CreateGroupCallDto {
  @IsString() conversationId: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(7) participantIds: string[];
  @IsEnum(CallType) callType: CallType;
}
```
- `participantIds` max 7 (plus initiator = 8 total)
- `callType` validated against Prisma `CallType` enum (VOICE | VIDEO)

---

## 3. Calls Service — Every Method

**File:** `apps/api/src/modules/calls/calls.service.ts` (281 lines)

**Dependencies injected:**
- `PrismaService` — database access
- `ConfigService` — reads TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL

### Exported Interface (lines 6-16)

```typescript
export interface CallSessionWithParticipants {
  id: string;
  callType: CallType;
  status: CallStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  participants: CallParticipant[];
}
```

### Method: `initiate(userId, targetUserId, callType)` — Lines 25-71

**Purpose:** Create a 1:1 call session.

**Logic:**
1. **Self-call guard** (line 26-28): Throws `BadRequestException('Cannot call yourself')` if userId === targetUserId.
2. **Bidirectional block check** (lines 30-39): Queries `prisma.block.findFirst` with OR clause checking both directions. Throws `ForbiddenException('Cannot call this user')` if blocked.
3. **Active call check** (lines 42-49): Queries `prisma.callParticipant.findFirst` for either user with `leftAt: null` and session status IN [RINGING, ACTIVE]. Throws `BadRequestException('User is already in a call')`.
4. **Create session** (lines 51-69): `prisma.callSession.create` with:
   - `callType`: passed through
   - `status`: `CallStatus.RINGING`
   - `participants.createMany`: Two records — caller (joinedAt: now, role: 'caller') and callee (role: 'callee', joinedAt not set)
   - Includes participants with user select: `{ id, username, displayName, avatarUrl }`
5. **Returns:** Full CallSession with participants and user details.

### Method: `answer(sessionId, userId)` — Lines 73-91

**Purpose:** Accept a ringing call.

**Logic:**
1. Fetches session via `getSession(sessionId)` (throws NotFoundException if not found).
2. Calls `requireParticipant()` (throws ForbiddenException if user not in call).
3. Validates `session.status === CallStatus.RINGING` (throws BadRequestException otherwise).
4. Updates session: `status → ACTIVE`, `startedAt → new Date()`.
5. Updates callee participant: `joinedAt → new Date()` (uses composite key `sessionId_userId`).
6. **Returns:** Updated CallSession (no includes).

### Method: `decline(sessionId, userId)` — Lines 93-102

**Purpose:** Decline a ringing call.

**Logic:**
1. Fetches session, requires participant, validates RINGING status.
2. Updates: `status → DECLINED`, `endedAt → new Date()`.
3. **Returns:** Updated CallSession.

### Method: `end(sessionId, userId)` — Lines 104-125

**Purpose:** End an active or ringing call.

**Logic:**
1. Fetches session, requires participant.
2. **Early return** (lines 109-111): If status is NOT RINGING and NOT ACTIVE, returns session as-is (idempotent).
3. Calculates `duration` in seconds: `(now - startedAt) / 1000`, floored. 0 if startedAt is null.
4. Updates ALL participants: `leftAt → now` (via `updateMany` where `leftAt: null`).
5. Updates session: `status → ENDED`, `endedAt → now`, `duration`.
6. **Returns:** Updated CallSession.

### Method: `missedCall(sessionId, userId?)` — Lines 127-137

**Purpose:** Mark a call as missed (typically called by a timeout mechanism).

**Logic:**
1. Fetches session. If userId provided, requires participant.
2. Validates RINGING status.
3. Updates: `status → MISSED`, `endedAt → new Date()`.
4. **Returns:** Updated CallSession.
5. **Note:** No controller endpoint calls this directly — it's exported for external use (e.g., a scheduled job or gateway timeout).

### Method: `getHistory(userId, cursor?, limit=20)` — Lines 139-158

**Purpose:** Get paginated call history for a user.

**Logic:**
1. Queries `prisma.callParticipant.findMany` where userId matches.
2. Cursor-based pagination: if cursor provided, filters `session.id < cursor`.
3. Includes full session with all participants and user details `{ id, username, displayName, avatarUrl }`.
4. Orders by `session.createdAt DESC`.
5. Takes `limit + 1` to detect hasMore.
6. **Returns:** `{ data: CallSession[], meta: { cursor: string | null, hasMore: boolean } }`

### Method: `getActiveCall(userId)` — Lines 160-174

**Purpose:** Get user's currently active call (if any).

**Logic:**
1. Queries `prisma.callParticipant.findFirst` where:
   - `userId` matches
   - `leftAt: null`
   - `session.status` IN [RINGING, ACTIVE]
2. Includes full session with participants and user details.
3. **Returns:** CallSession or null.

### Method: `getIceServers()` — Lines 176-196

**Purpose:** Return ICE server configuration for WebRTC peer connections.

**Logic:**
1. Always includes 3 STUN servers:
   - `stun:stun.l.google.com:19302`
   - `stun:stun1.l.google.com:19302`
   - `stun:stun.cloudflare.com:3478`
2. Conditionally adds TURN server if all 3 env vars are set:
   - `TURN_SERVER_URL`
   - `TURN_USERNAME`
   - `TURN_CREDENTIAL`
3. **Returns:** `{ iceServers: Array<{ urls: string; username?: string; credential?: string }> }`

### Private Method: `getSession(sessionId)` — Lines 198-205

Fetches `callSession.findUnique` with `include: { participants: true }`. Throws `NotFoundException('Call not found')` if null.

### Private Method: `requireParticipant(participants, userId)` — Lines 207-211

Checks if userId exists in participants array. Throws `ForbiddenException('Not a participant in this call')` if not found.

### Method: `createGroupCall(conversationId, initiatorId, participantIds, callType=VIDEO)` — Lines 215-247

**Purpose:** Create a group call with up to 8 participants.

**Logic:**
1. **Participant cap** (line 216): `participantIds.length > 7` throws BadRequestException. (7 others + initiator = 8).
2. **Dedup** (line 219): Builds `allIds = [initiatorId, ...participantIds.filter(id => id !== initiatorId)]` to avoid duplicate if initiator is in the list.
3. **Active call check** (lines 220-227): Same pattern as `initiate()` — any participant in RINGING/ACTIVE throws.
4. **Create session** (lines 229-246):
   - `callType`, `status: RINGING`, `maxParticipants: allIds.length`
   - Participants: initiator gets `role: 'caller'`, others get `role: 'receiver'`
   - Includes participants with user details.
5. **Returns:** Full CallSession with participants.
6. **Note:** `conversationId` parameter is received but NOT stored on the session — the model has no conversationId field.

### Method: `shareScreen(callId, userId)` — Lines 251-265

**Purpose:** Enable screen sharing in an active call.

**Logic:**
1. Fetches session with participants. Throws NotFoundException if not found.
2. Requires participant.
3. Validates `status === ACTIVE` (throws BadRequestException).
4. Validates `isScreenSharing === false` (throws `BadRequestException('Someone is already sharing their screen')`).
5. Updates: `isScreenSharing → true`, `screenShareUserId → userId`.
6. **Returns:** Updated CallSession.

### Method: `stopScreenShare(callId, userId)` — Lines 267-280

**Purpose:** Stop screen sharing.

**Logic:**
1. Fetches session with participants. Throws NotFoundException if not found.
2. Requires participant.
3. Validates `screenShareUserId === userId` (throws `ForbiddenException('Only the screen sharer can stop')`).
4. Updates: `isScreenSharing → false`, `screenShareUserId → null`.
5. **Returns:** Updated CallSession.

---

## 4. DTOs — Calls

### InitiateCallDto (`dto/initiate-call.dto.ts`, 13 lines)

```typescript
export class InitiateCallDto {
  @ApiProperty({ description: 'User ID to call' })
  @IsString()
  targetUserId: string;

  @ApiProperty({ enum: CallType })
  @IsEnum(CallType)
  callType: CallType;  // VOICE | VIDEO (Prisma enum)
}
```

### CreateGroupCallDto (inline in controller, lines 11-15)

```typescript
class CreateGroupCallDto {
  @IsString() conversationId: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(7) participantIds: string[];
  @IsEnum(CallType) callType: CallType;
}
```

---

## 5. Prisma Schema — Call Models

### CallType enum (schema.prisma:206-209)
```prisma
enum CallType {
  VOICE
  VIDEO
}
```

### CallStatus enum (schema.prisma:211-217)
```prisma
enum CallStatus {
  RINGING
  ACTIVE
  ENDED
  MISSED
  DECLINED
}
```

### CallSession model (schema.prisma:2324-2343)
```prisma
model CallSession {
  id                String            @id @default(cuid())
  callType          CallType
  status            CallStatus        @default(RINGING)
  startedAt         DateTime?
  endedAt           DateTime?
  duration          Int?
  maxParticipants   Int               @default(2)
  isScreenSharing   Boolean           @default(false)
  screenShareUserId String?
  screenShareUser   User?             @relation("callScreenShare", fields: [screenShareUserId], references: [id], onDelete: SetNull)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  participants      CallParticipant[]

  @@index([status])
  @@index([createdAt])
  @@index([endedAt])
  @@map("call_sessions")
}
```

### CallParticipant model (schema.prisma:2345-2358)
```prisma
model CallParticipant {
  sessionId String
  userId    String
  role      String      @default("caller")
  joinedAt  DateTime    @default(now())
  leftAt    DateTime?
  session   CallSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([sessionId, userId])    // Composite primary key
  @@index([userId])
  @@map("call_participants")
}
```

**Key observations:**
- Composite PK `[sessionId, userId]` prevents duplicate participants.
- `role` is a plain String, not an enum. Values used: `'caller'`, `'callee'`, `'receiver'`.
- `leftAt` is nullable — null means still in the call.
- Cascade delete from both session and user.
- No `conversationId` on CallSession — group calls receive it as a parameter but don't persist it.

---

## 6. Chat Gateway — Overview & Configuration

**File:** `apps/api/src/gateways/chat.gateway.ts` (827 lines)

**Decorator configuration (lines 40-55):**
```typescript
@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      // Dynamic CORS — reads CORS_ORIGINS env at request time
      const allowed = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
      if (!origin || allowed.length === 0 || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
  },
  namespace: '/chat',
  pingInterval: 25000,   // 25 seconds
  pingTimeout: 60000,    // 60 seconds
})
```

**Implements:** `OnGatewayConnection`, `OnGatewayDisconnect`, `OnModuleInit`

**Dependencies injected:**
- `MessagesService` — for sendMessage, markRead, requireMembership
- `PrismaService` — user lookups, conversation memberships, message updates, audioRoom updates
- `ConfigService` — for CLERK_SECRET_KEY
- `@Inject('REDIS') Redis` — presence, rate limiting, Quran rooms

**Class-level constants (lines 61-68):**
| Constant | Value | Purpose |
|----------|-------|---------|
| `PRESENCE_TTL` | 300 (5 min) | Redis presence key expiry |
| `HEARTBEAT_INTERVAL` | 120,000 (2 min) | Interval to refresh presence TTL |
| `QURAN_ROOM_TTL` | 3600 (1 hour) | Quran room auto-cleanup |
| `MAX_QURAN_ROOM_PARTICIPANTS` | 50 | Quran room participant cap |

**Instance state:**
- `heartbeatTimers: Map<string, NodeJS.Timer>` — maps socketId to setInterval timer
- `server: Server` — Socket.io server instance

---

## 7. Chat Gateway — Connection Lifecycle

### `onModuleInit()` — Lines 82-101

**Purpose:** Subscribe to Redis pub/sub for real-time notification delivery.

**Logic:**
1. Creates a DUPLICATE Redis connection (pub/sub requires dedicated connection).
2. Subscribes to channel `'notification:new'`.
3. On message: parses JSON `{ userId, notification }`, emits `'new_notification'` to room `user:{userId}`.
4. **Error handling:** Catches subscription failure gracefully — logs warning, real-time notifications disabled.

### `handleConnection(client: Socket)` — Lines 173-246

**Purpose:** Authenticate socket, set up presence, join user room.

**Full logic flow:**

1. **IP-based connection rate limit** (lines 176-185):
   - Extracts IP from `x-forwarded-for` header (first value) or `client.handshake.address`.
   - Redis key: `ws:conn:{ip}`, incremented with INCR.
   - On first hit (`count === 1`), sets 60s TTL.
   - If `count > 10`, logs warning, disconnects client. **Limit: 10 connections/min/IP.**

2. **Token extraction** (lines 187-191):
   - Calls `extractToken(client)` — checks `client.handshake.auth.token` first, then `client.handshake.headers.authorization`.
   - Supports both raw token and `Bearer <token>` format.
   - If no token, disconnects.

3. **Clerk JWT verification** (lines 193-195):
   - `verifyToken(token, { secretKey })` — returns `{ sub: clerkId }`.
   - On failure, falls through to catch block → disconnect.

4. **User lookup** (lines 196-204):
   - `prisma.user.findUnique({ where: { clerkId } })` with select: `{ id, username, isBanned, isDeactivated, isDeleted }`.
   - Disconnects if: user not found, OR `isBanned`, OR `isDeactivated`, OR `isDeleted`.

5. **Socket data setup** (lines 207-208):
   - `client.data.userId = user.id`
   - `client.data.quranRooms = []` — tracks which Quran rooms this socket is in (for disconnect cleanup)

6. **Redis presence tracking** (lines 211-214):
   - `SADD presence:{userId} {socketId}` — add socket to user's presence set.
   - `EXPIRE presence:{userId} 300` — 5 min TTL.

7. **Heartbeat timer** (lines 217-224):
   - `setInterval` every 120 seconds: refreshes `EXPIRE presence:{userId} 300`.
   - Timer stored in `heartbeatTimers` Map keyed by socketId.
   - Silent catch on Redis errors — presence expires naturally.

8. **Online broadcast** (lines 227-234):
   - Queries `conversationMember.findMany({ where: { userId }, take: 100 })` to get user's conversations.
   - For each conversation: `client.to(conversation:{convId}).emit('user_online', { userId, isOnline: true })`.
   - **Scoped broadcast** — only notifies users in shared conversations, not globally.

9. **Join user room** (line 236):
   - `client.join(user:{userId})` — personal room for targeted events.

10. **Error handling** (lines 237-245):
    - Catches all errors in the entire flow.
    - Cleans up heartbeat timer if it was already set.
    - Disconnects client.

### `handleDisconnect(client: Socket)` — Lines 248-317

**Purpose:** Clean up presence, Quran rooms, broadcast offline.

**Full logic flow:**

1. **Stop heartbeat** (lines 250-254):
   - Clears interval timer from `heartbeatTimers` Map.

2. **Quran room cleanup** (lines 257-291):
   - Iterates `client.data.quranRooms` array.
   - For each room:
     a. `SREM quran:room:{roomId}:participants {socketId}` — remove from participant set.
     b. `SCARD` to check remaining count.
     c. **If 0 remaining** (lines 263-269):
        - `DEL quran:room:{roomId}` and `quran:room:{roomId}:participants`.
        - Updates DB: `prisma.audioRoom.update({ status: 'ended', endedAt: new Date() })`.
        - DB failure caught gracefully (`.catch()` logs warning).
     d. **If participants remain** (lines 271-287):
        - Checks if disconnecting user was the host (`room.hostId === client.data.userId`).
        - If host: calls `transferQuranRoomHost(roomId)` — picks next socket, updates Redis + DB + emits `host_changed`.
        - Emits `quran_room_update` to all remaining with updated state.
   - Each room cleanup wrapped in try/catch — one failure doesn't break others.

3. **Presence cleanup** (lines 293-316):
   - Returns early if no userId on socket data.
   - `SREM presence:{userId} {socketId}` — remove this socket.
   - `SCARD presence:{userId}` — check remaining sockets.
   - **If 0 remaining** (fully offline):
     a. `DEL presence:{userId}` — clean up key.
     b. `prisma.user.update({ lastSeenAt: new Date() })` — update DB (fire-and-forget with `.catch()`).
     c. Queries conversation memberships (take 100).
     d. For each conversation: `server.to(conversation:{convId}).emit('user_offline', { userId, isOnline: false })`.
   - **If sockets remain**: No action (user still online from another device/tab).

### `extractToken(client: Socket)` — Lines 821-826

**Logic:**
1. Tries `client.handshake.auth.token` first, then `client.handshake.headers.authorization`.
2. If value starts with `Bearer `, splits and returns token portion.
3. Otherwise returns raw value.
4. Returns `undefined` if neither source has a token.

---

## 8. Chat Gateway — Every @SubscribeMessage Handler

### 8.1 `join_conversation` — Lines 319-338

| Property | Value |
|----------|-------|
| Event | `join_conversation` |
| DTO | `WsJoinConversationDto` — `{ conversationId: UUID }` |
| Rate limit | `join`, 20/60s |
| Auth check | `client.data.userId` required |

**Logic:**
1. Validates DTO (class-validator via plainToInstance + validate).
2. On validation error: `client.emit('error', { message: 'Invalid join_conversation data' })`.
3. Calls `messagesService.requireMembership(conversationId, userId)` — throws WsException if not a member.
4. `client.join(conversation:{conversationId})`.

### 8.2 `leave_conversation` — Lines 340-354

| Property | Value |
|----------|-------|
| Event | `leave_conversation` |
| DTO | `WsLeaveConversationDto` — `{ conversationId: UUID }` |
| Rate limit | `leave`, 20/60s |
| Auth check | `client.data.userId` required |

**Logic:**
1. Validates DTO. On error: emits error event.
2. `client.leave(conversation:{conversationId})`.

### 8.3 `send_message` — Lines 356-408

| Property | Value |
|----------|-------|
| Event | `send_message` |
| DTO | `WsSendMessageDto` (see section 9) |
| Rate limit | `message` (default), 30/60s |
| Auth check | `client.data.userId` required |

**Logic:**
1. Validates DTO. On error: `client.emit('error', { message: 'Invalid message data' })`.
2. Checks rate limit. If exceeded: `client.emit('error', { message: 'Rate limit exceeded' })` and returns.
3. Calls `messagesService.sendMessage(conversationId, userId, { content, messageType, mediaUrl, mediaType, replyToId, isSpoiler, isViewOnce })`.
4. On sendMessage failure: throws `WsException('Failed to send message')`.
5. **Emits** `server.to(conversation:{conversationId}).emit('new_message', message)` to ALL members of the conversation room.
6. **Returns** the message object to the sender (Socket.io acknowledgement).

### 8.4 `typing` — Lines 410-438

| Property | Value |
|----------|-------|
| Event | `typing` |
| DTO | `WsTypingDto` — `{ conversationId: UUID, isTyping: boolean }` |
| Rate limit | `typing`, 10/10s |
| Auth check | `client.data.userId` required |

**Logic:**
1. Validates DTO. On error: emits error event.
2. Calls `requireMembership()` — throws WsException if not a member.
3. **Privacy check** (lines 429-433): Queries `prisma.userSettings.findUnique({ userId, select: { activityStatus } })`. If `activityStatus === false`, returns silently (no typing indicator sent).
4. **Emits** `client.to(conversation:{conversationId}).emit('user_typing', { userId, isTyping })` — broadcast to conversation EXCEPT sender.

### 8.5 `read` — Lines 440-463

| Property | Value |
|----------|-------|
| Event | `read` |
| DTO | `WsReadDto` — `{ conversationId: UUID }` |
| Rate limit | `read`, 30/60s |
| Auth check | `client.data.userId` required |

**Logic:**
1. Validates DTO. On error: emits error event.
2. Calls `messagesService.markRead(conversationId, userId)`.
3. **Privacy check** (lines 455-459): Queries `userSettings.activityStatus`. If false, returns silently (no read receipt broadcast).
4. **Emits** `server.to(conversation:{conversationId}).emit('messages_read', { userId })` — broadcast to conversation.

### 8.6 `get_online_status` — Lines 465-484

| Property | Value |
|----------|-------|
| Event | `get_online_status` |
| DTO | Raw `{ userIds: string[] }` (no DTO class, validated inline) |
| Rate limit | `online`, 10/60s |
| Auth check | `client.data.userId` required |

**Logic:**
1. **Caps at 50 IDs** (line 473): `data.userIds.slice(0, 50)` to prevent abuse.
2. Uses Redis pipeline: `SCARD presence:{id}` for each user ID.
3. Maps results: `isOnline = count > 0`.
4. **Emits** `client.emit('online_status', statuses)` — response to requester only.
   - Data shape: `Array<{ userId: string; isOnline: boolean }>`

### 8.7 `call_initiate` — Lines 486-515

| Property | Value |
|----------|-------|
| Event | `call_initiate` |
| DTO | `WsCallInitiateDto` — `{ targetUserId: UUID, callType: 'AUDIO'|'VIDEO', sessionId: UUID }` |
| Rate limit | `call`, 3/60s |
| Auth check | `client.data.userId` required |
| Block check | Yes — bidirectional |

**Logic:**
1. Validates DTO. On error: emits error event.
2. **Block check** (lines 497-508): Queries `prisma.block.findFirst` for bidirectional block. If blocked: `client.emit('error', { message: 'Cannot call this user' })`.
3. Gets target user's sockets via `getUserSockets(targetUserId)` (Redis SMEMBERS).
4. **Emits to each socket** (line 512): `server.to(socketId).emit('incoming_call', { sessionId, callType, callerId: client.data.userId })`.

**CRITICAL BUG NOTE:** The DTO validates `callType` as `'AUDIO'|'VIDEO'` but the Prisma `CallType` enum uses `VOICE|VIDEO`. This means socket DTO accepts 'AUDIO' but REST API uses 'VOICE'. The mobile client must match.

### 8.8 `call_answer` — Lines 517-542

| Property | Value |
|----------|-------|
| Event | `call_answer` |
| DTO | `WsCallAnswerDto` — `{ sessionId: UUID, callerId: UUID }` |
| Rate limit | `call`, 10/60s |
| Auth check | `client.data.userId` required |
| Block check | Yes — bidirectional |

**Logic:**
1. Validates DTO. On error: emits error event.
2. **Block check** (lines 528-539): Same bidirectional check. If blocked: `client.emit('error', { message: 'Cannot interact with this user' })`.
3. Gets caller's sockets via `getUserSockets(callerId)`.
4. **Emits to each socket** (line 541): `server.to(s).emit('call_answered', { sessionId, answeredBy: client.data.userId })`.

### 8.9 `call_reject` — Lines 544-569

| Property | Value |
|----------|-------|
| Event | `call_reject` |
| DTO | `WsCallRejectDto` — `{ sessionId: UUID, callerId: UUID }` |
| Rate limit | `call`, 10/60s |
| Auth check | `client.data.userId` required |
| Block check | Yes — bidirectional |

**Logic:**
1. Validates DTO. On error: emits error event.
2. **Block check** — same pattern. If blocked: `client.emit('error', { message: 'Cannot interact with this user' })`.
3. Gets caller's sockets.
4. **Emits** (line 568): `server.to(s).emit('call_rejected', { sessionId, rejectedBy: client.data.userId })`.

### 8.10 `call_end` — Lines 571-585

| Property | Value |
|----------|-------|
| Event | `call_end` |
| DTO | `WsCallEndDto` — `{ sessionId: UUID, participants: string[] (max 20) }` |
| Rate limit | `call`, 10/60s |
| Auth check | `client.data.userId` required |
| Block check | No (ending a call should always work) |

**Logic:**
1. Validates DTO. On error: emits error event.
2. Iterates `dto.participants`: for each, gets sockets via `getUserSockets(pid)`.
3. **Emits to each** (line 583): `server.to(s).emit('call_ended', { sessionId, endedBy: client.data.userId })`.

### 8.11 `call_signal` — Lines 587-618

| Property | Value |
|----------|-------|
| Event | `call_signal` |
| DTO | `WsCallSignalDto` — `{ targetUserId: UUID, signal: unknown }` |
| Rate limit | `signal`, 60/10s |
| Auth check | `client.data.userId` required |
| Block check | Yes — bidirectional (prevents IP leak via WebRTC) |

**Logic:**
1. **Payload size check** (lines 592-596): `JSON.stringify(signal).length > 65536` → emits error `'Signal payload too large (max 64KB)'`.
2. Validates DTO. On error: emits error event.
3. **Block check** (lines 603-615): Bidirectional. If blocked: `client.emit('error', { message: 'Cannot signal this user' })`.
4. Gets target sockets.
5. **Emits** (line 617): `server.to(s).emit('call_signal', { fromUserId: client.data.userId, signal })`.

### 8.12 `message_delivered` — Lines 620-660

| Property | Value |
|----------|-------|
| Event | `message_delivered` |
| DTO | `WsMessageDeliveredDto` — `{ messageId: UUID, conversationId: UUID }` |
| Rate limit | `delivered`, 60/60s |
| Auth check | `client.data.userId` required |
| Membership check | Yes — via `messagesService.requireMembership()` |

**Logic:**
1. Validates DTO. On error: emits error event.
2. Calls `requireMembership()` — throws WsException if not a member.
3. **Updates DB** (lines 640-643): `prisma.message.updateMany({ where: { id, conversationId }, data: { deliveredAt: now } })` — fire-and-forget with `.catch()`.
4. **Targeted delivery receipt** (lines 646-659):
   - Queries `prisma.message.findUnique({ where: { id: messageId }, select: { senderId } })`.
   - Gets sender's sockets via `getUserSockets(senderId)`.
   - **Emits to sender only** (line 654): `server.to(s).emit('delivery_receipt', { messageId, deliveredAt, deliveredTo: client.data.userId })`.
   - Privacy: receipt only goes to sender, NOT entire conversation room.

### 8.13 `join_quran_room` — Lines 662-713

| Property | Value |
|----------|-------|
| Event | `join_quran_room` |
| DTO | `JoinQuranRoomDto` — `{ roomId: string (alphanum, max 50) }` |
| Rate limit | `quran_join`, 10/60s |
| Auth check | `client.data.userId` required |

**Logic:**
1. Validates DTO. On error: emits error event. RoomId validated against `/^[a-zA-Z0-9_-]+$/` pattern.
2. **Create room if not exists** (lines 680-685):
   - `redis.exists(quran:room:{roomId})`.
   - If not exists: `HMSET quran:room:{roomId} { hostId: userId, currentSurah: '1', currentVerse: '1', reciterId: '' }`.
   - `EXPIRE quran:room:{roomId} 3600` (1 hour).
   - First joiner becomes host.
3. **Participant cap** (lines 688-693): `SCARD quran:room:{roomId}:participants`. If >= 50, emits error.
4. **Add participant** (lines 696-700):
   - `SADD quran:room:{roomId}:participants {socketId}`.
   - `EXPIRE` to refresh TTL.
   - `client.join(quran:{roomId})` — Socket.io room.
   - Tracks roomId in `client.data.quranRooms[]`.
5. **Broadcast** (lines 703-712): `server.to(quran:{roomId}).emit('quran_room_update', { roomId, hostId, currentSurah, currentVerse, reciterId, participantCount })`.

### 8.14 `leave_quran_room` — Lines 715-765

| Property | Value |
|----------|-------|
| Event | `leave_quran_room` |
| DTO | `LeaveQuranRoomDto` — `{ roomId: string (alphanum, max 50) }` |
| Rate limit | `quran_leave`, 10/60s |
| Auth check | `client.data.userId` required |

**Logic:**
1. Validates DTO. On error: emits error event.
2. `SREM quran:room:{roomId}:participants {socketId}`.
3. `client.leave(quran:{roomId})`.
4. Removes roomId from `client.data.quranRooms`.
5. **If empty** (lines 739-747):
   - `DEL quran:room:{roomId}` and participants key.
   - Updates DB: `audioRoom.update({ status: 'ended', endedAt })`.
   - Returns (no broadcast needed).
6. **If participants remain** (lines 750-764):
   - If leaving user was host: calls `transferQuranRoomHost()`.
   - Emits `quran_room_update` with updated state.

### 8.15 `quran_verse_sync` — Lines 767-794

| Property | Value |
|----------|-------|
| Event | `quran_verse_sync` |
| DTO | `QuranRoomVerseSyncDto` — `{ roomId: string, surahNumber: 1-114, verseNumber: 1-286 }` |
| Rate limit | `quran_sync`, 30/60s |
| Auth check | `client.data.userId` required |
| Permission | Host only |

**Logic:**
1. Validates DTO. On error: emits error event.
2. Gets room state from Redis. If not exists or `hostId !== userId`, returns silently (only host can sync).
3. Updates Redis: `HMSET quran:room:{roomId} { currentSurah, currentVerse }`.
4. **Emits** `server.to(quran:{roomId}).emit('quran_verse_changed', { surahNumber, verseNumber })`.

### 8.16 `quran_reciter_change` — Lines 796-819

| Property | Value |
|----------|-------|
| Event | `quran_reciter_change` |
| DTO | `QuranRoomReciterChangeDto` — `{ roomId: string, reciterId: string (max 30) }` |
| Rate limit | `quran_reciter`, 10/60s |
| Auth check | `client.data.userId` required |
| Permission | Host only |

**Logic:**
1. Validates DTO. On error: emits error event.
2. Gets room state. If not host, returns silently.
3. Updates Redis: `HSET quran:room:{roomId} reciterId {reciterId}`.
4. **Emits** `server.to(quran:{roomId}).emit('quran_reciter_updated', { reciterId })`.

---

## 9. Chat Gateway — DTOs

### WsSendMessageDto (`dto/send-message.dto.ts`, 36 lines)

```typescript
export class WsSendMessageDto {
  @IsString() conversationId: string;
  @IsOptional() @IsString() @MaxLength(5000) content?: string;
  @IsOptional() @IsEnum(['TEXT','IMAGE','VIDEO','AUDIO','VOICE','FILE','GIF','STICKER','LOCATION']) messageType?: string;
  @IsOptional() @IsUrl() mediaUrl?: string;
  @IsOptional() @IsString() @MaxLength(50) mediaType?: string;
  @IsOptional() @IsString() replyToId?: string;
  @IsOptional() @IsBoolean() isSpoiler?: boolean;
  @IsOptional() @IsBoolean() isViewOnce?: boolean;
}
```

### Chat Events DTOs (`dto/chat-events.dto.ts`, 77 lines)

| DTO | Fields | Validation |
|-----|--------|-----------|
| `WsJoinConversationDto` | `conversationId` | `@IsUUID()` |
| `WsLeaveConversationDto` | `conversationId` | `@IsUUID()` |
| `WsTypingDto` | `conversationId`, `isTyping` | `@IsUUID()`, `@IsBoolean()` |
| `WsReadDto` | `conversationId` | `@IsUUID()` |
| `WsCallInitiateDto` | `targetUserId`, `callType`, `sessionId` | `@IsUUID()`, `@IsIn(['AUDIO','VIDEO'])`, `@IsUUID()` |
| `WsCallAnswerDto` | `sessionId`, `callerId` | `@IsUUID()`, `@IsUUID()` |
| `WsCallRejectDto` | `sessionId`, `callerId` | `@IsUUID()`, `@IsUUID()` |
| `WsCallEndDto` | `sessionId`, `participants` | `@IsUUID()`, `@IsArray() @IsString({each:true}) @ArrayMaxSize(20)` |
| `WsCallSignalDto` | `targetUserId`, `signal` | `@IsUUID()`, raw `unknown` (validated by size only, max 64KB) |
| `WsMessageDeliveredDto` | `messageId`, `conversationId` | `@IsUUID()`, `@IsUUID()` |

### Quran Room DTOs (`dto/quran-room-events.dto.ts`, 23 lines)

All `roomId` fields: `@IsString() @MaxLength(50) @Matches(/^[a-zA-Z0-9_-]+$/)` — prevents Redis key injection.

| DTO | Fields | Validation |
|-----|--------|-----------|
| `JoinQuranRoomDto` | `roomId` | String, max 50, alphanumeric only |
| `LeaveQuranRoomDto` | `roomId` | String, max 50, alphanumeric only |
| `QuranRoomVerseSyncDto` | `roomId`, `surahNumber`, `verseNumber` | roomId validated, `@IsInt() @Min(1) @Max(114)`, `@IsInt() @Min(1) @Max(286)` |
| `QuranRoomReciterChangeDto` | `roomId`, `reciterId` | roomId validated, `@IsString() @MaxLength(30)` |

---

## 10. Socket Event Catalog

### Client → Server Events (16 total)

| # | Event Name | Handler | Lines | Auth | Rate Limit | Block Check |
|---|-----------|---------|-------|------|-----------|-------------|
| 1 | `join_conversation` | `handleJoin` | 319-338 | Yes | join: 20/60s | No (membership check) |
| 2 | `leave_conversation` | `handleLeave` | 340-354 | Yes | leave: 20/60s | No |
| 3 | `send_message` | `handleMessage` | 356-408 | Yes | message: 30/60s | No (service validates) |
| 4 | `typing` | `handleTyping` | 410-438 | Yes | typing: 10/10s | No (membership check) |
| 5 | `read` | `handleRead` | 440-463 | Yes | read: 30/60s | No |
| 6 | `get_online_status` | `handleGetOnlineStatus` | 465-484 | Yes | online: 10/60s | No |
| 7 | `call_initiate` | `handleCallInitiate` | 486-515 | Yes | call: 3/60s | Yes |
| 8 | `call_answer` | `handleCallAnswer` | 517-542 | Yes | call: 10/60s | Yes |
| 9 | `call_reject` | `handleCallReject` | 544-569 | Yes | call: 10/60s | Yes |
| 10 | `call_end` | `handleCallEnd` | 571-585 | Yes | call: 10/60s | No |
| 11 | `call_signal` | `handleCallSignal` | 587-618 | Yes | signal: 60/10s | Yes |
| 12 | `message_delivered` | `handleMessageDelivered` | 620-660 | Yes | delivered: 60/60s | No (membership) |
| 13 | `join_quran_room` | `handleJoinQuranRoom` | 662-713 | Yes | quran_join: 10/60s | No |
| 14 | `leave_quran_room` | `handleLeaveQuranRoom` | 715-765 | Yes | quran_leave: 10/60s | No |
| 15 | `quran_verse_sync` | `handleQuranVerseSync` | 767-794 | Yes | quran_sync: 30/60s | No (host only) |
| 16 | `quran_reciter_change` | `handleQuranReciterChange` | 796-819 | Yes | quran_reciter: 10/60s | No (host only) |

### Server → Client Events (14 total)

| # | Event Name | Emitted From | Target Room/Socket | Data Shape |
|---|-----------|-------------|-------------------|------------|
| 1 | `new_notification` | `onModuleInit` (Redis pub/sub) | `user:{userId}` | `notification` (opaque object from pub/sub message) |
| 2 | `user_online` | `handleConnection` | `conversation:{convId}` (each conv) | `{ userId: string, isOnline: true }` |
| 3 | `user_offline` | `handleDisconnect` | `conversation:{convId}` (each conv) | `{ userId: string, isOnline: false }` |
| 4 | `new_message` | `handleMessage` | `conversation:{conversationId}` | Full message object from `messagesService.sendMessage()` |
| 5 | `user_typing` | `handleTyping` | `conversation:{conversationId}` (except sender) | `{ userId: string, isTyping: boolean }` |
| 6 | `messages_read` | `handleRead` | `conversation:{conversationId}` | `{ userId: string }` |
| 7 | `online_status` | `handleGetOnlineStatus` | Requesting socket only | `Array<{ userId: string, isOnline: boolean }>` |
| 8 | `incoming_call` | `handleCallInitiate` | Target user's socket IDs | `{ sessionId: string, callType: string, callerId: string }` |
| 9 | `call_answered` | `handleCallAnswer` | Caller's socket IDs | `{ sessionId: string, answeredBy: string }` |
| 10 | `call_rejected` | `handleCallReject` | Caller's socket IDs | `{ sessionId: string, rejectedBy: string }` |
| 11 | `call_ended` | `handleCallEnd` | Each participant's socket IDs | `{ sessionId: string, endedBy: string }` |
| 12 | `call_signal` | `handleCallSignal` | Target user's socket IDs | `{ fromUserId: string, signal: unknown }` |
| 13 | `delivery_receipt` | `handleMessageDelivered` | Sender's socket IDs only | `{ messageId: string, deliveredAt: string, deliveredTo: string }` |
| 14 | `quran_room_update` | join/leave/disconnect Quran handlers | `quran:{roomId}` | `{ roomId, hostId, currentSurah, currentVerse, reciterId, participantCount }` |
| 15 | `quran_verse_changed` | `handleQuranVerseSync` | `quran:{roomId}` | `{ surahNumber: number, verseNumber: number }` |
| 16 | `quran_reciter_updated` | `handleQuranReciterChange` | `quran:{roomId}` | `{ reciterId: string }` |
| 17 | `host_changed` | `transferQuranRoomHost` | `quran:{roomId}` | `{ roomId: string, newHostId: string }` |
| 18 | `error` | Various handlers | Requesting socket only | `{ message: string }` |

---

## 11. Room Patterns

| Pattern | Purpose | Joined By | Used For |
|---------|---------|----------|---------|
| `user:{userId}` | Personal user room | `handleConnection` (line 236) | `new_notification` delivery |
| `conversation:{conversationId}` | Conversation room | `handleJoin` (line 337) | `new_message`, `user_typing`, `messages_read`, `user_online`, `user_offline` |
| `quran:{roomId}` | Quran listening room | `handleJoinQuranRoom` (line 698) | `quran_room_update`, `quran_verse_changed`, `quran_reciter_updated`, `host_changed` |

**Socket data properties:**
- `client.data.userId: string` — authenticated user ID
- `client.data.quranRooms: string[]` — list of Quran room IDs this socket is in

---

## 12. Presence System

### Redis Key Structure

| Key Pattern | Type | TTL | Purpose |
|------------|------|-----|---------|
| `presence:{userId}` | Set | 300s (5 min) | Set of socket IDs for a user |

### Flow

1. **Connection**: `SADD presence:{userId} {socketId}` + `EXPIRE 300`.
2. **Heartbeat**: Every 120s, `EXPIRE presence:{userId} 300` (refreshes TTL while connected).
3. **Disconnect**: `SREM presence:{userId} {socketId}`. If `SCARD == 0`, `DEL presence:{userId}` + update `lastSeenAt` in DB.
4. **Online check**: `SCARD presence:{userId}` > 0 means online.
5. **Multi-device**: Multiple socket IDs in the set. User is offline only when ALL sockets disconnect.

### Online/Offline Broadcasting

- **Scoped, not global**: Online/offline broadcasts only go to the user's conversation rooms (up to 100 conversations).
- `user_online` emitted on connection via `client.to(conversation:{convId})` — excludes the connecting socket.
- `user_offline` emitted on last socket disconnect via `server.to(conversation:{convId})`.

### Heartbeat Timers

- Stored in `Map<string, NodeJS.Timer>` keyed by socketId.
- Created in `handleConnection`, cleared in `handleDisconnect`.
- Interval: 120,000ms (2 minutes).
- Purpose: prevent presence key from expiring while socket is active (TTL is 5 min, heartbeat at 2 min = always refreshed).
- Redis failure in heartbeat is silently caught — presence expires naturally after 5 min.

---

## 13. Quran Room Management

### Redis Key Structure

| Key Pattern | Type | TTL | Purpose |
|------------|------|-----|---------|
| `quran:room:{roomId}` | Hash | 3600s (1 hr) | Room state: `{ hostId, currentSurah, currentVerse, reciterId }` |
| `quran:room:{roomId}:participants` | Set | 3600s (1 hr) | Set of socket IDs in the room |

### Room Lifecycle

1. **Creation**: First socket to join creates the Hash via `HMSET`. First joiner becomes host.
2. **Join**: `SADD` socket to participants set. Cap enforced at 50 participants.
3. **Verse sync**: Host only. Updates `currentSurah` and `currentVerse` in Hash.
4. **Reciter change**: Host only. Updates `reciterId` in Hash.
5. **Leave**: `SREM` socket from participants. If empty → `DEL` both keys + mark DB `status: 'ended'`.
6. **Host transfer**: When host leaves/disconnects, `transferQuranRoomHost()` picks first remaining socket, updates Redis Hash + DB + emits `host_changed`.
7. **Auto-cleanup**: TTL of 1 hour ensures abandoned rooms are cleaned from Redis.

### Host Transfer Logic (`transferQuranRoomHost`, lines 134-164)

1. `server.in(quran:{roomId}).fetchSockets()` — gets all connected sockets in the room.
2. If none remaining, returns null.
3. Picks `remainingSockets[0]` as new host.
4. Reads `newHostSocket.data.userId`.
5. Updates Redis: `HSET quran:room:{roomId} hostId {newHostUserId}`.
6. Updates DB: `prisma.audioRoom.update({ where: { id: roomId }, data: { hostId: newHostUserId } })` — with `.catch()` for graceful failure.
7. Emits `host_changed` event to room.
8. Error handling: catches all errors, logs, returns null.

### DB Model (AudioRoom, schema.prisma:2720-2742)

```prisma
model AudioRoom {
  id                String                 @id @default(cuid())
  title             String                 @db.VarChar(300)
  description       String?                @db.VarChar(2000)
  hostId            String
  host              User                   @relation(...)
  status            String                 @default("live") @db.VarChar(20)
  scheduledAt       DateTime?
  startedAt         DateTime?
  endedAt           DateTime?
  maxSpeakers       Int                    @default(10)
  isRecording       Boolean                @default(false)
  recordingUrl      String?
  recordingDuration Int?
  isPersistent      Boolean                @default(false)
  participants      AudioRoomParticipant[]
  @@index([hostId])
  @@index([status])
  @@map("audio_rooms")
}
```

---

## 14. Rate Limiting

### Implementation (`checkRateLimit`, lines 166-171)

```typescript
private async checkRateLimit(userId: string, event = 'message', limit = 30, windowSec = 60): Promise<boolean> {
  const key = `ws:ratelimit:${event}:${userId}`;
  const count = await this.redis.incr(key);
  if (count === 1) await this.redis.expire(key, windowSec);
  return count <= limit;
}
```

- Uses Redis INCR + EXPIRE pattern (sliding window approximation).
- Key format: `ws:ratelimit:{event}:{userId}`
- Returns `true` if under limit, `false` if exceeded.

### Connection Rate Limiting (lines 176-185)

- Key: `ws:conn:{ip}`
- Limit: 10 connections/min/IP
- Action on exceed: log warning + disconnect

### Per-Event Rate Limits

| Event | Redis Key Suffix | Limit | Window |
|-------|-----------------|-------|--------|
| `send_message` | `message` | 30 | 60s |
| `join_conversation` | `join` | 20 | 60s |
| `leave_conversation` | `leave` | 20 | 60s |
| `typing` | `typing` | 10 | 10s |
| `read` | `read` | 30 | 60s |
| `get_online_status` | `online` | 10 | 60s |
| `call_initiate` | `call` | 3 | 60s |
| `call_answer` | `call` | 10 | 60s |
| `call_reject` | `call` | 10 | 60s |
| `call_end` | `call` | 10 | 60s |
| `call_signal` | `signal` | 60 | 10s |
| `message_delivered` | `delivered` | 60 | 60s |
| `join_quran_room` | `quran_join` | 10 | 60s |
| `leave_quran_room` | `quran_leave` | 10 | 60s |
| `quran_verse_sync` | `quran_sync` | 30 | 60s |
| `quran_reciter_change` | `quran_reciter` | 10 | 60s |

**Note:** `call_initiate` has the most restrictive limit at 3/60s. `call_signal` is the most permissive at 60/10s (WebRTC needs rapid signaling).

### Redis Keys Used for Rate Limiting

| Key Pattern | TTL | Purpose |
|------------|-----|---------|
| `ws:conn:{ip}` | 60s | Connection flood prevention |
| `ws:ratelimit:{event}:{userId}` | Per-event (10-60s) | Per-event-type rate limit |

---

## 15. Notification Pub/Sub

### How It Works

1. **Publisher**: `NotificationsService` (elsewhere in codebase) publishes to Redis channel `'notification:new'` with JSON `{ userId, notification }`.
2. **Subscriber**: `ChatGateway.onModuleInit()` creates a duplicate Redis connection and subscribes.
3. **Delivery**: On message received, parses JSON and emits `'new_notification'` to Socket.io room `user:{userId}`.
4. **Failure mode**: If Redis subscription fails, logs warning — notifications still work via REST API polling, just no real-time push.

### Redis Channel

| Channel | Direction | Message Shape |
|---------|----------|---------------|
| `notification:new` | NotificationsService → ChatGateway | `{ userId: string, notification: object }` |

---

## 16. Known Issues & Gaps

### CRITICAL: CallType Enum Mismatch

- **Prisma enum `CallType`**: `VOICE | VIDEO`
- **Socket DTO `WsCallInitiateDto.callType`**: `@IsIn(['AUDIO', 'VIDEO'])` — validates `AUDIO`
- **REST DTO `InitiateCallDto.callType`**: `@IsEnum(CallType)` — validates `VOICE`
- **Impact**: If mobile sends `callType: 'AUDIO'` via socket but REST API expects `VOICE`, they're mismatched. Socket DTO will accept 'AUDIO' but Prisma won't if it's ever persisted from socket side.

### Missing Socket Emits from Mobile (documented in Session 5)

The mobile `useWebRTC.ts` hook was rewritten but still does NOT emit `call_initiate`, `call_answer`, and `call_end` socket events — calls are non-functional end-to-end.

### createGroupCall: conversationId Not Stored

`createGroupCall()` receives `conversationId` as a parameter but the `CallSession` model has no `conversationId` field. The relationship between a group call and its conversation is lost.

### No Missed Call Timeout

`missedCall()` method exists and is exported but no controller endpoint, scheduled job, or socket event triggers it. Ringing calls will stay in RINGING status indefinitely unless ended.

### No Socket Events for REST Call Actions

The REST endpoints (`answer`, `decline`, `end`) don't emit socket events. If User A answers via REST, User B won't know via socket. The gateway call events and REST call endpoints are two separate paths with no integration.

### Delivery Receipt Race Condition

In `handleMessageDelivered` (line 640-643), `prisma.message.updateMany` is fire-and-forget. If the message doesn't exist, the error is silently swallowed. The delivery receipt (line 654) is still emitted even if the DB update failed.

### Privacy Check Queries

Both `typing` and `read` handlers query `userSettings` on every event. At high typing frequency (up to 10/10s), this could be 1 DB query per typing event. Could benefit from Redis caching.

---

## 17. Test Coverage

### Calls Module Tests

| File | Tests | Coverage |
|------|-------|---------|
| `calls.controller.spec.ts` | 6 | Controller delegation: initiate, answer, decline, end, active, history |
| `calls.service.spec.ts` | 17 | Full service: initiate (2), answer (2), end (2), decline (4), missedCall (1), getHistory (2), getActiveCall (2), getIceServers (1), createGroupCall (2), shareScreen (3), stopScreenShare (2) |
| `calls-webrtc.spec.ts` | 9 | Signal structure validation (offer/answer/ICE), session lifecycle transitions, call type constraints. Also includes unrelated drawing canvas tests. |

### Gateway Tests

| File | Tests | Coverage |
|------|-------|---------|
| `chat.gateway.spec.ts` | ~50+ | handleJoin (4), handleLeave (3), handleMessage (4), handleTyping (3), handleRead (2), online presence (6), handleConnection errors (5), handleDisconnect (5), handleCallInitiate (4), handleCallAnswer (4), handleCallReject (4), handleCallEnd (3), handleCallSignal (5), handleMessageDelivered (5), handleJoinQuranRoom (4), handleLeaveQuranRoom (3+) |
| `chat.gateway.ratelimit.spec.ts` | 3 | Rate limit key format, per-event limits verification, connection rate limit |

### Total: ~85 tests across calls + gateway
