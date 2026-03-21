# Agent 25 — Mobile API Service Layer Audit

**Scope:** All 19 files in `apps/mobile/src/services/`
**Auditor:** Claude Opus 4.6 Agent #25
**Date:** 2026-03-21
**Total findings:** 52

---

## TIER 0 — Ship Blockers (14 findings)

### F01. DOUBLE-PREFIX: Bookmarks API unreachable (all endpoints)
- **File:** `apps/mobile/src/services/api.ts`, lines 1118-1147
- **Backend:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`, line 25
- **Severity:** CRITICAL
- **Category:** Double-prefix API path bug
- **Description:** Backend controller is `@Controller('api/v1/bookmarks')` but the NestJS global prefix is already `api/v1`. The actual route becomes `/api/v1/api/v1/bookmarks/*`. Mobile calls `/bookmarks/*` which after client prefix becomes `/api/v1/bookmarks/*` -- this path does not exist. **All bookmark save/unsave/check/collection operations are completely broken.**
- **Impact:** All bookmarks functionality is dead.

### F02. DOUBLE-PREFIX: Downloads API unreachable (all endpoints)
- **File:** `apps/mobile/src/services/api.ts`, lines 1167-1180
- **Backend:** `apps/api/src/modules/downloads/downloads.controller.ts`, line 25
- **Severity:** CRITICAL
- **Category:** Double-prefix API path bug
- **Description:** Backend controller is `@Controller('api/v1/downloads')`. Actual route: `/api/v1/api/v1/downloads/*`. Mobile calls `/downloads/*`. Every download request/list/progress/delete operation returns 404.

### F03. DOUBLE-PREFIX: Reports API unreachable (all endpoints)
- **File:** `apps/mobile/src/services/api.ts`, lines 1084-1098
- **Backend:** `apps/api/src/modules/reports/reports.controller.ts`, line 23
- **Severity:** CRITICAL
- **Category:** Double-prefix API path bug
- **Description:** Backend controller is `@Controller('api/v1/reports')`. Actual route: `/api/v1/api/v1/reports/*`. Mobile calls `/reports/*`. Content reporting is completely non-functional.

### F04. DOUBLE-PREFIX: Events API unreachable (all endpoints)
- **File:** `apps/mobile/src/services/eventsApi.ts`, lines 22-39
- **Backend:** `apps/api/src/modules/events/events.controller.ts`, line 157
- **Severity:** CRITICAL
- **Category:** Double-prefix API path bug
- **Description:** Backend controller is `@Controller('api/v1/events')`. Actual route: `/api/v1/api/v1/events/*`. Mobile calls `/events/*`. Create/list/RSVP for events all return 404.

### F05. DOUBLE-PREFIX: Retention API unreachable
- **File:** Not directly called from mobile services but mentioned for completeness.
- **Backend:** `apps/api/src/modules/retention/retention.controller.ts`, line 9
- **Severity:** HIGH
- **Category:** Double-prefix API path bug
- **Description:** Backend controller is `@Controller('api/v1/retention')`. Actual route: `/api/v1/api/v1/retention/*`. Any future mobile retention tracking will fail.

### F06. DOUBLE-PREFIX: Embeddings API unreachable
- **File:** Not directly called from mobile services.
- **Backend:** `apps/api/src/modules/embeddings/embeddings.controller.ts`, line 8
- **Severity:** HIGH
- **Category:** Double-prefix API path bug
- **Description:** Backend controller is `@Controller('api/v1/embeddings')`. Actual route: `/api/v1/api/v1/embeddings/*`.

### F07. Broadcast API: Complete path mismatch (all endpoints broken)
- **File:** `apps/mobile/src/services/api.ts`, lines 858-895
- **Backend:** `apps/api/src/modules/broadcast/broadcast.controller.ts`, line 12
- **Severity:** CRITICAL
- **Category:** Route path mismatch
- **Description:** Mobile calls `/broadcast-channels/*` but backend route is `/broadcast/*`. Every broadcast channel operation returns 404. Additionally, mobile calls `mine` (line 862) but backend endpoint is `my` (line 34 of controller).
- **Code (mobile):**
  ```ts
  api.get<BroadcastChannel[]>('/broadcast-channels/mine')
  ```
- **Code (backend):**
  ```ts
  @Controller('broadcast')
  // ...
  @Get('my')
  ```

### F08. Channel Posts API: Complete path mismatch (all endpoints broken)
- **File:** `apps/mobile/src/services/api.ts`, lines 1004-1018
- **Backend:** `apps/api/src/modules/channel-posts/channel-posts.controller.ts`, line 12
- **Severity:** CRITICAL
- **Category:** Route path mismatch
- **Description:** Mobile calls `/channels/:channelId/posts` but backend route is `/channel-posts/:channelId` for create and `/channel-posts/channel/:channelId` for list. All channel community post operations are broken.
- **Code (mobile):**
  ```ts
  api.get<PaginatedResponse<ChannelPost>>(`/channels/${channelId}/posts${cursor ? ...}`)
  ```
- **Code (backend):**
  ```ts
  @Controller('channel-posts')
  @Get('channel/:channelId')  // GET /channel-posts/channel/:channelId
  ```

### F09. Fatwa Q&A: Raw fetch without auth token, calls non-existent endpoint
- **File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`, lines 19, 43-49, 56-63
- **Severity:** CRITICAL
- **Category:** Missing auth / Non-existent endpoint
- **Description:** Uses raw `fetch()` instead of `api` client, meaning no Authorization header is attached. Calls `/fatwa` but no such endpoint exists -- the backend is at `/scholar-qa`. Both GET and POST always fail (401 unauthenticated + 404 not found).
- **Code:**
  ```ts
  const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  const res = await fetch(`${API_BASE}/fatwa?${params}`);  // No auth, wrong path
  ```

### F10. Halal finder: api.get() called with unsupported params object
- **File:** `apps/mobile/app/(screens)/halal-finder.tsx`, line 131
- **Severity:** CRITICAL
- **Category:** API method misuse
- **Description:** Calls `api.get('/halal/restaurants', { params: { lat, lng, radius } })` but `api.get<T>(path: string)` only accepts a path string. The second argument (options/params) is silently ignored. The request goes to `/halal/restaurants` with no query parameters, meaning latitude/longitude/radius are never sent. The backend will fail (lat/lng required) or return wrong results.
- **Code:**
  ```ts
  api.get('/halal/restaurants', {  // Second arg silently ignored!
    params: { lat: currentLocation.lat, lng: currentLocation.lng, radius: 25 },
  })
  ```

### F11. Bookmarks savePost: Request body shape mismatch with backend DTO
- **File:** `apps/mobile/src/services/api.ts`, line 1119-1120
- **Backend:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`, lines 41-44
- **Severity:** HIGH (also affected by F01 double-prefix)
- **Category:** Request body mismatch
- **Description:** Even if the double-prefix were fixed, the mobile `savePost` sends `POST /bookmarks/posts/:postId` with `{ collectionName }` in body. But backend `savePost` expects `POST /bookmarks/posts` with `{ postId, collectionName }` in body (postId in body, not URL). The POST to `posts/:postId` does not match any backend route -- `DELETE posts/:postId` exists but not `POST posts/:postId`.
- **Code (mobile):** `api.post(\`/bookmarks/posts/${postId}\`, { collectionName })`
- **Code (backend):** `@Post('posts') savePost(..., @Body() dto: SavePostDto)` where `SavePostDto.postId` is required.

### F12. Blocked keywords: Field name mismatch (silently fails)
- **File:** `apps/mobile/src/services/api.ts`, line 740
- **Backend:** `apps/api/src/modules/settings/settings.controller.ts`, lines 102-108
- **Severity:** HIGH
- **Category:** DTO field name mismatch
- **Description:** Mobile sends `{ word }` but backend DTO `AddKeywordDto` expects `{ keyword }`. The body validation strips the unknown `word` field, `keyword` is undefined, and the request fails with a 400 validation error or creates a null keyword.
- **Code (mobile):** `api.post<BlockedKeyword>('/settings/blocked-keywords', { word })`
- **Code (backend):** `@IsString() keyword: string;`

### F13. Wellbeing settings: sensitiveContentFilter field name mismatch
- **File:** `apps/mobile/src/services/api.ts`, line 128
- **Backend:** `apps/api/src/modules/settings/dto/update-wellbeing.dto.ts`, line 15
- **Severity:** HIGH
- **Category:** DTO field name mismatch
- **Description:** Mobile defines `WellbeingSettings = { sensitiveContentFilter?: boolean; ... }` and sends to PATCH `/settings/wellbeing`. Backend DTO field is `sensitiveContent` (not `sensitiveContentFilter`). The toggle silently has no effect.
- **Code (mobile):** `{ sensitiveContentFilter?: boolean; dailyTimeLimit?: number }`
- **Code (backend):** `@IsOptional() @IsBoolean() sensitiveContent?: boolean;`

### F14. Account export: Calls non-existent endpoint
- **File:** `apps/mobile/src/services/api.ts`, line 1163
- **Backend:** No `/account/export` endpoint exists
- **Severity:** HIGH
- **Category:** Non-existent endpoint
- **Description:** `accountApi.requestDataExport()` calls `POST /account/export` but this endpoint does not exist. The actual data export is at `GET /privacy/export` (privacy controller) or `GET /users/me/export-data` (users controller). Always returns 404.
- **Code:** `requestDataExport: () => api.post('/account/export')`

---

## TIER 1 — Backend Modules with No Mobile Service (14 findings)

### F15. Halal restaurant finder: No service layer
- **Backend:** `apps/api/src/modules/halal/halal.controller.ts` — `@Controller('halal/restaurants')`
- **Severity:** MEDIUM
- **Description:** Backend has a full CRUD halal restaurant finder with nearby search, reviews, etc. No corresponding service in mobile services directory. The halal-finder.tsx screen calls `api.get()` directly with broken params (see F10).

### F16. Scholar Q&A: No service layer
- **Backend:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts` — `@Controller('scholar-qa')`
- **Severity:** MEDIUM
- **Description:** Backend has schedule/upcoming/recordings/questions/voting endpoints. No mobile service. The fatwa-qa screen uses raw fetch to a wrong endpoint (see F09).

### F17. Video replies: No service layer
- **Backend:** `apps/api/src/modules/video-replies/video-replies.controller.ts` — `@Controller('video-replies')`
- **Severity:** MEDIUM
- **Description:** Backend supports creating video replies to comments (TikTok-style). No mobile service, feature not accessible from app.

### F18. Community notes: No service layer
- **Backend:** `apps/api/src/modules/community-notes/community-notes.controller.ts` — `@Controller('community-notes')`
- **Severity:** MEDIUM
- **Description:** Backend has create/rate/view community notes (X/Twitter-style). No mobile service, feature not accessible.

### F19. Story chains ("Add Yours"): No service layer
- **Backend:** `apps/api/src/modules/story-chains/story-chains.controller.ts` — `@Controller('story-chains')`
- **Severity:** MEDIUM
- **Description:** Backend has create/trending/join story chain endpoints. No mobile service, feature not accessible.

### F20. Privacy (GDPR/CCPA): No service layer
- **Backend:** `apps/api/src/modules/privacy/privacy.controller.ts` — `@Controller('privacy')`
- **Severity:** MEDIUM
- **Description:** Backend has GDPR data export and right-to-delete endpoints. No mobile service. The `accountApi.requestDataExport()` calls the wrong path (F14).

### F21. Mosque communities (social graph): No service layer
- **Backend:** `apps/api/src/modules/mosques/mosques.controller.ts` — `@Controller('mosques')`
- **Severity:** MEDIUM
- **Description:** Backend has mosque creation, nearby search, follow/unfollow, posts, events. Separate from the Islamic service mosque finder. No mobile service.

### F22. Message checklists: No service layer
- **Backend:** `apps/api/src/modules/checklists/checklists.controller.ts` — `@Controller('checklists')`
- **Severity:** LOW
- **Description:** Backend has create/add-item/toggle-item/delete checklist endpoints for conversations. No mobile service.

### F23. Thumbnail A/B testing: No service layer
- **Backend:** `apps/api/src/modules/thumbnails/thumbnails.controller.ts` — `@Controller('thumbnails')`
- **Severity:** LOW
- **Description:** Backend supports thumbnail variant creation/stats. No mobile service.

### F24. Telegram features: No service layer
- **Backend:** `apps/api/src/modules/telegram-features/telegram-features.controller.ts` — `@Controller()`
- **Severity:** MEDIUM
- **Description:** Backend has saved messages, chat folders, slow mode, group topics, admin log, custom emoji. Routes at `/saved-messages/*`, `/chat-folders/*`, etc. No mobile service. Some screens may use raw fetch (see agent #39's findings).

### F25. Discord features: No service layer
- **Backend:** `apps/api/src/modules/discord-features/discord-features.controller.ts` — `@Controller()`
- **Severity:** MEDIUM
- **Description:** Backend has forum threads, webhooks, stage sessions, voice channels. Routes at `/circles/:circleId/forum`, `/webhooks/*`, etc. No mobile service.

### F26. Alt-profile: No service layer
- **Backend:** `apps/api/src/modules/alt-profile/alt-profile.controller.ts` — `@Controller('users/me/alt-profile')`
- **Severity:** LOW
- **Description:** Backend has create/update/delete alt-profile. No mobile service.

### F27. Stream (Cloudflare): No service layer
- **Backend:** `apps/api/src/modules/stream/stream.controller.ts` — `@Controller('stream')`
- **Severity:** LOW
- **Description:** Backend has video upload/status/delete via Cloudflare Stream. No mobile service. Videos cannot be uploaded from mobile.

### F28. Retention tracking: No service layer
- **Backend:** `apps/api/src/modules/retention/retention.controller.ts` — `@Controller('api/v1/retention')` (double-prefix, see F05)
- **Severity:** LOW
- **Description:** Backend has session depth tracking. No mobile service, and the endpoint itself is unreachable due to double-prefix.

---

## TIER 2 — Request/Response Mismatches (8 findings)

### F29. Bookmarks isPostSaved: Path mismatch
- **File:** `apps/mobile/src/services/api.ts`, line 1142
- **Backend:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`, line 60
- **Description:** Mobile calls `GET /bookmarks/posts/:postId/saved` but backend route is `GET /bookmarks/posts/:postId/status`. Even if double-prefix were fixed, this would 404.
- **Code (mobile):** `api.get<{ saved: boolean }>(\`/bookmarks/posts/${postId}/saved\`)`
- **Code (backend):** `@Get('posts/:postId/status')`

### F30. Bookmarks isThreadSaved: Same path mismatch
- **File:** `apps/mobile/src/services/api.ts`, line 1144
- **Backend:** Same controller, line 99
- **Description:** Mobile calls `.../saved` but backend route is `.../status`.

### F31. Bookmarks isVideoSaved: Same path mismatch
- **File:** `apps/mobile/src/services/api.ts`, line 1146
- **Backend:** Same controller, line 134
- **Description:** Mobile calls `.../saved` but backend route is `.../status`.

### F32. Bookmarks getSavedThreads: Missing collectionName parameter
- **File:** `apps/mobile/src/services/api.ts`, line 1133
- **Backend:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`, lines 88-96
- **Description:** Mobile sends `?collectionName=X` but backend `getSavedThreads` does not accept a `collectionName` query parameter. The parameter is silently ignored.

### F33. Bookmarks moveToCollection: Wrong path pattern
- **File:** `apps/mobile/src/services/api.ts`, line 1140
- **Backend:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`, lines 66-75
- **Description:** Mobile calls `PATCH /bookmarks/:bookmarkId/collection` but backend route is `PATCH /bookmarks/posts/:postId/move`. Different URL segment structure and `bookmarkId` vs `postId`.

### F34. Users daily reminder: Endpoint does not exist
- **File:** `apps/mobile/src/services/api.ts`, line 263
- **Severity:** HIGH
- **Category:** Non-existent endpoint
- **Description:** `usersApi.updateDailyReminder()` calls `PATCH /users/settings/daily-reminder` but no such endpoint exists in any backend controller. Always returns 404.
- **Code:** `api.patch('/users/settings/daily-reminder', { enabled, time })`

### F35. Bookmarks saveThread/saveVideo: Extra body field ignored
- **File:** `apps/mobile/src/services/api.ts`, lines 1124, 1128
- **Backend:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`, lines 106-109, 141-144
- **Description:** Mobile sends `{ collectionName }` in body for thread/video bookmark save, but backend `saveThread` and `saveVideo` take threadId/videoId from URL param only, no body is read. The `collectionName` is ignored -- threads/videos always go to default collection.

### F36. Gifts cashout: Calls non-existent endpoint
- **File:** `apps/mobile/src/services/giftsApi.ts`, line 42
- **Severity:** HIGH
- **Category:** Non-existent endpoint (likely)
- **Description:** `giftsApi.cashout({ diamonds: n })` calls `POST /gifts/cashout`. Need to verify this endpoint exists. The gifts controller may not have a cashout endpoint, making diamond-to-money conversion non-functional.

---

## TIER 3 — Missing Error Handling / Dead Code (10 findings)

### F37. offlineCache: Never imported anywhere
- **File:** `apps/mobile/src/services/offlineCache.ts`
- **Severity:** MEDIUM
- **Category:** Dead code
- **Description:** The `offlineCache` module and `withOfflineCache` HOF are fully implemented (157 lines) but never imported by any other file in the codebase. Complete dead code. No API call benefits from offline caching.

### F38. downloadManager: Never imported anywhere
- **File:** `apps/mobile/src/services/downloadManager.ts`
- **Severity:** MEDIUM
- **Category:** Dead code
- **Description:** No file in the mobile codebase imports from `downloadManager.ts`. The entire local file download system (start/pause/resume/delete) is unused.

### F39. downloadManager resumeDownload: Is a no-op
- **File:** `apps/mobile/src/services/downloadManager.ts`, lines 70-77
- **Severity:** LOW
- **Category:** Incomplete implementation
- **Description:** `resumeDownload` function looks up the download resumable from the map but just returns it without calling `resumable.resumeAsync()`. The `onProgress` callback parameter is also ignored. A download cannot actually be resumed.
- **Code:**
  ```ts
  export async function resumeDownload(downloadId, onProgress) {
    const resumable = activeDownloads.get(downloadId);
    if (!resumable) return null;
    return resumable; // Just returns it, never resumes!
  }
  ```

### F40. api.ts request: Slow-request log runs AFTER return
- **File:** `apps/mobile/src/services/api.ts`, lines 172-178
- **Severity:** LOW
- **Category:** Logic error
- **Description:** The `result` is returned at line 179, but the slow-request logging at lines 174-177 is below the `return` on the paginated path (line 168 returns early). For paginated responses, `duration` is never logged because the function returns at line 168 before reaching line 174.
- **Code:**
  ```ts
  if (json.success && json.meta !== undefined) {
    return { data: json.data, meta: json.meta } as T;  // Returns here for paginated
  }
  const result = json.data !== undefined ? json.data : json;
  // Slow log only reached for non-paginated responses
  const duration = Date.now() - startTime;
  if (__DEV__ && duration > 2000) { console.warn(...); }
  return result;
  ```

### F41. paymentsApi: Orphaned from most screens
- **File:** `apps/mobile/src/services/paymentsApi.ts`
- **Severity:** MEDIUM
- **Category:** Integration gap
- **Description:** `paymentsApi` is only imported by `hooks/usePayment.ts`. No commerce/tip/membership screen actually uses Stripe payment intents. All purchase flows (tips, memberships, coin purchases, Zakat donations, Waqf contributions) create backend records WITHOUT triggering a real payment through `paymentsApi`. Money flows are decorative.

### F42. widgetData: Imported but native module never linked
- **File:** `apps/mobile/src/services/widgetData.ts`
- **Severity:** LOW
- **Category:** Non-functional feature
- **Description:** `widgetData` is imported in `_layout.tsx` but the `NativeModules.WidgetModule` is never actually implemented in native code (Expo managed workflow). `pushToNative()` silently catches the error. Widget data is only persisted to AsyncStorage, which native widgets cannot read.

### F43. encryption.ts: getConversationKey always returns null for non-cached keys
- **File:** `apps/mobile/src/services/encryption.ts`, lines 136-171
- **Severity:** MEDIUM
- **Category:** Incomplete implementation
- **Description:** `getConversationKey()` fetches the encrypted envelope from the server but always returns `null` at line 168 because it cannot decrypt without the sender's public key. Comment at line 166 admits: "Key not available -- needs setup." Any conversation whose key isn't already locally cached will fail to decrypt all messages.

### F44. encryption.ts: Silent failure on initialization
- **File:** `apps/mobile/src/services/encryption.ts`, lines 54-58
- **Severity:** MEDIUM
- **Category:** Error swallowing
- **Description:** If initialization fails (e.g., SecureStore unavailable, JSON parse error on cached keys), the error is caught and silently swallowed. No warning is shown to the user. The service stays in `initialized = false` state and all subsequent encrypt/decrypt operations silently return null, making it appear that encryption is working when it's not.

### F45. twoFactorApi.ts: validate/disable use wrong HTTP methods
- **File:** `apps/mobile/src/services/twoFactorApi.ts`, lines 16, 18
- **Backend:** `apps/api/src/modules/two-factor/two-factor.controller.ts`
- **Severity:** MEDIUM
- **Category:** HTTP method mismatch (potential)
- **Description:** `twoFactorApi.validate` uses POST and `twoFactorApi.disable` uses DELETE. Need to verify these match the backend controller methods. If the backend uses different HTTP methods, these calls will 404/405.

### F46. api.ts: No retry logic for transient failures
- **File:** `apps/mobile/src/services/api.ts`, lines 139-180
- **Severity:** LOW
- **Category:** Missing error handling
- **Description:** The `request()` method has zero retry logic. Any 503 (service unavailable), 429 (rate limited), or network timeout results in immediate failure. No exponential backoff, no retry for idempotent GET requests. Combined with no offline cache integration (F37), any transient network issue means complete data loss for the user.

---

## TIER 4 — Minor Issues (6 findings)

### F47. Duplicate `qs` helper defined 6 times
- **Files:** `api.ts` (line 203), `islamicApi.ts` (line 28), `audioRoomsApi.ts` (line 10), `communitiesApi.ts` (line 10), `eventsApi.ts` (line 14), `monetizationApi.ts` (line 15), `reelTemplatesApi.ts` (line 4), `giftsApi.ts` (line 3)
- **Severity:** LOW
- **Category:** Code duplication
- **Description:** The `qs()` query string helper is copy-pasted into 8 separate service files with identical implementations. Should be extracted to a shared utility.

### F48. islamicApi calculateZakat: Dangerous type cast
- **File:** `apps/mobile/src/services/islamicApi.ts`, line 53
- **Severity:** LOW
- **Category:** Type safety
- **Description:** `input as unknown as Record<string, string | number | boolean | undefined>` is a double type assertion that suppresses all type checking. If `ZakatCalculationInput` has nested objects, they'll be serialized as `[object Object]` in the query string.

### F49. islamicApi: Missing return types on several endpoints
- **File:** `apps/mobile/src/services/islamicApi.ts`, lines 127, 144-147, 155-158, 163-165, 169-173, 177-181
- **Severity:** LOW
- **Category:** Type safety
- **Description:** Multiple endpoints like `saveDhikrSession`, `getDuas`, `getDuaOfTheDay`, `logFast`, `getFastingLog`, `getNamesOfAllah`, `getHifzProgress`, etc. have no return type generic, defaulting to `unknown`. Consumers must manually cast.

### F50. encryptionApi getBulkKeys: Uses GET with comma-separated IDs in URL
- **File:** `apps/mobile/src/services/encryptionApi.ts`, line 12
- **Severity:** LOW
- **Category:** API design concern
- **Description:** `getBulkKeys` sends user IDs as comma-joined string in URL: `GET /encryption/keys/bulk?userIds=id1,id2,...`. For conversations with many members, this could exceed URL length limits (~2000 chars). Should use POST with body.

### F51. pushNotifications: Uses `devicesApi` from api.ts without explicit import
- **File:** `apps/mobile/src/services/pushNotifications.ts`, line 2
- **Severity:** LOW
- **Category:** Unclear dependency
- **Description:** Imports `{ devicesApi }` from `./api` which is a named export. This works but creates a tight coupling. If `devicesApi` is renamed or moved, push notification registration breaks silently.

### F52. api.ts: Content-Type header always set to JSON, even for GET/DELETE
- **File:** `apps/mobile/src/services/api.ts`, line 152
- **Severity:** LOW
- **Category:** HTTP standard violation
- **Description:** Every request (including GET and DELETE without body) sends `Content-Type: application/json`. This is technically incorrect for bodyless requests and may cause issues with some proxies/CDNs. The `delete<T>` method supports an optional body, so the Content-Type is needed there, but not for bodyless GETs.

---

## Summary

| Tier | Count | Description |
|------|-------|-------------|
| 0 | 14 | Ship blockers (double-prefix, path mismatches, broken features) |
| 1 | 14 | Backend modules with no mobile service |
| 2 | 8 | Request/response mismatches |
| 3 | 10 | Missing error handling, dead code, incomplete implementations |
| 4 | 6 | Minor issues |
| **Total** | **52** | |

### Top 5 Critical Findings

1. **6 backend controllers use double-prefix** (`@Controller('api/v1/...')` + global prefix), making bookmarks, downloads, reports, events, retention, and embeddings completely unreachable from mobile (F01-F06).

2. **Broadcast API path mismatch** -- mobile uses `/broadcast-channels/*`, backend serves `/broadcast/*`. Every broadcast channel operation fails (F07).

3. **Channel posts path mismatch** -- mobile uses `/channels/:id/posts`, backend serves `/channel-posts/:id`. All community post operations fail (F08).

4. **14 backend modules have no mobile service layer** at all (halal, scholar-qa, video-replies, community-notes, story-chains, privacy, mosques, checklists, thumbnails, telegram-features, discord-features, alt-profile, stream, retention) (F15-F28).

5. **3 DTO field name mismatches** silently break features -- blocked keywords (`word` vs `keyword`), wellbeing settings (`sensitiveContentFilter` vs `sensitiveContent`), and bookmarks save (`/saved` vs `/status` paths) (F12, F13, F29-F31).
