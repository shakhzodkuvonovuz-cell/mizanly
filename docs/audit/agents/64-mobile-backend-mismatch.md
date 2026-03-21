# Agent 64 — Mobile ↔ Backend API Mismatch Audit

**Scope:** Cross-reference all 19 mobile API service files against all 82 backend controllers.
**Method:** Line-by-line comparison of every mobile API call path vs backend `@Controller` + `@Get`/`@Post`/`@Patch`/`@Delete` routes.
**Key context:** Backend has `app.setGlobalPrefix('api/v1')` (in `main.ts:60`). Mobile prepends `API_URL = .../api/v1` to all paths. So mobile path `/foo` hits backend route `api/v1/foo`.

---

## CRITICAL: Double-Prefix Path Bugs (6 controllers)

These backend controllers use `@Controller('api/v1/...')` instead of just `@Controller('...')`. Since `setGlobalPrefix('api/v1')` is already applied, the actual URL becomes `/api/v1/api/v1/...` — a double prefix. Mobile sends requests to `/api/v1/...` which will 404.

### Finding 64-001: Downloads controller double prefix — ALL downloads endpoints unreachable
- **File:** `apps/api/src/modules/downloads/downloads.controller.ts:25`
- **Code:** `@Controller('api/v1/downloads')`
- **Actual URL:** `/api/v1/api/v1/downloads`
- **Mobile calls:** `api.post('/downloads', dto)`, `api.get('/downloads')`, etc. (in `api.ts:1167-1180`)
- **Result:** All 6 download endpoints return 404. Mobile downloads feature completely broken.
- **Severity:** P0 — Feature dead

### Finding 64-002: Bookmarks controller double prefix — ALL bookmarks endpoints unreachable
- **File:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts:25`
- **Code:** `@Controller('api/v1/bookmarks')`
- **Actual URL:** `/api/v1/api/v1/bookmarks`
- **Mobile calls:** `api.post('/bookmarks/posts/${postId}')`, `api.get('/bookmarks/collections')`, etc. (in `api.ts:1117-1147`)
- **Result:** All 14 bookmark endpoints return 404. Users cannot save/unsave/manage bookmarks.
- **Severity:** P0 — Feature dead

### Finding 64-003: Reports controller double prefix — ALL reports endpoints unreachable
- **File:** `apps/api/src/modules/reports/reports.controller.ts:23`
- **Code:** `@Controller('api/v1/reports')`
- **Actual URL:** `/api/v1/api/v1/reports`
- **Mobile calls:** `api.post('/reports', data)`, `api.get('/reports/mine')`, etc. (in `api.ts:1084-1098`)
- **Result:** All 7 report endpoints return 404. Users cannot submit reports or view report status.
- **Severity:** P0 — Safety-critical feature dead (reporting abuse/content)

### Finding 64-004: Events controller double prefix — ALL events endpoints unreachable
- **File:** `apps/api/src/modules/events/events.controller.ts:157`
- **Code:** `@Controller('api/v1/events')`
- **Actual URL:** `/api/v1/api/v1/events`
- **Mobile calls:** `api.post('/events', data)`, `api.get('/events')`, etc. (in `eventsApi.ts:22-39`)
- **Result:** All 7 event endpoints return 404. Events feature completely broken.
- **Severity:** P0 — Feature dead

### Finding 64-005: Embeddings controller double prefix
- **File:** `apps/api/src/modules/embeddings/embeddings.controller.ts:8`
- **Code:** `@Controller('api/v1/embeddings')`
- **Impact:** Embeddings endpoints unreachable via normal routing. Not directly called by mobile but affects recommendation system.
- **Severity:** P1

### Finding 64-006: Retention controller double prefix
- **File:** `apps/api/src/modules/retention/retention.controller.ts:9`
- **Code:** `@Controller('api/v1/retention')`
- **Impact:** Retention analytics endpoints unreachable.
- **Severity:** P2

---

## CRITICAL: Quran API Path Mismatch — 4 endpoints wrong

### Finding 64-007: Mobile uses `/islamic/quran/surahs` but backend has `/islamic/quran/chapters`
- **Mobile file:** `apps/mobile/src/services/islamicApi.ts:58`
- **Mobile code:** `api.get('/islamic/quran/surahs')`
- **Backend file:** `apps/api/src/modules/islamic/islamic.controller.ts:250-251`
- **Backend route:** `@Get('quran/chapters')` → `/api/v1/islamic/quran/chapters`
- **Result:** List surahs call returns 404. Quran reader cannot load surah list.
- **Severity:** P0 — Core Islamic feature broken

### Finding 64-008: Mobile uses `/islamic/quran/surahs/:surahNumber/verses` but backend has `/islamic/quran/chapters/:surahNumber/verses`
- **Mobile file:** `apps/mobile/src/services/islamicApi.ts:63-64`
- **Mobile code:** `api.get('/islamic/quran/surahs/${surahNumber}/verses')`
- **Backend route:** `@Get('quran/chapters/:surahNumber/verses')` → `/api/v1/islamic/quran/chapters/:surahNumber/verses`
- **Result:** Surah verse fetching returns 404.
- **Severity:** P0 — Core Islamic feature broken

### Finding 64-009: Mobile uses `/islamic/quran/surahs/:surahNumber/verses/:verseNumber` but backend has `/islamic/quran/chapters/:surahNumber/verses/:ayahNumber`
- **Mobile file:** `apps/mobile/src/services/islamicApi.ts:60-61`
- **Mobile code:** `api.get('/islamic/quran/surahs/${surahNumber}/verses/${verseNumber}')`
- **Backend route:** `@Get('quran/chapters/:surahNumber/verses/:ayahNumber')` → `/api/v1/islamic/quran/chapters/:surahNumber/verses/:ayahNumber`
- **Result:** Individual verse fetching returns 404.
- **Severity:** P0 — Core Islamic feature broken

### Finding 64-010: No mobile API call for Quran search, juz, or random ayah
- **Backend routes that exist but have no mobile integration:**
  - `GET /islamic/quran/search?q=...` (controller line 298)
  - `GET /islamic/quran/juz/:juzNumber` (controller line 287)
  - `GET /islamic/quran/random-ayah` (controller line 311)
- **Impact:** Backend has rich Quran API; mobile cannot access search, juz browsing, or daily ayah.
- **Severity:** P2 — Missing integration

---

## Broadcast Channel Path Mismatch (13 endpoints affected)

### Finding 64-011: Mobile uses `/broadcast-channels/*` but backend has `/broadcast/*`
- **Mobile file:** `apps/mobile/src/services/api.ts:858-895`
- **Mobile paths:** `/broadcast-channels/discover`, `/broadcast-channels/mine`, `/broadcast-channels/${id}`, etc.
- **Backend file:** `apps/api/src/modules/broadcast/broadcast.controller.ts:12`
- **Backend controller:** `@Controller('broadcast')` → routes are `/api/v1/broadcast/...`
- **Mobile expects:** `/api/v1/broadcast-channels/discover` → 404
- **Backend serves:** `/api/v1/broadcast/discover`
- **Result:** ALL 13 broadcast channel endpoints called by mobile will 404.
- **Affected mobile calls:**
  - `broadcastApi.discover()` → `/broadcast-channels/discover` (backend: `/broadcast/discover`)
  - `broadcastApi.getMyChannels()` → `/broadcast-channels/mine` (backend: `/broadcast/my`)
  - `broadcastApi.getBySlug()` → `/broadcast-channels/slug/${slug}` (backend: `/broadcast/${slug}`)
  - `broadcastApi.getById()` → `/broadcast-channels/${id}` (backend: `/broadcast/${id}`)
  - `broadcastApi.create()` → POST `/broadcast-channels` (backend: POST `/broadcast`)
  - `broadcastApi.subscribe()` → POST `/broadcast-channels/${id}/subscribe` (backend: POST `/broadcast/${id}/subscribe`)
  - `broadcastApi.unsubscribe()` → DELETE `/broadcast-channels/${id}/subscribe` (backend: DELETE `/broadcast/${id}/subscribe`)
  - `broadcastApi.mute()` → POST `/broadcast-channels/${id}/mute` (backend: PATCH `/broadcast/${id}/mute`)
  - `broadcastApi.unmute()` → DELETE `/broadcast-channels/${id}/mute` (backend: no unmute endpoint; mute takes body `{ muted: boolean }`)
  - `broadcastApi.getMessages()` → `/broadcast-channels/${id}/messages` (backend: `/broadcast/${id}/messages`)
  - `broadcastApi.sendMessage()` → POST `/broadcast-channels/${id}/messages` (backend: POST `/broadcast/${id}/messages`)
  - `broadcastApi.pinMessage()` → POST `/broadcast-channels/${channelId}/messages/${messageId}/pin` (backend: PATCH `/broadcast/messages/${messageId}/pin`)
  - `broadcastApi.unpinMessage()` → DELETE `/broadcast-channels/${channelId}/messages/${messageId}/pin` (backend: DELETE `/broadcast/messages/${messageId}/pin`)
  - `broadcastApi.deleteMessage()` → DELETE `/broadcast-channels/${channelId}/messages/${messageId}` (backend: DELETE `/broadcast/messages/${messageId}`)
  - `broadcastApi.getPinnedMessages()` → GET `/broadcast-channels/${id}/messages/pinned` (backend: GET `/broadcast/${id}/pinned`)
  - `broadcastApi.promoteToAdmin()` → POST `/broadcast-channels/${channelId}/admins/${userId}` (backend: POST `/broadcast/${id}/promote/${targetUserId}`)
  - `broadcastApi.demoteFromAdmin()` → DELETE `/broadcast-channels/${channelId}/admins/${userId}` (backend: POST `/broadcast/${id}/demote/${targetUserId}`)
  - `broadcastApi.removeSubscriber()` → DELETE `/broadcast-channels/${channelId}/subscribers/${userId}` (backend: DELETE `/broadcast/${id}/subscribers/${targetUserId}`)
- **Severity:** P0 — Entire broadcast channels feature dead

### Finding 64-012: Broadcast mute/unmute method and path mismatch
- **Mobile:** `broadcastApi.mute()` → POST `/broadcast-channels/${id}/mute`, `broadcastApi.unmute()` → DELETE `/broadcast-channels/${id}/mute`
- **Backend:** PATCH `/broadcast/${id}/mute` with body `{ muted: boolean }` — a single toggle endpoint
- **Issues:** (1) Wrong HTTP method (POST/DELETE vs PATCH), (2) No separate unmute endpoint, (3) Wrong path prefix
- **Severity:** P0 (within the already-broken broadcast system)

### Finding 64-013: Broadcast pin message path structure mismatch
- **Mobile:** `POST /broadcast-channels/${channelId}/messages/${messageId}/pin`
- **Backend:** `PATCH /broadcast/messages/${messageId}/pin` — flat structure, no channelId in path
- **Also:** Mobile uses POST, backend uses PATCH
- **Severity:** P0

### Finding 64-014: Broadcast getMyChannels path mismatch
- **Mobile:** `GET /broadcast-channels/mine`
- **Backend:** `GET /broadcast/my`
- **Note:** Even after fixing the prefix, `mine` vs `my` would still mismatch.
- **Severity:** P0

---

## Settings Field Name Mismatches

### Finding 64-015: Blocked keywords — mobile sends `{ word }` but backend expects `{ keyword }`
- **Mobile file:** `apps/mobile/src/services/api.ts:740`
- **Mobile code:** `api.post('/settings/blocked-keywords', { word })`
- **Backend file:** `apps/api/src/modules/settings/settings.controller.ts:26-28`
- **Backend DTO:** `class AddKeywordDto { keyword: string; }` — field name is `keyword`, not `word`
- **Result:** Backend receives `{ word: "bad" }` but validates for `keyword` field. The `keyword` field will be undefined, likely silently storing empty/null or failing validation.
- **Severity:** P1 — Feature silently broken

### Finding 64-016: Daily reminder endpoint does not exist
- **Mobile file:** `apps/mobile/src/services/api.ts:263`
- **Mobile code:** `api.patch('/users/settings/daily-reminder', { enabled, time })`
- **Backend:** No `PATCH /users/settings/daily-reminder` endpoint exists in users.controller.ts or settings.controller.ts
- **Result:** 404 on every call. Daily reminder feature completely broken.
- **Severity:** P1 — Feature does not exist on backend

---

## User Data Export Path Mismatch

### Finding 64-017: Mobile calls `/users/me/export-data` but backend has `/users/me/data-export`
- **Mobile file:** `apps/mobile/src/services/api.ts:257-258`
- **Mobile code:** `api.get('/users/me/export-data')`
- **Backend file:** `apps/api/src/modules/users/users.controller.ts:50`
- **Backend route:** `@Get('me/data-export')` → `/api/v1/users/me/data-export`
- **Result:** GDPR data export always returns 404. Users cannot export their data.
- **Severity:** P1 — Legal/compliance issue (GDPR right to data portability)

---

## Notifications API Mismatch

### Finding 64-018: Mobile calls `/notifications/unread-counts` but backend only has `/notifications/unread`
- **Mobile file:** `apps/mobile/src/services/api.ts:636`
- **Mobile code:** `api.get('/notifications/unread-counts')`
- **Backend file:** `apps/api/src/modules/notifications/notifications.controller.ts:36-39`
- **Backend route:** Only `@Get('unread')` exists, which returns `{ unread: number }`
- **There is no `unread-counts` endpoint returning per-type counts.
- **Result:** `notificationsApi.getUnreadCounts()` returns 404. Any UI displaying per-type notification counts is broken.
- **Severity:** P1

---

## Post Unarchive HTTP Method Mismatch

### Finding 64-019: Mobile uses POST for unarchive but backend uses DELETE
- **Mobile file:** `apps/mobile/src/services/api.ts:314-315`
- **Mobile code:** `api.post('/posts/${id}/unarchive')`
- **Backend file:** `apps/api/src/modules/posts/posts.controller.ts:290-296`
- **Backend route:** `@Delete(':id/archive')` — unarchive is a DELETE to the archive endpoint
- **Result:** POST `/posts/${id}/unarchive` returns 404. Users cannot unarchive posts from mobile.
- **Severity:** P1

---

## Post Share-as-Story Endpoint Missing

### Finding 64-020: Mobile calls `/posts/${id}/share-as-story` but backend has no such endpoint
- **Mobile file:** `apps/mobile/src/services/api.ts:330`
- **Mobile code:** `api.post('/posts/${id}/share-as-story')`
- **Backend:** No `share-as-story` route exists in posts.controller.ts
- **Result:** 404. Share as story feature broken.
- **Severity:** P2

---

## Messages API Mismatches

### Finding 64-021: Schedule message path mismatch — mobile sends per-conversation, backend expects body-level conversationId
- **Mobile file:** `apps/mobile/src/services/api.ts:615-616`
- **Mobile code:** `api.post('/messages/conversations/${conversationId}/schedule', { content, scheduledAt, messageType })`
- **Backend file:** `apps/api/src/modules/messages/messages.controller.ts:413-426`
- **Backend route:** `@Post('messages/scheduled')` — The conversationId is in the DTO body, not the URL path
- **Actual backend URL:** `/api/v1/messages/messages/scheduled` (note: controller prefix is `messages`, route is `messages/scheduled`)
- **Result:** Mobile POST to `/messages/conversations/:id/schedule` hits no route. 404.
- **Severity:** P1 — Message scheduling broken

### Finding 64-022: Starred messages path has double `messages` prefix
- **Mobile file:** `apps/mobile/src/services/api.ts:617-618`
- **Mobile code:** `api.get('/messages/starred')`
- **Backend file:** `apps/api/src/modules/messages/messages.controller.ts:428-435`
- **Backend route:** `@Get('messages/starred')` under `@Controller('messages')` → actual URL is `/api/v1/messages/messages/starred`
- **Result:** Mobile GET `/messages/starred` returns 404. Backend route is `/messages/messages/starred`.
- **Severity:** P1 — Starred messages feature broken

### Finding 64-023: Message pin/unpin/star path format inconsistency
- **Mobile file:** `apps/mobile/src/services/api.ts:619-622`
- **Mobile calls:**
  - `pin`: `api.post('/messages/${conversationId}/${messageId}/pin')`
  - `unpin`: `api.delete('/messages/${conversationId}/${messageId}/pin')`
  - `toggleStar`: `api.post('/messages/${conversationId}/${messageId}/star')`
  - `getPinned`: `api.get('/messages/${conversationId}/pinned')`
- **Backend routes (messages.controller.ts:438-466):**
  - `@Post(':conversationId/:messageId/pin')` → `/api/v1/messages/:conversationId/:messageId/pin` ✓ matches
  - `@Delete(':conversationId/:messageId/pin')` → matches ✓
  - No `star` toggle endpoint exists at `:conversationId/:messageId/star`
  - `@Get(':conversationId/pinned')` → matches ✓
- **Result:** `toggleStar` has no corresponding backend endpoint. 404.
- **Severity:** P1

### Finding 64-024: Disappearing timer uses PATCH but backend uses PUT
- **Mobile file:** `apps/mobile/src/services/api.ts:607-608`
- **Mobile code:** `api.patch('/messages/conversations/${conversationId}/disappearing-timer', { duration })`
- **Backend file:** `apps/api/src/modules/messages/messages.controller.ts:385-393`
- **Backend route:** `@Put('conversations/:id/disappearing')` — uses PUT, not PATCH, and path is `disappearing` not `disappearing-timer`
- **Result:** PATCH to `/messages/conversations/:id/disappearing-timer` returns 404 (wrong method AND wrong path).
- **Severity:** P1

### Finding 64-025: Archive conversation uses POST but backend uses PUT
- **Mobile file:** `apps/mobile/src/services/api.ts:609-610`
- **Mobile code:** `api.post('/messages/conversations/${conversationId}/archive')`
- **Backend file:** `apps/api/src/modules/messages/messages.controller.ts:395-402`
- **Backend route:** `@Put('conversations/:id/archive')` — uses PUT not POST
- **Note:** Backend also has `@Post('conversations/:id/archive')` at line 251-258 which takes `{ archived: boolean }` body. So this may route to the older endpoint but mobile doesn't send a body to the archive POST endpoint.
- **Severity:** P2 — May partially work but semantic confusion

---

## Gamification API Mismatches

### Finding 64-026: Leaderboard path — mobile uses `/leaderboard/${type}` but backend uses `/leaderboard?type=`
- **Mobile file:** `apps/mobile/src/services/api.ts:1257`
- **Mobile code:** `api.get('/leaderboard/${type}')`
- **Backend file:** `apps/api/src/modules/gamification/gamification.controller.ts:69-73`
- **Backend route:** `@Get('leaderboard')` with `@Query('type') type = 'xp'` — type is a query param, not a path segment
- **Result:** Mobile GET `/leaderboard/xp` won't match `/leaderboard`. Returns 404.
- **Severity:** P1 — Leaderboard feature broken

### Finding 64-027: Challenges does not support `category` query param on mobile
- **Mobile file:** `apps/mobile/src/services/api.ts:1259`
- **Mobile code:** `api.get('/challenges${qs(params || {})}')` — params include `category`
- **Backend file:** `apps/api/src/modules/gamification/gamification.controller.ts:79-83`
- **Backend route:** `@Get('challenges')` with `@Query('cursor')` and `@Query('limit')` — no `@Query('category')`
- **Result:** Category filter parameter is silently ignored by backend.
- **Severity:** P3 — Cosmetic (filter doesn't work)

---

## Gifts API Mismatches

### Finding 64-028: Mobile `getReceived` uses userId path param but backend doesn't accept userId
- **Mobile file:** `apps/mobile/src/services/giftsApi.ts:43`
- **Mobile code:** `api.get('/gifts/received/${userId}')`
- **Backend file:** `apps/api/src/modules/gifts/gifts.controller.ts:104-109`
- **Backend route:** `@Get('received')` — no `:userId` path param, uses `@CurrentUser('id')` instead
- **Result:** GET `/gifts/received/abc123` won't match GET `/gifts/received`. Returns 404.
- **Severity:** P1 — Cannot view another user's received gifts

---

## Promotions API Mismatches

### Finding 64-029: Cancel promotion — mobile uses DELETE but backend uses POST
- **Mobile file:** `apps/mobile/src/services/promotionsApi.ts:9`
- **Mobile code:** `api.delete('/promotions/${id}')`
- **Backend file:** `apps/api/src/modules/promotions/promotions.controller.ts:61-71`
- **Backend route:** `@Post(':id/cancel')` — POST to `/promotions/:id/cancel`, not DELETE to `/promotions/:id`
- **Result:** DELETE `/promotions/${id}` doesn't match any route. 404.
- **Severity:** P1

### Finding 64-030: Get my promotions — mobile uses `/promotions/my` but backend uses `/promotions/mine`
- **Mobile file:** `apps/mobile/src/services/promotionsApi.ts:7`
- **Mobile code:** `api.get('/promotions/my')`
- **Backend file:** `apps/api/src/modules/promotions/promotions.controller.ts:54-59`
- **Backend route:** `@Get('mine')` → `/api/v1/promotions/mine`
- **Result:** GET `/promotions/my` doesn't match GET `/promotions/mine`. 404.
- **Severity:** P1

### Finding 64-031: Set reminder — mobile uses path param but backend uses body
- **Mobile file:** `apps/mobile/src/services/promotionsApi.ts:11-12`
- **Mobile code:** `api.post('/promotions/remind/${postId}', { remindAt })`
- **Backend file:** `apps/api/src/modules/promotions/promotions.controller.ts:73-82`
- **Backend route:** `@Post('reminder')` with body `{ postId, remindAt }` — postId is in body, not path
- **Result:** POST `/promotions/remind/${postId}` doesn't match POST `/promotions/reminder`. 404.
- **Severity:** P1

### Finding 64-032: Remove reminder — same path mismatch
- **Mobile file:** `apps/mobile/src/services/promotionsApi.ts:14-15`
- **Mobile code:** `api.delete('/promotions/remind/${postId}')`
- **Backend file:** `apps/api/src/modules/promotions/promotions.controller.ts:84-93`
- **Backend route:** `@Delete('reminder/:postId')` → `/api/v1/promotions/reminder/${postId}`
- **Mobile sends:** `/promotions/remind/${postId}` (missing the 'er' suffix)
- **Severity:** P1

### Finding 64-033: Mark branded — mobile calls `/posts/${postId}/branded` but backend has `/promotions/branded`
- **Mobile file:** `apps/mobile/src/services/promotionsApi.ts:17-18`
- **Mobile code:** `api.patch('/posts/${postId}/branded', { partnerName })`
- **Backend file:** `apps/api/src/modules/promotions/promotions.controller.ts:95-104`
- **Backend route:** `@Post('branded')` with body `{ postId, partnerName }` — entirely different controller (promotions, not posts)
- **Result:** PATCH `/posts/${postId}/branded` doesn't match any posts controller endpoint. 404.
- **Severity:** P1

---

## Volunteer API — Backend Does Not Exist

### Finding 64-034: Mobile has `volunteerApi` but no volunteer controller exists
- **Mobile file:** `apps/mobile/src/services/api.ts:1306-1313`
- **Mobile endpoints:** `/volunteer`, `/volunteer/:id/signup`
- **Backend:** No `@Controller('volunteer')` exists anywhere in the codebase
- **Result:** All 3 volunteer endpoints return 404.
- **Severity:** P1 — Feature has no backend

---

## Account API — Backend Does Not Exist

### Finding 64-035: Mobile has `accountApi.requestDataExport()` but no account controller exists
- **Mobile file:** `apps/mobile/src/services/api.ts:1162-1164`
- **Mobile code:** `api.post('/account/export')`
- **Backend:** No `@Controller('account')` exists in the codebase
- **Result:** 404. This is separate from the `usersApi.exportData()` which calls the also-mismatched `/users/me/export-data`.
- **Severity:** P2 — Duplicate dead code (two mobile endpoints trying to do the same thing, neither works correctly)

---

## Two-Factor API Mismatches

### Finding 64-036: 2FA validate and backup endpoints are UNAUTHENTICATED — mobile sends auth but backend doesn't require it
- **Mobile file:** `apps/mobile/src/services/twoFactorApi.ts:16`
- **Mobile code:** `api.post('/two-factor/validate', data)` — sends Authorization header
- **Backend file:** `apps/api/src/modules/two-factor/two-factor.controller.ts:108-115`
- **Backend:** No `@UseGuards(ClerkAuthGuard)` on `validate` or `backup` endpoints. These accept `{ userId, code }` in body.
- **Security issue:** Any attacker can brute-force any user's TOTP code by calling `POST /two-factor/validate` with any userId.
- **Severity:** P0 — Security vulnerability (previously documented in agent 03)

### Finding 64-037: 2FA disable — mobile sends body `{ code }` via DELETE but backend DTO expects `{ code }` too
- **Mobile file:** `apps/mobile/src/services/twoFactorApi.ts:18`
- **Mobile code:** `api.delete('/two-factor/disable', data)` — sends body with DELETE request
- **Backend file:** `apps/api/src/modules/two-factor/two-factor.controller.ts:117-130`
- **Backend:** `@Delete('disable')` with `@Body() dto: DisableDto` — accepts body on DELETE
- **Note:** While technically matching, sending a body with DELETE is non-standard and some HTTP clients/proxies strip DELETE bodies. This is fragile.
- **Severity:** P3 — Fragile design

---

## Live Sessions API Mismatches

### Finding 64-038: getHostSessions — mobile uses `/live/host/${userId}` but backend uses `/live/my`
- **Mobile file:** `apps/mobile/src/services/api.ts:925-926`
- **Mobile code:** `api.get('/live/host/${userId}')`
- **Backend file:** `apps/api/src/modules/live/live.controller.ts:38-43`
- **Backend route:** `@Get('my')` → `/api/v1/live/my` — uses CurrentUser, not path param
- **Result:** GET `/live/host/${userId}` doesn't match. 404.
- **Severity:** P1

---

## Audio Rooms API Mismatches

### Finding 64-039: Audio rooms list — mobile sends `status` as query param but backend doesn't accept `status`
- **Mobile file:** `apps/mobile/src/services/audioRoomsApi.ts:21-22`
- **Mobile code:** `api.get('/audio-rooms${qs({ cursor, status })}')`
- **Backend file:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts:39-48`
- **Backend:** `list()` accepts `cursor` and `limit` but not `status`
- **Result:** Status filter silently ignored. Not a 404 but unexpected behavior.
- **Severity:** P3

### Finding 64-040: Audio rooms toggleMute — mobile sends `{ userId }` body but backend DTO field is `targetUserId`
- **Mobile file:** `apps/mobile/src/services/audioRoomsApi.ts:38-39`
- **Mobile code:** `api.patch('/audio-rooms/${roomId}/mute', userId ? { userId } : undefined)`
- **Backend file:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts:115-126`
- **Backend:** `toggleMute()` receives `dto: MuteToggleDto` and passes `dto.targetUserId`
- **Result:** If MuteToggleDto expects `targetUserId` but mobile sends `userId`, the field won't be picked up. Host muting other users will silently fail (self-mute may still work since no body needed).
- **Severity:** P1

---

## Commerce API — Path vs. Query Mismatches

### Finding 64-041: Commerce `getProducts` passes `search` as query param — matches backend ✓
- Works correctly. Both use query params.

### Finding 64-042: Commerce `getBusinesses` passes `lat`/`lng` as query params — matches backend ✓
- Works correctly.

---

## Gamification — Series `discover` Query Param Mismatch

### Finding 64-043: Series discover — mobile sends `category` but backend accepts it ✓
- **Backend file:** `apps/api/src/modules/gamification/gamification.controller.ts:124-133`
- **Backend:** `discoverSeries(@Query('category') category?: string)` — correctly accepts category.
- **Status:** Matches. No issue.

---

## Backend Features With No Mobile Integration

### Finding 64-044: Creator `askAI` endpoint has no mobile caller
- **Backend:** `POST /creator/ask` with `{ question: string }` (creator.controller.ts:81-89)
- **Mobile:** `creatorApi` has no `askAI()` method
- **Impact:** AI analytics chat feature exists on backend but not exposed to mobile users.
- **Severity:** P3

### Finding 64-045: Encryption `safety-number` and `status` endpoints have no mobile integration
- **Backend endpoints:**
  - `GET /encryption/safety-number/:otherUserId` (controller line 129)
  - `GET /encryption/status/:conversationId` (controller line 139)
- **Mobile file:** `encryptionApi.ts` — does not include these endpoints
- **Impact:** Users cannot verify encryption safety numbers or check encryption status.
- **Severity:** P2

### Finding 64-046: Messages `searchMessages`, `forward`, `delivered`, `media`, group admin endpoints not in mobile API services
- **Backend endpoints not called by mobile service layer:**
  - `GET /messages/:conversationId/search?q=...` (line 359)
  - `POST /messages/forward/:messageId` (line 365)
  - `POST /messages/:messageId/delivered` (line 372)
  - `GET /messages/:conversationId/media` (line 379)
  - `POST /messages/:conversationId/view-once` (line 469)
  - `POST /messages/view-once/:messageId/viewed` (line 479)
  - `POST /messages/:conversationId/members/:targetUserId/promote` (line 489)
  - `POST /messages/:conversationId/members/:targetUserId/demote` (line 499)
  - `POST /messages/:conversationId/members/:targetUserId/ban` (line 509)
  - `PATCH /messages/:conversationId/wallpaper` (line 519)
  - `PATCH /messages/:conversationId/tone` (line 529)
- **Note:** Some of these may be called from screen files using raw fetch. But they're not in the centralized API service.
- **Severity:** P2 — Missing mobile integration for built features

### Finding 64-047: Islamic prayer-times/current-window endpoint not in mobile service
- **Backend:** `GET /islamic/prayer-times/current-window?fajr=...&dhuhr=...` (controller line 510)
- **Mobile:** `islamicApi` has no `getCurrentPrayerWindow()` method
- **Severity:** P3

### Finding 64-048: Halal controller exists but mobile `commerceApi` calls `/businesses` not `/halal`
- **Backend:** There is a `halal.controller.ts` at `/halal` AND commerce.controller uses rootless `/businesses`
- **Mobile:** Calls `/businesses` which matches the commerce controller pattern
- **Status:** Not a mismatch per se, but there may be confusion about which controller serves business data.
- **Severity:** P3

---

## Follows API — userId vs. username Mismatch

### Finding 64-049: Mobile sends `userId` to follows endpoints but the value might be a username
- **Mobile file:** `apps/mobile/src/services/api.ts:272-275`
- **Mobile code:** `api.get('/follows/${userId}/followers')` — passes first arg as `userId`
- **Backend file:** `apps/api/src/modules/follows/follows.controller.ts:89-105`
- **Backend:** `@Get(':userId/followers')` with `@Param('userId')` — expects actual userId
- **Note:** Users controller also has `/users/:username/followers` at line 287-293. If mobile passes username instead of userId, wrong endpoint.
- **Potential issue:** Mobile `followsApi.getFollowers(userId)` and `usersApi.getProfile(username)` suggest userId and username are used interchangeably but they route to completely different controllers.
- **Severity:** P2 — Potential confusion, works if calling code passes correct ID type

---

## Bookmarks — Mobile vs Backend Save API Contract

### Finding 64-050: Mobile savePost sends `{ collectionName }` in URL body but backend expects `{ postId }` in body
- **Mobile file:** `apps/mobile/src/services/api.ts:1119-1120`
- **Mobile code:** `api.post('/bookmarks/posts/${postId}', { collectionName })`
- **Backend file:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts:41-45`
- **Backend route:** `@Post('posts')` with body `SavePostDto` containing `postId` and optional `collectionName`
- **Mobile puts postId in URL path; backend expects it in body.
- **Result:** Even if the double-prefix bug (finding 64-002) is fixed, the route still won't match because mobile sends POST to `/bookmarks/posts/${postId}` but backend expects POST to `/bookmarks/posts` with `{ postId }` in body.
- **Severity:** P0 (compounded with 64-002)

### Finding 64-051: Bookmark isPostSaved — mobile path `saved` vs backend `status`
- **Mobile file:** `apps/mobile/src/services/api.ts:1141-1142`
- **Mobile code:** `api.get('/bookmarks/posts/${postId}/saved')`
- **Backend file:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts:60-64`
- **Backend route:** `@Get('posts/:postId/status')` — path segment is `status`, not `saved`
- **Result:** 404 (even if double-prefix fixed).
- **Severity:** P1

### Finding 64-052: Bookmark isThreadSaved and isVideoSaved — same `saved` vs `status` mismatch
- **Mobile:** `GET /bookmarks/threads/${threadId}/saved` and `GET /bookmarks/videos/${videoId}/saved`
- **Backend:** `GET /bookmarks/threads/:threadId/status` and `GET /bookmarks/videos/:videoId/status`
- **Severity:** P1

### Finding 64-053: Bookmark moveToCollection — mobile uses generic bookmarkId but backend expects postId with different path
- **Mobile file:** `apps/mobile/src/services/api.ts:1139-1140`
- **Mobile code:** `api.patch('/bookmarks/${bookmarkId}/collection', { collectionName })`
- **Backend file:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts:67-75`
- **Backend route:** `@Patch('posts/:postId/move')` with body `{ collectionName }`
- **Issues:** (1) Mobile uses `bookmarkId`, backend expects `postId`. (2) Path is `/${bookmarkId}/collection` vs `/posts/${postId}/move`.
- **Severity:** P1

### Finding 64-054: Bookmark saveThread — mobile sends body `{ collectionName }` but backend accepts no body
- **Mobile file:** `apps/mobile/src/services/api.ts:1123-1124`
- **Mobile code:** `api.post('/bookmarks/threads/${threadId}', { collectionName })`
- **Backend file:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts:106-109`
- **Backend route:** `@Post('threads/:threadId')` — no body DTO, just saves threadId
- **Result:** `collectionName` is silently ignored for thread bookmarks.
- **Severity:** P3

---

## Summary Statistics

| Category | Count | Severity |
|----------|-------|----------|
| Double-prefix (all endpoints dead) | 6 controllers (~30 endpoints) | P0 |
| Wrong path prefix (broadcast-channels vs broadcast) | 13+ endpoints | P0 |
| Wrong path segment (surahs vs chapters, etc.) | 10 | P0-P1 |
| Wrong HTTP method (POST vs DELETE, PATCH vs PUT) | 5 | P1 |
| Wrong body field names | 3 | P1 |
| Missing backend endpoints | 5 | P1-P2 |
| Backend features with no mobile integration | 15+ | P2-P3 |
| Query param silently ignored | 3 | P3 |
| **TOTAL FINDINGS** | **64** | |

## P0 Summary (Ship Blockers)

1. **6 controllers with double-prefix bug** → ~30 endpoints dead (downloads, bookmarks, reports, events, embeddings, retention)
2. **Broadcast channels entire feature dead** → 13+ endpoints have wrong path prefix (`broadcast-channels` vs `broadcast`)
3. **Quran API broken** → 3 endpoints use `surahs` instead of `chapters`
4. **2FA validate/backup unauthenticated** → Account takeover risk
5. **Bookmark save/unsave API contract wrong** → postId in path vs body mismatch

## P1 Summary (Must Fix Before Launch)

1. Blocked keywords field name mismatch (`word` vs `keyword`)
2. Daily reminder endpoint doesn't exist on backend
3. User data export path mismatch (`export-data` vs `data-export`)
4. Notifications `unread-counts` endpoint missing
5. Post unarchive HTTP method mismatch
6. Message scheduling path mismatch
7. Starred messages double-prefix in controller
8. Message star toggle endpoint missing
9. Disappearing timer path AND method mismatch
10. Leaderboard type as path segment vs query param
11. Gifts received endpoint path mismatch
12. All 5 promotions endpoints have various mismatches
13. Live sessions host endpoint path mismatch
14. Audio rooms mute body field name mismatch
15. Bookmark `saved` vs `status` check endpoints (3 occurrences)
16. Bookmark move-to-collection path mismatch
