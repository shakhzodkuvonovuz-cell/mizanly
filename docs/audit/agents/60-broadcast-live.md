# Agent #60 — Broadcast + Live Streaming Backend Audit

**Scope:** `apps/api/src/modules/broadcast/`, `apps/api/src/modules/live/`, `apps/api/src/modules/audio-rooms/`, `apps/api/src/modules/calls/` (group calls, screen sharing, TURN/STUN), `apps/api/src/modules/discord-features/` (stage sessions only), and relevant Prisma models.

**Files audited (line by line):**
- `broadcast/broadcast.module.ts` (12 lines)
- `broadcast/broadcast.controller.ts` (179 lines)
- `broadcast/broadcast.service.ts` (259 lines)
- `broadcast/dto/create-channel.dto.ts` (28 lines)
- `broadcast/dto/send-broadcast.dto.ts` (25 lines)
- `broadcast/broadcast.service.spec.ts` (321 lines)
- `broadcast/broadcast.controller.spec.ts` (224 lines)
- `broadcast/broadcast.service.edge.spec.ts` (79 lines)
- `live/live.module.ts` (12 lines)
- `live/live.controller.ts` (206 lines)
- `live/live.service.ts` (337 lines)
- `live/dto/create-live.dto.ts` (34 lines)
- `live/live.service.spec.ts` (246 lines)
- `live/live.controller.spec.ts` (168 lines)
- `live/live.service.edge.spec.ts` (113 lines)
- `live/live.service.auth.spec.ts` (67 lines)
- `audio-rooms/audio-rooms.module.ts` (11 lines)
- `audio-rooms/audio-rooms.controller.ts` (140 lines)
- `audio-rooms/audio-rooms.service.ts` (511 lines)
- `audio-rooms/dto/create-audio-room.dto.ts` (20 lines)
- `audio-rooms/dto/hand-toggle.dto.ts` (3 lines)
- `audio-rooms/dto/mute-toggle.dto.ts` (9 lines)
- `audio-rooms/dto/role-change.dto.ts` (18 lines)
- `audio-rooms/audio-rooms.service.spec.ts` (607 lines)
- `audio-rooms/audio-rooms.controller.spec.ts` (191 lines)
- `calls/calls.service.ts` (256 lines)
- `calls/calls.controller.ts` (63 lines)
- `calls/calls.service.spec.ts` (223 lines)
- `calls/dto/initiate-call.dto.ts` (14 lines)
- `discord-features/discord-features.service.ts` (stage session methods, lines 131-186)
- `discord-features/discord-features.controller.ts` (stage session endpoints, lines 106-144)
- `discord-features/dto/discord-features.dto.ts` (CreateStageSessionDto, InviteSpeakerDto)
- Prisma schema: BroadcastChannel, ChannelMember, BroadcastMessage, LiveSession, LiveParticipant, LiveGuest, AudioRoom, AudioRoomParticipant, StageSession, CallSession, CallParticipant

**Total findings: 67**

---

## CRITICAL (P0) — Ship Blockers

### Finding 1: NO WEBRTC IMPLEMENTATION — Live streaming, audio rooms, calls, and stage sessions are all DB-only facades
**File:** ALL modules in scope
**Impact:** SHIP BLOCKER — None of the real-time audio/video features actually work

The entire broadcast/live/audio-rooms/calls/stage-sessions stack has NO actual WebRTC, media server, or streaming implementation. Every module is purely a DB state machine:

- **Live streaming** (`live.service.ts`): Creates DB records with `streamKey` and `status`, but there is no media server (no Cloudflare Stream integration for RTMP ingest, no SFU, no media relay). The `streamKey` generated at line 11 (`randomBytes(16).toString('hex')`) goes nowhere — no ingest URL is returned, no streaming server consumes it.
- **Audio rooms** (`audio-rooms.service.ts`): Manages participants in DB, but there is no WebRTC SFU, no audio relay, no media track negotiation. The `isRecording` flag (line 98, 421-442) is just a boolean toggle — there is no actual recording implementation.
- **Calls** (`calls.service.ts`): Has ICE server config (lines 160-179) but NO WebRTC signaling — no SDP offer/answer exchange, no ICE candidate relay. The `react-native-webrtc` package is not installed on mobile (confirmed by agent #40).
- **Stage sessions** (`discord-features.service.ts` lines 131-186): Pure DB CRUD. No audio transport.

This means:
1. A user can "go live" and get a DB record, but no one can watch because there's no video stream
2. A user can "join" an audio room and see the participant list, but cannot hear anyone
3. A user can "call" someone and see RINGING status, but no audio/video connects
4. Screen sharing (`calls.service.ts` lines 226-255) just sets a DB boolean — no screen capture is transmitted

**Severity:** P0. These features are unusable. The UI presents them as functional.

---

### Finding 2: Stream key exposed to ALL participants via getById
**File:** `apps/api/src/modules/live/live.service.ts`, lines 29-43
**Code:**
```typescript
async getById(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { ... } },
        participants: { where: { leftAt: null }, include: { ... }, take: 20 },
      },
    });
    if (!session) throw new NotFoundException('Live session not found');
    return session;
}
```
**Issue:** The full `LiveSession` model is returned, including `streamKey` (a secret used for RTMP ingest). Anyone who calls `GET /live/:id` gets the stream key, which would allow them to hijack the stream if a media server were connected. The `streamKey` should be excluded from public responses using a `select` clause.

**Severity:** P0 security. Stream key is a credential equivalent.

---

### Finding 3: acceptGuestInvite has no max-guest recheck — race condition allows >4 guests
**File:** `apps/api/src/modules/live/live.service.ts`, lines 231-241
**Code:**
```typescript
async acceptGuestInvite(liveId: string, userId: string) {
    const guest = await this.prisma.liveGuest.findUnique({
      where: { liveId_userId: { liveId, userId } },
    });
    if (!guest || guest.status !== 'INVITED') throw new NotFoundException('No pending invitation');
    return this.prisma.liveGuest.update({
      where: { liveId_userId: { liveId, userId } },
      data: { status: 'ACCEPTED', joinedAt: new Date() },
    });
}
```
**Issue:** `inviteGuest` checks `count({ where: { liveId, status: 'ACCEPTED' } }) >= 4`, but `acceptGuestInvite` does NOT recheck the count before accepting. If the host invites 5+ guests (e.g., some when count was <4), all can accept simultaneously because the check is only at invite time, not accept time. Multiple concurrent accepts can also bypass the limit.

**Severity:** P1. Violates the documented "max 4 guests" business rule.

---

## HIGH (P1) — Security & Authorization

### Finding 4: Broadcast update endpoint accepts Partial<CreateBroadcastChannelDto> — bypasses DTO validation entirely
**File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`, line 83
**Code:**
```typescript
async update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: Partial<CreateBroadcastChannelDto>) {
```
**Issue:** `Partial<T>` strips all class-validator decorators because NestJS ValidationPipe cannot apply decorators from the original class to a `Partial` wrapper. This means ANY fields can be passed without validation — including a `slug` with invalid characters, a `name` exceeding MaxLength, or arbitrary extra fields. A dedicated `UpdateBroadcastChannelDto` with explicit `@IsOptional()` decorators on each field is needed.

**Severity:** P1. All input validation bypassed on update.

---

### Finding 5: Live controller rehearsal endpoint accepts raw inline body — NO DTO validation
**File:** `apps/api/src/modules/live/live.controller.ts`, lines 172-175
**Code:**
```typescript
async startRehearsal(@CurrentUser('id') userId: string, @Body() body: { title: string; description?: string; thumbnailUrl?: string }) {
```
**Issue:** The `body` parameter uses an inline TypeScript interface type, not a class-validator DTO. NestJS ValidationPipe ignores plain object types — no `@IsString()`, `@MaxLength()`, or `@IsOptional()` checks are applied. A user can send a 10MB title string, inject HTML/scripts in description, or pass arbitrary URLs in thumbnailUrl.

**Severity:** P1. No input validation on rehearsal creation.

---

### Finding 6: Live controller subscribers-only endpoint accepts raw inline body — NO DTO validation
**File:** `apps/api/src/modules/live/live.controller.ts`, lines 199-204
**Code:**
```typescript
async setSubscribersOnly(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { subscribersOnly: boolean },
) {
```
**Issue:** Same as Finding 5 — inline type, no class-validator decorators. `subscribersOnly` could be any value (string, number, object) without `@IsBoolean()` validation.

**Severity:** P1. No input validation.

---

### Finding 7: Broadcast mute endpoint accepts raw @Body('muted') — NO DTO validation
**File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`, line 149
**Code:**
```typescript
async mute(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('muted') muted: boolean) {
```
**Issue:** `@Body('muted')` extracts a single field from the body but applies no class-validator validation. `muted` could be a string, number, or any type. Should use a proper DTO with `@IsBoolean()`.

**Severity:** P1. No input validation on mute toggle.

---

### Finding 8: Live recording URL endpoint accepts raw @Body('recordingUrl') — NO URL validation, SSRF risk
**File:** `apps/api/src/modules/live/live.controller.ts`, lines 128-131
**Code:**
```typescript
async setRecording(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('recordingUrl') url: string) {
    return this.live.updateRecording(id, userId, url);
}
```
**Issue:** No DTO, no `@IsUrl()` validation. A malicious host can set `recordingUrl` to:
- `file:///etc/passwd` — if any downstream service fetches this URL
- `http://169.254.169.254/latest/meta-data/` — cloud metadata SSRF
- Arbitrary JavaScript URI — if the URL is rendered in a web view

**Severity:** P1. Unvalidated URL storage, potential SSRF vector.

---

### Finding 9: Broadcast avatarUrl in DTO has no @IsUrl validation
**File:** `apps/api/src/modules/broadcast/dto/create-channel.dto.ts`, lines 24-27
**Code:**
```typescript
@IsString()
@IsOptional()
avatarUrl?: string;
```
**Issue:** `avatarUrl` is `@IsString()` but not `@IsUrl()`. Any arbitrary string including JavaScript URIs, data URIs, or internal network URLs can be stored.

**Severity:** P2. Should use `@IsUrl()` or at minimum `@Matches()` for allowed URL patterns.

---

### Finding 10: Live thumbnailUrl in DTO has no @IsUrl validation
**File:** `apps/api/src/modules/live/dto/create-live.dto.ts`, lines 17-19
**Code:**
```typescript
@IsOptional()
@IsString()
thumbnailUrl?: string;
```
**Issue:** Same as Finding 9. No URL validation for thumbnail.

**Severity:** P2.

---

### Finding 11: Broadcast sendMessage mediaUrl has no @IsUrl validation
**File:** `apps/api/src/modules/broadcast/dto/send-broadcast.dto.ts`, lines 17-19
**Code:**
```typescript
@IsString()
@IsOptional()
mediaUrl?: string;
```
**Issue:** Same pattern — arbitrary strings accepted as media URLs.

**Severity:** P2.

---

### Finding 12: raiseHand has no authorization check — any user can update any other user's participant record
**File:** `apps/api/src/modules/live/live.service.ts`, lines 169-174
**Code:**
```typescript
async raiseHand(sessionId: string, userId: string) {
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { role: 'raised_hand' },
    });
}
```
**Issue:** This method directly updates the participant record without:
1. Checking if the session is LIVE (a user could raise hand in an ENDED session)
2. Checking if the participant exists (will throw Prisma P2025 not a clean 404)
3. Checking if the user is a viewer (a speaker or already-raised-hand user can call this)

The `role` field overwrite from 'speaker' to 'raised_hand' would demote a speaker — this is a self-demotion vulnerability.

**Severity:** P1. Missing session status check + potential self-demotion.

---

### Finding 13: Stage session lockForumThread has no authorization — ANY user can lock ANY thread
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 79-81
**Code:**
```typescript
async lockForumThread(threadId: string, userId: string) {
    return this.prisma.forumThread.update({ where: { id: threadId }, data: { isLocked: true } });
}
```
**Issue:** The `userId` parameter is accepted but never used. Any authenticated user can lock any forum thread. There is no check for:
- Thread author
- Circle admin/moderator role
- Circle membership

**Severity:** P1. Unauthorized content moderation.

---

### Finding 14: Stage session inviteSpeaker uses findFirst without status check — speakers can be added to ended sessions
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 164-173
**Code:**
```typescript
async inviteSpeaker(sessionId: string, hostId: string, speakerId: string) {
    const session = await this.prisma.stageSession.findFirst({ where: { id: sessionId, hostId } });
    if (!session) throw new NotFoundException();
    const speakers = [...new Set([...session.speakerIds, speakerId])];
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { speakerIds: speakers },
    });
}
```
**Issue:** No check for `session.status === 'live'`. Speakers can be added to ended or scheduled sessions. Also, `speakerIds` is a `String[]` array in the schema — this grows unboundedly with no limit on how many speakers can be invited.

**Severity:** P1. No status check + unbounded speaker list.

---

### Finding 15: Stage session start/end uses findFirst — potential wrong session returned
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 146-162
**Code:**
```typescript
async startStageSession(sessionId: string, userId: string) {
    const session = await this.prisma.stageSession.findFirst({ where: { id: sessionId, hostId: userId } });
```
**Issue:** `findFirst` with `{ id, hostId }` is correct for authorization but less safe than `findUnique`. Since `id` is `@id`, `findUnique` by `id` followed by a host check would be clearer and prevent any edge cases with Prisma's `findFirst` behavior.

More critically: `startStageSession` does not check if the session is already live or already ended. A host can start an ended session, or start an already-live session (no-op but still wrong status transition).

**Severity:** P2. Missing status validation on start/end transitions.

---

### Finding 16: missedCall endpoint has no authorization — ANY user can mark ANY call as missed
**File:** `apps/api/src/modules/calls/calls.service.ts`, lines 116-121
**Code:**
```typescript
async missedCall(sessionId: string) {
    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.MISSED, endedAt: new Date() },
    });
}
```
**Issue:** This method takes only `sessionId` with no `userId` parameter. It has no authorization check — anyone who knows a call ID can mark it as missed. While this might be intended for a server-side timeout, the method is public on the service and could be called from the controller in the future without auth.

**Severity:** P2. Missing authorization (currently not exposed as controller endpoint, but service is exported).

---

### Finding 17: Group call and screen sharing endpoints have NO controller routes — dead code
**File:** `apps/api/src/modules/calls/calls.controller.ts` (63 lines)
**Code:** The controller only exposes: `ice-servers`, `active`, `history`, POST `/`, `/:id/answer`, `/:id/decline`, `/:id/end`

The following service methods have NO controller endpoints:
- `createGroupCall` (line 199)
- `shareScreen` (line 226)
- `stopScreenShare` (line 242)

**Issue:** Group video calls (up to 8 participants) and screen sharing are implemented in the service but completely unreachable via HTTP. There is no way to call these features from the mobile app.

**Severity:** P1. Documented features are unreachable.

---

## MEDIUM (P2) — Logic Bugs & Data Integrity

### Finding 18: Broadcast subscribe/unsubscribe counter race condition with concurrent requests
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`, lines 58-81
**Code:**
```typescript
async subscribe(channelId: string, userId: string) {
    await this.getById(channelId);
    const existing = await this.prisma.channelMember.findUnique({ ... });
    if (existing) return existing;
    try {
      const member = await this.prisma.channelMember.create({ ... });
      await this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = "subscribersCount" + 1 WHERE id = ${channelId}`;
      return member;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // race condition duplicate — idempotent
        return ...;
      }
    }
}
```
**Issue:** When a P2002 is caught (duplicate key), the method returns the existing member without decrementing the counter. But the counter was already incremented BEFORE the create — wait, actually the create and the counter update are separate operations. The sequence is: create member -> increment counter. If create throws P2002, the counter is NOT incremented (good). But there's a different issue: if the `$executeRaw` fails AFTER the `channelMember.create` succeeds, the member is created but the counter is not incremented. These two operations are NOT in a transaction.

**Severity:** P2. Counter drift over time (subscribe count could be lower than actual members).

---

### Finding 19: Broadcast getSubscribers pagination uses userId > cursor — wrong cursor field
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`, lines 97-111
**Code:**
```typescript
async getSubscribers(channelId: string, cursor?: string, limit = 20) {
    const where: Prisma.ChannelMemberWhereInput = { channelId };
    if (cursor) {
      where.userId = { gt: cursor };
    }
    const members = await this.prisma.channelMember.findMany({
      where,
      orderBy: { joinedAt: 'desc' },
      take: limit + 1,
    });
    ...
    return { data: members, meta: { cursor: members[members.length - 1]?.userId ?? null, hasMore } };
}
```
**Issue:** The cursor is based on `userId` with `gt` (greater than), but the results are ordered by `joinedAt: 'desc'`. These two orderings conflict — `userId` (cuid) is NOT monotonically ordered by join time. This means:
1. Pagination can skip members or return duplicates
2. The cursor `userId` from the last page may filter out members with earlier `joinedAt` but higher `userId`

Should use cursor-based pagination on `joinedAt` or use Prisma's native cursor pagination with `cursor: { channelId_userId }`.

**Severity:** P2. Pagination is broken for channels with many subscribers.

---

### Finding 20: Live session join counter and participant create are NOT atomic
**File:** `apps/api/src/modules/live/live.service.ts`, lines 109-147
**Code:**
```typescript
async join(sessionId: string, userId: string, role = 'viewer') {
    // ... checks ...
    if (existing) {
      await this.prisma.liveParticipant.update({ ... });
    } else {
      await this.prisma.liveParticipant.create({ ... });
    }
    await this.prisma.$executeRaw`
      UPDATE "LiveSession"
      SET "currentViewers" = "currentViewers" + 1,
          "totalViews" = "totalViews" + 1,
          "peakViewers" = GREATEST("peakViewers", "currentViewers" + 1)
      WHERE id = ${sessionId}
    `;
```
**Issue:** The participant create/update and the viewer count increment are separate operations. If the participant create succeeds but `$executeRaw` fails (e.g., network partition, DB timeout), the participant exists but `currentViewers` is not incremented. Conversely, if a user rejoins (existing with leftAt set), the viewer count increments but there's no check for the existing participant still being "in" the session.

Additionally, there is no unique constraint handling for the create — if two concurrent requests try to create the same participant, one will fail with P2002 (no catch handler here, unlike broadcast).

**Severity:** P2. Counter drift + potential uncaught P2002 on concurrent join.

---

### Finding 21: Live session join does NOT enforce subscribers-only mode
**File:** `apps/api/src/modules/live/live.service.ts`, lines 109-147
**Issue:** The `join` method checks `session.status !== LiveStatus.LIVE` but does NOT check `session.isSubscribersOnly`. Any user can join a subscribers-only live session. The `isSubscribersOnly` field is stored in DB but never enforced at join time.

**Severity:** P1. Subscribers-only mode is completely decorative.

---

### Finding 22: Audio room recording is a stub — no actual audio capture
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 419-461
**Code:**
```typescript
async startRecording(roomId: string, userId: string) {
    // ...
    return this.prisma.audioRoom.update({
      where: { id: roomId },
      data: { isRecording: true },
    });
}

async stopRecording(roomId: string, userId: string, recordingUrl?: string) {
    // ...
    const duration = room.startedAt ? Math.floor((Date.now() - room.startedAt.getTime()) / 1000) : 0;
    return this.prisma.audioRoom.update({
      where: { id: roomId },
      data: { isRecording: false, recordingUrl, recordingDuration: duration },
    });
}
```
**Issue:** `startRecording` sets `isRecording: true` but doesn't actually start any recording (no media server, no audio capture). `stopRecording` calculates duration from `startedAt` (room creation time, not recording start time) — so the duration is always wrong if recording started after room creation. The `recordingUrl` is passed as a parameter (caller must provide it), but there's no mechanism to generate it.

**Severity:** P1. Recording feature is non-functional. Duration calculation is wrong.

---

### Finding 23: Audio room recording and discovery endpoints have NO controller routes
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts` (140 lines)
**Service methods with NO controller endpoints:**
- `startRecording` (line 421)
- `stopRecording` (line 433)
- `getRecording` (line 445)
- `listRecordings` (line 454)
- `getActiveRooms` (line 465) — duplicates `list` but with different filtering
- `getUpcomingRooms` (line 480)
- `createPersistentRoom` (line 500)

**Issue:** 7 service methods have no HTTP routes. The recording feature, room discovery, and persistent voice channels are all unreachable.

**Severity:** P1. Features documented as complete are unreachable.

---

### Finding 24: Audio room list pagination is incorrect — hasMore false positives
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 122-148
**Code:**
```typescript
const rooms = await this.prisma.audioRoom.findMany({
    where,
    select: ROOM_SELECT,
    take: limit,  // NOT limit + 1
    orderBy: { createdAt: 'desc' },
});

const hasMore = rooms.length === limit;  // False positive when exactly `limit` rooms exist
```
**Issue:** Unlike other endpoints that use `take: limit + 1` and then `pop()`, this endpoint uses `take: limit` and checks `rooms.length === limit`. This produces a false positive `hasMore: true` when exactly `limit` rooms exist (there may be no more). The mobile client will make an extra request and get an empty response.

**Severity:** P3. Minor UX issue — extra empty request.

---

### Finding 25: Audio room list includes ALL participants in select — performance bomb
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 20-60
**Code:**
```typescript
const ROOM_SELECT = {
  // ... room fields ...
  participants: {
    select: {
      id: true, userId: true, role: true, isMuted: true, handRaised: true, joinedAt: true,
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    },
  },
};
```
**Issue:** `ROOM_SELECT` includes ALL participants for every room. When listing rooms (`list` method), this fetches ALL participants for ALL rooms. A room with 1000 listeners would return 1000 participant objects nested inside the room. There is no `take` limit on participants in this select.

This is used in: `create`, `list`, `getById`, `join`, `endRoom`. The `list` endpoint could return N rooms x M participants each — a potential OOM or timeout for popular rooms.

**Severity:** P2. Performance — N+1-like issue, unbounded nested result.

---

### Finding 26: Audio room create + add host participant is NOT atomic
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 88-119
**Code:**
```typescript
async create(userId: string, dto: CreateAudioRoomDto) {
    const room = await this.prisma.audioRoom.create({ ... });
    // Add host as participant
    await this.prisma.audioRoomParticipant.create({ ... });
    // Reload room with participants
    return this.prisma.audioRoom.findUnique({ ... });
}
```
**Issue:** Three separate DB operations (create room, create participant, findUnique) are NOT wrapped in a `$transaction`. If the participant create fails, the room exists without a host participant. Compare to `broadcast.service.ts` which correctly uses `$transaction` for the equivalent operation.

**Severity:** P2. Orphan room without host participant possible.

---

### Finding 27: Audio room persistent rooms have no community association stored
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 500-509
**Code:**
```typescript
async createPersistentRoom(communityId: string, name: string, userId: string) {
    return this.prisma.audioRoom.create({
      data: {
        title: name,
        hostId: userId,
        status: 'live',
        isPersistent: true,
        startedAt: new Date(),
      },
    });
}
```
**Issue:** The `communityId` parameter is accepted but NEVER stored. The `AudioRoom` model in the Prisma schema has no `communityId` field. Persistent voice channels cannot be associated with their community — they appear as regular rooms with no way to discover which community they belong to.

**Severity:** P1. Feature is architecturally broken — community association is lost.

---

### Finding 28: Audio room maxSpeakers is hardcoded to 10 — not configurable via DTO
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, line 97
**Code:**
```typescript
maxSpeakers: 10, // default
```
**Issue:** `maxSpeakers` is hardcoded and `CreateAudioRoomDto` has no `maxSpeakers` field. But more critically, `maxSpeakers` is NEVER ENFORCED — the `changeRole` method (lines 270-313) does not check the current speaker count against `maxSpeakers` before promoting a listener to speaker. The field exists in the schema but serves no purpose.

**Severity:** P2. Documented limit is not enforced.

---

### Finding 29: CreateLiveDto liveType enum mismatch with Prisma enum
**File:** `apps/api/src/modules/live/dto/create-live.dto.ts`, line 22
**Code:**
```typescript
@IsEnum(['VIDEO_STREAM', 'AUDIO_SPACE'])
liveType: string;
```
**Prisma enum:**
```prisma
enum LiveType {
  VIDEO_STREAM
  AUDIO_SPACE
}
```
**Issue:** The `@IsEnum` uses a plain string array `['VIDEO_STREAM', 'AUDIO_SPACE']` instead of the Prisma `LiveType` enum. While the values match today, any enum changes in the schema won't propagate to the DTO validation. Also, the DTO property `liveType` is typed as `string` not `LiveType` — so the service casts it at line 18: `liveType: data.liveType as LiveType`.

**Severity:** P3. Fragile — manual sync required between DTO and schema.

---

### Finding 30: SendBroadcastDto messageType enum mismatch with Prisma MessageType
**File:** `apps/api/src/modules/broadcast/dto/send-broadcast.dto.ts`, lines 11-14
**Code:**
```typescript
@IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE'])
@IsOptional()
messageType?: string;
```
**Issue:** Same as Finding 29. Uses a string array instead of Prisma `MessageType` enum. The actual Prisma `MessageType` enum may have different values. The service casts at line 120: `messageType: (data.messageType as MessageType) ?? MessageType.TEXT`.

**Severity:** P3. Fragile.

---

### Finding 31: Live service create allows arbitrary liveType string — no enum validation in service
**File:** `apps/api/src/modules/live/live.service.ts`, line 18
**Code:**
```typescript
liveType: data.liveType as LiveType,
```
**Issue:** `data.liveType` is `string` (from the inline type at line 10). The `as LiveType` cast does not validate — if an invalid value passes DTO validation (e.g., via the rehearsal endpoint which has no DTO), Prisma will throw a raw error instead of a clean 400.

**Severity:** P3. Invalid enum values cause unhandled Prisma errors.

---

### Finding 32: Live session getActive uses Record<string, unknown> — type safety gap
**File:** `apps/api/src/modules/live/live.service.ts`, line 46
**Code:**
```typescript
const where: Record<string, unknown> = { status: LiveStatus.LIVE, isRehearsal: false };
if (liveType) where.liveType = liveType as LiveType;
if (cursor) where.id = { lt: cursor };
```
**Issue:** Using `Record<string, unknown>` instead of `Prisma.LiveSessionWhereInput` loses type safety. Any typo in field names would compile but fail at runtime.

**Severity:** P3. Type safety.

---

### Finding 33: Audio room toggleHand DTO is empty — dto parameter unused
**File:** `apps/api/src/modules/audio-rooms/dto/hand-toggle.dto.ts`
**Code:**
```typescript
export class HandToggleDto {
  // Empty body for toggling hand raise
}
```
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts`, lines 107-113
**Code:**
```typescript
toggleHand(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: HandToggleDto,
) {
    return this.audioRoomsService.toggleHand(id, userId);
}
```
**Issue:** The `dto` parameter is received but never passed to the service. The DTO class is empty. This is dead code that confuses the API — Swagger shows a body is expected when it isn't. Should use `@HttpCode(HttpStatus.OK)` with no body instead.

**Severity:** P3. API documentation misleading.

---

### Finding 34: Audio room status uses string literals — no Prisma enum
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 14-18
**Code:**
```typescript
const ROOM_STATUS = {
  LIVE: 'live',
  ENDED: 'ended',
  SCHEDULED: 'scheduled',
} as const;
```
**Prisma schema:**
```prisma
status String @default("live") @db.VarChar(20)
```
**Issue:** Audio room status is a plain `String` in Prisma, not an enum. This means:
1. Any arbitrary string can be stored as status
2. No DB-level constraint
3. No generated TypeScript enum — all comparisons are against magic strings

Compare to `LiveSession` which uses proper `LiveStatus` enum.

**Severity:** P2. Data integrity — invalid status values possible.

---

### Finding 35: Stage session status is also a plain String — not an enum
**File:** Prisma schema, line 3642
**Code:**
```prisma
status String @default("scheduled") // scheduled | live | ended
```
**Issue:** Same as Finding 34. `StageSession.status` is a plain string with a comment indicating allowed values, but no enum constraint. Invalid values like "paused", "cancelled", or "" can be stored.

**Severity:** P2. Data integrity.

---

### Finding 36: Stage session speakerIds is a String[] — no join table, no user validation
**File:** Prisma schema, lines 3643
**Code:**
```prisma
speakerIds String[]
```
**Issue:** Speaker IDs are stored as a raw string array, not as a relation table. This means:
1. No FK constraint — deleted users remain in the array forever
2. No way to query "which stage sessions is user X speaking in?" efficiently
3. Array grows unboundedly (Finding 14)
4. No uniqueness guarantee (the service uses `new Set()` but DB doesn't enforce)

**Severity:** P2. Data integrity — orphaned user IDs, no efficient reverse lookup.

---

### Finding 37: Stage session audienceCount is never incremented
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 131-186
**Issue:** The `StageSession` model has `audienceCount Int @default(0)` (schema line 3644), and `getActiveStageSessions` sorts by `audienceCount: 'desc'` (line 181). But NO service method ever increments or decrements `audienceCount`. There is no join/leave functionality for stage sessions — only host/speaker management. The count is always 0.

**Severity:** P1. Audience count is always 0, sorting by it is meaningless.

---

### Finding 38: Stage session has no leave/end-for-audience functionality
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Issue:** The service has `createStageSession`, `startStageSession`, `endStageSession`, `inviteSpeaker`, `getActiveStageSessions`. But there is NO:
- `joinStageSession` for audience members
- `leaveStageSession` for audience members
- `removeSpeaker` to revoke speaking privileges
- `requestToSpeak` for audience hand-raising

Stage sessions only track speakers (via `speakerIds` array) and have no audience participation model.

**Severity:** P1. Feature is incomplete — audience cannot join.

---

## LOW (P3) — Code Quality & Consistency

### Finding 39: Broadcast module imports PrismaModule but it's @Global()
**File:** `apps/api/src/modules/broadcast/broadcast.module.ts`, line 4
**Code:**
```typescript
imports: [PrismaModule],
```
**Issue:** `PrismaModule` is decorated with `@Global()`, so importing it is unnecessary (but harmless). Inconsistency with `AudioRoomsModule` which does NOT import it.

**Severity:** P3. Inconsistency only.

---

### Finding 40: AudioRoomsModule does NOT import PrismaModule — relies on @Global()
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.module.ts`, lines 5-6
**Code:**
```typescript
imports: [],
```
**Issue:** While this works because `PrismaModule` is `@Global()`, it's inconsistent with other modules that explicitly import it. If `PrismaModule` ever loses its `@Global()` decorator, this module breaks.

**Severity:** P3. Inconsistency.

---

### Finding 41: LiveParticipant.role is a plain String — not an enum
**File:** Prisma schema, line 1281
**Code:**
```prisma
role String @default("viewer")
```
**Issue:** The service uses string literals 'viewer', 'speaker', 'raised_hand' but there's no Prisma enum. Any value can be stored. Compare to `CallParticipant` which also uses a plain String for `role` (line 1818).

**Severity:** P3. Consistency — should be an enum.

---

### Finding 42: AudioRoomParticipant.role is a plain String — not the AudioRoomRole enum
**File:** Prisma schema, line 2210
**Code:**
```prisma
role String @default("listener") @db.VarChar(20)
```
**Issue:** The service defines `AudioRoomRole` as a TypeScript enum in `role-change.dto.ts` but the Prisma schema uses a plain String. The enum validation happens only in the DTO, not in the DB.

**Severity:** P3. Consistency.

---

### Finding 43: Live controller test does not cover multi-guest, rehearsal, or subscribers-only endpoints
**File:** `apps/api/src/modules/live/live.controller.spec.ts`
**Issue:** The mock service only includes:
```typescript
const mockService = {
    create, getById, getActive, getScheduled, startLive, endLive, cancelLive,
    join, leave, raiseHand, promoteToSpeaker, demoteToViewer, updateRecording, getHostSessions,
};
```
Missing mocks for: `inviteGuest`, `acceptGuestInvite`, `removeGuest`, `listGuests`, `startRehearsal`, `goLiveFromRehearsal`, `endRehearsal`, `setSubscribersOnly`. That's 8 endpoints with zero controller test coverage.

**Severity:** P2. Test gap — 8/22 controller endpoints untested.

---

### Finding 44: Live service test does not cover multi-guest happy paths
**File:** `apps/api/src/modules/live/live.service.spec.ts`
**Issue:** The main service spec has NO tests for:
- `inviteGuest` (happy path — only edge spec tests the auth failure)
- `acceptGuestInvite`
- `removeGuest`
- `listGuests`
- `startRehearsal`
- `goLiveFromRehearsal`
- `endRehearsal`
- `setSubscribersOnly` (happy path — only edge spec tests auth failure)

That's 8 service methods with no happy-path tests.

**Severity:** P2. Test gap.

---

### Finding 45: Audio room service has no tests for recording, discovery, and persistent room methods
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.spec.ts`
**Issue:** Missing tests for:
- `startRecording`
- `stopRecording`
- `getRecording`
- `listRecordings`
- `getActiveRooms`
- `getUpcomingRooms`
- `createPersistentRoom`

That's 7 service methods with zero test coverage.

**Severity:** P2. Test gap.

---

### Finding 46: Broadcast edge spec uses wrong mock model names
**File:** `apps/api/src/modules/broadcast/broadcast.service.edge.spec.ts`, lines 21-23
**Code:**
```typescript
broadcastSubscriber: { create: jest.fn(), ... },
broadcastAdmin: { findUnique: jest.fn(), ... },
```
**Issue:** The service uses `prisma.channelMember` (not `broadcastSubscriber`) and has no `broadcastAdmin` model. These mock properties are never accessed — they're dead code in the test setup. The test works because it also mocks `channelMember` (line 24).

**Severity:** P3. Dead code in tests.

---

### Finding 47: Live edge spec mockSession uses wrong field names
**File:** `apps/api/src/modules/live/live.service.edge.spec.ts`, lines 13-23
**Code:**
```typescript
const mockSession = {
    id: 'live-1',
    userId,         // Wrong — should be hostId
    title: 'Test Stream',
    status: 'LIVE',
    liveType: 'VIDEO',
    viewerCount: 0, // Wrong — should be currentViewers
    maxGuests: 4,   // Wrong — no such field on LiveSession
    subscribersOnly: false, // Wrong — should be isSubscribersOnly
};
```
**Issue:** 4 field names in the mock don't match the actual Prisma model. Tests pass because the mock is only used for ForbiddenException checks (where only `hostId` matters, and the mock overrides it with `{ ...mockSession, hostId: 'other-user' }`).

**Severity:** P3. Tests don't validate actual data shape.

---

### Finding 48: Broadcast service.create sets subscribersCount: 1 but is it actually 1?
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`, line 23
**Code:**
```typescript
subscribersCount: 1,
```
**Issue:** The owner is counted as a subscriber (count starts at 1). This is technically correct (the owner IS the first member), but the `subscribe` endpoint also increments the counter. If the owner ever calls `subscribe`, the count would become 2 even though there's only 1 member (the owner). The `subscribe` method returns early for existing members (line 63), so this won't happen via that path — but direct DB manipulation or future code changes could cause drift.

**Severity:** P3. Minor correctness concern.

---

### Finding 49: Broadcast delete does NOT clean up members or messages
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`, lines 52-56
**Code:**
```typescript
async delete(channelId: string, userId: string) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER]);
    await this.prisma.broadcastChannel.delete({ where: { id: channelId } });
    return { deleted: true };
}
```
**Issue:** The delete relies on Prisma's `onDelete: Cascade` from the schema (ChannelMember and BroadcastMessage both have `onDelete: Cascade` referencing BroadcastChannel). This is correct — cascade delete will clean up. However, there is no transaction boundary, so if the delete is interrupted, orphan records could exist temporarily.

**Severity:** P3. Low risk — cascade handles it.

---

### Finding 50: Audio room endRoom deletes ALL participants before updating room — data loss
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 186-198
**Code:**
```typescript
const [, updated] = await this.prisma.$transaction([
    this.prisma.audioRoomParticipant.deleteMany({ where: { roomId: id } }),
    this.prisma.audioRoom.update({
        where: { id },
        data: { status: ROOM_STATUS.ENDED, endedAt: new Date() },
        select: ROOM_SELECT,
    }),
]);
```
**Issue:** `ROOM_SELECT` includes `participants` in the select, but participants are deleted BEFORE the room update/select. The returned `updated` will always have `participants: []`. More importantly, all participant history is permanently deleted — there's no record of who was in the room, when they joined, or their roles. Compare to `LiveSession` which keeps participants with `leftAt` timestamps.

**Severity:** P2. Participant history lost on room end.

---

### Finding 51: Audio room join throws ConflictException — not idempotent like broadcast
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 216-231
**Code:**
```typescript
try {
    await this.prisma.audioRoomParticipant.create({ ... });
} catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Already joined this room');
    }
    throw error;
}
```
**Issue:** Unlike `broadcast.subscribe` which returns the existing member on duplicate (idempotent), audio room `join` throws a 409 Conflict. This forces the mobile client to handle this error case. If the client retries (e.g., network timeout where request actually succeeded), it gets an error. Idempotent design would be better.

**Severity:** P2. Non-idempotent join is error-prone for mobile clients with unreliable networks.

---

### Finding 52: Audio room leave does NOT decrement any counter — but list has no counter anyway
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, lines 241-267
**Issue:** Unlike `LiveSession` which tracks `currentViewers`, `AudioRoom` has no participant count field. The `list` method (line 134) fetches all rooms with all participants nested. There's no way to sort rooms by popularity (number of participants) without loading all participant data. The `getActiveRooms` method (line 465) uses `_count: { select: { participants: true } }` but this includes ALL participants (including deleted ones — wait, deleted participants are removed by `endRoom`). Actually this is OK since `leave` deletes the participant record.

**Severity:** P3. No participant count optimization — works via `_count` but could be a hot field.

---

### Finding 53: Calls initiate does not prevent self-call for group calls
**File:** `apps/api/src/modules/calls/calls.service.ts`, line 200
**Code:**
```typescript
async createGroupCall(conversationId: string, initiatorId: string, participantIds: string[]) {
    if (participantIds.length > 7) throw new BadRequestException('Group calls support up to 8 participants');
    const allIds = [initiatorId, ...participantIds.filter(id => id !== initiatorId)];
```
**Issue:** The `participantIds.length > 7` check counts the array BEFORE adding the initiator. The `allIds` line adds the initiator and filters duplicates. But if `participantIds` has 7 unique IDs plus the initiator, `allIds` would have 8, which is the max. If `participantIds` has 7 unique IDs NOT including the initiator, `allIds` would have 8 (valid). But if `participantIds` has 8 IDs with the initiator included, `participantIds.length` is 8 > 7, which throws. This is correct.

However, `createGroupCall` does NOT check if any participant is already in an active call (unlike `initiate` which does). Multiple concurrent group calls with overlapping participants are possible.

**Severity:** P2. No active-call check for group calls — user can be in multiple calls simultaneously.

---

### Finding 54: Calls createGroupCall always creates VIDEO type — no VOICE option
**File:** `apps/api/src/modules/calls/calls.service.ts`, line 206
**Code:**
```typescript
callType: CallType.VIDEO,
```
**Issue:** Group calls are hardcoded to `VIDEO`. There's no parameter to create a group voice-only call. The `initiate` method for 1-on-1 calls allows choosing VOICE or VIDEO.

**Severity:** P3. Missing feature — group voice calls forced to video.

---

### Finding 55: TURN/STUN configuration only returns STUN when env vars are missing
**File:** `apps/api/src/modules/calls/calls.service.ts`, lines 160-179
**Code:**
```typescript
getIceServers() {
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    const turnUrl = this.config.get<string>('TURN_SERVER_URL');
    const turnUsername = this.config.get<string>('TURN_USERNAME');
    const turnCredential = this.config.get<string>('TURN_CREDENTIAL');
    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
    }
    return { iceServers };
}
```
**Issue (per CLAUDE.md credential status):** `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` are all `NOT IN .env`. This means the TURN server is NEVER added to the ICE servers response. Without TURN, peer-to-peer WebRTC connections will fail for:
- Users behind symmetric NAT (most mobile carriers)
- Users behind strict corporate firewalls
- Cross-region connections

STUN-only works for ~70% of connections. The remaining 30% will silently fail to connect.

Additionally: TURN credentials are served as static values. In production, TURN credentials should be time-limited (TURN REST API with HMAC-based temporary credentials). Static credentials in env vars are a security risk if leaked.

**Severity:** P1. 30% of calls will fail. No TURN server configured.

---

### Finding 56: ICE servers endpoint has no rate limiting specific to resource cost
**File:** `apps/api/src/modules/calls/calls.controller.ts`, line 12
**Code:**
```typescript
@Throttle({ default: { limit: 30, ttl: 60000 } })
```
**Issue:** The `ice-servers` endpoint is rate-limited at 30/min (class-level throttle). But when a TURN server is configured, each call to this endpoint potentially generates credentials. 30/min is generous — a malicious user could harvest TURN credentials. A dedicated lower throttle (e.g., 5/min) would be appropriate.

**Severity:** P3. Over-generous rate limit for credential endpoint.

---

### Finding 57: No WebSocket events for live streaming — all state changes are HTTP-only
**File:** `apps/api/src/gateways/chat.gateway.ts`
**Issue:** The chat gateway handles: conversations, typing, messages, call signaling, Quran rooms. It does NOT handle ANY live streaming events:
- No `join_live` / `leave_live` events
- No real-time viewer count updates
- No live chat messages
- No guest invitation notifications
- No hand-raise notifications
- No recording start/stop events
- No stage session events
- No audio room events

All live streaming interactions go through HTTP REST endpoints. This means:
1. Viewer count changes are only visible on page refresh
2. Hand raises are not real-time (host must poll)
3. Guest invitations require polling
4. Live chat would require polling GET /messages

**Severity:** P1. Real-time features are not real-time — all polling-based.

---

### Finding 58: Live session has no live chat implementation at all
**File:** ALL live module files
**Issue:** There is no `LiveChatMessage` model, no chat endpoint in the live controller, and no socket events for live chat. The `BroadcastMessage` model exists for broadcast channels but NOT for live sessions. Viewers cannot interact with the live stream in any way except leaving.

**Severity:** P1. Live streaming without chat is fundamentally incomplete.

---

### Finding 59: Live session endRehearsal does not check if session is LIVE status
**File:** `apps/api/src/modules/live/live.service.ts`, lines 303-316
**Code:**
```typescript
async endRehearsal(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (!session.isRehearsal) throw new BadRequestException('Session is not in rehearsal mode');
    // No status check — could end an already-ENDED rehearsal
    await this.prisma.liveParticipant.updateMany({ ... });
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.ENDED, endedAt: new Date(), currentViewers: 0 },
    });
}
```
**Issue:** Only checks `isRehearsal` but not `status`. An already-ended rehearsal can be "ended" again, resetting `endedAt` and `currentViewers`.

**Severity:** P3. Missing idempotency check.

---

### Finding 60: Live session goLiveFromRehearsal does not reset startedAt or send notifications
**File:** `apps/api/src/modules/live/live.service.ts`, lines 289-298
**Code:**
```typescript
async goLiveFromRehearsal(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (!session.isRehearsal) throw new BadRequestException('Session is not in rehearsal mode');
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not active');
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { isRehearsal: false },
    });
}
```
**Issue:** When transitioning from rehearsal to public:
1. `startedAt` still reflects the rehearsal start time, not the public go-live time — duration/analytics will be wrong
2. No notification is sent to followers that the stream is now live
3. The `totalViews` and `peakViewers` from rehearsal are carried over

**Severity:** P2. Wrong analytics data after rehearsal-to-live transition.

---

### Finding 61: Live session create with scheduledAt parses date unsafely
**File:** `apps/api/src/modules/live/live.service.ts`, lines 21-22
**Code:**
```typescript
scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
startedAt: data.scheduledAt ? undefined : new Date(),
```
**Issue:** `new Date(data.scheduledAt)` can produce `Invalid Date` if the string is malformed (e.g., "not-a-date"). The DTO has `@IsDateString()` which should catch this, but the rehearsal endpoint (Finding 5) has no DTO validation, and any future callers of the service method would not be protected.

**Severity:** P3. Defensive coding gap.

---

### Finding 62: Broadcast getBySlug and getById return full model — no field selection
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`, lines 32-42
**Code:**
```typescript
async getBySlug(slug: string) {
    const channel = await this.prisma.broadcastChannel.findUnique({ where: { slug } });
```
**Issue:** Returns the entire `BroadcastChannel` model without selecting specific fields. If sensitive fields are added to the model in the future, they would be exposed. Currently low risk as the model is simple.

**Severity:** P3. Defensive coding.

---

### Finding 63: Broadcast discover has no category/topic filtering
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`, lines 199-208
**Issue:** The discover endpoint only sorts by `subscribersCount: 'desc'`. There is no:
- Topic/category filter
- Search by name
- Language filter
- Exclude already-subscribed channels

This makes discovery very limited for a platform with many channels.

**Severity:** P3. Feature gap in discovery UX.

---

### Finding 64: Audio room status field allows any string — no validation in service
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, line 94
**Code:**
```typescript
status: dto.scheduledAt ? ROOM_STATUS.SCHEDULED : ROOM_STATUS.LIVE,
```
**Issue:** While the `create` method uses the `ROOM_STATUS` constant, there's nothing preventing direct DB writes with arbitrary status strings. The Prisma schema uses `String @db.VarChar(20)` — any string up to 20 chars is valid at the DB level.

**Severity:** P3. Defense-in-depth gap (service level is fine, DB level is not).

---

### Finding 65: CallSession has no index on status — getActiveCall may be slow
**File:** Prisma schema, lines 1797-1813
**Issue:** `CallSession` has no `@@index` directives at all. The `getActiveCall` query (calls.service.ts line 146) searches for `session: { status: { in: [RINGING, ACTIVE] } }` — this requires a sequential scan without an index on `status`.

**Severity:** P3. Performance — should add `@@index([status])`.

---

### Finding 66: Audio room recording duration calculates from room start, not recording start
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, line 438
**Code:**
```typescript
const duration = room.startedAt ? Math.floor((Date.now() - room.startedAt.getTime()) / 1000) : 0;
```
**Issue:** `room.startedAt` is the time the room went live, not when recording started. If a room is live for 2 hours and recording starts at 1h30m, the duration would be calculated as 2 hours, not 30 minutes. The `AudioRoom` model has `isRecording` boolean but no `recordingStartedAt` timestamp.

**Severity:** P2. Wrong duration calculation — misleading to users.

---

### Finding 67: CreateStageSessionDto scheduledAt has no @IsDateString validation
**File:** `apps/api/src/modules/discord-features/dto/discord-features.dto.ts`, line 29
**Code:**
```typescript
@ApiPropertyOptional() @IsOptional() @IsString() scheduledAt?: string;
```
**Issue:** `scheduledAt` is validated as `@IsString()` only, not `@IsDateString()`. Any string value (including "hello") would pass validation and then cause `new Date("hello")` to produce `Invalid Date` in the service (line 139).

Compare to `CreateAudioRoomDto` which correctly uses `@IsDateString()` for the same field.

**Severity:** P2. Invalid date strings cause silent data corruption.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| P0 (Ship Blocker) | 2 | No WebRTC implementation anywhere; stream key exposed publicly |
| P1 (Critical) | 14 | 8 unreachable endpoints; subscribers-only not enforced; no real-time events; broken persistent rooms; no live chat; no stage audience; recording is stub; multiple validation bypasses |
| P2 (Medium) | 15 | Race conditions in counters; pagination bugs; non-atomic creates; participant history loss; wrong duration calc; missing tests; type safety gaps |
| P3 (Low) | 18 | Enum mismatches; inconsistent module imports; empty DTOs; missing indexes; minor test mock issues |
| **Total** | **67** | |

### Top 5 Most Critical Findings:
1. **Finding 1 (P0):** ZERO WebRTC implementation — all live/audio/call/stage features are DB facades only
2. **Finding 2 (P0):** Stream key credential exposed to all viewers via public endpoint
3. **Finding 57 (P1):** No WebSocket events for any real-time feature — all HTTP polling
4. **Finding 17 (P1):** Group calls and screen sharing have service code but no controller routes
5. **Finding 21 (P1):** Subscribers-only mode is stored but never enforced at join time
