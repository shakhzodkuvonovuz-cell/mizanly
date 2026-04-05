# A37 -- Hostile Audit: Gamification & Retention Modules

**Scope:** `apps/api/src/modules/gamification/` (8 files) + `apps/api/src/modules/retention/` (6 files)
**Auditor:** Claude Opus 4.6 (hostile mode)
**Date:** 2026-04-05
**Files read:** Every line of every file in scope (14 files, ~1,125 lines production code + ~660 lines tests)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 7     |
| LOW      | 5     |
| INFO     | 4     |
| **Total**| **23**|

---

## CRITICAL

### C1. Achievement XP Reason Not In Prisma Enum -- DB Crash on Achievement Unlock

**File:** `gamification.service.ts` line 226
**Code:** `await this.awardXP(userId, 'achievement_unlocked', achievement.xpReward);`
**Issue:** The string `'achievement_unlocked'` is passed as the `reason` to `awardXP`, which writes it to `XPHistory.reason` (type `XPReason` enum). The Prisma schema `XPReason` enum (schema.prisma line 868-884) contains: `post_created, thread_created, reel_created, video_created, comment_posted, comment_helpful, quran_read, dhikr_completed, challenge_completed, streak_milestone_7, streak_milestone_30, streak_milestone_100, first_follower, verified, custom`. **`achievement_unlocked` is not a valid enum value.** Every achievement unlock will throw a Prisma runtime error (`Invalid value for argument reason`), causing the entire `unlockAchievement` call to fail after the `UserAchievement` row has already been created. The achievement record is saved but XP is never awarded -- and since `P2002` is caught on retry, the user can never get the XP.
**Impact:** Achievement XP rewards are completely broken. Every unlock attempt throws an unrecoverable DB error.
**Fix:** Add `achievement_unlocked` to the `XPReason` enum in the Prisma schema, or use `custom` as the reason.

### C2. Challenge Category Enum Mismatch -- DB Crash on Challenge Creation

**File:** `dto/gamification.dto.ts` line 12, `gamification.service.ts` line 321
**DTO validation:** `@IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']) challengeType` and `@IsIn(['quran', 'dhikr', 'photography', 'fitness', 'charity', 'community', 'learning', 'custom']) category`
**Prisma enum `ChallengeCategory`:** `QURAN, DHIKR, PHOTOGRAPHY, FITNESS, COOKING, LEARNING` (line 346-353)
**Issue:** Three-way mismatch:
1. DTO `category` values are lowercase (`quran`), but Prisma enum values are uppercase (`QURAN`). The service does `category: dto.category as ChallengeCategory` (line 321) which will pass TypeScript compilation but fail at runtime because Prisma will reject `'quran'` when the DB column expects `'QURAN'`.
2. DTO allows `charity`, `community`, `custom` -- none of which exist in the Prisma enum. Creating a challenge with any of these categories crashes.
3. Prisma has `COOKING` but the DTO does not offer it as a valid option.
**Impact:** Challenge creation fails for ALL categories because of case mismatch. Even if case were fixed, 3 DTO values would still crash. This means `createChallenge` is completely broken at the DB level.
**Fix:** Align DTO `@IsIn` values exactly with the Prisma `ChallengeCategory` enum values, using the correct case.

---

## HIGH

### H1. Queue-Based XP Award Has No Reason Validation -- Arbitrary XP Injection

**File:** `analytics.processor.ts` line 110-113
**Code:** `await this.gamification.awardXP(userId, action);` where `action` comes from `job.data.action` (line 111).
**Issue:** The `action` string comes from the BullMQ job payload. Any code that enqueues an `award-xp` job controls the `action` string. If `action` is set to an unknown reason, `awardXP` falls through to the default `?? 5` XP (line 137). There is no whitelist validation of `action` against `XP_REWARDS` keys before awarding. More critically, since `awardXP` accepts an optional `customAmount` parameter and the queue currently only passes `action`, any future refactor that adds `amount` to the job data would allow arbitrary XP injection via queue poisoning (e.g., SSRF to Redis that inserts a crafted job).
**Impact:** Medium-term: any service that can enqueue to the `analytics` queue can award XP with any reason string. The `reason` is cast to `XPReason` enum (line 160) so invalid reasons will crash -- but valid reasons can be replayed to farm XP.

### H2. Queue-Based Streak Update Bypasses Controller Whitelist

**File:** `analytics.processor.ts` line 116-119
**Code:** `await this.gamification.updateStreak(userId, action);` where `action` comes from `job.data.action`.
**Issue:** The controller enforces `VALID_STREAK_TYPES = ['posting', 'engagement', 'quran', 'dhikr', 'learning']` (controller line 16-17), but the queue path calls `updateStreak` directly with unvalidated `action`. The Prisma `StreakType` enum values are UPPERCASE (`POSTING`, `ENGAGEMENT`, etc.) while the controller whitelist is lowercase. The controller passes lowercase to the service, which casts with `as StreakType` -- this means the controller path also has a case mismatch that would cause DB errors, and the queue path has zero validation at all.
**StreakType enum:** `POSTING, ENGAGEMENT, QURAN, DHIKR, LEARNING` (schema line 293-299)
**Controller whitelist:** `['posting', 'engagement', 'quran', 'dhikr', 'learning']` -- lowercase
**Impact:** Either path (controller or queue) will produce `streakType` values that don't match the Prisma enum case, causing runtime DB errors. The queue path additionally has zero whitelist validation.

### H3. Challenge Progress Update Is Not Atomic -- TOCTOU Race

**File:** `gamification.service.ts` lines 369-427
**Issue:** `updateChallengeProgress` reads the participant (line 370-377), checks `completed` and `endDate` (lines 380-385), then does a separate `update` (line 401-407). Between the read and the write, a concurrent request could:
1. Complete the challenge (set `completed=true`) -- the second request's stale read still shows `completed=false`, allowing a second completion and double XP award.
2. The `update` at line 401 uses the compound key `challengeId_userId` without any optimistic concurrency check (no `WHERE completed = false`).
**Exploit:** Send 10 concurrent `PATCH /api/v1/challenges/:id/progress` requests all with `progress: 1` when at `progress = targetCount - 1`. All 10 reads see `completed: false`, all 10 compute `completed: true`, all 10 call `awardXP`. User receives 10x the challenge XP reward.
**Impact:** XP farming via concurrent challenge completion. At 500 XP per challenge (max `xpReward`), 10 concurrent requests = 5,000 XP per exploit.

### H4. Leaderboard Exposes PII Without Access Control

**File:** `gamification.controller.ts` line 74-81, `gamification.service.ts` lines 234-283
**Code:** `@UseGuards(OptionalClerkAuthGuard)` on leaderboard endpoint.
**Issue:** The leaderboard endpoint uses `OptionalClerkAuthGuard`, meaning unauthenticated users can access it. The response includes `user: { id, username, displayName, avatarUrl, isVerified }` for ALL users on the leaderboard. The `helpers` leaderboard at line 257-279 additionally does an unbounded `groupBy` on the entire `comment` table, which could be a performance concern. While leaderboards are typically public, the combination of user IDs + usernames + avatar URLs being enumerable without auth enables user enumeration and scraping.
**Impact:** Unauthenticated user enumeration. An attacker can scrape all active usernames and avatar URLs from `GET /api/v1/leaderboard?type=xp&limit=100` without authentication.

### H5. Series `category` Field Not Validated Against Prisma Enum

**File:** `dto/gamification.dto.ts` line 28, `gamification.service.ts` line 481
**DTO:** `@IsString() @MaxLength(50) category: string;` -- no `@IsIn` validation.
**Prisma enum `SeriesCategory`:** `DRAMA, DOCUMENTARY, TUTORIAL, COMEDY, ISLAMIC_SERIES` (schema line 588-594).
**Service:** `category: dto.category as SeriesCategory` (line 481) -- unsafe cast.
**Issue:** Any string up to 50 chars is accepted by the DTO. At the DB level, Prisma will reject any value not in the `SeriesCategory` enum, causing an unhandled error (500 response). But the DTO provides no user-friendly validation -- the user sees a cryptic Prisma error instead of a 400 Bad Request.
**Impact:** Poor error handling for invalid categories. If Prisma error serialization ever leaks details, it could expose schema information.

---

## MEDIUM

### M1. `removeEpisode` Is Dead Code -- No Controller Route

**File:** `gamification.service.ts` lines 530-543
**Issue:** The method `removeEpisode(userId, seriesId, episodeId)` exists in the service but has no corresponding controller endpoint. It is never called from any route. This is dead code that:
1. Cannot be reached by any API consumer.
2. Has no test coverage.
3. Will silently bitrot.
**Impact:** Series creators cannot remove episodes from their series via the API. If needed, the endpoint must be added.

### M2. Challenge `startDate` Not Enforced -- Challenges Can Start In The Past

**File:** `gamification.service.ts` lines 310-329
**Issue:** `createChallenge` accepts `startDate` and `endDate` as ISO strings and converts them to Date objects (lines 323-324), but never validates that:
1. `startDate` is in the future (or at least today).
2. `endDate` is after `startDate`.
3. The date range is reasonable (not 100 years long).
A user can create a challenge with `startDate: "2020-01-01"` and `endDate: "2020-01-02"` -- an already-ended challenge that will never be joinable. Or `startDate > endDate`, which is nonsensical.
**Impact:** Data pollution. Users can create invalid/expired challenges that clutter the browse list.

### M3. No Rate Limit on `PATCH /challenges/:id/progress` Specifically

**File:** `gamification.controller.ts` line 109-113
**Issue:** The `updateProgress` endpoint inherits the class-level throttle of `30 req/60s` (line 21). While the progress increment is capped at 1 per request, 30 requests per minute still allows 30 progress increments per minute per challenge. For a challenge with `targetCount: 30`, a user can complete it in exactly 1 minute by sending 30 requests. The class-level throttle does not distinguish between "increment my challenge" and "browse challenges" -- they share the same rate limit bucket.
**Impact:** Challenges intended to span days/weeks (e.g., "30 Day Quran Challenge") can be completed in 1 minute by rapid-fire API calls. The MAX_INCREMENT=1 check prevents big jumps but doesn't prevent rapid small increments.

### M4. `participantCount` Can Go Negative via Race in `leaveChallenge`

**File:** `gamification.service.ts` lines 444-473
**Issue:** The `leaveChallenge` method does `decrement: 1` inside a transaction (line 459), then separately does an `updateMany` to fix negative counts (lines 468-470). However:
1. The fix-up query runs OUTSIDE the transaction, so there's a window where `participantCount` is negative.
2. Concurrent leave+join could result in: leave decrements to -1, fix-up sets to 0, but join increments to 1 when the true count should be 0.
3. The `P2025` catch at line 462 swallows the error when the participant was already deleted, but the `challenge.update` (decrement) at line 457 may have already executed before the `challengeParticipant.delete` throws -- leaving the count decremented without a corresponding participant removal (the transaction should be atomic, but the `P2025` could be from the delete, not the decrement).
**Impact:** `participantCount` can drift from the actual count of `ChallengeParticipant` rows over time.

### M5. Session Depth Redis Key Is User-Controllable Date Shard

**File:** `retention.service.ts` line 33
**Code:** `const key = \`session:${userId}:${new Date().toISOString().slice(0, 10)}\`;`
**Issue:** While `userId` comes from the auth token (not user-controllable), the date is server-generated so the key itself is safe. However, the endpoint has no deduplication -- a client can call `POST /retention/session-depth` 30 times per minute (rate limit) with arbitrary `scrollDepth`, `timeSpentMs`, `interactionCount` values. Each call does `LPUSH` to Redis, creating an unbounded list. Over 7 days at 30 req/min = 302,400 entries per user. For 10K users: 3 billion entries in Redis.
**Impact:** Redis memory exhaustion via legitimate-looking session depth spam. No per-user list length cap.

### M6. XP History Cursor Pagination Allows Enumeration Without Limit On Date Range

**File:** `gamification.service.ts` lines 167-187
**Issue:** `getXPHistory` uses cursor-based pagination but does not filter by date range. An attacker can paginate through the ENTIRE XP history of their own account. While this is their own data, the query at line 173-177 does a `findMany` with only `userXPId` as filter. For a user with 100K XP events (achievable via queue farming), each page query is a sequential scan on `xp_history` by `userXPId` + `createdAt DESC`. No early termination or date range restriction.
**Impact:** Self-DoS potential. A user with large XP history can create expensive paginated queries.

### M7. No Authorization Check on `getSeries` -- Returns Any Series Including Draft/Private

**File:** `gamification.service.ts` lines 485-496, `gamification.controller.ts` lines 159-163
**Issue:** `getSeries` at line 159 uses `OptionalClerkAuthGuard` and retrieves any series by ID without checking visibility status. The `Series` model has an `isComplete` field but no `isPublished` or `isDraft` field. However, any series created by any user is immediately visible to all users (including unauthenticated ones) via `GET /api/v1/series/:id`. There is no mechanism for a creator to save a draft series before publishing.
**Impact:** Low -- no visibility controls exist in the schema, so this is a design gap rather than a bypass. But creators cannot prepare series content before going live.

---

## LOW

### L1. `awardXP` with `customAmount=0` Returns `getXP()` Without Transaction

**File:** `gamification.service.ts` lines 137-138
**Code:** `if (amount <= 0) return this.getXP(userId);`
**Issue:** When `customAmount` is 0 or negative, the method early-returns by calling `this.getXP(userId)` which creates a new `UserXP` record if none exists (line 123). This creation happens outside any transaction context. If `awardXP` is called concurrently with `customAmount=0`, two `create` calls could race and one would fail with a unique constraint violation (since `UserXP.userId` is `@unique`). The error is unhandled.
**Impact:** Rare edge case. Non-positive amounts should never reach `awardXP` in normal flow, but the analytics queue could route one if a job has no matching `XP_REWARDS` key and no `customAmount`.

### L2. `backgroundUrl` and `backgroundMusic` Accept Any URL -- SSRF Vector

**File:** `dto/gamification.dto.ts` lines 46-47
**Code:** `@IsUrl() backgroundUrl` and `@IsUrl() backgroundMusic`
**Issue:** `@IsUrl()` validates URL format but does not restrict the scheme or domain. A user can set `backgroundUrl: "file:///etc/passwd"` or `backgroundUrl: "http://169.254.169.254/latest/meta-data/"` (AWS metadata endpoint). If any server-side component ever fetches this URL (e.g., for thumbnail generation, proxy, or SSR), it becomes an SSRF vulnerability. Currently the URLs appear to be stored and returned as-is to the client, so this is a latent SSRF risk rather than an active one.
**Impact:** Latent. No server-side fetch of these URLs exists today, but storing arbitrary URLs in the DB creates future risk.

### L3. `AddEpisodeDto` Has No Mutual Exclusivity on `postId`, `reelId`, `videoId`

**File:** `dto/gamification.dto.ts` lines 31-36
**Issue:** All three fields (`postId`, `reelId`, `videoId`) are optional. A client can:
1. Send all three, linking one episode to a post AND a reel AND a video simultaneously.
2. Send none, creating an episode with no content link at all.
Neither case is validated. The schema allows all three to be null or all to be set.
**Impact:** Data integrity issue. Episodes with zero or multiple content links are nonsensical.

### L4. Episode Number Assignment Has TOCTOU Race

**File:** `gamification.service.ts` lines 504-527
**Issue:** `addEpisode` reads the last episode number (line 504-507) then creates a new episode with `number: (lastEpisode?.number || 0) + 1` (line 512). Two concurrent `addEpisode` calls will both read the same `lastEpisode.number` and both try to create episodes with the same number. The `@@unique([seriesId, number])` constraint on `SeriesEpisode` (schema line 4079) will cause one to fail with P2002. This error is NOT caught in `addEpisode` -- it will bubble up as a 500 Internal Server Error.
**Impact:** Concurrent episode additions fail with unhandled error. Unlikely in practice (single creator) but possible with automated tools.

### L5. Streak Date Comparison Uses `Math.round` -- Off-By-One At Midnight

**File:** `gamification.service.ts` line 84
**Code:** `const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));`
**Issue:** `Math.round` is used on the millisecond difference divided by 86400000. Since both dates are normalized to midnight UTC (lines 66, 82), the division should always produce an exact integer. However, if `lastActiveDate` is stored with sub-day precision (e.g., a Date column instead of a Date-only column), `Math.round` could round 0.9999 days to 1 or 1.0001 days to 1. The Prisma schema declares `lastActiveDate DateTime @db.Date` so it should be date-only, but the `update` writes `today` which is a full DateTime (`new Date(todayStr + 'T00:00:00.000Z')`). If the DB stores this with time component, rounding errors are possible. Using `Math.floor` would be more defensive.
**Impact:** Edge case. Could cause a streak to continue when it should have broken, or break when it should have continued, around midnight UTC.

---

## INFO

### I1. `GamificationController` Has No Route Prefix -- Routes Live at API Root

**File:** `gamification.controller.ts` line 20-21
**Code:** `@Controller()` -- empty prefix.
**Issue:** All gamification routes are mounted at the API root: `/api/v1/streaks`, `/api/v1/xp`, `/api/v1/challenges`, `/api/v1/series`, `/api/v1/leaderboard`, `/api/v1/profile-customization`. This is a deliberate design choice, but it means these routes could conflict with future top-level routes. A prefix like `gamification` would namespace them.
**Impact:** Naming collision risk as the API grows.

### I2. Retention Module Has Only 1 Endpoint -- Minimal Surface

**File:** `retention.controller.ts`, `retention.service.ts`
**Issue:** The retention module was gutted (per the comment at line 7-9 of `retention.service.ts`) -- 8 methods were removed as dead code. Only `trackSessionDepth` remains. The module is essentially a single Redis LPUSH behind an authenticated endpoint. This is architecturally fine but represents minimal functionality.
**Impact:** None. Documenting for completeness.

### I3. `getAchievements` Returns ALL Achievements With No Pagination

**File:** `gamification.service.ts` lines 191-207
**Issue:** `getAchievements` fetches ALL achievements (with `take: 50` cap) and ALL user achievements (with `take: 50` cap), then joins them in memory. If the achievement count grows beyond 50, the response will silently truncate. No cursor pagination is provided.
**Impact:** Functional limitation. Will need pagination if achievement count exceeds 50.

### I4. `getChallenges` Cursor Uses `id < cursor` -- Requires Ordered UUIDs

**File:** `gamification.service.ts` lines 287-307
**Code:** `if (cursor) where.id = { lt: cursor };` (line 290)
**Issue:** Cursor pagination using `id < cursor` with UUIDs relies on UUIDs being lexicographically ordered by creation time. Standard v4 UUIDs are random and NOT time-ordered. Prisma's `@default(uuid())` generates v4 UUIDs. This means cursor pagination will skip and duplicate records unpredictably. The `orderBy: { participantCount: 'desc' }` at line 293 further conflicts with the `id < cursor` filter -- the cursor is filtering by ID order while the sort is by participantCount, so the two orderings are unrelated.
**Impact:** Pagination is broken. Pages will have inconsistent/missing results. The same issue affects `getDiscoverSeries` (line 582) and `getXPHistory` (line 173, though that one at least sorts by `createdAt` which may correlate with ID order).

---

## Checklist Coverage

| # | Checklist Item | Findings |
|---|---------------|----------|
| 1 | XP manipulation (can user grant themselves XP?) | H1: Queue path has no reason whitelist. H3: Race condition allows multi-completion XP. C1: achievement_unlocked crashes. No direct user-facing XP grant endpoint exists (good). |
| 2 | Level skip (can user jump levels?) | Level calculation is correct via `getLevelForXP` (line 34-38). Level is re-calculated from totalXP on every award. No skip possible IF XP is correct. But H3 allows inflated XP which leads to inflated level. |
| 3 | Streak manipulation | H2: Queue path has no streak type validation + case mismatch. L5: Math.round edge case. Controller path correctly validates type but wrong case. |
| 4 | Achievement unlock race conditions | Handled correctly via P2002 catch (line 219). Concurrent unlocks return null. However, C1 means the XP award always fails anyway. |
| 5 | Rate limit on XP actions | M3: Progress endpoint shares class-level 30/min throttle. XP is only awarded server-side (no direct award endpoint), but rapid progress updates enable fast completion. |
| 6 | Counter atomicity | XP: atomic via `upsert` with `{ increment }` (good). Streaks: atomic via `$executeRaw` (good). M4: participantCount can go negative. Episode count uses transaction (good). |
| 7 | Leaderboard pagination | No pagination on leaderboard -- hardcapped at 100 entries. I4: Cursor pagination on challenges/series is broken due to UUID ordering. |
| 8 | BOLA on achievements | No BOLA: achievements are read-only (all users see same list), unlocks are server-triggered (no direct user endpoint to unlock). getAchievements filters by userId from auth token. |
