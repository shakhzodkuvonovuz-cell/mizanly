# A04: Users Module (Write Paths) Audit

## Files Reviewed
- `apps/api/src/modules/users/users.controller.ts` (399 lines)
- `apps/api/src/modules/users/users.service.ts` (1395 lines)
- `apps/api/src/modules/users/dto/update-profile.dto.ts` (93 lines)
- `apps/api/src/modules/users/dto/report.dto.ts` (10 lines)
- `apps/api/src/modules/users/dto/contact-sync.dto.ts` (26 lines)
- `apps/api/src/modules/users/dto/nasheed-mode.dto.ts` (8 lines)
- `apps/api/src/modules/users/dto/request-verification.dto.ts` (16 lines)
- `apps/api/src/common/guards/clerk-auth.guard.ts` (127 lines)
- `apps/api/src/common/filters/http-exception.filter.ts` (116 lines)
- `apps/api/src/modules/privacy/privacy.service.ts` (lines 400-750, deleteAllUserData)
- `apps/api/prisma/schema.prisma` (User model lines 898-1077, Report model lines 2298-2335)
- `apps/api/src/main.ts` (lines 185-197, ValidationPipe config)

## Findings

### HIGH -- Username race condition returns 500 instead of 409

- **File:** `apps/api/src/modules/users/users.service.ts:143-158`
- **Evidence:** The `updateProfile` method checks username uniqueness at line 154 with `findUnique`, then updates at line 170. Between the check and the update, a concurrent request could claim the same username. The `@unique` DB constraint on `username` catches this and Prisma throws `PrismaClientKnownRequestError` (P2002). However, there is NO P2002 error handling in the service, and the global `HttpExceptionFilter` (line 65) handles non-HttpException errors as generic 500. User sees "An unexpected error occurred" instead of "Username already taken" (409).
- **Impact:** Poor UX on concurrent username changes. The 500 error is misleading and triggers Sentry alerts for what should be a normal conflict.
- **Checklist item:** 3 (Race conditions), 6 (Error exposure)

### HIGH -- report() does not verify reported user exists

- **File:** `apps/api/src/modules/users/users.service.ts:981-1002`
- **Evidence:** The `report` method takes `reportedUserId` from `@Param('id')` (controller line 393) and passes it directly to `prisma.report.create` at line 998-999 without first checking the user exists. The Report model has `reportedUserId String?` with a FK to User (schema line 2323: `reportedUser User? @relation(..., onDelete: SetNull)`). A non-existent ID causes a P2003 FK violation, surfacing as a 500 error.
- **Impact:** Attacker can probe for user IDs (500 = not found, 200 = found). Also clutters Sentry with false 500 alerts.
- **Checklist item:** 6 (Error exposure)

### HIGH -- Duplicate user report returns 500 instead of 409

- **File:** `apps/api/src/modules/users/users.service.ts:998-999` + `apps/api/prisma/schema.prisma:2334`
- **Evidence:** The `@@unique([reporterId, reportedUserId])` constraint on Report (schema line 2334) prevents duplicate reports. However, the `report()` method does NOT check for an existing report before `create`. Duplicate reports throw P2002, which surfaces as a 500 error via the global exception filter.
- **Impact:** User who reports the same person twice gets a cryptic 500 error instead of "Already reported" (409 Conflict).
- **Checklist item:** 6 (Error exposure)

### MEDIUM -- updateProfile does not check banned/deactivated status

- **File:** `apps/api/src/modules/users/users.service.ts:107-196`
- **Evidence:** The `updateProfile` method takes `userId` from `@CurrentUser('id')` and immediately proceeds to moderate content and update the DB. It does NOT check `isBanned` or `isDeactivated` status. While the `ClerkAuthGuard` blocks banned users (guard line 104) and blocks deactivated users without pending deletion (guard line 114), a user with `isDeactivated: true` AND `scheduledDeletionAt > now()` (pending deletion) passes the guard (guard line 112). This user can then freely update their profile -- change username, bio, avatar, etc. -- while supposedly "pending deletion." This is a state machine inconsistency: a user who has requested account deletion can still fully update their profile.
- **Impact:** Users in "pending deletion" state can update profile fields, which is inconsistent with the deactivated state. The profile changes would then be visible if they later cancel deletion. Additionally, if content moderation flags their new bio, the moderation pipeline processes a profile that is about to be deleted anyway -- wasted work.
- **Checklist item:** 7 (Status machine)

### MEDIUM -- pronouns and statusText not sanitized

- **File:** `apps/api/src/modules/users/users.service.ts:131-132`
- **Evidence:** The `sanitizedData` object passes `pronouns` and `statusText` directly without calling `sanitizeText()`:
  ```typescript
  ...(pronouns !== undefined ? { pronouns } : {}),      // line 131
  ...(statusText !== undefined ? { statusText } : {}),   // line 132
  ```
  Compare with fields that ARE sanitized:
  ```typescript
  ...(displayName !== undefined ? { displayName: sanitizeText(displayName) } : {}),  // line 125
  ...(bio !== undefined ? { bio: sanitizeText(bio) } : {}),                           // line 126
  ```
  The `pronouns` field is limited to 30 chars and `statusText` to 100 chars by DTO validators, and the global `SanitizePipe` runs first. However, `sanitizeText()` strips HTML tags and control characters beyond what the pipe does -- it is explicitly applied to `displayName`, `bio`, `website`, `location` but NOT `pronouns` or `statusText`.
- **Impact:** `pronouns` and `statusText` could contain HTML tags or control characters that other sanitized fields cannot. If rendered in a web admin dashboard or Expo Web PWA without escaping, XSS is possible.
- **Checklist item:** 5 (DTO validation gaps)

### MEDIUM -- pronouns and statusText not content-moderated

- **File:** `apps/api/src/modules/users/users.service.ts:109`
- **Evidence:** Content moderation is applied to `dto.bio`, `dto.displayName`, and `dto.location` at line 109:
  ```typescript
  const textsToModerate = [dto.bio, dto.displayName, dto.location].filter(Boolean) as string[];
  ```
  But `dto.pronouns`, `dto.statusText`, and `dto.username` are NOT moderated. These are all publicly visible text fields. A user could set `statusText` to hate speech or slurs without triggering content moderation.
- **Impact:** Hate speech, slurs, or abusive content in pronouns/statusText bypasses moderation entirely. Username could also contain offensive substrings (regex only checks character set, not word content).
- **Checklist item:** 5 (DTO validation gaps)

### MEDIUM -- No rate limit on addWatchLater, removeWatchLater, clearWatchHistory, deactivate, nasheed-mode, cancel-deletion

- **File:** `apps/api/src/modules/users/users.controller.ts:146-166,179-184,64-71,262-271,246-252`
- **Evidence:** The following write endpoints use only the class-level `@Throttle({ default: { limit: 60, ttl: 60000 } })` (60 req/min) and have no endpoint-specific rate limit:
  - `POST me/watch-later/:videoId` (line 146) -- 60/min allows rapid list inflation
  - `DELETE me/watch-later/:videoId` (line 157) -- 60/min
  - `DELETE me/watch-history` (line 179) -- 60/min, destructive bulk delete
  - `DELETE me/deactivate` (line 64) -- no per-endpoint limit despite being irreversible
  - `PATCH me/nasheed-mode` (line 262) -- 60/min toggle spam
  - `POST me/cancel-deletion` (line 246) -- 60/min, should be stricter since paired with 1/day deletion
  Compare with endpoints that DO have specific limits: `PATCH me` (10/min), `POST contacts/sync` (5/hour), `DELETE me` (1/day).
- **Impact:** A compromised token could spam `addWatchLater` 60 times/min to inflate the watch-later list with arbitrary video IDs, or repeatedly toggle nasheed mode creating unnecessary DB writes. The `deactivate` endpoint lacks the `TwoFactorGuard` protection level of `deleteAccount` -- wait, it DOES have TwoFactorGuard (line 65). But 60/min is still too permissive for account deactivation.
- **Checklist item:** 2 (Missing rate limit)

### MEDIUM -- requestAccountDeletion does not check for existing pending deletion

- **File:** `apps/api/src/modules/users/users.service.ts:1069-1096`
- **Evidence:** The method checks `isDeleted` (line 1075) but does NOT check if `scheduledDeletionAt` is already set. A user can call this endpoint repeatedly during the 30-day grace window (the guard allows it because `hasPendingDeletion` is true), and each call OVERWRITES `scheduledDeletionAt` with a new date 30 days in the future. Combined with the 1/day rate limit, a user can indefinitely extend their deletion grace period by calling this endpoint daily.
  ```typescript
  // No check for existing scheduledDeletionAt:
  if (user.isDeleted) throw new NotFoundException('Account already deleted');
  // Goes straight to setting a NEW scheduledDeletionAt...
  ```
- **Impact:** User can prevent their account from ever being actually deleted by the cron job, defeating the purpose of the 30-day grace period. The cron processes accounts where `scheduledDeletionAt <= now()`, but the user keeps pushing it forward.
- **Checklist item:** 7 (Status machine)

### MEDIUM -- getProfile leaks lastSeenAt to public API

- **File:** `apps/api/src/modules/users/users.service.ts:268,312-313`
- **Evidence:** At line 242-244, the profile query selects `...INTERNAL_STATUS_FIELDS` which includes `lastSeenAt: true` (defined at line 52). This data is cached at line 268 and returned via `...user` spread at line 313. While `isDeleted`/`isBanned`/`isDeactivated` are filtered by the 404 check at line 272, `lastSeenAt` always reaches the response. The code comment at line 27 explicitly states "lastSeenAt is a privacy concern (shows exact activity time)" but it is still leaked.
- **Impact:** Any user (even unauthenticated, via `OptionalClerkAuthGuard`) can see any other user's exact last activity timestamp. This is a privacy violation -- stalking/monitoring concern, especially for users who have disabled "show online status" in their settings.
- **Checklist item:** 6 (Error exposure / privacy leak)

### MEDIUM -- No reserved username validation

- **File:** `apps/api/src/modules/users/dto/update-profile.dto.ts:14`
- **Evidence:** Username validation is regex-only: `@Matches(/^[a-zA-Z0-9_.]{3,30}$/)`. There is no reserved word check. Confirmed by grepping for `reserved.*username|RESERVED_USERNAMES|reservedWords` across the entire API codebase -- zero results. A user could claim usernames like: `admin`, `support`, `help`, `mizanly`, `official`, `moderator`, `system`, `deleted`, `api`, `www`, `mail`, `null`, `undefined`, `true`, `false`.
- **Impact:** Username squatting of official-looking names enables impersonation/phishing. `deleted_` prefix used in account deletion (privacy.service.ts line 505: `username: \`deleted_\${userId}\``) could collide if a user registers `deleted_something`.
- **Checklist item:** 5 (DTO validation gaps)

### MEDIUM -- website field accepts any URL (no domain restriction)

- **File:** `apps/api/src/modules/users/dto/update-profile.dto.ts:41-44`
- **Evidence:** The `website` field has `@IsUrl()` but no `@Matches()` pattern like `avatarUrl`/`coverUrl` have:
  ```typescript
  @IsOptional()
  @IsUrl()         // accepts ANY valid URL
  website?: string;
  ```
  Compare with `avatarUrl` which restricts to R2/Clerk CDN domains (line 32). `website` accepts `javascript:`, `data:`, and any HTTP(S) URL including phishing domains.
- **Impact:** Users can set their website to phishing URLs, `data:` URIs, or `javascript:` pseudo-URLs. If rendered as a clickable link without rel="noopener nofollow" on the frontend, this enables phishing. Note: `@IsUrl()` from class-validator by default accepts `javascript:` protocol.
- **Checklist item:** 5 (DTO validation gaps)

### LOW -- addWatchLater does not validate video exists

- **File:** `apps/api/src/modules/users/users.service.ts:664-671`
- **Evidence:** The `addWatchLater` method creates a `WatchLater` record with any `videoId` without checking if the video exists:
  ```typescript
  async addWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId },
      update: {},
    });
    return { added: true };
  }
  ```
  If WatchLater has a FK to Video, this would throw P2003 (surfacing as 500). If no FK, it creates orphan records.
- **Impact:** Pollutes the watch-later list with non-existent video references, and if FK exists, returns 500 instead of 404.
- **Checklist item:** 5 (DTO validation gaps), 6 (Error exposure)

### LOW -- requestVerification description string injection

- **File:** `apps/api/src/modules/users/users.service.ts:975`
- **Evidence:** The verification request description is built via string interpolation:
  ```typescript
  description: `[verification_request] Category: ${data.category}. Reason: ${data.reason}. Proof: ${data.proofUrl || 'none'}`,
  ```
  The `data.reason` field is free text up to 1000 chars. A malicious user could include the string `[verification_request]` in their reason, which could confuse the pending-request check at line 965 that searches by `{ contains: 'verification_request' }`. For example, a user could create a report with reason "I want verification_request status" which would match the contains check even though it's not a real verification request.
- **Impact:** Could interfere with the duplicate-request detection logic. Low severity because the check also requires `reporterId: userId` and `status: 'PENDING'`, so the user can only confuse their own requests.
- **Checklist item:** 5 (DTO validation gaps)

### LOW -- deactivate() does not check current deactivation state

- **File:** `apps/api/src/modules/users/users.service.ts:198-212`
- **Evidence:** The `deactivate` method only checks if the user exists (line 203). It does not check if `isDeactivated` is already `true`, `isBanned` is `true`, or `isDeleted` is `true`. It blindly sets `isDeactivated: true` and `deactivatedAt: new Date()`. A banned user cannot reach this (guard blocks them), but the guard's pending-deletion exception means a user who already requested deletion can also deactivate, which is redundant but harmless.
- **Impact:** Overwrites `deactivatedAt` timestamp on repeated calls, losing the original deactivation time. Minor data integrity concern.
- **Checklist item:** 7 (Status machine)

### LOW -- cancelAccountDeletion clears deactivation even if user was self-deactivated before deletion request

- **File:** `apps/api/src/modules/users/users.service.ts:1098-1111`
- **Evidence:** `cancelAccountDeletion` unconditionally sets `isDeactivated: false` (line 1108). However, if a user was already self-deactivated (via `DELETE me/deactivate`) and then separately requested account deletion, cancelling the deletion should NOT un-deactivate them. The method doesn't check the original deactivation cause.
  ```typescript
  data: { scheduledDeletionAt: null, deletedAt: null, isDeactivated: false, deactivatedAt: null },
  ```
- **Impact:** A self-deactivated user who cancels a pending deletion gets their account reactivated as a side effect, bypassing the intended deactivated state.
- **Checklist item:** 7 (Status machine)

### LOW -- ContactSyncDto allows unsanitized phone numbers despite LEGAL NOTE

- **File:** `apps/api/src/modules/users/dto/contact-sync.dto.ts:19-26`
- **Evidence:** The DTO comment (lines 7-17) documents a GDPR concern about transmitting raw phone numbers. The field accepts any string up to 20 chars with no format validation:
  ```typescript
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  phoneNumbers: string[];
  ```
  No `@Matches()` to enforce E.164 format or hex hash format. The comment says "TODO: implement client-side hashing" but the server-side code at service line 1192 hashes the DB phone numbers and compares against the submitted values -- meaning the submitted values are expected to be SHA-256 hex hashes (64 chars). But `@MaxLength(20)` would reject a SHA-256 hash (64 chars). This is contradictory.
- **Impact:** If the client sends raw phone numbers (not hashes), MaxLength(20) allows them. If the client sends SHA-256 hashes (as the comment suggests), MaxLength(20) would reject them since SHA-256 hex is 64 chars. The current code either (a) expects raw phone numbers (GDPR violation) or (b) is broken for hash-based matching.
- **Checklist item:** 5 (DTO validation gaps)

## Checklist Verification

### 1. BOLA -- PASS
All mutation endpoints use `@CurrentUser('id')` correctly:
- `updateProfile` (controller line 49): `@CurrentUser('id') userId`
- `deactivate` (line 69): `@CurrentUser('id') userId`
- `deleteAccount` (line 85): `@CurrentUser('id') userId`
- `addWatchLater` (line 152): `@CurrentUser('id') userId`
- `removeWatchLater` (line 163): `@CurrentUser('id') userId`
- `clearWatchHistory` (line 183): `@CurrentUser('id') userId`
- `syncContacts` (line 216): `@CurrentUser('id') userId`
- `requestAccountDeletion` (line 242): `@CurrentUser('id') userId`
- `cancelAccountDeletion` (line 250): `@CurrentUser('id') userId`
- `reactivateAccount` (line 258): `@CurrentUser('id') userId`
- `updateNasheedMode` (line 267): `@CurrentUser('id') userId`
- `requestVerification` (line 299): `@CurrentUser('id') userId`
- `report` (line 394): `@CurrentUser('id') reporterId` (separate from target `@Param('id')`)
No user can modify another user's data through these endpoints.

### 2. Missing rate limit -- FINDING
Six write endpoints rely on the permissive class-level 60/min limit. See finding above.

### 3. Race conditions -- FINDING
Username change has a TOCTOU race between uniqueness check (findUnique) and update. DB constraint catches it but error handling is wrong (500 instead of 409).

### 4. Cascade/cleanup on delete -- PASS (thorough)
The `deleteAllUserData` in PrivacyService covers:
- Profile anonymization (PII scrub: displayName, username, bio, avatar, cover, website, email, phone, location, madhab, expoPushToken, clerkId, stripeConnectAccountId)
- Content soft-delete (posts, threads, comments, reels, videos, stories, thread replies, reel comments, video comments)
- Message anonymization (content replaced with `[deleted]`, media URLs cleared)
- Encryption key deletion (encryptionKey, conversationKeyEnvelope, twoFactorSecret)
- Social graph removal (follows + counter decrements, blocks, mutes, restricts, follow requests, conversation members, circle members, subscriptions, channel members, hashtag follows, mosque memberships, series followers, majlis list members)
- Engagement data deletion (saved posts, bookmarks, reactions, watch history, watch later, notifications, story views, poll votes, event RSVPs, votes, reviews)
- Religious data deletion (dhikr, fasting, hajj, hifz, quran plans, prayer settings)
- Behavioral data deletion (feed interactions, interests, settings, content filters, screen time, profile customization)
- Gamification/commerce data (streaks, achievements, XP, reputation, coins, creator stats, promotions, subscriptions)
- Live/audio records
- R2 media cleanup (avatar, cover, post media, reel video/thumbnail/carousel, story media, video media, message media, voice post audio)
- Meilisearch index removal (posts, reels, threads, videos, user profile)
All wrapped in a transaction. This is comprehensive. Minor gap: `ParentalControl`, `AiAvatar`, `Challenge` (as creator), `ChannelPost`, `ChannelPostLike`, `BroadcastMessage` are referenced in the User model but not explicitly cleaned up in deleteAllUserData -- these may be covered by Prisma cascade rules or may be orphaned.

### 5. DTO validation gaps -- FINDING
Multiple findings: no reserved username check, website accepts any URL, pronouns/statusText not sanitized, ContactSyncDto MaxLength contradicts hash-based matching.

### 6. Error exposure -- FINDING
P2002/P2003 Prisma errors surface as 500 (username race, duplicate report, non-existent reported user). lastSeenAt leaked in public profile response.

### 7. Status machine -- FINDING
Pending-deletion users can update profile. requestAccountDeletion can extend grace period indefinitely. cancelAccountDeletion clears deactivation state unconditionally. deactivate() is idempotent but overwrites timestamp.

### 8. Sensitive field protection -- PASS
The global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` (main.ts line 192-193) strips any fields not declared in the DTO. The `UpdateProfileDto` only declares safe fields: username, displayName, bio, avatarUrl, coverUrl, website, location, pronouns, statusText, creatorCategory, language, theme, isPrivate, madhab. Privileged fields (isBanned, isVerified, role, coins, diamonds, followersCount, etc.) cannot be set via this endpoint. Additionally, the service uses explicit destructuring at line 122-123 as a defense-in-depth measure.
