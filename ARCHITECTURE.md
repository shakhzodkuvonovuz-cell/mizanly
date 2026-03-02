# Mizanly (ميزانلي) — Architecture Guide v3
## 5-Space Architecture: Saf · Bakra · Majlis · Risalah · Minbar
## Stack: NestJS + Expo + Neon + Cloudflare + Clerk

---

## 1. Stack Overview

| Layer | Technology | Why |
|-------|-----------|-----|
| Mobile + Web | React Native (Expo SDK 52) | One codebase, both platforms |
| Backend API | NestJS (TypeScript) | Structured, scalable, Claude Code's strongest area |
| Database | Neon PostgreSQL (serverless) | Free tier, auto-scales, branching for dev |
| ORM | Prisma | Type-safe queries, auto-migrations, schema-as-code |
| Auth | Clerk | Google, Apple, Email — zero auth code |
| Cache | Upstash Redis (serverless) | Session cache, feed cache, rate limiting |
| Real-time | Socket.io (NestJS Gateway) | DMs, notifications, live updates |
| Media Storage | Cloudflare R2 | S3-compatible, $0 egress, global CDN |
| Video | Cloudflare Stream | Auto-transcode, adaptive bitrate |
| Images | Cloudflare Images | Auto-resize, auto-format (WebP/AVIF) |
| Search | Meilisearch Cloud | Arabic support, typo-tolerant, fast |
| Push | Expo Notifications | Native push, both platforms |
| Hosting | Railway | Git-push deploy, $5 free credit/month |
| Email | Resend | Transactional emails, 3K/month free |
| CDN | Cloudflare | Free, global, automatic |
| Monitoring | Sentry | Error tracking, free tier |

---

## 2. The 5-Space Architecture

Mizanly is organized into 5 distinct content spaces, each with its own UI paradigm, data models, and algorithms. Every piece of content belongs to exactly one space.

### Space Overview

| Space | Arabic | Paradigm | Content Types | UI Model |
|-------|--------|----------|---------------|----------|
| **Saf** | الصف | Instagram/Facebook | Posts, carousels, stories | Scrollable feed + stories row |
| **Bakra** | بكرة | TikTok | Short video (15s–3min) | Full-screen vertical swipe |
| **Majlis** | المجلس | X/Twitter | Threads, reposts, quotes | Threaded microblog timeline |
| **Risalah** | رسالة | WhatsApp/Telegram | DMs, groups, channels | Chat list + conversation view |
| **Minbar** | المنبر | YouTube | Long video (5min–2hr) | Channel-based video browser |

### Navigation Structure

```
Bottom Tab Bar (5 tabs):
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  Saf 🏠  │ Bakra ▶️ │ + Create │ Majlis 💬│Risalah ✉│
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

### Algorithm Per Space

| Space | Following Feed | Discovery Feed | Signal Weights |
|-------|---------------|----------------|----------------|
| Saf | Chronological | Engagement + interest | Like > Comment > Share > View duration |
| Bakra | Chronological | Completion rate + shares | Loop rate > Share > Like > View |
| Majlis | Chronological | Trending + engagement | Repost > Quote > Reply > Like |
| Minbar | Subscriptions | Watch history + categories | Watch duration > Subscribe > Like |

---

## 3. Monorepo Structure

```
mizanly/
├── apps/
│   ├── mobile/                    # React Native (Expo) app
│   │   ├── app/                   # Expo Router (file-based routing)
│   │   │   ├── (auth)/            # Login, Register, Onboarding
│   │   │   └── (tabs)/            # Saf, Bakra, Create, Majlis, Risalah
│   │   └── src/
│   │       ├── components/        # UI components per space
│   │       ├── hooks/             # Custom React hooks
│   │       ├── stores/            # Zustand state management
│   │       ├── api/               # API client layer
│   │       ├── lib/               # Constants, theme, i18n, utils
│   │       └── types/             # TypeScript interfaces
│   │
│   └── api/                       # NestJS Backend
│       ├── src/
│       │   ├── modules/           # Feature modules per space
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── saf/           # Posts, Stories, Comments, Feed
│       │   │   ├── bakra/         # Reels, Feed
│       │   │   ├── majlis/        # Threads, Replies, Trending
│       │   │   ├── risalah/       # Messages, Conversations, Broadcast
│       │   │   ├── minbar/        # Videos, Channels, Playlists
│       │   │   ├── live/          # Live sessions
│       │   │   ├── circles/
│       │   │   ├── notifications/
│       │   │   ├── search/
│       │   │   └── media/
│       │   ├── common/            # Guards, decorators, filters, pipes
│       │   ├── gateways/          # Socket.io gateways
│       │   └── config/            # Prisma, Redis config
│       └── prisma/
│           └── schema.prisma      # Full 5-space DB schema v2
│
└── packages/
    └── shared/                    # Shared types, validators, constants
```

---

## 4. API Routes by Space

### Saf Routes (`/api/v1/saf/`)
```
GET    /api/v1/saf/feed/following      # Chronological following feed
GET    /api/v1/saf/feed/discover       # Algorithmic discovery feed
POST   /api/v1/saf/posts               # Create post
GET    /api/v1/saf/posts/:id           # Get post
DELETE /api/v1/saf/posts/:id           # Delete post
POST   /api/v1/saf/posts/:id/react     # React to post
GET    /api/v1/saf/posts/:id/comments  # Get comments
POST   /api/v1/saf/posts/:id/comments  # Add comment
POST   /api/v1/saf/stories             # Create story
GET    /api/v1/saf/stories/feed        # Stories from following
POST   /api/v1/saf/stories/:id/view    # Mark story viewed
```

### Bakra Routes (`/api/v1/bakra/`)
```
GET    /api/v1/bakra/feed/following     # Following reels
GET    /api/v1/bakra/feed/foryou        # For You algorithm
POST   /api/v1/bakra/reels              # Upload reel
GET    /api/v1/bakra/reels/:id          # Get reel
POST   /api/v1/bakra/reels/:id/react    # React
POST   /api/v1/bakra/reels/:id/view     # Log view + loop
```

### Majlis Routes (`/api/v1/majlis/`)
```
GET    /api/v1/majlis/feed/following    # Following timeline
GET    /api/v1/majlis/feed/foryou       # For You
GET    /api/v1/majlis/trending          # Trending topics
POST   /api/v1/majlis/threads           # Create thread
GET    /api/v1/majlis/threads/:id       # Get thread + chain
POST   /api/v1/majlis/threads/:id/react # React
POST   /api/v1/majlis/threads/:id/repost # Repost
POST   /api/v1/majlis/threads/:id/quote  # Quote post
GET    /api/v1/majlis/threads/:id/replies # Thread replies
POST   /api/v1/majlis/threads/:id/replies # Reply
```

### Risalah Routes (`/api/v1/risalah/`)
```
GET    /api/v1/risalah/conversations              # List conversations
POST   /api/v1/risalah/conversations              # Create 1:1 or group
GET    /api/v1/risalah/conversations/:id/messages # Messages
POST   /api/v1/risalah/conversations/:id/messages # Send message
POST   /api/v1/risalah/conversations/:id/read     # Mark as read
GET    /api/v1/risalah/channels                   # List joined channels
POST   /api/v1/risalah/channels                   # Create channel
POST   /api/v1/risalah/channels/:slug/join        # Join/subscribe
```

### Minbar Routes (`/api/v1/minbar/`)
```
GET    /api/v1/minbar/feed/subscriptions    # Subscription feed
GET    /api/v1/minbar/feed/recommended      # Recommended videos
POST   /api/v1/minbar/videos                # Upload video
GET    /api/v1/minbar/videos/:id            # Get video
GET    /api/v1/minbar/channels/:handle      # Get channel
POST   /api/v1/minbar/channels              # Create channel
POST   /api/v1/minbar/channels/:handle/subscribe  # Subscribe
```

### Shared Routes
```
GET    /api/v1/users/:username           # Profile
PATCH  /api/v1/users/me                  # Update profile
POST   /api/v1/follows/:userId           # Follow
DELETE /api/v1/follows/:userId           # Unfollow
GET    /api/v1/search?q=&type=           # Search
GET    /api/v1/notifications             # Notifications
POST   /api/v1/media/upload-url          # Get presigned upload URL
```

---

## 5. Real-time Events (Socket.io)

```typescript
// Events per space
const events = {
  // Risalah
  'risalah:message': { conversationId, message },
  'risalah:typing': { conversationId, userId },
  'risalah:read': { conversationId, userId },

  // Notifications (all spaces)
  'notification:new': { notification },
  'notification:count': { unreadCount },
};
```

---

## 6. Media Pipeline

```
Client → POST /api/v1/media/upload-url
         { type: 'image'|'video'|'reel', space: 'saf'|'bakra'|'minbar' }
       ← { uploadUrl, mediaId, fields }

Client → PUT uploadUrl (direct to Cloudflare)
       ← 200 OK

Client → POST /api/v1/saf/posts (or /bakra/reels, /minbar/videos)
         { mediaId, ... }
```

---

## 7. Build Priority (Phased Rollout)

### MVP (12 weeks)
- Auth + Profiles + Follows
- Saf (feed + stories + posts + comments)
- Majlis (threads + replies + trending)
- Risalah (DMs + groups + real-time chat)
- Circles
- Search + Notifications

### V1.1 (Month 4-5)
- Bakra (short video)
- Bakra algorithm (For You)

### V1.2 (Month 6-7)
- Minbar (long video + channels + playlists)

### V2.0 (Month 8+)
- Live streaming
- Audio Spaces
- Broadcast channels (Telegram-style)
- E2E encryption for Risalah

---

**Built for Mizanly (ميزانلي) — Your voice. Your balance.**
