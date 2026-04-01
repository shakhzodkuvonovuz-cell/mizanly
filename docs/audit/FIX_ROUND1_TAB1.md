# FIX SESSION — Tab 1: Auth, Users, Social Graph

> Paste this into a fresh Claude Code session. This session fixes 88 findings across auth, users, follows, blocks, mutes, reports, moderation.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Integrity Rules and Code Patterns
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read ALL 4 of your audit finding files IN FULL before writing a single line of code:
   - `docs/audit/v2/wave1/A01.md` (21 findings — auth, users, two-factor, devices)
   - `docs/audit/v2/wave2/B01.md` (21 findings — User, UserSettings, Follow, Block, Mute models)
   - `docs/audit/v2/wave1/A10.md` (22 findings — follows, blocks, mutes, restricts, reports, moderation)
   - `docs/audit/v2/wave2/B11.md` (24 findings — Report, ModerationAction, BannedHash, Appeal)
4. Create your progress file: `docs/audit/v2/fixes/TAB1_PROGRESS.md`
5. Read this ENTIRE prompt before touching any source code

---

## YOUR SCOPE — THESE MODULES ONLY

```
apps/api/src/modules/auth/
apps/api/src/modules/users/
apps/api/src/modules/two-factor/
apps/api/src/modules/devices/
apps/api/src/modules/follows/
apps/api/src/modules/blocks/
apps/api/src/modules/mutes/
apps/api/src/modules/restricts/
apps/api/src/modules/reports/
apps/api/src/modules/moderation/
```

**FORBIDDEN — DO NOT TOUCH:**
- Any module not listed above (other tabs are fixing them simultaneously)
- `schema.prisma` (dedicated schema session later)
- `chat.gateway.ts` (cross-module session later)
- `apps/mobile/` (different round entirely)
- `apps/e2e-server/` or `apps/livekit-server/` (different round)

If a finding requires editing a file outside your scope, write it in your progress file under "DEFERRED — out of scope" with the exact finding ID and reason. Do NOT skip silently.

---

## ENFORCEMENT RULES — THESE ARE NOT GUIDELINES, THEY ARE REQUIREMENTS

### E1: PROVE every fix with a code diff
For each finding you fix, you MUST write to your progress file:
```
### Finding A01-#3 (Severity: H)
**Audit says:** users.service.ts:142 — findUnique without isBanned filter
**Before:** `prisma.user.findUnique({ where: { id } })`
**After:** `prisma.user.findFirst({ where: { id, isBanned: false, isDeactivated: false, isDeleted: false } })`
**Test:** users.service.spec.ts — added "should not return banned user" test
**Status:** FIXED + TESTED
```

If you cannot show before/after, you did not fix it. "I updated the file" is not proof. The diff IS the proof.

### E2: TEST every fix individually
After EACH fix (not each batch, not each module — EACH FIX):
```bash
cd apps/api && pnpm test -- --testPathPattern=<module>
```
If you fix auth.service.ts finding #3, run auth tests BEFORE moving to finding #4. If the test fails, your fix is wrong. Fix the fix before proceeding.

You MUST write a NEW test for every Critical and High finding. Medium findings need a test if one doesn't already exist for that code path. Low/Info findings don't require new tests but must not break existing ones.

**Minimum new test count for this session: 20.** If you finish 88 findings with fewer than 20 new tests, you skimmed.

### E3: CHECKPOINT every 10 fixes
After every 10th fix, STOP and run a full analysis:

```
CHECKPOINT [10/88]

1. Run full module tests:
   cd apps/api && pnpm test -- --testPathPattern="auth|users|two-factor|devices|follows|blocks|mutes|restricts|reports|moderation"

2. Run TypeScript check:
   cd apps/api && npx tsc --noEmit 2>&1 | tail -20

3. Count your actual changes:
   git diff --stat

4. Grep-verify 3 random fixes actually landed:
   - Pick finding #X: grep for the fix at the cited line
   - Pick finding #Y: grep for the fix at the cited line
   - Pick finding #Z: grep for the fix at the cited line

5. Report in progress file:
   "CHECKPOINT 10/88: [X] tests passing, [Y] new tests written, [Z] TS errors, [3/3] grep-verified."

6. COMMIT everything so far:
   git add <specific files> && git commit -m "fix(scope): checkpoint 10/88 — [summary]"
```

If ANY grep-verification fails (your fix didn't actually land in the file), STOP. Re-read the file. Fix it for real. Do not proceed until the checkpoint passes.

If TypeScript errors > 0, fix them before proceeding.

Checkpoints happen at: 10, 20, 30, 40, 50, 60, 70, 80, 88. That's 9 checkpoints with 9 commits.

### E4: NO SKIPPING — every finding gets one of three outcomes
For EACH of the 88 findings, the outcome MUST be one of:
1. **FIXED + TESTED** — code changed, test proves it, diff in progress file
2. **DEFERRED** — cannot fix without touching out-of-scope files. Exact reason documented.
3. **DISPUTED** — finding is wrong (code is actually correct). You MUST prove it by reading the source and explaining WHY the audit agent was wrong. "I think it's fine" is not a dispute — show the code that handles the case.

**"SKIPPED" is not an outcome.** If a finding doesn't fit FIXED, DEFERRED, or DISPUTED, it's FIXED. No exceptions.

### E5: READ the source file BEFORE fixing
For every finding:
1. Read the audit finding (file:line, severity, description)
2. Open the ACTUAL source file with the Read tool
3. Read the specific line AND 20 lines above and below for context
4. Understand what the code does, not just what the finding says
5. THEN write your fix

If you fix a finding without reading the source file first, you are guessing. Guessing creates new bugs. The Edit tool does NOT count as "reading" — you must Read first, then Edit.

### E6: PATTERN PROPAGATION
When you fix a finding, grep the ENTIRE scope for the same pattern:
```bash
# Example: if you fix a missing isBanned filter on findUnique
grep -rn "findUnique" apps/api/src/modules/auth/ apps/api/src/modules/users/ --include="*.ts" | grep -v spec | grep -v node_modules
```
If the same bug exists on 5 other lines in your scope that the audit didn't cite, FIX THEM ALL. The audit finds examples — you fix patterns.

### E7: NO SHALLOW FIXES
These are NOT acceptable fixes:
- Adding `// TODO: fix this` — that's not a fix
- Adding `@ts-ignore` to silence a type error — fix the type
- Changing `findUnique` to `findFirst` without adding the filter conditions — you changed the method but didn't fix the bug
- Adding `@Throttle()` with no arguments — specify the rate
- Adding a DTO class with zero decorators — add the actual validators
- Adding a test that only checks `expect(result).toBeDefined()` — test the actual behavior
- "Refactored for clarity" without fixing the actual finding — cosmetic ≠ fix

If a fix takes less than 30 seconds, you probably did it wrong. Read the code. Understand the bug. Fix it properly.

### E8: COMMIT DISCIPLINE
Commit after every checkpoint (every 10 fixes). Commit message format:
```
fix(auth,users): checkpoint N/88 — [what was fixed]

Findings fixed: A01-#1, A01-#2, A01-#3, B01-#1, B01-#2, ...
New tests: 4
Deferred: 1 (A01-#7 — requires schema change)
```

Do NOT accumulate 40 fixes and commit once. If the session crashes, 40 fixes are lost.

### E9: HOSTILE SELF-REVIEW after completion
After fixing all 88 findings, before declaring done:
1. Re-read EVERY file you modified. Not skim — read.
2. For each file: did your changes introduce any new bugs?
3. Run the full test suite: `cd apps/api && pnpm test`
4. Run TypeScript check: `cd apps/api && npx tsc --noEmit`
5. Read your progress file top to bottom. Is every finding accounted for?
6. Count: FIXED + TESTED = X, DEFERRED = Y, DISPUTED = Z. X + Y + Z MUST equal 88.

### E10: FINAL OUTPUT
When done, your progress file (`docs/audit/v2/fixes/TAB1_PROGRESS.md`) must contain:
```
# Tab 1 Fix Session — Auth, Users, Social Graph

## Summary
- Total findings: 88
- Fixed + Tested: [N]
- Deferred (with reasons): [N]
- Disputed (with proof): [N]
- New tests written: [N]
- Commits: [N]
- Final test suite: [N] passing, [N] failing
- TypeScript errors: 0

## Checkpoints
- [x] 10/88: [N] tests passing, [N] new tests
- [x] 20/88: ...
- ...
- [x] 88/88: complete

## Every Finding
[Before/after diff for each, grouped by module]

## Deferred Items
[Exact finding ID, reason, which session should handle it]

## Disputed Items
[Exact finding ID, why the audit was wrong, code proof]
```

This file is your PROOF OF WORK. Without it, the fixes are unverified.

---

## MODULE-SPECIFIC INSTRUCTIONS

### Auth + Users + Two-Factor + Devices (A01 + B01 = 42 findings)
These modules handle user identity. Critical area.
- **@CurrentUser('id')** — if any endpoint uses bare @CurrentUser(), fix to include 'id'
- **Clerk webhook** — if auth webhook handler has issues, verify it matches Clerk's actual payload shape
- **Two-factor** — if 2FA has security findings, the fix must not lock users out. Test both enable AND disable flows.
- **Device fingerprinting** — if device limit (5/device) has bypass, fix the Redis check

### Follows + Blocks + Mutes + Restricts (A10 partial = ~10 findings)
Social graph operations must be atomic and consistent.
- **Follow counter** — increment AND decrement must use GREATEST(0, count - 1) to prevent negatives
- **Block propagation** — blocking someone must filter them from ALL content endpoints (but that's other modules' job — just fix the block/mute service itself here)
- **Restrict** — Instagram-style restrict (restricted user doesn't know). Verify the implementation matches the intent.

### Reports + Moderation (A10 partial + B11 = ~36 findings)
Content safety. High stakes.
- **Report FK fields** — if reports use wrong FK columns, verify the Report model in schema (read-only, don't edit schema) and fix the service to use the correct field
- **Auto-moderation** — if moderatorId: 'system' causes FK violation, change to null (system actions don't have a moderator user)
- **Appeal resolution** — if appeal unban doesn't clear isDeactivated, add it to the update
- **Urgent report auto-hide** — if single-user report can weaponize content removal, add a minimum threshold (e.g., 3 reports before auto-hide)

---

## TEST COMMANDS REFERENCE
```bash
cd apps/api && pnpm test -- --testPathPattern=auth
cd apps/api && pnpm test -- --testPathPattern=users
cd apps/api && pnpm test -- --testPathPattern=two-factor
cd apps/api && pnpm test -- --testPathPattern=devices
cd apps/api && pnpm test -- --testPathPattern=follows
cd apps/api && pnpm test -- --testPathPattern=blocks
cd apps/api && pnpm test -- --testPathPattern=mutes
cd apps/api && pnpm test -- --testPathPattern=reports
cd apps/api && pnpm test -- --testPathPattern=moderation
cd apps/api && pnpm test  # full suite — at checkpoints and final
cd apps/api && npx tsc --noEmit  # type check — at checkpoints and final
```

---

## THE STANDARD THAT MATTERS

You are not "fixing bugs." You are making a $100M app production-ready. Every fix must be something you'd defend in a security review. Every test must prove a real behavior. Every commit must be something a senior engineer would approve.

If you finish in 30 minutes, you did it wrong. 88 findings across 10 modules with proper reading, fixing, testing, and verification takes 2-4 hours of real work. If you're done faster, you skimmed.

**88 findings. 88 outcomes. 20+ new tests. 9 checkpoints. 1 progress file. Zero shortcuts.**
