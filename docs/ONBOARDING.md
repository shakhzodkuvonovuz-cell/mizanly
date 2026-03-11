# Mizanly — Developer Onboarding

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Docker Desktop** (for local PostgreSQL, Redis, Meilisearch)
- **Git**
- **Expo Go** app on your phone (for mobile development)

---

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url> mizanly
cd mizanly
npm install
```

This installs all workspaces: `apps/api`, `apps/mobile`, `packages/shared`.

### 2. Start Local Services

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port 5432 (user: `mizanly`, password: `mizanly_dev`)
- **Redis 7** on port 6379
- **Meilisearch** on port 7700 (master key: `mizanly_dev_master_key`)

### 3. Configure Environment

```bash
# Backend
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your Clerk keys and other credentials

# Mobile
cp apps/mobile/.env.example apps/mobile/.env
# Set EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

**Minimum required for local dev:**
- `DATABASE_URL=postgresql://mizanly:mizanly_dev@localhost:5432/mizanly`
- `CLERK_SECRET_KEY` (get from Clerk dashboard)
- `CLERK_PUBLISHABLE_KEY` (get from Clerk dashboard)
- `REDIS_URL=redis://localhost:6379`

### 4. Set Up Database

```bash
# Generate Prisma client
npx prisma generate --schema=apps/api/prisma/schema.prisma

# Push schema to local PostgreSQL
npx prisma db push --schema=apps/api/prisma/schema.prisma
```

### 5. Run the API

```bash
npm run dev:api
```

- API: http://localhost:3000/api/v1
- Swagger docs: http://localhost:3000/docs
- Health check: http://localhost:3000/api/v1/health

### 6. Run the Mobile App

```bash
npm run dev:mobile
```

Scan the QR code with Expo Go on your phone.

---

## Project Structure

```
mizanly/
├── apps/
│   ├── api/                    # NestJS 10 backend
│   │   ├── src/
│   │   │   ├── modules/        # 28 feature modules
│   │   │   ├── common/         # Guards, filters, decorators, pipes
│   │   │   ├── gateways/       # Socket.io chat gateway
│   │   │   └── config/         # Prisma, Redis, Sentry configs
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema (73 models)
│   │   └── test/               # E2E test config
│   └── mobile/                 # React Native (Expo SDK 52)
│       ├── app/                # Expo Router screens
│       │   ├── (tabs)/         # 5 main tabs
│       │   ├── (screens)/      # 46+ screens
│       │   └── (auth)/         # Sign in/up
│       └── src/
│           ├── components/     # UI + feature components
│           ├── services/       # API client (224 endpoints)
│           ├── store/          # Zustand state
│           ├── hooks/          # Custom hooks
│           ├── theme/          # Design tokens
│           └── types/          # TypeScript interfaces
├── packages/
│   └── shared/                 # Shared constants, types, validation
├── docs/                       # Project documentation
├── CLAUDE.md                   # Development rules & component API
├── ARCHITECTURE.md             # System architecture overview
└── docker-compose.yml          # Local dev services
```

---

## Key Development Docs

| File | Purpose |
|------|---------|
| `CLAUDE.md` | **Read first.** Component APIs, schema field names, absolute rules |
| `ARCHITECTURE.md` | 5-space architecture, tech decisions |
| `STRUCTURE.md` | Feature scope for all spaces |
| `docs/PROJECT_HISTORY.md` | Batch history, decisions, audit records |
| `docs/DEPLOYMENT.md` | Production deployment guide |

---

## Running Tests

### Backend (Jest)

```bash
# Run all tests
npm test --workspace=apps/api

# Watch mode
npm test --workspace=apps/api -- --watch

# Single file
npm test --workspace=apps/api -- --testPathPattern=posts.service.spec

# Coverage
npm test --workspace=apps/api -- --coverage
```

### Mobile (Jest + Testing Library)

```bash
# Run all tests
npm test --workspace=apps/mobile

# Watch mode
npm test --workspace=apps/mobile -- --watch
```

---

## Useful Commands

```bash
# Database
npx prisma studio --schema=apps/api/prisma/schema.prisma  # Visual DB browser
npx prisma db push --schema=apps/api/prisma/schema.prisma  # Apply schema changes

# Linting
npm run lint                    # Lint all workspaces
npm run format:check            # Check formatting
npm run format                  # Auto-format

# Type checking
npm run typecheck               # Check mobile types
```

---

## Common Issues

### "npm not found" in shell
npm is not in the shell PATH on this machine. Run npm commands in Windows Terminal instead.

### Prisma client not generated
```bash
npx prisma generate --schema=apps/api/prisma/schema.prisma
```
Run this after every `npm install` or schema change.

### Port 3000 already in use
```bash
# Find and kill the process
npx kill-port 3000
```

### Clerk JWT errors
Make sure `CLERK_SECRET_KEY` matches your Clerk project. The key format is `sk_test_...` for development.

### Docker services won't start
```bash
docker compose down -v   # Remove volumes
docker compose up -d     # Fresh start
```

---

## Architecture Quick Reference

### The Five Spaces

| Space | Model | Tab |
|-------|-------|-----|
| **Saf** (الصف) | Instagram | Feed + Stories |
| **Majlis** (المجلس) | X/Twitter | Threads |
| **Risalah** (رسالة) | WhatsApp | Messaging |
| **Bakra** (بكرة) | TikTok | Short Video |
| **Minbar** (المنبر) | YouTube | Long Video |

### API Patterns
- Base: `/api/v1/`
- Auth: `Authorization: Bearer <clerk_jwt>`
- Pagination: `?cursor=<id>` → `{ data: [], meta: { cursor, hasMore } }`
- All responses wrapped: `{ data, success, timestamp }`

### Schema Rules (NEVER violate)
- All models use `userId` (NOT `authorId`)
- Post: `content` (NOT `caption`)
- Thread: `isChainHead` (NOT `replyToId`)
- Story: `mediaType` (NOT `type`)
- Message: `messageType` (NOT `type`)
