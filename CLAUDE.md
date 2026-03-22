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

## Status: Post-Audit (as of 2026-03-22)
All 5 spaces built + Telegram + Discord + WeChat feature parity + 4 feature batches + comprehensive 60-dimension audit + 13-pass deep gap analysis (418 findings) + test expansion + **72-agent deep audit remediation COMPLETE (all 72 files, ~4,300 findings processed)**. 203 screens, 82 controllers, 79 backend modules, 189 Prisma models, 277 test suites (4,253 tests, 100% pass), 160K+ lines of TypeScript source code.
Backend: NestJS with 79 modules (87 services, 82 controllers, 171 test files). Core: Redis, BullMQ job queues (6 queues, 5 processors), rate limiting (all 82 controllers), Stripe (Decimal money fields), Cloudflare Stream, Email (Resend), Meilisearch. AI: Claude API (text moderation + image moderation via Vision) + Whisper transcription + Gemini embeddings. Commerce: marketplace, Zakat (multi-asset, Decimal precision, configurable gold/silver prices via env), Waqf, virtual currency (coins/gifts/diamonds). Gamification: streaks, XP/levels, achievements, challenges, series, daily Islamic tasks (morning briefing). Telegram: saved messages, chat folders, slow mode, admin log, group topics, custom emoji. Discord: forum threads, webhooks, stage sessions, persistent voice channels, granular role permissions. Community: local boards, mentorship, study circles, fatwa Q&A, volunteering, events, voice posts, watch parties, community notes, mosque social graph.
**Batch 4 fixes:** Real prayer times (Aladhan API + local solar calculator fallback), Quran text API (Quran.com v4, 114 surahs, verse search, random ayah), real image moderation (Claude Vision SAFE/WARNING/BLOCK), 50+ FK relations wired with onDelete rules, mosque finder (Haversine DB query + OSM Overpass fallback), Ramadan from Hijri calendar, charity amounts Decimal, configurable Zakat prices, privacy policy + ToS endpoints, TURN/STUN config, 12 memoized UI components.
**Test expansion:** Batch 1 added 548 service tests (happy+error+auth per method). Batch 2 (running) adding 63 controller specs + 27 service expansions + gateway + integration tests. Batch 3 planned for edge cases, authorization matrix, error recovery, concurrency, abuse vectors.
Mobile: 208 screens, 39 UI components, 27 hooks, 19 API services. i18n: 8 languages (en + ar + tr + ur + bn + fr + id + ms) at 2,900+ keys each. **UI/UX elevation COMPLETE (2026-03-22/23): 87 commits, 272 files, +12.5K/-5.5K lines — every screen theme-aware (0 hardcoded color props), branded shimmer, contextual haptics (0 old useHaptic), staggered entrance, progressive images (0 raw Image), toast feedback (0 bare Alert.alert for feedback), elastic headers, BrandedRefreshControl (0 raw RefreshControl), sticky action bars on detail screens, settings search, discover auto-play video, notification thumbnails + follow-back, prayer adhan toggles + Qibla card, profile sticky tabs, create discard BottomSheet.** All screens reachable via navigation (0 orphans). ScreenErrorBoundary on all screens. Create sheet: 7 options. Settings: 11 sections. Conversation info: 11 options.
Islamic: prayer times (Aladhan API, 8 calc methods, 6 adhan reciters, local solar fallback), Quran (Quran.com API, 114 surahs, 4 reciters, reading plans, tafsir, rooms, verse search), hadith (200+), dhikr counter + challenges, zakat calculator (configurable prices), mosque finder (Haversine + OSM) + social graph, Hajj companion, Ramadan mode, Eid cards, nasheed mode, scholar verification + live Q&A, fatwa Q&A, halal restaurant finder, dua collection (100+), fasting tracker, 99 Names of Allah, hifz tracker, daily morning briefing, Islamic calendar theming (5 overlays auto-activated by Hijri date).
**Known gaps:** 418 findings originally documented. **Key blockers resolved in audit remediation:** SQL injection in embeddings (FIXED file 07), moderation fail-open (FIXED file 10), banned users bypassing auth (FIXED file 03/13), admin report resolution no-ops (FIXED file 13), cascade deletes on financial records (FIXED file 15). **Remaining blockers:** Apple IAP not installed (App Store rejection), google-services.json missing (Android push), video upload not wired from mobile, R2 credentials not filled in, payments API unused on mobile.
**72-agent deep audit remediation COMPLETE — all 72 files processed. 4,253 tests passing, 0 failures.**

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
- **Progress:** ALL 72 files complete. Total 4,253 tests, 0 failures. 821 commits.

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

**Technical debt (from 72-agent audit remediation):**
- i18n key deduplication: ~200 keys duplicated across sections (saf.viewInsights, bakra.viewInsights, majlis.viewInsights, profile.viewInsights all = "View Insights"). Refactoring to shared common.* keys would touch 200+ t() call sites — too risky without automated codemods. Track and fix when adding i18n testing.
- i18n translation completeness: 5 languages (ur, bn, fr, id, ms) are 85%+ untranslated English. Arabic has 518 untranslated keys. Requires human translator — NOT AI-generated.
- ~~Scheduled content auto-publisher~~ — FIXED: @nestjs/schedule installed, ScheduleModule.forRoot() wired, @Cron(EVERY_MINUTE) on publishOverdueContent().
- LocationPicker uses hardcoded mosque locations instead of expo-location + geocoding API.
- **Metro bundler version conflict:** Root `node_modules/metro` must match `apps/mobile/node_modules/metro` version (currently 0.83.5). Run `npm install metro@0.83.5 metro-transform-worker@0.83.5 --legacy-peer-deps` at project root before `npx expo start`. Node v24 may also cause issues — consider using Node v20 LTS for mobile dev.

**Last 7 deferred items (all require external services — cannot be fixed in code):**
- Stream uploads fire-and-forget — needs BullMQ queue integration for retry/error handling on Cloudflare Stream uploads
- CDN variant URLs — assumes Cloudflare Image Resizing service is enabled on the R2 bucket
- Virus scanning — requires ClamAV server or cloud antivirus API (e.g., VirusTotal) for uploaded file scanning
- Search parallel full-text scans — falls back to 7 parallel Prisma LIKE queries without Meilisearch; deploy Meilisearch to fix
- getNearbyContent — stub; needs PostGIS extension on Neon PostgreSQL for real geospatial queries
- Caption generation — placeholder; needs AI image analysis service (Claude Vision or similar) to auto-generate alt text
- Image resize doesn't upload — media processor resizes locally but needs R2 credentials to upload the resized variants

**PRE-APP STORE BLOCKERS (must complete before submission):**
- **WebRTC 1:1 calls:** `react-native-webrtc` installed but not wired. Need ~500-800 lines: `RTCPeerConnection` + `getUserMedia()` + ICE candidate exchange via existing Socket.io signaling (`call_initiate`/`call_answer`/`call_signal` already implemented on backend). TURN credentials set (Metered.ca, 500MB free/month). Estimated 2-3 days. Group calls (SFU) can be post-launch.
- **App icon + splash screen:** Currently 69-byte placeholder PNGs. Need proper 1024x1024 icon + splash assets.
- **google-services.json:** Firebase Android push notifications config file missing.
- **Apple Developer Program:** $99/yr enrollment required for App Store submission.

**Audit status: 0 OPEN, 7 NOTED (external deps only), 178 FIXED. 4,483 tests, 0 failures. 940+ commits.**

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
- ~~Prisma onDelete rules~~ — ✅ Batch 85 (32 fixed) + Audit file 15 (12+ financial records changed from Cascade→SetNull: Message.sender, Tip, GiftRecord, Order, ZakatDonation, CharityDonation, TreasuryContribution, CreatorEarning, ModerationLog, Report.reporter/reportedUser, BroadcastMessage.sender)
- ~~Dead-code take:50 patterns~~ — ✅ Batch 85 (8 removed)
- ~~ScreenErrorBoundary coverage~~ — ✅ Batch 85 (196/196 screens)
- Remaining: 43 inline renderItems in utility screens (negligible impact)

### 72-Agent Deep Audit Remediation (ALL 72 files complete)
**Security fixes:**
- SQL injection in embeddings service — validated against enum whitelist (file 07)
- ClerkAuthGuard now checks isBanned/isDeactivated/isDeleted + auto-unbans expired temp bans (files 03/13)
- All moderation fallbacks changed from fail-open (safe:true) to fail-closed (WARNING/safe:false) (file 10)
- SVG XSS sanitization in sticker generation (file 08)
- Push token hijacking prevented — format validation + deactivate on reassignment (file 14)
- Path traversal in file delete endpoint blocked (file 11)
- SSRF prevention in Stream uploadFromUrl — R2 domain validation + private IP blocklist (file 11)
- Webhook signature replay protection — 5-minute timestamp check (file 11)
- Webhook rejects all requests when secret not configured (file 11)

**Data integrity fixes:**
- Block/mute filtering on ALL feed endpoints — personalized, trending, featured, suggested users, frequent creators (file 07)
- 12 financial record cascade deletes changed to SetNull — tips, gifts, orders, donations preserved on user delete (file 15)
- FeedInteraction @@unique([userId, postId]) constraint added (file 15)
- 20+ database indexes added (notifications, reports, moderation logs, calls, events) (file 15)
- Rating fields changed from Float to Decimal(3,2) — Product, HalalBusiness, HalalRestaurant (file 15)
- Hashtag counter negative guard (file 12)

**Feature fixes:**
- Admin resolveReport now ACTUALLY removes content and bans users (was no-op) (file 13)
- Per-type notification settings (notifyLikes/Comments/Follows etc.) now enforced (was placebo) (file 14)
- Reel like/comment push notifications now work (was silently dropped) (file 14)
- 7 push notification data types corrected (were all 'like') (file 14)
- Appeal resolution workflow added — admin can review and accept/reject appeals (file 13)
- Personalized feed hydrated with content data (was returning only IDs) (file 07)
- MINBAR (video) space added to personalized feed pipeline (file 07)
- Video publishedAt set on stream ready, not on creation (file 11)
- Community notes content existence verification before creation (file 09)
- Word filter placeholder patterns replaced with real hate speech detection (file 10)

**Validation hardening (100+ DTO fixes, file 16):**
- 10+ inline `@Body() body: { ... }` types replaced with validated DTO classes
- @IsUrl() added to 15+ URL fields across DTOs (SSRF prevention)
- @Min/@Max bounds on all duration, amount, dimension fields
- @MaxLength on 30+ unbounded string fields
- @ArrayMaxSize on 10+ unbounded arrays
- @IsIn/@IsEnum on 10+ freeform string fields (categories, types, statuses)
- @IsDateString on 6+ date string fields

**Route fixes:**
- 4 double-prefix controllers fixed (events, retention, reports, embeddings)
- Route shadowing fixed (series/continue-watching, mosque my/memberships)
- Trending feed pagination changed to offset-based (was producing duplicates)

**Files 17-33 (infrastructure + mobile):**
- Error handling: ApiError/ApiNetworkError typed classes, 30s request timeout, withRetry utility (file 17)
- Rate limiting: all 13 WebSocket events rate-limited, connection flood protection (file 18)
- Queue: SearchIndexingProcessor created (jobs were permanently lost) (file 19)
- Redis: error logging, graceful shutdown, proxy expanded to all commands (file 20)
- Performance: React.memo, useCallback, refs for FlashList, reel snapping (file 28)
- Theme: useThemeColors hook, ALL 244 files migrated to theme-aware colors, light mode functional (file 33)
- Navigation: navigate() utility replaced 227 `as never` casts (file 22)
- i18n: synchronous language bundling, RTL for Urdu, date-fns locale wired (file 26)
- Accessibility: useReducedMotion, WCAG contrast, touch targets, modal focus (file 27)
- TypeScript: 398 type safety findings fixed, navigate() utility (file 30)
- 14 new mobile API service files created for unused backend endpoints (file 25)

**Files 34-36 (auth + security + content detail):**
- Onboarding flow fixed: authApi.register called, onboardingComplete set, madhab saveable (file 34)
- Inline 2FA verification using Clerk attemptSecondFactor (file 34)
- 2FA backup codes: clipboard copy + Share download implemented (was all stubs) (file 35)
- userId removed from 2FA validate/backup requests (security fix) (file 35)
- Account deletion requires biometric re-auth (file 35)
- Parental PIN lockout after 5 failed attempts (file 35)
- Email/phone masked in account settings (file 35)
- Reel comment reply-to wired end-to-end: parentId in DTO→service→DB (file 36)
- ReelCommentReaction model + like/unlike endpoints added (file 36)
- CommentsSheet Rules of Hooks fixed (CommentItem extracted) (file 36)
- Video comments paginated with useInfiniteQuery (was first page only) (file 36)
- Post/thread share functionality added (file 36)
- Dead code removed (~100 lines unused state/handlers in video detail) (file 36)

**Files 38-72 (parallel batch — screens + backend + cross-cutting):**
- All mobile screen syntax errors fixed (missing import closing braces)
- All duplicate Pressable/accessibilityRole imports removed across 50+ files
- ScreenErrorBoundary: fixed t() crash in class component (uses i18next.t() directly)
- Error states added to all 5 main feed tabs
- QR code/scanner format mismatch fixed
- Camera: permission request, gallery button wired
- Image editor: receives imageUri via params
- Duet/stitch: recorded URI passed to next screen, creator data from params
- Voice recorder: real R2 upload (was stub)
- Video views deduplicated (was infinitely inflatable)
- Counter decrements clamped (can't go negative)
- Discord: prisma.community→circle (was crashing)
- Legal: dateOfBirth + acceptedTerms in RegisterDto (COPPA)
- Telegram/Discord: DTO validation + auth hardening
- Controllers auth matrix: missing guards added
- Module wiring: missing imports registered
- Socket.io gateway: validation + error handling
- User lifecycle: deleteAccount cleanup, export uncapped
- API path mismatches fixed in mobile service layer
- 200+ hardcoded English strings replaced with i18n t() calls

**Progress:** ALL 72 files complete. Total 4,253 tests, 0 failures. 821 commits.

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
15. **NEVER use Sonnet or Haiku as subagent models** — Opus only. No inferior models.
16. **Tests cover the ENTIRE scope, not just fixes** — When working on an audit file, also add tests for untested parts of that scope. If a service has 0 tests, add them. Every audit file commit must include new tests.
17. **ALWAYS use `useContextualHaptic`** — NEVER `useHaptic`. Map: like→haptic.like(), follow→haptic.follow(), save→haptic.save(), navigate→haptic.navigate(), tick→haptic.tick(), delete→haptic.delete(), send→haptic.send(), longPress→haptic.longPress()
18. **ALWAYS use `<BrandedRefreshControl>`** — NEVER raw `<RefreshControl>`. Import from `@/components/ui/BrandedRefreshControl`
19. **ALWAYS use `<ProgressiveImage>` for content images** — NEVER raw `<Image>` from expo-image. Import from `@/components/ui/ProgressiveImage`. Provides blurhash placeholder + 300ms crossfade.
20. **ALWAYS use `formatCount()` for engagement numbers** — NEVER display raw numbers for likes, views, followers, etc. Import from `@/utils/formatCount`
21. **ALWAYS use `showToast()` for mutation feedback** — NEVER leave mutations without success/error feedback. Import from `@/components/ui/Toast`
22. **NEVER use `colors.dark.*` in JSX directly** — Always use `tc.*` from `useThemeColors()`. StyleSheet.create() dark values are fallbacks only; JSX must have inline `tc.*` overrides.
23. **NEVER use `Math.random()` for visual data** — Use deterministic patterns (Math.sin) or real data (expo-av metering). Random data = fake data = dishonest UI.
24. **NEVER use setTimeout for fake loading** — Either fetch real data or remove the refresh control entirely.

---

## UI/UX Elevation (2026-03-22/23 — 87 commits, 272 files, +12.5K/-5.5K lines)

### Design System: Modern Dark Cinema Mobile
Style from ui-ux-pro-max plugin. Cinematic easing, spring physics, glass overlays, content-first.

### New Theme Tokens (`apps/mobile/src/theme/index.ts`)
```typescript
lineHeight:     { xs: 16, sm: 18, base: 22, md: 24, lg: 28, xl: 32, '2xl': 36, '3xl': 44, '4xl': 52 }
letterSpacing:  { tight: -1.2, snug: -0.8, normal: 0, wide: 0.5, wider: 1.0 }
interaction:    { pressed: 'rgba(255,255,255,0.04)', hover: '...0.06', disabledOpacity: 0.38, focusRingColor: emerald }
animation.easing: { cinematic: [0.16,1,0.3,1], decelerate: [0,0,0.2,1], accelerate: [0.4,0,1,1] }
animation.stagger: { item: 40, section: 80 }  // ms between staggered items
animation.entrance: { duration: 350 }
animation.exit: { duration: 250 }  // 70% of entrance (Material rule)
```

### New Components
| Component | Path | Purpose |
|-----------|------|---------|
| **Toast** | `src/components/ui/Toast.tsx` | Glass card, swipe dismiss, auto-dismiss progress, 4 variants. `showToast({ message, variant })` callable anywhere. `<ToastContainer>` mounted in root layout. |
| **ProgressiveImage** | `src/components/ui/ProgressiveImage.tsx` | Blurhash→crossfade wrapper for expo-image. `uri`, `width`, `height`, `borderRadius`, `blurhash?`. memo'd. |
| **SocialProof** | `src/components/ui/SocialProof.tsx` | "Liked by [avatar] name and N others". `users`, `count`, `label?`, `onPress?`, `onUserPress?` |
| **BrandedRefreshControl** | `src/components/ui/BrandedRefreshControl.tsx` | Emerald+gold branded RefreshControl. `refreshing`, `onRefresh` |

### New Hooks
| Hook | Path | Purpose |
|------|------|---------|
| **useContextualHaptic** | `src/hooks/useContextualHaptic.ts` | 10 semantic haptic methods: like, follow, save, navigate, tick, delete, error, longPress, send, success |
| **useStaggeredEntrance** | `src/hooks/useStaggeredEntrance.ts` | Stagger fade+slide for list items. `index`, `{ delay?, duration?, translateY?, maxIndex? }` |
| **useScrollLinkedHeader** | `src/hooks/useScrollLinkedHeader.ts` | Elastic header collapse + blur. Returns `onScroll`, `headerAnimatedStyle`, `titleAnimatedStyle`, `blurIntensity`, `scrollY` |
| **useAnimatedIcon** | `src/hooks/useAnimatedIcon.ts` | Icon animations: bounce, shake, pulse, spin. Returns `{ animatedStyle, trigger }` |

### New Utilities
| Utility | Path | Purpose |
|---------|------|---------|
| **formatCount** | `src/utils/formatCount.ts` | `999→"999"`, `1200→"1.2K"`, `1500000→"1.5M"` |

### Upgraded Components
| Component | What changed |
|-----------|-------------|
| **Avatar** | Rotating story ring (unseen=gradient rotation, viewed=gray static), online pulse dot, `storyViewed?` prop |
| **Skeleton** | Emerald brand shimmer (was generic white), responsive width |
| **EmptyState** | Staggered entrance per element, `illustration?` prop, pulsing CTA button |
| **BottomSheet** | Spring physics (damping:25 stiffness:200), handle pulse, velocity dismiss, rubberband overscroll, `scrollable?` prop |
| **TabSelector** | Spring indicator animation, haptic tick on change |
| **GradientButton** | Deeper press scale (0.94), emerald glow pulse when loading |
| **Icon** | Wrapped in `React.memo` (prevents 269+ unnecessary re-renders) |
| **Badge** | Only bounces on 0→positive transition (was jarring on every count change) |
| **CharCountRing** | Animated SVG stroke + interpolated color green→gold→red |
| **FloatingHearts** | Wide spread (±60px), horizontal drift, stagger cascade (30ms per particle), size 14-32px |
| **ScreenErrorBoundary** | "Go Home" escape button via Linking |
| **OfflineBanner** | FadeInDown/FadeOutUp animation, retry button, "Showing cached content" subtitle |
| **Tab bar** | Glassmorphic BlurView (intensity 80), hairline border |
| **GlassHeader** | Duplicate showBack/showBackButton resolved |

### Key Features Added
- **Story viewer** swipe between users (horizontal FlatList pager)
- **Bakra Following|For You** tab switcher (TikTok-style)
- **Bakra tap-to-pause** with play icon overlay
- **Bakra sound marquee** (scrolling audio title)
- **Bakra audio disc** enlarged to 44px
- **Create-reel camera recording** via expo-camera
- **PostCard double-tap heart** with GestureDetector
- **PostCard SocialProof** ("Liked by X and N others")
- **PostCard comment preview** ("View all N comments")
- **Saf DM shortcut** in header (send icon with unread badge)
- **Saf "New posts" banner** (scroll-triggered polling, emerald pill)
- **Thread nested replies** with indentation + connecting lines
- **ThreadCard multi-image grid** (2x2, 1+2, 1+3, 4+ layouts)
- **Comment sorting** Top/Latest toggle
- **Prayer times sky gradient** that changes by time-of-day
- **Prayer times offline cache** (AsyncStorage, 6h TTL)
- **Quran room real audio** (cdn.islamic.network, Mishary Alafasy)
- **Dhikr counter bead click** (generated 800Hz sine wave)
- **Video player double-tap seek** (left=-10s, right=+10s)
- **Video Up Next** recommendations section
- **Chat scroll-to-bottom FAB**
- **Chat folders** predefined filters (Unread, Groups, Channels, Personal) + chat-folder-view screen
- **New conversation** contact suggestions from followed users
- **Community posts** upload via R2 (was sending file:// URIs)
- **Voice post** real waveform from expo-av metering
- **Interactive sliders** on duet-create + green-screen-editor
- **Call screen** JWT socket auth (was using callId — security fix)
- **Light mode** working across all 208 screens (124 files got tc.* inline overrides + 450 JSX color props replaced)
- **Alert.alert cleanup** — 141 calls analyzed, 79 converted to showToast, 62 kept (all verified destructive confirmations)
- **Evidence images** in appeal-moderation (was TODO stub, now stores + renders thumbnails)
- **Audio room** handRaisedAt computed from timestamp (was hardcoded "Just now")
- **Detail screens** sticky glass action bar (post, thread, video detail)
- **Profile** sticky tab bar (Posts/Reels/Tagged stick on scroll) + follow pulse animation
- **Settings** search bar with real-time section/row filtering
- **Prayer Times** per-prayer adhan notification toggles (AsyncStorage) + Qibla direction card
- **Notifications** content thumbnails (44px), inline follow-back button, mark-all-read (verified)
- **Discover** auto-play muted video thumbnails on reel/video grid items + refined masonry pattern
- **Create flows** discard confirmation via BottomSheet (Save Draft / Discard / Cancel) on post/thread/video/event

### Verification Counts (grep-verified, not agent-reported)
| Check | Count |
|-------|-------|
| Files with old `useHaptic` | **0** |
| Files with raw `RefreshControl` | **0** |
| Files with raw `Image` from expo-image (screens) | **0** |
| `color={colors.text.*}` as JSX props (excl video overlays) | **0** |
| Screens missing `useThemeColors` | **0** |
| `Math.random()` for visual data | **0** |
| Fake setTimeout refresh | **0** |
| Alert.alert for simple feedback | **0** (62 remain, all destructive confirmations) |

### Remaining Items (2 plan tasks + external deps)

**Plan items deferred (need backend/infrastructure):**
- Bakra "not interested" swipe-left gesture — needs complex gesture infrastructure + dismiss API
- Profile story highlights row — needs highlight data model + API endpoint

**External dep blockers (cannot fix via code):**
- Video editor FFmpeg (needs native module install)
- Green screen ML segmentation (needs TFLite model)
- Call screen WebRTC audio/video (needs TURN server credentials)
- Shared element transitions (needs react-native-shared-element npm install)
- Lottie empty state animations (needs .json files from motion designer)
- Mosque Finder MapView (needs react-native-maps npm install)
- Social auth Google/Apple (needs Clerk dashboard configuration)

---

## Architecture
```
mizanly/
├── apps/
│   ├── api/                     # NestJS 10 backend
│   │   ├── src/modules/         # 79 feature modules
│   │   ├── src/common/          # ClerkAuthGuard (checks isBanned/isDeactivated/isDeleted + auto-unban expired), OptionalClerkAuthGuard, decorators, sentry, queue, email
│   │   ├── src/gateways/        # Socket.io /chat namespace (chat, calls, Quran rooms)
│   │   └── prisma/schema.prisma # 188 models, 4,084 lines
│   └── mobile/                  # React Native Expo SDK 52
│       ├── app/
│       │   ├── (tabs)/          # saf, majlis, risalah, bakra, minbar, create
│       │   └── (screens)/       # 208 screens + nested route dirs
│       └── src/
│           ├── components/ui/   # 39 components: Toast, ProgressiveImage, SocialProof,
│           │                    # BrandedRefreshControl, BottomSheet, Skeleton, Icon (memo'd),
│           │                    # Avatar (animated ring), GlassHeader, GradientButton (glow),
│           │                    # EmptyState (staggered), VerifiedBadge, CharCountRing (animated),
│           │                    # VideoPlayer, ImageLightbox, DoubleTapHeart, FloatingHearts,
│           │                    # AuthGate, OfflineBanner, TTSMiniPlayer, Badge, etc.
│           ├── components/islamic/ # EidFrame, IslamicThemeBanner
│           ├── hooks/           # 27 hooks: useContextualHaptic (PRIMARY — replaces useHaptic),
│           │                    # useStaggeredEntrance, useScrollLinkedHeader, useAnimatedIcon,
│           │                    # useTranslation, useThemeColors, useNetworkStatus, usePiP,
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

## Credential Status (verified 2026-03-23)

**READ THIS BEFORE ASSUMING ANY FEATURE WORKS. 7 of 32 env vars set. 25 need filling.**

### Currently SET (7/32)
| Service | Env Var(s) | Status |
|---------|-----------|--------|
| Neon PostgreSQL | `DATABASE_URL`, `DIRECT_DATABASE_URL` | **SET** — DB works |
| Clerk Auth | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | **SET** — Auth works |
| Upstash Redis | `REDIS_URL` | **SET** — Cache + queues work |
| Stripe Payments | `STRIPE_SECRET_KEY` | **SET (test)** — Test payments work |
| Anthropic Claude | `ANTHROPIC_API_KEY` | **SET** — Moderation + translation work |

### Tier 0: MUST SET Before Launch (app won't function)
| Service | Env Var(s) | How to Get | What Breaks Without It |
|---------|-----------|------------|----------------------|
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare Dashboard → R2 → Create Bucket "mizanly-media" → API Tokens | ALL uploads dead — photos, avatars, voice, stories, reels |
| Cloudflare Stream | `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_WEBHOOK_SECRET` | Cloudflare Dashboard → Stream → API Tokens | Video uploads, reels, live streaming all dead |
| Clerk Webhook | `CLERK_WEBHOOK_SECRET` | Clerk Dashboard → Webhooks → Add endpoint → `/auth/webhooks` | New users created in Clerk won't exist in DB |
| Stripe Webhook | `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → Add endpoint → `/payments/webhook` | Payments taken but features not unlocked |
| App URL | `APP_URL` | Set to deployed API URL (e.g. `https://api.mizanly.app`) | OG metadata, share links, QR codes show localhost |
| TOTP Encryption | `TOTP_ENCRYPTION_KEY` or `TWO_FACTOR_ENCRYPTION_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 2FA secrets can't be encrypted/decrypted |
| Apple Developer | N/A — $99/yr | [developer.apple.com](https://developer.apple.com) → Enroll | Cannot submit to App Store |
| google-services.json | File in `apps/mobile/` | Firebase Console → Project Settings → Add Android app | Android push notifications dead |

### Tier 1: SHOULD SET Before Launch (degraded experience)
| Service | Env Var(s) | How to Get | What Breaks |
|---------|-----------|------------|-------------|
| Meilisearch | `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` | `docker run -p 7700:7700 getmeili/meilisearch` or Meilisearch Cloud | Search falls back to slow Prisma LIKE queries |
| Resend (email) | `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys | No emails — password reset, verification broken |
| Sentry | `SENTRY_DSN` | [sentry.io](https://sentry.io) → Create Project (React Native + Node) | No crash reporting — flying blind in production |
| Gold/Silver prices | `GOLD_PRICE_PER_GRAM`, `SILVER_PRICE_PER_GRAM` | Set current prices: `~92` and `~1.05` USD | Zakat calculator uses hardcoded fallback |

### Tier 2: Nice to Have
| Service | Env Var(s) | What It Enables |
|---------|-----------|----------------|
| Gemini API | `GEMINI_API_KEY` | Content embeddings, recommendations, personalized feed |
| OpenAI Whisper | `OPENAI_API_KEY` | Voice message transcription, video captions |
| TURN/STUN Server | `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Video calls behind NAT (most mobile users) |

### NPM Packages to Install
| Package | Command | What It Enables |
|---------|---------|----------------|
| react-native-webrtc | `npx expo install react-native-webrtc` | Video/audio calls + live streaming (currently UI facade) |
| @nestjs/schedule | `npm install @nestjs/schedule` | Scheduled post auto-publisher (posts with scheduledAt never publish without this) |

### ENV VAR NAME MISMATCH — RESOLVED
- Upload service reads BOTH naming conventions: `R2_ACCOUNT_ID` first, falls back to `CLOUDFLARE_ACCOUNT_ID`
- Stream service reads `CF_STREAM_ACCOUNT_ID` and `CF_STREAM_API_TOKEN` (set these exact names)
- Upload/stream services log warnings on startup if credentials missing

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
- Global throttle: 100 req/min | Most endpoints now have specific `@Throttle` decorators (5-60/min depending on cost). AI moderation: 5/min. Feed: 30/min. Sticker gen: 10/day.
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
- Message: `messageType` (NOT type) | `senderId` (NOT from) — **now optional** (SetNull on user delete, displays as "[Deleted User]")
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
- **Keys:** 2,838 per language, all 8 files at 100% parity
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
