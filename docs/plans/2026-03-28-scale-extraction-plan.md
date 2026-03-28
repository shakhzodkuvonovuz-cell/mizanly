# Mizanly Scale Extraction Plan — From Monolith to Services

> **Date:** 2026-03-28
> **Current state:** 78 modules, 951 endpoints, 39,257 lines of service code, single NestJS monolith
> **Goal:** Map which modules stay in TypeScript, which extract to Go, which to Elixir, and how they communicate

---

## The Real Architecture (Not the Simple Diagram)

### Module Inventory by Domain

**Content Domain (5 spaces — the core product):**

| Space | Module | Lines | Endpoints | Depends on |
|-------|--------|-------|-----------|------------|
| Saf (Instagram) | posts | 2,004 | 40 | ai, gamification, moderation, notifications |
| Saf (Instagram) | stories | 604 | 18 | ai, notifications |
| Bakra (TikTok) | reels | 1,352 | 31 | ai, gamification, moderation, notifications, stream |
| Majlis (Twitter) | threads | 1,186 | 29 | ai, gamification, moderation, notifications |
| Minbar (YouTube) | videos | 1,117 | 31 | ai, gamification, moderation, notifications, stream |
| Risalah (WhatsApp) | messages | 1,525 | 56 | ai, notifications |

**Discovery & Algorithm Domain:**

| Module | Lines | Endpoints | Purpose |
|--------|-------|-----------|---------|
| feed | 647+781 | 8 | Personalized feed scoring, 3-stage ranking |
| recommendations | 777 | 5 | Similar content, user recommendations |
| search | 697+213 | 8 | Meilisearch + Prisma fallback |
| hashtags | ~200 | 6 | Trending hashtags, 24h window |
| embeddings | ~300 | 0 | pgvector interest vectors, k-means clustering |

**Real-Time Domain:**

| Module | Lines | Endpoints | Socket events |
|--------|-------|-----------|---------------|
| messages (gateway) | 971 | — | 7 handlers (send, typing, read, delivered, join, leave, online) |
| calls (gateway) | — | — | 5 handlers (initiate, answer, reject, end, signal) |
| audio-rooms | 540 | 16 | Quran rooms (join, leave, verse sync, reciter change) |
| live/broadcast | 462 | 12 | Live streaming signaling |
| notifications (delivery) | 480 | 8 | Redis pub/sub → socket push |

**Commerce Domain:**

| Module | Lines | Endpoints | Purpose |
|--------|-------|-----------|---------|
| payments | 915 | 8 | Stripe PaymentIntent, webhooks |
| monetization | 570 | 16 | Creator earnings, cashout |
| commerce | 698 | 26 | Gift shop, orders |
| gifts | ~300 | 8 | Send gifts, gift records |

**Islamic Domain:**

| Module | Lines | Endpoints | Purpose |
|--------|-------|-----------|---------|
| islamic | ~800 | 73 | Prayer times, Quran, dhikr, names of Allah, duas |
| halal | ~200 | 8 | Halal verification |
| mosques | ~200 | 8 | Mosque finder |
| scholar-qa | ~200 | 6 | Scholar Q&A |

**User & Auth Domain:**

| Module | Lines | Endpoints | Purpose |
|--------|-------|-----------|---------|
| users | 1,309 | 34 | Profile, settings, search |
| auth | ~400 | 6 | Clerk webhooks, referral codes |
| two-factor | 637 | 8 | TOTP, backup codes |
| devices | ~100 | 4 | Device management |
| privacy | 752 | 2 | Data deletion, GDPR |
| parental-controls | ~200 | 6 | PIN, child accounts |

**Social Features Domain:**

| Module | Lines | Endpoints | Purpose |
|--------|-------|-----------|---------|
| follows | 525 | 10 | Follow/unfollow, suggestions |
| circles | ~300 | 10 | Close friends circles |
| communities | 460 | 25 | Community management |
| channels | 532 | 13 | Broadcasting channels |
| collabs | ~150 | 6 | Collaboration invites |

**Moderation Domain:**

| Module | Lines | Endpoints | Purpose |
|--------|-------|-----------|---------|
| moderation | 393 | 8 | Content safety, word filters |
| reports | ~300 | 8 | User/content reports |
| admin | ~400 | 20 | Admin dashboard endpoints |

**Infrastructure Modules:**

| Module | Lines | Purpose |
|--------|-------|---------|
| ai | 699 | Claude/Gemini/Whisper integration |
| gamification | 692 | XP, levels, achievements, streaks |
| notifications | 480+274+419 | Create + trigger + push delivery |
| upload | 179 | Presigned URLs, R2 |
| stream | 315 | Cloudflare Stream webhooks |
| scheduling | 714 | Scheduled content publishing |
| retention | ~200 | Engagement analysis |

**Pure CRUD (zero dependencies, ~30 modules):**
blocks, mutes, bookmarks, restricts, stickers, polls, clips, checklists, audio-tracks, channel-posts, community-notes, downloads, drafts, majlis-lists, og, playlists, profile-links, promotions, reel-templates, story-chains, subtitles, thumbnails, video-editor, video-replies, waitlist, watch-history, webhooks, alt-profile, chat-export, telegram-features, discord-features

---

## The Critical Hub: Notifications

**17+ modules depend on NotificationsService.** This is the single most important architectural decision.

```
posts ──────┐
reels ──────┤
threads ────┤
videos ─────┤
stories ────┤
follows ────┤
messages ───┤
circles ────┤
communities ┤
channels ───┤──→ NotificationsService ──→ QueueService ──→ PushService ──→ Expo/APNs/FCM
commerce ───┤                         ──→ Redis pub/sub ──→ ChatGateway ──→ Socket.io
events ─────┤
gifts ──────┤
islamic ────┤
payments ───┤
reports ────┤
scheduling ─┤
admin ──────┘
```

**Rule:** Notifications must be extracted FIRST (or exposed as an internal API) before anything else can be extracted. Every content module fires notifications.

---

## Extraction Strategy

### What stays in TypeScript/NestJS (forever)

These modules are I/O-bound CRUD, tightly coupled to Prisma, or serve as the API gateway. No performance benefit from extraction.

| Category | Modules | Why stays |
|----------|---------|-----------|
| **API Gateway** | All controllers | Request routing, validation, auth. Node is perfect for this. |
| **User/Auth** | users, auth, two-factor, devices, privacy, parental-controls | Identity is foundational. Clerk integration is Node SDK. |
| **Content CRUD** | posts, reels, threads, stories, videos (create/read/update/delete) | Database writes are I/O-bound. Prisma handles it fine. |
| **Commerce** | payments, monetization, commerce, gifts | Stripe SDK is Node. Financial logic is sequential. |
| **Islamic** | islamic, halal, mosques, scholar-qa | Domain logic, no CPU bottleneck. 73 endpoints but low throughput. |
| **Social** | follows, circles, communities, channels, collabs | CRUD + counter updates. Low complexity. |
| **Moderation** | moderation, reports, admin | AI calls are async (queued). Admin is low traffic. |
| **Pure CRUD** | ~30 modules | Trivial. Not worth extracting. |
| **Settings** | settings, alt-profile, profile-links | Low traffic, simple storage. |

**Total staying:** ~60 modules, ~700 endpoints, ~25,000 lines. This IS your NestJS monolith. It's fine forever.

### What extracts to Go

CPU-bound scoring, background processing, high-throughput fan-out. Go's goroutines and compilation to native code make these 10-50x faster.

| Service | Modules absorbed | Lines | Why Go |
|---------|-----------------|-------|--------|
| **Feed Service** | feed (1,428), recommendations (777), embeddings (~300), hashtags (~200) | ~2,700 | CPU-bound scoring of 500 candidates per request. Goroutines parallelize scoring. 3-stage ranking pipeline blocks Node's event loop. |
| **Worker Service** | All 6 queue processors (media, ai-tasks, webhook, analytics, notification push, search-indexing) | ~860 | Background jobs are CPU-bound. Go worker pools with goroutines handle 10x throughput. Single Go binary, multiple job types. |
| **Counter Service** | counter-reconciliation (610), analytics (119) | ~730 | Heavy SQL aggregations. Cron-driven. No real-time requirement. Go handles raw SQL faster. |
| **Scheduling Service** | scheduling (714) | ~714 | Cron orchestration. Publishes scheduled content. Go cron libraries are battle-tested. |

**Communication with NestJS:**
- gRPC for synchronous calls (feed request → Go scores → returns ranked items)
- Redis pub/sub for async events (content created → Go indexes for search)
- Direct PostgreSQL read replica for queries (Go doesn't go through NestJS for reads)

### What extracts to Elixir/Phoenix

Real-time connections, presence, message routing. BEAM VM handles millions of concurrent lightweight processes.

| Service | Modules absorbed | Lines | Why Elixir |
|---------|-----------------|-------|------------|
| **Connection Gateway** | chat.gateway.ts (971), all socket event handlers | ~1,500 | WhatsApp hit 2.8M connections/server on BEAM. Node.js Socket.io maxes at 50-100K. Each Elixir process = one connection = 2KB RAM. |
| **Message Router** | Message routing logic from messages.service.ts (send, deliver, typing, read receipts) | ~800 | Message fan-out to conversation rooms. Elixir's process model handles millions of concurrent conversations. Phoenix Channels built for this. |
| **Presence Service** | Online status, typing indicators, Quran room state | ~400 | Phoenix Presence is built-in, CRDT-based, handles distributed presence across nodes. Currently hand-rolled with Redis + timers. |
| **Notification Delivery** | Socket-side notification push (Redis sub → emit to user room) | ~300 | High fan-out. One notification → push to N devices/connections. Elixir handles this natively. |
| **Live Streaming Signaling** | live (462), broadcast, audio-rooms (540) | ~1,000 | Real-time room management with many concurrent participants. BEAM's supervision trees handle room lifecycle. |

**Communication with NestJS:**
- Elixir receives WebSocket connections directly (not proxied through NestJS)
- When a message needs to be persisted, Elixir calls NestJS via gRPC or direct PostgreSQL write
- Redis pub/sub for cross-service events (NestJS creates notification → Redis → Elixir delivers via socket)
- Elixir handles the "hot path" (real-time delivery), NestJS handles the "cold path" (persistence, business logic)

### What gets deployed (not built)

| Service | Tool | Purpose |
|---------|------|---------|
| **Calls** | LiveKit (Go, open-source) | 1:1 + group voice/video, screen sharing, broadcasting |
| **Search** | Meilisearch (Rust) | Full-text search, typo-tolerant |
| **Video transcode** | Cloudflare Stream | HLS/DASH encoding |
| **Object storage** | Cloudflare R2 | Media files |
| **Database** | Neon PostgreSQL + read replica | Primary data store |
| **Cache** | Upstash Redis → Redis Cluster at 500K users | Caching, pub/sub, queues |

---

## The Real Architecture Diagram

```
                        ┌──────────────────────────────────┐
                        │         Mobile App (RN/Expo)      │
                        └──┬──────────┬──────────┬─────────┘
                           │ REST     │ WebSocket│ WebRTC
                           ▼          ▼          ▼
                    ┌──────────┐ ┌──────────┐ ┌─────────┐
                    │  NestJS  │ │  Elixir  │ │ LiveKit │
                    │ API GW   │ │  Phoenix │ │  (SFU)  │
                    │  (TS)    │ │  Gateway │ │         │
                    │          │ │          │ │ • 1:1   │
                    │ • Auth   │ │ • Chat   │ │ • Group │
                    │ • CRUD   │ │ • Typing │ │ • Screen│
                    │ • Pay    │ │ • Presenc│ │ • Record│
                    │ • Islamic│ │ • Notif  │ └────┬────┘
                    │ • Mod    │ │   push   │      │
                    │ • Social │ │ • Quran  │      │
                    │ • 60 mod │ │   rooms  │      │
                    │ • 700 EP │ │ • Live   │      │
                    └────┬─────┘ └────┬─────┘      │
                         │            │             │
              ┌──────────┼────────────┼─────────────┘
              │          │            │
              ▼          ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌─────────┐
        │ Go Feed  │ │ Go       │ │  Meili  │
        │ Service  │ │ Workers  │ │  search │
        │          │ │          │ │ (Rust)  │
        │ • Rank   │ │ • Media  │ └─────────┘
        │ • Recomm │ │ • AI job │
        │ • Trend  │ │ • Push   │
        │ • Embed  │ │ • Search │
        │ • Hash   │ │ • Webhook│
        │          │ │ • Analyt │
        └────┬─────┘ └────┬─────┘
             │             │
             ▼             ▼
        ┌─────────────────────────────────────────┐
        │                                         │
        │   PostgreSQL (primary + read replica)    │
        │   Redis Cluster (cache + pub/sub + queue)│
        │   Cloudflare R2 (media) + Stream (video) │
        │   Clerk (auth) + Stripe (payments)       │
        │   Sentry (monitoring)                    │
        │                                         │
        └─────────────────────────────────────────┘
```

---

## Communication Between Services

### NestJS ↔ Go (gRPC)

```protobuf
// feed.proto
service FeedService {
  rpc GetPersonalizedFeed(FeedRequest) returns (FeedResponse);
  rpc GetTrendingFeed(TrendingRequest) returns (FeedResponse);
  rpc LogInteraction(InteractionRequest) returns (Empty);
  rpc GetRecommendations(RecommRequest) returns (RecommResponse);
}
```

NestJS controller receives HTTP request → calls Go via gRPC → Go scores candidates on read replica → returns ranked IDs → NestJS hydrates with full Prisma objects → returns to client.

### NestJS ↔ Elixir (Redis pub/sub + gRPC)

```
Message send flow:
1. Mobile → Elixir (WebSocket): encrypted message
2. Elixir → NestJS (gRPC): persist message to DB
3. NestJS → Redis: publish 'new_message' event
4. Elixir ← Redis: receives event
5. Elixir → Mobile (WebSocket): deliver to recipient's socket
6. NestJS → Go Workers (Redis queue): push notification job
7. Go Worker → Expo API: deliver push notification
```

### Event Bus (Redis Streams or Kafka at scale)

| Event | Publisher | Subscribers |
|-------|-----------|-------------|
| `content.created` | NestJS (posts/reels/threads) | Go (index in Meilisearch), Go (update feed cache) |
| `content.liked` | NestJS | Go (update engagement scores), Go (gamification XP) |
| `message.sent` | Elixir | NestJS (persist), Go (push notification) |
| `user.followed` | NestJS | Go (update interest vectors), Elixir (notify via socket) |
| `notification.created` | NestJS | Elixir (socket delivery), Go (push delivery) |
| `user.banned` | NestJS | Elixir (force disconnect), Go (remove from indexes) |

---

## Database Ownership

The monolith currently shares one PostgreSQL database. When services are extracted:

| Service | Owns (writes) | Reads (replica) |
|---------|--------------|-----------------|
| **NestJS** | Users, Posts, Reels, Threads, Videos, Stories, Payments, Islamic, all CRUD models | Everything |
| **Go Feed** | FeedInteraction, interest vectors | Posts, Reels, Threads, Users (read replica) |
| **Go Workers** | Notification delivery status, search index status | Everything (read replica) |
| **Elixir** | Nothing (stateless message routing) | ConversationMember (for auth checks) |

**Rule:** NestJS remains the owner of ALL Prisma models. Go and Elixir read from a PostgreSQL read replica. Only NestJS writes (except Go Workers which update job status).

If a message needs to be persisted, Elixir calls NestJS via gRPC, and NestJS writes to the primary DB. This avoids split-brain writes.

---

## Extraction Timeline (Tied to User Growth)

| Users | Phase | What | Effort | Cost |
|-------|-------|------|--------|------|
| **0 → 50K** | 0 | Ship as monolith. Fix bugs. Get users. | $0 | $0 |
| **50K → 100K** | 1 | **Go Feed Service** — extract feed scoring + recommendations. Add PostgreSQL read replica. | 1 Go engineer, 2-3 months | ~$5K infra |
| **100K → 200K** | 2 | **Go Workers** — extract all 6 queue processors into single Go binary. | Same engineer, 1-2 months | ~$2K infra |
| **200K → 500K** | 3 | **Elixir Gateway** — extract WebSocket connections, presence, message routing. Keep NestJS for persistence. | 1-2 Elixir engineers, 3-4 months | ~$10K infra |
| **500K → 1M** | 4 | **LiveKit** — deploy for group calls. **Redis Cluster** — upgrade from single instance. | 1 week deploy + config | ~$5K/mo |
| **1M+** | 5 | **Database sharding** — messages table by conversationId. Read replicas per region. CDN edge caching. | Database architect | ~$20K+/mo |

**Each phase is independent. Each ships separately. Each has a rollback path (keep NestJS endpoint as fallback, route traffic gradually).**

---

## What NOT to Extract (Common Mistakes)

| Module | Why people think to extract | Why you shouldn't |
|--------|---------------------------|-------------------|
| **Auth (Clerk)** | "Auth should be separate" | Clerk IS separate. NestJS just validates JWTs. No extraction needed. |
| **Payments (Stripe)** | "Financial services need isolation" | Stripe handles the money. NestJS just calls Stripe SDK. I/O bound. |
| **Islamic (73 endpoints)** | "It's big" | It's big but low throughput. Nobody's hitting prayer times at 1000 req/sec. |
| **Content CRUD** | "Posts/Reels should be microservices" | CRUD is I/O bound (database writes). Extracting adds network hops for no gain. Only extract the SCORING, not the CRUD. |
| **AI module** | "ML should be separate" | AI calls are already async (queued). The module just enqueues jobs. The actual inference happens in Go Workers. |
| **Moderation** | "Safety is critical" | Moderation is triggered by content creation (sync check) + queue (async AI). Extracting adds latency to content creation. |

---

## The Notification Problem (Detailed)

17+ modules call `NotificationsService.create()`. When Elixir takes over socket delivery and Go takes over push delivery, NestJS still creates the notification record. The flow becomes:

```
Before extraction:
  NestJS creates notification → NestJS queues push → NestJS delivers via socket

After extraction:
  NestJS creates notification → Redis event 'notification.created'
    → Elixir subscribes: delivers via socket to online users
    → Go subscribes: queues push for offline users → sends via Expo API
```

**NestJS still owns the Notification model.** It creates the record, stores it in PostgreSQL. But the DELIVERY is split: Elixir for real-time socket, Go for async push.

The 17+ modules don't change at all — they still call `NotificationsService.create()` in NestJS. The only change is that `create()` publishes a Redis event instead of (or in addition to) directly queuing a push job.

---

## Risks

1. **Premature extraction** — Every extraction adds network hops, deployment complexity, and debugging difficulty. Only extract when profiling proves the bottleneck. Don't extract because it "feels right."
2. **Shared database coupling** — All services read from PostgreSQL. At high load, the read replica becomes the bottleneck. May need per-service read replicas or database-per-service (much harder).
3. **gRPC contract maintenance** — Proto files must be kept in sync between NestJS, Go, and Elixir. Consider a shared proto repo.
4. **Redis as single point of failure** — Pub/sub, caching, queues, rate limiting all go through Redis. Redis Cluster at 500K users.
5. **Elixir hiring** — Elixir developers are rare. Go developers are common. This affects the timeline for Phase 3.
6. **Data consistency** — NestJS writes, Go reads from replica. Replication lag (typically <1 second) means Go might serve slightly stale data. Acceptable for feed ranking, not for auth checks.
