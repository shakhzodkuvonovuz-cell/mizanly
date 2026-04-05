# I04 — Redis Keys With No TTL or TTL > 30 Days

**Auditor:** Hostile code audit (Opus 4.6)
**Date:** 2026-04-05
**Scope:** Every `redis.set`, `redis.lpush`, `redis.sadd`, `redis.hset`, `redis.hmset`, `redis.zadd`, `redis.pfadd`, `redis.incr`, `redis.incrby` call in `apps/api/src/` (non-test files)
**Method:** Grep every Redis write operation, trace whether it has an accompanying TTL (EX/EXPIRE/setex), classify by risk

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL (no TTL at all, unbounded growth) | 0 |
| HIGH (TTL > 30 days, effectively permanent) | 5 |
| MEDIUM (TTL > 7 days but <= 30 days) | 4 |
| LOW (has TTL, but worth noting) | 4 |
| OK (properly bounded) | ~30 |

Previous audit (J07) fixed the worst offenders: `dlq:entries`, `analytics:events`, and `post:impressions:*` all got TTLs. But several keys remain with excessively long TTLs that are effectively permanent.

---

## CRITICAL — No TTL at All

None found. Previous J07 fixes addressed all unbounded keys.

---

## HIGH — TTL > 30 Days (Effectively Permanent)

### H1. `quran:surah:*` / `quran:verse:*` / `quran:juz:*` — 365-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/islamic/islamic.service.ts` |
| Lines | 1208, 1265, 1434 |
| Key pattern | `quran:surah:{surahNumber}:{translation}`, `quran:verse:{key}:{translation}`, `quran:juz:{juzNumber}:{translation}` |
| TTL | `365 * 24 * 60 * 60` = 31,536,000 seconds (1 year) |
| Risk | Quran has 114 surahs x 8 translations x ~10KB each = ~9MB. Low memory risk because the data is static and the key space is bounded. However, 1-year TTL means stale API responses persist for a year if the upstream Quran.com API changes data format. |
| Recommendation | Reduce to 30 days (2,592,000s). Quran text is immutable so the data stays correct, but API format changes and translation improvements should propagate faster. |

### H2. `community:dhikr:total` — 30-day rolling TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/islamic/islamic.service.ts` |
| Lines | 828-829, 876, 2359 |
| Key pattern | `community:dhikr:total` |
| TTL | `30 * 24 * 60 * 60` = 2,592,000 seconds (30 days) |
| Risk | Single key, trivial memory. But TTL is refreshed on every dhikr increment AND every hourly cron reconciliation. Effectively this key never expires. If the reconciliation cron stops and no users do dhikr for 30 days, the total vanishes (recovered from DB on next read). Acceptable. |
| Recommendation | Acceptable as-is. DB reconciliation covers expiry edge case. |

### H3. `user:mosque:{userId}` — 365-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/islamic/islamic.service.ts` |
| Lines | 1936-1937, 1963-1964 |
| Key pattern | `user:mosque:{userId}` (Redis hash) |
| TTL | `365 * 24 * 3600` = 31,536,000 seconds (1 year) |
| Risk | One hash per user who follows a mosque. At 1M users: 1M hashes x ~200 bytes = ~200MB. Has DB fallback (re-seeds on miss). |
| Recommendation | Reduce to 30 days. DB fallback exists and works. |

### H4. `feature_flags` — 90-day TTL (refreshed on every flag write)

| Field | Value |
|-------|-------|
| File | `apps/api/src/common/services/feature-flags.service.ts` |
| Line | 82 |
| Key pattern | `feature_flags` (single Redis hash) |
| TTL | `90 * 24 * 3600` = 7,776,000 seconds (90 days) |
| Risk | Single hash, tiny. TTL refreshed on every setFlag call. DB fallback exists. But if no flag is written for 90 days, all feature flags disappear from Redis (recovered from DB on next read). |
| Recommendation | Acceptable. DB is durable source of truth. |

### H5. `subscription:*` and `subscription:internal:*` — 365-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/payments/payments.service.ts` |
| Lines | 105-106, 128, 146 |
| Key pattern | `subscription:{stripeSubscriptionId}`, `subscription:internal:{internalSubscriptionId}` |
| TTL | `60 * 60 * 24 * 365` = 31,536,000 seconds (1 year) |
| Risk | Two keys per active subscription. At 100K subscriptions: 200K keys x ~100 bytes = ~20MB. Reasonable for subscription mappings that need to persist for the subscription lifetime. |
| Recommendation | Consider reducing to 90 days since the mapping is re-created on lookup miss. But acceptable as-is given the bounded key space. |

---

## MEDIUM — TTL > 7 Days but <= 30 Days

### M1. `mosque:nearby:{lat}:{lng}:{radius}` — 7-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/islamic/islamic.service.ts` |
| Line | 429 |
| Key pattern | `mosque:nearby:{lat}:{lng}:{radius}` |
| TTL | 604,800 seconds (7 days) |
| Risk | Key space is location-dependent. Lat/lng floats mean potentially infinite unique keys if coordinates are not rounded. Each cached response is a JSON array of mosques (~2-10KB). At 100K unique queries: ~500MB-1GB. |
| Recommendation | Verify coordinates are rounded before use as cache key. Consider reducing TTL to 1 day. OSM data changes rarely but key space is unbounded by nature. |

### M2. `payment:intent:{paymentIntentId}` — 30-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/payments/payments.service.ts` |
| Line | 91 |
| Key pattern | `payment:intent:{paymentIntentId}` |
| TTL | `60 * 60 * 24 * 30` = 2,592,000 seconds (30 days) |
| Risk | One key per payment intent. At 10K tips/month = 10K keys x ~100 bytes. Negligible. |
| Recommendation | Acceptable. |

### M3. `stripe:customer:{userId}` — 30-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/payments/payments.service.ts` |
| Line | 82 |
| Key pattern | `stripe:customer:{userId}` (inferred from context) |
| TTL | `60 * 60 * 24 * 30` = 2,592,000 seconds (30 days) |
| Risk | One key per paying user. Bounded. |
| Recommendation | Acceptable. |

### M4. `tier:stripe_product:{tierId}` — 30-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/payments/payments.service.ts` |
| Line | 323 |
| Key pattern | `tier:stripe_product:{tierId}` |
| TTL | `60 * 60 * 24 * 30` = 2,592,000 seconds (30 days) |
| Risk | Handful of keys (number of subscription tiers). Negligible. |
| Recommendation | Acceptable. |

---

## LOW — Has TTL, Worth Noting

### L1. `cron:lastrun:*` — 7-day TTL

| Field | Value |
|-------|-------|
| File | `apps/api/src/common/utils/cron-lock.ts` |
| Line | 31 |
| TTL | 604,800 seconds (7 days) |
| Risk | One key per cron job. Bounded (~10-20 keys). Acceptable. |

### L2. `group:invite:{inviteCode}` — 7-day TTL (or custom)

| Field | Value |
|-------|-------|
| File | `apps/api/src/modules/messages/messages.service.ts` |
| Lines | 871, 898 |
| TTL | `7 * 24 * 60 * 60` = 604,800 seconds default, or custom TTL |
| Risk | One key per active group invite link. Bounded by number of groups with active invites. |

### L3. `mizanly:dlq` — 7-day TTL + LTRIM to 1000

| Field | Value |
|-------|-------|
| File | `apps/api/src/common/queue/dlq.service.ts` |
| Lines | 64-67 |
| TTL | `7 * 86400` = 604,800 seconds |
| Risk | Previously unbounded (J07 fix added TTL + LTRIM). Now properly capped. |

### L4. `analytics:events` — 7-day TTL + LTRIM to 100K

| Field | Value |
|-------|-------|
| File | `apps/api/src/common/services/analytics.service.ts` |
| Lines | 105-109 |
| TTL | `7 * 86400` = 604,800 seconds |
| Risk | Previously unbounded (J07 fix added TTL + LTRIM). Now capped but 100K events x ~200 bytes = ~20MB sits in Redis with no consumer. TTL is the only cleanup mechanism. |

---

## OK — Properly Bounded (No Action Needed)

| Key Pattern | TTL | File |
|-------------|-----|------|
| `sfeed:*` (scored feed cache) | Caller-specified (120s typical) | `scored-feed-cache.ts:114` |
| `sfeed:*:data` (companion hash) | Same as above | `scored-feed-cache.ts:115` |
| `sfeed:*:lock` | 10s | `scored-feed-cache.ts:70` |
| `feed:saf:*` / `feed:global:*` | 120s / 300s | `feed.service.ts:104,470` |
| `session:*` (personalized feed) | 1800s (30 min) | `personalized-feed.service.ts:66` |
| `clerk_webhook:*` | 86,400s (1 day) | `webhooks.controller.ts:171` |
| `stripe:webhook:*` | 172,800s (2 days) | `stripe-webhook.controller.ts:78` |
| `prayer:times:*` | 3,600s (1 hour) | `islamic-notifications.service.ts:47` |
| `prayer_queue:*` | 3,600s (1 hour) | `islamic-notifications.service.ts:84` |
| `quran:search:*` | 3,600s (1 hour) | `islamic.service.ts:1326` |
| `quran:room:*` (hash) | QURAN_ROOM_TTL | `chat.gateway.ts:849` |
| `quran:participants:*` (set) | QURAN_ROOM_TTL | `chat.gateway.ts:872` |
| `presence:{userId}` (set) | PRESENCE_TTL (~5 min) + heartbeat refresh | `chat.gateway.ts:300` |
| `session:{userId}:{date}` (retention) | 604,800s (7 days) | `retention.service.ts:40` |
| `live:chat:*` | 86,400s (1 day) + LTRIM 500 | `live.service.ts:604-605` |
| `notif:dedup:*` | 300s (5 min) | `notifications.service.ts:365` |
| `user:{username}` | 300s (5 min) | `users.service.ts:268` |
| `unfurl:*` (OG cache) | UNFURL_CACHE_TTL | `og.service.ts:367` |
| `ai:quota:daily:*` | TTL to midnight UTC | `ai.service.ts:89` |
| `community:dhikr:today:*` | 172,800s (48 hours) | `islamic.service.ts:833` |
| `post:impressions:*` (HLL) | 604,800s (7 days) | `posts.service.ts:1983` |
| `analytics:counter:*` | 86,400s (1 day) | `analytics.service.ts:66` |
| `user:dedup:*` | 691,200s (8 days) | `users.service.ts:825` |
| `content-safety:age:*` | 3,600s (1 hour) | `content-safety.service.ts:334` |
| `islamic:event:*` | 86,400s (1 day) | `islamic.service.ts:2101` |
| `video:trending:*` | 30s | `videos.service.ts:360` |
| `waitlist:count` | 60s | `waitlist.service.ts:117` |
| `2fa:session:*` | TWO_FACTOR_SESSION_TTL | `two-factor.service.ts:372` |
| `excluded:*` | CACHE_TTL_SECONDS | `excluded-users.ts:68` |
| Cron locks (`cron:*`) | Specified per job | `cron-lock.ts:24` |
| Cache util locks | 10s | `cache.ts:22` |

---

## Key Space Growth Risk Analysis

| Scenario | Key pattern | Growth rate | Memory at 1M users |
|----------|------------|-------------|---------------------|
| Mosque follows | `user:mosque:{userId}` | 1 per user | ~200MB (365-day TTL) |
| Nearby mosque search | `mosque:nearby:{lat}:{lng}:{r}` | Unbounded by coordinates | Potentially GBs if not rounded |
| Quran text cache | `quran:surah:*`, `quran:verse:*` | Bounded (114 x 8 = 912 max) | ~9MB |
| Subscriptions | `subscription:*` | 2 per subscriber | ~20MB at 100K subs |
| Feed caches | `sfeed:*` | 1 per active user | Self-cleaning (120s TTL) |
| Presence | `presence:{userId}` | 1 per online user | Self-cleaning (5min TTL) |

---

## Recommendations (Priority Order)

1. **Reduce `user:mosque:{userId}` to 30-day TTL** (DB fallback already exists and works)
2. **Reduce `quran:*` caches to 30-day TTL** (immutable data, but 1 year is excessive)
3. **Verify mosque coordinate rounding** in `getNearbyMosques` to prevent unbounded key space from floating-point variations
4. **Add maxmemory-policy** to Redis config (Upstash): `allkeys-lru` ensures graceful degradation under memory pressure
5. **Build analytics consumer** — `analytics:events` list accumulates up to 100K events with no consumer draining them (flagged but not fixed since J07)

---

## Go Microservices (e2e-server, livekit-server)

Both Go services use Redis only for rate limiting via Lua scripts that include EXPIRE in every write. No unbounded Redis keys found in Go code.
