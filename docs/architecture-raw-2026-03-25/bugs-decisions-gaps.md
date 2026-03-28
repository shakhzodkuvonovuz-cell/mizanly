# Mizanly — Bugs, Gaps, and Architectural Decisions

> Compiled 2026-03-25 from CLAUDE.md, PRIORITY_FIXES_CHECKLIST.md, DEFERRED_FIXES.md (72-agent audit), and full codebase grep for TODO/FIXME/HACK/WORKAROUND markers.

---

## Table of Contents

1. [Critical Bugs (P0)](#1-critical-bugs-p0)
2. [High Bugs (P1)](#2-high-bugs-p1)
3. [Medium Gaps (P2)](#3-medium-gaps-p2)
4. [All TODO/FIXME/HACK Markers by File](#4-all-todofixmehack-markers-by-file)
5. [Architecture Decisions (Why Each Tech)](#5-architecture-decisions-why-each-tech)
6. [Pattern Decisions](#6-pattern-decisions)
7. [Tradeoffs and Known Limitations](#7-tradeoffs-and-known-limitations)
8. [Schema Debt and Migration Backlog](#8-schema-debt-and-migration-backlog)
9. [Deployment Blockers](#9-deployment-blockers)
10. [Deferred Items by Category](#10-deferred-items-by-category)

---

## 1. Critical Bugs (P0)

These are functional defects that prevent core features from working end-to-end.

### BUG-001: WebRTC — 3 Missing Socket Emits

- **Impact:** Voice/video calls are entirely non-functional. Users can tap "call" but nothing happens on the callee side.
- **Root cause:** `useWebRTC.ts` was rewritten in session 5 with 13 fixes for the WebRTC lifecycle, but the three essential socket events that initiate/answer/terminate calls (`call_initiate`, `call_answer`, `call_end`) are never emitted from the mobile client.
- **File:** `apps/mobile/src/hooks/useWebRTC.ts`
- **Fix:** Add `socket.emit('call_initiate', ...)`, `socket.emit('call_answer', ...)`, `socket.emit('call_end', ...)` at the correct points in the call state machine.

### BUG-002: WebRTC — CallType Enum Mismatch

- **Impact:** Even if socket emits were added, the backend Socket.io DTO validation would reject the calls.
- **Root cause:** The REST API uses `VOICE` / `VIDEO` as CallType enum values. The Socket.io DTOs validate against `AUDIO` / `VIDEO`. Mobile sends `VOICE` via socket, which is rejected.
- **File:** `apps/api/src/gateways/chat.gateway.ts` (DTO validation), `apps/mobile/src/hooks/useWebRTC.ts`
- **Fix:** Align the enum: either change socket DTO to accept `VOICE` or change mobile to emit `AUDIO`.

### BUG-003: Coin Purchase Webhook Not Crediting

- **Impact:** Users pay real money via Stripe for coin packages, but coins are never added to their balance.
- **Root cause:** `handleGiftPaymentIntentSucceeded` is referenced but not fully implemented. The Stripe webhook handler receives `payment_intent.succeeded` but the coin-crediting logic is missing.
- **File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`
- **Fix:** Implement the coin credit logic in the webhook handler: look up the associated coin package from payment metadata, credit `CoinBalance` table (not the legacy `User.coinBalance`).

### BUG-004: Waqf Contribution Endpoint Missing

- **Impact:** Waqf (Islamic endowment) donations fail silently. The mobile app calls `POST /community/waqf/{id}/contribute` which does not exist.
- **Root cause:** The endpoint was documented in the checklist as "FIXED" but the actual controller route was never created.
- **File:** `apps/mobile/app/(screens)/waqf.tsx:67` — calls the non-existent endpoint.
- **Fix:** Add `POST /community/waqf/:id/contribute` to the communities controller, with Stripe PaymentIntent integration.

### BUG-005: Dual CoinBalance System — Wrong Balance Read

- **Impact:** User's displayed coin balance may be incorrect (shows 0 when they have coins, or shows stale value).
- **Root cause:** Two balance systems coexist: `User.coinBalance` (legacy Int field) and `CoinBalance` table (correct Decimal). Some code paths read from the legacy field, others from the table. They can diverge.
- **Files:** `apps/api/src/modules/gifts/gifts.service.ts:51` (documents the issue), `apps/api/prisma/schema.prisma` (both fields exist)
- **Fix:** Consolidate all reads/writes to the `CoinBalance` table. Mark `User.coinBalance` as deprecated. Requires schema migration to drop the legacy field.

---

## 2. High Bugs (P1)

### BUG-006: Owner Cannot See Own Scheduled/Trial Content

- **Impact:** Content creators who schedule posts or create trial reels cannot see their own content on their profile feed.
- **Root cause:** Profile feed queries filter `scheduledAt: null` without an owner bypass. The `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]` pattern was applied to 50+ public feed queries but not to the "my profile" queries.
- **Fix:** Add owner check: if `userId === requestingUserId`, skip scheduledAt filter.

### BUG-007: Frontend Does Not Hide Comment Input When Permission Is NOBODY

- **Impact:** Users see a comment input field, type a comment, submit, and get a 403 error. Bad UX.
- **Root cause:** `CommentPermission` enum is enforced server-side but the mobile screens don't check the post's `commentPermission` field before rendering the comment input.
- **Files:** `apps/mobile/app/(screens)/post/[id].tsx`, `apps/mobile/src/components/CommentsSheet.tsx`
- **Fix:** Check `post.commentPermission` and conditionally hide the input or show a "Comments are disabled" message.

### BUG-008: Tag Approval Workflow Dead

- **Impact:** Tagged users in posts/reels have no way to approve or decline being tagged. The `TagApprovalStatus` field exists but there are no endpoints to change it.
- **Root cause:** `PostTaggedUser` and `ReelTaggedUser` join tables were created with a `status` field of type `TagApprovalStatus` but approve/decline controller routes were never added.
- **Fix:** Add `POST /posts/:id/tags/:tagId/approve` and `POST /posts/:id/tags/:tagId/decline` endpoints.

### BUG-009: Cashout Wallet Endpoints Not Implemented

- **Impact:** Creators cannot withdraw earnings. The cashout screen exists but calls endpoints that return errors.
- **File:** `apps/mobile/app/(screens)/cashout.tsx:59` — `// TODO: Backend wallet endpoints not yet implemented`
- **File:** `apps/mobile/app/(screens)/cashout.tsx:72` — `// TODO: Backend payout history endpoint not yet implemented`
- **Fix:** Build `POST /monetization/wallet/cashout` and `GET /monetization/wallet/payout-history` endpoints. The `getPaymentMethods` is a placeholder returning empty array (see `apps/api/src/modules/monetization/monetization.service.ts:437`).

### BUG-010: 2FA Disconnected from Clerk Login Flow

- **Impact:** Users who set up TOTP 2FA in the app are not actually challenged during login. 2FA setup exists but the Clerk login flow doesn't call `attemptSecondFactor`.
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:241`
- **Root cause:** Clerk handles 2FA natively via its SDK. The app's custom 2FA implementation runs parallel but doesn't integrate into the Clerk auth middleware.
- **Fix:** Wire Clerk SDK `attemptSecondFactor` middleware to intercept the login flow when the user has TOTP enabled.

### BUG-011: Fire-and-Forget Moderation

- **Impact:** Content is published immediately and moderated asynchronously. Offensive content appears in feeds briefly before being flagged.
- **Root cause:** Content creation services call moderation asynchronously (no await). The moderation service itself is fail-closed, but the content pipeline doesn't gate on it.
- **File:** Multiple — `apps/api/src/modules/posts/posts.service.ts`, `apps/api/src/modules/threads/threads.service.ts`, etc.
- **Fix:** Refactor content creation pipeline to `await moderateText()` / `await moderateImage()` before saving. Return 422 if moderation blocks.

### BUG-012: getNearbyContent Returns All Geo-Tagged Posts

- **Impact:** "Nearby" content shows posts from across the world instead of local area.
- **File:** `apps/api/src/modules/feed/feed.service.ts:457` — `// STUB: Currently returns all geo-tagged posts without actual distance filtering.`
- **Fix:** Requires PostGIS extension on Neon PostgreSQL for proper geospatial queries.

---

## 3. Medium Gaps (P2)

### GAP-001: EXIF Data Not Stripped from Uploads
- **File:** `apps/api/src/common/queue/processors/media.processor.ts:28`
- `// TODO: [LEGAL/PRIVACY] After processing, REPLACE the original file in R2 with the stripped version`
- sharp is installed but not wired into the upload pipeline. User GPS coordinates leak via photo EXIF.

### GAP-002: BlurHash Is Stub
- The media processor generates blurhash but does not store it back to the database. Images load without blur placeholder transitions.
- **File:** `apps/api/src/common/queue/processors/media.processor.ts:189`

### GAP-003: AI Caption Generation Not Implemented
- **File:** `apps/api/src/common/queue/processors/ai-tasks.processor.ts:140`
- `// TODO: Implement caption generation pipeline`

### GAP-004: Legal/ToS Acceptance Not Tracked
- **File:** `apps/api/src/modules/auth/auth.service.ts:122`
- `// TODO: [LEGAL] Add tosAcceptedAt, tosVersion, privacyPolicyAcceptedAt, dateOfBirth`

### GAP-005: Missing Clerk Webhook Events
- **File:** `apps/api/src/modules/auth/auth.service.ts:286`
- `// TODO: [ARCH/F19] Missing Clerk webhook events` — session.ended, user.updated, organization.* not handled.

### GAP-006: Contact Sync Sends Raw Phone Numbers
- **File:** `apps/api/src/modules/users/dto/contact-sync.dto.ts:12`
- `// TODO: [LEGAL/PRIVACY] Implement client-side hashing` — phone numbers sent in cleartext from device to server.

### GAP-007: GDPR Export Incomplete
- **File:** `apps/api/src/modules/privacy/privacy.service.ts:110`
- `// TODO: [LEGAL/GDPR] Add these data categories to export when models are accessible`
- Multiple data categories missing from the GDPR data export.

### GAP-008: GDPR Deletion Not Scheduled
- **File:** `apps/api/src/modules/privacy/privacy.service.ts:218`
- `// TODO: [LEGAL/GDPR] Schedule complete purge job for 30 days from now`

### GAP-009: CSAM/Terrorism/AU Online Safety Act Reporting
- **File:** `apps/api/src/modules/reports/reports.service.ts:122-134`
- Three TODO blocks for legal reporting obligations (CSAM → NCMEC, terrorism → law enforcement, Australian Online Safety Act).

### GAP-010: Push Notification i18n
- **File:** `apps/api/src/modules/notifications/push.service.ts:12`, `notifications.service.ts:141`
- All push notification text is English-only. User model has no `locale` field yet.

### GAP-011: Story Close Friends / Subscribers Check Missing
- **File:** `apps/api/src/modules/stories/stories.service.ts:107-108`
- `// TODO: check circle membership when circles are integrated`
- `// TODO: check subscription when subscriptions are integrated`
- Close-friends-only and subscribers-only stories return `false` for everyone.

### GAP-012: Apple IAP Not Installed
- iOS App Store policy requires in-app purchases for digital goods. Stripe-only coin purchases will be rejected.
- No `react-native-iap` package. File: `apps/mobile/app/(screens)/gift-shop.tsx:125`.

### GAP-013: Weak Safety Numbers
- **File:** `apps/api/src/modules/encryption/encryption.service.ts:67`
- SHA-256 truncation instead of Signal protocol SAS. Functional for MVP but cryptographically weak.

### GAP-014: Envelope Store Race Condition
- **File:** `apps/api/src/modules/encryption/encryption.service.ts:224`
- `// TODO: [ARCH/F22] storeEnvelope has a race condition` — concurrent first-message in same conversation can corrupt key exchange.

### GAP-015: N+1 Query in Save-to-Playlist
- **File:** `apps/mobile/app/(screens)/save-to-playlist.tsx:67`
- `// TODO (Finding 7): N+1 query — fetches ALL items per playlist to check inclusion.`

### GAP-016: Quran Reading Plan — No Daily History API
- **File:** `apps/mobile/app/(screens)/quran-reading-plan.tsx:309`
- `// TODO: Fetch actual daily reading history from API when endpoint is available`

### GAP-017: Audio Room Reaction Not Wired to Socket
- **File:** `apps/mobile/app/(screens)/audio-room.tsx:263`
- `// TODO: Wire to socket.emit('audio_room_reaction', ...)` — reactions in audio rooms are local-only.

### GAP-018: Old Username Redirects Not Handled
- **File:** `apps/mobile/app/(screens)/profile/[username].tsx:502`
- `// TODO: Handle old username redirects when UsernameHistory model is added.`

### GAP-019: Scholar Verification Document Upload
- **File:** `apps/mobile/app/(screens)/scholar-verification.tsx:174`
- `// TODO: Replace with expo-document-picker when installed`

### GAP-020: Quran Verse Card Screenshot
- **File:** `apps/mobile/app/(screens)/quran-share.tsx:443`
- `// TODO: Capture verse card as image with react-native-view-shot when installed`

### GAP-021: Analytics Screen API
- **File:** `apps/mobile/app/(screens)/analytics.tsx:281`
- `// TODO [cross-scope]: This screen uses usersApi.getAnalytics() (GET /users/me/analytics)` — backend endpoint may not exist or returns limited data.

### GAP-022: Post Comment Reaction Types
- **File:** `apps/mobile/app/(screens)/post/[id].tsx:154`
- `// TODO: Wire to postsApi.reactToComment(postId, comment.id, type) when backend supports multiple reaction types`

### GAP-023: Creator Storefront Product Filter
- **File:** `apps/mobile/app/(screens)/creator-storefront.tsx:71`
- `// TODO [cross-scope]: Backend GET /products needs a sellerId filter param`

### GAP-024: Schedule Post Backend DTO Validation
- **File:** `apps/mobile/app/(screens)/schedule-post.tsx:92`
- `// TODO [cross-scope]: Backend create DTOs may not validate scheduledAt field`

### GAP-025: Monospace Font Not Actually Monospace
- **File:** `apps/mobile/app/(screens)/schedule-post.tsx:785`
- `fonts.mono` maps to DMSans (not monospace). Fixed in theme for code display via `Platform.select({ ios: 'Menlo', default: 'monospace' })`.

### GAP-026: Contact Sync Backend Hashing
- **File:** `apps/mobile/app/(screens)/contact-sync.tsx:139`
- `// TODO: Backend findByPhoneNumbers must also hash stored phone numbers for comparison`

### GAP-027: Video Reply Format
- **File:** `apps/mobile/src/components/VideoReplySheet.tsx:138`
- `// TODO: Video reply format needs backend parsing support — currently stored as text`

### GAP-028: ErrorBoundary Cannot Use Theme Hook
- **File:** `apps/mobile/src/components/ErrorBoundary.tsx:50`
- `// TODO: colors.dark.bg cannot be replaced with useThemeColors() — ErrorBoundary is a class component.`

### GAP-029: Meilisearch Not Deployed
- Search falls back to Prisma `LIKE` queries. Full-text search across 7 content types does 7 parallel full-table scans.
- `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are empty in production.

### GAP-030: 8 Dead Notification Types
- Communities, circles, marketplace, events, mosques, channels, challenges, series — none emit notifications despite notification types being defined.

### GAP-031: No Real-time Socket Notification Delivery
- Notifications are push-only. The chat gateway does not emit notification events via Socket.io for in-app real-time updates.

### GAP-032: Notification Dedup Missing
- No Redis-based dedup. A user can receive the same notification multiple times (e.g., rapid like/unlike/like).

---

## 4. All TODO/FIXME/HACK Markers by File

### Backend (apps/api/src/)

| File | Line | Marker |
|------|------|--------|
| `common/queue/processors/ai-tasks.processor.ts` | 140 | TODO: Implement caption generation pipeline |
| `common/queue/processors/media.processor.ts` | 28 | TODO: [LEGAL/PRIVACY] Replace original file in R2 with EXIF-stripped version |
| `modules/auth/auth.service.ts` | 122 | TODO: [LEGAL] Add tosAcceptedAt, tosVersion, privacyPolicyAcceptedAt, dateOfBirth |
| `modules/auth/auth.service.ts` | 286 | TODO: [ARCH/F19] Missing Clerk webhook events |
| `modules/users/dto/contact-sync.dto.ts` | 12 | TODO: [LEGAL/PRIVACY] Implement client-side phone number hashing |
| `modules/encryption/encryption.service.ts` | 67 | TODO: [ARCH/F20] Weak safety number generation (SHA-256 truncation) |
| `modules/encryption/encryption.service.ts` | 224 | TODO: [ARCH/F22] storeEnvelope race condition |
| `modules/privacy/privacy.service.ts` | 110 | TODO: [LEGAL/GDPR] Add missing data categories to export |
| `modules/privacy/privacy.service.ts` | 218 | TODO: [LEGAL/GDPR] Schedule complete purge job for 30 days |
| `modules/two-factor/two-factor.service.ts` | 241 | TODO: [ARCH/F16] 2FA disconnected from Clerk login flow |
| `modules/posts/posts.service.ts` | 129 | PERF TODO: For-you feed re-scores all 200 candidates per page |
| `modules/reports/reports.service.ts` | 122 | TODO: [LEGAL/CSAM] Report to NCMEC on child nudity |
| `modules/reports/reports.service.ts` | 129 | TODO: [LEGAL/TERRORISM] Report terrorism content to law enforcement |
| `modules/reports/reports.service.ts` | 134 | TODO: [LEGAL/AU_ONLINE_SAFETY] Australian Online Safety Act compliance |
| `modules/stories/stories.service.ts` | 107 | TODO: Check circle membership for close-friends stories |
| `modules/stories/stories.service.ts` | 108 | TODO: Check subscription for subscribers-only stories |
| `modules/notifications/push.service.ts` | 12 | TODO: User model has no locale field for i18n push |
| `modules/notifications/push.service.ts` | 223 | TODO: Pass user locale to push templates |
| `modules/notifications/notifications.service.ts` | 141 | TODO: [03] F28 — Push notification i18n |
| `prisma/schema.prisma` | 2766 | TODO: Migrate existing TOTP secrets to encrypted column |
| `prisma/schema.prisma` | 2770 | TODO: Migrate existing SHA-256 hashes to HMAC-SHA256 with salt |

### Mobile — Screens (apps/mobile/app/)

| File | Line | Marker |
|------|------|--------|
| `(tabs)/bakra.tsx` | 921 | TODO: colors.dark.bg override note |
| `(tabs)/saf.tsx` | 679,742,752 | TODO: colors.dark.* override notes (3 instances) |
| `(tabs)/risalah.tsx` | 512,556,578 | TODO: colors.dark.* override notes (3 instances) |
| `(tabs)/minbar.tsx` | 506,532,557,671,683 | TODO: colors.dark.* override notes (5 instances) |
| `(tabs)/majlis.tsx` | 440,487 | TODO: colors.dark.* override notes (2 instances) |
| `(screens)/account-switcher.tsx` | 387 | TODO: Persist to settings API |
| `(screens)/analytics.tsx` | 281 | TODO: Backend analytics endpoint cross-scope |
| `(screens)/audio-room.tsx` | 263 | TODO: Wire socket.emit for audio room reactions |
| `(screens)/call-history.tsx` | 127 | TODO: Verify call detail route exists (calls are UI facades) |
| `(screens)/cashout.tsx` | 59 | TODO: Backend wallet endpoints not yet implemented |
| `(screens)/cashout.tsx` | 72 | TODO: Backend payout history endpoint not yet implemented |
| `(screens)/contact-sync.tsx` | 139 | TODO: Backend phone number hashing for comparison |
| `(screens)/creator-storefront.tsx` | 71 | TODO: Backend GET /products needs sellerId filter |
| `(screens)/gift-shop.tsx` | 125 | TODO: On iOS, use Apple IAP instead |
| `(screens)/gift-shop.tsx` | 165 | TODO: Integrate Stripe Connect payouts |
| `(screens)/post/[id].tsx` | 154 | TODO: Wire comment reaction types |
| `(screens)/quran-reading-plan.tsx` | 309 | TODO: Fetch daily reading history from API |
| `(screens)/quran-share.tsx` | 443 | TODO: Capture verse card as image |
| `(screens)/profile/[username].tsx` | 502 | TODO: Handle old username redirects |
| `(screens)/save-to-playlist.tsx` | 67 | TODO: N+1 query — fetches ALL items per playlist |
| `(screens)/schedule-post.tsx` | 92 | TODO: Backend DTOs may not validate scheduledAt |
| `(screens)/schedule-post.tsx` | 785 | TODO: fonts.mono not actually monospace |
| `(screens)/scholar-verification.tsx` | 174 | TODO: Replace with expo-document-picker |
| `(screens)/waqf.tsx` | 67 | TODO: Backend POST /community/waqf/:id/contribute endpoint |

### Mobile — Components/Services/Hooks (apps/mobile/src/)

| File | Line | Marker |
|------|------|--------|
| `components/ErrorBoundary.tsx` | 50 | TODO: Class component cannot use useThemeColors() |
| `components/VideoReplySheet.tsx` | 138 | TODO: Video reply format needs backend parsing |
| `components/ui/GlassHeader.tsx` | 181,238 | TODO: colors.dark.* override notes (2 instances) |
| `components/ui/BottomSheet.tsx` | 276 | TODO: colors.dark.borderLight override note |
| `components/ui/Skeleton.tsx` | 177,195 | TODO: colors.dark.* override notes (2 instances) |

### Total TODO/FIXME count: ~21 backend + ~24 screens + ~7 components = **~52 actionable TODO markers**

Note: The `colors.dark.*` TODO markers (~18 instances) are informational comments documenting that the StyleSheet value is overridden by an inline style using `useThemeColors()`. These are not bugs — they are documentation of the theme migration pattern.

---

## 5. Architecture Decisions (Why Each Tech)

### Backend: NestJS 10

- **Why:** Module system maps naturally to the 5-space architecture (80 feature modules). Built-in DI, guards, interceptors, pipes provide structured patterns for auth, rate limiting, response transformation, and validation.
- **Why not Express/Fastify raw:** 80+ modules with guards, interceptors, DTOs would require extensive boilerplate. NestJS provides this out of the box.
- **Tradeoff:** Heavy framework overhead for cold starts on Railway. Startup time is 3-5 seconds.

### ORM: Prisma

- **Why:** Type-safe queries from schema, auto-generated client, migration management, Studio for visual DB browsing.
- **Why not TypeORM/Drizzle:** Prisma's schema-first approach is better for a 193-model schema. Single source of truth for types.
- **Tradeoff:** Prisma doesn't support polymorphic relations (see `VideoReply.commentId` issue), `$executeRaw` needed for advanced queries (pgvector, aggregations), no easy read-replica support.

### Database: Neon PostgreSQL 16

- **Why:** Serverless Postgres with branching, auto-scaling, free tier. Native pgvector support for embeddings.
- **Why not Supabase:** Already using Clerk for auth (not Supabase Auth). Neon's serverless model better fits Railway deployment.
- **Tradeoff:** No PostGIS by default (needed for geospatial), connection pooling via Neon's proxy (use direct URL for migrations, pooler for runtime).

### Auth: Clerk

- **Why:** Managed auth with email, phone, Apple, Google. Handles MFA, session management, webhook sync.
- **Why not Auth0/Supabase Auth:** Clerk's React Native SDK is more mature. Webhook-based user sync to Prisma is cleaner than direct DB coupling.
- **Tradeoff:** Custom 2FA (TOTP) runs parallel to Clerk's native MFA but isn't integrated into Clerk's login flow (BUG-010). $0.02/MAU after free tier.

### Mobile: React Native (Expo SDK 52)

- **Why:** Single codebase for iOS/Android. Expo Router for file-based navigation. EAS for builds. Expo SDK packages (location, camera, notifications).
- **Why not Flutter/SwiftUI+Kotlin:** Team expertise is TypeScript. Code sharing with backend types. Expo's managed workflow reduces native config.
- **Tradeoff:** Performance ceiling for video (no Metal/Vulkan shaders — filters are FFmpeg-only, no real-time preview). expo-av Video doesn't support custom shaders.

### Storage: Cloudflare R2

- **Why:** S3-compatible, zero egress fees. Presigned PUT URLs for direct client-to-R2 uploads. Public bucket URL for serving.
- **Why not AWS S3:** Egress costs at scale. R2 is free egress.
- **Tradeoff:** No built-in image transformation (needs Cloudflare Image Resizing add-on). No built-in virus scanning.

### Video: Cloudflare Stream

- **Why:** Managed transcoding, adaptive bitrate, HLS delivery. Upload API + webhook on stream.ready.
- **Tradeoff:** Per-minute pricing. No fine-grained transcoding control.

### Real-time: Socket.io with Redis Adapter

- **Why:** Established library with reconnection, room management, binary support. Redis adapter enables horizontal scaling across multiple server instances.
- **Why not raw WebSocket:** Room management, auto-reconnection, fallback to long-polling would need to be built from scratch.
- **Tradeoff:** Socket.io protocol overhead vs raw WS. Redis adapter adds latency hop.

### Cache: Upstash Redis

- **Why:** Serverless Redis with REST API fallback. Pay-per-request pricing fits startup budget.
- **Why not self-hosted Redis:** Managed reduces ops burden. Upstash handles persistence and scaling.
- **Tradeoff:** REST fallback is slower than TCP Redis. 1MB value limit.

### Search: Meilisearch (NOT YET DEPLOYED)

- **Why:** Typo-tolerant, fast, easy to configure. Better for user-facing search than Elasticsearch.
- **Current state:** Falls back to Prisma `LIKE` queries (GAP-029). 7 parallel full-text scans on search.
- **Tradeoff:** Needs a dedicated server or Meilisearch Cloud. Single-node limitation.

### Payments: Stripe

- **Why:** Industry standard. PaymentIntent API for donations, gift shop, waqf. Webhook-based fulfillment.
- **Tradeoff:** Not allowed for iOS digital goods (Apple IAP required — GAP-012). Stripe Connect for creator payouts is a placeholder.

### AI Services: Claude, Gemini, Whisper

- **Why Claude:** Content moderation (text + image via Vision API). XML-delimited prompts for injection resistance.
- **Why Gemini:** Embeddings (text-embedding-004) for personalized feed. Lower cost than OpenAI for high-volume embedding.
- **Why Whisper:** Voice transcription for voice posts and video captions. Most accurate for multi-language content.
- **Tradeoff:** Three different AI providers to manage. API costs add up. 30s timeout on Claude/Gemini, 60s on Whisper.

### Video Editor: FFmpeg-kit (full-gpl)

- **Why:** Full FFmpeg binary on device. 13 filters, trim, speed curves, text overlay, transitions, concat.
- **Why not expo-video-editor:** Doesn't exist. FFmpeg-kit is the only option for on-device video processing in React Native.
- **Tradeoff:** No real-time preview (must export to see result). ~30MB binary size added to app. iOS CocoaPods integration fragile.

### GIPHY SDK

- **Why:** Native SDK gives GIF search, animated text stickers, clips, emoji. Beta key allows 100 searches/hr.
- **Tradeoff:** Beta key rate-limited. Production key requires app demo + approval from GIPHY.

---

## 6. Pattern Decisions

### Authentication Pattern
- `ClerkAuthGuard` on all protected routes. Checks JWT validity + `isBanned` flag.
- `OptionalClerkAuthGuard` for public endpoints that benefit from user context (search, OG metadata).
- `@CurrentUser('id')` decorator extracts userId from JWT. Never without `'id'` parameter.

### API Response Pattern
- All responses wrapped by `TransformInterceptor`: `{ data: T, success: true, timestamp }`.
- Pagination: cursor-based keyset (`?cursor=<id>`) returning `{ data: T[], meta: { cursor?, hasMore } }`.
- Global throttle: 100 req/min. Per-endpoint: 5-60/min based on cost.

### Error Handling Pattern
- Stack traces removed from ALL API responses (dev + prod) — security decision.
- `ApiError` class with `isAuth`, `isForbidden`, `isRateLimited`, `isServerError`, `isNotFound` properties.
- `ApiNetworkError` differentiates timeout/DNS/network from HTTP errors.
- 30s timeout on external API calls (Claude, Gemini, Meilisearch). 60s on Whisper, Stream, batch embeddings.

### Feed Algorithm Pattern
- 3-stage ranking: pgvector KNN candidates -> weighted scoring -> diversity reranking.
- k-means multi-cluster interest vectors (2-3 centroids per user).
- 15% exploration slots for discovery.
- Islamic boost: location-aware via prayer-calculator, time-of-day weighted.
- Trending: 24h window with 12h exponential decay, HNSW vector index.

### Content Moderation Pattern
- Pre-save moderation on posts (text + image via Claude Vision API).
- Fail-closed: if moderation API fails, content gets `WARNING` status (not `SAFE`).
- Word filter with 33 blocked terms + AI fallback.
- Fire-and-forget on threads/videos/channels (BUG-011 — not yet gated).

### Mobile State Management Pattern
- React Query for server state (caching, invalidation, optimistic updates).
- Zustand for client state (theme, feed type, unread counts, create sheet).
- AsyncStorage for persistence (drafts, dismissed IDs, followed hashtags).
- No Redux — intentional simplicity.

### i18n Pattern
- 8 languages bundled synchronously (no async flash).
- All new UI text must go through `t('key')` in ALL 8 language JSON files.
- Never use `sed` for i18n key injection — use Node script that parses JSON.
- RTL: ~430 margin/padding/position replacements across 134 files. `I18nManager.isRTL` + `isRTL` includes `ar` and `ur`.

### Theme Pattern
- `useThemeColors()` hook returns theme-aware colors. Never use `colors.dark.*` in JSX.
- All 244 files migrated from hardcoded `colors.dark.*` to `useThemeColors()`.
- `getThemeColors()` utility with light text variants for future light mode.
- Extended tokens: `colors.active.*` (emerald5-50, gold10-50), `colors.gradient.*`, `fontSizeExt.*`.

### Navigation Pattern (Expo Router)
- File-based routing: `app/(tabs)/` for 5 main tabs, `app/(screens)/` for 209 screens.
- `navigate()` utility from `@/utils/navigation.ts` — eliminates all `as never` casts (227 removed).
- Deep link handler in root layout via `setupDeepLinkListeners`.

### Haptics Pattern
- `useContextualHaptic()` hook with 10 semantic haptics: like, follow, save, navigate, tick, delete, error, longPress, send, success.
- Never use raw `useHaptic()`.

---

## 7. Tradeoffs and Known Limitations

### Video Editor Limitations (Documented in Session 3)
1. **Waveform is cosmetic** — deterministic sine wave, not from actual audio. Needs FFprobeKit audio peak extraction.
2. **Font selection has no effect on export** — FFmpeg `drawtext` doesn't resolve platform font paths. Needs iOS/Android `fontfile=` resolution.
3. **Music mixing uses CDN URL directly** — works but adds network latency. Should pre-download to cache.
4. **No real-time filter preview** — expo-av Video doesn't support shaders. User only sees filter after export. Needs OpenGL/expo-gl.
5. **iOS config plugin uses monkey-patched pre_install** — documented community approach, fragile across CocoaPods versions.

### Schema Limitations
1. **Polymorphic FK:** `VideoReply.commentId` points to Comment OR ReelComment based on `commentType` enum. Prisma doesn't support polymorphic relations. Must resolve at application layer.
2. **Mixed ID strategy:** 94 models use `cuid()`, 61 use `uuid()`. Cosmetic inconsistency, not a bug. New models use `cuid()`.
3. **Float for money:** `CoinBalance.balance`, `Product.price` use Float instead of Decimal. Precision loss risk on large amounts.

### Performance Limitations
1. **For-you feed re-scores all 200 candidates per page request** — `apps/api/src/modules/posts/posts.service.ts:129`. Should cache scored results.
2. **Search does 7 parallel full-text scans** — until Meilisearch is deployed.
3. **Trending sort in JS instead of SQL** — fetches 200 rows and sorts in memory. Should use raw SQL ORDER BY scoring expression.

### Security Limitations
1. **TOTP secret stored in plaintext** — schema has `encryptedSecret` and `backupSalt` fields but migration pending.
2. **Prompt injection protection basic** — text sanitization, not full XML delimiter approach across all 6 AI prompt templates.
3. **No virus scanning** — uploaded files go directly to R2. Needs ClamAV or cloud antivirus API.
4. **Contact sync sends raw phone numbers** — should hash on client before sending.

### Mobile `as any` Usage (Non-Test Code)
| File | Line | Usage |
|------|------|-------|
| `create-reel.tsx` | 166 | `clipTransition as any` — transition type cast for FFmpeg concat |
| `video-editor.tsx` | 514 | `params.returnTo as any` — dynamic route path |
| `video-editor.tsx` | 1406 | `'/(screens)/caption-editor' as any` — untyped route |

These are the only 3 `as any` casts in non-test mobile code. All test files use `as any` freely for mocks (permitted by project rules).

---

## 8. Schema Debt and Migration Backlog

### Deferred Schema Migrations (26 items from PRIORITY_FIXES_CHECKLIST.md T1)

**Payment/Commerce (8):**
- C-02: Consolidate dual `CoinBalance` table vs `User.coinBalance` field
- C-14: Add `stripePaymentId` field to Tip model
- C-15: Wire Stripe PaymentIntent into marketplace orders
- m-02: Add `CoinTransactionType` enum
- m-03: Add `currency` field to CoinTransaction
- m-18/19/20: Missing indexes on transaction/order/donation tables
- m-25: Add `@@unique` on Tip payment reference for idempotency
- m-28: Add WaqfDonation relation to WaqfFund

**Auth/Security (4):**
- F3: TOTP secret encryption (add encrypted column + service wiring)
- F20: Signal protocol SAS for safety numbers
- F22: `$transaction` rewrite for envelope store race
- F27: Migrate backup codes to HMAC-SHA256 with per-user salt

**Content/Social (7):**
- [04] P2-25: Circle members notification emission
- [05] F47-F49: Report FK fields (reportedThreadId, reportedReelId, reportedVideoId)
- [05] F65: VideoCommentLike model
- [06] F20-F21: StarredMessage join table (convert String[] array)
- [07] F-050: Embedding FK to Post/User + orphan cleanup
- [08] F25: StickerPack.ownerId field
- [09] F11/F12: ScholarQuestionVote + HalalVerifyVote join tables

**Schema Quality (7):**
- P1-CASCADE-10/11: Report reporter/reportedUser SetNull
- P1-DANGLING-01 to 08: 8 dangling FK explicit relations (7/8 fixed, 1 unfixable polymorphic)
- P1-FKARRAY-01 to 03: 3 String[] arrays to join tables
- P1-INDEX-06 to 08: CallSession.endedAt, Embedding.contentType+contentId indexes
- P1-MONEY-01 to 04: Float to Decimal for financial fields
- P1-DESIGN-01 to 04: Notification polymorphic redesign, TwoFactorSecret encryption
- P2-* (39 findings): Batch schema improvements

---

## 9. Deployment Blockers

These 12 items are NOT code bugs — they are configuration/credential/enrollment requirements that block production launch.

| # | Blocker | Type |
|---|---------|------|
| 1 | App icon + splash screen are 69-byte placeholders | Design asset |
| 2 | Apple Developer enrollment ($99/yr, 48h processing) | External enrollment |
| 3 | Clerk production keys (switch `sk_test_` to `sk_live_`) | Credential rotation |
| 4 | Stripe live keys | Credential rotation |
| 5 | `APP_URL` still `localhost:3000` | Config update |
| 6 | CNAME `api` -> Railway + Railway custom domain setup | DNS/infrastructure |
| 7 | Resend domain verification (emails may go to spam) | External config |
| 8 | `google-services.json` for Android push notifications | Firebase config |
| 9 | R2 CORS not configured on bucket | Cloudflare config |
| 10 | R2 lifecycle rules not set (temp uploads accumulate) | Cloudflare config |
| 11 | Sentry source maps not configured for EAS builds | Build config |
| 12 | Metro bundler version conflict (CI mobile build fails) | Dependency fix |

---

## 10. Deferred Items by Category

### By Audit File — Summary of All Deferred Items

| Audit | Topic | Deferred Count | Key Items |
|-------|-------|----------------|-----------|
| 02 | Payments | 7 | Dual balance, tip stripePaymentId, order payments, CoinTransaction enum |
| 03 | Auth | 6 | TOTP encryption, 2FA login, webhooks, safety numbers, envelope race, PIN re-verify |
| 05 | Content | 5 | Thread/video/channel moderation, Report FKs, VideoCommentLike |
| 06 | Messaging | 5 | Scheduled messages, starred messages, chat export OOM, Quran rooms, broadcast slug |
| 07 | Feed/Algo | 1 | Embedding table FK |
| 08 | Gamification | 2 | Sticker count atomic, sticker pack ownerId |
| 09 | Community | 5 | Role management CRUD, scholar QA vote dedup, halal verify dedup, community notes, data export GDPR |
| 10 | AI | 5 | Fire-and-forget moderation, prompt injection XML, AI cost controls, translation cache, story chain race |
| 11 | Media | 5 | EXIF stripping, media processor R2 upload, BlurHash store, video publishedAt, stream queue |
| 12 | Search | 2 | Meilisearch filter bypass, remaining index configuration |
| 13 | Admin | 7 | Reports delegation, feature flag validation, comment removal, ModerationLog, ban session invalidation, duplicate moderation services, flagContent reporterId |
| 14 | Notifications | 6 | 8 dead types, socket delivery, dedup, Expo token, cleanup cron, unread-counts endpoint |
| 15 | Schema | ~60 | CASCADE, DANGLING, FKARRAY, INDEX, MONEY, DESIGN, 39 P2s |
| 18 | Rate Limit | 1 | Per-target-user throttle keying |
| 19 | Queue | 2 | Scheduled content publisher, dead letter queue |
| 21 | Performance | 2 | pgvector HNSW index, trending SQL sort |
| **Total** | | **~121** | |

### Test Quality Backlog

| Item | Description |
|------|-------------|
| Personalized-feed.spec.ts | 5/11 tests have shallow assertions (mock instead of service) |
| toBeDefined sole assertion | 10 instances across test suite |
| Search tests | 19 tests with 0 error checks |
| Embeddings tests | 17 tests with 0 error checks |
| Islamic tests | 8 shallow assertions in 31 tests |
| Recommendations tests | 12 tests with 0 error checks |
| Content-safety tests | 13 tests with 0 error checks |
| Ralph batch 3 | ~1,050 target tests (edge cases, auth matrix, concurrency, abuse vectors) never executed |

### Large File Decomposition (Refactoring, Not Bugs)

| File | Lines | Suggested Split |
|------|-------|----------------|
| `conversation/[id].tsx` | 2,429 | Extract MessageBubble, ConversationHeader, InputBar |
| `video-editor.tsx` | 2,566 | Extract per-tool-tab components |
| `create-story.tsx` | 1,237 | Extract sticker components |
| `video/[id].tsx` | 1,490 | Extract VideoPlayer, CommentsSection, RelatedVideos |
| `search.tsx` | 997 | Extract per-tab search result components |

### Translation Completeness (Human Translator Needed)

| Language | Code | Completion |
|----------|------|------------|
| English | en | 100% |
| Turkish | tr | 89% |
| Arabic | ar | 77% |
| Indonesian | id | 16% |
| French | fr | 15% |
| Malay | ms | 15% |
| Urdu | ur | 14% |
| Bengali | bn | 14% |

---

## Appendix: Legacy/Backward Compatibility Code

These are intentional legacy patterns, not bugs:

1. **`User.coinBalance` (legacy Int)** — Coexists with `CoinBalance` table. `gifts.service.ts:51` documents: "The User model also has a legacy coinBalance Int field — that field is NOT used by this service."
2. **`commentsDisabled` boolean** — Legacy field maintained for backward compatibility alongside new `commentPermission` enum. `posts.service.ts:473`: "Map commentPermission -> also set legacy commentsDisabled boolean for backward compat."
3. **Two-factor backward compat** — `two-factor.service.ts:108`: "Legacy unencrypted value — return as-is for backward compatibility." Supports both legacy SHA-256 and new HMAC-SHA256 backup code formats.
4. **Prayer calculator method IDs** — `prayer-calculator.ts:43`: "Our named method IDs (legacy)" — internal naming for Aladhan API methods.
