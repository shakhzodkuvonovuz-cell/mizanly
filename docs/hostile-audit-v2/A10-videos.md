# A10: Videos Module Audit

**Files audited:**
- `apps/api/src/modules/videos/videos.controller.ts` (406 lines)
- `apps/api/src/modules/videos/videos.service.ts` (1253 lines)
- `apps/api/src/modules/videos/dto/create-video.dto.ts` (65 lines)
- `apps/api/src/modules/videos/dto/update-video.dto.ts` (37 lines)
- `apps/api/src/modules/videos/dto/create-video-comment.dto.ts` (11 lines)
- `apps/api/src/modules/videos/dto/report.dto.ts` (9 lines)
- `apps/api/src/modules/videos/dto/video-progress.dto.ts` (9 lines)
- `apps/api/src/modules/videos/dto/end-screen.dto.ts` (17 lines)
- `apps/api/src/modules/videos/dto/premiere.dto.ts` (8 lines)

**Auditor:** Claude Opus 4.6
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] A10-#1 — SSRF via videoUrl: No Domain Restriction on User-Supplied URLs

**File:** `dto/create-video.dto.ts` line 35-36, `videos.service.ts` line 177
**Code:**
```typescript
// DTO: only @IsUrl() — no protocol or host restriction
@IsUrl()
videoUrl: string;
```
```typescript
// Service: passes raw user URL to Cloudflare Stream
this.stream.uploadFromUrl(dto.videoUrl, { title: dto.title, creatorId: userId })
```

`class-validator`'s `@IsUrl()` with no options accepts `http://`, `https://`, `ftp://`, and any domain including `http://169.254.169.254/latest/meta-data/` (AWS IMDS), `http://localhost:5432`, or internal network addresses. The `videoUrl` is passed directly to `stream.uploadFromUrl()`, which likely makes an HTTP request to fetch the video. An attacker can submit internal/cloud metadata URLs and the server will fetch them on the attacker's behalf.

The same issue applies to `thumbnailUrl` in both `CreateVideoDto` (line 40) and `UpdateVideoDto` (line 24), and `trailerUrl` in `CreatePremiereDto` (line 7), and `url` in `EndScreenItemDto` (line 8). All use bare `@IsUrl()` with no protocol/host whitelist.

**Impact:** Server-Side Request Forgery. Attacker can scan internal networks, read cloud metadata (credentials, tokens), or hit internal services.

---

### [HIGH] A10-#2 — removeReaction TOCTOU Race Condition: Read Outside Transaction Determines Wrong Branch

**File:** `videos.service.ts` lines 643-666
**Code:**
```typescript
async removeReaction(videoId: string, userId: string) {
    const existingReaction = await this.prisma.videoReaction.findUnique({  // READ outside tx
      where: { userId_videoId: { userId, videoId } },
    });
    if (!existingReaction) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.videoReaction.delete({ ... }),
      existingReaction.isLike  // Decision based on stale data
        ? this.prisma.$executeRaw`UPDATE "videos" SET "likesCount" = GREATEST(0, "likesCount" - 1) ...`
        : this.prisma.$executeRaw`UPDATE "videos" SET "dislikesCount" = GREATEST(0, "dislikesCount" - 1) ...`,
    ]);
```

The read of `existingReaction` happens before the transaction. If between the read and the transaction start the user's reaction flips from like to dislike (via the `dislike` endpoint), `existingReaction.isLike` will be stale (`true`) while the actual reaction is now `false`. The transaction will decrement `likesCount` when it should decrement `dislikesCount`, permanently corrupting both counters.

**Impact:** Counter drift. Under concurrent requests, `likesCount` and `dislikesCount` diverge from reality permanently.

**Fix:** Move the read inside an interactive transaction (`$transaction(async (tx) => { ... })`), reading inside the same serializable scope, matching the pattern already used in `like()` (line 549) and `dislike()` (line 610).

---

### [HIGH] A10-#3 — unlikeComment TOCTOU Race Condition: Same Pattern as removeReaction

**File:** `videos.service.ts` lines 846-860
**Code:**
```typescript
async unlikeComment(commentId: string, userId: string) {
    const existing = await this.prisma.videoCommentLike.findUnique({  // READ outside tx
      where: { userId_commentId: { userId, commentId } },
    });
    if (!existing) throw new NotFoundException('Like not found');

    await this.prisma.$transaction([
      this.prisma.videoCommentLike.delete({ ... }),
      this.prisma.$executeRaw`UPDATE "video_comments" SET "likesCount" = GREATEST("likesCount" - 1, 0) ...`,
    ]);
```

If the like is deleted by another concurrent request between the read and the transaction, `P2025` (record not found for delete) will be thrown inside the transaction, but the `likesCount` decrement may still execute if batched transactions don't roll back atomically on Prisma's side. More importantly, two concurrent unlikeComment calls for the same like will both pass the existence check and both attempt to decrement `likesCount`, double-decrementing it.

**Impact:** Comment `likesCount` can go negative or be double-decremented under concurrent requests.

---

### [HIGH] A10-#4 — unbookmark TOCTOU Race Condition: Same Pattern

**File:** `videos.service.ts` lines 887-899
**Code:**
```typescript
async unbookmark(videoId: string, userId: string) {
    const existing = await this.prisma.videoBookmark.findUnique({  // READ outside tx
      where: { userId_videoId: { userId, videoId } },
    });
    if (!existing) throw new NotFoundException('Bookmark not found');

    await this.prisma.$transaction([
      this.prisma.videoBookmark.delete({ ... }),
      this.prisma.$executeRaw`UPDATE "videos" SET "savesCount" = GREATEST("savesCount" - 1, 0) ...`,
    ]);
```

Same TOCTOU pattern. Two concurrent unbookmark calls both pass the existence check and both decrement `savesCount`.

**Impact:** `savesCount` double-decremented.

---

### [HIGH] A10-#5 — Premiere Viewer Count Inflation: No Deduplication, No Ownership Check

**File:** `videos.controller.ts` line 311-318, `videos.service.ts` lines 1150-1155
**Code:**
```typescript
// Controller: auth required but no BOLA check, no userId passed to service
incrementPremiereViewerCount(@Param('id') id: string) {
    return this.videosService.incrementPremiereViewerCount(id);
}

// Service: blind increment, no dedup
async incrementPremiereViewerCount(videoId: string) {
    return this.prisma.videoPremiere.update({
      where: { videoId },
      data: { viewerCount: { increment: 1 } },
    });
}
```

Any authenticated user can call `POST /videos/:id/premiere/viewer` up to 5 times/minute (throttle limit) indefinitely. There is no deduplication -- calling it repeatedly inflates `viewerCount` without limit. The controller doesn't even pass `userId` to the service, so per-user dedup is impossible. A bot with 100 accounts could inflate premiere viewer counts by 500/minute.

**Impact:** Fake engagement metrics. Premiere viewer counts are meaningless and manipulable.

---

### [MEDIUM] A10-#6 — Missing @Throttle on 4 Mutation Endpoints

**File:** `videos.controller.ts`

The following endpoints lack `@Throttle`:

| Line | Endpoint | Method | Issue |
|------|----------|--------|-------|
| 141 | `DELETE :id/reaction` | `removeReaction` | No rate limit |
| 187 | `DELETE :id/bookmark` | `unbookmark` | No rate limit |
| 351 | `POST :id/cross-publish` | `crossPublish` | No rate limit (even though it's a no-op, it still hits the controller) |
| N/A | All GET endpoints (feed, getById, comments, recommended, share-link, premiere, end-screens, chapters, replies) | Various | No rate limit on read endpoints |

While GET endpoints are often left unthrottled, the mutation endpoints `removeReaction` and `unbookmark` should match their counterparts (`like`/`dislike` have `@Throttle({ default: { limit: 30, ttl: 60000 } })`).

**Impact:** Unthrottled DELETE endpoints allow rapid-fire removal requests that could amplify the TOCTOU race conditions.

---

### [MEDIUM] A10-#7 — Video Owner Cannot View Own DRAFT/PROCESSING/PRIVATE/UNLISTED Videos

**File:** `videos.service.ts` line 374
**Code:**
```typescript
if (!video || video.status !== VideoStatus.PUBLISHED || video.isRemoved) throw new NotFoundException('Video not found');
```

The `getById` method rejects ALL non-PUBLISHED videos regardless of the requester. A video creator who uploads a video (status=PROCESSING) cannot view it until Cloudflare Stream processing completes and publishes it. Similarly, videos set to UNLISTED or PRIVATE are invisible even to their owner.

This means:
1. After upload, the creator has no way to preview/check their video until it's PUBLISHED.
2. There's no way to view PRIVATE videos at all -- they're dead content.
3. UNLISTED videos (meant to be shareable via direct link) are 404'd.

**Impact:** Broken UX for video creators. UNLISTED and PRIVATE status values are effectively dead code.

---

### [MEDIUM] A10-#8 — No Status Transition API: Videos Stuck in PROCESSING/DRAFT Forever

**File:** `videos.service.ts`, `videos.controller.ts`

There is no endpoint to transition a video's status. The `UpdateVideoDto` does not include a `status` field. The only status transitions in code are:
1. `create()` -> PROCESSING (line 158)
2. Stream upload failure fallback -> PUBLISHED (line 190)
3. `startPremiere()` -> PUBLISHED (line 1142)

There is no way to:
- Publish a DRAFT video
- Unpublish a PUBLISHED video (revert to DRAFT)
- Set a video to UNLISTED or PRIVATE
- Retry PROCESSING for a stuck video

If Cloudflare Stream ingestion silently fails (no webhook fires, no error thrown), the video remains PROCESSING forever with no recovery path.

**Impact:** Videos can get permanently stuck. The DRAFT, UNLISTED, and PRIVATE statuses exist in the enum but are unreachable through the API.

---

### [MEDIUM] A10-#9 — Soft-Delete Does Not Clean Up Related Data: Orphaned Records Remain Active

**File:** `videos.service.ts` lines 502-541

Video deletion sets `isRemoved: true` but does NOT clean up:
- `VideoReaction` records (likes/dislikes remain in DB)
- `VideoBookmark` records
- `WatchHistory` records
- `VideoComment` records (remain visible if queried directly)
- `EndScreen` records
- `VideoPremiere` + `PremiereReminder` records
- `VideoChapter` records
- `PlaylistItem` entries referencing this video
- `VideoInteraction` records

While Prisma's `onDelete: Cascade` is configured on all these relations, cascades only fire on hard DELETE, not on soft-delete (UPDATE `isRemoved = true`). The soft-deleted video's related data remains fully intact and potentially queryable through other endpoints (e.g., a user's bookmarks list might still show deleted videos).

**Impact:** Data inconsistency. Users see ghost references to deleted content. DB bloat from orphaned records. Privacy concern if a user deletes their video but comments/reactions remain.

---

### [MEDIUM] A10-#10 — CreateVideoDto Missing @MaxLength on Individual Tags

**File:** `dto/create-video.dto.ts` lines 54-59 vs `dto/update-video.dto.ts` lines 31-36
**Code:**
```typescript
// CreateVideoDto: no per-tag length limit
@IsArray()
@IsString({ each: true })
@ArrayMaxSize(20)
tags?: string[];

// UpdateVideoDto: has per-tag length limit
@IsArray()
@ArrayMaxSize(20)
@IsString({ each: true })
@MaxLength(50, { each: true })   // <-- missing from CreateVideoDto
tags?: string[];
```

`CreateVideoDto` allows tags of unlimited length (limited only by DB column type `String[]`). An attacker could submit 20 tags each with 10,000+ characters, bloating the DB row and potentially the search index.

**Impact:** Storage abuse. A single create request could write ~200KB of tag data per video.

---

### [MEDIUM] A10-#11 — getShareLink Leaks Removed/Unpublished Video Existence

**File:** `videos.service.ts` lines 1049-1057
**Code:**
```typescript
async getShareLink(videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    // No check for isRemoved, status, or scheduledAt
    const appUrl = this.configService.get<string>('APP_URL') || 'https://mizanly.app';
    return { url: `${appUrl}/video/${videoId}` };
}
```

Returns a share link for removed videos (`isRemoved: true`), DRAFT videos, PROCESSING videos, PRIVATE videos, and future-scheduled videos. While the link itself won't render the video (getById checks status), it confirms the video exists, leaking information about content the user shouldn't know about.

**Impact:** Information disclosure. An attacker can enumerate video IDs and determine which ones exist even if they're removed or unpublished.

---

### [MEDIUM] A10-#12 — commentsCount Increment Not Atomic: Prisma `{ increment: 1 }` Outside Raw SQL

**File:** `videos.service.ts` line 715
**Code:**
```typescript
this.prisma.video.update({
    where: { id: videoId },
    data: { commentsCount: { increment: 1 } },
}),
```

While this is inside a `$transaction` array, Prisma's `{ increment: 1 }` generates `SET "commentsCount" = "commentsCount" + 1`, which IS atomic at the SQL level. However, the comment creation and the counter increment are in a batched (not interactive) transaction. If the batched transaction doesn't use serializable isolation (Prisma default is `READ COMMITTED`), two concurrent comments could read the same `commentsCount` and both increment from the same base.

Compare to `like()`/`dislike()` which use `$executeRaw` inside an interactive transaction -- a stricter pattern. The inconsistency suggests this was overlooked.

**Impact:** Minor counter drift under high concurrency. Less severe than the TOCTOU findings above because `{ increment: 1 }` does generate atomic SQL, but the isolation level difference means it's slightly less safe.

---

### [LOW] A10-#13 — Subscriber Notification Capped at 200: Silent Data Loss for Popular Channels

**File:** `videos.service.ts` lines 220-224
**Code:**
```typescript
this.prisma.subscription.findMany({
    where: { channelId: dto.channelId },
    select: { userId: true },
    take: 200,  // Arbitrary cap
})
```

When a channel has more than 200 subscribers, only the first 200 (by DB insertion order, no explicit ordering) receive the new video notification. The rest silently get nothing. There's no logging of how many subscribers were skipped.

**Impact:** Users subscribing later will never get notifications for new videos. At scale, this means most subscribers get no notifications. Should use a proper fan-out queue (documented in CLAUDE.md Tier 3 #8).

---

### [LOW] A10-#14 — Feed Cache Key Includes userId: Cache Pollution with O(n) Keys

**File:** `videos.service.ts` lines 269-271
**Code:**
```typescript
const cacheKey = `feed:videos:${userId}:${category ?? 'all'}:${cursor ?? 'first'}`;
```

Each user gets their own cache key per category per cursor page. With 100K users and 10 categories, that's 1M+ cache keys just for first-page feeds. The `invalidateVideoFeedCache` method (lines 255-264) uses `SCAN` with `MATCH feed:videos:*` to delete them all, which at 1M keys takes significant Redis CPU time and blocks the event loop while iterating.

**Impact:** Redis memory bloat and slow cache invalidation at scale. Not a security issue but a performance time bomb.

---

### [LOW] A10-#15 — Premiere Created Without Checking Existing Premiere: Duplicate Row Risk

**File:** `videos.service.ts` lines 1061-1083

`createPremiere` does not check if a premiere already exists for this video before creating one. The schema has `videoId @unique` on `VideoPremiere`, so a second call would throw a Prisma unique constraint error (`P2002`), which is not caught and would surface as a 500 Internal Server Error.

**Impact:** Unhandled error. Should either check-then-create or catch P2002 and throw a `ConflictException`.

---

### [LOW] A10-#16 — End Screen URL Not Validated for External Links: Open Redirect / Phishing Vector

**File:** `dto/end-screen.dto.ts` line 8, `videos.service.ts` line 1179
**Code:**
```typescript
@IsOptional() @IsUrl() url?: string;
```

End screen items of type `LINK` allow any URL. When rendered on the client, clicking an end screen link navigates to `url`. An attacker can set `url` to a phishing site (`https://mizanly-login.evil.com`) or a malware distribution site. There's no domain allowlist or warning interstitial.

**Impact:** Phishing and malware distribution through end screen links on popular videos.

---

### [LOW] A10-#17 — updateProgress Does Not Verify Video Exists

**File:** `videos.service.ts` lines 937-944

`updateProgress` does an `upsert` on `WatchHistory` without first checking that `videoId` corresponds to an actual, published, non-removed video. If a video is deleted, users can still write watch progress records for it, creating orphaned `WatchHistory` rows. Additionally, progress can be written for DRAFT/PROCESSING videos that the user has never seen.

**Impact:** DB pollution with orphaned watch history records for non-existent or non-public videos.

---

### [LOW] A10-#18 — Video Creation Publishes Workflow for PROCESSING Status

**File:** `videos.service.ts` lines 195-210
**Code:**
```typescript
this.publishWorkflow.onPublish({
    contentType: 'video',
    contentId: video[0].id,
    userId,
    indexDocument: {
        ...
        status: 'PROCESSING',  // Not PUBLISHED
    },
});
```

The publish workflow is called immediately on creation with `status: 'PROCESSING'`. This indexes a video in the search engine before it's actually published. If the search index doesn't filter by status, users could find PROCESSING videos via search that they can't actually view (getById rejects non-PUBLISHED).

**Impact:** Search results showing un-viewable videos, leading to user confusion and 404 clicks.

---

### [INFO] A10-#19 — Stream Upload Fallback Auto-Publishes on Failure

**File:** `videos.service.ts` lines 186-192
**Code:**
```typescript
.catch((err) => {
    this.logger.error(`Stream upload failed for video ${video[0].id}`, err);
    // Fall back to PUBLISHED with raw R2 URL
    this.prisma.video.update({
        where: { id: video[0].id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
    }).catch((e) => this.logger.error('Failed to update video status', e));
});
```

When Cloudflare Stream upload fails, the video is auto-published with the raw R2 URL. This means:
1. No transcoding (only original resolution/codec)
2. No HLS/DASH adaptive streaming
3. No Cloudflare CDN edge caching
4. Potentially a very large file served directly from R2

This is a deliberate fallback, but it means users could upload a 10GB raw video that gets published without any processing.

**Impact:** Poor UX (raw unprocessed video), potential bandwidth costs (large files from R2), no quality variants.

---

### [INFO] A10-#20 — Notification Error Handling Inconsistency

**File:** `videos.service.ts`

Notification emissions use inconsistent error handling:
- Line 228: `try/catch` around `eventEmitter.emit` (like notification)
- Line 585: `try/catch` around `eventEmitter.emit` (comment notification)
- Line 832: `try/catch` around `eventEmitter.emit` (comment like notification)
- Lines 220-241: `.catch()` on the subscriber query promise

`eventEmitter.emit` is synchronous and doesn't throw unless a listener throws synchronously. Wrapping it in try/catch is correct but redundant if all listeners are async. The inconsistency suggests copy-paste without understanding the actual failure modes.

**Impact:** No functional impact, but code hygiene issue that could mask real errors.

---

## Checklist Verification

### 1. BOLA -- Ownership verification on update/delete?
**PASS (mostly).** `update()` (line 431), `delete()` (line 505), `setEndScreens()` (line 1165), `deleteEndScreens()` (line 1200), `createPremiere()` (line 1062), `startPremiere()` (line 1131) all verify `video.userId === userId`. `deleteComment()` (line 790) allows both comment author and video owner. **FAIL on `incrementPremiereViewerCount`** -- no ownership check, any auth user can inflate (A10-#5).

### 2. Pagination -- Video list queries bounded?
**PASS.** `getFeed` uses `limit = 20` (hardcoded default, not user-controllable). `getComments` uses `limit = 20`. `getCommentReplies` uses `Math.min(limit, 100)`. `getRecommended` uses `Math.min(limit, 50)`. `getEndScreens` has `take: 50`. `getChapters` has `take: 50`.

### 3. Rate limit -- Upload/create without @Throttle?
**PARTIAL PASS.** `create` has `@Throttle({ limit: 5, ttl: 60000 })`. But `removeReaction`, `unbookmark`, and `crossPublish` lack `@Throttle` (A10-#6). All GET endpoints lack throttle (acceptable for reads, but noted).

### 4. Race conditions -- View counts, like counts atomic?
**PARTIAL PASS.** `like()` and `dislike()` use interactive transactions with reads inside (correct). `view()` uses interactive transaction with dedup (correct). **FAIL:** `removeReaction()`, `unlikeComment()`, `unbookmark()` read outside the transaction (A10-#2, #3, #4). `commentsCount` uses non-interactive transaction increment (A10-#12).

### 5. Cascade -- Video delete cleans up comments, likes, watch history?
**FAIL.** Video uses soft-delete (`isRemoved: true`), so Prisma `onDelete: Cascade` never fires. Related data (comments, reactions, bookmarks, watch history, end screens, premiere, chapters, playlist items) remain in DB (A10-#9).

### 6. DTO validation -- videoUrl validated? Description length limited?
**PARTIAL PASS.** `videoUrl` has `@IsUrl()` but no protocol/domain restriction (A10-#1). `description` has `@MaxLength(5000)`. `title` has `@MaxLength(100)`. `tags` in CreateVideoDto lacks per-tag `@MaxLength` (A10-#10). Duration bounded `@Min(1) @Max(43200)`. Progress bounded `@Min(0) @Max(1)`.

### 7. Status machine -- Can unpublished videos be viewed? Can published be re-drafted?
**FAIL.** No status transition API exists (A10-#8). DRAFT, UNLISTED, PRIVATE statuses are unreachable. Owner cannot view their own non-PUBLISHED videos (A10-#7). No way to unpublish or re-draft.

### 8. Moderation -- Thumbnail and video content moderated?
**PASS.** `create()` moderates text (lines 125-133) and thumbnail (lines 137-143). `update()` moderates text (lines 434-439) and thumbnail (lines 443-448). `comment()` moderates text (lines 675-678). Video content itself is not moderated (only metadata/thumbnails), but that's expected for a user-uploaded-video platform -- video moderation would need async ML processing.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1 | A10-#1 |
| HIGH | 4 | A10-#2, #3, #4, #5 |
| MEDIUM | 7 | A10-#6, #7, #8, #9, #10, #11, #12 |
| LOW | 6 | A10-#13, #14, #15, #16, #17, #18 |
| INFO | 2 | A10-#19, #20 |
| **Total** | **20** | |
