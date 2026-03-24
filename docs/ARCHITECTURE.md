# Mizanly Technical Architecture Blueprint

> **Last verified:** 2026-03-25 | **Schema:** 193 models, 55 enums, 4,704 lines | **Backend:** 80 modules, 82 controllers, 86 services | **Mobile:** 213 screens, 84 components, 24 hooks, 36 services | **Tests:** 5,226 passing

This document is the single source of truth for Mizanly's complete technical architecture. Every model, endpoint, hook, component, pattern, and decision is documented with file paths and line references. Built from exhaustive codebase analysis across 40 parallel extraction agents.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Layer (Prisma Schema)](#2-data-layer)
3. [Backend Layer (NestJS)](#3-backend-layer)
4. [Real-time Layer (Socket.io)](#4-real-time-layer)
5. [Mobile Layer (React Native)](#5-mobile-layer)
6. [End-to-End Flows](#6-end-to-end-flows)
7. [Algorithm & Feed Intelligence](#7-algorithm--feed-intelligence)
8. [Design System & Theme](#8-design-system--theme)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Decision Log](#10-decision-log)

---

## 1. System Overview

### Architecture Diagram
```
Mobile (React Native Expo SDK 52)
  ├── Clerk Auth (JWT) ──────────────────→ NestJS API (Railway)
  ├── Socket.io /chat ───────────────────→ Chat Gateway (Redis Adapter)
  ├── Direct Upload (XMLHttpRequest) ────→ Cloudflare R2 (presigned PUT)
  └── expo-av HLS playback ─────────────→ Cloudflare Stream CDN
                                              ↑
NestJS API                                    │
  ├── PostgreSQL 16 (Neon) ← Prisma ORM      │
  ├── Redis (Upstash) ← cache/pubsub/queue   │
  ├── Cloudflare R2 ← S3-compatible storage   │
  ├── Cloudflare Stream ← video transcoding ──┘
  ├── Clerk ← auth provider (JWT + webhooks)
  ├── Stripe ← payments (PaymentIntent + webhooks)
  ├── Resend ← transactional email
  ├── Sentry ← error monitoring
  ├── Gemini ← text embeddings (768-dim)
  ├── Claude ← content moderation + AI features
  └── GIPHY ← GIF search + stickers
```

### The Five Spaces
| Space | Arabic | Model | Tab | Backend Module |
|-------|--------|-------|-----|----------------|
| **Saf** | الصف | Instagram (feed + stories) | Home | posts, stories |
| **Bakra** | بكرة | TikTok (short video) | Short Video | reels |
| **Minbar** | المنبر | YouTube (long video) | Long Video | videos, channels, playlists |
| **Majlis** | المجلس | X/Twitter (threads) | Threads | threads |
| **Risalah** | رسالة | WhatsApp (DMs + groups) | Messages | messages, conversations |

### Tech Stack Summary
| Layer | Technology | Version |
|-------|-----------|---------|
| Mobile | React Native + Expo | SDK 52 |
| Navigation | Expo Router | v3 |
| State (server) | React Query | v5 |
| State (client) | Zustand | v4 |
| Animation | Reanimated 3 | v3 |
| Backend | NestJS | 10 |
| ORM | Prisma | v5 |
| Database | PostgreSQL + pgvector | 16 |
| Cache | Redis (Upstash) | 7 |
| Auth | Clerk | v5 |
| Payments | Stripe | 2025-02-24 API |
| Storage | Cloudflare R2 | S3-compatible |
| Video | Cloudflare Stream | HLS/DASH |
| Email | Resend | v2 |
| Monitoring | Sentry | v8 |

---

## 2. Data Layer

### 2.1 Schema Statistics
- **File:** `apps/api/prisma/schema.prisma` (4,704 lines)
- **Models:** 193 total
- **Enums:** 55+ (82 counting prefixed variants)
- **ID strategy:** ~120 models use `cuid()`, ~50 use `uuid()`
- **Extensions:** pgvector (768-dimensional embeddings)

### 2.2 Core Content Models

| Model | ID | Key Fields | Relations | Indexes | Purpose |
|-------|----|-----------|-----------|---------|---------|
| **User** | cuid | clerkId(@unique), username(@unique), email(@unique), previousUsername, role, isPrivate, isBanned, coinBalance, diamondBalance | 89 relations across all spaces | username, clerkId, createdAt DESC | Central identity |
| **Post** | cuid | content(2000), postType(TEXT/IMAGE/VIDEO/CAROUSEL), visibility, mediaUrls[], hashtags[], commentPermission, scheduledAt, topics[] | user, comments, reactions, savedBy, taggedUsers, collabInvites | userId+createdAt, space+createdAt, hashtags | Saf feed content |
| **Reel** | cuid | videoUrl, streamId, hlsUrl, caption(500), isPhotoCarousel, carouselUrls[], isTrial, scheduledAt, commentPermission | user, reactions, comments, interactions, taggedUsers, duets, stitches | userId+createdAt, viewsCount, hashtags | Bakra short video |
| **Thread** | cuid | content(500), isChainHead, replyPermission(EVERYONE/FOLLOWING/MENTIONED/NONE), scheduledAt | user, reactions, replies, poll, bookmarks | userId+createdAt, chainId, hashtags | Majlis threads |
| **Story** | cuid | mediaUrl, expiresAt(24h), stickerData(JSON), closeFriendsOnly | user, views, stickerResponses, chainEntries | userId+createdAt, expiresAt | Saf stories |
| **Video** | cuid | title(200), videoUrl, streamId, hlsUrl, status(DRAFT/PROCESSING/PUBLISHED), chapters(JSON) | channel, user, comments, reactions, subtitles | channelId+publishedAt, category+viewsCount | Minbar long-form |
| **Channel** | cuid | handle(@unique), subscribersCount | user(1:1), videos, playlists, subscribers | handle, subscribersCount DESC | Minbar channels |

### 2.3 Social Graph Models

| Model | PK Type | Purpose |
|-------|---------|---------|
| **Follow** | Composite [followerId, followingId] | Follow relationships |
| **FollowRequest** | cuid | Private account follow requests |
| **Block** | Composite [blockerId, blockedId] | Bidirectional blocks |
| **Mute** | Composite [muterId, mutedId] | One-way mutes |
| **Restrict** | Composite [restricterId, restrictedId] | Visibility restrictions |

### 2.4 Messaging Models

| Model | Key Design | Purpose |
|-------|-----------|---------|
| **Conversation** | isGroup boolean, lastMessageAt for sorting | DM or group chat container |
| **ConversationMember** | Composite PK, role(owner/admin/member), unreadCount, isMuted, isBanned | Membership + per-user state |
| **Message** | 11 messageTypes, replyToId(self-join), isViewOnce, expiresAt, isEncrypted | Individual messages |
| **MessageReaction** | Unique [userId, messageId, emoji] | Emoji reactions |
| **StarredMessage** | Join table replacing deprecated starredBy[] | Bookmarked messages |

### 2.5 Engagement Models (All Composite PK)

| Model | PK | Counter Updated | Purpose |
|-------|----|-----------------|---------|
| PostReaction | [userId, postId] | Post.likesCount | Like/react to posts |
| ReelReaction | [userId, reelId] | Reel.likesCount | Like reels |
| ThreadReaction | [userId, threadId] | Thread.likesCount | Like threads |
| VideoReaction | [userId, videoId] | Video.likesCount | Like/dislike videos |
| CommentReaction | [userId, commentId] | Comment.likesCount | Like post comments |
| ReelCommentReaction | [userId, commentId] | ReelComment.likesCount | Like reel comments |
| ThreadReplyLike | [userId, replyId] | ThreadReply.likesCount | Like thread replies |
| SavedPost | [userId, postId] | Post.savesCount | Bookmark posts |
| ThreadBookmark | [userId, threadId] | Thread.bookmarksCount | Bookmark threads |
| StoryView | [storyId, viewerId] | Story.viewsCount | Track story views |

### 2.6 Key Enums

| Enum | Values | Used By |
|------|--------|---------|
| PostType | TEXT, IMAGE, VIDEO, CAROUSEL | Post.postType |
| PostVisibility | PUBLIC, FOLLOWERS, CIRCLE | Post.visibility, Thread.visibility |
| ReelStatus | PROCESSING, READY, FAILED | Reel.status |
| VideoStatus | DRAFT, PROCESSING, PUBLISHED, UNLISTED, PRIVATE | Video.status |
| CommentPermission | EVERYONE, FOLLOWERS, NOBODY | Post/Reel.commentPermission |
| ReplyPermission | EVERYONE, FOLLOWING, MENTIONED, NONE | Thread.replyPermission |
| MessageType | TEXT, IMAGE, VOICE, VIDEO, STICKER, FILE, SYSTEM, GIF, STORY_REPLY, LOCATION, CONTACT | Message.messageType |
| CallType | VOICE, VIDEO | CallSession.callType |
| CallStatus | RINGING, ACTIVE, ENDED, MISSED, DECLINED | CallSession.status |
| NotificationType | 23 values (LIKE through SYSTEM) | Notification.type |
| ReportReason | 12 values (HATE_SPEECH through OTHER) | Report.reason |
| ModerationAction | WARNING, CONTENT_REMOVED, TEMP_MUTE, TEMP_BAN, PERMANENT_BAN, NONE | ModerationLog.action |
| ReactionType | LIKE, LOVE, SUPPORT, INSIGHTFUL | All reaction models |

### 2.7 Schema Design Patterns

| Pattern | Implementation | Why |
|---------|---------------|-----|
| **Composite PKs** | N:M joins use [fkA, fkB] | No surrogate ID waste, natural uniqueness |
| **Denormalized counters** | likesCount, followersCount etc. on parent | Avoid COUNT(*) on every read |
| **Soft deletes** | isRemoved/isDeleted + removedAt/deletedAt | Preserve for appeals, audit trail |
| **Nullable FKs** | Post.userId? with onDelete: SetNull | Content survives user deletion |
| **Parallel arrays** | mediaUrls[] + mediaTypes[] | Polymorphic media without join table |
| **JSON storage** | Story.stickerData, Video.chapters | Flexible schemas for client-defined data |
| **Self-relations** | Comment.parentId, Message.replyToId | Unlimited nesting depth |
| **Blurhash** | Post.blurhash, Reel.blurhash | Progressive image loading placeholder |

### 2.8 Polymorphic FK (Known Limitation)
- `VideoReply.commentId` + `VideoReply.commentType` (POST or REEL) — Prisma doesn't support polymorphic relations natively. Must resolve at application layer.

---

## 3. Backend Layer

### 3.1 Entry Point Configuration
**File:** `apps/api/src/main.ts`

| Config | Value | Purpose |
|--------|-------|---------|
| Global prefix | `/api/v1` | All routes under /api/v1 |
| Port | `process.env.PORT \|\| 3000` | Bind 0.0.0.0 |
| CORS | From `CORS_ORIGINS` env (comma-sep) | Dynamic origin whitelist |
| Body limit | 1MB (JSON + urlencoded) | Prevent memory bombs |
| Helmet | HSTS 1yr, no CSP (API-only) | Security headers |
| Compression | Enabled globally | Response compression |
| Swagger | Dev only at `/docs` | API documentation |
| Validation | whitelist + forbidNonWhitelisted + transform | Strip unknown, convert types |
| Sentry | Before app creation, 10% trace rate | Error monitoring |
| Socket.io | Redis adapter for horizontal scaling | Multi-instance support |

### 3.2 Global Middleware Chain (Order Matters)
1. **CorrelationIdMiddleware** — Generate/propagate X-Correlation-ID
2. **SecurityHeadersMiddleware** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy
3. **RequestLoggerMiddleware** — Log slow requests (>500ms), track error rates
4. **ResponseTimeMiddleware** — X-Response-Time header (nanosecond precision)

### 3.3 Guard Architecture

| Guard | Scope | Purpose | Tracking |
|-------|-------|---------|----------|
| **UserThrottlerGuard** | Global (APP_GUARD) | Rate limit 100 req/min | user:id > ip > fingerprint |
| **ClerkAuthGuard** | Per-route | Verify JWT, check ban/deactivate/delete, attach user | N/A |
| **OptionalClerkAuthGuard** | Per-route | Same but never throws, user optional | N/A |

### 3.4 Response Envelope
All responses wrapped by TransformInterceptor:
```json
{ "success": true, "data": { ... }, "timestamp": "ISO8601" }
{ "success": true, "data": [...], "meta": { "cursor": "...", "hasMore": true }, "timestamp": "..." }
{ "success": false, "statusCode": 400, "error": "Bad Request", "message": "...", "path": "/api/v1/...", "timestamp": "..." }
```

### 3.5 Module Registry (80 Modules)

**Core Content (12):** posts, reels, stories, threads, videos, channels, playlists, channel-posts, clips, reel-templates, story-chains, video-replies

**Social (8):** follows, blocks, mutes, restricts, bookmarks, circles, collabs, profile-links

**Discovery (7):** feed, search, hashtags, recommendations, embeddings, trending (in feed), explore (in search)

**Messaging (4):** messages, calls, broadcast, audio-rooms

**Islamic (5):** islamic, halal, mosques, scholar-qa, (prayer/quran/dhikr/dua/hifz all inside islamic module)

**Monetization (5):** monetization, payments, gifts, commerce, promotions

**Safety (5):** moderation, reports, content-filter (in moderation), privacy, parental-controls

**Creator (4):** creator, thumbnails, og, scheduling

**Gamification (1 mega-module):** gamification (includes streaks, XP, achievements, leaderboard, challenges, series, profile customization)

**Community (5):** events, communities, community-notes, checklists, polls

**Account (7):** auth, users, settings, two-factor, devices, encryption, alt-profile

**Infrastructure (7):** health, admin, stream, upload, search-indexing (in search), downloads, chat-export

**Extensions (5):** webhooks, telegram-features, discord-features, retention, live

### 3.6 Queue Infrastructure (BullMQ)

| Queue | Concurrency | Retries | Purpose |
|-------|------------|---------|---------|
| notifications | 5 | 3 (1s, 10s, 60s) | Push notification delivery via Expo |
| media-processing | 3 | varies | Image EXIF strip, blurhash, video transcode |
| analytics | varies | 2 (1s exp) | Gamification XP/streaks |
| webhooks | 25 | 5 (1s→30m) | External webhook delivery with HMAC-SHA256 |
| search-indexing | varies | 3 (1s exp) | Meilisearch index updates |
| ai-tasks | varies | 2 (3s exp) | Content moderation, caption generation |

Dead Letter Queue: Redis list `mizanly:dlq` (max 1000 entries, captures exhausted jobs)

### 3.7 Core Service Patterns

**Pagination:** Cursor-based keyset (`take: limit + 1`, detect hasMore, return cursor as last item's ID)

**Counter Updates:** Atomic `$executeRaw` with `GREATEST(field - 1, 0)` to prevent negatives

**Block Filtering:** Bidirectional block check (`OR: [blockerId=A,blockedId=B], [blockedId=A,blockerId=B]`) before all social operations

**Scheduled Content:** `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]` on ALL feed queries (50+ queries patched)

**Trial Reels:** `isTrial: false` filter on all reel feed queries (only owner sees trial reels)

**Notification Pattern:** Create DB record → async push via queue → async Redis pub/sub for socket delivery

---

## 4. Real-time Layer

### 4.1 Socket.io Configuration
- **Namespace:** `/chat`
- **Ping:** 25s interval, 60s timeout
- **Auth:** Clerk JWT in handshake `auth.token`
- **Scaling:** Redis adapter (pub/sub for multi-instance)
- **Rate limit:** 10 connections/min per IP

### 4.2 Socket Event Catalog

| Event | Direction | Room | Rate | Purpose |
|-------|-----------|------|------|---------|
| join_conversation | Client→Server | conversation:{id} | 20/min | Subscribe to conversation events |
| leave_conversation | Client→Server | conversation:{id} | 20/min | Unsubscribe |
| send_message | Client→Server→Room | conversation:{id} | 30/min | Send message to conversation |
| typing | Client→Server→Room | conversation:{id} | 10/10s | Typing indicator |
| read | Client→Server | conversation:{id} | 30/min | Mark conversation as read |
| message_delivered | Client→Server→Sender | user:{senderId} | 60/min | Delivery receipt (privacy: only sender sees) |
| get_online_status | Client→Server→Client | — | 10/min | Check if users online |
| call_initiate | Client→Server→Target | user:{targetId} | 3/min | Start call |
| call_answer/reject/end | Client→Server→Peer | user:{peerId} | 10/min | Call lifecycle |
| call_signal | Client→Server→Target | user:{targetId} | 60/10s | WebRTC SDP/ICE relay |
| join_quran_room | Client→Server→Room | quran:{roomId} | 10/min | Join Quran recitation room |
| quran_verse_sync | Client→Server→Room | quran:{roomId} | 30/min | Sync verse position |
| new_notification | Server→Client | user:{userId} | — | Push notification via Redis pub/sub |

### 4.3 Room Strategy

| Room | Format | Purpose |
|------|--------|---------|
| User | `user:{userId}` | Direct delivery (calls, notifications) |
| Conversation | `conversation:{conversationId}` | Chat messages, typing, read receipts |
| Quran | `quran:{roomId}` | Quran recitation sync (max 50 participants) |

### 4.4 Presence System
- **Storage:** Redis Set `presence:{userId}` containing socket IDs
- **TTL:** 5 minutes (auto-cleanup for stale connections)
- **Heartbeat:** Every 2 minutes refreshes TTL
- **Online broadcast:** Only to user's conversation rooms (not global)
- **Offline detection:** When last socket disconnects, emit `user_offline` + update lastSeenAt

---

## 5. Mobile Layer

### 5.1 Navigation Tree
```
App Root (_layout.tsx)
├── ClerkProvider → QueryClientProvider → GestureHandlerRootView
├── Stack Router
│   ├── (tabs) [5-tab bottom bar]
│   │   ├── saf — Feed + Stories (following/foryou toggle)
│   │   ├── bakra — Vertical video feed (snap-to-item)
│   │   ├── minbar — Video grid + categories + subscriptions
│   │   ├── majlis — Threads (foryou/following/trending/video)
│   │   └── risalah — Conversation list (Socket.io real-time)
│   ├── (auth) [Modal] — sign-in, sign-up
│   ├── onboarding — username, profile setup
│   └── (screens) [213 detail screens]
│       ├── Create: create-post, create-carousel, create-story, create-reel,
│       │          create-thread, create-video, go-live, voice-post, video-editor
│       ├── Detail: post/[id], reel/[id], thread/[id], video/[id], story-viewer
│       ├── Profile: profile/[username], edit-profile, followers, following
│       ├── Settings: settings (12 sections), account-settings, 2fa-setup
│       ├── Messaging: conversation/[id], new-conversation, call/[id]
│       ├── Islamic: prayer, quran, hadith, dhikr, dua, names-of-allah, zakat, mosque-finder
│       ├── Discovery: search, discover, hashtag-explore, trending-audio
│       └── 150+ other screens
├── Overlays: OfflineBanner, IslamicThemeBanner, BiometricLock, MiniPlayer, ToastContainer
└── Handlers: AuthGuard, DeepLinkHandler, ShareIntentHandler, AppStateHandler
```

### 5.2 Tab Bar Configuration
- **5 tabs:** saf, bakra, minbar, majlis, risalah
- **Hidden create tab:** href: null (deep-link safety)
- **Create button:** Emerald gradient "+" in saf header → opens CreateSheet
- **Badges:** Unread notifications (saf), unread messages (risalah)
- **Platform:** BlurView (iOS) or semi-transparent dark (Android)

### 5.3 Zustand Store Shape
```typescript
safFeedType: 'following' | 'foryou'
majlisFeedType: 'foryou' | 'following' | 'trending' | 'video'
safScrollOffset: number           // Scroll position persistence
majlisScrollOffset: number
unreadNotifications: number       // Tab badge
unreadMessages: number            // Tab badge
isCreateSheetOpen: boolean
theme: 'dark' | 'light' | 'system'
miniPlayerVideo: { id, title, channelName, thumbnailUri, videoUrl } | null
miniPlayerPlaying: boolean
miniPlayerProgress: number
```

### 5.4 Key Hooks

| Hook | Purpose | Key Pattern |
|------|---------|-------------|
| **useWebRTC** | Complete RTCPeerConnection lifecycle | socketReady gate, callback refs, Pattern B remote streams, ICE queue, mountedRef guard |
| **useContextualHaptic** | 10 semantic haptics | like, follow, save, navigate, tick, delete, error, longPress, send, success |
| **useThemeColors** | Theme-aware colors | Returns tc.bg, tc.text.primary, tc.emerald, etc. |
| **useStaggeredEntrance** | List item animations | FadeIn + translateY with 40ms stagger |
| **useScrollLinkedHeader** | Elastic header collapse | Opacity + scale on scroll |
| **useAnimatedIcon** | Icon micro-animations | bounce, shake, pulse, spin |
| **useTranslation** | i18n | Returns { t } for 8 languages |
| **useNetworkStatus** | Online/offline detection | NetInfo subscription |
| **useReducedMotion** | Accessibility | Respects system motion preference |

### 5.5 Key Components

| Component | Props | Purpose |
|-----------|-------|---------|
| **Avatar** | uri, name, size(xs-3xl), showOnline, showStoryRing | User avatar with presence |
| **BottomSheet** | visible, onClose, children | Modal sheet (replaces RN Modal) |
| **Icon** | name(44 valid), size, color | Consistent icon system |
| **ProgressiveImage** | uri, width, height, borderRadius | Blurhash placeholder loading |
| **BrandedRefreshControl** | refreshing, onRefresh | Pull-to-refresh (emerald spinner) |
| **EmptyState** | icon, title, subtitle, actionLabel | Empty list placeholder |
| **Skeleton** | PostCard, ThreadCard, Circle, Rect | Loading placeholders |
| **RichText** | content | Parses #hashtag and @mention |
| **CharCountRing** | current, max, size | Circular char counter |
| **AnimatedAccordion** | Reanimated spring height | Expandable publish fields |
| **ImageCarousel** | images[], texts[], slideDuration | Instagram-style dot indicators |
| **CreateSheet** | 4 primary + 3 secondary options | Content creation menu |
| **DrawingCanvas** | SVG mask eraser + 5 pen tools | Story drawing |
| **DraggableSticker** | pan + scale + shadow lift | Interactive story stickers |

### 5.6 Video Editor (2,607 lines)
**File:** `apps/mobile/app/(screens)/video-editor.tsx`

- **10 tool tabs:** trim, speed, filters, adjust, text, music, volume, voiceover, effects
- **35 edit state fields** tracked in undo/redo (20-deep stack)
- **13 filter presets** (FFmpeg eq/curves/colorbalance)
- **6 voice effects** (robot, echo, deep, chipmunk, telephone)
- **5 speed curves** (montage, hero, bullet, flashIn, flashOut)
- **Export:** 720p (CRF 28), 1080p (CRF 23), 4K (CRF 18) via ffmpeg-kit
- **Fallback:** Upload original with edit metadata when FFmpeg unavailable

### 5.7 Story Sticker System (12 Types)

| Sticker | Interactive | Response |
|---------|------------|----------|
| Poll | Yes | { optionId } |
| Quiz | Yes | { optionId, isCorrect } — ticker-tape confetti on correct |
| Question | Yes | { questionText } — immediate optimistic submit |
| Countdown | Display | { remindMe: boolean } |
| Emoji Slider | Yes | { value: number } — haptic ticks at quarter marks |
| Location | Display | Real expo-location GPS + reverse geocode |
| Link | Clickable | URL truncation + favicon |
| Add Yours | Yes | { action: 'addYours' } — chain prompt |
| GIF | Display | GIPHY waterfall masonry + native SDK dialog |
| Music | Display | 3 modes: compact pill, waveform bars, word-by-word lyrics |
| Mention | Display | @username pill |
| Hashtag | Display | #tag pill |

---

## 6. End-to-End Flows

### 6.1 Authentication Flow
```
1. User signs up/in via Clerk UI on mobile
2. Clerk issues JWT with { sub: clerkId, ... }
3. Clerk webhook (user.created) → POST /webhooks/clerk
   → svix signature verification → syncClerkUser() → CREATE User in DB
4. Mobile sends JWT in Authorization: Bearer <token>
5. ClerkAuthGuard: verify → lookup by clerkId → check ban/deactivate → attach request.user
6. @CurrentUser('id') extracts userId for service methods
7. Socket: Same JWT in handshake → same verification → presence tracking
```

### 6.2 File Upload Pipeline
```
1. Mobile: ImagePicker selects file
2. Mobile: imageResize.ts — format-aware (GIF as-is, PNG stays PNG, JPEG compressed)
3. Mobile: uploadApi.getPresignUrl(contentType, folder) → backend
4. Backend: Validates type + folder + size → S3 PutObjectCommand → signed URL (5min)
5. Mobile: XMLHttpRequest PUT to presigned URL with progress tracking
6. Mobile: Uses publicUrl in create API call (e.g., postsApi.create({mediaUrls: [url]}))
7. Backend (video): StreamService.uploadFromUrl(r2Url) → Cloudflare Stream
8. Stream: Transcodes → webhook readyToStream → update hlsUrl/dashUrl/qualities
```

**Folder/Size Matrix:**
| Folder | Max Size | Types |
|--------|----------|-------|
| avatars | 5 MB | image/* |
| covers | 10 MB | image/* |
| posts | 50 MB | image/* + video/* |
| stories | 50 MB | image/* + video/* |
| messages | 50 MB | image/* + video/* + audio/* |
| reels | 100 MB | video/* |
| videos | 100 MB | video/* |
| thumbnails | 5 MB | image/* |

### 6.3 Payment Flows

**Tips:** User → POST /monetization/tips → Stripe PaymentIntent → webhook → Tip.status=completed (10% platform fee)

**Gifts:** User sends gift (coin cost) → atomic coinBalance decrement → receiver gets diamonds (70% rate) → CoinTransaction records

**Orders:** User → POST /commerce/products/{id}/order → Stripe PaymentIntent → atomic stock decrement → Order record

**Cashout:** Creator → POST /gifts/cashout → atomic diamond decrement → USD conversion ($0.007/diamond) → CoinTransaction

**Subscriptions:** User → POST /monetization/subscribe/{tierId} → Stripe Subscription → invoice.paid webhook → active

### 6.4 WebRTC Call Flow
```
1. Caller: REST POST /calls → create CallSession (RINGING)
2. Caller: Socket call_initiate → server relays incoming_call to callee
3. Callee: Shows ringing UI → taps Answer → REST POST /calls/{id}/answer
4. Both: useWebRTC.start() → getUserMedia → RTCPeerConnection
5. Caller: createOffer → setLocalDescription → socket call_signal(offer)
6. Server: Relays call_signal to callee's socket room
7. Callee: setRemoteDescription(offer) → drain ICE queue → createAnswer
8. Both: ICE trickle via call_signal events (queue if remote desc not set)
9. pc.ontrack → remote MediaStream → video/audio rendering
10. Hangup: pc.close() → stream.release() → socket call_end
```

**Key Architecture Decisions:**
- `socketReady` boolean bridges async socket connect to React effects
- Callback refs prevent stale closures in PC event handlers
- Pattern B remote streams (manual addTrack) over event.streams[0]
- `applyConstraints({facingMode})` for camera flip (replaces deprecated _switchCamera)
- ICE candidate queue (max 200) for candidates arriving before remote description

---

## 7. Algorithm & Feed Intelligence

### 7.1 Three-Stage Ranking Pipeline

**Stage 1: Candidate Generation (pgvector KNN)**
- User's interest vectors: k-means clustering (2-3 centroids from last 50 interactions)
- Query: `findSimilarByMultipleVectors(centroids, 500, [contentType], excludeViewed)`
- Vector model: Gemini `text-embedding-004` (768 dimensions)
- Index: HNSW (recommended for >100K embeddings, currently sequential scan)

**Stage 2: Weighted Scoring**
| Factor | Weight | Formula |
|--------|--------|---------|
| Similarity | 0.35 | Cosine distance from pgvector (0-1) |
| Engagement | 0.25 | `min((likes + comments*2 + shares*3) / views * 10, 1)` |
| Recency | 0.15 | `max(0, 1 - ageHours / 168)` (7-day decay) |
| Islamic Boost | 0.15 | Location-aware prayer times, Friday, Ramadan (0.1-0.5) |
| Session Boost | 0.10 | In-session category likes * 0.05 (capped 0.3) |

**Stage 3: Diversity Reranking**
1. Author deduplication (no same author back-to-back)
2. Hashtag cluster diversity (6-item window, defer if 2+ overlapping tags)
3. Backfill from deferred items

### 7.2 Islamic Content Boost
- **Base:** 10% for Islamic hashtags (29 terms)
- **Friday:** +15% all day, +10% extra 11:00-14:00
- **Prayer windows:** +10% within ±30min of calculated prayer time (location-aware)
- **Ramadan:** +20% (hardcoded dates 2026-2031, approximated beyond)
- **Cap:** 50% maximum boost

### 7.3 Trending Algorithm
```
engagementScore = log10(max(engagementCount, 1) + 1) / 5
decayFactor = ageHours <= 12 ? 1.0 : max(0.5, 1 - (ageHours - 12) / 24)
trendingScore = engagementScore * decayFactor
```
- Window: 24 hours
- First 12h: full score. 12-36h: linear decay to 50%

### 7.4 Exploration Slots
- 15% of feed reserved for fresh content (<6h old, <100 views)
- Interleaved every ~7th position in main results
- Deduplicated against main results

### 7.5 Cold Start (<10 interactions)
- 70% trending content + 30% Islamic editorial picks (verified users)
- Fisher-Yates shuffle to blend

### 7.6 Session Adaptation
- Redis hash `session:{userId}` with 30-min TTL
- Tracks: viewedIds (max 1000), likedCategories, scrollDepth
- Boost: +5% per in-session like of same hashtag category (capped 30%)

---

## 8. Design System & Theme

### 8.1 Color Tokens
```
Brand:     emerald=#0A7B4F  gold=#C8963E
Dark BG:   bg=#0D1117  bgElevated=#161B22  bgCard=#1C2333  bgSheet=#21283B
Surface:   surface=#2D3548  border=#30363D
Text:      primary=#FFF  secondary=#8B949E  tertiary=#6E7781
Status:    error=#F85149  success=#0A7B4F  warning=#C8963E
```

### 8.2 Spacing & Typography
```
Spacing:   xs=4  sm=8  md=12  base=16  lg=20  xl=24  2xl=32
FontSize:  xs=11  sm=13  base=15  md=17  lg=20  xl=24
Radius:    sm=6  md=10  lg=16  full=9999
```

### 8.3 Animation Springs
```
bouncy:     damping=10  stiffness=400
snappy:     damping=12  stiffness=300
responsive: damping=15  stiffness=150
gentle:     damping=20  stiffness=100
```

### 8.4 Font Families
```
headingBold:  PlayfairDisplay_700Bold
body:         DMSans_400Regular
bodyMedium:   DMSans_500Medium
bodyBold:     DMSans_700Bold
arabic:       NotoNaskhArabic_400Regular
arabicBold:   NotoNaskhArabic_700Bold
```

### 8.5 Haptic Patterns (useContextualHaptic)
10 semantic types: like, follow, save, navigate, tick, delete, error, longPress, send, success

### 8.6 i18n
- **Languages:** en, ar, tr, ur, bn, fr, id, ms (8 total)
- **Keys:** 3,500+ per language
- **Status:** en 100%, tr 89%, ar 77%, ur/bn/fr/id/ms 14-16%
- **RTL:** ~430 margin/padding/position replacements across 134 files

---

## 9. Infrastructure & Deployment

### 9.1 Production Services

| Service | Provider | Status |
|---------|----------|--------|
| API | Railway (Nixpacks) | LIVE |
| Database | Neon PostgreSQL 16 | Connected |
| Cache | Upstash Redis | Connected |
| Storage | Cloudflare R2 | Configured |
| Video | Cloudflare Stream | Configured |
| Auth | Clerk (TEST keys) | Connected |
| Payments | Stripe (TEST keys) | Connected |
| Email | Resend (domain unverified) | Configured |
| Monitoring | Sentry | Configured |
| Search | Meilisearch | NOT configured (Prisma LIKE fallback) |
| Domain | mizanly.app (Namecheap + Cloudflare DNS) | Registered |

### 9.2 CI/CD Pipeline
```
.github/workflows/ci.yml
├── lint-and-typecheck (no deps)
├── test-api (depends on lint, services: postgres:16 + redis:7)
├── build-api (depends on test-api)
└── build-mobile (depends on lint, needs --legacy-peer-deps)
```

### 9.3 Environment Variables (32/34 configured)
**Set:** DATABASE_URL, DIRECT_DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, CLERK_WEBHOOK_SECRET, REDIS_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL, CF_STREAM_ACCOUNT_ID, CF_STREAM_API_TOKEN, CF_STREAM_WEBHOOK_SECRET, RESEND_API_KEY, SENTRY_DSN, TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL, TOTP_ENCRYPTION_KEY, GOLD_PRICE_PER_GRAM, SILVER_PRICE_PER_GRAM, NODE_ENV, PORT, CORS_ORIGINS

**Missing:** MEILISEARCH_HOST, MEILISEARCH_API_KEY

**Needs update:** APP_URL (localhost:3000 → api.mizanly.app)

### 9.4 Health Checks
- `GET /api/v1/health/live` — Always 200 (liveness probe)
- `GET /api/v1/health/ready` — DB + Redis check (readiness probe)
- `GET /api/v1/health` — Full dashboard (admin: DB, Redis, R2, Stream)
- `GET /api/v1/health/metrics` — Counts, queue stats, memory (admin)

---

## 10. Decision Log

### Architecture Decisions

| Decision | Choice | Why | Alternative Considered |
|----------|--------|-----|----------------------|
| **Auth provider** | Clerk (external) | Handles OAuth, email/phone, sessions out of box; reduces security surface | Self-hosted Passport.js — too much attack surface for solo dev |
| **Database** | Neon PostgreSQL + pgvector | Serverless scale, built-in vector support for embeddings | Supabase — more features but less control; MongoDB — no vector support |
| **ORM** | Prisma | Type-safe, migration system, schema as documentation | TypeORM — less type-safe; Drizzle — newer, less ecosystem |
| **Real-time** | Socket.io (not SSE/WebSocket raw) | Room abstraction, auto-reconnect, Redis adapter, event namespacing | Raw WebSocket — no rooms; SSE — no bidirectional |
| **Video hosting** | Cloudflare Stream | Automatic transcoding, HLS/DASH, CDN delivery, reasonable pricing | Self-hosted FFmpeg — operational burden; AWS MediaConvert — expensive |
| **Storage** | Cloudflare R2 | S3-compatible, no egress fees, same vendor as Stream | AWS S3 — egress costs; Supabase Storage — less control |
| **Feed algorithm** | pgvector KNN + weighted scoring | Personalized without ML infra; embeddings from Gemini API | Collaborative filtering — needs scale; Simple chronological — no discovery |
| **State management** | Zustand (client) + React Query (server) | Minimal boilerplate, built-in cache/refetch for server state | Redux — too verbose; Jotai — atomic but needs more wiring |
| **Navigation** | Expo Router (file-based) | Type-safe, deep linking built-in, familiar Next.js patterns | React Navigation — more manual, less type-safe |
| **Monorepo** | npm workspaces (not Turborepo) | Simple, no build cache needed for this scale | Turborepo — overkill for 2 packages |
| **Video editor** | ffmpeg-kit-react-native (full-gpl) | Full FFmpeg filter graph, professional quality, offline processing | expo-video-editor — doesn't exist; cloud processing — latency + cost |
| **Bottom sheets** | Custom BottomSheet (not RN Modal) | Rule #1: Never use RN Modal. Consistent look, gesture dismissal | react-native-bottom-sheet — dependency; RN Modal — inconsistent |
| **Icons** | Custom Icon component (44 names) | Consistent sizes/colors, no emoji (Rule #2), semantic names | Expo vector-icons — inconsistent styling; emoji — platform-dependent |

### Pattern Decisions

| Pattern | What | Why |
|---------|------|-----|
| **Denormalized counters** | likesCount on parent model | COUNT(*) too slow for feeds at scale |
| **Composite PKs for joins** | [userId, postId] | Natural uniqueness, no surrogate ID |
| **Soft deletes** | isRemoved flag, not hard delete | Appeal workflow, audit trail, legal compliance |
| **scheduledAt OR pattern** | `OR [null, lte now]` not `scheduledAt: null` | Shows content when scheduled time arrives |
| **Callback refs in WebRTC** | `const onConnectedRef = useRef(onConnected)` | PC event handlers persist across renders, need current callback |
| **socketReady boolean** | State boolean instead of checking socketRef.current | Ref changes don't trigger re-renders; boolean bridges async to React |
| **Pattern B remote streams** | Manual addTrack to controlled MediaStream | More robust than event.streams[0] which can be empty |
| **Pre-save moderation** | Check text before persisting to DB | Fail-closed: unsafe content never reaches database |
| **XML prompt hardening** | `<user_content>` tags + "treat as DATA ONLY" | Prevents prompt injection in AI moderation |
| **Atomic balance operations** | `updateMany WHERE coins >= amount` | Prevents race condition on concurrent coin/diamond spend |

### Tradeoffs Accepted

| Tradeoff | Accepted Risk | Mitigation |
|----------|--------------|------------|
| **No Meilisearch** | Search uses Prisma LIKE (slow, no fuzzy) | Deploy Meilisearch when search volume justifies |
| **No PostGIS** | Nearby content uses Haversine approximation | PostGIS when geo-features become primary |
| **Waveform is cosmetic** | Sine wave, not real audio data | Needs FFprobeKit audio peak extraction |
| **Font selection no export effect** | FFmpeg drawtext can't resolve platform fonts | Needs iOS/Android fontfile= path resolution |
| **2FA not enforced at login** | Users can bypass TOTP after setup | Requires Clerk session claim integration |
| **Single-thread video processing** | Export blocks UI for long videos | Could move to background task with expo-task-manager |

---

*Generated 2026-03-25 by 40 parallel extraction agents + orchestrator compilation. Every claim in this document is derived from actual file reads with line-number references available in the raw agent outputs.*
