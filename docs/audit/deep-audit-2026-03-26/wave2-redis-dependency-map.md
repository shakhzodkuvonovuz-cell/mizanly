# Wave 2 Seam: Complete Redis Dependency Map

## Summary
64 Redis key patterns/channels/queues identified across 25 source files. 15 key patterns have NO DB backup and NO reconciliation (data loss on flush). 4 patterns are dead data (written but never read). 10+ patterns have no TTL (unbounded memory growth).

## P0 — Data Loss on Redis Flush (No DB Backup)

| Key Pattern | Data | Impact |
|-------------|------|--------|
| `payment_intent:{piId}` | Internal tip ID (30d TTL) | Stripe webhook can't find tip → payment succeeds but coins never credited |
| `subscription:{stripeSubId}` | Internal sub ID (1yr TTL) | Renewal/cancellation webhooks can't find subscription |
| `subscription:internal:{subId}` | Stripe sub ID (1yr TTL) | Can't cancel subscription via internal ID |
| `user:customer:{userId}` | Stripe customer ID (30d TTL) | Next payment creates NEW Stripe customer (orphaned) |
| `device_accounts:{deviceId}` | Integer counter (PERMANENT) | 5-device limit bypassed — unlimited account creation |
| `feature_flags` | Hash of all flags (PERMANENT) | All feature flags disabled — features disappear |
| `ab:experiment:*` | Experiment configs (PERMANENT) | All A/B tests deleted |
| `ab:assignment:*` | User→variant mapping (90d TTL) | Users reshuffled mid-experiment |
| `ab:conversions:*` | Conversion counters (PERMANENT) | All experiment metrics zeroed |

## P1 — Data Loss (Recoverable or Lower Impact)

| Key Pattern | Data | Impact |
|-------------|------|--------|
| `group_invite:{code}` | Conversation ID (7d TTL) | All active invite links break |
| `community:dhikr:total` | Global counter (PERMANENT) | Resets to 0 (could recompute from DhikrSession table) |
| `user:mosque:{userId}` | {name, lat, lng} (PERMANENT) | Users must re-follow their mosque |
| `post:impressions:{postId}` | HyperLogLog (PERMANENT) | All impression data lost |
| `session:{userId}` | Feed session data (30min TTL) | Algorithm loses in-session learning |

## Dead Data (Written but Never Read) — 4 Patterns

| Key Pattern | Written By | Problem |
|-------------|-----------|---------|
| `dm_shares:{messageId}` | messages.service.ts | No code ever reads this — algorithm signal is write-only |
| `prayer_queue:{userId}` | islamic-notifications.service.ts | Queue pushed to but no consumer/worker ever pops |
| `session:{userId}:{date}` | retention.service.ts | Session depth data never read or aggregated |
| `analytics:events` | analytics.service.ts | Events buffered to Redis list but no worker consumes |

## Unbounded Memory Growth — 10+ Patterns (No TTL)

| Key Pattern | Growth Rate | Risk |
|-------------|-------------|------|
| `community:dhikr:today:{date}` | 1 key/day forever | Accumulates ~365 keys/year |
| `post:impressions:{postId}` | 1 HyperLogLog/post forever | Grows with every post ever created |
| `device_accounts:{deviceId}` | 1/device forever | Grows with every device |
| `dm_shares:{messageId}` | 1/forwarded message | Dead data, never cleaned |
| `ab:conversions:*` | 1/variant/event/experiment | Grows with experiments |
| `negative_signals:{userId}` | 1 list/user (capped 200 items) | Grows with user base |
| `user:mosque:{userId}` | 1 hash/user | Grows with user base |

## redis.keys() Usage (O(N) Blocking Scan) — 4 Locations

| File | Pattern | Fix |
|------|---------|-----|
| ab-testing.service.ts | `ab:experiment:*`, `ab:assignment:*`, `ab:conversions:*` | Use SCAN |
| publish-workflow.service.ts | `feed:*:{userId}:*` | Use SCAN |
| feed.service.ts | `feed:foryou:{userId}:*` | Use SCAN |
| cache.ts (invalidateCachePattern) | Arbitrary pattern | Use SCAN |

## Category Breakdown

| Category | Count | Examples |
|----------|-------|---------|
| Cache (DB-backed) | 14 | user profile, feeds, prayer times, Quran verses, mosques |
| State (NO DB backup) | 12 | payment mappings, session, presence, A/B tests, feature flags, mosque |
| Counter | 9 | device accounts, dhikr, analytics, impressions, forward count |
| Rate-limit | 5 | auth register, WS events, WS connections, AI quota, notification cap |
| Dedup | 6 | webhook, notification, Islamic event, scheduled notif, milestone, streak |
| Queue | 8 | 6 BullMQ queues + analytics events list + prayer queue (both dead) |

## Redis Unavailable Behavior
- **Development:** Proxy returns null/0/OK for everything — silent degradation
- **Production (down after boot):** ioredis throws on every operation. Most services catch, but payments/auth will fail requests.
- **Production (no REDIS_URL at boot):** App refuses to start (correct behavior)
