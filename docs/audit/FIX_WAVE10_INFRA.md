# INFRASTRUCTURE FIX SESSION — Wave 10: CI, Env, Crons, Queues, Docker (K01-K05)

> 169 findings across 5 audit files. K01 (30): CI pipeline. K02 (27): environment & secrets. K03 (62): cron jobs & schedulers. K04 (27): queue processing. K05 (23): Docker & deployment.
> **YOUR JOB: Read K01-K05. Fix every finding. This is a SINGLE-AGENT session — all 5 files are interconnected.**

---

## WHY THIS IS ONE AGENT, NOT FOUR

1. K01 (CI) and K05 (Docker) both modify Go version alignment — must be consistent
2. K01 (CI env vars) references K02 (secrets) — same configuration surface
3. K03 (crons) and K04 (queues) share processor files — overlapping code
4. K05 (Docker) and K01 (CI) both reference `.github/workflows/ci.yml`
5. Total is ~123 real gaps — manageable in one focused session

---

## RULES — NON-NEGOTIABLE

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every fix. Previous agents across 24 sessions: invented "REMAINING" categories (63 hidden items), inflated FIXED by 26, wrote TODO comments as "FIXED", deferred 47% while claiming 10%. The auditor for this round will `git diff` every claimed fix, run CI locally, and `docker build` to verify.

### RULE 1: TOTAL ACCOUNTING
`FIXED + DEFERRED + NOT_A_BUG + ALREADY_FIXED = TOTAL`. K01=30, K02=27, K03=62, K04=27, K05=23. All 169 documented. No silent skips.

### RULE 2: DEFERRAL CAP — 15% (max 25)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER. "Low priority" is NOT valid. If fixable in under 5 minutes, fix it.

### RULE 3: FIX ALL SEVERITIES
K01-K05 have 15 Criticals. Fix them ALL first. Then Highs. Then Mediums. Lows and Infos are mandatory too.

### RULE 4: "FIXED" = CODE/CONFIG CHANGED
Not a TODO. Not a comment saying "should be changed." The file must be different.

### RULE 5: TEST YOUR CHANGES
- After CI changes: verify the YAML is valid (`npx yaml-lint .github/workflows/ci.yml` or similar)
- After cron fixes: run `cd apps/api && npx jest --testPathPattern=<module>` to verify affected tests still pass
- After Docker changes: `cd apps/e2e-server && docker build .` and `cd apps/livekit-server && docker build .`
- After Go changes: `cd apps/e2e-server && go build ./cmd/server/` and `cd apps/livekit-server && go build ./cmd/server/`
- After queue changes: `cd apps/api && npx jest --testPathPattern=queue`

### RULE 6: CHECKPOINT PROTOCOL
Commit after each K-file. Format: `fix(infra): W10 CP[N] — K[file] [summary]`. No mega-commits.

### RULE 7: NO SUBAGENTS. NO CO-AUTHORED-BY.

### RULE 8: SELF-AUDIT + HONESTY PASS
Before writing "COMPLETE": recount per-K-file statuses. Verify equation balances. Check every FIXED claim has a real diff.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Build & Test commands and Standing Rules
2. Read ALL FIVE audit files IN FULL — every row, every severity:
   - `docs/audit/v2/wave10/K01.md` (30 findings — CI pipeline)
   - `docs/audit/v2/wave10/K02.md` (27 findings — env & secrets)
   - `docs/audit/v2/wave10/K03.md` (62 findings — cron jobs)
   - `docs/audit/v2/wave10/K04.md` (27 findings — queue processing)
   - `docs/audit/v2/wave10/K05.md` (23 findings — Docker & deployment)
3. Read the actual files you'll be modifying:
   - `.github/workflows/ci.yml` — the CI pipeline (one file, all K01 changes)
   - `apps/api/.env.example` — template for env vars
   - `apps/api/src/main.ts` — startup validation
   - `apps/api/src/common/queue/` — all processor + service files
   - `apps/e2e-server/Dockerfile` and `apps/livekit-server/Dockerfile`
   - `docker-compose.yml`
   - All cron-bearing service files (9 files listed in K03)
4. Create: `docs/audit/v2/fixes/W10_PROGRESS.md`

---

## WORK ORDER — by K-file, ordered by dependency

### Phase 1: K05 Docker (23 findings) — fix first, fewest dependencies
Priority fixes:
- **#1 (C):** Replace `prisma db push --accept-data-loss` with `prisma migrate deploy` in `apps/api/railway.json`
- **#2-3 (C):** Add non-root USER to both Go Dockerfiles
- **#4 (H):** Align Go version `golang:1.25-alpine` across both Dockerfiles + CI
- **#5 (H):** Add livekit-server CI job (overlap with K01)
- **#6-7 (H):** Pin Docker base images to digest
- **#8 (H):** Create `.dockerignore` for e2e-server
- **#10 (M):** Add HEALTHCHECK to both Dockerfiles
- **#11 (M):** `npm install` → `npm ci` in railway.json
- **#13-14 (M):** docker-compose: env vars for creds, localhost-bind ports
- **#16 (M):** Strip Go binaries with `-ldflags="-s -w"`
- Commit: `fix(infra): W10 CP1 — K05 Docker/deployment [N fixes]`

### Phase 2: K01 CI Pipeline (30 findings)
Priority fixes:
- **#1 (C):** Add livekit-server Go test job to CI
- **#2 (C):** Add Signal Protocol test job (633 tests)
- **#3 (C):** Add LiveKit/CallKit mobile test job (49 tests)
- **#4-5 (H):** Add ESLint + Prettier steps
- **#6 (H):** Add shared package typecheck
- **#7 (H):** Add `timeout-minutes: 15` to all jobs
- **#8 (H):** Add `concurrency` group for cancel-in-progress
- **#9 (H):** Remove or fix the no-op `build-mobile` job
- **#10 (H):** Remove `develop` branch from triggers
- **#11 (H):** Align Go versions (already done in K05)
- **#12 (M):** Add `permissions: { contents: read }`
- **#15 (M):** Remove `--passWithNoTests`
- **#17 (M):** Add `npm audit --audit-level=high` step
- **#19 (M):** Add `CLERK_SECRET_KEY` to integration job env
- **#20 (M):** Fix integration test dependency chain
- Commit: `fix(infra): W10 CP2 — K01 CI pipeline [N fixes]`

### Phase 3: K02 Env & Secrets (27 findings)
Priority fixes:
- **#1-6 (C):** These are about real secrets in .env — you CANNOT fix this (secrets are in the user's local file, not committed). DEFER with note: "Local .env not in git — user action required: rotate keys, move to secrets manager."
- **#7 (C):** Add `google-services.json` to `.gitignore` (it's already committed — note that BFG rewrite needed for history)
- **#8 (H):** Add 6 missing env vars to `.env.example`
- **#10 (H):** Create `.env.example` for both Go services
- **#11-12 (H):** Add Joi validation schema to ConfigModule, promote critical vars to required in production
- **#13 (H):** Fix mobile `.env.example` to use localhost for dev
- **#16 (M):** Migrate `EXPO_ACCESS_TOKEN` from `process.env` to ConfigService
- **#18 (M):** Remove dead TURN credentials
- **#20 (M):** Add `.env.test`, `.env.staging`, `.env.production` to `.gitignore`
- **#22 (L):** Add production check for TOTP encryption key
- **#27 (I):** Add startup check for test keys in production
- Commit: `fix(infra): W10 CP3 — K02 env/secrets [N fixes]`

### Phase 4: K03 Cron Jobs (62 findings) — biggest file
The DOMINANT pattern: **no distributed lock on crons** (findings #6-21). Fix them all with ONE utility:

```typescript
// Shared utility: acquireCronLock(redis, lockKey, ttlSeconds)
async function acquireCronLock(redis: Redis, key: string, ttl: number): Promise<boolean> {
  const result = await redis.set(key, '1', 'EX', ttl, 'NX');
  return result === 'OK';
}
```

Then add to each cron:
```typescript
@Cron('0 2 * * *')
async snapshotFollowerCounts() {
  if (!await acquireCronLock(this.redis, 'cron:snapshotFollowerCounts', 3500)) return;
  // ... existing logic
}
```

Priority fixes:
- **#1-5 (C):** Fix wrong table names in counter-reconciliation raw SQL (`"Post"` → `"posts"`, etc.)
- **#6-7 (H):** Add Redis NX lock to `publishOverdueContent` and `processExpiredMessages`
- **#8 (H):** Remove duplicate `notifyScheduledPostsPublished` or deduplicate with scheduling.service
- **#9-21 (M):** Add Redis NX locks to ALL remaining crons (13 methods)
- **#10 (M):** Replace `Math.random()` with `crypto.randomInt()` in verse selection
- **#14 (M):** Fix week ID calculation
- **#16 (M):** Fix `checkIslamicEventReminders` to use `NX` flag on Redis set
- **#22-29 (L):** Batch caps, fetch timeouts, error logging, table name bugs
- Commit: `fix(infra): W10 CP4 — K03 cron distributed locks + SQL fixes [N fixes]`

### Phase 5: K04 Queue Processing (27 findings)
Priority fixes:
- **#1 (C):** Remove webhook secret from job payload — sign at enqueue time
- **#2 (C):** Fix DLQ double-await bug (Sentry fallback is dead code)
- **#3-6 (H):** Document dead producers (media, bulk-push, track-engagement, generate-caption) — these are NOT fixable without wiring up the entire pipeline, so DEFER with clear blocker
- **#9 (M):** Add `worker.on('error')` handler to all 6 processors
- **#10 (M):** Merge duplicate `on('completed')` handlers
- **#11 (M):** Fix Sentry to only fire on final attempt failure
- **#15 (M):** Configure `maxStalledCount` / `stalledInterval` per processor
- **#16-17 (M):** Add job deduplication for push notifications and webhooks
- **#23 (L):** Add `worker.on('stalled')` handler
- Commit: `fix(infra): W10 CP5 — K04 queue processing [N fixes]`

---

## CRITICAL NOTES — READ CAREFULLY

### DO NOT touch `.env` files directly
Findings K02 #1-6 are about secrets in the user's local `.env`. These files are gitignored. You fix `.env.example`, `main.ts` validation, and `.gitignore` — NOT the actual `.env` file.

### DO NOT break existing tests
Run `cd apps/api && npx jest` before and after your changes. The current count is **345 suites, 6,651 tests, 0 failures**. If your changes break any test, fix it before committing.

### Counter-reconciliation SQL (K03 #1-5) is the most impactful Critical
These 5 findings mean ALL counter reconciliation has been silently failing in production. Wrong table names (`"Post"` instead of `"posts"`) cause `relation does not exist` errors. Fix ALL raw SQL in `counter-reconciliation.service.ts` — grep for `"Post"`, `"Reel"`, `"Thread"`, `"Video"`, `"Hashtag"` in UPDATE/JOIN statements and replace with mapped table names (`"posts"`, `"reels"`, `"threads"`, `"videos"`, `"hashtags"`).

### The distributed lock pattern (K03 #6-21) is ONE utility applied 16 times
Don't write 16 different locking mechanisms. Create a shared `acquireCronLock` utility in `apps/api/src/common/utils/cron-lock.ts` (or inline in each service), then apply it to all 16 cron methods identified in findings #6-21.

### Prisma migrate deploy (K05 #1) requires an initial migration
If no `prisma/migrations/` directory exists, you need to create it: `npx prisma migrate dev --name init`. Then change the railway.json build command to use `prisma migrate deploy`. HOWEVER: if migrations don't exist yet, this is a DEFERRED item — the user needs to run `prisma migrate dev` locally first. Check if `apps/api/prisma/migrations/` exists before making this change.

---

## TEST COMMANDS
```bash
# API tests (must stay green)
cd apps/api && npx jest

# Go builds (must compile)
cd apps/e2e-server && go build ./cmd/server/
cd apps/livekit-server && go build ./cmd/server/

# Docker builds (must succeed)
cd apps/e2e-server && docker build -t test-e2e .
cd apps/livekit-server && docker build -t test-livekit .

# Go tests
cd apps/e2e-server && go test ./internal/... -v
cd apps/livekit-server && go test ./internal/... -v

# CI YAML validation
npx yaml-lint .github/workflows/ci.yml 2>/dev/null || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

---

## DELIVERABLES

- **169/169 findings documented** with status
- **Max 25 deferred** (15% cap) — each with specific blocker
- **5 atomic commits** (one per K-file)
- **All API tests still green** (345 suites, 6,651 tests)
- **Both Go services compile**
- **Both Dockerfiles build**
- **CI YAML valid**
- **Progress file** with per-finding tables, summary, self-audit

**169 findings. 15 Criticals. Fix the SQL table names first — they're silently failing in production right now. Then lock the crons. Then harden CI. Begin.**
