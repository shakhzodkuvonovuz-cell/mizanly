# Mizanly — Agent Build Instructions

## Project Structure
```
C:/dev/mizanly/
├── apps/api/          # NestJS 10 backend (68 modules, 160 Prisma models)
├── apps/mobile/       # React Native Expo SDK 52 (202 screens)
├── packages/shared/   # Shared types + constants
├── docs/              # Documentation
└── .ralph/            # Ralph autonomous loop config
```

## IMPORTANT: npm is NOT in shell PATH
All npm/npx commands MUST be run via full path or in Windows terminal.
For Claude Code shell: use `cmd /c "cd apps/api && npm install"` pattern.

## Running the Project
```bash
# Backend
cd C:/dev/mizanly/apps/api
npm install
npm run start:dev
# Swagger docs: http://localhost:3000/docs

# Mobile
cd C:/dev/mizanly/apps/mobile
npm install
npx expo start

# Database
cd C:/dev/mizanly/apps/api
npx prisma db push      # Apply schema changes
npx prisma studio       # DB browser
npx prisma generate     # Regenerate client
```

## Running Tests
```bash
cd C:/dev/mizanly/apps/api
npm test                 # Run all 88 test files
npm test -- --watch      # Watch mode
npm test -- auth         # Run specific module tests
```

## Key Config Files
- `apps/api/prisma/schema.prisma` — 160 models, 3,295 lines
- `apps/mobile/src/theme/index.ts` — Design tokens
- `apps/mobile/src/i18n/en.json` — English translations (2,667 lines)
- `CLAUDE.md` — Project rules and component API
- `docs/COMPETITOR_DEEP_AUDIT_2026.md` — Full competitor audit with plan

## MCP Plugins Available
- **Playwright** — browser automation, screenshots, testing
- **Memory** — persistent knowledge graph
- **Filesystem** — direct file access
- **Sequential Thinking** — multi-step reasoning
- **Brave Search** — web research
- **Docker** — container management
- **PostgreSQL** — database queries
