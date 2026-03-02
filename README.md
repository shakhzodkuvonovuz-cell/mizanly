# Mizanly (ميزانلي)

**Your voice. Your balance.**

A culturally intelligent social platform for the global Muslim community — combining the best of Instagram, TikTok, X, WhatsApp, and YouTube into one unified experience.

## Architecture

```
mizanly/
├── apps/
│   ├── api/          # NestJS backend (REST + WebSocket)
│   └── mobile/       # React Native app (iOS + Android)
└── packages/
    └── shared/       # Shared types, constants, validation
```

## The Five Spaces

| Space | Arabic | Description |
|-------|--------|-------------|
| **Saf** | الصف | Instagram-style photo feed + stories |
| **Bakra** | بكرة | TikTok-style short video |
| **Majlis** | المجلس | X/Twitter-style threaded discussion |
| **Risalah** | رسالة | WhatsApp-style messaging |
| **Minbar** | المنبر | YouTube-style long video |

## Tech Stack

- **Mobile:** React Native (Expo) + TypeScript
- **Backend:** NestJS + Prisma + PostgreSQL (Neon)
- **Auth:** Clerk
- **Storage:** Cloudflare R2 / Images / Stream
- **Real-time:** Socket.io
- **Search:** Meilisearch
- **Deploy:** Railway

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- PostgreSQL (or Neon account)
- Clerk account

### Backend Setup
```bash
cd apps/api
cp .env.example .env    # Fill in your credentials
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```

### Mobile Setup
```bash
cd apps/mobile
npm install
npx expo start
```

## MVP Scope (12-Week Sprint)

- **Weeks 1-2:** Auth, user profiles, database schema
- **Weeks 3-4:** Saf (feed + stories + posts)
- **Weeks 5-6:** Majlis (threads + replies + trending)
- **Weeks 7-8:** Risalah (DMs + group chats)
- **Weeks 9-10:** Search, notifications, circles
- **Weeks 11-12:** Polish, testing, launch prep

## License

Proprietary — All rights reserved.
