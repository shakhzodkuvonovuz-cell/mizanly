# A46 — Small Modules Batch 2: Hostile Code Audit

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05
**Scope:** 13 modules — video-editor, video-replies, stream, thumbnails, reel-templates, alt-profile, profile-links, creator, promotions, discord-features, telegram-features, majlis-lists, scholar-qa
**Method:** Line-by-line read of every controller, service, and DTO file

---

## video-editor

No API controller or service exists. The module contains only `ffmpeg-engine.spec.ts`, which tests mobile-side FFmpeg command building logic. **No findings.**

---

## video-replies

**Files:** `video-replies.controller.ts` (71 lines), `video-replies.service.ts` (180 lines)

### VR-1 [Medium] thumbnailUrl not validated for storage hostname
**File:** `video-replies.service.ts`, lines 83-92
**Issue:** `mediaUrl` is validated against `isAllowedStorageHostname` (lines 50-58), but `thumbnailUrl` is stored directly without hostname validation. Attacker can set `thumbnailUrl` to any external URL, enabling tracking pixels or phishing links rendered in the UI.
**Fix:** Apply the same `isAllowedStorageHostname` check to `thumbnailUrl` when present.

### VR-2 [Low] getByComment limit parameter not exposed or bounded from controller
**File:** `video-replies.service.ts`, line 98
**Issue:** `getByComment` accepts `limit = 20` as default but the controller never passes it. If the service method is called from elsewhere with a large limit, there is no upper bound. The `take: 50` on the user lookup (line 123) would also silently truncate results for >50 unique users.
**Note:** Currently safe since the controller hardcodes `limit=20`, but the service interface is unbounded.

### VR-3 [Low] No rate limit override on POST (create) endpoint
**File:** `video-replies.controller.ts`, lines 35-43
**Issue:** The class-level `@Throttle({ default: { limit: 60, ttl: 60000 } })` (line 30) allows 60 video reply creations per minute. Creating video replies is a heavier operation (DB writes, storage URLs). Should be 10-15/min for the create endpoint specifically.

### VR-4 [Info] Soft-delete but no cascade to likes or views
**File:** `video-replies.service.ts`, lines 173-176
**Issue:** `delete` sets `isDeleted: true` but any associated likes, views, or engagement data for the video reply remain pointing to the soft-deleted record. Not a security issue, but a data hygiene concern.

---

## stream

**Files:** `stream.controller.ts` (110 lines), `stream.service.ts` (357 lines)

### ST-1 [Medium] getPlaybackUrls lacks timeout on fetch — potential hang
**File:** `stream.service.ts`, lines 124-131
**Issue:** `uploadFromUrl` and `createLiveInput` both use `AbortSignal.timeout(60000)` / `AbortSignal.timeout(30000)`, but `getPlaybackUrls` at line 125 has no `signal` option. If Cloudflare is unresponsive, this fetch will hang indefinitely, blocking the Node.js event loop for this request and potentially causing cascading timeouts in `handleStreamReady`.
**Fix:** Add `signal: AbortSignal.timeout(15000)` to the fetch call.

### ST-2 [Medium] thumbnailUrl construction uses accountId, not customer subdomain format
**File:** `stream.service.ts`, line 155
**Issue:** `thumbnailUrl: \`https://customer-${this.accountId}.cloudflarestream.com/${streamId}/thumbnails/thumbnail.jpg\`` — Cloudflare Stream's customer subdomain is NOT the account ID. The customer subdomain is a separate value. If `accountId` is the actual CF account ID (e.g., a 32-char hex string), the URL will be wrong. This needs verification against the real Cloudflare Stream docs.

### ST-3 [Low] handleStreamReady leaks video select fields to publishWorkflow
**File:** `stream.service.ts`, lines 178-228
**Issue:** The `handleStreamReady` method selects `user: { select: { username: true } }` (line 180) and then passes `video.title`, `video.description`, `video.tags` etc to `publishWorkflow.onPublish`. This is fine, but the `video.category` field is cast to string in `indexDocument` (line 222) without validating it's a valid category. If the DB contains a corrupt value, it propagates to the search index.

### ST-4 [Low] No auth guard on stream webhook controller
**File:** `stream.controller.ts`, lines 36-78
**Issue:** The webhook endpoint correctly uses HMAC signature verification instead of Clerk auth (which is correct for external webhooks). However, there is no IP allowlist for Cloudflare webhook source IPs. An attacker who obtains the webhook secret can call this endpoint from anywhere.
**Mitigation:** This is standard for webhook designs, but adding Cloudflare IP allowlisting at the edge would add defense-in-depth.

### ST-5 [Low] deleteVideo silently swallows errors
**File:** `stream.service.ts`, lines 160-173
**Issue:** If the delete request to Cloudflare fails, the error is logged but never propagated. This means the caller believes the video was deleted from Cloudflare when it was not. Orphaned videos on Cloudflare Stream will accumulate and incur storage costs.

---

## thumbnails

**Files:** `thumbnails.controller.ts` (88 lines), `thumbnails.service.ts` (200 lines)

### TH-1 [High] thumbnailUrls array accepts any URL — no storage domain validation
**File:** `thumbnails.controller.ts`, line 28; `thumbnails.service.ts`, line 39
**Issue:** `CreateVariantsDto.thumbnailUrls` uses `@IsUrl({}, { each: true })` but does NOT validate that URLs point to application-owned storage. An attacker can submit `https://evil.com/tracker.gif` as thumbnail variants, and the platform will serve tracking pixels / phishing content to all users who view the content. Every user who sees the thumbnail in their feed triggers a request to the attacker's server, leaking IP addresses.
**Fix:** Add `@IsStorageUrl()` validator or validate hostnames in the service layer.

### TH-2 [Medium] No rate limit on createVariants or getVariants endpoints
**File:** `thumbnails.controller.ts`, lines 37-59
**Issue:** `createVariants` and `getVariants` have no `@Throttle` override. The class-level throttle is also absent (no `@Throttle` at class level). Only `trackImpression` and `trackClick` have throttling (lines 75, 84). An attacker can spam variant creation or analytics queries.
**Fix:** Add class-level throttle or per-endpoint limits.

### TH-3 [Medium] serveThumbnail fires unhandled promise in fire-and-forget chain
**File:** `thumbnails.service.ts`, lines 113-116
**Issue:** `this.prisma.thumbnailVariant.update(...).then(() => this.checkForWinner(...)).catch(...)` — the `.catch()` only logs a warning. If `checkForWinner` throws, the error is silently swallowed. More critically, the `.then()` chain creates an unhandled promise that can cause Node.js UnhandledPromiseRejection if the `catch` itself throws.

### TH-4 [Medium] Winner declared based on CTR with only 1000 impressions — statistically unreliable
**File:** `thumbnails.service.ts`, lines 9, 159-179
**Issue:** `WINNER_THRESHOLD = 1000` total impressions (not per variant). With 3 variants, that's ~333 impressions each. Statistical significance for CTR differences typically requires 1000+ per variant. The system will declare winners based on noise, not signal.
**Note:** Business logic issue, not a security vulnerability, but affects product quality.

### TH-5 [Low] contentType parameter validated only by DTO @IsIn, not re-validated in service
**File:** `thumbnails.controller.ts`, lines 41, 59, 69
**Issue:** The controller casts `dto.contentType as 'POST' | 'REEL' | 'VIDEO'` (line 43), `contentType as 'POST' | 'REEL' | 'VIDEO'` (line 59, 69) — the `contentType` param on GET routes (`getVariants`, `serve`) comes from URL path and is NOT validated by the DTO (it's `@Param`). A user can pass `contentType=ANYTHING` and the service will query with it. Prisma's enum type may or may not reject invalid values depending on the schema.
**Fix:** Validate `contentType` param against allowed values in the controller.

---

## reel-templates

**Files:** `reel-templates.controller.ts` (95 lines), `reel-templates.service.ts` (123 lines)

### RT-1 [Medium] sourceReelId not verified to exist or belong to user
**File:** `reel-templates.service.ts`, lines 26-53
**Issue:** `create` stores `sourceReelId` without verifying the reel exists or that the user has rights to create a template from it. An attacker can reference any reel ID (including removed reels, private reels, or non-existent IDs). The `sourceReel: { isRemoved: false }` filter in `browse` (line 62) prevents display, but the template record still exists in DB with the foreign key.
**Fix:** Verify the source reel exists and is not removed before creating the template.

### RT-2 [Medium] Hard delete of template — no cascade to potential child records
**File:** `reel-templates.service.ts`, line 120
**Issue:** `prisma.reelTemplate.delete({ where: { id } })` performs a hard delete. If any other table references this template by ID (e.g., usage tracking, user saves), the delete will fail with a foreign key violation or leave orphaned records.

### RT-3 [Low] browse with trending=true sorts by useCount but cursor is id-based
**File:** `reel-templates.service.ts`, lines 56-80
**Issue:** When `trending = true`, results are sorted by `useCount: 'desc'` but the cursor is `{ id: cursor }`. This creates a cursor/sort mismatch — the same template can appear in multiple pages or be skipped if `useCount` changes between requests. The `skip: 1` mitigates some edge cases but doesn't fully solve it for items with identical `useCount`.

### RT-4 [Low] No max segment duration validation
**File:** `reel-templates.controller.ts`, line 24
**Issue:** `TemplateSegmentDto` validates `startMs` and `endMs` are between 0-600000, but doesn't validate that `endMs - startMs` is reasonable (could be a 10-minute segment). The service validates `startMs < endMs` (line 39) but not max duration per segment.

---

## alt-profile

**Files:** `alt-profile.controller.ts` (166 lines), `alt-profile.service.ts` (228 lines)

### AP-1 [High] avatarUrl has no URL validation or storage domain check
**File:** `alt-profile.controller.ts`, lines 36-37, 55-56
**Issue:** `CreateAltProfileDto.avatarUrl` and `UpdateAltProfileDto.avatarUrl` are typed as `@IsString()` with no `@IsUrl()` or `@IsStorageUrl()` validation. An attacker can set `avatarUrl` to any string including `javascript:`, `data:`, or external tracking URLs. When rendered in the mobile app's `<Image>` component, this could trigger requests to attacker-controlled servers, leaking user IPs of anyone who views the Flipside profile.
**Fix:** Add `@IsUrl()` and `@IsStorageUrl()` validators.

### AP-2 [Medium] addAccess does not verify target users exist
**File:** `alt-profile.service.ts`, lines 95-125
**Issue:** `addAccess` takes an array of `targetUserIds` and creates `altProfileAccess` records for them without verifying the users exist. An attacker can add non-existent or deleted user IDs to the access list, creating orphaned records. The `AddAccessDto` (controller line 60-64) has no `@ArrayMaxSize` — combined with the service's 100-item limit (line 99), the DTO should enforce the same limit.
**Fix:** Verify target users exist and are active. Add `@ArrayMaxSize(100)` to the DTO.

### AP-3 [Medium] getAccessList has no pagination
**File:** `alt-profile.service.ts`, lines 147-176
**Issue:** `getAccessList` returns up to 50 access records (line 159 `take: 50`), but there's no cursor-based pagination. A user who has granted access to hundreds of people cannot see beyond the first 50. The `addAccess` method allows up to 100 per call with no total cap, so the access list can grow unbounded but only 50 are ever returned.

### AP-4 [Low] getOwn includes full access list without pagination
**File:** `alt-profile.service.ts`, lines 53-63
**Issue:** `getOwn` uses `include: { access: { select: { userId: true, createdAt: true } } }` with no `take` limit. If a user has thousands of access records, this query returns all of them in a single response.
**Fix:** Add `take: 100` to the `access` include.

### AP-5 [Low] AltProfileViewerController route parameter collision
**File:** `alt-profile.controller.ts`, lines 143-166
**Issue:** The second controller `AltProfileViewerController` is mounted at `users/:userId/alt-profile`. The `userId` param could collide with the string literal `me` from the first controller (`users/me/alt-profile`) depending on NestJS route resolution order. If `AltProfileViewerController` is registered first, `GET /users/me/alt-profile` would try to find an alt profile for a user with ID `"me"`.
**Mitigation:** NestJS processes controllers in module order, and the first controller's literal `me` should match first, but this is fragile and ordering-dependent.

---

## profile-links

**Files:** `profile-links.controller.ts` (74 lines), `profile-links.service.ts` (83 lines), DTOs (14+16 lines)

### PL-1 [Medium] url field accepts any URL — potential phishing/XSS vector
**File:** `dto/create-profile-link.dto.ts`, line 12
**Issue:** `@IsUrl()` accepts any valid URL including `javascript:`, `data:text/html,<script>`, `file:///`, etc. Profile links are rendered in the mobile app and potentially in a web view. An attacker can set a profile link to a phishing URL or data URI.
**Fix:** Validate the URL scheme is `https://` only, and consider a blocklist of known phishing domains.

### PL-2 [Medium] reorder does not require complete set — partial reorder silently succeeds
**File:** `profile-links.service.ts`, lines 62-82
**Issue:** `reorder` validates that all passed IDs belong to the user (line 69), but does NOT validate that all of the user's links are included. If a user has 5 links and passes only 3 IDs, the other 2 links keep their old positions, potentially creating position conflicts (e.g., two links at position 0).
**Fix:** Require `orderedIds.length === links.length` (like `telegram-features.service.ts` does for chat folders at line 260).

### PL-3 [Low] ReorderLinksDto missing @ArrayMaxSize
**File:** `profile-links.controller.ts`, lines 23-27
**Issue:** `ReorderLinksDto.ids` has `@IsArray()` and `@IsString({ each: true })` but no `@ArrayMaxSize`. A malicious client can send thousands of IDs. The service limits to 50 via `take: 50` on the query (line 63), but the unnecessary DB lookups for invalid IDs waste resources.
**Fix:** Add `@ArrayMaxSize(5)` matching `MAX_LINKS`.

---

## creator

**Files:** `creator.controller.ts` (95 lines), `creator.service.ts` (403 lines)

### CR-1 [High] $queryRawUnsafe used for audience demographics — SQL injection risk
**File:** `creator.service.ts`, lines 134-139
**Issue:** `this.prisma.$queryRawUnsafe<...>(query, userId)` — While the `userId` IS passed as a parameterized argument (the `$1` placeholder), `$queryRawUnsafe` is inherently risky because the query string itself is composed at call time. If anyone modifies this code to concatenate user input into the query string, it becomes injectable. The safe alternative `$queryRaw` with tagged template literals provides the same parameterization with compile-time safety.
**Fix:** Replace `$queryRawUnsafe` with `$queryRaw` tagged template literal: `` this.prisma.$queryRaw`SELECT ...` ``

### CR-2 [Medium] No rate limits on analytics endpoints
**File:** `creator.controller.ts`, lines 51-84
**Issue:** `getDashboardOverview`, `getAudienceDemographics`, `getContentPerformance`, `getGrowthTrends`, and `getRevenueSummary` have no `@Throttle` decorator and no class-level throttle. These endpoints execute heavy aggregate queries (multiple `aggregate()`, `findMany()`, `$queryRawUnsafe`). An attacker can DOS the database by rapidly polling these endpoints.
**Fix:** Add class-level `@Throttle({ default: { limit: 30, ttl: 60000 } })` or per-endpoint limits.

### CR-3 [Medium] askAI leaks full analytics context to Claude API
**File:** `creator.service.ts`, lines 348-384
**Issue:** The `askAI` method sends the creator's full analytics data (username, follower count, post engagement, hashtags, dates) to the Anthropic API. While Anthropic has a data processing policy, this is a privacy concern — creator analytics data leaves the platform. There is no user consent flow or disclosure that analytics data is sent to a third party.

### CR-4 [Medium] getGrowthTrends silently truncated to 50 followers
**File:** `creator.service.ts`, lines 200-204
**Issue:** `take: 50` on the followers query means creators with more than 50 new followers in 30 days only see data for 50. The `totalNewFollowers` return value (line 214) will report 50 instead of the actual count. This is both a data accuracy issue and a misleading UX.
**Fix:** Use `count()` for the total, and keep `take: 50` only for the daily breakdown grouping.

### CR-5 [Low] getChannelDemographics not exposed via any controller endpoint
**File:** `creator.service.ts`, lines 264-301
**Issue:** `getChannelDemographics` is a public method on the service but no controller endpoint calls it. Dead code that should either be exposed or removed.

### CR-6 [Low] askAI fallback response uses unvalidated topPosts[0]
**File:** `creator.service.ts`, line 398
**Issue:** In the catch block, `topPosts[0]?.likesCount ?? 0` is safe due to optional chaining, but the entire catch block (lines 395-401) swallows ALL errors including network timeouts, returning a generic response. The caller never knows the AI analysis failed.

---

## promotions

**Files:** `promotions.controller.ts` (106 lines), `promotions.service.ts` (203 lines)

### PR-1 [High] boostPost creates promotion without payment verification
**File:** `promotions.service.ts`, lines 28-81
**Issue:** `boostPost` accepts a `budget` (up to $10,000) and creates a promotion record with `status: 'active'` immediately, without any payment collection or verification. There is no Stripe charge, no coin deduction, no wallet balance check. Anyone can boost any of their posts for free by sending `{ budget: 10000, duration: 30 }`.
**Fix:** Integrate payment collection (Stripe or in-app coins) before creating the promotion record. Set initial status to `pending_payment`.

### PR-2 [Medium] markBranded injects text into post content — content corruption risk
**File:** `promotions.service.ts`, lines 157-202
**Issue:** `markBranded` prepends `[Paid partnership with PartnerName]` to the post content (line 185). The regex removal `currentContent.replace(/\[Paid partnership with [^\]]*\]\s*/g, '')` (line 182) will also strip any content that happens to match this pattern in the user's original post. Additionally, there is no way for the user to remove the branded tag without calling this endpoint again with different data.
**More critically:** The `partnerName` is sanitized for `[` and `]` characters (line 176) but not for other special regex characters. The removal regex `[^\]]*` is safe, but the approach of modifying post content text is fragile.
**Fix:** Store branded partnership as a separate field on the Post model instead of modifying content text.

### PR-3 [Medium] getMyPromotions returns all promotions with no pagination
**File:** `promotions.service.ts`, lines 83-91
**Issue:** `getMyPromotions` has `take: 50` but no cursor-based pagination and no cursor in the response. A user with >50 promotions cannot access older ones. The controller does not accept a `cursor` query parameter.

### PR-4 [Low] setReminder — no cap on how far in the future
**File:** `promotions.service.ts`, lines 115-139
**Issue:** `setReminder` validates `remindDate > now` but not `remindDate < now + maxDuration`. A user can set a reminder for 100 years in the future, creating a record that will never be useful and consumes DB space.

### PR-5 [Low] Budget decimal precision not validated
**File:** `promotions.controller.ts`, line 21; `promotions.service.ts`, line 29
**Issue:** `@IsNumber() budget: number` accepts values like `0.001` or `9999.9999`. Financial amounts should be validated to 2 decimal places maximum.
**Fix:** Add `@IsNumber({ maxDecimalPlaces: 2 })` to the DTO.

---

## discord-features

**Files:** `discord-features.controller.ts` (214 lines), `discord-features.service.ts` (431 lines), DTOs (38 lines)

### DF-1 [High] executeWebhook is completely unauthenticated — abuse vector
**File:** `discord-features.controller.ts`, lines 132-137; `discord-features.service.ts`, lines 273-309
**Issue:** The `POST webhooks/:token/execute` endpoint has no auth guard. Anyone who knows or brute-forces a webhook token can inject messages into a community's channel. The token is a 32-byte random hex (64 chars), which is resistant to brute force. However, the legacy fallback lookup (service line 287-289) searches by raw token string, meaning old webhooks with weaker tokens may be vulnerable.
**More critically:** The created message has `messageType: 'SYSTEM'` (service line 303), making it appear as a system message. An attacker with a leaked token can inject fake system messages, impersonating platform announcements.
**Fix:** Consider using a separate `messageType` for webhook messages (e.g., `WEBHOOK`). Add IP-based rate limiting on the execute endpoint beyond the 30/min.

### DF-2 [Medium] deleteForumThread hard-deletes replies then thread — no soft delete
**File:** `discord-features.service.ts`, lines 147-152
**Issue:** `deleteForumThread` hard-deletes all replies (`forumReply.deleteMany`) and then the thread itself. This is irreversible — no audit trail, no content recovery. For a moderation feature, soft-delete would be preferable to allow appeals.

### DF-3 [Medium] joinStageAsListener has no dedup — user can inflate audience count
**File:** `discord-features.service.ts`, lines 387-398
**Issue:** `joinStageAsListener` increments `audienceCount` every time it's called. There is no check for whether the user has already joined. A malicious user can call this endpoint repeatedly to inflate the audience count. The `leaveStageAsListener` has the same issue — a user who never joined can still decrement.
**Fix:** Use a join table to track listeners and derive the count, or at minimum check if the user has already joined.

### DF-4 [Medium] Stage session createStageSession — any circle member can create
**File:** `discord-features.service.ts`, lines 313-328
**Issue:** `createStageSession` only checks that the user is a circle member (line 315), not that they have ADMIN/OWNER/MODERATOR role. Any member can create stage sessions, potentially flooding a community with unwanted audio sessions.
**Fix:** Restrict to ADMIN/OWNER/MODERATOR roles, or add a community setting for who can create stages.

### DF-5 [Low] Forum thread cursor pagination with multi-column sort
**File:** `discord-features.service.ts`, lines 34-51
**Issue:** Threads are sorted by `[isPinned desc, lastReplyAt desc]` but cursor pagination uses `{ id: cursor }`. The comment at line 36 acknowledges this ("Use offset-based pagination to avoid cursor/sort mismatch") but the implementation still uses cursor-based pagination with `skip: 1` — which doesn't fully solve the problem for items with changing `lastReplyAt`.

### DF-6 [Low] deleteForumReply decrement has race condition
**File:** `discord-features.service.ts`, lines 178-188
**Issue:** The decrement and floor operations are two separate queries (lines 180-183 and 185-188) instead of a single atomic operation. Between the two queries, another concurrent delete could make the count negative momentarily. The floor fix at line 185 corrects it, but using `GREATEST` in a single `$executeRaw` would be more robust.

### DF-7 [Low] createWebhook — avatarUrl no storage domain validation
**File:** `discord-features.dto.ts`, line 18
**Issue:** `CreateWebhookDto.avatarUrl` uses `@IsUrl()` but no storage domain validation. A webhook avatar can point to any external URL.

---

## telegram-features

**Files:** `telegram-features.controller.ts` (191 lines), `telegram-features.service.ts` (575 lines), DTOs (77 lines)

### TF-1 [Medium] searchSavedMessages uses id-based cursor with createdAt sort
**File:** `telegram-features.service.ts`, lines 86-108
**Issue:** `searchSavedMessages` sorts by `createdAt: 'desc'` (line 99) but the cursor filter is `id: { lt: cursor }` (line 95). CUID/UUID IDs are not guaranteed to sort in the same order as `createdAt`. Results may be skipped or duplicated when paginating.
**Fix:** Use `createdAt`-based cursor or composite cursor `(createdAt, id)`.

### TF-2 [Medium] saveMessage passes DTO fields directly to create — potential field injection
**File:** `telegram-features.service.ts`, lines 60-68
**Issue:** `this.prisma.savedMessage.create({ data: { userId, ...dto, ... } })` — the `...dto` spread passes ALL fields from the DTO object to Prisma. If the DTO contains extra fields not stripped by validation (NestJS does NOT strip unknown properties by default unless `whitelist: true` is set globally), an attacker could inject Prisma fields like `id`, `createdAt`, `isPinned`, etc.
**Fix:** Explicitly destructure only the expected fields instead of spreading the DTO.

### TF-3 [Medium] emoji imageUrl no storage domain validation
**File:** `telegram-features.dto.ts`, line 74
**Issue:** `AddEmojiDto.imageUrl` uses `@IsUrl()` but no storage domain validation. Custom emoji images can point to any external URL, enabling tracking pixels in chat.

### TF-4 [Low] getEmojiPacks cursor pagination with usageCount sort
**File:** `telegram-features.service.ts`, lines 545-565
**Issue:** `getEmojiPacks` sorts by `usageCount: 'desc'` but cursor is `id: { lt: cursor }`. Same cursor/sort mismatch as other modules. Results may be inconsistent across pages.

### TF-5 [Low] addEmojiToPack increments usageCount on emoji addition
**File:** `telegram-features.service.ts`, lines 537-539
**Issue:** The comment says "Increment pack usage count when emoji is added (Finding 18)" but `usageCount` semantically should track how many users USE the pack, not how many emojis are in it. This conflates pack popularity with pack size.

### TF-6 [Low] getFolderConversations cursor merges into existing where clause unsafely
**File:** `telegram-features.service.ts`, lines 144-149
**Issue:** When both `folder.conversationIds` and `cursor` are present, line 145-148 attempts to merge `{ lt: cursor }` into an existing `where.id` object. The spread `...((where.id as Record<string, unknown>) || {})` could overwrite or be overwritten depending on key order. For example, if `where.id = { in: [...] }`, the merge produces `{ in: [...], lt: cursor }` which Prisma may not interpret correctly (both `in` and `lt` on the same field).
**Fix:** Use Prisma `AND` to combine the two conditions cleanly.

---

## majlis-lists

**Files:** `majlis-lists.controller.ts` (135 lines), `majlis-lists.service.ts` (405 lines), DTOs (19+21+7 lines)

### ML-1 [Medium] getTimeline loads ALL list members into memory
**File:** `majlis-lists.service.ts`, lines 328-335
**Issue:** `getTimeline` fetches the list with `members: { select: { userId: true } }` (line 333) with no `take` limit. For a list with 10,000 members, this loads 10,000 records into memory to extract `memberIds` (line 352). The subsequent `userId: { in: memberIds }` query also sends 10,000 IDs to PostgreSQL.
**Fix:** Use a subquery or JOIN instead of loading all member IDs into application memory.

### ML-2 [Medium] No limit on list member count
**File:** `majlis-lists.service.ts`, lines 250-293
**Issue:** `addMember` has no check for maximum members per list. A user can add an unlimited number of members to a single list. This affects `getTimeline` performance (ML-1) and `getMembers` pagination.
**Fix:** Add a MAX_MEMBERS constant (e.g., 5000) and check `membersCount` before adding.

### ML-3 [Medium] CreateListDto has no cap on list count per user
**File:** `majlis-lists.service.ts`, lines 68-83
**Issue:** `createList` has no check for the maximum number of lists a user can own. An attacker can create thousands of lists, each consuming DB rows and showing up in their `getLists` query.
**Fix:** Add a per-user list cap (e.g., 50 lists).

### ML-4 [Low] deleteList hard-deletes without cleaning up members
**File:** `majlis-lists.service.ts`, lines 170-189
**Issue:** `prisma.majlisList.delete({ where: { id } })` hard-deletes the list. If there is no `onDelete: Cascade` on the `MajlisListMember` relation in the Prisma schema, the delete will either fail with a foreign key violation or leave orphaned member records.

### ML-5 [Low] getListById loads 10 members eagerly
**File:** `majlis-lists.service.ts`, lines 92-106
**Issue:** `getListById` always includes `members` with `take: 10`. For public lists with millions of viewers, this adds 10 extra JOIN/sub-queries per view. Consider making member preview opt-in via a query parameter.

---

## scholar-qa

**Files:** `scholar-qa.controller.ts` (100 lines), `scholar-qa.service.ts` (155 lines)

### SQ-1 [Medium] schedule — no validation that scheduledAt is in the future
**File:** `scholar-qa.service.ts`, lines 9-39
**Issue:** `schedule` converts `data.scheduledAt` to a Date (line 35) but never validates it's in the future. A scholar can schedule a Q&A session in the past.
**Fix:** Add `if (new Date(data.scheduledAt) <= new Date()) throw new BadRequestException(...)`.

### SQ-2 [Medium] startSession — no status guard against starting a LIVE or ENDED session correctly
**File:** `scholar-qa.service.ts`, lines 112-120
**Issue:** `startSession` does not check the current status before setting it to `QA_LIVE`. If the session is already `QA_LIVE`, it will update `startedAt` to a new timestamp, losing the original start time. If the session is `QA_ENDED`, it can be restarted.
**Fix:** Add status checks: `if (qa.status === 'QA_LIVE') throw new BadRequestException('Already live')` and `if (qa.status === 'QA_ENDED') throw new BadRequestException('Cannot restart ended session')`.

### SQ-3 [Medium] getUpcoming / getRecordings have no pagination
**File:** `scholar-qa.service.ts`, lines 41-52, 148-154
**Issue:** Both methods return up to 20/50 results with no cursor parameter. As the platform grows and hundreds of Q&A sessions accumulate, these endpoints will always return only the most recent batch with no way to load more.

### SQ-4 [Low] submitQuestion — no duplicate check
**File:** `scholar-qa.service.ts`, lines 69-77
**Issue:** A user can submit the same question multiple times to the same Q&A session. There is no dedup by content or user+session combination (beyond the implicit question creation).

### SQ-5 [Low] getById returns all question data including userId — privacy concern
**File:** `scholar-qa.service.ts`, lines 55-67
**Issue:** `getById` includes `questions` with no field selection (line 59-62), returning all columns including `userId`. For Q&A sessions, question askers might expect anonymity. The full question records including `userId` are exposed to anyone (the controller uses `OptionalClerkAuthGuard`).
**Fix:** Omit `userId` from question data when the viewer is not the question author or the scholar.

### SQ-6 [Low] voteQuestion route param mismatch
**File:** `scholar-qa.controller.ts`, line 74
**Issue:** The route is `@Post(':id/questions/:qid/vote')` but the handler only uses `@Param('qid') questionId`, ignoring `@Param('id')` (the QA session ID). The session ID is not validated — a user could vote on a question while passing a completely wrong QA session ID in the URL and it would still succeed, because the service only looks up the question by `questionId`.

---

## Summary

| Module | Critical | High | Medium | Low | Info | Total |
|--------|----------|------|--------|-----|------|-------|
| video-editor | 0 | 0 | 0 | 0 | 0 | 0 |
| video-replies | 0 | 0 | 1 | 2 | 1 | 4 |
| stream | 0 | 0 | 2 | 3 | 0 | 5 |
| thumbnails | 0 | 1 | 3 | 1 | 0 | 5 |
| reel-templates | 0 | 0 | 2 | 2 | 0 | 4 |
| alt-profile | 0 | 1 | 2 | 2 | 0 | 5 |
| profile-links | 0 | 0 | 2 | 1 | 0 | 3 |
| creator | 0 | 1 | 3 | 2 | 0 | 6 |
| promotions | 0 | 1 | 2 | 2 | 0 | 5 |
| discord-features | 0 | 1 | 3 | 3 | 0 | 7 |
| telegram-features | 0 | 0 | 3 | 3 | 0 | 6 |
| majlis-lists | 0 | 0 | 3 | 2 | 0 | 5 |
| scholar-qa | 0 | 0 | 3 | 3 | 0 | 6 |
| **TOTAL** | **0** | **4** | **29** | **26** | **1** | **60** |

### Top Priority Fixes (High)
1. **TH-1:** Thumbnail URLs accept any URL — tracking pixel / phishing vector
2. **AP-1:** Alt profile avatarUrl no URL/storage validation
3. **CR-1:** `$queryRawUnsafe` in audience demographics
4. **PR-1:** Promotions created without payment verification (free $10K boosts)
5. **DF-1:** Webhook execute unauthenticated + creates SYSTEM messages

### Patterns Seen Across Modules
1. **Missing storage URL validation** on user-submitted URLs (thumbnails, avatars, emojis, webhooks) — 5 instances
2. **Cursor/sort mismatch** in pagination (trending sort + id cursor) — 4 instances
3. **No per-user resource caps** (lists, promotions, access records) — 3 instances
4. **Missing pagination** on list endpoints — 4 instances
5. **Fire-and-forget promises** with insufficient error handling — 2 instances
