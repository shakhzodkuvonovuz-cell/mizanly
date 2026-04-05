# A26: Audio Rooms Audit

**Scope:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts` (197 lines), `apps/api/src/modules/audio-rooms/audio-rooms.service.ts` (552 lines), DTOs (3 files), Prisma schema models `AudioRoom` + `AudioRoomParticipant`

**Date:** 2026-04-05

---

## Findings

### [CRITICAL] A26-01 — No blocked-user check on room join

**File:** `audio-rooms.service.ts` lines 205-256 (`join` method)
**Issue:** When a user joins a room, there is zero check against the `Block` model. A blocked user can join the same audio room as the person who blocked them. The host has no way to preemptively exclude someone. A stalker or harasser who was blocked by the host can freely join and listen.
**Impact:** Privacy violation. Blocked users gain real-time presence awareness of the blocker's activity. In a public audio room, the blocked user can hear the blocker speak.
**Fix:** Before creating the participant record, query `Block` for any bidirectional block between `userId` and `room.hostId` (and optionally any existing participant). Reject join with 403 if a block exists.

---

### [CRITICAL] A26-02 — No participant capacity cap on join (unbounded room size)

**File:** `audio-rooms.service.ts` lines 205-256 (`join` method)
**Issue:** The `maxSpeakers` field only limits *speaker* promotions (line 326-332 in `changeRole`). There is no limit on the total number of *listeners* in a room. Any number of users can join. The `ROOM_SELECT` constant fetches `participants: { take: 50 }` (line 43) but this only limits the *response payload*, not actual membership.
**Impact:** A single room can accumulate thousands or millions of participant records. Each join creates a DB row. An attacker can script thousands of join requests to bloat the `audio_room_participants` table. The `_count` query on every room fetch also becomes expensive.
**Fix:** Add a `maxParticipants` field (or use a reasonable hard cap, e.g. 5000) and check `count` atomically before insert, ideally inside a transaction with serializable isolation or via a unique constraint trick.

---

### [HIGH] A26-03 — No kick/remove participant endpoint

**File:** `audio-rooms.controller.ts` (entire file), `audio-rooms.service.ts` (entire file)
**Issue:** The host can mute participants and change their role, but there is no endpoint to remove (kick) a disruptive participant from the room. Once someone joins, the only way to remove them is to end the entire room.
**Impact:** A single troll can disrupt a room. The host's only recourse is to end the room entirely, punishing all participants. This is a basic moderation feature expected in any audio room product (Twitter Spaces, Clubhouse, Discord Stage all have kick).
**Fix:** Add `DELETE :id/participants/:userId` endpoint with host-only authorization that deletes the participant record.

---

### [HIGH] A26-04 — Moderator role exists in Prisma but is completely absent from application logic

**File:** Prisma schema line 715 defines `moderator` in `AudioRoomRole` enum. DTO `role-change.dto.ts` line 4-8 defines `AudioRoomRole` with only `LISTENER`, `SPEAKER`, `HOST` -- no `MODERATOR`.
**Issue:** The database supports a `moderator` role, but the TypeScript enum in `role-change.dto.ts` omits it. This means:
1. No one can be promoted to moderator through the API.
2. If a moderator record somehow exists in DB (direct SQL), the role change validation at line 321 would not recognize it properly.
3. The `changeRole` method only checks `currentRole === AudioRoomRole.HOST` but `AudioRoomRole.MODERATOR` doesn't exist in the TS enum, so moderators have zero special permissions in any code path.
**Impact:** Dead schema feature. Moderators cannot assist the host with muting or managing participants. In large rooms (100+ listeners), a single host cannot manage everything alone.
**Fix:** Either add `MODERATOR = 'moderator'` to the TS enum and implement moderator permissions (mute others, kick), or remove `moderator` from the Prisma enum to avoid confusion.

---

### [HIGH] A26-05 — `limit` query parameter not clamped -- attacker can request limit=999999

**File:** `audio-rooms.controller.ts` line 53, line 195
**Issue:** The `limit` parameter is parsed via `parseInt(limit, 10)` with no upper bound. A client can send `?limit=1000000` and the service will execute `take: 1000001` against PostgreSQL. This applies to:
- `list()` (line 53): `limit ? parseInt(limit, 10) : 20`
- `listParticipants()` (line 195): `limit ? parseInt(limit, 10) : 50`
- `getActiveRooms()` and `getUpcomingRooms()` have hardcoded `limit = 20` but accept no user input, so they're safe.
**Impact:** DoS vector. A single request with `?limit=999999` forces a full table scan returning all rooms/participants, saturating DB connections and API memory.
**Fix:** Clamp limit to `Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)`.

---

### [HIGH] A26-06 — Race condition on speaker count check in `changeRole` (TOCTOU)

**File:** `audio-rooms.service.ts` lines 326-332
**Issue:** The speaker count is checked with a `count()` query, then the role is updated in a separate `update()` call. These are not in a transaction. Two concurrent `changeRole` requests can both read `speakerCount = maxSpeakers - 1`, both pass the check, and both promote to speaker, exceeding `maxSpeakers`.
**Impact:** `maxSpeakers` limit can be violated by concurrent requests. With 2+ co-hosts (if moderator role is ever implemented) or fast automated requests, this is exploitable.
**Fix:** Wrap the count check and update in a `$transaction` with serializable isolation, or use a database-level check constraint.

---

### [MEDIUM] A26-07 — `viewerId` parameter accepted but never used in `list()` and `getById()`

**File:** `audio-rooms.service.ts` line 126 (`list`), line 153 (`getById`)
**Issue:** Both methods accept `viewerId` as a parameter but never reference it in the query. The `list` method has `viewerId` in its signature (line 126) but the `where` clause (lines 127-132) ignores it. The `getById` method accepts `viewerId` (line 153) with a comment "If viewer is participant, include additional info?" (line 163) but does nothing.
**Impact:** No blocked-user filtering on room listings. Blocked users' rooms appear in the viewer's feed. No personalization possible. Dead parameter suggests incomplete implementation.
**Fix:** Filter out rooms hosted by users the viewer has blocked (and vice versa) in `list()`. Use `viewerId` in `getById()` to check block status and potentially show different data (e.g., whether viewer is a participant).

---

### [MEDIUM] A26-08 — `getActiveRooms` uses inconsistent cursor pagination (manual `id: { lt: cursor }`)

**File:** `audio-rooms.service.ts` lines 519-531 (`getActiveRooms`), lines 533-549 (`getUpcomingRooms`)
**Issue:** The `list()` method (line 134-139) correctly uses Prisma's native cursor pagination (`cursor: { id: cursor }, skip: 1`). But `getActiveRooms` (line 520) and `getUpcomingRooms` (line 536) use manual `id: { lt: cursor }` filtering. This is inconsistent and can produce incorrect results because:
1. `id: { lt: cursor }` on CUID strings is lexicographic, not chronological. CUIDs are not monotonically sortable by creation time in all cases.
2. Combined with `orderBy: { createdAt: 'desc' }`, the cursor `id` filter and sort order operate on different axes, potentially skipping or duplicating records.
**Impact:** Pagination can miss rooms or show duplicates as new rooms are created between page fetches.
**Fix:** Use Prisma native cursor pagination consistently, or switch to composite cursor (createdAt + id) for reliable keyset pagination.

---

### [MEDIUM] A26-09 — `scheduledAt` accepts past dates without validation

**File:** `dto/create-audio-room.dto.ts` line 18-19, `audio-rooms.service.ts` line 99
**Issue:** The `@IsDateString()` validator only checks format, not that the date is in the future. A user can create a room with `scheduledAt: "2020-01-01T00:00:00Z"`. The service sets `status: ROOM_STATUS.SCHEDULED` (line 98) for any room with `scheduledAt`, regardless of whether the time has already passed.
**Impact:** Ghost scheduled rooms with past dates pollute the `getUpcomingRooms` query. While `getUpcomingRooms` filters `scheduledAt: { gte: new Date() }` (line 537), these stale records still exist in the DB and appear in the generic `list()` which doesn't filter by date.
**Fix:** Add custom validation that `scheduledAt` must be at least 1 minute in the future, or auto-set status to `live` if `scheduledAt` is in the past.

---

### [MEDIUM] A26-10 — Recording endpoint returns full `audioRoom` row including all columns

**File:** `audio-rooms.service.ts` lines 479-483 (`startRecording`)
**Issue:** `startRecording` returns the result of `prisma.audioRoom.update(...)` without a `select` clause. This returns the entire `AudioRoom` model including all columns. While `stopRecording` (line 492-495) also lacks explicit select on the update, the `startRecording` response is particularly bad because it leaks `recordingUrl`, `recordingDuration`, and any future sensitive columns.
**Impact:** Over-fetching. If the model gains sensitive fields in the future, they'll be leaked automatically.
**Fix:** Add `select: ROOM_SELECT` to both `startRecording` and `stopRecording` update calls.

---

### [MEDIUM] A26-11 — `endRoom` deletes participants but does not stop recording

**File:** `audio-rooms.service.ts` lines 188-199 (`endRoom`)
**Issue:** When the host ends a room, the status is set to `ENDED` and all participants are deleted, but `isRecording` is not set to `false`. If a recording was in progress, the room remains in `isRecording: true` state after ending. This could confuse any future recording retrieval logic or analytics.
**Impact:** Inconsistent state. An ended room should not show `isRecording: true`.
**Fix:** Include `isRecording: false` in the update data at line 194.

---

### [MEDIUM] A26-12 — No `@Throttle` on read-heavy discovery endpoints

**File:** `audio-rooms.controller.ts` lines 45-68
**Issue:** The following endpoints have no rate limiting:
- `GET /audio-rooms` (line 45, `list`)
- `GET /audio-rooms/active` (line 56, `getActiveRooms`)
- `GET /audio-rooms/upcoming` (line 63, `getUpcomingRooms`)
- `GET /audio-rooms/:id` (line 80, `getById`)
- `GET /audio-rooms/:id/recording` (line 90, `getRecording`)
- `GET /audio-rooms/recordings` (line 70, `listRecordings`)
- `GET /audio-rooms/:id/participants` (line 185, `listParticipants`)

All mutation endpoints correctly have `@Throttle`. But the GET endpoints are unthrottled, allowing automated scraping or DoS via expensive DB queries.
**Impact:** An attacker can poll all rooms + participants at high frequency, causing DB load and scraping all room data.
**Fix:** Add `@Throttle` with reasonable limits (e.g., 60 requests per minute) to all GET endpoints, or apply a class-level default throttle.

---

### [MEDIUM] A26-13 — `leave()` does not verify room is live before allowing leave

**File:** `audio-rooms.service.ts` lines 259-285 (`leave`)
**Issue:** The `leave` method checks if the user is a participant (line 260-261) but does not check if the room status is `live`. A user can "leave" an already-ended room. While `endRoom` deletes all participants (line 190), if there's a race between `endRoom` and `leave`, the leave could fail with a Prisma error trying to delete an already-deleted participant record.
**Impact:** Minor -- potential unhandled Prisma `P2025` (Record not found) error on line 280 if participant was already cascade-deleted.
**Fix:** Check room status before attempting leave. Or wrap the delete in a try-catch for P2025.

---

### [LOW] A26-14 — `join()` fetches full `audioRoom` row (no select) for status check

**File:** `audio-rooms.service.ts` line 206-208
**Issue:** `join` fetches the full room (`findUnique` without `select`) just to check `room.status`. This returns all columns including `recordingUrl`, `description`, etc., when only `id` and `status` are needed.
**Impact:** Over-fetching. Minor performance waste on every join.
**Fix:** Add `select: { id: true, status: true }`.

---

### [LOW] A26-15 — `toggleMute` fetches full `audioRoom` row (no select) for status check

**File:** `audio-rooms.service.ts` lines 371-372
**Issue:** Same as A26-14. `toggleMute` fetches the entire room just to check status and existence.
**Fix:** Add `select: { id: true, status: true }`.

---

### [LOW] A26-16 — `leave()` fetches full `audioRoom` row (no select) to check hostId

**File:** `audio-rooms.service.ts` lines 270-271
**Issue:** Same pattern. Full row fetch when only `hostId` is needed.
**Fix:** Add `select: { id: true, hostId: true }`.

---

### [LOW] A26-17 — `StopRecordingDto` defined inline in controller file

**File:** `audio-rooms.controller.ts` lines 25-27
**Issue:** `StopRecordingDto` is defined directly in the controller file rather than in the `dto/` directory alongside the other DTOs. This breaks the module's organizational pattern and makes it harder to find.
**Impact:** Code organization inconsistency. Minor.
**Fix:** Move to `dto/stop-recording.dto.ts`.

---

### [LOW] A26-18 — `getRecording` endpoint has no auth -- anyone can access recording URLs

**File:** `audio-rooms.controller.ts` lines 90-95
**Issue:** `getRecording` uses `OptionalClerkAuthGuard` (line 91), meaning unauthenticated users can access recording URLs. If `recordingUrl` points to a Cloudflare R2 URL without its own auth, anyone with the room ID can download the recording.
**Impact:** Privacy concern. Audio room recordings may contain private conversations. Any unauthenticated user who knows (or guesses) a room ID can access the recording.
**Fix:** Change to `ClerkAuthGuard` and add authorization logic (e.g., only host or participants can access recordings).

---

### [LOW] A26-19 — Host can make themselves a non-host via `changeRole` if they pass their own userId

**File:** `audio-rooms.service.ts` lines 308-309, 320-322
**Issue:** The `changeRole` method finds the target participant using `dto.userId` (line 309). If the host passes their own `userId` in the DTO, the target will be found (line 308), and then line 321 checks `currentRole === AudioRoomRole.HOST` which is true, so it correctly throws `BadRequestException('Cannot change host role')`. This is handled. However, there's no check preventing the host from setting `dto.role = HOST` for someone else -- line 321 checks `newRole === AudioRoomRole.HOST` and throws. This is also handled. No actual vulnerability here, but the DTO `@IsEnum(AudioRoomRole)` still accepts `HOST` as a valid enum value, causing a 400 error rather than a validation error. Minor UX issue.
**Impact:** Minimal. The check works but could fail at validation layer instead.
**Fix:** Consider restricting the DTO enum to only `LISTENER` and `SPEAKER` values.

---

### [INFO] A26-20 — No host transfer mechanism

**File:** `audio-rooms.service.ts` (entire file)
**Issue:** There is no way to transfer the host role to another participant. If the host needs to leave temporarily, they must end the room entirely (line 274-276). There's no "make co-host" or "transfer host" flow.
**Impact:** UX limitation. Large rooms die if the host has a network issue or needs to step away.
**Fix:** Add a `transferHost` method that atomically changes the current host's role to speaker and the target's role to host, updating `audioRoom.hostId` in the same transaction.

---

### [INFO] A26-21 — No WebSocket/real-time notifications for room events

**File:** `audio-rooms.service.ts` (entire file)
**Issue:** All room events (join, leave, role change, mute, hand raise, recording start/stop) only update the database. There are no WebSocket emissions or push notifications. Participants must poll to discover that someone joined, was muted, raised a hand, etc.
**Impact:** Real-time audio rooms require real-time state synchronization. Without WebSocket events, the mobile client cannot update the participant list, mute indicators, or hand-raise UI in real time. Users will see stale state.
**Fix:** Inject the chat gateway (or a dedicated audio-room gateway) and emit events for all state changes.

---

### [INFO] A26-22 — `getActiveRooms` returns full room rows via `include` instead of `select`

**File:** `audio-rooms.service.ts` line 521
**Issue:** `getActiveRooms` uses `include` which returns all columns of `AudioRoom` plus the included relations. The `list()` method correctly uses `select: ROOM_SELECT`. This inconsistency means `getActiveRooms` returns extra fields like `recordingUrl`, `isPersistent`, etc.
**Impact:** Minor over-fetching and inconsistent API response shapes between endpoints.
**Fix:** Use `select: ROOM_SELECT` instead of `include`.

---

## Checklist Verification

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | **BOLA -- Can non-host end room?** | PASS | `endRoom` checks `room.hostId !== userId` at line 179, throws `ForbiddenException`. Same for `startRecording` (line 476), `stopRecording` (line 489). |
| 2 | **BOLA -- Can non-host kick participants?** | N/A -- NO KICK ENDPOINT EXISTS | There is no kick/remove endpoint at all (finding A26-03). |
| 3 | **Host transfer** | FAIL | No host transfer mechanism exists (finding A26-20). If host disconnects, host leave triggers `endRoom` (line 274-276), killing the room for everyone. |
| 4 | **Rate limit -- Room creation** | PASS | `create` has `@Throttle({ default: { limit: 10, ttl: 60000 } })` at controller line 36. |
| 5 | **Rate limit -- Other mutations** | PASS | All mutation endpoints (join, leave, changeRole, toggleHand, toggleMute, recording) have `@Throttle`. |
| 6 | **Rate limit -- Read endpoints** | FAIL | All 7 GET endpoints lack `@Throttle` (finding A26-12). |
| 7 | **Race conditions -- Concurrent joins past capacity** | FAIL | No participant capacity limit exists (finding A26-02). Join handles P2002 uniqueness race correctly (line 240-248), but there's nothing to race *against* since there's no cap. |
| 8 | **Participant cap -- Enforced atomically?** | FAIL | No total participant cap exists. Speaker cap exists but is not atomic (finding A26-06). |
| 9 | **Mute enforcement -- Can participants unmute after host mutes?** | PASS | `hostMuted` flag at line 405 prevents self-unmute. Line 420-422 checks `targetParticipant.hostMuted` and throws `ForbiddenException`. Well implemented. |
| 10 | **Cascade -- Room end cleans up participants?** | PASS | `endRoom` explicitly deletes all participants via `deleteMany` (line 190) before updating status. Prisma schema also has `onDelete: Cascade` on the relation (schema line 3198). |
| 11 | **Cascade -- Redis state cleanup?** | N/A | Module uses zero Redis. All state is in PostgreSQL only. |
| 12 | **Privacy -- Can blocked users join same room?** | FAIL | Zero block checking anywhere in the module (finding A26-01). |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 4 |
| MEDIUM | 7 |
| LOW | 6 |
| INFO | 3 |
| **Total** | **22** |

**Most dangerous findings:** A26-01 (blocked users can join rooms) and A26-02 (no participant cap) are the two CRITICALs. A26-03 (no kick endpoint) makes A26-01 worse -- even if the host notices a blocked user joined, they cannot remove them.
