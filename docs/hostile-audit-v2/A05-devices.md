# A05: Devices Module Audit

**Scope:** `apps/api/src/modules/devices/devices.controller.ts` (73 lines), `apps/api/src/modules/devices/devices.service.ts` (178 lines)
**Date:** 2026-04-05
**Auditor:** Hostile code audit — every line read, every method checked against 8-item checklist

---

## Findings

### [CRITICAL] F1 — Device logout does NOT invalidate JWT / Clerk session — logged-out device can still make API calls

**File:** `devices.service.ts:86-100` (logoutSession), `devices.service.ts:107-128` (logoutAllOtherSessions)
**Checklist item:** #8 (Session security — JWT invalidation)

**Evidence:**
`logoutSession` does exactly two things:
1. Sets `isActive: false` on the Device record (line 87-89)
2. Clears the 2FA Redis flag for that session (line 95)

It does NOT:
- Call `clerkClient.sessions.revokeSession(sessionId)` to invalidate the Clerk JWT
- Add the session to a Redis denylist that `ClerkAuthGuard` checks
- Invalidate any token at the identity provider level

`ClerkAuthGuard` (line 30 of `clerk-auth.guard.ts`) calls `verifyToken()` which validates the JWT signature and expiry — it does NOT check whether the device record is `isActive: false`. A logged-out device's JWT remains valid until its natural Clerk expiry (typically 60 seconds for short-lived tokens, but configurable up to hours).

**Impact:** After "logging out" a stolen device, the attacker retains full API access for the remaining JWT lifetime. The user sees the device as "logged out" in their session list but the attacker's requests continue to succeed. This is a false sense of security. For Clerk's default short-lived tokens this window is small, but for any custom longer-lived token configuration, this is a real session hijacking vector.

---

### [HIGH] F2 — Push token takeover: any authenticated user can steal another user's push notifications

**File:** `devices.service.ts:18-33` (register)
**Checklist item:** #1 (BOLA), #6 (DTO validation)

**Evidence:**
Lines 20-27: When a push token is already registered to another active user, the code silently deactivates the victim's record and then upserts the token to the attacker:

```
const existing = await this.prisma.device.findUnique({ where: { pushToken } });
if (existing && existing.userId !== userId && existing.isActive) {
  await this.prisma.device.update({
    where: { pushToken },
    data: { isActive: false },
  });
}
return this.prisma.device.upsert({
  where: { pushToken },
  create: { userId, pushToken, platform, deviceId, isActive: true },
  update: { userId, platform, deviceId, isActive: true, updatedAt: new Date() },
});
```

An attacker who knows (or brute-forces, given the `[a-zA-Z0-9:_-]{20,}` regex is permissive) a victim's Expo push token can:
1. POST `/devices` with the victim's `pushToken`
2. The victim's device record is deactivated (line 24)
3. The attacker's account now receives the victim's push notifications

The push token regex allows any 20+ character alphanumeric string. FCM tokens are ~163 characters of base64-ish characters — not secret but also not easily guessable. The real risk is from a malicious app on a shared device or a token leaked via logs/analytics.

**Impact:** Notification hijacking. The attacker receives the victim's message notifications, call notifications, and any other push content. The victim silently stops receiving pushes with no error or indication.

---

### [HIGH] F3 — Race condition in logoutAllOtherSessions: TOCTOU between fetch and deactivate

**File:** `devices.service.ts:107-128` (logoutAllOtherSessions)
**Checklist item:** #4 (Race conditions)

**Evidence:**
The method performs two separate database operations without a transaction:

```typescript
// Step 1: fetch sessions to deactivate (line 109-112)
const sessionsToDeactivate = await this.prisma.device.findMany({
  where: { userId, isActive: true, id: { not: currentSessionId } },
  select: { id: true },
});

// Step 2: deactivate them (line 114-117)
await this.prisma.device.updateMany({
  where: { userId, isActive: true, id: { not: currentSessionId } },
  data: { isActive: false },
});
```

Between step 1 and step 2, a new device could register (via a concurrent `POST /devices` request). This new device would be deactivated by step 2's `updateMany` but its 2FA flag would NOT be cleared because it wasn't in the `sessionsToDeactivate` list from step 1.

Conversely, a session in step 1's list could already be deactivated by a concurrent `logoutSession` call, meaning the 2FA clear in the loop (line 120-124) runs redundantly — harmless but indicative of the unprotected window.

**Impact:** A newly registered device between the two queries gets deactivated but retains its 2FA verification flag in Redis. This is an inconsistent security state.

---

### [MEDIUM] F4 — register() returns full Device record including ipAddress, location, and internal IDs

**File:** `devices.service.ts:29-33` (register)
**Checklist item:** #7 (Error exposure / information leak)

**Evidence:**
The `upsert` call at line 29 has no `select` clause:

```typescript
return this.prisma.device.upsert({
  where: { pushToken },
  create: { userId, pushToken, platform, deviceId, isActive: true },
  update: { userId, platform, deviceId, isActive: true, updatedAt: new Date() },
});
```

This returns ALL columns from the Device model: `id`, `userId`, `pushToken`, `deviceId`, `deviceName`, `os`, `ipAddress`, `location`, `lastActiveAt`, `isActive`, `createdAt`, `updatedAt`.

While the response goes through `TransformInterceptor`, the full object is still serialized. The `ipAddress` and `location` fields being returned to the client on a registration response is unnecessary information exposure.

**Impact:** Leaks the server-recorded IP address and location data back to the client. In a token-takeover scenario (F2), the attacker would also see the previous user's IP address and location from the record they just took over.

---

### [MEDIUM] F5 — LogoutSessionDto.currentSessionId missing @IsNotEmpty — empty string bypasses "keep current" logic

**File:** `devices.controller.ts:16-18` (LogoutSessionDto)
**Checklist item:** #6 (DTO validation)

**Evidence:**
```typescript
class LogoutSessionDto {
  @IsString() @MaxLength(100) currentSessionId: string;
}
```

Missing `@IsNotEmpty()`. An empty string `""` passes both `@IsString()` and `@MaxLength(100)`.

When `currentSessionId` is `""`, `logoutAllOtherSessions` at line 115:
```typescript
where: { userId, isActive: true, id: { not: currentSessionId } }
```
becomes `id: { not: "" }` — which matches ALL active sessions (no CUID is an empty string). This means ALL sessions including the current one get deactivated, effectively logging out the user from every device including the one making the request.

**Impact:** Sending `{ "currentSessionId": "" }` to `POST /sessions/logout-others` logs out ALL devices including the current one, which contradicts the endpoint's documented purpose of "log out all OTHER sessions." While the TwoFactorGuard protects this endpoint (user must have 2FA verified), the behavior is still wrong — a user intending to keep their current session active gets fully logged out.

---

### [MEDIUM] F6 — touchSession userId is optional — future callers can reintroduce BOLA

**File:** `devices.service.ts:135` (touchSession)
**Checklist item:** #1 (BOLA)

**Evidence:**
```typescript
async touchSession(deviceId: string, ipAddress?: string, userId?: string) {
  if (!deviceId) return;
  try {
    await this.prisma.device.updateMany({
      where: { id: deviceId, ...(userId ? { userId } : {}) },
      data: {
        lastActiveAt: new Date(),
        ...(ipAddress ? { ipAddress } : {}),
      },
    });
```

The `userId` parameter is optional. When omitted, the `where` clause is just `{ id: deviceId }` — any device can have its metadata updated. The B01-#17 fix comment documents this was intentionally fixed, but the fix was half-applied: the parameter is optional instead of required.

Currently `touchSession` is dead code (never called from production), but the method is public and exported. When it is eventually wired into middleware, a caller that omits `userId` will silently reintroduce cross-user device tampering.

**Impact:** Latent BOLA. No immediate exploitation, but the API contract allows unsafe usage.

---

### [MEDIUM] F7 — RegisterDeviceDto.deviceId has no @MaxLength — unbounded string stored in DB

**File:** `devices.controller.ts:13`
**Checklist item:** #6 (DTO validation)

**Evidence:**
```typescript
@IsString() @IsOptional() deviceId?: string;
```

No `@MaxLength()` decorator. A client can send a multi-megabyte `deviceId` string. The Prisma schema defines `deviceId` as `String?` with no `@db.VarChar(N)` constraint, meaning PostgreSQL stores it as unlimited-length `text`.

The global `SanitizePipe` sanitizes HTML but does not truncate length. The `ValidationPipe` with `whitelist: true` strips unknown fields but does not enforce length on fields without `@MaxLength`.

**Impact:** Database bloat / potential DoS. An attacker could register thousands of devices with 10MB `deviceId` strings. At 60 req/min (controller throttle), that's 600MB/min of garbage written to the devices table.

---

### [LOW] F8 — @Param('token') and @Param('id') have zero validation — any string accepted as URL parameter

**File:** `devices.controller.ts:42` (unregister), `devices.controller.ts:57` (logoutSession)
**Checklist item:** #6 (DTO validation)

**Evidence:**
```typescript
@Delete(':token')
unregister(@CurrentUser('id') userId: string, @Param('token') token: string) { ... }

@Delete('sessions/:id')
logoutSession(@CurrentUser('id') userId: string, @Param('id') sessionId: string) { ... }
```

Neither `@Param` uses a validation pipe. `token` can be any URL-decoded string (including empty after URL encoding edge cases). `sessionId` is passed directly to `prisma.device.updateMany({ where: { id: sessionId } })`.

While Prisma parameterizes queries (no SQL injection), there's no format validation ensuring these are valid CUIDs or push token formats. A malicious client can probe with arbitrary strings — each results in a database query that returns 0 matches.

**Impact:** Minor: unnecessary database queries. CUIDs and push tokens have known formats; validating them at the controller layer would reject invalid requests without hitting the DB.

---

### [LOW] F9 — register() token takeover has TOCTOU race between findUnique and upsert

**File:** `devices.service.ts:20-33` (register)
**Checklist item:** #4 (Race conditions)

**Evidence:**
```typescript
const existing = await this.prisma.device.findUnique({ where: { pushToken } });
if (existing && existing.userId !== userId && existing.isActive) {
  await this.prisma.device.update({ where: { pushToken }, data: { isActive: false } });
}
return this.prisma.device.upsert({ where: { pushToken }, ... });
```

Three separate queries, no transaction. Two concurrent `register()` calls with the same push token but different users can interleave:
1. User A: `findUnique` returns null
2. User B: `findUnique` returns null
3. User A: `upsert` creates record
4. User B: `upsert` updates record (overwrites User A)

The push token's `@unique` constraint prevents duplicate rows, but the upsert's `update` branch overwrites `userId` — meaning the last writer wins. The deactivation check (lines 21-27) is skipped entirely because both saw null.

**Impact:** In a race, one user silently loses their push token registration to another user without the deactivation guard running. Low severity because concurrent registration of the same token is unusual in practice.

---

### [LOW] F10 — getSessions unbounded within user scope — no pagination parameter

**File:** `devices.service.ts:64-80` (getSessions), `devices.controller.ts:47-49`
**Checklist item:** #2 (Missing pagination)

**Evidence:**
```typescript
async getSessions(userId: string) {
  return this.prisma.device.findMany({
    where: { userId, isActive: true },
    ...
    take: 20,
  });
}
```

There IS a `take: 20` hard cap, which prevents true unbounded queries. However, the controller exposes no pagination parameters (`cursor`, `skip`). If a user has more than 20 active devices (unlikely but possible for bot accounts or token-leak scenarios), they cannot see devices 21+. Those invisible devices remain active and receiving notifications but cannot be individually logged out via the UI.

**Impact:** Low. Users with >20 active sessions cannot see or manage the overflow sessions. The `logoutAllOtherSessions` endpoint would still deactivate them, but individual session management is limited.

---

### [INFO] F11 — touchSession and cleanupStaleTokens are dead code — never called from production

**File:** `devices.service.ts:135-148` (touchSession), `devices.service.ts:154-177` (cleanupStaleTokens)
**Checklist item:** General code quality

**Evidence:**
`touchSession` is public but grep shows zero callers outside test files. The previous dead-code audit (agent 72, finding 2.11) flagged this.

`cleanupStaleTokens` has a `@Cron('0 0 4 * * *')` decorator, so it IS wired via NestJS scheduler — it runs daily at 4 AM. However, it only deletes `isActive: false` records older than 90 days. Active stale devices (registered but never sending push tokens that actually work) are never cleaned.

`touchSession` being dead means no device session ever gets its `lastActiveAt` updated after initial registration. The `getSessions` endpoint returns `lastActiveAt` in its response, but this field is frozen at the device's registration time — misleading for the user who sees "last active" as the registration date, not actual last use.

**Impact:** `lastActiveAt` is meaningless for session management decisions. Users cannot tell which sessions are actually active versus abandoned.

---

### [INFO] F12 — register() check-and-deactivate on line 21 does not handle inactive token re-registration edge case

**File:** `devices.service.ts:20-27` (register)
**Checklist item:** General correctness

**Evidence:**
```typescript
if (existing && existing.userId !== userId && existing.isActive) {
```

This only deactivates if the existing record belongs to a different user AND is active. If the existing record belongs to a different user but is already inactive (`isActive: false`), the code skips to the `upsert` which updates the record's `userId` to the new caller. The previous user's inactive record is silently reassigned — the `userId` field changes.

This means: User A registers token, User A unregisters (isActive=false), User B registers same token. The upsert changes the record's `userId` from A to B without any deactivation check. If User A later re-registers, they'd create a conflict.

**Impact:** Minimal — the push token `@unique` constraint prevents duplicates, and the `upsert` handles it correctly. But the userId reassignment without logging is worth noting for audit trails.

---

## Checklist Verification

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | BOLA — Can user A see/logout user B's devices? | **PASS (with caveat)** | `getSessions` filters by `userId`. `logoutSession` uses `updateMany` with `userId`. `unregister` uses `{ pushToken, userId }`. However: `touchSession` has optional `userId` (F6), and `register` allows token takeover (F2). |
| 2 | Missing pagination — Device list unbounded? | **PASS** | `getSessions` has `take: 20`. `getActiveTokensForUser` has `take: 50`. But no cursor pagination exposed to client (F10). |
| 3 | Missing rate limit — Any mutation without @Throttle? | **PASS** | Controller-level `@Throttle({ default: { limit: 60, ttl: 60000 } })` covers all 5 endpoints. No per-endpoint tightening on destructive operations (logout-others should arguably be stricter), but all are covered. |
| 4 | Race conditions — Concurrent logout requests? | **FAIL** | `logoutAllOtherSessions` has TOCTOU between fetch and update (F3). `register` has TOCTOU between findUnique and upsert (F9). No transactions used anywhere in the service. |
| 5 | Cascade — Does logout clear ALL session state? | **PARTIAL** | 2FA Redis flag is cleared (good). But Clerk JWT is NOT revoked (F1). No Redis session denylist checked by auth guard. |
| 6 | DTO validation — All inputs validated? | **FAIL** | `LogoutSessionDto.currentSessionId` missing `@IsNotEmpty` (F5). `RegisterDeviceDto.deviceId` missing `@MaxLength` (F7). `@Param` values unvalidated (F8). |
| 7 | Error exposure — Do errors leak device/session info? | **FAIL** | `register()` returns full Device record including `ipAddress`, `location` (F4). |
| 8 | Session security — JWT invalidation after logout? | **FAIL** | No Clerk session revocation, no token denylist (F1). |

**Total findings: 12** (1 Critical, 2 High, 3 Medium, 3 Low, 3 Info)
