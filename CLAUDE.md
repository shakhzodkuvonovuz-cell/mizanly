# CLAUDE.md — Mizanly Project Guide

## What is Mizanly?
Mizanly (ميزانلي) — a culturally intelligent social platform for the global Muslim community.
Five "spaces" combining Instagram + TikTok + X/Twitter + WhatsApp + YouTube in one app.
Brand: Emerald #0A7B4F + Gold #C8963E | Dark-mode primary | Arabic RTL support

## The Five Spaces
| Space | Arabic | Model | Status |
|-------|--------|-------|--------|
| Saf | الصف | Instagram (feed + stories) | ✅ Built, has gaps (see below) |
| Majlis | المجلس | X/Twitter (threads) | ✅ Built, has gaps |
| Risalah | رسالة | WhatsApp (DMs + groups) | ✅ Built, has gaps |
| Bakra | بكرة | TikTok (short video) | ❌ PLACEHOLDER ONLY — V1.1 |
| Minbar | المنبر | YouTube (long video) | ❌ Not started — V1.2 |

---

## Honest Status: ~50% Complete (as of 2026-03-04)
35 screens exist but contain significant stubs, dead buttons, and missing features.
This is NOT production-ready. Read the gap list below carefully before starting any work.

---

## CRITICAL STUBS — FIX THESE FIRST
These are broken/fake elements users hit immediately:

1. **`create-post.tsx` + `create-thread.tsx` toolbar** — map-pin / hash / at-sign buttons
   have NO `onPress`. They render but do absolutely nothing. Need: location picker,
   hashtag autocomplete dropdown, mention (@username) autocomplete dropdown.

2. **`thread/[id].tsx` reply like button** — `onPress` is empty. Tapping the heart
   on a thread reply does nothing. Wire it to `threadsApi.likeReply()`.

3. **`profile/[username].tsx` story highlights** — `onPress={() => {}}`.
   Tapping a highlight circle does nothing. Should open story-viewer.

4. **`settings.tsx` blocked keywords** — row `onPress={() => {}}`.
   Should navigate to a keyword management screen.

5. **`conversation/[id].tsx` mic button** — Renders but has no recording logic.
   Voice messages (record → waveform → send → playback) not implemented.

6. **`_layout.tsx` — NO `useFonts()` call**. Theme defines PlayfairDisplay / DM Sans /
   Noto Naskh Arabic but they never load. All text uses system font.
   Fix: `npx expo install @expo-google-fonts/playfair-display @expo-google-fonts/dm-sans
   @expo-google-fonts/noto-naskh-arabic` then add useFonts() to _layout.tsx.

7. **`StoryBubble`** — `hasUnread` exists on StoryGroup but the ring looks identical
   for seen and unseen stories. Unviewed = emerald-gold gradient ring,
   viewed = gray dimmed ring.

---

## KNOWN FEATURE GAPS (by priority)

### Tier 1 — Users notice immediately
- Thread reply interactions (like, delete) — API exists, no UI buttons
- Comment edit + delete — API exists, no UI in comment cards
- Tab scroll-to-top on active tab tap (standard iOS/Android behavior)
- Pull-to-refresh on `thread/[id].tsx`
- Search is people + hashtags only — no post content search, no explore grid, no history

### Tier 2 — Core feature parity
- Voice messages in Risalah (full record → send → playback flow)
- Swipe-to-reply gesture in conversation screen
- Long-press message context menu (delete, edit, react, forward, copy)
- GIF picker in messages (Tenor/GIPHY integration)
- Hashtag autocomplete while composing posts/threads
- Mention (@) autocomplete while composing
- Location picker for posts
- Story highlights actually opening story-viewer
- Profile links not clickable in profile view (tapping does nothing)
- Bio URLs not parsed as tappable links
- Share profile button / QR code screen

### Tier 3 — Premium polish
- Story filters, drawing tools, stickers, music
- Post draft auto-save
- Image lightbox / pinch-to-zoom on post images
- Alt text input for media (accessibility)
- Notification filter tabs (All / Mentions / Follows)
- Theme selector UI (dark/light/system toggle works in store, no UI)
- Comment moderation (pin, delete own post comments)
- "Who can reply" control on threads
- Bakra (V1.1) — entire short video space

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

## Architecture
```
mizanly/
├── apps/
│   ├── api/                     # NestJS 10 backend
│   │   ├── src/modules/         # 20 feature modules (complete)
│   │   ├── src/common/          # ClerkAuthGuard, OptionalClerkAuthGuard, decorators
│   │   ├── src/gateways/        # Socket.io /chat namespace
│   │   └── prisma/schema.prisma # v3 schema, 1652 lines
│   └── mobile/                  # React Native Expo SDK 52
│       ├── app/
│       │   ├── (tabs)/          # saf, majlis, risalah, bakra, create
│       │   ├── (auth)/          # sign-in, sign-up
│       │   ├── (screens)/       # all detail screens (30 files)
│       │   └── onboarding/      # 4 steps
│       └── src/
│           ├── components/ui/   # BottomSheet, Skeleton, Icon, Avatar, Badge,
│           │                    # ActionButton, RichText, VerifiedBadge, TabSelector,
│           │                    # CharCountRing, EmptyState
│           ├── components/saf/  # PostCard, PostMedia, StoryRow, StoryBubble
│           ├── components/majlis/ # ThreadCard
│           ├── components/      # ErrorBoundary (root, wraps app)
│           ├── hooks/           # useHaptic, usePushNotifications, useAnimatedPress
│           ├── services/api.ts  # All API clients (20 endpoint groups)
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
Bakra V1.1 | Minbar V1.2 | Live streaming V2.0 | E2E encryption V2.0 | Monetization V2.0
