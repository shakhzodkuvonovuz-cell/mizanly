# CLAUDE.md — Mizanly Project Guide

## What is Mizanly?
Mizanly (ميزانلي) is a culturally intelligent social platform for the global Muslim community. It combines the best of Instagram, TikTok, X/Twitter, WhatsApp, and YouTube into one unified app with five "spaces."

## The Five Spaces
1. **Saf (الصف)** — Instagram-style photo feed + stories (MVP)
2. **Bakra (بكرة)** — TikTok-style short video (V1.1)
3. **Majlis (المجلس)** — X/Twitter-style threaded discussion (MVP)
4. **Risalah (رسالة)** — WhatsApp-style messaging (MVP)
5. **Minbar (المنبر)** — YouTube-style long video (V1.2)

## Architecture
```
mizanly/
├── apps/
│   ├── api/          # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/     # Feature modules (auth, users, posts, threads, messages, etc.)
│   │   │   ├── common/      # Guards, decorators, pipes, filters
│   │   │   ├── config/      # Prisma service, config
│   │   │   └── gateways/    # Socket.io real-time gateways
│   │   └── prisma/          # Schema + migrations
│   └── mobile/       # React Native (Expo) app
│       ├── app/             # Expo Router file-based routing
│       │   ├── (tabs)/      # Bottom tab screens (saf, bakra, majlis, risalah)
│       │   └── (auth)/      # Auth flow screens
│       └── src/
│           ├── components/  # Reusable UI components
│           ├── hooks/       # Custom React hooks
│           ├── services/    # API client, socket service
│           ├── store/       # Zustand global state
│           ├── theme/       # Design tokens (colors, fonts, spacing)
│           ├── types/       # TypeScript type definitions
│           └── utils/       # Helper functions
└── packages/
    └── shared/       # Shared constants, validation, types
```

## Tech Stack
- **Mobile:** React Native (Expo SDK 52) + TypeScript + Expo Router
- **Backend:** NestJS 10 + Prisma ORM + PostgreSQL (Neon)
- **Auth:** Clerk (email, phone, Apple, Google)
- **Storage:** Cloudflare R2 (media), Cloudflare Images (optimization), Cloudflare Stream (video)
- **Real-time:** Socket.io (chat, typing indicators, notifications)
- **Search:** Meilisearch (full-text search)
- **State:** Zustand (client), React Query (server state)
- **Deploy:** Railway (API), Expo EAS (mobile)

## Key Design Decisions
- **Dark mode primary** with light mode option
- **Brand colors:** Emerald (#0A7B4F), Gold (#C8963E), Cream (#FEFCF7)
- **RTL support:** Full Arabic RTL layout with automatic direction detection
- **Glassmorphism:** Used for tab bar, sheets, and overlays
- **Fonts:** Playfair Display (headings), DM Sans (body), Noto Naskh Arabic

## Development Commands
```bash
# Backend
cd apps/api
npm install
npx prisma generate
npx prisma db push
npm run start:dev        # http://localhost:3000
                        # Swagger docs at /docs

# Mobile
cd apps/mobile
npm install
npx expo start           # Expo dev server
```

## API Patterns
- All endpoints prefixed with `/api/v1/`
- Auth via Clerk JWT in `Authorization: Bearer <token>` header
- ClerkAuthGuard protects authenticated routes
- CurrentUser decorator extracts user from request
- Cursor-based pagination (pass `?cursor=<lastId>`)
- Prisma for all database operations

## MVP Scope (12 weeks)
Weeks 1-2: Auth + Users + Database
Weeks 3-4: Saf (feed + stories + posts + comments)
Weeks 5-6: Majlis (threads + replies + polls + trending)
Weeks 7-8: Risalah (DMs + groups + real-time chat)
Weeks 9-10: Search + Notifications + Circles
Weeks 11-12: Polish + Testing + Launch

## Deferred Features
- Bakra (short video) → V1.1
- Minbar (long video) → V1.2
- Live streaming, Audio Spaces → V2.0
- E2E encryption, monetization → V2.0

## Important Files
- `apps/api/prisma/schema.prisma` — Complete database schema
- `apps/mobile/src/theme/index.ts` — Design tokens
- `apps/mobile/src/types/index.ts` — TypeScript interfaces
- `apps/mobile/src/services/api.ts` — API client with all endpoints
- `packages/shared/src/index.ts` — Constants and validation
