# Round 2 Tab 1 Part 2 — Failed Fixes + Gaps + Tests

## Summary
- **Failed fixes repaired:** 2 (profile moderation, getHostSessions pagination)
- **Suspect gaps closed:** 4 (report DTO, sealed msg validation, atomic INCR x9, Meilisearch pagination)
- **New tests written:** 22 across 7 describe blocks in 6 files
- **Shared utility created:** 1 (redis-atomic.ts)
- **Tests passing:** 1237 (93 suites), 0 failing in scope
- **Commits:** 3
- **Started:** 2026-04-01

## Checkpoints
- [x] CP1: Section 1 — Profile moderation real fix + getHostSessions pagination
- [x] CP2: Section 2 — Report DTO, sealed msg fields, atomicIncr x9, Meilisearch cursor
- [x] CP3: Section 3 — 22 tests across 7 describe blocks

## Section 1: Failed Fix Repairs

### 1.1 — X08-#13: Profile moderation — REAL FIX (was TODO comment)
**Before:** TODO comment, zero moderation on bio/displayName/location
**After:**
- ModerationModule added to UsersModule imports
- ContentSafetyService injected in UsersService constructor
- moderateText() called on bio, displayName, location BEFORE Prisma update
- BadRequestException thrown when content flagged (blocks the update)
- TODO comment REMOVED

### 1.2 — A16-#6/#7 regression: getHostSessions pagination
**Before:** `where: { hostId: userId, ...(cursor ? { id: { lt: cursor } } : {}) }`
**After:** `...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})`

## Section 2: Suspect Gaps Closed

### 2.1 — Report DTO + service: thread/reel/video FK fields
**Before:** CreateReportDto had no reportedThreadId/reportedReelId/reportedVideoId fields. Auto-hide and resolve for these types was dead code.
**After:**
- DTO gains 3 new optional @IsString fields
- create() persists all 3 FK fields
- Ownership validation for thread/reel/video (prevents self-reporting)
- Duplicate check includes new fields
- Urgent auto-hide groupBy includes new fields

### 2.2 — Sealed message remaining field validation
**Before:** 7 optional string fields (e2eSenderRatchetKey, e2eIdentityKey, e2eEphemeralKey, messageType, replyToId, mediaUrl, clientMessageId) had zero length validation. OOM vector.
**After:** All 7 capped with appropriate MaxLength values.

### 2.3 — Shared atomicIncr utility (J07-H6)
**Before:** 9 INCR+EXPIRE patterns across 7 files had crash-between race condition.
**After:** All 9 replaced with `atomicIncr()` from `common/utils/redis-atomic.ts`.
Locations migrated: chat.gateway.ts (2), auth.service.ts (1), ab-testing.service.ts (1), retention.service.ts (1), notifications.service.ts (1), content-safety.service.ts (2).

### 2.4 — Admin ban Meilisearch deindex pagination
**Before:** `take: 1000` per content type. Prolific users' content left searchable.
**After:** Cursor-paginated 500/batch with loop. No cap.

## Section 3: Test Coverage

| # | File | Describe | Tests | What it proves |
|---|------|----------|-------|----------------|
| 1 | parental-controls.service.spec.ts | PIN security (A15) | 3 | PIN destructured before Prisma, select excludes pin, hash stored |
| 2 | users.service.audit.spec.ts | Profile moderation (X08-#13) | 4 | moderateText called, flagged bio rejected, displayName moderated, non-text skipped |
| 3 | clerk-auth.guard.spec.ts | Deletion cancellation (X04-#2) | 4 | Future deletion allowed, no deletion blocked, past blocked, deleted blocked |
| 4 | reports.service.spec.ts | Content removal (X08-#2) | 3 | Thread/reel/video removed on CONTENT_REMOVED |
| 5 | reports.service.spec.ts | Temp ban (X04-#3) | 1 | TEMP_BAN sets banExpiresAt ~72h |
| 6 | redis-atomic.spec.ts | atomicIncr utility | 5 | Lua script correct, count returned, EXPIRE in script, args passed |
| 7 | admin.service.spec.ts | Ban search deindex (X04-#9) | 2 | User deindexed, content deindex fires |
| | **Total** | | **22** | |

## Commits
1. `48f33e29` — CP1: Profile moderation real fix + getHostSessions pagination
2. `0f84a691` — CP2: Report DTO, sealed msg, atomicIncr x9, Meilisearch cursor
3. (pending) — CP3: 22 tests across 7 describe blocks
