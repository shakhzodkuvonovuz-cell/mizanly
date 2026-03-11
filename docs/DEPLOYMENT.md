# Mizanly — Deployment Guide

## Production Stack

| Service | Provider | Purpose |
|---------|----------|---------|
| API | Railway | NestJS backend, auto-scale, Git-push deploy |
| Database | Neon | Serverless PostgreSQL 16 |
| Cache | Upstash | Serverless Redis |
| Storage | Cloudflare R2 | Media files (images, video thumbnails) |
| Video | Cloudflare Stream | Video transcoding & delivery |
| Search | Meilisearch Cloud | Full-text search |
| Auth | Clerk | Authentication (email, phone, Apple, Google) |
| Monitoring | Sentry | Error tracking & performance |

---

## Environment Variables

### Backend (`apps/api/.env`)

```bash
# Database (Neon)
DATABASE_URL=postgresql://user:pass@host/mizanly?sslmode=require
DIRECT_DATABASE_URL=postgresql://user:pass@host/mizanly?sslmode=require

# Auth (Clerk)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=mizanly-media
R2_PUBLIC_URL=https://media.mizanly.com

# Video (Cloudflare Stream)
CF_STREAM_API_TOKEN=...
CF_STREAM_ACCOUNT_ID=...

# Images (Cloudflare Images)
CF_IMAGES_API_TOKEN=...
CF_IMAGES_ACCOUNT_ID=...

# Search (Meilisearch)
MEILISEARCH_HOST=https://ms-....meilisearch.io
MEILISEARCH_API_KEY=...

# Cache (Upstash Redis)
REDIS_URL=rediss://default:...@....upstash.io:6379

# Email (Resend)
RESEND_API_KEY=re_...

# Monitoring (Sentry)
SENTRY_DSN=https://...@sentry.io/...

# App
NODE_ENV=production
PORT=3000
API_URL=https://api.mizanly.com
CORS_ORIGINS=https://mizanly.com,exp://localhost:8081
```

### Mobile (`apps/mobile/.env`)

```bash
EXPO_PUBLIC_API_URL=https://api.mizanly.com/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
EXPO_PUBLIC_WS_URL=wss://api.mizanly.com
```

---

## Deploy API to Railway

### Option A: Docker (recommended)

```bash
# Build
docker build -f apps/api/Dockerfile -t mizanly-api .

# Test locally
docker run -p 3000:3000 --env-file apps/api/.env mizanly-api

# Push to Railway
railway link
railway up
```

### Option B: Git push (simpler)

```bash
# Railway auto-detects Node.js
railway link
railway up

# Set build command in Railway dashboard:
#   Build: npm ci && npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build --workspace=apps/api
#   Start: node apps/api/dist/main.js
```

### Database Migration

```bash
# Generate Prisma client
npx prisma generate --schema=apps/api/prisma/schema.prisma

# Push schema changes to Neon
npx prisma db push --schema=apps/api/prisma/schema.prisma
```

---

## Deploy Mobile (Expo EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Build for iOS
eas build --platform ios --profile production

# Build for Android
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

---

## Health Check

```
GET /api/v1/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-09T...",
  "database": "up",
  "version": "0.1.0"
}
```

Use this endpoint for Railway health checks and uptime monitoring.

---

## Monitoring

### Sentry
- Error tracking for 5xx errors (auto-captured)
- Performance monitoring
- Set `SENTRY_DSN` environment variable

### Logging
- Pino logger with JSON output in production
- `debug` level in development, `info` in production
- Authorization headers automatically redacted

---

## Scaling Strategy

| Component | Strategy |
|-----------|----------|
| API | Railway auto-scale (horizontal) |
| Database | Neon auto-scale (serverless, branching for dev) |
| Redis | Upstash auto-scale (serverless, per-request billing) |
| Search | Meilisearch Cloud (dedicated instance) |
| Storage | Cloudflare R2 (unlimited, pay-per-use) |
| CDN | Cloudflare (global edge caching for media) |

### Performance Checklist
- [ ] Redis caching on feed endpoints (30s TTL)
- [ ] User profile caching (5min TTL)
- [ ] Database indexes on all foreign keys + createdAt
- [ ] Response compression enabled (gzip)
- [ ] Rate limiting: 100 req/min global, per-endpoint overrides
- [ ] Image optimization via Cloudflare Images
- [ ] Video transcoding via Cloudflare Stream
