# Mizanly Technical Architecture Blueprint

> **Last verified:** 2026-03-25 | **Schema:** 193 models, 82 enums, 4,704 lines | **Backend:** 80 modules, 82 controllers, 86 services | **Mobile:** 213 screens, 84 components, 24 hooks, 36 services | **Tests:** 5,208 across 302 files | **Raw agent data:** `docs/architecture-raw-2026-03-25/` (40 agents, 856 KB)

Single source of truth. Every decision references this document. Mismatches are bugs.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Layer (Prisma Schema)](#2-data-layer)
3. [Backend Layer (NestJS)](#3-backend-layer)
4. [Real-time Layer (Socket.io)](#4-real-time-layer)
5. [Mobile Layer (React Native)](#5-mobile-layer)
6. [End-to-End Flows](#6-end-to-end-flows)
7. [Algorithm & Feed Intelligence](#7-algorithm--feed-intelligence)
8. [Content Safety & Moderation](#8-content-safety--moderation)
9. [Notification System](#9-notification-system)
10. [Islamic Features](#10-islamic-features)
11. [Monetization & Coin Economy](#11-monetization--coin-economy)
12. [Design System & Theme](#12-design-system--theme)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [Testing Architecture](#14-testing-architecture)
15. [Known Bugs & Gaps](#15-known-bugs--gaps)
16. [Decision Log](#16-decision-log)

---

## 1. System Overview

### Architecture Diagram
```
Mobile (React Native Expo SDK 52)
  ├── Clerk Auth (JWT) ──────────────────→ NestJS API (Railway)
  ├── Socket.io /chat ───────────────────→ Chat Gateway (Redis Adapter)
  ├── Direct Upload (XMLHttpRequest) ────→ Cloudflare R2 (presigned PUT)
  └── expo-av HLS playback ─────────────→ Cloudflare Stream CDN

NestJS API
  ├── PostgreSQL 16 (Neon) ← Prisma ORM + pgvector
  ├── Redis (Upstash) ← cache/pubsub/queue/presence/sessions
  ├── Cloudflare R2 ← S3-compatible storage (bucket: mizanly-media)
  ├── Cloudflare Stream ← video transcoding (HLS/DASH)
  ├── Clerk ← auth provider (JWT + webhooks via svix)
  ├── Stripe ← payments (PaymentIntent + webhooks, API v2025-02-24)
  ├── Resend ← transactional email (4 templates)
  ├── Sentry ← error monitoring (10% trace rate)
  ├── Gemini ← text embeddings (text-embedding-004, 768-dim)
  ├── Claude ← content moderation (haiku-4-5) + AI features
  ├── OpenAI ← Whisper transcription
  └── GIPHY ← GIF search + stickers (beta key, 100 searches/hr)
```

### The Five Spaces
| Space | Arabic | Model | Tab Icon | Backend Modules | Mobile Tab |
|-------|--------|-------|----------|----------------|------------|
| **Saf** | الصف | Instagram (feed + stories) | home | posts, stories | saf.tsx (following/foryou) |
| **Bakra** | بكرة | TikTok (short video) | play | reels | bakra.tsx (snap-to-item) |
| **Minbar** | المنبر | YouTube (long video) | video | videos, channels, playlists | minbar.tsx (grid + categories) |
| **Majlis** | المجلس | X/Twitter (threads) | message-circle | threads | majlis.tsx (foryou/following/trending/video) |
| **Risalah** | رسالة | WhatsApp (DMs + groups) | mail | messages, calls | risalah.tsx (Socket.io real-time) |

### Tech Stack
| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Mobile | React Native + Expo | SDK 52, RN 0.76 | |
| Navigation | Expo Router | v3 (file-based) | typedRoutes: true |
| State (server) | React Query | v5 | staleTime 5min, gcTime 10min |
| State (client) | Zustand | v5 | 85 state fields, 14 persisted |
| Animation | Reanimated 3 | v3.16 | + Gesture Handler 2.20 |
| Lists | FlashList | v2 | Saf/Bakra/Minbar/Majlis feeds |
| Backend | NestJS | 10.4 | |
| ORM | Prisma | 6.3 | |
| Database | PostgreSQL + pgvector | 16 | Neon serverless |
| Cache | Redis | 7 | Upstash, ioredis 5.10 |
| Queue | BullMQ | 5.71 | 6 named queues |
| Auth | Clerk | v5, @clerk/backend 1.21 | |
| Payments | Stripe | 20.4.1 | API v2025-02-24 |
| Storage | Cloudflare R2 | S3-compatible | @aws-sdk/client-s3 |
| Video | Cloudflare Stream | HLS/DASH | |
| Video Editor | ffmpeg-kit-react-native | 6.0.2 (full-gpl) | x264, x265, libass, fribidi |
| Email | Resend | v2 | |
| Monitoring | Sentry | 10.42 | |
| i18n | i18next + react-i18next | v25/v16 | 8 languages, 3,970+ keys each |
| GIPHY | @giphy/react-native-sdk | 5.0.2 | Native dialog + REST fallback |

---

## 2. Data Layer

### 2.1 Schema Statistics
- **File:** `apps/api/prisma/schema.prisma` (4,704 lines)
- **Models:** 193 total
- **Enums:** 82 (55 base + 27 prefixed variants)
- **ID strategy:** ~120 models use `@default(cuid())`, ~50 use `@default(uuid())`
- **Extensions:** pgvector (768-dimensional embeddings)
- **Provider:** PostgreSQL via `datasource db` with `DIRECT_DATABASE_URL` for migrations

### 2.2 Core Content Models

| Model | ID | Key Fields | Relations | Indexes | Lines |
|-------|----|-----------|-----------|---------|-------|
| **User** | cuid | clerkId(@unique), username(@unique), email(@unique), previousUsername, role(USER/CREATOR/MODERATOR/ADMIN), isPrivate, isBanned, banExpiresAt, coinBalance, diamondBalance, stripeConnectAccountId, madhab, nasheedMode, isScholarVerified | 89 relations | username, clerkId, createdAt DESC | 661-936 |
| **Post** | cuid | content(VarChar 2000), postType(TEXT/IMAGE/VIDEO/CAROUSEL), visibility(PUBLIC/FOLLOWERS/CIRCLE), mediaUrls[], mediaTypes[], hashtags[], mentions[], commentPermission(EVERYONE/FOLLOWERS/NOBODY), scheduledAt, topics[], altText, brandedContent, brandPartner, remixAllowed, shareToFeed, hideLikesCount, isRemoved, removedById | user, comments, reactions, savedBy, taggedUsers(PostTaggedUser), collabInvites, circle | userId+createdAt, space+createdAt, hashtags, isFeatured+featuredAt | 961-1037 |
| **Reel** | cuid | videoUrl, streamId, hlsUrl, dashUrl, qualities[], caption(VarChar 500), isPhotoCarousel, carouselUrls[], carouselTexts[], isTrial, scheduledAt, commentPermission, brandedContent, topics[], altText, locationName/Lat/Lng, duetOfId, stitchOfId, isDuet, isStitch, status(PROCESSING/READY/FAILED) | user, reactions, comments, interactions(ReelInteraction), taggedUsers(ReelTaggedUser), duets[], stitches[], templates | userId+createdAt, viewsCount DESC, hashtags | 1107-1181 |
| **Thread** | cuid | content(VarChar 500), isChainHead, chainId, chainPosition, replyPermission(EVERYONE/FOLLOWING/MENTIONED/NONE), isQuotePost, quoteText, repostOfId, scheduledAt, hideLikesCount, isPinned | user, reactions, replies(ThreadReply), poll, bookmarks(ThreadBookmark), circle | userId+createdAt, chainId, circleId+createdAt, hashtags | 1248-1296 |
| **Story** | cuid | mediaUrl, mediaType, expiresAt(24h from creation), stickerData(Json), closeFriendsOnly, subscribersOnly, isHighlight, highlightAlbumId, blurhash | user, views(StoryView), stickerResponses(StoryStickerResponse), chainEntries(StoryChainEntry) | userId+createdAt DESC, expiresAt | 1055-1088 |
| **Video** | cuid | title(VarChar 200), description(VarChar 10000), videoUrl, streamId, hlsUrl, dashUrl, qualities[], status(DRAFT/PROCESSING/PUBLISHED/UNLISTED/PRIVATE), category(11 types), chapters(Json), avgWatchDuration, completionRate | channel, user, comments(VideoComment), reactions(VideoReaction), subtitles, watchHistory | channelId+publishedAt DESC, category+viewsCount DESC, tags | 1376-1439 |
| **Channel** | cuid | handle(@unique), name(VarChar 100), description(VarChar 5000), subscribersCount, videosCount, totalViews, isMonetized | user(1:1 per user), videos, playlists, subscribers(Subscription) | handle, subscribersCount DESC | 1348-1374 |

### 2.3 Social Graph Models

| Model | PK | onDelete | Purpose |
|-------|---------|----------|---------|
| **Follow** | [followerId, followingId] | Cascade both | Follow graph; indexes: followingId, createdAt DESC |
| **FollowRequest** | cuid | Cascade | Private account requests; status: PENDING/ACCEPTED/DECLINED |
| **Block** | [blockerId, blockedId] | Cascade both | Bidirectional blocks; index: blockedId |
| **Mute** | [muterId, mutedId] | Cascade both | One-way content hide; index: mutedId |
| **Restrict** | [restricterId, restrictedId] | Cascade both | Limit interaction visibility |

### 2.4 Messaging Models

| Model | PK | Key Fields | Purpose |
|-------|---------|-----------|---------|
| **Conversation** | cuid | isGroup, groupName?, lastMessageAt, disappearingDuration?, slowModeSeconds?, lockCode?(scrypt), newMemberHistoryCount(0-100) | DM or group container |
| **ConversationMember** | [conversationId, userId] | role(owner/admin/member), unreadCount, isMuted, isArchived, isBanned, customTone?, wallpaperUrl?, tag?(VarChar 30) | Per-user state |
| **Message** | cuid | content?(VarChar 5000), messageType(11 types), mediaUrl?, senderId?(SetNull), replyToId?(self-join), isForwarded, forwardedFromId?, editableUntil?, expiresAt?, isViewOnce, viewedAt?, isSpoiler, isSilent, isEncrypted, transcription?, isPinned, isScheduled, scheduledAt? | Individual messages |
| **MessageReaction** | cuid | @@unique([userId, messageId, emoji]) | Emoji reactions |
| **StarredMessage** | cuid | @@unique([userId, messageId]) | Replaces deprecated Message.starredBy[] |
| **ConversationKeyEnvelope** | cuid | @@unique([conversationId, userId, version]) | E2E encryption key exchange |
| **DMNote** | uuid | userId(@unique), content(VarChar 60), expiresAt | Ephemeral status notes |

### 2.5 Engagement Models (All Composite PK)

| Model | PK | Counter Field Updated | Purpose |
|-------|----|----------------------|---------|
| PostReaction | [userId, postId] | Post.likesCount | reaction: LIKE/LOVE/SUPPORT/INSIGHTFUL |
| ReelReaction | [userId, reelId] | Reel.likesCount | Same enum |
| ThreadReaction | [userId, threadId] | Thread.likesCount | Same enum |
| VideoReaction | [userId, videoId] | Video.likesCount | isLike boolean (like/dislike) |
| CommentReaction | [userId, commentId] | Comment.likesCount | Post comments |
| ReelCommentReaction | [userId, commentId] | ReelComment.likesCount | Reel comments |
| ThreadReplyLike | [userId, replyId] | ThreadReply.likesCount | Thread replies |
| VideoCommentLike | cuid, @@unique([userId, commentId]) | VideoComment.likesCount | Video comments (join table) |
| SavedPost | [userId, postId] | Post.savesCount | collectionName field for folders |
| ThreadBookmark | [userId, threadId] | Thread.bookmarksCount | |
| StoryView | [storyId, viewerId] | Story.viewsCount | Idempotent (P2002 caught) |
| ScholarQuestionVote | cuid, @@unique([userId, questionId]) | ScholarQuestion.votes | UPVOTE/DOWNVOTE |
| HalalVerifyVote | (implicit) | HalalRestaurant.verifyVotes | Community verification |
| WaqfDonation | cuid | WaqfFund.raisedAmount | Charitable giving |

### 2.6 Key Enums (82 total)

| Enum | Values | Used By |
|------|--------|---------|
| UserRole | USER, CREATOR, MODERATOR, ADMIN | User.role |
| ContentSpace | SAF, BAKRA, MAJLIS, MINBAR | CreatorStat.space |
| PostType | TEXT, IMAGE, VIDEO, CAROUSEL | Post.postType |
| PostVisibility | PUBLIC, FOLLOWERS, CIRCLE | Post.visibility |
| ReelStatus | PROCESSING, READY, FAILED | Reel.status |
| VideoStatus | DRAFT, PROCESSING, PUBLISHED, UNLISTED, PRIVATE | Video.status |
| VideoCategory | EDUCATION, QURAN, LECTURE, VLOG, NEWS, DOCUMENTARY, ENTERTAINMENT, SPORTS, COOKING, TECH, OTHER | Video.category |
| CommentPermission | EVERYONE, FOLLOWERS, NOBODY | Post/Reel.commentPermission |
| ReplyPermission | EVERYONE, FOLLOWING, MENTIONED, NONE | Thread.replyPermission |
| MessageType | TEXT, IMAGE, VOICE, VIDEO, STICKER, FILE, SYSTEM, GIF, STORY_REPLY, LOCATION, CONTACT | Message.messageType |
| CallType | VOICE, VIDEO | CallSession.callType |
| CallStatus | RINGING, ACTIVE, ENDED, MISSED, DECLINED | CallSession.status |
| NotificationType | LIKE, COMMENT, FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED, MENTION, REPLY, CIRCLE_INVITE, CIRCLE_JOIN, MESSAGE, THREAD_REPLY, REPOST, QUOTE_POST, CHANNEL_POST, LIVE_STARTED, VIDEO_PUBLISHED, REEL_LIKE, REEL_COMMENT, VIDEO_LIKE, VIDEO_COMMENT, STORY_REPLY, POLL_VOTE, SYSTEM | Notification.type |
| ReportReason | HATE_SPEECH, HARASSMENT, VIOLENCE, SPAM, MISINFORMATION, NUDITY, SELF_HARM, TERRORISM, DOXXING, COPYRIGHT, IMPERSONATION, OTHER | Report.reason |
| ModerationAction | WARNING, CONTENT_REMOVED, TEMP_MUTE, TEMP_BAN, PERMANENT_BAN, NONE | ModerationLog.action |
| ReactionType | LIKE, LOVE, SUPPORT, INSIGHTFUL | All reaction models |
| CoinTransactionType | PURCHASE, GIFT_SENT, GIFT_RECEIVED, TIP_SENT, TIP_RECEIVED, REWARD, REFUND, CASHOUT | CoinTransaction.type |
| TagApprovalStatus | PENDING, APPROVED, DECLINED | PostTaggedUser/ReelTaggedUser.status |
| FastingType | RAMADAN, MONDAY, THURSDAY, AYYAM_AL_BID, ARAFAT, ASHURA, QADA, NAFL, OBLIGATORY, SUNNAH, VOLUNTARY, MAKEUP | FastingLog.fastType |
| HifzStatus | NOT_STARTED, IN_PROGRESS, MEMORIZED, NEEDS_REVIEW | HifzProgress.status |
| StreakType | POSTING, ENGAGEMENT, QURAN, DHIKR, LEARNING | UserStreak.streakType |
| AchievementRarity | COMMON, RARE, EPIC, LEGENDARY | Achievement.rarity |
| ScholarQAStatus | QA_SCHEDULED, QA_LIVE, QA_ENDED | ScholarQA.status |
| LiveStatus | SCHEDULED, LIVE, ENDED, CANCELLED | LiveSession.status |
| OrderStatus | PENDING, PAID, SHIPPED, DELIVERED, CANCELLED, REFUNDED | Order.status |
| AdhanStyle | MAKKAH, MISHARY, ABDULBASIT, MAHER, SUDAIS, HUSARY, MINSHAWI | PrayerNotificationSetting.adhanStyle |
| EventPrivacy | EVENT_PUBLIC, EVENT_PRIVATE | Event.privacy |
| MadhhabType | HANAFI, MALIKI, SHAFII, HANBALI, ANY | ScholarVerification.madhab |

### 2.7 Schema Design Patterns

| Pattern | Implementation | Why |
|---------|---------------|-----|
| **Composite PKs** | N:M joins use [fkA, fkB] (Follow, Block, Mute, etc.) | No surrogate ID waste, natural uniqueness |
| **Denormalized counters** | likesCount, followersCount, membersCount on parent | Avoid COUNT(*) on every feed read |
| **Soft deletes** | isRemoved/isDeleted + removedAt/deletedAt + removedById | Preserve for appeals, audit trail, legal compliance |
| **Nullable FKs** | Post.userId?, Message.senderId? with onDelete: SetNull | Content survives user deletion (anonymized) |
| **Parallel arrays** | mediaUrls[] + mediaTypes[] (Post, Thread, Message) | Polymorphic media without join table overhead |
| **JSON storage** | Story.stickerData, Video.chapters, HajjProgress.stages | Flexible client-defined schemas |
| **Self-relations** | Comment.parentId→Comment, Message.replyToId→Message, Thread.repostOfId→Thread | Unlimited nesting/threading depth |
| **Blurhash** | Post.blurhash, Reel.blurhash, Story.blurhash | Progressive image loading placeholder |
| **Timestamp indexes** | createdAt DESC on all content models | Fast feed pagination |
| **Atomic counters** | `$executeRaw` with `GREATEST(field - 1, 0)` | Prevent negative counts on race conditions |

### 2.8 Polymorphic FK (Known Limitation)
- `VideoReply.commentId` + `VideoReply.commentType` (POST or REEL via CommentTargetType enum) — Prisma doesn't support polymorphic relations natively. Must resolve at application layer. **This is the 1 unfixable dangling FK.**

### 2.9 Dual Balance System (CRITICAL WARNING)
- **CoinBalance table** (coins + diamonds) — **USE THIS.** All gift/cashout services use atomic updateMany with gte guard.
- **User.coinBalance field** — **LEGACY, DO NOT READ.** Stale/incorrect. Will be removed post-launch.

---

## 3. Backend Layer

### 3.1 Entry Point (`apps/api/src/main.ts`)

| Config | Value | Purpose |
|--------|-------|---------|
| Global prefix | `/api/v1` | All routes prefixed |
| Port | `process.env.PORT \|\| 3000` | Bind 0.0.0.0 |
| CORS | From `CORS_ORIGINS` env (comma-sep) | Dynamic origin whitelist; methods: GET/POST/PUT/PATCH/DELETE/OPTIONS; credentials: true; max-age: 86400 |
| Body limit | 1MB (JSON + urlencoded) | Prevent memory bombs |
| Helmet | HSTS 1yr + includeSubDomains, no CSP (API-only) | Security headers |
| Compression | Enabled globally | Response compression |
| Swagger | Dev only at `/docs`, Bearer auth scheme | API documentation |
| Validation | whitelist + forbidNonWhitelisted + transform + implicitConversion | Strip unknown, convert query types |
| Sentry | Before app creation, 10% trace rate, scrubs Authorization + cookies | Error monitoring |
| Socket.io | Redis adapter via initRedisAdapter() before listen | Multi-instance horizontal scaling |

### 3.2 Global Middleware Chain (Order Matters)
1. **CorrelationIdMiddleware** — Generate/propagate X-Correlation-ID (UUID); attach to req.id for pino-http
2. **SecurityHeadersMiddleware** — X-Content-Type-Options: nosniff, X-Frame-Options: DENY, X-XSS-Protection: 0, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera=(), microphone=(), geolocation=()
3. **RequestLoggerMiddleware** — Log slow requests (>500ms threshold), track totalRequests/errorCount/slowCount counters
4. **ResponseTimeMiddleware** — X-Response-Time header (process.hrtime.bigint nanosecond precision)

### 3.3 Guard Architecture

| Guard | Scope | Purpose | Key Detail |
|-------|-------|---------|------------|
| **UserThrottlerGuard** | Global (APP_GUARD) | Rate limit 100 req/min | Tracker priority: user:{userId} > ip:{x-forwarded-for} > fingerprint:{md5(headers)} |
| **ClerkAuthGuard** | Per-route | Verify JWT via verifyToken(token, CLERK_SECRET_KEY), check ban/deactivate/delete, auto-unban expired temp bans, attach request.user | Selects: id, clerkId, username, displayName, isBanned, isDeactivated, isDeleted, banExpiresAt |
| **OptionalClerkAuthGuard** | Per-route | Same but never throws; allows unauthenticated; warns on expired tokens | Used for public endpoints returning extra data when authed (isLiked, isFollowing) |

### 3.4 Decorators, Interceptors, Filters

| Component | Type | Purpose |
|-----------|------|---------|
| **@CurrentUser(field?)** | Param decorator | Extract user from request.user; ALWAYS use `@CurrentUser('id')` for userId |
| **TransformInterceptor** | Global interceptor | Wraps all responses: `{ success: true, data: T, timestamp }` or `{ success: true, data: [...], meta: { cursor, hasMore }, timestamp }` |
| **HttpExceptionFilter** | Global filter | Catches all exceptions; 5xx → Sentry capture; error format: `{ success: false, statusCode, error, message, path, timestamp }` |
| **SanitizePipe** | Per-route pipe | Strips HTML tags, null bytes, control chars from request body |
| **ValidationPipe** | Global pipe | class-validator with whitelist + forbidNonWhitelisted + transform |

### 3.5 Response Envelope
```json
// Success
{ "success": true, "data": { ... }, "timestamp": "2026-03-25T12:00:00Z" }

// Paginated
{ "success": true, "data": [...], "meta": { "cursor": "abc123", "hasMore": true }, "timestamp": "..." }

// Error
{ "success": false, "statusCode": 400, "error": "Bad Request", "message": "...", "path": "/api/v1/...", "timestamp": "..." }
```

### 3.6 Module Registry (80 Modules)

**Global Modules (10):** ConfigModule, ThrottlerModule, ScheduleModule, LoggerModule(pino), PrismaModule, RedisModule, AsyncJobsModule, QueueModule, FeatureFlagsModule, AnalyticsModule

**Core Content (12):** posts, reels, stories, threads, videos, channels, playlists, channel-posts, clips, reel-templates, story-chains, video-replies

**Social (8):** follows, blocks, mutes, restricts, bookmarks, circles, collabs, profile-links

**Discovery (7):** feed, search, hashtags, recommendations, embeddings, trending (in feed), explore (in search)

**Messaging (4):** messages, calls, broadcast, audio-rooms

**Islamic (5):** islamic (mega-module: prayer/quran/dhikr/dua/hifz/fasting/hajj/tafsir/daily-briefing), halal, mosques, scholar-qa

**Monetization (5):** monetization, payments, gifts, commerce, promotions

**Safety (5):** moderation (+ content-safety, word-filter), reports, privacy (GDPR), parental-controls

**Creator (4):** creator, thumbnails, og, scheduling

**Gamification (1 mega-module):** gamification (streaks, XP/50 levels, achievements, leaderboard, challenges, series/micro-drama, profile customization)

**Community (5):** events, communities, community-notes, checklists, polls

**Account (7):** auth (+ webhooks), users, settings, two-factor, devices, encryption, alt-profile

**Infrastructure (7):** health, admin, stream, upload, downloads, chat-export, watch-history

**Extensions (5):** webhooks, telegram-features, discord-features, retention, live

### 3.7 Queue Infrastructure (BullMQ)

| Queue | Concurrency | Retries | Backoff | Purpose |
|-------|------------|---------|---------|---------|
| notifications | 5 | 3 | 1s, 10s, 60s (custom) | Push notification delivery via Expo |
| media-processing | 3 | varies | varies | Image EXIF strip, blurhash, video transcode |
| analytics | varies | 2 | 1s exponential | Gamification XP/streaks |
| webhooks | 25 | 5 | 1s, 5s, 30s, 5m, 30m (custom) | External webhook delivery with HMAC-SHA256 |
| search-indexing | varies | 3 | 1s exponential | Meilisearch index updates |
| ai-tasks | varies | 2 | 3s exponential | Content moderation, caption generation |

**Dead Letter Queue:** Redis list `mizanly:dlq` (max 1000 entries, captures exhausted jobs with jobId, queue, name, data, error, failedAt, attempts)

**No-op Fallback:** When REDIS_URL not set, all queues return stub objects; add() returns noop ID; jobs silently dropped.

### 3.8 Core Service Patterns

**Pagination:** Cursor-based keyset (`take: limit + 1`, detect hasMore from length > limit, return cursor as last item's ID; `skip: 1` when cursor provided)

**Counter Updates:** Atomic `$executeRaw` with `GREATEST(field - 1, 0)` to prevent negative counts on concurrent decrements

**Block Filtering:** Bidirectional: `OR: [{blockerId: A, blockedId: B}, {blockerId: B, blockedId: A}]` — checked before ALL social operations (view profile, follow, message, comment, share)

**Scheduled Content:** `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]` on ALL feed queries (50+ queries patched in session 5 across posts, reels, threads, search, hashtags, feed, recommendations, users services)

**Trial Reels:** `isTrial: false` filter on all reel feed queries (only owner sees trial reels via getById)

**Notification Pattern:** Create DB record → async push via QueueService.addPushNotificationJob → async Redis pub/sub `notification:new` for socket delivery

**Hashtag Lifecycle:** Extract from content → upsert Hashtag table (postsCount/reelsCount/threadsCount increment) → decrement on content deletion

**Content Safety:** Pre-save `contentSafety.moderateText()` + async `ai.moderateImage()` on all content creation (posts, reels, stories, threads, videos)

---

## 4. Real-time Layer

### 4.1 Socket.io Configuration
- **Namespace:** `/chat`
- **Ping:** 25s interval, 60s timeout
- **Auth:** Clerk JWT in handshake `auth.token` → same verifyToken + user lookup as HTTP guard
- **Scaling:** Redis adapter (pub/sub for multi-instance via @socket.io/redis-adapter)
- **Connection rate limit:** 10 connections/min per IP (Redis counter with 60s TTL)

### 4.2 Socket Event Catalog (16 Events)

| Event | Direction | Room | Rate Limit | Data Shape | Purpose |
|-------|-----------|------|------------|-----------|---------|
| join_conversation | C→S | conversation:{id} | 20/60s | `{ conversationId }` | Subscribe to conversation room |
| leave_conversation | C→S | conversation:{id} | 20/60s | `{ conversationId }` | Unsubscribe from room |
| send_message | C→S→Room | conversation:{id} | 30/60s | `{ conversationId, content?, messageType?, mediaUrl?, replyToId?, isSpoiler?, isViewOnce? }` | Send message |
| typing | C→S→Room | conversation:{id} | 10/10s | `{ conversationId, isTyping }` | Typing indicator (excludes sender) |
| read | C→S | conversation:{id} | 30/60s | `{ conversationId }` | Mark read (sets lastReadAt, unreadCount=0) |
| message_delivered | C→S→Sender | user:{senderId} | 60/60s | `{ messageId, conversationId }` | Delivery receipt (**privacy: only sender sees**) |
| get_online_status | C→S→C | — | 10/60s | `{ userIds[] }` (max 50) | Check online status |
| call_initiate | C→S→Target | user:{targetId} | 3/60s | `{ targetUserId, callType, sessionId }` | Start call; block check; 64KB max |
| call_answer | C→S→Peer | user:{callerId} | 10/60s | `{ sessionId, callerId }` | Accept call |
| call_reject | C→S→Peer | user:{callerId} | 10/60s | `{ sessionId, callerId }` | Decline call |
| call_end | C→S→All | user:{participantId} | 10/60s | `{ sessionId, participants[] }` | End call |
| call_signal | C→S→Target | user:{targetId} | 60/10s | `{ targetUserId, signal }` | WebRTC SDP/ICE relay; 64KB max; block check |
| join_quran_room | C→S→Room | quran:{roomId} | 10/60s | `{ roomId }` | Join recitation (max 50 participants) |
| leave_quran_room | C→S→Room | quran:{roomId} | 10/60s | `{ roomId }` | Leave; auto-transfer host; cleanup empty |
| quran_verse_sync | C→S→Room | quran:{roomId} | 30/60s | `{ roomId, surahNumber(1-114), verseNumber(1-286) }` | Host syncs verse position |
| quran_reciter_change | C→S→Room | quran:{roomId} | 10/60s | `{ roomId, reciterId }` | Change audio reciter |

**Server-Emitted Events:** new_message, user_typing, messages_read, online_status, new_notification, user_online, user_offline, incoming_call, call_answered, call_rejected, call_ended, call_signal, delivery_receipt, quran_room_update, quran_verse_changed, quran_reciter_updated, host_changed, room_evicted

### 4.3 Room Strategy

| Room | Format | Joined When | Purpose |
|------|--------|-------------|---------|
| User | `user:{userId}` | On connect (automatic) | Direct delivery: calls, notifications |
| Conversation | `conversation:{conversationId}` | On join_conversation event | Chat messages, typing, read receipts |
| Quran | `quran:{roomId}` | On join_quran_room event | Quran recitation sync; max 50; Redis-backed state |

### 4.4 Presence System
- **Storage:** Redis Set `presence:{userId}` containing socket IDs
- **TTL:** 5 minutes (PRESENCE_TTL = 300s)
- **Heartbeat:** Every 2 minutes (HEARTBEAT_INTERVAL = 120000ms) refreshes TTL
- **Online broadcast:** Only to user's conversation rooms (not global — privacy)
- **Offline detection:** When last socket disconnects → delete presence key → update user.lastSeenAt → emit `user_offline` to conversations

### 4.5 Quran Room Multi-Host
- **Redis hash:** `quran:room:{roomId}` → { hostId, currentSurah, currentVerse, reciterId }
- **Participants set:** `quran:room:{roomId}:participants` → Set of socket IDs
- **TTL:** 3600s (1 hour auto-cleanup)
- **Host transfer:** When host leaves/disconnects → first remaining socket becomes new host → emit `host_changed`
- **Empty cleanup:** When last participant leaves → delete Redis hash + set → mark DB audioRoom.status='ended'

---

## 5. Mobile Layer

### 5.1 Navigation Tree
```
App Root (_layout.tsx, 521 lines)
├── Providers: GestureHandler → ErrorBoundary → ClerkProvider → ClerkLoaded → QueryClient → Stack
├── Stack Router
│   ├── (tabs) [5-tab bottom bar, _layout.tsx 202 lines]
│   │   ├── saf (842 lines) — Feed + Stories, following/foryou toggle, CreateHeaderButton
│   │   ├── bakra (~1500 lines) — Vertical snap video, double-tap like, FloatingHearts
│   │   ├── minbar (712 lines) — Video grid, categories, continue-watching, subscriptions
│   │   ├── majlis (537 lines) — Threads, 4-tab feed, trending hashtags, FAB compose
│   │   ├── risalah (618 lines) — Conversations, Socket.io, online/typing indicators
│   │   └── create (16 lines) — Hidden tab (href: null), redirect-only
│   ├── (auth) [Modal] — sign-in, sign-up, forgot-password
│   ├── onboarding [No gesture] — username, profile, interests, suggested
│   └── (screens) [213 detail screens]
│       ├── Create (9): create-post, create-carousel, create-story, create-reel, create-thread, create-video, go-live, voice-post-create, video-editor
│       ├── Detail (6): post/[id], reel/[id], thread/[id], video/[id], story-viewer, sound/[id]
│       ├── Profile (12): profile/[username], edit-profile, followers/[userId], following/[userId], mutual-followers, close-friends, follow-requests, blocked, muted, profile-customization, account-settings, account-switcher
│       ├── Settings (15+): settings(12 sections), content-settings, blocked-keywords, quiet-mode, screen-time, theme-settings, notification-tones, media-settings, privacy, parental-controls, link-child-account, status-privacy, biometric-lock, disappearing-settings
│       ├── Messaging (12): conversation/[id], new-conversation, call/[id], call-history, create-group, archive, pinned-messages, starred-messages, chat-folders, chat-lock, dm-note-editor, chat-export
│       ├── Islamic (16): prayer-times, qibla-compass, quran-room, quran-reading-plan, quran-share, hadith, dhikr-challenges, dhikr-challenge-detail, dhikr-counter, dua-collection, names-of-allah, zakat-calculator, ramadan-mode, islamic-calendar, fasting-tracker, mosque-finder
│       ├── Discovery (5): search(997 lines), discover(779), hashtag-explore, trending-audio, hashtag/[tag]
│       ├── Monetization (7): gift-shop, cashout, donate, waqf, orders, marketplace, send-tip
│       ├── Gamification (5): achievements, streaks, leaderboard, challenges, xp-history
│       └── 100+ other screens (see raw agent output for complete list)
├── Overlays: OfflineBanner, IslamicThemeBanner, BiometricLockOverlay, EidCelebrationOverlay, ForceUpdateModal, MiniPlayer, TTSMiniPlayer, ToastContainer
└── Handlers: AuthGuard, DeepLinkHandler, ShareIntentHandler, AppStateHandler
```

### 5.2 Deep Linking
- **Custom scheme:** `mizanly://`
- **Universal links (iOS):** `applinks:mizanly.com`, `applinks:mizanly.app`
- **Android intent filters:** Auto-verify HTTPS for `/post`, `/reel`, `/profile`, `/thread` on mizanly.com + mizanly.app
- **15 deep link types:** post, profile, conversation, thread, reel, video, audio-room, live, hashtag, event, prayer-times, notifications, settings, search

### 5.3 Tab Bar
- **5 visible tabs:** saf(home), bakra(play), minbar(video), majlis(message-circle), risalah(mail)
- **Hidden create tab:** href: null (deep-link safety redirect)
- **Create button:** Emerald gradient "+" in saf header → opens CreateSheet (2x2 grid + 3 secondary rows)
- **Badges:** unreadNotifications on saf, unreadMessages on risalah (from Zustand)
- **Platform:** BlurView intensity 80 (iOS) or rgba(13,17,23,0.92) (Android)
- **Icon animation:** Scale 1.1 + emerald color when active (spring snappy)

### 5.4 Zustand Store (85 State Fields, 62 Actions)

**Persisted (14 fields via AsyncStorage):** theme, safFeedType, majlisFeedType, followedHashtags, recentStickerPackIds, searchHistory, mutedChannelIds, nasheedMode, biometricLockEnabled, screenTimeLimitMinutes, autoPlaySetting, ambientModeEnabled, islamicThemeEnabled, feedDismissedIds

**Key State Groups:**
```typescript
// Auth
user: User | null; isAuthenticated: boolean

// Feed
safFeedType: 'following' | 'foryou'
majlisFeedType: 'foryou' | 'following' | 'trending' | 'video'

// Badges
unreadNotifications: number; unreadMessages: number

// Scroll persistence
safScrollOffset: number; majlisScrollOffset: number; bakraScrollOffset: number

// Mini player
miniPlayerVideo: { id, title, channelName, thumbnailUri?, videoUrl } | null
miniPlayerPlaying: boolean; miniPlayerProgress: number

// TTS
ttsText: string | null; ttsTitle: string | null; ttsPlaying: boolean; ttsSpeed: number

// Parental controls
isChildAccount: boolean; parentalRestrictions: ParentalRestrictions | null

// Islamic
islamicThemeEnabled: boolean

// Accessibility
reducedMotion: boolean; highContrast: boolean

// Toasts (max 2 visible)
toasts: Array<{ id, message, variant, duration?, action? }>
```

**44 granular selector hooks** exported (useUser, useTheme, useUnreadNotifications, etc.)

### 5.5 All 24 Hooks

| Hook | Uses | Purpose | Key Pattern |
|------|------|---------|-------------|
| **useThemeColors** | 803 | Theme-aware colors | Returns tc.bg, tc.text.primary, tc.emerald, etc.; listens to Appearance changes |
| **useTranslation** | 605 | i18n | Returns { t, language, changeLanguage, isRTL }; 8 languages |
| **useContextualHaptic** | 367 | 10 semantic haptics | like, follow, save, navigate, tick, delete, error, longPress, send, success |
| **useAnimatedPress** | 31 | Button press animation | Scale 1→0.92 via spring; returns { onPressIn, onPressOut, animatedStyle } |
| **useReducedMotion** | 14 | Accessibility | Combines system AccessibilityInfo + Zustand app preference |
| **useScrollLinkedHeader** | 10 | Elastic header collapse | Returns { onScroll, headerAnimatedStyle, titleAnimatedStyle, blurIntensity, scrollY } |
| **useTTS** | 8 | Text-to-speech | speak/pause/restart/stop/cycleSpeed; Quran detection (2+ pattern match); language auto-detect |
| **useAnimatedIcon** | 7 | Icon animations | bounce, shake, pulse, spin; returns { animatedStyle, trigger } |
| **useResponsive** | 5 | Breakpoints | isDesktop(>=1024), isTablet(768-1023), isMobile(<768) |
| **useWebRTC** | 2 | WebRTC call lifecycle | socketReady gate, callback refs, Pattern B streams, ICE queue(max 200), mountedRef guard |
| **useIslamicTheme** | 3 | Ramadan/Eid theming | Recalculates every 60s; returns IslamicThemeOverride or null |
| **useNetworkStatus** | 3 | Offline detection | NetInfo → setIsOffline in Zustand |
| **usePiP** | 3 | Picture-in-picture | Auto-PiP on background; returns { enterPiP, exitPiP, isPiPActive } |
| **useVideoPreloader** | 2 | Reel feed perf | 3 slots (prev/current/next), preloads 256KB, AbortController, LRU max 20 |
| **useAmbientColor** | 2 | Video gradient BG | Extracts dominant color from thumbnail; hash-based fallback; LRU cache 50 |
| **useChatLock** | 2 | Biometric auth | expo-local-authentication; SecureStore for locked chat IDs |
| **usePushNotifications** | 2 | FCM registration | Register token, badge reset on foreground, 6 Android channels |
| **usePushNotificationHandler** | 1 | Notification routing | 15+ notification types → route to correct screen |
| **useWebKeyboardShortcuts** | 2 | Desktop UX | Ctrl+K→search, Ctrl+N→create, Esc→back (web only) |
| **useStaggeredEntrance** | 0 | List animations | Built but not integrated; FadeIn + translateY with 40ms stagger |
| **useScrollDirection** | 0 | Hide-on-scroll | Built but not integrated; 5px hysteresis threshold |
| **useEntranceAnimation** | 0 | Screen entrance | Built but not integrated |
| **useIsWeb** | 0 | Platform check | Platform.OS === 'web'; constant export IS_WEB |
| **useHaptic** | 0 | **DEPRECATED** | Use useContextualHaptic instead (Rule 17) |

### 5.6 Key Components (84 total)

| Component | Props Summary | Key Detail |
|-----------|--------------|------------|
| **Avatar** | uri, name, size(xs-3xl), showOnline, showStoryRing, storyViewed | Rotating gradient ring for unseen stories; pulsing online dot; scale press |
| **BottomSheet** | visible, onClose, snapPoint?, scrollable? | BlurView(iOS)/overlay(Android); pan gesture drag-to-close; rubberband above top; handle breathing pulse (3x); accessibilityViewIsModal; A11y announcement |
| **Icon** | name(80+ valid), size(xs-xl\|number), color, strokeWidth, fill | Lucide icons; RTL mirror for arrows/chevrons; memo'd |
| **ProgressiveImage** | uri, width, height, borderRadius | Blurhash placeholder via expo-image; **Rule 19: ALWAYS use instead of raw Image** |
| **BrandedRefreshControl** | refreshing, onRefresh | Emerald tint(iOS), emerald+gold alternating(Android) |
| **EmptyState** | icon, title, subtitle, actionLabel | Staggered FadeInUp entrance; CTA pulse animation; respects reducedMotion |
| **AnimatedAccordion** | icon, title, subtitle, children, isActive | Spring height animation; chevron rotation; header scale press |
| **RichCaptionInput** | value, onChangeText, onTriggerAutocomplete | Transparent TextInput + colored overlay; #hashtag→emerald, @mention→blue, URL→gold; Arabic Unicode support |
| **ImageCarousel** | images[], texts?, showIndicators | Max 5 dots (sliding window); prefetch adjacent; count badge with layers icon |
| **CreateSheet** | visible, onClose | 4 primary cards (post/story/reel/thread) + 4 secondary rows (carousel/video/live/voice); spring entrance |
| **DrawingCanvas** | visible, onSave, canvasWidth/Height | 5 tools: pen/marker/highlighter/neon/eraser(SVG mask); 12 colors + hex input; 4 sizes |
| **UploadProgressBar** | progress, visible, label, onCancel | Spring-animated emerald→gold gradient; XMLHttpRequest with abort; real-time percent |
| **GradientButton** | label, onPress, variant(primary/secondary/ghost), size, loading | Press scale 0.94; loading glow pulse; emerald gradient primary |
| **CharCountRing** | current, max, size | SVG circle; color interpolation emerald→gold(0.7)→error(0.9); scale pulse at 100% |
| **Skeleton** | PostCard, ThreadCard, Circle, Rect | Shimmer animation |
| **RichText** | content | Parses #hashtag and @mention for navigation |

### 5.7 Mobile API Services (36 files, 500+ endpoints)

| Service | Endpoints | Key Methods |
|---------|-----------|-------------|
| **api.ts** (main) | Base config | ApiClient with auto-retry 401 (force refresh) + 429 (Retry-After), 30s timeout |
| **postsApi** | 29 | getFeed, create, getById, react/unreact, save/unsave, share, getComments, addComment, editComment, deleteComment, likeComment, pinComment, hideComment, archive, crossPost, shareAsStory |
| **reelsApi** | 24 | getFeed, getTrending, create, like/unlike, comment, share, bookmark, view, getUserReels, getDuets, getStitches, archive, publishTrial |
| **threadsApi** | 24 | getFeed, getTrending, create, like/unlike, repost/unrepost, bookmark, getReplies, addReply, deleteReply, likeReply, votePoll, setReplyPermission, canReply |
| **videosApi** | 29 | getFeed, create, like/dislike, comment, bookmark, view, updateProgress, getRecommended, createPremiere, setEndScreens |
| **storiesApi** | 19 | getFeed, create, markViewed, getViewers, replyToStory, getHighlights, createHighlight, submitStickerResponse |
| **messagesApi** | 42 | getConversations, sendMessage, deleteMessage, editMessage, reactToMessage, markRead, createDM, createGroup, forwardMessage, starMessage, pinMessage, sendViewOnce, promoteMember, banMember, setLockCode, scheduleMessage |
| **channelsApi** | 13 | create, subscribe, getVideos, setTrailer |
| **followsApi** | 9 | follow, unfollow, getFollowers, getFollowing, acceptRequest, declineRequest |
| **islamicApi** | 50+ | getPrayerTimes, listSurahs, getVerse, searchQuran, getMosques, calculateZakat, getRamadanInfo, saveDhikrSession, createDhikrChallenge, getHajjGuide |
| **giftsApi** | 7 | getBalance, purchaseCoins, sendGift, getCatalog, getHistory, cashout |
| **monetizationApi** | 12 | sendTip, createTier, subscribe, getSubscribers, getWalletBalance, requestCashout |
| **paymentsApi** | 5 | createPaymentIntent, createSubscription, cancelSubscription, getPaymentMethods |
| **uploadApi** | 1 | getPresignUrl(contentType, folder) → { uploadUrl, publicUrl, key, expiresIn } |

### 5.8 Type System (1,040 lines across 10 files)

**Core types/index.ts:** User, Post, Reel, Thread, Story, Video, Channel, Comment, Notification, Message, Conversation, SearchResults + 40 more interfaces

**Specialized type files:** communities.ts, monetization.ts, payments.ts, islamic.ts, events.ts, audioRooms.ts, encryption.ts, twoFactor.ts, reelTemplates.ts

**Key type mapping to Prisma:**
- Post.commentPermission → `'EVERYONE' | 'FOLLOWERS' | 'NOBODY'` (mobile uses string, backend uses enum)
- Thread.replyPermission → `'everyone' | 'following' | 'mentioned' | 'none'` (lowercase on mobile!)
- Reel.status → `'PROCESSING' | 'READY' | 'FAILED'`

### 5.9 Video Editor (2,607 lines + 680 engine)

**10 tool tabs:** trim, speed, filters, adjust, text, music, volume, voiceover, effects + quick actions bar

**35 edit state fields** in undo/redo (20-deep stack via captureSnapshot/applySnapshot):
startTime, endTime, speed, speedCurve, filter, captionText, originalVolume, musicVolume, isReversed, voiceEffect, stabilize, noiseReduce, freezeFrameAt, textStartTime, textEndTime, aspectRatio, brightness, contrast, saturation, temperature, fadeIn, fadeOut, rotation, sharpen, vignetteOn, grain, audioPitch, flipH, flipV, glitch, letterbox, boomerang, textSize, textBg, textShadow

**13 filters:** original, warm, cool, bw, vintage, vivid, dramatic, fade, emerald, golden, night, soft, cinematic
**6 voice effects:** robot, echo, deep, chipmunk, telephone (+ none)
**5 speed curves:** montage(2x edges/0.5x mid), hero(normal bookends/2.5x mid), bullet(3x slow 40-60%), flashIn(3.3x→1x), flashOut(1x→3.3x)
**Export:** 720p(CRF 28)/1080p(CRF 23)/4K(CRF 18) via ffmpeg-kit; fallback uploads original with 35-field metadata header

---

## 6. End-to-End Flows

### 6.1 Authentication Flow
```
1. Mobile: User signs up/in via Clerk UI (email/password or social OAuth)
2. Clerk: Issues JWT with { sub: clerkId }; stores in SecureStore(native)/localStorage(web)
3. Clerk: Webhook (user.created) → POST /webhooks/clerk → svix signature verify → syncClerkUser()
   → CREATE User in DB (random username: user_<hex>) + UserSettings
4. Mobile: AuthGuard registers token getter: api.setTokenGetter(() => getToken())
   + force refresh getter: api.setForceRefreshTokenGetter(() => getToken({ skipCache: true }))
   + session expired handler: router.replace('/(auth)/sign-in')
5. Mobile: Every API call: Authorization: Bearer <jwt>
6. Backend: ClerkAuthGuard → verifyToken(token, CLERK_SECRET_KEY) → extract clerkId
   → User.findUnique({ clerkId }) → check isBanned/isDeactivated/isDeleted → auto-unban expired → request.user = user
7. Backend: @CurrentUser('id') extracts userId for service methods
8. Socket: Same JWT in auth.token handshake → same verification → presence tracking → room join
9. On 401: Mobile retries with fresh token → if fails → session expired → sign-in redirect
```

**Device Fingerprinting:** Max 5 accounts per physical device (Redis counter, no TTL = permanent)
**Registration Rate Limit:** 5 attempts per 15 min per clerkId
**Age Verification:** COPPA (13+) enforced; minors marked isChildAccount

### 6.2 File Upload Pipeline
```
1. Mobile: ImagePicker → imageResize.ts (GIF as-is, PNG stays PNG, small JPEG skipped, others → JPEG 82%)
2. Mobile: POST /upload/presign { contentType, folder } → backend validates type+folder+size
3. Backend: S3 PutObjectCommand (CacheControl: 'public, max-age=31536000, immutable') → getSignedUrl (5min)
4. Response: { uploadUrl, key: '{folder}/{userId}/{uuid}.{ext}', publicUrl, maxFileSize, variants? }
5. Mobile: XMLHttpRequest PUT to presigned URL with progress (UploadProgressBar component)
6. Mobile: Uses publicUrl in create API call
7. Backend (video): StreamService.uploadFromUrl(r2Url) → POST /stream/copy (SSRF protection: whitelist R2 domain, block internal IPs)
8. Cloudflare Stream: Transcodes → webhook (HMAC-SHA256 + 5min replay protection) → update hlsUrl/dashUrl/qualities
```

**Folder/Size Matrix:**
| Folder | Max | Types | Variants? | Stream? |
|--------|-----|-------|-----------|---------|
| avatars | 5 MB | image/* | Yes | No |
| covers | 10 MB | image/* | Yes | No |
| posts | 50 MB | image/* + video/* | Yes | No |
| stories | 50 MB | image/* + video/* | Yes | No |
| messages | 50 MB | all | Yes | No |
| reels | 100 MB | video/* | Yes | **YES** |
| videos | 100 MB | video/* | Yes | **YES** |
| thumbnails | 5 MB | image/* | Yes | No |

### 6.3 Payment Flows

**Tips:** POST /monetization/tips → validate $0.50-$10K → Stripe PaymentIntent (metadata: senderId, receiverId, type:'tip') → pending Tip record (10% platformFee) → webhook payment_intent.succeeded → Tip.status='completed'

**Gifts (Coin Economy):**
1. Purchase coins: POST /gifts/purchase → pending CoinTransaction (coins NOT credited until webhook — **GAP: webhook handler not implemented**)
2. Send gift: POST /gifts/send → validate GIFT_CATALOG (rose:1, heart:5, star:10, crescent:50, mosque:100, diamond:500, crown:1000, galaxy:5000) → atomic coinBalance decrement (updateMany WHERE coins >= cost) → receiver diamonds = floor(coins * 0.7) → 2 CoinTransactions (GIFT_SENT + GIFT_RECEIVED)

**Cashout:** POST /gifts/cashout → validate >=100 diamonds → atomic diamond decrement → USD = floor(diamonds / (100/70)) / 100 → CoinTransaction(CASHOUT)

**Orders:** POST /commerce/products/{id}/order → validate stock → Stripe PaymentIntent → atomic stock decrement (updateMany WHERE stock >= qty) → Order record

**Subscriptions:** POST /monetization/subscribe/{tierId} → validate tier active + not self → Stripe Subscription (monthly recurring) → MembershipSubscription(pending) → invoice.paid webhook → status='active'

**Stripe Webhook Events (8 handled):**
| Event | Action |
|-------|--------|
| payment_intent.succeeded | Tip→completed |
| payment_intent.payment_failed | Tip→failed |
| invoice.paid | Subscription→active, update endDate |
| invoice.payment_failed | Subscription→past_due |
| customer.subscription.updated | Sync status |
| customer.subscription.deleted | Subscription→cancelled, cleanup Redis |
| charge.dispute.created | Tip→disputed |
| payment_method.attached | Log only |

**Webhook safety:** Raw body for signature, idempotency via Redis key `stripe_webhook:{eventId}` (7-day TTL)

### 6.4 WebRTC Call Flow
```
1. Caller: REST POST /calls → create CallSession(RINGING) + 2 CallParticipants
2. Caller: Socket call_initiate → server relays incoming_call to callee's user:{id} room
3. Callee: Shows ringing UI (pulsing avatar) → taps Answer
4. Callee: REST POST /calls/{id}/answer → CallSession.status=ACTIVE, startedAt=now
5. Callee: Socket call_answer → server relays call_answered to caller
6. Both: useWebRTC.start() → getUserMedia(audio:true, video:{facingMode:'user', 640x480}) → RTCPeerConnection({iceServers})
7. Initiator: createOffer({offerToReceiveAudio:true, offerToReceiveVideo}) → setLocalDescription → socket call_signal(offer)
8. Server: Relays call_signal to target (64KB max, block check, 60/10s rate limit)
9. Callee: setRemoteDescription(offer) → drain ICE queue → createAnswer → setLocalDescription → socket call_signal(answer)
10. Initiator: setRemoteDescription(answer) → drain ICE queue
11. Both: ICE trickle via call_signal(ice-candidate) → addIceCandidate (queue max 200 if no remote desc)
12. Both: pc.ontrack → remote MediaStream (Pattern B: manual addTrack) → setRemoteStream → render
13. pc.onconnectionstatechange → 'connected' → onConnectedRef.current() → UI updates
14. Hangup: null event handlers → pc.close() → stream.release() → REST POST /calls/{id}/end → socket call_end
```

**ICE Servers:** 3 STUN (Google x2, Cloudflare) + optional TURN (metered.ca via TURN_SERVER_URL/USERNAME/CREDENTIAL)

---

## 7. Algorithm & Feed Intelligence

### 7.1 Three-Stage Ranking Pipeline (personalized-feed.service.ts)

**Stage 1: Candidate Generation (pgvector KNN)**
- Fetch last 50 interactions where liked=true OR saved=true OR viewDurationMs >= 5000
- k-means clustering: k = min(3, ceil(count/5)), max 10 iterations, convergence < 0.001 cosine distance
- If < 5 vectors: single averaged centroid; else 2-3 centroids
- Query: findSimilarByMultipleVectors(centroids, 500 candidates, [contentType], excludeViewed)
- Vector model: Gemini `text-embedding-004` (768 dimensions)
- Index: HNSW recommended for >100K embeddings (currently sequential scan)

**Stage 2: Weighted Scoring**
| Factor | Weight | Formula | Source |
|--------|--------|---------|--------|
| Similarity | 0.35 | Cosine distance from pgvector (0-1) | Embedding similarity |
| Engagement | 0.25 | `min((likes + comments*2 + shares*3) / max(views,1) * 10, 1)` | Content metrics |
| Recency | 0.15 | `max(0, 1 - ageHours / 168)` (7-day decay) | createdAt |
| Islamic Boost | 0.15 | Location-aware prayer times, Friday, Ramadan (0.1-0.5 capped) | 29 hashtags + calendar |
| Session Boost | 0.10 | In-session category likes * 0.05 (capped 0.3) | Redis session hash |

**Stage 3: Diversity Reranking**
1. Author deduplication: no same author back-to-back (deferred items appended)
2. Hashtag cluster diversity: 6-item window, defer if 2+ overlapping tags
3. Backfill from deferred items to fill remaining slots

### 7.2 Islamic Content Boost (getIslamicBoost)
- **Base:** 10% for 29 Islamic hashtags (quran, hadith, sunnah, islam, muslim, dua, salah, ramadan, jummah, eid, hajj, umrah, zakat, sadaqah, dawah, seerah, tafsir, fiqh, aqeedah, dhikr, tawbah, hijab, halal, masjid, islamic, alhamdulillah, subhanallah, mashallah, bismillah)
- **Friday (Jummah):** +15% all day, +10% extra during 11:00-14:00
- **Prayer windows:** +10% within ±30min of calculated prayer time (uses calculatePrayerTimes(date, lat, lng) if coordinates provided, else hardcoded windows)
- **Ramadan:** +20% (hardcoded dates 2026-2031; approximated via ~10.87-day lunar shift beyond)
- **Cap:** 50% maximum total boost

### 7.3 Trending Algorithm
```
engagementScore = log10(max(engagementCount, 1) + 1) / 5
decayFactor = ageHours <= 12 ? 1.0 : max(0.5, 1.0 - (ageHours - 12) / 24)
trendingScore = engagementScore * decayFactor
```
- **Window:** 24 hours
- **Effect:** First 12h full score; 12-36h linear decay to 50%; content from Trending endpoint uses 7-day window

### 7.4 Exploration Slots (recommendations.service.ts)
- 15% of feed: `explorationCount = ceil(limit * 0.15)`
- Criteria: Created < 6 hours, < 100 views, public, not removed
- Interleaved every ~7th position in main results
- Deduplicated against main results

### 7.5 Cold Start (<10 interactions)
- 70% trending content (24h, engagement decay) + 30% Islamic editorial picks (verified users, sorted by engagement)
- Partial Fisher-Yates shuffle: swap ~30% of items to blend

### 7.6 Session Adaptation
- Redis hash `session:{userId}` with 30-min TTL
- Tracked: viewedIds (max 1000), likedCategories (hashtag→count), scrollDepth, sessionStart
- Boost: +5% per in-session like of same hashtag (capped 30%)
- Tracked via POST /feed/session-signal { action: view|like|save|share|skip, hashtags[], contentId }

### 7.7 Feed Scoring Variants

| Feed | Module | Scoring | Window | Cache |
|------|--------|---------|--------|-------|
| Saf For-You | posts.service | (likes*3 + comments*5 + shares*7 + saves*2 + views*0.1) / ageHours^1.5 | 72h | Redis 30s |
| Saf Following | posts.service | Chronological (keyset cursor) | All time | None |
| Bakra | reels.service | (likes*2 + comments*4 + shares*6 + views*0.1) / ageHours^1.2 | 72h | Redis 30s |
| Majlis For-You | threads.service | (likes*3 + replies*5 + reposts*4) / ageHours^1.5 | 72h | None |
| Majlis Trending | threads.service | (likes + replyDepth*3 + reposts*2 + quotes*2.5) / ageHours | 7d | None |
| Personalized | personalized-feed.service | 5-factor weighted (see 7.1) | 7d decay | None |
| Trending | feed.service | log10 engagement / time decay (12h flat, then linear) | 24h | None |

---

## 8. Content Safety & Moderation

### 8.1 Pre-Save Pipeline (Inline, Blocking)
```
Content creation (POST /posts, /threads, /reels, etc.)
  → ContentSafetyService.moderateText(text)
    ├── Claude API (haiku-4-5-20251001) with XML hardening: <user_content> tags + "treat as DATA ONLY"
    ├── System: "Flag hate speech, Islamophobia, sectarian attacks, profanity, harassment"
    ├── Fail-closed: returns { safe: false } on ANY error
    └── If !safe → throw BadRequestException (content NOT saved)
  → AiService.moderateImage(imageUrl) [async, per image]
    ├── SSRF prevention: whitelist R2/Stream domains, block internal IPs
    ├── Claude Vision API call
    ├── Returns: SAFE | WARNING | BLOCK
    ├── BLOCK → auto-remove content + create ModerationLog(moderatorId='system')
    └── WARNING → set isSensitive=true (blur on feed)
```

### 8.2 Word Filter (Synchronous)
**File:** `moderation/word-filter.ts` — 11 regex patterns across 6 categories:
- **hate_speech:** Slurs (HIGH) + theological extremism (kafir, murtad, takfir — MEDIUM)
- **spam:** Repeated chars 10+ (LOW) + common phrases "buy followers" (MEDIUM)
- **nsfw_text:** porn, hentai, xxx, nude, sexting (HIGH) + profanity (MEDIUM)
- **harassment:** "kill yourself", death threats (HIGH)
- **self_harm:** suicide, cutting, "want to die" (HIGH)
- **terrorism:** "jihad against", caliphate, martyrdom op (HIGH)

### 8.3 Reporting & Queue
- **User reports:** POST /reports with reason (12 ReportReason values) + description (max 1000)
- **Urgent auto-hide:** NUDITY, VIOLENCE, TERRORISM reports → auto-remove content (fail-closed)
- **Queue:** QueueService.addModerationJob() for async AI review
- **Admin queue:** GET /moderation/queue (paginated PENDING reports)

### 8.4 Admin Actions
- DISMISS → status: DISMISSED
- WARNING → notification to user, warningsCount++
- CONTENT_REMOVED → isRemoved=true
- TEMP_BAN → isBanned=true, banExpiresAt (72h default)
- PERMANENT_BAN → isBanned=true + Clerk session revocation

### 8.5 Appeals
- POST /moderation/appeal { moderationLogId, reason, details(max 2000) }
- Admin resolves: if accepted + CONTENT_REMOVED → restore (isRemoved=false); if BAN → unban
- ModerationLog tracks: isAppealed, appealText, appealResolved, appealResult

---

## 9. Notification System

### 9.1 Delivery Channels (4)
1. **Database:** Notification table (persistent, read/unread tracking)
2. **Push:** Expo Push API (batch max 100, via notifications queue, 17 builder templates)
3. **Socket:** Redis pub/sub `notification:new` → gateway emits `new_notification` to user:{userId}
4. **Email:** Resend (4 templates: welcome, security alert, weekly digest, creator summary)

### 9.2 Notification Triggers (13 modules)
Posts (MENTION, COMMENT, REPLY, LIKE, REPOST, QUOTE_POST), Follows (FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED), Reels (REEL_LIKE, REEL_COMMENT, MENTION), Threads (MENTION, THREAD_REPLY), Videos (VIDEO_LIKE, VIDEO_COMMENT, VIDEO_PUBLISHED), Circles (CIRCLE_INVITE, CIRCLE_JOIN), Commerce (SYSTEM), Events (SYSTEM), Gamification (SYSTEM), Channels (FOLLOW)

### 9.3 Per-Type Preferences (UserSettings)
| Setting | Controls |
|---------|----------|
| notifyLikes | LIKE, REEL_LIKE, VIDEO_LIKE |
| notifyComments | COMMENT, REEL_COMMENT, VIDEO_COMMENT, REPLY, THREAD_REPLY |
| notifyFollows | FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED |
| notifyMentions | MENTION |
| notifyMessages | MESSAGE, STORY_REPLY |
| notifyLiveStreams | LIVE_STARTED |
| User.notificationsOn | Global master toggle |

### 9.4 Deduplication & Cleanup
- Redis key `notif_dedup:{userId}:{type}:{targetId}` with 5-min TTL
- No self-notifications (userId === actorId → skip)
- Block/mute check before creation (bidirectional block OR mute → skip)
- Cron: Daily 3 AM UTC — delete read notifications > 90 days old

### 9.5 Push Templates (i18n: en, ar, tr)
17 builder methods: buildLikeNotification, buildCommentNotification, buildFollowNotification, buildMessageNotification, buildMentionNotification, buildRepostNotification, buildReelLikeNotification, buildVideoPublishedNotification, buildLiveStartedNotification, buildPrayerNotification, buildTipNotification, buildEventNotification, etc.

### 9.6 Islamic-Aware DND
- PrayerNotificationSetting.dndDuringPrayer → queue notifications during ±15min prayer window
- Redis `prayer_queue:{userId}` with 1h TTL
- Jummah reminder for nearest mosque

---

## 10. Islamic Features

### 10.1 Module Scope (101 API endpoints across 5 modules)

**Main islamic module (62 endpoints):** prayer-times, prayer-methods, hadith (daily+browse), mosques (nearby), zakat calculator, ramadan info, prayer-notification-settings, quran-plans (CRUD), quran text (chapters/verses/juz/search/random), charity campaigns, hajj guide+progress, tafsir, scholar-verification, content-filter, dhikr (sessions/stats/leaderboard/challenges), fasting (log/stats), duas (browse/daily/categories/bookmark), names-of-allah (all/daily/by-number), hifz (progress/stats/review-schedule), daily-briefing, daily-tasks

**halal module (6 endpoints):** restaurants nearby, reviews, community verification
**mosques module (9 endpoints):** community CRUD, membership, feed, posts
**scholar-qa module (9 endpoints):** schedule/start/end Q&A, submit/vote questions
**islamic-notifications service:** Prayer DND, queue-for-after-prayer, Jummah reminder

### 10.2 Prayer Calculation Algorithm
- **Primary:** Aladhan API (free, no auth) with Redis 24h cache
- **Fallback:** Local solar angle calculation (Jean Meeus formula)
- **Methods:** MWL, ISNA, Egypt, Makkah, Karachi (5 supported)
- **Asr factor:** 1 = Shafi'i (standard), 2 = Hanafi
- **Imsak:** 10 min before Fajr

### 10.3 Hijri Calendar
- Gregorian → Hijri via Kuwaiti algorithm
- 9 predefined Islamic events (Eid al-Fitr, Eid al-Adha, Ramadan start, etc.)
- Ramadan dates hardcoded 2026-2031; approximated via ~10.87-day lunar shift beyond

### 10.4 Zakat Calculator
```
nisab = max(85 * goldPricePerGram, 595 * silverPricePerGram)
totalAssets = cash + (goldGrams * goldPrice) + (silverGrams * silverPrice) + investments
zakatDue = totalAssets >= nisab ? (totalAssets - nisab - debts) * 0.025 : 0
```
Gold/silver prices from env: GOLD_PRICE_PER_GRAM, SILVER_PRICE_PER_GRAM

### 10.5 Static Data Files
- **asma-ul-husna.json:** 99 Names of Allah (number, arabicName, transliteration, englishMeaning, explanation)
- **duas.json:** 120+ entries across 15+ categories, 8 language translations
- **hadiths.json:** 40 hadiths (Nawawi collection), Arabic + English, source + narrator
- **hajj-guide.json:** 7 steps with duas and checklists
- **quran-metadata.ts:** 114 surahs with ayahCount, revelationType, juzStart

---

## 11. Monetization & Coin Economy

### 11.1 Constants (Source of Truth)
```
DIAMOND_TO_USD = 0.007           // 1 diamond = $0.007 USD
DIAMONDS_PER_USD_CENT = 100/70   // ≈1.4286
DIAMOND_RATE = 0.7               // Creator gets 70% of gift coin value as diamonds
MIN_CASHOUT_DIAMONDS = 100       // Minimum $0.70
PLATFORM_FEE_RATE = 0.10         // 10% on tips
MIN_TIP_AMOUNT = 0.50            // Stripe minimum
MAX_TIP_AMOUNT = 10000
```

### 11.2 Gift Catalog (8 items)
| Gift | Coins | Diamonds Earned | Animation |
|------|-------|----------------|-----------|
| Rose | 1 | 0 | float |
| Heart | 5 | 3 | pulse |
| Star | 10 | 7 | spin |
| Crescent | 50 | 35 | glow |
| Mosque | 100 | 70 | rise |
| Diamond | 500 | 350 | sparkle |
| Crown | 1000 | 700 | drop |
| Galaxy | 5000 | 3500 | explode |

### 11.3 Membership Tiers
- Levels: bronze, silver, gold, platinum
- Price: $0.50-$10,000/month
- Benefits: string[] (custom per creator)
- Subscription: Stripe recurring, invoice.paid webhook → active
- One subscription per tier per user (@@unique([tierId, userId]))

### 11.4 Wallet Endpoints
- GET /monetization/wallet/balance → { diamonds, usdEquivalent, diamondToUsdRate: 0.007 }
- GET /monetization/wallet/payment-methods → Stripe Connect accounts (placeholder implementation)
- POST /monetization/wallet/cashout → atomic diamond decrement → CoinTransaction(CASHOUT)
- GET /monetization/wallet/payouts → cursor-paginated payout history

---

## 12. Design System & Theme

### 12.1 Color Tokens
```
Brand:          emerald=#0A7B4F   emeraldLight=#0D9B63   emeraldDark=#066B42
                gold=#C8963E      goldLight=#D4A94F

Dark BG:        bg=#0D1117        bgElevated=#161B22     bgCard=#1C2333
                bgSheet=#21283B   surface=#2D3548        surfaceHover=#374151
                border=#30363D    borderLight=#484F58

Text:           primary=#FFFFFF   secondary=#9BA4AE       tertiary=#8B949E
                inverse=#1E293B   onColor=#FFFFFF

Status:         error=#F85149     warning=#D29922         success=#0A7B4F
                info=#58A6FF      live=#FF3B3B

Glass:          dark=rgba(13,17,23,0.85)   light=rgba(255,255,255,0.15)
                border=rgba(255,255,255,0.12)
```

### 12.2 Spacing & Typography
```
Spacing:    xs=4  sm=8  md=12  base=16  lg=20  xl=24  2xl=32  3xl=40  4xl=48
FontSize:   xs=11 sm=13 base=15 md=17  lg=20  xl=24  2xl=28  3xl=34  4xl=42
Extended:   micro=9  tiny=10  caption=12  body=14  subtitle=16  title=18  heading=28  display=32  hero=36  jumbo=48
Radius:     sm=6  md=10  lg=16  xl=24  full=9999
LineHeight: xs=16 sm=18 base=22 md=24  lg=28  xl=32
```

### 12.3 Animation Springs (Reanimated)
```
bouncy:     { damping: 10, stiffness: 400, mass: 0.6 }  — playful
snappy:     { damping: 12, stiffness: 350, mass: 0.4 }  — quick
responsive: { damping: 14, stiffness: 170, mass: 0.5 }  — smooth
gentle:     { damping: 20, stiffness: 100, mass: 0.8 }  — slow
fluid:      { damping: 18, stiffness: 150, mass: 0.9 }  — flowing

Timing:     fast=150ms  normal=250ms  slow=400ms  shimmer=1200ms
Stagger:    item=40ms  section=80ms
Easing:     cinematic=[0.16,1,0.3,1]  decelerate=[0,0,0.2,1]  accelerate=[0.4,0,1,1]
```

### 12.4 Fonts
```
headingBold:  PlayfairDisplay_700Bold        — display/title font
body:         DMSans_400Regular              — default body
bodyMedium:   DMSans_500Medium               — medium weight
bodyBold:     DMSans_700Bold                 — bold
arabic:       NotoNaskhArabic_400Regular     — Arabic content
arabicBold:   NotoNaskhArabic_700Bold        — Arabic bold
mono:         Menlo (iOS) / monospace (Android) — code/numbers
```

### 12.5 Haptic Patterns (useContextualHaptic — 10 types)
| Pattern | Expo Type | Usage |
|---------|-----------|-------|
| like | ImpactFeedbackStyle.Medium | Heart reactions, double-tap |
| follow | NotificationFeedbackType.Success | Follow/subscribe |
| save | ImpactFeedbackStyle.Light | Bookmark |
| navigate | ImpactFeedbackStyle.Light | Tab press, navigation |
| tick | selectionAsync | Tab switch, picker, option select |
| delete | NotificationFeedbackType.Warning | Destructive action |
| error | NotificationFeedbackType.Error | Validation failure |
| longPress | ImpactFeedbackStyle.Heavy | Context menu |
| send | ImpactFeedbackStyle.Medium | Send message, post |
| success | NotificationFeedbackType.Success | Upload complete |

### 12.6 i18n
- **Languages:** en, ar, tr, ur, bn, fr, id, ms (8 total)
- **Keys:** 3,970+ per language across 146 namespaces
- **Status:** en 100%, tr 89%, ar 77%, ur/bn/fr/id/ms 14-16%
- **RTL:** ~430 margin/padding/position replacements across 134 files; I18nManager.forceRTL for ar/ur
- **Bundling:** All 8 languages bundled at build time (no async flash)
- **Config:** i18next v4 compatibility, fallback: en, returnNull: false

### 12.7 Islamic Calendar Themes
| Theme | Trigger | Accent | Notes |
|-------|---------|--------|-------|
| Ramadan | Hijri month 9 | Gold #C8963E | Warm gold tint |
| Eid | 1-3 Shawwal OR 10 Dhul Hijjah | Gold + confetti | Celebratory |
| Dhul Hijjah | Days 1-13 month 12 | Earth #8B6F47 | Hajj season |
| Muharram | Day 1 month 1 | Silver #A0AEC0 | Subdued |
| Jummah | Every Friday | Gold 6% opacity | Subtle weekly |

### 12.8 High Contrast Mode (WCAG AA)
- text.primary: #FFFFFF (21:1 on dark bg)
- text.secondary: #C9D1D9 (10.5:1)
- emerald override: #0EAD69 (5.1:1)
- focus ring: #58A6FF (bright blue), 3px width

---

## 13. Infrastructure & Deployment

### 13.1 Production Services

| Service | Provider | URL/Status | Notes |
|---------|----------|------------|-------|
| API | Railway (Nixpacks) | `mizanlyapi-production.up.railway.app` LIVE | node dist/main.js, restart ON_FAILURE x10 |
| Database | Neon PostgreSQL 16 | Connected | Use DIRECT_DATABASE_URL for migrations |
| Cache | Upstash Redis 7 | Connected | No-op proxy fallback if unavailable |
| Storage | Cloudflare R2 | Configured (mizanly-media) | CORS + lifecycle rules NOT set |
| Video | Cloudflare Stream | Configured | Webhook HMAC verified |
| Auth | Clerk | Connected (**TEST keys**) | Switch to live before launch |
| Payments | Stripe | Connected (**TEST keys**) | API v2025-02-24 |
| Email | Resend | Configured | **Domain NOT verified** (spam risk) |
| Monitoring | Sentry | Configured | 10% trace rate |
| Search | Meilisearch | **NOT configured** | Falls back to Prisma LIKE |
| Domain | mizanly.app | Namecheap + Cloudflare DNS | SSL Full (Strict) |
| TURN | metered.ca | Configured | TURN_SERVER_URL set |

### 13.2 CI/CD Pipeline
```
.github/workflows/ci.yml
├── lint-and-typecheck (ubuntu, Node 20)
│   ├── npm ci --legacy-peer-deps
│   ├── prisma generate
│   ├── lint api + mobile
│   └── tsc --noEmit
├── test-api (depends on lint; services: postgres:16, redis:7)
│   └── npm test --workspace=apps/api --passWithNoTests
├── build-api (depends on test-api)
│   └── npx nest build
└── build-mobile (depends on lint)
    └── npx expo export --platform web
```

### 13.3 Railway Deployment
```json
{
  "build": {
    "installCommand": "npm install --legacy-peer-deps",
    "buildCommand": "npx prisma generate && npx prisma migrate deploy && rm -rf dist && npx nest build && ls dist/main.js"
  },
  "deploy": {
    "startCommand": "node dist/main.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/api/v1/health/live"
  }
}
```

### 13.4 Environment Variables (32/34 configured)
**Set (30):** DATABASE_URL, DIRECT_DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, CLERK_WEBHOOK_SECRET, REDIS_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL, CF_STREAM_ACCOUNT_ID, CF_STREAM_API_TOKEN, CF_STREAM_WEBHOOK_SECRET, RESEND_API_KEY, SENTRY_DSN, TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL, TOTP_ENCRYPTION_KEY, GOLD_PRICE_PER_GRAM, SILVER_PRICE_PER_GRAM, NODE_ENV, PORT, CORS_ORIGINS

**Empty (2):** MEILISEARCH_HOST, MEILISEARCH_API_KEY

**Needs update (3):** APP_URL (localhost:3000 → api.mizanly.app), API_URL (same), CLERK + STRIPE keys (test → live)

### 13.5 Health Checks
| Endpoint | Auth | Purpose |
|----------|------|---------|
| GET /health/live | None | Always 200 (liveness) |
| GET /health/ready | None | DB + Redis (readiness) |
| GET /health | Admin | Full: DB, Redis, R2, Stream |
| GET /health/metrics | Admin | Counts, queues, memory |
| GET /health/config | Optional | Feature flags for mobile |

### 13.6 EAS Build Profiles
- **development:** localhost:3000, iOS simulator, internal dist
- **preview:** Railway API, test Clerk keys, internal dist
- **production:** api.mizanly.app, live keys (NOT YET SET), auto-increment

---

## 14. Testing Architecture

### 14.1 Stats
- **Total files:** 302 `.spec.ts`
- **Total tests:** 5,208 (via `it()` blocks)
- **Total describe blocks:** 2,271
- **Test code:** ~70,305 lines

### 14.2 Strategy
- **100% mocked Prisma** — no real DB connection, every model method jest.fn()
- **15 shared mock providers** in `common/test/mock-providers.ts` (Prisma, Redis, Notifications, Gamification, AI, Stream, Push, AsyncJob, Queue, Analytics, FeatureFlags, ContentSafety)
- **Transaction simulation:** `$transaction.mockImplementation(async (cb) => cb(prisma))`
- **7,008 mockResolvedValue calls** across test suite

### 14.3 Top Modules by Coverage
| Module | Tests | Focus |
|--------|-------|-------|
| islamic | 268 | Prayer calc, Quran, notifications |
| stories | 240 | CRUD, expiry, stickers, GIPHY |
| posts | 222 | CRUD, comments, permissions, carousel |
| messages | 175 | Chat, view-once, abuse, concurrency |
| reels | 144 | Video, carousel, permissions |
| feed | 131 | Algorithm, transparency, cursor |
| videos | 121 | CRUD, chapters, auth |
| video-editor | 118 | FFmpeg commands, filters, voice |
| users | 108 | Profile, abuse, DTOs |
| threads | 99 | CRUD, replies, auth, polls |

### 14.4 Jest Config
- Root: `apps/api/src`; regex: `.*\.spec\.ts$`
- Transform: ts-jest (diagnostics disabled)
- Module mapper: `@/*` → `<rootDir>/$1`
- Environment: node

---

## 15. Known Bugs & Gaps (From Agent Findings)

### 15.1 CRITICAL (Will cause failures)

| Bug | Location | Impact |
|-----|----------|--------|
| **WebRTC: 3 missing socket emits** | call/[id].tsx | call_initiate, call_answer, call_end never emitted → callee never knows call is coming; caller never knows answer accepted; remote peer never gets hangup |
| **WebRTC: CallType enum mismatch** | chat-events.dto.ts:25 | Socket validates `@IsIn(['AUDIO', 'VIDEO'])` but REST uses VOICE/VIDEO → socket rejects 'VOICE' |
| **Coin purchase webhook NOT crediting** | payments.service.ts | handleGiftPaymentIntentSucceeded not implemented → coins never credited after Stripe payment |
| **Waqf contribution endpoint MISSING** | community.service.ts | Mobile calls createPaymentIntent but POST /community/waqf/{id}/contribute doesn't exist |
| **Dual CoinBalance system** | schema.prisma | User.coinBalance (legacy, stale) vs CoinBalance table (correct) — reading wrong one = wrong balance |

### 15.2 HIGH (Incorrect behavior)

| Bug | Location | Impact |
|-----|----------|--------|
| Owner can't see own scheduled/trial content on profile | users.service.ts feed queries | Scheduled posts invisible to author |
| createdAt not updated when scheduled content publishes | schema design | Scheduled posts appear at wrong position in chronological feed |
| Frontend doesn't hide comment input when permission is NOBODY | post detail, reel detail | Users see input but get 403 on submit |
| Tag approval workflow dead | PostTaggedUser.status | Status field exists (PENDING/APPROVED/DECLINED) but no approve/decline endpoint |
| slideDuration not persisted in DB | create-carousel.tsx | Carousel auto-advance timing lost after publish |
| Waveform is cosmetic | video-editor.tsx | Deterministic sine wave, not from actual audio peaks |
| Font selection no effect on export | ffmpegEngine.ts drawtext | FFmpeg can't resolve platform font paths |

### 15.3 MEDIUM (Missing features)

| Gap | Status |
|-----|--------|
| react-native-incall-manager needed for speaker routing | Not installed |
| Group calls + screen sharing (backend exists) | Mobile not implemented |
| Stripe Connect real payout (getPaymentMethods placeholder) | Returns dummy data |
| 2FA not enforced at Clerk login | Requires session claim integration |
| Socket notification delivery (Redis publish exists) | Gateway subscription pending |
| Premium subscription payment | No webhook integration |
| Meilisearch deployment | Falls back to Prisma LIKE |

---

## 16. Decision Log

### Architecture Decisions

| Decision | Choice | Why | Alternative Rejected |
|----------|--------|-----|---------------------|
| Auth | Clerk (external) | OAuth+email+phone+sessions out of box; reduces attack surface | Passport.js — too much security burden |
| Database | Neon PostgreSQL + pgvector | Serverless, built-in vector search | MongoDB — no vectors; Supabase — less control |
| ORM | Prisma | Type-safe, migration system, schema-as-docs | TypeORM — less safe; Drizzle — newer ecosystem |
| Real-time | Socket.io | Rooms, auto-reconnect, Redis adapter | Raw WebSocket — no rooms; SSE — no bidirectional |
| Video hosting | Cloudflare Stream | Auto-transcode, HLS/DASH, CDN | Self-hosted FFmpeg — ops burden; MediaConvert — expensive |
| Storage | Cloudflare R2 | S3-compat, no egress fees, same vendor | AWS S3 — egress costs |
| Feed algo | pgvector KNN + scoring | Personalized without ML infra | Collaborative filtering — needs scale |
| State | Zustand (client) + React Query (server) | Minimal boilerplate, cache/refetch | Redux — verbose; Jotai — needs more wiring |
| Navigation | Expo Router (file-based) | Type-safe, deep linking built-in | React Navigation — more manual |
| Monorepo | npm workspaces | Simple, no build cache needed | Turborepo — overkill for 2 packages |
| Video editor | ffmpeg-kit (full-gpl) | Full filter graph, x264/x265/libass | Cloud processing — latency + cost |
| Bottom sheets | Custom (not RN Modal) | Rule #1; consistent, gesture dismissal | RN Modal — inconsistent |
| Icons | Custom 80+ names (Lucide) | Consistent sizes/colors, no emoji (Rule #2) | Expo vector-icons — inconsistent |

### Pattern Decisions

| Pattern | What | Why |
|---------|------|-----|
| Denormalized counters | likesCount on parent | COUNT(*) too slow for feeds |
| Composite PKs | [userId, postId] for joins | Natural uniqueness |
| Soft deletes | isRemoved flag | Appeals, audit, legal |
| scheduledAt OR pattern | `OR [null, lte now]` | Shows content when time arrives |
| Callback refs (WebRTC) | `useRef(onConnected)` | PC handlers persist across renders |
| socketReady boolean | State not ref | Ref changes don't trigger effects |
| Pattern B remote streams | Manual addTrack | event-target-shim TS issue |
| Pre-save moderation | Check before persist | Fail-closed: nothing unsafe in DB |
| XML prompt hardening | `<user_content>` tags | Prevent prompt injection |
| Atomic balance ops | `updateMany WHERE >= amount` | Race condition prevention |
| ICE candidate queue | Max 200 | Trickle ICE before remote desc set |

### Tradeoffs Accepted

| Tradeoff | Risk | Mitigation |
|----------|------|------------|
| No Meilisearch | Slow LIKE search, no fuzzy | Deploy when volume justifies |
| No PostGIS | Haversine approximation for geo | PostGIS when geo features primary |
| Waveform cosmetic | Not real audio data | Needs FFprobeKit extraction |
| Font selection dead | FFmpeg can't resolve fonts | Needs platform fontfile path |
| 2FA not enforced at login | Users bypass TOTP | Requires Clerk session claims |
| Single-thread video export | Blocks UI for long videos | expo-task-manager background |
| No real geo-filtering | getNearbyContent is stub | PostGIS when real geo needed |

---

*Generated 2026-03-25 by 40 parallel extraction agents (856 KB raw data in `docs/architecture-raw-2026-03-25/`). Every claim derived from actual file reads. Cross-reference raw outputs for file:line details.*
