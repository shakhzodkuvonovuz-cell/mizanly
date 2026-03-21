# Agent #61 — Wellbeing + Parental Controls Deep Audit

**Scope:** Parental controls backend module, screen time settings, quiet mode, wellbeing settings, wind-down screen, and all related mobile screens.

**Files audited (line by line):**
- `apps/api/src/modules/parental-controls/parental-controls.service.ts` (321 lines)
- `apps/api/src/modules/parental-controls/parental-controls.controller.ts` (117 lines)
- `apps/api/src/modules/parental-controls/parental-controls.module.ts` (11 lines)
- `apps/api/src/modules/parental-controls/dto/parental-control.dto.ts` (107 lines)
- `apps/api/src/modules/parental-controls/parental-controls.controller.spec.ts` (136 lines)
- `apps/api/src/modules/parental-controls/parental-controls.service.spec.ts` (293 lines)
- `apps/api/src/modules/parental-controls/parental-controls.service.edge.spec.ts` (54 lines)
- `apps/api/src/modules/settings/settings.service.ts` (200 lines — screen time + quiet mode + wellbeing portions)
- `apps/api/src/modules/settings/settings.controller.ts` (159 lines — screen time + quiet mode + wellbeing portions)
- `apps/api/src/modules/settings/dto/update-wellbeing.dto.ts` (16 lines)
- `apps/api/src/modules/settings/dto/quiet-mode.dto.ts` (33 lines)
- `apps/mobile/app/(screens)/parental-controls.tsx` (803 lines)
- `apps/mobile/app/(screens)/link-child-account.tsx` (385 lines)
- `apps/mobile/app/(screens)/screen-time.tsx` (579 lines)
- `apps/mobile/app/(screens)/wind-down.tsx` (215 lines)
- Prisma schema: `ParentalControl` model (lines 2790-2811), `ScreenTimeLog` model (lines 2651-2663), `QuietModeSetting` model (lines 2665-2678)
- Mobile API service: `parentalApi` (lines 1183-1201), `settingsApi` screen-time methods (lines 745-750)
- Mobile store: `screenTimeLimitMinutes` (lines 85-86, 249-250, 361, 393)

**Total findings: 42**

---

## CRITICAL — Security / Authorization

### Finding 1: `getRestrictions` endpoint has NO authorization — any authenticated user can read any child's parental restrictions
**File:** `apps/api/src/modules/parental-controls/parental-controls.controller.ts`, line 102-106
**Code:**
```typescript
@Get(':childId/restrictions')
@ApiOperation({ summary: 'Get restrictions for a child' })
getRestrictions(@Param('childId') childId: string) {
  return this.parentalControlsService.getRestrictions(childId);
}
```
**Problem:** The `@CurrentUser('id')` decorator is NOT used. Any authenticated user can call `GET /parental-controls/{anyUserId}/restrictions` and learn whether that user is a child account, what their age rating is, DM restrictions, and all parental control flags. This is a privacy violation and information disclosure. The endpoint should verify the caller is either the parent of that child OR the child themselves.

### Finding 2: `verifyPin` and `changePin` endpoints have NO brute-force protection beyond global throttle (30 req/min)
**File:** `apps/api/src/modules/parental-controls/parental-controls.controller.ts`, lines 76-100
**Code:**
```typescript
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('parental-controls')
```
**Problem:** The PIN is only 4 digits (10,000 combinations). With the controller-level throttle of 30 req/min, a brute-force attacker can try all 10,000 PINs in ~333 minutes (~5.5 hours). The `verifyPin` and `changePin` endpoints need a much tighter per-endpoint throttle (e.g., 5 attempts per 15 minutes) with exponential backoff or lockout after N failures. The service method `verifyPin` returns `{ valid: false }` (200 OK) rather than throwing, so failed attempts don't even show up as errors.

### Finding 3: No consent flow — parent can link ANY user as a child without child's approval
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 32-80
**Code:**
```typescript
async linkChild(parentUserId: string, dto: { childUserId: string; pin: string }) {
  // ... checks if parent is not a child, if child exists, if not already linked
  const [control] = await this.prisma.$transaction([
    this.prisma.parentalControl.create({
      data: { parentUserId, childUserId: dto.childUserId, pin: hashedPin },
    }),
    this.prisma.user.update({
      where: { id: dto.childUserId },
      data: { isChildAccount: true },
    }),
  ]);
}
```
**Problem:** Any authenticated user can designate any other user as their "child" without the target user's consent. The target user is immediately marked `isChildAccount: true` and subject to content restrictions (canPost, canComment, canGoLive, DM restrictions). This is an abuse vector — a malicious user could restrict a victim's account. There should be a consent flow (e.g., the child must accept, or age verification is required).

### Finding 4: PIN verification returns success/failure rather than always throwing — enables oracle attack
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 178-188
**Code:**
```typescript
async verifyPin(parentUserId: string, childUserId: string, pin: string) {
  // ...
  const isValid = await verifyPin(pin, control.pin);
  return { valid: isValid };
}
```
**Problem:** The endpoint returns `{ valid: true/false }` as a 200 OK response. This makes brute-force enumeration easy to script — the attacker simply checks the `valid` field. Better practice: return 403 Forbidden on incorrect PIN with a counter, and lock after N attempts.

### Finding 5: `linkChild` does not verify child is not already a parent of other children
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 32-80
**Problem:** The code checks if the parent is a child account (line 42-44), but does NOT check if the "child" being linked is already a parent of other children. A user who has linked children (is a parent) could be linked as a child by another user, which would break the hierarchy. Need: check if `childUserId` already has entries in `parentalControl` as `parentUserId`.

---

## CRITICAL — Syntax Errors

### Finding 6: `screen-time.tsx` has broken import statement — file will not compile
**File:** `apps/mobile/app/(screens)/screen-time.tsx`, lines 2-3
**Code:**
```typescript
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl,
import { useRouter } from 'expo-router';
```
**Problem:** The `react-native` import is missing the closing `} from 'react-native';` line. The import block is syntactically broken — the file will fail at compile time. The `RefreshControl,` ends with a comma and no closing brace or `from` clause before the next `import` statement.

### Finding 7: `parental-controls.tsx` has duplicate `Pressable` import
**File:** `apps/mobile/app/(screens)/parental-controls.tsx`, lines 3-6
**Code:**
```typescript
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
```
**Problem:** `Pressable` is imported twice (line 3 and line 5). This is a duplicate import that will cause a runtime warning or error depending on the bundler configuration.

### Finding 8: `link-child-account.tsx` has duplicate `Pressable` import
**File:** `apps/mobile/app/(screens)/link-child-account.tsx`, lines 3-6
**Code:**
```typescript
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl, TextInput, Alert,
  Pressable,
} from 'react-native';
```
**Problem:** Same issue as Finding 7 — `Pressable` imported twice.

---

## HIGH — Parental Controls Not Enforced

### Finding 9: Parental control restrictions are NEVER enforced in any content creation, messaging, or live streaming service
**Files searched:** All 79 backend modules
**Problem:** `ParentalControlsService.getRestrictions()` returns flags like `canPost: false`, `canComment: false`, `canGoLive: false`, `dmRestriction: 'disabled'`. However, ZERO other services in the entire codebase import or call `ParentalControlsService`. The posts, threads, reels, comments, conversations, and live modules do not check these restrictions. A child account with `canPost: false` can still create posts, comments, go live, and send DMs with zero enforcement. The restrictions are purely decorative.

**Evidence:** Searched for `getRestrictions`, `isChildAccount`, `canPost`, `canComment`, `canGoLive`, `restrictedMode`, `ParentalControlsService` across all service files. Only found references in:
- `parental-controls.service.ts` itself
- `communities.service.ts` (but only in its own unrelated context, not parental enforcement)

### Finding 10: `maxAgeRating` restriction never used for content filtering
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 229-257
**Problem:** The `getRestrictions` method returns `maxAgeRating` (values: G, PG, PG-13, R), but there is NO age rating on any content model (`Post`, `Reel`, `Thread`, `Video`). No content in the system is tagged with an age rating, so the `maxAgeRating` restriction is meaningless — there's nothing to filter against. This is a completely dead feature.

### Finding 11: `dailyLimitMinutes` on parental controls is never enforced
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 229-257
**Problem:** `getRestrictions` returns `dailyLimitMinutes` but no middleware, guard, or interceptor checks the child's screen time against this limit. The screen time logging (`settings.logScreenTime`) is a separate system that doesn't cross-reference parental controls. A child with a 15-minute daily limit can use the app forever.

### Finding 12: `restrictedMode` flag is never consumed by any feed, search, or discovery service
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, line 247
**Problem:** `restrictedMode: true` is returned from `getRestrictions` but no feed, search, or content service checks this flag. There's no "restricted mode" implementation that filters mature content. The flag exists only in the database and API response.

---

## HIGH — Screen Time Issues

### Finding 13: Screen time limit is NOT enforced — it's purely cosmetic
**Files:** `apps/api/src/modules/settings/settings.service.ts`, lines 154-163 + `apps/mobile/app/(screens)/screen-time.tsx`
**Problem:** `setScreenTimeLimit` saves a `screenTimeLimitMinutes` value to UserSettings, and the screen-time screen shows a progress bar comparing usage to the limit. But there is NO enforcement anywhere — no middleware blocks API calls when the limit is reached, no mobile-side navigation guard redirects to the wind-down screen when usage exceeds the limit. The limit is purely informational.

### Finding 14: `logScreenTime` has no deduplication — client can inflate usage arbitrarily
**File:** `apps/api/src/modules/settings/settings.service.ts`, lines 107-119
**Code:**
```typescript
async logScreenTime(userId: string, seconds: number) {
  if (seconds <= 0 || seconds > 86400) {
    throw new BadRequestException('Seconds must be between 1 and 86,400 (24 hours)');
  }
  return this.prisma.screenTimeLog.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, totalSeconds: seconds, sessions: 1 },
    update: { totalSeconds: { increment: seconds }, sessions: { increment: 1 } },
  });
}
```
**Problem:** The endpoint blindly increments `totalSeconds` and `sessions` on every call. There's no server-side session tracking — a client (or attacker) could call this endpoint repeatedly to either inflate screen time (griefing, making a child look like they're using the app too much) or NOT call it to underreport usage. Screen time tracking is entirely client-dependent and untrustworthy.

### Finding 15: `logScreenTime` is never called from the mobile app
**File:** `apps/mobile/src/services/api.ts`, line 745-746
**Code:**
```typescript
logScreenTime: (seconds: number) => api.post('/settings/screen-time/log', { seconds }),
```
**Problem:** The `settingsApi.logScreenTime` method exists in the API service, but a search across all mobile files shows it is NEVER imported or called from any screen, hook, or component. Screen time data is never logged, so `getScreenTimeStats` will always return empty results. The entire screen time feature is non-functional on mobile.

### Finding 16: `logScreenTime` body parameter has no DTO validation
**File:** `apps/api/src/modules/settings/settings.controller.ts`, lines 121-128
**Code:**
```typescript
@Post('screen-time/log')
logScreenTime(
  @CurrentUser('id') userId: string,
  @Body() body: { seconds: number },
) {
  return this.settingsService.logScreenTime(userId, body.seconds);
}
```
**Problem:** The `body` parameter uses an inline type `{ seconds: number }` instead of a validated DTO class. Class-validator decorators are not applied, so `body.seconds` could be a string, undefined, negative, or NaN. The service has runtime validation (`if (seconds <= 0 || seconds > 86400)`) but this is bypassed if `seconds` is `undefined` (it would be `NaN`, and `NaN <= 0` is `false`, so it would pass validation and corrupt the database).

### Finding 17: `setScreenTimeLimit` body parameter has no DTO validation
**File:** `apps/api/src/modules/settings/settings.controller.ts`, lines 136-143
**Code:**
```typescript
@Patch('screen-time/limit')
setScreenTimeLimit(
  @CurrentUser('id') userId: string,
  @Body() body: { limitMinutes: number | null },
) {
  return this.settingsService.setScreenTimeLimit(userId, body.limitMinutes);
}
```
**Problem:** Same as Finding 16 — inline type without DTO validation. The `limitMinutes` value bypasses class-validator entirely.

---

## HIGH — Wellbeing Settings

### Finding 18: Mobile sends `sensitiveContentFilter` but DTO field is `sensitiveContent` — setting silently fails
**File (mobile):** `apps/mobile/app/(screens)/settings.tsx`, line 481 + `apps/mobile/app/(screens)/content-settings.tsx`, line 153
**Code:**
```typescript
wellbeingMutation.mutate({ sensitiveContentFilter: v });
```
**File (DTO):** `apps/api/src/modules/settings/dto/update-wellbeing.dto.ts`, line 15
**Code:**
```typescript
@IsOptional() @IsBoolean() sensitiveContent?: boolean;
```
**File (Prisma):** `apps/api/prisma/schema.prisma`, line 2002
```
sensitiveContent       Boolean  @default(false)
```
**Problem:** The mobile app sends `{ sensitiveContentFilter: true }` but the backend DTO expects `sensitiveContent`. Class-validator strips unknown properties (with `whitelist: true` on the validation pipe), so `sensitiveContentFilter` is silently removed and the update does nothing. The Prisma field is also `sensitiveContent`, not `sensitiveContentFilter`. The mobile type definition at `apps/mobile/src/types/index.ts:540` defines it as `sensitiveContentFilter: boolean`, creating a consistent mismatch. This setting toggle silently does nothing.

### Finding 19: `updateWellbeing` DTO has `dailyTimeLimit` field but this is a duplicate of `screenTimeLimitMinutes`
**File:** `apps/api/src/modules/settings/dto/update-wellbeing.dto.ts`, lines 4-10
**Code:**
```typescript
export class UpdateWellbeingDto {
  @ApiProperty({ required: false, minimum: 15, maximum: 480 })
  @IsOptional() @IsInt() @Min(15) @Max(480)
  dailyTimeLimit?: number | null;
```
**File (Prisma):** `apps/api/prisma/schema.prisma`, lines 2000-2004
```
dailyTimeLimit         Int?
// ...
screenTimeLimitMinutes Int?
```
**Problem:** There are TWO screen time limit fields in the schema: `dailyTimeLimit` (set via wellbeing DTO) and `screenTimeLimitMinutes` (set via screen-time limit endpoint). These are different fields that serve the same purpose. The screen-time screen reads `screenTimeLimitMinutes` but the wellbeing settings screen would set `dailyTimeLimit`. They are never synchronized. A user setting a limit through one path won't see it reflected in the other.

### Finding 20: `updateWellbeing` passes raw DTO to Prisma without property filtering
**File:** `apps/api/src/modules/settings/settings.service.ts`, lines 60-66
**Code:**
```typescript
async updateWellbeing(userId: string, dto: UpdateWellbeingDto) {
  return this.prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...dto },
    update: dto,
  });
}
```
**Problem:** The DTO is spread directly into the Prisma `create`/`update`. If the DTO validation is bypassed (e.g., via a direct API call without the validation pipe), any field in `UserSettings` could be overwritten. While the validation pipe should prevent this, the pattern is unsafe as a defense-in-depth concern.

---

## HIGH — Wind-Down Screen

### Finding 21: Wind-down screen is completely disconnected — no trigger mechanism exists
**File:** `apps/mobile/app/(screens)/wind-down.tsx`
**Problem:** The wind-down screen exists as a standalone breathing exercise UI, but:
1. No screen time hook or service navigates to it when a limit is reached
2. No "take a break" reminder system triggers it
3. The `logScreenTime` API is never called, so there's no data to trigger it with
4. The only way to reach it is if some navigation link explicitly pushes to `/(screens)/wind-down`
5. Searching the entire mobile codebase for references to `wind-down` or `windDown` in navigation/router code finds ZERO references outside the screen file itself and i18n files

The wind-down feature is a dead screen with no trigger pathway.

### Finding 22: Wind-down "Close for now" button doesn't actually close the app
**File:** `apps/mobile/app/(screens)/wind-down.tsx`, lines 127-130
**Code:**
```typescript
<Pressable
  style={styles.closeBtn}
  onPress={() => {
    haptic.light();
    router.replace('/(tabs)/saf');
  }}
>
  <Text style={styles.closeBtnText}>{t('windDown.closeApp')}</Text>
</Pressable>
```
**Problem:** The button says "Close for now" (label: `windDown.closeApp`), but it navigates to the Saf feed tab instead of closing the app. On React Native, you'd use `BackHandler.exitApp()` on Android or at minimum navigate to a blank screen. Replacing to the main feed is the opposite of closing the app — the user is now in the main content feed.

### Finding 23: Wind-down "Continue Scrolling" button uses GradientButton (primary action style) for the wrong action
**File:** `apps/mobile/app/(screens)/wind-down.tsx`, lines 117-123
**Problem:** The primary action (emerald gradient button) says "Continue Scrolling" while the secondary action (plain text) says "Close for now". The UX is inverted — the wellbeing-positive action (closing/taking a break) should be the primary CTA, not "continue scrolling." This design actively encourages continued usage, defeating the purpose of the wind-down screen.

---

## MEDIUM — Quiet Mode

### Finding 24: `isQuietModeActive` is never called by any notification or messaging service
**File:** `apps/api/src/modules/settings/settings.service.ts`, lines 165-179
**Problem:** The `isQuietModeActive` method exists and has correct time-range logic for scheduled quiet hours. However, searching the entire codebase for `isQuietModeActive` shows it's only referenced in:
- The service itself (definition)
- The service spec (test)
- The service auth spec (test)

It is NEVER imported or called by the notification service, messaging gateway, or any push notification dispatcher. Quiet mode settings are stored but never enforced. Users who set quiet hours will still receive all notifications.

### Finding 25: Quiet mode time comparison is timezone-unaware
**File:** `apps/api/src/modules/settings/settings.service.ts`, lines 170-177
**Code:**
```typescript
const now = new Date();
const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
if (setting.startTime <= setting.endTime) {
  return currentTime >= setting.startTime && currentTime <= setting.endTime;
}
```
**Problem:** `new Date()` uses the server's timezone, not the user's timezone. A user in Sydney (UTC+11) setting quiet hours 22:00-07:00 would have them applied based on the server's clock (likely UTC or US timezone). The `startTime`/`endTime` fields have no timezone information. This will cause quiet mode to activate at the wrong times for most users.

---

## MEDIUM — Mobile Screen Issues

### Finding 26: `parental-controls.tsx` calls `setPinVerified(true)` during render — violates React rules
**File:** `apps/mobile/app/(screens)/parental-controls.tsx`, lines 549-552
**Code:**
```typescript
// If no controls and not verified, auto-verify
if (!pinVerified && !hasControls) {
  setPinVerified(true);
}
```
**Problem:** This `setState` call happens during the render phase (outside a useEffect or event handler). React will re-render immediately, potentially causing an infinite render loop or "Cannot update component during render" warning. This should be wrapped in a `useEffect`.

### Finding 27: `hasControlsQuery` makes the same API call as `childrenQuery` — redundant network request
**File:** `apps/mobile/app/(screens)/parental-controls.tsx`, lines 466-471
**Code:**
```typescript
const hasControlsQuery = useQuery({
  queryKey: ['parental-has-controls'],
  queryFn: () => parentalApi.getChildren(),
});
```
And lines 428-432:
```typescript
const childrenQuery = useQuery({
  queryKey: ['parental-children'],
  queryFn: () => parentalApi.getChildren(),
  enabled: pinVerified,
});
```
**Problem:** Both queries call `parentalApi.getChildren()` but with different query keys (`parental-has-controls` vs `parental-children`), so they hit the API twice. The `hasControlsQuery` runs immediately (to decide if PIN gate is needed), and `childrenQuery` runs after PIN verification. They should share the same query key or the logic should be consolidated.

### Finding 28: PIN verification in mobile uses the first child's ID from `hasControlsQuery.data` — fragile and possibly stale
**File:** `apps/mobile/app/(screens)/parental-controls.tsx`, lines 481-483
**Code:**
```typescript
const first = ((hasControlsQuery.data ?? []) as ParentalControl[])[0];
const result = await parentalApi.verifyPin(first.childUserId, pin) as { valid: boolean };
```
**Problem:** The code takes the first child from the cached data to verify the PIN. If the query data becomes stale or the first child is unlinked, this would either crash (index 0 of empty array) or verify against the wrong child's record. Additionally, `hasControlsQuery.data` could potentially be undefined at this point since the code is in a callback.

### Finding 29: Screen time "Take a Break" toggle is purely local state — never persisted
**File:** `apps/mobile/app/(screens)/screen-time.tsx`, line 134
**Code:**
```typescript
const [takeBreakEnabled, setTakeBreakEnabled] = useState(false);
```
**Problem:** The "Take a Break Reminders" toggle is stored in local component state. When the user leaves and returns, it resets to `false`. There's no API call to persist this setting and no background service that would actually send reminders. The toggle is completely non-functional.

### Finding 30: Screen time `LIMIT_OPTIONS` labels are hardcoded in English
**File:** `apps/mobile/app/(screens)/screen-time.tsx`, lines 30-40
**Code:**
```typescript
const LIMIT_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'No limit', value: null },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  // ...
];
```
**Problem:** The BottomSheet limit picker labels are hardcoded English strings, not i18n keys. Arabic, Turkish, Urdu, and other language users will see English options in the limit picker. Should use `t('screenTime.noLimit')`, `t('screenTime.minutes', { count: 15 })`, etc.

### Finding 31: Screen time bar chart `DAY_LABELS` are hardcoded in English
**File:** `apps/mobile/app/(screens)/screen-time.tsx`, line 42
**Code:**
```typescript
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
```
**Problem:** Day labels are hardcoded English abbreviations. Should use the i18n system or `Intl.DateTimeFormat` for localized day names.

---

## MEDIUM — Backend Issues

### Finding 32: `verifyPinForParent` service method has no controller endpoint
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 190-201
**Problem:** The `verifyPinForParent(parentUserId, pin)` method exists in the service and is tested, but there's no corresponding endpoint in the controller. The mobile app verifies PIN using `parentalApi.verifyPin(childId, pin)` which calls the child-specific `/:childId/pin` endpoint. The parent-level verify method is orphaned code.

### Finding 33: `getActivityDigest` has malformed Prisma query — closing parenthesis of `findMany` is misplaced
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 283-290
**Code:**
```typescript
this.prisma.screenTimeLog.findMany({
  where: {
    userId: childUserId,
    date: { gte: sevenDaysAgo },
  },
  orderBy: { date: 'asc' },
take: 50,
}),
```
**Problem:** The `take: 50` on line 289 appears to be outside the `findMany` options object. Looking at the indentation, `take: 50,` at line 289 is at the same level as `orderBy` on line 288. Actually, examining more carefully, the code shows `take: 50` is inside the `findMany` options — the indentation is misleading but syntactically correct. However, the query is inside a `Promise.all` and if the screenTimeLog table has many entries (e.g., child has been tracked for months), returning only 50 will cap the digest. For a 7-day window this should be fine (max 7 entries) but the `take: 50` is unnecessary.

### Finding 34: `updateControls` passes raw DTO directly to Prisma update — no field filtering
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 160-176
**Code:**
```typescript
async updateControls(parentUserId: string, childUserId: string, dto: UpdateParentalControlDto) {
  // ...
  return this.prisma.parentalControl.update({
    where: { id: control.id },
    data: dto,
  });
}
```
**Problem:** The entire DTO is spread as the `data` parameter. The `UpdateParentalControlDto` has validation for expected fields, but if a malicious client sends extra fields that happen to match Prisma model fields (e.g., `pin`, `parentUserId`, `childUserId`), they could be overwritten. The DTO doesn't include `pin`/`parentUserId`/`childUserId` fields, but if class-validator's whitelist mode isn't enabled globally, extra fields could slip through.

### Finding 35: `changePin` returns the full parental control record including the hashed PIN
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 203-227
**Code:**
```typescript
return this.prisma.parentalControl.update({
  where: { id: control.id },
  data: { pin: hashedPin },
});
```
**Problem:** The `update` call returns the full `ParentalControl` object, which includes the `pin` field (the scrypt hash). While the hash is not directly reversible, exposing it in the API response is unnecessary and violates the principle of least privilege. The PIN hash should never leave the server. Same issue applies to `linkChild` (line 65-79) which also returns the full record with `pin`.

### Finding 36: `linkChild` returns the full control object including the hashed PIN
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`, lines 65-79
**Problem:** Same as Finding 35. The `create` result includes the `pin` field. The PIN hash is exposed in the API response.

---

## MEDIUM — Test Quality Issues

### Finding 37: Controller spec test uses wrong DTO shape — `childUsername` instead of `childUserId`
**File:** `apps/api/src/modules/parental-controls/parental-controls.controller.spec.ts`, line 44
**Code:**
```typescript
const dto = { childUsername: 'kid123', pin: '1234' };
```
**Problem:** The `LinkChildDto` expects `childUserId` (a string ID), not `childUsername`. The test passes because it uses mocks that don't validate the shape, but it documents the wrong API contract. A developer reading this test would think the API accepts a username.

### Finding 38: Edge case spec `parental-controls.service.edge.spec.ts` missing Prisma mock for `findFirst`, `$transaction`, `post`, `message`
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.edge.spec.ts`, lines 20-28
**Problem:** The mock PrismaService only provides `parentalControl` and `user` mocks. If any test tried to call `unlinkChild`, `changePin`, `verifyPin`, `getActivityDigest`, or `updateControls`, it would crash with "Cannot read property of undefined" because `findFirst`, `$transaction`, `post.count`, `message.count`, and `screenTimeLog.findMany` are not mocked. The existing tests only cover `linkChild` and `getMyChildren`, so the issue is latent.

### Finding 39: Edge case spec test for "non-existent child user" has incorrect mock setup
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.edge.spec.ts`, lines 36-39
**Code:**
```typescript
it('should throw NotFoundException for non-existent child user', async () => {
  prisma.user.findUnique.mockResolvedValue(null);
  await expect(service.linkChild(parentId, { childUserId: 'nonexistent', pin: '1234' } as any))
    .rejects.toThrow(NotFoundException);
});
```
**Problem:** The mock returns `null` for the FIRST `findUnique` call, but in the actual service, the first `findUnique` is for the parent (line 38-41). Since the parent check is `if (parent?.isChildAccount)`, a null parent won't throw — the code will continue to the child lookup. The test might pass by accident if the second `findUnique` also returns `null` (from the same mock), but the test description is misleading about what it actually tests.

---

## LOW — Polish / Minor Issues

### Finding 40: `ParentalControl` Prisma model has no index on `parentUserId`
**File:** `apps/api/prisma/schema.prisma`, lines 2790-2811
**Code:**
```
@@unique([parentUserId, childUserId])
@@map("parental_controls")
```
**Problem:** The `getMyChildren` query filters by `parentUserId`, and while the composite unique index `[parentUserId, childUserId]` can serve lookups on `parentUserId` alone (as it's the leading column), a dedicated index on `parentUserId` would be more explicit and ensure the query planner uses it.

### Finding 41: `wind-down.tsx` uses `SafeAreaView` from `react-native-safe-area-context` directly instead of using `useSafeAreaInsets` like all other screens
**File:** `apps/mobile/app/(screens)/wind-down.tsx`, line 4 and 87
**Code:**
```typescript
import { SafeAreaView } from 'react-native-safe-area-context';
// ...
<SafeAreaView style={styles.safeArea}>
```
**Problem:** All other screens in the codebase use `useSafeAreaInsets()` hook with manual padding on a plain `View`. This screen uses `SafeAreaView` directly, which is inconsistent and can cause different inset behavior (especially on Android with notch displays). Minor inconsistency but worth noting for code uniformity.

### Finding 42: `wind-down.tsx` `closeBtn` Pressable missing `accessibilityRole="button"`
**File:** `apps/mobile/app/(screens)/wind-down.tsx`, lines 125-133
**Code:**
```typescript
<Pressable
  style={styles.closeBtn}
  onPress={() => { ... }}
>
```
**Problem:** Other Pressable elements across the codebase consistently include `accessibilityRole="button"`. This one is missing, making it inaccessible to screen readers.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL (Security) | 5 | Unauthorized restriction access, no consent for child linking, PIN brute-force, abuse vector |
| CRITICAL (Syntax) | 3 | Broken import in screen-time.tsx, duplicate Pressable imports in 2 screens |
| HIGH (Not Enforced) | 4 | All parental restrictions decorative, age rating unused, daily limit not enforced |
| HIGH (Screen Time) | 5 | Limit not enforced, logging never called, no DTO validation, client-trustworthy only |
| HIGH (Wellbeing) | 3 | Field name mismatch (silently fails), dual limit fields, raw DTO spread |
| HIGH (Wind-down) | 3 | Dead screen (no trigger), "close" doesn't close, inverted CTA hierarchy |
| MEDIUM | 9 | Quiet mode not enforced, timezone-unaware, render-phase setState, orphaned methods |
| LOW | 3 | Missing index, inconsistent SafeAreaView, missing accessibilityRole |
| **TOTAL** | **42** | |

### Top 5 Ship Blockers:
1. **Parental controls are 100% decorative** — None of the restriction flags (canPost, canComment, canGoLive, DM restrictions, daily limit, age rating, restricted mode) are enforced by any service in the entire codebase. A child account has the same capabilities as any other user.
2. **Any user can designate any other user as their "child" without consent** — This is an abuse vector that lets an attacker restrict a victim's account.
3. **`screen-time.tsx` has a fatal syntax error** — The import statement is broken and the file will not compile.
4. **`sensitiveContentFilter` field mismatch** — The mobile sends `sensitiveContentFilter` but the backend expects `sensitiveContent`. The toggle silently does nothing.
5. **Wind-down screen has no trigger** — No code in the entire mobile app ever navigates to the wind-down screen. Screen time is never logged. The entire wellbeing → screen time → wind-down pipeline is non-functional end-to-end.
