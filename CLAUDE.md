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

## Status: ~90% Competitor Parity (as of 2026-03-17, Post-Batch 38)
All 5 spaces built, polished, and production-ready. 104+ screens, 431+ API endpoints, 50 backend modules, 81+ Prisma models, 301 commits.
Backend: NestJS with 50 modules, Redis, security headers, rate limiting, observability, Stripe payments, content moderation, push notifications, Cloudflare Stream video.
Mobile: Full feed/detail/compose flows for all spaces, messaging with voice/GIF/reactions/calls, offline resilience, glassmorphism visual polish, i18n (100% coverage), RTL support, error boundaries on all screens, Expo Web + PWA.
Tier 1 (Foundation) and Tier 2 (Video/Media) complete. Tier 3 (Stories/Reels) in progress (Batch 39).
See `docs/COMPETITOR_ANALYSIS.md` for full gap analysis vs TikTok/IG/X/YT/WA.

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

### Still Missing (see docs/plans/2026-03-17-pre-production-roadmap.md for full 191-feature list)
**Tier 3 (Ship-blocking, Batch 39):** Add Yours sticker, music on stories, drawing tools, text effects, link stickers, reel templates, reel remix, duet/stitch camera wiring, video replies, green screen wiring, photo with music, disposable camera, AR filters (deferred)
**Tier 4 (Ship-blocking, Batch 40):** E2E encryption, disappearing messages, view-once media, file sharing, location sharing, message scheduling, chat lock, chat backup, group admin tools, screen sharing, group video calls, multi-device
**Tier 5-8 (Launch Week):** Feed intelligence, creator economy, Islamic moat features, platform/UX parity
**Tier 9-12 (Month One):** AI features, gamification, commerce, community

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
│   │   ├── src/modules/         # 50 feature modules (complete)
│   │   ├── src/common/          # ClerkAuthGuard, OptionalClerkAuthGuard, decorators
│   │   ├── src/gateways/        # Socket.io /chat namespace
│   │   └── prisma/schema.prisma # v3 schema, 1850+ lines
│   └── mobile/                  # React Native Expo SDK 52
│       ├── app/
│       │   ├── (tabs)/          # saf, majlis, risalah, bakra, create
│       │   ├── (auth)/          # sign-in, sign-up
│       │   ├── (screens)/       # 104+ screens
│       │   └── onboarding/      # 4 steps
│       └── src/
│           ├── components/ui/   # BottomSheet, Skeleton, Icon, Avatar, Badge,
│           │                    # ActionButton, RichText, VerifiedBadge, TabSelector,
│           │                    # CharCountRing, EmptyState
│           ├── components/saf/  # PostCard, PostMedia, StoryRow, StoryBubble
│           ├── components/majlis/ # ThreadCard
│           ├── components/      # ErrorBoundary (root, wraps app)
│           ├── hooks/           # useHaptic, usePushNotifications, useAnimatedPress
│           ├── services/api.ts  # All API clients (46+ endpoint groups)
│           ├── store/index.ts   # Zustand store
│           ├── theme/index.ts   # Design tokens
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
theme: 'dark'|'light'|'system' / setTheme   // ← no UI yet, store exists
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

## Deferred
Minbar V1.4 (live streaming) | E2E encryption V2.0 | Monetization V2.0
