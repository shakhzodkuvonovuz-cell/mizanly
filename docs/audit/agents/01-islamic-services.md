# Audit Agent #1: Islamic Services Depth

## Scope
All Islamic-related backend modules:
- `apps/api/src/modules/islamic/` (service, controller, DTOs, data, prayer-calculator, quran-metadata, notifications service)
- `apps/api/src/modules/mosques/` (service, controller, module)
- `apps/api/src/modules/scholar-qa/` (service, controller, module)
- `apps/api/src/modules/halal/` (service, controller, module)
- Relevant Prisma schema models

## Summary
**Total findings: 52**
- Critical: 11
- Moderate: 22
- Minor: 19

---

## CRITICAL (11 findings)

### C-01: Wrong Quran audio offsets for surahs 2-114 (113 of 114 surahs broken)
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 1008-1013
- **Category:** Data Integrity / Bug
- **Description:** The `surahOffsets` array used in `getAyahNumber()` for constructing CDN audio URLs is completely wrong for surahs 2-114. The array stores `[0, 1, 8, 35, 92, ...]` but the correct cumulative offsets should be `[0, 7, 293, 493, 669, ...]`. This means every Quran audio URL for any surah except Al-Fatihah will point to the wrong audio file. For surah 2 ayah 1, the code returns audio file #2 instead of #8. The error grows progressively worse for later surahs.
- **Impact:** All Quran audio playback is broken for 113/114 surahs (users hear wrong ayahs).
```ts
const surahOffsets = [0, 1, 8, 35, 92, 148, ...]; // WRONG: all values after index 0 are incorrect
// surah 2 offset should be 7 (after 7 ayahs of Al-Fatihah), not 1
// surah 3 offset should be 293 (7+286), not 8
```

### C-02: IslamicNotificationsService references non-existent Prisma model `prayerNotification`
- **File:** `apps/api/src/modules/islamic/islamic-notifications.service.ts`, lines 26, 78
- **Category:** Bug / Runtime Crash
- **Description:** The service uses `this.prisma.prayerNotification.findUnique()` but the Prisma schema model is named `PrayerNotificationSetting` (accessed via `this.prisma.prayerNotificationSetting`). Any call to `isInPrayerDND()` or `shouldShowPrayFirstNudge()` will throw a runtime error.
```ts
// Line 26 -- WRONG model name
const settings = await this.prisma.prayerNotification.findUnique({
  where: { userId },
});
// Should be: this.prisma.prayerNotificationSetting.findUnique(...)
```

### C-03: IslamicNotificationsService references non-existent schema fields `autoDnd` and `prayFirstNudge`
- **File:** `apps/api/src/modules/islamic/islamic-notifications.service.ts`, lines 29, 81
- **Category:** Bug / Runtime Crash
- **Description:** The service accesses `settings.autoDnd` and `settings.prayFirstNudge` but the `PrayerNotificationSetting` model only has: `dndDuringPrayer`, `adhanEnabled`, `adhanStyle`, `reminderMinutes`. These fields don't exist.
```ts
if (!settings || !settings.autoDnd) return false;   // autoDnd doesn't exist
if (!settings || !settings.prayFirstNudge) return { show: false }; // prayFirstNudge doesn't exist
```

### C-04: IslamicNotificationsService references non-existent Prisma model `mosqueFinder`
- **File:** `apps/api/src/modules/islamic/islamic-notifications.service.ts`, line 135
- **Category:** Bug / Runtime Crash
- **Description:** `this.prisma.mosqueFinder?.findFirst?.(...)` references a model that doesn't exist in the Prisma schema. There is no `MosqueFinder` model. The correct model is `MosqueCommunity` or `MosqueMembership`.
```ts
const mosqueLookup = await this.prisma.mosqueFinder?.findFirst?.({
  where: { userId },
  orderBy: { distance: 'asc' },
}).catch(() => null);
```

### C-05: IslamicNotificationsService is dead code (never registered in any module)
- **File:** `apps/api/src/modules/islamic/islamic-notifications.service.ts` (entire file)
- **Category:** Dead Code / Missing Feature
- **Description:** The `IslamicNotificationsService` class is defined but never registered as a provider in `IslamicModule` or any other module. It cannot be injected anywhere. Features like prayer-time DND, "pray first" nudges, Jummah reminders, and Ramadan mode awareness are all non-functional. Even if it were registered, it would crash due to C-02, C-03, and C-04.

### C-06: Donation creates DB record with `status: 'completed'` without any payment processing
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 643-652
- **Category:** Security / Financial Integrity
- **Description:** The `createDonation()` method creates a `CharityDonation` record with `status: 'completed'` and increments the campaign's `raisedAmount` immediately, without any Stripe payment processing. The `stripePaymentId` field exists in the schema but is never set. Users can "donate" unlimited amounts with no actual money transfer.
```ts
const donation = await this.prisma.charityDonation.create({
  data: {
    userId,
    campaignId: dto.campaignId,
    recipientUserId: dto.recipientUserId,
    amount: dto.amount,
    currency: dto.currency || 'usd',
    status: 'completed', // No payment was actually processed!
  },
});
```

### C-07: Controller inline DTOs bypass all validation (6 endpoints)
- **File:** `apps/api/src/modules/islamic/islamic.controller.ts`, lines 39-90, 537-541, 663-664, 713-714
- **Category:** Security / Input Validation
- **Description:** Six inline DTO classes in the controller use only `@ApiProperty` decorators (for Swagger) but have ZERO `class-validator` decorators. All incoming data passes through without any type checking, range validation, or sanitization:
  - `PrayerTimesQueryDto` -- lat/lng can be NaN, strings, anything
  - `MosquesQueryDto` -- same issue
  - `ZakatCalculationQueryDto` -- financial values unvalidated
  - `RamadanInfoQueryDto` -- year can be negative or non-integer
  - `logFast` body `{ date: string; isFasting: boolean; fastType?: string; reason?: string }` -- inline type, no DTO
  - `updateHifzProgress` body `{ status: string }` -- inline type, no DTO
  - `completeDailyTask` body `{ taskType: string }` -- inline type, no DTO

### C-08: Route ordering bug -- `GET /mosques/my/memberships` unreachable
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, lines 63, 113
- **Category:** Bug / Route Conflict
- **Description:** `@Get('my/memberships')` (line 113) is defined AFTER `@Get(':id')` (line 63). NestJS matches routes top-down, so a request to `/mosques/my/memberships` will be captured by `:id` with `id='my'`, returning a 404 "Mosque not found" instead of the user's memberships.
```ts
@Get(':id')        // line 63 -- catches /mosques/my
// ...
@Get('my/memberships') // line 113 -- UNREACHABLE
```

### C-09: Ramadan mode in notifications service uses hardcoded dates (only 2026-2027)
- **File:** `apps/api/src/modules/islamic/islamic-notifications.service.ts`, lines 163-167
- **Category:** Logic Error / Hardcoded Data
- **Description:** The `getRamadanStatus()` method has hardcoded Ramadan dates for only 2026 and 2027. The main `islamic.service.ts` correctly uses the Hijri calendar algorithm (`getRamadanDatesForYear()`), but the notifications service ignores it entirely and uses static dates that will be inaccurate and completely non-functional for any year not in the map.
```ts
const ramadanDates: Record<number, { start: Date; end: Date }> = {
  2026: { start: new Date(2026, 1, 18), end: new Date(2026, 2, 19) },
  2027: { start: new Date(2027, 1, 8), end: new Date(2027, 2, 9) },
};
```

### C-10: Islamic calendar period theming hardcoded to 2026 only
- **File:** `apps/api/src/modules/islamic/islamic-notifications.service.ts`, lines 229-248
- **Category:** Logic Error / Hardcoded Data
- **Description:** The `getIslamicPeriod()` method has hardcoded dates for Ramadan, Eid, Dhul Hijjah, and Muharram only for year 2026. For any other year, it always returns `{ period: 'normal' }`. Should use the Hijri calendar algorithm that already exists in `prayer-calculator.ts`.
```ts
if (year === 2026 && ((month === 1 && day >= 18) || (month === 2 && day <= 19))) {
  return { period: 'ramadan', accent: '#C8963E' };
}
// Returns 'normal' for 2027, 2028, etc.
```

### C-11: Scholar Q&A session scheduling has no scholar verification check
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, line 32; `scholar-qa.service.ts`, line 8
- **Category:** Security / Authorization
- **Description:** The `POST /scholar-qa` endpoint (schedule a Q&A session) only requires `ClerkAuthGuard` -- any authenticated user can schedule a "scholar Q&A session" claiming to be a scholar. There's no check against the `ScholarVerification` model to verify the user is actually a verified scholar. The comment says "(verified scholars only)" but this is not enforced.
```ts
@Post()
@ApiOperation({ summary: 'Schedule a Q&A session (verified scholars only)' })
@Throttle({ default: { ttl: 60000, limit: 5 } })
async schedule(@CurrentUser('id') scholarId: string, @Body() dto: ScheduleQADto) {
  return this.scholarQAService.schedule(scholarId, dto); // No scholar verification!
}
```

---

## MODERATE (22 findings)

### M-01: Halal verify endpoint allows unlimited votes per user (vote inflation)
- **File:** `apps/api/src/modules/halal/halal.service.ts`, lines 152-166
- **Category:** Data Integrity
- **Description:** The `verifyHalal()` method increments `verifyVotes` without checking if the user has already voted. A single user can call the endpoint 5 times to auto-verify any restaurant. Should track votes per user.
```ts
const updated = await this.prisma.halalRestaurant.update({
  where: { id: restaurantId },
  data: {
    verifyVotes: { increment: 1 }, // No per-user dedup!
    isVerified: restaurant.verifyVotes + 1 >= 5 ? true : restaurant.isVerified,
  },
});
```

### M-02: Scholar Q&A question votes have no duplicate check (infinite upvoting)
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.service.ts`, lines 66-74
- **Category:** Data Integrity
- **Description:** The `voteQuestion()` method does a simple `increment: 1` without tracking which user voted. The comment even acknowledges this: "no duplicate check for simplicity." A single user can upvote a question unlimited times.
```ts
// Simple increment (no duplicate check for simplicity — could add a vote model)
return this.prisma.scholarQuestion.update({
  where: { id: questionId },
  data: { votes: { increment: 1 } },
});
```

### M-03: Mosque `memberCount` can go negative via `leave()` without membership check
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, lines 76-88
- **Category:** Data Integrity
- **Description:** The `leave()` method catches all errors silently and decrements `memberCount` even if the user was never a member (the delete may fail for a non-member but the code still decrements). Also, the decrement doesn't clamp to zero.
```ts
async leave(userId: string, mosqueId: string) {
  try {
    await this.prisma.mosqueMembership.delete(/* ... */);
    await this.prisma.mosqueCommunity.update({
      where: { id: mosqueId },
      data: { memberCount: { decrement: 1 } }, // Can go negative
    });
  } catch {
    // Not a member -- but memberCount already decremented if delete succeeded partially
  }
  return { left: true };
}
```

### M-04: Mosque feed pagination uses `createdAt` comparison instead of cursor-based pagination
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, lines 91-109
- **Category:** Performance / Correctness
- **Description:** The `getFeed()` method uses `createdAt: { lt: new Date(cursor) }` for pagination, which can miss or duplicate posts if multiple posts have the same timestamp. Should use Prisma's cursor-based pagination with the `id` field.

### M-05: Daily briefing `ayahOfTheDay` shows hadith Arabic text instead of actual ayah
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 1613-1618
- **Category:** Bug / Data Integrity
- **Description:** In `getDailyBriefing()`, the `ayahOfTheDay.arabic` field is populated from `hadith.arabic` (the daily hadith's Arabic text), not from the actual Quran ayah. This mixes hadith text with Quran verse display. The translation is also just a placeholder string.
```ts
const ayahOfTheDay = {
  surah: this.getAyahSurahName(ayahIndex),
  ayahNumber: this.getAyahNumber(ayahIndex),
  arabic: hadith.arabic ? hadith.arabic.substring(0, 100) : '', // WRONG: hadith text, not Quran
  translation: `Reflect on verse ${ayahIndex + 1} of the Quran today`, // Placeholder
};
```

### M-06: `getAyahNumber()` method at line 1743 shadows the audio method at line 1008 with different logic
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 1008, 1743
- **Category:** Bug / Confusing Design
- **Description:** There are two private methods both named `getAyahNumber` in the same class. The one at line 1008 takes (surah, ayah) and returns cumulative audio number using the wrong offset array. The one at line 1743 takes (ayahIndex) and returns the local ayah number within a surah. TypeScript allows this because they have different signatures, but it's confusing and the first one is broken (see C-01).

### M-07: No input validation for coordinates in mosques and halal nearby endpoints
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, lines 42-52; `halal.controller.ts`, lines 48-68
- **Category:** Input Validation
- **Description:** Both `findNearby()` endpoints parse lat/lng from query strings with `parseFloat()` but never validate the values are within valid ranges (-90..90 for lat, -180..180 for lng). NaN values from non-numeric input will cause incorrect DB queries or runtime errors.

### M-08: Charity donation amount uses `@IsInt @Min(100)` -- minimum $100 per donation (likely wrong)
- **File:** `apps/api/src/modules/islamic/dto/charity.dto.ts`, line 14
- **Category:** Logic Error / DTO
- **Description:** The `CreateDonationDto` has `@IsInt() @Min(100)` for the `amount` field. If this is in the smallest currency unit (cents), $1.00 minimum makes sense. But the service checks `dto.amount <= 0 || dto.amount > 1000000` and labels it "between $0.01 and $1,000,000", suggesting it's treating the field as dollars. If it's dollars, `@Min(100)` means minimum $100 donation. The schema field is `Decimal(12,2)` which suggests dollars. The DTO and service disagree on the unit.

### M-09: Campaign `goalAmount` uses `@IsInt @Min(100)` -- minimum $100 goal, but stored as Decimal(12,2)
- **File:** `apps/api/src/modules/islamic/dto/charity.dto.ts`, line 7
- **Category:** Logic Error / Type Mismatch
- **Description:** Same issue as M-08. `goalAmount` is validated as integer with `@IsInt()` but the schema stores it as `Decimal(12,2)`. Fractional goal amounts are rejected by the DTO even though the DB supports them.

### M-10: `getMyDonations` limit not capped
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, line 662
- **Category:** Performance
- **Description:** `getMyDonations()` uses `limit = 20` default but the parameter is directly passed from the URL with no cap. Unlike other paginated methods that use `Math.min(Math.max(limit, 1), 50)`, this one has no bounds checking.

### M-11: `listActiveChallenges` limit not capped
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, line 886
- **Category:** Performance
- **Description:** Same as M-10. The `limit` parameter defaults to 20 but isn't bounded with `Math.min`.

### M-12: Mosque post creation has no content length validation
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, line 24; `mosques.service.ts`, line 111
- **Category:** Input Validation
- **Description:** `CreateMosquePostDto` has `@IsString() content` with no `@MaxLength()`. A user could submit arbitrarily long content.

### M-13: Scholar Q&A question has no length validation
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, line 19
- **Category:** Input Validation
- **Description:** `SubmitQuestionDto` has `@IsString() question` with no `@MaxLength()`. Users can submit arbitrarily long questions.

### M-14: No `@IsUrl` validation on any URL fields across all Islamic modules
- **Files:** `islamic/dto/charity.dto.ts` (imageUrl), `mosques/mosques.controller.ts` (CreateMosqueDto.website, imageUrl), `halal/halal.controller.ts` (CreateRestaurantDto.website, imageUrl), `islamic/dto/scholar-verification.dto.ts` (documentUrls)
- **Category:** Input Validation / Security
- **Description:** None of the URL fields (`imageUrl`, `website`, `documentUrls`) have `@IsUrl()` validation. Users can inject arbitrary strings, potentially enabling stored XSS if rendered in frontend, or SSRF if the server fetches these URLs.

### M-15: Dhikr challenge contribution doesn't check if challenge is expired
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 948-962
- **Category:** Logic Error
- **Description:** `contributeToChallenge()` checks if the user is a participant but never checks if the challenge has expired (`expiresAt`). Users can continue contributing to expired challenges, inflating counts.

### M-16: Dhikr challenge contribution has race condition on counter updates
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 958-959
- **Category:** Data Integrity / Race Condition
- **Description:** Two separate `$executeRaw` statements update `dhikr_challenge_participants.contributed` and `dhikr_challenges.currentTotal`. These are not in a transaction. If one fails, the data becomes inconsistent.

### M-17: Halal restaurant `findNearby` pagination is fundamentally broken
- **File:** `apps/api/src/modules/halal/halal.service.ts`, lines 9-53
- **Category:** Bug / Pagination
- **Description:** The method paginates by `createdAt` cursor but then sorts by distance. This means the cursor-based pagination skips results based on creation time while the display order is by distance. Page 2 may contain items that should have been on page 1 based on distance, and vice versa.

### M-18: Fasting log `date` field parsing may produce wrong dates due to timezone
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, line 1386
- **Category:** Bug / Timezone
- **Description:** `new Date(data.date)` where `data.date` is a `YYYY-MM-DD` string will be interpreted as UTC midnight. But the Prisma `@db.Date` field stores just the date part. Depending on the server timezone, a date like "2026-03-15" could be stored as March 14 if the server is in a negative UTC offset timezone.

### M-19: Prayer calculator `asrHourAngle` produces NaN for extreme latitudes
- **File:** `apps/api/src/modules/islamic/prayer-calculator.ts`, lines 121-126
- **Category:** Bug / Edge Case
- **Description:** For extreme latitudes (> ~65 degrees) during certain seasons, `tan(delta)` can produce values where `1 / (factor + tan(delta))` is invalid, and the chained trigonometric calls can produce NaN. While `acos` is clamped in the `hourAngle` function, the `asrHourAngle` function uses `Math.abs(angle) / 15` without NaN protection.

### M-20: Mosque `findNearby` returns results sorted by `memberCount` not distance
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, lines 8-19
- **Category:** UX Bug
- **Description:** The `findNearby()` method queries by lat/lng bounding box but orders results by `memberCount: 'desc'`, not by distance. A mosque 15km away with 1000 members will appear before one 500m away with 10 members. For a "nearby" feature, distance sorting is expected.

### M-21: Duplicate Haversine distance implementations across 3 modules
- **Files:** `islamic.service.ts` (lines 513-527), `mosques.service.ts` (implicit via lat/lng delta), `halal.service.ts` (lines 168-182)
- **Category:** Code Quality / DRY Violation
- **Description:** Three separate implementations of Haversine distance calculation exist across the Islamic modules, each slightly different (one returns meters, one km rounded to 1 decimal). Should be extracted to a shared utility.

### M-22: Query string numeric parameters come in as strings but aren't validated before parseFloat/parseInt
- **Files:** `mosques.controller.ts` lines 47-49, `halal.controller.ts` lines 57-61
- **Category:** Input Validation
- **Description:** NestJS query parameters are always strings. The controllers use `parseFloat(lat)` and `parseInt(radius)` without checking for NaN. If a user sends `?lat=abc`, `parseFloat('abc')` returns NaN, which is then passed to the service causing undefined behavior in database queries.

---

## MINOR (19 findings)

### m-01: Surah 26 (Ash-Shu'ara) ayah count = 227 -- contradicts some scholarly counts of 226
- **File:** `apps/api/src/modules/islamic/quran-metadata.ts`, line 41
- **Category:** Data Integrity (minor)
- **Description:** Most authoritative sources count Surah Ash-Shu'ara as 227 ayahs, which matches. However, the total ayah count (6236) should be verified against the canonical count. The metadata appears correct per the Uthmani script standard.

### m-02: Mosques module missing `@Throttle` on some endpoints
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, lines 63, 85, 105
- **Category:** Rate Limiting
- **Description:** `@Get(':id')`, `@Get(':id/feed')`, and `@Get(':id/members')` lack specific `@Throttle` decorators. They rely only on the global throttle, which may be too permissive for mosque data scraping.

### m-03: `getDuasByCategory` returns all duas when no category is provided (no pagination)
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 1337-1339
- **Category:** Performance
- **Description:** With 100+ duas, returning the entire array without pagination is acceptable for now but may become problematic as the collection grows.

### m-04: `getAllNamesOfAllah` returns all 99 names at once (no pagination needed)
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 1474-1476
- **Category:** Performance (negligible)
- **Description:** Fixed set of 99 items. Pagination not needed.

### m-05: `getDailyNameOfAllah` uses index 0-98 but names are numbered 1-99
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 1525-1529
- **Category:** Minor Logic
- **Description:** `daysSinceEpoch % 99` produces index 0-98, which is used to index `this.namesOfAllah`. If the array is ordered by `number` (1-99), this correctly maps 0->name#1. However, it relies on array ordering. A `find()` by number would be safer.

### m-06: Prayer notification DTO allows `adhanStyle` values not matching any real reciter
- **File:** `apps/api/src/modules/islamic/dto/prayer-notification.dto.ts`, line 7
- **Category:** Data Validation
- **Description:** `@IsIn(['makkah', 'madinah', 'alaqsa'])` allows three adhan styles. But the service has 6 reciters with IDs like 'mishary', 'abdulbasit', 'maher', etc. These two lists don't correlate at all. The DTO adhan styles don't match any reciter ID.

### m-07: `getHifzReviewSchedule` has weak spaced repetition algorithm
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 1781-1798
- **Category:** Missing Feature
- **Description:** The "spaced repetition" is just a fixed 7-day window. Real spaced repetition (like SM-2 or Leitner) uses increasing intervals based on recall difficulty. This is adequate for V1 but should be noted as a feature gap.

### m-08: Mosque post `isPinned` field exists but no endpoint to pin/unpin posts
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, `mosques.controller.ts`
- **Category:** Missing Feature
- **Description:** The `MosquePost` schema has an `isPinned` field and the feed sorts by `isPinned: 'desc'`, but there's no endpoint for admins to pin or unpin posts.

### m-09: Hajj progress `checklistJson` stored as raw string instead of structured data
- **File:** Prisma schema line 2567; `apps/api/src/modules/islamic/dto/hajj.dto.ts`, line 10
- **Category:** Data Integrity
- **Description:** `checklistJson` is a `String` field with `@IsString()` validation. It's intended to hold JSON data but there's no JSON parse/validate step, so malformed JSON can be stored. Consider using Prisma's `Json` type.

### m-10: Scholar Q&A `ScheduleQADto` has no date validation
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, line 15
- **Category:** Input Validation
- **Description:** `scheduledAt` is just `@IsString()` with no `@IsDateString()` validation. Invalid date strings like "not-a-date" will cause `new Date('not-a-date')` to produce `Invalid Date` in the service.

### m-11: `computeHijriDateString` can produce `undefined` month name
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, line 1778
- **Category:** Bug (Edge Case)
- **Description:** If `hijriMonth - 1` is out of the 0-11 range (e.g., due to algorithm edge cases), `MONTHS[hijriMonth - 1]` will be `undefined`, and the fallback `|| MONTHS[0]` will display "Muharram" which may be incorrect.

### m-12: `CreateMosqueDto` and `CreateRestaurantDto` have no `@MaxLength` on text fields
- **Files:** `mosques.controller.ts` lines 10-22, `halal.controller.ts` lines 10-24
- **Category:** Input Validation
- **Description:** Fields like `name`, `address`, `city`, `country` have `@IsString()` but no `@MaxLength()`. Allows arbitrarily long strings to be stored in the database.

### m-13: Halal restaurant `findNearby` with `certified=false` string from query actually passes `false`
- **File:** `apps/api/src/modules/halal/halal.controller.ts`, line 64
- **Category:** Logic Error (Minor)
- **Description:** `certified: certified === 'true'` means `certified=false` in the query string will result in `false`, which is then passed to the service filter. The service then does `...(filters?.certified ? { halalCertified: true } : {})`. Since `false` is falsy, the filter is skipped entirely. This is actually correct behavior (only filter when `true`) but the logic is confusing.

### m-14: Mosque members endpoint uses `createdAt` for pagination cursor
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, lines 123-141
- **Category:** Performance / Correctness
- **Description:** Same issue as M-04. Using `createdAt` comparison for cursor pagination can cause missed items. Should use Prisma `cursor` with `id`.

### m-15: Scholar Q&A `getRecordings` has no pagination
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.service.ts`, lines 113-119
- **Category:** Performance
- **Description:** Returns up to 50 recordings with no cursor-based pagination. As the recordings library grows, this will become a performance issue.

### m-16: Prayer times cache key precision differs from mosque cache key precision
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 209, 367
- **Category:** Inconsistency
- **Description:** Prayer times cache uses `lat.toFixed(2)` (~1.1km precision) while mosque cache uses `lat.toFixed(1)` (~11km precision). The different precisions are inconsistent and may cause confusion.

### m-17: `getRamadanInfo` always sets `nextPrayer` to 'Maghrib' as default
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, line 472
- **Category:** Logic Error (Minor)
- **Description:** If no location is provided, the response includes `nextPrayer: 'Maghrib'` as a default value, which is misleading. Should be `undefined` when no location data is available.

### m-18: `getDhikrStats` filters sessions by 90-day window but calculates "total" from all time
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, lines 807-810
- **Category:** Performance / Inconsistency
- **Description:** `totalResult` aggregates all sessions (unbounded) while `sessions` only fetches the last 90 sessions for streak calculation. The total count is fine semantically but the streak calculation only considers the most recent 90 sessions. A user with 100+ consecutive days would have their streak miscounted.

### m-19: `MosquesModule` and `ScholarQAModule` don't import `PrismaModule`
- **Files:** `mosques/mosques.module.ts`, `scholar-qa/scholar-qa.module.ts`
- **Category:** Code Quality
- **Description:** Neither module explicitly imports `PrismaModule`. This works because `PrismaModule` is `@Global()`, but it's inconsistent with other modules (like `IslamicModule` which does import it). Not a bug, but a code consistency issue.

---

## Notes on Data Files

The following static data files were reviewed:

1. **hadiths.json** (481 lines, ~40 hadiths): Contains Nawawi's 40 hadith collection with proper Arabic, English, source, narrator, and chapter fields. Data appears authentic and well-structured.

2. **duas.json** (~117KB, 100+ entries): Well-structured with 8-language translations, proper source references, categories. Quality appears high.

3. **asma-ul-husna.json** (~20KB, 99 entries): All 99 Names of Allah with Arabic, transliteration, English meaning, explanation, and Quran references where applicable. Quality appears authentic.

4. **hajj-guide.json** (~6KB): Step-by-step Hajj guide data.

5. **tafsir.json** (~31KB): Tafsir entries with multiple scholarly sources per verse (limited coverage -- not all 6236 verses).

6. **quran-metadata.ts** (114 entries): Verified all 114 surahs have correct names, ayah counts, revelation types, and juz assignments. Total ayah count sums to 6236 correctly.
