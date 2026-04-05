# A11: Stories Module Audit

**Scope:** `apps/api/src/modules/stories/stories.controller.ts` (271 lines), `stories.service.ts` (800 lines), DTOs (create-story, create-highlight, update-highlight), Prisma schema models (Story, StoryView, StoryStickerResponse, StoryHighlightAlbum)

**Auditor posture:** Hostile. Every line read.

---

## Findings

### [CRITICAL] A11-01 — `markViewed` has no block check: blocked users can track story views

**File:** `stories.service.ts`, lines 344-375
**Issue:** `markViewed()` checks expiry, archived status, and self-view, but never checks whether the viewer is blocked by the story owner (or vice versa). A blocked user who has the story ID (e.g., from before being blocked, or from a shared link) can call `POST /stories/:id/view` and:
1. Create a `StoryView` record visible to the owner in the viewer list
2. Increment `viewsCount`, inflating the owner's metrics
3. Effectively stalk the story owner by confirming their stories still exist

Compare with `getById()` (line 281-291) which correctly checks blocks, and `reactToStory()` (line 588-598) which also checks blocks. `markViewed` is the only interaction endpoint that skips the block check.

**Impact:** Privacy violation. Blocked users appear in the viewer list. Stalking vector.

---

### [CRITICAL] A11-02 — `getById` returns `isRemoved` stories (soft-deleted content still accessible)

**File:** `stories.service.ts`, lines 269-318
**Issue:** `getById()` checks `isArchived` and `expiresAt` for non-owners but never checks `isRemoved`. The `cleanupExpiredStories` cron (line 774) sets `isRemoved: true` on expired stories older than 7 days. But `getById` uses `findUnique({ where: { id: storyId } })` with no `isRemoved: false` filter. Anyone with a story ID can retrieve soft-deleted stories indefinitely.

Similarly, `getFeedStories()` (line 82) does not filter `isRemoved: false` — though expired stories are filtered by `expiresAt: { gt: new Date() }`, which overlaps. But `getArchived()` (line 662-672) also lacks an `isRemoved: false` filter, so the owner sees removed stories in their archive.

**Impact:** Data supposed to be soft-deleted remains fully accessible. Moderation-removed stories (line 251 sets both `isArchived: true` and `expiresAt` to now, but NOT `isRemoved`) are also affected — after 7 days the cron sets `isRemoved` but it's never enforced.

---

### [HIGH] A11-03 — `unarchive` re-exposes expired stories with no expiry extension

**File:** `stories.service.ts`, lines 332-342
**Issue:** `unarchive()` sets `isArchived: false` but does not check or extend `expiresAt`. A story that expired 23 hours ago and was auto-archived can be unarchived. However, since `getFeedStories` filters by `expiresAt: { gt: new Date() }`, the unarchived story won't appear in feeds — it's in limbo (not archived, not in feed, but `getById` returns it to non-owners since `getById` only checks expiry for non-owners at line 278).

Wait — re-reading line 278: `if (story.expiresAt && story.expiresAt < new Date()) throw new NotFoundException`. So expired+unarchived stories are 404 for non-owners. The real problem: the **owner** sees an unarchived expired story in neither archived list nor feed. It's lost in UI limbo. And if the owner sets `isHighlight: true` on it later, it could appear in highlight albums that are public.

**Impact:** Confusing UX for owner. Potential path to re-expose expired content through highlights.

---

### [HIGH] A11-04 — `getHighlights` and `getHighlightAlbum` have no privacy enforcement

**File:** `stories.service.ts`, lines 537-579; `stories.controller.ts`, lines 70-82
**Issue:** Both endpoints use `OptionalClerkAuthGuard` (line 71, 79) — authentication is not required. `getHighlights(userId)` returns all albums for a given userId with no checks for:
1. Whether the requesting user is blocked by the profile owner
2. Whether the profile is private (and requester is not an approved follower)
3. Whether the profile is deactivated/banned/deleted

`getHighlightAlbum(albumId)` is even worse — it returns the full album with stories, user info, and media URLs with zero access control. Anyone (even unauthenticated) can enumerate highlight albums and view all story content within them.

The controller doesn't even pass `@CurrentUser('id')` to these methods (line 73-74, line 80-81), so the service has no way to check viewer identity.

**Impact:** Complete privacy bypass on highlights. Private accounts' highlights are world-readable. Blocked users can view all highlight content.

---

### [HIGH] A11-05 — `closeFriendsOnly` always rejected for non-owners (no CloseFriend model exists)

**File:** `stories.service.ts`, lines 97-101, 294, 682-684
**Issue:** The code has three places that handle `closeFriendsOnly`:
- Feed filter (line 101): `if (story.closeFriendsOnly) return false;` — always excludes
- `getById` (line 294): throws `ForbiddenException` — always rejects
- `submitStickerResponse` (line 682): throws `ForbiddenException` — always rejects

The comment on line 99 says "needs CloseFriend schema model for proper membership check" and "currently rejects all close-friends stories for non-owners (safe default)". Grep confirms no `CloseFriend` model exists in the Prisma schema.

This means the `closeFriendsOnly` feature is accepted during creation (DTO has the field, service persists it at line 196) but the story is invisible to everyone except the creator. Close friends can never see close-friends-only stories. This is a shipped feature that is completely non-functional.

**Impact:** Feature is broken. Users think they're sharing with close friends but nobody can see their stories.

---

### [MEDIUM] A11-06 — `StickerResponseDto.responseData` accepts unbounded arbitrary JSON

**File:** `stories.controller.ts`, lines 32-35
**Issue:** `StickerResponseDto` defines `responseData` as `Record<string, unknown>` with only `@IsObject()` validation. There is no depth limit, no size limit, and no key/value validation. An attacker can submit:
- Deeply nested objects (100+ levels) causing stack overflow in `JSON.stringify` during moderation
- Large payloads (megabytes of JSON) stored directly in PostgreSQL `Json` column
- Arbitrary keys that could confuse downstream consumers (e.g., `__proto__`, `constructor`)

The service at line 705 passes it directly to Prisma as `Prisma.InputJsonValue` with no sanitization or size check.

Compare with `CreateStoryDto.stickerData` (line 66-67) which at least has `@IsArray()` and `@ArrayMaxSize(20)`.

**Impact:** Storage abuse (fill DB with large JSON), potential prototype pollution in consumers, DoS via deeply nested payloads.

---

### [MEDIUM] A11-07 — `CreateHighlightDto.coverUrl` uses `@IsUrl()` instead of `@IsStorageUrl()`

**File:** `dto/create-highlight.dto.ts`, line 11; `dto/update-highlight.dto.ts`, line 11
**Issue:** Both DTOs validate `coverUrl` with `@IsUrl()` from class-validator, which accepts any valid URL including attacker-controlled domains. Compare with `CreateStoryDto.mediaUrl` (line 7) and `thumbnailUrl` (line 16) which correctly use `@IsStorageUrl()` to restrict to Cloudflare R2.

An attacker can set `coverUrl` to `https://evil.com/tracking-pixel.png`, and when other users view the profile's highlights, their clients fetch from the attacker's server — leaking IP addresses, user agents, and confirming the viewer is browsing that profile.

**Impact:** SSRF-adjacent (client-side). IP tracking of profile visitors. Content attribution confusion.

---

### [MEDIUM] A11-08 — `getReactionSummary` uses raw SQL without parameterized sticker type filter

**File:** `stories.service.ts`, lines 516-535
**Issue:** The raw query at line 523 uses `$queryRaw` with tagged template literal (which IS parameterized — `${storyId}` is safe). However, the query hardcodes `AND "stickerType" = 'emoji'` (line 528), meaning this endpoint only returns emoji reactions regardless of what the API docs or consumers expect. If the intent was to return all reaction types, the filter is wrong. If the intent was emoji-only, the endpoint name "reaction-summary" is misleading.

More importantly, this endpoint is named `getReactionSummary` but queries `story_sticker_responses` — it conflates reactions (emoji) with sticker responses (poll, quiz, etc.). The `GROUP BY` on `responseData->>'emoji'` will return NULL keys for non-emoji sticker types if the filter were removed.

**Impact:** Incomplete data returned. Misleading API contract.

---

### [MEDIUM] A11-09 — `reportStory` uses string-based dedup instead of proper foreign key

**File:** `stories.service.ts`, lines 737-767
**Issue:** The Report model has `reportedPostId`, `reportedCommentId`, `reportedMessageId`, `reportedReelId`, `reportedVideoId` (lines 2302-2310 in schema) but NO `reportedStoryId`. The workaround at line 747 uses `description: { startsWith: 'story:${storyId}' }` for deduplication.

Problems:
1. No FK constraint — story can be deleted without cleaning up reports
2. String-prefix matching is fragile — if description format changes, dedup breaks
3. No DB index on `description` prefix — dedup query is a full table scan per report
4. Admin dashboard cannot filter reports by story (no structured FK to query)
5. Same pattern means story reports are second-class citizens compared to post/comment reports

**Impact:** Report dedup is fragile and unindexed. Story reports are not properly tracked in the report system.

---

### [MEDIUM] A11-10 — `getFeedStories` follows list capped at 10,000 but no pagination

**File:** `stories.service.ts`, line 72
**Issue:** `follows.findMany({ take: 10000 })` loads up to 10,000 follow records into memory. For power users following thousands of accounts, this is a large in-memory array. The subsequent `stories.findMany({ where: { userId: { in: ids } } })` generates a SQL `IN` clause with up to 10,001 user IDs, which PostgreSQL handles poorly (query planner switches from index scan to seq scan around 1,000+ values).

No cursor pagination on follows, no chunking strategy for the `IN` clause.

**Impact:** Performance degradation for users following many accounts. Potential query timeout at scale.

---

### [MEDIUM] A11-11 — `replyToStory` stores unsanitized content in `lastMessageText`

**File:** `stories.service.ts`, line 495
**Issue:** The message body is sanitized via `sanitizeText(content)` at line 469. But the `lastMessageText` on the conversation update at line 495 uses the raw `content.slice(0, 100)` — not the sanitized version. If `sanitizeText` strips XSS payloads or dangerous characters, the raw version persists in `lastMessageText`.

Should be: `lastMessageText: sanitizeText(content).slice(0, 100)`.

**Impact:** Stored XSS risk in conversation preview text if any client renders `lastMessageText` as HTML.

---

### [LOW] A11-12 — `stickerData` in `CreateStoryDto` has `object[]` type with no element validation

**File:** `dto/create-story.dto.ts`, lines 63-67
**Issue:** `stickerData` is typed as `object[]` with `@IsArray()` and `@ArrayMaxSize(20)`. Individual elements have no validation — each element can be any object of any depth and size. Combined, 20 large objects could total megabytes. The service moderates the JSON-stringified version (line 174-183) but only for text content safety, not for size or structure.

**Impact:** Storage abuse via oversized sticker data. No schema enforcement means clients can inject arbitrary shapes that break other clients' renderers.

---

### [LOW] A11-13 — `CreateStoryDto` missing `subscribersOnly` field

**File:** `dto/create-story.dto.ts`
**Issue:** The DTO has `closeFriendsOnly` (line 70-72) but NOT `subscribersOnly`. However, the service `create()` method at line 163 accepts `subscribersOnly?: boolean` and persists it at line 197. Since the DTO lacks this field, class-validator will strip it from the body (if `whitelist: true` is enabled globally) or silently ignore it. Either way, the API contract is inconsistent — the backend supports it but the DTO doesn't expose it.

**Impact:** Feature may silently fail depending on validation pipeline configuration. API contract mismatch.

---

### [LOW] A11-14 — `getArchived` has no pagination

**File:** `stories.service.ts`, lines 662-672; `stories.controller.ts`, line 88
**Issue:** `getArchived` returns up to 50 stories with no cursor parameter. The controller (line 88) doesn't accept any pagination query params. For users who have posted hundreds of stories, only the 50 most recent archived stories are returned with no way to access older ones.

Compare with `getViewers` (line 377-410) which properly implements cursor pagination.

**Impact:** Data loss for prolific story posters. Older archived stories become inaccessible through the API.

---

### [LOW] A11-15 — `getStickerSummary` caps at 50 responses, silently loses data

**File:** `stories.service.ts`, lines 721-735
**Issue:** `findMany` at line 724 has `take: 50`. For a popular story with hundreds of poll/quiz responses, only the first 50 are aggregated into the summary. The owner sees incorrect poll percentages and vote counts. No indication to the client that results are truncated.

**Impact:** Inaccurate sticker summaries for popular stories. Owner sees misleading poll results.

---

### [LOW] A11-16 — `textColor` and `bgColor` not validated as hex codes

**File:** `dto/create-story.dto.ts`, lines 33-40
**Issue:** Both fields are `@IsString() @MaxLength(7)` but have no regex validation for hex color format (e.g., `@Matches(/^#[0-9a-fA-F]{6}$/)`). A client can submit arbitrary 7-character strings like `"AAAAAAA"` or `"<script"` (7 chars) as color values. While unlikely to cause server-side issues, it could cause rendering bugs or mini-XSS if any client uses these values in CSS without escaping.

**Impact:** Minor. Invalid color values persisted. Potential client-side rendering issues.

---

### [LOW] A11-17 — `deleteHighlight` does not cascade-delete stories from the album (only unlinks)

**File:** `stories.service.ts`, lines 634-646
**Issue:** `deleteHighlight` first runs `story.updateMany({ where: { highlightAlbumId: albumId }, data: { isHighlight: false } })` then deletes the album. The Prisma schema has `onDelete: SetNull` on the `highlightAlbum` relation (schema line 1352), so stories get their `highlightAlbumId` set to null on album delete.

But the `isHighlight` flag is explicitly set to `false` before deletion (line 642). Since `addStoryToHighlight` sets `isArchived: true` (line 658), these stories remain archived with `isHighlight: false` and `highlightAlbumId: null` — they're orphaned archived stories that are no longer in any highlight but also not visible in the normal feed.

**Impact:** Orphaned stories after highlight deletion. Not a security issue but a data integrity concern.

---

### [INFO] A11-18 — Fire-and-forget error handling in `markViewed` analytics swallows all errors

**File:** `stories.controller.ts`, lines 124-131
**Issue:** The engagement tracking job catch block (line 131) is `catch(() => { /* non-critical analytics */ })`. This is documented as intentional, but if the queue service is consistently failing, there's no logging, no Sentry capture, and no metric. The service could silently lose all story view analytics.

**Impact:** Silent analytics data loss. Low severity since view tracking itself is in the service.

---

### [INFO] A11-19 — `OptionalClerkAuthGuard` on `getById` means unauthenticated users get `userId` as `undefined`

**File:** `stories.controller.ts`, line 93-96
**Issue:** `@UseGuards(OptionalClerkAuthGuard)` means `@CurrentUser('id')` can be `undefined` for unauthenticated requests. The service at `getById(id, userId)` receives `undefined` as `viewerId`. At line 276, `viewerId !== story.userId` is `undefined !== 'some-id'` which is `true`, so the non-owner path runs. At line 281, `if (viewerId && story.userId)` — `viewerId` is falsy, so the block check is SKIPPED entirely.

This means unauthenticated users bypass the block check in `getById`. An unauthenticated request can view any non-expired, non-archived, non-closeFriendsOnly, non-subscribersOnly, non-private-account story — including stories from users who blocked the requester (since the requester has no identity, block check is skipped). This is by design for public content but worth noting.

**Impact:** Design decision, not a bug. But blocked users can view stories by simply dropping their auth token.

---

### [INFO] A11-20 — Mention extraction regex allows non-existent usernames

**File:** `stories.service.ts`, lines 220-238
**Issue:** The mention regex `/@([a-zA-Z0-9_.]{1,30})/g` extracts usernames from text and then queries the DB at line 224. This is fine — non-existent usernames are simply not found. However, the regex runs on `JSON.stringify(data.stickerData || {})` (line 221), which means JSON structural characters like quotes and braces appear in the search string. While unlikely to cause false matches (the regex requires `@` prefix), it's slightly wasteful to regex-search stringified JSON.

**Impact:** Negligible. No security concern.

---

## Checklist Verification

### 1. BOLA -- Can user A delete user B's story?
**PASS.** `delete()` at line 322-323 fetches the story and checks `story.userId !== userId`, throwing `ForbiddenException` if mismatch. Same pattern for `unarchive()`, `updateHighlight()`, `deleteHighlight()`, `addStoryToHighlight()`, `getViewers()`, `getReactionSummary()`, `getStickerResponses()`, `getStickerSummary()`.

### 2. Expiry -- Are stories auto-expired after 24h? Can expired stories still be viewed?
**PARTIAL PASS.** Stories are created with `expiresAt: Date.now() + 24h` (line 198). `getFeedStories` filters `expiresAt: { gt: new Date() }` (line 85). `getById` checks expiry for non-owners (line 278). `markViewed`, `replyToStory`, `reactToStory`, `submitStickerResponse` all check expiry. **FAIL:** `getById` does not check `isRemoved` (A11-02). `unarchive` doesn't validate/extend expiry (A11-03).

### 3. Rate limit -- Story creation without @Throttle?
**PASS.** `create` has `@Throttle({ limit: 10, ttl: 60000 })` (line 61). `markViewed` has throttle (line 120). Highlights CRUD all have throttles (lines 174, 186, 199, 212). Reply (line 147), react (line 222), report (line 239), sticker-response (line 250) all throttled. **No throttle on:** `getFeed` (line 53), `getById` (line 93), `getHighlights` (line 70), `getHighlightAlbum` (line 78), `getArchived` (line 84), `getViewers` (line 135), `getReactionSummary` (line 160), `getStickerResponses` (line 258), `getStickerSummary` (line 265). Read endpoints without throttle is acceptable but `getFeed` is expensive (follows + stories + views queries) and could be abused.

### 4. Privacy -- Close friends stories visible only to close friends?
**FAIL.** No `CloseFriend` model exists. Close-friends-only stories are created but invisible to everyone except the creator (A11-05). Feature is non-functional.

### 5. Cascade -- Story delete cleans up views, reactions, highlights?
**PASS.** Prisma schema has `onDelete: Cascade` on StoryView (schema line 1377) and StoryStickerResponse (schema line 2651). Story deletion cascades to views and sticker responses. Highlight albums use `onDelete: SetNull` (schema line 1352), which is correct — deleting a story shouldn't delete the album.

### 6. DTO validation -- mediaUrl validated? Sticker data validated?
**PARTIAL PASS.** `mediaUrl` uses `@IsStorageUrl()` (good). `thumbnailUrl` uses `@IsStorageUrl()` (good). `stickerData` has `@IsArray() @ArrayMaxSize(20)` but no element validation (A11-12). `responseData` in `StickerResponseDto` has only `@IsObject()` with no depth/size limits (A11-06). Highlight `coverUrl` uses `@IsUrl()` instead of `@IsStorageUrl()` (A11-07).

### 7. Blocked users -- Stories from blocked users visible?
**PARTIAL PASS.** `getFeedStories` uses `getExcludedUserIds` which includes blocks, mutes, restricts (good). `getById` checks blocks bidirectionally (line 281-291, good). `replyToStory` checks blocks (line 427-435, good). `reactToStory` checks blocks (line 588-598, good). `submitStickerResponse` checks blocks (line 688-698, good). **FAIL:** `markViewed` has NO block check (A11-01). `getHighlights`/`getHighlightAlbum` have NO block check (A11-04).

### 8. View tracking -- Can users fake story views? Is viewer list privacy-safe?
**PARTIAL PASS.** Self-views excluded (line 350). Duplicate views handled via unique constraint + P2002 catch (line 367). View count atomically incremented in transaction (line 358-364). Viewer list owner-only (line 380). **FAIL:** blocked users can create views (A11-01). `markViewed` throttle is 10/min which is reasonable but allows 10 fake views per minute on different stories.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | A11-01, A11-02 |
| HIGH | 3 | A11-03, A11-04, A11-05 |
| MEDIUM | 6 | A11-06, A11-07, A11-08, A11-09, A11-10, A11-11 |
| LOW | 6 | A11-12, A11-13, A11-14, A11-15, A11-16, A11-17 |
| INFO | 3 | A11-18, A11-19, A11-20 |
| **Total** | **20** | |
