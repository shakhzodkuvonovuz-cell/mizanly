# A41 — Hostile Audit: Small Modules Batch 1

**Date:** 2026-04-05
**Scope:** 10 modules (parental-controls, chat-export, downloads, watch-history, stickers, playlists, clips, collabs, subtitles, story-chains)
**Auditor:** Claude Opus 4.6
**Checklist:** BOLA, Rate Limit, Pagination, DTO Validation, Privacy (blocked users), Cascade on Delete, Auth Guard, Error Handling

---

## 1. Parental Controls

**Files:** `parental-controls.controller.ts` (120 lines), `parental-controls.service.ts` (424 lines), `dto/parental-control.dto.ts` (113 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **HIGH** | BOLA | service.ts:305-347 | **`getRestrictions` allows any authenticated user to view any child's restrictions.** The method signature takes `childUserId` and `parentUserId`, but the ownership check at line 346 uses `if (parentUserId && control.parentUserId !== parentUserId)` -- the `&&` condition means if `parentUserId` is falsy the check is skipped entirely. Since the controller at controller.ts:108 always passes `parentUserId` from `@CurrentUser('id')`, this is safe *in the controller path*, but the service method's API is dangerous: any internal caller passing `undefined` as `parentUserId` bypasses authorization. More critically: when `!control` (lines 316-343), the function returns full restriction defaults for ANY `childUserId` without verifying the caller is the parent. Any authenticated user can call `GET /parental-controls/:anyChildId/restrictions` and learn whether that user is a child account (isChildAccount flag check at line 320 leaks this). |
| 2 | **MEDIUM** | BOLA | service.ts:160-189 | **`getParentInfo` leaks parent identity to any child account.** The method takes `childUserId` from `@CurrentUser('id')` but does NOT verify the caller is actually the child. Any authenticated user can call `GET /parental-controls/parent` and the service queries `findUnique({ where: { childUserId: <caller_id> }})`. If the caller is not a child, it returns `null`, which is fine. But the real issue is: there is no verification that the caller's token actually belongs to the child -- in the controller, `childUserId` comes from `@CurrentUser('id')` so this is scoped correctly. However, any child can see their parent's `id`, `username`, `displayName`, `avatarUrl` -- this is by design but worth noting for privacy review. |
| 3 | **MEDIUM** | Rate Limit | controller.ts:88-101 | **`changePin` endpoint has no stricter rate limit.** The `verifyPin` endpoint correctly has `@Throttle({ default: { limit: 3, ttl: 300000 } })` (3 per 5 min, line 78), but `changePin` (line 88) inherits the class-level 30/min. An attacker who compromises a parent's session can brute-force the current PIN via `changePin` at 30 attempts/min instead of the 3/5min limit on `verifyPin`. The `changePin` endpoint verifies the current PIN at service.ts:275, so it is functionally equivalent to a PIN verification endpoint. |
| 4 | **MEDIUM** | Rate Limit | controller.ts:66-74 | **`updateControls` also verifies PIN but inherits 30/min rate limit.** Same issue as above -- `updateControls` requires PIN (service.ts:206) but can be called 30 times per minute, bypassing the `verifyPin` endpoint's 3/5min restriction. |
| 5 | **LOW** | Error Handling | service.ts:392-393 | **Inconsistent indentation suggests a missing brace alignment.** Line 392 `take: 50,` and line 393 `),` have suspicious indentation inside the Promise.all. While syntactically valid (the closing paren on 393 closes `findMany`), the `take: 50` appears to be inside the wrong block. Reviewing carefully: `screenTimeLogs` at line 386 starts `this.prisma.screenTimeLog.findMany({...})`. The `take: 50` on line 392 is at the same level as `orderBy` on line 391, then line 393 closes `findMany`, then line 394 `)` closes `Promise.all`. The indentation is misleading but the logic is correct. |
| 6 | **LOW** | Pagination | service.ts:125-158 | **`getMyChildren` uses `take: 50` hard limit with no cursor pagination.** If a parent has more than 50 children (unlikely but architecturally impure), they cannot see all of them. No cursor-based pagination is implemented. |
| 7 | **LOW** | Privacy | service.ts:33-97 | **`linkChild` does not check if parent has blocked the child or vice versa.** A parent could link a user they've blocked (or who has blocked them) as a child account, which is logically inconsistent. |
| 8 | **INFO** | Cascade | service.ts:112-123 | **`unlinkChild` does not cascade-delete related data.** When a parental control link is removed, any `ScreenTimeLog` records for the child remain orphaned. The `isChildAccount` flag is cleared, but screen time logs reference `userId` not the parental control record, so this is acceptable. |

---

## 2. Chat Export

**Files:** `chat-export.controller.ts` (60 lines), `chat-export.service.ts` (236 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **HIGH** | Rate Limit | controller.ts:25 | **5 exports per hour is appropriate but there is no per-conversation rate limit.** A user could export 5 different conversations per hour. However, the real concern is resource exhaustion: each export fetches up to 10,000 messages with sender info (service.ts:90). Five concurrent exports = 50,000 DB rows loaded into memory. The `MAX_EXPORT_MESSAGES = 10_000` cap at service.ts:90 is good, but there is no queuing -- exports are synchronous in the request handler. A 10K-message export with sender joins could take 5-10 seconds, blocking a Node.js event loop worker. |
| 2 | **MEDIUM** | DTO Validation | controller.ts:19-22 | **`GenerateExportBody` is defined inline in the controller file, not in a dedicated DTO file.** More importantly, `@IsBoolean() includeMedia: boolean` has no `@IsOptional()` decorator, yet the controller at line 48 does `body.includeMedia ?? false`, implying it could be undefined. If `includeMedia` is not sent in the request body, class-validator will reject the request because `@IsBoolean()` is mandatory. The `?? false` fallback at line 48 is dead code -- it can never execute because validation would already fail. This is either a bug (should be `@IsOptional()`) or the `?? false` is misleading dead code. |
| 3 | **MEDIUM** | DTO Validation | controller.ts:40-41 | **Redundant manual validation.** The controller manually checks `if (!body.format || !['json', 'text'].includes(body.format))` at line 40, but the DTO already has `@IsIn(['json', 'text'])` at line 21. This double validation is harmless but the manual check can never trigger (class-validator rejects first). If someone removes the DTO decorator, the manual check remains. Redundancy is OK defensively, but the `BadRequestException` message format differs from class-validator's, creating inconsistent error responses. |
| 4 | **LOW** | Privacy | service.ts:79-86 | **Block filtering fetches up to 10,000 block records.** The `take: 10000` at service.ts:83 is a hard cap, but if a user has >10,000 blocks, messages from blocked users beyond that limit would leak into the export. This is an edge case but a data leak. |
| 5 | **LOW** | Error Handling | service.ts:122 | **Unsafe type assertion.** Line 122: `(msg as Record<string, unknown>).mediaUrl as string | null` -- this casts a Prisma result to `Record<string, unknown>` then extracts `mediaUrl`. The `mediaUrl` field is conditionally selected via `mediaUrl: includeMedia` (line 109), so when `includeMedia=false`, the field doesn't exist on the Prisma result. The cast silently returns `undefined` (not `null`), but the `?? null` handles it. Still, this is a fragile pattern that bypasses TypeScript's type system. |

---

## 3. Downloads

**Files:** `downloads.controller.ts` (89 lines), `downloads.service.ts` (197 lines), `dto/create-download.dto.ts` (22 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **HIGH** | BOLA | service.ts:27-53 | **`requestDownload` does not verify the user has permission to view the content.** The service calls `resolveMediaUrl` which checks if the content exists and is not removed, but never checks if the content is private, if the user is blocked by the content owner, or if the content requires a subscription. Any authenticated user can request a download of any post/video/reel as long as it is not `isRemoved`. Private posts, posts from users who blocked the requester -- all downloadable. |
| 2 | **MEDIUM** | Privacy | service.ts:144-174 | **`resolveMediaUrl` does not check blocked-user relationships.** If user A blocks user B, user B can still call `POST /downloads` with user A's post ID and get the download queued. The post's `isRemoved` flag is checked but not visibility, privacy, or block status. |
| 3 | **MEDIUM** | DTO Validation | dto/create-download.dto.ts:15-22 | **`UpdateProgressDto.fileSize` has no type validation.** Line 21: `@IsOptional() fileSize?: number` -- there is no `@IsNumber()` or `@IsInt()` decorator. A client could send `fileSize: "malicious_string"` and it would pass validation, reaching `data.fileSize = fileSize` at service.ts:107 where Prisma might reject it or coerce it. |
| 4 | **MEDIUM** | DTO Validation | dto/create-download.dto.ts:16 | **`UpdateProgressDto.progress` uses `@IsIn([0, 0.1, 0.2, ...])` which is overly restrictive and fragile.** Progress can only be one of 11 exact float values. This means a client reporting 37% progress (0.37) would be rejected. Should be `@IsNumber() @Min(0) @Max(1)` for a continuous range. |
| 5 | **LOW** | Pagination | controller.ts:46-48 | **`limit` query parameter is not validated or capped.** Line 48: `limit ? Number(limit) : undefined` -- a client can pass `limit=100000` and the service at service.ts:56 has `limit = 20` as default but uses whatever is passed. No `Math.min` cap. A client can request all downloads in one call. |
| 6 | **LOW** | Error Handling | service.ts:105 | **`progress >= 1` sets status to `'complete'` (lowercase).** But the Prisma enum `DownloadStatus` likely uses `COMPLETE` (uppercase) or similar. If the Prisma model uses an enum, lowercase `'complete'` and `'downloading'` will fail. If it's a string field, this is fine but inconsistent with DTO `@IsIn` at dto line 7 which uses `'post', 'video', 'reel'`. Need to verify Prisma schema -- the `upsert` in `requestDownload` uses `'PENDING'` (uppercase, line 39), but `updateProgress` uses lowercase `'complete'` and `'downloading'` (line 105-106). **This is a runtime bug if the Prisma field is an enum.** |
| 7 | **LOW** | Cascade | service.ts:116-125 | **`deleteDownload` only deletes the DB record.** If the download involved server-side storage (e.g., a cached file in R2), the file is not cleaned up. Currently downloads are client-side only (DB record tracking), so this is acceptable for now. |

---

## 4. Watch History

**Files:** `watch-history.controller.ts` (105 lines), `watch-history.service.ts` (180 lines), `dto/record-watch.dto.ts`, `dto/add-to-watch-later.dto.ts`

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **MEDIUM** | Privacy | service.ts:22-43 | **`recordWatch` does not check if the video owner has blocked the viewer.** Any user can record watch progress on any video, even from a user who has blocked them. The `recordWatch` only checks `video.findUnique({ where: { id: videoId } })` for existence. No `isRemoved`, no `status` check, no block check. A blocked user can build a complete watch history of the blocker's videos. |
| 2 | **MEDIUM** | Privacy | service.ts:47-88 | **`getHistory` does not filter out videos from users who have since blocked the viewer.** The history includes full video details with channel info. If a user watches a video, then the video owner blocks them, the video still appears in their history with channel details (`handle`, `name`, `avatarUrl`). |
| 3 | **MEDIUM** | Privacy | service.ts:107-121 | **`addToWatchLater` has the same issue -- no block check.** A blocked user can add the blocker's videos to their watch later list. |
| 4 | **LOW** | BOLA | service.ts:22-43 | **`recordWatch` does not check video visibility status.** There is no check for `video.status === 'PUBLISHED'` or `video.isRemoved === false`. A user could record watch progress on a DRAFT or REMOVED video if they know the ID. |
| 5 | **LOW** | Pagination | service.ts:132-171 | **`getWatchLater` cursor uses `videoId` as cursor value (line 165-168).** The cursor logic at line 157 constructs `cursor: { userId_videoId: { userId, videoId: cursor } }`. This uses a composite unique key as cursor, which is correct, but the returned cursor value is `result[result.length - 1].videoId` (line 168). This works but couples the cursor format to the compound key. |
| 6 | **LOW** | DTO Validation | dto/record-watch.dto.ts:10-11 | **`progress` has no `@Max` bound.** A client can send `progress: 999999999` for a 5-minute video. Should be validated against the video's duration, or at least have a reasonable upper bound. |

---

## 5. Stickers

**Files:** `stickers.controller.ts` (153 lines), `stickers.service.ts` (488 lines), `dto/create-pack.dto.ts` (38 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **HIGH** | Auth Guard | controller.ts:42-43 | **`browse` uses `OptionalClerkAuthGuard` -- no auth required to browse sticker packs.** This is intentional for public browsing, but `searchPacks` (line 55-57) also uses `OptionalClerkAuthGuard`. The `search` endpoint at service.ts:70-77 does a `contains` query with user input. Without auth, an unauthenticated attacker can probe the database with search queries. The `take: 20` limits response size, but there is no rate limit on search specifically (inherits controller-level -- but there IS no controller-level `@Throttle` on the class since stickers controller doesn't have a class-level throttle). Actually checking: the controller does NOT have a class-level `@Throttle`. Only `createPack` (line 33) and `generate` (line 115) have explicit throttles. **All other endpoints have NO rate limiting at all** -- `browse`, `search`, `getPack`, `myPacks`, `recent`, `addPack`, `removePack`, `saveGenerated`, `myGenerated`, `islamicPresets` are all unthrottled. |
| 2 | **HIGH** | Rate Limit | controller.ts:26-28 | **No class-level `@Throttle` decorator.** Unlike every other module in this audit (which all have `@Throttle({ default: { limit: X, ttl: 60000 } })` at class level), the Stickers controller has NO default rate limit. Only `createPack` and `generate` have explicit throttles. All other 10 endpoints are completely unthrottled. |
| 3 | **MEDIUM** | BOLA | service.ts:200-220 | **`deletePack` allows admin role to delete any pack, but the admin check queries the full user record.** At line 209-213, if the user is not the owner, it checks `user.role !== 'ADMIN'`. This is correct authorization, but `BadRequestException` (line 215) is the wrong status code -- should be `ForbiddenException` for authorization failures. |
| 4 | **MEDIUM** | BOLA | service.ts:297-345 | **`saveGeneratedSticker` uses `name: 'My Stickers - ${userId}'` to find the user's pack (line 309).** This is a name-based lookup, not an owner-based lookup. If two users somehow have packs with the same name pattern, or if the name is manually changed, this breaks. Should use `ownerId` filter instead of (or in addition to) name matching. |
| 5 | **MEDIUM** | Privacy | service.ts:50-57 | **`getPack` returns full pack details including all stickers to any caller (no auth required via `OptionalClerkAuthGuard`).** If a sticker pack is meant to be private or paid (`isFree: false`), there is no access control. Paid packs are fully viewable without purchase. |
| 6 | **LOW** | Pagination | service.ts:103-111 | **`getMyPacks` uses `take: 50` hard limit with no cursor pagination.** Users with many packs cannot see them all. |
| 7 | **LOW** | DTO Validation | service.ts:229 | **`generateSticker` default parameter `style: StickerStyle = 'cartoon'` bypasses DTO validation.** If the client sends no `style`, the controller DTO `GenerateStickerDto` has `@IsOptional()` so it passes validation as `undefined`, then the service default kicks in. This is fine, but the service accepts the raw enum type while the controller DTO accepts a string union. Type mismatch between layers. |
| 8 | **LOW** | Error Handling | service.ts:406-444 | **`generateStickerSVG` makes an outbound HTTP call to `api.anthropic.com` with no timeout.** The `fetch` call at line 415 has no `AbortController` or timeout. If the API hangs, the request hangs indefinitely, consuming a Node.js worker. |
| 9 | **LOW** | Cascade | service.ts:218 | **`deletePack` uses `prisma.stickerPack.delete` which relies on Prisma cascade to delete stickers.** If the Prisma schema does not have `onDelete: Cascade` on the `Sticker.packId` relation, this will fail with a foreign key constraint error. Also, `UserStickerPack` records referencing this pack are not explicitly deleted -- depends on cascade config. |

---

## 6. Playlists

**Files:** `playlists.controller.ts` (163 lines), `playlists.service.ts` (492 lines), DTOs (3 files)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **HIGH** | Rate Limit | controller.ts:17 | **No class-level `@Throttle` decorator on the controller.** Only `create` (line 23) has an explicit `@Throttle({ default: { limit: 5, ttl: 60000 } })`. All other 12 endpoints -- `getByChannel`, `getItems`, `getCollaborators`, `addItem`, `removeItem`, `toggleCollaborative`, `addCollaborator`, `removeCollaborator`, `updateCollaboratorRole`, `getById`, `update`, `delete` -- have **zero rate limiting**. An attacker can spam `addItem`/`removeItem` to rapidly inflate/deflate `videosCount`, or spam `addCollaborator` requests. |
| 2 | **MEDIUM** | BOLA | service.ts:77-102 | **`getById` returns playlist details including `channel.userId` to any caller (no auth via `OptionalClerkAuthGuard`).** Private playlists (`isPublic: false`) are fully visible to anyone who knows the ID. The `getByChannel` at line 104 correctly filters `isPublic: true`, but `getById` has no privacy check at all. |
| 3 | **MEDIUM** | BOLA | service.ts:131-173 | **`getItems` does not check playlist privacy.** A private playlist's items are fully visible to any unauthenticated user who knows the playlist ID. The method checks if the playlist exists but not `isPublic`. |
| 4 | **MEDIUM** | Privacy | service.ts:379-423 | **`addCollaborator` does not check block relationships.** A playlist owner can add a user who has blocked them as a collaborator. The target user's existence is verified (line 389), but no block check is performed. |
| 5 | **MEDIUM** | Privacy | service.ts:449-467 | **`getCollaborators` is public (no auth guard on the controller route at controller.ts:55-58).** Anyone can enumerate who collaborates on any playlist. Uses `OptionalClerkAuthGuard` with no userId parameter passed to the service. |
| 6 | **LOW** | DTO Validation | service.ts:484 | **`updateCollaboratorRole` casts `role as PlaylistCollabRole` without validation at the service layer.** The DTO `UpdateCollaboratorDto` validates `@IsIn(['editor', 'viewer'])` but the service blindly casts. If the Prisma enum has different values or the DTO is bypassed, this could insert invalid data. |
| 7 | **LOW** | Error Handling | service.ts:246-289 | **`addItem` race condition window.** The `maxPosition` aggregate (line 248) and the `create` (line 254) are in a `$transaction` but use the implicit transaction mode (array), not an interactive transaction. If two concurrent `addItem` calls run simultaneously, both could read the same `maxPosition` and create items with the same `position` value. This won't cause a DB error (position is not unique) but results in duplicate positions. |
| 8 | **LOW** | Cascade | service.ts:208 | **`delete` playlist uses `prisma.playlist.delete` and relies on cascade for `PlaylistItem` and `PlaylistCollaborator` cleanup.** If cascades are not configured in Prisma schema, this will fail. |

---

## 7. Clips

**Files:** `clips.controller.ts` (74 lines), `clips.service.ts` (110 lines), `dto/create-clip.dto.ts` (7 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **MEDIUM** | BOLA | service.ts:50-71 | **`getByVideo` returns clips from all users, including those who have blocked the viewer.** Any unauthenticated user (via `OptionalClerkAuthGuard`) can see all clips for any video, including clips created by users who may have blocked them. The clip includes full user details: `id, username, displayName, avatarUrl, isVerified`. |
| 2 | **MEDIUM** | Privacy | service.ts:14-48 | **`create` does not check if the video owner has blocked the clip creator.** A blocked user can create clips from the blocker's videos. The video ownership check only verifies `status === 'PUBLISHED'`, not block relationships. |
| 3 | **MEDIUM** | BOLA | service.ts:102-109 | **`getShareLink` is publicly accessible (no auth).** Any unauthenticated user can generate share links for any clip. The link contains the source video ID and start time. While this is low-impact (share links are meant to be public), it leaks internal video IDs. |
| 4 | **LOW** | Pagination | service.ts:52-53 | **Non-standard cursor pattern.** Lines 52-53: `if (cursor) where.id = { lt: cursor }` -- this uses a raw `lt` filter instead of Prisma's `cursor` + `skip: 1` pattern. This works but is inconsistent with every other module in this audit, all of which use Prisma's native cursor pagination. The `lt` pattern also has a subtle bug: IDs are CUIDs/UUIDs, and `lt` on string UUIDs does NOT produce chronological ordering (UUIDs are not lexicographically sorted by creation time). If the `id` field uses auto-increment or CUID (which IS lexicographically sortable), this works. If it uses UUID v4, pagination is non-deterministic. |
| 5 | **LOW** | Error Handling | service.ts:96-99 | **`delete` uses `findFirst` instead of `findUnique`.** Line 97: `findFirst({ where: { id: clipId, userId } })` -- since `id` is unique, this should be `findUnique`. Using `findFirst` with a unique field is functionally equivalent but skips Prisma's query optimization for unique lookups. |
| 6 | **LOW** | DTO Validation | dto/create-clip.dto.ts:5 | **`endTime` minimum is `0.5` which allows a clip starting at 0 and ending at 0.5 (half a second).** This is extremely short. The service validates `endTime - startTime > 0` and `<= 60`, but a 0.5-second clip is useless. Consider a minimum duration (e.g., 5 seconds). |

---

## 8. Collabs (Post Collaborations)

**Files:** `collabs.controller.ts` (61 lines), `collabs.service.ts` (135 lines), `dto/invite-collab.dto.ts` (12 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **MEDIUM** | BOLA | controller.ts:30-32 | **`getPostCollabs` has no auth guard check for the requester's relationship to the post.** Any authenticated user can call `GET /collabs/post/:postId` and see all collaborators (accepted + pending) on any post. This leaks who is collaborating on private/draft posts. |
| 2 | **MEDIUM** | Privacy | service.ts:88-99 | **`getMyPending` does not filter out invites from users who have since blocked the invitee.** If user A invites user B to collaborate, then A blocks B, the pending invite still appears in B's list with full post details (content, mediaUrls) and A's profile (username, displayName, avatarUrl). |
| 3 | **LOW** | Pagination | service.ts:88-99 | **`getMyPending` uses `take: 50` hard limit with no cursor pagination.** If a user has more than 50 pending invites, they cannot see them all. |
| 4 | **LOW** | Pagination | service.ts:101-108 | **`getPostCollabs` uses `take: 50` hard limit with no cursor pagination.** Posts with more than 50 collaborators (unlikely but possible) would be truncated. |
| 5 | **LOW** | Error Handling | service.ts:64-72 | **`decline` does not check `collab.status !== CollabStatus.PENDING`.** Unlike `accept` (line 56), `decline` allows declining a collab in any status (ACCEPTED, DECLINED). A user could decline an already-accepted collaboration, changing it from ACCEPTED back to DECLINED without the post owner's knowledge. |
| 6 | **INFO** | DTO Validation | dto/invite-collab.dto.ts | **DTO only validates `@IsString()` for both `postId` and `targetUserId`.** No `@IsNotEmpty()` -- empty strings would pass validation and cause a Prisma query with `where: { id: '' }` which returns no results (handled by NotFoundException). Harmless but sloppy. |

---

## 9. Subtitles

**Files:** `subtitles.controller.ts` (73 lines), `subtitles.service.ts` (155 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **HIGH** | BOLA (Open Redirect) | service.ts:134-154 | **Domain allowlist is bypassable.** The `ALLOWED_DOMAINS` at lines 135-142 include `'pub-'` and `'r2.dev'`. The check at line 145 uses `parsed.hostname.includes(domain)`. The string `'pub-'` would match ANY hostname containing `pub-` anywhere, like `attacker-pub-evil.com` or `pub-phishing.com`. Similarly, `'r2.dev'` matches `evil-r2.dev.attacker.com`. The `.endsWith(domain)` check helps for some entries, but `hostname.includes(domain)` on the same line means `includes` runs first in the `some()` OR. Any hostname containing the substring `pub-` or `r2.dev` passes. This is an **open redirect vulnerability** -- an attacker who owns a video can set a subtitle URL to `https://pub-evil.com/malware.exe`, and the `getSrtRedirect` endpoint will redirect users there. |
| 2 | **MEDIUM** | DTO Validation | service.ts:12-16 | **`CreateSubtitleTrackDto` is defined in the service file, not in a dedicated DTO file.** This is an organizational issue but also means the DTO is tightly coupled to the service. More importantly: the `@MaxLength(100)` on `label` (line 13) contradicts the runtime check at line 67 (`if (dto.label.length > 50)` which uses 50). The DTO allows 100 chars but the service rejects anything over 50. The DTO validation passes, then the service throws `BadRequestException` with a different error format. |
| 3 | **MEDIUM** | Auth Guard | service.ts:53-60 | **`createTrack` only allows the video owner to add subtitles.** This is intentionally restrictive, but there is no mechanism for community-contributed subtitles. Worth noting as a product limitation. The bigger concern: the `srtUrl` field is stored directly in the DB with only URL format validation. A video owner could store a `javascript:` URL -- the `@IsUrl()` decorator on the DTO would reject `javascript:` but the runtime `new URL()` check at service.ts:70-74 would also reject it. Double validation is good here. |
| 4 | **LOW** | Privacy | service.ts:22-51 | **`listTracks` on a published video does not filter out tracks that might reference blocked-user content.** Subtitle tracks are owned by the video owner, so blocked-user filtering is not relevant here. However, the `url` field is exposed directly in the response (line 42), which means raw R2 URLs are leaked. Unlike the `getSrtRedirect` which has domain validation, the `listTracks` response includes the raw URL. |
| 5 | **LOW** | Error Handling | service.ts:62-64 | **Language validation regex `^[a-z]{2,3}$/i` allows uppercase letters due to the `i` flag but then lowercases at line 81.** This is correct behavior but the DTO's `@MaxLength(10)` allows up to 10-character language codes while the regex only allows 2-3. The DTO would pass `language: "ABCDEFGHIJ"` (10 chars) but the regex rejects it. Inconsistent validation layers. |

---

## 10. Story Chains

**Files:** `story-chains.controller.ts` (79 lines), `story-chains.service.ts` (203 lines)

### Findings

| # | Severity | Category | Line(s) | Finding |
|---|----------|----------|---------|---------|
| 1 | **HIGH** | Error Handling (Fire-and-Forget) | service.ts:71-74 | **`viewsCount` increment is fire-and-forget with swallowed errors.** Lines 71-74: `this.prisma.storyChain.update({ ... }).catch((e) => this.logger.debug('Story chain notification failed', e?.message))`. The `.catch` silently swallows errors using `logger.debug` (not even `warn` or `error`). This means: (a) the update is not `await`ed, so it may execute after the response is sent, (b) if it fails, the error is logged at DEBUG level which is typically filtered out in production, (c) the log message says "notification failed" but this is a viewsCount increment, not a notification -- misleading log message. |
| 2 | **MEDIUM** | Privacy | service.ts:76-126 | **`getChain` does not filter entries by blocked users.** The entries include full user details (username, displayName, avatarUrl, isVerified) via the userMap (lines 105-115). A user viewing a story chain will see entries from users who have blocked them, and vice versa. The user query at line 106 filters `isBanned: false, isDeactivated: false, isDeleted: false` but not blocked relationships. |
| 3 | **MEDIUM** | BOLA | service.ts:148-157 | **`joinChain` verifies `story.userId !== userId` at line 156 but does not check if the story is expired.** Stories typically expire after 24 hours. A user could join a chain with an expired story, making the chain entry reference content that is no longer visible to others. The entry would show in the chain but the linked story would be gone. |
| 4 | **MEDIUM** | Pagination | service.ts:37-59 | **`getTrending` uses `id: { lt: cursor }` combined with `orderBy: [{ participantCount: 'desc' }, { createdAt: 'desc' }]`.** The cursor is an ID, but the ordering is by participantCount then createdAt. Using `id < cursor` as a filter with a non-ID sort order produces INCORRECT pagination results. Items with the same participantCount but different IDs will be skipped or duplicated. The cursor must match the sort key to produce correct pages. This is a **broken pagination implementation**. |
| 5 | **LOW** | DTO Validation | controller.ts:24 | **`JoinChainDto.storyId` has `@MaxLength(50)` but Prisma CUID IDs are 25 characters.** The max length is overly generous but not harmful. |
| 6 | **LOW** | Privacy | service.ts:186-201 | **`getStats` exposes `createdById` to any caller.** Line 199: `createdBy: chain.createdById` -- this returns the user ID of the chain creator to any unauthenticated caller. While user IDs are not secret (they appear in many places), this is unnecessary data exposure. |
| 7 | **LOW** | Cascade | service.ts:25-31 | **`createChain` does not limit the number of chains a user can create.** There is no per-user cap on story chains. Combined with the class-level 60/min throttle, a user could create 60 chains per minute, 86,400 per day. |

---

## Summary

| Module | Critical | High | Medium | Low | Info | Total |
|--------|----------|------|--------|-----|------|-------|
| Parental Controls | 0 | 1 | 3 | 3 | 1 | 8 |
| Chat Export | 0 | 1 | 2 | 2 | 0 | 5 |
| Downloads | 0 | 1 | 3 | 3 | 0 | 7 |
| Watch History | 0 | 0 | 3 | 3 | 0 | 6 |
| Stickers | 0 | 2 | 3 | 4 | 0 | 9 |
| Playlists | 0 | 1 | 4 | 3 | 0 | 8 |
| Clips | 0 | 0 | 3 | 3 | 0 | 6 |
| Collabs | 0 | 0 | 2 | 3 | 1 | 6 |
| Subtitles | 0 | 1 | 2 | 2 | 0 | 5 |
| Story Chains | 0 | 1 | 3 | 3 | 0 | 7 |
| **TOTAL** | **0** | **8** | **28** | **29** | **2** | **67** |

### Cross-Cutting Patterns

1. **Missing rate limits (HIGH, affects 3 modules):** Stickers and Playlists controllers have NO class-level `@Throttle`. Every other module in this audit has one. This means 22+ endpoints are completely unthrottled.

2. **Blocked-user filtering absent everywhere (MEDIUM, affects 8/10 modules):** Only Chat Export and Collabs check block relationships. Downloads, Watch History, Stickers, Playlists, Clips, Subtitles, and Story Chains all ignore block status. This is the most systemic issue.

3. **Private content accessible by ID (MEDIUM, affects 3 modules):** Playlists (`isPublic: false`), unpublished videos (Watch History), and removed content (Downloads) are accessible to any authenticated user who knows the ID.

4. **Hard `take` limits without cursor pagination (LOW, affects 5 modules):** Parental Controls (50), Stickers (50), Collabs pending (50), Collabs post (50), and Subtitles (50) all use hard limits without cursor-based pagination for completeness.

5. **Inconsistent DTO placement:** Chat Export and Story Chains define DTOs inline in controller/service files instead of dedicated DTO files. Subtitles defines its DTO in the service file.
