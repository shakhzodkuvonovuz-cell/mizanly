# FIX SESSION — Round 3 Tab 1: Infrastructure (Wave 10: K01-K05)

> 135 findings. CI pipeline, environment/secrets, cron jobs, queue processing, Docker/deployment.

---

## ANTI-FAILURE RULES (learned from Round 2 agent failures)

These rules exist because previous agents cheated. You will not.

### RULE 0: YOU ARE BEING AUDITED
After you finish, a hostile auditor will read EVERY file you touched, verify EVERY claimed fix at the code level, count your tests, and check your accounting. The auditor has caught: TODO comments marked as "FIXED", inflated fix counts, zero tests, 50% silent skips, and fake pagination fixes that missed methods in the same file. Assume every claim you make will be verified.

### RULE 1: TOTAL ACCOUNTING — no silent skips
Your progress file MUST list every single finding by ID with a status. At the end, the equation MUST balance:
```
FIXED + DEFERRED + DISPUTED + OUT_OF_SCOPE = TOTAL_IN_FILE
```
If K01 has 30 findings, you list all 30. If you fixed 15 and deferred 15, both columns sum to 30. The auditor will count.

### RULE 2: TESTS ARE MANDATORY — enforced by count
Minimum 20 new tests. If you finish with fewer than 20, you are not done. The auditor will count test functions in your diff. `expect(result).toBeDefined()` does not count as a test — every test must assert specific behavior.

### RULE 3: "FIXED" MEANS CODE CHANGED + TEST PASSES
If you write "FIXED" next to a finding, there MUST be:
1. A before/after code diff in your progress file
2. A passing test (existing or new) that covers the code path
A TODO comment is not a fix. A log statement is not a fix. A code comment is not a fix.

### RULE 4: PATTERN COMPLETION
When you fix a pattern (e.g., wrong table name in raw SQL), grep your ENTIRE scope for the same pattern and fix ALL instances. The auditor found agents who fixed 4/5 identical bugs in the same file. Fix 5/5 or explain why the 5th is different.

### RULE 5: NO INFLATED COUNTS
Your summary says "X fixed". Your fix log lists Y items as FIXED. X must equal Y. The auditor caught an agent claiming 145 when the table summed to 125.

### RULE 6: DEFERRED NEEDS A REASON
Every DEFERRED item needs: finding ID, one-line reason, and which future session handles it. "Low priority" is acceptable. Silence is not.

### RULE 7: READ BEFORE EDIT
For every fix: Read tool first, then Edit tool. If you edit without reading, you're guessing. Guessing creates bugs.

### RULE 8: CHECKPOINT = TESTS + TSC + COMMIT
Every checkpoint: run tests, run tsc --noEmit, commit. No batching 50 fixes into one commit.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read ALL 5 audit files IN FULL:
   - `docs/audit/v2/wave10/K01.md` (30 findings — CI Pipeline)
   - `docs/audit/v2/wave10/K02.md` (24 findings — Environment & Secrets)
   - `docs/audit/v2/wave10/K03.md` (35 findings — Cron Jobs & Schedulers)
   - `docs/audit/v2/wave10/K04.md` (24 findings — Queue Processing)
   - `docs/audit/v2/wave10/K05.md` (21 findings — Docker & Deployment)
4. Create: `docs/audit/v2/fixes/R3_TAB1_PROGRESS.md`

---

## YOUR SCOPE

```
.github/workflows/              (CI pipeline)
apps/api/src/main.ts            (env validation)
apps/api/src/app.module.ts      (ConfigModule)
apps/api/src/config/             (all config files)
apps/api/src/common/queue/       (queue processing — NOT counter-reconciliation, already fixed)
apps/api/src/modules/*/cron      (any cron-related code)
apps/api/railway.json            (deployment)
apps/e2e-server/Dockerfile       (already partially fixed in R2 Tab 3 — verify, don't duplicate)
apps/livekit-server/Dockerfile   (already partially fixed in R2 Tab 3 — verify, don't duplicate)
docker-compose.yml
.env.example (if exists)
```

**FORBIDDEN:**
- Service business logic (other tabs handled those)
- `schema.prisma` (Tab 4 handles schema)
- `apps/mobile/` source code (Tab 3 handles components)
- Any file another R3 tab owns

**ALREADY FIXED — verify, don't re-fix:**
- K03 counter-reconciliation SQL table names (R2 Tab 4 fixed ALL 34 queries)
- Dockerfiles non-root user + Go version (R2 Tab 3 fixed both)

---

## KEY FINDINGS BY SEVERITY

### K01 — CI Pipeline (30 findings)
**Criticals:** Signal tests (633) not in CI, LiveKit Go tests (123+) not in CI, mobile tsc not in CI
**Highs:** No ESLint, no Prettier, no coverage thresholds, no Docker build, no security scanning, build-mobile is a no-op, no timeouts, no concurrency group

### K02 — Environment & Secrets (24 findings)
**Criticals:** Production secrets in single .env file, missing INTERNAL_SERVICE_KEY, missing INTERNAL_WEBHOOK_SECRET, validateEnv() only requires 2 of ~30 env vars
**Highs:** ConfigModule.forRoot() has no validation schema, mobile .env points to production API with test Clerk key

### K03 — Cron Jobs (35 findings)
**Criticals:** 26 of 27 cron jobs have zero distributed locks (only publishScheduledMessages has Redis NX lock)
**Counter-reconciliation SQL: ALREADY FIXED in R2 Tab 4 — verify and mark as ALREADY FIXED**

### K04 — Queue Processing (24 findings)
**Criticals:** 6 of 12 job types are dead code (no producer), webhook secret stored in Redis job payload
**Note:** DLQ webhook secret stripping already fixed by orchestrator — verify

### K05 — Docker & Deployment (21 findings)
**Criticals:** `prisma db push --accept-data-loss` in railway.json production build, uses `npm install` not `npm ci`
**Dockerfiles: Partially fixed in R2 Tab 3 — verify non-root, Go version, then fix remaining**

---

## FIX ORDER
1. K05 criticals: railway.json `--accept-data-loss` (production data loss risk)
2. K02 criticals: env validation (app starts with missing secrets)
3. K03 criticals: distributed locks on cron jobs
4. K01: CI pipeline (add missing test suites, ESLint, timeouts)
5. K04: dead queue producers, cleanup
6. Remaining M/L/I with accounting

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test               # API tests
cd apps/api && npx tsc --noEmit        # TypeScript check
cd apps/e2e-server && go build ./cmd/server/   # Go build check
cd apps/livekit-server && go build ./cmd/server/ # Go build check
```

---

## DELIVERABLES
- 135/135 findings documented (FIXED/DEFERRED/ALREADY_FIXED)
- 20+ new tests (cron lock tests, env validation tests, queue tests)
- railway.json safe deployment
- CI pipeline with all test suites
- Env validation covering all required vars
- Cron distributed locks
- Progress file with before/after diffs

**135 findings. 135 documented. 20+ tests. Zero silent skips. Begin.**
