# Architecture

**Analysis Date:** 2026-03-30

## Pattern Overview

**Overall:** Monorepo with modular monolith (NestJS) + Go microservices + React Native mobile client

**Key Characteristics:**
- npm workspaces monorepo at root (`package.json` with `"workspaces": ["apps/*", "packages/*"]`)
- NestJS API serves as the primary backend (REST + WebSocket), handling ~80 domain modules
- Two standalone Go microservices extracted for scale-sensitive paths (E2E encryption, LiveKit calls)
- All three backends share the same Neon PostgreSQL database and Upstash Redis
- All three backends authenticate via Clerk JWT verification (same `CLERK_SECRET_KEY`)
- Mobile client communicates with all three backends independently over HTTPS
- Real-time messaging uses Socket.io (NestJS) with Redis pub/sub adapter for horizontal scaling
- Real-time media (calls) uses LiveKit Cloud SFU, managed by the Go livekit-server

## Services

### NestJS API (`apps/api/`)

**Purpose:** Primary backend. REST API + WebSocket gateway for all CRUD, social features, messaging, notifications, feed, payments, moderation, admin.

**Entry Point:** `apps/api/src/main.ts`

**Module Root:** `apps/api/src/app.module.ts` (imports 79 feature modules)

**Layers:**
- **Controllers** (`apps/api/src/modules/*/[name].controller.ts`): HTTP route handlers. One per module. Use `@UseGuards(ClerkAuthGuard)` for auth, `@CurrentUser('id')` for extracting userId.
- **Services** (`apps/api/src/modules/*/[name].service.ts`): Business logic. Injected with `PrismaService` and `Redis`. Called by controllers and by other services.
- **DTOs** (`apps/api/src/modules/*/dto/`): Request validation via `class-validator`. Global `ValidationPipe` enforces whitelist + transform.
- **Gateway** (`apps/api/src/gateways/chat.gateway.ts`): Single Socket.io WebSocket gateway at `/chat` namespace. Handles messaging, typing indicators, presence, read receipts, Quran rooms.
- **Common** (`apps/api/src/common/`): Cross-cutting concerns (guards, interceptors, filters, middleware, pipes, decorators, queue processors, services).
- **Config** (`apps/api/src/config/`): PrismaModule (global), RedisModule (global), Sentry, Socket.io Redis adapter.

**Data Access:**
- Prisma ORM via globally-provided `PrismaService`
- Redis via globally-provided `'REDIS'` injection token (ioredis)
- 209 Prisma models, 84 enums in `apps/api/prisma/schema.prisma` (5,037 lines)

**Request Pipeline:**
1. `CorrelationIdMiddleware` assigns X-Correlation-ID
2. `SecurityHeadersMiddleware` sets HSTS, X-Content-Type-Options, etc.
3. `RequestLoggerMiddleware` logs request details (pino)
4. `ResponseTimeMiddleware` measures latency
5. `SanitizePipe` strips XSS from all string inputs
6. `ValidationPipe` validates DTOs (whitelist, transform)
7. `ClerkAuthGuard` verifies JWT, loads user from DB, checks ban/deactivation
8. Controller handler executes
9. `TransformInterceptor` wraps response in `{ success: true, data: T, timestamp }`
10. `MetricsInterceptor` records request latency
11. `HttpExceptionFilter` catches errors, returns structured error JSON

**Background Processing:**
- BullMQ queue via `apps/api/src/common/queue/queue.module.ts`
- 6 processors: `ai-tasks`, `analytics`, `media`, `notification`, `search-indexing`, `webhook`
- Located in `apps/api/src/common/queue/processors/`

### Go E2E Key Server (`apps/e2e-server/`)

**Purpose:** Manages Signal Protocol key material (identity keys, signed pre-keys, one-time pre-keys, sender keys, key transparency Merkle tree). Never sees plaintext messages or private keys.

**Entry Point:** `apps/e2e-server/cmd/server/main.go`

**Architecture:** Single-package Go service. `net/http.ServeMux` routing. No framework.
- **Handler** (`apps/e2e-server/internal/handler/handler.go`): All HTTP handlers in one file. Pattern: extract userId from context -> validate request -> call store -> return JSON.
- **Store** (`apps/e2e-server/internal/store/postgres.go`): pgx v5 connection pool. Raw SQL. Merkle tree caching with `sync.RWMutex`.
- **Middleware** (`apps/e2e-server/internal/middleware/auth.go`): Clerk JWT verification via `clerk-sdk-go`. Rate limiter via Redis.
- **Model** (`apps/e2e-server/internal/model/types.go`): Request/response structs.

**Endpoints:** 13 auth-protected + 1 health. Base path: `/api/v1/e2e/`
- Identity keys, signed pre-keys, one-time pre-keys, pre-key bundles, sender keys, device listing, key transparency proofs, device link verification

**Port:** 8080 (default)

### Go LiveKit Call Server (`apps/livekit-server/`)

**Purpose:** Call lifecycle management (room create/delete, token generation, participant tracking, webhooks from LiveKit Cloud, egress/ingress, call history). Never sees call media.

**Entry Point:** `apps/livekit-server/cmd/server/main.go`

**Architecture:** Same pattern as E2E server. `net/http.ServeMux` routing.
- **Handler** (`apps/livekit-server/internal/handler/handler.go`): HTTP handlers. Uses LiveKit server SDK (`lksdk.RoomServiceClient`, `EgressClient`, `IngressClient`).
- **Store** (`apps/livekit-server/internal/store/store.go`): pgx v5 raw SQL. Implements `Querier` interface (`apps/livekit-server/internal/store/iface.go`) for testability.
- **Config** (`apps/livekit-server/internal/config/config.go`): Struct-based config loaded from env vars with required-field validation.
- **Middleware** (`apps/livekit-server/internal/middleware/`): Clerk auth, rate limiting, request ID generation.
- **Model** (`apps/livekit-server/internal/model/types.go`): Domain types.

**Endpoints:** 16 auth-protected + 1 webhook (HMAC-validated) + 1 health. Base path: `/api/v1/calls/`
- Rooms (create, delete, leave, participants, kick, mute)
- Token generation
- History, active call, session lookup
- Egress (start/stop recording)
- Ingress (create/delete broadcast)
- LiveKit webhook receiver

**Port:** 8081 (default)

### React Native Mobile App (`apps/mobile/`)

**Purpose:** Cross-platform mobile client (iOS + Android). Expo SDK 52 with expo-router file-based routing.

**Entry Point:** `apps/mobile/app/_layout.tsx` (root layout)

**Architecture:** File-based routing with feature-organized services.
- **Screens** (`apps/mobile/app/`): 218 screen files. 4 route groups: `(tabs)`, `(screens)`, `(auth)`, `onboarding`.
- **Services** (`apps/mobile/src/services/`): API clients and domain logic. Main API client in `api.ts` (1,536 lines). Specialized API files for each domain.
- **Hooks** (`apps/mobile/src/hooks/`): 28 custom hooks for cross-cutting behavior.
- **Components** (`apps/mobile/src/components/`): Shared UI in `ui/` (48 components), feature components in `saf/`, `bakra/`, `majlis/`, `risalah/`, `story/`, `editor/`, `islamic/`, `web/`.
- **Store** (`apps/mobile/src/store/index.ts`): Zustand store with `persist` middleware (AsyncStorage). Single global store for auth, theme, network, notifications, feed state, active call, etc.
- **Providers** (`apps/mobile/src/providers/SocketProvider.tsx`): Single shared Socket.io connection. Wraps entire app.

### Shared Package (`packages/shared/`)

**Purpose:** Constants shared between API and mobile (app name, limits, validation constraints).

**Entry Point:** `packages/shared/src/index.ts`

**Contents:** `APP_NAME`, `LIMITS` object (username length, caption max, carousel max, etc.)

### Workers (`workers/exif-stripper/`)

**Purpose:** Cloudflare Worker that strips EXIF metadata from uploaded images for privacy.

**Runtime:** Cloudflare Workers (Wrangler-deployed).

## Data Flow

### Mobile -> NestJS API (REST):

1. Mobile `ApiClient` (`apps/mobile/src/services/api.ts`) sends HTTP request
2. Auth token from Clerk via `SecureStore` is attached as `Authorization: Bearer <jwt>`
3. API URL: `EXPO_PUBLIC_API_URL` (default `http://localhost:3000/api/v1`)
4. Response envelope: `{ success: true, data: T, timestamp }` or `{ success: true, data: T[], meta: { cursor, hasMore }, timestamp }`
5. Pagination: cursor-based. Client passes `?cursor=<id>`, receives `meta.cursor` for next page.
6. Errors: `ApiError` (typed with status code) or `ApiNetworkError` (no connectivity)
7. 401 retry: auto-refresh Clerk token via `forceRefreshToken`, retry once. If still 401, navigate to sign-in.

### Mobile -> NestJS API (WebSocket):

1. `SocketProvider` (`apps/mobile/src/providers/SocketProvider.tsx`) manages single Socket.io connection
2. Connects to `SOCKET_URL` (derived from API URL, namespace `/chat`)
3. Auth via `auth.token` in handshake
4. Events: `send_message`, `join_conversation`, `typing`, `read`, `message_delivered`, Quran room sync
5. Server-side: `ChatGateway` (`apps/api/src/gateways/chat.gateway.ts`) validates, persists, broadcasts
6. Redis pub/sub adapter enables multiple NestJS instances to share WebSocket events

### Mobile -> Go E2E Server:

1. Signal service (`apps/mobile/src/services/signal/`) calls E2E server directly
2. API client in `apps/mobile/src/services/signal/e2eApi.ts`
3. Base URL: `EXPO_PUBLIC_E2E_URL`
4. Same Clerk JWT for auth (both servers verify against same Clerk instance)
5. Operations: register identity keys, upload pre-keys, fetch pre-key bundles, store/get sender keys, transparency proofs

### Mobile -> Go LiveKit Server:

1. LiveKit API client (`apps/mobile/src/services/livekit.ts`) calls LiveKit server
2. Base URL: `EXPO_PUBLIC_LIVEKIT_URL` (default `https://livekit.mizanly.app/api/v1`)
3. Same Clerk JWT for auth
4. Operations: create room, get token, delete room, leave room, history, active call
5. Response includes E2EE key material (server-mediated, not true E2EE)

### Go LiveKit Server -> NestJS API (Server-to-Server):

1. LiveKit server sends push notification requests to NestJS for incoming call alerts
2. Endpoint: `POST /api/v1/internal/push-to-users` (`apps/api/src/modules/notifications/internal-push.controller.ts`)
3. Auth: `X-Internal-Key` header validated against `INTERNAL_SERVICE_KEY` env var
4. No Clerk JWT -- this is a trusted internal service call
5. NestJS `PushService` delivers push notifications to user devices

### LiveKit Cloud -> Go LiveKit Server (Webhooks):

1. LiveKit Cloud SFU sends room events to `POST /api/v1/webhooks/livekit`
2. Validated via HMAC using `LIVEKIT_API_SECRET`
3. No Clerk auth -- webhook is verified by LiveKit SDK
4. Events handled: room_started, room_finished, participant_joined, participant_left, egress_ended
5. Server updates call session status, participant records, duration in PostgreSQL

### Mobile -> LiveKit Cloud (WebRTC):

1. Mobile `useLiveKitCall` hook (`apps/mobile/src/hooks/useLiveKitCall.ts`) connects to LiveKit Cloud
2. Uses LiveKit React Native SDK (`@livekit/react-native`)
3. Room connection token from Go LiveKit server
4. SFrame E2EE: key from server, applied via `RNE2EEManager` + `RNKeyProvider`
5. Media flows directly between mobile and LiveKit SFU (Go server never touches media)

## State Management

**Server-side:**
- PostgreSQL (Neon): persistent data. 209 models via Prisma ORM (NestJS) or raw pgx SQL (Go services)
- Redis (Upstash): ephemeral state. Presence, rate limiting, typing indicators, queue jobs, notification dedup, AB test assignments, session signals, Quran room state, webhook dedup

**Client-side:**
- Zustand store (`apps/mobile/src/store/index.ts`): global app state (auth, theme, network, active call, etc.). Persisted to AsyncStorage.
- React Query (`QueryClient`): server state cache. 5min staleTime, 10min gcTime, refetchOnWindowFocus.
- MMKV: encrypted local storage for Signal Protocol sessions, keys, message cache, search index (AEAD-encrypted per value)
- SecureStore (expo-secure-store): Clerk tokens, identity signing keys (hardware-backed keychain)

## Key Abstractions

### API Module Pattern:
- Purpose: Encapsulate a domain feature (posts, messages, users, etc.)
- Location: `apps/api/src/modules/{name}/`
- Files: `{name}.module.ts`, `{name}.controller.ts`, `{name}.service.ts`, `dto/`, `*.spec.ts`
- Pattern: Module imports dependencies, registers controller + service. Controller handles HTTP, service handles logic + DB. Module exports service for cross-module use.
- Example: `apps/api/src/modules/posts/posts.module.ts` imports NotificationsModule, GamificationModule, AiModule, ModerationModule

### Go Handler Pattern:
- Purpose: HTTP request handling in Go microservices
- Location: `apps/{service}/internal/handler/handler.go`
- Pattern: Single `Handler` struct holding DB store, Redis, rate limiter, config, logger. Each endpoint is a method on Handler. Extract userId from context, parse body, call store, return JSON.
- Store accessed via interface (`Querier`) for testability in livekit-server. Concrete struct in e2e-server.

### Mobile Service API Pattern:
- Purpose: Typed API clients for each backend feature
- Location: `apps/mobile/src/services/{name}Api.ts` or feature-specific file
- Pattern: Export object with methods. Each method calls `api.get/post/patch/delete` with typed response. Main client in `apps/mobile/src/services/api.ts` has `postsApi`, `messagesApi`, `usersApi`, etc. Specialized files for domains added later.

### Signal Protocol Service:
- Purpose: E2E encryption for all messages
- Location: `apps/mobile/src/services/signal/` (22 files, ~10K lines)
- Entry: `apps/mobile/src/services/signal/index.ts` exports `signalService` singleton
- Pattern: Facade pattern. `index.ts` orchestrates sub-modules (prekeys, session, x3dh, double-ratchet, sender-keys, media-crypto, safety-numbers, sealed-sender, pqxdh, etc.)
- Consumers import only `signalService` from `@/services/signal`

## Entry Points

### NestJS API:
- Location: `apps/api/src/main.ts`
- Triggers: HTTP requests to `:3000/api/v1/*`, WebSocket connections to `:3000/chat`
- Responsibilities: Bootstrap NestJS app, configure middleware pipeline, Swagger (dev only), Redis adapter for Socket.io, graceful shutdown

### Mobile App:
- Location: `apps/mobile/app/_layout.tsx`
- Triggers: App launch
- Responsibilities: Initialize LiveKit globals, CallKit, Sentry, GIPHY. Configure Clerk auth, React Query, Socket.io provider. File-based routing via expo-router Stack navigator.

### Go E2E Server:
- Location: `apps/e2e-server/cmd/server/main.go`
- Triggers: HTTP requests to `:8080/api/v1/e2e/*`
- Responsibilities: Connect to PostgreSQL + Redis, register routes on `http.ServeMux`, daily signed pre-key cleanup, graceful shutdown

### Go LiveKit Server:
- Location: `apps/livekit-server/cmd/server/main.go`
- Triggers: HTTP requests to `:8081/api/v1/calls/*`, LiveKit Cloud webhooks
- Responsibilities: Connect to PostgreSQL + Redis + LiveKit SDK, register routes, 30s stale ringing session cleanup ticker, graceful shutdown

## Error Handling

**NestJS API Strategy:** Exception filters + structured responses
- `HttpExceptionFilter` (`apps/api/src/common/filters/http-exception.filter.ts`): Catches all NestJS exceptions, returns `{ success: false, statusCode, message, timestamp, path }`
- Business errors: throw `NotFoundException`, `ForbiddenException`, `BadRequestException`, etc.
- Validation errors: Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true`
- Unhandled: Sentry captures via `initSentry()` in `apps/api/src/config/sentry.ts`

**Go Microservices Strategy:** HTTP status codes + JSON error body
- Helper `writeError(w, status, message)` returns `{"error": "message"}`
- No exception framework. Explicit error returns from store -> handler checks and writes appropriate status.
- Sentry via `sentryhttp.Handler` middleware wrapping each route

**Mobile Strategy:** Error classes + toast + retry
- `ApiError` (typed with HTTP status) and `ApiNetworkError` in `apps/mobile/src/services/api.ts`
- Global mutation `onError` in React Query shows toast
- 401 auto-retry with fresh Clerk token
- Network errors retried 3 times with exponential backoff
- `ErrorBoundary` component wraps entire app for React render crashes
- `ScreenErrorBoundary` for individual screen-level error containment

## Cross-Cutting Concerns

**Logging:**
- NestJS: `nestjs-pino` (structured JSON in production, pretty-print in dev). Redacts `authorization` and `cookie` headers.
- Go: `log/slog` with JSON handler.
- Mobile: `console.warn` in `__DEV__` mode. Sentry for production crash/error capture.

**Validation:**
- NestJS: `class-validator` DTOs + global `ValidationPipe` + `SanitizePipe` (XSS)
- Go: Manual validation in handlers (check required fields, length limits)
- Mobile: TypeScript types at compile time. Runtime validation in Signal Protocol crypto operations.

**Authentication:**
- Clerk JWT across all services. Same `CLERK_SECRET_KEY`.
- NestJS: `ClerkAuthGuard` verifies token, loads user from DB, checks ban/deactivation state.
- Go: `middleware.RequireAuth()` wrapping `clerkhttp.RequireHeaderAuthorization()`.
- Internal: Go -> NestJS uses `X-Internal-Key` header (shared `INTERNAL_SERVICE_KEY`).
- Mobile: `@clerk/clerk-expo` manages token lifecycle. Token stored in `SecureStore`.

**Rate Limiting:**
- NestJS: `@nestjs/throttler` with Redis storage. Default 100 req/min. Per-endpoint overrides via `@Throttle()`.
- Go: Custom `middleware.RateLimiter` backed by Redis.

**Observability:**
- Sentry in all three backends + mobile client
- `MetricsInterceptor` in NestJS records request latency
- `ResponseTimeMiddleware` adds `X-Response-Time` header
- `CorrelationIdMiddleware` propagates `X-Correlation-ID` through request chain

**Response Envelope:**
- NestJS: `TransformInterceptor` wraps all responses in `{ success: true, data: T, timestamp }`. Paginated responses get `{ success: true, data: T[], meta: { cursor, hasMore }, timestamp }`.
- Go: Manual JSON marshaling with `success` field.

## 5-Space Content Architecture

The platform organizes content into 5 "spaces" (reflected in the `ContentSpace` Prisma enum):

| Space | Tab | Concept | API Module | Tab Screen |
|-------|-----|---------|------------|------------|
| Saf | Feed | Instagram-style photo/text posts | `apps/api/src/modules/posts/` | `apps/mobile/app/(tabs)/saf.tsx` |
| Bakra | Reels | TikTok-style short videos | `apps/api/src/modules/reels/` | `apps/mobile/app/(tabs)/bakra.tsx` |
| Majlis | Threads | X/Twitter-style microblog | `apps/api/src/modules/threads/` | `apps/mobile/app/(tabs)/majlis.tsx` |
| Minbar | Videos | YouTube-style long videos | `apps/api/src/modules/videos/`, `channels/` | `apps/mobile/app/(tabs)/minbar.tsx` |
| Risalah | Messages | WhatsApp-style messaging | `apps/api/src/modules/messages/`, gateway | `apps/mobile/app/(tabs)/risalah.tsx` |

---

*Architecture analysis: 2026-03-30*
