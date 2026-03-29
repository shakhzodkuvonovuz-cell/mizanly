# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**
- TypeScript ~5.7 - API backend (`apps/api/`), mobile app (`apps/mobile/`), shared package (`packages/shared/`)
- Go 1.25 - E2E Key Server (`apps/e2e-server/`), LiveKit Call Server (`apps/livekit-server/`)

**Secondary:**
- SQL - Prisma schema (`apps/api/prisma/schema.prisma`, 5,037 lines, ~200 models), raw SQL in Go stores
- JSON - i18n translations (8 languages: `apps/mobile/src/i18n/*.json`)

## Runtime

**Environment:**
- Node.js >= 20.0.0 (specified in `package.json` engines)
- Go 1.25 (specified in `apps/e2e-server/go.mod` and `apps/livekit-server/go.mod`)
- Hermes JS engine (React Native, specified in `apps/mobile/app.json` as `"jsEngine": "hermes"`)

**Package Manager:**
- npm >= 10.0.0 (workspaces)
- Lockfile: `package-lock.json` (present at root)
- Go modules for both Go services

## Monorepo Structure

**Workspace Layout:**
- Root `package.json` uses npm workspaces: `apps/*` + `packages/*`
- `@mizanly/api` - NestJS backend
- `@mizanly/mobile` - Expo mobile app
- `@mizanly/shared` - shared types/utilities (`packages/shared/`)

## Frameworks

**Core:**
- NestJS 10.4 - API backend (`apps/api/package.json`)
- React Native 0.76.0 - Mobile app (`apps/mobile/package.json`)
- Expo SDK 52 - Mobile tooling (`apps/mobile/package.json`, entry: `expo-router/entry`)
- Expo Router 4.0 - File-based routing (`apps/mobile/app.json` with typed routes)
- net/http (stdlib) - Go HTTP servers (no framework, `apps/e2e-server/cmd/server/main.go`, `apps/livekit-server/cmd/server/main.go`)

**Testing:**
- Jest 29.7 - API and mobile tests
- ts-jest 29.2 - TypeScript transform for API (`apps/api/jest.config.ts`)
- jest-expo 55 - Expo-compatible Jest preset (`apps/mobile/package.json`)
- @testing-library/react-native 12.4 - Component testing (`apps/mobile/package.json`)
- supertest 7.2 - HTTP assertion for API integration tests (`apps/api/package.json`)
- Go `testing` stdlib - Go server tests

**Build/Dev:**
- NestJS CLI 10.4 - API build (`apps/api/nest-cli.json`, compiles to `dist/`)
- Metro 0.83 - React Native bundler (`apps/mobile/package.json`)
- Prettier - Code formatting (`.prettierrc` at root)
- ESLint 9.0 - Linting (`.eslintrc.json` at root, `@typescript-eslint/no-explicit-any: "error"`)
- Nixpacks - Railway build for API (`apps/api/railway.json`)
- Docker multi-stage - Go services (`apps/e2e-server/Dockerfile`, `apps/livekit-server/Dockerfile`)

## Key Dependencies

**Critical (API - `apps/api/package.json`):**
- `@prisma/client` ^6.3 + `prisma` ^6.3 - ORM, PostgreSQL client, schema management
- `@clerk/backend` ^1.21 - JWT verification, user management
- `stripe` ^20.4 - Payment processing
- `ioredis` ^5.10 - Redis client (caching, rate limiting, pub/sub, presence)
- `bullmq` ^5.71 - Job queue (6 named queues: notifications, media, analytics, webhooks, search-indexing, ai-tasks)
- `socket.io` ^4.8 - WebSocket server (real-time messaging, typing, presence)
- `@aws-sdk/client-s3` ^3.700 + `@aws-sdk/s3-request-presigner` ^3.700 - Cloudflare R2 via S3 API
- `meilisearch` ^0.46 - Full-text search client
- `sharp` ^0.33 - Image processing (resize, BlurHash generation in media queue)
- `resend` ^6.9 - Transactional email
- `@sentry/nestjs` ^10.42 + `@sentry/node` ^10.42 - Error monitoring, performance tracing
- `svix` ^1.45 - Clerk webhook verification

**Critical (Mobile - `apps/mobile/package.json`):**
- `@clerk/clerk-expo` ^2.5 - Authentication (OAuth, JWT)
- `@tanstack/react-query` ^5.60 - Server state management, caching
- `zustand` ^5.0 - Client state management (persisted via AsyncStorage)
- `socket.io-client` ^4.8 - WebSocket client (single shared connection via `SocketProvider`)
- `@livekit/react-native` ^2.9 + `livekit-client` ^2.18 - Video/voice calls with SFrame E2EE
- `react-native-quick-crypto` ^1.0 - Hardware-accelerated crypto via C++ JSI (OpenSSL)
- `@noble/ciphers` ^1.3 + `@noble/curves` ^1.9 + `@noble/hashes` ^1.4 - Cryptographic primitives (Signal Protocol)
- `react-native-mmkv` ^3.2 - Encrypted local storage (sessions, keys)
- `expo-secure-store` ~14.0 - Hardware-backed keychain for identity keys
- `expo-notifications` ^0.29 - Push notification handling
- `react-native-callkeep` ^4.3 - CallKit (iOS) / ConnectionService (Android) integration
- `ffmpeg-kit-react-native` ^6.0 - Video editing engine
- `@giphy/react-native-sdk` ^5.0 - GIF search and display
- `react-native-reanimated` ~3.16 - Gesture-driven animations
- `@shopify/flash-list` ~2.0 - High-performance virtualized lists

**Critical (Go E2E Server - `apps/e2e-server/go.mod`):**
- `github.com/jackc/pgx/v5` v5.9 - PostgreSQL driver (raw SQL, no ORM)
- `github.com/clerk/clerk-sdk-go/v2` v2.5 - Clerk JWT verification
- `github.com/redis/go-redis/v9` v9.18 - Redis client (rate limiting)
- `github.com/getsentry/sentry-go` v0.44 - Error monitoring

**Critical (Go LiveKit Server - `apps/livekit-server/go.mod`):**
- `github.com/livekit/server-sdk-go/v2` v2.16 - LiveKit room/token/egress/ingress management
- `github.com/livekit/protocol` v1.45 - LiveKit protobuf types, webhook verification
- `github.com/jackc/pgx/v5` v5.9 - PostgreSQL driver
- `github.com/clerk/clerk-sdk-go/v2` v2.5 - Clerk JWT verification
- `github.com/redis/go-redis/v9` v9.18 - Redis client
- `github.com/getsentry/sentry-go` v0.44 - Error monitoring

**Infrastructure (API):**
- `@nestjs/throttler` ^6.3 + `@nest-lab/throttler-storage-redis` ^1.2 - Distributed rate limiting (Redis-backed)
- `@nestjs/schedule` ^6.1 - Cron jobs (cleanup tasks)
- `@nestjs/swagger` ^8.1 - OpenAPI documentation (dev only, path: `/docs`)
- `@nestjs/websockets` ^10.4 + `@nestjs/platform-socket.io` ^10.4 - WebSocket gateway
- `helmet` ^8.1 - Security headers
- `compression` ^1.7 - Response compression
- `opossum` ^9.0 - Circuit breaker (Redis, Stripe, Expo push, Meilisearch, Cloudflare Stream, Anthropic, Gemini)
- `nestjs-pino` ^4.6 + `pino` ^10.3 - Structured JSON logging
- `class-validator` ^0.14 + `class-transformer` ^0.5 - DTO validation
- `blurhash` ^2.0 - Image placeholder generation
- `@noble/curves` ^1.9 + `@noble/hashes` ^1.4 - Server-side crypto (identity verification)

**Mobile UI/UX:**
- `lucide-react-native` ^0.468 - Icon library
- `expo-image` ~2.0 - Optimized image loading (with `ProgressiveImage` wrapper)
- `react-native-gesture-handler` ~2.20 - Touch gestures
- `react-native-screens` ~4.4 - Native screen transitions
- `expo-haptics` ~14.0 - Haptic feedback
- `react-native-maps` ^1.27 - Map views (mosque finder)
- `expo-camera` ~16.0 - Camera access
- `expo-av` ~15.0 - Audio/video playback
- `i18next` ^25.8 + `react-i18next` ^16.5 - Internationalization (8 languages)
- `expo-localization` ^55.0 - Device locale detection
- `date-fns` ^4.1 - Date formatting

**AI/ML (Mobile):**
- `@tensorflow/tfjs` ^4.22 + `@tensorflow/tfjs-react-native` ^1.0 - On-device ML inference
- `nsfwjs` ^4.3 - Client-side NSFW detection
- `@noble/post-quantum` ^0.5 - ML-KEM-768 post-quantum key exchange (PQXDH)
- `@livekit/react-native-krisp-noise-filter` ^0.0.3 - AI noise suppression for calls

## TypeScript Configuration

**API (`apps/api/tsconfig.json`):**
- Target: ES2021
- Module: CommonJS
- Strict: `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`
- Decorators: `emitDecoratorMetadata`, `experimentalDecorators`
- Path alias: `@/*` -> `src/*`

**Mobile (`apps/mobile/tsconfig.json`):**
- Extends: `expo/tsconfig.base`
- Strict: true
- Module: ESNext
- Path aliases: `@/*`, `@components/*`, `@screens/*`, `@hooks/*`, `@services/*`, `@store/*`, `@theme/*`, `@utils/*`, `@types/*`

## Configuration

**Environment:**
- API: `.env` file loaded via `@nestjs/config` (ConfigModule global). `.env.example` at `apps/api/.env.example` with 30+ variables
- Mobile: `.env` file with `EXPO_PUBLIC_*` prefix convention. `.env.example` at `apps/mobile/.env.example`
- Go servers: `os.Getenv()` direct reads, validated at startup with hard-fail on missing required vars

**Required env vars (API must-have):**
- `DATABASE_URL` - PostgreSQL (Neon)
- `CLERK_SECRET_KEY` - Authentication

**Required env vars (Go e2e-server):**
- `CLERK_SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`

**Required env vars (Go livekit-server):**
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_HOST`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `REDIS_URL`, `INTERNAL_SERVICE_KEY`

**Build:**
- `apps/api/nest-cli.json` - NestJS CLI build config (output: `dist/`)
- `apps/api/railway.json` - Railway deployment (Nixpacks builder)
- `apps/e2e-server/Dockerfile` - Multi-stage Go build (golang:1.25-alpine -> alpine:3.21)
- `apps/livekit-server/Dockerfile` - Multi-stage Go build (golang:1.26-alpine -> alpine:3.21)
- `apps/e2e-server/railway.json` - Railway deployment (Dockerfile builder)

## Platform Requirements

**Development:**
- Node.js >= 20, npm >= 10
- Go 1.25+
- PostgreSQL 16 (with pgvector extension for embeddings, pg_trgm for search)
- Redis 7 (optional in dev - graceful degradation via no-op proxy)
- Expo CLI for mobile development

**Production:**
- Railway (API: Nixpacks, Go services: Docker)
- PostgreSQL: Neon (serverless PostgreSQL, pooled + direct connections)
- Redis: Upstash (serverless Redis, TLS required)
- Node.js 20+ in Railway

**CI/CD:**
- GitHub Actions (`.github/workflows/ci.yml`)
- 7 jobs: lint-and-typecheck, build-mobile, test-api, test-api-integration, build-api, e2e-server, (livekit-server implied)
- Services: postgres:16-alpine (or pgvector/pgvector:pg16 for integration), redis:7-alpine
- Go 1.25 for E2E server CI

---

*Stack analysis: 2026-03-30*
