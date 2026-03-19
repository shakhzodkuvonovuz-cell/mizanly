# CLAUDE.md — Mizanly Project Guide

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

## Status: Tier 15 Complete (as of 2026-03-20, Post-Batch 85)
All 5 spaces built + Telegram + Discord + WeChat feature parity + full audit pass + 10/10 competitor parity. 196 screens, 700+ API endpoints, 71 backend modules, 166 Prisma models, 510+ commits, 195K+ lines of code.
Backend: NestJS with 71 modules (98 test files). Core: Redis, rate limiting, Stripe, Cloudflare Stream. AI: Claude API + Whisper + Gemini embeddings. Commerce: marketplace, Zakat (multi-asset calculator), Waqf. Gamification: streaks, XP/levels, achievements, challenges, series. Telegram: saved messages, chat folders, slow mode, admin log, group topics, custom emoji. Discord: forum threads, webhooks, stage sessions, persistent voice channels, granular role permissions. Community: local boards, mentorship, study circles, fatwa Q&A, volunteering, events, voice posts, watch parties.
Mobile: 196 screens across all spaces. i18n: 8 languages (en + ar + tr + ur + bn + fr + id + ms) all at 2,415 keys. All screens reachable via navigation (0 orphans). 196/196 screens wrapped with ScreenErrorBoundary. Create sheet: 7 options. Settings: 11 sections. Conversation info: 11 options.
**Audit (Batch 53-64):** Fixed 4 P0 crashes, 9 P1 bugs, 6 P2 quality issues, 2 security fixes, removed 890 junk i18n keys (2,500 lines), eliminated 6 `any` types, wired 78→2 orphaned screens, fixed font rendering, added real-time message refresh, reel view tracking, 2FA flow.
**Batch 85 (Mega):** 294 Arabic keys added, 122 orphans removed, 32 Prisma onDelete rules added, 8 dead-code patterns removed, 10 new test files (100+ cases), multi-guest live (4), group calls (8), screen sharing, video chapters, audience demographics, adhan reciters (6), calc methods (8), Quran audio (4 reciters), Zakat calculator, webhooks system, Sentry error reporting.
**All tiers complete. Next: production deployment + professional i18n review.**

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

---

## Architecture
```
mizanly/
├── apps/
│   ├── api/                     # NestJS 10 backend
│   │   ├── src/modules/         # 71 feature modules
│   │   ├── src/common/          # ClerkAuthGuard, OptionalClerkAuthGuard, decorators, sentry
│   │   ├── src/gateways/        # Socket.io /chat namespace (chat, calls, Quran rooms)
│   │   └── prisma/schema.prisma # 166 models, 3,461 lines
│   └── mobile/                  # React Native Expo SDK 52
│       ├── app/
│       │   ├── (tabs)/          # saf, majlis, risalah, bakra, minbar, create
│       │   └── (screens)/       # 196 screens + nested route dirs
│       └── src/
│           ├── components/ui/   # 28 components: BottomSheet, Skeleton, Icon, Avatar,
│           │                    # GlassHeader, GradientButton, EmptyState, VerifiedBadge,
│           │                    # CharCountRing, VideoPlayer, ImageLightbox, etc.
│           ├── components/islamic/ # EidFrame
│           ├── hooks/           # 13 hooks: useHaptic, useTranslation, useNetworkStatus, etc.
│           ├── services/        # 16 API service files (api.ts, islamicApi.ts, etc.)
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
- **Keys:** 2,415 per language, all 8 files at 100% parity
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
