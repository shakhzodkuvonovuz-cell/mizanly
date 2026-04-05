# X11 — Privacy Field Leakage Audit

**Scope:** Cross-module audit of every endpoint that returns user objects. Check for internal field leakage via `...user` spread, `include: { user: true }` without select, and missing field filtering.

**Audited:** 2026-04-05
**Severity scale:** CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 3 |
| MEDIUM   | 4 |
| LOW      | 3 |
| INFO     | 3 |
| **Total** | **14** |

The codebase generally uses `select` whitelists well (PUBLIC_USER_FIELDS, USER_SEARCH_SELECT, inline selects). The major violation is `getProfile()` which selects INTERNAL_STATUS_FIELDS and then spreads them into the API response without stripping them. Several services also fetch the full User model (no `select`) for existence checks, which is wasteful and a defense-in-depth concern.

---

## Findings

### X11-01 — CRITICAL: `getProfile()` leaks `isDeleted`, `isBanned`, `isDeactivated`, `lastSeenAt` to ANY caller

**File:** `apps/api/src/modules/users/users.service.ts` lines 239-318
**Endpoint:** `GET /api/v1/users/:username` (public profile)

The `getProfile()` method selects `...INTERNAL_STATUS_FIELDS` (which includes `isDeleted: true`, `isBanned: true`, `isDeactivated: true`, `lastSeenAt: true`) alongside `...PUBLIC_USER_FIELDS`. After checking these fields internally (line 272), it returns `{ ...user, isFollowing, isFollowedBy, ... }` at line 312-318, which spreads ALL selected fields into the API response.

**What leaks:**
- `isDeleted` — reveals if a user has been deleted (soft-deleted)
- `isBanned` — reveals moderation status
- `isDeactivated` — reveals deactivation status
- `lastSeenAt` — exact timestamp of last activity (privacy violation, stalking risk)

**Why it matters:**
- Any unauthenticated caller can see moderation/deletion state of any user
- `lastSeenAt` leaks exact activity timestamps to anyone who knows the username, regardless of the user's `lastSeenVisibility` privacy setting in UserSettings (the setting is completely bypassed)
- Even though banned/deactivated users throw 404, the response for active users still includes `isDeleted: false`, `isBanned: false`, `isDeactivated: false` — confirming the user is NOT banned

**Cache amplification:** Line 268 caches the full user object (including internal fields) in Redis for 5 minutes. Any subsequent request serves the cached object with internal fields.

**Fix:** After the status checks (line 272-274), destructure out the internal fields before returning:

```typescript
const { isDeleted, isBanned, isDeactivated, lastSeenAt, ...publicUser } = user;
return { ...publicUser, isFollowing, isFollowedBy, ... };
```

Or better: query INTERNAL_STATUS_FIELDS separately, don't include them in the cached/returned object.

---

### X11-02 — HIGH: `auth.getMe()` returns `clerkId` to the mobile client

**File:** `apps/api/src/modules/auth/auth.service.ts` lines 205-248
**Endpoint:** `GET /api/v1/auth/me`

The `getMe()` in auth.service.ts explicitly selects `clerkId: true` (line 210) and returns it via `{ ...user, twoFactorEnabled, registrationCompleted }` (line 242-247).

**What leaks:** `clerkId` — the Clerk authentication provider's internal user identifier.

**Why it matters:**
- `clerkId` is an implementation detail of the auth provider. Exposing it allows attackers to correlate Mizanly users with Clerk's internal system.
- If Clerk's API has any endpoint that accepts user IDs for unauthenticated operations, this becomes an attack vector.
- Violates principle of least privilege — the mobile client has no legitimate need for `clerkId`.

**Fix:** Remove `clerkId: true` from the select. If the mobile app needs to identify the auth provider for some reason, use a boolean flag instead.

---

### X11-03 — HIGH: `auth.getMe()` returns raw `tosAcceptedAt` DateTime

**File:** `apps/api/src/modules/auth/auth.service.ts` lines 230, 242-247
**Endpoint:** `GET /api/v1/auth/me`

The `tosAcceptedAt` field is selected (line 230) and spread into the response via `...user`. The `registrationCompleted: user.tosAcceptedAt !== null` boolean (line 246) already provides the needed information. The raw `tosAcceptedAt` datetime is redundant and leaks the exact legal compliance timestamp.

**Why it matters:** Minor privacy concern — reveals exactly when the user accepted ToS, which is internal compliance data.

**Fix:** Remove `tosAcceptedAt: true` from the select. The `registrationCompleted` boolean already derived from it is sufficient.

---

### X11-04 — HIGH: `auth.checkUsername()` fetches full User model for existence check

**File:** `apps/api/src/modules/auth/auth.service.ts` lines 250-255
**Endpoint:** `GET /api/v1/auth/check-username/:username`

```typescript
const user = await this.prisma.user.findUnique({
  where: { username: username.toLowerCase() },
});
return { available: !user };
```

Fetches the ENTIRE User model (all ~60 fields including `clerkId`, `email`, `phone`, `stripeConnectAccountId`, `banReason`, etc.) just to check if the user exists. While only `{ available: boolean }` is returned, the full model is in memory.

**Why it matters:**
- Defense-in-depth violation: if a future code change accidentally references `user` properties, all sensitive data is available
- Wasteful DB query: selects ~60 columns when only 1 is needed
- If error handling ever serializes the full error context (Sentry breadcrumbs, debug logs), the full user model could leak

**Fix:** `select: { id: true }` — existence check only needs one field.

---

### X11-05 — MEDIUM: `auth.syncClerkUser()` fetches full User model by clerkId

**File:** `apps/api/src/modules/auth/auth.service.ts` line 343
**Endpoint:** Webhook handler (not directly exposed to clients)

```typescript
const existingByClerk = await this.prisma.user.findUnique({ where: { clerkId } });
```

No `select` — fetches full user model. Used to check for existence and access `username` and `email`. Later uses `existingByClerk.username` (line 347-350).

**Fix:** `select: { id: true, username: true, email: true }`

---

### X11-06 — MEDIUM: `auth.deactivateByClerkId()` fetches full User model

**File:** `apps/api/src/modules/auth/auth.service.ts` line 441
**Endpoint:** Webhook handler (user.deleted)

```typescript
const user = await this.prisma.user.findFirst({ where: { clerkId } });
```

No `select` — fetches full user model. Only uses `user.id` subsequently.

**Fix:** `select: { id: true }`

---

### X11-07 — MEDIUM: `monetization.sendTip()` fetches full User model for receiver existence check

**File:** `apps/api/src/modules/monetization/monetization.service.ts` line 53
**Endpoint:** `POST /api/v1/monetization/tip`

```typescript
const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } });
```

No `select` — fetches all ~60 User fields including `clerkId`, `email`, `phone`, `stripeConnectAccountId`, `banReason`, etc. Only used for existence check (`if (!receiver) throw ...`).

**Fix:** `select: { id: true }`

---

### X11-08 — MEDIUM: `playlists.addCollaborator()` fetches full User model

**File:** `apps/api/src/modules/playlists/playlists.service.ts` line 389

```typescript
const targetUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
```

No `select` — fetches full user model for existence check.

**Fix:** `select: { id: true }`

---

### X11-09 — LOW: `two-factor.setup()` fetches full User model

**File:** `apps/api/src/modules/two-factor/two-factor.service.ts` line 242

```typescript
const user = await this.prisma.user.findUnique({ where: { id: userId } });
```

No `select` — fetches full user model for existence check. In context of 2FA setup, this is particularly concerning as TOTP secrets are being generated in the same function scope.

**Fix:** `select: { id: true }`

---

### X11-10 — LOW: `auth.syncClerkUser()` fetches full User model for username collision check

**File:** `apps/api/src/modules/auth/auth.service.ts` line 390

```typescript
const usernameConflict = await this.prisma.user.findUnique({ where: { username } });
```

No `select` — fetches full user model to check if username is taken. Only checks existence.

**Fix:** `select: { id: true }`

---

### X11-11 — LOW: `getPaymentMethods()` exposes raw `stripeConnectAccountId` to client

**File:** `apps/api/src/modules/monetization/monetization.service.ts` lines 446-455
**Endpoint:** `GET /api/v1/monetization/wallet/payment-methods`

```typescript
return [{
  id: user.stripeConnectAccountId,  // Full Stripe account ID exposed
  type: 'stripe',
  label: 'Stripe Account',
  ...
}];
```

The full Stripe Connect account ID (e.g., `acct_1234567890`) is returned as the payment method `id` to the mobile client. While this is the user's own data, the Stripe account ID is a sensitive identifier that could be used in Stripe API calls.

**Fix:** Return a masked version or internal identifier instead: `id: 'stripe-connect'` (since there can only be one Stripe Connect account per user).

---

### X11-12 — INFO: `clerk-auth.guard.ts` attaches internal fields to `request.user`

**File:** `apps/api/src/common/guards/clerk-auth.guard.ts` lines 42-57, 119

The guard selects `isBanned`, `isDeactivated`, `isDeleted`, `bannedAt`, `banExpiresAt`, `deactivatedAt`, `scheduledDeletionAt`, `clerkId` from the User model and spreads them all onto `request.user` (line 119).

All controllers use `@CurrentUser('id')` which extracts only `id`, so these fields are not directly returned. However, if any future controller uses `@CurrentUser()` without field specification, or accesses `request.user` directly, all internal fields would be available for accidental leakage.

**Risk:** Not an active leak, but a defense-in-depth concern. The guard should strip internal fields after checking them, attaching only `{ id, username, displayName, sessionId }` to `request.user`.

---

### X11-13 — INFO: `getProfile()` caches internal fields in Redis

**File:** `apps/api/src/modules/users/users.service.ts` line 268

```typescript
await this.redis.setex(`user:${username}`, 300, JSON.stringify(user));
```

The full user object including `isDeleted`, `isBanned`, `isDeactivated`, `lastSeenAt` is serialized to Redis. Anyone with Redis access (or a Redis data leak) gets moderation status and activity timestamps for all cached users.

**Fix:** Strip internal fields before caching, or cache only PUBLIC_USER_FIELDS.

---

### X11-14 — INFO: `privacy.exportUserData()` fetches full UserSettings without select

**File:** `apps/api/src/modules/privacy/privacy.service.ts` line 278

```typescript
this.prisma.userSettings.findUnique({ where: { userId } }),
```

No `select` on UserSettings. Since this is the user's own GDPR export, returning all settings is arguably correct. However, UserSettings may gain sensitive fields in the future. Explicit `select` is better practice.

---

## Checklist Results

| # | Question | Result |
|---|----------|--------|
| 1 | Any endpoint returning full User model without select? | **YES** — `auth.checkUsername()`, `auth.syncClerkUser()`, `auth.deactivateByClerkId()`, `monetization.sendTip()`, `playlists.addCollaborator()`, `two-factor.setup()` (6 instances) |
| 2 | Any `...user` spread that includes internal fields? | **YES** — `users.getProfile()` spreads INTERNAL_STATUS_FIELDS (isDeleted, isBanned, isDeactivated, lastSeenAt) into API response |
| 3 | Any `include: { user: true }` without field filtering? | **NO** — all `include: { user: ... }` patterns use `select` |
| 4 | `lastSeenAt` leaked to non-friends? | **YES** — `getProfile()` returns `lastSeenAt` to ANY caller regardless of `lastSeenVisibility` setting |
| 5 | Financial fields (diamonds, coins) leaked? | **NO** — CoinBalance is only returned to the owning user via wallet endpoints |
| 6 | Auth fields (clerkId, email) leaked? | **YES** — `auth.getMe()` returns `clerkId` to the mobile client |
| 7 | Moderation fields (isBanned, bannedAt) leaked? | **YES** — `getProfile()` returns `isBanned`, `isDeactivated`, `isDeleted` for all active users |
| 8 | Deletion fields (isDeleted, scheduledDeletionAt) leaked? | **PARTIAL** — `isDeleted` leaked via `getProfile()`. `scheduledDeletionAt` is NOT leaked (only in guard, not in response) |

---

## Risk Assessment

The most dangerous finding is **X11-01** (`getProfile()` leaking internal fields). This is a public endpoint that any user (or unauthenticated client) can call. The leaked fields reveal:

1. **Moderation state** — attackers can enumerate which users are NOT banned (confirming active accounts)
2. **Exact last activity time** — stalking vector, completely bypasses the `lastSeenVisibility` privacy setting
3. **Deletion state** — reveals soft-deletion status

The `clerkId` leak (X11-02) is also concerning as it exposes implementation details of the auth provider.

The 6 instances of full User model fetches (X11-04 through X11-10) are defense-in-depth issues — not active leaks, but they load all sensitive fields into memory unnecessarily.

---

## What's Done Right

- `PUBLIC_USER_FIELDS` constant exists and is used for most user-facing queries
- All `include: { user: ... }` patterns use `select` (zero bare `include: { user: true }`)
- Feed, search, recommendations, notifications, messages all use proper user field selects
- `@CurrentUser('id')` pattern (not bare `@CurrentUser()`) prevents accidental full-user returns from controllers
- Admin endpoints use `select` to exclude PII from responses
- Financial data (CoinBalance) properly isolated to owner-only endpoints
- GDPR export explicitly selects user-facing fields (excludes clerkId, expoPushToken)
