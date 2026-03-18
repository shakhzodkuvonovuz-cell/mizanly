# Mizanly Production Readiness Checklist

> Gap analysis against $100B-grade software. Updated: 2026-03-18

## P0 — CRITICAL (Blocks launch)

- [x] Global ValidationPipe + convert 54 inline body DTOs to proper validated classes
- [x] Add Sentry crash reporting to mobile app
- [x] Switch from `prisma db push` to `prisma migrate` (baseline created)
- [ ] Add FCM/APNs push notification delivery
- [ ] Wire 13 screens with mock handlers to real APIs

## P1 — HIGH (Required for production quality)

- [x] Add AsyncJobService for reliable background jobs with retry + logging
- [x] Eliminate all 22 fire-and-forget .catch(() => {}) patterns
- [x] Move WebSocket presence from in-memory to Redis (horizontal scaling)
- [x] Add Redis caching utilities + cache trending hashtags (5min) + recommended channels (10min)
- [ ] Write missing controller tests (51 controllers)
- [ ] Add image optimization pipeline (resize, WebP, blur hash)

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
