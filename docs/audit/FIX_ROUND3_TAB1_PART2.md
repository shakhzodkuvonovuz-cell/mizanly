# FIX SESSION — Round 3 Tab 1 Part 2: Infrastructure Lazy Deferrals

> A hostile auditor reviewed R3-Tab1 and found **18 lazy deferrals** — items marked DEFERRED that could have been fixed in 5 minutes each. This session fixes ALL 18. No exceptions. No new deferrals.

---

## CONTEXT: WHAT HAPPENED

R3-Tab1 completed 134 findings with 59 FIXED, 12 ALREADY FIXED, and 63 DEFERRED.

The auditor confirmed: every FIXED item has real code behind it. The cron locks work. The queue handlers are wired. Good.

But **47% was deferred**. The auditor classified 18 of those as LAZY — they were punted with excuses like "process, not code", "design decision needed", "documentation task", and "needs SHA256 lookup". Every single one is a 1-30 minute code edit.

**Your job: fix all 18. Write tests for what's testable. Zero new deferrals.**

---

## RULE: ZERO NEW DEFERRALS

This prompt contains 18 items. You will complete 18 items. The only acceptable statuses are:

- **FIXED** — code changed, verified
- **DISPUTED** — you can prove the auditor is wrong (with evidence, not opinion)

"DEFERRED" is not available. If you write DEFERRED on any item, the session fails. If you cannot fix something, you must explain exactly what blocks you (not "it's complex" — the specific technical blocker) and the auditor will decide.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/v2/fixes/R3_TAB1_PROGRESS.md` (the previous session's work)
4. Read this entire prompt before writing any code

---

## THE 18 FIXES

Each fix has: the problem, the file, the exact change, and the verification command. You are not designing anything. You are executing prescribed changes.

---

### FIX 1: google-services.json — stop tracking, add to .gitignore
**Severity:** CRITICAL  
**Previous excuse:** "needs BFG rewrite"  
**Reality:** BFG is for history. Stopping future tracking is 2 commands.

**Steps:**
1. Add `google-services.json` to `apps/mobile/.gitignore`
2. Run: `cd apps/mobile && git rm --cached google-services.json` (removes from index, keeps local file)
3. Verify: `git status` shows the file as deleted from tracking

**Verification:**
```bash
git ls-files apps/mobile/google-services.json  # Must return empty
grep "google-services.json" apps/mobile/.gitignore  # Must find it
```

---

### FIX 2: Add missing vars to apps/api/.env.example
**Severity:** HIGH (K02-8)  
**Previous excuse:** "process, not code"  
**Reality:** Editing .env.example IS a code change. It's a file in the repo.

**Steps:**
1. Read `apps/api/.env.example`
2. Read `apps/api/.env` to see what vars exist
3. Add these missing vars with placeholder values:
```env
# Inter-service communication (Go → NestJS)
INTERNAL_SERVICE_KEY=generate-a-random-secret-here
INTERNAL_WEBHOOK_SECRET=generate-a-random-secret-here
NESTJS_INTERNAL_URL=http://localhost:3000
NESTJS_BASE_URL=http://localhost:3000

# E2E Encryption transparency
TRANSPARENCY_SIGNING_KEY=generate-ed25519-key-here

# Cloudflare
CF_IMAGE_RESIZING_ENABLED=false
```

**Verification:**
```bash
grep "INTERNAL_SERVICE_KEY" apps/api/.env.example
grep "TRANSPARENCY_SIGNING_KEY" apps/api/.env.example
```

---

### FIX 3: Create apps/e2e-server/.env.example
**Severity:** HIGH (K02-10)  
**Previous excuse:** "documentation task"  
**Reality:** It's a file. Create it.

**Steps:**
1. Read all `os.Getenv()` calls in `apps/e2e-server/` Go source to find required vars
2. Create `apps/e2e-server/.env.example` listing every env var with descriptions

**The file should look like:**
```env
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/mizanly_e2e

# Server
PORT=8080
ENVIRONMENT=development

# Auth (NestJS service key for inter-service calls)
INTERNAL_WEBHOOK_SECRET=your-webhook-secret

# Transparency (Ed25519 signing key for Merkle root)
TRANSPARENCY_SIGNING_KEY=your-ed25519-private-key-hex

# Rate limiting
REDIS_URL=redis://localhost:6379
```

Grep the Go source to find the EXACT var names. Don't guess.

**Verification:**
```bash
test -f apps/e2e-server/.env.example && echo "EXISTS" || echo "MISSING"
```

---

### FIX 4: Create apps/livekit-server/.env.example
**Severity:** HIGH (K02-10)  
**Previous excuse:** "documentation task"  

Same as Fix 3 but for livekit-server. Grep `os.Getenv` in `apps/livekit-server/` to find all vars.

**Verification:**
```bash
test -f apps/livekit-server/.env.example && echo "EXISTS" || echo "MISSING"
```

---

### FIX 5: Sync apps/mobile/.env.example
**Severity:** MEDIUM (K02-14 + K02-15)  
**Previous excuse:** "sync task"  

**Steps:**
1. Read `apps/mobile/.env.example`
2. Read `apps/mobile/.env`
3. Grep `process.env.EXPO_PUBLIC_` and `Constants.expoConfig?.extra` in mobile source to find all referenced vars
4. Add missing vars to `.env.example` with placeholder values. At minimum add:
   - `EXPO_PUBLIC_GIPHY_API_KEY=your-giphy-api-key`
   - `EXPO_PUBLIC_LIVEKIT_URL=https://your-livekit-cloud-url`
   - `EXPO_PUBLIC_LIVEKIT_WS_URL=wss://your-livekit-cloud-url`
   - Any other vars found in step 3 that are missing

**Verification:**
```bash
grep "GIPHY" apps/mobile/.env.example
grep "LIVEKIT" apps/mobile/.env.example
```

---

### FIX 6: Delete dead TURN credentials from .env
**Severity:** MEDIUM (K02-18)  
**Previous excuse:** "manual cleanup"  
**Reality:** You CAN edit .env. It's a local file. Delete the 3 TURN lines.

**Steps:**
1. Read `apps/api/.env`
2. Delete these lines (or similar TURN-related lines):
   - `TURN_USERNAME=...`
   - `TURN_CREDENTIAL=...`
   - `TURN_URL=...` (if exists)

**Note:** .env is gitignored so this won't appear in a commit. But it cleans up the local state. If .env cannot be edited by the tool (permissions), create a note in the progress file marking this as "REQUIRES MANUAL ACTION: delete TURN lines from .env" and explain why.

---

### FIX 7: Add Prettier check to CI
**Severity:** HIGH (K01-5)  
**Previous excuse:** "low priority"  
**Reality:** The script already exists. Add one step to CI.

**Steps:**
1. Read `.github/workflows/ci.yml`
2. In the `lint-and-typecheck` job, add a step after typecheck:
```yaml
    - name: Format check
      run: npm run format:check
```

**Verification:**
```bash
grep "format:check" .github/workflows/ci.yml
```

---

### FIX 8: Fix ESLint flat configs so they're not empty shells
**Severity:** HIGH (K01-4 + K01-24)  
**Previous excuse:** "existing flat configs have rules: {}, need K24 fix first"  
**Reality:** K24 IS the fix. The empty rules: {} IS the problem. Fix it now.

**Steps:**
1. Read `apps/api/eslint.config.mjs`
2. Read `apps/mobile/eslint.config.mjs`
3. Read root `.eslintrc.json` to see what rules exist
4. Either:
   - **Option A:** Delete the app-level flat configs so the root `.eslintrc.json` applies (simplest), OR
   - **Option B:** Populate the flat configs with the same rules from root

Pick whichever is less disruptive. If Option A causes ESLint to error because of config conflicts, use Option B.

5. Add ESLint step to CI (in `lint-and-typecheck` job):
```yaml
    - name: Lint
      run: npx eslint . --max-warnings 0
      continue-on-error: true  # Don't block CI yet, just surface issues
```

**Note:** `continue-on-error: true` because the codebase likely has lint violations. This surfaces them without blocking. A future session can make it strict.

**Verification:**
```bash
grep "eslint" .github/workflows/ci.yml
```

---

### FIX 9: Remove --passWithNoTests from CI
**Severity:** MEDIUM (K01-15)  
**Previous excuse:** "integration tests can have 0 matches validly"  
**Reality:** If integration tests match 0, that's a bug you WANT to catch.

**Steps:**
1. Read `.github/workflows/ci.yml`
2. Remove `--passWithNoTests` from the test commands (both unit and integration jobs)

**Exception:** If the integration test job legitimately has no tests in some configurations, add a guard instead:
```yaml
    - name: Run integration tests
      run: |
        TEST_COUNT=$(npx jest --listTests --config jest-integration.config.ts 2>/dev/null | wc -l)
        if [ "$TEST_COUNT" -gt 0 ]; then
          npx jest --config jest-integration.config.ts
        else
          echo "No integration tests found — this is expected if none are configured"
        fi
```

**Verification:**
```bash
grep "passWithNoTests" .github/workflows/ci.yml  # Should return empty
```

---

### FIX 10: Add cron lock to notifyScheduledPostsPublished
**Severity:** BUG (missed by R3-Tab1)  
**Context:** The hostile auditor found this cron has NO lock. It's also likely dead code (scheduling.service already handles notifications and nulls scheduledAt before this cron can find anything).

**Steps:**
1. Read the `notifyScheduledPostsPublished` method in `apps/api/src/modules/posts/posts.service.ts`
2. Read `apps/api/src/modules/scheduling/scheduling.service.ts` to check if `publishOverdueContent` already nulls `scheduledAt` AND sends notifications
3. If `notifyScheduledPostsPublished` IS dead code (scheduling.service already does the same thing):
   - Delete the entire method and its `@Cron()` decorator
   - Remove the cron import if no longer needed
   - Mark as FIXED with reason: "dead code — scheduling.service already handles this"
4. If it's NOT dead code:
   - Add `acquireCronLock` from `apps/api/src/common/utils/cron-lock.ts`

**Verification:**
```bash
grep -n "notifyScheduledPostsPublished" apps/api/src/modules/posts/posts.service.ts
```

---

### FIX 11: Add cron lock to cleanupStaleTokens
**Severity:** BUG (missed by R3-Tab1)  

**Steps:**
1. Find the `cleanupStaleTokens` method (likely in `apps/api/src/modules/devices/devices.service.ts`)
2. Add `acquireCronLock` with appropriate TTL
3. Import the utility if not already imported

**Verification:**
```bash
grep -n "acquireCronLock" apps/api/src/modules/devices/devices.service.ts
```

---

### FIX 12: Delete dead generate-caption case branch
**Severity:** MEDIUM (K04-6)  
**Previous excuse:** "remove or implement later"  
**Reality:** It throws "not implemented" and pollutes DLQ if triggered. Remove it.

**Steps:**
1. Read `apps/api/src/common/queue/ai-tasks.processor.ts`
2. Find the `generate-caption` case branch
3. Delete it entirely (the case, the handler method, and any types associated)
4. If the handler method is referenced by a type, remove from the type too

**Verification:**
```bash
grep -n "generate-caption" apps/api/src/common/queue/ai-tasks.processor.ts  # Should return empty
```

---

### FIX 13: Fix K04-18 — verify 'SYSTEM' is valid (not a bug)
**Severity:** LOW (K04-18)  
**Previous excuse:** "need to verify Prisma enum"  
**Reality:** The auditor found this is NOT a bug — `NotificationType.SYSTEM` exists in the Prisma enum. No `as any` cast exists in the code.

**Steps:**
1. Read `apps/api/src/common/queue/notification.processor.ts` — find the SYSTEM usage
2. Grep for `as any` in that file
3. If there's no `as any` and it uses the Prisma enum properly: mark as NOT_A_BUG in progress file
4. If `as any` IS present: remove it and use the proper enum import

**Verification:**
```bash
grep "as any" apps/api/src/common/queue/notification.processor.ts
grep "SYSTEM" apps/api/src/common/queue/notification.processor.ts
```

---

### FIX 14: Pin Docker base images with SHA256 digest
**Severity:** HIGH (K05-6 + K05-7)  
**Previous excuse:** "needs specific SHA256 lookup"  

**Steps:**
1. Read `apps/e2e-server/Dockerfile` — note the Go version tag (e.g., `golang:1.25-alpine`)
2. Read `apps/livekit-server/Dockerfile` — same
3. Look up the digest. You have internet access. Use it:
```bash
# Run these to get the digests
docker pull golang:1.25-alpine 2>/dev/null && docker inspect --format='{{index .RepoDigests 0}}' golang:1.25-alpine
```
4. If you cannot run docker (no Docker installed), use the approach below:
   - Add a comment with the tag AND a TODO for pinning:
   ```dockerfile
   # Pin to digest on next build: docker pull golang:1.25-alpine && docker inspect --format='{{index .RepoDigests 0}}' golang:1.25-alpine
   FROM golang:1.25-alpine AS builder
   ```
   This is acceptable ONLY if Docker is not available in this environment.

5. Also pin the `alpine` base image in the final stage if used.

**Verification:**
```bash
grep -n "FROM" apps/e2e-server/Dockerfile
grep -n "FROM" apps/livekit-server/Dockerfile
```

---

### FIX 15: Expired story cleanup cron (K03-30)
**Severity:** MEDIUM  
**Previous excuse:** "new feature, not a fix"  
**Reality:** Without cleanup, expired stories remain in DB and R2 forever = storage leak + privacy concern.

**Steps:**
1. Read `apps/api/src/modules/stories/stories.service.ts`
2. Add a daily cron method `cleanupExpiredStories` that:
   - Queries stories where `expiresAt < NOW() - 7 days` (keep 7-day grace period)
   - Deletes them from DB (or marks as isRemoved if that field exists now)
   - Uses `acquireCronLock` with TTL 3500
   - Logs count of cleaned stories
3. This does NOT need to clean R2 media (that's a larger task). Just DB cleanup.

**If `isRemoved` field exists on Story model (Tab 4 may have added it):** set `isRemoved: true` instead of hard delete.
**If `isRemoved` does NOT exist:** use soft-delete with `deletedAt` if available, or hard delete with a WHERE that limits batch size (`take: 500`).

**Verification:**
```bash
grep -n "cleanupExpiredStories" apps/api/src/modules/stories/stories.service.ts
grep -n "acquireCronLock" apps/api/src/modules/stories/stories.service.ts
```

---

### FIX 16: Add ConfigModule Joi validation
**Severity:** HIGH (K02-11)  
**Previous excuse:** "requires schema design decision"  
**Reality:** The decision is: validate every env var the app reads. No design needed.

**Steps:**
1. Read `apps/api/src/app.module.ts` — find ConfigModule.forRoot
2. Read `apps/api/src/main.ts` — find validateEnv to see what vars are already checked
3. Install Joi if not already: check `package.json` for `joi`
4. Add validation schema to ConfigModule:

```typescript
import * as Joi from 'joi';

ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    DATABASE_URL: Joi.string().uri().required(),
    CLERK_SECRET_KEY: Joi.string().required(),
    REDIS_URL: Joi.string().allow('').default(''),
    STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
    STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
    R2_ACCESS_KEY_ID: Joi.string().allow('').default(''),
    R2_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
    R2_BUCKET_NAME: Joi.string().allow('').default(''),
    R2_ENDPOINT: Joi.string().allow('').default(''),
    TOTP_ENCRYPTION_KEY: Joi.string().allow('').default(''),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    PORT: Joi.number().default(3000),
  }),
  validationOptions: {
    allowUnknown: true,  // Don't fail on extra vars
    abortEarly: false,   // Show all errors at once
  },
}),
```

**IMPORTANT:** Use `.allow('').default('')` for optional vars so tests and local dev don't require every var. Only `DATABASE_URL` and `CLERK_SECRET_KEY` are `.required()`. The manual `validateEnv()` in main.ts already handles production-specific requirements — Joi catches format issues.

**Verification:**
```bash
grep "validationSchema" apps/api/src/app.module.ts
cd apps/api && npx tsc --noEmit  # Must pass
cd apps/api && pnpm test  # Must pass — Joi validation shouldn't break tests if defaults are set
```

---

### FIX 17: Verify npm cache claim (K01-13)
**Severity:** MEDIUM  
**Previous excuse:** "already uses setup-node cache: npm"  

**Steps:**
1. Read `.github/workflows/ci.yml`
2. Find ALL `actions/setup-node` usages
3. Verify each has `cache: 'npm'` parameter
4. If yes: mark as VERIFIED (not a deferral — it's genuinely already handled)
5. If no: add `cache: 'npm'` to the ones missing it

**Verification:**
```bash
grep -A2 "setup-node" .github/workflows/ci.yml | grep "cache"
```

---

### FIX 18: Add dev-mode production credential warning
**Severity:** MEDIUM (partial mitigation for K02-1 through K02-6)  
**Previous excuse:** "process change, not code"  
**Reality:** A startup warning IS code.

**Steps:**
1. Read `apps/api/src/main.ts` — find the `validateEnv()` function
2. Add a check: if `NODE_ENV !== 'production'` and `DATABASE_URL` contains `neon.tech` or `amazonaws` or other production indicators:
```typescript
if (process.env.NODE_ENV !== 'production') {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('neon.tech') || dbUrl.includes('amazonaws.com') || dbUrl.includes('.rds.')) {
    console.warn(
      '⚠️  WARNING: Production database credentials detected in development mode.\n' +
      '   Consider using a Neon branch or local PostgreSQL for development.\n' +
      '   See: https://neon.tech/docs/introduction/branching'
    );
  }
}
```

This doesn't block startup — it's a warning. But it makes the risk visible.

**Verification:**
```bash
grep "Production database credentials" apps/api/src/main.ts
```

---

## TESTS

Write tests for:

1. **Joi ConfigModule validation** — test that missing DATABASE_URL fails, missing CLERK_SECRET_KEY fails, unknown vars are allowed
2. **Cron lock on cleanupStaleTokens** — test that lock is acquired before work
3. **Expired story cleanup** — test that stories older than 7 days are cleaned
4. **Dev-mode credential warning** — test that the warning triggers when neon.tech is in DATABASE_URL in dev mode

Minimum: **10 new tests.**

---

## CHECKPOINT PROTOCOL

Batch into 2-3 checkpoints:

**CP1:** Fixes 1-6 (env/gitignore/cleanup) + commit  
**CP2:** Fixes 7-14 (CI + queue + cron bugs) + tests + commit  
**CP3:** Fixes 15-18 (story cleanup + Joi + warning) + tests + commit  

Each checkpoint: `cd apps/api && pnpm test && npx tsc --noEmit`

---

## PROGRESS FILE

Update `docs/audit/v2/fixes/R3_TAB1_PROGRESS.md` — add a new section:

```markdown
## Part 2: Lazy Deferral Fixes (hostile audit remediation)

| # | Finding | Status | Summary |
|---|---------|--------|---------|
| 1 | K02-7 | FIXED | google-services.json untracked + gitignored |
| 2 | K02-8 | FIXED | 6 vars added to .env.example |
| ... | ... | ... | ... |
| 18 | K02-1→6 | FIXED | Dev-mode production credential warning |

New tests: [N]
```

Also fix the K02 summary table — it claims 7 FIXED but only 3 entries are FIXED. Correct the count.

---

## WHAT SUCCESS LOOKS LIKE

- 18/18 items FIXED or DISPUTED-with-evidence
- 0 items DEFERRED
- 10+ new tests, all passing
- `pnpm test` green
- `tsc --noEmit` green
- Progress file updated with accurate counts
- K02 summary count corrected

**18 items. 18 done. No excuses. Begin.**
