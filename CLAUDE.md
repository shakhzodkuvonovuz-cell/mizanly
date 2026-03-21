# CLAUDE.md — Mizanly Project Guide

## MANDATORY: Read All Memory Files Before Any Task

At the start of every session, read ALL files in `~/.claude/projects/C--dev-mizanly/memory/`:
- `user_shakhzod.md` — who the user is, preferences, communication style
- `project_current_state_march21.md` — ground truth metrics, batch status, honest scores
- `project_complete_gaps_audit_march21.md` — MASTER GAP LIST: 428 findings across 82 categories with priority tiers + user's brainstorm features
- `reference_competitor_intel.md` — UpScrolled, Muslim Pro, market data
- `feedback_*.md` — all feedback files (brutal honesty, no subagents, no co-author, max effort, Islamic data manual)
- `project_audit_march2026.md` — 60-dimension audit results

These files contain critical context that took 700K+ tokens of conversation to establish. Without them, you will repeat mistakes, inflate scores, use subagents, and produce shallow work. Read them FIRST.

---

## What is Mizanly?
Mizanly (ميزانلي) — a culturally intelligent social platform for the global Muslim community.
Five "spaces" combining Instagram + TikTok + X/Twitter + WhatsApp + YouTube in one app.
Brand: Emerald #0A7B4F + Gold #C8963E | Dark-mode primary | Arabic RTL support

## The Five Spaces
| Space | Arabic | Model | Status |
|-------|--------|-------|--------|
| Saf | الصف | Instagram (feed + stories) | Built |
| Majlis | المجلس | X/Twitter (threads) | Built |
| Risalah | رسالة | WhatsApp (DMs + groups) | Built |
| Bakra | بكرة | TikTok (short video) | Built (V1.1) |
| Minbar | المنبر | YouTube (long video) | Built (V1.3) |

---

## Status: Post-Test Expansion (as of 2026-03-21)
All 5 spaces built + Telegram + Discord + WeChat feature parity + 4 feature batches + comprehensive 60-dimension audit + 13-pass deep gap analysis (418 findings) + test expansion. 208 screens, 82 controllers, 79 backend modules, 187 Prisma models (447 relations), 171 test files (2,748 tests, 100% pass), 276K lines of code, 692 commits in 18 days.
Backend: NestJS with 79 modules (87 services, 82 controllers, 171 test files). Core: Redis, BullMQ job queues (6 queues, 5 processors), rate limiting (all 82 controllers), Stripe (Decimal money fields), Cloudflare Stream, Email (Resend), Meilisearch. AI: Claude API (text moderation + image moderation via Vision) + Whisper transcription + Gemini embeddings. Commerce: marketplace, Zakat (multi-asset, Decimal precision, configurable gold/silver prices via env), Waqf, virtual currency (coins/gifts/diamonds). Gamification: streaks, XP/levels, achievements, challenges, series, daily Islamic tasks (morning briefing). Telegram: saved messages, chat folders, slow mode, admin log, group topics, custom emoji. Discord: forum threads, webhooks, stage sessions, persistent voice channels, granular role permissions. Community: local boards, mentorship, study circles, fatwa Q&A, volunteering, events, voice posts, watch parties, community notes, mosque social graph.
**Batch 4 fixes:** Real prayer times (Aladhan API + local solar calculator fallback), Quran text API (Quran.com v4, 114 surahs, verse search, random ayah), real image moderation (Claude Vision SAFE/WARNING/BLOCK), 50+ FK relations wired with onDelete rules, mosque finder (Haversine DB query + OSM Overpass fallback), Ramadan from Hijri calendar, charity amounts Decimal, configurable Zakat prices, privacy policy + ToS endpoints, TURN/STUN config, 12 memoized UI components.
**Test expansion:** Batch 1 added 548 service tests (happy+error+auth per method). Batch 2 (running) adding 63 controller specs + 27 service expansions + gateway + integration tests. Batch 3 planned for edge cases, authorization matrix, error recovery, concurrency, abuse vectors.
Mobile: 208 screens, 35 UI components, 23 hooks, 19 API services. i18n: 8 languages (en + ar + tr + ur + bn + fr + id + ms) at 2,740 keys each. All screens reachable via navigation (0 orphans). ScreenErrorBoundary on all screens. Create sheet: 7 options. Settings: 11 sections. Conversation info: 11 options.
Islamic: prayer times (Aladhan API, 8 calc methods, 6 adhan reciters, local solar fallback), Quran (Quran.com API, 114 surahs, 4 reciters, reading plans, tafsir, rooms, verse search), hadith (200+), dhikr counter + challenges, zakat calculator (configurable prices), mosque finder (Haversine + OSM) + social graph, Hajj companion, Ramadan mode, Eid cards, nasheed mode, scholar verification + live Q&A, fatwa Q&A, halal restaurant finder, dua collection (100+), fasting tracker, 99 Names of Allah, hifz tracker, daily morning briefing, Islamic calendar theming (5 overlays auto-activated by Hijri date).
**Known gaps:** 418 findings documented in `docs/audit/` and memory files. Key blockers: Apple IAP not installed (App Store rejection), google-services.json missing (Android push), SQL injection in embeddings, video upload not wired from mobile, payments API unused on mobile. Full gap list in memory file `project_complete_gaps_audit_march21.md`.
**Next: test batch 3 (edge cases + auth matrix + abuse vectors), then production deployment.**

## Key Documentation Files

**CURRENT — Read when relevant:**
- `docs/DEPLOYMENT.md` — Production deployment guide (Railway, Neon, Cloudflare, Clerk, Stripe) — still accurate
- `docs/DEPLOY_CHECKLIST.md` — Pre-deployment verification checklist with checkboxes
- `docs/TURN_SETUP.md` — WebRTC TURN/STUN server setup instructions
- `docs/ONBOARDING.md` — Developer onboarding guide

**AUDIT & ANALYSIS — Current findings:**
- `docs/audit/COMPREHENSIVE_AUDIT_2026.md` — 60-dimension audit, all findings with line numbers
- `docs/audit/PRIORITY_FIXES.md` — P0 and P1 items sorted by severity
- `docs/audit/HONEST_SCORES.md` — Per-dimension scores with evidence
- `docs/audit/MARKET_ANALYSIS.md` — Market sizing, competitor landscape, launch strategy
- `docs/audit/ALGORITHM_DEEP_AUDIT.md` — User's brainstorm: feed algorithm improvements (includes P0 SQL injection)
- `docs/audit/TEST_QUALITY_AUDIT.md` — Test suite quality analysis, anti-patterns found
- `docs/COMPETITOR_DEEP_AUDIT_2026.md` — 15-dimension competitor audit with scoring

**72-AGENT DEEP AUDIT (March 21, 2026) — MUST READ:**
- `docs/audit/agents/` — 72 raw audit files (~4,300+ findings, 51K lines). One .md file per agent scope (01-islamic-services.md through 72-dead-code-unused.md). Each file contains every finding with file path, line number, severity, code snippet. Read the specific agent file before fixing its scope.
- `docs/audit/DEFERRED_FIXES.md` — **READ BEFORE STARTING EVERY NEW AUDIT FILE.** Master tracker of all deferred/noted items across all 72 files. Contains: (1) items deferred because they cross into another file's scope, (2) items that need schema migration, (3) items that are acceptable risk. OPEN items MUST be resolved when their owning file is reached. Updated after each file is processed. This file prevents findings from being lost across sessions or context compression.
- `docs/audit/DEEP_AUDIT_INDEX_2026_MARCH21.md` — Index of all 72 agents with scope descriptions, finding counts, top criticals per agent. Use to understand what each audit file covers and plan remediation order.
- `docs/audit/SESSION_CONTINUATION_PROMPT.md` — **USE THIS TO START A NEW SESSION.** Contains full context, rules, patterns, and instructions for continuing the audit remediation from where we left off.
- **Progress so far:** Files 01-16 complete. Next: file 17. Total 3,800 tests, 0 failures.

**USER'S BRAINSTORM FEATURES — Designed, not yet built:**
- `docs/features/DATA_IMPORT_ARCHITECTURE.md` — Data import from Instagram/TikTok/X/YouTube/WhatsApp
- `docs/features/EXIT_STORY_SPEC.md` — Shareable "I'm moving to Mizanly" story after data import

**RALPH EXECUTION SYSTEM:**
- `docs/ralph-instructions.md` — Behavioral rules for autonomous execution (no shortcuts, verify everything)
- `docs/ralph-test-batch1.md` — Test batch 1 (service unit tests) — COMPLETE (+548 tests)
- `docs/ralph-test-batch2.md` — Test batch 2 (controllers + expansion) — COMPLETE (+742 tests, total 2,780)
- `docs/ralph-test-batch3.md` — Test batch 3 (edge cases, auth matrix, error recovery, concurrency, abuse vectors) — 110 tasks, ~1,050 target tests
- `docs/ralph-batch4.md` — Feature batch 4 (audit fix) — COMPLETE

**STALE — Historical only, do NOT use as source of truth:**
- `STRUCTURE.md` — Day 1 app structure (Mar 3). Superseded by actual codebase + this file.
- `ARCHITECTURE.md` — Day 1 architecture (Mar 3). Superseded by this file.
- `ANTIGRAVITY_PROMPT*.md` — Old agent system prompts (Mar 11-12). Superseded by ralph-instructions.md.
- `BATCH_*_INSTRUCTIONS.md` — Old batch instructions (Mar 11-12). Work completed.
- `ARCHITECT_INSTRUCTIONS*.md` — Old batch dispatching (Mar 11-18). Superseded by ralph system.
- `MEGA_SESSION_STARTER.md` — Old session starter. Superseded by memory files.
- `docs/COMPETITOR_ANALYSIS.md` — Early competitor analysis (Mar 13). Superseded by COMPETITOR_DEEP_AUDIT_2026.md.
- `docs/PARITY_SCORES_BATCH85.md` — Inflated scores. Superseded by HONEST_SCORES.md.
- `docs/PROJECT_HISTORY.md` — Only covers first 5 days. Missing 13 days of history.

---

## CRITICAL STUBS — ALL RESOLVED
All 7 original critical stubs have been fixed in batches 1-5:

1. Composer toolbar (location, hashtag, mention) — Fixed batch 2
2. Thread reply like button — Fixed batch 2
3. Story highlights — Fixed batch 2
4. Blocked keywords navigation — Fixed batch 2
5. Voice messages — Fixed batch 2
6. Font loading (useFonts) — Fixed batch 1
7. StoryBubble ring colors — Fixed batch 1

---

## REMAINING GAPS (by priority)

### Implemented (remove from gap tracking)
All Tier 1, Tier 2, and most Tier 3 items from original gap list are now implemented:
- Thread reply interactions, comment edit/delete, tab scroll-to-top, pull-to-refresh
- Voice messages, swipe-to-reply, long-press context menu, GIF picker
- Hashtag/mention autocomplete, location picker, story highlights, profile links
- Lightbox/pinch-zoom, draft auto-save, notification filters, theme selector
- Message forward, message edit (inline)

### All Tiers Complete
**Tiers 1-8:** Full platform parity with Instagram, TikTok, X, YouTube, WhatsApp
**Tier 9:** AI-Powered Moat — content assistant, auto-translate, moderation, captions, avatars, smart replies, summarization, space routing
**Tier 10:** Gamification — streaks, achievements, XP/levels, leaderboards, challenges, series, profile customization
**Tier 11:** Commerce — halal marketplace, business directory, checkout, Islamic finance, Zakat, Waqf, premium
**Tier 12:** Community — local boards, mentorship, study circles, fatwa Q&A, volunteer, events, reputation, voice posts, watch parties, data export
**Tier 13:** Audit & Hardening — P0-P2 bug fixes, screen wiring, i18n cleanup, type safety, font fix, security (socket token refresh, 2FA flow)

### Tier 14: 2026 Competitor Parity (COMPLETE)
**Batch 65-68 — Quick wins (Low effort, high impact):**
- ~~Spoiler text in messages (tap-to-reveal)~~ — ✅ Batch 65
- ~~View Once voice messages~~ — ✅ Batch 65
- ~~Member tags in group chats~~ — ✅ Batch 66
- ~~Subscriber-only stories~~ — ✅ Batch 66
- ~~Meditation/wind-down screen~~ — ✅ Batch 67
- ~~Dedicated video tab in Majlis~~ — ✅ Batch 67
- ~~Side panel shortcuts (Live, Series)~~ — ✅ Batch 67

**Batch 69-71 — Medium effort:**
- ~~Local/Nearby Feed~~ — ✅ Batch 69 (backend + API)
- ~~Inline DM translation~~ — ✅ Batch 69 (inline translate button in MessageBubble)
- ~~Group message history for new members~~ — ✅ Batch 70 (newMemberHistoryCount field)
- ~~Secret code chat lock~~ — ✅ Batch 70 (lockCode + verify endpoint)
- ~~Algorithm transparency~~ — ✅ Already existed (feed-transparency.service)
- ~~Photo carousels in Bakra~~ — ✅ Batch 71 (isPhotoCarousel + carouselUrls)
- ~~Cross-channel publishing~~ — ✅ Batch 71 (crossPublish API)
- ~~Follower vs non-follower analytics~~ — ✅ Batch 85 (ViewerDemographic model + getAudienceDemographics)
- Account deep dive (creation country, username history) — Deferred

**Batch 85 — 10/10 Parity (complete):**
- ~~Multi-guest live streaming (up to 4 guests)~~ — ✅ Batch 85
- ~~Audio room recording + discovery~~ — ✅ Batch 85
- ~~Group video calls (up to 8) + screen sharing~~ — ✅ Batch 85
- ~~Audience demographics (country, age, gender, source)~~ — ✅ Batch 85
- ~~Video chapters with timestamp parsing~~ — ✅ Batch 85
- ~~Multiple adhan reciters (6) + calculation methods (8)~~ — ✅ Batch 85
- ~~Quran audio recitation (4 reciters)~~ — ✅ Batch 85
- ~~Comprehensive Zakat calculator (multi-asset, nisab)~~ — ✅ Batch 85
- ~~Granular community role permissions~~ — ✅ Batch 85
- ~~Webhook system (HMAC-SHA256 signed delivery)~~ — ✅ Batch 85
- ~~Persistent always-on voice channels~~ — ✅ Batch 85
- ~~Sentry error reporting (mobile + API)~~ — ✅ Batch 85
- ~~8 languages at 100% key parity~~ — ✅ Batch 85

**Deferred to future releases:**
- AI dubbing (auto-dub in other languages)
- AI Restyle video editing
- AI "Best Moments" for Shorts from livestreams
- Friends Map / location sharing
- Camera effects (30 backgrounds/filters)
- Live reaction to other streams
- TV app (Fire TV / Google TV)

### Backend + Performance Hardening (Batches 68, A1-C)
- ~~TODO stubs~~ — ✅ Fixed
- ~~Pagination limits~~ — ✅ 175 findMany calls capped with take: 50
- ~~Rate limiting~~ — ✅ All controllers now throttled (10 added in Batch B)
- ~~Database indexes~~ — ✅ 15 models indexed (VideoReaction, CommentReaction, etc.)
- ~~Parental PIN~~ — ✅ scrypt hashed
- ~~Upload folder~~ — ✅ @IsIn whitelist
- ~~List component memo~~ — ✅ StoryRow, BottomSheetItem, CaughtUpCard, AlgorithmCard wrapped
- ~~Story viewer~~ — ✅ Uses Zustand store instead of JSON.stringify in URL params
- ~~Optimistic updates~~ — ✅ Bakra like/bookmark instantly update cache
- ~~Touch targets~~ — ✅ Bakra follow button: hitSlop={12} for 44pt compliance
- ~~Accessibility~~ — ✅ Image labels added to key screens
- ~~Prisma onDelete rules~~ — ✅ Batch 85 (32 relations fixed, 0 remaining)
- ~~Dead-code take:50 patterns~~ — ✅ Batch 85 (8 removed)
- ~~ScreenErrorBoundary coverage~~ — ✅ Batch 85 (196/196 screens)
- Remaining: 43 inline renderItems in utility screens (negligible impact)

---

## MANDATORY CODE QUALITY RULES
**All screens must follow these. Never violate them.**

1. Modals → `<BottomSheet>` + `<BottomSheetItem>` — NEVER RN `Modal`
2. Loading → `<Skeleton.PostCard>` / `<Skeleton.Rect>` / etc. — NEVER bare `<ActivityIndicator>`
3. Empty states → `<EmptyState icon="..." title="..." />` — NEVER bare `<Text>No items</Text>`
4. Navigation back → `<Icon name="arrow-left" />` — NEVER `←` text/emoji
5. Close/dismiss → `<Icon name="x" />` — NEVER `✕` or `×` text
6. Verified → `<VerifiedBadge size={13} />` — NEVER `✓` text
7. Char count → `<CharCountRing current={n} max={m} />` — NEVER plain `{n}/500` text
8. Round radius → `radius.full` from theme — NEVER hardcoded `borderRadius: 20`
9. Gradients → `expo-linear-gradient` — NEVER CSS `linear-gradient(...)` string
10. Pull-to-refresh → `<RefreshControl tintColor={colors.emerald} />` on all FlatLists

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** — Always `<BottomSheet>`
2. **NEVER use text emoji for icons** — Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** — Always `radius.*` from theme
4. **NEVER use bare "No items" text** — Always `<EmptyState>`
5. **NEVER change Prisma schema field names** — They are final
6. **NEVER use `@CurrentUser()` without `'id'`** — Always `@CurrentUser('id')`
7. **ALL FlatLists must have `<RefreshControl>`** (or `onRefresh` + `refreshing` shorthand)
8. **NEVER use `any` in new non-test code** — Type everything properly
9. **ActivityIndicator OK in buttons only** — use `<Skeleton>` for content loading
10. **The `$executeRaw` tagged template literals are SAFE** — do NOT replace them
11. **NEVER suppress errors with `@ts-ignore` or `@ts-expect-error`** — fix the actual type
12. **NEVER add `as any` in non-test code** — find the correct type instead
13. **Test files (*.spec.ts) MAY use `as any` for mocks** — this is the only exception
14. **ALL design/UI work MUST use `frontend-design` and `ui-ux-pro-max` skills** — invoke these plugins before any screen, component, or visual implementation work

---

## Architecture
```
mizanly/
├── apps/
│   ├── api/                     # NestJS 10 backend
│   │   ├── src/modules/         # 79 feature modules
│   │   ├── src/common/          # ClerkAuthGuard, OptionalClerkAuthGuard, decorators, sentry, queue, email
│   │   ├── src/gateways/        # Socket.io /chat namespace (chat, calls, Quran rooms)
│   │   └── prisma/schema.prisma # 187 models, 3,859 lines
│   └── mobile/                  # React Native Expo SDK 52
│       ├── app/
│       │   ├── (tabs)/          # saf, majlis, risalah, bakra, minbar, create
│       │   └── (screens)/       # 208 screens + nested route dirs
│       └── src/
│           ├── components/ui/   # 35 components: BottomSheet, Skeleton, Icon, Avatar,
│           │                    # GlassHeader, GradientButton, EmptyState, VerifiedBadge,
│           │                    # CharCountRing, VideoPlayer, ImageLightbox, DoubleTapHeart,
│           │                    # AuthGate, OfflineBanner, TTSMiniPlayer, Toast, etc.
│           ├── components/islamic/ # EidFrame, IslamicThemeBanner
│           ├── hooks/           # 23 hooks: useHaptic, useTranslation, useNetworkStatus, usePiP,
│           │                    # useVideoPreloader, useAmbientColor, useIslamicTheme, useTTS, etc.
│           ├── services/        # 19 API service files (api.ts, islamicApi.ts, widgetData.ts, etc.)
│           ├── stores/index.ts  # Zustand store
│           ├── theme/index.ts   # Design tokens
│           ├── utils/           # hijri.ts, etc.
│           ├── i18n/            # 8 languages: en, ar, tr, ur, bn, fr, id, ms
│           └── types/index.ts   # TypeScript interfaces
```

## Tech Stack
- **Mobile:** React Native (Expo SDK 52) + TypeScript + Expo Router
- **Backend:** NestJS 10 + Prisma + Neon PostgreSQL
- **Auth:** Clerk (email, phone, Apple, Google) + svix webhooks
- **Storage:** Cloudflare R2 (presigned PUT) + Stream (video)
- **Real-time:** Socket.io `/chat` namespace (Clerk JWT auth on connect)
- **Search:** Meilisearch | **Cache:** Upstash Redis
- **npm NOT in shell PATH** — run all npm commands in Windows terminal

## Credential Status (verified 2026-03-21)

**READ THIS BEFORE ASSUMING ANY FEATURE WORKS.**

| Service | Env Var(s) | Status | Impact |
|---------|-----------|--------|--------|
| Neon PostgreSQL | `DATABASE_URL`, `DIRECT_DATABASE_URL` | **SET** | DB works |
| Clerk Auth | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | **SET** | Auth works |
| Clerk Webhooks | `CLERK_WEBHOOK_SECRET` | **EMPTY** | User sync from Clerk dashboard broken |
| Upstash Redis | `REDIS_URL` | **SET** | Cache + queues work |
| Stripe Payments | `STRIPE_SECRET_KEY` | **SET (test)** | Test payments work |
| Stripe Webhooks | `STRIPE_WEBHOOK_SECRET` | **EMPTY** | Payment event processing broken |
| Anthropic Claude | `ANTHROPIC_API_KEY` | **SET** | Moderation + translation work |
| Cloudflare R2 | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY` | **ALL EMPTY** | ALL file uploads dead (photos, avatars, media) |
| Cloudflare Stream | `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN` | **MISSING** | Video hosting dead |
| Meilisearch | `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` | **ALL EMPTY** | Search falls back to slow Prisma queries |
| Sentry | `SENTRY_DSN` | **EMPTY** | No error monitoring |
| Gemini (embeddings) | `GEMINI_API_KEY` | **NOT IN .env** | Embeddings/recommendations completely dead |
| OpenAI Whisper | `OPENAI_API_KEY` | **NOT IN .env** | Voice transcription dead |
| Resend Email | `RESEND_API_KEY` | **NOT IN .env** | No emails send |
| TURN/STUN Server | `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | **NOT IN .env** | Video calls behind NAT fail |
| Gold/Silver prices | `GOLD_PRICE_PER_GRAM`, `SILVER_PRICE_PER_GRAM` | **NOT IN .env** | Zakat uses hardcoded fallback ($92/g, $1.05/g) |

**Summary: 4 of 14 services work. R2 empty = no media uploads. Stream empty = no video. Gemini missing = no recommendations.**

**ENV VAR NAME MISMATCH WARNING:** `.env.example` uses different names than actual `.env` and code:
- `.env` has `CLOUDFLARE_ACCOUNT_ID` but code reads `R2_ACCOUNT_ID` and `CF_STREAM_ACCOUNT_ID`
- `.env` has `CLOUDFLARE_R2_ACCESS_KEY` but code reads `R2_ACCESS_KEY_ID`
- Must reconcile before filling in values — check `upload.service.ts` and `stream.service.ts` for actual var names

---

## Design Tokens (`apps/mobile/src/theme/index.ts`)
```ts
colors.emerald = #0A7B4F       colors.gold = #C8963E
colors.dark.bg = #0D1117       colors.dark.bgElevated = #161B22
colors.dark.bgCard = #1C2333   colors.dark.bgSheet = #21283B
colors.dark.surface = #2D3548  colors.dark.border = #30363D
colors.text.primary = #FFF     colors.text.secondary = #8B949E
colors.text.tertiary = #6E7781 colors.error = #F85149
colors.active.emerald10 = rgba(10,123,79,0.10)

spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 full=9999
animation.spring: bouncy(D10 S400) / snappy(D12 S300) / responsive(D15 S150) / gentle(D20 S100)
```

---

## Component Quick Reference

### Icon — 44 valid names
```tsx
<Icon name={IconName} size={'xs'|'sm'|'md'|'lg'|'xl'|number} color={string} />
// xs=16 sm=20 md=24 lg=28 xl=32
// Names: arrow-left, chevron-right/left/down, heart, heart-filled, message-circle,
// bookmark, bookmark-filled, share, repeat, image, camera, video, play, mic, phone,
// search, hash, at-sign, filter, trending-up, user, users, bell, mail, check-circle,
// send, pencil, edit, trash, x, plus, circle-plus, more-horizontal, settings, lock,
// globe, eye, eye-off, flag, volume-x, link, clock, map-pin, smile, paperclip,
// check, check-check, layers, slash, log-out, bar-chart-2, loader
```

### Avatar
```tsx
<Avatar uri={string|null} name={string}
  size={'xs'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'}  // 24/32/40/52/64/96/128
  showOnline={bool} showStoryRing={bool} showRing={bool} ringColor={string} onPress={fn} />
```

### BottomSheet + BottomSheetItem
```tsx
<BottomSheet visible={bool} onClose={fn} snapPoint={number?}>
  <BottomSheetItem label="..." icon={<Icon />} onPress={fn} destructive? disabled? />
</BottomSheet>
```

### Skeleton
```tsx
<Skeleton.Circle size={40} />    <Skeleton.Rect width={120} height={14} borderRadius={6} />
<Skeleton.Text width="60%" />    <Skeleton.PostCard />    <Skeleton.ThreadCard />
<Skeleton.ConversationItem />    <Skeleton.ProfileHeader />
```

### EmptyState + CharCountRing + RichText
```tsx
<EmptyState icon="users" title="..." subtitle="..." actionLabel="..." onAction={fn} />
<CharCountRing current={n} max={500} size={28} />  // hidden <70%, orange 90%, red 100%
<RichText content={string} />  // parses #hashtag → hashtag screen, @mention → profile
```

---

## API Patterns
- Base: `/api/v1/` | Auth: `Authorization: Bearer <clerk_jwt>`
- Pagination: `?cursor=<id>` → `{ data: T[], meta: { cursor?, hasMore } }`
- `OptionalClerkAuthGuard` for public+personalized routes (attaches user without 401)
- Global throttle: 100 req/min | `check-username`: 20/min
- All responses: `{ data: T, success: true, timestamp }` via TransformInterceptor

## Socket.io — `/chat` namespace
```ts
io(`${API_BASE_URL}/chat`, { auth: { token: clerkJwt }, transports: ['websocket'] })
socket.emit('join_conversation', { conversationId })
socket.emit('send_message', { conversationId, content, replyToId?, messageType })
socket.emit('typing', { conversationId, isTyping: boolean })
socket.on('new_message', (msg: Message) => ...)
socket.on('user_typing', ({ userId, isTyping }) => ...)
```

---

## Critical Schema Field Names
- ALL models: `userId` (NOT authorId) | `user` relation (NOT `author`)
- Post: `content` (NOT caption) | `postType` | `mediaUrls[]` + `mediaTypes[]` arrays
- Thread: `isChainHead` (NOT replyToId) | replies → separate `ThreadReply` model
- Story: `mediaType` (NOT type) | `viewsCount` (NOT viewCount)
- Conversation: `isGroup: boolean` + `groupName?` — NO `type` or `name` fields
- Message: `messageType` (NOT type) | `senderId` (NOT from)
- Notification: `userId` (NOT recipientId) | `isRead` (NOT read) | individual FK fields
- User: `coverUrl` (NOT coverPhotoUrl) | `website` (NOT websiteUrl)
- Follow: composite PK [followerId, followingId]

### Naming Convention Exceptions (documented, not bugs)
These models use semantically meaningful field names instead of `userId`:
- `ForumThread.authorId`, `ForumReply.authorId`, `CommunityNote.authorId` — `authorId` conveys authorship
- `Circle.ownerId`, `MajlisList.ownerId`, `HalalBusiness.ownerId` — `ownerId` conveys ownership
- `CustomEmojiPack.creatorId` — `creatorId` conveys creation role
- `GiftRecord.senderId`/`receiverId`, `Restrict.restricterId`/`restrictedId` — role-specific FKs
These are NOT violations — they're intentional semantic naming for multi-FK models.

## ID Strategy
- Core models (Pre-Batch 33): use `@default(cuid())`
- Extension models (Batch 33+): use `@default(uuid())`
- Both are acceptable. New models should use `@default(cuid())` for consistency with core.

---

## Zustand Store
```ts
unreadNotifications / setUnreadNotifications(n)
unreadMessages / setUnreadMessages(n)
safFeedType: 'following'|'foryou'
majlisFeedType: 'foryou'|'following'|'trending'
isCreateSheetOpen / setCreateSheetOpen(bool)
theme: 'dark'|'light'|'system' / setTheme   // theme-settings screen exists
```

---

## Development Commands
```bash
# All npm must run in Windows terminal (not shell — npm not in PATH)
cd apps/api && npm install && npm run start:dev   # Swagger: http://localhost:3000/docs
cd apps/mobile && npm install && npx expo start
cd apps/api && npx prisma db push                 # Apply schema changes
cd apps/api && npx prisma studio                  # DB browser GUI
```

## Font Family Names (IMPORTANT — must match useFonts registration)
```ts
// These are the ACTUAL registered font family names after useFonts() loads them:
fonts.headingBold = 'PlayfairDisplay_700Bold'   // NOT 'PlayfairDisplay-Bold'
fonts.body = 'DMSans_400Regular'                // NOT 'DMSans'
fonts.bodyMedium = 'DMSans_500Medium'
fonts.bodyBold = 'DMSans_700Bold'
fonts.arabic = 'NotoNaskhArabic_400Regular'
fonts.arabicBold = 'NotoNaskhArabic_700Bold'
```

## i18n
- **Languages:** en (English), ar (Arabic), tr (Turkish), ur (Urdu), bn (Bengali), fr (French), id (Indonesian), ms (Malay)
- **Keys:** 2,740 per language, all 8 files at 100% parity
- **Config:** `src/i18n/index.ts` — auto-detects device locale, falls back to `en`
- **Adding a language:** Create `xx.json`, import in `index.ts`, add to resources + resolveLanguage()
- **Key structure:** Nested dot notation (`risalah.chats`, `tabs.createSheet.photoOrVideoPost`)
- **IMPORTANT:** All new screens MUST have i18n keys in ALL 8 language files

## Create Sheet Options (7 items)
Post | Thread | Story | Reel | Long Video | Go Live | Voice Post

## Settings Sections (11)
Content | Appearance | Privacy | Notifications | Wellbeing | Islamic | Accessibility | Close Friends | AI | Creator | Community | Gamification | Account | About

## Deferred
AR filters | Multi-device sync | AI dubbing | AI restyle | Friends map | Camera effects | TV app | WeChat mini-programs
