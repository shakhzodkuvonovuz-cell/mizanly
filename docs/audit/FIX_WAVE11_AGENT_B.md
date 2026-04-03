# ARCHITECTURE FIX — Agent B: Circular Deps + Pattern Consistency + Error Handling (L02 + L03 + L04)

> ~105 gaps across 3 audit files. L02 (20 gaps in 23 rows): circular dependencies, forwardRef abuse, module coupling. L03 (53 gaps in 56 rows): pagination cursor inconsistency, error format variations, response shape drift, cron patterns. L04 (32 gaps in 40 rows): silent `.catch(() => {})`, fire-and-forget DB writes, error message leaks, missing try-catch.
> **YOUR JOB: Read L02 + L03 + L04. Fix every finding. Do NOT touch files that Agent A owns (see FORBIDDEN section).**

---

## WHAT THIS SESSION IS

This is an API SERVICE REFACTORING session. You are fixing error handling patterns, standardizing pagination cursors, removing unnecessary forwardRef, and making catch blocks explicit. All changes are in `apps/api/src/`. You do NOT touch mobile code.

---

## RULES — NON-NEGOTIABLE

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will `git diff` every claimed fix, run the full test suite (345 suites, 6,651 tests), and verify no regressions. Previous agents: inflated FIXED by 26, wrote TODO as "FIXED", deferred 47%.

### RULE 1: TOTAL ACCOUNTING
`FIXED + DEFERRED + NOT_A_BUG + ALREADY_FIXED = TOTAL`. L02=23, L03=56, L04=40. All 119 documented. No silent skips.

### RULE 2: DEFERRAL CAP — 15% (max 17)
L02 DlqService extraction is a genuine M-effort deferral (affects 6 processors). L02 NotificationsModule cycle is a genuine H-effort deferral (needs event-driven architecture). Everything else in L03 and L04 is Small effort.

### RULE 3: PATTERN CONSISTENCY
When fixing L03 pagination cursors, use ONE pattern everywhere:
```typescript
// STANDARD CURSOR PATTERN (Prisma ID-based)
const items = await this.prisma.model.findMany({
  where: { ...filters },
  cursor: cursor ? { id: cursor } : undefined,
  skip: cursor ? 1 : 0,
  take: Math.min(limit, 50),
  orderBy: { createdAt: 'desc' },
});
const hasMore = items.length === Math.min(limit, 50);
const nextCursor = hasMore ? items[items.length - 1].id : null;
return { data: items, meta: { cursor: nextCursor, hasMore } };
```
Do NOT invent a new pattern. Do NOT use date-string cursors.

### RULE 4: ERROR HANDLING PATTERN
When fixing L04 `.catch(() => {})` blocks, use ONE pattern:
```typescript
// WRONG — silent swallow
.catch(() => {})

// RIGHT — log the error, don't crash the parent flow
.catch((err) => this.logger.warn(`Failed to X: ${err.message}`))

// FOR CRITICAL PATHS (payments, audit logs) — log + Sentry
.catch((err) => {
  this.logger.error(`Failed to X: ${err.message}`);
  Sentry.captureException(err);
})
```
Do NOT add try-catch where the error should propagate. Only fix SILENT catches.

### RULE 5: TESTS MUST STAY GREEN
Run `cd apps/api && npx jest` after each checkpoint. Current: **345 suites, 6,651 tests, 0 failures.**

### RULE 6: CHECKPOINT PROTOCOL
Commit after each L-file. Format: `fix(arch): W11-B CP[N] — L[file] [summary] [N fixes]`.

### RULE 7: NO SUBAGENTS. NO CO-AUTHORED-BY.

### RULE 8: SELF-AUDIT + HONESTY PASS before marking complete.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Code Patterns ("All errors explicit, never silently swallowed")
2. Read ALL THREE audit files IN FULL:
   - `docs/audit/v2/wave11/L02.md` (23 rows — circular dependencies)
   - `docs/audit/v2/wave11/L03.md` (56 rows — pattern inconsistency)
   - `docs/audit/v2/wave11/L04.md` (40 rows — error handling)
3. Read existing code patterns — pick 2 well-implemented services to use as reference:
   - `apps/api/src/modules/follows/follows.service.ts` (uses Prisma ID cursor correctly)
   - `apps/api/src/modules/channels/channels.service.ts` (good error handling)
4. Create: `docs/audit/v2/fixes/W11_AGENT_B_PROGRESS.md`

---

## YOUR SCOPE — API services only

```
# L02 — Circular dependency fixes
apps/api/src/modules/broadcast/broadcast.module.ts     # Remove unnecessary forwardRef
apps/api/src/modules/gifts/gifts.module.ts             # Same
apps/api/src/modules/payments/payments.module.ts       # Same
apps/api/src/common/queue/processors/*.ts              # forwardRef on QueueService (6 files)
apps/api/src/common/queue/queue.module.ts              # Module structure

# L03 — Pagination cursor standardization (8 services with date-string cursors)
apps/api/src/modules/communities/communities.service.ts
apps/api/src/modules/audio-rooms/audio-rooms.service.ts
apps/api/src/modules/broadcast/broadcast.service.ts
apps/api/src/modules/gamification/gamification.service.ts
apps/api/src/modules/mosques/mosques.service.ts
apps/api/src/modules/halal/halal.service.ts
apps/api/src/modules/feed/feed.service.ts              # ONLY pagination — do not touch types (Agent A)
apps/api/src/modules/notifications/notifications.service.ts

# L03 — Error format fixes
apps/api/src/modules/events/events.service.ts          # Raw `throw new Error`
apps/api/src/modules/downloads/downloads.service.ts    # Same
Plus any other services with `throw new Error` (not HttpException)

# L03 — Response shape fixes
Various services with inconsistent `{ success: true }` returns

# L04 — Error handling fixes (25+ service files)
apps/api/src/modules/auth/auth.service.ts
apps/api/src/modules/payments/payments.service.ts
apps/api/src/modules/messages/messages.service.ts
apps/api/src/modules/admin/admin.service.ts
apps/api/src/modules/reels/reels.service.ts
apps/api/src/modules/stream/stream.service.ts
apps/api/src/modules/broadcast/broadcast.service.ts
apps/api/src/modules/follows/follows.service.ts
apps/api/src/modules/scheduling/scheduling.service.ts
apps/api/src/modules/push.service.ts
apps/api/src/modules/meilisearch.service.ts
apps/api/src/modules/stories/stories.service.ts
apps/api/src/modules/users/users.service.ts
apps/api/src/modules/videos/videos.service.ts
apps/api/src/modules/commerce/commerce.service.ts
apps/api/src/modules/posts/posts.service.ts
apps/api/src/modules/islamic/islamic.service.ts
apps/api/src/modules/privacy/privacy.service.ts
apps/api/src/modules/notifications/notifications.service.ts
```

## FORBIDDEN — Agent A owns these. DO NOT TOUCH:

```
# L01 files (dead code deletion)
apps/api/src/common/utils/cache.ts         # Agent A deleting dead exports
apps/api/src/common/utils/enrich.ts
apps/api/src/common/utils/ssrf.ts
apps/api/src/common/utils/image.ts
apps/api/src/common/dto/api-responses.dto.ts
apps/api/src/common/services/query-diagnostics.service.ts
apps/mobile/src/**                          # ALL mobile code is Agent A's

# L05 files (type safety)
apps/api/src/modules/gifts/gifts.service.ts           # Agent A fixing as any
apps/api/src/modules/commerce/commerce.service.ts      # Agent A fixing redundant !
apps/api/src/modules/search/search.service.ts          # Agent A fixing param type
apps/api/src/modules/waitlist/waitlist.service.ts      # Agent A fixing null check
apps/api/src/gateways/chat.gateway.ts                  # Agent A fixing _skipRedisPublish type
```

**EXCEPTION: If an L04 error-handling fix is in the same file as an L05 type fix (e.g., `commerce.service.ts`), Agent A fixes types, you fix error handling. Coordinate by touching DIFFERENT lines.**

---

## WORK ORDER

### Phase 1: L04 Error Handling (32 gaps) — HIGHEST IMPACT, fix first

**CRITICAL fixes (4 items):**
1. **#1 (C):** `auth.service.ts:104` — Clerk error message leak. Replace `${msg}` with static "Authentication failed".
2. **#2 (C):** `payments.service.ts:90` — `storePaymentIntentMapping` fire-and-forget. Await the DB write.
3. **#3 (C):** `payments.service.ts:105` — `storeSubscriptionMapping` same. Await the DB write.
4. **#4 (C):** `messages.service.ts:822` — Group invite `.catch(() => {})`. Add error logging.

**HIGH fixes (8 items):**
- #5-6: Admin audit log `.catch(() => {})` → add `this.logger.error` + `Sentry.captureException`
- #7-8: Reels `recordView`/`recordLoop` `.catch(() => {})` → add `this.logger.warn`
- #9-10: Stream service missing try-catch on fetch calls → wrap in try-catch
- #11: Broadcast notification `.catch(() => {})` → add `this.logger.warn`
- #12: Meilisearch `onModuleInit` → set `this.available = false` in catch

**MEDIUM fixes (14 items):**
- #13: Follows 7× `.catch(() => {})` → add `this.logger.debug`
- #14-15: Scheduling hashtag counts → differentiate P2002 from other errors
- #16: Push batch → track failure rate
- #17: Push badge count → add logging
- #18-19: Meilisearch search/addDocuments → better error handling
- #23: Posts collab invite → check P2002 specifically
- #24: Islamic achievement → check error type
- Others

Commit: `fix(arch): W11-B CP1 — L04 error handling: silent catches → explicit logging [N fixes]`

### Phase 2: L03 Pattern Consistency (53 gaps)

**Pagination cursor migration (8 services):**
Convert all date-string cursors to Prisma ID-based cursors. Each service follows the standard pattern from RULE 3. This is mechanical — same transformation applied 8 times.

For each service:
1. Read the existing pagination code
2. Replace `where.createdAt = { lt: new Date(cursor) }` with `cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : 0`
3. Replace `data[data.length-1].createdAt.toISOString()` with `data[data.length-1].id`
4. Run module tests

**Error format fixes:**
Grep for `throw new Error(` (not `new NotFoundException`, `new BadRequestException`, etc.) and replace with appropriate NestJS HTTP exceptions.

**Response shape fixes:**
Audit the `{ success: true }` returns and standardize. Low priority — fix what's easy.

Commit: `fix(arch): W11-B CP2 — L03 pagination cursor standardization + error format [N fixes]`

### Phase 3: L02 Circular Dependencies (20 gaps)

**Quick fixes (3 items):**
- #1-3: Remove unnecessary `forwardRef` from broadcast, gifts, payments modules. These modules don't have actual cycles — forwardRef was cargo-culted.

**DEFER the rest:**
- #4-9 (6 items): Queue processor forwardRef on QueueService. Fixing this properly requires extracting a `DlqService`. This is a real architectural change affecting 6 processor files.
- #10-23 (remaining): Module cycle analysis, NotificationsModule god-dependency, event-driven extraction. These are Scale Roadmap Tier 4 items (CLAUDE.md documents them).

Commit: `fix(arch): W11-B CP3 — L02 remove 3 cargo-culted forwardRefs [3 fixes]`

---

## TEST COMMANDS
```bash
cd apps/api && npx jest                                    # All API tests (must stay 6,651)
cd apps/api && npx jest -- --testPathPattern=payments      # After fixing payments error handling
cd apps/api && npx jest -- --testPathPattern=communities   # After pagination cursor migration
cd apps/api && npx jest -- --testPathPattern=notifications # After cursor migration
cd apps/api && npx tsc --noEmit                            # Typecheck
```

---

## DELIVERABLES

- **119/119 findings documented** with status
- **Max 17 deferred** — DlqService extraction, event-driven architecture, module cycle resolution
- **All `.catch(() => {})` replaced** with explicit logging
- **All date-string cursors migrated** to Prisma ID-based
- **3 unnecessary forwardRefs removed**
- **All tests green** (345 suites, 6,651 tests)
- **3 atomic commits** (one per L-file)
- **Progress file** with self-audit

**105 gaps. Fix the 4 Critical error handlers first — they're losing real money and data. Then standardize pagination. Then remove forwardRefs. Begin.**
