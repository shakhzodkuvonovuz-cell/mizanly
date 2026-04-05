# A16: Follows & Bookmarks Audit

**Files audited:**
- `apps/api/src/modules/follows/follows.controller.ts` (125 lines)
- `apps/api/src/modules/follows/follows.service.ts` (519 lines)
- `apps/api/src/modules/bookmarks/bookmarks.controller.ts` (176 lines)
- `apps/api/src/modules/bookmarks/bookmarks.service.ts` (456 lines)
- `apps/api/src/modules/bookmarks/dto/bookmark.dto.ts` (25 lines)

**Auditor:** Claude Opus 4.6
**Date:** 2026-04-05

---

## Findings

### [MEDIUM] F1 — `acceptRequest` P2002 race silently double-increments counters

**File:** `follows.service.ts`, lines 376-400

When two concurrent `acceptRequest` calls hit the same follow request, the first succeeds and creates the Follow record + increments both counters inside the transaction (lines 377-393). The second hits `P2002` on the `follow.create` duplicate, but the transaction was **already partially committed** -- no, wait. The transaction is atomic, so the second transaction rolls back entirely on P2002. However, the issue is different: between line 348 (findUnique) and line 377 ($transaction), a concurrent call could also pass the `status !== 'PENDING'` check at line 353 because neither has committed yet. Both see `status: 'PENDING'`, both enter the transaction. First commits, second gets P2002 and returns early. The counters are correct because the transaction is atomic.

**Actual issue:** The `followRequest.update` to `ACCEPTED` at line 378-380 is inside the same transaction as the `follow.create`. If P2002 fires, the update to `ACCEPTED` also rolls back, but line 395-398 catches P2002 and returns success. The follow request status is still `PENDING` in the DB, but the follow record exists (created by the first transaction). This means the follow request record stays `PENDING` forever even though the user IS now following.

**Impact:** Stale `PENDING` follow request records in DB. The `getOwnRequests` endpoint will keep showing this request. If the receiver tries to accept again, it will try to create a duplicate follow and loop.

**Line numbers:** 376-400

---

### [MEDIUM] F2 — `follow()` counter double-increment race window

**File:** `follows.service.ts`, lines 52-61 and 106-157

The `follow()` method first checks for an existing follow at line 53. If not found, it enters the transaction at line 106 to create + increment. Two concurrent requests for the same (follower, target) pair:

1. Both call `findUnique` at line 53 -- both get `null`
2. Both enter the `$transaction` at line 106
3. First succeeds: creates Follow + increments both counters
4. Second hits P2002 at line 150, returns early

The transaction is atomic, so the second's increments roll back. This is correctly handled. **No actual double-increment.**

However, the P2002 handler at lines 150-155 returns `{ type: 'follow', follow }` where `follow` comes from a fresh `findUnique`. This is correct.

**Downgrading: Not a bug.** The P2002 handling is correct because the transaction rolls back atomically.

---

### [MEDIUM] F3 — `removeFollower` does not check for blocked users

**File:** `follows.service.ts`, lines 472-501

The `removeFollower` method does not verify whether a block exists between the two users. While this is a "remove" operation (defensive, not offensive), it means a user can interact with the follow relationship of a blocked user. This is a minor inconsistency -- `follow()` checks blocks (line 42-50), but `removeFollower` does not. In practice this is low-risk since removing a follower is a defensive action, but it creates an asymmetry.

**Line numbers:** 472-501

---

### [HIGH] F4 — `getSuggestions` leaks private accounts and ignores blocks

**File:** `follows.service.ts`, lines 435-466

The suggestions query at lines 445-463 filters out deactivated/banned/deleted users but does NOT filter out:
1. **Private accounts** -- private users appear in "People you may know" suggestions, leaking their existence and follower counts
2. **Blocked users** -- users who blocked the requester (or vice versa) still appear in suggestions

An attacker can enumerate private accounts through the suggestions endpoint. A blocked user keeps appearing as a suggestion.

**Line numbers:** 445-463

---

### [MEDIUM] F5 — `getFollowers`/`getFollowing` limit parameter is unbounded and untransformed

**File:** `follows.service.ts`, lines 202, 257; `follows.controller.ts` (no `@Query('limit')` param)

The `getFollowers` and `getFollowing` methods accept `limit = 20` as a default parameter but the controller does NOT expose a `limit` query parameter at all (lines 108-114, 118-124 of controller). This means the limit is always 20, which is correct but inflexible.

However, the `limit` parameter is typed as `number` in the service but has no validation -- if someone calls the service method programmatically with `limit = 999999`, it will fetch that many records. This is only exploitable if another service or a future controller change exposes it.

**Severity reduced** because the controller currently hardcodes it.

**Line numbers:** service lines 202, 257

---

### [HIGH] F6 — Bookmarks `savePost` has TOCTOU race on `savesCount` increment

**File:** `bookmarks.service.ts`, lines 27-62

The `savePost` method does a `findUnique` at line 27-29 to check if bookmark exists. If not found, it creates + increments in a transaction (lines 43-51). On P2002, it returns the existing record (lines 55-59).

**The race:** Two concurrent `savePost` calls for the same (userId, postId):
1. Both call `findUnique` at line 27 -- both get `null`
2. Both enter `$transaction` at line 43
3. First succeeds: creates SavedPost + increments `savesCount` by 1
4. Second hits P2002, **transaction rolls back**, returns existing

This is correctly handled -- the transaction is atomic, so the second's increment rolls back with the P2002. **Not a bug.**

**However**, there is a real TOCTOU race for the `savePost` with collection update path (lines 31-39): Two concurrent calls with different `collectionName` values where the bookmark already exists. Both find the existing record at line 27, both see `collectionName !== collectionName`, both issue `update`. Last write wins. This is a minor data race but low severity (user is just picking a collection).

**Downgrading to Low.**

---

### [HIGH] F7 — `saveThread` / `saveVideo` increment `bookmarksCount`/`savesCount` even on P2002 race (counter ghost increment)

**File:** `bookmarks.service.ts`, lines 104-125 (saveThread), lines 153-174 (saveVideo)

Unlike `savePost` (which uses `findUnique` before the transaction), `saveThread` and `saveVideo` go directly into a `$transaction` that does `create` + `increment`. On P2002, the entire transaction rolls back atomically.

**Wait -- Prisma batch transactions** (array form `$transaction([...])`) are NOT truly atomic in the same way as interactive transactions (`$transaction(async (tx) => { ... })`). Prisma batch transactions use **sequential queries** within a single database transaction. If the `create` fails with P2002, the database-level transaction aborts, so the `increment` does NOT execute.

**Confirmed not a bug** for batch transactions. Prisma sends both statements in a single DB transaction; if the first fails, the whole transaction rolls back.

**Downgrading: Not a bug.** Removing this finding.

---

### [MEDIUM] F8 — `unsavePost` uses two-step decrement + clamp instead of atomic GREATEST

**File:** `bookmarks.service.ts`, lines 66-93

The `unsavePost` method uses an interactive transaction that:
1. Deletes the SavedPost (line 69-71)
2. Decrements `savesCount` by 1 (line 73-79)
3. Clamps to 0 if negative (line 82-85)

This works but is inconsistent with `unsaveThread` (line 134) which uses `$executeRaw` with `GREATEST("bookmarksCount" - 1, 0)` in a single atomic SQL statement. The two-step approach in `unsavePost` means there's a brief moment where `savesCount` is negative before the clamp runs. If another read happens in between, it sees a negative count.

The `unsaveVideo` (lines 179-199) uses the same two-step pattern as `unsavePost`.

**Line numbers:** 66-93 (unsavePost), 179-199 (unsaveVideo)

---

### [LOW] F9 — Bookmark collection name has no character validation (XSS/injection vector)

**File:** `dto/bookmark.dto.ts`, lines 9-13

The `collectionName` field in `SavePostDto` is validated with `@IsString()` and `@MaxLength(50)` but has no character validation. A user can create collections named:
- `<script>alert(1)</script>` (stored XSS if rendered in any admin dashboard or web view)
- `../../etc/passwd` (path traversal if collection names are ever used in file paths)
- Empty string `""` (passes `@IsString()` -- could collide with falsy checks)
- Unicode homoglyphs, control characters, null bytes

The `RenameCollectionDto` and `MoveCollectionDto` have the same issue.

**Line numbers:** dto/bookmark.dto.ts lines 1-25

---

### [LOW] F10 — `declineRequest` does not prevent re-decline or decline of accepted requests gracefully

**File:** `follows.service.ts`, lines 410-422

The `declineRequest` method fetches the request (line 411), checks ownership (line 415), then blindly sets status to `DECLINED` (line 417-419). It does NOT check the current status. This means:
- An already-DECLINED request can be re-declined (harmless but wasteful DB write)
- An ACCEPTED request can be set back to DECLINED, but the Follow record created by `acceptRequest` is NOT deleted, and counters are NOT decremented. This leaves the DB in an inconsistent state: Follow exists but FollowRequest says DECLINED.

**Line numbers:** 410-422

---

### [MEDIUM] F11 — `cancelRequest` does not check request status before deletion

**File:** `follows.service.ts`, lines 424-433

The `cancelRequest` method checks sender ownership (line 429) but does not check if the request is still `PENDING`. A sender can cancel an already-ACCEPTED request, which deletes the FollowRequest record but leaves the Follow record and incremented counters intact. The FollowRequest audit trail is destroyed.

**Line numbers:** 424-433

---

### [LOW] F12 — `follow()` declined-request path has no cooldown enforcement

**File:** `follows.service.ts`, lines 77-79

When a follow request was previously declined, the code throws `BadRequestException('Follow request was declined. Please wait before requesting again.')`. But there is no actual time-based cooldown check. The message says "please wait" but there is no mechanism to ever allow re-requesting. The declined request stays forever, permanently blocking the follow attempt. The only way to unblock is to delete the FollowRequest record manually or through a missing "clear declined requests" feature.

**Line numbers:** 77-79

---

### [LOW] F13 — `getSuggestions` has no pagination

**File:** `follows.service.ts`, lines 435-466

The `getSuggestions` method has `limit = 20` but no cursor pagination. A client calling this endpoint repeatedly will always get the same 20 suggestions (ordered by `followersCount desc`). There is no way to page through more suggestions. Additionally, scanning 200 followings (line 442) and then querying friends-of-friends is an expensive query that could be slow for users following many popular accounts.

**Line numbers:** 435-466

---

### [MEDIUM] F14 — Bookmarks `limit` query parameter arrives as string, not number

**File:** `bookmarks.controller.ts`, lines 76, 115, 150

The `@Query('limit') limit?: number` declaration looks correct, but NestJS query parameters are always strings unless explicitly transformed with `@Type(() => Number)` from `class-transformer` or `ParseIntPipe`. Without the global `ValidationPipe` having `transform: true` AND `transformOptions.enableImplicitConversion: true`, the `limit` arrives as a string like `"20"`.

The service methods handle this defensively with `Number(limit) || 20` (e.g., `bookmarks.service.ts` line 204), so the actual impact is mitigated. But if someone passes `limit=abc`, `Number('abc')` returns `NaN`, `NaN || 20` returns `20` -- safe but should be validated at the controller level.

**Note:** The follows controller does not expose `limit` at all, so this only affects bookmarks.

**Line numbers:** controller lines 76, 115, 150; service lines 204, 262, 311

---

### [MEDIUM] F15 — Bookmarks do not check if content owner blocked the requester

**File:** `bookmarks.service.ts`, lines 16-62 (savePost), 97-125 (saveThread), 146-174 (saveVideo)

None of the bookmark save methods check whether the content owner has blocked the requesting user. A blocked user can:
1. Bookmark posts/threads/videos from the user who blocked them
2. See these bookmarked items in their saved posts list (the `getSavedPosts` query at lines 205-208 filters by `isBanned/isDeactivated/isDeleted` but NOT by block status)

This means blocking someone does not prevent them from curating your content in their bookmarks.

**Line numbers:** 16-62, 97-125, 146-174, 205-208

---

### [LOW] F16 — `removeFollower` does not invalidate Redis cache

**File:** `follows.service.ts`, lines 472-501

The `follow()` method (lines 129-132) and `unfollow()` method (lines 192-197) both invalidate Redis user caches after modifying follow counts. The `removeFollower()` method decrements the same counters (lines 487-498) but does NOT invalidate any Redis cache. Stale follower/following counts will be served from Redis until the cache TTL expires.

**Line numbers:** 487-501 (compare with 129-132 and 192-197)

---

### [LOW] F17 — `follow()` first-follower notification fires unguarded async query chain

**File:** `follows.service.ts`, lines 135-146

The first-follower celebration check at lines 135-146 runs as an unguarded `.then()` chain after the follow transaction completes. It:
1. Queries `followersCount` (line 135)
2. If count == 1, emits a notification (line 138)

This is a fire-and-forget `.catch()` pattern, which is fine for resilience. But the check `u.followersCount === 1` is racy: if two users follow the same new user simultaneously, both transactions increment to 2 before either `.then()` runs, and neither sees `followersCount === 1`. The celebration notification is lost. Conversely, if one follow + one unfollow happen rapidly, the count could transiently be 1 for the wrong follow.

Minor impact -- this is a celebration notification, not business-critical.

**Line numbers:** 135-146

---

### [INFO] F18 — `checkFollowing` method exists in service but has no controller route

**File:** `follows.service.ts`, lines 508-518

The `checkFollowing` method is defined in the service but never exposed via the controller. It may be used internally by other services, but there is no REST endpoint to check if one user follows another. This means the mobile client has no way to check follow status without fetching the full profile.

**Line numbers:** 508-518 (service), entire controller file has no matching route

---

### [INFO] F19 — Bookmarks `renameCollection` is not atomic -- name collision possible

**File:** `bookmarks.service.ts`, lines 383-398

If two users (or the same user in two tabs) rename different collections to the same `newName`, the `updateMany` calls at line 392-395 both succeed. This merges two collections silently. For example, if collection "recipes" and "food" both get renamed to "cooking", all posts end up in one "cooking" collection with no warning.

Also, if `newName` is `"default"`, it effectively deletes the collection by merging into default -- but there's no check preventing rename TO "default".

**Line numbers:** 383-398

---

## Checklist Verification

| # | Check | Result | Details |
|---|-------|--------|---------|
| 1 | **Self-follow** | PASS | `follows.service.ts` line 29-31: `if (currentUserId === targetUserId) throw BadRequestException`. Also checked in `removeFollower` at line 473-475. |
| 2 | **Double follow** | PASS | Lines 53-61: checks for existing follow, returns idempotent success. Lines 150-155: P2002 race caught, transaction rolls back atomically. Counters stay correct. |
| 3 | **Counter sync** | PARTIAL FAIL | Follow/unfollow use transactional increments/decrements with GREATEST for floor-clamping (lines 106-118, 178-189). But `acceptRequest` P2002 race leaves request as PENDING while follow exists (F1). `removeFollower` doesn't invalidate cache (F16). `unsavePost`/`unsaveVideo` use non-atomic two-step decrement (F8). |
| 4 | **Rate limit** | PASS | Controller has class-level `@Throttle({ default: { limit: 30, ttl: 60000 } })` at line 21. Follow/unfollow have additional `@TargetThrottle('userId', 5, 60000)` at lines 75, 85. Bookmarks controller has `@Throttle({ default: { limit: 30, ttl: 60000 } })` at line 24. |
| 5 | **Blocked users** | PARTIAL FAIL | `follow()` checks blocks bidirectionally (lines 42-50). `acceptRequest` checks blocks (lines 359-373). But `getSuggestions` ignores blocks (F4). `removeFollower` ignores blocks (F3). Bookmarks ignore blocks entirely (F15). |
| 6 | **Private accounts** | PASS for follows, FAIL for suggestions | `follow()` handles private accounts with FollowRequest flow (lines 63-101). `getFollowers`/`getFollowing` check isPrivate and require follower status (lines 206-211, 261-266). But `getSuggestions` does not filter out private accounts (F4). |
| 7 | **Bookmark BOLA** | PASS | All bookmark endpoints use `@CurrentUser('id')` from JWT. Service methods always scope queries by `userId`. No endpoint accepts a user ID parameter for bookmarks -- you can only access your own. `getSavedPosts` line 205: `where: { userId }`. Same pattern for threads (line 264) and videos (line 313). |
| 8 | **Pagination** | PASS | All list endpoints use cursor pagination with `take: limit + 1` pattern. Follows: hardcoded limit 20. Bookmarks: configurable with `Math.min(Math.max(Number(limit) || 20, 1), 50)` clamping (lines 204, 262, 311). Suggestions: not paginated but limited to 20 (F13). |

## Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| HIGH | 1 | F4 |
| MEDIUM | 6 | F1, F3, F8, F11, F14, F15 |
| LOW | 5 | F9, F10, F12, F13, F16 |
| INFO | 2 | F18, F19 |
| **Total** | **14** | |

### Top 3 fixes by impact:
1. **F4 (HIGH):** `getSuggestions` must filter out private accounts and blocked users
2. **F1 (MEDIUM):** `acceptRequest` P2002 handler must update followRequest status to ACCEPTED
3. **F15 (MEDIUM):** Bookmark save methods should check block status before allowing save
