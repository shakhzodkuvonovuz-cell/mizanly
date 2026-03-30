# PROFESSIONAL CODEBASE AUDIT — Mizanly

> **THIS IS A PROMPT.** Paste this into a fresh Claude Code Opus session. It spawns ~130 agents across 13 waves to audit the entire codebase.

---

## STEP 0 — MANDATORY BOOTSTRAP

Before doing ANYTHING else:

1. Read `CLAUDE.md` (project rules, architecture, known debt)
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references (user preferences, session history, feedback rules)
3. Read this entire prompt before spawning a single agent

You are not an assistant helping someone audit. You are the **Lead Auditor** coordinating a 130-agent team. You have zero tolerance for:
- Agents returning "no issues found" without proving they read every file
- Agents citing wrong line numbers or non-existent files
- Agents skipping hard findings and only reporting easy ones
- Agents reporting findings that were already fixed in previous sessions
- Anyone using Sonnet or Haiku models

---

## CODEBASE FACTS (verified, do not re-count)

```
apps/api/src/         — 63,703 lines (NestJS 10, ~80 modules, ~950 endpoints)
apps/mobile/          — 175,705 lines (Expo SDK 52, 199 screens, 48 UI components, 28 hooks)
apps/e2e-server/      — 2,222 lines (Go E2E key server, Signal Protocol)
apps/livekit-server/  — 4,604 lines (Go LiveKit call server, 16 endpoints)
workers/exif-stripper/ — Cloudflare Worker
apps/landing/         — Static HTML landing page

Prisma schema: 5,037 lines, ~200 models
i18n: 8 languages (en, ar, tr, ur, bn, fr, id, ms)
Tests: 315 API spec files, 11 integration test files, 633 signal tests, 123 Go LiveKit tests
CI: GitHub Actions (7 jobs)
Infra: Railway, Neon PostgreSQL, Upstash Redis, Cloudflare R2, Clerk, Stripe, Meilisearch, Sentry
```

---

## RULES — NON-NEGOTIABLE

### R1: Wave Execution Order
Execute waves sequentially: Wave 1 → verify → Wave 2 → verify → ... → Wave 13.
Within each wave, spawn all agents in parallel using the Agent tool.
NEVER start Wave N+1 until Wave N is fully verified.

### R2: Agent Model
Opus ONLY. Never set `model: "sonnet"` or `model: "haiku"`. Omit the model parameter entirely.

### R3: Agent Output Format — MANDATORY
Every agent MUST return findings in this EXACT structure. Agents returning prose paragraphs instead of this table are FAILED and must be re-run.

```
### [AGENT-ID] — [Scope Description]

**Files audited (with line counts):**
- path/to/file.ts (423 lines) — READ IN FULL
- path/to/other.ts (187 lines) — READ IN FULL

**Files in scope but SKIPPED:** [list with reason, or "None"]

| # | Sev | File:Line | Finding | Impact | Fix Effort |
|---|-----|-----------|---------|--------|------------|
| 1 | C   | apps/api/src/modules/posts/posts.service.ts:142 | Raw SQL concatenation without parameterization | SQL injection on user-controlled input | 15 min |
| 2 | H   | apps/api/src/modules/posts/posts.controller.ts:87 | Missing @CurrentUser('id') — bare @CurrentUser() | Could return full user object to client | 5 min |

**Severity counts:** C:1 H:1 M:3 L:2 I:0
**Total findings:** 7
```

Severity definitions:
- **C (Critical):** Security vulnerability, data loss, crash, money bug, religious data error
- **H (High):** Auth bypass, missing validation, broken feature, data inconsistency
- **M (Medium):** Missing error handling, performance issue, UX regression, incomplete feature
- **L (Low):** Code smell, inconsistent pattern, minor UX gap, missing test
- **I (Info):** Suggestion, observation, documentation gap

### R4: Minimum Finding Threshold
If an agent returns fewer than 3 findings, it is SUSPICIOUS. You (the coordinator) must:
1. Read 2-3 of the agent's assigned files yourself
2. If you find issues the agent missed, RE-RUN that agent with a note: "Previous run missed findings. Read every line. Do not skim."
3. If you confirm the files are genuinely clean, accept the low count

### R5: Verification After Each Wave
After each wave completes:
1. Pick 5 random findings from across the wave's agents
2. Read the cited file:line yourself
3. Confirm the finding is real (not already fixed, line number correct, issue exists)
4. If >=2 of 5 are wrong → RE-RUN all agents in that wave
5. Log verification results in `docs/audit/YYYY-MM-DD-full-audit/VERIFICATION_LOG.md`

### R6: No Fixes — Audit Only
Agents MUST NOT modify any code. This is a read-only audit. Every finding goes into a report file. Fixes happen in a separate session after the audit is reviewed.

### R7: Anti-Regression Check
Agents must check `docs/audit/` for previously fixed findings. If a finding was fixed in a prior session and is now broken again, mark it as `REGRESSION` in the severity column and escalate to Critical.

### R8: Cross-Module Findings
If an agent discovers an issue that spans multiple modules (e.g., Module A emits an event that Module B never handles), it MUST report it with all relevant file:line references. Cross-module findings are often the most valuable. Tag them with `[CROSS]` in the Finding column.

### R9: Output Location
All findings go to `docs/audit/YYYY-MM-DD-full-audit/`. Create one file per agent: `A01-auth-users.md`, `B01-user-models.md`, etc.

### R10: DO NOT report these (known, accepted)
- Apple Developer enrollment not done (external blocker)
- Zero real-device testing (external blocker)
- NCMEC/GIFCT/eSafety registration (legal blocker)
- Formal verification not done (future $50-100K project)
- Professional security audit not done (future engagement)
- react-native-webrtc removed (replaced by LiveKit)
- useWebRTC.ts deleted (replaced by useLiveKitCall)

---

## AGENT PROMPT TEMPLATE

Every agent you spawn MUST receive this preamble in its prompt, followed by the scope-specific instructions:

```
You are a professional security/quality auditor. You are NOT a helpful assistant.
Your job is to find problems, not to praise code.

RULES:
1. Read EVERY file in your scope. Not skim — READ. Count the lines to prove it.
2. Return findings in the EXACT table format specified. No prose. No summaries.
3. Minimum 3 findings or explain why the code is genuinely clean.
4. Every finding MUST cite exact file:line. Wrong line numbers = audit failure.
5. Check for CROSS-MODULE issues: does this code depend on something external that might be broken?
6. DO NOT modify any files. Read only.
7. Severity must be honest. Don't inflate (everything C) or deflate (everything L).
8. If you find 0 Critical/High issues, say so. Don't manufacture fake severity.
9. List files you SKIPPED and why. "I ran out of context" is a valid reason.

Your scope: [SCOPE SECTION BELOW]
```

---

## WAVE 1 — BACKEND SECURITY (16 agents)

**Focus:** Auth, authorization, input validation, injection, data exposure, rate limiting.

**What EVERY agent in this wave must check:**
- `@UseGuards(ClerkAuthGuard)` present on every non-public endpoint
- `@CurrentUser('id')` — always with `'id'`, never bare `@CurrentUser()`
- Every `@Body()` uses a DTO class with class-validator decorators, not inline types
- No `$queryRawUnsafe` or `$executeRawUnsafe` with string concatenation
- No user-controlled values in raw SQL without parameterization
- Rate limiting (`@Throttle()`) on mutation endpoints
- Responses don't leak internal IDs, hashed passwords, tokens, or full user objects
- File upload endpoints validate MIME type, file size, and sanitize file names
- No path traversal in file/media operations
- Error messages don't expose stack traces or query details

| Agent | Modules (read every .controller.ts, .service.ts, .module.ts, .dto/ in these) |
|-------|-----------------------------------------------------------------------------|
| A01 | `auth`, `users`, `two-factor`, `devices` |
| A02 | `posts`, `bookmarks`, `collabs` |
| A03 | `reels`, `reel-templates`, `clips` |
| A04 | `threads`, `majlis-lists` |
| A05 | `videos`, `video-editor`, `video-replies`, `subtitles`, `thumbnails` |
| A06 | `messages`, `chat-export`, `stickers` |
| A07 | `stories`, `story-chains` |
| A08 | `notifications`, `webhooks` |
| A09 | `payments`, `monetization`, `gifts`, `commerce` |
| A10 | `follows`, `blocks`, `mutes`, `restricts`, `reports`, `moderation` |
| A11 | `search`, `hashtags`, `embeddings`, `recommendations` |
| A12 | `feed`, `promotions`, `polls` |
| A13 | `channels`, `channel-posts`, `communities`, `community`, `community-notes` |
| A14 | `islamic`, `mosques`, `halal`, `scholar-qa` |
| A15 | `admin`, `waitlist`, `privacy`, `parental-controls`, `settings` |
| A16 | `live`, `audio-rooms`, `audio-tracks`, `broadcast`, `stream` |

---

## WAVE 2 — BACKEND DATA INTEGRITY (12 agents)

**Focus:** Schema correctness, cascade safety, transaction atomicity, counter consistency, soft-delete enforcement, visibility filtering.

**What EVERY agent in this wave must check:**
- Read `apps/api/prisma/schema.prisma` for models in scope
- Foreign keys have correct `onDelete` (Cascade vs SetNull vs Restrict)
- Financial models use `Decimal`, not `Int` or `Float`
- `@@unique` constraints where business logic requires uniqueness
- Missing indexes on frequently queried foreign keys
- All public queries filter: `isRemoved`, `isBanned`, `isDeactivated`, `isDeleted`
- All public queries filter: `scheduledAt` (must be null OR <= now)
- Counter increments/decrements use `GREATEST(0, ...)` to prevent negatives
- Operations that MUST be atomic use `$transaction` (not sequential awaits)
- Race conditions: check-then-act without locking

| Agent | Prisma Models (read schema.prisma lines for these + all services that query them) |
|-------|-----------------------------------------------------------------------------|
| B01 | `User`, `UserSettings`, `UserProfile`, `Follow`, `Block`, `Mute`, `Restrict`, `Device` |
| B02 | `Post`, `PostComment`, `PostReaction`, `PostBookmark`, `PostTaggedUser`, `PostView` |
| B03 | `Reel`, `ReelComment`, `ReelReaction`, `ReelBookmark`, `ReelView` |
| B04 | `Thread`, `ThreadComment`, `ThreadReaction`, `MajlisList` |
| B05 | `Video`, `VideoComment`, `VideoReaction`, `VideoBookmark`, `VideoView`, `VideoReply` |
| B06 | `Conversation`, `Message`, `MessageReaction`, `MessageMedia`, `ConversationParticipant` |
| B07 | `Story`, `StoryReaction`, `StoryHighlight`, `StoryChain` |
| B08 | `CoinBalance`, `CoinTransaction`, `Gift`, `Cashout`, `Donation`, `PaymentMapping`, `ProcessedWebhookEvent` |
| B09 | `Channel`, `ChannelPost`, `ChannelSubscription`, `Community`, `CommunityNote` |
| B10 | `Notification`, `PushToken`, `NotificationSetting`, `FailedJob` |
| B11 | `Report`, `ModerationAction`, `BannedHash`, `FlaggedContent`, `Appeal` |
| B12 | `CallSession`, `CallParticipant`, `WaitlistEntry`, `FeatureFlag`, `Event`, `Poll` |

---

## WAVE 3 — CROSS-MODULE CONNECTIVITY (10 agents)

> This is what the user calls "cross-module connectivity" — the integration seams, event contracts, data flow boundaries, and assumptions modules make about each other.

**This is the hardest wave. These agents find bugs that single-module agents CANNOT find: broken event chains, orphaned listeners, type mismatches across boundaries, services that call other services with wrong assumptions, notification triggers that reference deleted modules, socket events emitted but never handled, queue producers with no consumers, and data flows that silently drop messages.**

**What EVERY agent in this wave must check:**
- Trace the FULL data flow for its domain, from mobile API call → controller → service → database → queue → notification → socket → mobile handler
- Find broken links: events emitted that nobody listens to, handlers for events never emitted
- Find contract violations: DTO shape on producer doesn't match what consumer expects
- Find orphaned dependencies: imports from deleted/renamed modules
- Find state assumption mismatches: Module A assumes field X is always populated, Module B sets it to null
- Find missing side effects: "When X happens, Y should also happen but doesn't"
- Find circular dependencies between modules
- Check that Prisma `include`/`select` in one module matches what the consuming module actually needs

| Agent | Integration Domain | Trace These Flows |
|-------|-------------------|-------------------|
| X01 | **Post Lifecycle** | Create post → moderation pre-check → publish → feed indexing → Meilisearch sync → notification to followers → push notification → socket broadcast → mobile feed refresh. Check: Does tagging users trigger notification? Does comment-control permission propagate to comment endpoints? Does editing re-trigger moderation? Does deletion clean up from feed + search + bookmarks + notifications? |
| X02 | **Message & E2E Flow** | Send message → Signal encrypt → socket emit → gateway handler → DB persist (with E2E fields) → push notification (generic body) → recipient socket receive → Signal decrypt → display. Check: Do all 8 E2E fields persist correctly? Does forward reject encrypted messages? Does edit reject encrypted? Does search exclude encrypted? Does delete clear E2E fields? Does sealed sender actually hide sender identity in socket metadata? |
| X03 | **Payment & Commerce Flow** | Stripe checkout → webhook → `ProcessedWebhookEvent` dedup → coin credit → `CoinTransaction` record → gift purchase → recipient balance update → cashout request → Stripe transfer → financial record preservation on user delete. Check: Is every payment operation atomic ($transaction)? Do webhook retries get deduplicated? Does the dual CoinBalance system (User.coinBalance vs CoinBalance table) stay in sync? Do SetNull cascades preserve financial records? |
| X04 | **User Lifecycle** | Register (Clerk webhook) → onboarding → profile setup → follow/post/interact → ban (sets flags, hides content) → unban (restores) → deactivate (soft) → delete (GDPR: anonymize PII, soft-delete content, hard-delete stories, SetNull financials, clean social graph). Check: Does deletion hit ALL ~200 models? Does ban propagate to ALL feed/search/suggestion queries? Does Clerk webhook actually update local DB fields? |
| X05 | **Notification Pipeline** | Event trigger (like/follow/comment/mention/message) → PushTriggerService → notification dedup (Redis) → NotificationSetting check → push delivery (Expo) → in-app notification record → socket broadcast → mobile notification handler. Check: Are ALL event types covered? Does dedup work across all types? Does notification settings actually block delivery (not just hide)? Do batch notifications work? Are deleted users filtered from notification delivery? |
| X06 | **Feed & Algorithm** | Candidate retrieval (KNN + explore + trending) → weighted scoring → diversity reranking → cursor pagination → mobile display. Check: Does the feed exclude banned/blocked/muted users at EVERY stage? Does scheduledAt filtering happen in the SQL query (not post-fetch)? Does the Islamic prayer-aware boost actually fire during prayer windows? Does the trending 24h decay work correctly? Do exploration slots actually pull fresh content? |
| X07 | **Real-time (Socket.io + Queues)** | Read `apps/api/src/gateways/chat.gateway.ts` (1,020 lines) + ALL queue processors in `apps/api/src/common/queue/processors/`. Check: Are all socket events rate-limited? Do socket handlers validate auth? Do socket events match what the mobile client emits/listens to (check mobile services for `socket.emit` and `socket.on`)? Are queue jobs idempotent? Do failed jobs go to DLQ? Does the search-indexing processor handle ALL content types (posts, reels, threads, videos, channels)? |
| X08 | **Content Moderation Pipeline** | User report → moderation queue → AI pre-check → manual review → action (warn/ban/delete) → appeal → appeal review → restore or confirm. Check: Does pre-save moderation actually block publish on failure? Does banning a user cascade to hiding ALL their content? Does appeal resolution restore content visibility? Does NSFW check run on images AND videos? Are banned hashes checked on upload? |
| X09 | **Search & Discovery** | Content create/update/delete → Meilisearch sync processor → search index → search API → mobile search screen. Check: Does EVERY content type (post, reel, thread, video, channel, user, hashtag) get indexed? Does deletion trigger index removal? Does banning exclude from search? Does update trigger re-index? Are index schemas (fields, filterableAttributes, sortableAttributes) correct for the query patterns? |
| X10 | **Mobile Service ↔ Backend Endpoint Parity** | Read EVERY file in `apps/mobile/src/services/*.ts` (excluding signal/). For each API call, verify the backend endpoint exists, accepts the right HTTP method, expects the right DTO shape, and returns the right response type. Find: Dead endpoints (backend exists, no mobile caller). Ghost calls (mobile calls endpoint that doesn't exist). Type mismatches (mobile sends `string`, backend expects `number`). Missing error handling on mobile side. |

---

## WAVE 4 — MOBILE SCREENS UX (20 agents, ~10 screens each)

**What EVERY agent must check for EVERY screen:**
1. **Loading:** Uses `<Skeleton>`, not `<ActivityIndicator>` for content loading (buttons OK)
2. **Error:** Error state exists and shows meaningful message, not blank/crash
3. **Empty:** Uses `<EmptyState>` component, not bare "No items" text
4. **Keyboard:** `KeyboardAvoidingView` present on screens with `TextInput`
5. **Theme:** `useThemeColors()` → `tc.*` used, no `colors.dark.*` in JSX
6. **Haptic:** `useContextualHaptic()`, never `useHaptic()`
7. **Refresh:** `<BrandedRefreshControl>`, never raw `<RefreshControl>`
8. **Images:** `<ProgressiveImage>`, never raw `<Image>` from expo-image (for content)
9. **Toast:** `showToast()` for mutation feedback, never `Alert.alert` for non-destructive
10. **Cleanup:** Every `useEffect` that creates subscriptions/timers returns a cleanup function
11. **a11y:** `accessibilityRole` + `accessibilityLabel` on all interactive elements
12. **i18n:** No hardcoded English strings visible in JSX (all through `t()`)
13. **Navigation:** Type-safe `navigate()`, no `as never` casts
14. **Radius:** Uses `radius.*` from theme, never hardcodes `borderRadius >= 6`
15. **Data:** API calls exist for data screens (not hardcoded/mock data)

| Agent | Screens (read the actual .tsx file for each) |
|-------|-----------------------------------------------|
| D01 | `2fa-setup`, `2fa-verify`, `account-settings`, `account-switcher`, `achievements`, `ai-assistant`, `ai-avatar`, `analytics`, `appeal-moderation`, `archive` |
| D02 | `audio-library`, `audio-room`, `banned`, `biometric-lock`, `blocked-keywords`, `blocked`, `bookmark-collections`, `bookmark-folders`, `boost-post`, `branded-content` |
| D03 | `broadcast-channels`, `broadcast/[id]`, `call-history`, `call/[id]`, `camera`, `caption-editor`, `cashout`, `challenges`, `channel/[id]`, `charity-campaign` |
| D04 | `chat-export`, `chat-folder-view`, `chat-folders`, `chat-lock`, `chat-theme-picker`, `chat-wallpaper`, `circles`, `close-friends`, `collab-requests`, `communities` |
| D05 | `community-guidelines`, `community-posts`, `contact-sync`, `content-filter-settings`, `content-settings`, `conversation/[id]`, `conversation-info`, `conversation-media`, `create-broadcast`, `create-carousel` |
| D06 | `create-clip`, `create-event`, `create-group`, `create-playlist`, `create-post`, `create-reel`, `create-story`, `create-thread`, `create-video`, `creator-dashboard` |
| D07 | `creator-storefront`, `cross-post`, `dhikr-challenge-detail`, `dhikr-challenges`, `dhikr-counter`, `disappearing-default`, `disappearing-settings`, `discover`, `disposable-camera`, `dm-note-editor` |
| D08 | `donate`, `downloads`, `drafts`, `dua-collection`, `duet-create`, `edit-channel`, `edit-profile`, `eid-cards`, `enable-tips`, `end-screen-editor` |
| D09 | `event-detail`, `fasting-tracker`, `fatwa-qa`, `flipside`, `follow-requests`, `followers/[id]`, `following/[id]`, `gift-shop`, `go-live`, `green-screen-editor` |
| D10 | `hadith`, `hajj-companion`, `hajj-step`, `halal-finder`, `hashtag/[id]`, `hashtag-explore`, `hifz-tracker`, `image-editor`, `invite-friends`, `islamic-calendar` |
| D11 | `leaderboard`, `link-child-account`, `live/[id]`, `local-boards`, `location-picker`, `maintenance`, `majlis-list/[id]`, `majlis-lists`, `manage-broadcast`, `manage-data` |
| D12 | `marketplace`, `media-settings`, `membership-tiers`, `mentorship`, `morning-briefing`, `mosque-finder`, `muted`, `mutual-followers`, `my-reports`, `names-of-allah` |
| D13 | `nasheed-mode`, `new-conversation`, `notification-tones`, `notifications`, `orders`, `parental-controls`, `photo-music`, `pinned-messages`, `playlist/[id]`, `playlists/[id]` |
| D14 | `post/[id]`, `post-insights`, `prayer-times`, `product/[id]`, `product-detail`, `profile/[id]`, `profile-customization`, `qibla-compass`, `qr-code`, `qr-scanner` |
| D15 | `quiet-mode`, `quran-reading-plan`, `quran-room`, `quran-share`, `ramadan-mode`, `reel/[id]`, `reel-remix`, `reel-templates`, `report`, `reports/[id]` |
| D16 | `restricted`, `revenue`, `safety-center`, `save-to-playlist`, `saved-messages`, `saved`, `schedule-live`, `schedule-post`, `scholar-verification`, `screen-time` |
| D17 | `search-results`, `search`, `send-tip`, `series/[id]`, `series-detail`, `series-discover`, `settings`, `share-profile`, `share-receive`, `sound/[id]` |
| D18 | `starred-messages`, `status-privacy`, `sticker-browser`, `stitch-create`, `storage-management`, `story-viewer`, `streaks`, `surah-browser`, `tafsir-viewer`, `theme-settings` |
| D19 | `thread/[id]`, `trending-audio`, `verify-encryption`, `video/[id]`, `video-editor`, `video-premiere`, `voice-post-create`, `voice-recorder`, `volunteer-board`, `waqf` |
| D20 | `watch-history`, `watch-party`, `whats-new`, `why-showing`, `wind-down`, `xp-history`, `zakat-calculator`, Tab: `saf`, Tab: `bakra`, Tab: `majlis`, Tab: `minbar`, Tab: `risalah`, Tab: `_layout`, Tab: `create` |

---

## WAVE 5 — CRYPTO & E2E ENCRYPTION (8 agents)

**Attacker model: NSA TAO / Compromised server / Nation-state with MITM capability.**

**What EVERY agent in this wave must check:**
- Timing side-channels (non-constant-time comparisons on secrets)
- Key material lingering on JS heap (immutable strings, unreachable but not GC'd)
- Missing `zeroOut()` after key use
- Nonce reuse potential
- AEAD tag verification before processing decrypted data
- DH outputs checked against low-order points (small-subgroup attacks)
- Replay attack vectors (missing dedup, missing counters)
- Downgrade attack vectors (falling back to weaker protocol)
- `Math.random()` used anywhere near crypto (must be CSPRNG)

| Agent | Signal Protocol Files |
|-------|----------------------|
| F01 | `crypto.ts`, `native-crypto-adapter.ts`, `types.ts` |
| F02 | `x3dh.ts`, `pqxdh.ts` |
| F03 | `double-ratchet.ts`, `session.ts` |
| F04 | `sender-keys.ts`, `sealed-sender.ts` |
| F05 | `storage.ts`, `prekeys.ts` |
| F06 | `media-crypto.ts`, `streaming-upload.ts`, `offline-queue.ts` |
| F07 | `message-cache.ts`, `search-index.ts`, `telemetry.ts` |
| F08 | `key-transparency.ts`, `multi-device.ts`, `safety-numbers.ts`, `notification-handler.ts`, `e2eApi.ts`, `index.ts` |

---

## WAVE 6 — GO SERVICES (6 agents)

**What EVERY agent must check:**
- SQL injection (string concatenation in queries)
- Auth bypass (missing `requireAuth` middleware)
- Error swallowing (empty `if err != nil` blocks, `_ = err`)
- Context timeout missing on external calls (DB, Redis, LiveKit SDK, HTTP)
- Resource leaks (unclosed rows, connections, response bodies)
- Panic recovery (missing `recover()` in goroutines)
- Race conditions (shared state without mutex)
- SQL correctness (column names match schema, JOINs correct, transactions used where needed)
- Dockerfile security (running as root, unnecessary packages)

| Agent | Go Service Files |
|-------|-----------------|
| G01 | `apps/e2e-server/internal/handler/` — all handler files |
| G02 | `apps/e2e-server/internal/store/` + `middleware/` + `config/` + `model/` + `cmd/server/main.go` |
| G03 | `apps/livekit-server/internal/handler/handler.go` (rooms, token, leave, kick, mute — first half) |
| G04 | `apps/livekit-server/internal/handler/handler.go` (egress, ingress, webhooks, history, session, active — second half) |
| G05 | `apps/livekit-server/internal/store/` + `model/` + all SQL queries |
| G06 | `apps/livekit-server/internal/config/` + `middleware/` + `cmd/server/main.go` + `Dockerfile` |

---

## WAVE 7 — TESTING GAPS (14 agents)

**What EVERY agent must check:**
- List every service method and controller endpoint in scope
- For each: is there at least one test? (search `*.spec.ts` files)
- Test quality: does the test assert meaningful behavior, or just "expect(result).toBeDefined()"?
- Error path testing: are failure cases tested (invalid input, missing auth, race conditions)?
- Missing edge cases: empty arrays, null values, max-length strings, concurrent access
- Test-to-source ratio: < 0.3 is a red flag
- Mock correctness: do mocks match the actual Prisma schema and service signatures?

| Agent | Modules to audit test coverage |
|-------|-------------------------------|
| T01 | `auth`, `users`, `two-factor`, `devices`, `settings`, `privacy` |
| T02 | `posts`, `bookmarks`, `collabs`, `polls` |
| T03 | `reels`, `reel-templates`, `clips` |
| T04 | `threads`, `majlis-lists`, `communities`, `community`, `community-notes` |
| T05 | `videos`, `video-editor`, `video-replies`, `subtitles`, `thumbnails` |
| T06 | `messages`, `chat-export`, `stickers`, Gateway: `chat.gateway.ts` |
| T07 | `stories`, `story-chains`, `notifications`, `webhooks` |
| T08 | `payments`, `monetization`, `gifts`, `commerce` |
| T09 | `channels`, `channel-posts`, `follows`, `blocks`, `mutes`, `reports`, `moderation` |
| T10 | `search`, `hashtags`, `embeddings`, `recommendations`, `feed`, `promotions` |
| T11 | `islamic`, `mosques`, `halal`, `scholar-qa`, `live`, `audio-rooms`, `broadcast` |
| T12 | `admin`, `waitlist`, Common services: `circuit-breaker`, `feature-flags`, `payment-reconciliation`, `counter-reconciliation`, `meilisearch-sync`, `ab-testing` |
| T13 | Queue processors: `ai-tasks`, `analytics`, `media`, `notification`, `search-indexing`, `webhook` |
| T14 | Integration tests: all 11 files in `apps/api/test/`. Check: do they cover the 8 critical paths? Are there gaps in what the integration tests verify vs what could go wrong with real PostgreSQL? |

---

## WAVE 8 — i18n & ACCESSIBILITY (6 agents)

**What EVERY agent must check:**
- Hardcoded English strings in JSX (not using `t('key')`)
- Missing i18n keys: key used in code but missing from one or more of the 8 language files
- Inconsistent key counts across `en.json`, `ar.json`, `tr.json`, `ur.json`, `bn.json`, `fr.json`, `id.json`, `ms.json`
- RTL layout: `marginLeft`/`paddingLeft`/`left` should be `marginStart`/`paddingStart`/`start` for RTL languages (Arabic, Urdu)
- `textAlign: 'left'` should be `textAlign: I18nManager.isRTL ? 'right' : 'left'` or use `start`
- Missing `accessibilityRole` on `TouchableOpacity`, `Pressable`, buttons
- Missing `accessibilityLabel` on `Icon`, `Image`, icon-only buttons
- Screen reader tab order (interactive elements in logical order)

| Agent | Screens (same grouping as Wave 4, combined into fewer agents) |
|-------|-------------------------------------------------------------|
| I01 | D01 + D02 screens (20 total) |
| I02 | D03 + D04 screens (20 total) |
| I03 | D05 + D06 screens (20 total) |
| I04 | D07 + D08 + D09 screens (30 total) |
| I05 | D10 + D11 + D12 screens (30 total) |
| I06 | D13 + D14 + D15 + D16 + D17 + D18 + D19 + D20 screens (remaining ~80) |

---

## WAVE 9 — PERFORMANCE (8 agents)

| Agent | Focus | What to look for |
|-------|-------|-----------------|
| J01 | **N+1 Queries** | Read all `.service.ts` files. Find: loops with `prisma.model.findUnique` inside (should be `findMany` with `IN`). Find: missing `include` causing separate queries. Find: `getExcludedUserIds` called multiple times per request. |
| J02 | **Missing Database Indexes** | Read `schema.prisma`. For every query pattern in services (WHERE userId = X, WHERE conversationId = X AND createdAt < Y), verify an index exists. Foreign key columns without `@@index` are red flags. Composite query patterns need composite indexes. |
| J03 | **React Re-renders** | Read mobile screens. Find: inline object/array creation in JSX props (`style={{...}}` in render, `data={[...]}` recreated each render). Find: missing `React.memo` on list item components. Find: missing `useCallback` on functions passed to child components. Find: FlatList `renderItem` not memoized. |
| J04 | **Memory Leaks** | Read mobile screens + hooks. Find: `setInterval`/`setTimeout` without cleanup in useEffect return. Find: event listeners (socket, keyboard, app state) without removal. Find: subscriptions without unsubscribe. Find: stale closure over state in event handlers. |
| J05 | **Bundle Size** | Read `package.json` for both api and mobile. Find: packages imported but never used. Find: large packages imported entirely when only a submodule is needed (`import _ from 'lodash'` vs `import get from 'lodash/get'`). Find: missing dynamic imports for heavy screens. |
| J06 | **Image & Media** | Read media upload/display code. Find: images uploaded without compression. Find: missing `expo-image` caching configuration. Find: videos loaded without progressive download. Find: missing `blurhash` on images that should have it. Find: full-resolution images loaded in thumbnails. |
| J07 | **Redis Patterns** | Read all Redis usage (grep for `redis`, `ioredis`, `cache`). Find: missing TTL on cached values (stale forever). Find: oversized values (> 1MB). Find: hot keys (single key accessed by all users). Find: missing pipeline/MULTI for batch operations. |
| J08 | **API Response Size** | Read controllers and services. Find: `include` that fetches unnecessary relations. Find: responses returning full user objects (should be `select` with only needed fields). Find: list endpoints returning unbounded results (no pagination, no limit). Find: missing `select`/`omit` on Prisma queries. |

---

## WAVE 10 — INFRASTRUCTURE (5 agents)

| Agent | Focus | Files to Read |
|-------|-------|--------------|
| K01 | **CI Pipeline** | `.github/workflows/ci.yml`, `package.json` scripts, `apps/api/package.json`, `apps/mobile/package.json`. Check: Are all test types covered? Is there a lint step? Type-check step? Build step? Are integration tests running against real PostgreSQL? Are Go tests included? Is there a coverage threshold? |
| K02 | **Environment & Secrets** | `.env.example`, `apps/mobile/.env`, `apps/api/src/app.module.ts` (ConfigModule validation). Find: secrets hardcoded in source (API keys, passwords). Find: missing env validation (app starts with empty required vars). Find: `.env` files committed to git. Find: production/test key confusion. |
| K03 | **Cron Jobs & Schedulers** | All `@Cron()` decorators, all `@Interval()` decorators, scheduler services. Check: overlap prevention (what if a job takes longer than its interval?). Check: error handling (does a failed cron crash the server?). Check: monitoring (are cron failures logged to Sentry?). Check: idempotency (safe to run twice?). |
| K04 | **Queue Processing** | `apps/api/src/common/queue/` — all processors + queue service. Check: DLQ for permanently failed jobs. Check: retry configuration (count, backoff). Check: idempotency (same job processed twice = same result). Check: graceful shutdown (finish current job before exiting). Check: concurrency limits. |
| K05 | **Docker & Deployment** | `Dockerfile` (api), `Dockerfile` (livekit-server), `Dockerfile` (e2e-server), `railway.toml`, `Procfile`. Check: running as non-root user. Check: multi-stage build (small final image). Check: health check endpoint. Check: graceful shutdown signal handling. Check: unnecessary packages in final image. |

---

## WAVE 11 — ARCHITECTURE & CODE QUALITY (6 agents)

| Agent | Focus | What to Find |
|-------|-------|-------------|
| L01 | **Dead Code** | Find: exported functions/classes never imported elsewhere. Find: files with 0 imports from other files. Find: modules registered in AppModule but providing no used exports. Find: services injected but methods never called. Find: commented-out code blocks. Find: TODO/FIXME/HACK comments older than the file's last meaningful change. |
| L02 | **Circular Dependencies** | Map module imports. Find: Module A imports from Module B AND Module B imports from Module A (even transitively through a third module). Find: services that should use events/queues instead of direct injection. Find: `forwardRef()` usage (indicates a circular dep that was patched, not fixed). |
| L03 | **Pattern Inconsistency** | Find: the same problem solved differently in different modules. Example: pagination done 3 different ways, error responses in 3 different formats, date handling with 3 different libraries. Find: naming inconsistencies (some modules use `create`, others use `add`, others use `new`). |
| L04 | **Error Handling** | Find: empty `catch` blocks. Find: `catch(e) { throw e }` (pointless re-throw). Find: errors caught and logged but not re-thrown (silently swallowed). Find: inconsistent error types across modules. Find: missing try-catch around external service calls (Stripe, Clerk, R2, Meilisearch). |
| L05 | **Type Safety** | Find: `any` usage in non-test code (`.ts` and `.tsx`, excluding `.spec.ts`). Find: `@ts-ignore` or `@ts-expect-error`. Find: type assertions (`as Type`) that bypass type checking. Find: `!` non-null assertions where the value could actually be null. Find: untyped function parameters. |
| L06 | **Mobile Architecture** | Read `apps/mobile/src/store/index.ts`, all hooks, all services. Find: business logic in screen files that should be in hooks or services. Find: state management issues (prop drilling, unnecessary global state, missing local state). Find: duplicate data fetching (same API called from multiple screens without caching). Find: navigation state leaks (listeners not cleaned up). |

---

## WAVE 12 — MOBILE COMPONENTS & HOOKS (4 agents)

| Agent | Scope | What to Check |
|-------|-------|--------------|
| C01 | **48 UI Components** (`apps/mobile/src/components/ui/*.tsx`) | Every component: props typed (no `any`), default values sensible, cleanup on unmount, theme-aware (tc.* not raw colors), a11y attributes, handles edge cases (empty string, null, undefined). Platform-specific code handles both iOS and Android. |
| C02 | **Domain Components** (`apps/mobile/src/components/bakra/`, `saf/`, `majlis/`, `risalah/`, `story/`, `islamic/`, `editor/`) | Same checklist as C01, plus: do they use the correct UI components (ProgressiveImage not Image, Skeleton not ActivityIndicator)? Do list items use `React.memo`? Are event handlers memoized? |
| C03 | **28 Hooks** (`apps/mobile/src/hooks/*.ts`) | Every hook: cleanup in return function, no stale closures, no unnecessary re-renders (stable references via useCallback/useMemo), proper error handling, TypeScript strict (no any). Special attention to: `useLiveKitCall` (700 lines), `useScrollLinkedHeader`, `useStaggeredEntrance`. |
| C04 | **38 Services** (`apps/mobile/src/services/*.ts`, excluding signal/) | Every service: error handling on API calls, proper TypeScript types (not `any` responses), retry logic where appropriate, cleanup/cancellation support. Check: `api.ts` base client configuration (interceptors, timeout, auth header injection). |

---

## WAVE 13 — PRISMA SCHEMA DEEP AUDIT (2 agents)

| Agent | Scope |
|-------|-------|
| S01 | `schema.prisma` lines 1-2500: Every model, every field, every relation. Check: field types correct (Decimal for money, DateTime for timestamps, not String). Check: `@default` values sensible. Check: `@@map` table names follow convention. Check: enum values complete and used. Check: optional fields that should be required (or vice versa). Check: missing `@updatedAt`. Check: `String` fields that should be enums. |
| S02 | `schema.prisma` lines 2501-5037: Same checklist. Additionally: count total models and verify all have corresponding service + controller (or document why not). Cross-reference `@@index` definitions against actual query patterns in services (from Wave 2 findings). |

---

## COMPILATION PHASE

After ALL 13 waves complete:

### Step 1: Collect
Read all agent output files from `docs/audit/YYYY-MM-DD-full-audit/`.

### Step 2: Deduplicate
Same issue found by multiple agents → keep the most detailed version, note which agents found it.

### Step 3: Classify
Group by:
- **Security** (auth, injection, crypto, data exposure)
- **Data Integrity** (schema, transactions, cascades, counters)
- **Cross-Module** (broken flows, orphaned events, contract violations)
- **UX** (loading, error, empty, a11y, i18n)
- **Performance** (N+1, missing indexes, re-renders, memory leaks)
- **Testing** (coverage gaps, weak assertions, missing edge cases)
- **Architecture** (dead code, circular deps, inconsistency)
- **Infrastructure** (CI, env, crons, queues, deployment)

### Step 4: Write MASTER_FINDINGS.md

```markdown
# Full Codebase Audit — [DATE]

## Summary
- Total agents: [N]
- Total raw findings: [N]
- After dedup: [N]
- Regressions found: [N]

## By Severity
| Severity | Count |
|----------|-------|
| Critical | X |
| High | X |
| Medium | X |
| Low | X |
| Info | X |

## By Category
| Category | C | H | M | L | I | Total |
|----------|---|---|---|---|---|-------|
| Security | | | | | | |
| Data Integrity | | | | | | |
| Cross-Module | | | | | | |
| UX | | | | | | |
| Performance | | | | | | |
| Testing | | | | | | |
| Architecture | | | | | | |
| Infrastructure | | | | | | |

## Top 20 Critical Findings
[Full detail for each]

## All Findings (sortable table)
[Complete table]

## Regressions (previously fixed, now broken)
[List with original fix commit + current state]

## Statistics
- Files audited: [N]
- Files skipped: [N] (with reasons)
- Agent reruns: [N] (with reasons)
- Verification failures: [N]
```

### Step 5: Write ACTIONABLE_FIXES.md
Only findings with severity C, H, M. Grouped by file (so a fixer can work file-by-file). Exclude Info and Low.

### Step 6: Write UNFIXED_FROM_PREVIOUS.md
Cross-reference with `docs/audit/deep-audit-2026-03-26/UNFIXED_FINDINGS.md` and `docs/audit/DEFERRED_FIXES.md`. Any item that was "deferred" but should now be fixed = flag it.

---

## ESTIMATED AGENT COUNT

| Wave | Agents | Focus |
|------|--------|-------|
| 1 | 16 | Backend Security |
| 2 | 12 | Backend Data Integrity |
| 3 | 10 | Cross-Module Connectivity |
| 4 | 20 | Mobile Screens UX |
| 5 | 8 | Crypto & E2E |
| 6 | 6 | Go Services |
| 7 | 14 | Testing Gaps |
| 8 | 6 | i18n & Accessibility |
| 9 | 8 | Performance |
| 10 | 5 | Infrastructure |
| 11 | 6 | Architecture & Code Quality |
| 12 | 4 | Mobile Components & Hooks |
| 13 | 2 | Prisma Schema |
| **Total** | **117** | |

Expect 600-900 raw findings, 400-600 after dedup.

---

## FINAL INSTRUCTION TO THE COORDINATOR

You are the Lead Auditor. You do NOT audit files yourself (except for verification spot-checks). You:

1. Spawn Wave 1 agents (all 16 in parallel)
2. Wait for all to return
3. Verify 5 random findings
4. Write agent outputs to `docs/audit/YYYY-MM-DD-full-audit/`
5. Spawn Wave 2
6. Repeat until Wave 13
7. Compile MASTER_FINDINGS.md
8. Report total counts to user

If context gets tight, prioritize: Wave 3 (cross-module) > Wave 1 (security) > Wave 5 (crypto) > Wave 2 (data) > Wave 4 (UX) > everything else. The cross-module findings are the ones NO other process catches.

**Do not stop at Wave 3 and say "we've found enough." Complete all 13 waves.**
**Do not skip verification. Agents lie.**
**Do not use Sonnet or Haiku. Opus only.**
