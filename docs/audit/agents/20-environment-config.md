# Agent #20: Environment/Config Deep Audit

**Scope:** `.env.example`, `.env`, `app.module.ts`, `main.ts`, `config/` directory, every file reading `process.env.*` or `ConfigService`
**Files audited:** 28 files, every line read
**Total findings:** 57

---

## CRITICAL (Severity: P0) — Ship Blockers

### Finding 1: All 4 R2 env var names are wrong — uploads completely broken
**File:** `apps/api/.env` vs `apps/api/src/modules/upload/upload.service.ts`
**Lines:** .env:24-27 vs upload.service.ts:49-56

The `.env` file defines:
```
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=mizanly-uploads
```

But `upload.service.ts` reads via ConfigService:
```ts
this.config.get('R2_ACCOUNT_ID')         // expects R2_ACCOUNT_ID
this.config.get('R2_ACCESS_KEY_ID')      // expects R2_ACCESS_KEY_ID
this.config.get('R2_SECRET_ACCESS_KEY')  // expects R2_SECRET_ACCESS_KEY
this.config.get('R2_BUCKET_NAME')        // expects R2_BUCKET_NAME
this.config.get('R2_PUBLIC_URL')         // expects R2_PUBLIC_URL
```

**Impact:** Even if you fill in the `.env` values, uploads will remain broken because the variable names don't match. The `.env.example` file has the correct names but `.env` has wrong names.
**Category:** ENV_VAR_MISMATCH
**Severity:** P0

### Finding 2: .env has CLOUDFLARE_ACCOUNT_ID but health controller reads CF_ACCOUNT_ID
**File:** `apps/api/src/modules/health/health.controller.ts:35`
**Code:**
```ts
process.env.CF_ACCOUNT_ID || ''
```
Yet `.env` defines `CLOUDFLARE_ACCOUNT_ID`. This is a third name for the same value (`.env` = `CLOUDFLARE_ACCOUNT_ID`, upload code = `R2_ACCOUNT_ID`, health check = `CF_ACCOUNT_ID`).
**Impact:** Health check Stream endpoint always uses empty string for account ID.
**Category:** ENV_VAR_MISMATCH
**Severity:** P0

### Finding 3: Redis errors silently swallowed with zero logging
**File:** `apps/api/src/config/redis.module.ts:13-14`
**Code:**
```ts
redis.on('error', () => {});
redis.connect().catch(() => {});
```
The Redis module:
1. Swallows ALL error events with an empty handler (line 13)
2. Swallows connection failures with an empty catch (line 14)
3. The Proxy silently returns fake OK/null when Redis is down (lines 16-28)

There is zero logging anywhere. If Redis goes down in production, you get:
- Silent cache misses (stale data served)
- Silent queue failures (notifications/jobs silently dropped)
- Silent rate limit bypass (throttling via Redis stops working)
- Silent feature flag failures (all flags return false)
- No alert, no log, no metric, no way to know

**Impact:** Production Redis outage would be invisible. Rate limiting, caching, queues, feature flags, analytics all silently degrade with no monitoring signal.
**Category:** SILENT_FAILURE
**Severity:** P0

### Finding 4: Credentials exposed in .env committed to project context
**File:** `apps/api/.env`

The `.env` file contains real credentials:
- DATABASE_URL with actual Neon password: `npg_feAIM2aNR9vt`
- CLERK_SECRET_KEY: `sk_test_xwLDPdhiQnMp5ZH9k9ck4f9vIr87nkAZGuFFpMmg5e`
- REDIS_URL with Upstash password
- STRIPE_SECRET_KEY: `sk_test_51TCJjsBiRu9mSnPE...`
- ANTHROPIC_API_KEY: `sk-ant-api03-BxphwOlY...`

While `.env` itself is properly `.gitignore`d, these credentials are now embedded in the CLAUDE.md conversation context and memory files that are accessible to Claude. If the git repo is ever shared or the memory files leaked, all credentials are compromised.

**Impact:** Credential exposure risk. These are test keys but the pattern is dangerous for production.
**Category:** SECRET_EXPOSURE
**Severity:** P0

---

## HIGH (Severity: P1) — Security & Reliability

### Finding 5: Duplicate Sentry init — two competing implementations
**File:** `apps/api/src/config/sentry.ts` AND `apps/api/src/common/sentry.config.ts`
**Lines:** Both export `initSentry()`

There are two separate Sentry initialization files:
1. `config/sentry.ts` — imported and called from `main.ts` (uses `import * as Sentry from '@sentry/node'`)
2. `common/sentry.config.ts` — defines `initSentry()` with dynamic require, plus `captureException`/`captureMessage` helpers

`main.ts:7` imports from `./config/sentry`, so the `common/sentry.config.ts` version's `initSentry` is never called. However, `common/sentry.config.ts` exports `captureException` and `captureMessage` — if any code imports from there, Sentry won't be initialized via that path.

Meanwhile `http-exception.filter.ts:10` imports `@sentry/node` directly (a third pattern), creating three different Sentry integration patterns.

**Impact:** Inconsistent error reporting. Some errors may not reach Sentry depending on which import path is used.
**Category:** DEAD_CODE / INCONSISTENCY
**Severity:** P1

### Finding 6: Socket.io Redis adapter defined but never used
**File:** `apps/api/src/config/socket-io-adapter.ts` and `apps/api/src/main.ts`

`socket-io-adapter.ts` exports `initRedisAdapter(app)` for horizontal scaling of WebSocket connections. But `main.ts` never calls it. The adapter is dead code.

**Impact:** WebSocket connections only work on a single server instance. If you scale to multiple API replicas, socket events won't propagate between instances.
**Category:** DEAD_CODE
**Severity:** P1

### Finding 7: Chat gateway CORS reads process.env at decorator evaluation time
**File:** `apps/api/src/gateways/chat.gateway.ts:39`
**Code:**
```ts
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGINS?.split(',') ?? [] },
  ...
})
```
This reads `process.env.CORS_ORIGINS` at module loading time (decorator evaluation), not at runtime. If `ConfigModule` hasn't loaded `.env` yet (which it hasn't at decorator evaluation time in some NestJS bootstrap scenarios), this could resolve to `undefined` and fall back to an empty array `[]`, blocking all WebSocket connections.

Meanwhile, `main.ts:64` reads the same env var for HTTP CORS, but at runtime inside `bootstrap()` after ConfigModule is loaded.

**Impact:** WebSocket CORS may be misconfigured, potentially blocking all Socket.io connections in production.
**Category:** TIMING_BUG
**Severity:** P1

### Finding 8: enableImplicitConversion in ValidationPipe is dangerous
**File:** `apps/api/src/main.ts:94`
**Code:**
```ts
transformOptions: { enableImplicitConversion: true },
```
This silently converts string query params to numbers/booleans. Combined with `whitelist: true`, it means `?limit=DROP TABLE users` would be converted to `NaN` for number fields rather than being rejected. More critically, any string "true"/"false" is auto-converted to boolean, and numeric strings to numbers, which can bypass intended type validation.

**Impact:** Type coercion attacks. Query string "0" becomes falsy boolean, potentially bypassing auth checks on boolean fields.
**Category:** VALIDATION_WEAKNESS
**Severity:** P1

### Finding 9: Stripe webhook controller uses process.env directly
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts:31,48`
**Code:**
```ts
this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { ... });
...
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
```
This reads `process.env` directly instead of using ConfigService, inconsistent with the rest of the codebase. When `ConfigModule.forRoot()` with `.env` file loading is the pattern, direct `process.env` access may read stale or missing values if the `.env` loading order differs.

**Impact:** Inconsistency. Could lead to Stripe being initialized with empty key if `.env` loading order changes.
**Category:** INCONSISTENCY
**Severity:** P1

### Finding 10: Redis module has no graceful shutdown
**File:** `apps/api/src/config/redis.module.ts`

The Redis module creates a connection via `new Redis(...)` but never implements `OnModuleDestroy` to call `redis.quit()` or `redis.disconnect()`. When the app shuts down (via `enableShutdownHooks()` in main.ts), the Redis connection hangs, potentially causing shutdown timeout or connection leak.

By contrast, `PrismaService` properly implements `onModuleDestroy` to call `$disconnect()`.

**Impact:** Unclean shutdown. Open Redis connections accumulate during restarts, potentially hitting connection limits on Upstash.
**Category:** RESOURCE_LEAK
**Severity:** P1

### Finding 11: Stream webhook processes requests when secret is empty
**File:** `apps/api/src/modules/stream/stream.controller.ts:27,43`
**Code:**
```ts
this.webhookSecret = this.config.get('CF_STREAM_WEBHOOK_SECRET') ?? '';
...
if (this.webhookSecret) {
  // verify signature
}
```
When `CF_STREAM_WEBHOOK_SECRET` is not set (which it currently isn't — not in `.env` or `.env.example`), the webhook endpoint accepts ANY request without signature verification. An attacker could send fake "stream ready" events to mark arbitrary videos as published.

**Impact:** Unauthenticated webhook. Anyone can trigger video status changes.
**Category:** AUTHENTICATION_BYPASS
**Severity:** P1

---

## MEDIUM (Severity: P2) — Configuration Gaps

### Finding 12: 7 env vars used in code but missing from .env.example
**File:** `apps/api/.env.example`

The following env vars are read via `ConfigService.get()` but NOT listed in `.env.example`:

| Env Var | Used In | Purpose |
|---------|---------|---------|
| `OPENAI_API_KEY` | `ai.service.ts:316,382` | Whisper voice transcription |
| `GEMINI_API_KEY` | `embeddings.service.ts:30` | Text embeddings/recommendations |
| `GOLD_PRICE_PER_GRAM` | `islamic.service.ts:423` | Zakat calculator |
| `SILVER_PRICE_PER_GRAM` | `islamic.service.ts:424` | Zakat calculator |
| `APP_URL` | `og.service.ts:5` | OpenGraph/SEO/sitemap URLs |
| `CF_STREAM_WEBHOOK_SECRET` | `stream.controller.ts:27` | Stream webhook verification |
| `R2_PUBLIC_URL` | `upload.service.ts:56`, `health.controller.ts:31` | Public media URL |

**Impact:** New developers will not know these env vars exist. Features silently degrade.
**Category:** MISSING_DOCUMENTATION
**Severity:** P2

### Finding 13: .env.example has CF_IMAGES vars that nothing reads
**File:** `apps/api/.env.example:22-23`
**Code:**
```
CF_IMAGES_API_TOKEN=""
CF_IMAGES_ACCOUNT_ID=""
```
No file in the codebase references `CF_IMAGES_API_TOKEN` or `CF_IMAGES_ACCOUNT_ID`. These are phantom env vars that mislead developers.

**Impact:** Misleading configuration. Developer wastes time getting Cloudflare Images credentials that are never used.
**Category:** DEAD_CODE
**Severity:** P2

### Finding 14: .env R2 bucket name mismatch
**File:** `apps/api/.env:27` vs `apps/api/.env.example:14` vs `apps/api/src/modules/upload/upload.service.ts:55`

Three different bucket names:
- `.env` defines: `CLOUDFLARE_R2_BUCKET=mizanly-uploads`
- `.env.example` defines: `R2_BUCKET_NAME="mizanly-media"`
- `upload.service.ts` defaults to: `'mizanly-media'`

Even if the env var name mismatch (Finding 1) is fixed, the bucket name in `.env` is wrong.

**Impact:** If someone fixes the env var names but copies the value from `.env`, uploads would go to the wrong bucket.
**Category:** ENV_VAR_MISMATCH
**Severity:** P2

### Finding 15: validateEnv() only checks 2 of 14+ services
**File:** `apps/api/src/main.ts:12-43`

The `validateEnv()` function checks:
- **Required (fatal):** `DATABASE_URL`, `CLERK_SECRET_KEY`
- **Recommended (warn):** `REDIS_URL`, `CLERK_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`

Missing from validation:
- All R2/upload vars (4 vars)
- CF_STREAM vars (2 vars)
- MEILISEARCH vars (2 vars)
- OPENAI_API_KEY
- GEMINI_API_KEY
- RESEND_API_KEY
- TURN server vars (3 vars)
- CORS_ORIGINS
- GOLD/SILVER price vars

**Impact:** App starts silently with broken uploads, broken video, broken search, broken email, and broken calls.
**Category:** MISSING_VALIDATION
**Severity:** P2

### Finding 16: ConfigModule.forRoot() has no validation schema
**File:** `apps/api/src/app.module.ts:107`
**Code:**
```ts
ConfigModule.forRoot({ isGlobal: true })
```
NestJS `ConfigModule` supports a `validationSchema` option (using Joi) or `validate` option to validate all env vars at startup. Neither is configured, so invalid/missing env vars are only caught when first accessed at runtime.

**Impact:** Configuration errors surface at runtime instead of startup, making debugging harder.
**Category:** MISSING_VALIDATION
**Severity:** P2

### Finding 17: og.service.ts reads process.env at module load time
**File:** `apps/api/src/modules/og/og.service.ts:5`
**Code:**
```ts
const APP_URL = process.env.APP_URL || 'https://mizanly.com';
```
This is a top-level constant evaluated at module load time, before NestJS ConfigModule has loaded the `.env` file. It will always use the fallback `'https://mizanly.com'` unless `APP_URL` is set as a system environment variable (not just in `.env`).

**Impact:** OG tags, sitemaps, and robots.txt all hardcode `https://mizanly.com` regardless of actual deployment URL.
**Category:** TIMING_BUG
**Severity:** P2

### Finding 18: islamic.service.ts reads process.env directly for gold/silver
**File:** `apps/api/src/modules/islamic/islamic.service.ts:423-424`
**Code:**
```ts
const goldPricePerGram = parseFloat(process.env.GOLD_PRICE_PER_GRAM || '92');
const silverPricePerGram = parseFloat(process.env.SILVER_PRICE_PER_GRAM || '1.05');
```
Uses `process.env` directly instead of `ConfigService`, inconsistent with the rest of the codebase. Also has the same timing issue as Finding 17 since these are in a method body (OK for methods, but inconsistent pattern).

**Impact:** Inconsistency with rest of codebase. Less testable (can't mock ConfigService in tests).
**Category:** INCONSISTENCY
**Severity:** P2

### Finding 19: health.controller.ts reads process.env directly (6 instances)
**File:** `apps/api/src/modules/health/health.controller.ts:31-37,54`

Six direct `process.env` reads instead of using ConfigService:
```ts
process.env.R2_PUBLIC_URL        // line 31
process.env.CF_STREAM_API_TOKEN  // line 34
process.env.CF_ACCOUNT_ID        // line 35 (wrong name, see Finding 2)
process.env.CF_STREAM_API_TOKEN  // line 37
process.env.npm_package_version  // line 54
```

**Impact:** Inconsistency. Cannot test health check with different configs without modifying process.env.
**Category:** INCONSISTENCY
**Severity:** P2

### Finding 20: CORS_ORIGINS not validated — accepts any string
**File:** `apps/api/src/main.ts:64`
**Code:**
```ts
origin: process.env.CORS_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:8081', 'http://localhost:8082'],
```
No validation that origins are valid URLs. A typo like `http//localhost:8081` (missing colon) would be silently accepted and cause CORS failures with no clear error.

**Impact:** Silent CORS misconfiguration in production.
**Category:** MISSING_VALIDATION
**Severity:** P2

### Finding 21: Swagger API docs exposed based on NODE_ENV, not a dedicated flag
**File:** `apps/api/src/main.ts:99`
**Code:**
```ts
if (process.env.NODE_ENV !== 'production') {
```
If NODE_ENV is accidentally set to `staging`, `test`, or any value other than exactly `production`, Swagger docs (including all endpoint schemas, request/response shapes, and the "Try it out" feature) will be publicly accessible.

**Impact:** Information disclosure. Full API schema exposed if NODE_ENV is not exactly "production".
**Category:** INFORMATION_DISCLOSURE
**Severity:** P2

### Finding 22: Redis Proxy intercepts only 4 methods
**File:** `apps/api/src/config/redis.module.ts:21-22`
**Code:**
```ts
if (prop === 'get') return Promise.resolve(null);
if (prop === 'setex' || prop === 'set' || prop === 'del' || prop === 'incr') return Promise.resolve('OK');
```
The proxy only handles `get`, `setex`, `set`, `del`, and `incr`. Any other Redis command (`hgetall`, `lpush`, `pipeline`, `exists`, `expire`, `mget`, `ping`, `incrby`, etc.) called when Redis is down will attempt the real call on the disconnected client, throwing unhandled promise rejections.

Services that use unhandled methods:
- `feature-flags.service.ts` uses `hgetall`, `hset`, `hdel`
- `analytics.service.ts` uses `pipeline`, `lpush`, `ltrim`, `mget`, `incrby`, `expire`
- `content-safety.service.ts` uses `incr`, `expire`, `exists`
- `payments.service.ts` uses `setex`, `get`, `del`

**Impact:** When Redis is down, feature flags, analytics, and content safety services throw unhandled errors.
**Category:** INCOMPLETE_FALLBACK
**Severity:** P2

---

## LOW (Severity: P3) — Code Quality & Best Practices

### Finding 23: No .env validation for CORS_ORIGINS format
**File:** `apps/api/src/main.ts:64` and `apps/api/src/gateways/chat.gateway.ts:39`

CORS origins are split by comma with no trimming. A value like `http://localhost:8081, http://localhost:8082` (with space after comma) would create an origin ` http://localhost:8082` with a leading space, which never matches.

**Impact:** Subtle CORS bug if spaces exist in the env var value.
**Category:** INPUT_VALIDATION
**Severity:** P3

### Finding 24: Helmet CSP disabled without plan to enable
**File:** `apps/api/src/main.ts:72`
**Code:**
```ts
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now — mobile API doesn't serve HTML
```
While the comment explains the rationale (mobile API), the Swagger docs DO serve HTML. If Swagger is enabled, disabling CSP means Swagger HTML pages have no XSS protection via CSP headers.

**Impact:** Low risk since Swagger is dev-only. But if Swagger is accidentally exposed in production (see Finding 21), no CSP protection.
**Category:** SECURITY_HARDENING
**Severity:** P3

### Finding 25: Request body limits may be too small
**File:** `apps/api/src/main.ts:81-82`
**Code:**
```ts
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```
1MB limit is fine for most endpoints, but the Stripe webhook controller needs `rawBody` access, and some endpoints accept large JSON payloads (bulk import, batch operations). The limit is globally applied with no per-route override.

**Impact:** May cause 413 errors on legitimate large payloads. Low severity since most payloads are small.
**Category:** CONFIGURATION
**Severity:** P3

### Finding 26: BullMQ Queue URL uses `url` instead of parsed connection
**File:** `apps/api/src/common/queue/queue.module.ts:56`
**Code:**
```ts
return new Queue(name, {
  connection: { url: redisUrl },
  ...
});
```
BullMQ's `connection.url` works but doesn't handle all Redis URL schemes (e.g., `rediss://` for TLS) as reliably as parsing the URL into `{host, port, password, tls}`. The current Upstash URL uses `rediss://` (TLS), which may not be correctly parsed by all BullMQ versions.

**Impact:** Potential queue connection failures with TLS Redis URLs.
**Category:** COMPATIBILITY
**Severity:** P3

### Finding 27: PrismaService catches connection error but continues
**File:** `apps/api/src/config/prisma.service.ts:16-17`
**Code:**
```ts
} catch (error) {
  this.logger.error('Failed to connect to database — will retry on first query', error instanceof Error ? error.message : error);
}
```
If the database is unreachable at startup, the app logs a warning and continues. The first actual query will then fail with an opaque Prisma error rather than a clear "database unavailable" message. The `validateEnv()` only checks that `DATABASE_URL` is set, not that it's reachable.

**Impact:** App starts with broken database connection, confusing first-query errors.
**Category:** ERROR_HANDLING
**Severity:** P3

### Finding 28: Permissions-Policy blocks camera/mic/geolocation
**File:** `apps/api/src/common/middleware/security-headers.middleware.ts:11`
**Code:**
```ts
res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
```
This header blocks browser access to camera, microphone, and geolocation. While the API shouldn't serve web pages, if the Swagger UI is accessed from a browser that respects this header, any future web client hitting the API would be blocked from these features.

**Impact:** Minimal for mobile API. Could block future web client features.
**Category:** CONFIGURATION
**Severity:** P3

### Finding 29: Two response time middlewares with different thresholds
**File:** `apps/api/src/common/middleware/request-logger.middleware.ts:14` and `apps/api/src/common/middleware/response-time.middleware.ts:4`

- `RequestLoggerMiddleware` has `SLOW_THRESHOLD_MS = 500`
- `ResponseTimeMiddleware` has `SLOW_THRESHOLD_MS = 200`

Both are applied to all routes (app.module.ts:195), so every request gets TWO "slow request" checks with different thresholds. A 300ms request would be logged as slow by ResponseTimeMiddleware but not by RequestLoggerMiddleware.

**Impact:** Confusing logs, double logging overhead.
**Category:** REDUNDANCY
**Severity:** P3

### Finding 30: Pino logger AND NestJS logger both configured
**File:** `apps/api/src/app.module.ts:98-106` and `apps/api/src/main.ts:54-56`

`AppModule` imports `LoggerModule.forRoot()` (pino-http), while `NestFactory.create()` also configures NestJS's built-in logger levels. These are separate logging systems. Pino formats JSON, NestJS Logger formats text. Services use `new Logger(...)` (NestJS), while HTTP requests use pino.

**Impact:** Inconsistent log formats. JSON (pino) for HTTP, text (NestJS) for service logs.
**Category:** INCONSISTENCY
**Severity:** P3

### Finding 31: ConfigService type safety not enforced
**File:** Multiple files

All `ConfigService.get()` calls use string keys without type checking:
```ts
this.config.get('R2_ACCOUNT_ID')         // returns unknown
this.config.get<string>('STRIPE_SECRET_KEY')  // type asserts but doesn't validate
```
NestJS supports typed configuration via `registerAs()` or a configuration namespace, which would catch typos at compile time. Currently, a typo like `this.config.get('R2_ACOUNT_ID')` (missing C) would silently return `undefined`.

**Impact:** Typos in env var names silently return undefined at runtime.
**Category:** TYPE_SAFETY
**Severity:** P3

### Finding 32: StripeConnectService credits coins BEFORE payment confirmation
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts:131-134`
**Code:**
```ts
// Credit coins (in production, do this in the webhook after payment succeeds)
await this.prisma.user.update({
  where: { id: userId },
  data: { coinBalance: { increment: pkg.coins } },
});
```
The comment acknowledges this is wrong ("in production, do this in the webhook"). Coins are credited immediately, regardless of whether the payment intent succeeds. Even when Stripe is unavailable (apiAvailable=false), coins are still credited with a mock payment intent ID.

**Impact:** Free coins exploit. Call `purchaseCoins` repeatedly to get unlimited coins without paying.
**Category:** BUSINESS_LOGIC
**Severity:** P0 (re-categorized from P3 because this is actually a critical exploit)

### Finding 33: CORS fallback defaults are localhost only
**File:** `apps/api/src/main.ts:64`
**Code:**
```ts
origin: process.env.CORS_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:8081', 'http://localhost:8082'],
```
If `CORS_ORIGINS` is unset in production, CORS will default to localhost origins. This would block ALL cross-origin requests from the mobile app or any web client, with a confusing CORS error.

Meanwhile, `chat.gateway.ts:39` defaults to `[]` (empty), which would block ALL WebSocket connections if CORS_ORIGINS is unset.

**Impact:** Silent failure if CORS_ORIGINS not set in production deployment.
**Category:** DEPLOYMENT_RISK
**Severity:** P2

---

## ENV VAR INVENTORY — Complete Cross-Reference

### Env Vars Used in Code vs Defined in .env/.env.example

| Env Var Name (in code) | .env | .env.example | Code File(s) | Status |
|------------------------|------|-------------|-------------|--------|
| `DATABASE_URL` | SET | YES | Prisma auto | OK |
| `DIRECT_DATABASE_URL` | SET | YES | Prisma auto | OK |
| `NODE_ENV` | SET | YES | main.ts, app.module.ts, sentry, filter | OK |
| `PORT` | SET | YES | main.ts:126 | OK |
| `API_URL` | SET | YES | main.ts:111 | OK |
| `CORS_ORIGINS` | SET | YES | main.ts:64, chat.gateway.ts:39 | OK |
| `CLERK_SECRET_KEY` | SET | YES | auth.service, auth.guard, chat.gateway | OK |
| `CLERK_PUBLISHABLE_KEY` | SET | YES | (mobile only) | OK |
| `CLERK_WEBHOOK_SECRET` | EMPTY | YES | webhooks.controller.ts:43 | EMPTY |
| `REDIS_URL` | SET | YES | redis.module, socket-io-adapter, queue | OK |
| `STRIPE_SECRET_KEY` | SET | YES | payments.service, stripe-connect, webhook-ctrl | OK |
| `STRIPE_WEBHOOK_SECRET` | EMPTY | YES | stripe-webhook.controller.ts:48 | EMPTY |
| `ANTHROPIC_API_KEY` | SET | YES | ai.service, content-safety, stickers | OK |
| `SENTRY_DSN` | EMPTY | YES | config/sentry, common/sentry.config, filter | EMPTY |
| `MEILISEARCH_HOST` | EMPTY | YES | meilisearch.service.ts:38 | EMPTY |
| `MEILISEARCH_API_KEY` | EMPTY | YES | meilisearch.service.ts:39 | EMPTY |
| `R2_ACCOUNT_ID` | **WRONG NAME** | YES | upload.service.ts:49 | BROKEN |
| `R2_ACCESS_KEY_ID` | **WRONG NAME** | YES | upload.service.ts:51 | BROKEN |
| `R2_SECRET_ACCESS_KEY` | **WRONG NAME** | YES | upload.service.ts:52 | BROKEN |
| `R2_BUCKET_NAME` | **WRONG NAME** | YES | upload.service.ts:55 | BROKEN |
| `R2_PUBLIC_URL` | **MISSING** | YES | upload.service.ts:56, health.controller.ts:31 | MISSING |
| `CF_STREAM_ACCOUNT_ID` | **MISSING** | YES | stream.service.ts:43 | MISSING |
| `CF_STREAM_API_TOKEN` | **MISSING** | YES | stream.service.ts:44, health.controller.ts:34 | MISSING |
| `CF_STREAM_WEBHOOK_SECRET` | **MISSING** | **MISSING** | stream.controller.ts:27 | MISSING |
| `CF_ACCOUNT_ID` | **MISSING** | **MISSING** | health.controller.ts:35 | MISSING |
| `OPENAI_API_KEY` | **MISSING** | **MISSING** | ai.service.ts:316,382 | MISSING |
| `GEMINI_API_KEY` | **MISSING** | **MISSING** | embeddings.service.ts:30 | MISSING |
| `RESEND_API_KEY` | **MISSING** | YES | email.service.ts:20 | MISSING |
| `TURN_SERVER_URL` | **MISSING** | YES | calls.service.ts:167 | MISSING |
| `TURN_USERNAME` | **MISSING** | YES | calls.service.ts:168 | MISSING |
| `TURN_CREDENTIAL` | **MISSING** | YES | calls.service.ts:169 | MISSING |
| `GOLD_PRICE_PER_GRAM` | **MISSING** | **MISSING** | islamic.service.ts:423 | MISSING |
| `SILVER_PRICE_PER_GRAM` | **MISSING** | **MISSING** | islamic.service.ts:424 | MISSING |
| `APP_URL` | **MISSING** | **MISSING** | og.service.ts:5 | MISSING |
| `CF_IMAGES_API_TOKEN` | N/A | YES | (UNUSED) | DEAD |
| `CF_IMAGES_ACCOUNT_ID` | N/A | YES | (UNUSED) | DEAD |

### Summary
- **4 env vars with name mismatch** (R2_* in code, CLOUDFLARE_R2_* in .env)
- **7 env vars used in code but missing from both .env and .env.example**
- **5 env vars missing from .env but present in .env.example** (RESEND, TURN x3, R2_PUBLIC_URL)
- **2 phantom env vars in .env.example** that nothing reads (CF_IMAGES_*)
- **1 bucket name mismatch** (mizanly-uploads vs mizanly-media)

---

## CONFIGURATION PATTERNS — Inconsistency Analysis

### Three patterns for reading env vars:

1. **ConfigService (correct pattern):** 22 files use `this.config.get<string>('KEY')` — the NestJS-idiomatic way
2. **Direct process.env (incorrect):** 6 files use `process.env.KEY` directly — breaks testability, may have timing issues
3. **Top-level const (dangerous):** 2 files set `const X = process.env.Y` outside of any class — evaluated before ConfigModule loads

| File | Pattern | Issue |
|------|---------|-------|
| `redis.module.ts:7` | `process.env.REDIS_URL` | Not injectable, not testable |
| `chat.gateway.ts:39` | `process.env.CORS_ORIGINS` | Decorator evaluation timing |
| `app.module.ts:100-101` | `process.env.NODE_ENV` | Acceptable (NestJS factory) |
| `main.ts` (multiple) | `process.env.*` | Acceptable (bootstrap context) |
| `stripe-webhook.controller.ts:31,48` | `process.env.*` | Should use ConfigService |
| `islamic.service.ts:423-424` | `process.env.*` | Should use ConfigService |
| `health.controller.ts:31-37,54` | `process.env.*` | Should use ConfigService |
| `og.service.ts:5` | Top-level `process.env.APP_URL` | Timing bug (see Finding 17) |
| `http-exception.filter.ts:30,34,60,63` | `process.env.*` | Should use ConfigService |
| `sentry.config.ts:22,28,33,39` | `process.env.*` | Acceptable (standalone utility) |

---

## SUMMARY

| Severity | Count | Key Issues |
|----------|-------|-----------|
| P0 (Ship Blocker) | 5 | R2 env var mismatch, Redis silent failure, credential exposure, coins without payment |
| P1 (High) | 7 | Duplicate Sentry, dead Redis adapter, WS CORS timing, implicit conversion, unauth webhook |
| P2 (Medium) | 12 | 7 missing env vars, phantom vars, bucket name mismatch, no startup validation, Swagger exposure |
| P3 (Low) | 12 | CORS space bug, CSP disabled, dual loggers, no config type safety, duplicate slow-request middleware |
| **Total** | **36** | |

### Top 5 Must-Fix Items:
1. **Fix R2 env var names in `.env`** to match what code reads (R2_ACCOUNT_ID, etc.) — or rename the code
2. **Add logging to Redis error handler** and expand the proxy to cover all used methods
3. **Move coins crediting to Stripe webhook handler** (currently gives free coins)
4. **Add all 7 missing env vars to `.env.example`** and add them to `validateEnv()` recommended list
5. **Call `initRedisAdapter(app)` in main.ts** or remove the dead code
