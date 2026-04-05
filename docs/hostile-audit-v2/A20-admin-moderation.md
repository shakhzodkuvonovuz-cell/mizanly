# A20: Admin & Moderation Audit

**Scope:** `admin.controller.ts`, `admin.service.ts`, `moderation.service.ts`, `moderation.controller.ts`, `content-safety.service.ts`, `reports.service.ts` (cross-referenced for ban consistency)

**Files read:** 12 files, ~1,800 lines of service/controller code + DTOs + modules + Prisma schema

---

## Findings

### [CRITICAL] A20-1 -- Moderator identity leaked via getMyActions (moderation.service.ts:410-429)

The `getMyActions` method returns full `ModerationLog` records to the moderated user. It uses `include` (lines 414-418) to add related `targetPost` and `targetComment`, but **does NOT use `select` on the base model**. Prisma's behavior with `include` returns ALL scalar fields of the base model by default, which means the `moderatorId` field (line 2358 in schema) is included in every response.

The code has a comment on line 415 saying `// A10-#5: Do NOT expose moderator identity to moderated users`, but the implementation fails to achieve this. The `include` block only controls which **relations** to load -- it does not filter base model fields. A `select` block is required to exclude `moderatorId`.

**Impact:** Moderated users can identify which admin/moderator took action against them. This enables targeted harassment of moderators, social engineering, or retaliation.

**Evidence:** Line 412 uses `findMany` with `include` but no `select`. The `ModerationLog` model has `moderatorId String?` (schema line 2358). Prisma returns it by default.

---

### [CRITICAL] A20-2 -- Reports.service.ts resolve() can ban admin users (reports.service.ts:397-408)

When a report is resolved with `PERMANENT_BAN` or `TEMP_BAN` via `reports.service.ts`, there is **no check** that the target user is an admin. The code directly updates `isBanned: true, isDeactivated: true` on the reported user (line 404-407) without checking `target.role`.

Compare with `admin.service.ts:280` which correctly has `if (target.role === 'ADMIN') throw new ForbiddenException('Cannot ban an admin user')`.

**Attack vector:** A moderator (who has access via `verifyAdminOrModerator`) resolves a report against an admin user with `PERMANENT_BAN`. The admin gets banned, their Clerk sessions revoked, their WebSocket disconnected, and their content deindexed. This is a privilege escalation allowing a moderator to neutralize an admin.

---

### [HIGH] A20-3 -- Appeal ban reversal does not unban in Clerk (moderation.service.ts:529-558)

When an appeal is accepted and a ban is reversed, the `resolveAppeal` method clears `isBanned`/`isDeactivated` in the database (line 525-528) but **cannot call `clerk.users.unbanUser()`** because `ModerationService` does not inject the Clerk SDK.

The code uses a `_pendingClerkUnban` instance variable hack (line 534) and logs a warning (lines 554-558) saying manual Clerk unban is required. This means:

1. The database says the user is unbanned.
2. Clerk still has the user banned.
3. The user **cannot log in** because `ClerkAuthGuard` verifies tokens through Clerk first.
4. The unban is effectively a lie -- the user appears unbanned in the DB but is locked out.

This is not just a TODO -- it is a broken feature that produces an inconsistent state.

---

### [HIGH] A20-4 -- _pendingClerkUnban is not concurrency-safe (moderation.service.ts:534, 551)

The `resolveAppeal` method stores the Clerk ID to unban on `this._pendingClerkUnban` (line 534), a mutable instance property on the singleton `ModerationService`. If two appeal resolutions happen concurrently:

1. Request A sets `_pendingClerkUnban = 'clerk_id_A'`
2. Request B sets `_pendingClerkUnban = 'clerk_id_B'` (overwrites A)
3. Request A reads `_pendingClerkUnban` and gets `clerk_id_B` (wrong user)
4. Request B reads `_pendingClerkUnban` and gets `undefined` (already deleted by A)

Result: User A's Clerk ban is never lifted. User B's Clerk ban is lifted by both requests. Even if the Clerk SDK were injected, this pattern is fundamentally broken for concurrent requests on a singleton service.

---

### [HIGH] A20-5 -- Appeal reversal does not restore thread/reel/video content (moderation.service.ts:512-521)

When a `CONTENT_REMOVED` action is reversed via accepted appeal, the `resolveAppeal` method only restores:
- Posts (line 514)
- Comments (line 517)
- Messages (line 520)

It does **NOT** restore:
- Threads (`targetThreadId`)
- Reels (`targetReelId`)
- Videos (`targetVideoId`)

All three content types are properly removed by `review()` (lines 311-329) and by `admin.service.ts resolveReport()` (lines 182-190), but the appeal reversal path ignores them. A user who appeals a thread/reel/video removal and wins gets nothing restored.

---

### [HIGH] A20-6 -- admin.service.ts resolveReport content removal is NOT atomic (admin.service.ts:170-192)

The `resolveReport` method in `admin.service.ts` removes content using `Promise.all` with individual `.catch()` handlers (lines 172-191). Each removal is a separate Prisma call, not wrapped in a `$transaction`. If one removal fails:

1. The report is still marked as RESOLVED (line 243-252)
2. Some content is removed, some is not
3. The `.catch()` only logs a warning (line 174: `this.logger.warn`)
4. The admin sees success

Compare with `moderation.service.ts review()` which correctly uses `$transaction` (line 278). The admin.service path is the one without transaction safety.

Additionally, the report update at line 243 happens AFTER the non-transactional removals but is itself not in the same transaction scope, creating a window where content is partially removed but the report still shows PENDING.

---

### [HIGH] A20-7 -- ModerationService moderation log failure silently swallowed for 'approve' (moderation.service.ts:332-347)

The `review()` method skips moderation log creation when `action === 'approve'` (line 333: `if (action !== 'approve')`). This means dismissals have no audit trail in the `moderation_log` table.

While the `report` record itself is updated with `reviewedById` and `status: DISMISSED`, there is no corresponding entry in `moderation_log`. Compare with `admin.service.ts` which always writes to `adminAuditLog` regardless of action (line 239-241).

This matters for accountability: an admin who dismisses thousands of valid reports leaves no trail in the moderation log system.

---

### [MEDIUM] A20-8 -- No adminAuditLog in ModerationService at all

The `ModerationService` never writes to the `AdminAuditLog` table. Grep for `adminAuditLog` in the moderation directory returns zero results.

The `AdminService` consistently logs to `adminAuditLog` for every action: `RESOLVE_REPORT_*` (line 239), `BAN_USER` (line 338), `SEND_ANNOUNCEMENT` (line 491). But the parallel moderation paths (`review()`, `resolveAppeal()`, `getQueue()`, `getStats()`) leave no trace in `adminAuditLog`.

This creates a split audit trail: some admin actions are in `adminAuditLog`, others are only in `moderation_log` (which is part of the ModerationLog table and has different fields/indexes). An admin using the moderation controller endpoints bypasses the admin audit system entirely.

---

### [MEDIUM] A20-9 -- getMyAppeals exposes moderator identity intentionally but inconsistently (moderation.service.ts:437-438)

The `getMyAppeals` method explicitly includes `moderator: { select: { id: true, displayName: true } }` (line 438), exposing the moderator's identity to the appealing user. Meanwhile, `getMyActions` (the comment on line 415) explicitly tries to HIDE moderator identity.

This is contradictory: the user cannot see who moderated them in `getMyActions`, but CAN see who moderated them in `getMyAppeals` (which shows the same ModerationLog records, filtered to appealed ones). The moderator's `id` and `displayName` are exposed.

If the policy is to hide moderator identity (as A10-#5 states), `getMyAppeals` violates it.

---

### [MEDIUM] A20-10 -- SendAnnouncementDto pushData field has no validation (send-announcement.dto.ts:17)

The `pushData` field is typed as `Record<string, string>` but has no class-validator decorator beyond `@IsOptional()`. There is:
- No `@IsObject()` validation
- No max-keys limit
- No max-value-length limit
- No key name sanitization

An admin could inject arbitrary key-value pairs into push notifications sent to ALL users. While this requires admin access, a compromised admin account could use this to:
1. Inject malicious deep links (e.g., `screen: 'javascript:...'` if the mobile app processes pushData unsafely)
2. Send enormous pushData payloads to every user (DoS on push delivery)

---

### [MEDIUM] A20-11 -- TEMP_MUTE action only increments warningsCount, no actual muting (admin.service.ts:203-208, reports.service.ts:411-416)

Both `admin.service.ts resolveReport()` (line 204-207) and `reports.service.ts resolve()` (line 412-414) handle `TEMP_MUTE` by incrementing `warningsCount`. There is:
- No actual mute mechanism (no `isMuted` field, no `mutedUntil` timestamp)
- No enforcement anywhere that checks if a user is "muted"
- No duration for the mute
- No notification to the user that they are muted

The action name `TEMP_MUTE` implies the user cannot post/comment for a period. In reality, it just bumps a counter that nothing reads for muting purposes.

---

### [MEDIUM] A20-12 -- admin.service.ts moderation log skips thread/reel/video target IDs (admin.service.ts:222-236)

When creating a moderation log entry in `resolveReport()`, the code only includes `targetPostId`, `targetCommentId`, and `targetMessageId` (lines 228-230). It does NOT include `targetThreadId`, `targetReelId`, or `targetVideoId`, even though:

1. The report was fetched WITH those fields (lines 158-160)
2. Content removal handles those types (lines 182-189)
3. The `ModerationLog` schema has those FK columns (schema lines 2363-2365)

This means moderation logs for thread/reel/video actions have no link to the actual content that was moderated.

---

### [MEDIUM] A20-13 -- Unban does not restore user content visibility (admin.service.ts:345-401)

The `unbanUser` method clears ban flags and re-adds the user to the search index (line 385-398), but does NOT restore any content that was hidden during the ban. When a user is banned:

1. `removeUserContentFromSearch()` deindexes all their posts/threads/reels/videos (line 333)
2. But content is NOT set to `isRemoved: true` during ban (only deindexed from search)

However, if the ban was triggered via `resolveReport` with `CONTENT_REMOVED` + `BAN_USER`, the content WAS set to `isRemoved: true` (lines 173-190). On unban, only the search index is restored -- the `isRemoved` flag is never cleared. The user appears unbanned but their content remains removed.

---

### [LOW] A20-14 -- No IP address logging in adminAuditLog (admin.service.ts)

The `AdminAuditLog` schema has an `ipAddress String?` field (schema line 5316), but no admin service method populates it. All `adminAuditLog.create()` calls (lines 239-241, 338-340, 491-493) omit `ipAddress`.

For forensic purposes (e.g., determining if an admin account was compromised), the IP address of admin actions is valuable. The schema supports it but the code never populates it.

---

### [LOW] A20-15 -- Admin controller rate limit is generous for destructive operations (admin.controller.ts:27)

The controller-level `@Throttle` is set to `30 requests per 60 seconds` (line 27). This means an admin can ban 30 users per minute, resolve 30 reports per minute, etc. While individual sensitive endpoints like announcements and search sync have tighter limits (lines 98, 133, 142), the core admin operations (ban, unban, resolve report, get reports) use the 30/min default.

For comparison, the moderation controller also uses 30/min (moderation.controller.ts:20). The `check-text` and `check-image` endpoints correctly use 5/min (lines 28, 38).

---

### [LOW] A20-16 -- ModerationService review() does not notify user on content removal (moderation.service.ts:291-330)

When content is removed via `review()` with action `remove`, the user whose content was removed receives **no notification**. Compare with:
- `content-safety.service.ts autoRemoveContent()` which creates a SYSTEM notification (lines 283-296)
- `admin.service.ts resolveReport()` with WARNING which sends a notification (lines 211-219)

The moderation `review()` only notifies on WARNING (lines 353-361), not on CONTENT_REMOVED. A user's post could be removed and they would only discover it by visiting their profile.

---

### [LOW] A20-17 -- Story content type missing from all moderation removal paths

The `Story` model exists in the schema (line 1334) and has an `isRemoved Boolean @default(false)` field (line 1359). Stories can be reported (per `TAB3_PROGRESS.md`, stories use `description: 'story:{id}'` workaround since there is no `reportedStoryId` FK).

However, none of the following moderation paths handle Story removal:
- `admin.service.ts resolveReport()` -- handles post, comment, message, thread, reel, video (NOT story)
- `moderation.service.ts review()` -- handles post, comment, message, thread, reel, video (NOT story)
- `reports.service.ts resolve()` -- handles post, comment, message, thread, reel, video (NOT story)
- `content-safety.service.ts autoRemoveContent()` -- handles post, reel, thread, comment, video (NOT story)

A reported story cannot be removed through any moderation workflow.

---

### [INFO] A20-18 -- Three parallel report resolution paths with behavioral drift

There are three separate code paths for resolving reports:
1. `admin.service.ts resolveReport()` -- used by AdminController
2. `moderation.service.ts review()` -- used by ModerationController
3. `reports.service.ts resolve()` -- used by ReportsController

Each has slightly different behavior:
- **Transaction safety:** #2 and #3 use `$transaction`, #1 does not
- **Audit logging:** #1 writes to both `moderationLog` + `adminAuditLog`, #2 writes to `moderationLog` only (and skips on dismiss), #3 writes to `moderationLog` only
- **Ban protection:** #1 checks `target.role === 'ADMIN'`, #2 and #3 do not check (though #2 doesn't have ban action, #3 does)
- **Content type IDs in moderation log:** #1 omits thread/reel/video IDs, #2 includes all, #3 includes all
- **User notification on removal:** #2 and #3 do not notify on CONTENT_REMOVED, ContentSafetyService does

This drift means the same admin action produces different side effects depending on which controller they use.

---

## Checklist Verification

| # | Check | Result | Details |
|---|-------|--------|---------|
| 1 | Privilege escalation -- admin role verified on ALL admin endpoints? | **PARTIAL** | AdminController: `verifyAdmin()` called on all endpoints. ModerationController: `verifyAdminOrModerator()` called on admin-only endpoints. But `getMyActions`, `getMyAppeals`, `submitAppeal` are user-facing and correctly open to all auth'd users. **Gap:** `reports.service.ts resolve()` allows moderators to issue bans without checking if target is admin (A20-2). |
| 2 | Rate limit -- admin actions without @Throttle? | **PASS (controller level)** | Both controllers have class-level `@Throttle({ default: { limit: 30, ttl: 60000 } })`. Announcements, search sync, counter reconcile have tighter per-endpoint limits. No unprotected endpoints. |
| 3 | Audit trail -- all admin actions logged? | **FAIL** | AdminService logs to `adminAuditLog` consistently. ModerationService does NOT log to `adminAuditLog` at all (A20-8). ModerationService skips `moderationLog` for dismiss/approve actions (A20-7). No IP address captured anywhere (A20-14). |
| 4 | Replay prevention -- resolved reports re-resolved? | **PASS** | AdminService checks `report.status === 'RESOLVED' || report.status === 'DISMISSED'` and throws (line 166-168). ModerationService checks `status !== 'PENDING' && status !== 'REVIEWING'` (line 257). ReportsService checks the same (line 344). Appeals check `appealResolved` (line 506). |
| 5 | Content removal -- works for ALL content types? | **FAIL** | Story content type is not handled by ANY moderation path (A20-17). Appeal reversal only restores post/comment/message, not thread/reel/video (A20-5). |
| 6 | Ban cascade -- disconnect WebSocket, clear sessions, hide content? | **PARTIAL** | AdminService: Clerk ban + Redis pub/sub `user:banned` + search deindex. ReportsService: same. ModerationService (appeal reversal): Clerk unban BROKEN (A20-3). Content not marked `isRemoved` on ban (only deindexed), but not restored on unban either (A20-13). |
| 7 | Unban -- can banned users be unbanned? Content restored? | **FAIL** | DB unban works. Clerk unban works in AdminService. Clerk unban BROKEN in ModerationService appeal path (A20-3). Content visibility NOT restored on unban (A20-13). |
| 8 | Admin BOLA -- can one admin modify another admin's actions? | **PASS** | No endpoint restricts one admin from resolving another admin's pending reports or reviewing another admin's moderation logs. This is expected behavior -- admins share a moderation queue. The only protection is that admins cannot ban other admins (in admin.service.ts only -- see A20-2). |

---

**Summary:** 18 findings (2 CRITICAL, 5 HIGH, 5 MEDIUM, 4 LOW, 2 INFO). The most dangerous issues are the moderator identity leak to moderated users (A20-1) and the ability for a moderator to ban an admin through the reports resolution path (A20-2). The broken Clerk unban in the appeal flow (A20-3) means accepted appeals produce an inconsistent state where the user appears unbanned but cannot log in.
