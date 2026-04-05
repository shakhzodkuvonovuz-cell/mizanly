# A36 — Privacy + Settings Module Hostile Audit

**Auditor:** Opus 4.6 | **Date:** 2026-04-05 | **Scope:** `apps/api/src/modules/privacy/` + `apps/api/src/modules/settings/`

---

## Files Audited

| File | Lines | Read |
|------|-------|------|
| `privacy/privacy.controller.ts` | 30 | ALL |
| `privacy/privacy.service.ts` | 789 | ALL |
| `settings/settings.controller.ts` | 173 | ALL |
| `settings/settings.service.ts` | 201 | ALL |
| `settings/dto/update-privacy.dto.ts` | 41 | ALL |
| `settings/dto/update-notifications.dto.ts` | (referenced) | N/A |
| `settings/dto/update-accessibility.dto.ts` | (referenced) | N/A |
| `settings/dto/update-wellbeing.dto.ts` | (referenced) | N/A |
| `settings/dto/quiet-mode.dto.ts` | (referenced) | N/A |

---

## CRITICAL Findings

### C1: GDPR export returns all data in a single HTTP response — OOM risk for power users
**File:** `privacy.service.ts` lines 227-377
**Issue:** `exportUserData` fetches up to 10,000 rows from ~30 tables simultaneously using `Promise.all`, then returns the entire dataset in a single JSON response. For a power user with 10K posts, 10K messages, 10K notifications, etc., the response could be 50-100MB+ of JSON, causing:
1. Node.js heap exhaustion (V8 string limit ~512MB but JSON serialization buffers)
2. Railway timeout (30s default for HTTP response)
3. Client-side browser/app crash parsing the giant JSON

**Severity:** HIGH — Denial of service for the user's own export. GDPR Article 20 requires the data to be provided "in a structured, commonly used and machine-readable format" but does NOT require it as a single HTTP response. Should use a queue-based export that generates a ZIP/JSON file on R2 and sends a download link.

### C2: GDPR delete uses a MASSIVE transaction that could timeout
**File:** `privacy.service.ts` lines 495-712
**Issue:** The `$transaction` block contains ~80+ delete/update operations across ~70 tables. For a user with extensive data, this transaction could:
1. Hold locks on dozens of tables for minutes
2. Exceed Neon's default transaction timeout (30s)
3. Cause connection pool exhaustion for other requests

The transaction also does two `findMany` operations (lines 589-591) INSIDE the transaction, which extend the lock duration.

**Severity:** HIGH — Transaction timeout could leave the user in a partially-deleted state. The soft-delete + hard-delete approach already handles this (soft-delete is idempotent), but a failed transaction would leave the user seeing "User account already deleted" on retry (line 407) without actually having completed the deletion.

### C3: Privacy delete endpoint has no confirmation mechanism
**File:** `privacy.controller.ts` lines 23-28
**Lines:**
```typescript
@Delete('delete-all')
@Throttle({ default: { limit: 1, ttl: 86400000 } })
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Delete all user data permanently (GDPR Article 17)' })
deleteAll(@CurrentUser('id') userId: string) {
    return this.privacyService.deleteAllUserData(userId);
}
```
**Issue:** A single DELETE request permanently destroys all user data. No confirmation token, no re-authentication, no "type DELETE to confirm". If a user's JWT is compromised (stolen device, XSS), the attacker can irrevocably delete the victim's account with one request.
**Severity:** MEDIUM — Should require password re-entry or a confirmation code.

### C4: Settings `updatePrivacy` spreads DTO into Prisma without field filtering
**File:** `settings.service.ts` lines 24-43
**Lines:**
```typescript
async updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    const { isPrivate, ...settingsFields } = dto;
    const settings = await this.prisma.userSettings.upsert({
        where: { userId },
        create: { userId, ...settingsFields } as Prisma.UserSettingsUncheckedCreateInput,
        update: settingsFields as Prisma.UserSettingsUncheckedUpdateInput,
    });
```
**Issue:** The `as Prisma.UserSettingsUncheckedCreateInput` cast bypasses TypeScript's type checking. If the `UpdatePrivacyDto` adds a field that doesn't exist on `UserSettings`, it will pass validation but Prisma will throw at runtime. More critically, the `...settingsFields` spread means ANY field in the DTO goes straight to the database. The DTO currently has only safe fields, but if someone adds `userId` or `id` to the DTO, it would overwrite those.
**Severity:** LOW — Currently safe due to DTO validation, but fragile pattern.

### C5: Hard-delete purge sends user IDs to Sentry as log messages
**File:** `privacy.service.ts` lines 107-113
**Lines:**
```typescript
Sentry.captureMessage(
    `Hard-delete purge: permanently removing user ${candidate.id} (soft-deleted at ${deletionTimestamp.toISOString()})`,
    'info',
);
```
**Issue:** User IDs are sent to Sentry (third-party SaaS). After hard-delete, the user has no relationship with the platform, yet their ID persists in Sentry logs. Under strict GDPR interpretation, even a UUID identifier tied to a deletion event could be considered personal data if it can be correlated with other systems.
**Severity:** LOW — Standard practice, but worth noting for GDPR-strict jurisdictions.

### C6: Privacy export includes `clerkId` path via user settings
**File:** `privacy.service.ts` line 278
**Lines:** `this.prisma.userSettings.findUnique({ where: { userId } })` — returns the FULL settings record.
**Issue:** The user settings record is returned without a `select` clause. If `UserSettings` contains internal fields (like admin flags, internal scores, etc.), those would be included in the GDPR export. The user profile fetch (lines 229-249) correctly uses `select` to exclude `clerkId` and `pushToken`, but settings don't have the same treatment.
**Severity:** LOW — Settings are typically user-facing, but should use explicit `select`.

### C7: Settings `removeBlockedKeyword` uses id lookup instead of compound key
**File:** `settings.service.ts` lines 85-89
**Lines:**
```typescript
async removeBlockedKeyword(userId: string, id: string) {
    const kw = await this.prisma.blockedKeyword.findUnique({ where: { id } });
    if (!kw || kw.userId !== userId) throw new NotFoundException('Keyword not found');
    await this.prisma.blockedKeyword.delete({ where: { id } });
```
**Issue:** This is actually CORRECT — it fetches by ID then validates ownership. No BOLA. However, the error message "Keyword not found" is returned for both "doesn't exist" and "belongs to another user" cases, which is good (prevents user enumeration).
**Severity:** PASS

### C8: Privacy `processScheduledDeletions` uses `username NOT starting with 'deleted_'` as deletion check
**File:** `privacy.service.ts` lines 157-164
**Lines:**
```typescript
const usersToDelete = await this.prisma.user.findMany({
    where: {
        scheduledDeletionAt: { lte: now },
        isDeactivated: true,
        username: { not: { startsWith: 'deleted_' } },
    },
```
**Issue:** The "already purged" check relies on the username starting with `deleted_`. If a user originally chose a username like `deleted_john123`, the cron would skip them even if they need deletion. This is a very unlikely edge case since usernames are typically validated against reserved prefixes, but it's a fragile check.
**Severity:** LOW — Should use `isDeleted: false` or a dedicated flag instead of username pattern matching.

### C9: Settings `logScreenTime` has no deduplication — same session can be logged multiple times
**File:** `settings.service.ts` lines 108-119
**Lines:**
```typescript
return this.prisma.screenTimeLog.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, totalSeconds: seconds, sessions: 1 },
    update: { totalSeconds: { increment: seconds }, sessions: { increment: 1 } },
});
```
**Issue:** Every call increments `totalSeconds` and `sessions`. A malicious client could call this endpoint repeatedly with `seconds: 86400` to inflate their screen time stats. Rate limiting (60/min class-level) helps but doesn't prevent accumulation.
**Severity:** LOW — Screen time stats are user-facing only, no business impact.

### C10: Privacy delete doesn't revoke Clerk session
**File:** `privacy.service.ts` lines 400-788
**Issue:** After deleting all user data and setting `clerkId: deleted_{userId}`, the user's existing JWT remains valid until it expires (typically 5-60 minutes). The Clerk session is NOT revoked. The user could continue making API requests with their old JWT, and the `ClerkAuthGuard` would pass (since it validates the JWT signature, not the current Clerk user state).
**Severity:** MEDIUM — Ghost session after account deletion. Should call Clerk API to revoke all sessions.

### C11: Quiet mode schedule comparison uses string comparison for time
**File:** `settings.service.ts` lines 166-179
**Lines:**
```typescript
const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
if (setting.startTime <= setting.endTime) {
    return currentTime >= setting.startTime && currentTime <= setting.endTime;
}
```
**Issue:** String comparison of `HH:MM` format works correctly for time comparison (lexicographic order matches chronological order for zero-padded 24h format). The overnight handling is also correct. No issue.
**Severity:** PASS

### C12: Settings controller has no `@HttpCode` on mutation endpoints
**File:** `settings.controller.ts`
**Issue:** PATCH endpoints like `updatePrivacy`, `updateNotifications`, etc. don't have `@HttpCode(HttpStatus.OK)`. By default, NestJS returns 200 for PATCH, so this is fine. POST endpoints like `addBlockedKeyword` and `logScreenTime` default to 201 Created, which is semantically correct.
**Severity:** PASS

### C13: GDPR delete anonymizes clerkId to `deleted_{userId}`
**File:** `privacy.service.ts` line 517
**Lines:** `clerkId: \`deleted_${userId}\``
**Issue:** The original Clerk ID is overwritten, which is correct for anonymization. However, `deleted_{userId}` still contains the internal user ID, which could be used to correlate with other systems. A fully random value would be better (e.g., `deleted_${randomBytes(16).toString('hex')}`).
**Severity:** INFO — Minor, userId is the record's own primary key.

### C14: Privacy export rate limit is 2 per hour
**File:** `privacy.controller.ts` line 17
**Lines:** `@Throttle({ default: { limit: 2, ttl: 3600000 } })`
**Issue:** 2 exports per hour is reasonable. However, given the OOM risk (C1), even 1 export for a power user could cause problems.
**Severity:** INFO — Tied to C1.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | - |
| HIGH | 2 | C1, C2 |
| MEDIUM | 2 | C3, C10 |
| LOW | 5 | C4, C5, C6, C8, C9 |
| INFO | 2 | C13, C14 |
| PASS | 3 | C7, C11, C12 |

### What's Done Well
- Comprehensive GDPR deletion covering ~70 tables across 10 categories
- Financial records correctly preserved (SetNull FK) for audit/tax compliance
- R2 media cleanup batched in chunks of 50 with error isolation
- Meilisearch index cleanup via queue (durable, retried)
- IP address purge cron (90 days) for GDPR data minimization
- Hard-delete cron with 90-day grace period and safety re-fetch
- Sentry fatal-level alerts for GDPR deletion failures
- Follower/following count decrements on social graph removal
- Rate limiting on both export (2/hour) and delete (1/day)
- All settings endpoints behind ClerkAuthGuard
- Screen time validation (1-86400 seconds)
- Quiet mode handles overnight schedules correctly
