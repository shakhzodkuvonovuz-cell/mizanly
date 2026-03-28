# Wave 1: Redis Fake-Success Behavior Audit

## Summary
17 findings. 1 CRITICAL, 4 HIGH, 5 MEDIUM, 5 LOW, 2 acceptable-by-design.

## CRITICAL

### F1: Payment mappings Redis-only with TTL — webhook failures on expiry
- **File:** `payments.service.ts:85-95`
- **Evidence:** Tip mapping 30-day TTL, subscription mapping 1-year TTL. handleInvoicePaymentFailed has NO DB fallback — silently drops on Redis miss.
- **Failure:** Invoice failure after Redis expiry = user keeps premium forever

## HIGH

### F2: Device account counter — no TTL, lost on Redis flush
- **File:** `auth.service.ts:66-70, 158-159`
- **Failure:** Redis flush = 5-device limit resets, unlimited account creation

### F5: Analytics events in-memory buffer lost on crash
- **File:** `analytics.service.ts:27-39`
- Up to 100 events or 10s of events lost on crash. Redis failure = unbounded memory growth.

### F6: Rate limiter uses IN-MEMORY storage, not Redis
- **File:** `app.module.ts:112`
- **Evidence:** ThrottlerModule with no `storage` option = default in-memory
- **Failure:** Rate limits reset on deploy. Per-instance only in multi-instance deployment.

### F10: A/B tests + feature flags 100% Redis — total loss on flush
- **Files:** `ab-testing.service.ts`, `feature-flags.service.ts`
- **Failure:** Redis flush = all experiments invalidated, all flags disabled, all conversion data lost

### F12: Production Redis failure = 500s everywhere (no circuit breaker)
- **File:** `redis.module.ts:43-49`
- **Evidence:** Logs "CRITICAL" but says "Don't crash here". No graceful degradation in production.

## MEDIUM

### F3: Community dhikr counter Redis-only (recomputable from DB)
### F4: Followed mosque data Redis-only (no DB backup, no recovery)
### F9: Group invite links Redis-only (flush = all links dead)
### F14: Prayer DND silently disabled on cache miss (returns false, user gets notified during prayer)
### F16: `redis.keys()` used in 6+ production paths (O(N) blocking scan)

## LOW
### F7: Negative feed signals stored but never read (dead data)
### F8: Session depth data stored but never read (dead data)
### F11: Quran room state Redis-only (ephemeral by design)
### F15: Impression tracking returns `{ tracked: true }` on failure
### F17: Feature flags serve stale cache during outage (acceptable degradation)
