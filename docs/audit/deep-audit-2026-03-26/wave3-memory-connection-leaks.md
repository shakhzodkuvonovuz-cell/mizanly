# Wave 3: Memory Leaks, Connection Leaks & Resource Exhaustion

## Summary
16 risks identified. 1 CRITICAL, 3 HIGH, 5 MEDIUM, 4 LOW-MEDIUM, 2 LOW, 1 NEGLIGIBLE.

## CRITICAL

### R9: GDPR exportUserData — 26 uncapped parallel queries
- **File:** privacy.service.ts:109-137
- 26 Prisma queries fired in `Promise.all` with NO `take` limit
- Power user with 100K posts + 500K messages → hundreds of MB allocated simultaneously
- Holds multiple Prisma pool connections. Multiple concurrent exports → OOM + pool exhaustion.

## HIGH

### R1: AnalyticsService buffer grows unboundedly on Redis failure
- **File:** analytics.service.ts:101-104
- On flush failure, events pushed BACK into buffer. New events keep arriving. ~1.2 MB/min during outage.
- **BONUS BUG:** Class does NOT implement `OnModuleDestroy` interface → cleanup never called → interval never cleared

### R5: 5,000-conversation presence fan-out on every connect/disconnect
- **File:** chat.gateway.ts:265-272, 346-353
- Each connect/disconnect: 1 Prisma query (5K rows) + 5K individual `.emit()` calls
- 1K concurrent connections = 5M emit calls (thundering herd on Socket.io adapter)

### R16: Prisma connection pool — no explicit configuration
- **File:** prisma.service.ts:8-9
- Default pool: `num_cpus * 2 + 1` ≈ 3-5 connections on Railway
- GDPR export uses 26 parallel queries. Cron jobs hold connections for minutes.
- → `P2024: Timed out fetching connection from pool` under moderate load

## MEDIUM

### R2: AnalyticsService setInterval never cleared (class doesn't implement OnModuleDestroy)
### R6: RedisIoAdapter — 2 Redis connections (pubClient/subClient) never closed on shutdown
### R7: Redis SHUTDOWN provider — onModuleDestroy on plain object may not be invoked by NestJS
### R8: snapshotFollowerCounts — 200K user fetch into memory + connection starvation
### R12: BullMQ creates 16 Redis connections per server instance (6 queues + 6 workers + adapter + subscriber + main + gateway duplicate)

## LOW-MEDIUM

### R3: AsyncJobService — dangling setTimeout timers on shutdown (no references stored)
### R11: findByPhoneNumbers — 10K users loaded + 10K SHA-256 hashes server-side per call
### R14: EmbeddingPipelineService — infinite backfill loop if embedding API is down

## LOW

### R4: ChatGateway heartbeatTimers Map (cleaned on disconnect, cleanup exists in onModuleDestroy)
### R13: Islamic cron sequential notification.create 1K times (connection hog, not leak)

## Top 5 Fixes
1. Add `take` limits to all 26 GDPR export queries (or stream results)
2. Make AnalyticsService implement `OnModuleDestroy`, cap buffer at 10K entries
3. Configure Prisma pool: `?connection_limit=20` in DATABASE_URL
4. Replace 5K-conversation fan-out with single Socket.io room-based broadcast
5. Store RedisIoAdapter pub/sub clients as properties with close() method
