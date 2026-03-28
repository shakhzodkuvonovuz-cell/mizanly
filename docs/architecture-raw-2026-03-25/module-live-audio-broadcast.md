# Module Architecture: Live, Audio Rooms, Broadcast

> Extracted 2026-03-25. Every endpoint, service method, DTO field, and line number documented.

---

## 1. LIVE MODULE

### 1.1 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `live.module.ts` | 10 | NestJS module (exports LiveService) |
| `live.controller.ts` | 232 | 20 REST endpoints |
| `live.service.ts` | 430 | Core business logic, Prisma queries |
| `dto/create-live.dto.ts` | 34 | Create session DTO |
| `live.controller.spec.ts` | 168 | Controller unit tests (14 tests) |
| `live.service.spec.ts` | 281 | Service unit tests (18 tests) |
| `live.service.edge.spec.ts` | 113 | Edge case tests (6 tests) |
| `live.service.auth.spec.ts` | 68 | Authorization matrix tests (6 tests) |
| `live.service.enum.spec.ts` | 60 | Enum validation tests (4 tests) |

**Total test suites:** 5 | **Total tests:** ~48

### 1.2 Module Definition

**File:** `apps/api/src/modules/live/live.module.ts` (L1-10)

```
Module: LiveModule
Controllers: [LiveController]
Providers: [LiveService]
Exports: [LiveService]
```

No imports from other modules. Depends only on PrismaService (globally provided).

### 1.3 Prisma Enums Used

From `@prisma/client`:
- `LiveStatus` — SCHEDULED, LIVE, ENDED, CANCELLED
- `LiveType` — VIDEO_STREAM, AUDIO_SPACE
- `LiveRole` — VIEWER, RAISED_HAND, SPEAKER, HOST, MODERATOR

### 1.4 DTOs

#### CreateLiveDto (L1-34, `dto/create-live.dto.ts`)

| Field | Type | Validation | Required | Example |
|-------|------|------------|----------|---------|
| `title` | string | @IsString, @MaxLength(200) | YES | "Friday Khutbah" |
| `description` | string | @IsString, @MaxLength(1000) | NO | |
| `thumbnailUrl` | string | @IsUrl | NO | |
| `liveType` | string | @IsEnum(['VIDEO_STREAM', 'AUDIO_SPACE']) | YES | "VIDEO_STREAM" |
| `scheduledAt` | string | @IsDateString | NO | "2026-04-01T10:00:00Z" |
| `isRecorded` | boolean | @IsBoolean | NO (default true) | true |

#### StartRehearsalDto (controller L11-15, inline)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `title` | string | @IsString, @MaxLength(200) | YES |
| `description` | string | @IsString, @MaxLength(1000) | NO |
| `thumbnailUrl` | string | @IsUrl | NO |

#### SetSubscribersOnlyDto (controller L17-19, inline)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `subscribersOnly` | boolean | @IsBoolean | YES |

#### SetRecordingDto (controller L21-23, inline)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `recordingUrl` | string | @IsUrl | YES |

#### InviteGuestDto (controller L25-27, inline)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `guestUserId` | string | @IsString | YES |

#### CreateGroupCallDto (controller L29-32, inline — DEFINED BUT UNUSED)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `conversationId` | string | @IsString | YES |
| `participantIds` | string[] | @IsArray, @IsString({each}), @ArrayMaxSize(7) | YES |

### 1.5 LIVE_SESSION_LIST_SELECT (service L8-28)

Lightweight select for list views. **Excludes:** streamKey, playbackUrl, streamId, recordingUrl (credentials/heavy fields).

```
Fields: id, hostId, title, description, thumbnailUrl, liveType, status,
        currentViewers, totalViews, peakViewers, isRecorded, isRehearsal,
        isSubscribersOnly, scheduledAt, startedAt, endedAt, createdAt, updatedAt
Host relation: id, username, displayName, avatarUrl, isVerified
```

### 1.6 Controller Endpoints

**Base path:** `/api/v1/live`
**Global throttle:** 30 req/60s
**Swagger tag:** "Live Sessions"

| # | Method | Path | Auth | Throttle | Summary | Controller Line | Service Method |
|---|--------|------|------|----------|---------|----------------|----------------|
| 1 | POST | `/` | ClerkAuthGuard | 3/hour | Create live session | L40-47 | `create()` |
| 2 | GET | `/active` | OptionalClerk | default | Get active live sessions | L49-54 | `getActive()` |
| 3 | GET | `/scheduled` | OptionalClerk | default | Get upcoming scheduled sessions | L56-61 | `getScheduled()` |
| 4 | GET | `/my` | ClerkAuthGuard | default | Get my live sessions | L63-69 | `getHostSessions()` |
| 5 | GET | `/:id` | OptionalClerk | default | Get live session details | L71-76 | `getById()` |
| 6 | POST | `/:id/start` | ClerkAuthGuard | default | Start scheduled live session | L78-85 | `startLive()` |
| 7 | POST | `/:id/end` | ClerkAuthGuard | default | End live session | L87-94 | `endLive()` |
| 8 | POST | `/:id/cancel` | ClerkAuthGuard | default | Cancel scheduled session | L96-103 | `cancelLive()` |
| 9 | POST | `/:id/join` | ClerkAuthGuard | default | Join live session | L105-112 | `join()` |
| 10 | POST | `/:id/leave` | ClerkAuthGuard | default | Leave live session | L114-121 | `leave()` |
| 11 | POST | `/:id/raise-hand` | ClerkAuthGuard | default | Raise hand in audio space | L123-130 | `raiseHand()` |
| 12 | POST | `/:id/promote/:targetUserId` | ClerkAuthGuard | default | Promote participant to speaker | L132-139 | `promoteToSpeaker()` |
| 13 | POST | `/:id/demote/:targetUserId` | ClerkAuthGuard | default | Demote speaker to viewer | L141-148 | `demoteToViewer()` |
| 14 | PATCH | `/:id/recording` | ClerkAuthGuard | default | Set recording URL | L150-156 | `updateRecording()` |
| 15 | POST | `/:id/guests/invite` | ClerkAuthGuard | default | Invite a guest to live (max 4) | L160-166 | `inviteGuest()` |
| 16 | POST | `/:id/guests/accept` | ClerkAuthGuard | default | Accept guest invitation | L168-174 | `acceptGuestInvite()` |
| 17 | DELETE | `/:id/guests/:userId` | ClerkAuthGuard | default | Remove a guest from live | L176-182 | `removeGuest()` |
| 18 | GET | `/:id/guests` | ClerkAuthGuard | default | List guests in live session | L184-190 | `listGuests()` |
| 19 | POST | `/rehearse` | ClerkAuthGuard | 5/hour | Start a rehearsal | L194-201 | `startRehearsal()` |
| 20 | PATCH | `/:id/go-live` | ClerkAuthGuard | default | Transition rehearsal to public | L203-209 | `goLiveFromRehearsal()` |
| 21 | PATCH | `/:id/end-rehearsal` | ClerkAuthGuard | default | End rehearsal without going public | L211-217 | `endRehearsal()` |
| 22 | PATCH | `/:id/subscribers-only` | ClerkAuthGuard | default | Toggle subscribers-only mode | L221-231 | `setSubscribersOnly()` |

### 1.7 Service Methods — Full Documentation

#### `create(userId, data)` — L34-51

Creates a new live session. Generates a 16-byte hex `streamKey` via `crypto.randomBytes`.
- If `scheduledAt` provided: status = SCHEDULED, no startedAt
- If no `scheduledAt`: status = LIVE, startedAt = now
- `isRecorded` defaults to true
- Returns created session with host relation

#### `getById(sessionId)` — L53-92

Returns full session details with select (NOT include). **Excludes streamKey** (credential).
- Includes participants where `leftAt: null`, take 20, with user relation
- Includes recordingUrl (unlike list select)
- Throws NotFoundException if not found

#### `getActive(liveType?, cursor?, limit=20)` — L94-116

Returns paginated active (LIVE) sessions. Filters out rehearsals (`isRehearsal: false`).
- Validates liveType against LiveType enum values, throws BadRequestException for invalid
- Orders by `currentViewers DESC`
- Uses cursor-based keyset pagination (`id: { lt: cursor }`)
- Uses LIVE_SESSION_LIST_SELECT (lightweight, no streamKey)

#### `getScheduled(cursor?, limit=20)` — L118-128

Returns upcoming scheduled sessions where `scheduledAt >= now`.
- Orders by `scheduledAt ASC`
- Uses LIVE_SESSION_LIST_SELECT

#### `startLive(sessionId, userId)` — L130-140

Transitions SCHEDULED session to LIVE.
- Calls `requireHost()` (throws NotFoundException or ForbiddenException)
- Validates status transitions: rejects ENDED, CANCELLED, LIVE, and anything != SCHEDULED
- Sets startedAt to now

#### `endLive(sessionId, userId)` — L142-153

Ends a LIVE session.
- Rejects if status != LIVE
- Marks all participants as left (updateMany with leftAt)
- Sets status ENDED, endedAt now, currentViewers 0

#### `cancelLive(sessionId, userId)` — L155-164

Cancels SCHEDULED or LIVE session.
- Rejects ENDED and CANCELLED statuses

#### `join(sessionId, userId, role='VIEWER')` — L166-220

Joins a live session.
- Rejects if not LIVE
- Host is implicitly in session (returns early with currentViewers)
- **Subscribers-only enforcement:** Checks Follow table for `followerId/followingId` pair. Throws ForbiddenException if not following host.
- **Re-join logic:** If participant exists with leftAt set, updates leftAt=null, increments only currentViewers (NOT totalViews)
- **First join:** Creates participant, increments both currentViewers and totalViews
- Uses raw SQL `$executeRaw` with `GREATEST("peakViewers", "currentViewers" + 1)` for atomic peak tracking
- Returns `{ joined: true, currentViewers }`

#### `leave(sessionId, userId)` — L222-240

Leaves a live session.
- Idempotent: returns `{ left: true }` if participant not found or already left
- Sets leftAt on participant
- Uses raw SQL `GREATEST("currentViewers" - 1, 0)` to prevent negative viewer count

#### `raiseHand(sessionId, userId)` — L242-258

Raises hand for a viewer.
- Validates session exists and is LIVE
- Validates participant exists and role is VIEWER (speakers/hosts cannot raise hand)
- Updates role to 'RAISED_HAND'

#### `promoteToSpeaker(sessionId, hostId, targetUserId)` — L260-266

Host promotes any participant to SPEAKER.
- Only requireHost check, no additional role validation on target

#### `demoteToViewer(sessionId, hostId, targetUserId)` — L268-274

Host demotes any participant to VIEWER.

#### `updateRecording(sessionId, userId, recordingUrl)` — L276-282

Sets recording URL on session. Host-only.

#### `getHostSessions(userId, cursor?, limit=20)` — L284-294

Returns all sessions hosted by user, ordered by createdAt DESC.
- Uses LIVE_SESSION_LIST_SELECT

#### `inviteGuest(liveId, userId, hostId)` — L298-314

Invites a guest to a live session.
- **Max 4 guests** (counts ACCEPTED guests)
- Session must be LIVE
- Uses upsert: re-invites if previously invited/removed
- Returns guest with user relation

#### `acceptGuestInvite(liveId, userId)` — L316-333

Accepts a pending guest invitation.
- Verifies guest status is 'INVITED'
- **Race condition protection:** Rechecks accepted count before accepting
- Sets status ACCEPTED, joinedAt now

#### `removeGuest(liveId, guestUserId, hostId)` — L335-341

Removes a guest. Host-only.
- Sets status 'REMOVED', leftAt now

#### `listGuests(liveId)` — L343-350

Lists guests with status INVITED or ACCEPTED.
- Includes user relation
- Ordered by createdAt ASC, take 50

#### `startRehearsal(userId, data)` — L358-375

Creates a rehearsal session (not visible in feeds).
- Always VIDEO_STREAM type
- Status: LIVE, isRehearsal: true, isRecorded: false
- Returns with host relation

#### `goLiveFromRehearsal(sessionId, userId)` — L381-390

Transitions rehearsal to public.
- Validates isRehearsal = true and status = LIVE
- Simply sets isRehearsal = false (makes it visible in getActive feed)

#### `endRehearsal(sessionId, userId)` — L395-409

Ends rehearsal without going public.
- Validates isRehearsal = true
- Marks all participants left, sets ENDED, endedAt, currentViewers 0

#### `setSubscribersOnly(sessionId, userId, subscribersOnly)` — L416-422

Toggles subscribers-only mode. Host-only.

#### `requireHost(sessionId, userId)` — L424-429 (private)

Private helper. Finds session, validates host ownership.
- Throws NotFoundException if session not found
- Throws ForbiddenException if userId != hostId

### 1.8 Live Session Lifecycle

```
[Create] ─→ SCHEDULED ─→ [startLive] ─→ LIVE ─→ [endLive] ─→ ENDED
                                           │
                                           ├──→ [cancelLive] ─→ CANCELLED
                                           │
[Create w/o scheduledAt] ──────────────→ LIVE ─→ [endLive] ─→ ENDED

[startRehearsal] ─→ LIVE (isRehearsal=true)
    │
    ├──→ [goLiveFromRehearsal] ─→ LIVE (isRehearsal=false) ─→ [endLive] ─→ ENDED
    │
    └──→ [endRehearsal] ─→ ENDED
```

### 1.9 Participant Roles

```
VIEWER ──→ [raiseHand] ──→ RAISED_HAND ──→ [promoteToSpeaker] ──→ SPEAKER
                                                                      │
SPEAKER ←──────────────────────────────────────────────────────────────┘
    │
    └──→ [demoteToViewer] ──→ VIEWER
```

HOST is implicit (session.hostId) — not stored as a LiveParticipant record.

### 1.10 Guest System

```
[inviteGuest] ──→ INVITED ──→ [acceptGuestInvite] ──→ ACCEPTED
                                                          │
INVITED/ACCEPTED ──→ [removeGuest] ──→ REMOVED
```

Max 4 ACCEPTED guests. Double-checked at both invite and accept time.

---

## 2. AUDIO ROOMS MODULE

### 2.1 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `audio-rooms.module.ts` | 10 | NestJS module (exports AudioRoomsService) |
| `audio-rooms.controller.ts` | 197 | 16 REST endpoints |
| `audio-rooms.service.ts` | 541 | Core business logic |
| `dto/create-audio-room.dto.ts` | 27 | Create room DTO |
| `dto/role-change.dto.ts` | 18 | Role change DTO + AudioRoomRole enum |
| `dto/mute-toggle.dto.ts` | 9 | Mute toggle DTO |
| `dto/hand-toggle.dto.ts` | 3 | Empty DTO (toggle via endpoint) |
| `audio-rooms.controller.spec.ts` | 191 | Controller unit tests (12 tests) |
| `audio-rooms.service.spec.ts` | 627 | Service unit tests (26 tests) |

**Total test suites:** 2 | **Total tests:** ~38

### 2.2 Module Definition

**File:** `apps/api/src/modules/audio-rooms/audio-rooms.module.ts` (L1-10)

```
Module: AudioRoomsModule
Controllers: [AudioRoomsController]
Providers: [AudioRoomsService]
Exports: [AudioRoomsService]
```

### 2.3 AudioRoomRole Enum (dto/role-change.dto.ts L4-8)

Defined locally (NOT Prisma enum):
```typescript
enum AudioRoomRole {
  LISTENER = 'listener',
  SPEAKER = 'speaker',
  HOST = 'host',
}
```

### 2.4 Room Status Constants (service L14-18)

String-based status (NOT Prisma enum):
```typescript
ROOM_STATUS = {
  LIVE: 'live',
  ENDED: 'ended',
  SCHEDULED: 'scheduled',
}
```

### 2.5 DTOs

#### CreateAudioRoomDto (L1-27, `dto/create-audio-room.dto.ts`)

| Field | Type | Validation | Required | Default |
|-------|------|------------|----------|---------|
| `title` | string | @IsString, @MaxLength(300) | YES | |
| `description` | string | @IsString, @MaxLength(2000) | NO | |
| `scheduledAt` | string | @IsDateString | NO | |
| `maxSpeakers` | number | @IsInt, @Min(1), @Max(50) | NO | 10 |

#### RoleChangeDto (L10-18, `dto/role-change.dto.ts`)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `userId` | string | @IsString | YES |
| `role` | AudioRoomRole | @IsEnum(AudioRoomRole) | YES |

#### MuteToggleDto (L1-9, `dto/mute-toggle.dto.ts`)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `targetUserId` | string | @IsString | NO (self-mute if omitted) |

#### HandToggleDto (L1-3, `dto/hand-toggle.dto.ts`)

Empty body. Toggle is purely based on URL params.

#### StopRecordingDto (controller L25-27, inline)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `recordingUrl` | string | @IsUrl | NO |

### 2.6 Select Constants

#### ROOM_SELECT (service L20-63)

```
Fields: id, title, description, hostId, status, scheduledAt, startedAt,
        endedAt, maxSpeakers, isRecording, isPersistent, createdAt
Host: id, username, displayName, avatarUrl, isVerified
Participants (take 50): id, userId, role, isMuted, handRaised, joinedAt,
    user: { id, username, displayName, avatarUrl, isVerified }
_count: { participants: true }
```

#### PARTICIPANT_SELECT (service L65-82)

```
Fields: id, roomId, userId, role, isMuted, handRaised, joinedAt
User: id, username, displayName, avatarUrl, isVerified
```

### 2.7 Controller Endpoints

**Base path:** `/api/v1/audio-rooms`
**Swagger tag:** "Audio Rooms"

| # | Method | Path | Auth | Throttle | Summary | Controller Line | Service Method |
|---|--------|------|------|----------|---------|----------------|----------------|
| 1 | POST | `/` | ClerkAuthGuard | 10/60s | Create audio room | L37-43 | `create()` |
| 2 | GET | `/` | OptionalClerk | default | List active audio rooms | L45-54 | `list()` |
| 3 | GET | `/active` | OptionalClerk | default | Get active rooms with participant counts | L56-61 | `getActiveRooms()` |
| 4 | GET | `/upcoming` | OptionalClerk | default | Get upcoming scheduled rooms | L63-68 | `getUpcomingRooms()` |
| 5 | GET | `/recordings` | ClerkAuthGuard | default | List my room recordings | L70-76 | `listRecordings()` |
| 6 | GET | `/:id` | OptionalClerk | default | Get audio room detail | L80-88 | `getById()` |
| 7 | GET | `/:id/recording` | OptionalClerk | default | Get room recording | L90-95 | `getRecording()` |
| 8 | DELETE | `/:id` | ClerkAuthGuard | 10/60s | End audio room (host only) | L97-105 | `endRoom()` |
| 9 | POST | `/:id/join` | ClerkAuthGuard | 10/60s | Join audio room as listener | L107-114 | `join()` |
| 10 | DELETE | `/:id/leave` | ClerkAuthGuard | 10/60s | Leave audio room | L116-124 | `leave()` |
| 11 | PATCH | `/:id/role` | ClerkAuthGuard | 10/60s | Change participant role (host only) | L126-137 | `changeRole()` |
| 12 | PATCH | `/:id/hand` | ClerkAuthGuard | 10/60s | Toggle hand raised | L139-150 | `toggleHand()` |
| 13 | PATCH | `/:id/mute` | ClerkAuthGuard | 10/60s | Toggle mute (self or host for others) | L152-163 | `toggleMute()` |
| 14 | POST | `/:id/recording/start` | ClerkAuthGuard | 5/60s | Start recording (host only) | L165-173 | `startRecording()` |
| 15 | POST | `/:id/recording/stop` | ClerkAuthGuard | 5/60s | Stop recording (host only) | L175-183 | `stopRecording()` |
| 16 | GET | `/:id/participants` | OptionalClerk | default | List participants by role | L185-196 | `listParticipants()` |

### 2.8 Service Methods — Full Documentation

#### `create(userId, dto)` — L91-123

Creates room + host participant atomically in a `$transaction`.
- If scheduledAt: status = 'scheduled', startedAt = null
- Otherwise: status = 'live', startedAt = now
- maxSpeakers defaults to 10
- Host is added as participant with role HOST, isMuted false, handRaised false
- Returns room via ROOM_SELECT

#### `list(viewerId, cursor?, limit=20)` — L126-153

Lists rooms with status 'live' OR 'scheduled'.
- Cursor is ISO date string (`createdAt: { lt: new Date(cursor) }`)
- Orders by createdAt DESC
- Uses ROOM_SELECT

#### `getById(id, viewerId?)` — L156-168

Returns single room by ID with ROOM_SELECT.
- Throws NotFoundException if not found
- viewerId parameter accepted but not currently used for additional logic

#### `endRoom(id, userId)` — L171-204

Ends room. Host-only.
- Validates: not found (404), not host (403), already ended (400)
- Uses array-based `$transaction`: deleteMany participants + update room status
- Sets status 'ended', endedAt now

#### `join(id, userId)` — L207-258

Joins room as LISTENER.
- Validates room exists and is 'live'
- **Idempotent:** Returns existing room if already a participant
- **P2002 race condition handling:** Catches duplicate key error and returns room idempotently
- New participants: role LISTENER, isMuted true, handRaised false
- Returns updated room via ROOM_SELECT

#### `leave(id, userId)` — L261-287

Leaves room.
- Throws BadRequestException if not a participant
- **Host leaving = room ends** (delegates to `endRoom()`)
- Non-host: deletes participant record entirely
- Returns `{ success: true }`

#### `changeRole(id, userId, dto)` — L290-343

Changes participant role. Host-only.
- Validates: room exists, caller is host, room is live, target participant exists
- **Cannot change HOST role** (either from or to)
- **maxSpeakers enforcement:** When promoting to SPEAKER, counts existing speakers + hosts vs maxSpeakers
- Only LISTENER <-> SPEAKER transitions supported
- Returns `{ success: true }`

#### `toggleHand(id, userId)` — L346-365

Toggles hand raised state. **Listeners only.**
- Throws BadRequestException if not participant or not LISTENER role
- Returns `{ handRaised: <new boolean> }`

#### `toggleMute(id, userId, targetUserId?)` — L368-410

Toggles mute for self or others.
- If no targetUserId or targetUserId === userId: self-mute (anyone can do)
- If different targetUserId: HOST only can mute others
- Validates room exists, is live, target participant exists
- Returns `{ isMuted: <new boolean> }`

#### `listParticipants(id, viewerId?, role?, cursor?, limit=50)` — L413-447

Lists participants with optional role filter.
- Cursor is ISO date string (`joinedAt: { lt: new Date(cursor) }`)
- Uses PARTICIPANT_SELECT
- Orders by joinedAt DESC
- hasMore = participants.length === limit

#### `startRecording(roomId, userId)` — L451-461

Starts recording. Host-only.
- Room must be 'live'
- Sets isRecording = true

#### `stopRecording(roomId, userId, recordingUrl?)` — L463-473

Stops recording. Host-only.
- Calculates recording duration from startedAt to now
- Sets isRecording false, recordingUrl, recordingDuration (seconds)

#### `getRecording(roomId)` — L475-482

Gets recording for a room.
- Returns id, title, recordingUrl, recordingDuration, endedAt
- Throws NotFoundException if no recording

#### `listRecordings(userId)` — L484-491

Lists all recordings by host user.
- Filters by hostId and recordingUrl not null
- Orders by endedAt DESC, take 50

#### `getActiveRooms(cursor?, limit=20)` — L495-508

Discovery endpoint: active rooms with participant counts.
- Filters by status 'live'
- Uses include (not select) with host relation and _count
- Cursor-based pagination by id

#### `getUpcomingRooms(cursor?, limit=20)` — L510-526

Discovery endpoint: upcoming rooms.
- Filters by status 'scheduled', scheduledAt >= now
- Orders by scheduledAt ASC

#### `createPersistentRoom(communityId, name, userId)` — L530-539

Creates a persistent voice channel (like Discord).
- Sets isPersistent = true
- Status immediately 'live'
- NOTE: `communityId` parameter is accepted but NOT stored (no field on AudioRoom model)

### 2.9 Audio Room Lifecycle

```
[create w/ scheduledAt] ─→ SCHEDULED ─→ (manual start not implemented) ─→ LIVE
[create w/o scheduledAt] ─→ LIVE ─→ [endRoom or host leaves] ─→ ENDED

Persistent rooms: always LIVE, isPersistent = true
```

NOTE: There is no `startRoom()` method to transition SCHEDULED -> LIVE. This appears to be a gap.

### 2.10 Participant Role Transitions

```
[join] ─→ LISTENER ──→ [changeRole to SPEAKER] ──→ SPEAKER
                  │                                     │
                  │     [changeRole to LISTENER] ←──────┘
                  │
                  └──→ [toggleHand] ──→ LISTENER (handRaised=true)
                                              │
                                              └──→ [toggleHand] ──→ LISTENER (handRaised=false)

HOST role: immutable, set on creation only
```

### 2.11 Mute Control

```
Self-mute: any participant (no targetUserId)
Mute others: HOST only (requires targetUserId != userId)
Toggle: always flips current isMuted state
```

---

## 3. BROADCAST MODULE

### 3.1 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `broadcast.module.ts` | 10 | NestJS module (exports BroadcastService) |
| `broadcast.controller.ts` | 187 | 19 REST endpoints |
| `broadcast.service.ts` | 275 | Core business logic |
| `dto/create-channel.dto.ts` | 28 | Create channel DTO |
| `dto/send-broadcast.dto.ts` | 26 | Send message DTO |
| `dto/update-channel.dto.ts` | 22 | Update channel DTO |
| `broadcast.controller.spec.ts` | 224 | Controller unit tests (18 tests) |
| `broadcast.service.spec.ts` | 340 | Service unit tests (24 tests) |
| `broadcast.service.edge.spec.ts` | 80 | Edge case tests (6 tests) |

**Total test suites:** 3 | **Total tests:** ~48

### 3.2 Module Definition

**File:** `apps/api/src/modules/broadcast/broadcast.module.ts` (L1-10)

```
Module: BroadcastModule
Controllers: [BroadcastController]
Providers: [BroadcastService]
Exports: [BroadcastService]
```

### 3.3 Prisma Enums Used

From `@prisma/client`:
- `ChannelRole` — OWNER, ADMIN, SUBSCRIBER
- `ChannelType` — BROADCAST (used in channel creation)
- `MessageType` — TEXT, IMAGE, VIDEO, VOICE, FILE

### 3.4 DTOs

#### CreateBroadcastChannelDto (L1-28, `dto/create-channel.dto.ts`)

| Field | Type | Validation | Required | Example |
|-------|------|------------|----------|---------|
| `name` | string | @IsString, @MinLength(2), @MaxLength(100) | YES | "Islamic Reminders" |
| `slug` | string | @IsString, @MinLength(2), @MaxLength(50), @Matches(/^[a-z0-9-]+$/) | YES | "islamic-reminders" |
| `description` | string | @IsString, @MaxLength(1000) | NO | |
| `avatarUrl` | string | @IsUrl | NO | |

Slug validation: lowercase alphanumeric with hyphens only.

#### SendBroadcastDto (L1-26, `dto/send-broadcast.dto.ts`)

| Field | Type | Validation | Required | Default |
|-------|------|------------|----------|---------|
| `content` | string | @IsString, @MaxLength(5000) | NO | |
| `messageType` | string | @IsEnum(['TEXT','IMAGE','VIDEO','VOICE','FILE']) | NO | 'TEXT' |
| `mediaUrl` | string | @IsUrl | NO | |
| `mediaType` | string | @IsString, @MaxLength(30) | NO | |

#### UpdateBroadcastChannelDto (L1-22, `dto/update-channel.dto.ts`)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `name` | string | @IsString, @MaxLength(100) | NO |
| `description` | string | @IsString, @MaxLength(1000) | NO |
| `avatarUrl` | string | @IsUrl | NO |

NOTE: `slug` is intentionally excluded from update DTO — slugs are permanent.

#### MuteChannelDto (controller L13-15, inline)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `muted` | boolean | @IsBoolean | YES |

### 3.5 Controller Endpoints

**Base path:** `/api/v1/broadcast`
**Global throttle:** 30 req/60s
**Swagger tag:** "Broadcast Channels"

| # | Method | Path | Auth | Throttle | Summary | Controller Line | Service Method |
|---|--------|------|------|----------|---------|----------------|----------------|
| 1 | POST | `/` | ClerkAuthGuard | 5/60s | Create broadcast channel | L25-32 | `create()` |
| 2 | GET | `/discover` | OptionalClerk | default | Discover popular channels | L34-39 | `discover()` |
| 3 | GET | `/my` | ClerkAuthGuard | default | Get my subscribed channels | L41-47 | `getMyChannels()` |
| 4 | PATCH | `/messages/:messageId/pin` | ClerkAuthGuard | default | Pin message | L51-57 | `pinMessage()` |
| 5 | DELETE | `/messages/:messageId/pin` | ClerkAuthGuard | default | Unpin message | L59-66 | `unpinMessage()` |
| 6 | DELETE | `/messages/:messageId` | ClerkAuthGuard | default | Delete message | L68-75 | `deleteMessage()` |
| 7 | GET | `/:slug` | OptionalClerk | default | Get channel by slug | L79-84 | `getBySlug()` |
| 8 | PATCH | `/:id` | ClerkAuthGuard | default | Update channel | L86-92 | `update()` |
| 9 | DELETE | `/:id` | ClerkAuthGuard | default | Delete channel | L94-101 | `delete()` |
| 10 | POST | `/:id/subscribe` | ClerkAuthGuard | default | Subscribe to channel | L103-110 | `subscribe()` |
| 11 | DELETE | `/:id/subscribe` | ClerkAuthGuard | default | Unsubscribe from channel | L112-119 | `unsubscribe()` |
| 12 | GET | `/:id/subscribers` | ClerkAuthGuard | default | List subscribers (owner/admin only) | L121-127 | `getSubscribers()` |
| 13 | POST | `/:id/messages` | ClerkAuthGuard | 30/60s | Send message to channel | L129-136 | `sendMessage()` |
| 14 | GET | `/:id/messages` | OptionalClerk | default | Get channel messages | L138-143 | `getMessages()` |
| 15 | GET | `/:id/pinned` | OptionalClerk | default | Get pinned messages | L145-150 | `getPinnedMessages()` |
| 16 | PATCH | `/:id/mute` | ClerkAuthGuard | default | Mute/unmute channel | L152-158 | `muteChannel()` |
| 17 | POST | `/:id/promote/:targetUserId` | ClerkAuthGuard | default | Promote subscriber to admin | L160-167 | `promoteToAdmin()` |
| 18 | POST | `/:id/demote/:targetUserId` | ClerkAuthGuard | default | Demote admin to subscriber | L169-176 | `demoteFromAdmin()` |
| 19 | DELETE | `/:id/subscribers/:targetUserId` | ClerkAuthGuard | default | Remove subscriber | L178-185 | `removeSubscriber()` |

### 3.6 Service Methods — Full Documentation

#### `create(userId, data)` — L10-30

Creates broadcast channel and adds creator as OWNER.
- Checks slug uniqueness first (ConflictException if taken)
- Uses `$transaction` for atomicity
- Sets channelType = BROADCAST, subscribersCount = 1 (owner)
- Returns created channel

#### `getBySlug(slug)` — L32-36

Finds channel by slug. Throws NotFoundException if not found.

#### `getById(channelId)` — L38-42

Finds channel by ID. Throws NotFoundException if not found.

#### `update(channelId, userId, data)` — L44-61

Updates channel. OWNER or ADMIN required.
- **Slug immutability enforced:** If slug is in update payload and differs from current, throws BadRequestException "Cannot change broadcast channel slug after creation"
- Strips slug from update payload before writing (even if same value)
- Updates name, description, avatarUrl only

#### `delete(channelId, userId)` — L63-67

Deletes channel. OWNER only.
- Returns `{ deleted: true }`

#### `subscribe(channelId, userId)` — L69-92

Subscribes user to channel.
- **Idempotent:** Returns existing member if already subscribed
- **P2002 race condition handling:** Catches duplicate key error and returns member
- Role: SUBSCRIBER
- Increments subscribersCount via raw SQL

#### `unsubscribe(channelId, userId)` — L94-106

Unsubscribes user from channel.
- **Owner cannot unsubscribe** (ForbiddenException)
- Idempotent: returns `{ unsubscribed: true }` even if not a member
- Decrements subscribersCount via raw SQL with `GREATEST(... - 1, 0)`
- Deletes ChannelMember record

#### `getSubscribers(channelId, cursor?, userId?, limit=20)` — L108-126

Lists subscribers. OWNER or ADMIN required (if userId provided).
- Cursor by joinedAt
- Includes user relation
- Returns paginated with meta

#### `sendMessage(channelId, userId, data)` — L128-143

Sends broadcast message. OWNER or ADMIN required.
- Creates BroadcastMessage with senderId, content, messageType, mediaUrl, mediaType
- Includes sender relation in response
- Increments postsCount via raw SQL

#### `getMessages(channelId, cursor?, limit=30)` — L145-159

Returns channel messages, newest first.
- Cursor-based pagination by id
- Includes sender relation

#### `pinMessage(messageId, userId)` — L161-166

Pins a message. OWNER or ADMIN required.
- Finds message first, then checks role on its channelId
- Sets isPinned = true

#### `unpinMessage(messageId, userId)` — L168-173

Unpins a message. OWNER or ADMIN required.
- Sets isPinned = false

#### `deleteMessage(messageId, userId)` — L175-182

Deletes a message. OWNER or ADMIN required.
- Decrements postsCount via raw SQL with GREATEST

#### `getPinnedMessages(channelId)` — L184-191

Returns all pinned messages for channel.
- Orders by createdAt DESC, take 50
- Includes sender relation

#### `muteChannel(channelId, userId, muted)` — L193-202

Mutes/unmutes channel for a subscriber.
- Throws NotFoundException if not subscribed
- Updates isMuted on ChannelMember

#### `getMyChannels(userId)` — L204-212

Returns all channels user is subscribed to.
- Includes full channel data
- Maps to flat structure with role and isMuted added
- Take 50

#### `discover(cursor?, limit=20)` — L214-223

Discovers popular channels.
- Orders by subscribersCount DESC
- Uses Prisma cursor-based pagination (`cursor: { id }, skip: 1`)

#### `promoteToAdmin(channelId, ownerId, targetUserId)` — L225-236

Promotes subscriber to ADMIN. OWNER only.
- Validates target is a subscriber (NotFoundException if not)
- Cannot change OWNER role (ForbiddenException)

#### `demoteFromAdmin(channelId, ownerId, targetUserId)` — L238-249

Demotes ADMIN to SUBSCRIBER. OWNER only.
- Same validations as promote
- Cannot change OWNER role

#### `removeSubscriber(channelId, userId, targetUserId)` — L251-263

Removes a subscriber. OWNER or ADMIN required.
- Cannot remove OWNER (ForbiddenException)
- Deletes ChannelMember record
- Decrements subscribersCount

#### `requireRole(channelId, userId, roles)` — L265-273 (private)

Private helper. Validates user has one of the specified roles.
- Throws ForbiddenException "Insufficient channel permissions" if check fails

### 3.7 Channel Role Hierarchy

```
OWNER — full control (create, update, delete channel, manage admins, send messages)
ADMIN — manage content (send messages, pin/unpin, delete messages, view subscribers, remove subscribers)
SUBSCRIBER — read-only (view messages, mute channel)
```

### 3.8 Permission Matrix

| Action | OWNER | ADMIN | SUBSCRIBER | Unauthenticated |
|--------|-------|-------|------------|-----------------|
| Create channel | YES | - | - | NO |
| Update channel | YES | YES | NO | NO |
| Delete channel | YES | NO | NO | NO |
| Send message | YES | YES | NO | NO |
| Pin/unpin message | YES | YES | NO | NO |
| Delete message | YES | YES | NO | NO |
| View messages | YES | YES | YES | YES |
| View pinned | YES | YES | YES | YES |
| Subscribe | - | - | - | YES (becomes SUBSCRIBER) |
| Unsubscribe | NO (forbidden) | YES | YES | - |
| View subscribers | YES | YES | NO | NO |
| Promote to admin | YES | NO | NO | NO |
| Demote from admin | YES | NO | NO | NO |
| Remove subscriber | YES | YES | NO | NO |
| Mute channel | YES | YES | YES | NO |
| Discover channels | YES | YES | YES | YES |
| Get by slug | YES | YES | YES | YES |

---

## 4. CROSS-MODULE COMPARISON

### 4.1 Shared Patterns

| Pattern | Live | Audio Rooms | Broadcast |
|---------|------|-------------|-----------|
| Auth guard | ClerkAuthGuard | ClerkAuthGuard | ClerkAuthGuard |
| Optional auth | OptionalClerkAuthGuard | OptionalClerkAuthGuard | OptionalClerkAuthGuard |
| Pagination | cursor-based (id) | cursor-based (createdAt/joinedAt) | cursor-based (id/joinedAt) |
| Race condition handling | $executeRaw atomic updates | P2002 catch | P2002 catch |
| Negative count prevention | GREATEST(..., 0) | N/A (deletes participants) | GREATEST(..., 0) |
| Host-only check | requireHost() private | inline hostId check | requireRole() private |
| Module exports | LiveService | AudioRoomsService | BroadcastService |

### 4.2 Architectural Differences

| Aspect | Live | Audio Rooms | Broadcast |
|--------|------|-------------|-----------|
| Status enum | Prisma LiveStatus enum | String constants ('live','ended','scheduled') | N/A (channels are permanent) |
| Role enum | Prisma LiveRole enum | Local AudioRoomRole enum | Prisma ChannelRole enum |
| Participant model | LiveParticipant (soft delete via leftAt) | AudioRoomParticipant (hard delete) | ChannelMember (hard delete) |
| Counter tracking | currentViewers, totalViews, peakViewers (raw SQL) | _count aggregate | subscribersCount, postsCount (raw SQL) |
| Guest system | YES (LiveGuest model, max 4) | NO | NO |
| Rehearsal mode | YES | NO | NO |
| Subscribers-only | YES (checks Follow table) | NO | NO |
| Recording | recordingUrl field | isRecording + recordingUrl + recordingDuration | N/A |
| Slug system | NO | NO | YES (permanent, unique) |
| Message system | NO (live chat presumably via Socket.io) | NO | YES (BroadcastMessage model) |
| Pin system | NO | NO | YES |
| Mute (user perspective) | NO | YES (participant isMuted) | YES (member isMuted) |
| Transaction usage | No (individual queries) | Yes ($transaction for create) | Yes ($transaction for create) |

### 4.3 Test Coverage Summary

| Module | Test Files | Test Suites | Approx Tests | Coverage Areas |
|--------|-----------|-------------|-------------|----------------|
| Live | 5 | 5 | ~48 | Controller delegation, service CRUD, edge cases, auth matrix, enum validation |
| Audio Rooms | 2 | 2 | ~38 | Controller delegation, service CRUD + join/leave/role/mute/hand/recording |
| Broadcast | 3 | 3 | ~48 | Controller delegation, service CRUD, subscribe/message/pin/admin/edge cases |

---

## 5. IDENTIFIED GAPS AND ISSUES

### 5.1 Audio Rooms: No SCHEDULED -> LIVE Transition

There is no `startRoom()` method to move a scheduled audio room to live status. The create method sets initial status, but there's no way to activate a scheduled room. The only status changes are to 'ended' via endRoom.

### 5.2 Audio Rooms: createPersistentRoom communityId Not Stored

`createPersistentRoom(communityId, name, userId)` accepts a `communityId` parameter but the AudioRoom model has no `communityId` field. The parameter is silently ignored.

### 5.3 Live: CreateGroupCallDto Defined But Unused

`CreateGroupCallDto` is defined in the controller (L29-32) with `conversationId` and `participantIds` fields but no endpoint uses it.

### 5.4 Live: No MODERATOR Role Usage

The Prisma `LiveRole` enum includes MODERATOR but no code path assigns or checks for this role. Only VIEWER, RAISED_HAND, SPEAKER are used in transitions.

### 5.5 Broadcast: Slug vs ID Ambiguity in Routes

The controller has both `GET /:slug` and `PATCH /:id` / `DELETE /:id` on the same path pattern. Route matching depends on static routes being registered before parameterized ones (which NestJS does correctly).

### 5.6 Audio Rooms: Status Uses Strings Not Enums

Unlike Live (which uses Prisma LiveStatus enum) and Broadcast (which uses Prisma ChannelRole), Audio Rooms uses string constants for status. This means no database-level validation of status values.

### 5.7 Audio Rooms: getById viewerId Unused

`getById(id, viewerId?)` accepts a viewerId parameter but does nothing with it. The comment "If viewer is participant, include additional info?" suggests planned but unimplemented functionality.

### 5.8 Live: promoteToSpeaker No Target Role Validation

`promoteToSpeaker` does not validate the target's current role. A HOST could "promote" another HOST or attempt to promote a non-existent participant (Prisma would throw P2025).

### 5.9 Broadcast: getSubscribers Role Check Optional

`getSubscribers` only checks role if `userId` is provided. When called from the controller, userId is always passed. But if called programmatically from another service without userId, the subscriber list would be returned without authorization.

### 5.10 Audio Rooms: Recording Duration Calculation

`stopRecording` calculates duration from `room.startedAt` (room creation time), not from when recording actually started. If recording starts mid-session, the duration will be inflated.
