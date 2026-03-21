# Agent #56 — User Lifecycle Audit (Signup -> Onboarding -> Usage -> Deletion)

**Scope:** Complete user lifecycle tracing across backend (users, auth, privacy modules) and mobile (onboarding, account settings, manage-data screens).

**Files Audited:**
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.controller.ts`
- `apps/api/src/modules/users/dto/update-profile.dto.ts`
- `apps/api/src/modules/users/dto/report.dto.ts`
- `apps/api/src/modules/users/dto/contact-sync.dto.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/webhooks.controller.ts`
- `apps/api/src/modules/auth/dto/register.dto.ts`
- `apps/api/src/modules/auth/dto/set-interests.dto.ts`
- `apps/api/src/modules/privacy/privacy.service.ts`
- `apps/api/src/modules/privacy/privacy.controller.ts`
- `apps/api/src/common/guards/clerk-auth.guard.ts`
- `apps/api/src/common/guards/optional-clerk-auth.guard.ts`
- `apps/api/src/common/utils/sanitize.ts`
- `apps/api/prisma/schema.prisma` (User model, lines 229-428)
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/onboarding/username.tsx`
- `apps/mobile/app/onboarding/profile.tsx`
- `apps/mobile/app/onboarding/interests.tsx`
- `apps/mobile/app/onboarding/suggested.tsx`
- `apps/mobile/app/(screens)/account-settings.tsx`
- `apps/mobile/app/(screens)/manage-data.tsx`
- `apps/mobile/src/services/api.ts` (authApi, usersApi, accountApi sections)

**Total Findings: 41**

---

## FINDING 1 — CRITICAL (P0): Onboarding `onboardingComplete` Never Set — Infinite Loop

**File:** `apps/mobile/app/onboarding/interests.tsx`, lines 70-71
**File:** `apps/mobile/app/_layout.tsx`, lines 194-196

**Code (interests.tsx):**
```typescript
// 2-step onboarding: go directly to app (skip suggested)
router.replace('/(tabs)/saf');
```

**Code (_layout.tsx):**
```typescript
const hasUsername = !!(user?.unsafeMetadata?.onboardingComplete);
if (!hasUsername && !inOnboarding) {
  router.replace('/onboarding/username');
}
```

**Problem:** The onboarding flow is: username -> interests -> app. But `onboardingComplete` is ONLY set in `suggested.tsx` (line 44):
```typescript
await user?.update({ unsafeMetadata: { onboardingComplete: true } });
```

The interests screen skips the suggested screen entirely (`router.replace('/(tabs)/saf')` at line 71), so `onboardingComplete` is NEVER set. On next app launch, the AuthGuard will detect `!hasUsername` and redirect back to `/onboarding/username`, creating an infinite loop.

**Impact:** Every user who completes onboarding will be forced to re-do it on every app restart. The suggested screen exists but is unreachable — nothing links to `/onboarding/suggested`.

**Severity:** SHIP BLOCKER

---

## FINDING 2 — CRITICAL (P0): interests.tsx Has Syntax Error — Will Not Compile

**File:** `apps/mobile/app/onboarding/interests.tsx`, lines 2-4

**Code:**
```typescript
import {
  View, Text, Pressable, StyleSheet, ScrollView,
import { useRouter, useLocalSearchParams } from 'expo-router';
```

**Problem:** Line 3 is missing the closing `} from 'react-native';`. The destructured import is not closed — the next import statement starts on line 4. This is a syntax error that will prevent the entire interests screen from compiling.

**Impact:** Interests screen is broken at compile time. Since this is step 2 of onboarding, no user can complete onboarding at all.

**Severity:** SHIP BLOCKER

---

## FINDING 3 — CRITICAL (P0): `authApi.register()` Never Called — User Never Created in Backend

**File:** `apps/mobile/app/onboarding/username.tsx`, lines 113-121
**File:** `apps/mobile/src/services/api.ts`, lines 213-214

**Code (username.tsx):**
```typescript
const handleContinue = async () => {
  if (!isValid) return;
  setLoading(true);
  try {
    // Skip profile step — go directly to interests (2-step onboarding)
    router.push({ pathname: '/onboarding/interests', params: { username } });
  } finally {
    setLoading(false);
  }
};
```

**Code (api.ts):**
```typescript
register: (data: { clerkId: string; username: string; displayName: string; avatarUrl?: string }) =>
  api.post<User>('/auth/register', data),
```

**Problem:** `authApi.register()` is defined in `api.ts` but is NEVER called from any mobile screen. The username screen checks availability via `authApi.checkUsername()` but never calls `register()` to create the user in the database. The profile screen calls `usersApi.updateMe()` but the user doesn't exist yet. The backend `register` endpoint creates/upserts the User record in the database, but no mobile code ever invokes it.

**Impact:** The user is created in Clerk (via Clerk's own signup flow) but never in the Mizanly database. All subsequent API calls that depend on having a User record will fail with 404/401.

**Severity:** SHIP BLOCKER

---

## FINDING 4 — CRITICAL (P0): `authApi.updateProfile()` Does Not Exist — Madhab Save Crashes

**File:** `apps/mobile/app/onboarding/interests.tsx`, line 64
**File:** `apps/mobile/src/services/api.ts`, lines 212-220

**Code (interests.tsx):**
```typescript
await authApi.updateProfile({ madhab: selectedMadhab }).catch(() => {});
```

**Code (api.ts — full authApi):**
```typescript
export const authApi = {
  register: (data: ...) => api.post<User>('/auth/register', data),
  me: () => api.get<User>('/auth/me'),
  checkUsername: (username: string) => api.get<{ available: boolean }>(...),
  setInterests: (categories: string[]) => api.post('/auth/interests', { categories }),
  suggestedUsers: () => api.get<User[]>('/auth/suggested-users'),
};
```

**Problem:** `authApi` has no `updateProfile` method. Calling `authApi.updateProfile()` will throw `TypeError: authApi.updateProfile is not a function`. The `.catch(() => {})` silently swallows the error, so the madhab preference is silently lost.

**Impact:** Madhab selection during onboarding never saves. Users' fiqh preferences are permanently lost.

**Severity:** HIGH (data loss, silent failure)

---

## FINDING 5 — CRITICAL (P0): Auth Guard Does NOT Check `isBanned`, `isDeactivated`, or `isDeleted`

**File:** `apps/api/src/common/guards/clerk-auth.guard.ts`, lines 32-39

**Code:**
```typescript
const user = await this.prisma.user.findUnique({
  where: { clerkId },
  select: { id: true, clerkId: true, username: true, displayName: true },
});

if (!user) {
  throw new UnauthorizedException('User not found');
}

request.user = user;
return true;
```

**Problem:** The auth guard only checks if the user exists. It does NOT check:
- `isBanned` — banned users can still use all endpoints
- `isDeactivated` — deactivated users can still access everything
- `isDeleted` — soft-deleted users can still authenticate and use the app

The select doesn't even fetch these fields. A banned/deleted/deactivated user with a valid Clerk token has full access to all authenticated endpoints.

**Impact:** Account bans are completely decorative. Deleted accounts can still operate. Deactivation is cosmetic.

**Severity:** SHIP BLOCKER (security + moderation)

---

## FINDING 6 — CRITICAL (P0): `getProfile()` Returns Deleted/Banned/Deactivated Profiles

**File:** `apps/api/src/modules/users/users.service.ts`, lines 217-276

**Code:**
```typescript
async getProfile(username: string, currentUserId?: string) {
  const cached = await this.redis.get(`user:${username}`);
  let user;
  if (cached) {
    user = JSON.parse(cached);
  } else {
    user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        ...PUBLIC_USER_FIELDS,
        profileLinks: { orderBy: { position: 'asc' } },
        channel: { select: CHANNEL_SELECT },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    ...
  }
  ...
  return { ...user, isFollowing, followRequestPending };
```

**Problem:** No check for `isDeleted`, `isDeactivated`, or `isBanned`. Deleted users show up with `displayName: 'Deleted User'` and `username: 'deleted_XXXXXXXX'` but their full profile data (including cached data from before deletion) is still served. The `PUBLIC_USER_FIELDS` selection does not include `isDeleted` or `isDeactivated` to even allow the caller to check.

**Impact:** Deleted user profiles are publicly visible. Banned user profiles remain accessible. Privacy violation.

**Severity:** HIGH

---

## FINDING 7 — CRITICAL (P1): Privacy Export (`privacy.service.ts`) Caps at 50 Records — GDPR Violation

**File:** `apps/api/src/modules/privacy/privacy.service.ts`, lines 18-32

**Code:**
```typescript
const [posts, threads, stories, messages, follows] = await Promise.all([
  this.prisma.post.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.thread.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.story.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.message.findMany({ where: { senderId: userId }, ..., take: 10000 }),
  this.prisma.follow.findMany({ where: { followerId: userId }, ..., take: 50 }),
]);
```

**Problem:** Posts, threads, stories, and follows are all capped at `take: 50`. A user with 500 posts will only get 50 in their GDPR data export. GDPR Article 20 (data portability) requires ALL personal data. Messages have a higher limit (10,000) but still capped.

**Impact:** GDPR non-compliance. If operating in the EU (or processing data of EU residents), this is a legal liability. A regulator could fine up to 4% of annual turnover.

Note: The `users.service.ts` `exportData()` method at lines 116-186 does NOT have `take` limits and exports all data properly. This creates a split: two competing export implementations with different completeness.

**Severity:** LEGAL (GDPR Article 20 violation)

---

## FINDING 8 — HIGH: Two Competing Data Export Implementations

**File:** `apps/api/src/modules/users/users.service.ts`, lines 115-186 (UsersService.exportData)
**File:** `apps/api/src/modules/privacy/privacy.service.ts`, lines 10-45 (PrivacyService.exportUserData)

**Problem:** There are TWO separate data export implementations:
1. `UsersService.exportData()` — no `take` limits, includes posts/threads/reels/videos/comments/messages/followers/following/likes/bookmarks
2. `PrivacyService.exportUserData()` — caps at 50 records for most tables, does NOT include reels, videos, likes, or bookmarks

They return different shapes:
- Users version: `{ exportedAt, profile, posts, threads, reels, videos, comments, messages, followers, following, likes, bookmarks }`
- Privacy version: `{ profile, posts, threads, stories, messages: { count, data }, following, exportedAt }`

Privacy version is incomplete and capped. Users version is more complete but doesn't include stories.

**Endpoints:**
- Users: `GET /users/me/data-export` (controller line 50)
- Privacy: `GET /privacy/export` (controller line 16)

**Impact:** Confusing API, inconsistent data, and the privacy-specific endpoint (the one marked for GDPR) is the broken one.

**Severity:** HIGH

---

## FINDING 9 — HIGH: Mobile Export Data Path Mismatch — 404

**File:** `apps/mobile/src/services/api.ts`, line 258
**File:** `apps/api/src/modules/users/users.controller.ts`, line 50

**Code (mobile):**
```typescript
exportData: () =>
  api.get<...>('/users/me/export-data'),
```

**Code (backend controller):**
```typescript
@Get('me/data-export')
```

**Problem:** Mobile calls `/users/me/export-data` but the backend endpoint is `/users/me/data-export`. The path segments are reversed: `export-data` vs `data-export`. This will always return 404.

**Impact:** Data export from mobile is completely broken. Users cannot download their data from the app.

**Severity:** HIGH

---

## FINDING 10 — HIGH: Mobile `accountApi.requestDataExport()` Calls Non-Existent Endpoint

**File:** `apps/mobile/src/services/api.ts`, lines 1162-1164
**File:** `apps/mobile/app/(screens)/manage-data.tsx`, line 141

**Code (api.ts):**
```typescript
export const accountApi = {
  requestDataExport: () => api.post('/account/export'),
};
```

**Problem:** `POST /account/export` does not exist as a backend endpoint. There is no `AccountController` or any controller mapped to `/account/`. The manage-data screen calls this on line 141, which will always 404.

**Impact:** The "Request Download" button in manage-data screen is non-functional.

**Severity:** HIGH

---

## FINDING 11 — CRITICAL: `deleteAccount()` Leaves All Content Visible — Ghost Data

**File:** `apps/api/src/modules/users/users.service.ts`, lines 188-215

**Code:**
```typescript
async deleteAccount(userId: string) {
  ...
  // Soft delete: anonymize user data, mark as deleted
  await this.prisma.user.update({
    where: { id: userId },
    data: {
      username: `deleted_${userId.slice(0, 8)}`,
      displayName: 'Deleted User',
      bio: '',
      avatarUrl: null,
      coverUrl: null,
      website: null,
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
  // Delete all device tokens (stop push notifications)
  await this.prisma.device.deleteMany({ where: { userId } });
  ...
}
```

**Problem:** `deleteAccount()` only anonymizes the user profile and deletes device tokens. It does NOT:
- Mark posts as removed (`isRemoved`)
- Mark threads as removed
- Mark comments as removed
- Delete stories
- Mark reels as removed
- Remove messages
- Clean up reactions/likes/bookmarks
- Remove follow relationships
- Decrement follower/following counts on other users
- Clean up event RSVPs, community memberships, etc.
- Cancel any active subscriptions

Compare with `PrivacyService.deleteAllUserData()` which DOES mark posts, threads, and comments as removed in a transaction. But the mobile `deleteAccount` button calls `usersApi.deleteAccount()` → `DELETE /users/me` → `UsersService.deleteAccount()`, NOT the privacy version.

**Impact:** After account deletion, all the user's posts, threads, comments, reels, and videos remain publicly visible, attributed to "Deleted User". This is a privacy violation — deleted users' content should not persist. Also a GDPR Article 17 (right to erasure) violation.

**Severity:** CRITICAL (GDPR violation)

---

## FINDING 12 — HIGH: `requestAccountDeletion()` Only Deactivates — Does NOT Delete

**File:** `apps/api/src/modules/users/users.service.ts`, lines 825-831

**Code:**
```typescript
async requestAccountDeletion(userId: string) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), isDeactivated: true },
  });
  return { requested: true };
}
```

**Problem:** This method sets `isDeactivated: true` and `deletedAt` but does NOT set `isDeleted: true`. It's labeled as a "30-day grace period" deletion request (controller line 230), but:
1. There is no scheduler/cron job that actually deletes after 30 days
2. `isDeleted` is never set to `true`
3. The `deletedAt` timestamp is set but nothing ever reads it to trigger actual deletion
4. No email notification is sent to the user about pending deletion

The `cancelAccountDeletion()` method at lines 833-838 reverses the deactivation, which is correct for the grace period pattern, but without a scheduled job to finalize, the deletion never happens.

**Impact:** Users who "delete their account" via this path are merely deactivated. Their data is never actually cleaned up.

**Severity:** HIGH (GDPR compliance gap)

---

## FINDING 13 — HIGH: Three Competing Deletion Endpoints

**File:** `apps/api/src/modules/users/users.controller.ts`, lines 59-75, 227-241
**File:** `apps/api/src/modules/privacy/privacy.controller.ts`, lines 22-27

There are THREE different deletion paths:
1. `DELETE /users/me/deactivate` → `UsersService.deactivate()` — sets `isDeactivated: true` only
2. `DELETE /users/me` → `UsersService.deleteAccount()` — anonymizes profile, sets `isDeleted: true`, deletes devices, but leaves all content
3. `POST /users/me/delete-account` → `UsersService.requestAccountDeletion()` — sets `deletedAt` + `isDeactivated: true`, but NOT `isDeleted`
4. `DELETE /privacy/delete-all` → `PrivacyService.deleteAllUserData()` — full transactional deletion with content removal

Mobile screens call different ones:
- `account-settings.tsx` deactivate button → `usersApi.deactivate()` (path 1)
- `account-settings.tsx` delete button → `usersApi.requestAccountDeletion()` (path 3)
- `manage-data.tsx` delete button → `usersApi.deleteAccount()` (path 2)
- Nobody calls path 4 (privacy/delete-all) from mobile

**Impact:** Users are confused by inconsistent behavior. The most thorough deletion (privacy/delete-all) is never called from mobile. Two different delete buttons in two different screens do different things.

**Severity:** HIGH

---

## FINDING 14 — HIGH: Webhook Handler Rejects All Requests When Secret Is Empty

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`, lines 43-46

**Code:**
```typescript
const secret = this.config.get<string>('CLERK_WEBHOOK_SECRET');
if (!secret) {
  throw new BadRequestException('Webhook secret not configured');
}
```

**Problem:** `CLERK_WEBHOOK_SECRET` is documented as EMPTY in the credential status table. This means all Clerk webhook events (`user.created`, `user.updated`, `user.deleted`) are rejected with 400. While this is technically correct (better than accepting unverified webhooks), it means:
- New Clerk signups are NOT synced to the Mizanly database
- User profile updates from Clerk are lost
- User deletions from Clerk dashboard are ignored

**Impact:** The Clerk webhook pipeline is completely non-functional. User creation depends entirely on the `register` endpoint being called from the app (which, per Finding 3, also never happens).

**Severity:** HIGH (but correct security behavior — should not skip verification)

---

## FINDING 15 — HIGH: `syncClerkUser()` Generates Non-Unique Usernames

**File:** `apps/api/src/modules/auth/auth.service.ts`, lines 185-205

**Code:**
```typescript
async syncClerkUser(clerkId: string, data: { email: string; displayName: string; avatarUrl?: string }) {
  return this.prisma.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      email: data.email,
      username: `user_${clerkId.slice(-8)}`,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
    },
    update: { ... },
  });
}
```

**Problem:** Generated username `user_${clerkId.slice(-8)}` could collide. Clerk IDs are like `user_2abc123def`. Taking the last 8 chars means two Clerk users ending in the same 8 chars will collide. The `username` field has a `@unique` constraint, so the second insert will throw a Prisma unique constraint violation (500 error, unhandled).

**Impact:** Username collision on webhook-created users causes 500 errors and the user is never created.

**Severity:** MEDIUM

---

## FINDING 16 — HIGH: `deleteAccount()` Username Collision Possible

**File:** `apps/api/src/modules/users/users.service.ts`, line 199

**Code:**
```typescript
username: `deleted_${userId.slice(0, 8)}`,
```

**Problem:** Same issue as Finding 15. Multiple deleted users could collide if their user IDs share the first 8 characters. CUIDs start with `c` + timestamp, so deletions happening in the same time window are at risk. The `username` field has a `@unique` constraint, so the second deletion will throw.

**Impact:** Account deletion can fail with a 500 error due to username collision.

**Severity:** MEDIUM

---

## FINDING 17 — MEDIUM: `deleteAccount()` Doesn't Invalidate Clerk Session

**File:** `apps/api/src/modules/users/users.service.ts`, lines 188-215

**Problem:** `deleteAccount()` anonymizes the DB record and deletes device tokens, but does NOT:
1. Revoke the Clerk session/token (the user can still make API calls with their existing JWT until it expires)
2. Delete the user from Clerk (they can still sign in)

The mobile side calls `signOut()` after deletion (manage-data.tsx line 125), but:
- This only signs out the current device
- Other devices remain signed in
- The Clerk account still exists, so they could sign in again

**Impact:** Deleted users can continue using the app from other devices, or sign back in.

**Severity:** MEDIUM

---

## FINDING 18 — MEDIUM: `deactivate()` Doesn't Invalidate Clerk Session

**File:** `apps/api/src/modules/users/users.service.ts`, lines 95-109

Same issue as Finding 17. Deactivation sets `isDeactivated: true` in the DB but doesn't:
1. Revoke the Clerk session
2. Return the user to the auth guard as unauthorized

Since the auth guard (Finding 5) doesn't check `isDeactivated`, the user can continue using the app normally even after deactivation.

**Impact:** Deactivation is purely cosmetic from a backend perspective.

**Severity:** MEDIUM

---

## FINDING 19 — MEDIUM: `deactivate()` Has No Reactivation Path

**File:** `apps/api/src/modules/users/users.service.ts`, lines 95-109

**Problem:** There is no `reactivate()` method. Once `isDeactivated` is set to `true`, the only way to undo it is via `cancelAccountDeletion()` (which also sets `isDeactivated: false`). But that method is semantically wrong — it's for canceling deletion requests, not reactivation.

There is no endpoint for a user to reactivate their account after deactivation.

**Impact:** Users who deactivate cannot reactivate. The only option is deleting and creating a new account.

**Severity:** MEDIUM

---

## FINDING 20 — MEDIUM: Username Not Savable via UpdateProfileDto

**File:** `apps/api/src/modules/users/dto/update-profile.dto.ts`
**File:** `apps/mobile/app/onboarding/profile.tsx`, line 84

**Code (profile.tsx):**
```typescript
await usersApi.updateMe({
  displayName: trimmedName,
  username: username,
  bio: bio.trim() || undefined,
});
```

**Code (UpdateProfileDto):**
```typescript
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(50) displayName?: string;
  @IsOptional() @IsString() @MaxLength(160) bio?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @IsUrl() coverUrl?: string;
  @IsOptional() @IsUrl() website?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsBoolean() isPrivate?: boolean;
}
```

**Problem:** `UpdateProfileDto` does NOT include a `username` field. The profile.tsx onboarding screen passes `username` in the update payload, but class-validator will strip it as an unknown field (if `whitelist: true` is enabled globally) or it will be passed through to Prisma which will try to update the username without validation.

If the `username` field passes through to `updateProfile()`, then `sanitizeText()` is NOT called on it (only called for displayName, bio, location, website at lines 81-84 of users.service.ts). But more importantly, there's no username format validation (`/^[a-zA-Z0-9_.]+$/`), no uniqueness check, and no length constraint on username changes via this path.

**Impact:** Either username changes silently fail (stripped by DTO), or they bypass all validation (no regex, no uniqueness check, no length limit).

**Severity:** MEDIUM

---

## FINDING 21 — MEDIUM: Username Change Does NOT Propagate

**File:** `apps/api/src/modules/users/users.service.ts`, lines 79-93

**Code:**
```typescript
async updateProfile(userId: string, dto: UpdateProfileDto) {
  const sanitizedData = { ...dto };
  ...
  const updated = await this.prisma.user.update({
    where: { id: userId },
    data: sanitizedData,
    select: PUBLIC_USER_FIELDS,
  });
  await this.redis.del(`user:${updated.username}`);
  return updated;
}
```

**Problem:** If a username change somehow gets through (see Finding 20), the Redis cache invalidation only deletes the NEW username's cache key. The OLD username's cached entry (`user:oldusername`) is NOT invalidated, so it will continue serving stale data for up to 5 minutes.

Additionally, username changes don't update:
- QR codes (cached by the client)
- Profile links shared externally
- @mentions in existing posts/threads
- Deep links (`mizanly://profile/oldusername`)

**Impact:** Stale cache returns wrong profile for old username. External links break.

**Severity:** MEDIUM

---

## FINDING 22 — HIGH: Followers/Following Lists Expose Private Accounts — No Auth Check

**File:** `apps/api/src/modules/users/users.controller.ts`, lines 287-303

**Code:**
```typescript
@Get(':username/followers')
@ApiOperation({ summary: 'Followers list' })
getFollowers(
  @Param('username') username: string,
  @Query('cursor') cursor?: string,
) {
  return this.usersService.getFollowers(username, cursor);
}

@Get(':username/following')
@ApiOperation({ summary: 'Following list' })
getFollowing(
  @Param('username') username: string,
  @Query('cursor') cursor?: string,
) {
  return this.usersService.getFollowing(username, cursor);
}
```

**Problem:** Both endpoints have:
1. NO auth guard — even unauthenticated users can access them
2. NO privacy check — private accounts' followers/following are fully exposed
3. NO block check — blocked users can see the blocker's social graph

Compare with `getProfile()` which at least checks blocks.

**Impact:** Private account users' social connections are publicly visible. Privacy violation.

**Severity:** HIGH

---

## FINDING 23 — MEDIUM: `nasheedMode` Endpoint Uses Inline Type — Bypasses Validation

**File:** `apps/api/src/modules/users/users.controller.ts`, lines 247-252

**Code:**
```typescript
updateNasheedMode(
  @CurrentUser('id') userId: string,
  @Body() body: { nasheedMode: boolean },
) {
  return this.usersService.updateNasheedMode(userId, body.nasheedMode);
}
```

**Problem:** `body` uses an inline type `{ nasheedMode: boolean }` instead of a DTO class with class-validator decorators. NestJS class-validator validation only works with class instances decorated with `@IsBoolean()` etc. With an inline type, no validation runs — `body.nasheedMode` could be any value (string, number, object).

If `body.nasheedMode` is `undefined` (body is `{}`), then `enabled` parameter in `updateNasheedMode()` will be `undefined`, and Prisma will set `nasheedMode` to `null` or throw.

**Impact:** No input validation on nasheed mode toggle.

**Severity:** LOW

---

## FINDING 24 — MEDIUM: Contact Sync DTO Has No Array Size Limit — DoS Vector

**File:** `apps/api/src/modules/users/dto/contact-sync.dto.ts`

**Code:**
```typescript
export class ContactSyncDto {
  @ApiProperty() @IsArray() @IsString({ each: true }) phoneNumbers: string[];
}
```

**Problem:** No `@ArrayMaxSize()` decorator. An attacker can send millions of phone numbers in a single request, causing:
1. Memory exhaustion on the server (storing the array)
2. A massive `WHERE phone IN (...)` query that could DoS the database
3. Potential enumeration of all users by phone number

**Impact:** DoS vector and user enumeration attack.

**Severity:** MEDIUM (security)

---

## FINDING 25 — MEDIUM: Contact Sync Uploads Raw Phone Numbers to Server

**File:** `apps/api/src/modules/users/users.service.ts`, lines 849-862

**Code:**
```typescript
async findByPhoneNumbers(userId: string, phoneNumbers: string[]) {
  const normalized = phoneNumbers.map(p => p.replace(/\D/g, '').slice(-10));
  const users = await this.prisma.user.findMany({
    where: { phone: { in: normalized }, id: { not: userId } },
    ...
  });
  ...
}
```

**Problem:** Phone numbers from the user's contact list are sent in plaintext to the server. Best practice (used by Signal, WhatsApp) is to hash phone numbers client-side and compare hashes server-side, preventing the server from learning the user's entire contact list.

Taking only the last 10 digits (`slice(-10)`) also incorrectly strips country codes, meaning international numbers will collide (e.g., US +1-555-123-4567 and AU +61-555-123-4567 would both become `5551234567`).

**Impact:** Privacy violation (server has access to all contacts), incorrect international number matching.

**Severity:** MEDIUM

---

## FINDING 26 — MEDIUM: `touchLastSeen()` Fire-and-Forget Without Await

**File:** `apps/api/src/modules/users/users.service.ts`, lines 55-59

**Code:**
```typescript
touchLastSeen(userId: string) {
  this.prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() },
  }).catch((e) => this.logger.error('Failed to update lastSeenAt', e));
}
```

**Problem:** This is fire-and-forget (no `async`/`await`). The method returns `void`, not a Promise. This means:
1. If the Prisma update fails, the error is logged but the caller never knows
2. In a test environment, the unhandled promise might cause test flakiness
3. Rapid calls (every `getMe` call at controller line 34) create many parallel DB writes

This is called on EVERY `GET /users/me` request, so high-traffic users will generate many parallel lastSeenAt updates.

**Impact:** Potential DB write pressure, unhandled promise in some scenarios.

**Severity:** LOW

---

## FINDING 27 — MEDIUM: `exportData()` Encrypts Messages But `exportUserData()` Does Not

**File:** `apps/api/src/modules/users/users.service.ts`, line 180
**File:** `apps/api/src/modules/privacy/privacy.service.ts`, line 28

**Code (users.service.ts):**
```typescript
messages: messages.map(m => ({ ...m, content: m.content ? '[encrypted]' : null })),
```

**Code (privacy.service.ts):**
```typescript
this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, createdAt: true }, take: 10000 }),
```

**Problem:** The users-module export masks message content as `[encrypted]`, while the privacy-module export returns raw message content. This is inconsistent:
- If messages are actually encrypted, both should decrypt or mask
- If messages are plaintext, both should return them (for GDPR compliance)
- The users-module version gives the user `[encrypted]` placeholders, which is NOT useful for data portability

**Impact:** Inconsistent message handling in exports. Users can't access their own message history via the users export.

**Severity:** MEDIUM

---

## FINDING 28 — MEDIUM: `report()` Silently Swallows Database Errors

**File:** `apps/api/src/modules/users/users.service.ts`, lines 756-768

**Code:**
```typescript
async report(reporterId: string, reportedUserId: string, reason: string) {
  if (reporterId === reportedUserId) return { reported: false };
  ...
  await this.prisma.report.create({
    data: { reporterId, reportedUserId, reason: mappedReason },
  }).catch((err: unknown) => this.logger.error('Failed to save report', err));
  return { reported: true };
}
```

**Problem:** The report creation error is caught and logged, but the method still returns `{ reported: true }`. The user thinks their report was submitted successfully when it actually failed.

**Impact:** Lost user reports. Harassment/abuse reports may never be recorded.

**Severity:** MEDIUM

---

## FINDING 29 — MEDIUM: Report Reason Mapping Is Incorrect

**File:** `apps/api/src/modules/users/users.service.ts`, lines 758-763

**Code:**
```typescript
const reasonMap: Record<string, ReportReason> = {
  spam: 'SPAM' as ReportReason,
  impersonation: 'HARASSMENT' as ReportReason,
  inappropriate: 'NUDITY' as ReportReason,
};
const mappedReason = reasonMap[reason] ?? ('SPAM' as ReportReason);
```

**Problem:**
1. `impersonation` maps to `HARASSMENT` — these are different report categories
2. `inappropriate` maps to `NUDITY` — inappropriate content isn't necessarily nudity
3. Any unrecognized reason defaults to `SPAM` — hate speech, violence, etc. all become "SPAM"
4. The `ReportDto` accepts a freeform string `reason` (min 3, max 500), but the service only maps 3 specific strings. All other strings (which users type as freeform text) become "SPAM"

**Impact:** Report categorization is wrong. Moderation team sees mostly "SPAM" reports that are actually other categories.

**Severity:** LOW

---

## FINDING 30 — HIGH: Two Delete Buttons in Mobile — Different Behaviors

**File:** `apps/mobile/app/(screens)/account-settings.tsx`, line 156
**File:** `apps/mobile/app/(screens)/manage-data.tsx`, line 202

**Code (account-settings.tsx):**
```typescript
onPress: async () => {
  await requestDeletionMutation.mutateAsync(); // calls usersApi.requestAccountDeletion()
},
```

**Code (manage-data.tsx):**
```typescript
onPress: async () => {
  await deleteAccountMutation.mutateAsync(); // calls usersApi.deleteAccount()
},
```

**Problem:** Two different screens have "Delete Account" buttons that call completely different endpoints:
- Account Settings → `POST /users/me/delete-account` → `requestAccountDeletion()` (sets deactivated + deletedAt, no actual deletion)
- Manage Data → `DELETE /users/me` → `deleteAccount()` (anonymizes profile, sets isDeleted, deletes devices)

Neither calls the most thorough `DELETE /privacy/delete-all`.

**Impact:** Users get different deletion behavior depending on which screen they use. Confusing UX.

**Severity:** HIGH (UX consistency + data handling)

---

## FINDING 31 — LOW: Duplicate `Pressable` Import in account-settings.tsx

**File:** `apps/mobile/app/(screens)/account-settings.tsx`, lines 3-6

**Code:**
```typescript
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Alert,
  Pressable,
} from 'react-native';
```

**Problem:** `Pressable` is imported twice in the same destructured import. While JavaScript/TypeScript doesn't error on this, it's a code quality issue.

**Severity:** LOW

---

## FINDING 32 — LOW: Duplicate `Pressable` Import in manage-data.tsx

**File:** `apps/mobile/app/(screens)/manage-data.tsx`, lines 7-11

**Code:**
```typescript
import {
  ...
  Pressable,
  ScrollView,
  RefreshControl,
  Alert,
  Pressable,
} from 'react-native';
```

Same issue as Finding 31.

**Severity:** LOW

---

## FINDING 33 — LOW: Duplicate `accessibilityRole` Props in suggested.tsx

**File:** `apps/mobile/app/onboarding/suggested.tsx`, lines 94, 109

**Code:**
```tsx
<Pressable accessibilityRole="button" accessibilityRole="button" ...>
```

**Problem:** `accessibilityRole="button"` is specified twice on the same element. The second overrides the first (same value, so no functional difference), but it's a code quality issue.

**Severity:** LOW

---

## FINDING 34 — MEDIUM: `getMe()` Exists in Two Places — Different Responses

**File:** `apps/api/src/modules/users/users.service.ts`, lines 62-77 (UsersService.getMe)
**File:** `apps/api/src/modules/auth/auth.service.ts`, lines 80-107 (AuthService.getMe)

**Problem:** Two `getMe()` implementations:
1. `UsersService.getMe()` → returns profile + `email, language, theme, lastSeenAt, profileLinks, settings`
2. `AuthService.getMe()` → returns profile + `clerkId, language, theme, settings` (no profileLinks, no email in same format)

Mobile has two endpoints: `GET /users/me` and `GET /auth/me`. They return different data shapes. The mobile `usersApi.getMe()` calls `/users/me` and `authApi.me()` calls `/auth/me`.

**Impact:** Inconsistent user data depending on which endpoint is called. Confusing for developers.

**Severity:** LOW

---

## FINDING 35 — MEDIUM: No Rate Limit on `DELETE /users/me`

**File:** `apps/api/src/modules/users/users.controller.ts`, lines 68-75

**Code:**
```typescript
@Delete('me')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Permanently delete account (soft delete)' })
deleteAccount(@CurrentUser('id') userId: string) {
  return this.usersService.deleteAccount(userId);
}
```

**Problem:** No `@Throttle()` decorator. While the global rate limit (100 req/min) applies, there's no specific throttle for this destructive operation. The `deactivate()` endpoint also lacks specific throttling (line 59). Compare with `exportData` which has `@Throttle({ default: { ttl: 86400000, limit: 1 } })`.

**Impact:** An attacker with a stolen token could rapidly call delete. Though idempotent after first call, the Redis invalidation and DB update run each time.

**Severity:** LOW

---

## FINDING 36 — MEDIUM: `getSuggestedUsers()` Fetches Up to 5000 Following IDs

**File:** `apps/api/src/modules/auth/auth.service.ts`, lines 125-131

**Code:**
```typescript
const following = await this.prisma.follow.findMany({
  where: { followerId: userId },
  select: { followingId: true },
  take: 5000,
});
const followingIds = following.map((f) => f.followingId);
```

**Problem:** `take: 5000` is excessive for a suggestion query. This creates a potentially large `NOT IN` clause with 5000 IDs:
```sql
WHERE id NOT IN (5000 IDs)
  AND followers IN (5000 IDs)
```

For users following many accounts, this query will be slow.

**Impact:** Slow suggested users query for popular users.

**Severity:** LOW

---

## FINDING 37 — MEDIUM: `SetInterestsDto` Accepts Any String as Category

**File:** `apps/api/src/modules/auth/dto/set-interests.dto.ts`

**Code:**
```typescript
export class SetInterestsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  categories: string[];
}
```

**Problem:** Categories are freeform strings with no `@IsIn()` validation. The mobile hardcodes 12 valid categories (`quran, fiqh, history, family, health, business, tech, arts, travel, education, social, sports`), but the backend accepts any string. An attacker could inject arbitrary strings as interests, potentially causing issues in recommendation algorithms.

**Impact:** Dirty interest data, potential abuse of recommendation engine.

**Severity:** LOW

---

## FINDING 38 — MEDIUM: `UpdateProfileDto` Doesn't Sanitize `theme` or `language`

**File:** `apps/api/src/modules/users/dto/update-profile.dto.ts`
**File:** `apps/api/src/modules/users/users.service.ts`, lines 79-93

**Code (DTO):**
```typescript
@IsOptional() @IsString() language?: string;
@IsOptional() @IsString() theme?: string;
```

**Code (service):**
```typescript
async updateProfile(userId: string, dto: UpdateProfileDto) {
  const sanitizedData = { ...dto };
  if (sanitizedData.displayName) sanitizedData.displayName = sanitizeText(...);
  if (sanitizedData.bio) sanitizedData.bio = sanitizeText(...);
  if (sanitizedData.location) sanitizedData.location = sanitizeText(...);
  if (sanitizedData.website) sanitizedData.website = sanitizeText(...);
  // language and theme NOT sanitized
  ...
}
```

**Problem:** `language` and `theme` fields are not validated against allowed values:
- `language` should be `@IsIn(['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'])`
- `theme` should be `@IsIn(['dark', 'light', 'system'])`

Without validation, users can set arbitrary strings (e.g., `language: '<script>alert(1)</script>'`), which are stored unsanitized in the database.

**Impact:** Stored XSS potential if language/theme values are rendered without escaping.

**Severity:** MEDIUM

---

## FINDING 39 — LOW: Profile Screen Passes Username Directly to Prisma Without Sanitization

**File:** `apps/api/src/modules/users/users.service.ts`, line 224

**Code:**
```typescript
user = await this.prisma.user.findUnique({
  where: { username },
  ...
});
```

**Problem:** The `username` parameter comes directly from the URL path (`@Param('username')`). While Prisma parameterizes queries (preventing SQL injection), there's no validation on the username format. A request to `/users/../../etc/passwd` would safely return "not found", but unusually long or specially-crafted usernames could be used for cache key injection in Redis:
```typescript
await this.redis.get(`user:${username}`);
```
If `username` contains newlines or Redis protocol characters, it could potentially inject Redis commands (CRLF injection).

**Impact:** Low risk — Prisma prevents SQL injection, but Redis key injection is theoretically possible.

**Severity:** LOW

---

## FINDING 40 — LOW: `RegisterDto.language` Has No Validation Against Allowed Values

**File:** `apps/api/src/modules/auth/dto/register.dto.ts`

**Code:**
```typescript
@IsOptional()
@IsString()
language?: string;
```

**Problem:** Same as Finding 38 — no `@IsIn()` validation for the 8 supported languages.

**Severity:** LOW

---

## FINDING 41 — MEDIUM: `MutualFollowers` Uses Raw SQL Without Privacy Check

**File:** `apps/api/src/modules/users/users.service.ts`, lines 770-789

**Code:**
```typescript
async getMutualFollowers(currentUserId: string, targetUsername: string, limit = 20) {
  const target = await this.prisma.user.findUnique({ ... });
  if (!target) throw new NotFoundException("User not found");

  const mutual = await this.prisma.$queryRaw<...>`
    SELECT u.id, u.username, u.displayName, u.avatarUrl
    FROM follows f1
    INNER JOIN follows f2 ON f1.followerId = f2.followerId
    INNER JOIN users u ON f1.followerId = u.id
    WHERE f1.followingId = ${currentUserId} AND f2.followingId = ${target.id}
    LIMIT ${limit}
  `;
  ...
}
```

**Problem:**
1. No check if the target user is private, blocked, banned, or deleted
2. No check if the mutual followers themselves are private/blocked
3. The `limit` parameter comes from `@Query('limit')` and is passed as a number but could be a string or very large number. The controller does `limit ?? 20` but doesn't clamp it.
4. The raw SQL uses tagged template literals (safe from SQL injection per CLAUDE.md rule #10), but no privacy filtering is applied.

**Impact:** Can enumerate mutual followers of any user regardless of privacy settings.

**Severity:** MEDIUM

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|-----------|
| SHIP BLOCKER (P0) | 5 | Onboarding infinite loop, interests.tsx syntax error, register never called, auth guard ignores bans, deleted profiles visible |
| HIGH | 9 | GDPR export caps, path mismatches, ghost data on deletion, private followers exposed, competing endpoints |
| MEDIUM | 16 | Username issues, contact privacy, duplicate implementations, validation gaps |
| LOW | 11 | Duplicate imports, duplicate props, unvalidated enums, code quality |

## Critical Lifecycle Flow Gaps

### The Complete User Lifecycle Is Broken at Every Stage:

1. **Signup:** Clerk webhook rejected (empty secret). `authApi.register()` never called from mobile. User record never created in DB.

2. **Onboarding:** interests.tsx has syntax error (won't compile). `onboardingComplete` never set (infinite loop). Madhab save calls non-existent method. Username never saved via register.

3. **Active Use:** Auth guard doesn't check bans/deactivation/deletion. Deleted profiles still visible. Private account followers/following exposed.

4. **Deletion:** Three competing deletion paths with different behaviors. Ghost content after deletion. No scheduled cleanup. No Clerk session revocation. GDPR export incomplete.

### The Only Path That Would Work (If Fixed):
1. User signs up via Clerk
2. Clerk webhook creates user in DB (requires `CLERK_WEBHOOK_SECRET`)
3. But webhook generates non-unique usernames
4. Onboarding flow tries to work but interests.tsx won't compile
5. Even if it did, `onboardingComplete` never gets set
6. Even if user gets to app, their madhab preference is lost
7. When they delete, their content stays visible
8. Their GDPR export is incomplete
