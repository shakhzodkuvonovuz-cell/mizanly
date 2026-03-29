# External Integrations

**Analysis Date:** 2026-03-30

## APIs & External Services

### Authentication: Clerk

- **Purpose:** User identity, JWT auth, OAuth providers, webhook events (user.created/updated/deleted)
- **SDK (API):** `@clerk/backend` ^1.21 - JWT `verifyToken()` in auth guard
- **SDK (Mobile):** `@clerk/clerk-expo` ^2.5 - OAuth flow, `useAuth()` hook, `getToken()`
- **SDK (Go):** `github.com/clerk/clerk-sdk-go/v2` v2.5 - JWT verification middleware
- **Auth env vars:** `CLERK_SECRET_KEY` (all 3 services), `CLERK_PUBLISHABLE_KEY` (API), `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (mobile)
- **Webhook secret:** `CLERK_WEBHOOK_SECRET` - verified via Svix (`svix` ^1.45)
- **Key files:**
  - `apps/api/src/common/guards/clerk-auth.guard.ts` - API auth guard (extracts Bearer token, verifies JWT, resolves user from DB)
  - `apps/api/src/common/guards/optional-clerk-auth.guard.ts` - Optional auth for public endpoints
  - `apps/api/src/modules/auth/webhooks.controller.ts` - Clerk webhook handler (user.created/updated/deleted via Svix verification)
  - `apps/api/src/modules/auth/auth.service.ts` - User creation/sync from Clerk events
  - `apps/e2e-server/internal/middleware/auth.go` - Go auth middleware
  - `apps/livekit-server/internal/middleware/auth.go` - Go auth middleware
  - `apps/mobile/src/providers/SocketProvider.tsx` - Socket auth via `getToken()`
- **Flow:** Mobile gets Clerk JWT -> sends as `Authorization: Bearer <token>` -> API/Go servers verify with `CLERK_SECRET_KEY` -> resolve internal user ID from `clerkId` column

### Payments: Stripe

- **Purpose:** Subscriptions, one-time payments, creator payouts, virtual currency (coins/diamonds)
- **SDK:** `stripe` ^20.4 (API version `2025-02-24.acacia`)
- **Auth env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Key files:**
  - `apps/api/src/modules/payments/payments.service.ts` - Stripe customer management, checkout sessions, subscriptions
  - `apps/api/src/modules/payments/stripe-webhook.controller.ts` - Webhook handler (payment_intent.succeeded, invoice.paid, etc.)
  - `apps/api/src/common/services/payment-reconciliation.service.ts` - Payment reconciliation
  - `apps/api/src/modules/commerce/commerce.service.ts` - Commerce/shop Stripe integration
  - `apps/mobile/src/services/paymentsApi.ts` - Mobile API client
- **Circuit breaker:** Yes, via `opossum` (10s timeout, 60% error threshold, 30s reset)
- **Webhook endpoint:** `POST /api/v1/payments/webhooks/stripe`

### File Storage: Cloudflare R2

- **Purpose:** Media storage (images, videos, audio, thumbnails) via S3-compatible API
- **SDK:** `@aws-sdk/client-s3` ^3.700 + `@aws-sdk/s3-request-presigner` ^3.700
- **Auth env vars:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (default: `mizanly-media`), `R2_PUBLIC_URL` (default: `https://media.mizanly.app`)
- **Key files:**
  - `apps/api/src/modules/upload/upload.service.ts` - S3 client configuration, presigned URLs, upload validation
  - `apps/api/src/modules/upload/upload.controller.ts` - Upload endpoints
  - `apps/api/src/common/queue/processors/media.processor.ts` - Async media processing (resize, BlurHash via `sharp`)
- **Folders:** `avatars/`, `covers/`, `posts/`, `stories/`, `messages/`, `reels/`, `videos/`, `thumbnails/`, `misc/`
- **Size limits:** avatars 5MB, posts/stories/messages 50MB, reels/videos 100MB
- **Also used by Go LiveKit server:** `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ENDPOINT` (for egress recordings)

### Video Hosting: Cloudflare Stream

- **Purpose:** Video transcoding, HLS/DASH adaptive streaming, thumbnail generation
- **SDK:** Direct HTTP API calls to `https://api.cloudflare.com/client/v4/accounts/{accountId}/stream`
- **Auth env vars:** `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_WEBHOOK_SECRET`
- **Key files:**
  - `apps/api/src/modules/stream/stream.service.ts` - Upload, transcode, playback URL generation
  - `apps/api/src/modules/stream/stream.controller.ts` - Stream endpoints
  - `apps/api/src/modules/videos/videos.service.ts` - Video module Cloudflare Stream integration
  - `apps/api/src/modules/reels/reels.service.ts` - Reel video processing
  - `apps/api/src/modules/live/live.service.ts` - Live streaming via Cloudflare Stream
- **Circuit breaker:** Yes, via `opossum` (named `cloudflare-stream`)

### Video Calls: LiveKit Cloud

- **Purpose:** WebRTC SFU (Selective Forwarding Unit) for voice/video calls with SFrame E2EE
- **SDK (Go):** `github.com/livekit/server-sdk-go/v2` v2.16 - Room management, token generation, egress/ingress
- **SDK (Mobile):** `@livekit/react-native` ^2.9 + `livekit-client` ^2.18 - Room connection, track management
- **Auth env vars:** `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_HOST`
- **Key files:**
  - `apps/livekit-server/internal/handler/handler.go` - 16 endpoints (rooms, token, leave, kick, mute, egress, ingress, webhooks, history, active, session)
  - `apps/livekit-server/internal/config/config.go` - Config loading and validation
  - `apps/mobile/src/hooks/useLiveKitCall.ts` - Call lifecycle hook (~700 lines)
  - `apps/mobile/src/services/livekit.ts` - API client for Go server
  - `apps/mobile/src/services/callkit.ts` - CallKit/ConnectionService integration
  - `apps/mobile/src/services/activeRoomRegistry.ts` - Room cleanup bridge
- **Webhook endpoint:** `POST /api/v1/webhooks/livekit` (HMAC-verified, on Go server)
- **Noise filter:** `@livekit/react-native-krisp-noise-filter` ^0.0.3 - AI noise suppression

### Search: Meilisearch

- **Purpose:** Full-text search across users, posts, threads, reels, videos, hashtags
- **SDK:** `meilisearch` ^0.46
- **Auth env vars:** `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`
- **Key files:**
  - `apps/api/src/modules/search/search.service.ts` - Search queries with Prisma fallback
  - `apps/api/src/modules/search/search.module.ts` - Module with MeilisearchService
  - `apps/api/src/common/services/meilisearch-sync.service.ts` - Full index backfill (batch 500)
  - `apps/api/src/common/queue/processors/search-indexing.processor.ts` - Async index updates via BullMQ
- **Indexes:** users, posts, threads, reels, videos, hashtags
- **Circuit breaker:** Yes, via `opossum` (5s timeout)

### Email: Resend

- **Purpose:** Transactional emails (welcome, security alerts, weekly digest, creator summaries)
- **SDK:** `resend` ^6.9
- **Auth env vars:** `RESEND_API_KEY`
- **From address:** `EMAIL_FROM` env var or default `Mizanly <noreply@mizanly.app>`
- **Key files:**
  - `apps/api/src/common/services/email.service.ts` - Resend client with HTML-escaped templates
  - `apps/api/src/common/services/email.module.ts` - Global email module
- **Templates:** Welcome, Security Alert, Weekly Digest, Creator Weekly Summary (all branded HTML with emerald/gold theme)

### Error Monitoring: Sentry

- **Purpose:** Error tracking, performance monitoring, transaction tracing
- **SDK (API):** `@sentry/nestjs` ^10.42 + `@sentry/node` ^10.42
- **SDK (Go):** `github.com/getsentry/sentry-go` v0.44 + `sentry-go/http` middleware
- **Auth env var:** `SENTRY_DSN` (all 3 services), `EXPO_PUBLIC_SENTRY_DSN` (mobile)
- **Key files:**
  - `apps/api/src/config/sentry.ts` - Sentry init (10% traces in prod, 5% profiling, scrubs auth headers, ignores 404/401/429)
  - `apps/e2e-server/cmd/server/main.go` - Go Sentry init (0.1 trace sample rate)
  - `apps/livekit-server/cmd/server/main.go` - Go Sentry init (0.1 trace sample rate)
- **Scrubbed from events:** `authorization` header, `cookie` header

### AI Services

**Anthropic (Claude):**
- **Purpose:** Content moderation, caption generation, smart replies, space routing
- **Auth env var:** `ANTHROPIC_API_KEY`
- **Key files:** `apps/api/src/modules/ai/ai.service.ts` - AI service with daily per-user quota (100/day)
- **Circuit breaker:** Yes, via `opossum` (named `anthropic`)

**Google Gemini:**
- **Purpose:** Text embeddings for recommendations (model: `text-embedding-004`, 768 dimensions)
- **Auth env var:** `GEMINI_API_KEY` (passed as URL query parameter per Google API requirements)
- **Key files:** `apps/api/src/modules/embeddings/embeddings.service.ts`
- **Circuit breaker:** Yes, via `opossum` (named `gemini`)

**OpenAI:**
- **Purpose:** Whisper voice transcription
- **Auth env var:** `OPENAI_API_KEY`

### Push Notifications: Expo Push

- **Purpose:** Push notification delivery to iOS (APNs) and Android (FCM) via Expo servers
- **SDK:** Direct HTTP to `https://exp.host/--/api/v2/push/send` (no SDK, raw fetch)
- **Auth env var:** `EXPO_ACCESS_TOKEN` (for authenticated push requests)
- **Key files:**
  - `apps/api/src/modules/notifications/push.service.ts` - Expo push client with i18n templates (en/ar/tr), batch sends (max 100)
  - `apps/api/src/modules/notifications/push-trigger.service.ts` - Maps notification types to push payloads
  - `apps/api/src/modules/notifications/notifications.service.ts` - Notification creation + dedup
  - `apps/api/src/common/queue/processors/notification.processor.ts` - Async push delivery via BullMQ
  - `apps/mobile/src/services/pushNotifications.ts` - Permission request, token registration
- **Circuit breaker:** Yes, via `opossum` (5s timeout)
- **Notification types:** LIKE, COMMENT, FOLLOW, MESSAGE, MENTION, PRAYER (with i18n templates)

### GIFs: GIPHY SDK

- **Purpose:** GIF search and display in messaging
- **SDK:** `@giphy/react-native-sdk` ^5.0
- **Auth env var:** `EXPO_PUBLIC_GIPHY_API_KEY`
- **Key files:**
  - `apps/mobile/src/services/giphyService.ts` - GIPHY API wrapper
  - `apps/mobile/plugins/giphy-sdk/app.plugin.js` - Expo config plugin

## Data Storage

### PostgreSQL (Neon)

- **Purpose:** Primary relational database
- **Client:** Prisma ORM ^6.3 (API), pgx v5.9 (Go services, raw SQL)
- **Connection env vars:** `DATABASE_URL` (pooled, all services), `DIRECT_DATABASE_URL` (direct, API migrations only)
- **Schema:** 5,037 lines, ~200 models in `apps/api/prisma/schema.prisma`
- **Extensions:** `pgvector` (vector similarity search for embeddings), `pg_trgm` (trigram-based text search)
- **Key features:**
  - Prisma preview feature: `postgresqlExtensions` (for pgvector)
  - 12 CHECK constraints applied at startup (non-negative counters/balances)
  - 4 pg_trgm GIN indexes (content, username, displayName search)
  - Partial index on `messages.e2eVersion` for E2E query optimization
  - Slow query logging (>100ms warn, >500ms error)
- **Key files:**
  - `apps/api/prisma/schema.prisma` - Schema definition
  - `apps/api/src/config/prisma.service.ts` - PrismaClient with slow query logging, CHECK constraints, indexes
  - `apps/api/src/config/prisma.module.ts` - Global Prisma module
  - `apps/e2e-server/internal/store/postgres.go` - Go E2E store (raw SQL via pgx)
  - `apps/livekit-server/internal/store/store.go` - Go LiveKit store (raw SQL via pgx)

### Redis (Upstash)

- **Purpose:** Caching, rate limiting, pub/sub (Socket.io), session signals, presence, BullMQ queues, feature flags, A/B testing, notification dedup, AI quotas
- **Client (API):** `ioredis` ^5.10
- **Client (Go):** `github.com/redis/go-redis/v9` v9.18
- **Connection env var:** `REDIS_URL` (TLS required in production via `rediss://` scheme)
- **Key files:**
  - `apps/api/src/config/redis.module.ts` - Global Redis provider with graceful dev degradation (no-op proxy when Redis unavailable in dev; hard-fail in production)
  - `apps/api/src/config/socket-io-adapter.ts` - Socket.io Redis adapter for horizontal scaling (pub/sub)
  - `apps/api/src/common/queue/queue.module.ts` - BullMQ queue definitions (6 queues)
  - `apps/e2e-server/cmd/server/main.go` - Go Redis init with TLS
  - `apps/livekit-server/cmd/server/main.go` - Go Redis init with TLS
- **6 BullMQ Queues:**
  1. `notifications` - Push notification delivery
  2. `media-processing` - Image resize, BlurHash generation
  3. `analytics` - Engagement tracking, gamification XP/streaks
  4. `webhooks` - Community webhook delivery with HMAC-SHA256
  5. `search-indexing` - Meilisearch index updates
  6. `ai-tasks` - Content moderation, caption generation
- **Rate limiting:** Redis-backed distributed rate limiting via `@nestjs/throttler` + `@nest-lab/throttler-storage-redis` (100 req/min default)
- **Go rate limiting:** Custom Redis-based rate limiter in `apps/e2e-server/internal/middleware/ratelimit.go` and `apps/livekit-server/internal/middleware/ratelimit.go`

### Local Storage (Mobile)

- **MMKV:** `react-native-mmkv` ^3.2 - Fast key-value store for sessions, keys, message cache, search index (all values AEAD-encrypted)
- **SecureStore:** `expo-secure-store` ~14.0 - Hardware-backed keychain for identity signing private keys
- **AsyncStorage:** Used by `zustand` persist middleware for app state (`apps/mobile/src/store/index.ts`)

## Authentication & Identity

**Auth Provider:** Clerk (third-party)
- **API pattern:** `ClerkAuthGuard` extracts Bearer JWT, verifies via `@clerk/backend verifyToken()`, resolves user by `clerkId` from PostgreSQL
- **Mobile pattern:** `@clerk/clerk-expo` provides `useAuth()`, `getToken()` for JWT acquisition; token passed to API and Socket.io
- **Go pattern:** `middleware.RequireAuth()` wraps Clerk JWT verification; extracts user ID from token claims
- **User sync:** Clerk `user.created` webhook creates user in PostgreSQL; `user.updated` syncs profile changes
- **Ban system:** `isBanned`, `banExpiresAt` fields checked in auth guard; auto-unban on token verification if temp ban expired

## Monitoring & Observability

**Error Tracking:** Sentry (all services)
- API: `@sentry/nestjs` with tracing (10% sample), profiling (5% sample)
- Go: `sentry-go` with HTTP middleware (10% sample)

**Logging:**
- API: Pino structured JSON logging (`nestjs-pino`) with `pino-pretty` in dev
  - Config: `apps/api/src/app.module.ts` (LoggerModule, redacts `authorization` and `cookie` headers)
- Go: `log/slog` JSON handler (`slog.NewJSONHandler`)
- Mobile: `console.log` in dev only

**Metrics:**
- `apps/api/src/common/interceptors/metrics.interceptor.ts` - Request latency observability
- `apps/api/src/common/middleware/response-time.middleware.ts` - Response time header

**Health Checks:**
- API: `/api/v1/health/ready` (Railway healthcheck path)
- E2E server: `/health`
- LiveKit server: `/health`

## CI/CD & Deployment

**Hosting:**
- API: Railway (Nixpacks builder, `apps/api/railway.json`)
- E2E Key Server: Railway (Dockerfile builder, `apps/e2e-server/railway.json`)
- LiveKit Call Server: Railway (Dockerfile, inferred from `apps/livekit-server/Dockerfile`)
- Mobile: Expo EAS (not yet built - blocked on Apple Developer enrollment)

**CI Pipeline:** GitHub Actions (`.github/workflows/ci.yml`)
- Triggers: push/PR to `main` and `develop`
- Jobs:
  1. `lint-and-typecheck` - TypeScript compilation (API + Mobile)
  2. `build-mobile` - Verify mobile dependencies
  3. `test-api` - Unit tests with Postgres 16 + Redis 7
  4. `test-api-integration` - Integration tests with pgvector/pg16 + Redis 7 + schema push
  5. `build-api` - NestJS build
  6. `e2e-server` - Go build + test with Postgres 16 + Redis 7
- Services provisioned: PostgreSQL 16 (or pgvector:pg16), Redis 7 (Alpine)

**Domain:** mizanly.app, mizanly.com (deep links configured in `apps/mobile/app.json`)

## Webhooks & Callbacks

**Incoming Webhooks:**
- `POST /api/v1/webhooks/clerk` - Clerk user events (user.created, user.updated, user.deleted). Verified via Svix HMAC. File: `apps/api/src/modules/auth/webhooks.controller.ts`
- `POST /api/v1/payments/webhooks/stripe` - Stripe payment events (payment_intent.succeeded, invoice.paid, etc.). Verified via Stripe signature. File: `apps/api/src/modules/payments/stripe-webhook.controller.ts`
- `POST /api/v1/webhooks/livekit` (on Go server) - LiveKit room events (participant joined/left, recording started/stopped). Verified via LiveKit HMAC. File: `apps/livekit-server/internal/handler/handler.go`
- Cloudflare Stream webhooks - Video processing status updates. Env var: `CF_STREAM_WEBHOOK_SECRET`

**Outgoing Webhooks:**
- Community webhooks (user-defined) - Deliver events to external URLs with HMAC-SHA256 signing. File: `apps/api/src/modules/webhooks/webhooks.service.ts`, delivered via BullMQ `webhooks` queue

**Server-to-Server:**
- Go LiveKit server -> NestJS API: `POST /api/v1/internal/push-to-users` - Push notifications for incoming calls. Auth: `X-Internal-Key` header matching `INTERNAL_SERVICE_KEY` env var. File: `apps/api/src/modules/notifications/internal-push.controller.ts`

## Real-time Communication

**WebSocket:** Socket.io ^4.8
- Single shared connection per mobile client (via `SocketProvider`)
- Redis pub/sub adapter for horizontal scaling (`@socket.io/redis-adapter`)
- Events: new_message, new_notification, typing, presence, read_receipt
- Auth: Clerk JWT in socket handshake
- **Key files:**
  - `apps/api/src/gateways/chat.gateway.ts` - WebSocket gateway (messaging, typing, presence, sealed sender)
  - `apps/api/src/config/socket-io-adapter.ts` - Redis adapter for multi-instance
  - `apps/mobile/src/providers/SocketProvider.tsx` - Shared socket provider

## E2E Encryption Infrastructure

**Signal Protocol Implementation:**
- `apps/mobile/src/services/signal/` - 22 TypeScript files, ~10K lines
- X3DH key exchange, Double Ratchet, Sender Keys, Sealed Sender, PQXDH (ML-KEM-768)
- Cipher: XChaCha20-Poly1305 AEAD via `@noble/ciphers`
- Key exchange: X25519 via `@noble/curves`
- Hashing: SHA-256, HKDF, HMAC via `@noble/hashes`
- Hardware-accelerated (where available): `react-native-quick-crypto` (OpenSSL C++ via JSI)
- **Key files:**
  - `apps/mobile/src/services/signal/crypto.ts` - Core crypto operations
  - `apps/mobile/src/services/signal/media-crypto.ts` - Media encryption
  - `apps/mobile/src/services/signal/storage.ts` - AEAD-encrypted MMKV storage
  - `apps/mobile/src/services/signal/pqxdh.ts` - Post-quantum key exchange
  - `apps/mobile/src/services/signal/native-crypto-adapter.ts` - react-native-quick-crypto adapter
  - `apps/mobile/src/services/signal/types.ts` - Signal protocol type definitions

**Go E2E Key Server:**
- 13 endpoints for key management (identity, signed pre-keys, one-time pre-keys, bundles, sender keys, transparency)
- `apps/e2e-server/internal/handler/handler.go` - All handlers
- `apps/e2e-server/internal/store/postgres.go` - Key storage in PostgreSQL

## Circuit Breakers

All external dependencies are wrapped in circuit breakers via `opossum` ^9.0:

| Service | Timeout | Error Threshold | Reset Timeout | File |
|---------|---------|-----------------|---------------|------|
| Redis | 3s | 50% | 10s | `apps/api/src/common/services/circuit-breaker.service.ts` |
| Stripe | 10s | 60% | 30s | Same |
| Expo Push | 5s | 50% | 15s | Same |
| Meilisearch | 5s | 50% | 15s (est.) | Same |
| Cloudflare Stream | (configured) | (configured) | (configured) | Same |
| Anthropic | (configured) | (configured) | (configured) | Same |
| Gemini | (configured) | (configured) | (configured) | Same |

## Environment Configuration Summary

**API `.env` (30+ vars, see `apps/api/.env.example`):**
- Database: `DATABASE_URL`, `DIRECT_DATABASE_URL`
- Auth: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`
- Cache: `REDIS_URL`
- Payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- AI: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
- Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- Video: `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_WEBHOOK_SECRET`
- Search: `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`
- Email: `RESEND_API_KEY`
- Monitoring: `SENTRY_DSN`
- Push: `EXPO_ACCESS_TOKEN`
- Security: `TOTP_ENCRYPTION_KEY`, `INTERNAL_SERVICE_KEY`
- Islamic: `GOLD_PRICE_PER_GRAM`, `SILVER_PRICE_PER_GRAM`
- App: `NODE_ENV`, `PORT`, `APP_URL`, `API_URL`, `CORS_ORIGINS`

**Mobile `.env` (see `apps/mobile/.env.example`):**
- `EXPO_PUBLIC_API_URL` - NestJS API base URL
- `EXPO_PUBLIC_WS_URL` - Socket.io WebSocket URL
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk frontend key
- `EXPO_PUBLIC_PROJECT_ID` - Expo project ID for push notifications
- `EXPO_PUBLIC_SENTRY_DSN` - Sentry DSN
- `EXPO_PUBLIC_GIPHY_API_KEY` - GIPHY API key
- `EXPO_PUBLIC_LIVEKIT_URL` - LiveKit Go server base URL

**Go E2E Server (env vars, no .env file):**
- `CLERK_SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `SENTRY_DSN`, `PORT` (default 8080)

**Go LiveKit Server (see `apps/livekit-server/internal/config/config.go`):**
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_HOST`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `REDIS_URL`
- `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ENDPOINT` (for egress)
- `SENTRY_DSN`, `NESTJS_BASE_URL`, `INTERNAL_SERVICE_KEY`, `PORT` (default 8081)

---

*Integration audit: 2026-03-30*
