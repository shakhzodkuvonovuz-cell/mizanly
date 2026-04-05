# A03: Users Module (Read Paths) Audit

## Files Reviewed
- `apps/api/src/modules/users/users.controller.ts` (399 lines, read in full)
- `apps/api/src/modules/users/users.service.ts` (1395 lines, read in full via 10 chunks)
- `apps/api/src/common/guards/optional-clerk-auth.guard.ts` (86 lines, read in full)
- `apps/api/prisma/schema.prisma` (DraftPost model, UserSettings model, Report model — relevant excerpts)
- `apps/api/src/modules/reports/reports.service.ts` (ban action — relevant excerpt)
- `apps/api/src/modules/admin/admin.service.ts` (cache invalidation check)

## Findings

### CRITICAL — getProfile leaks internal status fields (isDeleted, isBanned, isDeactivated, lastSeenAt) to API consumers
- **File:** `apps/api/src/modules/users/users.service.ts:242-243, 312-318`
- **Evidence:** `getProfile` selects `...INTERNAL_STATUS_FIELDS` (which includes `isDeleted: true, isBanned: true, isDeactivated: true, lastSeenAt: true`) into the `user` object at lines 242-243, then returns `{ ...user, isFollowing, ... }` at line 312 which spreads ALL fields — including the internal ones — into the response. Although lines 272-274 reject banned/deleted/deactivated users with a 404, for active users these fields are still present in the response as `isDeleted: false, isBanned: false, isDeactivated: false, lastSeenAt: <timestamp>`. The `lastSeenAt` field reveals exact last activity time of any user to any viewer.
- **Impact:** Any user (or unauthenticated caller) can see `lastSeenAt` for any active user, revealing when they were last online. `isBanned`, `isDeleted`, `isDeactivated` booleans are moderation internals — while always `false` for visible users, they should not appear in public API responses (defense in depth).
- **Checklist item:** #1 (Privacy leakage)

### CRITICAL — getProfile Redis cache not invalidated on ban, allowing 5-minute banned user visibility
- **File:** `apps/api/src/modules/users/users.service.ts:268` (cache write), `apps/api/src/modules/reports/reports.service.ts:404-407` (ban action)
- **Evidence:** `getProfile` caches user data (including `isBanned: false`) in Redis for 300 seconds at line 268: `await this.redis.setex('user:${username}', 300, JSON.stringify(user))`. When a user is banned via reports (line 406: `data: { isBanned: true, ... }`), neither `reports.service.ts` nor `admin.service.ts` invalidate the `user:<username>` Redis cache key. Grep for `redis.del.*user:` in both modules returns zero matches.
- **Impact:** A banned user's profile remains publicly accessible for up to 5 minutes after being banned. In harassment/safety scenarios, this delay matters — the victim can still see the harasser's profile, and the harasser's content remains discoverable.
- **Checklist item:** #5 (Deactivated/banned user exposure)

### HIGH — getUserPosts and getUserThreads do not enforce private account restriction
- **File:** `apps/api/src/modules/users/users.service.ts:321-382` (getUserPosts), `384-444` (getUserThreads)
- **Evidence:** Both methods fetch `isPrivate: true` in the user select at lines 325 and 388, but NEVER check it. For non-followers viewing a private account, the visibility filter at line 352 falls to `{ visibility: PostVisibility.PUBLIC }` which returns all public-visibility posts. Meanwhile, `getFollowers`/`getFollowing` DO enforce private account restrictions via `resolveUsernameToUserId` (lines 902-908). This inconsistency means: you cannot see who a private user follows, but you CAN see their posts.
- **Impact:** Private account users expect that non-followers cannot see their content. While individual posts may be PUBLIC visibility, the Instagram/social convention is that a private account's content is hidden from non-followers regardless of per-post visibility.
- **Checklist item:** #4 (Blocked user bypass — related: privacy bypass)

### HIGH — getPopularWithFriends does not filter blocked users or banned/deactivated post authors
- **File:** `apps/api/src/modules/users/users.service.ts:1320-1394`
- **Evidence:** The method finds posts liked by followed users (line 1332-1344), then fetches the posts (line 1366-1377), but never checks: (a) whether the post author has blocked the current user or vice versa, (b) whether the post author is banned/deactivated/deleted. The `post: { isRemoved: false, visibility: 'PUBLIC' }` filter at line 1336 only checks removal and visibility, not author status.
- **Impact:** Posts by banned users, deactivated users, or users who blocked the caller can appear in the "popular with friends" feed. A user who blocked you could have their content surfaced to you.
- **Checklist item:** #4 (Blocked user bypass), #5 (Deactivated/banned user exposure)

### HIGH — getSimilarAccounts does not check target user status (banned/deactivated/deleted)
- **File:** `apps/api/src/modules/users/users.service.ts:1239-1244`
- **Evidence:** `getSimilarAccounts` resolves the target user at line 1240-1242 with only `select: { id: true }` — no `isDeleted`, `isBanned`, `isDeactivated` check. Compare this with `getUserPosts` (line 325-328) and `getMutualFollowers` (line 1007-1010) which both check these fields. A request to `GET /users/<banned-username>/similar` will succeed and return results.
- **Impact:** Reveals that a banned/deactivated/deleted username exists and was once active (has followers). This bypasses the deliberate 404 masking done by all other endpoints.
- **Checklist item:** #5 (Deactivated/banned user exposure), #6 (Username enumeration)

### MEDIUM — queryFollowers and queryFollowing include banned/deactivated/deleted users in results
- **File:** `apps/api/src/modules/users/users.service.ts:913-931` (queryFollowers), `933-951` (queryFollowing)
- **Evidence:** The `findMany` queries at lines 914 and 934 have no filter on the related user's status. The `where` clause only filters by `followingId`/`followerId` — it does not exclude follows where the follower/following user `isDeleted`, `isBanned`, or `isDeactivated`. Compare with `findByPhoneNumbers` (lines 1167-1169) which correctly adds `isDeleted: false, isBanned: false, isDeactivated: false`.
- **Impact:** Banned, deactivated, and deleted users appear in follower/following lists. Clicking through to their profile would 404, creating a confusing UX. Worse, it reveals that these users exist and were banned.
- **Checklist item:** #5 (Deactivated/banned user exposure)

### MEDIUM — Saved/liked/bookmarked lists do not filter out content by blocked or banned users
- **File:** `apps/api/src/modules/users/users.service.ts:446-478` (getSavedPosts), `480-510` (getSavedThreads), `512-553` (getSavedReels), `555-599` (getSavedVideos), `1034-1067` (getLikedPosts), `632-662` (getWatchLater), `680-715` (getWatchHistory)
- **Evidence:** All seven methods filter only by `isRemoved: false` on the content. None check whether the content's author has blocked the current user, or whether the author is banned/deactivated/deleted. For example, `getSavedPosts` at line 448: `where: { userId, post: { isRemoved: false } }` — no author status check.
- **Impact:** A user's saved/liked/bookmarked lists can contain content from users who have since blocked them, or from banned/deactivated accounts. While this is the user's own data, it can surface content from people who explicitly cut contact. The author's username/displayName/avatar are included in the response (e.g., line 460).
- **Checklist item:** #4 (Blocked user bypass), #5 (Deactivated/banned user exposure)

### MEDIUM — requestVerification returns full Report object including moderation-internal fields
- **File:** `apps/api/src/modules/users/users.service.ts:970-978`
- **Evidence:** `requestVerification` at line 970 does `return this.prisma.report.create({ data: { ... } })` with no `select` clause. The Report model (schema.prisma line 2298) contains fields: `reviewedById`, `reviewedAt`, `actionTaken`, `moderatorNotes`, `status`. While these are empty/default on creation, the response shape leaks the existence of these moderation fields to the client and sets a pattern where future code changes (e.g., re-querying after creation) could leak populated values.
- **Impact:** Client learns the internal schema of the Report model. `moderatorNotes`, `reviewedById`, `actionTaken` are moderation internals that should never be exposed. Currently benign since values are default/null on creation, but architectural risk.
- **Checklist item:** #1 (Privacy leakage)

### MEDIUM — getDrafts has no cursor pagination and returns all columns
- **File:** `apps/api/src/modules/users/users.service.ts:722-728`
- **Evidence:** `getDrafts` uses `take: 50` but has no cursor parameter and no `meta` return (no `hasMore`, no `cursor`). Also uses no `select` — returns all DraftPost columns including `userId`. Compare with all other list endpoints which return `{ data, meta: { cursor, hasMore } }`.
- **Impact:** Users with 50+ drafts silently lose access to older ones with no way to paginate. Inconsistent API contract with every other list endpoint. The `userId` field in the response is redundant (user already knows their own ID) but harmless.
- **Checklist item:** #2 (Missing pagination)

### LOW — getProfile error responses differentiate blocked vs non-existent users
- **File:** `apps/api/src/modules/users/users.service.ts:266, 272-274, 286`
- **Evidence:** Non-existent user → `NotFoundException('User not found')` at line 266. Banned/deleted/deactivated → `NotFoundException('User not found')` at line 273 (same message, good). Blocked → `ForbiddenException('User not available')` at line 286 (DIFFERENT error code and message). An authenticated attacker can distinguish between "user doesn't exist" (404) and "user blocked me" (403) by comparing responses.
- **Impact:** Attacker can determine if a specific user has blocked them by comparing the 404 vs 403 response. This leaks the block relationship. The same pattern exists in `getUserPosts` (lines 327 vs 340), `getUserThreads` (lines 391 vs 403), `resolveUsernameToUserId` (lines 894 vs 900), and `getMutualFollowers` (lines 1009 vs 1016).
- **Checklist item:** #7 (Error exposure), #4 (Blocked user bypass — information leak)

### LOW — getProfile caches user data including internal status fields in Redis (plaintext)
- **File:** `apps/api/src/modules/users/users.service.ts:268`
- **Evidence:** `await this.redis.setex('user:${username}', 300, JSON.stringify(user))` stores `isDeleted`, `isBanned`, `isDeactivated`, `lastSeenAt` in Redis as plaintext JSON. While Redis is server-side, if the Redis instance is compromised or logs are inspected, user status and activity timestamps are exposed.
- **Impact:** Low, since Redis is server-side. But defense-in-depth says: strip internal fields before caching, or cache separately. Also, the cache stores the FULL user object with `INTERNAL_STATUS_FIELDS` and then the response also includes them (see CRITICAL finding #1).
- **Checklist item:** #1 (Privacy leakage)

### LOW — touchLastSeen fire-and-forget swallows database errors silently
- **File:** `apps/api/src/modules/users/users.service.ts:82-87`
- **Evidence:** `touchLastSeen` calls `.catch((e) => this.logger.error(...))` which logs but does not re-throw or alert. If the Prisma connection pool is exhausted or the DB is down, this silently fails on every `GET /users/me` request. The error pattern is correct for fire-and-forget, but the error rate is not tracked.
- **Impact:** If the DB is having issues, `lastSeenAt` stops updating silently. Combined with the finding that `lastSeenAt` is leaked in `getProfile`, this creates a false signal (stale `lastSeenAt` values interpreted as user inactivity).
- **Checklist item:** N/A (General robustness)

## Checklist Verification

### 1. Privacy leakage
**FINDING** (CRITICAL + MEDIUM + LOW). `getProfile` returns `isDeleted`, `isBanned`, `isDeactivated`, `lastSeenAt` to all callers. `requestVerification` returns full Report model. Redis cache stores internal fields in plaintext.

### 2. Missing pagination
**FINDING** (MEDIUM). `getDrafts` has no cursor pagination, caps at 50 with no `hasMore` indicator. All other list endpoints (`getSavedPosts`, `getFollowers`, etc.) correctly use cursor pagination with `take: limit + 1`.

### 3. Missing rate limit
**PASS**. Controller-level `@Throttle({ default: { limit: 60, ttl: 60000 } })` at line 29 applies to ALL endpoints. Specific endpoints have tighter limits (e.g., data export 1/day, verification 1/min, contacts 5/hour). The `:username` and `:username/posts` endpoints inherit the 60/min default, which is reasonable.

### 4. Blocked user bypass
**FINDING** (HIGH + MEDIUM + LOW). `getPopularWithFriends` surfaces posts by blocked users. Saved/liked/bookmarked lists include content from blocked users. Error responses differentiate blocked (403) vs non-existent (404), leaking block relationships.

### 5. Deactivated/banned user exposure
**FINDING** (CRITICAL + HIGH + MEDIUM). `getSimilarAccounts` does not check target user status. `queryFollowers`/`queryFollowing` include banned/deactivated users in results. Redis cache not invalidated on ban allows 5-minute visibility window. Saved/liked lists include content from banned authors.

### 6. Username enumeration
**FINDING** (HIGH — via `getSimilarAccounts`). A banned/deactivated username can be confirmed to exist by calling `GET /users/<username>/similar` which does not 404 for banned/deactivated users (unlike all other endpoints). All other endpoints correctly return 404 for banned/deactivated users, making enumeration harder.

### 7. Error exposure
**FINDING** (LOW). 403 vs 404 distinction reveals block relationships. See finding #10.

### 8. Query injection
**PASS**. All raw SQL queries use Prisma tagged template literals (`$queryRaw` with template syntax at line 1019-1027), which are parameterized. Username parameters from `@Param('username')` are used in Prisma `where: { username }` which is safe. No regex or raw string concatenation in queries.
