# Session Continuation Prompt — 72-Agent Audit Remediation

Copy-paste this entire prompt into a new Claude Code session to continue the audit fix work.

---

## PROMPT START

You are continuing a massive audit remediation project for Mizanly, a 276K LOC Muslim social platform (NestJS backend + React Native mobile). Read all context carefully before writing any code.

## What happened so far

72 parallel Claude Opus agents audited the entire codebase and produced ~4,300 raw findings across 72 files in `docs/audit/agents/`. We are now fixing every finding, one audit file at a time, directly — no subagents for code.

### Files completed (01-06):
- **01-islamic-services.md** — 52 findings, ALL fixed. Islamic services, prayer times, Quran audio offsets, mosque routing, scholar verification, DTOs.
- **02-payment-commerce.md** — 75 findings, 19 fixed directly + rest tracked. Free coins exploit closed, tips/subscriptions changed to pending status, gift race condition fixed with atomic updateMany, DTOs validated.
- **03-auth-security.md** — 38 findings, 28 fixed. 2FA endpoints now require auth, ClerkAuthGuard checks isBanned/isDeactivated/isDeleted, feature flags require admin, socket gateway checks bans, GDPR export expanded, privacy delete cascade expanded.
- **04-social-graph.md** — 52 findings, 20 fixed. Block queries made bidirectional, notification block/mute filtering, sendMessage block check, mute/restrict made idempotent, circle UUID validation fixed.
- **05-content-creation.md** — 94 findings, 82 fixed. Reel moderation field fixed (description→caption), video/channel soft delete, story auth+expiry+privacy, ForYou pagination fixed (offset-based), feed dismissal filtering, duplicate report prevention, hashtag counter decrement, block check on getById for all content types, editedAt tracking, rate limits on view endpoints, reel edit endpoint added, thread edit added, video comment delete added, XP for stories/channels/thread replies.
- **06-messaging-realtime.md** — 78 findings, 55 fixed. MESSAGE_SELECT expanded (isSpoiler, isViewOnce, etc), view-once forward blocked, lock code hashed with scrypt, WebSocket DTO updated, slow mode enforcement, disappearing message expiresAt, online/offline scoped to conversations, forum lock/pin auth, call block check, group creation block check, addGroupMembers validation, all inline DTOs replaced, promote restricted to owner, circle membership checks on discord features.

### Files completed (01-16):
- **07-feed-algorithm.md** — 54 findings, 51 fixed. SQL injection, block/mute filtering on all feeds, admin guards, pagination, memory leak caps, MINBAR support, feed hydration, Ramadan future-proofing.
- **08-gamification.md** — 52 findings, 44 fixed. Runtime crashes (prisma.streak), SVG XSS, route shadowing, XP farming prevention, level thresholds extended to 50.
- **09-community-features.md** — 62 findings, 33 fixed. Runtime crash (prisma.community), events prefix, watch party activation, fatwa scholar verification, slug generation for Arabic.
- **10-ai-services.md** — 38 findings, 26 fixed. Fail-closed moderation, word filter real patterns, DTO validation, embedding vector NaN filtering.
- **11-media-pipeline.md** — 28 findings, 25 fixed. Webhook security, path traversal, SSRF, EXIF stripping, video publishedAt timing.
- **12-search-discovery.md** — 38 findings, 28 fixed. Unbounded queries, content leaks (removed/private/banned), auth guards, limit caps.
- **13-admin-moderation.md** — 42 findings, 31 fixed. Report resolution actually works, temp ban auto-unban, appeal workflow, admin protection.
- **14-notifications.md** — 31 findings, 21 fixed. Settings enforcement, push token security, data types, unread-counts endpoint.
- **15-prisma-schema.md** — 92 findings, 54 fixed. Cascade→SetNull on financial records, 20+ indexes, FeedInteraction unique, rating types.
- **16-dto-validation.md** — 142 findings, 106 fixed. Inline types→DTOs, @IsUrl, @Min/@Max, @MaxLength, @ArrayMaxSize, @IsIn.

### Next file to work on: **17-error-handling.md**

### Current test state: 3,800 tests, 0 failures

## Critical files to read BEFORE starting

### 1. DEFERRED_FIXES.md (READ FIRST)
`docs/audit/DEFERRED_FIXES.md` — Master tracker of ALL deferred items from files 01-16. Before starting file 17, check this file for any OPEN items that belong to file 17's scope. Fix those alongside file 17's own findings.

### 2. The audit file itself
Read the ENTIRE audit file before writing any code.

### 3. CLAUDE.md
`CLAUDE.md` — Full project guide. Architecture, schema field names, design tokens, component reference, API patterns, absolute rules.

### 4. Memory files
`~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` — Index of all memory files. Read the feedback files especially.

## Absolute rules (from user feedback — NEVER violate)

1. **Fix ALL findings** — Critical, Moderate, AND Minor. Never skip, never "prioritize key ones." The user explicitly said: "never do shallow work or prioritise key ones. Implement all."

2. **Every code change MUST have tests** — Write tests and confirm they pass before moving to the next finding. Run `npx jest` after each fix. This is a "religious rule."

3. **Fix findings IN ORDER** — Don't jump around. Go F1, F2, F3... sequentially.

4. **Don't defer findings in the file's own scope** — Only defer if fixing it requires reading/modifying files that belong to a DIFFERENT audit agent's scope (e.g., schema changes belong to file 15, AI moderation belongs to file 10). If the fix touches files in the current audit's scope, do it NOW.

5. **Read DEFERRED_FIXES.md before each file** — Check for OPEN items from previous files that belong to the current file's scope. Fix them too.

6. **Update DEFERRED_FIXES.md after each file** — Add any new deferred items. Mark resolved ones.

7. **No subagents for code** — Do everything directly. Subagents produce buggy, shallow work.

8. **No Co-Authored-By** — Never add AI attribution to commits.

9. **Test files are part of the fix** — When you change a service method's signature or behavior, update ALL test files that test it. Check integration tests too (`src/integration/`).

10. **Commit after each completed file** — The user wants a commit per file.

## How to work through each audit file

```
1. Read docs/audit/DEFERRED_FIXES.md — check for OPEN items in this file's scope
2. Read docs/audit/agents/NN-name.md — the full audit file, every finding
3. Read the actual source files referenced in the findings
4. Fix finding F1 → run tests → fix F2 → run tests → ... → fix FN → run tests
5. For each fix:
   a. Edit the source file
   b. Update/add tests for the changed behavior
   c. Run npx jest to confirm 0 failures
   d. If test fails, fix the test (update mocks, assertions, add missing mock fields)
6. After all findings done, run full suite: npx jest --passWithNoTests
7. Update docs/audit/DEFERRED_FIXES.md with this file's status
8. Commit
```

## Common test fix patterns (from experience in files 01-06)

When you change a service method, these test mock issues come up repeatedly:

- **Added a new Prisma query** (e.g., `block.findFirst`) → Add it to the PrismaService mock in the spec file AND in integration test files (`src/integration/*.spec.ts`)
- **Changed method signature** (e.g., added `userId` param) → Update all test calls to pass the new param
- **Changed return value** (e.g., `{ deleted: true }` → `{ archived: true }`) → Update all `expect().toEqual()` assertions
- **Made a method async** that wasn't before → Update test to use `await`
- **Used `replace_all: true`** when editing → Be careful of duplicate object keys in mock objects (Prisma mock has two `report:` keys, second overwrites first)
- **Integration test files** to check: `src/integration/final-push-part2.spec.ts`, `src/integration/comprehensive-auth-batch.spec.ts`, `src/integration/final-100.spec.ts`, `src/integration/final-coverage-push.spec.ts`, `src/integration/concurrency-remaining.spec.ts`, `src/integration/edge-cases-additional.spec.ts`

## Project commands

```bash
cd apps/api && npx jest --passWithNoTests          # Run all tests
cd apps/api && npx jest src/modules/MODULE_NAME/    # Run specific module tests
cd apps/api && npx jest FILE.spec.ts --verbose      # Run one test file with details
```

npm is NOT in shell PATH — use Windows terminal for npm commands.

## Key schema conventions (from CLAUDE.md)

- ALL models use `userId` (NOT authorId) except semantic exceptions listed in CLAUDE.md
- Post: `content` (NOT caption), Reel: `caption` (NOT description)
- Thread: `isChainHead`, Story: `mediaType`, Message: `messageType`
- Follow: composite PK `[followerId, followingId]`
- IDs: core models use `cuid()`, extension models use `uuid()`
- `$executeRaw` tagged template literals are SAFE — do NOT replace them

## Start working

1. Read `docs/audit/DEFERRED_FIXES.md`
2. Read `docs/audit/agents/07-feed-algorithm.md`
3. Start fixing finding F1, then F2, etc.
4. After finishing file 07, continue with 08, 09, 10... through 72.

Good luck. The user will be here all weekend. Maximum effort, no shortcuts.
