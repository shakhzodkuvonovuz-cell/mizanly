# CLAUDE.md — Mizanly Project Guide

## MANDATORY: Read All Memory Files Before Any Task

At the start of every session, read ALL files in `~/.claude/projects/C--dev-mizanly/memory/` (listed in MEMORY.md):
- `user_shakhzod.md` — who the user is, preferences, communication style
- `feedback_*.md` — all feedback files (brutal honesty, no subagents, no co-author, max effort, Islamic data manual, subagent context quality)
- `reference_competitor_intel.md` — UpScrolled, Muslim Pro, market data
- `project_*.md` — project state, gaps audit, deployment status (numbers may be stale — verify against code)

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
| Bakra | بكرة | TikTok (short video) | Built |
| Minbar | المنبر | YouTube (long video) | Built |

---

## Current State (as of 2026-03-23)

**Backend:** NestJS 10, 79 modules, 82 controllers, 86 services, 193 Prisma models, 81 enums (4,623 lines). 286 test suites, 4,675 tests, 100% pass, 0 TypeScript errors. Server starts clean.
**Mobile:** React Native Expo SDK 52, 212 screens, 76 components, 23 hooks, 33 API services. 0 mobile TypeScript errors.
**i18n:** 8 languages (en, ar, tr, ur, bn, fr, id, ms), 3,400+ keys each, 103 accessibility keys, ~300 keys added in session 2.
**Real-time:** Socket.io on 4 screens (chat, calls, Quran rooms, conversation list) with Clerk JWT auth, reconnection, token refresh.
**Algorithm:** 3-stage ranking (pgvector KNN → weighted scoring → diversity reranking), 15% exploration slots, Islamic boost location-aware via prayer-calculator, session signals in Redis, trending 24h window with decay, HNSW vector index.
**All credentials configured** (31/33 — only Meilisearch + APP_URL production). R2, Cloudflare Stream, Sentry, Resend, Stripe, TURN, Gemini, Whisper, Claude all SET.
**Schema:** All 41 String→Enum conversions complete. 5 dangling FK relations fixed. StarredMessage join table. 15+ new indexes.
**Database synced** — `prisma db push` confirmed in sync. Production uses `prisma migrate deploy`.
**CI/CD:** GitHub Actions — lint-typecheck PASS, test-api PASS, build-api PASS. build-mobile FAIL (metro version conflict — needs root metro dep removed).
**957 commits**, 8 waves of fixes in session 2 (68 agents, ~350 files changed).

## Key Documentation
- `docs/DEPLOYMENT.md` — Production deployment guide (Railway, Neon, Cloudflare, Clerk, Stripe)
- `docs/DEPLOY_CHECKLIST.md` — Pre-deployment verification checklist
- `docs/TURN_SETUP.md` — WebRTC TURN/STUN server setup
- `docs/ONBOARDING.md` — Developer onboarding guide
- `docs/FULL_AUDIT_2026_03_23.md` — **29-dimension audit with all findings**
- `docs/PRIORITY_FIXES_CHECKLIST.md` — Crossable fix list
- `docs/audit/agents/` — 72 raw audit files (~4,300 findings)
- `docs/audit/DEFERRED_FIXES.md` — Master tracker of deferred items
- `docs/audit/COMPREHENSIVE_AUDIT_2026.md` — 60-dimension audit with line numbers
- `docs/audit/PRIORITY_FIXES.md` — P0/P1 items sorted by severity
- `docs/audit/HONEST_SCORES.md` — Per-dimension scores with evidence
- `docs/audit/MARKET_ANALYSIS.md` — Market sizing, competitor landscape
- `docs/audit/ALGORITHM_DEEP_AUDIT.md` — Feed algorithm improvements
- `docs/audit/TEST_QUALITY_AUDIT.md` — Test suite quality analysis
- `docs/audit/DEEP_AUDIT_INDEX_2026_MARCH21.md` — Index of all 72 agent files
- `docs/audit/SESSION_CONTINUATION_PROMPT.md` — Context for continuing audit work
- `docs/audit/UI_UX_DEEP_AUDIT_2026.md` — UI/UX audit findings
- `docs/COMPETITOR_DEEP_AUDIT_2026.md` — 15-dimension competitor scoring
- `docs/features/DATA_IMPORT_ARCHITECTURE.md` — Data import spec (not built)
- `docs/features/EXIT_STORY_SPEC.md` — Exit story spec (not built)
- `docs/ralph-instructions.md` — Autonomous execution behavioral rules

---

## LAUNCH ROADMAP

### Week 1: Launch Blockers
- [ ] App icon + splash (replace 69-byte placeholders) — designer or Canva
- [ ] Apple Developer enrollment ($99, 48h)
- [ ] Clerk production keys (switch sk_test_ → sk_live_)
- [ ] Stripe live keys
- [ ] APP_URL → production URL (currently localhost:3000)
- [ ] Custom domain (api.mizanly.app) — Cloudflare + Railway
- [ ] Fix metro CI build (remove root metro dep)
- [ ] First EAS build (iOS + Android)

### Week 2: Test With Real Data
- [ ] Upload real images/videos (verify R2 presigned URLs)
- [ ] Send real push notifications (verify FCM + APNs)
- [ ] Process $1 test payment (verify Stripe end-to-end)
- [ ] Real-time messaging (two devices, real conversation)
- [ ] Deploy to Railway + verify health endpoint

### Week 3: Beta Polish
- [ ] TestFlight / Play Store internal testing (first 10 users)
- [ ] Fix bugs from beta testers
- [ ] App Store screenshots + description
- [ ] Landing page at mizanly.app

### Month 2: Post-Launch
- [ ] WebRTC calls wiring (~500-800 lines, TURN credentials ready)
- [ ] Apple IAP for iOS coin purchases
- [ ] Meilisearch deployment (search falls back to Prisma LIKE for now)
- [ ] Human translations for 5 languages (ur, bn, fr, id, ms)

### Month 3+: Growth
- [ ] nsfwjs on-device + pHash re-upload detection
- [ ] Whisper.cpp on RTX 5070 (self-hosted transcription)
- [x] Interest vector multi-cluster — DONE (Wave 10 — k-means 2-3 centroids)
- [ ] Expo Web PWA (desktop version) — mobile-first, web later
- [ ] Data import from Instagram/TikTok/X/YouTube/WhatsApp

## PACKAGES WAITING FOR INSTALL (code wired, need terminal)

Run these in Windows terminal when back home:
```bash
cd C:\dev\mizanly\apps\mobile

# Client-side NSFW screening (nsfwCheck.ts ready, wired into create-post)
npm install nsfwjs @tensorflow/tfjs @tensorflow/tfjs-react-native --legacy-peer-deps
# Then download MobileNetV2 model to apps/mobile/assets/model/

# Video fullscreen orientation lock (VideoPlayer.tsx has TODO)
npm install expo-screen-orientation --legacy-peer-deps

# Screenshot prevention on 2FA/encryption (useEffect TODO added)
npm install expo-screen-capture --legacy-peer-deps

# App rating prompt after 7 sessions (session counter in _layout.tsx)
npm install expo-store-review --legacy-peer-deps
```

## REMAINING TECHNICAL DEBT (verified 2026-03-23 final audit)

**Session 2 stats:** 10 waves, 80 agents, ~220 fixes, 4,706 tests, 965 commits. MASTER_TODO: 179 done, 13 partial, 59 open + 140 competitor features.

**Packages installed but NOT wired:**
- react-native-shared-element — no SharedElement transitions in screens
- react-native-maps — MosqueFinder doesn't use MapView
- react-native-webrtc — RTCPeerConnection in call screen but no getUserMedia/ICE exchange
- expo-location — installed but LocationPicker uses hardcoded mosques
- Lottie — no .json animation files, no LottieView
- Social auth Google/Apple — disabled buttons, needs Clerk dashboard config
- Green screen — needs TFLite model

**Payments:** donate, gift-shop, waqf, orders all wired to Stripe PaymentIntent. Cashout has withdrawal UI (backend endpoint TODO). Apple IAP not installed (needed for iOS monetization).

**RTL:** COMPLETE — ~429 margin/padding/position replacements across ~134 files in 3 batches. ~28 intentional physical-position skips (editors, compass, canvas, centering tricks).

**Translations:** ur 14%, bn 14%, fr 15%, id 16%, ms 15% — needs human translator. ar 77%, tr 89%.

**Schema remaining (deferred — risky migrations):**
- P1-DANGLING: 8 FK fields still lack @relation (sourceReelId, commentId, answeredBy, etc.)
- P1-FKARRAY: String[] arrays that should be join tables (3 models)
- P2-001: Mixed cuid/uuid strategy (94+61) — leave as-is for now
- C-02: Dual balance system (CoinBalance table + User.coinBalance) — needs consolidation
- TOTP encryption + backup hash salt fields added with migration TODOs

**Algorithm remaining:**
- A/B testing framework for scoring weights (hardcoded currently)
- Scoring weights not tunable without code deploy

**Still open (code-fixable, low priority):**
- Old username links break (needs UsernameHistory schema model)
- Status privacy in AsyncStorage only (needs backend persistence)
- Video editor simulated (FFmpeg not installed)
- Call screen facade (WebRTC not wired — Month 2 roadmap)
- Zero Quran/Adhan audio on Islamic screens (has dhikr/dua audio)
- Mosque Finder no map (react-native-maps installed, not wired)

**Cannot fix via code:** PostGIS for nearby content, CDN image variants, virus scanning, AI caption generation, Meilisearch deployment

**Deferred features:** AI dubbing, AI restyle, Friends Map, camera effects, TV app, Bakra "not interested" swipe, profile story highlights, data import, Expo Web PWA

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** — Always `<BottomSheet>`
2. **NEVER use text emoji for icons** — Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** — Always `radius.*` from theme
4. **NEVER use bare "No items" text** — Always `<EmptyState>`
5. **NEVER change Prisma schema field names** — They are final
6. **NEVER use `@CurrentUser()` without `'id'`** — Always `@CurrentUser('id')`
7. **ALL FlatLists must have `<BrandedRefreshControl>`** — NEVER raw `<RefreshControl>`
8. **NEVER use `any` in new non-test code** — Type everything properly
9. **ActivityIndicator OK in buttons only** — use `<Skeleton>` for content loading
10. **The `$executeRaw` tagged template literals are SAFE** — do NOT replace them
11. **NEVER suppress errors with `@ts-ignore` or `@ts-expect-error`** — fix the actual type
12. **NEVER add `as any` in non-test code** — find the correct type instead
13. **Test files (*.spec.ts) MAY use `as any` for mocks** — this is the only exception
14. **ALL design/UI work MUST use `frontend-design` and `ui-ux-pro-max` skills**
15. **NEVER use Sonnet or Haiku as subagent models** — Opus only.
16. **Tests cover the ENTIRE scope, not just fixes**
17. **ALWAYS use `useContextualHaptic`** — NEVER `useHaptic`
18. **ALWAYS use `<BrandedRefreshControl>`** — NEVER raw `<RefreshControl>`
19. **ALWAYS use `<ProgressiveImage>` for content images** — NEVER raw `<Image>` from expo-image
20. **ALWAYS use `formatCount()` for engagement numbers**
21. **ALWAYS use `showToast()` for mutation feedback** — NEVER bare `Alert.alert` for non-destructive feedback
22. **NEVER use `colors.dark.*` in JSX directly** — Always use `tc.*` from `useThemeColors()`
23. **NEVER use `Math.random()` for visual data**
24. **NEVER use setTimeout for fake loading**

---

## Architecture
```
mizanly/
├── apps/
│   ├── api/                     # NestJS 10 backend
│   │   ├── src/modules/         # 79 feature modules
│   │   ├── src/common/          # ClerkAuthGuard, OptionalClerkAuthGuard, decorators, queue, email
│   │   ├── src/gateways/        # Socket.io /chat namespace (chat, calls, Quran rooms)
│   │   └── prisma/schema.prisma # 188 models, 4,080 lines
│   └── mobile/                  # React Native Expo SDK 52
│       ├── app/
│       │   ├── (tabs)/          # saf, majlis, risalah, bakra, minbar, create
│       │   └── (screens)/       # 209 screens
│       └── src/
│           ├── components/ui/   # 70 components
│           ├── hooks/           # 23 hooks
│           ├── services/        # 32 API service files
│           ├── stores/index.ts  # Zustand store
│           ├── theme/index.ts   # Design tokens
│           ├── i18n/            # 8 languages
│           └── types/           # TypeScript interfaces
```

## Tech Stack
- **Mobile:** React Native (Expo SDK 52) + TypeScript + Expo Router
- **Backend:** NestJS 10 + Prisma + Neon PostgreSQL
- **Auth:** Clerk (email, phone, Apple, Google) + svix webhooks
- **Storage:** Cloudflare R2 (presigned PUT) + Stream (video)
- **Real-time:** Socket.io `/chat` namespace (Clerk JWT auth on connect)
- **Search:** Meilisearch (not configured, falls back to Prisma LIKE) | **Cache:** Upstash Redis
- **npm NOT in shell PATH** — run all npm commands in Windows terminal

---

## Design Tokens (`apps/mobile/src/theme/index.ts`)
```ts
colors.emerald = #0A7B4F       colors.gold = #C8963E
colors.dark.bg = #0D1117       colors.dark.bgElevated = #161B22
colors.dark.bgCard = #1C2333   colors.dark.bgSheet = #21283B
colors.dark.surface = #2D3548  colors.dark.border = #30363D
colors.text.primary = #FFF     colors.text.secondary = #8B949E
colors.text.tertiary = #6E7781 colors.error = #F85149

spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 full=9999
animation.spring: bouncy(D10 S400) / snappy(D12 S300) / responsive(D15 S150) / gentle(D20 S100)
```

## Component Quick Reference

### Icon — 44 valid names
```tsx
<Icon name={IconName} size={'xs'|'sm'|'md'|'lg'|'xl'|number} color={string} />
// Names: arrow-left, chevron-right/left/down, heart, heart-filled, message-circle,
// bookmark, bookmark-filled, share, repeat, image, camera, video, play, mic, phone,
// search, hash, at-sign, filter, trending-up, user, users, bell, mail, check-circle,
// send, pencil, edit, trash, x, plus, circle-plus, more-horizontal, settings, lock,
// globe, eye, eye-off, flag, volume-x, link, clock, map-pin, smile, paperclip,
// check, check-check, layers, slash, log-out, bar-chart-2, loader
```

### Key Hooks
```tsx
useContextualHaptic()   // 10 semantic haptics: like, follow, save, navigate, tick, delete, error, longPress, send, success
useThemeColors()        // Returns tc.bg, tc.text.primary, tc.emerald, etc. — USE THIS for all JSX colors
useStaggeredEntrance(index)  // Stagger fade+slide for list items (40ms between items)
useScrollLinkedHeader()      // Elastic header collapse + blur on scroll
useAnimatedIcon()            // Icon animations: bounce, shake, pulse, spin
useTranslation()             // Returns { t } for i18n — t('key')
useNetworkStatus()           // Online/offline detection
useReducedMotion()           // Accessibility: motion preferences
```

### Key Components
```tsx
<Avatar uri={string|null} name={string} size={'xs'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'} showOnline={bool} showStoryRing={bool} />
<BottomSheet visible={bool} onClose={fn}><BottomSheetItem label="..." icon={<Icon />} onPress={fn} /></BottomSheet>
<Skeleton.PostCard /> <Skeleton.ThreadCard /> <Skeleton.Circle size={40} /> <Skeleton.Rect width={120} height={14} />
<EmptyState icon="users" title="..." subtitle="..." actionLabel="..." onAction={fn} />
<CharCountRing current={n} max={500} size={28} />
<ProgressiveImage uri={url} width={w} height={h} borderRadius={r} />
<BrandedRefreshControl refreshing={bool} onRefresh={fn} />
<RichText content={string} />  // parses #hashtag and @mention
```

---

## API Patterns
- Base: `/api/v1/` | Auth: `Authorization: Bearer <clerk_jwt>`
- Pagination: `?cursor=<id>` → `{ data: T[], meta: { cursor?, hasMore } }`
- Global throttle: 100 req/min | Per-endpoint: 5-60/min depending on cost
- All responses: `{ data: T, success: true, timestamp }` via TransformInterceptor
- Socket.io: `import { SOCKET_URL } from '@/services/api'` → `io(SOCKET_URL, { auth: { token }, transports: ['websocket'] })`

## Critical Schema Field Names
- ALL models: `userId` (NOT authorId) | `user` relation (NOT `author`)
- Post: `content` (NOT caption) | `postType` | `mediaUrls[]` + `mediaTypes[]`
- Thread: `isChainHead` (NOT replyToId) | replies → `ThreadReply` model
- Conversation: `isGroup: boolean` + `groupName?` — NO `type` or `name`
- Message: `messageType` (NOT type) | `senderId` (NOT from) — optional (SetNull on user delete)
- Notification: `userId` (NOT recipientId) | `isRead` (NOT read)
- Follow: composite PK [followerId, followingId]
- Exceptions: ForumThread/ForumReply use `authorId`, Circle/MajlisList use `ownerId`, GiftRecord uses `senderId`/`receiverId`
- ID strategy: core models use `@default(cuid())`, extensions use `@default(uuid())`. New models should use `cuid()` for consistency.

## Zustand Store
```ts
unreadNotifications / setUnreadNotifications(n)
unreadMessages / setUnreadMessages(n)
safFeedType: 'following'|'foryou'
majlisFeedType: 'foryou'|'following'|'trending'
isCreateSheetOpen / setCreateSheetOpen(bool)
theme: 'dark'|'light'|'system' / setTheme
```

## Development Commands
```bash
# All npm must run in Windows terminal (not shell — npm not in PATH)
cd apps/api && npm install --legacy-peer-deps && npm run start:dev   # Swagger: http://localhost:3000/docs
cd apps/mobile && npm install --legacy-peer-deps && npx expo start
cd apps/api && npx prisma db push                 # Dev only — use prisma migrate deploy for production
cd apps/api && npx prisma studio                  # DB browser GUI
cd apps/api && npx prisma db seed                 # Seed dev data (3 users, 5 posts, 3 threads)
```

## Font Family Names
```ts
fonts.headingBold = 'PlayfairDisplay_700Bold'
fonts.body = 'DMSans_400Regular'
fonts.bodyMedium = 'DMSans_500Medium'
fonts.bodyBold = 'DMSans_700Bold'
fonts.arabic = 'NotoNaskhArabic_400Regular'
fonts.arabicBold = 'NotoNaskhArabic_700Bold'
```

## i18n
- **Languages:** en, ar, tr, ur, bn, fr, id, ms (8 total)
- **Keys:** 3,173+ per language, 103 accessibility keys, all at 100% structural parity
- **Translation status:** en 100%, tr 89%, ar 77%, ur/bn/fr/id/ms 14-16% (needs human translator)
- **All new screens MUST have i18n keys in ALL 8 language files**

## Create Sheet Options (7 items)
Post | Thread | Story | Reel | Long Video | Go Live | Voice Post

## Settings Sections
Content | Appearance | Privacy | Notifications | Wellbeing | Islamic | Accessibility | Close Friends | AI | Creator | Community | Gamification | Account | About
