# I12 — Middleware Chain Audit

**Scope:** Middleware registration order in `app.module.ts` and `main.ts`; `ResponseTimeMiddleware` (dead code?); `SanitizePipe` (bypass?); `ValidationPipe` (global?); soft-delete filtering (missing?).
**Auditor:** Hostile code audit, 2026-04-05
**Verdict:** 12 findings (2 Critical, 4 High, 4 Medium, 2 Low)

---

## Middleware Registration Order (Actual)

### Layer 1: Express-level (main.ts bootstrap, before NestJS)
```
1. helmet()                          — Security headers (HSTS, X-Content-Type-Options via helmet)
2. compression()                     — gzip responses
3. express.json({ limit: '1mb' })    — Body parser with size limit
4. express.urlencoded({ limit: '1mb' }) — URL-encoded body parser
```

### Layer 2: NestJS Global Filters/Interceptors/Pipes (main.ts)
```
5. HttpExceptionFilter               — Global exception handler
6. TransformInterceptor              — Wraps responses in { data, success, timestamp }
7. MetricsInterceptor                — Request latency logging
8. SanitizePipe                      — Strips HTML/XSS from body/query/param strings
9. ValidationPipe                    — DTO validation with whitelist + forbidNonWhitelisted
```

### Layer 3: NestJS Middleware (app.module.ts configure())
```
10. CorrelationIdMiddleware           — Attaches X-Correlation-ID
11. SecurityHeadersMiddleware         — X-Frame-Options, Referrer-Policy, etc.
12. RequestLoggerMiddleware           — Logs slow requests, error counts
13. ResponseTimeMiddleware            — Adds X-Response-Time header
```

### Layer 4: Guards (app.module.ts providers)
```
14. UserThrottlerGuard (APP_GUARD)    — Rate limiting (100 req/min default)
```

---

## Findings

### I12-01 [CRITICAL] — ResponseTimeMiddleware sets header AFTER response is sent (dead code)

| Field | Value |
|-------|-------|
| **File** | `common/middleware/response-time.middleware.ts:14-16` |
| **Code** | `res.on('finish', () => { res.setHeader('X-Response-Time', ...) })` |

The `finish` event fires AFTER the response has been sent to the client. By the time `setHeader` is called inside `finish`, HTTP headers have already been flushed to the network. **The header is never actually received by the client.**

In Express/Node.js, headers can only be set before `res.end()` is called. The `finish` event fires after `res.end()` completes. This means:
- `res.setHeader('X-Response-Time', ...)` silently does nothing (no error thrown, but header is not sent)
- The entire middleware is dead code — it computes timing but the result is never visible to any client
- Both `RequestLoggerMiddleware` and `MetricsInterceptor` already track latency independently, making this middleware triply redundant

The correct implementation would use `res.on('close', ...)` is also too late. The proper Express pattern is to intercept `res.writeHead` or `res.end` to inject the header before transmission, or use the NestJS interceptor pattern (which `MetricsInterceptor` already does).

**Impact:** No client or monitoring tool can see response times from the API via headers. Any debugging that relies on this header gets nothing.

---

### I12-02 [CRITICAL] — No global soft-delete Prisma middleware; every query manually filters `isRemoved`/`isDeleted`

| Field | Value |
|-------|-------|
| **File** | `config/prisma.service.ts` — no `$use()` middleware |
| **Schema** | 8+ models have `isRemoved Boolean @default(false)` or `isDeleted Boolean @default(false)` |

The Prisma schema has soft-delete fields on at least these models:
- `User`: `isDeleted`, `deletedAt`
- `Post`: `isRemoved`
- `Comment`: `isRemoved`
- `Reel`: `isRemoved`
- `Thread`: `isRemoved`
- `Video`: `isRemoved`
- `Story`: `isRemoved`
- `Message`: `isDeleted`
- `ChannelPost`: `isRemoved`
- `CommunityNote`: `isDeleted`

There is **no Prisma middleware** (`$use()`) to automatically filter soft-deleted records. Every query across ~80 modules must manually add `isRemoved: false` or `isDeleted: false` to its `where` clause.

**Evidence of manual filtering working:** Posts service has `isRemoved: false` in 30+ queries. Feed service has it in 30+ queries. Messages service has `isDeleted: false` in 15+ queries.

**Risk of missed filter:** Any new query or any existing query that forgets `isRemoved: false` leaks deleted content to users. With ~200 Prisma models and thousands of queries, a single omission is a data leak. The inconsistent naming (`isRemoved` vs `isDeleted`) makes it worse — a developer checking for one might forget the other.

**Why this matters:** Prisma supports `$use()` middleware that can intercept all `findMany`, `findFirst`, `findUnique`, `count`, etc. and auto-inject `isRemoved: false`. This is a standard pattern. Without it, every query is a potential soft-delete bypass.

---

### I12-03 [HIGH] — SanitizePipe does not sanitize `@Headers()` or custom decorators

| Field | Value |
|-------|-------|
| **File** | `common/pipes/sanitize.pipe.ts:8-12` |
| **Code** | Only processes `metadata.type === 'body'`, `'query'`, and `'param'` |

The `SanitizePipe` only sanitizes three metadata types: `body`, `query`, and `param`. It explicitly skips `custom` type (used by custom decorators like `@CurrentUser`) — which is fine. But it also skips headers entirely.

While headers are rarely user-controlled in a mobile API, the `X-Correlation-ID` header IS user-controlled (clients can send their own). The `CorrelationIdMiddleware` accepts incoming `x-correlation-id` values without sanitization and propagates them to:
- Response headers (`res.setHeader('x-correlation-id', correlationId)`)
- Log context (`req.id = correlationId` for pino-http)
- Job payloads via `correlationStore` (AsyncLocalStorage)

A malicious client could inject `x-correlation-id: <script>alert(1)</script>` and it would:
1. Appear in server logs (log injection)
2. Be stored in job payloads in Redis
3. Be reflected back in the response header

**Severity note:** This is High not Critical because the API doesn't serve HTML, so XSS in response headers is unexploitable. But log injection is a real concern for log aggregation tools that render HTML.

---

### I12-04 [HIGH] — ValidationPipe only registered in main.ts, NOT in test modules

| Field | Value |
|-------|-------|
| **File** | `main.ts:189-197` |
| **Impact** | Tests never validate DTO constraints |

The `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` is only registered in `main.ts` bootstrap. It is NOT registered in any test module (checked 250 spec files — none set up `ValidationPipe`). This means:

- Tests can send any properties in request bodies, including properties not in the DTO
- Tests can send invalid values (wrong types, missing required fields) and the mock controller will accept them
- A DTO with `@IsString() @MaxLength(100) title` constraint is never enforced in tests
- Tests pass even when DTOs are misconfigured

This is a systemic blind spot: **the entire DTO validation layer is untested**. A developer could remove `@IsNotEmpty()` from a DTO and no test would fail.

---

### I12-05 [HIGH] — SanitizePipe also not registered in test modules

Same issue as I12-04 but for sanitization. The `SanitizePipe` is registered via dynamic import in `main.ts:188-190` but never in test modules. Tests never verify that XSS payloads in request bodies are stripped before reaching service methods.

**File:** `main.ts:188-190`

---

### I12-06 [HIGH] — Duplicate security headers: helmet + SecurityHeadersMiddleware set overlapping headers

| Header | Set by helmet | Set by SecurityHeadersMiddleware | Conflict? |
|--------|--------------|--------------------------------|-----------|
| `X-Content-Type-Options: nosniff` | YES | YES | Duplicate |
| `X-Frame-Options: DENY` | YES (default SAMEORIGIN) | YES (DENY) | **Value conflict** — helmet sets SAMEORIGIN, middleware overrides to DENY |
| `X-XSS-Protection` | YES (0) | YES (0) | Duplicate |
| HSTS | YES (maxAge: 31536000) | NO | OK |
| `Referrer-Policy` | NO | YES | OK |
| `Permissions-Policy` | NO | YES | OK |

**Problem:** Two independent systems set the same headers. Helmet runs in Express layer (main.ts line 166), SecurityHeadersMiddleware runs in NestJS middleware layer (app.module.ts line 232). The NestJS middleware runs later and overwrites helmet's values.

Specifically:
- Helmet sets `X-Frame-Options: SAMEORIGIN` (its default)
- SecurityHeadersMiddleware overwrites it to `X-Frame-Options: DENY`
- The final value is DENY, which is actually what you want, but it happens by accident (middleware execution order, not by design)

**Risk:** If middleware order changes or helmet config changes, the security posture silently degrades.

---

### I12-07 [MEDIUM] — Middleware execution order: SecurityHeaders before CorrelationId would be more logical

Current order in `app.module.ts:232`:
```typescript
consumer.apply(
  CorrelationIdMiddleware,     // 1st
  SecurityHeadersMiddleware,   // 2nd
  RequestLoggerMiddleware,     // 3rd
  ResponseTimeMiddleware,      // 4th (dead code, see I12-01)
).forRoutes('*');
```

NestJS applies middleware in the order they're listed. The current order is fine functionally, but `CorrelationIdMiddleware` runs before `SecurityHeadersMiddleware`, meaning if the correlation ID middleware throws (e.g., due to a bug in `randomUUID()`), the security headers are never set on the error response.

A more defensive order would be: SecurityHeaders first (always set headers, no matter what), then CorrelationId, then Logger, then ResponseTime.

**Severity:** Medium because `randomUUID()` from Node's `crypto` module essentially never throws, so this is a theoretical concern.

---

### I12-08 [MEDIUM] — Triple-redundant latency tracking: ResponseTimeMiddleware + RequestLoggerMiddleware + MetricsInterceptor

Three separate systems track request duration:

| Component | Layer | Threshold | What it does |
|-----------|-------|-----------|-------------|
| `ResponseTimeMiddleware` | Middleware (layer 3) | None | Sets `X-Response-Time` header (broken — see I12-01) |
| `RequestLoggerMiddleware` | Middleware (layer 3) | 500ms | Logs slow requests, tracks error counts |
| `MetricsInterceptor` | Interceptor (layer 2) | 200ms/1000ms | Logs request latency at 3 levels |

All three compute `Date.now() - start` independently. Two of them (Logger + Metrics) both log slow requests, just with different thresholds. The ResponseTimeMiddleware is dead code (I12-01).

**Impact:** Performance overhead is negligible, but this is a maintenance hazard. When someone changes the slow-request threshold, they need to update 2 places. When debugging latency, 3 different log entries appear for the same request.

---

### I12-09 [MEDIUM] — SanitizePipe HTML stripping is regex-based, can be bypassed

| Field | Value |
|-------|-------|
| **File** | `common/utils/sanitize.ts:12-13` |
| **Code** | `.replace(/<[^>]*>/g, '').replace(/<[a-zA-Z/!][^>]*/g, '')` |

The sanitization uses two regex patterns to strip HTML tags. While the second regex catches unclosed tags, regex-based HTML sanitization is fundamentally bypassable:

- `<img src=x onerror=alert(1)//` with no closing `>` — caught by second regex
- `<svg/onload=alert(1)>` — caught by first regex
- `\x3cscript\x3e` (unicode escape) — NOT caught (depends on whether the string is already decoded)
- Template literal injection via `${...}` — not relevant for server-side
- Double-encoding: `&lt;script&gt;` → decoded by some renderers back to `<script>` — not an issue for a JSON API that doesn't render HTML

**Severity:** Medium because the API returns JSON, not HTML. XSS via stored payloads would only be exploitable if the mobile client renders raw HTML (it uses React Native `<Text>` which does not parse HTML). However, if a web admin dashboard is ever built that renders this content as HTML, stored XSS payloads that bypass regex stripping would execute.

**Recommendation:** Use a proper HTML sanitizer library (e.g., `sanitize-html`, `dompurify`, `isomorphic-dompurify`) instead of regex.

---

### I12-10 [MEDIUM] — Inconsistent soft-delete field naming: `isRemoved` vs `isDeleted`

| Field name | Used by models |
|-----------|---------------|
| `isRemoved` | Post, Comment, Reel, Thread, Video, Story, ChannelPost |
| `isDeleted` | User, Message, Conversation, CommunityNote |

Two different boolean field names for the same concept. This means:
- A developer writing a generic utility (e.g., "exclude soft-deleted records") must check BOTH field names
- A Prisma middleware for soft-delete filtering would need model-specific logic
- Code review is harder — scanning for `isRemoved` misses `isDeleted` and vice versa
- The User model has BOTH `isDeleted: Boolean` AND `deletedAt: DateTime?`, while content models use only `isRemoved: Boolean` with no timestamp

**File:** `prisma/schema.prisma` lines 957-958, 1282, 1359, 1445, 1512, 1573, 1622, 1710, 1761, 1850, 1999, 2040, 3295

---

### I12-11 [LOW] — CorrelationIdMiddleware accepts arbitrary-length correlation IDs from clients

| Field | Value |
|-------|-------|
| **File** | `common/middleware/correlation-id.middleware.ts:15-21` |
| **Code** | `correlationId = incoming \|\| randomUUID()` |

The middleware accepts any string from the `x-correlation-id` header with no length or format validation. A malicious client could send a 1MB correlation ID that gets:
- Stored in `req.id` (used by pino-http for every log line)
- Set in the response header
- Stored in AsyncLocalStorage and propagated to all BullMQ job payloads

**Impact:** Log bloat and Redis storage bloat. A 1MB correlation ID on every request could exhaust disk/memory.

**Fix:** Validate format (UUID or max 64 chars), reject otherwise.

---

### I12-12 [LOW] — RequestLoggerMiddleware process-local counters reset on deploy

| Field | Value |
|-------|-------|
| **File** | `common/middleware/request-logger.middleware.ts:12-14` |
| **Code** | `private requestCount = 0; private errorCount = 0; private slowCount = 0;` |

The middleware maintains in-memory counters for request/error/slow counts. These reset to 0 on every deploy or process restart. The `getStats()` method (line 51) returns these counters but they're only meaningful within the current process lifetime.

The code already has a comment acknowledging this: "NOTE: Counters reset on deploy (process-local)." This is a known limitation, not a bug, but:
- With Railway's rolling deploys, counters reset every deploy (~daily or more)
- With horizontal scaling (multiple instances), each instance has its own counters
- The `/health/metrics` endpoint (if wired to `getStats()`) returns misleading values

---

## Risk Matrix

| ID | Severity | Category | Impact |
|----|----------|----------|--------|
| I12-01 | CRITICAL | Dead code | X-Response-Time header never sent |
| I12-02 | CRITICAL | Missing filter | Any forgotten `isRemoved: false` leaks deleted content |
| I12-03 | HIGH | Unsanitized header | Log injection via X-Correlation-ID |
| I12-04 | HIGH | Test gap | DTO validation never exercised in tests |
| I12-05 | HIGH | Test gap | Sanitization never exercised in tests |
| I12-06 | HIGH | Duplicate config | Helmet + middleware set conflicting headers |
| I12-07 | MEDIUM | Ordering | Security headers not guaranteed on middleware errors |
| I12-08 | MEDIUM | Redundancy | Triple latency tracking |
| I12-09 | MEDIUM | Regex bypass | HTML sanitization bypassable in edge cases |
| I12-10 | MEDIUM | Naming inconsistency | `isRemoved` vs `isDeleted` causes missed filters |
| I12-11 | LOW | Input validation | Unbounded correlation ID length |
| I12-12 | LOW | Known limitation | Process-local counters reset on deploy |

---

## Systemic Issues

1. **No infrastructure-level testing:** The middleware chain, pipe order, and guard registration are only verified by running the actual application. No integration test bootstraps `NestFactory.create(AppModule)` and verifies that all middleware fires in order.

2. **Soft-delete is a ticking time bomb:** Without Prisma middleware, every new query is a potential data leak. The project has ~200 models and thousands of queries. Manual `isRemoved: false` filters are reliable only when developers remember them — and the inconsistent naming (`isRemoved` vs `isDeleted`) makes forgetting easier.

3. **Test-production parity gap:** Tests never see `SanitizePipe`, `ValidationPipe`, `helmet`, `SecurityHeadersMiddleware`, `ResponseTimeMiddleware`, `MetricsInterceptor`, or `UserThrottlerGuard`. The entire middleware/pipe/guard stack is untested.
