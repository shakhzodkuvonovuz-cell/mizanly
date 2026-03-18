# Mizanly Production Readiness Checklist

> Gap analysis against $100B-grade software. Updated: 2026-03-18

## P0 — CRITICAL (Blocks launch)

- [ ] Global ValidationPipe + convert 54 inline body DTOs to proper validated classes
- [ ] Add Sentry crash reporting to mobile app
- [ ] Add FCM/APNs push notification delivery
- [ ] Wire remaining unwired screens to real APIs (audit which 48 are truly broken)

## P1 — HIGH (Required for production quality)

- [ ] Add BullMQ job queue for async tasks (XP, moderation, notifications)
- [ ] Move WebSocket presence/rooms to Redis (horizontal scaling)
- [ ] Add Redis caching to top 20 hot endpoints
- [ ] Write missing controller tests (51 controllers)
- [ ] Add image optimization pipeline (resize, WebP, blur hash)
- [ ] Switch from `prisma db push` to `prisma migrate`

## P2 — MEDIUM (Differentiates good from great)

- [ ] Offline caching for feeds and messages
- [ ] E2E tests (Maestro or Detox)
- [ ] Analytics pipeline (PostHog or similar)
- [ ] Feature flags system
- [ ] Search tuning (Meilisearch synonyms, ranking)
- [ ] Mobile performance monitoring

## P3 — LOW (Polish)

- [ ] ML-based content recommendations
- [ ] A/B testing infrastructure
- [ ] Full WCAG accessibility audit
- [ ] API versioning strategy
- [ ] Developer documentation / runbook
