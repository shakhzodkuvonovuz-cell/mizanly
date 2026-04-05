# A19: Reports Module Audit

**Scope:** `reports.controller.ts` (81 lines), `reports.service.ts` (598 lines), `dto/create-report.dto.ts` (50 lines)
**Date:** 2026-04-05
**Auditor:** Hostile code review

---

## Findings

### [CRITICAL] A19-1 — Dismiss restores content that was manually removed by a resolved report

**File:** `reports.service.ts`, lines 499-558
**Issue:** The `dismiss()` method restores auto-hidden content when dismissed, but only checks for OTHER unresolved urgent reports (`status: PENDING | REVIEWING`). It does NOT check whether a separate report on the same content was already RESOLVED with `CONTENT_REMOVED` action. If content was reported urgently (auto-hidden), then a second report is filed, and the first report is resolved with `CONTENT_REMOVED`, dismissing the second report would restore the content that was intentionally removed by moderation.

**Scenario:**
1. User A reports Post X for VIOLENCE (urgent). Three reporters trigger auto-hide.
2. Admin resolves Report A with `CONTENT_REMOVED` (line 376-394). Post stays removed.
3. User B also reported Post X for HARASSMENT (non-urgent, separate report).
4. Admin dismisses Report B. Dismiss logic checks for other PENDING/REVIEWING urgent reports, finds none (Report A is RESOLVED), and restores the post (line 517-524).
5. Post X is now visible again despite being explicitly content-removed.

**Fix:** Before restoring, also check whether ANY resolved report on the same target has `actionTaken: CONTENT_REMOVED`.

---

### [HIGH] A19-2 — ModerationLog omits targetThreadId, targetReelId, targetVideoId

**File:** `reports.service.ts`, lines 360-372
**Issue:** When resolving a report, the `moderationLog.create` call sets `targetUserId`, `targetPostId`, `targetCommentId`, and `targetMessageId`, but does NOT set `targetThreadId`, `targetReelId`, or `targetVideoId`. The `ModerationLog` schema (schema.prisma line 2363-2365) has these fields. This means moderation actions on threads, reels, and videos produce incomplete audit logs.

**Impact:** Moderation audit trail is broken for 3 of 7 content types. Appeals, compliance reviews, and transparency reports cannot trace which thread/reel/video was actioned.

---

### [HIGH] A19-3 — No foreign key constraints on reportedThreadId, reportedReelId, reportedVideoId

**File:** `schema.prisma`, lines 2308-2310
**Issue:** `reportedPostId`, `reportedCommentId`, `reportedMessageId` all have `@relation` directives with proper foreign keys and `onDelete: SetNull`. However, `reportedThreadId`, `reportedReelId`, `reportedVideoId` are bare `String?` fields with NO `@relation`. This means:
1. No referential integrity — you can report a non-existent thread/reel/video ID (Prisma `findUnique` in the service catches this, but the DB itself allows orphaned references).
2. If a Thread/Reel/Video is hard-deleted, the Report row retains a dangling ID.
3. No cascading behavior defined.

**Impact:** Data integrity gap. The ownership check in the service (lines 90-113) mitigates the immediate exploit, but stale data accumulates over time.

---

### [HIGH] A19-4 — Stories are not reportable

**File:** `dto/create-report.dto.ts` (entire file), `reports.service.ts`
**Issue:** The `Story` model exists (schema.prisma line 1334) with user-generated media content, but there is no `reportedStoryId` field in the DTO, the Report schema, or the service. Stories can contain CSAM, violence, terrorism, harassment — all the same categories that other content types can be reported for.

**Impact:** Legal compliance gap. If a Story contains illegal content, users have no mechanism to report it. CSAM in stories would go unreported, violating 18 USC 2258A obligation to report known CSAM.

---

### [MEDIUM] A19-5 — REVIEWING status is dead code (never set, only checked)

**File:** `reports.service.ts`, lines 128, 344, 495, 506
**Issue:** `ReportStatus.REVIEWING` is defined in the Prisma enum and checked in 4 places (duplicate detection, resolve guard, dismiss guard, other-urgent-reports check), but no code anywhere in this module transitions a report TO `REVIEWING`. Reports are created as `PENDING` (default), resolved to `RESOLVED`, or dismissed to `DISMISSED`. The `REVIEWING` status is unreachable.

**Impact:** The status machine is incomplete. If the intention is that an admin "claims" a report by moving it to REVIEWING before resolving, that endpoint/transition is missing. Currently, two admins can simultaneously resolve/dismiss the same PENDING report with a race condition.

---

### [MEDIUM] A19-6 — Report creation @Throttle is too generous for abuse

**File:** `reports.controller.ts`, line 29
**Issue:** The class-level `@Throttle({ default: { limit: 60, ttl: 60000 } })` allows 60 requests per minute across ALL endpoints. While the service has a 10-reports-per-hour soft limit (line 120-122), the HTTP throttle allows a user to probe the report system 60 times per minute (e.g., testing which content IDs exist via 404 responses, or checking if targets are reportable).

The POST endpoint specifically should have a tighter throttle (e.g., 5/min) separate from the GET endpoints. The 10/hour DB check is bypassed if reports are created and then the user hits the rate limit — the DB check runs AFTER the existence checks, meaning 60 existence-probing requests per minute are permitted.

---

### [MEDIUM] A19-7 — Urgent auto-hide does not cover messages

**File:** `reports.service.ts`, lines 166-236
**Issue:** When an urgent report (NUDITY, VIOLENCE, TERRORISM) triggers auto-hide after 3+ unique reporters, the code hides posts, comments, threads, reels, and videos. However, there is no auto-hide for reported messages (`reportedMessageId`). The `urgentTargetWhere` filter (lines 167-174) also does not include `reportedMessageId`, so the unique reporter count for message reports is never computed.

**Impact:** A CSAM image sent as a message would not be auto-hidden even with 3+ reporters. While messages are 1:1/group (limited blast radius), they still contain illegal content that should be hidden pending review.

---

### [MEDIUM] A19-8 — getById leaks full report object including reporterId to admin

**File:** `reports.service.ts`, lines 295-317
**Issue:** `getById()` returns the full `report` object from Prisma (line 316). For admin/moderator access, this includes `reporterId`, `reporter` relation data. While admins may need this for investigation, the method also returns the full object when the reporter views their OWN report — which includes `reportedUser` relation data (id, username, displayName, avatarUrl) via the include on line 299.

This is acceptable for the reporter (they know who they reported), but the method does NOT filter fields based on role. If the `getById` response is ever exposed to the reported user (e.g., via an appeal flow), it would leak the reporter's identity via `reporterId`.

**Note:** Currently, the reported user has no endpoint to view reports against them, so this is a latent risk, not an active exploit.

---

### [MEDIUM] A19-9 — resolve() returns raw Prisma transaction result

**File:** `reports.service.ts`, line 486
**Issue:** `return updated;` returns the first element of the `$transaction` array, which is the full updated Report record including `reporterId`. This goes directly to the admin client. While admins may need this, the response is not shaped — it includes every Report field from the schema (moderatorNotes, explanationToReporter, explanationToReported, etc.), including internal fields that may not be relevant.

More critically, the `create()` method (line 268) carefully returns only `{ id, status, createdAt }`, establishing a pattern of minimal responses. The `resolve()` and `dismiss()` methods break this pattern.

---

### [MEDIUM] A19-10 — Duplicate check only covers PENDING/REVIEWING, not RESOLVED/DISMISSED

**File:** `reports.service.ts`, lines 126-139
**Issue:** The duplicate report check (line 128) only looks for existing reports with `status: { in: [PENDING, REVIEWING] }`. If a report was previously RESOLVED or DISMISSED, the same user can report the same content again. This allows:
1. A dismissed report to be re-filed immediately (undermining the admin's dismiss decision).
2. A resolved report (where action was taken) to be re-filed, creating duplicate work.

**Impact:** Users who disagree with a dismiss decision can weaponize the system by re-reporting indefinitely. The unique constraints in the schema (lines 2328-2334) would catch exact duplicates at the DB level, BUT only if the old report still exists — and the constraint is on `[reporterId, reportedPostId]` which allows re-reports when the previous report's `reporterId` is the same (they'd conflict). Actually, this IS protected by the schema unique constraint. However, the application-level check filters by status, creating confusion — the DB constraint would throw P2002 which is caught on line 271, so the behavior is correct but the application logic is misleading.

**Revised severity:** LOW — the DB unique constraint protects against true duplicates regardless of status. The application check is redundant but not harmful. The only gap: if a reporter's previous report is resolved, the unique constraint `[reporterId, reportedPostId]` prevents re-reporting forever. This may be intentional (one report per user per target, period) but the application code's status filter suggests the intent was to allow re-reporting after resolution.

---

### [LOW] A19-11 — No moderation AI check for thread/reel/video/message/user reports

**File:** `reports.service.ts`, lines 258-265
**Issue:** After report creation, AI moderation is only enqueued for `reportedPostId` (line 258). Reports on threads, reels, videos, comments, messages, and users do not trigger AI moderation queuing. The `queueService.addModerationJob` only processes text content from posts.

**Impact:** Reported threads, reels, and videos do not benefit from automated content analysis. All moderation for these types is purely manual.

---

### [LOW] A19-12 — DTO ID fields lack format validation

**File:** `dto/create-report.dto.ts`, lines 18-49
**Issue:** All `reported*Id` fields use `@IsString()` with no format validation (e.g., `@IsNotEmpty()`, `@Matches(/^c[a-z0-9]{24}$/)` for CUID, or `@Length(25, 25)`). A user could submit `reportedPostId: ""` (empty string) which passes `@IsString()` and `@IsOptional()` but would fail at Prisma level.

An empty string `""` is truthy in JavaScript, so it passes the target check on line 54 (`!dto.reportedPostId` is `false` for `""`), and then `prisma.post.findUnique({ where: { id: "" } })` returns null, throwing NotFoundException. This is handled gracefully but wastes a DB query.

---

### [LOW] A19-13 — Multi-target reports possible (ambiguous handling)

**File:** `dto/create-report.dto.ts`, `reports.service.ts`, lines 54-55
**Issue:** The DTO allows ALL target ID fields simultaneously. A user could submit a report with BOTH `reportedPostId` AND `reportedUserId` AND `reportedCommentId` set. The service processes each independently (separate existence checks, separate auto-hide, separate content removal on resolve). The duplicate check (line 126-136) builds a compound filter where ALL provided IDs must match, meaning a multi-target report is unlikely to match a single-target report.

**Impact:** Ambiguous semantics. A report should target exactly one entity. Multi-target reports create confusion in moderation (does dismissing the report restore all targets? does resolving remove all targets?). The auto-hide and resolve logic processes each target independently, but the report is a single record with a single status.

---

### [LOW] A19-14 — getPending only returns PENDING, ignoring REVIEWING

**File:** `reports.service.ts`, line 323
**Issue:** `getPending()` filters `where: { status: ReportStatus.PENDING }` but does not include `REVIEWING`. Since `REVIEWING` is never set (finding A19-5), this has no practical impact. However, if `REVIEWING` is ever implemented, these reports would be invisible to the admin pending queue.

---

### [INFO] A19-15 — Mass-report detection logs but does not escalate

**File:** `reports.service.ts`, lines 116-122
**Issue:** When a user submits >10 reports in 1 hour, the service logs a warning and rejects the report with a generic error. There is no escalation: no notification to admins, no flagging of the user for review, no temporary cooldown tracking. The user can simply wait and resume reporting.

---

### [INFO] A19-16 — Urgent report reason for NUDITY may over-trigger

**File:** `reports.service.ts`, line 45
**Issue:** `NUDITY` is classified as urgent with the comment "May contain CSAM." However, NUDITY reports on adult content should not trigger the same urgency as actual CSAM. Without a separate `CSAM` report reason, all nudity reports are treated as potential child exploitation material. This creates excessive auto-hiding for legitimate nudity complaints (e.g., bikini photos that violate community guidelines but are not illegal).

**Recommendation:** Add a separate `CSAM` reason to `ReportReason` enum for true CSAM reports, and keep `NUDITY` at normal priority.

---

### [INFO] A19-17 — Auto-hide for post sets removedReason, but thread/reel/video do not

**File:** `reports.service.ts`, lines 186-236
**Issue:** When auto-hiding a post (line 189), both `isRemoved: true` and `removedReason` are set. When auto-hiding a thread (line 209), reel (line 219), or video (line 229), only `isRemoved: true` is set — no `removedReason`. The Thread model has no `removedReason` field (confirmed in schema), but the Reel model DOES have `removedReason` (schema line 1446). The comment auto-hide also omits `removedReason` (comment model has no such field).

**Impact:** Inconsistent audit trail. Reel auto-hides lose the removal reason. When content is restored on dismiss (lines 533-557), there is no way to know why a reel was hidden.

---

## Checklist Verification

### 1. Self-report — Can user report their own content?
**PASS.** Self-reporting is blocked for all 7 target types. Lines 60-112 check ownership for `reportedUserId` (identity match), `reportedPostId`, `reportedCommentId`, `reportedMessageId`, `reportedThreadId`, `reportedReelId`, `reportedVideoId` (DB lookup for `userId`/`senderId` match).

### 2. Duplicate reports — Can same user report same content twice?
**PASS (with nuance).** Application-level check (lines 126-139) prevents duplicates where prior report is PENDING/REVIEWING. DB-level unique constraints (schema lines 2328-2334) prevent duplicates regardless of status. Together, they prevent all duplicates. However, the Prisma unique constraint on nullable columns means the check only deduplicates when the target field is non-null — multiple reports with ALL target IDs null would be allowed (but blocked by the "at least one target" check on line 54).

### 3. Rate limit — Report spam without @Throttle?
**PARTIAL PASS.** Class-level `@Throttle` at 60/min exists (line 29). Service-level 10/hour DB check exists (line 120). However, the HTTP throttle is too generous for the POST endpoint specifically (finding A19-6). The report creation endpoint should have a tighter per-endpoint throttle.

### 4. Target validation — All report target types validated?
**PARTIAL PASS.** All 7 target types (post, thread, reel, video, user, comment, message) have existence checks in the service. However: (a) Stories are not reportable at all (finding A19-4), (b) Thread/Reel/Video have no foreign key constraints in schema (finding A19-3), (c) ID format is not validated in DTO (finding A19-12).

### 5. Urgent reports — Auto-hide logic correct? False positives handled?
**PARTIAL PASS.** Auto-hide requires 3+ unique reporters (anti-weaponization). However: (a) Dismiss can restore content that was independently removed by a resolved report (finding A19-1, CRITICAL), (b) Messages are excluded from auto-hide (finding A19-7), (c) NUDITY over-triggers (finding A19-16).

### 6. Dismiss recovery — Does dismissing restore hidden content for ALL content types?
**PASS.** Dismiss restores posts, comments, threads, reels, and videos (lines 517-557). All 5 auto-hideable content types are covered. However, the restore logic has the CRITICAL bug in A19-1 where it can undo a prior CONTENT_REMOVED action.

### 7. Status machine — Can resolved reports be re-resolved? Can dismissed reports be re-opened?
**PASS.** Both `resolve()` (line 344) and `dismiss()` (line 495) check that status is PENDING or REVIEWING before proceeding. Resolved/dismissed reports cannot be re-actioned. However, there is no transition TO REVIEWING (finding A19-5), and no re-open mechanism exists.

### 8. Privacy — Can reporter see who else reported? Can reported user see reporter identity?
**PASS (current state).** `getMyReports` returns only the user's own reports. `getPending` (admin only) includes reporter info but is behind `verifyAdminOrModerator`. The reported user has no endpoint to view reports against them. However, `getById` and `resolve` return unshaped objects that could leak data if exposed to wrong parties (findings A19-8, A19-9).

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 3 |
| MEDIUM   | 6 |
| LOW      | 4 |
| INFO     | 3 |
| **Total** | **17** |
