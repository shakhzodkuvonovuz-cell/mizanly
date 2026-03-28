# Wave 1: Observability / Incident Diagnosis Audit

## Summary
9 findings. 2 HIGH, 4 MEDIUM, 3 LOW. Cannot diagnose queue/socket/cron incidents.

## HIGH

### F1: Correlation IDs NOT propagated beyond HTTP request boundary
- **Evidence:** correlation-id.middleware.ts sets req.headers['x-correlation-id'] but zero references elsewhere. Queue jobs, socket events, Sentry, logs all lack correlation ID.
- **Failure:** Cannot trace a request through queue → notification → socket delivery chain.

### F3: Sentry captures ONLY HTTP filter errors — queue/socket/cron invisible
- **Evidence:** Only 2 `captureException` calls, both in http-exception.filter.ts
- 25 occurrences of `.catch(() => {})` (silent swallow) across 15 services
- **Failure:** Media processing failure, queue job failure, socket error — all invisible in Sentry

## MEDIUM

### F2: Dual logging systems (pino-http JSON + NestJS text) — log aggregation tools confused
### F5: No Prisma query-level timing or slow query detection
### F6: No queue job duration tracking — can't measure job latency
### F7: Socket connect/disconnect events NOT logged — can't debug connectivity reports

## LOW

### F4: MetricsInterceptor hardcodes status 200 for all successful responses
### F8: /health/live does not check dependencies; Railway uses it for routing
### F9: In-memory request counters reset on deploy — no persistent error rate tracking

## Bottom Line
Can diagnose: simple HTTP request failures (Sentry), slow HTTP endpoints (MetricsInterceptor).
Cannot diagnose: queue failures, socket issues, cross-boundary tracing, DB bottlenecks.
