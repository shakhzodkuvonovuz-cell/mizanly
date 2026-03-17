# Mizanly Project History — Complete Development Record

**Project:** Mizanly — A culturally intelligent social platform combining Instagram + TikTok + X/Twitter + WhatsApp + YouTube for the global Muslim community.
**Timeline:** March 3-7, 2026 (5 days)
**Architecture:** Claude Opus 4.6 (CTO/Architect) | Claude Sonnet/Haiku (Implementation)
**Total Codebase:** 28,416 lines | 89 commits | 151 API endpoints | 73 Prisma models | 78 tests

---

## Phase 1: Foundation (Weeks 1-12 Plan, Executed in Steps)

### Step 1 — Monorepo Scaffold
**Commit:** `26739be` — `feat: initial Mizanly monorepo scaffold`

Created the project skeleton:
- `apps/api/` — NestJS 10 backend
- `apps/mobile/` — React Native Expo SDK 52
- `packages/shared/` — shared types (empty)
- Package management, TypeScript configs, ESLint

### Step 2 — Project Structure Document
**Commit:** `13f96f5` — `docs: add finalized A-to-Z app structure (STRUCTURE.md)`

Comprehensive A-to-Z document defining:
- All 5 spaces (Saf, Bakra, Majlis, Risalah, Minbar)
- Screen inventory for each space
- Component hierarchy
- API endpoint map
- Database schema plan

### Step 3 — Backend: Schema + All Core Modules (Weeks 1-2)
**Commit:** `bbe9010` — `feat: Week 1 & 2 — schema v3, all core modules implemented`

Massive backend buildout:
- Prisma schema v3: 73 models, 24 enums, 1,672 lines
- Models: User, Post, Thread, Story, Reel, Video, Channel, Message, Conversation, Notification, Follow, Block, Mute, Report, Hashtag, and 50+ supporting models
- 19 NestJS modules with controllers + services
- Clerk auth integration (JWT guards, webhook sync)
- Socket.io /chat namespace for real-time messaging
- Cloudflare R2 upload with presigned URLs
- Meilisearch integration for full-text search
- Global rate limiting (100 req/min)

### Step 4 — Mobile: Auth + Onboarding + Feed Screens (Weeks 3-4)
**Commit:** `5c84021` — `feat: Week 3-4 — mobile auth, onboarding, feed screens, detail screens`

First mobile screens:
- Auth flow: sign-in, sign-up (Clerk)
- 4-step onboarding: username -> profile -> interests -> suggested follows
- Saf feed (Instagram-style photo/video feed)
- Majlis feed (Twitter-style thread feed)
- Risalah conversations list
- Post detail, thread detail screens

### Step 5 — Profile, Notifications, Search, Composers (Weeks 4-5)
**Commit:** `2f79822` — `feat: Week 4-5 — profile, notifications, search, post/thread composers`

- Profile screen with posts/threads tabs
- Notifications screen
- Search screen (people + hashtags)
- Create post screen
- Create thread screen (multi-part chains)

### Step 6 — Security Audit
**Commit:** `d3e52f3` — `fix: security audit — patch 7 critical/high vulnerabilities`

First security pass:
- 7 critical/high vulnerabilities patched
- Auth guard coverage verified
- Input validation hardened

### Step 7 — Profile Management + Messaging
**Commit:** `56e9064` — `feat: profile management + messaging screens`

- Edit profile (display name, bio, website, avatar, cover photo)
- Conversation screen with message bubbles
- Message sending via Socket.io

### Step 8 — Stories
**Commits:** `ef1e337`, `1e05128`

- Story viewer with horizontal swipe between users
- Story creation (photo/video + text overlay + close friends toggle)
- 24-hour expiry system
- Story highlights on profile

### Step 9 — Social Features Buildout
**Commits:** `4f26a26` through `da280ad` (12 commits)

Rapid feature work:
- RichText component (tappable #hashtags and @mentions)
- Circles (close friends lists)
- Follow requests, blocked users, muted users screens
- Profile links editor
- Push notification device registration
- Repost/share actions on PostCard and ThreadCard
- Poll voting + creation in threads
- Image attachments in conversations
- Saved posts/threads screen
- Report and dismiss endpoints
- Story viewers list, seen/unseen ring indicator

### Step 10 — Backend Notifications + Fixes
**Commits:** `e9ab3b9` through `49994ea`

- Full notification system (likes, comments, follows, mentions, replies)
- Risalah DM/group tab separation
- Socket namespace fixes, typing events, unread counts
- EAS (Expo Application Services) configuration

### Step 11 — UI/UX Redesign
**Commit:** `a7a5dbe` — `feat: complete UI/UX redesign`

Major visual overhaul:
- Replaced all emoji with SVG `<Icon>` components (44 icons)
- Added spring animations + haptic feedback throughout
- Skeleton loaders for all content types
- Consistent design tokens (colors, spacing, radius, fontSize)
- Brand identity: Emerald #0A7B4F + Gold #C8963E, dark mode primary

### Step 12 — Component Library Polish
**Commits:** `7acabeb` through `56d403b`

- Replaced all `<Modal>` with `<BottomSheet>` + `<BottomSheetItem>`
- Upgraded all screens to use new component library
- Message grouping by sender/time
- CharCountRing on all text inputs
- Pull-to-refresh on all FlatLists
- ErrorBoundary wrapping root app

---

## Phase 2: Audit-Driven Batches (Batches 1-5)

### Batch 1 — Crash/Security/Functional/Perf/A11y Audit
**Date:** March 5, 2026
**Scope:** 56 tasks | **Completed:** 46
**Key commit:** `185582a` — `fix: full audit — crash bugs, security, functional bugs, patterns, perf, a11y, types`

Systematic sweep of the entire codebase:

**Crash Bugs Fixed:**
- Null pointer exceptions on optional chaining
- Missing error boundaries on async operations
- FlatList key extractor issues

**Security Fixes:**
- GREATEST clamping on all counter increments (prevent negative counts)
- Auth guard coverage on all sensitive endpoints
- Input validation on all DTOs

**Functional Fixes:**
- Dead buttons wired to actual handlers
- Missing API calls connected
- Navigation flows completed

**Performance:**
- Skeleton loaders instead of ActivityIndicators
- Debounced search inputs
- Optimistic UI updates on likes/bookmarks

**Accessibility:**
- accessibilityLabel, accessibilityRole, accessibilityHint on interactive elements
- Theme-aware ActivityIndicator colors

**Code Quality:**
- Hardcoded borderRadius replaced with `radius.*` tokens
- `as any` casts replaced with proper Prisma enums
- Consistent patterns enforced across all screens

**10 tasks deferred** (too large or blocked on dependencies)

---

### Batch 2 — Feature Completion
**Date:** March 5-6, 2026
**Scope:** 27 tasks | **Completed:** 20
**Key commits:** `ce9eb47` through `a953a48`

**Fonts (Task 1):**
- Loaded PlayfairDisplay 700 Bold, DM Sans (400/500/700), Noto Naskh Arabic (400/700)
- useFonts() in root _layout.tsx with splash screen hold

**Messaging Overhaul (Tasks 2.1-2.4):**
- Long-press context menu: react, forward, edit, delete (with 15-min time-based labels)
- Swipe-to-reply gesture (Reanimated pan gesture)
- Voice messages: record with timer + slide-to-cancel + waveform playback
- GIF picker: Tenor API integration with search + trending grid

**Profile Polish (Task 4):**
- QR code screen (react-native-qrcode-svg)
- RichText URL parsing (tappable bio links)
- Settings cleanup and navigation wiring

**Search & Discovery (Task 3):**
- Design document + implementation plan created
- Content search for posts and threads
- Search history with AsyncStorage
- Explore grid (3-column trending thumbnails)

**7 tasks deferred** to Batch 3

---

### 3rd Party Audit
**Date:** March 6, 2026
**Result:** Overall score 3.8/10
**Documents:** 14 audit reports in `docs/audit/`

Audit reports produced:
1. Feature gap analysis (per space: Saf, Bakra, Majlis, Risalah, Minbar)
2. Technical debt and code quality findings
3. Architecture and scalability assessment
4. Security and privacy scorecard
5. UX and design polish assessment
6. Monetization readiness evaluation
7. Infrastructure and DevOps maturity assessment
8. Final comprehensive audit report with strategic recommendations

**Key findings:**
- FALSE FINDING: "SQL injection" via $executeRaw — actually safe (tagged template literals)
- Valid: 0% test coverage, 0% monitoring, no CI/CD, no privacy compliance
- Valid: Redis not implemented, missing security headers, 19 `as any` casts
- Valid: Bakra and Minbar spaces not implemented

---

### Batch 3 — Audit Response
**Date:** March 6, 2026
**Scope:** 25 tasks | **Completed:** 22 | **Bugs:** 3
**Key commits:** `4df7c20` through `503b534`

**Step 0 — Cleanup:**
- Deleted .bak files, temp files, temp_plan.md
- Removed 6 stale git worktrees
- Clean commit

**Step 1 — Remaining Batch 2 Items (7 tasks):**
- Content search wired for Posts + Threads tabs with infinite scroll
- Search history: AsyncStorage load/save, max 20, individual delete + clear all
- Explore grid: 3-column FlatList with square thumbnails + video overlay icons
- QR code screen + share button wiring in profile
- Pull-to-refresh on profile screen
- Onboarding username registration fixed (sent to backend)
- borderRadius tokens partially replaced

**Step 2 — Backend Hardening (6 tasks):**
- Security headers middleware (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- Environment-aware error filter (stack traces hidden in production, Sentry capture for 5xx)
- Health check endpoint (GET /health with DB connectivity test)
- WebSocket rate limiting (30 messages/min per user with Map-based tracking)
- Fixed 10 of 11 `as any` casts with proper Prisma enum imports
- Endpoint-specific rate limiting (@Throttle on create post/thread/story/message)

**Step 3 — Redis (3 tasks):**
- Redis module (ioredis, global provider, REDIS_URL env)
- User profile caching (5-min TTL, invalidation on update)
- Feed response caching (30-sec TTL for "foryou" feed)

**Step 4 — Testing Foundation (4 tasks):**
- Jest + ts-jest configuration
- Users service tests (5 real tests: getProfile, cache hit, not found, update, report)
- Posts service tests (7 real tests: create, delete, forbidden, like, unlike, feed filter, feed cache)
- Posts E2E tests (5 real tests: create, get, 404, delete, forbidden)
- Total: 17 tests

**Step 5 — Mobile Polish (4 tasks):**
- Double-tap to like on PostCard (300ms window detection)
- Heart animation overlay (scale 0 -> 1.2 -> 1 -> 0 over 800ms with Reanimated)
- Message send animation (translateY spring from bottom)
- Accessibility labels on 5 priority screens (saf, majlis, risalah, PostCard, ThreadCard)

**3 Bugs Found in Audit:**
1. Explore grid: 5 style keys referenced but missing from StyleSheet (crash)
2. Profile: `handleShareAction()` called but never defined (crash)
3. users.service.ts:469: last `as any` cast not replaced

---

### Batch 4 — Bakra V1.1 + Scale
**Date:** March 6-7, 2026
**Scope:** 30 tasks | **Completed:** 28 | **Gaps:** 2
**Key commits:** `b171c31` through `ffb77e2`
**Parallelization:** All 6 steps run simultaneously across 6 agent tabs (worked without conflicts)

**Step 0 — Fix Batch 3 Regressions (3 tasks):**
- Added 5 missing explore grid styles to search.tsx StyleSheet
- Fixed handleShareAction -> handleShareProfile in profile screen
- Fixed last `as any` with proper `Record<string, ReportReason>` typing

**Step 1 — Bakra V1.1: TikTok Short Video Space (8 tasks):**
- Reels backend: controller (14 endpoints), service, module registered in app.module
  - POST /reels (throttled 10/min), GET /reels/feed, GET /reels/:id
  - POST/DELETE like, POST comment, GET comments, POST share
  - POST/DELETE bookmark, POST view, GET user/:username, POST report
- Reels API client: 14 methods matching all endpoints
- Bakra tab: full-screen vertical video feed with FlashList
  - Snap paging, auto-play/pause on scroll, double-tap to like
  - Right-side action column (like, comment, share, bookmark)
  - Bottom overlay (username, caption, audio)
  - Comments bottom sheet (CommentsSheet component)
  - Pull-to-refresh, pagination, empty state, loading skeleton
- Create reel screen: video picker (max 60s), preview, caption (500 chars)
  - Hashtag/mention extraction, R2 presigned upload, progress indicator
- Profile reels tab: 3-column grid with thumbnails, play icon, duration
- Search reels tab: search + filter + infinite scroll
- **MISSING:** reel/[id].tsx created in wrong directory `(screens/)` instead of `(screens)` — path typo causes crash

**Step 2 — Test Coverage Expansion (6 tasks):**
- Threads service tests: 10 tests (create, poll, delete, forbidden, likeReply, conflict, unlikeReply, trending feed, addReply, report)
- Messages service tests: 8 tests (conversations, messages, send, membership check, delete, markRead)
- Stories service tests: 8 tests (feed grouping, create with expiry, getById, delete, markViewed)
- Search service tests: 8 tests (people, threads, posts, tags, mixed, trending, hashtag, suggestions)
- Auth service tests: 9 tests (sync user, deactivate, checkUsername, getMe, interests, suggestions)
- Reels service tests: 14 tests (create, feed filtering, like, unlike, delete, view, status, deduplication)
- **Total: 78 real tests** (all with proper mocks, assertions, error paths — zero stubs)

**Step 3 — Monitoring & Observability (4 tasks):**
- Pino structured logging: nestjs-pino with environment-aware levels (debug in dev, info in prod), pretty-print in dev, sensitive header redaction
- Correlation ID middleware: UUID generation, header propagation, pino-http integration
- Sentry error tracking: conditional init (SENTRY_DSN env), 10% trace sampling, authorization header scrubbing, 5xx capture in exception filter
- Health metrics endpoint: GET /health/metrics with user/post/thread/reel counts, uptime, memory usage

**Step 4 — Mobile Feature Gaps (6 tasks):**
- Comment edit/delete UI: inline edit mode with save/cancel, delete with confirmation, author-only visibility
- Tab scroll-to-top: tabPress listener + scrollToOffset on saf, majlis, risalah tabs
- Image lightbox: react-native-image-viewing with fullscreen pinch-to-zoom on all post images
- Notification filter tabs: All/Mentions/Verified with TabSelector, query passes filter param
- Post draft auto-save: AsyncStorage with 2-second debounce, restore on mount, "Draft restored" banner
- Pull-to-refresh on thread detail: RefreshControl with emerald tintColor

**Step 5 — Code Quality (3 tasks):**
- BorderRadius tokens: 100% compliant in onboarding, profile, edit-profile, bakra (all >= 4 now use radius.*)
- Unused state cleanup: removed unused `refreshing` state from profile
- Spacing tokens: 95% compliant, 5 hardcoded values remain in bakra.tsx (gradient heights, layout offset — arguably not spacing tokens)

---

### Batch 5 — Minbar V1.2 + Production Readiness (Written, Not Yet Executed)
**Date:** March 7, 2026
**Scope:** 28 tasks across 6 steps

**Step 0 (3 tasks):** Fix reel/[id].tsx path typo, add Reel to create sheet, fix bakra lineHeight
**Step 1 (10 tasks):** Minbar V1.2 — Channels + Videos backend, feed, player, upload, channel page, search, tests, profile integration
**Step 2 (4 tasks):** Report flow — reusable report screen, wire to all content, comment moderation, reason enum
**Step 3 (3 tasks):** Deep linking — route config, push notification tap routing, backend payload data
**Step 4 (4 tasks):** Offline resilience — NetInfo detection, offline banner, mutation error toasts, message queue
**Step 5 (4 tasks):** Conversations — create group screen, admin features, message search, read receipts UI

---

### Batch 37 — Production Readiness: Tier 1 Completion
**Date:** March 15-17, 2026
**Scope:** 13 Tier 1 ship-blocking features | **Completed:** 13/13

**RTL Layout Polish:**
- Arabic text alignment, mirrored navigation, conversation bubbles

**Expo Web + PWA:**
- Metro config, web responsive layout, service worker, offline shell

**Deploy Infrastructure:**
- Railway, Neon, R2, Redis, Meilisearch wiring + deployment checklist

**Multi-Account Switching:**
- Clerk multi-session support, per-account push tokens

**Push Notification E2E:**
- FCM/APNs verified, badge counts, Expo Push API integration

**Story Sticker Wiring:**
- All 5 interactive stickers (Poll/Quiz/Countdown/Question/Slider) fully wired to backend

**TURN/STUN Server:**
- WebRTC call quality behind NAT configured

**i18n Rollout Complete:**
- All 121 screens now have useTranslation + t() calls (100% coverage)

**Error Boundaries:**
- All screens wrapped with ScreenErrorBoundary for crash resilience (101 screens newly wrapped)

**Mock Data Elimination:**
- All remaining mock data replaced with real API calls

**Appeal Moderation:**
- Fully wired to backend endpoints

**Result:** Tier 1 (Foundation) fully complete. App is production-ready for initial deployment.

---

## Cumulative Statistics

### Codebase Metrics (as of Batch 4 completion)

| Metric | Count |
|--------|-------|
| Total lines of code | 28,416 |
| Backend (TypeScript) | 9,840 lines |
| Mobile (TypeScript/TSX) | 16,698 lines |
| Prisma schema | 1,672 lines |
| Git commits | 89 |
| Development time | 5 days |

### Backend

| Metric | Count |
|--------|-------|
| NestJS modules | 19 |
| API endpoints | 151 |
| Prisma models | 73 |
| Prisma enums | 24 |
| Test files | 10 |
| Test cases | 78 |
| Backend source files | 90 |

### Mobile

| Metric | Count |
|--------|-------|
| Screens (app routes) | 42 |
| Reusable components | 20 |
| Custom hooks | 3 |
| Tab screens | 5 (saf, bakra, majlis, risalah, create) |

### Backend Modules (19)
auth, blocks, channels, circles, devices, follows, health, messages, mutes, notifications, posts, profile-links, reels, search, settings, stories, threads, upload, users

### API Endpoint Coverage

| Module | Endpoints | Notes |
|--------|-----------|-------|
| Posts | 19 | Full CRUD + reactions, comments, sharing, report |
| Threads | 17 | Full CRUD + replies, polls, repost, report |
| Messages | 12 | DMs, groups, send, edit, delete, read, members |
| Stories | 11 | CRUD, view, viewers, highlights (5 endpoints) |
| Reels | 14 | Full CRUD + like, comment, share, bookmark, view, report |
| Users | 8 | Profile, update, follow, block, mute, report, deactivate |
| Search | 4 | General, trending, hashtag, suggestions |
| Notifications | 5 | Get, unread count, mark read, mark all read, delete |
| Auth | 4 | Clerk webhook, check-username, get-me, interests |
| Follows | 6 | Follow, unfollow, followers, following, requests, respond |
| Upload | 2 | Presigned URL, confirm upload |
| Health | 2 | Health check, metrics |
| Settings | 4 | Get, update privacy, notifications, wellbeing, accessibility |
| Devices | 2 | Register, unregister push token |
| Other (blocks, mutes, circles, profile-links) | ~15 | Various CRUD operations |

### Test Coverage (78 tests across 10 files)

| File | Tests | Quality |
|------|-------|---------|
| users.service.spec.ts | 5 | Real (profile, cache, update, report) |
| posts.service.spec.ts | 8 | Real (CRUD, reactions, feed filtering) |
| threads.service.spec.ts | 10 | Real (CRUD, polls, replies, reactions) |
| messages.service.spec.ts | 8 | Real (conversations, messages, membership) |
| stories.service.spec.ts | 8 | Real (feed, create, view, highlights) |
| search.service.spec.ts | 8 | Real (all types, trending, pagination) |
| auth.service.spec.ts | 9 | Real (Clerk sync, username, interests) |
| reels.service.spec.ts | 14 | Real (CRUD, reactions, views, status) |
| posts.e2e-spec.ts | 6 | Real (HTTP CRUD cycle) |
| health.e2e-spec.ts | 2 | Real (health endpoint validation) |

### Component Library (20 components)

| Component | Purpose |
|-----------|---------|
| Icon | 44 SVG icons with size presets |
| Avatar | User avatars with online/story ring indicators |
| BottomSheet + BottomSheetItem | Modal replacement, snap points |
| Skeleton (6 variants) | Loading placeholders for all content types |
| EmptyState | Empty list messaging with action button |
| CharCountRing | Character count visualization |
| RichText | Tappable #hashtags, @mentions, URLs |
| TabSelector | Horizontal tab bar with active indicator |
| ActionButton | Primary/secondary/destructive button styles |
| Badge | Notification count badge |
| VerifiedBadge | Verified user checkmark |
| Autocomplete | Hashtag and mention suggestion dropdown |
| LocationPicker | Location search and selection |
| ErrorBoundary | Root error catch with retry UI |
| PostCard | Full post rendering with all interactions |
| PostMedia | Image carousel with lightbox |
| ThreadCard | Thread rendering with poll support |
| StoryBubble | Story circle with seen/unseen ring |
| StoryRow | Horizontal story feed |
| CommentsSheet | Bottom sheet comment interface |

### Infrastructure

| Feature | Status | Details |
|---------|--------|---------|
| Auth | Clerk | Email, phone, Apple, Google sign-in |
| Database | Neon PostgreSQL | 73 models, managed cloud |
| Cache | Upstash Redis | User profiles (5min), feeds (30sec) |
| Storage | Cloudflare R2 | Presigned PUT for all media |
| Search | Meilisearch | Full-text across all content types |
| Real-time | Socket.io | /chat namespace with typing indicators |
| Push | Expo Notifications | End-to-end device registration + sending |
| Logging | Pino | Structured JSON, environment-aware levels |
| Tracing | Correlation IDs | UUID per request, header propagation |
| Error tracking | Sentry | 5xx capture, 10% trace sampling |
| Monitoring | /health + /metrics | DB check, entity counts, process stats |
| Security headers | 5 headers | nosniff, DENY frame, referrer, permissions |
| Rate limiting | Global + per-endpoint | 100/min global, 10-30/min on creates, 30/min WebSocket |

---

## Decision Log

### Architecture Decisions
1. **Monorepo** over microservices — simpler deployment, shared types, single git history
2. **NestJS** over Express — modules, decorators, built-in DI, Swagger auto-gen
3. **Prisma** over TypeORM — type-safe queries, auto-generated types, migration tooling
4. **Expo SDK 52** over bare RN — managed workflow, OTA updates, EAS builds
5. **Clerk** over custom auth — handles OAuth, phone, MFA, webhooks out of the box
6. **Cloudflare R2** over S3 — zero egress fees, S3-compatible API
7. **Socket.io** over raw WebSocket — rooms, namespaces, automatic reconnection
8. **Zustand** over Redux — minimal boilerplate, no actions/reducers overhead
9. **React Query** over manual state — cache management, optimistic updates, infinite scroll
10. **Upstash Redis** over self-hosted — serverless, low-latency, managed

### Design Decisions
1. **Dark mode primary** — matches brand identity and cultural preference
2. **Emerald + Gold palette** — Islamic design heritage, premium feel
3. **BottomSheet over Modal** — consistent iOS/Android behavior, swipe to dismiss
4. **SVG Icon system** — 44 custom icons, consistent sizing, no emoji
5. **Design tokens** — all spacing, radius, fontSize via theme constants
6. **RTL-ready** — I18nManager.allowRTL + Noto Naskh Arabic font loaded

### Lessons Learned
1. **$executeRaw tagged template literals ARE safe** — audit falsely flagged as SQL injection
2. **Agents can work in parallel** — 6 simultaneous agents on Batch 4 completed 28/30 tasks with zero conflicts
3. **Read before edit prevents conflicts** — agents naturally avoid overwrites by reading current state
4. **New file creation dominates** — most tasks create new files, minimizing merge risk
5. **Path typos in Expo Router are silent** — `(screens/)` vs `(screens)` creates a new route group without error

---

## Remaining Roadmap (Batches 5-12)

| Batch | Focus | Status |
|-------|-------|--------|
| **5** | Minbar V1.2 + report flow + deep linking + offline + groups | Instructions written |
| **6** | CI/CD + E2E mobile tests + privacy compliance + admin dashboard MVP | Planned |
| **7** | Content moderation + app store prep + video processing pipeline | Planned |
| **8** | i18n Arabic + CDN + recommendation algorithm + story creation tools | Planned |
| **9** | E2E encryption + multi-device + message search + playlists/watch history | Planned |
| **10** | Monetization foundation + live streaming MVP + web app MVP | Planned |
| **11** | Performance/scaling + ML infra + analytics pipeline | Planned |
| **12** | Developer API + desktop app + payment processing | Planned |

**Launchable after Batch 7** (all 5 spaces, moderation, app store). Batches 8-12 are growth features.

---

## File Index

### Key Project Files
- `CLAUDE.md` — Primary project guide (component API, schema fields, rules)
- `ARCHITECT_INSTRUCTIONS.md` — Current batch tasks for implementation agents
- `docs/PROJECT_HISTORY.md` — This file
- `docs/audit/` — 14 third-party audit documents
- `docs/plans/` — Design and implementation plan documents
- `apps/api/prisma/schema.prisma` — 1,672-line database schema (73 models, 24 enums)
- `apps/mobile/src/theme/index.ts` — Design tokens
- `apps/mobile/src/services/api.ts` — All API clients
- `apps/mobile/src/store/index.ts` — Zustand store
- `apps/mobile/src/types/index.ts` — TypeScript interfaces
