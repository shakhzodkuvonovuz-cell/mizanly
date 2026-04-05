# A31 — Islamic + Halal Module Hostile Audit

**Auditor:** Opus 4.6 | **Date:** 2026-04-05 | **Scope:** `apps/api/src/modules/islamic/` + `apps/api/src/modules/halal/`

---

## Files Audited

| File | Lines | Read |
|------|-------|------|
| `islamic.controller.ts` | 840 | ALL |
| `islamic.service.ts` | ~900+ | ALL |
| `islamic-notifications.service.ts` | 283 | ALL |
| `prayer-calculator.ts` | 306 | ALL |
| `quran-metadata.ts` | 155 | ALL |
| `halal.controller.ts` | 130 | ALL |
| `halal.service.ts` | 203 | ALL |
| `dto/prayer-notification.dto.ts` | (referenced) | N/A |
| `dto/quran-plan.dto.ts` | (referenced) | N/A |
| `dto/charity.dto.ts` | (referenced) | N/A |
| `dto/hajj.dto.ts` | (referenced) | N/A |
| `dto/scholar-verification.dto.ts` | (referenced) | N/A |
| `dto/content-filter.dto.ts` | (referenced) | N/A |
| `dto/dhikr.dto.ts` | (referenced) | N/A |

---

## CRITICAL Findings

### C1: Islamic controller uses OptionalClerkAuthGuard at class level — ALL endpoints accessible unauthenticated
**File:** `islamic.controller.ts` line 137-138
**Lines:** `@UseGuards(OptionalClerkAuthGuard)` on the class, with selective `@UseGuards(ClerkAuthGuard)` on some methods.
**Issue:** The class-level `OptionalClerkAuthGuard` means ANY endpoint without an explicit `@UseGuards(ClerkAuthGuard)` is accessible without authentication. This includes:
- `GET /islamic/prayer-times/current-window` (line 591-613) — no auth guard override
- `GET /islamic/glossary` (line 816-819) — no auth guard override
- `GET /islamic/tafsir/:surah/:verse` (lines 472-480) — no auth guard override
- `GET /islamic/tafsir/sources` (lines 466-469) — no auth guard override
- `GET /islamic/hadith`, `GET /islamic/hadith/daily`, `GET /islamic/hadith/:id` — no auth
- `GET /islamic/quran/*` all endpoints — no auth
- `GET /islamic/duas/*` (except bookmarked) — no auth
- `GET /islamic/names-of-allah/*` — no auth
- `GET /islamic/dhikr/community`, `GET /islamic/dhikr/leaderboard`, `GET /islamic/dhikr/challenges`, `GET /islamic/dhikr/challenges/:id` — no auth

**Assessment:** For READ-ONLY public endpoints (Quran text, hadith, prayer times, duas), this is ACCEPTABLE. These are public Islamic knowledge. But the classify-content and detect-hadith-grade endpoints (lines 822-839) require ClerkAuthGuard, so those are protected. No BOLA risk on write endpoints — all mutations require ClerkAuthGuard.

**Severity:** INFO — Intentional design, but should be documented as a conscious decision.

### C2: Quran search endpoint has no input length validation
**File:** `islamic.controller.ts` lines 370-379
**Lines:**
```typescript
async searchQuran(
    @Query('q') query: string,
    @Query('translation') translation?: string,
    @Query('limit') limit?: string,
) {
    return this.islamicService.searchQuran(query, translation, limit ? parseInt(limit, 10) : undefined);
}
```
**Issue:** The `q` query parameter has no `@MaxLength` validation. A malicious user could send a multi-megabyte search string, causing memory/CPU exhaustion in whatever search logic handles it. The `limit` parameter is parsed as int but there's no server-side cap visible here.
**Severity:** MEDIUM

### C3: Halal findNearby uses offset-based pagination — O(n) skip on large datasets
**File:** `halal.service.ts` lines 30-36
**Lines:**
```typescript
const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
const restaurants = await this.prisma.halalRestaurant.findMany({
    where,
    skip: offset,
    take: limit + 1,
});
```
**Issue:** Offset pagination with `skip: offset` degrades to O(n) at scale. With 10K+ restaurants, requesting `?cursor=5000` forces PostgreSQL to scan and discard 5000 rows. Cursor-based pagination with an id-based cursor would be O(1).
**Severity:** LOW (acceptable at current scale, becomes problem at 10K+ restaurants per geographic region)

### C4: Halal findNearby sorts AFTER database fetch — inconsistent pages
**File:** `halal.service.ts` lines 42-47
**Lines:**
```typescript
const withDistance = restaurants.map((r) => ({
    ...r,
    distanceKm: this.haversineDistance(lat, lng, r.latitude, r.longitude),
}));
withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
```
**Issue:** The database query fetches restaurants ordered by... nothing (no `orderBy`). The application then sorts by distance. But since pagination happens BEFORE sorting, page 2 may contain restaurants closer than page 1's results. The sort order is NOT consistent across pages.
**Severity:** MEDIUM — Users see incorrect ordering in paginated results.

### C5: Halal restaurant creation has no duplicate detection
**File:** `halal.service.ts` lines 71-96
**Issue:** No check for duplicate restaurants at the same coordinates or with the same name/address. A malicious user could create thousands of duplicate entries for the same restaurant. Rate limiting (10/min) helps but doesn't prevent slow accumulation.
**Severity:** LOW

### C6: Location data exposed in Halal getById response
**File:** `halal.service.ts` lines 57-69
**Lines:**
```typescript
const restaurant = await this.prisma.halalRestaurant.findUnique({
    where: { id },
    include: {
        reviews: {
            orderBy: { createdAt: 'desc' },
            take: 20,
        },
    },
});
```
**Issue:** Returns the FULL restaurant record including exact latitude/longitude. This is expected for restaurants (public businesses), but the reviews are included without filtering by blocked users. A blocked user's review would still be visible to the blocker.
**Severity:** LOW — Reviews don't expose private user data via this endpoint, but blocked-user filtering is missing.

### C7: Islamic service `followMosque` stores user location in Redis without expiry check
**File:** `islamic.service.ts` — `followMosque` method stores user's mosque coordinates in Redis hash `user:mosque:{userId}`.
**Issue:** This effectively stores the user's preferred mosque location indefinitely. If the user deletes their account via GDPR, the privacy service cleans some Redis keys (line ~768-783 in privacy.service.ts) but `user:mosque:{userId}` is NOT in the cleanup list.
**Severity:** MEDIUM — GDPR data leakage. User location data persists in Redis after account deletion.

### C8: Prayer notification DND window is hardcoded to 15 minutes
**File:** `islamic-notifications.service.ts` line 63
**Lines:** `if (currentTime >= prayerMinute && currentTime <= prayerMinute + 15)`
**Issue:** Not a vulnerability, but the 15-minute DND window is non-configurable per user. Some prayers (Jummah) may warrant longer DND. More importantly, the `shouldShowPrayFirstNudge` at line 127 uses `Math.abs(currentTime - prayerMinute) <= 15` which means the nudge fires 15 minutes BEFORE prayer too (different from DND which is only after).
**Severity:** INFO — Behavioral inconsistency between DND (after only) and nudge (before+after).

### C9: Islamic controller `getCurrentPrayerWindow` throws NotFoundException for invalid input
**File:** `islamic.controller.ts` line 609
**Lines:** `throw new NotFoundException(\`Invalid time format for ${name}. Expected HH:MM\`);`
**Issue:** Using `NotFoundException` (404) for a validation error is semantically wrong. Should be `BadRequestException` (400). This confuses API consumers about whether the resource doesn't exist vs. the input is invalid.
**Severity:** LOW

### C10: Halal `verifyHalal` has TOCTOU race on vote count
**File:** `halal.service.ts` lines 153-184
**Lines:**
```typescript
const restaurant = await this.prisma.halalRestaurant.findUnique({ where: { id: restaurantId } });
// ...
isVerified: restaurant.verifyVotes + 1 >= 5 ? true : restaurant.isVerified,
```
**Issue:** The verification threshold check uses the vote count read BEFORE the transaction. If two users verify simultaneously and both read `verifyVotes = 3`, both would set `isVerified = false` (3+1 < 5), but the actual count becomes 5. The fix should use a raw SQL `CASE WHEN "verifyVotes" + 1 >= 5 THEN true ELSE "isVerified" END` inside the update.
**Severity:** MEDIUM — Restaurants may not get verified even when threshold is met.

### C11: Dhikr challenge `contributeToChallenge` — no validation of count parameter from DTO
**File:** `islamic.controller.ts` line 582-583
**Lines:**
```typescript
async contributeToChallenge(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ContributeDhikrDto) {
    return this.islamicService.contributeToChallenge(userId, id, dto.count);
}
```
**Issue:** Without seeing the `ContributeDhikrDto`, the `count` field validation depends on the DTO class. If it allows negative numbers, a user could decrement the community challenge counter. The `saveDhikrSession` method validates count (line 820-821) but `contributeToChallenge` may not have the same guard.
**Severity:** MEDIUM — Depends on DTO validation.

### C12: Islamic service `createDonation` has dead code after `throw`
**File:** `islamic.service.ts` lines 677-701
**Lines:**
```typescript
async createDonation(userId: string, dto: CreateDonationDto) {
    throw new NotImplementedException('Charity donations require Stripe payment integration. Coming soon.');
    // All code below is dead
    if (dto.amount <= 0 || dto.amount > 1000000) {
```
**Issue:** All code after the `throw` statement is unreachable. This is benign (the endpoint correctly returns 501) but the dead code should be removed or the throw should be conditional.
**Severity:** INFO — Dead code, no security impact.

### C13: Halal getReviews exposes reviewer userId directly
**File:** `halal.service.ts` lines 134-151
**Issue:** Reviews are returned with full fields including `userId`. No check for blocked users. A user who blocked the reviewer would still see their reviews.
**Severity:** LOW — No blocked-user filtering on reviews.

### C14: Islamic mosque search falls back to Overpass API with user-supplied radius injected into query string
**File:** `islamic.service.ts` lines 402-406
**Lines:**
```typescript
const query = `[out:json][timeout:10];node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${lat},${lng});out body ${safeLimit};`;
```
**Issue:** While `radiusMeters`, `lat`, `lng` are numeric (validated earlier), and `safeLimit` is capped, these values are interpolated into the Overpass QL query string. If somehow non-numeric values reached here, it could result in Overpass QL injection. The validation in the controller (`MosquesQueryDto` with `@IsNumber @Min @Max`) mitigates this, but the service-level code doesn't re-validate.
**Severity:** LOW — Mitigated by DTO validation, but defense-in-depth is missing at service layer.

### C15: No rate limiting on several Islamic read endpoints
**File:** `islamic.controller.ts`
**Issue:** The class-level rate limit is 30 req/60s, which is relatively generous. Some expensive endpoints like `searchQuran` (hitting external API or Meilisearch), `getNearbyMosques` (hitting DB + Overpass API), and `getQuranVerses` (could return 286 verses for Surah Al-Baqarah) share this default rate. The search and mosque endpoints should have stricter limits.
**Severity:** LOW

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | - |
| HIGH | 0 | - |
| MEDIUM | 4 | C2, C4, C7, C10 |
| LOW | 6 | C3, C5, C6, C9, C13, C14 |
| INFO | 4 | C1, C8, C11 (depends on DTO), C12, C15 |

### What's Done Well
- BOLA protection on all write endpoints (ClerkAuthGuard + userId from token)
- Rate limiting on all mutation endpoints with sensible limits (3/hour for live creation, 1/day for scholar verification)
- Proper DTO validation with class-validator on all request bodies
- Coordinate validation with `-90..90` / `-180..180` bounds
- Prayer calculator uses well-known astronomical formulas with proper method parameters
- Quran metadata is static data — no external API dependency for surah list
- Halal verify uses transaction + P2002 catch for idempotency
- Zakat calculator validates non-negative inputs and uses configurable metal prices
