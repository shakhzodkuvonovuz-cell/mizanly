<p align="center">
  <img src="https://img.shields.io/badge/Mizanly-%D9%85%D9%8A%D8%B2%D8%A7%D9%86%D9%84%D9%8A-0A7B4F?style=for-the-badge&labelColor=0D1117" alt="Mizanly" />
</p>

<h1 align="center">Mizanly (ميزانلي)</h1>

<p align="center">
  <strong>Your voice. Your balance.</strong><br/>
  A culturally intelligent social platform for the global Muslim community — combining the best of Instagram, TikTok, X, WhatsApp, and YouTube into one unified, values-aligned experience.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React_Native-0.76-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Expo_SDK-52-000020?style=flat-square&logo=expo&logoColor=white" />
  <img src="https://img.shields.io/badge/NestJS-10.4-E0234E?style=flat-square&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Prisma-6.3-2D3748?style=flat-square&logo=prisma&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.io-4.8-010101?style=flat-square&logo=socketdotio&logoColor=white" />
  <img src="https://img.shields.io/badge/Stripe-20.4-635BFF?style=flat-square&logo=stripe&logoColor=white" />
  <img src="https://img.shields.io/badge/License-Proprietary-C8963E?style=flat-square" />
</p>

---

## Table of Contents

- [What is Mizanly?](#what-is-mizanly)
- [The Five Spaces](#the-five-spaces)
- [Project at a Glance](#project-at-a-glance)
- [Islamic-First Features](#islamic-first-features)
- [Features by Space](#features-by-space)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Design System](#design-system)
- [UI/UX Elevation](#uiux-elevation-march-2026)
- [UI Component Library](#ui-component-library)
- [Custom Hooks](#custom-hooks)
- [Service Layer](#service-layer)
- [Backend Modules](#backend-modules)
- [Database Schema](#database-schema-193-models-55-enums)
- [WebSocket Gateway](#websocket-gateway)
- [Internationalization](#internationalization-i18n)
- [All Screens](#all-screens-212-total)
- [Getting Started](#getting-started)
- [Development Scripts](#development-scripts)
- [Local Development with Docker](#local-development-with-docker)
- [CI/CD Pipeline](#cicd-pipeline)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [License](#license)

---

## What is Mizanly?

Mizanly (ميزانلي — "my balance" in Arabic) is a full-featured social media platform built exclusively for the global Muslim community. Rather than building yet another niche app, Mizanly reimagines the entire social experience through an Islamic lens — bringing together five distinct "spaces" that replicate and enhance the functionality of Instagram, TikTok, X/Twitter, WhatsApp, and YouTube.

Every pixel, every interaction, and every feature is designed with Islamic values, Arabic-first typography, and cultural sensitivity at its core. From Qibla compass integration to Ramadan-aware theming, from scholar verification badges to halal content filtering — Mizanly is social media built for the Ummah.

**Brand Identity:**
- Primary: Emerald `#0A7B4F` (growth, paradise, Islam)
- Accent: Gold `#C8963E` (heritage, scholarship, warmth)
- Dark-mode primary interface
- Arabic RTL support throughout
- Domain: `mizanly.app`

---

## The Five Spaces

Mizanly is organized into five distinct "spaces" (فضاءات), each named in Arabic and modeled after a leading social platform:

| Space | Arabic | Meaning | Inspired By | Core Experience |
|-------|--------|---------|-------------|-----------------|
| **Saf** | الصف | "The Row" (prayer row) | Instagram | Photo/video feed, stories, highlights, reels, visual sharing, creator storefronts |
| **Bakra** | بكرة | "Tomorrow" | TikTok | Full-screen vertical video, duets, stitches, effects, trending audio, templates |
| **Majlis** | المجلس | "The Gathering" | X/Twitter | Threaded discussions, replies, trending topics, polls, curated lists |
| **Risalah** | رسالة | "The Message" | WhatsApp | 1:1 & group messaging, voice/video calls, broadcasts, stickers, encryption |
| **Minbar** | المنبر | "The Pulpit" | YouTube | Long-form video, channels, subscriptions, playlists, live streaming, audio rooms |

---

## Project at a Glance

| Metric | Count |
|--------|-------|
| Source Lines (TS/TSX) | 125,000+ |
| Test Lines (*.spec.ts) | 60,000+ |
| Total TypeScript | 185,000+ |
| Mobile Screens | 212 |
| Backend Modules | 79 |
| Backend Controllers | 82 |
| Backend Services | 86 |
| Prisma Models | 193 |
| Prisma Enums | 55 |
| Prisma Schema Lines | 4,700+ |
| Test Suites | 286 |
| Tests Passing | 4,740 (100%) |
| UI Components | 76 |
| Custom Hooks | 23 |
| API Service Files | 33 |
| Translation Keys | 3,500+ per language |
| Accessibility Coverage | 210/212 screens |
| Supported Languages | 8 (English, Arabic, Turkish, Urdu, Bengali, French, Indonesian, Malay) |
| REST Endpoints | 870+ |
| Socket Events | 16 |
| DTOs | 140+ |
| Audit Findings Fixed | 4,500+ (72 deep audit files + 11-wave remediation) |
| RTL Support | Complete (~430 replacements across 134 files) |
| Git Commits | 970+ |
| Development Time | 21 days (Mar 3–23, 2026) |

---

## Islamic-First Features

What makes Mizanly fundamentally different from any mainstream social platform — 19 deeply integrated Islamic features that aren't afterthoughts, but core to the experience:

### Worship & Devotion

| Feature | Screen | Description |
|---------|--------|-------------|
| **Prayer Times** | `prayer-times.tsx` | Location-aware daily prayer schedule (Fajr, Dhuhr, Asr, Maghrib, Isha) with customizable notification settings per prayer |
| **Qibla Compass** | `qibla-compass.tsx` | Real-time magnetometer-based Qibla direction finder with visual compass UI |
| **Dhikr Counter** | `dhikr-counter.tsx` | Digital tasbeeh counter with haptic feedback, session tracking, and lifetime statistics |
| **Dhikr Challenges** | `dhikr-challenges.tsx` | Community dhikr goals — create challenges, invite friends, track collective progress with leaderboards |

### Quran

| Feature | Screen | Description |
|---------|--------|-------------|
| **Reading Plans** | `quran-reading-plan.tsx` | Guided 30/60/90-day Quran completion plans with daily targets, animated progress ring, and streak tracking |
| **Quran Rooms** | `quran-room.tsx` | Real-time communal Quran reading sessions via WebSocket — host controls verse navigation, participants follow along with synchronized Arabic text + translation |
| **Tafsir Viewer** | `tafsir-viewer.tsx` | Scholarly verse explanations from three major sources: Ibn Kathir, Al-Tabari, and Al-Qurtubi |
| **Quran Share** | `quran-share.tsx` | Generate beautiful verse cards for sharing on social media with customizable backgrounds |

### Knowledge & Heritage

| Feature | Screen | Description |
|---------|--------|-------------|
| **Hadith of the Day** | `hadith.tsx` | Daily hadith display with full source chain (Bukhari, Muslim, etc.) and Arabic + translation |
| **Islamic Calendar** | `islamic-calendar.tsx` | Hijri date converter (Kuwaiti algorithm) with upcoming Islamic events and holidays |
| **Hajj Companion** | `hajj-companion.tsx` | Interactive 7-step Hajj/Umrah guide — each step has detailed instructions, specific duas, and completion checklists |

### Community & Charity

| Feature | Screen | Description |
|---------|--------|-------------|
| **Mosque Finder** | `mosque-finder.tsx` | Discover nearby mosques with distance, directions, and community information |
| **Zakat Calculator** | `zakat-calculator.tsx` | Nisab-aware Zakat computation supporting gold/silver/cash/investments with current rates |
| **Charity Campaigns** | `charity-campaign.tsx` | Sadaqah/donation campaigns with progress bars, donor counts, and Stripe-powered donations |
| **Donate** | `donate.tsx` | Direct donation flow with amount selection and payment processing |

### Seasonal & Cultural

| Feature | Screen | Description |
|---------|--------|-------------|
| **Ramadan Mode** | `ramadan-mode.tsx` | Special UI theming, suhoor/iftar countdowns, and Ramadan-specific features during the holy month |
| **Eid Cards** | `eid-cards.tsx` | Greeting cards for 6 Islamic occasions (Eid al-Fitr, Eid al-Adha, Mawlid, Isra & Mi'raj, Ramadan, Islamic New Year) with decorative `EidFrame` component |

### Trust & Moderation

| Feature | Screen | Description |
|---------|--------|-------------|
| **Scholar Verification** | `scholar-verification.tsx` | Gold-star badge system for verified Islamic scholars — application form with credentials, institution, and specialization |
| **Content Filter** | `content-filter-settings.tsx` | 4-level Islamic content strictness (Minimal / Moderate / Strict / Maximum) — filters feed content based on user preference |
| **Nasheed Mode** | `nasheed-mode.tsx` | Music-free toggle that replaces all audio with nasheeds throughout the app |

---

## Features by Space

### Saf (الصف) — Instagram-Style

**Feed & Posts:**
- Algorithm-driven "For You" and chronological "Following" feeds
- Photo and multi-photo posts with carousel
- Video posts with auto-play
- Rich text captions with hashtags and mentions
- Post reactions (like, love, laugh, etc.) and comments
- Comment likes, replies, and threading
- Post sharing, saving, and bookmarking
- Bookmark folders and collections
- Post insights and analytics for creators
- "Why am I seeing this?" transparency

**Stories:**
- 24-hour ephemeral photo/video stories
- Story highlights with album covers
- Story chains (collaborative stories)
- Sticker browser with custom stickers
- Story viewer with swipe navigation
- Close friends list for private stories
- Story reactions and replies
- "Add Yours" sticker support

**Reels:**
- Short-form vertical video creation and discovery
- Duet and stitch creation tools
- Reel remix functionality
- Reel templates library
- Trending audio browser
- Green screen editor
- Disposable camera effect
- Photo with music overlay

**Creator Tools:**
- Creator dashboard with analytics
- Creator storefront for digital products
- Branded content tools
- Post boosting / promotion
- Membership tiers for exclusive content
- Tip/donation system for followers
- Revenue tracking and cashout
- Collab requests management
- Post scheduling with calendar view

### Bakra (بكرة) — TikTok-Style

- Full-screen vertical video feed with gesture controls
- For You page with recommendation engine
- Trending audio library with popularity metrics
- Duet creation (side-by-side or top-bottom)
- Stitch creation (clip + react)
- Video editor with trimming, effects, and captions
- Green screen background replacement
- Disposable camera retro filter
- Auto-generated captions / subtitles
- Video reply to comments

### Majlis (المجلس) — X/Twitter-Style

- Threaded discussions with rich text
- Thread replies with likes and reactions
- "For You", "Following", and "Trending" feed tabs
- Hashtag exploration and trending topics
- Polls with multiple options and time limits
- Majlis lists for curated follows
- Thread bookmarking
- Community discourse tools
- Followed topics / interests

### Risalah (رسالة) — WhatsApp-Style

**Messaging:**
- 1:1 private conversations
- Group chats with admin tools
- Voice messages with waveform preview
- GIF picker integration
- Sticker packs (custom + browsable)
- Image, video, and file sharing
- Message reactions with emoji
- Swipe-to-reply gesture
- Message forwarding and editing
- Pinned messages
- Starred messages
- Message search within conversations
- Disappearing messages (timer-based)
- Chat export (text format)

**Calls:**
- Voice calls (1:1)
- Video calls (1:1)
- Call history log
- Call duration tracking

**Broadcast:**
- Broadcast channels (one-to-many)
- Channel creation and management
- Subscriber management

**Customization:**
- Chat themes and color pickers
- Chat wallpaper selection
- Notification tone customization
- Chat lock with biometric/PIN
- Conversation media gallery

**Privacy & Security:**
- End-to-end encryption key exchange
- Encryption verification screen
- Status privacy settings
- Disappearing message defaults
- Spoiler text (tap-to-reveal)
- View-once voice messages
- Secret code chat lock
- Member tags in group chats

**Telegram Features:**
- Saved messages (self-chat)
- Chat folders for organization
- Slow mode (configurable cooldown)
- Admin action log
- Group topics
- Custom emoji support

**Discord Features:**
- Forum-style threads
- Webhook integrations
- Stage sessions (structured audio)

### Minbar (المنبر) — YouTube-Style

- Long-form video hosting via Cloudflare Stream
- Channel creation and customization
- Channel subscriptions with notifications
- Playlists (create, edit, reorder)
- Watch history tracking
- Watch later queue
- Video comments with threading
- Video reactions and engagement
- Subtitle / caption tracks
- Live streaming with real-time chat
- Scheduled live events
- Audio rooms (Clubhouse-style)
- Video editor with trimming and effects
- Caption/description editor

### Cross-Platform Features

**AI-Powered (Tier 9)**
- AI content assistant (caption + hashtag suggestions)
- Auto-translate messages inline (Instagram 2026 parity)
- AI content moderation (safety scoring)
- Auto-generated video captions (Whisper)
- AI avatar generator (4 styles)
- Smart reply suggestions
- Content summarization (TLDR)
- Space routing (recommend best space for content)

**Gamification (Tier 10)**
- Daily streaks (posting, engagement, Quran, dhikr, learning)
- XP & leveling system
- Achievement badges (Common, Rare, Epic, Legendary)
- Global leaderboards
- Community challenges with progress tracking
- Content series with episode management
- Profile customization (accent color, layout, badges)

**Commerce (Tier 11)**
- Halal marketplace with product listings
- Muslim-owned business directory
- Zakat calculator with nisab rates
- Waqf (endowment) fund management
- Sadaqah/charity campaigns with Stripe
- Creator membership tiers
- Tip/donation system
- Revenue tracking and cashout

**Community (Tier 12)**
- Local community boards (location-based)
- Mentorship matching
- Study circles
- Fatwa Q&A
- Volunteer opportunity board
- Community events with RSVPs
- Voice posts
- Watch parties (synchronized viewing)
- Data export (GDPR-ready)

---

## Tech Stack

### Mobile App (`apps/mobile`)

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Runtime** | React Native | 0.76 | Cross-platform native UI |
| **Framework** | Expo | SDK 52 | Managed workflow, OTA updates |
| **Navigation** | Expo Router | 4.0 | File-based routing with typed routes |
| **State** | Zustand | 5.0 | Lightweight global state |
| **Server State** | TanStack React Query | 5.60 | Caching, pagination, mutations |
| **Animations** | React Native Reanimated | 3.16 | 60fps native animations |
| **Gestures** | React Native Gesture Handler | 2.20 | Swipe, pan, pinch, long-press |
| **Lists** | @shopify/flash-list | 2.0 | High-performance recycler lists |
| **Images** | expo-image | 2.0 | Fast image loading with caching |
| **Camera** | expo-camera | 16.0 | Photo/video capture |
| **Media** | expo-av | 15.0 | Audio/video playback |
| **Thumbnails** | expo-video-thumbnails | 9.0 | Video thumbnail generation |
| **Auth** | @clerk/clerk-expo | 2.5 | Authentication + session management |
| **i18n** | i18next + react-i18next | 25.8 / 16.5 | 8 languages (EN, AR, TR, UR, BN, FR, ID, MS) |
| **Realtime** | socket.io-client | 4.8 | WebSocket for chat + live features |
| **Storage** | react-native-mmkv | 3.2 | Fast key-value storage |
| **Secure Storage** | expo-secure-store | 14.0 | Encrypted credential storage |
| **Icons** | lucide-react-native | 0.468 | Consistent icon set |
| **Haptics** | expo-haptics | 14.0 | Tactile feedback |
| **Gradients** | expo-linear-gradient | 14.0 | Brand gradient overlays |
| **Blur** | expo-blur | 14.0 | Glassmorphism effects |
| **QR** | react-native-qrcode-svg | 6.3 | QR code generation |
| **SVG** | react-native-svg | 15.8 | Vector graphics |
| **Lightbox** | react-native-image-viewing | 0.2.2 | Full-screen image viewer |
| **Notifications** | expo-notifications | 0.29 | Push notification handling |
| **Network** | @react-native-community/netinfo | 11.4 | Connectivity detection |
| **Clipboard** | expo-clipboard | 7.0 | Copy/paste support |
| **Linking** | expo-linking | 7.0 | Deep linking |
| **Localization** | expo-localization | 55.0 | Device locale detection |
| **Fonts** | @expo-google-fonts/* | — | DM Sans, Noto Naskh Arabic, Playfair Display |
| **Web** | react-native-web | 0.19 | Expo Web + PWA support |

| Dev Tool | Purpose |
|----------|---------|
| TypeScript 5.7 | Type safety |
| ESLint 9 | Linting |
| Jest + jest-expo | Unit testing |
| @testing-library/react-native | Component testing |

### Backend API (`apps/api`)

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Framework** | NestJS | 10.4 | Modular Node.js backend |
| **ORM** | Prisma | 6.3 | Type-safe database access |
| **Database** | PostgreSQL | 16 | Primary data store (Neon serverless) |
| **Auth** | @clerk/backend | 1.21 | JWT verification + webhook handling |
| **Object Storage** | @aws-sdk/client-s3 | 3.700 | Cloudflare R2 presigned uploads |
| **Video** | Cloudflare Stream | — | Video transcoding + delivery |
| **Search** | Meilisearch | 0.46 | Full-text search with typo tolerance |
| **Cache** | ioredis | 5.10 | Upstash Redis for caching + rate limits |
| **Realtime** | Socket.io | 4.8 | WebSocket gateway (`/chat` namespace) |
| **Payments** | Stripe | 20.4 | Subscriptions, tips, donations |
| **Webhooks** | Svix | 1.45 | Webhook delivery (Clerk events) |
| **Monitoring** | @sentry/nestjs | 10.42 | Error tracking + performance |
| **Logging** | Pino + nestjs-pino | 10.3 | Structured JSON logging |
| **Security** | Helmet | 8.1 | HTTP security headers |
| **Rate Limiting** | @nestjs/throttler | 6.3 | Request throttling |
| **2FA** | otplib | 13.3 | TOTP two-factor authentication |
| **Image Processing** | Sharp | 0.33 | Resize, crop, format conversion |
| **QR Code** | qrcode | 1.5 | QR code generation (server-side) |
| **API Docs** | @nestjs/swagger | 8.1 | Auto-generated OpenAPI docs at `/docs` |
| **Validation** | class-validator + class-transformer | 0.14 / 0.5 | DTO validation + transformation |
| **Compression** | compression | 1.7 | Response gzip compression |

| Dev Tool | Purpose |
|----------|---------|
| TypeScript 5.7 | Type safety |
| Jest + ts-jest | Unit + integration testing |
| Supertest 7.2 | HTTP endpoint testing |
| @nestjs/testing | Module testing utilities |
| Prisma CLI | Schema management + migrations |
| pino-pretty | Dev-mode log formatting |

### Infrastructure

| Service | Provider | Purpose |
|---------|----------|---------|
| API Hosting | Railway | Container deployment with auto-scaling |
| Database | Neon | Serverless PostgreSQL with branching |
| Mobile Builds | Expo EAS | iOS + Android build pipeline |
| Object Storage | Cloudflare R2 | Images, files, media (S3-compatible) |
| Video Streaming | Cloudflare Stream | Video transcoding, HLS delivery, thumbnails |
| Full-Text Search | Meilisearch | Typo-tolerant search across users, posts, hashtags |
| Cache | Upstash Redis | Session cache, rate limiting, real-time state |
| Authentication | Clerk | User management, OAuth, webhooks |
| Payments | Stripe | Subscriptions, one-time payments, payouts |
| Error Tracking | Sentry | Crash reporting, performance monitoring |

---

## Architecture

### Monorepo Structure

```
mizanly/
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions: lint, test, build
│
├── apps/
│   ├── api/                          # NestJS backend (REST + WebSocket)
│   │   ├── prisma/
│   │   │   └── schema.prisma         # 188 models, 4,080 lines
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── prisma.service.ts # Prisma client singleton
│   │   │   ├── common/
│   │   │   │   ├── decorators/       # @CurrentUser, @Public, etc.
│   │   │   │   ├── guards/           # ClerkAuthGuard, OptionalClerkAuthGuard
│   │   │   │   ├── filters/          # Global exception filters
│   │   │   │   ├── interceptors/     # Response transform, logging
│   │   │   │   ├── middleware/       # Request middleware
│   │   │   │   ├── pipes/            # Validation pipes
│   │   │   │   └── utils/            # Shared utilities
│   │   │   ├── gateways/
│   │   │   │   ├── chat.gateway.ts   # Socket.io /chat namespace
│   │   │   │   └── dto/              # WebSocket event DTOs
│   │   │   └── modules/              # 79 feature modules
│   │   │       ├── admin/            # Admin dashboard endpoints
│   │   │       ├── audio-rooms/      # Clubhouse-style audio rooms
│   │   │       ├── audio-tracks/     # Music/nasheed library
│   │   │       ├── auth/             # Clerk auth + 2FA
│   │   │       ├── blocks/           # User blocking
│   │   │       ├── bookmarks/        # Post/thread/video bookmarks
│   │   │       ├── broadcast/        # Broadcast channels
│   │   │       ├── calls/            # Voice/video call signaling
│   │   │       ├── channel-posts/    # Minbar channel posts
│   │   │       ├── channels/         # Video channels (Minbar)
│   │   │       ├── chat-export/      # Conversation export
│   │   │       ├── circles/          # Close friend circles
│   │   │       ├── collabs/          # Post collaborations
│   │   │       ├── communities/      # Community groups
│   │   │       ├── creator/          # Creator dashboard + analytics
│   │   │       ├── devices/          # Device management + push tokens
│   │   │       ├── drafts/           # Draft post storage
│   │   │       ├── encryption/       # E2E encryption keys
│   │   │       ├── events/           # Event creation + RSVPs
│   │   │       ├── feed/             # Feed algorithms + personalization
│   │   │       ├── follows/          # Follow/unfollow + requests
│   │   │       ├── gifts/            # Virtual gift shop
│   │   │       ├── hashtags/         # Hashtag CRUD + trending
│   │   │       ├── health/           # Health check endpoint
│   │   │       ├── islamic/          # All Islamic features (30+ endpoints)
│   │   │       ├── live/             # Live streaming sessions
│   │   │       ├── majlis-lists/     # Curated follow lists
│   │   │       ├── messages/         # Chat messages CRUD
│   │   │       ├── moderation/       # Content moderation + reports
│   │   │       ├── monetization/     # Memberships + revenue
│   │   │       ├── mutes/            # User/conversation muting
│   │   │       ├── notifications/    # Push + in-app notifications
│   │   │       ├── payments/         # Stripe payment processing
│   │   │       ├── playlists/        # Video playlists
│   │   │       ├── polls/            # Poll creation + voting
│   │   │       ├── posts/            # Post CRUD + feed
│   │   │       ├── privacy/          # Privacy settings
│   │   │       ├── profile-links/    # Bio link management
│   │   │       ├── promotions/       # Post promotion/boosting
│   │   │       ├── recommendations/  # User/content suggestions
│   │   │       ├── reel-templates/   # Reusable reel templates
│   │   │       ├── reels/            # Short video CRUD
│   │   │       ├── reports/          # User report submission
│   │   │       ├── restricts/        # Soft user restriction
│   │   │       ├── scheduling/       # Post/live scheduling
│   │   │       ├── search/           # Meilisearch integration
│   │   │       ├── settings/         # User settings CRUD
│   │   │       ├── stickers/         # Sticker packs + browser
│   │   │       ├── stories/          # Story CRUD + highlights
│   │   │       ├── story-chains/     # Collaborative story chains
│   │   │       ├── stream/           # Cloudflare Stream integration
│   │   │       ├── subtitles/        # Video subtitle tracks
│   │   │       ├── threads/          # Majlis thread CRUD
│   │   │       ├── two-factor/       # 2FA setup + verification
│   │   │       ├── upload/           # Presigned upload URLs (R2)
│   │   │       ├── users/            # User profiles + search
│   │   │       ├── video-replies/    # Video comment replies
│   │   │       ├── videos/           # Long-form video CRUD
│   │   │       └── watch-history/    # Video watch tracking
│   │   ├── Dockerfile                # Production container
│   │   └── railway.json              # Railway deployment config
│   │
│   └── mobile/                       # React Native (Expo SDK 52)
│       ├── app/                      # File-based routing (Expo Router)
│       │   ├── _layout.tsx           # Root layout + providers + biometric lock
│       │   ├── index.tsx             # Entry redirect
│       │   ├── sign-in.tsx           # Authentication
│       │   ├── sign-up.tsx           # Registration
│       │   ├── username.tsx          # Username selection
│       │   ├── interests.tsx         # Onboarding interests
│       │   ├── +html.tsx             # Web HTML template
│       │   ├── (tabs)/              # Bottom tab navigator
│       │   │   ├── _layout.tsx       # Tab bar configuration
│       │   │   ├── saf.tsx           # Instagram-style feed
│       │   │   ├── bakra.tsx         # TikTok-style video feed
│       │   │   ├── majlis.tsx        # X/Twitter-style threads
│       │   │   ├── risalah.tsx       # WhatsApp-style conversations
│       │   │   ├── minbar.tsx        # YouTube-style channels
│       │   │   └── create.tsx        # Universal create button
│       │   └── (screens)/            # 209 detail/utility screens
│       │       ├── conversation/     # Chat screens (per conversation)
│       │       ├── post/             # Post detail views
│       │       ├── profile/          # User profile views
│       │       ├── channel/          # Channel views
│       │       ├── video/            # Video player views
│       │       ├── reel/             # Reel player views
│       │       ├── thread/           # Thread detail views
│       │       ├── live/             # Live stream views
│       │       ├── playlist/         # Playlist views
│       │       ├── hashtag/          # Hashtag feed views
│       │       ├── broadcast/        # Broadcast views
│       │       ├── call/             # Call screens
│       │       ├── followers/        # Follower lists
│       │       ├── following/        # Following lists
│       │       ├── reports/          # Report views
│       │       ├── sound/            # Sound/audio views
│       │       └── playlists/        # Playlist browser
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/              # 70 reusable UI components (Toast, ProgressiveImage, SocialProof, BrandedRefreshControl, etc.)
│       │   │   └── islamic/         # Islamic-specific components
│       │   ├── hooks/               # 23 custom hooks (useContextualHaptic, useStaggeredEntrance, useScrollLinkedHeader, etc.)
│       │   ├── services/            # 32 API service files
│       │   ├── stores/              # Zustand global store
│       │   ├── theme/               # Design tokens
│       │   ├── types/               # TypeScript interfaces
│       │   ├── utils/               # Utility functions (Hijri dates, formatCount, navigation, RTL, etc.)
│       │   └── i18n/                # Translations (8 languages: EN, AR, TR, UR, BN, FR, ID, MS)
│       ├── assets/
│       │   └── images/              # App icon, splash, adaptive icon
│       └── app.json                 # Expo configuration
│
├── packages/
│   └── shared/                      # Shared types & constants
│
├── docker-compose.yml               # Local dev: Postgres + Redis + Meilisearch
├── package.json                     # Workspace root
├── CLAUDE.md                        # AI agent development guide
└── ARCHITECT_INSTRUCTIONS.md        # Current batch blueprint
```

---

## Design System

Mizanly uses a custom dark-mode-first design system with glassmorphism aesthetics, defined in `apps/mobile/src/theme/index.ts`.

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.emerald` | `#0A7B4F` | Primary brand, buttons, active states |
| `colors.emeraldLight` | `#0D9B63` | Hover/pressed states |
| `colors.emeraldDark` | `#066B42` | Gradient endpoints |
| `colors.gold` | `#C8963E` | Accent, Islamic features, scholar badges |
| `colors.goldLight` | `#D4A94F` | Gold highlights |
| `colors.cream` | `#FEFCF7` | Light mode backgrounds |

### Dark Theme (Primary)

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.dark.bg` | `#0D1117` | Main background |
| `colors.dark.bgElevated` | `#161B22` | Elevated surfaces |
| `colors.dark.bgCard` | `#1C2333` | Cards, list items |
| `colors.dark.bgSheet` | `#21283B` | Bottom sheets |
| `colors.dark.surface` | `#2D3548` | Input backgrounds |
| `colors.dark.border` | `#30363D` | Borders, dividers |

### Light Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.light.bg` | `#FFFFFF` | Main background |
| `colors.light.bgElevated` | `#F6F8FA` | Elevated surfaces |
| `colors.light.bgCard` | `#FFFFFF` | Cards |
| `colors.light.surface` | `#F3F4F6` | Input backgrounds |
| `colors.light.border` | `#D0D7DE` | Borders |

### Text Colors

| Token | Hex |
|-------|-----|
| `colors.text.primary` | `#FFFFFF` |
| `colors.text.secondary` | `#8B949E` |
| `colors.text.tertiary` | `#6E7781` |
| `colors.text.inverse` | `#1E293B` |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.error` | `#F85149` | Errors, destructive actions |
| `colors.warning` | `#D29922` | Warnings |
| `colors.success` | `#0A7B4F` | Success states |
| `colors.info` | `#58A6FF` | Informational |
| `colors.live` | `#FF3B3B` | Live indicators |
| `colors.like` | `#F85149` | Like/heart actions |
| `colors.bookmark` | `#C8963E` | Bookmark actions |

### Glass Overlays

| Token | Value |
|-------|-------|
| `colors.glass.dark` | `rgba(13, 17, 23, 0.75)` |
| `colors.glass.darkHeavy` | `rgba(13, 17, 23, 0.90)` |
| `colors.glass.light` | `rgba(255, 255, 255, 0.15)` |
| `colors.glass.border` | `rgba(255, 255, 255, 0.12)` |

### Typography

| Font | Registered Family Name | Usage |
|------|------------------------|-------|
| **DM Sans** | `DMSans_400Regular`, `DMSans_500Medium`, `DMSans_700Bold` | Body text, UI elements |
| **Noto Naskh Arabic** | `NotoNaskhArabic_400Regular`, `NotoNaskhArabic_700Bold` | Arabic text, Quran verses |
| **Playfair Display** | `PlayfairDisplay_700Bold` | Headings, logo, display text |

> **Important:** Font family names must match the exact registered names from `useFonts()`, NOT the human-readable names. Use the `fonts.*` tokens from `theme/index.ts`.

### Font Sizes

| Token | Size |
|-------|------|
| `fontSize.xs` | 11px |
| `fontSize.sm` | 13px |
| `fontSize.base` | 15px |
| `fontSize.lg` | 17px |
| `fontSize.xl` | 20px |
| `fontSize['2xl']` | 24px |

### Line Heights

| Token | Size |
|-------|------|
| `lineHeight.xs` | 16px |
| `lineHeight.sm` | 18px |
| `lineHeight.base` | 22px |
| `lineHeight.md` | 24px |
| `lineHeight.lg` | 28px |
| `lineHeight.xl` | 32px |

### Letter Spacing

| Token | Size | Usage |
|-------|------|-------|
| `letterSpacing.tight` | -1.2 | Hero/display text |
| `letterSpacing.snug` | -0.8 | Headings |
| `letterSpacing.normal` | 0 | Body text |
| `letterSpacing.wide` | 0.5 | Labels/captions |
| `letterSpacing.wider` | 1.0 | ALL CAPS labels |

---

## UI/UX Elevation (March 2026)

87 commits across 272 files elevated every screen from prototype quality to Instagram/TikTok-level polish:

**Design System:** Modern Dark Cinema Mobile style — cinematic easing (`Easing.bezier(0.16, 1, 0.3, 1)`), spring physics on all modals/sheets, glassmorphic tab bar + headers, emerald brand shimmer.

**Universal Patterns Applied to ALL 209 Screens:**
- `useContextualHaptic` — 10 semantic haptic patterns (like, follow, save, navigate, tick, delete, error, longPress, send, success)
- `BrandedRefreshControl` — emerald+gold branded pull-to-refresh on every list
- `ProgressiveImage` — blurhash placeholder + crossfade on every content image
- `formatCount()` — engagement numbers display as "1.2K", "3.5M" everywhere
- `showToast()` — every mutation has success/error feedback
- Staggered entrance animations on every list (40ms delay per item, cinematic easing)
- Theme-aware colors (`tc.*` from `useThemeColors`) — 0 hardcoded color props, light mode works everywhere

**Hero Screen Features:**
- Saf: SocialProof on PostCard, comment preview, DM shortcut, "New posts" banner, double-tap heart
- Bakra: Following/For You tabs, tap-to-pause, sound marquee, 44px audio disc, camera recording
- Profile: Stretchy cover, sticky tab bar, follow pulse animation
- Prayer Times: Sky gradient by time-of-day, per-prayer adhan toggles, Qibla direction card, offline cache
- Discover: Auto-play video thumbnails, masonry grid pattern
- Notifications: Content thumbnails, inline follow-back button
- Settings: Search bar with real-time section filtering
- Story Viewer: Swipe between users
- Thread: Nested/indented replies, multi-image grid (2x2, 1+2, 1+3), comment sorting
- Detail screens: Sticky glass action bar
- Create flows: Discard BottomSheet (Save Draft / Discard / Cancel)

---

## UI Component Library

70 reusable UI components in `apps/mobile/src/components/`:

| Component | File | Description |
|-----------|------|-------------|
| **ActionButton** | `ActionButton.tsx` | Floating action button with gradient |
| **Autocomplete** | `Autocomplete.tsx` | Hashtag/mention autocomplete dropdown |
| **Avatar** | `Avatar.tsx` | User avatar with animated rotating story ring (unseen=gradient rotation, viewed=gray), online pulse dot, blurhash placeholder |
| **Badge** | `Badge.tsx` | Notification count badge — only bounces on 0→positive transition (no jarring re-animation) |
| **BottomSheet** | `BottomSheet.tsx` | Spring physics bottom sheet with handle pulse, velocity-based dismiss, rubberband overscroll, scrollable content support |
| **BrandedRefreshControl** | `BrandedRefreshControl.tsx` | Emerald+gold branded RefreshControl used on all pull-to-refresh lists |
| **CaughtUpCard** | `CaughtUpCard.tsx` | "You're all caught up" end-of-feed card |
| **CharCountRing** | `CharCountRing.tsx` | Animated SVG circular character count with interpolated green→gold→red color transition |
| **DoubleTapHeart** | `DoubleTapHeart.tsx` | Instagram-style double-tap heart animation overlay |
| **EmptyState** | `EmptyState.tsx` | Staggered entrance animation (icon→title→subtitle→button), optional illustration slot, pulsing CTA |
| **EndScreenOverlay** | `EndScreenOverlay.tsx` | Video end-screen overlay with suggested content cards |
| **FadeIn** | `FadeIn.tsx` | Fade-in animation wrapper component |
| **FloatingHearts** | `FloatingHearts.tsx` | Wide-spread (±60px) heart explosion with horizontal drift, stagger cascade, size variation |
| **GlassHeader** | `GlassHeader.tsx` | Glassmorphism navigation header with blur effect, scroll-linked elastic collapse support |
| **GradientButton** | `GradientButton.tsx` | Emerald gradient button with deeper press scale (0.94), loading glow pulse, success variant |
| **Icon** | `Icon.tsx` | React.memo'd Lucide icon wrapper with size presets — prevents 269+ unnecessary re-renders |
| **ImageCarousel** | `ImageCarousel.tsx` | Horizontal swipeable image carousel with pagination dots |
| **ImageGallery** | `ImageGallery.tsx` | Grid image gallery with tap-to-view |
| **ImageLightbox** | `ImageLightbox.tsx` | Full-screen image viewer with pinch-to-zoom |
| **LinkPreview** | `LinkPreview.tsx` | URL preview card with title, description, and thumbnail |
| **LocationPicker** | `LocationPicker.tsx` | Location search and selection |
| **MiniPlayer** | `MiniPlayer.tsx` | Floating mini audio/video player |
| **OfflineBanner** | `OfflineBanner.tsx` | Animated network warning with retry button, "Showing cached content" subtitle |
| **PremiereCountdown** | `PremiereCountdown.tsx` | Video premiere countdown timer overlay |
| **ProgressiveImage** | `ProgressiveImage.tsx` | Blurhash placeholder + 300ms crossfade wrapper for expo-image. Used for ALL content images. |
| **RichText** | `RichText.tsx` | Text with parsed hashtags, mentions, and links |
| **ScreenErrorBoundary** | `ScreenErrorBoundary.tsx` | Error boundary wrapper for every screen |
| **Skeleton** | `Skeleton.tsx` | Emerald brand shimmer wave loading skeletons (Rect, Circle, PostCard, ThreadCard, etc.) |
| **SocialProof** | `SocialProof.tsx` | "Liked by [avatar] username and N others" — stacked overlapping avatars with count |
| **TabBarIndicator** | `TabBarIndicator.tsx` | Animated underline indicator for tab bars |
| **TabSelector** | `TabSelector.tsx` | Animated tab bar with spring indicator, haptic tick on change |
| **Toast** | `Toast.tsx` | Glass card toast notification with swipe dismiss, auto-dismiss progress bar, 4 variants (success/error/warning/info). `showToast()` callable from anywhere. |
| **VerifiedBadge** | `VerifiedBadge.tsx` | Verified checkmark (emerald) or scholar badge (gold star) |
| **VideoControls** | `VideoControls.tsx` | Video playback controls overlay |
| **VideoPlayer** | `VideoPlayer.tsx` | Full-featured video player component |
| **WebSafeBlurView** | `WebSafeBlurView.tsx` | Cross-platform blur that works on web |

### Islamic Components (`src/components/islamic/`)

| Component | Description |
|-----------|-------------|
| **EidFrame** | Decorative frame component for 6 Islamic occasions with themed borders and patterns |

---

## Custom Hooks

23 hooks in `apps/mobile/src/hooks/`:

| Hook | File | Description |
|------|------|-------------|
| `useAmbientColor` | `useAmbientColor.ts` | Extracts dominant color from image for ambient UI theming |
| `useAnimatedIcon` | `useAnimatedIcon.ts` | Triggered icon animations: bounce (heart), shake (bell), pulse (bookmark), spin. Returns { animatedStyle, trigger } |
| `useAnimatedPress` | `useAnimatedPress.ts` | Scale animation on press with Reanimated |
| `useBackgroundUpload` | `useBackgroundUpload.ts` | Background file upload with progress tracking |
| `useChatLock` | `useChatLock.ts` | Chat-level biometric/PIN lock state |
| `useContextualHaptic` | `useContextualHaptic.ts` | **PRIMARY haptic hook** — 10 semantic patterns: like, follow, save, navigate, tick, delete, error, longPress, send, success |
| `useEntranceAnimation` | `useEntranceAnimation.ts` | Screen entrance fade/slide animations |
| `useFpsMonitor` | `useFpsMonitor.ts` | Frame rate monitoring for performance debugging |
| `useHaptic` | `useHaptic.ts` | (DEPRECATED — use useContextualHaptic instead) Basic haptic feedback triggers |
| `useIsWeb` | `useIsWeb.ts` | Platform detection for web-specific logic |
| `useNetworkStatus` | `useNetworkStatus.ts` | Online/offline connectivity state |
| `usePayment` | `usePayment.ts` | Stripe payment flow hook |
| `usePiP` | `usePiP.ts` | Picture-in-picture video mode management |
| `usePulseGlow` | `usePulseGlow.ts` | Pulsing glow animation for live indicators |
| `usePushNotificationHandler` | `usePushNotificationHandler.ts` | Push notification response handling |
| `usePushNotifications` | `usePushNotifications.ts` | Push notification registration and permissions |
| `useReducedMotion` | `useReducedMotion.ts` | Detects system reduced motion preference for accessibility |
| `useResponsive` | `useResponsive.ts` | Responsive layout breakpoints |
| `useScrollDirection` | `useScrollDirection.ts` | (DEPRECATED — use useScrollLinkedHeader instead) Binary scroll direction detection |
| `useScrollLinkedHeader` | `useScrollLinkedHeader.ts` | Elastic header collapse with proportional blur — replaces binary show/hide. Returns onScroll, headerAnimatedStyle, titleAnimatedStyle, blurIntensity |
| `useStaggeredEntrance` | `useStaggeredEntrance.ts` | Cinematic stagger fade+slide for list items — delays based on index, uses Easing.bezier(0.16,1,0.3,1) |
| `useThemeColors` | `useThemeColors.ts` | Theme-aware surface/text colors — responds to OS dark/light changes when theme='system' |
| `useTranslation` | `useTranslation.ts` | i18n translation function with RTL awareness |
| `useVideoPreload` | `useVideoPreload.ts` | Preloads next videos in feed for smooth scrolling |
| `useWebKeyboardShortcuts` | `useWebKeyboardShortcuts.ts` | Keyboard shortcuts for web platform |

---

## Service Layer

32 API service files in `apps/mobile/src/services/`:

| Service | File | Description |
|---------|------|-------------|
| **Core API** | `api.ts` | Base Axios client with auth interceptor, all core endpoints |
| **Audio Rooms** | `audioRoomsApi.ts` | Audio room CRUD + participant management |
| **Chat Export** | `chatExportApi.ts` | Conversation export generation |
| **Communities** | `communitiesApi.ts` | Community group endpoints |
| **Creator** | `creatorApi.ts` | Creator dashboard, analytics, storefronts |
| **Download Manager** | `downloadManager.ts` | Offline content download queue and storage management |
| **Encryption** | `encryption.ts` | Client-side E2E encryption utilities |
| **Encryption API** | `encryptionApi.ts` | Key exchange + envelope endpoints |
| **Events** | `eventsApi.ts` | Event CRUD + RSVP |
| **Gifts** | `giftsApi.ts` | Virtual gift shop + sending |
| **Islamic** | `islamicApi.ts` | All Islamic feature endpoints (prayer, Quran, dhikr, etc.) |
| **Monetization** | `monetizationApi.ts` | Memberships, tiers, revenue |
| **Offline Cache** | `offlineCache.ts` | Local-first caching for offline-capable features |
| **Payments** | `paymentsApi.ts` | Stripe payment intents + subscriptions |
| **Promotions** | `promotionsApi.ts` | Post boosting + promotion management |
| **Push Notifications** | `pushNotifications.ts` | Push token registration + preferences |
| **Reel Templates** | `reelTemplatesApi.ts` | Reel template library endpoints |
| **Two-Factor** | `twoFactorApi.ts` | 2FA setup, verify, disable |
| **Widget Data** | `widgetData.ts` | iOS/Android widget data provider (prayer times, streaks) |

---

## Backend Modules

All 79 NestJS modules in `apps/api/src/modules/`:

<details>
<summary>Click to expand full module list with descriptions</summary>

| Module | Description |
|--------|-------------|
| `admin` | Admin dashboard — user management, content review, platform stats |
| `audio-rooms` | Clubhouse-style audio rooms — create, join, speaker management |
| `audio-tracks` | Music/nasheed library — upload, browse, trending tracks |
| `auth` | Clerk authentication — JWT verification, webhook handling, rate-limited sign-up |
| `blocks` | User blocking — block/unblock + blocked list |
| `bookmarks` | Post/thread/video bookmarks with folder organization |
| `broadcast` | Broadcast channels — one-to-many messaging for creators |
| `calls` | Voice/video call signaling via WebSocket |
| `channel-posts` | Minbar channel community posts |
| `channels` | Video channels — create, subscribe, manage |
| `chat-export` | Conversation export to text format |
| `circles` | Close friend circles — create, invite, manage members |
| `collabs` | Post collaboration requests and management |
| `communities` | Community groups with posts and membership |
| `creator` | Creator dashboard — analytics, revenue, storefront |
| `devices` | Device management — push tokens, active sessions |
| `drafts` | Draft post auto-save and retrieval |
| `embeddings` | Gemini text-embedding-004 — pgvector KNN similarity, content embedding pipeline, user interest vectors |
| `encryption` | End-to-end encryption — key exchange, conversation envelopes |
| `events` | Event creation — date, location, RSVPs, reminders |
| `feed` | Feed algorithms — "For You" personalization, interaction tracking |
| `follows` | Follow/unfollow — follow requests, mutual followers |
| `gifts` | Virtual gift shop — purchase, send, receive animated gifts |
| `hashtags` | Hashtag CRUD — trending calculation, follow hashtags |
| `health` | Health check endpoint for deployment monitoring |
| `islamic` | All Islamic features — prayer times, Quran plans, tafsir, dhikr, hajj, charity, scholar verification, content filter, nasheed mode (30+ endpoints) |
| `live` | Live streaming — create session, participants, real-time chat |
| `majlis-lists` | Curated follow lists for Majlis space |
| `messages` | Chat messages — send, edit, delete, reactions, pins, stars |
| `moderation` | Content moderation — auto-flagging, manual review, appeals |
| `monetization` | Membership tiers — subscriptions, exclusive content access |
| `mutes` | User and conversation muting |
| `notifications` | Push + in-app notifications — preferences, filters, mark read |
| `payments` | Stripe integration — payment intents, subscriptions, payouts |
| `playlists` | Video playlists — create, reorder, add/remove items |
| `polls` | Poll creation — multiple options, time limits, voting |
| `posts` | Post CRUD — feed, comments, reactions, shares, insights |
| `privacy` | Privacy settings — profile visibility, activity status |
| `profile-links` | Bio link management — add, reorder, analytics |
| `promotions` | Post boosting — budget, targeting, reach metrics |
| `recommendations` | User/content recommendation engine |
| `reel-templates` | Reusable reel templates — browse, use, create |
| `reels` | Short video CRUD — reactions, comments, interactions |
| `reports` | User report submission — categories, evidence, status tracking |
| `restricts` | Soft user restriction — limit interactions without blocking |
| `retention` | Engagement — reel view milestones, streak warnings, social FOMO, session depth tracking |
| `scheduling` | Post and live event scheduling with calendar |
| `search` | Meilisearch integration — users, posts, hashtags, channels |
| `settings` | User settings — screen time, undo send, auto-play, notifications |
| `stickers` | Sticker packs — browse, purchase, use in chat |
| `stories` | Story CRUD — upload, view tracking, highlights, chains |
| `story-chains` | Collaborative story chains — invite, contribute, view |
| `stream` | Cloudflare Stream integration — upload, transcode, deliver |
| `subtitles` | Video subtitle tracks — upload, auto-generate |
| `threads` | Majlis thread CRUD — replies, reactions, bookmarks |
| `two-factor` | 2FA — TOTP setup, QR generation, verification, disable |
| `upload` | Presigned upload URLs — file validation (100MB max), R2 integration |
| `users` | User profiles — CRUD, search, contact sync, suggestions |
| `video-replies` | Video comment replies — record + attach video responses |
| `videos` | Long-form video CRUD — comments, reactions, chapters |
| `watch-history` | Video watch tracking — history, watch later queue |
| `webhooks` | Community webhook system — HMAC-SHA256 signed delivery, retry with exponential backoff, event dispatching |
| `commerce` | Halal marketplace — products, orders, Islamic finance |
| `community` | Community features — local boards, mentorship, fatwa Q&A, waqf |
| `discord-features` | Discord parity — forum threads, webhooks, stage sessions |
| `telegram-features` | Telegram parity — saved messages, chat folders, slow mode, admin log |
| `downloads` | Offline content downloads |
| `gamification` | Streaks, XP, achievements, challenges, series, profile customization |
| `parental-controls` | Child account linking, restrictions, activity digest |
| `clips` | Video clip creation from long-form content |
| `ai` | AI features — captions, hashtags, translate, moderate, avatar, smart replies |

</details>

---

## Database Schema (193 Models, 55 Enums)

The Prisma schema (`apps/api/prisma/schema.prisma`) contains 188 models across 4,080 lines with 450+ relations. Models are organized by domain:

<details>
<summary>Click to expand all 188 models grouped by domain</summary>

### Core Social (8 models)
`User` `Follow` `FollowRequest` `Post` `Comment` `PostReaction` `CommentReaction` `SavedPost`

### Stories & Reels (11 models)
`Story` `StoryView` `StoryHighlightAlbum` `StoryStickerResponse` `StoryChain` `StoryChainEntry` `Reel` `ReelReaction` `ReelComment` `ReelInteraction` `ReelTemplate`

### Threads / Majlis (7 models)
`Thread` `ThreadReaction` `ThreadReply` `ThreadReplyLike` `ThreadBookmark` `MajlisList` `MajlisListMember`

### Video / Minbar (14 models)
`Channel` `Video` `VideoComment` `VideoReaction` `VideoInteraction` `VideoReply` `VideoBookmark` `Subscription` `Playlist` `PlaylistItem` `ChannelPost` `SubtitleTrack` `WatchHistory` `WatchLater`

### Messaging / Risalah (9 models)
`Conversation` `ConversationMember` `Message` `MessageReaction` `BroadcastChannel` `ChannelMember` `BroadcastMessage` `EncryptionKey` `ConversationKeyEnvelope`

### Calls & Live (6 models)
`CallSession` `CallParticipant` `LiveSession` `LiveParticipant` `AudioRoom` `AudioRoomParticipant`

### Social Features (17 models)
`Circle` `CircleMember` `CircleInvite` `Notification` `Report` `ModerationLog` `Block` `Mute` `Restrict` `Hashtag` `HashtagFollow` `Poll` `PollOption` `PollVote` `FeedInteraction` `FeedDismissal` `UserInterest`

### Creator Economy (9 models)
`CreatorStat` `Tip` `MembershipTier` `MembershipSubscription` `PostPromotion` `PostReminder` `CoinBalance` `CoinTransaction` `GiftRecord`

### Media & Content (8 models)
`AudioTrack` `StickerPack` `Sticker` `UserStickerPack` `DraftPost` `ProfileLink` `PostCollab` `BlockedKeyword`

### Islamic (10 models)
`QuranReadingPlan` `DhikrSession` `DhikrChallenge` `DhikrChallengeParticipant` `CharityDonation` `CharityCampaign` `HajjProgress` `PrayerNotificationSetting` `ContentFilterSetting` `ScholarVerification`

### Settings & Security (8 models)
`UserSettings` `Device` `TwoFactorSecret` `DMNote` `ScreenTimeLog` `QuietModeSetting` `Event` `EventRSVP`

</details>

---

## WebSocket Gateway

Real-time features are powered by a Socket.io gateway at the `/chat` namespace (`apps/api/src/gateways/chat.gateway.ts`):

### Connection
- JWT authentication via Clerk token
- Online presence tracking (`Map<userId, Set<socketId>>`)
- Heartbeat: `pingInterval: 25000ms`, `pingTimeout: 60000ms`

### Chat Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `send_message` | Client -> Server | Send a message to a conversation |
| `join_conversation` | Client -> Server | Join a conversation room |
| `typing` | Client -> Server | Typing indicator broadcast |
| `read_receipt` | Client -> Server | Mark messages as read |
| `new_message` | Server -> Client | New message received |
| `message_updated` | Server -> Client | Message edited |
| `message_deleted` | Server -> Client | Message deleted |
| `user_typing` | Server -> Client | Someone is typing |

### Call Signaling

| Event | Direction | Description |
|-------|-----------|-------------|
| `call_initiate` | Client -> Server | Start a call |
| `call_answer` | Client -> Server | Accept a call |
| `call_reject` | Client -> Server | Decline a call |
| `call_end` | Client -> Server | End a call |
| `call_signal` | Bidirectional | WebRTC signaling data |

### Quran Room Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join_quran_room` | Client -> Server | Join a communal reading room |
| `leave_quran_room` | Client -> Server | Leave a reading room |
| `quran_verse_sync` | Client -> Server | Host navigates to a verse |
| `quran_reciter_change` | Client -> Server | Host changes the reciter |
| `quran_room_update` | Server -> Client | Full room state broadcast |
| `quran_verse_changed` | Server -> Client | Verse navigation broadcast |
| `quran_reciter_updated` | Server -> Client | Reciter change broadcast |

---

## Internationalization (i18n)

Mizanly supports 8 languages with full RTL layout support for Arabic and Urdu. All language files maintain 100% key parity (3,173+ keys each), plus 103 dedicated accessibility keys.

| File | Keys | Description |
|------|------|-------------|
| `en.json` | 3,173+ | English (primary) |
| `ar.json` | 3,173+ | Arabic (RTL) |
| `tr.json` | 3,173+ | Turkish |
| `ur.json` | 3,173+ | Urdu (RTL) |
| `bn.json` | 3,173+ | Bengali |
| `fr.json` | 3,173+ | French |
| `id.json` | 3,173+ | Indonesian |
| `ms.json` | 3,173+ | Malay |
| `index.ts` | — | i18next config with automatic device locale detection |

**Implementation:**
- Every screen uses `useTranslation()` hook
- All user-facing strings use `t('key.path')` function
- Arabic and Urdu text renders with `NotoNaskhArabic` font family
- RTL layout automatically applied based on locale
- Quran verses display in Arabic with parallel translation
- Locale detection: `ar` → Arabic, `tr` → Turkish, `ur` → Urdu, `bn` → Bengali, `fr` → French, `id`/`ms` → Indonesian/Malay, else → English
- Adding a language: create `xx.json`, import in `index.ts`, add to `resolveLanguage()`

---

## All Screens (212 Total)

<details>
<summary>Click to expand complete screen list</summary>

### Root Screens (7)
| Screen | Description |
|--------|-------------|
| `_layout.tsx` | Root layout with providers, biometric lock overlay |
| `index.tsx` | Entry redirect (auth check) |
| `sign-in.tsx` | Email/password sign-in |
| `sign-up.tsx` | Registration flow |
| `username.tsx` | Username selection (onboarding) |
| `interests.tsx` | Interest selection (onboarding) |
| `+html.tsx` | Web HTML template |

### Tab Screens (7)
| Screen | Space | Description |
|--------|-------|-------------|
| `(tabs)/_layout.tsx` | — | Tab bar with 5 spaces + create |
| `(tabs)/saf.tsx` | Saf | Instagram-style feed (For You / Following) |
| `(tabs)/bakra.tsx` | Bakra | TikTok-style vertical video feed |
| `(tabs)/majlis.tsx` | Majlis | X-style thread feed (For You / Following / Trending) |
| `(tabs)/risalah.tsx` | Risalah | WhatsApp-style conversation list |
| `(tabs)/minbar.tsx` | Minbar | YouTube-style channel/video feed |
| `(tabs)/create.tsx` | — | Universal content creation |

### Detail Screens (183 top-level + 18 nested directories)

**Authentication & Security**
| Screen | Description |
|--------|-------------|
| `2fa-setup.tsx` | Two-factor authentication setup with QR code |
| `2fa-verify.tsx` | 2FA verification code entry |
| `biometric-lock.tsx` | Face ID / fingerprint lock toggle |
| `verify-encryption.tsx` | E2E encryption key verification |

**Profile & Settings**
| Screen | Description |
|--------|-------------|
| `edit-profile.tsx` | Edit name, bio, avatar, cover photo |
| `account-settings.tsx` | Account management (email, password, delete) |
| `account-switcher.tsx` | Multi-account switching |
| `settings.tsx` | Main settings hub |
| `theme-settings.tsx` | Dark/light/system theme selection |
| `content-settings.tsx` | Content preference settings |
| `media-settings.tsx` | Auto-play and media quality settings |
| `notification-tones.tsx` | Per-conversation notification sounds |
| `manage-data.tsx` | Data usage and storage management |
| `storage-management.tsx` | Clear cache, download management |
| `share-profile.tsx` | Profile sharing with QR code |
| `qr-code.tsx` | QR code display for profile |
| `qr-scanner.tsx` | QR code scanner to add friends |
| `close-friends.tsx` | Close friends list management |
| `blocked.tsx` | Blocked users list |
| `blocked-keywords.tsx` | Keyword-based content filtering |
| `muted.tsx` | Muted accounts list |
| `restricted.tsx` | Restricted accounts list |
| `contact-sync.tsx` | Phone contact sync to find friends |
| `status-privacy.tsx` | Online status visibility settings |
| `disappearing-settings.tsx` | Disappearing message preferences |
| `disappearing-default.tsx` | Default disappearing timer |

**Feed & Discovery**
| Screen | Description |
|--------|-------------|
| `discover.tsx` | Explore/discover page with categories |
| `search.tsx` | Global search (users, posts, hashtags, channels) |
| `search-results.tsx` | Search results with filters |
| `hashtag-explore.tsx` | Posts by hashtag |
| `trending-audio.tsx` | Trending audio library |
| `followed-topics.tsx` | Managed followed topics/interests |
| `suggested.tsx` | Suggested users to follow |
| `mutual-followers.tsx` | Mutual followers between users |
| `follow-requests.tsx` | Pending follow request management |
| `why-showing.tsx` | "Why am I seeing this?" transparency |

**Post Creation & Management**
| Screen | Description |
|--------|-------------|
| `create-post.tsx` | New photo/video post composer |
| `create-story.tsx` | New story composer |
| `create-reel.tsx` | New reel/short video composer |
| `create-thread.tsx` | New Majlis thread composer |
| `create-video.tsx` | New long-form video uploader |
| `caption-editor.tsx` | Rich caption editor with hashtags/mentions |
| `image-editor.tsx` | Photo editing (crop, filters, adjust) |
| `video-editor.tsx` | Video trimming and effects |
| `camera.tsx` | Camera capture screen |
| `location-picker.tsx` | Location tag selection |
| `schedule-post.tsx` | Schedule post for future publication |
| `drafts.tsx` | Saved draft posts |
| `archive.tsx` | Archived posts |
| `sticker-browser.tsx` | Browse and select stickers |

**Reels & Short Video**
| Screen | Description |
|--------|-------------|
| `reel-templates.tsx` | Browse reel templates |
| `reel-remix.tsx` | Remix an existing reel |
| `duet-create.tsx` | Side-by-side duet creation |
| `stitch-create.tsx` | Clip + react stitch creation |
| `green-screen-editor.tsx` | Green screen background replacement |
| `disposable-camera.tsx` | Retro disposable camera filter |
| `photo-music.tsx` | Photo slideshow with music |
| `voice-recorder.tsx` | Voice recording for messages/posts |
| `audio-library.tsx` | Browse audio tracks |

**Messaging (Risalah)**
| Screen | Description |
|--------|-------------|
| `new-conversation.tsx` | Start a new conversation |
| `create-group.tsx` | Create a group chat |
| `conversation-info.tsx` | Conversation settings and members |
| `conversation-media.tsx` | Shared media gallery |
| `pinned-messages.tsx` | Pinned messages view |
| `starred-messages.tsx` | Starred messages view |
| `chat-theme-picker.tsx` | Chat color theme selector |
| `chat-wallpaper.tsx` | Chat background wallpaper |
| `chat-lock.tsx` | Per-chat biometric lock |
| `chat-export.tsx` | Export conversation to file |

**Broadcast**
| Screen | Description |
|--------|-------------|
| `broadcast-channels.tsx` | Browse broadcast channels |
| `create-broadcast.tsx` | Create a broadcast channel |
| `manage-broadcast.tsx` | Manage broadcast settings |

**Calls**
| Screen | Description |
|--------|-------------|
| `call-history.tsx` | Voice/video call log |

**Channels & Video (Minbar)**
| Screen | Description |
|--------|-------------|
| `edit-channel.tsx` | Edit channel details |
| `create-playlist.tsx` | Create video playlist |
| `save-to-playlist.tsx` | Add video to playlist |
| `watch-history.tsx` | Video watch history |

**Live**
| Screen | Description |
|--------|-------------|
| `go-live.tsx` | Start live stream |
| `schedule-live.tsx` | Schedule a future live event |
| `audio-room.tsx` | Join/host audio room |

**Creator Economy**
| Screen | Description |
|--------|-------------|
| `creator-dashboard.tsx` | Creator analytics hub |
| `creator-storefront.tsx` | Digital product storefront |
| `analytics.tsx` | Detailed analytics views |
| `post-insights.tsx` | Per-post engagement metrics |
| `revenue.tsx` | Revenue tracking and history |
| `cashout.tsx` | Payout/withdrawal flow |
| `enable-tips.tsx` | Enable tipping on profile |
| `send-tip.tsx` | Send a tip to a creator |
| `membership-tiers.tsx` | Create/manage membership levels |
| `boost-post.tsx` | Promote/boost a post |
| `branded-content.tsx` | Branded content partnerships |
| `collab-requests.tsx` | Manage collaboration requests |
| `gift-shop.tsx` | Browse and purchase virtual gifts |

**Communities & Events**
| Screen | Description |
|--------|-------------|
| `communities.tsx` | Community group browser |
| `community-posts.tsx` | Posts within a community |
| `create-event.tsx` | Create an event |
| `event-detail.tsx` | Event details with RSVP |
| `circles.tsx` | Close friend circles |
| `majlis-lists.tsx` | Curated Majlis follow lists |

**Islamic Features**
| Screen | Description |
|--------|-------------|
| `prayer-times.tsx` | Daily prayer schedule |
| `qibla-compass.tsx` | Qibla direction finder |
| `quran-reading-plan.tsx` | 30/60/90-day Quran plan |
| `quran-room.tsx` | Communal Quran reading |
| `quran-share.tsx` | Verse sharing cards |
| `tafsir-viewer.tsx` | Scholarly verse explanations |
| `dhikr-counter.tsx` | Digital tasbeeh |
| `dhikr-challenges.tsx` | Community dhikr challenges |
| `dhikr-challenge-detail.tsx` | Challenge detail + leaderboard |
| `hadith.tsx` | Hadith of the Day |
| `islamic-calendar.tsx` | Hijri calendar + events |
| `mosque-finder.tsx` | Nearby mosques |
| `zakat-calculator.tsx` | Zakat computation tool |
| `hajj-companion.tsx` | Hajj/Umrah 7-step guide |
| `hajj-step.tsx` | Individual Hajj step detail |
| `ramadan-mode.tsx` | Ramadan special features |
| `eid-cards.tsx` | Islamic greeting cards |
| `donate.tsx` | Donation payment flow |
| `charity-campaign.tsx` | Campaign details + progress |
| `scholar-verification.tsx` | Scholar badge application |
| `content-filter-settings.tsx` | Content strictness levels |
| `nasheed-mode.tsx` | Music-free toggle |

**Moderation & Reports**
| Screen | Description |
|--------|-------------|
| `report.tsx` | Report content/user |
| `my-reports.tsx` | Track submitted reports |
| `appeal-moderation.tsx` | Appeal moderation decision |

**Gamification**
| Screen | Description |
|--------|-------------|
| `achievements.tsx` | Achievement badges and progress |
| `challenges.tsx` | Community challenges browser |
| `leaderboard.tsx` | Global leaderboard views |
| `streaks.tsx` | Streak tracking (posting, engagement, Quran) |
| `xp-history.tsx` | XP earning history |
| `profile-customization.tsx` | Profile layout, accent color, badges |
| `series-detail.tsx` | Series detail with episodes |
| `series-discover.tsx` | Discover content series |

**Commerce**
| Screen | Description |
|--------|-------------|
| `marketplace.tsx` | Halal marketplace browser |
| `product-detail.tsx` | Product detail with reviews |
| `orders.tsx` | Order history and tracking |
| `waqf.tsx` | Waqf endowment management |
| `volunteer-board.tsx` | Volunteer opportunities |
| `watch-party.tsx` | Watch parties for group viewing |

**Wellbeing**
| Screen | Description |
|--------|-------------|
| `screen-time.tsx` | Screen time tracking and limits |
| `quiet-mode.tsx` | Notification pause with auto-reply |
| `wind-down.tsx` | Meditation/breathing screen |
| `parental-controls.tsx` | Parental control settings |
| `link-child-account.tsx` | Link child account flow |

**Downloads & Sharing**
| Screen | Description |
|--------|-------------|
| `downloads.tsx` | Offline downloads manager |
| `share-receive.tsx` | Receive shared content from other apps |
| `cross-post.tsx` | Cross-post to multiple spaces |
| `dm-note-editor.tsx` | DM status note editor |

**Bookmarks & Saved**
| Screen | Description |
|--------|-------------|
| `saved.tsx` | All saved content |
| `bookmark-collections.tsx` | Bookmark folder management |
| `bookmark-folders.tsx` | Bookmark folder contents |
| `notifications.tsx` | Notification center |

### Nested Route Directories (17)

Each contains dynamic `[id].tsx` or similar routes:

| Directory | Routes | Description |
|-----------|--------|-------------|
| `conversation/` | `[id].tsx` | Individual chat conversation |
| `post/` | `[id].tsx` | Post detail view |
| `profile/` | `[username].tsx` | User profile view |
| `channel/` | `[channelId].tsx` | Channel page |
| `video/` | `[id].tsx` | Video player |
| `reel/` | `[id].tsx` | Reel player |
| `thread/` | `[id].tsx` | Thread detail |
| `live/` | `[id].tsx` | Live stream viewer |
| `playlist/` | `[id].tsx` | Playlist viewer |
| `hashtag/` | `[tag].tsx` | Hashtag feed |
| `broadcast/` | `[id].tsx` | Broadcast channel view |
| `call/` | `[id].tsx` | Active call screen |
| `followers/` | `[userId].tsx` | Follower list |
| `following/` | `[userId].tsx` | Following list |
| `reports/` | `[id].tsx` | Report detail |
| `sound/` | `[id].tsx` | Audio track page |
| `playlists/` | `[handle].tsx` | User's playlists |
| `majlis-list/` | `[id].tsx` | Majlis list detail + timeline |
| `series/` | `[id].tsx` | Series episodes viewer |
| `product/` | `[id].tsx` | Product detail view |

</details>

---

## Getting Started

### Prerequisites

- **Node.js** 20+ and **npm** 10+
- **Expo CLI** (comes with `npx expo`)
- **PostgreSQL** 16+ (or a [Neon](https://neon.tech) serverless account)
- **Redis** 7+ (or an [Upstash](https://upstash.com) account)
- **Meilisearch** v1.11+ (or hosted instance)
- **Clerk** account for authentication
- **Cloudflare** account for R2 storage + Stream video
- **Stripe** account for payments

### Quick Start

```bash
# Clone the repository
git clone https://github.com/shakhzodkuvonovuz-cell/mizanly.git
cd mizanly

# Install all workspace dependencies (--legacy-peer-deps needed for lucide-react-native peer conflict)
npm install --legacy-peer-deps

# Start local infrastructure (Postgres, Redis, Meilisearch)
docker compose up -d

# Set up the API
cd apps/api
cp .env.example .env          # Fill in credentials (see Environment Variables)
npx prisma generate           # Generate Prisma client
npx prisma db push            # Push schema to database
npm run start:dev             # Start API at http://localhost:3000

# In a new terminal — start the mobile app
cd apps/mobile
npx expo start                # Opens Expo dev tools
```

### Backend Setup (Detailed)

```bash
cd apps/api

# 1. Copy environment template
cp .env.example .env

# 2. Fill in all required environment variables (see below)

# 3. Install dependencies
npm install

# 4. Generate Prisma client from schema
npx prisma generate

# 5. Push schema to your database
npx prisma db push

# 6. (Optional) Seed sample data
npm run prisma:seed

# 7. Start development server
npm run start:dev
# API available at http://localhost:3000
# Swagger docs at http://localhost:3000/docs
# WebSocket at ws://localhost:3000/chat
```

### Mobile Setup (Detailed)

```bash
cd apps/mobile

# 1. Install dependencies (--legacy-peer-deps needed due to lucide-react-native peer conflict)
npm install --legacy-peer-deps

# 2. Start Expo dev server
npx expo start

# Options:
#   Press 'i' — open iOS simulator
#   Press 'a' — open Android emulator
#   Press 'w' — open in web browser
#   Scan QR — open on physical device via Expo Go
```

> **Note:** If you see a Metro version mismatch warning (e.g., `metro@0.81` vs `metro-resolver@0.82`), this is a known Expo SDK 52 issue with `lucide-react-native`. It does not affect functionality — Metro will still bundle correctly. The warning will be resolved when Expo SDK 53 ships with aligned Metro versions.

---

## Development Scripts

### Root Workspace

```bash
npm run dev:api               # Start API server (hot reload)
npm run dev:mobile            # Start Expo dev server
npm run build:api             # Build API for production
npm run lint                  # Lint all workspaces
npm run typecheck             # TypeScript check (mobile)
npm run format                # Prettier format all files
npm run format:check          # Check formatting without fixing
npm run prisma:generate       # Regenerate Prisma client
npm run prisma:push           # Push schema changes to DB
npm run prisma:studio         # Open visual database browser
npm run prisma:seed           # Seed sample data
```

### API (`apps/api`)

```bash
npm run start:dev             # NestJS dev server with hot reload
npm run start:debug           # Dev server with Node.js debugger
npm run build                 # Production build (nest build)
npm run start:prod            # Start production build
npm run test                  # Run all tests
npm run test:watch            # Run tests in watch mode
npm run test:cov              # Run tests with coverage report
npm run test:e2e              # Run end-to-end tests
npm run lint                  # ESLint check
```

### Mobile (`apps/mobile`)

```bash
npx expo start                # Start dev server
npx expo start --ios          # Open in iOS simulator
npx expo start --android      # Open in Android emulator
npx expo start --web          # Open in web browser
npx expo start --clear        # Clear cache and start
npx expo export --platform web  # Build for web deployment
npm run test                  # Run Jest tests
npm run lint                  # ESLint check
```

### Prisma

```bash
cd apps/api
npx prisma studio             # Visual database browser (http://localhost:5555)
npx prisma db push            # Push schema to database
npx prisma db pull            # Pull schema from database
npx prisma generate           # Regenerate client from schema
npx prisma migrate dev        # Create and apply migration
npx prisma migrate deploy     # Apply pending migrations (production)
npx prisma format             # Format schema file
```

---

## Local Development with Docker

The `docker-compose.yml` provides local instances of all infrastructure services:

```yaml
services:
  postgres:                   # PostgreSQL 16 Alpine
    port: 5432
    credentials: postgres/postgres
    database: mizanly

  redis:                      # Redis 7 Alpine
    port: 6379
    maxmemory: 256mb

  meilisearch:                # Meilisearch v1.11
    port: 7700
    master key: configurable
```

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Reset database
docker compose down -v        # Warning: deletes all data
docker compose up -d
```

---

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main`/`develop` and on pull requests:

```
┌─────────────────────┐
│  lint-and-typecheck  │  Node 20, npm ci
│  ├── API lint        │  ESLint on apps/api
│  ├── Mobile lint     │  ESLint on apps/mobile
│  └── Mobile typecheck│  tsc --noEmit
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │            │
┌────▼────┐  ┌───▼──────┐
│ build-  │  │ test-api  │  PostgreSQL 16 + Redis 7
│ mobile  │  │ (jest)    │  services in CI
│ (web)   │  └───┬──────┘
└─────────┘      │
            ┌────▼────┐
            │ build-  │
            │ api     │  prisma generate + nest build
            └─────────┘
```

---

## Deployment

### API (Railway)

The API deploys to Railway using a Dockerfile:

```json
// apps/api/railway.json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/api/Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/main.js",
    "healthcheckPath": "/api/v1/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Mobile (Expo EAS)

Mobile builds are handled by Expo EAS Build:
- **iOS:** `.ipa` for TestFlight / App Store
- **Android:** `.aab` for Google Play Store
- **Web:** Static export via `expo export --platform web`

App identifiers:
- iOS bundle: `app.mizanly.mobile`
- Android package: `app.mizanly.mobile`
- URL scheme: `mizanly://`

---

## Environment Variables

### API (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Neon) |
| `CLERK_SECRET_KEY` | Yes | Clerk backend API secret key |
| `CLERK_WEBHOOK_SECRET` | Yes | Clerk webhook endpoint signing secret |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `CLOUDFLARE_R2_ACCESS_KEY` | Yes | R2 access key ID |
| `CLOUDFLARE_R2_SECRET_KEY` | Yes | R2 secret access key |
| `CLOUDFLARE_R2_BUCKET` | Yes | R2 bucket name |
| `CLOUDFLARE_R2_PUBLIC_URL` | Yes | R2 public bucket URL |
| `CLOUDFLARE_STREAM_API_TOKEN` | Yes | Stream API token |
| `CLOUDFLARE_STREAM_ACCOUNT_ID` | Yes | Stream account ID |
| `MEILISEARCH_HOST` | Yes | Meilisearch instance URL |
| `MEILISEARCH_API_KEY` | Yes | Meilisearch admin API key |
| `REDIS_URL` | Yes | Redis connection string (Upstash) |
| `STRIPE_SECRET_KEY` | Yes | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `PORT` | No | API port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |

### Mobile (`apps/mobile`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Yes | Backend API base URL (e.g., `https://api.mizanly.app/api/v1`) |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend publishable key |

---

## Documentation

Additional documentation in `docs/`:

| File | Description |
|------|-------------|
| `COMPETITOR_ANALYSIS.md` | Detailed feature gap analysis vs Instagram, TikTok, X, WhatsApp, YouTube |
| `DEPLOYMENT.md` | Full deployment guide for all services |
| `DEPLOY_CHECKLIST.md` | Pre-deployment verification checklist |
| `ONBOARDING.md` | Developer onboarding guide |
| `PROJECT_HISTORY.md` | Development timeline and milestones |
| `plans/` | 49 implementation plan documents covering all development batches |
| `analysis/` | Technical analysis documents |
| `audit/` | Code audit reports |

---

## Security & Quality Hardening

The codebase has undergone a comprehensive 72-agent deep audit with 4,300+ findings analyzed. As of files 01-16 (760+ findings fixed):

| Area | Status |
|------|--------|
| **Auth Guards** | ClerkAuthGuard checks isBanned/isDeactivated/isDeleted + auto-unbans expired temp bans |
| **SQL Injection** | All `$queryRawUnsafe` calls validated against enum whitelists |
| **AI Moderation** | Fail-closed — returns WARNING/unsafe on ALL error paths (was fail-open) |
| **Cascade Deletes** | 12+ financial records (tips, gifts, orders, donations) changed to SetNull — survive user deletion |
| **DTO Validation** | 100+ inline types replaced with validated DTO classes (@IsUrl, @Min/@Max, @MaxLength, @ArrayMaxSize) |
| **Feed Privacy** | Block/mute filtering on ALL feed endpoints (personalized, trending, featured, search) |
| **Webhook Security** | Signature verification required, 5-minute replay protection, rejects when secret missing |
| **Push Notifications** | Token hijacking prevention, per-type settings enforcement, correct data types |
| **Database Indexes** | 20+ indexes added (notifications, reports, moderation logs, calls, events) |
| **Word Filter** | Placeholder patterns replaced with real hate speech/NSFW/harassment detection |
| **Rate Limiting** | Per-endpoint @Throttle on all 82 controllers (AI moderation: 5/min, feeds: 30/min) |
| **Tests** | 284 suites, 4,429 tests, 100% pass rate |

---

## Algorithm & Intelligence

| Layer | Technology | Details |
|-------|-----------|---------|
| **Embeddings** | Gemini text-embedding-004 | 768-dim vectors, pgvector with HNSW index |
| **Retrieval** | KNN similarity search | Multi-cluster interest vectors (k-means, 2-3 centroids per user) |
| **Scoring** | Weighted engagement | likes(2) + comments(3) + shares(4) + saved(3) + viewDuration |
| **Islamic Boost** | Location-aware | Prayer-calculator integration, Ramadan/Jummah awareness, up to 50% boost |
| **Exploration** | Fresh content slots | 15% of feed reserved for <6h/<100 views content |
| **Diversity** | 2-pass reranking | Author dedup + hashtag cluster diversity |
| **Session** | Redis-backed | Real-time interest adaptation, 30min TTL, category tracking |
| **Trending** | Decay scoring | 24h window, 12h linear decay, cursor-based keyset pagination |
| **Safety** | Tiered defense | Client-side nsfwjs → pre-save moderation → AI prompt-hardened analysis |

## Roadmap

| Tier | Theme | Status |
|------|-------|--------|
| 1-8 | Full Platform Parity — Instagram, TikTok, X, WhatsApp, YouTube | Complete |
| 9 | AI-Powered Moat — Content assistant, auto-translate, moderation, captions, avatars | Complete |
| 10 | Gamification — Streaks, achievements, XP/levels, leaderboards, challenges, series | Complete |
| 11 | Commerce — Halal marketplace, business directory, Zakat, Waqf, premium | Complete |
| 12 | Community — Local boards, mentorship, study circles, fatwa Q&A, volunteer, events | Complete |
| 13 | Audit & Hardening — P0-P2 fixes, screen wiring, i18n, type safety, security | Complete |
| 14 | 2026 Competitor Parity — Live, calls, video chapters, Quran audio, 8 languages | Complete |
| 15 | Performance — Query caps, indexes, optimistic updates, memo, Sentry | Complete |
| 16 | 72-Agent Deep Audit — 4,300+ findings across 72 files | Complete |
| 17 | **11-Wave Remediation** — 85 agents, ~240 fixes, algorithm tuning, schema enums, RTL complete, accessibility, payments, new components | **Complete (4,740 tests)** |
| **Next** | WebRTC calls, performance/latency, maps, audio, Apple IAP, App Store submission | **In Progress** |

---

## License

**Proprietary** — All rights reserved.

Copyright 2026 Mizanly. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

---

<p align="center">
  Built with intention for the Muslim Ummah.<br/>
  <strong>بسم الله الرحمن الرحيم</strong>
</p>
