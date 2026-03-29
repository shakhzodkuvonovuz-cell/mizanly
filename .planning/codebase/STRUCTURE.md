# Codebase Structure

**Analysis Date:** 2026-03-30

## Directory Layout

```
mizanly/
├── apps/
│   ├── api/                    # NestJS backend (REST + WebSocket)
│   ├── mobile/                 # React Native Expo SDK 52 client
│   ├── e2e-server/             # Go E2E Key Server (Signal Protocol)
│   ├── livekit-server/         # Go LiveKit Call Server
│   └── landing/                # Static landing page (Cloudflare Pages)
├── packages/
│   └── shared/                 # Shared constants (app name, limits)
├── workers/
│   └── exif-stripper/          # Cloudflare Worker (EXIF metadata removal)
├── scripts/                    # CI helper scripts (ci-lint.sh, ci-test.sh)
├── docs/                       # Architecture docs, audit reports, plans
├── design-samples/             # Design reference files
├── .claude/                    # Claude Code rules and settings
│   └── rules/                  # File-type-specific auto-loaded rules
├── .github/
│   └── workflows/ci.yml        # CI pipeline (lint, typecheck, test, build)
├── .planning/
│   └── codebase/               # GSD codebase analysis documents
├── package.json                # Root monorepo config (npm workspaces)
├── docker-compose.yml          # Local dev services (PostgreSQL, Redis)
├── app.json                    # Expo app config
├── CLAUDE.md                   # Project instructions for Claude
└── README.md                   # Project readme
```

## apps/api/ (NestJS Backend)

```
apps/api/
├── src/
│   ├── main.ts                         # Entry point: bootstrap, middleware, Swagger
│   ├── app.module.ts                   # Root module: imports all 79 feature modules
│   ├── config/
│   │   ├── prisma.module.ts            # Global PrismaModule
│   │   ├── prisma.service.ts           # PrismaService (extends PrismaClient)
│   │   ├── redis.module.ts             # Global RedisModule (ioredis)
│   │   ├── sentry.ts                   # Sentry initialization
│   │   └── socket-io-adapter.ts        # Redis adapter for Socket.io horizontal scaling
│   ├── common/
│   │   ├── constants/
│   │   │   └── feed-scoring.ts         # Feed ranking algorithm constants
│   │   ├── decorators/
│   │   │   └── current-user.decorator.ts  # @CurrentUser('id') param decorator
│   │   ├── dto/                        # Shared DTOs (pagination, etc.)
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts   # Global exception -> JSON response
│   │   ├── guards/
│   │   │   ├── clerk-auth.guard.ts        # JWT verification + user load + ban check
│   │   │   ├── optional-clerk-auth.guard.ts # Auth optional (anonymous browsing)
│   │   │   └── user-throttler.guard.ts    # Per-user rate limiting
│   │   ├── interceptors/
│   │   │   ├── transform.interceptor.ts   # Wrap in { success, data, timestamp }
│   │   │   └── metrics.interceptor.ts     # Request latency tracking
│   │   ├── middleware/
│   │   │   ├── correlation-id.middleware.ts  # X-Correlation-ID propagation
│   │   │   ├── correlation-id.store.ts      # AsyncLocalStorage for correlation IDs
│   │   │   ├── request-logger.middleware.ts  # Request logging (pino)
│   │   │   ├── response-time.middleware.ts   # X-Response-Time header
│   │   │   └── security-headers.middleware.ts # HSTS, X-Content-Type-Options, etc.
│   │   ├── pipes/
│   │   │   └── sanitize.pipe.ts           # XSS sanitization on all string inputs
│   │   ├── queue/
│   │   │   ├── queue.module.ts            # BullMQ queue configuration
│   │   │   ├── queue.service.ts           # Queue producer service
│   │   │   ├── with-correlation.ts        # Correlation ID propagation in jobs
│   │   │   └── processors/               # 6 queue consumers
│   │   │       ├── ai-tasks.processor.ts
│   │   │       ├── analytics.processor.ts
│   │   │       ├── media.processor.ts
│   │   │       ├── notification.processor.ts
│   │   │       ├── search-indexing.processor.ts
│   │   │       └── webhook.processor.ts
│   │   ├── services/                     # Shared platform services
│   │   │   ├── ab-testing.service.ts       # A/B test assignment
│   │   │   ├── analytics.service.ts        # Analytics event tracking
│   │   │   ├── async-jobs.service.ts       # Async job runner
│   │   │   ├── circuit-breaker.service.ts  # Circuit breaker for external calls
│   │   │   ├── counter-reconciliation.service.ts  # Count accuracy reconciliation
│   │   │   ├── email.service.ts            # Resend email client
│   │   │   ├── feature-flags.service.ts    # Feature flag checks
│   │   │   ├── meilisearch-sync.service.ts # Meilisearch index sync
│   │   │   ├── payment-reconciliation.service.ts  # Stripe payment reconciliation
│   │   │   ├── publish-workflow.service.ts # Content publishing workflow
│   │   │   ├── query-diagnostics.service.ts # Slow query detection
│   │   │   └── search-reconciliation.service.ts   # Search index consistency
│   │   ├── test/                         # Shared test utilities
│   │   └── utils/                        # Shared utility functions
│   ├── gateways/
│   │   ├── chat.gateway.ts               # WebSocket gateway (/chat namespace)
│   │   └── dto/                          # WebSocket event DTOs
│   ├── modules/                          # 79 feature modules (see below)
│   ├── integration/                      # Integration test utilities
│   └── types/                            # Shared TypeScript types
├── prisma/
│   ├── schema.prisma                     # Data model (209 models, 84 enums, 5,037 lines)
│   └── migrations/                       # Prisma migrations
├── test/
│   ├── integration/                      # Integration tests (auth, feed, messaging)
│   └── integration-db/                   # DB-level integration tests
├── scripts/                              # Build/deploy scripts
├── package.json                          # API workspace package.json
├── tsconfig.json                         # TypeScript config
└── jest.config.ts                        # Jest test config
```

### API Module List (79 modules in `apps/api/src/modules/`)

Each module follows the same pattern: `{name}.module.ts`, `{name}.controller.ts`, `{name}.service.ts`, `dto/`, `*.spec.ts`

**Content:** `posts`, `stories`, `threads`, `reels`, `videos`, `clips`, `channel-posts`, `video-replies`, `reel-templates`, `story-chains`, `thumbnails`
**Social:** `follows`, `blocks`, `mutes`, `restricts`, `circles`, `communities`, `community` (v2), `community-notes`
**Messaging:** `messages`, `chat-export`
**Media:** `upload`, `audio-tracks`, `playlists`, `subtitles`, `video-editor`, `downloads`
**Engagement:** `bookmarks`, `hashtags`, `polls`, `collabs`, `stickers`
**Discovery:** `feed`, `search`, `recommendations`, `og` (OpenGraph), `embeddings`
**Users:** `users`, `auth`, `settings`, `profile-links`, `alt-profile`, `devices`, `two-factor`, `privacy`
**Notifications:** `notifications` (includes internal push controller)
**Islamic:** `islamic`, `halal`, `mosques`, `scholar-qa`
**Monetization:** `monetization`, `payments`, `commerce`, `gifts`, `promotions`, `creator`
**Platform:** `admin`, `moderation`, `reports`, `gamification`, `retention`, `broadcast`, `live`, `stream`, `audio-rooms`, `events`, `scheduling`, `drafts`, `watch-history`, `majlis-lists`, `parental-controls`, `discord-features`, `telegram-features`, `ai`, `checklists`, `webhooks`, `waitlist`, `health`

## apps/mobile/ (React Native Expo)

```
apps/mobile/
├── app/                                  # File-based routing (expo-router)
│   ├── _layout.tsx                       # Root layout (Clerk, QueryClient, Socket, etc.)
│   ├── (tabs)/                           # Bottom tab navigator
│   │   ├── _layout.tsx                   # Tab bar config (5 tabs)
│   │   ├── saf.tsx                       # Feed (Instagram-style)
│   │   ├── bakra.tsx                     # Reels (TikTok-style)
│   │   ├── minbar.tsx                    # Videos (YouTube-style)
│   │   ├── majlis.tsx                    # Threads (X-style)
│   │   ├── risalah.tsx                   # Messages (WhatsApp-style)
│   │   └── create.tsx                    # Create content
│   ├── (screens)/                        # Push-navigated screens (210+ files)
│   │   ├── _layout.tsx                   # Stack navigator (slide_from_right)
│   │   ├── broadcast/                    # Broadcast-related screens
│   │   ├── call/                         # Call screens
│   │   │   └── [id].tsx                  # Call UI screen (dynamic route)
│   │   ├── channel/                      # Channel screens
│   │   ├── conversation/                 # Chat conversation screens
│   │   ├── followers/                    # Followers list
│   │   ├── following/                    # Following list
│   │   ├── hashtag/                      # Hashtag screens
│   │   ├── live/                         # Live streaming screens
│   │   ├── majlis-list/                  # Majlis list screens
│   │   ├── playlist/                     # Playlist screens
│   │   ├── playlists/                    # Playlists management
│   │   ├── post/                         # Post detail screens
│   │   ├── product/                      # Product screens
│   │   ├── profile/                      # Profile screens
│   │   ├── reel/                         # Reel detail screens
│   │   ├── reports/                      # Report screens
│   │   ├── series/                       # Series screens
│   │   ├── sound/                        # Sound/audio screens
│   │   ├── thread/                       # Thread detail screens
│   │   ├── video/                        # Video detail screens
│   │   ├── settings.tsx                  # Settings screen
│   │   ├── search.tsx                    # Search screen
│   │   ├── notifications.tsx             # Notifications screen
│   │   ├── prayer-times.tsx              # Prayer times
│   │   ├── quran-room.tsx                # Quran collaborative reading
│   │   ├── zakat-calculator.tsx          # Zakat calculator
│   │   ├── video-editor.tsx              # Video editor
│   │   └── ... (180+ more screen files)
│   ├── (auth)/                           # Auth screens
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   ├── sign-up.tsx
│   │   └── forgot-password.tsx
│   └── onboarding/                       # Onboarding flow
│       ├── _layout.tsx
│       ├── username.tsx
│       ├── profile.tsx
│       ├── interests.tsx
│       └── suggested.tsx
├── src/
│   ├── services/
│   │   ├── api.ts                        # Main API client (1,536 lines) — all REST endpoints
│   │   ├── livekit.ts                    # LiveKit Go server API client
│   │   ├── callkit.ts                    # CallKit/ConnectionService native integration
│   │   ├── activeRoomRegistry.ts         # Bridge between CallKit (module scope) and React hook
│   │   ├── encryption.ts                 # E2E message encryption wrapper
│   │   ├── ffmpegEngine.ts              # FFmpeg video processing
│   │   ├── giphyService.ts              # GIPHY SDK wrapper
│   │   ├── nsfwCheck.ts                 # Client-side NSFW detection
│   │   ├── pushNotifications.ts         # Push notification registration
│   │   ├── widgetData.ts               # iOS/Android widget data sync
│   │   ├── downloadManager.ts           # Offline content download manager
│   │   ├── signal/                       # Signal Protocol E2E encryption (22 files)
│   │   │   ├── index.ts                  # Public facade (signalService)
│   │   │   ├── crypto.ts                 # Crypto primitives (AEAD, HKDF, HMAC)
│   │   │   ├── x3dh.ts                   # Extended Triple DH key agreement
│   │   │   ├── double-ratchet.ts         # Double Ratchet Algorithm
│   │   │   ├── sender-keys.ts            # Group messaging sender keys
│   │   │   ├── sealed-sender.ts          # Sealed sender (hide sender from server)
│   │   │   ├── pqxdh.ts                  # Post-quantum hybrid (ML-KEM-768)
│   │   │   ├── session.ts                # Session management
│   │   │   ├── prekeys.ts                # Pre-key generation and upload
│   │   │   ├── storage.ts                # MMKV encrypted storage
│   │   │   ├── safety-numbers.ts         # Safety number computation
│   │   │   ├── key-transparency.ts       # Key transparency verification
│   │   │   ├── media-crypto.ts           # Media file encryption
│   │   │   ├── streaming-upload.ts       # Encrypted media upload
│   │   │   ├── message-cache.ts          # Encrypted message cache
│   │   │   ├── search-index.ts           # Encrypted search index
│   │   │   ├── offline-queue.ts          # Offline message queue
│   │   │   ├── multi-device.ts           # Multi-device support
│   │   │   ├── notification-handler.ts   # Encrypted notification handler
│   │   │   ├── native-crypto-adapter.ts  # react-native-quick-crypto adapter
│   │   │   ├── telemetry.ts              # Crypto performance telemetry
│   │   │   ├── e2eApi.ts                 # E2E server HTTP client
│   │   │   └── types.ts                  # Signal Protocol types
│   │   ├── __tests__/                    # Service-level tests
│   │   └── {domain}Api.ts               # Domain-specific API clients (15+ files)
│   ├── hooks/
│   │   ├── useLiveKitCall.ts             # Core call hook (~700 lines)
│   │   ├── useThemeColors.ts             # Theme-aware color tokens
│   │   ├── useContextualHaptic.ts        # Haptic feedback (branded)
│   │   ├── useTranslation.ts             # i18n hook
│   │   ├── usePushNotifications.ts       # Push notification registration
│   │   ├── useNetworkStatus.ts           # Online/offline detection
│   │   ├── useIslamicTheme.ts            # Islamic calendar theming
│   │   ├── useTTS.ts                     # Text-to-speech
│   │   ├── usePiP.ts                     # Picture-in-picture
│   │   ├── useReducedMotion.ts           # Accessibility: reduced motion
│   │   ├── useResponsive.ts              # Responsive layout (phone/tablet/desktop)
│   │   ├── __tests__/                    # Hook tests (49 tests for LiveKit/call)
│   │   └── ... (28 hooks total)
│   ├── components/
│   │   ├── ui/                           # Shared UI components (48 components)
│   │   │   ├── Icon.tsx                  # Icon component (lucide-react-native)
│   │   │   ├── BottomSheet.tsx           # Bottom sheet modal
│   │   │   ├── EmptyState.tsx            # Empty state placeholder
│   │   │   ├── ProgressiveImage.tsx      # Progressive image loading
│   │   │   ├── BrandedRefreshControl.tsx # Themed pull-to-refresh
│   │   │   ├── Skeleton.tsx              # Loading skeleton
│   │   │   ├── Toast.tsx                 # Toast notification system
│   │   │   ├── GradientButton.tsx        # Primary action button
│   │   │   ├── Avatar.tsx                # User avatar
│   │   │   ├── Badge.tsx                 # Notification badge
│   │   │   ├── CallActiveBar.tsx         # Floating active call indicator
│   │   │   ├── VideoPlayer.tsx           # Video player
│   │   │   ├── MiniPlayer.tsx            # Audio mini player
│   │   │   ├── TTSMiniPlayer.tsx         # Text-to-speech mini player
│   │   │   └── ... (34 more components)
│   │   ├── saf/                          # Feed components
│   │   │   ├── PostCard.tsx              # Post card
│   │   │   ├── PostMedia.tsx             # Post media renderer
│   │   │   ├── StoryBubble.tsx           # Story bubble avatar
│   │   │   └── StoryRow.tsx              # Story row (horizontal scroll)
│   │   ├── bakra/
│   │   │   └── CommentsSheet.tsx         # Reel comments bottom sheet
│   │   ├── majlis/
│   │   │   └── ThreadCard.tsx            # Thread card component
│   │   ├── risalah/                      # Messaging components
│   │   │   ├── StickerPackBrowser.tsx
│   │   │   ├── StickerPicker.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   └── VoiceWaveform.tsx
│   │   ├── story/                        # Story sticker/editor components (14 files)
│   │   │   ├── AddYoursSticker.tsx
│   │   │   ├── DrawingCanvas.tsx
│   │   │   ├── MusicPicker.tsx
│   │   │   ├── PollSticker.tsx
│   │   │   └── ... (10 more stickers/editors)
│   │   ├── editor/                       # Video editor components
│   │   │   ├── VideoTimeline.tsx
│   │   │   └── VideoTransitions.tsx
│   │   ├── islamic/
│   │   │   └── EidFrame.tsx              # Eid celebration frame
│   │   ├── web/                          # Web-specific layout
│   │   │   ├── WebLayout.tsx
│   │   │   └── WebSidebar.tsx
│   │   └── ErrorBoundary.tsx             # React error boundary
│   ├── store/
│   │   └── index.ts                      # Zustand global store (single file)
│   ├── providers/
│   │   └── SocketProvider.tsx            # Single shared Socket.io connection
│   ├── i18n/                             # Internationalization (8 languages)
│   │   ├── index.ts                      # i18next config
│   │   ├── en.json                       # English
│   │   ├── ar.json                       # Arabic
│   │   ├── tr.json                       # Turkish
│   │   ├── ur.json                       # Urdu
│   │   ├── bn.json                       # Bengali
│   │   ├── fr.json                       # French
│   │   ├── id.json                       # Indonesian
│   │   └── ms.json                       # Malay
│   ├── theme/
│   │   ├── index.ts                      # Theme tokens (colors, spacing, fonts, radius, animation)
│   │   ├── islamicThemes.ts              # Islamic calendar theme overrides
│   │   └── highContrast.ts               # High contrast accessibility theme
│   ├── types/
│   │   ├── index.ts                      # Main app types (Post, User, Message, etc.)
│   │   └── {domain}.ts                   # Domain-specific types (15+ files)
│   ├── utils/
│   │   ├── deepLinking.ts                # Deep link handler
│   │   ├── navigation.ts                 # Navigation helpers (imperative navigate)
│   │   ├── formatCount.ts                # Number formatting (1.2K, 3.4M)
│   │   ├── hijri.ts                      # Hijri calendar utilities
│   │   ├── feedCache.ts                  # Feed caching
│   │   ├── offlineQueue.ts               # Offline action queue
│   │   ├── image.ts                      # Image processing
│   │   ├── blurhash.ts                   # BlurHash utilities
│   │   ├── performance.ts                # Performance monitoring
│   │   ├── platform.ts                   # Platform detection
│   │   ├── rtl.ts                        # RTL layout helpers
│   │   ├── sentry.ts                     # Sentry helpers
│   │   └── ... (16 files total)
│   ├── config/
│   │   ├── sentry.ts                     # Sentry initialization
│   │   └── image.ts                      # Image config (dimensions, quality)
│   └── constants/
│       └── accessibilityHints.ts         # Accessibility hint strings
├── plugins/                              # Expo config plugins (native module config)
│   ├── certificate-pinning/              # TLS cert pinning plugin
│   ├── ffmpeg-kit/                       # FFmpeg native module
│   ├── giphy-sdk/                        # GIPHY SDK native module
│   ├── notification-service-extension/   # iOS notification rich media
│   ├── share-extension/                  # iOS/Android share extension
│   └── widgets/                          # iOS/Android widget extension
├── assets/
│   ├── images/                           # Static images
│   └── sounds/                           # Audio files
├── app-store-metadata/                   # App store listing content
├── app.json                              # Expo config
├── package.json                          # Mobile workspace package.json
└── tsconfig.json                         # TypeScript config
```

## apps/e2e-server/ (Go E2E Key Server)

```
apps/e2e-server/
├── cmd/
│   └── server/
│       └── main.go                       # Entry point: DB, Redis, routes, graceful shutdown
├── internal/
│   ├── handler/
│   │   ├── handler.go                    # All HTTP handlers (identity, prekeys, bundles, sender keys, transparency)
│   │   └── handler_test.go               # Handler unit tests
│   ├── middleware/
│   │   └── auth.go                       # Clerk JWT auth + rate limiter
│   ├── model/
│   │   └── types.go                      # Request/response structs
│   └── store/
│       └── postgres.go                   # pgx v5 store (raw SQL, Merkle tree cache)
├── go.mod
└── go.sum
```

## apps/livekit-server/ (Go LiveKit Call Server)

```
apps/livekit-server/
├── cmd/
│   └── server/
│       └── main.go                       # Entry point: config, DB, Redis, LiveKit SDK, routes
├── internal/
│   ├── config/
│   │   └── config.go                     # Env-based config struct with validation
│   ├── handler/
│   │   ├── handler.go                    # All HTTP handlers (rooms, tokens, webhooks, egress, ingress, history)
│   │   ├── handler_test.go               # Handler unit tests (105 tests)
│   │   └── mock_store_test.go            # Mock store implementing Querier interface
│   ├── middleware/
│   │   ├── auth.go                       # Clerk JWT auth
│   │   ├── auth_test.go                  # Auth middleware tests
│   │   ├── ratelimit.go                  # Redis-backed rate limiter
│   │   ├── ratelimit_test.go             # Rate limiter tests
│   │   └── requestid.go                  # X-Request-ID generation
│   ├── model/
│   │   └── types.go                      # CallSession, Participant, E2EEMaterial structs
│   └── store/
│       ├── iface.go                      # Querier interface (for testability)
│       └── store.go                      # pgx v5 PostgreSQL store (raw SQL)
├── go.mod
└── go.sum
```

## Key File Locations

### Entry Points
- `apps/api/src/main.ts`: NestJS API bootstrap
- `apps/mobile/app/_layout.tsx`: Mobile app root layout
- `apps/e2e-server/cmd/server/main.go`: E2E Key Server
- `apps/livekit-server/cmd/server/main.go`: LiveKit Call Server

### Configuration
- `apps/api/prisma/schema.prisma`: Database schema (209 models)
- `apps/api/src/config/`: PrismaModule, RedisModule, Sentry, Socket.io adapter
- `apps/livekit-server/internal/config/config.go`: LiveKit server env config
- `apps/mobile/src/theme/index.ts`: Theme tokens (colors, spacing, fonts, radius)
- `apps/mobile/src/i18n/index.ts`: i18next configuration
- `.github/workflows/ci.yml`: CI pipeline

### Core Logic
- `apps/api/src/gateways/chat.gateway.ts`: WebSocket messaging gateway
- `apps/api/src/modules/feed/feed.service.ts`: Feed ranking algorithm
- `apps/mobile/src/services/api.ts`: Main API client (all REST endpoints)
- `apps/mobile/src/services/signal/`: Signal Protocol E2E encryption (22 files)
- `apps/mobile/src/hooks/useLiveKitCall.ts`: Call hook (~700 lines)
- `apps/mobile/src/services/callkit.ts`: CallKit/ConnectionService integration
- `apps/mobile/src/store/index.ts`: Zustand global state

### Authentication
- `apps/api/src/common/guards/clerk-auth.guard.ts`: NestJS JWT guard
- `apps/e2e-server/internal/middleware/auth.go`: Go E2E auth middleware
- `apps/livekit-server/internal/middleware/auth.go`: Go LiveKit auth middleware
- `apps/api/src/modules/notifications/internal-push.controller.ts`: Go -> NestJS internal auth

### Testing
- `apps/api/src/modules/*/[name].*.spec.ts`: API unit tests (co-located)
- `apps/api/test/integration/`: API integration tests
- `apps/mobile/src/hooks/__tests__/`: Hook tests (call/LiveKit, 49 tests)
- `apps/mobile/src/services/signal/__tests__/`: Signal Protocol tests (633 tests)
- `apps/e2e-server/internal/handler/handler_test.go`: E2E server handler tests
- `apps/livekit-server/internal/handler/handler_test.go`: LiveKit handler tests (105 tests)

## Naming Conventions

### Files

**NestJS API modules:**
- Module: `{name}.module.ts` (e.g., `posts.module.ts`)
- Controller: `{name}.controller.ts` (e.g., `posts.controller.ts`)
- Service: `{name}.service.ts` (e.g., `posts.service.ts`)
- DTOs: `dto/{action}-{name}.dto.ts` (e.g., `dto/create-post.dto.ts`)
- Tests: `{name}.{scope}.spec.ts` (e.g., `posts.service.spec.ts`, `posts.controller.spec.ts`, `posts.service.auth.spec.ts`)
- Multi-word modules: kebab-case directories (e.g., `audio-tracks/`, `channel-posts/`)

**Mobile screens:**
- Tab screens: `apps/mobile/app/(tabs)/{name}.tsx` (e.g., `saf.tsx`, `bakra.tsx`)
- Feature screens: `apps/mobile/app/(screens)/{name}.tsx` (e.g., `prayer-times.tsx`)
- Dynamic routes: `apps/mobile/app/(screens)/{resource}/[id].tsx` (e.g., `post/[id].tsx`)
- Nested routes: `apps/mobile/app/(screens)/{resource}/` directory

**Mobile components:**
- PascalCase: `PostCard.tsx`, `BottomSheet.tsx`, `CallActiveBar.tsx`
- Grouped by feature: `components/saf/`, `components/story/`, `components/risalah/`
- Shared UI: `components/ui/`

**Mobile services:**
- API clients: `{domain}Api.ts` (e.g., `halalApi.ts`, `eventsApi.ts`)
- Main client: `api.ts` (contains all primary domain APIs)
- Non-API services: descriptive name (e.g., `callkit.ts`, `ffmpegEngine.ts`, `downloadManager.ts`)

**Mobile hooks:**
- `use{Name}.ts` in camelCase (e.g., `useThemeColors.ts`, `useLiveKitCall.ts`)
- Tests: `__tests__/` directory adjacent

**Go files:**
- Single package per directory (Go convention)
- `handler.go`, `store.go`, `auth.go`, `config.go`, `types.go`
- Tests: `{name}_test.go` co-located

### Directories
- API modules: kebab-case (`audio-rooms`, `channel-posts`, `community-notes`)
- Mobile screens: kebab-case for files, grouped route dirs (`(tabs)`, `(screens)`, `(auth)`)
- Go packages: single-word (`handler`, `store`, `middleware`, `model`, `config`)

## Where to Add New Code

### New API Feature Module:
1. Create directory: `apps/api/src/modules/{feature-name}/`
2. Create files: `{feature-name}.module.ts`, `{feature-name}.controller.ts`, `{feature-name}.service.ts`
3. Create DTOs: `dto/create-{feature}.dto.ts`, etc.
4. Import module in `apps/api/src/app.module.ts`
5. Add tests: `{feature-name}.controller.spec.ts`, `{feature-name}.service.spec.ts`
6. If it needs new Prisma models: add to `apps/api/prisma/schema.prisma`

### New Mobile Screen:
1. Create file: `apps/mobile/app/(screens)/{screen-name}.tsx`
2. For dynamic routes: `apps/mobile/app/(screens)/{resource}/[id].tsx`
3. Add i18n keys to ALL 8 language files in `apps/mobile/src/i18n/`
4. Use existing components from `apps/mobile/src/components/ui/`
5. Follow theme tokens from `apps/mobile/src/theme/index.ts`

### New Mobile Component:
- Shared UI: `apps/mobile/src/components/ui/{ComponentName}.tsx`
- Feature-specific: `apps/mobile/src/components/{feature}/{ComponentName}.tsx`

### New Mobile Hook:
- `apps/mobile/src/hooks/use{HookName}.ts`
- Tests in `apps/mobile/src/hooks/__tests__/`

### New Mobile Service/API Client:
- Domain API: `apps/mobile/src/services/{domain}Api.ts`
- General service: `apps/mobile/src/services/{name}.ts`
- Tests in `apps/mobile/src/services/__tests__/`

### New API Endpoint on Existing Module:
1. Add method to `apps/api/src/modules/{module}/{module}.service.ts`
2. Add route to `apps/api/src/modules/{module}/{module}.controller.ts`
3. Add DTO if needed: `apps/api/src/modules/{module}/dto/`
4. Add test cases to existing `*.spec.ts`

### New Go Endpoint (E2E or LiveKit):
1. Add handler method to `apps/{service}/internal/handler/handler.go`
2. Add route in `apps/{service}/cmd/server/main.go`
3. Add store method if DB access needed: `apps/{service}/internal/store/`
4. Add model types if needed: `apps/{service}/internal/model/types.go`
5. Add tests in `handler_test.go`

### New Shared Constant:
- `packages/shared/src/index.ts`

### New Background Job:
1. Define processor: `apps/api/src/common/queue/processors/{name}.processor.ts`
2. Register in `apps/api/src/common/queue/queue.module.ts`
3. Enqueue via `QueueService` from any module

### New i18n String:
- Add key to ALL 8 files: `apps/mobile/src/i18n/{en,ar,tr,ur,bn,fr,id,ms}.json`
- Use `Node JSON parse/write` for injection. NEVER use `sed`.

## Special Directories

### `apps/api/prisma/`
- Purpose: Database schema and migrations
- Generated: Prisma Client generated from schema
- Committed: Yes (schema + migrations). Generated client in `node_modules/.prisma/` (not committed).

### `apps/mobile/plugins/`
- Purpose: Expo config plugins for native module configuration
- Generated: No (hand-written)
- Committed: Yes
- Contains: `certificate-pinning`, `ffmpeg-kit`, `giphy-sdk`, `notification-service-extension`, `share-extension`, `widgets`

### `apps/api/dist/`
- Purpose: Compiled NestJS output
- Generated: Yes (from `npm run build`)
- Committed: No (gitignored)

### `apps/mobile/dist/`
- Purpose: Expo web build output
- Generated: Yes
- Committed: No (gitignored)

### `.planning/codebase/`
- Purpose: GSD codebase analysis documents
- Generated: Yes (by Claude Code mapping)
- Committed: Yes

### `docs/audit/`
- Purpose: Security audit reports, findings, remediation tracking
- Generated: No (written during audit sessions)
- Committed: Yes
- Key files: `2026-03-28-e2e-deep-audit-v3.md` (original 33 E2E findings)

### `workers/exif-stripper/`
- Purpose: Cloudflare Worker for EXIF metadata stripping
- Generated: No
- Committed: Yes
- Deployed: Cloudflare Workers (via Wrangler)

---

*Structure analysis: 2026-03-30*
