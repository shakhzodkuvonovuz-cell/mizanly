# Monitoring & Observability Design

## Overview
Implement production-ready monitoring for Mizanly API following architect instructions (Step 3 of Batch 4). Adds structured logging, request correlation, error tracking, and metrics.

## Goals
- Structured, queryable logs with correlation IDs
- Error tracking for 5xx server errors
- Basic API metrics (counts, system health)
- Minimal performance impact

## Design Decisions

### 3.1 Structured Logging with Pino
- **Library**: `nestjs-pino` (fast, low overhead, NestJS integration)
- **Configuration**:
  - Development: `pino-pretty` transport with colorization, `debug` level
  - Production: `info` level, JSON format
  - Redaction: `req.headers.authorization`, `req.headers.cookie`
- **Integration**: Replace `console.log` in `main.ts` with `app.useLogger(app.get(Logger))`
- **Usage**: All services inject `Logger` for consistent structured logging

### 3.2 Request Correlation IDs
- **Middleware**: `CorrelationIdMiddleware` generates/forward `x-correlation-id` header
- **Generation**: UUID v4 if missing from request
- **Propagation**: Set on response header, available in all logs via `pino-http`
- **Registration**: Applied globally after security headers

### 3.3 Sentry Error Tracking
- **Library**: `@sentry/nestjs`, `@sentry/node`
- **Configuration**:
  - DSN from `SENTRY_DSN` environment variable
  - Sample rate: 10% of traces
  - Environment: `NODE_ENV` or `development`
  - `beforeSend` hook scrubs sensitive headers
- **Integration**:
  - Initialize in `main.ts` before app creation
  - Extend `HttpExceptionFilter` to capture 5xx errors
- **Security**: No PII in events, headers stripped

### 3.4 API Metrics Endpoint
- **Endpoint**: `GET /health/metrics`
- **Data**:
  - Counts: users, posts (non-deleted), threads (non-deleted), reels (READY)
  - System: uptime, memory usage (heap, rss)
  - Timestamp: ISO string
- **Access**: Currently unprotected (dev), production requires API key or IP restriction
- **Location**: Extend existing `HealthController`

## Implementation Steps
1. Install dependencies (`nestjs-pino`, `pino`, `pino-http`, `pino-pretty`, `@sentry/nestjs`, `@sentry/node`)
2. Configure Pino in `app.module.ts`
3. Create `CorrelationIdMiddleware` and register
4. Create Sentry config file and initialize
5. Update `HttpExceptionFilter` to capture 5xx errors
6. Add metrics endpoint to `HealthController`
7. Update `main.ts` logger initialization
8. Test logging, correlation IDs, error capture, metrics

## Dependencies
```json
"dependencies": {
  "nestjs-pino": "^4.0.0",
  "pino": "^9.0.0",
  "pino-http": "^10.0.0",
  "pino-pretty": "^11.0.0",
  "@sentry/nestjs": "^8.0.0",
  "@sentry/node": "^8.0.0"
}
```

## Success Criteria
- Logs show correlation IDs and structured JSON in development
- 5xx errors appear in Sentry (if DSN configured)
- `/health/metrics` returns counts and system info
- No performance regression in API response times

## Notes
- Correlation IDs facilitate tracing across microservices (future)
- Sentry sample rate can be adjusted based on volume
- Metrics endpoint may need authentication in production
- Pino redaction prevents accidental logging of secrets

---

*Approved: 2026-03-06*