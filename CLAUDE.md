# CLAUDE.md — Mizanly Project Guide

## MANDATORY: Read All Memory Files Before Any Task

At the start of every session, read ALL files in `~/.claude/projects/C--dev-mizanly/memory/`:
- `user_shakhzod.md` — who the user is, preferences, communication style
- `feedback_*.md` — all feedback files (brutal honesty, no subagents, no co-author, max effort, Islamic data manual, subagent context quality)
- `reference_competitor_intel.md` — UpScrolled, Muslim Pro, market data

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

**Backend:** NestJS 10, 79 modules, 82 controllers, 86 services, 188 Prisma models (4,080 lines). 286 test suites, 4,483 tests, 100% pass, 0 TypeScript errors. Server starts clean.
**Mobile:** React Native Expo SDK 52, 209 screens, 70 components, 23 hooks, 32 API services.
**i18n:** 8 languages (en, ar, tr, ur, bn, fr, id, ms), 3,173+ keys each, 103 accessibility keys.
**Real-time:** Socket.io on 4 screens (chat, calls, Quran rooms, conversation list) with Clerk JWT auth, reconnection, token refresh.
**All credentials configured** (33/35 — only Meilisearch missing, falls back to Prisma LIKE queries).
**Database synced** — `prisma db push` confirmed in sync. Production uses `prisma migrate deploy`.
**CI/CD:** GitHub Actions with lint, typecheck, test, build (4 jobs, all use `--legacy-peer-deps`).

## Key Documentation
- `docs/DEPLOYMENT.md` — Production deployment guide (Railway, Neon, Cloudflare, Clerk, Stripe)
- `docs/DEPLOY_CHECKLIST.md` — Pre-deployment verification checklist
- `docs/TURN_SETUP.md` — WebRTC TURN/STUN server setup
- `docs/ONBOARDING.md` — Developer onboarding guide
- `docs/FULL_AUDIT_2026_03_23.md` — **29-dimension audit with all findings**
- `docs/PRIORITY_FIXES_CHECKLIST.md` — Crossable fix list
- `docs/audit/agents/` — 72 raw audit files (~4,300 findings)
- `docs/audit/DEFERRED_FIXES.md` — Master tracker of deferred items
- `docs/features/DATA_IMPORT_ARCHITECTURE.md` — Data import spec (not built)
- `docs/features/EXIT_STORY_SPEC.md` — Exit story spec (not built)
- `docs/ralph-instructions.md` — Autonomous execution behavioral rules

---

## PRE-APP STORE BLOCKERS

- **WebRTC 1:1 calls:** `react-native-webrtc` installed but not wired. Need ~500-800 lines: `RTCPeerConnection` + `getUserMedia()` + ICE candidate exchange via existing Socket.io signaling (`call_initiate`/`call_answer`/`call_signal` already on backend). TURN credentials set (Metered.ca). Estimated 2-3 days.
- **App icon + splash screen:** Currently 69-byte placeholder PNGs. Need proper 1024x1024 icon + splash.
- **Apple Developer Program:** $99/yr enrollment required.

## REMAINING TECHNICAL DEBT

**Installed but NOT wired (packages exist, zero usage in screens):**
- react-native-shared-element — installed but no `<SharedElement>` in any screen
- react-native-maps — installed but MosqueFinder doesn't use `<MapView>`
- Lottie animations — no .json animation files exist, no LottieView used anywhere
- Social auth Google/Apple — sign-in/sign-up screens have disabled OAuth buttons ("disabled until OAuth configured"). Needs Clerk dashboard setup.
- Payments on mobile — only send-tip.tsx uses paymentsApi. donate.tsx, gift-shop.tsx, waqf.tsx still have TODO stubs for Stripe integration.

**Cannot fix via code (need external services/humans):**
- 5 languages (ur, bn, fr, id, ms) at 14-15% translated — needs human translator
- Schema enum migrations — 41 String fields should be enums (high-risk, needs careful planning)
- RTL marginLeft→marginStart — 500+ instances (massive refactor)
- Metro bundler version conflict: run `npm install metro@0.83.5 metro-transform-worker@0.83.5 --legacy-peer-deps` at root before `npx expo start`
- Stream uploads fire-and-forget, CDN variants, virus scanning, getNearbyContent (PostGIS), caption generation, image resize upload — all need external services
- LocationPicker uses hardcoded mosques (expo-location installed but not wired to geocoding)

**Deferred features:**
- AI dubbing, AI restyle, AI "Best Moments", Friends Map, camera effects, TV app
- Bakra "not interested" swipe-left gesture
- Profile story highlights row
- Account deep dive (creation country, username history)
- Data import from Instagram/TikTok/X/YouTube/WhatsApp (spec exists)

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
