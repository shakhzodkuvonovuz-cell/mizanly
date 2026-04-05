# A02: Two-Factor Module Audit

## Files Reviewed
- `apps/api/src/modules/two-factor/two-factor.controller.ts` (155 lines)
- `apps/api/src/modules/two-factor/two-factor.service.ts` (698 lines)
- `apps/api/src/modules/two-factor/two-factor.module.ts` (10 lines)
- `apps/api/src/common/guards/two-factor.guard.ts` (49 lines)
- `apps/api/src/common/guards/clerk-auth.guard.ts` (127 lines)
- `apps/api/src/common/decorators/current-user.decorator.ts` (25 lines)
- `apps/api/prisma/schema.prisma` (TwoFactorSecret model, lines 3212-3228)
- No separate DTO files exist; DTOs are inline in the controller file.

## Findings

### HIGH — No TOTP code replay prevention (same code usable multiple times within 30s window)
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:72-88` (verifyTotp function)
- **Evidence:** The `verifyTotp` function checks if the token matches any valid code within the time window (current +/- 1 step = 3 valid codes at any moment), but there is no mechanism to mark a code as "used." No Redis or DB record is stored after a successful TOTP validation to prevent re-use.
- **Impact:** An attacker who intercepts or shoulder-surfs a single valid TOTP code has a 60-90 second window during which that exact code can be replayed across multiple endpoints (`/verify`, `/validate`, `/disable`, `/backup`) unlimited times within the rate limit. The `@Throttle` limits only slow down brute-force; they do not prevent replaying a known-good code. Industry best practice (RFC 6238 Section 5.2) mandates that validators MUST NOT accept the same OTP twice.
- **Checklist item:** #4 Race conditions / #8 State machine

### HIGH — `disable` does not clear Redis 2FA session verification keys
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:432-456`
- **Evidence:** The `disable` method sets `isEnabled: false` and `verifiedAt: null` in the DB, but does NOT call `clearTwoFactorSession` or delete any Redis keys (`2fa:verified:{userId}:*`). The only place Redis session keys are cleaned up is in `DevicesService.logoutSession` and `logoutAllOtherSessions`.
- **Impact:** After disabling 2FA, the Redis key `2fa:verified:{userId}:{sessionId}` persists for up to 24 hours (the TTL). This is a stale data problem. If the user re-enables 2FA, the old session verification flag is still valid, meaning the user could bypass the new 2FA setup's verification requirement for existing sessions. The `isTwoFactorVerified` method checks `getStatus()` first (which would return false while disabled, making it return true), but if the user re-enables 2FA within 24 hours, those stale Redis keys would incorrectly show the session as verified.
- **Checklist item:** #5 Cascade/cleanup gaps

### HIGH — `disable` does not delete the TOTP secret or backup codes from the database
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:449-455`
- **Evidence:** `disable` only sets `isEnabled: false` and `verifiedAt: null`. The `secret` (encrypted TOTP key) and `backupCodes` (hashed) remain in the database.
```typescript
await this.prisma.twoFactorSecret.update({
  where: { userId },
  data: {
    isEnabled: false,
    verifiedAt: null,
  },
});
```
- **Impact:** If the database is breached, an attacker has access to TOTP secrets for users who previously had 2FA enabled but disabled it. These secrets are encrypted with AES-256-GCM if `TOTP_ENCRYPTION_KEY` is set, but in dev environments (or if the key is compromised), the plaintext secrets are recoverable. Best practice: delete cryptographic material when it is no longer needed. Additionally, the `setup` method at line 252 checks `if (secretRecord && secretRecord.isEnabled)` — if the secret record exists but is disabled, it overwrites it. This means the old secret hangs around until re-setup, but the backup codes from the disabled session persist until that happens.
- **Checklist item:** #5 Cascade/cleanup gaps

### MEDIUM — `useBackupCode` does not set the 2FA session verification flag in Redis
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts:148-154` and `apps/api/src/modules/two-factor/two-factor.service.ts:471-499`
- **Evidence:** The `/backup` endpoint calls `useBackupCode` which validates and removes the backup code, but does NOT call `this.redis.setex(key, TTL, '1')` to set the session verification flag. Compare with the `validate` method (line 369-372) which does set the Redis flag on success.
```typescript
// backup endpoint — no session flag set
async backup(@CurrentUser('id') userId: string, @Body() dto: VerifyBackupDto) {
    const valid = await this.twoFactorService.useBackupCode(userId, dto.backupCode);
    if (!valid) {
      throw new BadRequestException('Invalid backup code');
    }
    return { message: 'Backup code accepted' };
  }
```
- **Impact:** A user who successfully authenticates with a backup code is NOT marked as 2FA-verified for the session. Any subsequent request guarded by `TwoFactorGuard` will still fail with 403 "2FA verification required." This effectively makes backup codes useless for their primary purpose (regaining access when TOTP device is lost), since the user can POST to `/backup` but still can't access any 2FA-protected endpoint.
- **Checklist item:** #8 State machine

### MEDIUM — `validate` endpoint leaks whether 2FA is enabled for a user
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts:96-110`
- **Evidence:** The `/validate` endpoint returns `{ valid: true, twoFactorEnabled: false, sessionVerified: true }` when 2FA is not enabled, and `{ valid, twoFactorEnabled: true, sessionVerified: valid }` when it is. The `twoFactorEnabled` field directly reveals the user's 2FA enrollment status.
```typescript
if (!isEnabled) {
  return { valid: true, twoFactorEnabled: false, sessionVerified: true, message: '2FA not enabled...' };
}
```
- **Impact:** An authenticated attacker (any logged-in user hitting their own endpoint) can determine if their target has 2FA enabled. More critically, since this uses `@CurrentUser('id')`, it only reveals the caller's own 2FA status, which limits the severity. However, the `/status` endpoint also returns `isEnabled` (line 136-138), and neither has any check that this information should be exposed. The `twoFactorEnabled: false` response also means an attacker who has stolen credentials knows they don't need to worry about 2FA.
- **Checklist item:** #7 Error exposure

### MEDIUM — DTO `code` field validates length but not numeric format
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts:30-36`
- **Evidence:** The `VerifyDto` and `DisableDto` use `@IsString()` and `@Length(6, 6)` but do NOT use `@IsNumberString()` or `@Matches(/^\d{6}$/)`:
```typescript
class VerifyDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}
```
- **Impact:** Non-numeric strings like `"abcdef"` pass DTO validation and reach the TOTP verification logic. While `verifyTotp` will always return false for non-numeric input (TOTP codes are numeric), this wastes a rate-limited attempt and causes unnecessary crypto computation (HMAC-SHA1 + timing-safe comparison for 3 time windows). More importantly, it's defense-in-depth failure — the DTO should reject obviously invalid input before it reaches the crypto layer.
- **Checklist item:** #6 DTO validation gaps

### MEDIUM — Race condition in `setup`: read-then-write without transaction
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:240-294`
- **Evidence:** The `setup` method performs: (1) `findUnique` for user (line 242), (2) `findUnique` for secretRecord (line 248), (3) conditional `update` or `create` (lines 265-283). These are 3 separate Prisma calls with no `$transaction`. Two concurrent `POST /two-factor/setup` requests from the same user could both see `secretRecord = null` at step 2, then both attempt `create` at step 3, causing a unique constraint violation on `userId`.
```typescript
let secretRecord = await this.prisma.twoFactorSecret.findUnique({ where: { userId } });
// ... time gap ...
if (secretRecord) {
  secretRecord = await this.prisma.twoFactorSecret.update({ ... });
} else {
  secretRecord = await this.prisma.twoFactorSecret.create({ ... }); // RACE: both requests hit this branch
}
```
- **Impact:** The unique constraint on `userId` (from Prisma schema `@unique`) would cause one request to throw an unhandled Prisma error (P2002), returning a 500 to the user. This is not a security vulnerability but a reliability bug. The `@Throttle` of 10/min makes it harder to hit but doesn't prevent it (two rapid requests within 1 second).
- **Checklist item:** #4 Race conditions

### MEDIUM — Race condition in `useBackupCode`: read-then-write without transaction
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:471-499`
- **Evidence:** The `useBackupCode` method reads the backup codes array (line 472-474), finds the matching index (line 480-482), splices it (line 488-489), then writes back (line 491-496). No `$transaction` wraps this.
```typescript
const secretRecord = await this.prisma.twoFactorSecret.findUnique({ where: { userId } });
// ... time gap ...
const index = secretRecord.backupCodes.findIndex(...);
const updatedBackupCodes = [...secretRecord.backupCodes];
updatedBackupCodes.splice(index, 1);
await this.prisma.twoFactorSecret.update({ data: { backupCodes: updatedBackupCodes } });
```
- **Impact:** Two concurrent requests with the same backup code could both find it at the same index, both succeed, but only one splice takes effect. The backup code is consumed once in the DB but was accepted twice. This could allow a single backup code to be used for two separate authentication events.
- **Checklist item:** #4 Race conditions

### LOW — `hashBackupCode` uses random salt as HMAC key (cryptographic misuse)
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:673-677`
- **Evidence:** The backup code hashing uses the random salt directly as the HMAC key:
```typescript
const hmac = createHmac('sha256', salt).update(backupCode).digest('hex');
```
In standard password hashing, the salt is mixed with the password, not used as the key. Using a random value as the HMAC key is semantically equivalent to HMAC(random_key, password), which provides the needed uniqueness per-code, but deviates from established patterns (bcrypt, scrypt, argon2 use salt differently). The HMAC construction here is still cryptographically sound for preventing rainbow tables — it just misuses terminology. The "salt" is actually the "key."
- **Impact:** Low practical impact since the construction is still secure (HMAC with a unique key per code provides preimage resistance). However, it uses HMAC-SHA256 which is fast (~1M hashes/sec on modern hardware). Backup codes are 10 characters from base64url charset (uppercase, ~36 unique chars after `.toUpperCase()`), giving ~36^10 = 3.6 x 10^15 possibilities — sufficient entropy to resist brute-force even with fast hashing. Not a vulnerability, but a deviation from best practice.
- **Checklist item:** #6 DTO validation gaps (tangential — crypto implementation quality)

### LOW — `DELETE /disable` uses request body (non-standard HTTP)
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts:112-125`
- **Evidence:** The `@Delete('disable')` endpoint reads `@Body() dto: DisableDto` (the TOTP code). While HTTP/1.1 spec allows bodies on DELETE requests, many HTTP client libraries, proxies, and CDNs strip or ignore DELETE request bodies.
- **Impact:** Some frontend HTTP clients (older Axios versions, some React Native fetch implementations, certain API gateways) may silently drop the request body on DELETE requests, causing `dto.code` to be undefined and failing validation. A `POST /disable` with the code in the body would be more portable.
- **Checklist item:** #6 DTO validation gaps (ergonomics)

### LOW — `backupSalt` and `encryptedSecret` schema columns are never used
- **File:** `apps/api/prisma/schema.prisma:3217,3221`
- **Evidence:** The Prisma schema defines `encryptedSecret String?` and `backupSalt String?` on the `TwoFactorSecret` model, but the service code never reads or writes to these columns. The service uses the `secret` column for the encrypted TOTP secret (with `enc:`/`plain:` prefix format) and per-code salts stored inline in the `backupCodes` array (format `salt:hmac`).
```prisma
encryptedSecret String?
// TODO: Migrate existing secrets to encrypted column, then make secret nullable
backupSalt      String?
// TODO: Migrate existing SHA-256 hashes to HMAC-SHA256 with this salt
```
- **Impact:** Dead schema columns. The migration TODO comments suggest these were planned for a future migration but the actual implementation took a different approach (inline encryption in `secret` column, per-code salts in `backupCodes` array). No functional impact, but schema bloat and confusing to future developers.
- **Checklist item:** #5 Cascade/cleanup gaps (dead schema)

### LOW — `setup` returns plaintext TOTP secret in API response alongside QR code
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts:289-293`
- **Evidence:** The `setup` method returns the raw base32 secret to the client:
```typescript
return {
  secret,       // plaintext TOTP secret
  qrDataUri,    // QR code (also contains the secret)
  backupCodes,  // plaintext backup codes
};
```
- **Impact:** The plaintext secret is necessary for manual TOTP app entry (users who can't scan QR codes). This is standard practice for Google, GitHub, etc. However, the response travels over HTTPS to the client and may be cached in HTTP response caches, browser history (if web), or client-side logs. Not a bug per se, but worth noting that this response should have `Cache-Control: no-store` headers.
- **Checklist item:** #7 Error exposure (information exposure, accepted risk)

## Checklist Verification

### 1. BOLA (Broken Object-Level Authorization)
**PASS.** All controller endpoints use `@UseGuards(ClerkAuthGuard)` and extract `userId` from `@CurrentUser('id')`, which comes from the authenticated JWT. There is no path for user A to target user B's 2FA — the userId is always derived from the authenticated session, never from request parameters.

### 2. Missing pagination
**PASS.** The only `findMany` call (line 538, key rotation cron) uses `take: batchSize` (50) with cursor-based pagination. No unbounded queries exist.

### 3. Missing rate limit
**PASS.** All mutation endpoints have `@Throttle`:
- `POST /setup`: 10 req/60s
- `POST /verify`: 5 req/60s
- `POST /validate`: 5 req/300s (5 min)
- `DELETE /disable`: 5 req/60s
- `POST /backup`: 5 req/300s (5 min)
- `GET /status`: No throttle (read-only, acceptable)

**However**, the validate and backup limits (5 per 5 min) are generous for 2FA brute-force. With a 6-digit code space (1M possibilities), 5 attempts per 5 minutes would take ~694 days to exhaust — acceptable. But the `@Throttle` appears to be per-user (default NestJS throttler is per-IP), which means a distributed attack from multiple IPs could exceed these limits. This is a defense-in-depth concern, not a finding.

### 4. Race conditions
**FINDING.** Two race conditions identified:
- `setup`: concurrent calls can cause P2002 unique constraint error (Finding #7)
- `useBackupCode`: concurrent calls can double-spend a backup code (Finding #8)

### 5. Cascade/cleanup gaps
**FINDING.** Three cleanup gaps:
- `disable` does not clear Redis session keys (Finding #2)
- `disable` does not delete TOTP secret or backup codes (Finding #3)
- Dead schema columns `encryptedSecret` and `backupSalt` (Finding #11)

### 6. DTO validation gaps
**FINDING.** TOTP code accepts non-numeric 6-character strings (Finding #6). Backup code DTO (`@Length(10, 10)`) is similarly permissive but backup codes ARE alphanumeric so this is correct.

### 7. Error exposure
**FINDING.** The `validate` endpoint explicitly returns `twoFactorEnabled: true/false` (Finding #5). The `status` endpoint returns `isEnabled` (line 136). Both expose 2FA enrollment status to the authenticated user (their own status — not other users').

### 8. State machine
**FINDING.** Two state machine issues:
- No TOTP replay prevention — same code valid across entire time window (Finding #1)
- Backup code acceptance does not set session verification flag in Redis (Finding #4)
- Enable-disable-reenable cycle leaves stale Redis keys (part of Finding #2)
