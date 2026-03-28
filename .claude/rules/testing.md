---
description: Testing conventions
globs: **/*.test.ts,**/*.spec.ts,**/*_test.go
---

# Testing Rules

- Tests cover the ENTIRE scope, not just fixes. Cover untested parts too.
- Every code change MUST have tests written and verified passing.
- Test files MAY use `as any` for mocks — this is the only exception to the no-any rule.
- NEVER use Sonnet or Haiku as subagent models for test generation — Opus only.

## Commands
```bash
# API tests
cd apps/api && pnpm test -- --testPathPattern=<module>

# Signal Protocol tests
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js

# Go E2E server tests
cd apps/e2e-server && go test ./internal/... -v -count=1

# TypeScript compilation
cd apps/mobile && npx tsc --noEmit
cd apps/api && npx tsc --noEmit

# Go compilation
cd apps/e2e-server && go build ./cmd/server/
```
