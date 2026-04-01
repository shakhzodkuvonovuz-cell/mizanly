# FIX SESSION — Round 3 Tab 2: Architecture (Wave 11: L01-L06)

> 242 findings. Dead code removal, circular dependencies, event-driven extraction, god-service decomposition.

---

## ANTI-FAILURE RULES (learned from Round 2 agent failures)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every fix at the code level. Previous agents were caught: writing TODO comments as "FIXED", inflating fix counts by 20, silently skipping 50% of findings, and writing zero tests. You will be caught too if you cheat.

### RULE 1: TOTAL ACCOUNTING
Progress file lists every finding by ID. FIXED + DEFERRED + DISPUTED + INFO_ACKNOWLEDGED = TOTAL_IN_FILE. The auditor counts. If L01 has 90 findings, all 90 appear.

### RULE 2: TESTS MANDATORY — minimum 15
Dead code removal doesn't need tests. But every behavioral change (circular dep fix, service extraction, event bus wiring) needs a test proving the new code works. Minimum 15 meaningful tests.

### RULE 3: "FIXED" = code changed + verified
### RULE 4: Pattern completion — grep entire scope
### RULE 5: No inflated counts
### RULE 6: Deferred needs a reason
### RULE 7: Read before edit
### RULE 8: Checkpoint = tests + tsc + commit

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read ALL 6 audit files IN FULL:
   - `docs/audit/v2/wave11/L01.md` (90 findings — Dead Code)
   - `docs/audit/v2/wave11/L02.md` (20 findings — Circular Dependencies)
   - `docs/audit/v2/wave11/L03.md` (read to understand scope)
   - `docs/audit/v2/wave11/L04.md` (read to understand scope)
   - `docs/audit/v2/wave11/L05.md` (read to understand scope)
   - `docs/audit/v2/wave11/L06.md` (read to understand scope)
4. Create: `docs/audit/v2/fixes/R3_TAB2_PROGRESS.md`

---

## YOUR SCOPE

```
apps/api/src/ — ALL backend TypeScript files for dead code removal
apps/mobile/src/services/ — dead API client files
apps/mobile/src/hooks/ — dead hooks
apps/mobile/src/components/ — dead components (coordinate with Tab 3)
```

**FORBIDDEN:**
- `schema.prisma` (Tab 4)
- `.github/workflows/`, `Dockerfile`, `railway.json` (Tab 1)
- `apps/e2e-server/`, `apps/livekit-server/` Go source (Tab 1 if infra, already done in R2)
- Don't delete files that Tab 3 (components) needs to fix — coordinate via progress file

**CRITICAL RULE FOR DEAD CODE:**
Before deleting ANYTHING, grep the ENTIRE codebase for imports/references:
```bash
grep -rn "import.*DeadThing\|require.*DeadThing\|from.*dead-thing" apps/ --include="*.ts" --include="*.tsx" | grep -v spec | grep -v node_modules
```
If zero results: safe to delete. If any results: NOT dead code — the audit was wrong, mark as DISPUTED.

---

## KEY FINDINGS

### L01 — Dead Code (~90 findings)
- ~5,400 lines of dead code across 75+ items
- 13 dead components in mobile
- 9 dead hooks in mobile
- 12 dead API client files in mobile (668 lines)
- Feature flags + A/B testing systems built but never used (~500 lines)
- RTL utility file (193 lines) completely dead despite 3 RTL languages
- 6 dead queue processors (no producer)
- Dead webhook types, dead notification types
- 3 legal compliance TODOs (CSAM/NCMEC, terrorism/GIFCT, AU eSafety) — document, don't delete

### L02 — Circular Dependencies (~20 findings)
- NotificationsService is a god-dependency (21 services inject it, 39 synchronous calls)
- QueueModule <-> NotificationsModule real circular dependency masked by @Global + @Optional
- Fix approach: identify the worst circles and break them. Don't refactor the entire DI graph — that's a multi-session project. Focus on breaking the ones that cause runtime issues.

### L03-L06 — Remaining architecture findings
Read these files to understand scope. Many will be DEFERRED (architecture refactors too large for a fix session). Document each one clearly.

---

## FIX ORDER
1. **Dead API client files** — highest confidence (grep confirms zero imports)
2. **Dead components + hooks** — same verification
3. **Dead queue processors** — verify no producer enqueues them, then mark as dead or wire up
4. **Feature flags/A/B testing dead code** — verify never called
5. **Circular dependency breaks** — the QueueModule <-> NotificationsModule cycle
6. **L03-L06 documentation** — account for every finding, defer what's too large

---

## DEAD CODE DELETION PROTOCOL

For EVERY item you delete:
1. **Grep** for all references (imports, calls, type references)
2. **Document** in progress file: "Grep: 0 references found. Safe to delete."
3. **Delete** the file or code block
4. **Run tsc** — if compilation fails, something referenced it. Undo and investigate.
5. **Run tests** — if tests fail, something tested it. Remove the dead tests too.

Do NOT delete in bulk. Delete one item at a time, run tsc after each, and commit in batches of 10-15 deletions.

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test
cd apps/api && npx tsc --noEmit
cd apps/mobile && npx tsc --noEmit
```

---

## DELIVERABLES
- 242/242 findings documented
- ~3,000-5,000 lines of dead code removed
- Circular dependency for Queue/Notifications broken or documented
- 15+ tests for behavioral changes
- Every deletion verified by grep + tsc

**242 findings. 242 documented. Delete with confidence, not hope. Begin.**
