# Mizanly

NestJS monorepo: `apps/api` + `apps/mobile` (Expo SDK 52) + `apps/e2e-server` (Go)
Prisma ORM, PostgreSQL (Neon), Redis (Upstash), Clerk auth, Cloudflare R2

## Build & Test
```bash
cd apps/api && pnpm test                    # API tests
cd apps/mobile && npx tsc --noEmit          # Mobile typecheck
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js  # Signal tests
cd apps/e2e-server && go test ./internal/... -v  # Go tests
```

## Integrity Rules

- NEVER say "done", "fixed", "complete", "working", or "implemented" without showing test output that proves it.
- If you cannot verify, say: "Changes made but NOT verified."
- If you are guessing, say: "I am not certain — this is my best guess."
- If you want to stop, say: "I've completed X of Y. Remaining: [list]." Stopping honestly is always acceptable.
- NEVER do 3 of 10 items and say "and similar changes for the rest." Do all 10 or list what remains.
- NEVER silently swallow errors. If tests fail after your change, that is your regression — fix it before reporting.
- After every code change: run affected tests. If any fail, fix before reporting. Report format: "Changes: [list]. Tests: [pass/fail]. Remaining: [list or none]."
- Prefer saying "I don't know" over a confident wrong answer.

## Code Patterns
- Follow existing module patterns. Read neighboring files first.
- Strict typing everywhere. No `any` in non-test code.
- All errors explicit, never silently swallowed.
- No `@ts-ignore`, no `@ts-expect-error`. Fix the actual type.

## What NOT to Do
- Do not refactor files beyond the scope of the task.
- Do not commit unless explicitly asked.
- Do not use Sonnet or Haiku as subagent models. Opus only.
- Do not add Co-Authored-By or AI references in commits.

## Architecture (brief)
```
apps/api/          — NestJS 10, ~80 modules, ~200 Prisma models
apps/mobile/       — React Native Expo SDK 52, 213 screens
apps/e2e-server/   — Go E2E Key Server (Signal Protocol)
```

See `.claude/rules/` for file-type-specific rules (auto-loaded by glob).
See `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` for session history + project state.
See `docs/audit/2026-03-28-e2e-deep-audit-v3.md` for 33 E2E findings (A+ roadmap).
