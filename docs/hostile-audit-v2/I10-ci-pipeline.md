# I10 - CI Pipeline Audit

**Scope:** `.github/workflows/ci.yml`, job dependencies, `continue-on-error` usage, `|| true` suppression, ESLint/security blocking status, mobile test coverage, Go version correctness, branch protection.

**Date:** 2026-04-05

---

## CRITICAL

### I10-C01: ESLint runs with `continue-on-error: true` -- lint failures silently pass CI
- **File:** `.github/workflows/ci.yml:38-39`
- **What:** `npx eslint . --max-warnings 0` runs with `continue-on-error: true`.
- **Problem:** ESLint violations do NOT block merges. A PR with unused variables, missing type annotations, import cycles, or security lint rules (no-eval, no-implied-eval) will pass CI. The `--max-warnings 0` flag is meaningless when the step can't fail.
- **Impact:** The branch protection doc (`.github/BRANCH_PROTECTION.md`) lists `lint-and-typecheck` as a required status check. Since ESLint failures don't fail the job, the check passes even with lint violations. The entire linting pipeline is cosmetic, not enforcing.
- **Fix:** Remove `continue-on-error: true` from the Lint step. If there are existing lint errors to fix first, fix them -- don't silence the linter.

### I10-C02: `npm audit` runs with `|| true` -- security vulnerabilities silently pass CI
- **File:** `.github/workflows/ci.yml:220`
- **What:** `npm audit --audit-level=high || true`
- **Problem:** The `|| true` means this command ALWAYS succeeds, regardless of how many high/critical vulnerabilities exist. The entire `security` job is decorative -- it will never block a merge.
- **Impact:** Branch protection lists `security` as a required status check. It will always pass. A PR could introduce a dependency with a known RCE vulnerability and CI would report green.
- **Fix:** Remove `|| true`. If the current codebase has audit failures that need time to fix, use `npm audit --audit-level=critical` (only block on critical) rather than silencing everything.

### I10-C03: Format check runs with `continue-on-error: true` -- formatting violations silently pass
- **File:** `.github/workflows/ci.yml:35-36`
- **What:** `npm run format:check` has `continue-on-error: true`.
- **Problem:** Same pattern as ESLint. Formatting inconsistencies don't block merges. Code style drifts over time.
- **Impact:** Low functional risk but indicates a pattern of silencing quality checks rather than fixing violations.
- **Fix:** Remove `continue-on-error: true`.

---

## HIGH

### I10-H01: Mobile services tests (`offlineMessageQueue`) NOT in CI
- **File:** `apps/mobile/src/services/__tests__/jest.config.js` exists but is not referenced in CI.
- **What:** CI runs two mobile test suites: `signal/__tests__/jest.config.js` (633 tests) and `hooks/__tests__/jest.config.js` (49 tests). The third test config at `services/__tests__/jest.config.js` (offline message queue tests) is never executed in CI.
- **Problem:** Offline message queue tests can break without CI catching it. This is the encrypted message queueing system -- critical for E2E reliability.
- **Fix:** Add a step to `test-mobile-signal` job: `npx jest --config apps/mobile/src/services/__tests__/jest.config.js`

### I10-H02: Go server jobs do NOT depend on `lint-and-typecheck` -- they run unconditionally
- **File:** `.github/workflows/ci.yml:140-172, 175-206`
- **What:** The `e2e-server` and `livekit-server` jobs have no `needs:` key. All Node.js jobs depend on `lint-and-typecheck`, but Go jobs run independently.
- **Problem:** Go jobs start immediately on every push/PR, consuming CI minutes even when unrelated TypeScript changes fail typecheck. This is wasteful but not blocking. More importantly, it means Go changes can merge even if TypeScript is broken, which is fine for Go-only changes but breaks the "all green before merge" principle.
- **Observation:** Actually, since branch protection requires ALL jobs to pass, this is only a CI minutes waste issue, not a merge safety issue. Downgrading from what could be critical to high.
- **Fix:** Add `needs: lint-and-typecheck` if you want sequential execution, or leave as-is if parallel execution is preferred (saves wall-clock time at cost of CI minutes on failures).

### I10-H03: No Go linter in CI -- Go code quality is unchecked
- **File:** `.github/workflows/ci.yml:140-206`
- **What:** Go jobs only run `go build` and `go test`. There is no `golangci-lint`, `go vet`, `staticcheck`, or any other Go linter.
- **Problem:** Go code can have race conditions (detectable by `-race`), shadowed variables, unchecked errors, and other issues that compile fine but are bugs. The `go vet` tool catches many of these for free.
- **Fix:** Add `go vet ./...` and consider `golangci-lint run` to both Go jobs.

### I10-H04: No Go race detector in CI tests
- **File:** `.github/workflows/ci.yml:168, 203`
- **What:** `go test -v ./...` runs without `-race` flag.
- **Problem:** Data races in Go are undefined behavior -- they can cause crashes, corrupted data, or security vulnerabilities. The race detector is the standard way to catch them and is free in CI (just slower).
- **Fix:** Change to `go test -v -race ./...` in both Go jobs.

### I10-H05: `JEST_RETRY: 'true'` enables test retries in API tests -- flaky tests pass silently
- **File:** `.github/workflows/ci.yml:79`
- **What:** The `test-api` job sets `JEST_RETRY: 'true'` in its environment.
- **Problem:** If the test harness uses this env var to retry failed tests, flaky tests will intermittently pass. This masks test quality issues and means a test that fails 50% of the time will pass CI most of the time (retry = 75% pass rate for a 50% flake).
- **Note:** I cannot verify what `JEST_RETRY` does without reading the test config, but the name strongly implies retry-on-failure behavior.
- **Fix:** Remove `JEST_RETRY` or add monitoring for test flakiness (e.g., track retry counts).

---

## MEDIUM

### I10-M01: No test coverage reporting or minimum threshold
- **File:** `.github/workflows/ci.yml` (all test jobs)
- **What:** No `--coverage` flag, no coverage upload (Codecov, Coveralls), no minimum coverage gate.
- **Problem:** Test coverage can decrease over time without anyone noticing. New features could be shipped with zero test coverage.
- **Fix:** Add `--coverage` to at least the API test run, upload results, and set a minimum threshold (e.g., 70% for new code).

### I10-M02: Integration tests use `--accept-data-loss --force-reset` on schema push
- **File:** `.github/workflows/ci.yml:121`
- **What:** `npx prisma db push --skip-generate --accept-data-loss --force-reset`
- **Problem:** This is correct for CI (fresh database for each run), but the flags `--accept-data-loss --force-reset` in a CI script that someone might copy to production would be catastrophic. Should have a comment warning this is CI-only.
- **Impact:** Low (CI-only), but worth noting.

### I10-M03: No caching for Go module downloads
- **File:** `.github/workflows/ci.yml:161-163, 196-198`
- **What:** `actions/setup-go@v5` with `cache-dependency-path` is configured, which does cache Go modules.
- **Status:** GOOD -- Go module caching is properly configured via `cache-dependency-path`. No finding here.

### I10-M04: CI uses `npm ci --legacy-peer-deps` everywhere -- peer dependency conflicts hidden
- **File:** `.github/workflows/ci.yml:26, 51, 86, 118, 135, 218`
- **What:** Every `npm ci` invocation uses `--legacy-peer-deps`.
- **Problem:** This flag silences peer dependency conflicts. If a package requires React 18 but you have React 19, npm won't warn you. In a 276K LOC codebase with many dependencies, peer dep conflicts can cause subtle runtime bugs that are hard to trace.
- **Note:** This is likely necessary due to React Native ecosystem peer dep chaos, but it should be audited periodically.

### I10-M05: No Prisma migration check -- schema drift can be deployed
- **File:** `.github/workflows/ci.yml` (build-api job)
- **What:** The `build-api` job runs `prisma generate` but not `prisma migrate diff` or `prisma migrate status`. The integration test job uses `db push` (schema sync, not migrations).
- **Problem:** If someone changes the Prisma schema but forgets to create a migration, the build passes but deployment (`prisma migrate deploy` in Railway) will fail with "drift detected".
- **Fix:** Add a step that runs `prisma migrate diff --from-migrations ./apps/api/prisma/migrations --to-schema-datamodel ./apps/api/prisma/schema.prisma --exit-code` to detect unapplied schema changes.

### I10-M06: No timeout on `npm ci` -- can hang indefinitely within job timeout
- **File:** `.github/workflows/ci.yml` (all Node.js jobs)
- **What:** `npm ci` can hang on network issues. The only protection is the job-level `timeout-minutes: 15`.
- **Problem:** If npm registry is slow, `npm ci` can consume the entire 15-minute timeout, leaving no time for actual tests. Jobs have 15-20 minute timeouts which seems reasonable, but a hung npm install wastes the full timeout.
- **Impact:** Low -- GitHub Actions will eventually kill it.

### I10-M07: `CLERK_SECRET_KEY: test_secret` is not a real Clerk test key
- **File:** `.github/workflows/ci.yml:78, 172`
- **What:** API tests use `CLERK_SECRET_KEY: test_secret` and Go tests use `CLERK_SECRET_KEY: sk_test_placeholder`.
- **Problem:** These are not real Clerk keys. Any code that actually calls Clerk's API during tests will fail. This means auth-related integration tests either mock Clerk (good) or skip real auth validation (bad, but unavoidable in CI without real keys).
- **Note:** This is standard practice for CI -- real API keys should not be in CI config. The finding is informational.

---

## LOW

### I10-L01: No CI job for building Docker images
- **File:** `.github/workflows/ci.yml`
- **What:** CI has `build-api` (NestJS build) but no `docker build` step for any Dockerfile.
- **Problem:** Dockerfile syntax errors, missing files in COPY commands, or broken multi-stage builds won't be caught until deployment.
- **Fix:** Add a `docker build --target builder` step for each Dockerfile (don't need to push, just verify it builds).

### I10-L02: No Dependabot or Renovate configuration
- **File:** `.github/` (no `dependabot.yml` or `renovate.json`)
- **What:** No automated dependency update tool configured.
- **Problem:** Dependencies with security patches won't generate PRs automatically. The team must manually check for updates.

### I10-L03: No CODEOWNERS file
- **File:** `.github/CODEOWNERS` does not exist.
- **What:** No automatic review assignment based on changed files.
- **Problem:** Solo founder currently, so this doesn't matter. When the team grows, changes to critical paths (signal protocol, payments, auth) should require specific reviewer approval.

### I10-L04: Branch protection is documented but may not be applied
- **File:** `.github/BRANCH_PROTECTION.md`
- **What:** The file documents what protection rules SHOULD be applied, including the `gh api` command to apply them. But this is just documentation -- there's no verification that the rules are actually active on the GitHub repo.
- **Problem:** If branch protection was never applied, all the CI checks are advisory only -- anyone with push access can merge directly to main.
- **Fix:** Verify via `gh api repos/{owner}/mizanly/branches/main/protection` that rules are active.

### I10-L05: Go version 1.25 consistency across all files
- **Status:** GOOD.
- **Files checked:**
  - `apps/e2e-server/go.mod`: `go 1.25.0`
  - `apps/livekit-server/go.mod`: `go 1.25.0`
  - `apps/e2e-server/Dockerfile`: `golang:1.25-alpine@sha256:8e02eb...`
  - `apps/livekit-server/Dockerfile`: `golang:1.25-alpine@sha256:8e02eb...`
  - `.github/workflows/ci.yml`: `go-version: '1.25'` (both jobs)
- **Result:** All five locations specify Go 1.25. SHA256 digests on both Go Dockerfiles match. No version mismatch.

---

## INFO

### I10-I01: CI job dependency graph
```
                    lint-and-typecheck
                   /    |    |        \
                  v     v    v         v
    test-mobile-signal  test-api  test-api-integration  build-api
    
    e2e-server     (independent)
    livekit-server (independent)
    security       (independent)
```
- Node.js jobs depend on `lint-and-typecheck`. Go and security jobs run independently.
- Wall-clock time is optimized (Go tests start immediately).
- CI minutes are wasted if typecheck fails (Go tests still run to completion).

### I10-I02: Jobs with `continue-on-error` or `|| true` (complete list)
| Location | Step | Effect |
|----------|------|--------|
| Line 36 | `npm run format:check` | `continue-on-error: true` -- format failures ignored |
| Line 39 | `npx eslint . --max-warnings 0` | `continue-on-error: true` -- lint failures ignored |
| Line 220 | `npm audit --audit-level=high \|\| true` | Always succeeds -- security audit ignored |

**Result:** 3 out of 3 quality/security gates are silenced. Only typechecking and test execution actually block merges.

### I10-I03: Mobile tests in CI vs available
| Test Suite | In CI? | Test Count |
|-----------|--------|------------|
| Signal Protocol (`signal/__tests__`) | Yes | 633 |
| LiveKit/CallKit (`hooks/__tests__`) | Yes | 49 |
| Offline Message Queue (`services/__tests__`) | **NO** | Unknown |

### I10-I04: What blocks merges (assuming branch protection is active)
| Check | Actually Blocking? |
|-------|--------------------|
| TypeScript typecheck (API + Mobile + Shared) | Yes |
| ESLint | **NO** (continue-on-error) |
| Format check | **NO** (continue-on-error) |
| API unit tests | Yes |
| API integration tests | Yes |
| Mobile Signal tests | Yes |
| Mobile LiveKit tests | Yes |
| API build | Yes |
| E2E server build + tests | Yes |
| LiveKit server build + tests | Yes |
| Security audit | **NO** (\|\| true) |

**Result:** 8 of 11 CI checks actually enforce anything. The 3 non-enforcing checks (`eslint`, `format:check`, `npm audit`) are the quality and security gates.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 5 |
| MEDIUM | 6 |
| LOW | 5 |
| INFO | 4 |
| **Total** | **23** |
