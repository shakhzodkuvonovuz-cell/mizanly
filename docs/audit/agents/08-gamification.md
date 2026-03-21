# Audit Agent #8: Gamification/Retention — Deep Line-by-Line Findings

**Scope:** `apps/api/src/modules/gamification/`, `apps/api/src/modules/stickers/`, `apps/api/src/modules/retention/`
**Files audited:** 15 files (3 services, 3 controllers, 3 modules, 3 DTOs, 6 test files)
**Total findings: 52**

---

## CRITICAL (P0) — 6 findings

### 1. `prisma.streak` model does not exist — runtime crash
**File:** `apps/api/src/modules/retention/retention.service.ts`, line 59
**Category:** Runtime crash / Non-existent model
**Severity:** P0
**Description:** The `getUsersWithExpiringStreaks()` method calls `this.prisma.streak.findMany(...)` but NO `Streak` model exists in the Prisma schema. The only streak model is `UserStreak`. This will crash at runtime with a `TypeError: Cannot read properties of undefined (reading 'findMany')`. The entire streak-expiration notification pipeline is dead.
```typescript
const activeStreaks = await this.prisma.streak.findMany({
  // 'streak' is not a Prisma model — should be 'userStreak'
```
**Also:** The query references `currentStreak` and `lastActivityAt` fields that don't exist on `UserStreak`. The correct fields are `currentDays` and `lastActiveDate`.
**Fix:** Replace `this.prisma.streak` with `this.prisma.userStreak` and update field names.

### 2. Duplicate `lastActiveAt` key in Prisma `where` clause — second overwrites first
**File:** `apps/api/src/modules/retention/retention.service.ts`, lines 98-100
**Category:** Logic bug / Silent data loss
**Severity:** P0
**Description:** The `getSocialFomoTargets()` method has a Prisma `where` clause with two `lastActiveAt` keys. In JavaScript objects, duplicate keys cause the second to silently overwrite the first. This means the `{ lt: oneDayAgo }` condition is completely ignored, and only `{ gte: weekAgo }` applies — so the query returns ALL users active in the last week, not just inactive ones.
```typescript
where: {
  isDeactivated: false,
  lastActiveAt: { lt: oneDayAgo },       // IGNORED — overwritten by next line
  lastActiveAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },  // Overwrites
},
```
**Fix:** Combine into a single `lastActiveAt: { lt: oneDayAgo, gte: weekAgo }`.

### 3. Unlimited XP farming — no rate limit on awardXP or streak update endpoints
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`, lines 32-39, 44-49
**Category:** Abuse vector / XP farming exploit
**Severity:** P0
**Description:** The `POST streaks/:type` and `GET xp` endpoints have no per-route `@Throttle` decorator. Combined with the fact that the streak update only checks by date (not per-second), a user can repeatedly call `POST streaks/:type` and trigger `awardXP()` on streak milestones. While the service does de-duplicate same-day streak updates, the global throttle of 100 req/min still allows rapid XP-farming through other vectors:
- Any service can call `awardXP()` directly (it's exported). There are no anti-abuse checks.
- The `awardXP()` method accepts negative `customAmount` (line 128-129) — it uses `|| 5` which means `customAmount=0` falls through to the lookup table or default 5. Negative values like `-100` pass through and *decrement* XP via `{ increment: -100 }`.
- No daily/hourly cap on XP earned — a bot could create 1000 posts/hour and earn 10,000 XP.
**Fix:** Add per-action rate limits, daily XP cap, and validate `customAmount > 0`.

### 4. SVG XSS vector in AI-generated stickers — no sanitization
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 308-346
**Category:** XSS / Security
**Severity:** P0
**Description:** The `generateStickerSVG()` method receives raw SVG from the Claude API response and stores it as a base64 data URI. The SVG is extracted via regex `/<svg[\s\S]*?<\/svg>/i` but is NEVER sanitized. SVG can contain `<script>`, `onload`, `onerror`, `xlink:href="javascript:..."`, and other XSS payloads. Even if the LLM doesn't intentionally generate malicious SVG, prompt injection could cause it. The SVG is then served directly to clients as a `data:image/svg+xml;base64,...` URI which will execute JavaScript in most browsers.
```typescript
const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
// No sanitization — raw SVG stored and served to clients
const encoded = Buffer.from(svgCode).toString('base64');
imageUrl = `data:image/svg+xml;base64,${encoded}`;
```
**Fix:** Use a server-side SVG sanitizer (e.g., DOMPurify with jsdom) to strip scripts, event handlers, and dangerous elements before storing.

### 5. Fallback sticker SVG injection via user prompt text
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 348-365
**Category:** XSS / Injection
**Severity:** P0
**Description:** The `generateFallbackSticker()` method inserts the user's `prompt` directly into an SVG `<text>` element with NO escaping. An attacker can craft a prompt containing `</text><script>alert(1)</script>` to inject arbitrary SVG/HTML. The blocked-terms list only checks for a few content-moderation words, not XSS payloads.
```typescript
const displayText = prompt.length > 20 ? prompt.slice(0, 20) + '...' : prompt;
// displayText is raw user input — injected directly into SVG
const svg = `<svg ...>
  <text ...>${displayText}</text>   // XSS injection point
</svg>`;
```
**Fix:** XML-escape the `displayText` (replace `<`, `>`, `&`, `"`, `'`).

### 6. `series/continue-watching` route shadowed by `series/:id` wildcard
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`, lines 135-191
**Category:** Routing bug / Feature broken
**Severity:** P0
**Description:** The `@Get('series/continue-watching')` route is defined AFTER `@Get('series/:id')` (line 135). NestJS evaluates routes in declaration order — so `GET /series/continue-watching` will be matched by the `:id` wildcard first, with `id = "continue-watching"`. The continue-watching endpoint is unreachable. Similarly, `@Get('series/discover')` is fine because it's declared before `series/:id`.
```typescript
@Get('series/:id')         // line 135 — catches ALL /series/* routes
getSeries(...)

// ... later ...

@Get('series/continue-watching')   // line 186 — NEVER REACHED
continueWatching(...)
```
**Fix:** Move `@Get('series/continue-watching')` BEFORE `@Get('series/:id')`.

---

## HIGH (P1) — 12 findings

### 7. Duplicate method name `updateProgress` — TypeScript class method override
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`, lines 103, 168
**Category:** Code defect / Method shadowing
**Severity:** P1
**Description:** Two methods are named `updateProgress` in the same class: one for challenge progress (line 103) and one for series progress (line 168). In JavaScript/TypeScript, the second definition silently overrides the first. The challenge progress endpoint `PATCH challenges/:id/progress` will call the series progress handler instead, which expects different parameters (`body.episodeNum, body.timestamp` instead of `dto.progress`).
**Fix:** Rename the second to `updateSeriesProgress`.

### 8. `createPack` endpoint has no admin/owner check — any user can create sticker packs
**File:** `apps/api/src/modules/stickers/stickers.controller.ts`, lines 30-35
**Category:** Authorization missing
**Severity:** P1
**Description:** The `POST /stickers/packs` endpoint creates sticker packs globally visible to all users but requires only basic authentication (`ClerkAuthGuard`). There is no admin role check or pack-ownership tracking. Any authenticated user can create unlimited packs that appear in the global browse/search results.
```typescript
async createPack(@Body() dto: CreateStickerPackDto) {
  return this.stickers.createPack(dto);
  // No userId captured, no admin check, no ownership
}
```
**Fix:** Either restrict to admin users or track `createdById` on packs.

### 9. `deletePack` endpoint has no admin/owner check — any user can delete any pack
**File:** `apps/api/src/modules/stickers/stickers.controller.ts`, lines 66-73
**Category:** Authorization missing / IDOR
**Severity:** P1
**Description:** The `DELETE /stickers/packs/:id` endpoint comment says "(admin)" but has NO admin guard. Any authenticated user can delete any sticker pack by ID. Since packs are global resources, this is a destructive privilege escalation.
```typescript
@ApiOperation({ summary: 'Delete pack (admin)' })
async deletePack(@Param('id') id: string) {
  return this.stickers.deletePack(id);  // No ownership/admin check
}
```

### 10. Challenge `updateChallengeProgress` accepts absolute progress values — allows skipping to completion
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 341-366
**Category:** Game logic exploit
**Severity:** P1
**Description:** The `updateChallengeProgress` method accepts an absolute `progress` number from the client, not an increment. A user can skip directly to completion by sending `progress: 10000` (the DTO allows up to 100,000). The server clamps to `targetCount` but awards full XP for "completing" the challenge instantly.
```typescript
const newProgress = Math.min(progress, participant.challenge.targetCount);
const completed = newProgress >= participant.challenge.targetCount;
// XP awarded immediately — no verification of actual challenge completion
```
**Fix:** Either (a) only accept increments, or (b) verify progress against actual user actions (e.g., post count, Quran reads).

### 11. Leaderboard `limit` parameter has no upper bound
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`, line 73; `gamification.service.ts`, line 222
**Category:** Denial of Service
**Severity:** P1
**Description:** The `GET /leaderboard?limit=999999` endpoint passes `limit` directly to Prisma `take`. An attacker can request the entire user table by setting `limit=1000000`. The service defaults to 50 but does NOT cap user-provided values.
```typescript
async getLeaderboard(type: string, limit = 50) {
  // 'limit' is user-controlled with no upper bound check
  return this.prisma.userXP.findMany({ take: limit, ... });
}
```
**Fix:** Add `const safeLim = Math.min(limit, 100);`.

### 12. No validation on `challengeType` and `category` fields
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts`, lines 11-12
**Category:** Input validation missing
**Severity:** P1
**Description:** `CreateChallengeDto.challengeType` and `category` are only `@IsString()` with no `@IsIn()` constraint. Users can set arbitrary values like `challengeType: "hack"`, `category: "<script>alert(1)</script>"`. The Prisma schema uses String type so any value is accepted.
```typescript
@ApiProperty() @IsString() challengeType: string;  // Should be @IsIn(['daily','weekly','monthly','custom'])
@ApiProperty() @IsString() category: string;        // Should be @IsIn(['quran','dhikr','photography',...])
```

### 13. `startDate` and `endDate` in challenge DTO lack date validation
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts`, lines 15-16
**Category:** Input validation missing
**Severity:** P1
**Description:** `startDate` and `endDate` are typed as `@IsString()` but should be `@IsDateString()`. Invalid date strings like `"not-a-date"` will cause `new Date("not-a-date")` to produce `Invalid Date`, which is then stored in the database. Also, there is no validation that `endDate > startDate` or `startDate >= today`.
```typescript
@ApiProperty() @IsString() startDate: string;  // Should be @IsDateString()
@ApiProperty() @IsString() endDate: string;     // Should be @IsDateString() + custom validation
```

### 14. URL fields in DTOs lack `@IsUrl()` validation — SSRF/XSS risk
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts`, lines 10, 25, 40-41
**File:** `apps/api/src/modules/stickers/dto/create-pack.dto.ts`, lines 8, 24-25
**Category:** Input validation / SSRF
**Severity:** P1
**Description:** Multiple URL fields across DTOs use only `@IsString()` without `@IsUrl()`:
- `CreateChallengeDto.coverUrl` (line 10)
- `CreateSeriesDto.coverUrl` (line 25)
- `UpdateProfileCustomizationDto.backgroundUrl` (line 40)
- `UpdateProfileCustomizationDto.backgroundMusic` (line 41)
- `StickerItemDto.url` (create-pack.dto.ts line 8)
- `CreateStickerPackDto.coverUrl` (line 24)
These accept `javascript:` URIs, `file://` paths, and internal network URLs (`http://169.254.169.254/...`) which could be used for SSRF or stored XSS.

### 15. Retention `trackSessionDepth` body has ZERO DTO validation
**File:** `apps/api/src/modules/retention/retention.controller.ts`, lines 20-28
**Category:** Input validation missing
**Severity:** P1
**Description:** The `POST /retention/session-depth` endpoint accepts a raw inline body type `{ scrollDepth: number; timeSpentMs: number; interactionCount: number; space: string }` instead of a validated DTO class. NestJS does NOT apply `class-validator` to inline types — any shape of data is accepted. An attacker could send `{ scrollDepth: "DROP TABLE", space: 99999 }`.
```typescript
@Body() body: {
  scrollDepth: number;      // NOT validated — could be string, object, etc.
  timeSpentMs: number;      // NOT validated
  interactionCount: number; // NOT validated
  space: string;            // NOT validated — no @IsIn(['saf','majlis',etc.])
},
```
**Fix:** Create a proper DTO class with `class-validator` decorators.

### 16. Series progress `PUT /series/:id/progress` uses inline body type — no validation
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`, lines 168-174
**Category:** Input validation missing
**Severity:** P1
**Description:** The body type `{ episodeNum: number; timestamp: number }` is inline and bypasses all class-validator. A client can send negative numbers, strings, or absurdly large values without any server-side check.

### 17. `unfollowSeries` can decrement `followersCount` below zero
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 455-466
**Category:** Data integrity
**Severity:** P1
**Description:** The `unfollowSeries` method decrements `followersCount` without checking if the user was actually following. If the `SeriesFollower.delete` succeeds but was already deleted (race condition), or if called without prior follow, the count can go negative. Unlike `followSeries` which catches P2002, `unfollowSeries` does NOT catch P2025.
```typescript
await this.prisma.$transaction([
  this.prisma.seriesFollower.delete({ ... }),  // Throws P2025 if not following
  this.prisma.series.update({
    data: { followersCount: { decrement: 1 } },  // Goes negative
  }),
]);
```
**Fix:** Wrap in try/catch for P2025, or use `Math.max(0, ...)` pattern.

### 18. Sticker content-moderation blocklist is trivially bypassable
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 9-13, 141-146
**Category:** Content safety / Bypass
**Severity:** P1
**Description:** The `BLOCKED_TERMS` list uses exact substring matching with `.includes()`. Attackers can bypass it with Unicode lookalikes (e.g., `p0rn`, `s3x`), zero-width characters, or word boundaries (e.g., `violence` is blocked but `v-i-o-l-e-n-c-e` is not). The list is also incomplete — missing terms like `terrorism`, `kill`, `knife`, `suicide`, `hate`, `racist`.
```typescript
for (const term of BLOCKED_TERMS) {
  if (lowerPrompt.includes(term)) {  // Trivially bypassable
```

---

## MEDIUM (P2) — 16 findings

### 19. `awardXP` with `customAmount=0` awards 5 XP (falsy fallback)
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, line 129
**Category:** Logic bug
**Severity:** P2
**Description:** `const amount = customAmount || XP_REWARDS[reason] || 5;` — the `||` operator treats `0` as falsy, so passing `customAmount=0` (which should mean "no XP") falls through to the lookup table or default 5. Should use `??` (nullish coalescing).
```typescript
const amount = customAmount || XP_REWARDS[reason] || 5;
// customAmount=0 → falls through to lookup → awards 5 XP instead of 0
```

### 20. `awardXP` allows negative XP — no minimum validation
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, line 128-129
**Category:** Abuse vector
**Severity:** P2
**Description:** Neither the service nor the DTO validates that `customAmount > 0`. Calling `awardXP(userId, 'test', -1000)` will decrement XP via `{ increment: -1000 }`, potentially making totalXP negative. This is confirmed by the edge test on line 64-71 which acknowledges the bug.

### 21. Level recalculation is not atomic — race condition
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 133-146
**Category:** Race condition
**Severity:** P2
**Description:** After the `upsert` atomically increments XP, the level recalculation reads `xp.totalXP` and does a separate `update`. Between the upsert and the update, another concurrent `awardXP` could change `totalXP` again, making the level calculation stale. The two operations should be in a transaction or use a single raw SQL update.

### 22. `challenges/me` route comes AFTER `challenges/:id` pattern — potentially shadowed
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`, lines 93-112
**Category:** Routing risk
**Severity:** P2
**Description:** `@Get('challenges/me')` is defined at line 107, after `@Post('challenges/:id/join')` (line 93) and `@Patch('challenges/:id/progress')` (line 100). While these are different HTTP methods (POST/PATCH vs GET), a future `@Get('challenges/:id')` would shadow `challenges/me`. This is a maintenance risk — the pattern should have `me` before `:id` routes.

### 23. Streak milestone XP fire-and-forget — silently lost on failure
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 96-98
**Category:** Data loss / Silent failure
**Severity:** P2
**Description:** Streak milestone XP awards use `.catch()` to swallow errors. If the XP award fails (e.g., DB connection issue), the user loses their milestone bonus with only a log message. No retry, no notification, no compensation.
```typescript
this.awardXP(userId, 'streak_milestone_7').catch((e) => this.logger.error('Streak XP award failed', e));
```

### 24. Sticker pack count mismatch — `stickersCount` not atomically updated
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 229-244
**Category:** Data integrity
**Severity:** P2
**Description:** In `saveGeneratedSticker()`, the sticker count is read via `count()`, a new sticker is created, then `stickersCount` is incremented. These three operations are not in a transaction — concurrent saves could produce incorrect position values and counts.

### 25. "My Stickers" pack lookup by name with userId embedded — fragile pattern
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 211-227
**Category:** Design smell / Fragility
**Severity:** P2
**Description:** The "My Stickers" pack is identified by matching `name: 'My Stickers - ${userId}'`. If the name is ever changed, truncated (VARCHAR(100) limit could be hit with long user IDs), or duplicated, the lookup breaks. Should use a dedicated `ownerId` field on the pack model.

### 26. `searchPacks` with empty query returns empty — should return all or reject
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 61-66
**Category:** UX bug
**Severity:** P2
**Description:** `searchPacks('')` performs a `contains: ''` query which matches all records in most databases, but the edge test mocks it to return `[]`. The behavior is inconsistent and undocumented.

### 27. `getRecentStickers` is expensive — loads ALL sticker packs with ALL stickers
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 102-105
**Category:** Performance
**Severity:** P2
**Description:** `getRecentStickers` calls `getMyPacks(userId)` which fetches up to 50 packs with ALL their stickers, then `flatMap`s and `slice`s to 30. For a user with 50 packs of 100 stickers each, this loads 5,000 sticker records just to return 30.
**Fix:** Use a direct query with `take: 30` ordering by `addedAt` or `usedAt`.

### 28. `getLeaderboard('helpers')` returns results in wrong order after user lookup
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 244-265
**Category:** Logic bug
**Severity:** P2
**Description:** The `helpers` leaderboard does `groupBy` sorted by likes, then fetches users with `findMany({ where: { id: { in: userIds } } })`. The user lookup does NOT preserve the original order — Prisma returns users in arbitrary order. The `topCommenters.map()` preserves the order but `userMap.get(c.userId)` could return `undefined` for deleted users, producing `{ user: undefined, score: 0 }` entries.

### 29. `GamificationController` has empty `@Controller()` — no route prefix
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`, line 19
**Category:** Routing / API design
**Severity:** P2
**Description:** The controller uses `@Controller()` with NO prefix. Combined with the global `/api/v1/` prefix, all gamification routes are at the root level: `/api/v1/streaks`, `/api/v1/xp`, `/api/v1/challenges`, `/api/v1/series`. This pollutes the root namespace and could conflict with other modules. Should use `@Controller('gamification')`.

### 30. `RetentionController` double-prefixes routes
**File:** `apps/api/src/modules/retention/retention.controller.ts`, line 9
**Category:** Routing bug
**Severity:** P2
**Description:** `@Controller('api/v1/retention')` combined with the global `app.setGlobalPrefix('api/v1')` produces routes at `/api/v1/api/v1/retention/session-depth`. This means the retention endpoint is unreachable at the expected path.
```typescript
@Controller('api/v1/retention')  // Should be @Controller('retention')
```

### 31. `isInJummahGracePeriod` uses server UTC time, not user's local time
**File:** `apps/api/src/modules/retention/retention.service.ts`, lines 139-143
**Category:** Logic bug
**Severity:** P2
**Description:** The Jummah grace period check uses `new Date().getHours()` which is server-local (or UTC). Jummah prayer time varies by timezone (12:00-14:00 in Saudi Arabia is different from 12:00-14:00 in New York). The function should accept a timezone parameter.

### 32. `canSendNotification` quiet hours use server time, not user timezone
**File:** `apps/api/src/modules/retention/retention.service.ts`, lines 185-194
**Category:** Logic bug
**Severity:** P2
**Description:** Same issue as above — `new Date().getHours()` returns server time. A user in UTC+10 would receive notifications at 8 AM server time (6 PM their time) but be blocked at 12 PM server time (10 PM their time) even though it's only 10 PM server time, not 10 PM for them.

### 33. Weekly summary aggregation includes soft-deleted/removed posts
**File:** `apps/api/src/modules/retention/retention.service.ts`, lines 215-229
**Category:** Data accuracy
**Severity:** P2
**Description:** The `getWeeklySummary` aggregates all posts/reels in the last 7 days without filtering `isRemoved: false` or `isHidden: false`. Deleted/hidden content inflates creator analytics.

### 34. Notification frequency cap `incr` without initial `expire` — TTL reset on every notification
**File:** `apps/api/src/modules/retention/retention.service.ts`, lines 200-204
**Category:** Logic bug
**Severity:** P2
**Description:** `trackNotificationSent` calls `redis.incr(key)` then `redis.expire(key, 86400)`. Every notification sent resets the TTL to 24 hours from NOW instead of from midnight. A user receiving notifications at 11:59 PM would have their counter persist until 11:59 PM the next day, potentially blocking legitimate notifications.
**Fix:** Use `redis.set(key, 1, 'EX', secondsUntilMidnight, 'NX')` or check expiry before resetting.

---

## LOW (P3) — 18 findings

### 35. `getXP` creates a new record on read — side effect in GET
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 112-126
**Category:** Side effect in read operation
**Severity:** P3
**Description:** `getXP()` creates a `UserXP` record if none exists. This is a write side-effect in what should be a read-only operation called by `GET /xp`. Could cause issues with read replicas or caching.

### 36. `getProfileCustomization` creates record on read — same issue
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 565-571
**Category:** Side effect in read operation
**Severity:** P3

### 37. XP history cursor uses `{ lt: cursor }` on ID — incorrect for UUID-based IDs
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, line 160
**Category:** Pagination bug
**Severity:** P3
**Description:** The `getXPHistory` method uses `id: { lt: cursor }` for cursor-based pagination. Since `XPHistory.id` uses `@default(uuid())`, UUID comparison with `lt` is NOT chronological — UUIDs are random. This produces inconsistent/missing results.
**Fix:** Use `createdAt` cursor or sequential IDs.

### 38. `LEVEL_THRESHOLDS` array has only 20 levels — max level is 20
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 23-26
**Category:** Design limitation
**Severity:** P3
**Description:** Only 20 level thresholds defined. After level 20 (65,000 XP), `getXPForNextLevel` returns `65000 + 10000 = 75000`. But `getLevelForXP(75000)` still returns 20 — the user is stuck at level 20 forever. Progress bar shows 100% permanently.

### 39. Achievement `criteria` field is JSON text but never parsed or evaluated
**File:** Prisma schema line 2882; `gamification.service.ts` lines 197-218
**Category:** Dead feature
**Severity:** P3
**Description:** The `Achievement` model has a `criteria` field (`@db.Text`) described as "JSON criteria for unlocking" but `unlockAchievement()` never reads or validates this field. Achievements are unlocked purely by calling `unlockAchievement(userId, key)` — the criteria is decorative.

### 40. Challenge `participantCount` can go negative (no leave/unjoin endpoint)
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 314-336
**Category:** Data integrity
**Severity:** P3
**Description:** There is NO endpoint to leave a challenge. The `participantCount` is incremented on join but never decremented. If a leave feature is added later, the same negative-count bug as `unfollowSeries` would apply.

### 41. `Series.category` field has no enum constraint
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts`, line 27
**Category:** Input validation
**Severity:** P3
**Description:** `CreateSeriesDto.category` is `@IsString()` without `@IsIn()`. Should be constrained to valid categories.

### 42. `accentColor` validation allows non-hex values
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts`, line 38
**Category:** Input validation
**Severity:** P3
**Description:** `accentColor` has `@MaxLength(7)` but no `@Matches(/^#[0-9a-fA-F]{6}$/)` to validate hex color format. Values like `"notaclr"` would be stored.

### 43. `createChallenge` uses `...dto` spread — passes unexpected fields to Prisma
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 303-312
**Category:** Mass assignment risk
**Severity:** P3
**Description:** The `createChallenge` method does `...dto` spread into Prisma `data`. If DTO validation is loose (which it is — `challengeType` and `category` are arbitrary strings), extra fields passed by the client could leak into the database if the Prisma model has matching column names.

### 44. `updateStreak` longestDays update is not atomic — race with concurrent updates
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 88-93
**Category:** Race condition
**Severity:** P3
**Description:** After incrementing `currentDays`, the code reads the updated value and conditionally updates `longestDays` in a separate query. Concurrent streak updates could cause `longestDays` to not be properly updated.

### 45. `getAchievements` fetches ALL achievements globally — no pagination
**File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 179-195
**Category:** Performance / Scalability
**Severity:** P3
**Description:** Fetches all achievements (capped at `take: 50`) and all user unlocks in two queries, then merges in memory. Fine for 50 achievements, but if the list grows beyond 50, users won't see all achievements.

### 46. `StickerItemDto.url` has no `@MaxLength` — can store arbitrarily large data URIs
**File:** `apps/api/src/modules/stickers/dto/create-pack.dto.ts`, line 8
**Category:** Input validation / DoS
**Severity:** P3
**Description:** The `url` field on `StickerItemDto` is `@IsString()` with no length limit. A user could submit a 100MB base64 data URI as a sticker URL.

### 47. `CreateStickerPackDto.stickers` array has no `@ArrayMaxSize`
**File:** `apps/api/src/modules/stickers/dto/create-pack.dto.ts`, line 33-37
**Category:** Input validation / DoS
**Severity:** P3
**Description:** The `stickers` array has `@IsArray()` and `@ValidateNested()` but no size limit. A client could send 100,000 stickers in one pack creation request, causing a massive database insert.

### 48. `removeFromCollection` silently returns success even when not found
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 77-90
**Category:** API contract inconsistency
**Severity:** P3
**Description:** If the user tries to remove a pack they don't own, the P2025 error is caught and returns `{ removed: true }` — misleading. The client thinks removal succeeded when there was nothing to remove.

### 49. Islamic preset stickers use hardcoded IDs (`islamic-1` through `islamic-20`)
**File:** `apps/api/src/modules/stickers/stickers.service.ts`, lines 276-303
**Category:** Design smell
**Severity:** P3
**Description:** Preset stickers have hardcoded string IDs that don't match the `cuid()` or `uuid()` format used elsewhere. If any code tries to look these up in the database, it will fail.

### 50. No rate limit on sticker pack creation
**File:** `apps/api/src/modules/stickers/stickers.controller.ts`, line 30
**Category:** Abuse vector
**Severity:** P3
**Description:** `POST /stickers/packs` has no `@Throttle` decorator beyond the global default. A bot could create thousands of spam packs per hour.

### 51. Test file `createChallenge` passes wrong DTO shape
**File:** `apps/api/src/modules/gamification/gamification.service.spec.ts`, lines 283-286
**Category:** Test inaccuracy
**Severity:** P3
**Description:** The test passes `{ type: 'streak' }` but the DTO expects `challengeType`. The test only works because Prisma is mocked and never validates the shape.

### 52. Concurrency test mocks `userStreak.upsert` but service uses `findUnique` + `create/update`
**File:** `apps/api/src/modules/gamification/gamification.service.concurrency.spec.ts`, lines 59-68
**Category:** Test inaccuracy
**Severity:** P3
**Description:** The concurrency test mocks `userStreak.upsert` but the actual `updateStreak()` method uses `findUnique` + `create/update` pattern. The mock doesn't exercise the real code path, making the concurrency test meaningless.

---

## Summary by Category

| Category | Count |
|----------|-------|
| Runtime crash / Non-existent model | 1 |
| XSS / Injection | 3 |
| Routing bugs | 3 |
| Authorization missing | 2 |
| Input validation missing | 8 |
| XP farming / Abuse vectors | 3 |
| Data integrity / Race conditions | 5 |
| Logic bugs | 5 |
| Performance | 2 |
| Dead features | 1 |
| Design smells | 3 |
| Test inaccuracies | 2 |
| Side effects | 2 |
| Other | 12 |

## Priority Summary

| Priority | Count | Key Items |
|----------|-------|-----------|
| P0 (Critical) | 6 | `prisma.streak` crash, duplicate lastActiveAt, XP farming, SVG XSS (2), route shadowing |
| P1 (High) | 12 | Method name collision, missing auth, challenge skip exploit, no URL validation, no DTO validation |
| P2 (Medium) | 16 | Falsy XP fallback, race conditions, double-prefix route, timezone bugs, counter issues |
| P3 (Low) | 18 | Side effects on read, pagination UUID bug, dead criteria field, no array limits |
