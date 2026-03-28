# Module: Auth, Webhooks, Two-Factor, Devices, Encryption

> Extracted 2026-03-25 by architecture extraction agent.
> Scope: `apps/api/src/modules/auth/`, `apps/api/src/modules/two-factor/`, `apps/api/src/modules/devices/`, `apps/api/src/modules/encryption/`, plus common auth guards and decorators.

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Auth Module](#2-auth-module)
   - 2.1 [AuthController Endpoints](#21-authcontroller-endpoints)
   - 2.2 [AuthService Methods](#22-authservice-methods)
   - 2.3 [RegisterDto](#23-registerdto)
   - 2.4 [SetInterestsDto](#24-setinterestsdto)
   - 2.5 [Registration Flow (End-to-End)](#25-registration-flow-end-to-end)
3. [Webhooks Controller](#3-webhooks-controller)
   - 3.1 [Clerk Webhook Endpoint](#31-clerk-webhook-endpoint)
   - 3.2 [Webhook Event Handling](#32-webhook-event-handling)
   - 3.3 [Idempotency Mechanism](#33-idempotency-mechanism)
4. [Two-Factor Authentication Module](#4-two-factor-authentication-module)
   - 4.1 [TwoFactorController Endpoints](#41-twofactorcontroller-endpoints)
   - 4.2 [TwoFactorService Methods](#42-twofactorservice-methods)
   - 4.3 [Native TOTP Implementation](#43-native-totp-implementation)
   - 4.4 [AES-256-GCM Secret Encryption](#44-aes-256-gcm-secret-encryption)
   - 4.5 [Backup Code System](#45-backup-code-system)
   - 4.6 [2FA Flow (End-to-End)](#46-2fa-flow-end-to-end)
5. [Devices Module](#5-devices-module)
   - 5.1 [DevicesController Endpoints](#51-devicescontroller-endpoints)
   - 5.2 [DevicesService Methods](#52-devicesservice-methods)
   - 5.3 [Device Session Management Flow](#53-device-session-management-flow)
6. [Encryption Module (E2E)](#6-encryption-module-e2e)
   - 6.1 [EncryptionController Endpoints](#61-encryptioncontroller-endpoints)
   - 6.2 [EncryptionService Methods](#62-encryptionservice-methods)
   - 6.3 [Key Exchange & Envelope Protocol](#63-key-exchange--envelope-protocol)
   - 6.4 [Safety Number Computation](#64-safety-number-computation)
7. [Common Auth Infrastructure](#7-common-auth-infrastructure)
   - 7.1 [ClerkAuthGuard](#71-clerkauthguard)
   - 7.2 [OptionalClerkAuthGuard](#72-optionalclerkauthguard)
   - 7.3 [CurrentUser Decorator](#73-currentuser-decorator)
   - 7.4 [AnalyticsService](#74-analyticsservice)
8. [Prisma Schema Models](#8-prisma-schema-models)
9. [Security Measures Summary](#9-security-measures-summary)
10. [Known Issues & TODOs](#10-known-issues--todos)

---

## 1. Module Overview

| Module | File Count | Controllers | Services | Exports |
|--------|-----------|------------|----------|---------|
| `auth` | 10 files | AuthController, WebhooksController | AuthService | AuthService |
| `two-factor` | 6 files | TwoFactorController | TwoFactorService | TwoFactorService |
| `devices` | 6 files | DevicesController | DevicesService | DevicesService |
| `encryption` | 6 files | EncryptionController | EncryptionService | EncryptionService |

**Dependency graph:**
- AuthModule has no imports (relies on global PrismaService, ConfigService, REDIS, AnalyticsService)
- TwoFactorModule has no imports (relies on global PrismaService, ConfigService)
- DevicesModule has no imports (relies on global PrismaService)
- EncryptionModule has no imports (relies on global PrismaService)
- AuthService depends on: PrismaService, ConfigService, AnalyticsService, Redis, @clerk/backend
- ClerkAuthGuard depends on: ConfigService, PrismaService, @clerk/backend

**Auth architecture:** Clerk handles primary authentication (email, phone, Apple, Google sign-in). Clerk issues JWTs. Backend verifies JWTs via `@clerk/backend.verifyToken()`. User record is created in local DB via webhook or registration endpoint. App-level TOTP 2FA is a secondary verification layer (currently not enforced at login -- see TODO F16).

---

## 2. Auth Module

**File:** `apps/api/src/modules/auth/auth.module.ts` (lines 1-11)

```
Module: AuthModule
  Controllers: [AuthController, WebhooksController]
  Providers: [AuthService]
  Exports: [AuthService]
```

### 2.1 AuthController Endpoints

**File:** `apps/api/src/modules/auth/auth.controller.ts` (73 lines)

| # | Method | Route | Guard | Rate Limit | Line | Description |
|---|--------|-------|-------|-----------|------|-------------|
| 1 | `POST` | `/api/v1/auth/register` | ClerkAuthGuard | 5 req / 5 min | L23-33 | Complete profile after Clerk signup |
| 2 | `GET` | `/api/v1/auth/me` | ClerkAuthGuard | 10 req / 1 min | L35-42 | Get current authenticated user + 2FA status |
| 3 | `GET` | `/api/v1/auth/check-username` | None (public) | 10 req / 1 min | L44-52 | Check if username is available |
| 4 | `POST` | `/api/v1/auth/interests` | ClerkAuthGuard | default | L54-63 | Set interest categories (onboarding) |
| 5 | `GET` | `/api/v1/auth/suggested-users` | ClerkAuthGuard | default | L65-71 | Get suggested accounts to follow (onboarding) |

**Endpoint Details:**

**1. POST /auth/register (L23-33)**
- Guard: `ClerkAuthGuard` -- requires valid Clerk JWT
- Rate limit: `@Throttle({ default: { limit: 5, ttl: 300000 } })` -- 5 requests per 5 minutes
- Input: `@CurrentUser('clerkId')` from JWT, `@Body() RegisterDto`
- Calls: `authService.register(clerkId, dto)`
- Returns: User object

**2. GET /auth/me (L35-42)**
- Guard: `ClerkAuthGuard`
- Rate limit: 10 req / 1 min
- Input: `@CurrentUser('id')` userId
- Calls: `authService.getMe(userId)`
- Returns: User object with `twoFactorEnabled: boolean`

**3. GET /auth/check-username (L44-52)**
- NO guard -- public endpoint
- Rate limit: 10 req / 1 min
- Input: `@Query('username')` string
- Server-side validation before service call (L48):
  - Must be string, 3-30 chars, `/^[a-zA-Z0-9._]+$/`
  - Throws `BadRequestException` on invalid
- Returns: `{ available: boolean }`

**4. POST /auth/interests (L54-63)**
- Guard: `ClerkAuthGuard`
- Input: `@CurrentUser('id')`, `@Body() SetInterestsDto`
- Calls: `authService.setInterests(userId, dto)`

**5. GET /auth/suggested-users (L65-71)**
- Guard: `ClerkAuthGuard`
- Input: `@CurrentUser('id')`
- Calls: `authService.getSuggestedUsers(userId)`

### 2.2 AuthService Methods

**File:** `apps/api/src/modules/auth/auth.service.ts` (351 lines)

**Constructor (L29-38):**
- Injects: `PrismaService`, `ConfigService`, `AnalyticsService`, `Redis` (via `@Inject('REDIS')`)
- Creates Clerk client instance using `CLERK_SECRET_KEY` from config

**Private Methods:**

**`calculateAge(dateOfBirth: string): number` (L44-53)**
- Standard age calculation from ISO date string
- Handles month/day boundary correctly (decrements age if birthday hasn't occurred this year)
- Constants: `MINIMUM_AGE = 13` (COPPA), `PARENTAL_CONSENT_AGE = 18` (GDPR Art 8)

**Public Methods:**

**`register(clerkId: string, dto: RegisterDto)` (L55-167)**
Complete registration flow with 7 security layers:

1. **Rate-limit registration attempts (L57-62):**
   - Redis key: `register_attempts:{clerkId}`
   - Increments on each call, sets 15-min TTL on first attempt
   - Throws `ForbiddenException` after 5 attempts in 15 minutes

2. **Device fingerprint abuse prevention (L64-71):**
   - If `dto.deviceId` provided, checks Redis key `device_accounts:{deviceId}`
   - Throws `BadRequestException` if >= 5 accounts from same device (permanent counter)

3. **COPPA/GDPR age verification (L73-79):**
   - Calls `calculateAge(dto.dateOfBirth)`
   - Throws `ForbiddenException` if age < 13

4. **Terms of Service acceptance (L81-86):**
   - Throws `BadRequestException` if `dto.acceptedTerms !== true`

5. **Clerk email fetch (L88-97):**
   - Calls `this.clerk.users.getUser(clerkId)` to get email from Clerk
   - Throws `BadRequestException` if no email found

6. **Username conflict check (L99-105):**
   - Queries `prisma.user.findUnique({ where: { username: dto.username.toLowerCase() } })`
   - Allows if same clerkId owns the username (re-registration case)
   - Throws `ConflictException` if different user owns it

7. **User upsert (L110-136):**
   - `prisma.user.upsert` with `where: { clerkId }`
   - Create data: clerkId, email, username (lowercased), displayName, bio, avatarUrl, language, isChildAccount (if age < 18)
   - Update data: username, displayName, bio, avatarUrl, language
   - Also upserts `UserSettings` record (L139-143)

8. **Post-registration (L145-166):**
   - Logs if minor registered
   - Increments device account counter in Redis (permanent, no TTL)
   - Clears attempt counter on success
   - Tracks analytics: `user_registered` event + `registrations:daily` counter

**`getMe(userId: string)` (L169-207)**
- Queries user with 17 selected fields (id, clerkId, username, displayName, bio, avatarUrl, coverUrl, website, location, followersCount, followingCount, postsCount, role, isVerified, isPrivate, language, theme, createdAt, settings)
- Throws `NotFoundException` if user not found
- Additionally queries `TwoFactorSecret` to check `isEnabled`
- Returns merged object with `twoFactorEnabled: boolean`

**`checkUsername(username: string)` (L209-214)**
- Queries `prisma.user.findUnique` by lowercased username
- Returns `{ available: !user }`

**`setInterests(userId: string, dto: SetInterestsDto)` (L216-223)**
- Deletes all existing `UserInterest` records for user
- Bulk creates new ones from `dto.categories`
- Returns confirmation with categories list

**`getSuggestedUsers(userId: string, limit = 5)` (L225-284)**
- Two-phase suggestion algorithm:
  - **Phase 1 (Friends-of-friends):** Gets user's following list (capped at 1000), finds users followed by those users, excluding self, already-followed, deactivated/banned/deleted
  - **Phase 2 (Popular fallback):** If < `limit` results, fills with popular users ordered by `followersCount desc`
- Both phases filter: `isDeactivated: false, isBanned: false, isDeleted: false`
- Returns: `{ id, username, displayName, avatarUrl, isVerified, followersCount }`

**`syncClerkUser(clerkId: string, data: { email, displayName, avatarUrl? })` (L295-333)**
- Called by webhook handler (not an endpoint)
- If user exists by clerkId: updates email, displayName, avatarUrl (preserves username)
- If new user: generates random username `user_{randomBytes(4).hex}`, checks collision, creates user
- Uses `crypto.randomBytes(4)` for username suffix (not derived from clerkId for security)

**`deactivateByClerkId(clerkId: string)` (L335-350)**
- Called by webhook handler for `user.deleted` events
- Finds user by clerkId, sets `isDeactivated: true` + `deactivatedAt: new Date()`
- Deletes all device tokens (no push notifications to deactivated user)
- Returns `{ count: 0 }` if user not found, `{ count: 1 }` if deactivated

### 2.3 RegisterDto

**File:** `apps/api/src/modules/auth/dto/register.dto.ts` (47 lines)

| Field | Type | Validation | Required | Description |
|-------|------|-----------|----------|-------------|
| `username` | string | 3-30 chars, `/^[a-zA-Z0-9_.]+$/` | Yes | Lowercased on storage |
| `displayName` | string | 1-50 chars | Yes | Display name |
| `bio` | string | max 160 chars | No | User bio |
| `avatarUrl` | string | `@IsUrl()` | No | Avatar image URL |
| `language` | string | enum: en, ar, tr, ur, bn, fr, id, ms | No | Default: 'en' |
| `dateOfBirth` | string | `@IsDateString()` | Yes | ISO 8601 for age verification |
| `acceptedTerms` | boolean | `@IsBoolean()` | Yes | Must be true (GDPR Art 7) |
| `deviceId` | string | max 256 chars | No | Device fingerprint for abuse prevention |

### 2.4 SetInterestsDto

**File:** `apps/api/src/modules/auth/dto/set-interests.dto.ts` (17 lines)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `categories` | string[] | 1-20 items, each must be valid category | Interest categories |

Valid categories (12 total): `quran`, `fiqh`, `history`, `family`, `health`, `business`, `tech`, `arts`, `travel`, `education`, `social`, `sports`

### 2.5 Registration Flow (End-to-End)

```
Mobile App                    Clerk                      Backend API
    |                           |                            |
    |--- Sign up (email/phone/social) -->|                   |
    |<-- Clerk JWT + clerkId ---|                            |
    |                           |--- webhook: user.created -->|
    |                           |                            |-- syncClerkUser()
    |                           |                            |   (creates placeholder user)
    |                           |                            |
    |--- POST /auth/register (JWT + RegisterDto) ----------->|
    |                           |                            |-- rate limit check
    |                           |                            |-- device fingerprint check
    |                           |                            |-- age verification (13+)
    |                           |                            |-- terms acceptance check
    |                           |                            |-- fetch email from Clerk
    |                           |                            |-- username conflict check
    |                           |                            |-- upsert User + UserSettings
    |                           |                            |-- analytics track
    |<-- User object -----------|----------------------------|
    |                           |                            |
    |--- GET /auth/check-username?username=... (public) ---->|
    |<-- { available: true/false } --------------------------|
    |                           |                            |
    |--- POST /auth/interests (JWT + categories) ----------->|
    |<-- { message, categories } ----------------------------|
    |                           |                            |
    |--- GET /auth/suggested-users (JWT) ------------------->|
    |<-- [ { id, username, displayName, ... } ] -------------|
    |                           |                            |
    |--- GET /auth/me (JWT) -------------------------------->|
    |<-- { ...user, twoFactorEnabled } ----------------------|
```

---

## 3. Webhooks Controller

**File:** `apps/api/src/modules/auth/webhooks.controller.ts` (139 lines)

### 3.1 Clerk Webhook Endpoint

| Method | Route | Guard | Rate Limit | Line | Description |
|--------|-------|-------|-----------|------|-------------|
| `POST` | `/api/v1/webhooks/clerk` | None (uses svix signature) | 50 req / 1 min | L66-138 | Clerk webhook receiver |

**Request headers required:**
- `svix-id` -- unique event ID
- `svix-timestamp` -- event timestamp
- `svix-signature` -- HMAC signature

### 3.2 Webhook Event Handling

**Handled events (HANDLED_EVENTS set, L38-42):**
- `user.created` -- Calls `authService.syncClerkUser()` to create/update user
- `user.updated` -- Same as above (syncClerkUser handles both create and update)
- `user.deleted` -- Calls `authService.deactivateByClerkId()` to soft-delete user

**Acknowledged but no-action events (ACKNOWLEDGED_EVENTS set, L44-53):**
- `session.created`, `session.ended`, `session.removed`, `session.revoked`
- `email.created`
- `organization.created`, `organization.updated`, `organization.deleted`

**Unhandled events:** Logged as warning (`L134`)

**Event processing logic (L116-135):**
```
if (user.created || user.updated):
  extract email from data.email_addresses[0].email_address
  build displayName from first_name + last_name (fallback: username or "New User")
  extract avatarUrl from data.image_url
  call authService.syncClerkUser(data.id, { email, displayName, avatarUrl })

else if (user.deleted):
  call authService.deactivateByClerkId(data.id)

else if (acknowledged event):
  log debug "no action"

else:
  log warning "unhandled"
```

**Signature verification (L81-99):**
1. Gets `CLERK_WEBHOOK_SECRET` from config
2. Throws `BadRequestException` if not configured
3. Reads `req.rawBody` (Buffer) -- throws if not available
4. Creates `new Webhook(secret)` from svix
5. Calls `wh.verify(rawBody.toString(), { svix-id, svix-timestamp, svix-signature })`
6. Throws `BadRequestException` on verification failure

### 3.3 Idempotency Mechanism

**Lines 101-111:**
- Uses `svix-id` header as deduplication key
- Redis key: `clerk_webhook:{svixId}` with 24-hour TTL
- If already processed: returns `{ received: true, deduplicated: true }` without re-processing
- Marks as processed with `redis.setex(key, 86400, '1')` before processing

---

## 4. Two-Factor Authentication Module

**File:** `apps/api/src/modules/two-factor/two-factor.module.ts` (10 lines)

```
Module: TwoFactorModule
  Controllers: [TwoFactorController]
  Providers: [TwoFactorService]
  Exports: [TwoFactorService]
```

### 4.1 TwoFactorController Endpoints

**File:** `apps/api/src/modules/two-factor/two-factor.controller.ts` (140 lines)

| # | Method | Route | Guard | Rate Limit | Line | Description |
|---|--------|-------|-------|-----------|------|-------------|
| 1 | `POST` | `/api/v1/two-factor/setup` | ClerkAuthGuard | 10 req / 1 min | L59-70 | Generate TOTP secret + QR + backup codes |
| 2 | `POST` | `/api/v1/two-factor/verify` | ClerkAuthGuard | 5 req / 1 min | L72-88 | Verify TOTP code and enable 2FA |
| 3 | `POST` | `/api/v1/two-factor/validate` | ClerkAuthGuard | 5 req / 5 min | L90-99 | Validate TOTP code (login flow) |
| 4 | `DELETE` | `/api/v1/two-factor/disable` | ClerkAuthGuard | 5 req / 1 min | L101-114 | Disable 2FA with confirmation code |
| 5 | `GET` | `/api/v1/two-factor/status` | ClerkAuthGuard | default | L116-124 | Check if 2FA is enabled |
| 6 | `POST` | `/api/v1/two-factor/backup` | ClerkAuthGuard | 5 req / 5 min | L126-139 | Use a backup code |

**DTOs defined inline (L19-52):**

| DTO | Fields | Validation |
|-----|--------|-----------|
| `SetupResponseDto` | secret (string), qrDataUri (string), backupCodes (string[]) | Swagger only |
| `VerifyDto` | code (string) | `@Length(6, 6)`, `@IsNotEmpty()` |
| `DisableDto` | code (string) | `@Length(6, 6)`, `@IsNotEmpty()` |
| `VerifyBackupDto` | backupCode (string) | `@Length(10, 10)`, `@IsNotEmpty()` |

**Endpoint Details:**

**1. POST /two-factor/setup (L59-70)**
- Returns `SetupResponseDto { secret, qrDataUri, backupCodes }`
- HTTP 201 Created
- Throws 400 if already enabled, 404 if user not found

**2. POST /two-factor/verify (L72-88)**
- Body: `{ code: "123456" }`
- If invalid: throws `BadRequestException('Invalid verification code')`
- If valid: returns `{ success: true, message: 'Two-factor authentication enabled' }`

**3. POST /two-factor/validate (L90-99)**
- Body: `{ code: "123456" }`
- Stricter rate limit: 5 req / 5 min (vs 1 min for others)
- Returns `{ valid: boolean }`
- If 2FA not enabled, returns `{ valid: true }` (pass-through)

**4. DELETE /two-factor/disable (L101-114)**
- Body: `{ code: "123456" }` (confirmation required)
- Throws 400 if invalid code or not enabled
- Returns `{ success: true, message: 'Two-factor authentication disabled' }`

**5. GET /two-factor/status (L116-124)**
- Returns `{ isEnabled: boolean }`

**6. POST /two-factor/backup (L126-139)**
- Body: `{ backupCode: "ABCDEF1234" }` (10-char)
- Stricter rate limit: 5 req / 5 min
- Throws 400 if invalid backup code
- Returns `{ success: true, message: 'Backup code accepted' }`

### 4.2 TwoFactorService Methods

**File:** `apps/api/src/modules/two-factor/two-factor.service.ts` (402 lines)

**Constructor (L130-141):**
- Injects: `PrismaService`, `ConfigService`
- Reads `TOTP_ENCRYPTION_KEY` from config
- Logs warning if not set (secrets stored unencrypted)

**Public Methods:**

**`setup(userId: string)` (L147-201)**
1. Verifies user exists (throws NotFoundException)
2. Checks for existing TwoFactorSecret record
3. If already enabled: throws BadRequestException
4. Generates 20-byte TOTP secret via `generateTotpSecret(20)`
5. Generates 8 backup codes via `generateBackupCodes(8)`
6. Hashes backup codes with salted HMAC-SHA256 via `hashBackupCode()`
7. Encrypts TOTP secret via `encryptSecret()` (AES-256-GCM)
8. Creates or updates TwoFactorSecret record (isEnabled: false, verifiedAt: null)
9. Generates QR code data URI via `qrcode.toDataURL(otpauth_uri)`
10. Returns: `{ secret (plaintext), qrDataUri, backupCodes (plaintext) }`

**`verify(userId: string, code: string): Promise<boolean>` (L206-234)**
1. Finds TwoFactorSecret record
2. Throws if not set up or already enabled
3. Decrypts stored secret via `decryptSecret()`
4. Validates TOTP code via `verifyTotp()` (window = 1)
5. If valid: updates record to `isEnabled: true, verifiedAt: new Date()`
6. Returns boolean

**`validate(userId: string, code: string): Promise<boolean>` (L248-259)**
- For login flow / non-strict validation
- If no 2FA record or not enabled: returns `true` (pass-through)
- Otherwise: decrypts and verifies TOTP
- NOTE: Contains TODO about disconnection from Clerk login flow (L241-246)

**`validateStrict(userId: string, code: string): Promise<boolean>` (L265-274)**
- For sensitive operations that REQUIRE 2FA
- If no 2FA record or not enabled: returns `false`
- Otherwise: decrypts and verifies TOTP

**`disable(userId: string, code: string): Promise<void>` (L293-317)**
1. Finds TwoFactorSecret record
2. Throws if not set up or not enabled
3. Verifies confirmation code via `verifyToken()`
4. Updates: `isEnabled: false, verifiedAt: null`

**`getStatus(userId: string): Promise<boolean>` (L322-327)**
- Returns `secretRecord?.isEnabled ?? false`

**`useBackupCode(userId: string, backupCode: string): Promise<boolean>` (L332-360)**
1. Finds TwoFactorSecret record
2. Throws if not enabled
3. Searches stored backup codes using `verifyBackupCode()` (supports both salted HMAC and legacy SHA-256)
4. If found: removes used code from array (splice), updates record
5. Returns boolean

**Private Methods:**

**`generateBackupCodes(count: number): string[]` (L367-375)**
- Generates `count` codes (default 8)
- Each code: `randomBytes(8).toString('base64url').slice(0, 10).toUpperCase()`
- Entropy: 36^10 = 3.6 * 10^15 combinations (alphanumeric)
- Much stronger than hex-only (16^10 = 1.1 * 10^12)

**`hashBackupCode(backupCode: string): string` (L382-386)**
- Generates 16-byte random salt: `randomBytes(16).toString('hex')`
- Computes HMAC-SHA256 with salt as key: `createHmac('sha256', salt).update(code).digest('hex')`
- Returns format: `{salt}:{hmac}` (both hex strings)

**`verifyBackupCode(backupCode: string, storedHash: string): boolean` (L392-401)**
- Detects format by checking for `:` separator
- **New format (salted HMAC):** splits `salt:hmac`, recomputes HMAC, compares
- **Legacy format (unsalted SHA-256):** computes `SHA-256(code)`, compares directly
- Backward compatible during migration period

**`verifyToken(userId: string, code: string): Promise<boolean>` (L279-288)**
- Internal helper for disable confirmation
- Decrypts and verifies TOTP without state changes

### 4.3 Native TOTP Implementation

**Lines 12-81 in two-factor.service.ts** -- No dependency on `otplib`.

**`base32Encode(buffer: Buffer): string` (L16-32)**
- Standard RFC 4648 Base32 encoding
- Uses charset: `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567`

**`base32Decode(encoded: string): Buffer` (L34-50)**
- Strips trailing `=` padding, uppercases
- Skips invalid characters

**`generateTotpSecret(length = 20): string` (L52-54)**
- Generates `length` random bytes, base32 encodes
- Default 20 bytes = 160 bits of entropy

**`generateTotpCode(secret: string, timeStep = 30, digits = 6): string` (L56-65)**
- RFC 6238 TOTP algorithm:
  1. `time = floor(Date.now() / 1000 / timeStep)`
  2. Writes time as 8-byte big-endian buffer
  3. Computes HMAC-SHA1 of time buffer with decoded secret
  4. Dynamic truncation: offset from last nibble, extracts 4-byte code
  5. Modulo 10^digits, zero-padded

**`verifyTotp(token: string, secret: string, window = 1): boolean` (L67-81)**
- Checks token against `window` steps in both directions (default: -1, 0, +1 = 3 checks)
- Same HMAC-SHA1 computation as generateTotpCode but iterates time +/- window
- Returns true on first match

**`buildOtpauthUri(issuer, label, secret): string` (L83-85)**
- Standard otpauth:// URI format
- Parameters: issuer=Mizanly, algorithm=SHA1, digits=6, period=30

### 4.4 AES-256-GCM Secret Encryption

**Lines 87-123 in two-factor.service.ts**

**`encryptSecret(plaintext: string, encryptionKey: string | undefined): string` (L89-101)**
- If no encryption key: returns `plain:{plaintext}` (tagged for identification)
- Key: `Buffer.from(encryptionKey, 'hex')` -- expects 32-byte hex string (256 bits)
- IV: `randomBytes(12)` -- 96-bit nonce for GCM
- Cipher: `createCipheriv('aes-256-gcm', key, iv)`
- Auth tag: `cipher.getAuthTag()` -- 16-byte authentication tag
- Output format: `enc:{iv_hex}:{authTag_hex}:{ciphertext_hex}`

**`decryptSecret(stored: string, encryptionKey: string | undefined): string` (L103-123)**
- If starts with `plain:`: strips prefix, returns plaintext
- If doesn't start with `enc:`: returns as-is (legacy unencrypted)
- If starts with `enc:` but no key: throws BadRequestException
- Parses `enc:iv:authTag:ciphertext` format
- Creates `createDecipheriv('aes-256-gcm', key, iv)`, sets auth tag
- Decrypts and returns plaintext

**Three storage formats (backward compatible):**
1. `enc:iv:authTag:ciphertext` -- AES-256-GCM encrypted (current)
2. `plain:secret` -- Tagged unencrypted (when TOTP_ENCRYPTION_KEY not set)
3. Raw base32 string -- Legacy (pre-encryption, auto-detected)

### 4.5 Backup Code System

**Generation:**
- 8 codes per user
- 10-character alphanumeric (base64url-derived, uppercased)
- Entropy per code: ~59 bits (randomBytes(8) = 64 bits, truncated to 10 chars)

**Storage:**
- Hashed with per-code random salt (16 bytes)
- Format: `{salt_hex}:{hmac_hex}`
- Algorithm: HMAC-SHA256 with salt as key

**Verification:**
- Supports both salted HMAC (new) and plain SHA-256 (legacy)
- Used backup codes are removed from array (one-time use)

**Security properties:**
- Each code has its own salt (rainbow table resistant)
- HMAC-SHA256 provides 256-bit security
- Plaintext codes shown once during setup (never stored)

### 4.6 2FA Flow (End-to-End)

```
Mobile App                                  Backend API
    |                                           |
    |-- POST /two-factor/setup (JWT) ---------->|
    |                                           |-- generate 20-byte TOTP secret
    |                                           |-- generate 8 backup codes
    |                                           |-- hash backup codes (HMAC-SHA256+salt)
    |                                           |-- encrypt secret (AES-256-GCM)
    |                                           |-- store TwoFactorSecret (isEnabled=false)
    |                                           |-- generate QR code data URI
    |<-- { secret, qrDataUri, backupCodes } ----|
    |                                           |
    | (user scans QR in authenticator app)      |
    |                                           |
    |-- POST /two-factor/verify (JWT + code) -->|
    |                                           |-- decrypt stored secret
    |                                           |-- verify TOTP (window=1)
    |                                           |-- set isEnabled=true, verifiedAt=now
    |<-- { success: true } ---------------------|
    |                                           |
    | === 2FA is now active ===                 |
    |                                           |
    | (on sensitive operation or login check)   |
    |-- POST /two-factor/validate (JWT+code) -->|
    |                                           |-- if no 2FA: return true (pass-through)
    |                                           |-- decrypt + verify TOTP
    |<-- { valid: true/false } -----------------|
    |                                           |
    | (lost authenticator -- use backup code)   |
    |-- POST /two-factor/backup (JWT+code) ---->|
    |                                           |-- verify against stored hashes
    |                                           |-- remove used code from array
    |<-- { success: true } ---------------------|
    |                                           |
    | (disable 2FA)                             |
    |-- DELETE /two-factor/disable (JWT+code) ->|
    |                                           |-- verify confirmation code
    |                                           |-- set isEnabled=false, verifiedAt=null
    |<-- { success: true } ---------------------|
```

---

## 5. Devices Module

**File:** `apps/api/src/modules/devices/devices.module.ts` (10 lines)

```
Module: DevicesModule
  Controllers: [DevicesController]
  Providers: [DevicesService]
  Exports: [DevicesService]
```

### 5.1 DevicesController Endpoints

**File:** `apps/api/src/modules/devices/devices.controller.ts` (68 lines)

All endpoints require `ClerkAuthGuard` (class-level decorator). Module-level rate limit: 60 req / 1 min.

| # | Method | Route | Line | Description |
|---|--------|-------|------|-------------|
| 1 | `POST` | `/api/v1/devices` | L27-34 | Register push notification token |
| 2 | `DELETE` | `/api/v1/devices/:token` | L36-43 | Unregister push notification token |
| 3 | `GET` | `/api/v1/devices/sessions` | L45-48 | List active device sessions |
| 4 | `DELETE` | `/api/v1/devices/sessions/:id` | L50-57 | Log out a specific device session |
| 5 | `DELETE` | `/api/v1/devices/sessions` | L59-67 | Log out all other device sessions |

**DTOs defined inline (L9-17):**

**`RegisterDeviceDto`:**
| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `pushToken` | string | `/^ExponentPushToken\[.+\]$\|^[a-zA-Z0-9:_-]{20,}$/` | Expo push token or FCM/APNs token |
| `platform` | string | enum: `ios`, `android`, `web` | Device platform |
| `deviceId` | string? | optional | Device fingerprint |

**`LogoutSessionDto`:**
| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `currentSessionId` | string | max 100 chars | Current session to keep active |

### 5.2 DevicesService Methods

**File:** `apps/api/src/modules/devices/devices.service.ts` (140 lines)

**Constructor (L6-8):**
- Injects: `PrismaService`

**Public Methods:**

**`register(userId, pushToken, platform, deviceId?)` (L10-26)**
1. Checks if pushToken already registered to another active user
2. If so: deactivates the old record (`isActive: false`)
3. Upserts device by pushToken:
   - Create: userId, pushToken, platform, deviceId, isActive=true
   - Update: userId, platform, deviceId, isActive=true, updatedAt=now

**`unregister(pushToken, userId)` (L28-33)**
- `updateMany` matching pushToken+userId: sets `isActive: false`
- Uses `updateMany` (not delete) to soft-deactivate

**`getActiveTokensForUser(userId): Promise<string[]>` (L35-42)**
- Queries active devices for a single user
- Max 50 tokens returned
- Used by notification system to send push notifications

**`getActiveTokensForUsers(userIds): Promise<string[]>` (L44-51)**
- Queries active devices for multiple users (batch)
- Max 50 tokens returned
- Used for broadcast notifications

**`getSessions(userId)` (L56-72)**
- Returns active devices with session metadata
- Selected fields: id, platform, deviceName, os, ipAddress, location, lastActiveAt, createdAt
- Ordered by lastActiveAt desc, max 20 sessions

**`logoutSession(sessionId, userId)` (L77-83)**
- Deactivates specific device by id + userId (ownership check)
- Returns `{ loggedOut: true }`

**`logoutAllOtherSessions(userId, currentSessionId)` (L88-94)**
- Deactivates all active devices EXCEPT the one with `currentSessionId`
- Uses `id: { not: currentSessionId }` filter
- Returns `{ loggedOut: true }`

**`touchSession(deviceId, ipAddress?)` (L99-112)**
- Updates `lastActiveAt` and optionally `ipAddress`
- Silent failure (try/catch, no throw) -- device may not exist
- Called on API requests to track activity

**`cleanupStaleTokens(olderThanDays = 90): Promise<number>` (L118-139)**
- Deletes INACTIVE devices not updated in `olderThanDays`
- Filter: `isActive: false AND updatedAt < cutoff`
- Logs count of cleaned tokens
- Returns count (0 on error)

### 5.3 Device Session Management Flow

```
Mobile App                                  Backend API
    |                                           |
    | (after login / app foreground)            |
    |-- POST /devices (JWT + pushToken) ------->|
    |                                           |-- check if token belongs to other user
    |                                           |-- if so, deactivate their record
    |                                           |-- upsert device (active=true)
    |<-- device record -------------------------|
    |                                           |
    | (view active sessions)                    |
    |-- GET /devices/sessions (JWT) ----------->|
    |<-- [ { id, platform, os, ip, ... } ] -----|
    |                                           |
    | (remote logout specific device)           |
    |-- DELETE /devices/sessions/:id (JWT) ---->|
    |                                           |-- deactivate by id + userId check
    |<-- { loggedOut: true } -------------------|
    |                                           |
    | (logout all other devices)                |
    |-- DELETE /devices/sessions (JWT + body) ->|
    |                                           |-- deactivate all except current
    |<-- { loggedOut: true } -------------------|
    |                                           |
    | (on logout)                               |
    |-- DELETE /devices/:token (JWT) ---------->|
    |                                           |-- soft-deactivate by token + userId
    |<-- (204) ---------------------------------|
```

**Device limit enforcement:**
- The 5-device limit is enforced at REGISTRATION time (in `auth.service.ts` L64-71), not in the devices module
- It uses Redis key `device_accounts:{deviceId}` as a permanent counter
- The devices module itself has no limit on number of active sessions per user (capped at 20 in query)

---

## 6. Encryption Module (E2E)

**File:** `apps/api/src/modules/encryption/encryption.module.ts` (10 lines)

```
Module: EncryptionModule
  Controllers: [EncryptionController]
  Providers: [EncryptionService]
  Exports: [EncryptionService]
```

### 6.1 EncryptionController Endpoints

**File:** `apps/api/src/modules/encryption/encryption.controller.ts` (149 lines)

All endpoints require `ClerkAuthGuard` (class-level). Module-level rate limit: 60 req / 1 min.

| # | Method | Route | Line | Description |
|---|--------|-------|------|-------------|
| 1 | `POST` | `/api/v1/encryption/keys` | L76-83 | Register or update encryption public key |
| 2 | `GET` | `/api/v1/encryption/keys/bulk` | L85-90 | Get public keys for multiple users (max 50) |
| 3 | `GET` | `/api/v1/encryption/keys/:userId` | L92-96 | Get public key for a specific user |
| 4 | `POST` | `/api/v1/encryption/envelopes` | L98-110 | Store encrypted key envelope for conversation member |
| 5 | `GET` | `/api/v1/encryption/envelopes/:conversationId` | L112-119 | Get latest key envelope for a conversation |
| 6 | `POST` | `/api/v1/encryption/rotate/:conversationId` | L121-129 | Rotate conversation encryption key |
| 7 | `GET` | `/api/v1/encryption/safety-number/:otherUserId` | L131-139 | Compute safety number between two users |
| 8 | `GET` | `/api/v1/encryption/status/:conversationId` | L141-148 | Check encryption status for conversation |

**DTOs defined inline (L18-66):**

**`RegisterKeyDto`:**
| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `publicKey` | string | min 32, max 2048 chars, `/^[A-Za-z0-9+/=]+$/` (base64) | Client's public key |

**`StoreEnvelopeDto`:**
| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `conversationId` | string | required | Target conversation |
| `recipientId` | string | required | Recipient user ID |
| `encryptedKey` | string | required | Encrypted symmetric key (base64) |
| `nonce` | string | required | Nonce used for encryption (base64) |

**`RotateEnvelopeItemDto`:**
| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `userId` | string | required | User ID for this envelope |
| `encryptedKey` | string | required | Encrypted symmetric key |
| `nonce` | string | required | Nonce |

**`RotateKeyDto`:**
| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `envelopes` | RotateEnvelopeItemDto[] | min 1 item, `@ValidateNested` | Envelopes for all members |

### 6.2 EncryptionService Methods

**File:** `apps/api/src/modules/encryption/encryption.service.ts` (326 lines)

**Constructor (L30):**
- Injects: `PrismaService`

**Public Methods:**

**`registerKey(userId, publicKey)` (L32-60)**
1. Validates publicKey length >= 32
2. Computes fingerprint: `SHA-256(base64Decode(publicKey)).hex.slice(0, 32)` -- 128-bit fingerprint
3. Checks if existing key has different fingerprint (key change detection)
4. Upserts `EncryptionKey` record (userId, publicKey, keyFingerprint)
5. If key changed: calls `notifyKeyChange(userId)` to alert conversation partners

**`computeSafetyNumber(userIdA, userIdB): Promise<string | null>` (L74-109)**
1. Fetches encryption keys for both users
2. Returns null if either user lacks a key
3. Sorts userIds alphabetically for deterministic ordering
4. Concatenates fingerprints: `fpA + fpB`
5. Hashes with SHA-256
6. Converts hex to decimal digits (each hex char -> its decimal value)
7. Takes first 60 digits, formats as 12 groups of 5 digits separated by spaces
8. Example output: `01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789`

**`getConversationEncryptionStatus(conversationId, requestingUserId?)` (L115-147)**
1. Fetches all conversation members (max 50)
2. Verifies requesting user is a member (throws ForbiddenException if not)
3. Checks which members have registered encryption keys
4. Returns: `{ encrypted: boolean (all have keys), members: [{ userId, hasKey }] }`

**`getPublicKey(userId)` (L189-201)**
- Finds key by userId
- Throws NotFoundException if not found
- Returns: `{ userId, publicKey, fingerprint }`

**`getBulkKeys(userIds)` (L203-221)**
- Fetches keys for up to 50 users
- Returns array of `{ userId, publicKey, fingerprint }`

**`storeEnvelope(senderId, data)` (L229-262)**
1. Verifies sender is member of conversation (composite key lookup)
2. Throws ForbiddenException if not a member
3. Gets current max version for conversation+recipient
4. Creates new envelope with version = max + 1
5. NOTE: Has race condition TODO (L224-228) -- concurrent calls could create duplicate versions

**`getEnvelope(conversationId, userId)` (L264-277)**
- Finds latest envelope (highest version) for conversation+user
- Returns: `{ conversationId, encryptedKey, nonce, version }` or null

**`rotateKey(conversationId, userId, envelopes)` (L279-325)**
1. Verifies caller is conversation member
2. Uses `$transaction` for atomicity:
   - Gets current max version
   - Creates new envelopes for ALL members at `newVersion = max + 1`
3. Handles P2002 (unique constraint violation) with ConflictException ("Key rotation conflict -- please retry")
4. Returns: `{ version, envelopeCount }`

**Private Methods:**

**`notifyKeyChange(userId)` (L153-187)**
1. Fetches user's displayName/username
2. Finds all conversations user is in (max 50)
3. Creates system message in each conversation:
   ```json
   {
     "type": "SECURITY_CODE_CHANGED",
     "params": { "username": "display_name" }
   }
   ```
4. MessageType: `SYSTEM`
5. Silent failure (try/catch, logs error)

### 6.3 Key Exchange & Envelope Protocol

The E2E encryption follows a server-assisted key exchange model:

```
User A                           Server                          User B
  |                                |                                |
  |-- POST /encryption/keys ------>|                                |
  |   (register public key)        |-- store EncryptionKey          |
  |                                |                                |
  |                                |<-- POST /encryption/keys ------|
  |                                |   (register public key)        |
  |                                |                                |
  | (starting encrypted conversation)                               |
  |                                |                                |
  |-- GET /encryption/keys/:B ---->|                                |
  |<-- { publicKey, fingerprint } -|                                |
  |                                |                                |
  | (encrypt symmetric key with B's public key)                     |
  |                                |                                |
  |-- POST /encryption/envelopes ->|                                |
  |   { conversationId, recipientId: B, encryptedKey, nonce }       |
  |                                |-- store ConversationKeyEnvelope|
  |                                |                                |
  |                                |<-- GET /envelopes/:convId -----|
  |                                |-- return latest envelope ------>|
  |                                |   { encryptedKey, nonce, ver } |
  |                                |                                |
  | (key rotation -- member left or periodic)                       |
  |                                |                                |
  |-- POST /encryption/rotate/:id >|                                |
  |   { envelopes: [{ userId: A, ...}, { userId: B, ... }] }       |
  |                                |-- $transaction: create new     |
  |                                |   envelopes for all members    |
  |                                |   at version = max + 1         |
  |<-- { version, envelopeCount } -|                                |
  |                                |                                |
  | (verify identity)              |                                |
  |-- GET /safety-number/:B ------>|                                |
  |<-- "01234 56789 01234..." -----|                                |
```

**Envelope versioning:**
- Each conversation member gets one envelope per version
- Unique constraint: `(conversationId, userId, version)`
- `getEnvelope()` always returns the latest version
- `rotateKey()` uses DB transaction to atomically create all member envelopes

### 6.4 Safety Number Computation

**Algorithm (L74-109):**
1. Fetch fingerprints for both users
2. Sort userIds alphabetically
3. Concatenate sorted fingerprints: `fpA + fpB`
4. Hash: `SHA-256(concatenated)`
5. Convert hex to decimal: each hex char -> its decimal representation (0-15)
6. Take 60 digits, group into 12 x 5-digit blocks

**Known weakness (documented at L67-72):**
- Hex-to-decimal conversion loses entropy (each hex char maps to 1-2 decimal digits)
- Should use Signal Protocol's NumericFingerprint approach:
  - `HMAC-SHA256(version || fp_a || fp_b)` -> 30 bytes -> 60 decimal digits
  - Each 5-byte chunk -> decimal mod 100000 -> 5 digits
  - This would provide proper 256-bit security level

---

## 7. Common Auth Infrastructure

### 7.1 ClerkAuthGuard

**File:** `apps/api/src/common/guards/clerk-auth.guard.ts` (79 lines)

**`canActivate(context: ExecutionContext): Promise<boolean>`**

1. Extracts Bearer token from `Authorization` header (L75-78)
2. Throws `UnauthorizedException('No authorization token provided')` if missing
3. Verifies token via `@clerk/backend.verifyToken(token, { secretKey })` (L29-31)
4. Throws `UnauthorizedException('Invalid token')` on verification failure
5. Queries user from DB by `clerkId` (= JWT `sub` claim) with selected fields:
   - `id, clerkId, username, displayName, isBanned, isDeactivated, isDeleted, banExpiresAt`
6. Throws `UnauthorizedException('User not found')` if no DB record
7. **Ban handling (L55-65):**
   - If `isBanned` and `banExpiresAt` has passed: auto-unbans (updates DB)
   - If `isBanned` and not expired: throws `ForbiddenException('Account has been banned')`
8. If `isDeactivated` or `isDeleted`: throws `ForbiddenException('Account has been deactivated')`
9. Attaches user object to `request.user`

### 7.2 OptionalClerkAuthGuard

**File:** `apps/api/src/common/guards/optional-clerk-auth.guard.ts` (61 lines)

- Like ClerkAuthGuard but NEVER throws
- Returns `true` always (allows unauthenticated access)
- If valid token present: attaches `request.user` (excluding banned/deactivated/deleted)
- If invalid/expired token: silently ignores
- Logs warning for expired tokens (helps debug client-side token refresh)
- Used on public endpoints that show personalized data when authenticated

### 7.3 CurrentUser Decorator

**File:** `apps/api/src/common/decorators/current-user.decorator.ts` (25 lines)

- `@CurrentUser()` -- returns full user object from `request.user`
- `@CurrentUser('id')` -- returns `request.user.id`
- `@CurrentUser('clerkId')` -- returns `request.user.clerkId`
- Logs warning if user is undefined on a guarded route (catches wiring bugs)

### 7.4 AnalyticsService

**File:** `apps/api/src/common/services/analytics.service.ts` (113 lines)

Used by AuthService for registration tracking:

- **`track(event, userId?, properties?)`** -- buffers events, auto-flushes at 100 events or every 10s
- **`increment(counterName, amount?)`** -- Redis INCRBY with 24-hour TTL
- Events stored in Redis list `analytics:events` (max 100K, FIFO)
- Counters stored at `analytics:counter:{name}`
- Flush uses Redis pipeline for efficiency
- Failed flushes put events back in buffer for retry

---

## 8. Prisma Schema Models

### TwoFactorSecret (L2760-2776)

```prisma
model TwoFactorSecret {
  id              String    @id @default(cuid())
  userId          String    @unique
  user            User      @relation(...)
  secret          String                          // AES-256-GCM encrypted or plain
  encryptedSecret String?                         // TODO: migration column
  isEnabled       Boolean   @default(false)
  backupCodes     String[]  @default([])          // HMAC-SHA256 hashed
  backupSalt      String?                         // TODO: migration salt
  verifiedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("two_factor_secrets")
}
```

### Device (L2303-2322)

```prisma
model Device {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(...)
  platform     String                             // ios | android | web
  pushToken    String   @unique
  deviceId     String?                            // device fingerprint
  deviceName   String?
  os           String?
  ipAddress    String?
  location     String?
  lastActiveAt DateTime @default(now())
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId])
  @@index([userId, lastActiveAt(sort: Desc)])
  @@map("devices")
}
```

### EncryptionKey (L2855-2865)

```prisma
model EncryptionKey {
  id             String   @id @default(cuid())
  userId         String   @unique
  user           User     @relation("encryptionKey", ...)
  publicKey      String                           // base64-encoded
  keyFingerprint String                           // SHA-256 truncated to 32 hex chars
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@map("encryption_keys")
}
```

### ConversationKeyEnvelope (L2867-2886)

```prisma
model ConversationKeyEnvelope {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation("keyEnvelopes", ...)
  userId         String
  user           User         @relation("conversationKeyEnvelopes", ...)
  encryptedKey   String                           // base64
  nonce          String                           // base64
  version        Int          @default(1)
  createdAt      DateTime     @default(now())

  @@unique([conversationId, userId, version])     // race condition prevention
  @@index([conversationId])
  @@index([userId])
  @@map("conversation_key_envelopes")
}
```

### UserInterest (L2252-2261)

```prisma
model UserInterest {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(...)
  category  String                                // one of 12 valid categories
  createdAt DateTime @default(now())

  @@unique([userId, category])
  @@index([userId])
  @@map("user_interests")
}
```

### UserSettings (L2511-2536+)

```prisma
model UserSettings {
  id                     String   @id @default(cuid())
  userId                 String   @unique
  user                   User     @relation(...)
  // Privacy
  messagePermission      String   @default("everyone")
  mentionPermission      String   @default("everyone")
  activityStatus         Boolean  @default(true)
  readReceipts           Boolean  @default(true)
  typingIndicators       Boolean  @default(true)
  lastSeenVisibility     String   @default("everyone")
  // Notifications
  notifyLikes            Boolean  @default(true)
  notifyComments         Boolean  @default(true)
  notifyFollows          Boolean  @default(true)
  notifyMentions         Boolean  @default(true)
  notifyMessages         Boolean  @default(true)
  notifyLiveStreams       Boolean  @default(true)
  emailDigest            Boolean  @default(false)
  // Accessibility
  reducedMotion          Boolean  @default(false)
  largeText              Boolean  @default(false)
  highContrast           Boolean  @default(false)
  // Wellbeing
  dailyTimeLimit         Int?
  restrictedMode         Boolean  @default(false)
  // ... (additional fields beyond line 2536)
}
```

---

## 9. Security Measures Summary

### Authentication

| Measure | Implementation | Location |
|---------|---------------|----------|
| JWT verification | `@clerk/backend.verifyToken()` | `clerk-auth.guard.ts:29` |
| Ban enforcement | Auto-unban on expiry, ForbiddenException for active bans | `clerk-auth.guard.ts:55-65` |
| Account state check | Deactivated/deleted users blocked | `clerk-auth.guard.ts:67-69` |
| Optional auth | Never throws, attaches user if valid token | `optional-clerk-auth.guard.ts:21-55` |

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /auth/register | 5 requests | 5 minutes |
| GET /auth/me | 10 requests | 1 minute |
| GET /auth/check-username | 10 requests | 1 minute |
| POST /webhooks/clerk | 50 requests | 1 minute |
| POST /two-factor/setup | 10 requests | 1 minute |
| POST /two-factor/verify | 5 requests | 1 minute |
| POST /two-factor/validate | 5 requests | 5 minutes |
| DELETE /two-factor/disable | 5 requests | 1 minute |
| POST /two-factor/backup | 5 requests | 5 minutes |
| All /devices/* | 60 requests | 1 minute |
| All /encryption/* | 60 requests | 1 minute |

Additionally, the register endpoint has a Redis-based rate limit: 5 attempts per clerkId per 15 minutes (L57-62 of auth.service.ts).

### Encryption & Hashing

| Secret Type | Algorithm | Details |
|------------|-----------|---------|
| TOTP secrets at rest | AES-256-GCM | 96-bit IV, 128-bit auth tag, hex-encoded |
| Backup codes | HMAC-SHA256 + random salt | 16-byte salt per code |
| Legacy backup codes | SHA-256 (unsalted) | Backward compatible |
| Key fingerprints | SHA-256 truncated | 32 hex chars (128 bits) |
| Safety numbers | SHA-256 of concatenated fingerprints | 60 decimal digits |
| Random usernames | crypto.randomBytes(4) | Hex-encoded suffix |
| Backup code generation | crypto.randomBytes(8) | base64url, truncated to 10 chars |

### Abuse Prevention

| Measure | Implementation | Location |
|---------|---------------|----------|
| Device fingerprint limit | 5 accounts per physical device (permanent Redis counter) | `auth.service.ts:64-71` |
| Registration rate limit | 5 attempts per clerkId per 15 min (Redis) | `auth.service.ts:57-62` |
| Webhook idempotency | svix-id deduplication in Redis (24h TTL) | `webhooks.controller.ts:101-111` |
| Webhook signature verification | svix HMAC verification | `webhooks.controller.ts:87-99` |
| Push token hijacking prevention | Deactivate old user's token on re-registration | `devices.service.ts:12-19` |
| COPPA/GDPR age verification | Minimum age 13, child account flag for < 18 | `auth.service.ts:73-79` |
| Terms acceptance | Required boolean field | `auth.service.ts:81-86` |
| Username format enforcement | 3-30 chars, alphanumeric + dots + underscores | Controller L48 + DTO validation |

---

## 10. Known Issues & TODOs

### Critical/Architectural

1. **2FA disconnected from Clerk login flow (TODO F16, two-factor.service.ts L241-246)**
   - Clerk handles authentication externally and issues JWTs
   - App-level TOTP is not enforced at login
   - Requires Clerk custom session claims or metadata integration
   - `validate()` returns `true` when 2FA not enabled (pass-through)

2. **storeEnvelope race condition (TODO F22, encryption.service.ts L224-228)**
   - Two concurrent calls can read the same max version
   - Could create duplicate version numbers (unique constraint will catch as P2002 but not handled)
   - Fix: use `$transaction` with serializable isolation like `rotateKey()`, or use DB sequence

3. **Safety number weakness (TODO F20, encryption.service.ts L67-72)**
   - Hex-to-decimal conversion loses entropy
   - Should use Signal Protocol's NumericFingerprint approach for 256-bit security

4. **Missing Clerk webhook events (TODO, auth.service.ts L286-292)**
   - `session.created` -- not tracking login events for 2FA enforcement
   - `session.revoked` -- not cleaning up active sessions
   - `organization.*` -- not syncing with community/circle features

### Schema Migration Pending

5. **TwoFactorSecret dual column (schema.prisma L2765-2770)**
   - `secret` column stores encrypted value in current format
   - `encryptedSecret` column exists but unused (for future migration)
   - `backupSalt` column exists but unused (each code has individual salt in hash string)
   - TODO: migrate existing plaintext secrets to encrypted column

6. **Missing legal fields (auth.service.ts L122-127)**
   - No `tosAcceptedAt`, `tosVersion`, `privacyPolicyAcceptedAt`, `dateOfBirth` columns on User model
   - Currently storing acceptance via DTO validation + `isChildAccount` flag only
   - Needed for: demonstrable GDPR consent record, ToS version tracking, age-based feature gating

### Operational

7. **Clerk uses TEST keys** -- `sk_test_` must be switched to `sk_live_` before production
8. **Device cleanup not scheduled** -- `cleanupStaleTokens()` exists but no cron job triggers it
9. **No device name/OS/location collection** -- Schema fields exist on Device model but not populated during registration
10. **Analytics events not consumed** -- Events buffered in Redis but no worker flushes to persistent storage

### Test Coverage

| File | Tests | Key Coverage |
|------|-------|-------------|
| `auth.controller.spec.ts` | Controller tests | Endpoint wiring |
| `auth.service.spec.ts` | 12 tests | register (6 cases), syncClerkUser (2), deactivateByClerkId (2), checkUsername (2), getMe (4), setInterests (1), getSuggestedUsers (2) |
| `webhooks.controller.spec.ts` | 6 tests | user.created, user.updated, user.deleted, invalid signature, missing secret, missing rawBody |
| `webhooks.controller.type.spec.ts` | Type checking tests | Event type handling |
| `two-factor.controller.spec.ts` | Controller tests | Endpoint wiring |
| `two-factor.service.spec.ts` | Service tests | TOTP, backup codes, encryption |
| `two-factor.service.edge.spec.ts` | Edge case tests | Legacy format compatibility |
| `devices.controller.spec.ts` | Controller tests | Endpoint wiring |
| `devices.service.spec.ts` | Service tests | CRUD, session management |
| `devices.service.auth.spec.ts` | Auth integration tests | Token conflict resolution |
| `encryption.controller.spec.ts` | Controller tests | Endpoint wiring |
| `encryption.service.spec.ts` | Service tests | Key registration, envelopes, rotation |
| `encryption.service.edge.spec.ts` | Edge case tests | Safety number edge cases |
