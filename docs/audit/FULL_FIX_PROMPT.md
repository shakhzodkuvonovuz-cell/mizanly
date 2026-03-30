# PROFESSIONAL FIX SESSION — Mizanly Audit Remediation

> **THIS IS A PROMPT.** Paste into a fresh Claude Code Opus session. It fixes ALL 721 findings from the 2026-03-30 audit + runs deferred audit waves inline.

---

## STEP 0 — MANDATORY BOOTSTRAP

Before doing ANYTHING else:

1. Read `CLAUDE.md` (project rules, architecture, standing rules)
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/2026-03-30-full-audit/MASTER_FINDINGS.md` — the complete audit report
4. Read `docs/audit/2026-03-30-full-audit/ACTIONABLE_FIXES.md` — the fix roadmap
5. Read `docs/audit/2026-03-30-full-audit/WAVE1_SUMMARY.md`, `WAVE2_SUMMARY.md`, `WAVE3_SUMMARY.md`
6. Read this entire prompt before writing a single line of code

---

## PHILOSOPHY

This is not a "fix the top 10 criticals and ship" session. This is a **complete remediation** where every finding — Critical, High, Medium, Low, AND Info — gets addressed with the same rigor. A Low-severity code smell left unfixed becomes a Medium bug next sprint, a High security hole next quarter, and a Critical incident in production.

**Quality over speed. Completeness over progress. One fix done right is worth ten done fast.**

---

## RULES — NON-NEGOTIABLE

### R1: Fix-Test-Verify Cycle
Every single fix follows this cycle. No exceptions. No batching.

```
1. READ the finding (file:line, impact, suggested fix)
2. READ the actual file — understand context, don't just grep-replace
3. READ neighboring code — is the same pattern broken elsewhere in this file?
4. FIX the issue
5. CHECK: did your fix introduce any new issues? Read what you wrote.
6. WRITE a test that proves the fix works (even for Low/Info findings)
7. RUN the test: `cd apps/api && pnpm test -- --testPathPattern=<module>`
8. If test fails → fix and re-run. Never move on with red tests.
9. Report: "Fixed [finding ID]. Test: [pass]. File: [path]. Change: [1-line summary]."
```

### R2: Systemic Fixes Before Individual Fixes
The audit identified 10 systemic patterns that each affect 5-45 files. Fix these FIRST because:
- They resolve 20-40 individual findings each (reducing total work)
- They establish the pattern for individual fixes
- They're the highest-impact work

### R3: File Grouping
After systemic fixes, work FILE BY FILE (not finding-by-finding). When you open `messages.service.ts`, fix EVERY finding in that file before moving on. This prevents:
- Re-reading the same 1,700-line file 8 times
- Context loss between related fixes
- Merge conflicts from touching the same file in different commits

### R4: Test Everything — Including Low and Info
- **Critical/High:** Explicit test proving the vulnerability is closed
- **Medium:** Test proving the behavior is correct
- **Low:** Test proving the code follows the expected pattern
- **Info:** If it's dead code → delete it + verify nothing breaks. If it's a suggestion → implement it + test.

### R5: Commit Discipline
- One commit per systemic fix (with table explaining all changes)
- One commit per file group (3-8 files with related findings)
- Commit message format: `fix(audit): [short description] — [N] findings fixed`
- Before every commit: show plain-English explanation with table (what, why, values)
- No Co-Authored-By. No AI references.

### R6: Never Skip
If you cannot fix a finding, you MUST:
1. Explain WHY (not "it's complex" — give the technical reason)
2. Document it in `docs/audit/2026-03-30-full-audit/DEFERRED.md` with effort estimate
3. Move on — but it counts as incomplete, not resolved

### R7: Self-Audit After Each Phase
After completing each phase, re-read every file you modified. Ask:
- Did I introduce any new bugs?
- Did I break any existing tests?
- Is there a finding in this file I missed?
Run the full test suite: `cd apps/api && pnpm test`

### R8: Progress Tracking
Maintain a running tally after each commit:
```
PROGRESS: [N] of 721 findings fixed. [N] tests added. [N] deferred. [N] remaining.
```

### R9: Deferred Wave Audit-Fix Inline
Waves 4, 7, 8, 11, 12, 13 were never executed. As you work through files in each phase, ALSO audit them for the deferred wave criteria:
- **Wave 4 (UX):** While fixing a screen file, check loading/error/empty states
- **Wave 7 (Testing):** While in a module, note untested methods
- **Wave 8 (i18n):** While in a screen, check for hardcoded English
- **Wave 11 (Architecture):** While traversing modules, note dead code and circular deps
- **Wave 12 (Components):** While fixing component issues, audit the component itself
- **Wave 13 (Schema):** While fixing schema cascade issues, audit neighboring models

Report new findings from deferred waves as you find them, fix them inline, add to total count.

### R10: Opus Only
Never use Sonnet or Haiku for any agent spawned during fixes. Omit the model parameter.

---

## EXECUTION ORDER

### PHASE 1: SYSTEMIC FIXES (10 patterns, ~200 findings resolved)

Fix these in order. Each one resolves many individual findings simultaneously.

#### S1. Raw SQL Table Name Fixes (7 known + grep for more)
**Impact:** Every affected query is broken in production.

```bash
# Find ALL raw SQL with potential model name issues
cd apps/api && grep -rn '\$executeRaw\|queryRaw' src/ --include="*.ts" | grep -v spec | grep -v node_modules
```

Known broken:
| File | Line | Wrong | Correct |
|------|------|-------|---------|
| channels.service.ts | 205 | `"Channel"` | `"channels"` |
| channels.service.ts | 239 | `"Channel"` | `"channels"` |
| channels.service.ts | 466 | `"Subscription"` | `"subscriptions"` |
| communities.service.ts | 331 | `"Circle"` | `"circles"` |
| community-notes.service.ts | 27 | case mismatch | match enum case |
| polls.service.ts | 189 | `"PollOption"` | `"poll_options"` |
| polls.service.ts | 190 | `"Poll"` | `"polls"` |

After fixing: grep again to verify zero remaining. Test each affected module. **This was already found and supposedly fixed in Session 9 (50+ raw SQL fixes). If these are still here, understand WHY the previous fix didn't stick — is there a deeper pattern?**

#### S2. Financial Cascade → SetNull (8 models)
**Impact:** User deletion destroys financial records. GDPR requires retention.

Change `onDelete: Cascade` → `onDelete: SetNull` for:
- CoinBalance, MembershipTier, MembershipSubscription, PremiumSubscription
- ZakatFund, WaqfFund, CommunityTreasury, Order.product

After changing schema: `cd apps/api && npx prisma generate` and run ALL payment/gift/monetization tests.

Also: ensure the `userId` field on each model is `String?` (nullable) since SetNull requires it.

#### S3. Financial Atomicity ($transaction) (6 operations)
**Impact:** Race conditions allow double-spend, lost payments.

Wrap in `$transaction`:
- `gifts.service.ts` cashout flow (~line 291-350)
- `monetization.service.ts` cashout (if not dead code behind throw)
- `payments.service.ts` payment intent mapping (add `await`)
- `commerce.service.ts` stock restoration on order cancel
- `moderation.service.ts` appeal resolution
- Any other financial operation found during grep

#### S4. Visibility Filters on Direct Access (~45 endpoints)
**Impact:** Banned/deleted user content accessible via direct URLs.

Pattern to apply:
```typescript
// BEFORE (broken):
const post = await this.prisma.post.findUnique({ where: { id } });

// AFTER (correct):
const post = await this.prisma.post.findFirst({
  where: { id, isRemoved: false, user: { isBanned: false, isDeactivated: false, isDeleted: false } }
});
```

Grep to find all affected endpoints:
```bash
grep -rn 'findUnique.*where.*id' src/modules/ --include="*.service.ts" | grep -v spec
```

Apply to: `getById`, `getUserPosts`, `getByAudioTrack`, `browse`, and ALL direct-access patterns that aren't already filtering.

#### S5. Content Moderation on Edit Paths (~8 content types)
**Impact:** User posts clean content, passes moderation, then edits to add hate speech.

Add `contentSafety.moderateText()` to update/edit methods in:
- posts.service.ts: `update()`, `editComment()`
- reels.service.ts: `updateReel()`
- threads.service.ts: `updateThread()`
- videos.service.ts: `updateVideo()`
- channels.service.ts: `updateChannelPost()`
- communities.service.ts: `updateCommunityPost()`
- stories.service.ts: `create()` (missing entirely — also add report endpoint)
- Comment creation paths across all content types

#### S6. Inline Body Types → DTO Classes (~20 endpoints)
**Impact:** NestJS ValidationPipe silently skips validation on inline types.

```bash
# Find all inline body types
grep -rn "@Body()" src/modules/ --include="*.controller.ts" | grep -v "dto\|Dto"
grep -rn "@Body('" src/modules/ --include="*.controller.ts"
```

For each: create a proper DTO class with class-validator decorators. Move to the module's `dto/` folder.

#### S7. Distributed Locks on Crons (~12 cron methods)
**Impact:** Multi-instance deployment double-processes everything.

Pattern:
```typescript
async cronMethod() {
  const lock = await this.redis.set('lock:cronMethod', '1', 'EX', 300, 'NX');
  if (!lock) return; // Another instance is running
  try {
    // ... actual work
  } finally {
    await this.redis.del('lock:cronMethod');
  }
}
```

Apply to ALL `@Cron()` methods that perform writes. grep:
```bash
grep -rn "@Cron\|@Interval" src/ --include="*.ts" | grep -v spec | grep -v node_modules
```

#### S8. Block-List on Browse Endpoints (~10 endpoints)
**Impact:** Blocked users' content visible in trending, nearby, audio-track, etc.

Every browse/discovery endpoint must call `getExcludedUserIds(userId)` and filter results.

```bash
grep -rn "getExcludedUserIds" src/ --include="*.ts" | grep -v spec
# Compare against list of browse endpoints that DON'T call it
```

#### S9. Rate Limiting on Mutations (~25 endpoints)
**Impact:** Missing rate limits on DELETE/PATCH while POST has it.

```bash
# Find all mutation endpoints without @Throttle
grep -rn "@Delete\|@Patch\|@Put" src/modules/ --include="*.controller.ts" -A5 | grep -v Throttle
```

Add `@Throttle({ default: { limit: 10, ttl: 60000 } })` (or appropriate rate) to every mutation endpoint.

#### S10. Event Name Mismatches (~6 events)
**Impact:** Server emits events that mobile never receives.

Cross-reference:
- Server emits in `chat.gateway.ts` + queue processors
- Mobile listens in `apps/mobile/src/services/*.ts` and screen files

Fix by aligning names. The mobile side is the "public API" — server should match mobile's expectations, not the other way around.

---

### PHASE 2: CRITICAL + HIGH FIXES (remaining after systemic, ~80 findings)

After systemic fixes, many C/H findings will already be resolved. Work through remaining ones FILE BY FILE.

**Priority order within Phase 2:**

#### P2a. E2EE / Privacy (findings 1-3, 27-29)
- `chat.gateway.ts`: Fix `subscribe_presence` auth check
- `chat.gateway.ts`: Fix sealed envelope field persistence
- `chat.gateway.ts`: Fix sealed sender actually hiding senderId
- `messages.service.ts`: Clear E2E fields on disappearing message expiry
- `privacy.service.ts`: Call Clerk API on GDPR delete
- `auth.service.ts`: Skip sync for deleted users

#### P2b. Auth Bypasses (findings 4-7)
- `messages.service.ts`: Fix case-sensitive role checks (2 instances)
- `parental-controls.service.ts`: Exclude PIN from DTO destructure
- `parental-controls.service.ts`: Add consent flow for child linking

#### P2c. Financial (findings 8-12, resolved partly by S2/S3)
- Verify S2 cascade fixes landed
- Verify S3 transaction fixes landed
- `gifts.service.ts`: Fix rose gift diamond calculation (1 coin → 0 diamonds)
- `promotions.service.ts`: Add payment collection to boostPost

#### P2d. Broken Features (findings 13-22, resolved partly by S1)
- Verify S1 raw SQL fixes landed
- `content-safety.service.ts`: Fix `moderatorId: 'system'` → null
- `community.service.ts`: Fix fatwa answerId data type
- `publish-workflow.service.ts`: Fix real-time event payload
- `personalized-feed.service.ts`: Add VIDEO branch
- `meilisearch-sync.service.ts`: Fix reel batch sync field
- `livekit.ts` (mobile): Fix URL concatenation

#### P2e. Moderation (findings 23-26)
- `reels.service.ts`: Fix report FK field
- `videos.service.ts`: Fix report FK field
- `create-report.dto.ts`: Add missing reportedXId fields
- `stories.service.ts` + `stories.controller.ts`: Add moderation + report endpoint

#### P2f. Infrastructure (findings 30-34)
- `ci.yml`: Add LiveKit server test job
- Go services: Add `defer recover()` to goroutines
- Dockerfiles: Non-root user, health check, fix Go version
- `messages.service.ts`: Parallelize DM send queries
- `notifications.service.ts`: Batch recipient queries

---

### PHASE 3: MEDIUM FIXES (~240 findings)

Work file by file. Group by module. For each module:
1. Read all Medium findings for that module
2. Open the source file
3. Fix all findings in one pass
4. Write tests for all fixes
5. Run module tests
6. Move to next module

**Module execution order** (most findings first):
1. messages (gateway + service) — ~20 findings
2. posts (service + controller) — ~15 findings
3. reels (service + controller) — ~15 findings
4. schema.prisma — ~15 findings
5. feed + personalized-feed — ~12 findings
6. videos — ~10 findings
7. threads — ~10 findings
8. notifications — ~10 findings
9. channels + communities — ~10 findings
10. stories — ~8 findings
11. payments + gifts + monetization — ~8 findings
12. search + hashtags — ~8 findings
13. live + audio-rooms + broadcast — ~8 findings
14. moderation + reports — ~8 findings
15. islamic + mosques + halal — ~6 findings
16. admin + waitlist — ~5 findings
17. auth + users + 2fa — ~5 findings
18. Go services — ~9 findings
19. Performance fixes — ~6 findings
20. All remaining — ~10 findings

---

### PHASE 4: LOW FIXES (~161 findings)

Same file-by-file approach. These are code smells, missing indexes, inconsistent patterns, minor UX gaps. Treat each with the same respect as Medium fixes:
- Read the finding
- Understand why it matters
- Fix it properly
- Test it

Common Low patterns from the audit:
- Missing `@@index` on frequently queried FK columns
- Missing `@updatedAt` on models that should track modification
- Redundant indexes (already covered by composite index)
- Inconsistent naming (some modules use `create`, others `add`)
- Missing error messages on validation decorators

---

### PHASE 5: INFO FIXES (~86 findings)

Info findings are either:
1. **Dead code** → DELETE it. Verify nothing imports it. Test.
2. **Unused exports** → DELETE them. Test.
3. **Documentation gaps** → Add JSDoc or inline comments.
4. **Suggestions** → Evaluate. If the suggestion improves the code, implement it. If not, skip with documented reason.

Dead code is not harmless — it misleads future developers (or AI sessions), increases bundle size, and creates false confidence that a feature exists.

---

### PHASE 6: DEFERRED WAVE AUDIT-FIX (inline findings from Waves 4/7/8/11/12/13)

By this point you've touched most files in the codebase through Phases 1-5. You should have accumulated inline findings from the deferred waves. Compile and fix them:

1. **Wave 4 findings (UX):** Fix loading/error/empty state issues found while working on screen files
2. **Wave 7 findings (Testing):** You've already written hundreds of tests — note any modules still at 0 coverage
3. **Wave 8 findings (i18n):** Fix hardcoded English strings found while in screen files
4. **Wave 11 findings (Architecture):** Fix dead code and circular deps found while traversing modules
5. **Wave 12 findings (Components):** Fix component issues found while modifying them
6. **Wave 13 findings (Schema):** Fix schema issues found during Phase 1 S2 and Phase 3

---

### PHASE 7: FINAL VERIFICATION

1. Run full API test suite: `cd apps/api && pnpm test`
2. Run Go tests: `cd apps/e2e-server && go test ./internal/... -v` and `cd apps/livekit-server && go test ./internal/... -v`
3. Run mobile typecheck: `cd apps/mobile && npx tsc --noEmit`
4. Run signal tests: `cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js`
5. Grep for any remaining known-bad patterns:
   ```bash
   # Raw SQL with model names (should be 0)
   grep -rn '"[A-Z][a-z]*"' apps/api/src/modules/ --include="*.ts" | grep executeRaw | grep -v spec

   # Cascade on financial models (should be 0)
   grep -n 'onDelete: Cascade' apps/api/prisma/schema.prisma | grep -i 'coin\|balance\|payment\|fund\|treasury\|order\|membership\|subscription\|premium'

   # Inline body types (should be 0)
   grep -rn "@Body('" apps/api/src/modules/ --include="*.controller.ts"

   # Missing visibility filters on findUnique (should be reviewed)
   grep -rn 'findUnique' apps/api/src/modules/ --include="*.service.ts" | grep -v spec | wc -l
   ```

6. Re-read `MASTER_FINDINGS.md` line by line. For each finding, confirm: fixed, tested, or documented as deferred.
7. Write `docs/audit/2026-03-30-full-audit/REMEDIATION_REPORT.md`:
   ```
   # Remediation Report

   ## Summary
   - Findings from audit: 721
   - Fixed in this session: [N]
   - New findings from deferred waves: [N]
   - Fixed inline: [N]
   - Deferred (with reason): [N]
   - Tests added: [N]
   - Commits: [N]

   ## By Systemic Pattern
   | Pattern | Instances Fixed | Test Count |

   ## By Phase
   | Phase | Findings Fixed | Tests Added |

   ## Deferred Items
   | Finding | Reason | Effort | Blocked On |

   ## Regression Check
   - Previous session test count: [N]
   - Current test count: [N]
   - Any previously passing tests now failing: [yes/no, list]
   ```

---

## CONTEXT MANAGEMENT

721 findings across 300K LOC will NOT fit in one session. Plan for 3-4 sessions:

- **Session A:** Phase 1 (systemic fixes) + Phase 2 (Critical/High). This resolves ~280 findings and all production-breaking bugs.
- **Session B:** Phase 3 (Medium fixes, modules 1-10). ~120 findings.
- **Session C:** Phase 3 (remaining modules) + Phase 4 (Low) + Phase 5 (Info). ~300 findings.
- **Session D:** Phase 6 (deferred wave inline) + Phase 7 (verification).

At the start of each continuation session:
1. Read this prompt again
2. Read `MASTER_FINDINGS.md`
3. Read the previous session's commit log to know what's done
4. Continue from where the last session stopped
5. Update progress tally

---

## ANTI-PATTERNS — DO NOT DO THESE

| Anti-pattern | Why it's wrong | What to do instead |
|-------------|----------------|-------------------|
| Fix 53 Criticals, skip 161 Lows | Lows compound into future Criticals | Fix ALL 721 |
| Batch 20 fixes, test once at end | Can't tell which fix broke what | Test after each fix |
| Use `@ts-ignore` to silence a type error | Hides the real bug | Fix the actual type |
| Delete dead code without verifying | Something might import it dynamically | Grep first, then delete |
| Skip test for "obvious" fix | "Obvious" fixes introduce subtle regressions | Test everything |
| Fix the finding but not the pattern | Same bug exists in 5 other files | Grep for the pattern |
| Use subagents to write fix code | They produce buggy, shallow work | Fix directly in main session |
| Commit 50 fixes with message "audit fixes" | Can't bisect regressions | Descriptive commits, 5-15 fixes each |
| Say "done" without running tests | CLAUDE.md rule: never say done without test output | Show test output |
| Say "and similar changes for the rest" | Do all 10 or list what remains | Complete or be explicit |

---

## FINAL NOTE

The audit found 721 problems. That number will decrease as systemic fixes cascade (S1 alone resolves ~7 findings, S4 resolves ~45). After dedup from systemic fixes, expect ~450-500 individual fix actions.

Every one of those 500 fixes makes the app more trustworthy, more secure, and more professional. There is no shortcut. There is no "good enough." The user competing against WhatsApp, Telegram, and Instagram doesn't get to ship with 161 known Low-priority bugs.

Fix all 721. Test all 721. Ship zero known bugs.
