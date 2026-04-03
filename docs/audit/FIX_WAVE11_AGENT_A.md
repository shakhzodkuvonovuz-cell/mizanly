# ARCHITECTURE FIX — Agent A: Dead Code + Type Safety + Mobile Architecture (L01 + L05 + L06)

> ~102 gaps across 3 audit files. L01 (72 gaps in 90 rows): dead exports, dead files, dead API clients, dead screens, dead hooks. L05 (19 gaps in 30 rows): `as any`, `as unknown as`, redundant `!` assertions, untyped variables. L06 (11 gaps in 22 rows): god components, duplicated utilities, state management.
> **YOUR JOB: Read L01 + L05 + L06. Fix every finding. Do NOT touch files that Agent B owns (see FORBIDDEN section).**

---

## WHAT THIS SESSION IS

This is a CODE CLEANUP session. You are deleting dead code, fixing type safety violations, and extracting shared utilities. You are NOT refactoring architecture (that's Agent B). Your changes should be surgical and safe — deleting unused exports, removing `as any` casts, extracting duplicated functions.

---

## RULES — NON-NEGOTIABLE

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will `git diff` every claimed fix, run the full test suite (345 suites, 6,651 tests), and verify no regressions. Previous agents across 24 sessions: inflated FIXED by 26, wrote TODO as "FIXED", deferred 47% while claiming 10%.

### RULE 1: TOTAL ACCOUNTING
`FIXED + DEFERRED + NOT_A_BUG + ALREADY_FIXED = TOTAL`. L01=90, L05=30, L06=22. All 142 documented. No silent skips.

### RULE 2: DEFERRAL CAP — 15% (max 21)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER. For L06 god-component extraction: if it takes >30 minutes per screen, it's a genuine deferral. For L01 dead code deletion: if the code is used (audit was wrong), it's NOT_A_BUG, not DEFERRED.

### RULE 3: VERIFY BEFORE DELETING
For EVERY L01 "dead export" finding: **grep the ENTIRE codebase** before deleting. The audit was from 2026-03-30 — later sessions may have wired up previously-dead code. If grep finds imports, mark as NOT_A_BUG (audit is stale).

### RULE 4: FIX ALL SEVERITIES
L01 is mostly L (Low) severity — these are still mandatory. L05 has H and M findings — fix those first.

### RULE 5: TESTS MUST STAY GREEN
Run `cd apps/api && npx jest` and `cd apps/mobile && npx tsc --noEmit` after each checkpoint. Current: **345 suites, 6,651 tests, 0 failures.** If deleting dead code breaks a test, the code wasn't dead — restore it and mark NOT_A_BUG.

### RULE 6: CHECKPOINT PROTOCOL
Commit after each L-file. Format: `fix(arch): W11-A CP[N] — L[file] [summary] [N fixes]`.

### RULE 7: NO SUBAGENTS. NO CO-AUTHORED-BY.

### RULE 8: SELF-AUDIT + HONESTY PASS before marking complete.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Code Patterns ("No `any` in non-test code", "No `@ts-ignore`")
2. Read ALL THREE audit files IN FULL:
   - `docs/audit/v2/wave11/L01.md` (90 rows — dead code)
   - `docs/audit/v2/wave11/L05.md` (30 rows — type safety)
   - `docs/audit/v2/wave11/L06.md` (22 rows — mobile architecture)
3. Create: `docs/audit/v2/fixes/W11_AGENT_A_PROGRESS.md`

---

## YOUR SCOPE

```
# L01 — Dead code deletion (API + Mobile)
apps/api/src/common/utils/         # Dead exports: cache.ts, enrich.ts, ssrf.ts, image.ts
apps/api/src/common/dto/           # Dead DTO file
apps/api/src/common/services/      # Dead QueryDiagnosticsService
apps/api/src/modules/audio-rooms/dto/  # Dead DTO
apps/mobile/src/utils/             # Dead files: platform.ts, rtl.ts, performance.ts, offlineQueue.ts, registerServiceWorker.ts
apps/mobile/src/services/          # 12 dead API client files
apps/mobile/src/config/            # Dead image.ts
apps/mobile/src/constants/         # Dead accessibilityHints.ts
apps/mobile/src/hooks/             # Dead hooks (check which)
apps/mobile/app/(screens)/         # Dead screen files (L01 section 5+6)

# L05 — Type safety fixes (API + Mobile)
apps/api/src/modules/feed/feed.service.ts              # any[] → typed
apps/api/src/modules/reports/reports.service.ts         # any[] → typed
apps/api/src/gateways/chat.gateway.ts                  # as any → extend type
apps/api/src/modules/messages/messages.service.ts       # as any → extend type
apps/api/src/modules/gifts/gifts.service.ts            # as any → Prisma type
apps/api/src/modules/commerce/commerce.service.ts      # redundant !, manual typing
apps/api/src/modules/search/search.service.ts          # number|string param
apps/mobile/src/components/saf/PostCard.tsx             # unnecessary as unknown casts
apps/mobile/src/components/majlis/ThreadCard.tsx        # string width

# L06 — Mobile architecture (selective — only small extractions)
apps/mobile/src/utils/formatTime.ts                    # NEW: extract from 11 screens
apps/mobile/src/hooks/useDraftPersistence.ts           # NEW: extract from 4 create screens
```

## FORBIDDEN — Agent B owns these files. DO NOT TOUCH:

```
# L02 files (circular deps)
apps/api/src/modules/broadcast/broadcast.module.ts
apps/api/src/modules/gifts/gifts.module.ts
apps/api/src/modules/payments/payments.module.ts
apps/api/src/common/queue/processors/*.ts              # forwardRef changes
apps/api/src/common/queue/queue.module.ts

# L03 files (pagination/pattern fixes)
apps/api/src/modules/communities/communities.service.ts  # cursor migration
apps/api/src/modules/audio-rooms/audio-rooms.service.ts
apps/api/src/modules/broadcast/broadcast.service.ts
apps/api/src/modules/feed/feed.service.ts              # EXCEPTION: you can fix L05 type issues but NOT pagination
apps/api/src/modules/notifications/notifications.service.ts

# L04 files (error handling)
apps/api/src/modules/auth/auth.service.ts              # Clerk error leak
apps/api/src/modules/payments/payments.service.ts      # fire-and-forget
apps/api/src/modules/admin/admin.service.ts            # audit log silence
apps/api/src/modules/stream/stream.service.ts          # missing try-catch
apps/api/src/modules/meilisearch.service.ts            # error swallowing
```

**If you need to fix an L05 type issue in a file Agent B also touches (e.g., `feed.service.ts`), fix ONLY the type issue — do not change pagination or error handling in that file.**

---

## WORK ORDER

### Phase 1: L01 Dead Code (72 gaps) — the bulk of the work

**CRITICAL: grep before delete.** For each finding:
```bash
grep -r "functionName\|ClassName" apps/ --include="*.ts" --include="*.tsx" | grep -v "\.spec\." | grep -v "__tests__"
```
If zero results (excluding the definition itself): delete.
If results found: mark NOT_A_BUG.

Work in order:
1. **Section 1** (#1-13): Dead exports — delete individual functions/types from files
2. **Section 2** (#14-21): Dead files — delete entire files (verify no imports first)
3. **Section 3** (#22-33): Dead API clients — 12 service files with zero imports
4. **Section 4** (#34-50): Dead mobile code (hooks, screens, types)
5. **Section 5-8** (#51-90): Dead API code, unused mobile screens, barrel exports, dead config

After all deletions: `npx tsc --noEmit` for both api and mobile.
Commit: `fix(arch): W11-A CP1 — L01 dead code removal [N deletions]`

### Phase 2: L05 Type Safety (19 gaps)

Priority by severity:
1. **#7-8 (H):** `chat.gateway.ts` and `messages.service.ts` — add `_skipRedisPublish` to the data interface. This is the most critical type fix (message creation path).
2. **#1 (M):** `feed.service.ts` — `any[]` → Prisma typed array
3. **#4 (M):** `notification.processor.ts` — `'SYSTEM' as any` → proper enum
4. **#14 (M):** `stripe-webhook.controller.ts` — use `Stripe.Dispute` type
5. **#19 (M):** `PostCard.tsx` — remove 6 unnecessary `as unknown` casts
6. **#23 (M):** `commerce.service.ts` — remove 7 redundant `!` assertions
7. **#26 (M):** `waitlist.service.ts` — add null check instead of `!` assertion
8. Remaining M and L findings

After all type fixes: `npx tsc --noEmit` for both api and mobile.
Commit: `fix(arch): W11-A CP2 — L05 type safety [N fixes]`

### Phase 3: L06 Mobile Architecture (11 gaps — selective)

Only fix items that are SMALL extractions (under 30 minutes each):
1. **#6 (M):** Extract `formatTime` utility from 11 screens → `@/utils/formatTime.ts`
2. **#7 (M):** Extract `useDraftPersistence` hook from 4 create screens
3. **#15 (L):** Remove dead `Image` import from creator-dashboard.tsx
4. **#10 (M):** Change `feedDismissedIds` from Array to Set in store (performance fix)

DEFER the god-component extractions (#1, #2, #14) — these are multi-hour refactors:
- conversation/[id].tsx (3,169 lines) — needs useConversation, useVoiceRecording, useMessageEncryption hooks
- video-editor.tsx (2,606 lines) — needs useReducer/Zustand refactor
- create-story/create-reel/create-post — need hook extraction

Also DEFER #5 (conversation colors.dark migration — 28 occurrences), #9 (Zustand store split), #12-13 (643+1,628 theme references — XL effort from Wave 4 deferrals).

Commit: `fix(arch): W11-A CP3 — L06 formatTime extraction + type fixes [N fixes]`

---

## TEST COMMANDS
```bash
cd apps/api && npx jest                          # All API tests
cd apps/mobile && npx tsc --noEmit               # Mobile typecheck
cd apps/api && npx tsc --noEmit                  # API typecheck
```

---

## DELIVERABLES

- **142/142 findings documented** with status
- **Max 21 deferred** — god-component extractions, XL theme migrations
- **Dead code genuinely deleted** (grep-verified unused)
- **`as any` count reduced** (track before/after)
- **All tests green** (345 suites, 6,651 tests)
- **3 atomic commits** (one per L-file)
- **Progress file** with self-audit

**102 gaps. Grep before you delete. Fix the types. Extract formatTime. Begin.**
