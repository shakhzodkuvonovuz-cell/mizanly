# Audit Agent #3 — Auth / Security / Encryption

**Scope:** two-factor, auth, encryption, guards, decorators, parental-controls, privacy, admin auth, socket gateway auth
**Files audited:** 30+ source files, line-by-line
**Total findings:** 38

---

## CRITICAL (Ship Blockers / Account Takeover)

### Finding 1: 2FA validate endpoint is UNAUTHENTICATED — any user can brute-force any userId
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts`, lines 108-115
- **Severity:** Critical
- **Category:** Security — Account Takeover
- **Description:** The `POST /two-factor/validate` endpoint has NO `@UseGuards(ClerkAuthGuard)` and accepts an arbitrary `userId` in the request body. An attacker can repeatedly call this endpoint with any target user's ID, trying TOTP codes. With a 6-digit code space (1,000,000 possibilities) and a window of 3 time steps (window=1 means current, +1, -1), the effective keyspace is only ~333,333 attempts. At 5 req/min throttle, this is still brute-forceable over days, but the throttle is per-IP which can be circumvented with rotating proxies.
- **Code:**
```typescript
@Post('validate')
@Throttle({ default: { limit: 5, ttl: 60000 } })
// NO @UseGuards(ClerkAuthGuard) — completely unauthenticated
async validate(@Body() dto: ValidateDto) {
  const valid = await this.twoFactorService.validate(dto.userId, dto.code);
  return { valid };
}
```

### Finding 2: 2FA backup code endpoint is UNAUTHENTICATED — same brute-force risk
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts`, lines 142-153
- **Severity:** Critical
- **Category:** Security — Account Takeover
- **Description:** The `POST /two-factor/backup` endpoint has NO `@UseGuards(ClerkAuthGuard)` and accepts an arbitrary `userId` + `backupCode` in the body. Backup codes are 10-character hex strings (only 0-9A-F, not full alphanumeric), so the keyspace is 16^10 = ~1 trillion. However, an attacker can enumerate users and try each backup code one at a time. Once a valid backup code is consumed, it is permanently removed from the user's account, causing a denial-of-service (the legitimate user loses that code).
- **Code:**
```typescript
@Post('backup')
@Throttle({ default: { limit: 5, ttl: 60000 } })
// NO @UseGuards(ClerkAuthGuard) — completely unauthenticated
async backup(@Body() dto: BackupDto) {
  const valid = await this.twoFactorService.useBackupCode(dto.userId, dto.backupCode);
```

### Finding 3: TOTP secret stored in PLAINTEXT in database
- **File:** `apps/api/prisma/schema.prisma`, line 2224; `apps/api/src/modules/two-factor/two-factor.service.ts`, lines 109, 118
- **Severity:** Critical
- **Category:** Security — Data at Rest
- **Description:** The `TwoFactorSecret.secret` field is a plain `String` in the Prisma schema. The TOTP secret is written directly to the database without encryption. If the database is compromised (SQL injection, backup leak, unauthorized DB access), an attacker can generate valid TOTP codes for every user with 2FA enabled, completely defeating the purpose of 2FA. The secret should be encrypted at rest using an application-level key (e.g., AES-256-GCM with a key from env vars), decrypted only when verifying codes.
- **Code:**
```prisma
model TwoFactorSecret {
  secret      String    // PLAINTEXT TOTP secret — should be encrypted at rest
```

### Finding 4: Banned/deactivated/deleted users NOT blocked at auth gate
- **File:** `apps/api/src/common/guards/clerk-auth.guard.ts`, lines 32-41
- **Severity:** Critical
- **Category:** Security — Authorization Bypass
- **Description:** The `ClerkAuthGuard` only checks if a user exists for the given `clerkId`. It does NOT check `isBanned`, `isDeactivated`, or `isDeleted` fields. A banned user can continue to access the entire API with their existing Clerk JWT. The ban is purely decorative unless Clerk itself blocks the user (which it won't since banning is done in the app's DB, not Clerk).
- **Code:**
```typescript
const user = await this.prisma.user.findUnique({
  where: { clerkId },
  select: { id: true, clerkId: true, username: true, displayName: true },
  // MISSING: isBanned, isDeactivated, isDeleted — never checked
});
if (!user) {
  throw new UnauthorizedException('User not found');
}
// Banned user sails right through here
request.user = user;
return true;
```

### Finding 5: Feature flag endpoints have NO admin role check — any authenticated user can modify flags
- **File:** `apps/api/src/modules/admin/admin.controller.ts`, lines 92-108
- **Severity:** Critical
- **Category:** Security — Privilege Escalation
- **Description:** The admin controller uses `ClerkAuthGuard` at the class level (line 26), which authenticates any user. For report/ban endpoints, `adminId` is passed to `adminService.assertAdmin()`. But the three feature flag endpoints (`getFlags`, `setFlag`, `deleteFlag`) call `this.featureFlags` directly WITHOUT passing an admin ID or calling any admin check. Any authenticated user can read all flags, set arbitrary flags, or delete flags. This could be used to enable hidden features, disable security features, or disrupt the platform.
- **Code:**
```typescript
@Get('flags')
getFlags() {
  return this.featureFlags.getAllFlags();  // NO assertAdmin check
}

@Patch('flags/:name')
setFlag(@Param('name') name: string, @Body('value') value: string) {
  return this.featureFlags.setFlag(name, value);  // NO assertAdmin check
}

@Delete('flags/:name')
deleteFlag(@Param('name') name: string) {
  return this.featureFlags.deleteFlag(name);  // NO assertAdmin check
}
```

### Finding 6: Socket gateway does not check banned/deactivated/deleted users
- **File:** `apps/api/src/gateways/chat.gateway.ts`, lines 107-115
- **Severity:** Critical
- **Category:** Security — Authorization Bypass
- **Description:** The socket gateway authenticates via Clerk JWT and looks up the user, but only selects `{ id, username }`. It never checks `isBanned`, `isDeactivated`, or `isDeleted`. A banned user can maintain real-time connections, send messages, initiate calls, and see online status. Combined with Finding 4, banning a user has zero functional effect.
- **Code:**
```typescript
const user = await this.prisma.user.findUnique({
  where: { clerkId },
  select: { id: true, username: true },
  // MISSING: isBanned, isDeactivated, isDeleted checks
});
if (!user) { client.disconnect(); return; }
// Banned user stays connected
client.data.userId = user.id;
```

---

## MODERATE

### Finding 7: GDPR data export caps at 50 records for most content types
- **File:** `apps/api/src/modules/privacy/privacy.service.ts`, lines 18-32
- **Severity:** Moderate
- **Category:** Legal/Compliance — GDPR Violation
- **Description:** The `exportUserData` method applies `take: 50` to posts, threads, stories, and follows. A user with 10,000 posts will only receive 50 in their export. GDPR Article 20 (Right to Data Portability) requires ALL personal data, not a sample. Messages have `take: 10000` which is better but still a cap. This is a clear GDPR violation if the platform operates in the EU.
- **Code:**
```typescript
const [posts, threads, stories, messages, follows] = await Promise.all([
  this.prisma.post.findMany({ where: { userId }, ..., take: 50 }),  // truncated
  this.prisma.thread.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.story.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.message.findMany({ ..., take: 10000 }),
  this.prisma.follow.findMany({ ..., take: 50 }),
]);
```

### Finding 8: Account deletion leaves conversations, reactions, bookmarks, reels, videos intact
- **File:** `apps/api/src/modules/privacy/privacy.service.ts`, lines 47-101
- **Severity:** Moderate
- **Category:** Data Integrity / Legal — Incomplete Deletion
- **Description:** The `deleteAllUserData` soft-deletes posts, threads, comments, and hard-deletes stories and profile links. But it does NOT touch: messages (content visible to conversation partners), reels, videos, bookmarks, saved posts, reactions (likes), follow relationships, two-factor secrets, encryption keys, notification records, gamification data (achievements, streaks, XP), commerce data (orders, gifts, coins), community memberships, or any other user-generated content. The user's digital footprint remains vast after "deletion."
- **Code:**
```typescript
// These are the ONLY things deleted/anonymized:
await tx.post.updateMany({ where: { userId }, data: { isRemoved: true, ... } });
await tx.thread.updateMany({ where: { userId }, data: { isRemoved: true } });
await tx.comment.updateMany({ where: { userId }, data: { isRemoved: true } });
await tx.story.deleteMany({ where: { userId } });
await tx.profileLink.deleteMany({ where: { userId } });
// Missing: reels, videos, messages, reactions, bookmarks, follows, 2FA, encryption keys,
// notifications, gamification, commerce, communities, etc.
```

### Finding 9: Data export returns full user profile including clerkId, email, phone
- **File:** `apps/api/src/modules/privacy/privacy.service.ts`, lines 12-15
- **Severity:** Moderate
- **Category:** Security — Information Exposure
- **Description:** The export includes the full User record with `profileLinks` and `channel`. This exposes internal fields like `clerkId` (Clerk's internal ID), `expoPushToken` (could be used to send push notifications), and all other internal fields. The export should select only user-facing fields, not internal system identifiers.
- **Code:**
```typescript
const user = await this.prisma.user.findUnique({
  where: { id: userId },
  include: { profileLinks: true, channel: true },
  // Returns ALL fields including clerkId, expoPushToken, etc.
});
```

### Finding 10: check-username endpoint has no input validation — accepts empty/null/SQL-like strings
- **File:** `apps/api/src/modules/auth/auth.controller.ts`, line 46
- **Severity:** Moderate
- **Category:** Security — Input Validation
- **Description:** The `GET /auth/check-username` endpoint takes a raw `@Query('username')` parameter with no DTO validation. It passes this directly to `findUnique({ where: { username: username.toLowerCase() } })`. While Prisma parameterizes queries (no SQL injection), the endpoint accepts any string: empty strings, strings with special characters, extremely long strings, etc. There is no `@IsString()`, `@MinLength(3)`, `@MaxLength(30)`, or `@Matches()` validation like the `RegisterDto` has. Also, this endpoint has no auth guard, so it can be used for username enumeration attacks.
- **Code:**
```typescript
@Get('check-username')
@Throttle({ default: { limit: 10, ttl: 60000 } })
checkUsername(@Query('username') username: string) {
  return this.authService.checkUsername(username);  // no validation
}
```

### Finding 11: Parental control PIN is only 4 digits — 10,000 keyspace
- **File:** `apps/api/src/modules/parental-controls/dto/parental-control.dto.ts`, lines 20-25
- **Severity:** Moderate
- **Category:** Security — Weak Authentication
- **Description:** The parental control PIN is restricted to exactly 4 numeric digits (regex `^\d{4}$`), giving only 10,000 possible values. While scrypt hashing is used (good), the `POST /:childId/pin` verify endpoint has only the class-level throttle of 30 req/min. At 30 attempts per minute, the entire keyspace can be exhausted in ~5.5 hours. A child who knows they are monitored can brute-force the PIN.
- **Code:**
```typescript
@Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
pin: string;
```

### Finding 12: Parental control restrictions endpoint leaks data for ANY childId
- **File:** `apps/api/src/modules/parental-controls/parental-controls.controller.ts`, lines 102-105
- **Severity:** Moderate
- **Category:** Security — IDOR (Insecure Direct Object Reference)
- **Description:** The `GET /:childId/restrictions` endpoint accepts a `childId` parameter and returns the restrictions for that child. It does NOT verify that the requesting user is the parent of that child. The controller has `@UseGuards(ClerkAuthGuard)` at class level, so any authenticated user can query restrictions for any other user. This leaks whether a user is a child account, their age rating, DM restrictions, daily limits, etc.
- **Code:**
```typescript
@Get(':childId/restrictions')
getRestrictions(@Param('childId') childId: string) {
  // No @CurrentUser('id') — no parent verification
  return this.parentalControlsService.getRestrictions(childId);
}
```

### Finding 13: Encryption status endpoint leaks member info for ANY conversation
- **File:** `apps/api/src/modules/encryption/encryption.controller.ts`, lines 139-145
- **Severity:** Moderate
- **Category:** Security — IDOR
- **Description:** The `GET /encryption/status/:conversationId` endpoint returns a list of member userIds and their encryption key status. It does NOT verify that the requesting user is a member of the conversation. Any authenticated user can enumerate conversation members and their encryption status for any conversation ID.
- **Code:**
```typescript
@Get('status/:conversationId')
async getConversationStatus(
  @Param('conversationId') conversationId: string,
) {
  // No @CurrentUser('id') — no membership check
  return this.encryptionService.getConversationEncryptionStatus(conversationId);
}
```

### Finding 14: Encryption public key accessible for ANY user without rate limit protection
- **File:** `apps/api/src/modules/encryption/encryption.controller.ts`, lines 91-93
- **Severity:** Moderate
- **Category:** Security — Information Exposure
- **Description:** The `GET /encryption/keys/:userId` endpoint allows any authenticated user to retrieve the public encryption key and fingerprint of any other user. While public keys are designed to be public, exposing them along with fingerprints in bulk via the `GET /encryption/keys/bulk` endpoint (which accepts arbitrary comma-separated userIds) enables key harvesting. The bulk endpoint has no limit on the number of userIds that can be requested in a single call (only limited by URL length).
- **Code:**
```typescript
@Get('keys/bulk')
async getBulkKeys(@Query('userIds') userIds: string) {
  const ids = userIds ? userIds.split(',').filter(Boolean) : [];
  return this.encryptionService.getBulkKeys(ids);  // no limit on array size
}
```

### Finding 15: 2FA validate returns boolean indicating whether code was correct — timing oracle
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts`, lines 112-114
- **Severity:** Moderate
- **Category:** Security — Information Disclosure
- **Description:** The unauthenticated `/two-factor/validate` endpoint returns `{ valid: true/false }`, telling an attacker exactly whether the code was correct. Combined with Finding 1, this is a direct brute-force oracle. A more secure design would return a token on success or a generic error on failure, and ideally require authentication.
- **Code:**
```typescript
async validate(@Body() dto: ValidateDto) {
  const valid = await this.twoFactorService.validate(dto.userId, dto.code);
  return { valid };  // Tells attacker if code was correct
}
```

### Finding 16: 2FA is completely disconnected from the login flow
- **File:** `apps/api/src/modules/auth/auth.service.ts` (entire file), `apps/api/src/common/guards/clerk-auth.guard.ts` (entire file)
- **Severity:** Moderate
- **Category:** Logic Error — Missing Feature Integration
- **Description:** The 2FA module exists and has setup/verify/validate/backup endpoints, but it is NEVER integrated into the actual authentication flow. The `ClerkAuthGuard` never checks if the user has 2FA enabled and never requires a TOTP code. The `AuthService.register` and `getMe` methods never reference 2FA. The `validate` endpoint exists but nothing calls it during login. 2FA is a standalone module that does nothing to protect accounts in practice.

### Finding 17: Auth guard swallows all errors as "Invalid token"
- **File:** `apps/api/src/common/guards/clerk-auth.guard.ts`, lines 43-44
- **Severity:** Moderate
- **Category:** Bug — Error Handling
- **Description:** The catch block at line 43 catches ALL errors (including the `UnauthorizedException('User not found')` from line 38) and re-throws as `UnauthorizedException('Invalid token')`. This means if a Clerk-authenticated user hasn't completed registration (no DB record yet), they get "Invalid token" instead of "User not found", making debugging difficult. The inner `UnauthorizedException` at line 38 is unreachable in practice because the outer catch always fires first.
- **Code:**
```typescript
try {
  // ...
  if (!user) {
    throw new UnauthorizedException('User not found');  // This throw...
  }
  // ...
} catch (error) {
  throw new UnauthorizedException('Invalid token');  // ...gets caught here
}
```

### Finding 18: Webhook controller has both @SkipThrottle and @Throttle — contradictory decorators
- **File:** `apps/api/src/modules/auth/webhooks.controller.ts`, lines 24, 34
- **Severity:** Moderate
- **Category:** Bug — Configuration
- **Description:** The class has `@SkipThrottle()` at the controller level (line 24), but the `handleClerkWebhook` method has `@Throttle({ default: { limit: 50, ttl: 60000 } })` at the method level (line 34). The behavior depends on NestJS throttler resolution order — typically method-level overrides class-level, so the throttle probably applies. But the presence of both is confusing and may lead to unexpected behavior in future NestJS versions. If `@SkipThrottle()` takes precedence, the webhook endpoint would be unthrottled.
- **Code:**
```typescript
@Controller('webhooks')
@SkipThrottle()  // Skip throttle on entire controller
export class WebhooksController {
  @Post('clerk')
  @Throttle({ default: { limit: 50, ttl: 60000 } })  // But throttle this specific method?
  async handleClerkWebhook(...)
```

### Finding 19: Clerk webhook only checks user.created/updated/deleted — ignores session/organization events
- **File:** `apps/api/src/modules/auth/webhooks.controller.ts`, lines 71-86
- **Severity:** Moderate
- **Category:** Missing Feature
- **Description:** The webhook handler only processes `user.created`, `user.updated`, and `user.deleted` events. It ignores other important Clerk events like `session.revoked` (should invalidate all user sessions), `user.banned` (Clerk has its own ban system), `organization.*` events, and `email.created` (could trigger email verification flows). The `user.deleted` handler calls `deactivateByClerkId` which only soft-deactivates — it doesn't clean up sessions or disconnect socket connections.

### Finding 20: Safety number algorithm is cryptographically weak
- **File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 64-98
- **Severity:** Moderate
- **Category:** Security — Weak Cryptography
- **Description:** The safety number computation converts hex characters to their decimal digit representation (0-15 each). This means each hex char produces 1-2 decimal digits with a non-uniform distribution (0-9 produce 1 digit, 10-15 produce 2 digits). The resulting "safety number" has lower entropy than Signal's approach. Signal uses a proper numeric fingerprint with 30 groups of 5 digits computed from public keys directly. This implementation uses fingerprints (truncated SHA-256 of public key) rather than the public keys themselves, and the hex-to-decimal conversion loses entropy.
- **Code:**
```typescript
let digits = '';
for (let i = 0; i < hash.length && digits.length < 60; i++) {
  const num = parseInt(hash[i], 16);  // 0-15
  digits += num.toString();  // "0"-"9" (1 char) or "10"-"15" (2 chars) — non-uniform!
}
```

### Finding 21: Encryption key registration does not validate base64 format
- **File:** `apps/api/src/modules/encryption/encryption.service.ts`, line 30; `apps/api/src/modules/encryption/encryption.controller.ts`, lines 18-23
- **Severity:** Moderate
- **Category:** Security — Input Validation
- **Description:** The `RegisterKeyDto` requires `@MinLength(32)` for the public key, but does not validate that it is valid base64. The service then does `Buffer.from(publicKey, 'base64')` at line 35 which will silently produce garbage bytes for non-base64 input. A user could register an invalid "public key" string which would generate a valid-looking fingerprint but be completely unusable for encryption. No `@Matches` or custom validator ensures the key is properly formatted.
- **Code:**
```typescript
class RegisterKeyDto {
  @IsString()
  @MinLength(32)  // No @Matches for base64 format
  publicKey!: string;
}
```

### Finding 22: Envelope store uses findFirst+upsert with race condition
- **File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 216-244
- **Severity:** Moderate
- **Category:** Bug — Race Condition
- **Description:** The `storeEnvelope` method first calls `findFirst` to get the max version, then uses that version in an `upsert`. Between these two calls, another concurrent request could have created a new version, causing the upsert to overwrite the wrong version. Unlike `rotateKey` which uses `$transaction`, `storeEnvelope` does not. This could lead to encryption key corruption if two users simultaneously try to store envelopes for the same conversation.
- **Code:**
```typescript
// NOT in a transaction — race condition between findFirst and upsert
const existing = await this.prisma.conversationKeyEnvelope.findFirst({
  where: { conversationId: data.conversationId, userId: data.recipientId },
  orderBy: { version: 'desc' },
});
const version = existing ? existing.version : 1;

return this.prisma.conversationKeyEnvelope.upsert({
  where: { conversationId_userId_version: { ..., version } },
  // Another request may have just created this version
```

### Finding 23: Privacy delete-all has no confirmation mechanism — single request deletes everything
- **File:** `apps/api/src/modules/privacy/privacy.controller.ts`, lines 22-26
- **Severity:** Moderate
- **Category:** Security — Insufficient Protection
- **Description:** The `DELETE /privacy/delete-all` endpoint permanently anonymizes and soft-deletes a user's account with a single HTTP request. There is no confirmation token, no re-authentication requirement, no cooldown period, and no grace period for recovery. If an attacker gains temporary access to a user's session/token, they can permanently destroy the account. Best practice is to require password/2FA re-verification, send a confirmation email, and provide a 30-day grace period.

### Finding 24: Register endpoint does not set onboardingComplete
- **File:** `apps/api/src/modules/auth/auth.service.ts`, lines 28-78
- **Severity:** Moderate
- **Category:** Logic Error — Missing Feature
- **Description:** The `register` method creates/updates a user but never sets any `onboardingComplete` flag. Previous audit found that the mobile onboarding flow checks for this flag to determine whether to show the onboarding screens. Since it's never set, users may be stuck in an infinite onboarding loop (confirmed by Agent #34 of the previous audit).

### Finding 25: syncClerkUser generates predictable username from clerkId
- **File:** `apps/api/src/modules/auth/auth.service.ts`, line 195
- **Severity:** Moderate
- **Category:** Security — Predictable Values
- **Description:** When a user is auto-created via Clerk webhook, the username is set to `user_${clerkId.slice(-8)}`. Clerk IDs have a known format (`user_xxxx`). If `clerkId` is `user_2abc1234efgh`, the username becomes `user_234efgh`. This is predictable and could enable targeted attacks if an attacker knows the Clerk ID pattern. The username uniqueness constraint in the schema also means a hash collision on the last 8 characters would prevent account creation.
- **Code:**
```typescript
username: `user_${clerkId.slice(-8)}`,
```

---

## MINOR

### Finding 26: Backup codes only use hex characters — reduced keyspace
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts`, lines 279-288
- **Severity:** Minor
- **Category:** Security — Weak Entropy
- **Description:** Backup codes are generated from `randomBytes(6).toString('hex').toUpperCase().slice(0, 10)`. Since hex only uses 0-9 and A-F, the keyspace is 16^10 instead of the 36^10 that full alphanumeric would provide. This is ~1 trillion combinations vs ~3.6 quadrillion. While still large enough to be impractical to brute-force, it's suboptimal. Services like Google use full alphanumeric backup codes.
- **Code:**
```typescript
const buffer = randomBytes(6); // 6 bytes = 48 bits = 12 hex chars
const code = buffer.toString('hex').toUpperCase().slice(0, 10);
// Only 0-9, A-F — 16^10 keyspace instead of 36^10
```

### Finding 27: Backup code hashing uses unsalted SHA-256
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts`, lines 293-295
- **Severity:** Minor
- **Category:** Security — Weak Hashing
- **Description:** Backup codes are hashed with plain SHA-256, no salt. If the database is compromised, an attacker can precompute a rainbow table for all 16^10 possible backup codes and reverse them instantly. The parental PIN correctly uses scrypt with a random salt. Backup codes should receive the same treatment, or at minimum use HMAC with a server-side key.
- **Code:**
```typescript
private hashBackupCode(backupCode: string): string {
  return createHash('sha256').update(backupCode).digest('hex');
  // No salt — susceptible to rainbow table attacks
}
```

### Finding 28: key notification message uses hardcoded English string
- **File:** `apps/api/src/modules/encryption/encryption.service.ts`, line 157
- **Severity:** Minor
- **Category:** Missing Feature — i18n
- **Description:** The security code change notification message is hardcoded as `Security code changed for ${name}. Tap to verify.`. The platform supports 8 languages (en, ar, tr, ur, bn, fr, id, ms). System messages should use a message type/code and let the client render localized text.
- **Code:**
```typescript
content: `Security code changed for ${name}. Tap to verify.`,
```

### Finding 29: Key change notification silently swallows all errors
- **File:** `apps/api/src/modules/encryption/encryption.service.ts`, lines 162-164
- **Severity:** Minor
- **Category:** Bug — Error Handling
- **Description:** The `notifyKeyChange` method wraps everything in a `try/catch {}` that catches and silently ignores all errors. There is no logging. If the notification fails (DB error, invalid data), there is no way to know. At minimum, a `logger.error()` call should be present.
- **Code:**
```typescript
} catch {
  // Non-critical: notification failure shouldn't break key registration
  // But should at least log the error!
}
```

### Finding 30: Optional auth guard also swallows all token verification errors
- **File:** `apps/api/src/common/guards/optional-clerk-auth.guard.ts`, lines 33-34
- **Severity:** Minor
- **Category:** Bug — Error Handling
- **Description:** The `OptionalClerkAuthGuard` catches all errors during token verification and silently ignores them. This is by design (invalid token = treat as unauthenticated), but it means expired tokens, malformed tokens, and actual Clerk API errors are all treated identically. An expired token should potentially trigger a different response (401 with a "token expired" message) rather than serving a degraded unauthenticated response.

### Finding 31: UserThrottlerGuard falls back to 'unknown' for missing IP
- **File:** `apps/api/src/common/guards/user-throttler.guard.ts`, line 20
- **Severity:** Minor
- **Category:** Security — Rate Limiting Bypass
- **Description:** If `req.ip` is undefined (possible behind certain proxies/load balancers that don't set X-Forwarded-For), the throttler key becomes `'unknown'`. All unidentified requests share a single throttle bucket, meaning either: (a) one user with a missing IP throttles all other missing-IP users, or (b) distributed attacks all sharing the 'unknown' key get throttled more aggressively than intended.
- **Code:**
```typescript
return (req as { ip?: string }).ip ?? 'unknown';
```

### Finding 32: CurrentUser decorator returns undefined silently when user not attached
- **File:** `apps/api/src/common/decorators/current-user.decorator.ts`, line 7
- **Severity:** Minor
- **Category:** Bug — Silent Failure
- **Description:** When `@CurrentUser('id')` is used on an endpoint without `ClerkAuthGuard`, `request.user` will be undefined, and the decorator returns `undefined` without any error. This undefined value then gets passed to the service method as a userId, potentially causing cryptic Prisma errors or data corruption (queries with `where: { userId: undefined }`).
- **Code:**
```typescript
return data ? user?.[data] : user;  // Returns undefined if user not set
```

### Finding 33: Parental control updateControls does not require PIN verification
- **File:** `apps/api/src/modules/parental-controls/parental-controls.controller.ts`, lines 66-74
- **Severity:** Minor
- **Category:** Security — Missing Authorization
- **Description:** The `PATCH /:childId` endpoint updates parental controls (restricted mode, age rating, daily limits, DM restrictions, etc.) without requiring PIN verification. Only the parent's ClerkAuth token is needed. If a child has physical access to the parent's phone, they can modify their own restrictions via the API. The `unlinkChild` and `changePin` endpoints correctly require PIN, but `updateControls` does not.

### Finding 34: Privacy export endpoint is not rate-limited appropriately
- **File:** `apps/api/src/modules/privacy/privacy.controller.ts`, line 9
- **Severity:** Minor
- **Category:** Performance — Rate Limiting
- **Description:** The privacy export endpoint uses the class-level throttle of 60 req/min. Data export is an expensive operation (6 parallel DB queries). A malicious user could trigger 60 exports per minute, causing significant database load. A more appropriate limit would be 1-2 per hour, matching real-world usage patterns.

### Finding 35: Account deletion is non-idempotent for username
- **File:** `apps/api/src/modules/privacy/privacy.service.ts`, line 70
- **Severity:** Minor
- **Category:** Bug — Data Integrity
- **Description:** The deletion sets `username: deleted_${userId.slice(0, 8)}`. If two users have IDs starting with the same 8 characters (CUIDs can collide on prefix), the second deletion would fail with a unique constraint violation on the username field. A safer approach would use the full user ID or a UUID.
- **Code:**
```typescript
username: `deleted_${userId.slice(0, 8)}`,  // Possible collision
```

### Finding 36: Register DTO language field has no validation/whitelist
- **File:** `apps/api/src/modules/auth/dto/register.dto.ts`, lines 30-32
- **Severity:** Minor
- **Category:** Input Validation
- **Description:** The `language` field in `RegisterDto` is `@IsOptional() @IsString()` but has no whitelist validation. The platform supports 8 languages (en, ar, tr, ur, bn, fr, id, ms), but a user can set `language` to any arbitrary string like `"foobar"`. Should use `@IsIn(['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'])`.

### Finding 37: SetInterestsDto categories have no max string length per category
- **File:** `apps/api/src/modules/auth/dto/set-interests.dto.ts`, lines 4-11
- **Severity:** Minor
- **Category:** Input Validation
- **Description:** The `SetInterestsDto` validates array size (1-20 items) and that each item is a string, but there is no `@MaxLength()` on individual category strings. A user could set a category to a megabyte-long string, which would be stored in the DB. Should add `@MaxLength(100, { each: true })` or similar.

### Finding 38: No attempt accounting on 2FA verify/validate — no lockout after N failures
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts`, lines 149-176, 181-191
- **Severity:** Minor
- **Category:** Security — Missing Lockout
- **Description:** The 2FA verify and validate methods return `true`/`false` but never track failed attempts. There is no lockout after N failed attempts. The throttle on the controller (5 req/min) provides some protection, but a persistent attacker can try 5 codes per minute indefinitely. Best practice is to lock the 2FA validation for 15+ minutes after 5-10 failed attempts, stored in the DB or Redis.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 6 | 2FA endpoints unauthenticated (account takeover), TOTP secret in plaintext, banned users not blocked at auth gate, feature flags unprotected |
| Moderate | 19 | GDPR violations (export cap, incomplete deletion), IDOR on restrictions/encryption, 2FA not integrated into login, weak safety numbers, race conditions |
| Minor | 13 | Unsalted backup code hashing, missing input validation, hardcoded English, no lockout, predictable usernames |

### Top 5 Fixes by Impact:
1. **Add `@UseGuards(ClerkAuthGuard)` to validate and backup endpoints** — prevents unauthenticated 2FA brute-force (Findings 1, 2, 15)
2. **Check isBanned/isDeactivated/isDeleted in ClerkAuthGuard** — makes banning functional (Findings 4, 6)
3. **Add assertAdmin to feature flag endpoints** — prevents privilege escalation (Finding 5)
4. **Encrypt TOTP secret at rest** — defense in depth against DB compromise (Finding 3)
5. **Fix GDPR export to return ALL data and complete the deletion cascade** — legal compliance (Findings 7, 8)
