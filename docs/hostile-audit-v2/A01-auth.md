# A01: Auth Module Audit

## Files Reviewed
- `apps/api/src/modules/auth/auth.controller.ts` (79 lines)
- `apps/api/src/modules/auth/auth.service.ts` (463 lines)
- `apps/api/src/modules/auth/webhooks.controller.ts` (177 lines)
- `apps/api/src/modules/auth/dto/register.dto.ts` (47 lines)
- `apps/api/src/modules/auth/dto/set-interests.dto.ts` (12 lines)
- `apps/api/src/modules/auth/auth.module.ts` (11 lines)
- `apps/api/src/common/guards/clerk-auth.guard.ts` (127 lines) — supporting context
- `apps/api/src/common/decorators/current-user.decorator.ts` (25 lines) — supporting context
- `apps/api/src/common/utils/redis-atomic.ts` (15 lines) — supporting context

## Findings

### [HIGH] A01-F01 — Username TOCTOU race in `register()` allows duplicate usernames
- **File:** `apps/api/src/modules/auth/auth.service.ts:111-116 → 143-170`
- **Evidence:** Line 111 checks `findUnique({ where: { username } })`, then line 143 performs `upsert` with that username. Between the check and the upsert, another concurrent request can claim the same username. The `username` column has a `@unique` constraint in Prisma, so a P2002 unique constraint violation will be thrown — but there is **zero error handling** for P2002 anywhere in `register()`. The comment on line 159 says "Still uses retry on P2002 below" but **no such retry exists**. The P2002 bubbles up as an unhandled 500 Internal Server Error.
- **Impact:** Two users registering with the same username simultaneously get a 500 error instead of a clean 409 Conflict. The stale comment suggests error handling was planned but never implemented.
- **Checklist item:** 4 (Race conditions — read-then-write without transaction)

### [HIGH] A01-F02 — Username TOCTOU race in `syncClerkUser()` (webhook path)
- **File:** `apps/api/src/modules/auth/auth.service.ts:348-354`
- **Evidence:** Line 348 checks if `data.username` is taken via `findUnique`, then line 354 performs `update` with the username. No transaction wraps this. Two concurrent `user.updated` webhooks can both pass the check and one will hit a P2002 unique constraint violation, which is uncaught. This causes Clerk webhook retry loops.
- **Impact:** Webhook handler returns 500 → Clerk retries → hammers the endpoint. Username sync silently fails.
- **Checklist item:** 4 (Race conditions)

### [HIGH] A01-F03 — Username collision in webhook user creation has only single retry
- **File:** `apps/api/src/modules/auth/auth.service.ts:390-393`
- **Evidence:** Lines 390-393 check for collision and retry once. But the retry itself (line 392) does NOT check for collision — it just generates a new random and hopes. If that also collides (unlikely but possible), the `create` on line 395 throws an uncaught P2002. More critically, the TOCTOU gap between line 390 (check) and line 395 (create) means even the first attempt can collide with a concurrent webhook.
- **Impact:** Unhandled P2002 on user creation → 500 error → Clerk retries indefinitely.
- **Checklist item:** 4 (Race conditions)

### [HIGH] A01-F04 — `setInterests()` delete-then-create without `$transaction`
- **File:** `apps/api/src/modules/auth/auth.service.ts:257-264`
- **Evidence:**
  ```typescript
  await this.prisma.userInterest.deleteMany({ where: { userId } });
  await this.prisma.userInterest.createMany({
    data: dto.categories.map((category) => ({ userId, category })),
  });
  ```
  Two separate Prisma calls with no `$transaction`. If the server crashes after `deleteMany` but before `createMany`, the user loses all interests permanently. Two concurrent calls can interleave: req1 deletes → req2 deletes → req1 creates → req2 creates → duplicate interests (mitigated by `@@unique([userId, category])` but would throw P2002 on one request).
- **Impact:** Data loss on crash; 500 errors on concurrent requests.
- **Checklist item:** 4 (Race conditions — read-then-write without transaction)

### [HIGH] A01-F05 — `deactivateByClerkId()` find-update-delete without `$transaction`
- **File:** `apps/api/src/modules/auth/auth.service.ts:439-462`
- **Evidence:** Three sequential operations: `findFirst` (line 441), `update` (line 445), `deleteMany` (line 457) — none wrapped in a transaction. If the server crashes after marking the user as deleted but before removing device tokens, push notifications continue to be sent to a deactivated user. The `findFirst` also lacks a select clause, fetching the entire User record unnecessarily.
- **Impact:** Deactivated user continues receiving push notifications. Partial deactivation state if crash occurs mid-operation.
- **Checklist item:** 4 (Race conditions), 5 (Cascade/cleanup gaps)

### [HIGH] A01-F06 — Webhook creates user with empty email string
- **File:** `apps/api/src/modules/auth/webhooks.controller.ts:122` → `apps/api/src/modules/auth/auth.service.ts:397`
- **Evidence:** Line 122: `const email = data.email_addresses?.[0]?.email_address ?? '';`. If a Clerk user has no email (phone-only signup), `email` becomes the empty string `''`. This is passed to `syncClerkUser()` which calls `prisma.user.create({ data: { email: '' } })`. Since `email` is `@unique` in the schema, the first phone-only user succeeds, but the second one gets a P2002 duplicate key error on `email: ''`. No validation rejects empty email in `syncClerkUser`.
- **Impact:** Only one phone-only user can ever be created. Second phone-only webhook permanently fails with retries.
- **Checklist item:** 6 (DTO validation gaps)

### [MEDIUM] A01-F07 — `getMe()` exposes `clerkId` to the client
- **File:** `apps/api/src/modules/auth/auth.service.ts:210`
- **Evidence:** `select: { clerkId: true, ... }` on line 210. The `clerkId` is Clerk's internal identifier (e.g., `user_2abc123`). It's returned in the `/auth/me` response. This is an internal ID that could be used to probe the Clerk API or correlate accounts across services.
- **Impact:** Information disclosure. The register path correctly uses `SAFE_USER_SELECT` which excludes `clerkId`, but `getMe` does not.
- **Checklist item:** 7 (Error exposure / internal state leak)

### [MEDIUM] A01-F08 — Missing `@Throttle` on `GET /auth/suggested-users`
- **File:** `apps/api/src/modules/auth/auth.controller.ts:72-78`
- **Evidence:** Every other endpoint in the controller has `@Throttle()`, but `suggestedUsers` does not:
  ```typescript
  @Get('suggested-users')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  suggestedUsers(@CurrentUser('id') userId: string) {
  ```
  This endpoint executes two `findMany` queries (friends-of-friends + popular fallback), each with joins. An attacker can spam this to consume database connections.
- **Impact:** Database exhaustion via repeated expensive queries.
- **Checklist item:** 3 (Missing rate limit)

### [MEDIUM] A01-F09 — `checkUsername()` fetches entire User record without `select`
- **File:** `apps/api/src/modules/auth/auth.service.ts:250-254`
- **Evidence:**
  ```typescript
  const user = await this.prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });
  return { available: !user };
  ```
  No `select` clause. Fetches all ~60+ columns of the User model (including `email`, `phone`, `reputationScore`, `banReason`, `stripeConnectAccountId`, etc.) just to check existence. The data is never used — only the truthiness of `user` matters.
- **Impact:** Unnecessary data transfer from database. If an ORM logging/debugging tool or error handler ever serializes this object, sensitive fields leak. Should be `select: { id: true }` or `count()`.
- **Checklist item:** 7 (Error exposure risk), performance

### [MEDIUM] A01-F10 — Webhook secret misconfiguration leaks internal state
- **File:** `apps/api/src/modules/auth/webhooks.controller.ts:81-82`
- **Evidence:**
  ```typescript
  if (!secret) {
    throw new BadRequestException('Webhook secret not configured');
  }
  ```
  This tells an attacker probing the endpoint that the webhook signing secret is missing. The error should be a generic 500 or the check should happen at startup (fail-fast), not per-request.
- **Impact:** Information disclosure — attacker learns the server's webhook infrastructure is misconfigured, which aids reconnaissance.
- **Checklist item:** 7 (Error exposure)

### [MEDIUM] A01-F11 — `register()` update path does not refresh `isChildAccount`, `email`, or ToS consent
- **File:** `apps/api/src/modules/auth/auth.service.ts:162-168`
- **Evidence:** The `update` branch of the upsert only sets `username`, `displayName`, `bio`, `avatarUrl`, and `language`. It does NOT update:
  - `isChildAccount` — if user initially registered as minor (under 18) and re-calls register after turning 18, the flag remains `true` forever, applying unnecessary restrictions.
  - `email` — if user changed their email in Clerk, the DB keeps the stale email. The `email` variable is fetched from Clerk (line 107) but never used in the update path.
  - `tosAcceptedAt`/`tosVersion` — if ToS version changes, re-registration doesn't capture new consent. The existing `tosAcceptedAt` stays from the original version.
- **Impact:** Stale user data; child account restrictions permanently applied; GDPR consent not refreshed on ToS updates.
- **Checklist item:** 8 (State machine — invalid state persists)

### [MEDIUM] A01-F12 — `dateOfBirth` accepts future dates — no `@MaxDate` or past-date validation
- **File:** `apps/api/src/modules/auth/dto/register.dto.ts:36`
- **Evidence:** `@IsDateString()` only validates ISO 8601 format. A value like `"2090-01-01"` passes validation. `calculateAge()` then returns a negative number (e.g., -64), which fails the `age < 13` check and throws — so it's not exploitable for bypass. BUT the error message says "You must be at least 13 years old" which is confusing/incorrect for a future date. More importantly, if `calculateAge` ever changes to return `NaN` for edge cases, `NaN < 13` evaluates to `false`, silently passing the age check.
- **Impact:** Confusing error messages for future dates. Fragile — any refactor to `calculateAge` that produces `NaN` silently bypasses age verification.
- **Checklist item:** 6 (DTO validation gaps)

### [MEDIUM] A01-F13 — `deactivateByClerkId()` incomplete cleanup — active sessions, Redis keys, search index not cleared
- **File:** `apps/api/src/modules/auth/auth.service.ts:439-462`
- **Evidence:** On user deletion, only `Device` records are cleaned up (line 457). The following are NOT cleaned:
  - Active WebSocket sessions (no `user:session_revoked` publish like the session.revoked handler does)
  - Redis keys: `register:attempts:*`, `device:accounts:*` (stale rate-limit state)
  - Search index (user remains searchable in Meilisearch after deletion)
  - `TwoFactorSecret` records (2FA secrets remain in DB)
  - `UserSettings` records
  Note: Most of these have `onDelete: Cascade` in Prisma schema, so they'd be cleaned if the user row is hard-deleted later. But since `deactivateByClerkId` only soft-deletes (sets `isDeleted: true`), cascades never fire. The user remains in search, has active sessions, and their 2FA secrets persist.
- **Impact:** Deactivated user remains searchable, may still have active WebSocket connections, and sensitive data (2FA secrets) persists.
- **Checklist item:** 5 (Cascade/cleanup gaps)

### [LOW] A01-F14 — `checkUsername` is unauthenticated — enables username enumeration
- **File:** `apps/api/src/modules/auth/auth.controller.ts:44-58`
- **Evidence:** No `@UseGuards(ClerkAuthGuard)` on the `check-username` endpoint. Rate limit is 5 req/min per IP, trivially bypassed with IP rotation. The timing-safe 150ms delay (line 55) prevents timing attacks but does not prevent bulk enumeration via multiple IPs. Response directly says `{ available: true/false }`.
- **Impact:** Attacker can enumerate all registered usernames by probing the endpoint from multiple IPs. Usernames are PII-adjacent identifiers.
- **Checklist item:** 1 (BOLA — not exactly, but information disclosure without authentication)

### [LOW] A01-F15 — Webhook `ClerkWebhookEvent` interface has `[key: string]: unknown` index signature
- **File:** `apps/api/src/modules/auth/webhooks.controller.ts:34`
- **Evidence:** `[key: string]: unknown` on the `data` interface allows accessing any property without TypeScript errors. Line 141 accesses `data.user_id` which is NOT declared in the interface — this compiles silently due to the index signature. If Clerk changes the field name, no compile-time error would catch it.
- **Impact:** Type safety hole — typos in field access (e.g., `data.userId` vs `data.user_id`) are invisible to the compiler.
- **Checklist item:** 6 (DTO validation gaps — loose typing)

### [LOW] A01-F16 — `register()` update path can null-out `avatarUrl` via explicit `null`
- **File:** `apps/api/src/modules/auth/auth.service.ts:166`, `apps/api/src/modules/auth/dto/register.dto.ts:24-25`
- **Evidence:** `RegisterDto.avatarUrl` has `@IsOptional()` + `@IsUrl()`. class-validator's `@IsOptional()` skips validation for both `undefined` AND `null`. If a client sends `{ "avatarUrl": null }`, it passes DTO validation and reaches the upsert update path as `avatarUrl: null`, which Prisma interprets as "set to NULL". This silently clears the user's avatar on re-registration even though the user may not intend to.
- **Impact:** Unintentional data loss — avatar cleared by sending null. The `language` field has the same issue (line 167 — could be set to null, bypassing the `@IsIn` validation).
- **Checklist item:** 6 (DTO validation gaps)

### [LOW] A01-F17 — `referralCode` collision unhandled in both register paths
- **File:** `apps/api/src/modules/auth/auth.service.ts:160` and `auth.service.ts:406`
- **Evidence:** `referralCode: randomBytes(8).toString('base64url').slice(0, 10)` generates a 10-char code. The `referralCode` column is `@unique`. Comment on line 159 explicitly says "Still uses retry on P2002 below" but NO P2002 catch/retry exists in the function. If a collision occurs (birthday paradox at ~1B users per comment), the entire registration fails with an unhandled 500 error. Same issue in `syncClerkUser` on line 406.
- **Impact:** Registration fails permanently for the unlucky user with a colliding referral code. No retry mechanism despite the comment claiming one exists.
- **Checklist item:** 4 (Race conditions — unique constraint collision unhandled)

## Checklist Verification

### 1. BOLA
**PASS (with caveat)** — All mutation endpoints use `@CurrentUser('id')` or `@CurrentUser('clerkId')` from the authenticated JWT. Users cannot modify other users' data. The webhook endpoint uses Svix signature verification. The `check-username` endpoint is intentionally unauthenticated but enables enumeration (F14, LOW).

### 2. Missing pagination
**PASS** — `getSuggestedUsers` uses `take: limit` (default 5). The `findMany` for follows uses `take: 1000` cap. `setInterests` uses `ArrayMaxSize(20)` on the DTO. No unbounded `findMany` calls exist.

### 3. Missing rate limit
**FINDING (F08)** — `GET /auth/suggested-users` is the only endpoint missing `@Throttle`.

### 4. Race conditions
**FINDING (F01, F02, F03, F04, F05, F17)** — Zero `$transaction` calls in the entire 463-line service. Every read-then-write sequence is vulnerable. The comment about P2002 retry is a lie — no such code exists.

### 5. Cascade/cleanup gaps
**FINDING (F05, F13)** — `deactivateByClerkId` only cleans up `Device` records. WebSocket sessions, search index, Redis keys, 2FA secrets all persist after soft-delete. Since this is soft-delete only, Prisma `onDelete: Cascade` never fires.

### 6. DTO validation gaps
**FINDING (F06, F12, F15, F16)** — Empty email accepted from webhook. Future dates accepted for `dateOfBirth`. Loose typing on webhook event interface. Null bypass on `@IsOptional` + `@IsUrl` fields.

### 7. Error exposure
**FINDING (F07, F09, F10)** — `clerkId` leaked in `getMe` response. Full User record fetched in `checkUsername`. Webhook misconfiguration message exposes internal state.

### 8. State machine
**FINDING (F11)** — `register()` update path does not refresh `isChildAccount`, `email`, or ToS consent. User state can become permanently stale.
