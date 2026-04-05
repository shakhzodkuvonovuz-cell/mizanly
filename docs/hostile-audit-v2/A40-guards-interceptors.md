# A40 — Guards, Interceptors, Middleware, Pipes, Filters

**Auditor:** Claude Opus 4.6 (hostile audit)
**Date:** 2026-04-05
**Scope:** `apps/api/src/common/guards/`, `interceptors/`, `middleware/`, `pipes/`, `filters/`
**Files reviewed:** 14 source files + 10 test files (every line read)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 4     |
| MEDIUM   | 6     |
| LOW      | 5     |
| INFO     | 3     |
| **Total** | **20** |

---

## CRITICAL

### A40-C01: TargetThrottle decorator is completely broken — metadata never bridges to request object

**File:** `guards/user-throttler.guard.ts` line 30, `decorators/target-throttle.decorator.ts` line 37
**Severity:** CRITICAL

The `@TargetThrottle` decorator stores metadata via `SetMetadata(TARGET_THROTTLE_KEY, targetParam)` (decorator line 37). The `UserThrottlerGuard.getTracker()` reads `req._throttleTargetId` (guard line 30). **Nothing ever reads the metadata and writes it to `req._throttleTargetId`.** The guard's `getTracker()` method does not receive `ExecutionContext` (it only gets `req`), and the guard's comment on line 27-29 even acknowledges this gap:

```
// The @TargetThrottle decorator stores the param name on the route metadata,
// but getTracker doesn't receive ExecutionContext. Instead, check req.params
// for common target patterns (userId, postId, etc.) set by the decorator.
```

But then it reads `req._throttleTargetId` which is never set. The `getReflector()` method (lines 39-46) exists but is never called anywhere. There is no `handleRequest` or `canActivate` override that bridges metadata to request.

**Impact:** All `@TargetThrottle('userId')` / `@TargetThrottle('postId')` decorators across the entire codebase are doing nothing for per-target throttling. A user can follow-spam a specific target, like-bomb a specific post, etc. with no per-target rate limiting. Only the global per-user throttle applies.

**Tests pass because** the spec (line 71-111) manually sets `req._throttleTargetId` on the mock request, which never happens in production.

---

### A40-C02: Rate limiting falls back to in-memory when REDIS_URL is missing — zero protection in multi-instance deployment

**File:** `app.module.ts` line 137-139
**Severity:** CRITICAL

```typescript
ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60000, limit: 100 }],
  ...(process.env.REDIS_URL ? { storage: new ThrottlerStorageRedisService(process.env.REDIS_URL) } : {}),
}),
```

When `REDIS_URL` is empty/undefined, ThrottlerModule falls back to in-memory storage. In `main.ts` (lines 30-31), `REDIS_URL` is listed as `requiredInProd` — so it will be caught in production. But in development/staging with multiple instances, or if someone deploys to production without the env var validation passing (e.g., overriding the process.exit), each instance has its own counter. An attacker hitting N instances gets N*100 requests/minute instead of 100.

The `validateEnv()` function calls `process.exit(1)` on missing prod vars, which is good. But `REDIS_URL` is validated with `Joi.string().allow('').default('')` (app.module.ts line 120), meaning an empty string passes Joi validation but the conditional `process.env.REDIS_URL ?` evaluates to falsy. The `validateEnv()` function checks `!process.env[key]` which catches undefined but NOT empty string (empty string is truthy for `!` if the env var is set to `""`... actually `!""` is `true`, so this is caught). However, if `REDIS_URL` is set to a whitespace-only string like `" "`, it's truthy, passes the check, but `ThrottlerStorageRedisService(" ")` will fail silently or crash.

**Impact:** Rate limiting may silently degrade to per-instance in non-production environments, or crash on malformed `REDIS_URL`.

---

## HIGH

### A40-H01: OptionalClerkAuthGuard auto-unban uses imprecise comparison — uses banExpiresAt instead of bannedAt

**File:** `guards/optional-clerk-auth.guard.ts` lines 48-49
**Severity:** HIGH

ClerkAuthGuard (line 83-84) correctly uses `user.bannedAt` to determine if the user self-deactivated before the ban:
```typescript
const wasDeactivatedBeforeBan = user.deactivatedAt && user.bannedAt
  ? user.deactivatedAt < user.bannedAt
  : false;
```

OptionalClerkAuthGuard (line 48-49) uses `user.banExpiresAt` instead — the old imprecise approach that ClerkAuthGuard was explicitly fixed to avoid (per comment "X04-#11 FIX"):
```typescript
const wasDeactivatedBeforeBan = user.deactivatedAt && user.banExpiresAt
  ? user.deactivatedAt < user.banExpiresAt
  : false;
```

Additionally, OptionalClerkAuthGuard does not fetch `bannedAt` in its select clause (line 31-42) and does not clear `bannedAt` in its update (line 53-58), while ClerkAuthGuard does both.

**Impact:** Auto-unban in OptionalClerkAuthGuard may incorrectly clear a user's pre-existing self-deactivation. The two guards have diverged in behavior — the fix applied to ClerkAuthGuard was never propagated to OptionalClerkAuthGuard.

---

### A40-H02: OptionalClerkAuthGuard does not check scheduledDeletionAt — blocks users trying to cancel deletion on public endpoints

**File:** `guards/optional-clerk-auth.guard.ts` lines 38-42, 67-70
**Severity:** HIGH

ClerkAuthGuard (lines 108-116) has special logic allowing users with pending scheduled deletion to authenticate:
```typescript
const hasPendingDeletion = user.scheduledDeletionAt && user.scheduledDeletionAt > new Date() && !user.isDeleted;
if (!hasPendingDeletion) {
  throw new ForbiddenException('Account has been deactivated');
}
```

OptionalClerkAuthGuard does not select `scheduledDeletionAt` (not in select clause, line 30-43), and its check at line 68 unconditionally excludes deactivated users:
```typescript
if (!user.isBanned && !user.isDeactivated && !user.isDeleted) {
  request.user = user;
}
```

A user with `isDeactivated=true` and `scheduledDeletionAt` in the future will never have `request.user` set on optional auth routes. If any public endpoints use optional auth to conditionally show user-specific data (e.g., "is this my post?"), those endpoints break for users trying to cancel their deletion.

---

### A40-H03: Correlation ID middleware trusts client-supplied x-correlation-id without validation or length limit

**File:** `middleware/correlation-id.middleware.ts` lines 14-21
**Severity:** HIGH

The middleware accepts any string from `x-correlation-id` header:
```typescript
const incoming = req.headers['x-correlation-id'];
if (Array.isArray(incoming)) {
  correlationId = incoming[0] || randomUUID();
} else {
  correlationId = incoming || randomUUID();
}
```

No validation on:
- Length: an attacker can send a 1MB correlation ID string. This gets stored in AsyncLocalStorage (line 28), echoed back in the response header (line 25), and potentially logged and propagated to job payloads.
- Characters: no sanitization. Can contain newlines (CRLF injection into response headers via `res.setHeader`), null bytes, or other control characters.
- Format: should be UUID-like, but accepts anything.

**Impact:** Log injection, header injection (CRLF), memory amplification (huge correlation IDs stored per request in AsyncLocalStorage and propagated to BullMQ jobs). Response header injection is partially mitigated by modern HTTP libraries rejecting CRLF, but Node.js < 18 had bypasses.

---

### A40-H04: Exception filter leaks internal error messages for 4xx in production

**File:** `filters/http-exception.filter.ts` lines 43-52
**Severity:** HIGH

In production (line 43-52):
```typescript
if (process.env.NODE_ENV === 'production') {
  response.status(status).json({
    ...
    message: status >= 500 ? 'Internal server error' : error['message'] ?? exception.message,
    ...
  });
}
```

5xx errors correctly get generic "Internal server error" message. But 4xx errors pass through the raw exception message. NestJS's built-in `ValidationPipe` generates detailed validation messages like `"content must be a string"`, `"email must be an email"` etc. While these are generally safe, some custom exceptions elsewhere in the codebase may include internal details (e.g., "User clk_12345 not found in tenant xyz" or Prisma error details wrapped in a 400).

The non-production branch (lines 53-63) is identical to the production branch for 4xx — both pass through raw messages. The only difference is the 5xx message and the `this.logger.error` call. This means the dev/prod branches have almost no differentiation for the majority of errors.

---

## MEDIUM

### A40-M01: ClerkAuthGuard retries with 2-second sleep — DoS amplification vector

**File:** `guards/clerk-auth.guard.ts` lines 59-71
**Severity:** MEDIUM

```typescript
if (!user) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  user = await this.prisma.user.findUnique({ ... });
}
```

Every request with a valid Clerk JWT but no matching DB user triggers a 2-second sleep + retry. This is a signup race condition handler, but an attacker with a valid JWT for a non-existent user can:
1. Hold a request thread for 2+ seconds
2. Send many such requests to exhaust Node.js event loop / connection pool
3. Each request also doubles the Prisma query count

The retry exists for a legitimate race condition (Clerk webhook hasn't processed yet), but:
- There is no rate limit specific to this retry path
- The 2-second delay is hardcoded, not configurable
- There is no logging when the retry is triggered (only the final "User not found" throw)

**Impact:** Authenticated attacker with stale JWT can slow down the entire API by consuming threads on 2-second delays.

---

### A40-M02: UserThrottlerGuard fingerprint fallback uses MD5 — weak collision resistance

**File:** `guards/user-throttler.guard.ts` lines 66-70
**Severity:** MEDIUM

```typescript
const fingerprint = `${headers['user-agent'] || ''}|${headers['accept-language'] || ''}|${headers['accept-encoding'] || ''}`;
const hash = createHash('md5').update(fingerprint).digest('hex');
```

When no user and no IP are available, the guard falls back to a header fingerprint using MD5. Two issues:
1. MD5 has known collisions — an attacker can craft two different header combinations that produce the same hash, sharing a throttle bucket
2. The fingerprint only uses 3 headers, which are easily spoofed. An attacker can change `user-agent` per request to get a unique bucket each time, completely bypassing rate limiting

This is the absolute last-resort fallback (no user, no IP), but in that scenario the system should fail closed (reject), not fail open with a bypassable fingerprint.

**Impact:** In the unlikely scenario where both user and IP are unavailable, rate limiting is trivially bypassable.

---

### A40-M03: ResponseTimeMiddleware sets header after 'finish' — header already sent

**File:** `middleware/response-time.middleware.ts` lines 13-16
**Severity:** MEDIUM

```typescript
res.on('finish', () => {
  const durationNs = Number(process.hrtime.bigint() - start);
  const durationMs = Math.round(durationNs / 1_000_000);
  res.setHeader('X-Response-Time', `${durationMs}ms`);
});
```

The `finish` event fires after response headers and body have been flushed to the network. `res.setHeader()` after `finish` is a no-op in Express (headers already sent). The header will never actually appear in the client response.

Node.js documentation: "The 'finish' event is emitted when the response has been sent to the client."

This should use the `on('close')` event with header set via `res.set()` before `res.end()`, or it should use the `on-headers` npm package, or set the header in the MetricsInterceptor which runs before the response is sent.

**Impact:** The `X-Response-Time` header is never visible to clients. The middleware exists but provides zero observability value.

---

### A40-M04: SanitizePipe does not sanitize raw string body values

**File:** `pipes/sanitize.pipe.ts` lines 12-13
**Severity:** MEDIUM

```typescript
if ((metadata.type !== 'body' && metadata.type !== 'query') || typeof value !== 'object' || value === null) {
  return value;
}
```

If a `@Body()` parameter receives a raw string (not an object), the pipe returns it unsanitized. While NestJS typically parses JSON bodies into objects, some endpoints may accept raw strings via `@Body() content: string` with `Content-Type: text/plain` or similar.

The `@Param()` handler (line 8-10) correctly sanitizes strings. The `@Body()` handler only sanitizes object bodies, not primitive strings.

**Impact:** XSS payloads in raw string body parameters bypass sanitization.

---

### A40-M05: TransformInterceptor envelope detection is fragile — false positive on user data containing 'data' and 'meta' keys

**File:** `interceptors/transform.interceptor.ts` lines 27-29
**Severity:** MEDIUM

```typescript
if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
  return { success: true, ...data, timestamp: new Date().toISOString() };
}
```

Any object with both `data` and `meta` properties is treated as a pre-enveloped pagination response and spread directly. If a controller returns a user-facing object like `{ data: "user_content", meta: "user_meta_field", otherField: "value" }`, the interceptor will spread it instead of wrapping it in `{ data: ... }`.

This could also cause key collisions: if the pre-enveloped response includes a `success` or `timestamp` key, they get overwritten by the spread.

**Impact:** Controllers returning objects with both `data` and `meta` keys get unexpected response shapes. The `success` and `timestamp` keys can be accidentally overridden.

---

### A40-M06: Metrics interceptor logs full URL path — may include UUIDs, usernames, or other identifiers

**File:** `interceptors/metrics.interceptor.ts` lines 44-46
**Severity:** MEDIUM

```typescript
private logMetric(method: string, url: string, duration: number, status: number) {
  const path = url.split('?')[0];
  // logs: GET /api/v1/users/john_doe 200 50ms
```

Query params are stripped, but the path still contains route parameters. Logged paths will include:
- User IDs: `GET /api/v1/users/user-abc-123`
- Usernames: `GET /api/v1/users/john_doe`
- Conversation IDs: `GET /api/v1/conversations/conv-xyz-789`
- Message IDs, post IDs, etc.

These are sent to the Logger, which goes to stdout/Sentry. In multi-tenant or privacy-sensitive contexts, user identifiers in metrics logs can violate data minimization principles.

**Impact:** PII (user IDs, usernames) present in metric logs. Not a direct security vulnerability, but a GDPR data minimization concern.

---

## LOW

### A40-L01: SecurityHeadersMiddleware duplicates helmet — redundant with potential for inconsistency

**File:** `middleware/security-headers.middleware.ts` lines 7-11, `main.ts` line 166
**Severity:** LOW

`main.ts` applies `helmet()` middleware (line 166-172) which sets `X-Content-Type-Options`, `X-Frame-Options`, and many other security headers. `SecurityHeadersMiddleware` sets the same headers plus `Referrer-Policy` and `Permissions-Policy`.

The `X-XSS-Protection` header is set to `0` by both helmet (default) and the middleware. But if helmet's defaults change in a future version, the two sources could diverge.

`Permissions-Policy: camera=(), microphone=(), geolocation=()` is set by the custom middleware. However, this is an API that serves a mobile app via LiveKit calls — denying camera and microphone at the HTTP response level has no effect on the mobile app (it doesn't load HTML from this server).

**Impact:** Redundant code that could diverge. No security impact, but maintenance burden.

---

### A40-L02: TwoFactorGuard accepts undefined sessionId — 2FA verification without session binding

**File:** `guards/two-factor.guard.ts` lines 34, 42
**Severity:** LOW

```typescript
const sessionId: string | undefined = user.sessionId;
const isVerified = await this.twoFactorService.isTwoFactorVerified(userId, sessionId);
```

If `sessionId` is undefined (e.g., because ClerkAuthGuard didn't receive `sid` in the JWT payload), the guard still proceeds with `isTwoFactorVerified(userId, undefined)`. The behavior depends entirely on `TwoFactorService.isTwoFactorVerified()` — if it treats undefined sessionId as "any session is fine", 2FA becomes non-session-bound, meaning verifying on one device grants access on all devices.

The test file (line 99-108) tests this case and it passes (returns true), which suggests the service may not enforce session binding when sessionId is undefined.

**Impact:** 2FA session-binding may be bypassable if Clerk JWT lacks `sid` claim.

---

### A40-L03: HttpExceptionFilter dev/production branches for unhandled exceptions are identical

**File:** `filters/http-exception.filter.ts` lines 73-93
**Severity:** LOW

The `else` branch (non-HttpException errors) has identical production and non-production responses:
```typescript
// Production (lines 73-81):
message: 'An unexpected error occurred',

// Non-production (lines 83-92):
message: 'An unexpected error occurred',
```

Both return the same generic message. The production branch should arguably be the only one with the generic message, while development should include `exception.message` for debugging. The stack trace is correctly not included in either response, but the actual error message is also hidden in development, making debugging harder.

**Impact:** Developer experience — unhandled exceptions show no useful info even in development mode.

---

### A40-L04: RequestLoggerMiddleware counters are per-instance and not thread-safe

**File:** `middleware/request-logger.middleware.ts` lines 13-14
**Severity:** LOW

```typescript
private requestCount = 0;
private errorCount = 0;
private slowCount = 0;
```

These counters:
1. Reset on every deploy/restart (acknowledged in comment line 11)
2. Are not shared across instances (only this process's view)
3. Use JavaScript `++` increment which is technically not atomic if Node.js had true threads (it doesn't currently for the event loop, but worker_threads could cause issues)

The `getStats()` method is used by a metrics endpoint, but the stats are misleading in a multi-instance deployment.

**Impact:** Metrics endpoint returns incomplete/misleading data in multi-instance deployments.

---

### A40-L05: ClerkAuthGuard error message distinguishes "no token" from "invalid token" — timing/enumeration risk

**File:** `guards/clerk-auth.guard.ts` lines 24, 37
**Severity:** LOW

```typescript
// Line 24: No token present
throw new UnauthorizedException('No authorization token provided');

// Line 37: Token present but invalid
throw new UnauthorizedException('Invalid token');
```

Different error messages for "no token" vs "invalid token" allow an attacker to determine whether they're providing a structurally valid JWT that fails signature verification (getting "Invalid token") vs no token at all. This is a minor information leak but contradicts the principle of generic auth error messages.

**Impact:** Minimal. Attacker can distinguish between token absence and invalidity, but this doesn't help bypass auth.

---

## INFO

### A40-I01: Swagger exposed in non-production — acceptable but notable

**File:** `main.ts` lines 199-223
**Severity:** INFO

Swagger is enabled when `NODE_ENV` is undefined or `'development'`. This is correct — it's explicitly disabled in production. However, if deployed to staging with `NODE_ENV=staging`, it would not be enabled (good). But if someone deploys to a staging server without setting `NODE_ENV`, Swagger is exposed.

The `validateEnv()` function warns about missing `NODE_ENV` (line 116-117), which is appropriate.

---

### A40-I02: CORS rejects all origins when CORS_ORIGINS is empty in production — correct but aggressive

**File:** `main.ts` lines 154-159
**Severity:** INFO

```typescript
origin: corsOrigins.length > 0
  ? corsOrigins
  : isProduction
    ? false // Production: reject all if no origins configured (secure default)
    : ['http://localhost:8081', 'http://localhost:8082'],
```

This is the correct secure default. Mobile apps don't need CORS (they don't send Origin headers). However, if a web admin dashboard is ever built, it will silently fail without explicit CORS configuration. The warning log at lines 148-152 mitigates this.

---

### A40-I03: ThrottlerModule uses process.env directly instead of ConfigService

**File:** `app.module.ts` line 139
**Severity:** INFO

```typescript
...(process.env.REDIS_URL ? { storage: new ThrottlerStorageRedisService(process.env.REDIS_URL) } : {}),
```

`process.env.REDIS_URL` is read at module initialization time, before the NestJS DI container is fully constructed. This is technically the only way to configure `ThrottlerModule.forRoot()` since it doesn't support `forRootAsync()` with inject. However, it means the REDIS_URL cannot be mocked via ConfigService in tests.

---

## Checklist Verdict

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Auth bypass — Can ClerkAuthGuard be bypassed? | PASS | Token extraction is correct. verifyToken is Clerk's server-side SDK. No bypass path found. |
| 2 | OptionalAuth — Does it actually allow unauthenticated through? | PASS (with findings) | Yes, returns true always. But H01/H02: diverged from ClerkAuthGuard logic (bannedAt, scheduledDeletionAt). |
| 3 | Error filter — Does it leak stack traces in production? | PASS (with finding) | Stack traces never in response body. But H04: 4xx messages pass through raw in production. |
| 4 | Transform interceptor — Does it consistently wrap responses? | PASS (with finding) | Works for most cases. M05: fragile envelope detection can false-positive. |
| 5 | Metrics — Any PII in metrics? | FAIL | M06: User IDs and usernames in logged URL paths. |
| 6 | Rate limiter — Correct implementation? Header spoofing? | FAIL | C01: TargetThrottle completely broken. C02: Falls back to in-memory without Redis. M02: Fingerprint fallback bypassable. IP handling is correct (uses req.ip, not x-forwarded-for). |
| 7 | Validation pipe — Globally applied? Bypassable? | PASS (with finding) | Globally applied in main.ts. whitelist + forbidNonWhitelisted. M04: Raw string bodies not sanitized. |
| 8 | CORS — Properly configured? | PASS | Strict origin whitelist in production. Rejects all by default. Mobile API-only so CORS is largely irrelevant. |

---

## Test Coverage Assessment

| File | Tests | Coverage Quality |
|------|-------|-----------------|
| clerk-auth.guard | 14 tests | Good — covers token extraction, ban/deactivation, deletion cancellation |
| optional-clerk-auth.guard | 14 tests | Good — but missing tests for bannedAt divergence |
| user-throttler.guard | 12 tests | **Misleading** — tests manually set `_throttleTargetId` which never happens in prod |
| two-factor.guard | 8 tests | Good — covers session isolation |
| http-exception.filter | 7 tests | Good — covers production message masking |
| transform.interceptor | 6 tests | Adequate — missing test for data+meta+success collision |
| metrics.interceptor | 7 tests | Good |
| sanitize.pipe | 18 tests | Good — covers nested objects, arrays, edge cases |
| correlation-id.middleware | 9 tests | Good — but missing length/format validation tests |
| security-headers.middleware | 6 tests | Adequate |
| response-time.middleware | 5 tests | **Misleading** — tests verify setHeader is called, but header is never visible to clients (called after finish) |
| request-logger.middleware | 11 tests | Good |

---

## Priority Fix Order

1. **C01** — TargetThrottle broken (HIGH impact, follow-spam/like-bomb unthrottled)
2. **H01** — OptionalClerkAuthGuard bannedAt divergence (data corruption on unban)
3. **H02** — OptionalClerkAuthGuard missing scheduledDeletionAt (user-facing bug)
4. **H03** — Correlation ID injection (security, CRLF/log injection)
5. **M03** — ResponseTimeMiddleware header never visible (dead code)
6. **C02** — Redis fallback (ops, ensure REDIS_URL validation catches empty string)
7. **H04** — 4xx message leakage in production
8. **M01** — ClerkAuthGuard 2s retry amplification
9. **M04** — SanitizePipe raw string body bypass
10. **M05** — TransformInterceptor envelope false positive
