# Audit Agent #4 — Social Graph (Follows, Blocks, Restricts, Mutes, Circles, Users)

**Scope:** `follows/`, `blocks/`, `restricts/`, `mutes/`, `circles/`, `users/` modules + cross-module enforcement
**Files audited:** 30+ source files, line by line
**Total findings:** 52

---

## CRITICAL (P0) — Ship Blockers

### 1. Restrict feature is completely non-functional — never enforced anywhere
- **File:** `apps/api/src/modules/restricts/restricts.service.ts` (entire file)
- **Severity:** P0
- **Category:** Feature broken
- **Description:** The `RestrictsService` has an `isRestricted()` method (line 89-99) but it is NEVER called by any other module in the entire codebase. A `grep` for `RestrictsService` across all non-test `.ts` files shows it is only referenced within its own module and `app.module.ts` registration. The restrict feature in Instagram hides a user's comments from the restricter's posts (requiring manual approval) and hides read/online status. In Mizanly, restricting a user does nothing at all — their comments, messages, and interactions are completely unaffected.
- **Impact:** Users who restrict someone expect their content to be filtered. Nothing happens. The entire feature is decorative.

### 2. Personalized feed has ZERO block/mute filtering
- **File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 146-254
- **Severity:** P0
- **Category:** Security / Privacy
- **Description:** The `getPersonalizedFeed()` method does not query blocks or mutes at any point. It fetches candidates via `embeddingsService.findSimilarByVector()` and scores them — but never excludes blocked or muted users. The author map is only used for diversity injection (no same-author back-to-back), not for block enforcement. A blocked user's content will appear in the personalized feed.
- **Code:**
  ```ts
  // Line 146-254: No block or mute query anywhere in this method
  async getPersonalizedFeed(userId: string | undefined, space, cursor?, limit?) {
    // ... embeddingsService.findSimilarByVector() ...
    // ... NO block check ...
    // ... NO mute check ...
  }
  ```

### 3. Trending feed has ZERO block/mute filtering
- **File:** `apps/api/src/modules/feed/personalized-feed.service.ts`, lines 346-423
- **Severity:** P0
- **Category:** Security / Privacy
- **Description:** The `getTrendingFeed()` method (used for cold start and as fallback) only filters by `isDeactivated: false, isPrivate: false`. No block or mute exclusion. Also `getColdStartFeed()` and `getIslamicEditorialPicks()` have the same gap.

### 4. Trending feed in FeedService also has no block/mute filtering
- **File:** `apps/api/src/modules/feed/feed.service.ts`, lines 156-199
- **Severity:** P0
- **Category:** Security / Privacy
- **Description:** The `getTrendingFeed()` method fetches 200 posts with no block/mute exclusion. It does not accept a userId parameter at all. Similarly `getFeaturedFeed()` (lines 204-228) and `getSuggestedUsers()` (lines 248-285) have no block exclusion.

### 5. Blocked users can send messages in existing conversations
- **File:** `apps/api/src/modules/messages/messages.service.ts`, line 136-201
- **Severity:** P0
- **Category:** Security
- **Description:** The `sendMessage()` method only calls `requireMembership()` — it does NOT check if either party has blocked the other. If user A and B have an existing conversation, and A blocks B, B can still send messages to A. Block is only enforced at DM creation time (`createDM()` at line 244 checks blocks), not on subsequent messages.
- **Code:**
  ```ts
  async sendMessage(conversationId, senderId, data) {
    await this.requireMembership(conversationId, senderId); // Only membership check
    // NO block check
  }
  ```

### 6. Notifications service does not filter blocked/muted users
- **File:** `apps/api/src/modules/notifications/notifications.service.ts`, lines 97-134
- **Severity:** P0
- **Category:** Privacy / Harassment
- **Description:** The `create()` method only checks `params.userId === params.actorId` (self-notification). It does NOT check if the recipient has blocked or muted the actor. If user B (blocked by A) likes A's post, A still gets a notification from B. Same for comments, follows (race condition), and all other notification types. The `getNotifications()` method also returns all notifications without filtering out blocked actors.

---

## HIGH (P1) — Security / Privacy

### 7. Followers/following lists exposed without auth for private accounts
- **File:** `apps/api/src/modules/users/users.controller.ts`, lines 287-303
- **Severity:** P1
- **Category:** Privacy violation
- **Description:** The `GET :username/followers` and `GET :username/following` endpoints have NO `@UseGuards()` decorator and NO auth check. Anyone (including unauthenticated users) can enumerate ALL followers and following of ANY user, including private accounts. This is a severe privacy violation — private accounts expect their social connections to be hidden from non-followers.
- **Code:**
  ```ts
  @Get(':username/followers')
  @ApiOperation({ summary: 'Followers list' })
  getFollowers(@Param('username') username: string, @Query('cursor') cursor?: string) {
    return this.usersService.getFollowers(username, cursor);
    // NO auth guard, NO privacy check
  }
  ```

### 8. Block enforcement is unidirectional in most feed queries
- **File:** `apps/api/src/modules/posts/posts.service.ts`, lines 99-100
- **Severity:** P1
- **Category:** Security
- **Description:** The "for you" feed block query is `{ blockerId: userId }` — it only excludes users that the current user blocked. It does NOT exclude users who blocked the current user (`{ blockedId: userId }`). So if user B blocks user A, A can still see B's posts in the "for you" feed. This same pattern is in the following feed (line 167), channels feed, videos feed, and reels feed.
- **Code:**
  ```ts
  this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } })
  // Missing: { blockedId: userId } to get users who blocked ME
  ```

### 9. `isBlocked()` helper is unidirectional
- **File:** `apps/api/src/modules/blocks/blocks.service.ts`, lines 142-147
- **Severity:** P1
- **Category:** Logic bug
- **Description:** The `isBlocked(blockerId, blockedId)` method only checks one direction. Any caller using this method needs to remember to call it twice (swapping args) to check both directions. Currently no other service imports `BlocksService` (they all inline their own `block.findFirst` queries), but this helper is exported and will be a trap for future callers.

### 10. Raw SQL column name case mismatch in getMutualFollowers
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 777-784
- **Severity:** P1
- **Category:** Runtime crash
- **Description:** The raw SQL uses unquoted column names: `u.displayName`, `u.avatarUrl`. In PostgreSQL, unquoted identifiers are folded to lowercase (`u.displayname`, `u.avatarurl`). Since Prisma creates columns with camelCase names (no `@map`), the actual DB columns are `"displayName"` and `"avatarUrl"` (case-sensitive). The query will return `null` for these columns or fail entirely depending on PostgreSQL version.
- **Code:**
  ```sql
  SELECT u.id, u.username, u.displayName, u.avatarUrl
  FROM follows f1 ...
  -- Should be: u."displayName", u."avatarUrl"
  ```

### 11. Contact sync has no array size limit — DoS vector
- **File:** `apps/api/src/modules/users/dto/contact-sync.dto.ts`, lines 1-6
- **Severity:** P1
- **Category:** DoS / Validation
- **Description:** `ContactSyncDto.phoneNumbers` has `@IsArray()` and `@IsString({ each: true })` but NO `@ArrayMaxSize()`. An attacker can POST millions of phone numbers, causing a massive `WHERE phone IN (...)` query. The service method does `take: 50` but the `WHERE IN` clause can still be arbitrarily large.
- **Code:**
  ```ts
  export class ContactSyncDto {
    @IsArray() @IsString({ each: true }) phoneNumbers: string[];
    // Missing: @ArrayMaxSize(500)
  }
  ```

### 12. Declined follow requests allow immediate re-requesting
- **File:** `apps/api/src/modules/follows/follows.service.ts`, lines 63-102
- **Severity:** P1
- **Category:** Harassment / Abuse
- **Description:** When a follow request is declined (status='DECLINED'), the `follow()` method checks for an existing request with `status === 'PENDING'` (line 73). If the status is 'DECLINED', it falls through and creates a NEW follow request. This means a declined user can spam follow requests endlessly. Instagram prevents this by rate-limiting or requiring a cooldown period after decline.

### 13. Account deletion does not clean up social graph
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 188-215
- **Severity:** P1
- **Category:** Data integrity / GDPR
- **Description:** `deleteAccount()` only anonymizes user data and deletes device tokens. It does NOT delete/clean up: follows (both directions), follow requests, blocks, restricts, mutes, circle memberships, or follower/following counts on other users. Deleted users remain in follower lists of other users, and the deleted user's followers/following counts are never decremented on the other users. Also, the user's email is not cleared (possible data retention issue for GDPR).

### 14. Search results do not filter blocked users
- **File:** `apps/api/src/modules/search/search.service.ts`, lines 153-330
- **Severity:** P1
- **Category:** Privacy
- **Description:** The search service has no concept of a current user or block filtering. The `search()` method does not accept a `userId` parameter and returns all matching results including blocked users. User search (line 294-305) returns any matching user regardless of block status.

---

## MEDIUM (P2) — Data Integrity / Logic

### 15. Follow counter race condition on concurrent accept
- **File:** `apps/api/src/modules/follows/follows.service.ts`, lines 314-338
- **Severity:** P2
- **Category:** Data integrity
- **Description:** In `acceptRequest()`, when a P2002 (duplicate follow) error occurs on concurrent accept, the method returns success at line 336 but the follower/following counts have NOT been incremented (the transaction was rolled back). The counts will be off by 1.

### 16. Block transaction can leave partial state on non-P2002 errors
- **File:** `apps/api/src/modules/blocks/blocks.service.ts`, lines 52-90
- **Severity:** P2
- **Category:** Data integrity
- **Description:** The follows are fetched BEFORE the transaction (line 32-41), then the transaction uses conditional executeRaw for counter updates. If the transaction fails with a non-P2002 error after the block is created but before all counter updates, the follows are deleted but counters are not decremented. However, since it's an atomic `$transaction`, this is handled correctly. The real issue is: the `findMany` for follows at line 32 uses `take: 50`. If there are exactly 2 follow relationships (which is the max), this is fine. But the `take: 50` is misleading — the real max is 2 (A follows B, and B follows A). No bug, but the `take: 50` is confusing.

### 17. Mute: ConflictException on duplicate is not idempotent
- **File:** `apps/api/src/modules/mutes/mutes.service.ts`, lines 26-34
- **Severity:** P2
- **Category:** API design
- **Description:** The `mute()` method throws `ConflictException('Already muted')` on P2002. Most other social actions (follow, block) return idempotent success. This inconsistency means the mobile app must handle 409 separately for mutes but not for blocks/follows. Should return `{ message: 'User muted' }` for consistency.

### 18. Restrict: ConflictException on duplicate is not idempotent
- **File:** `apps/api/src/modules/restricts/restricts.service.ts`, lines 20-29
- **Severity:** P2
- **Category:** API design
- **Description:** Same issue as mute — `restrict()` throws `ConflictException('User is already restricted')` on P2002 instead of returning idempotent success. Inconsistent with blocks/follows.

### 19. Unrestrict throws NotFoundException instead of idempotent success
- **File:** `apps/api/src/modules/restricts/restricts.service.ts`, lines 32-45
- **Severity:** P2
- **Category:** API design
- **Description:** `unrestrict()` throws `NotFoundException('Restriction not found')` on P2025. Blocks and follows use idempotent success patterns. Should return `{ message: 'User unrestricted' }` for consistency.

### 20. Unmute throws NotFoundException instead of idempotent success
- **File:** `apps/api/src/modules/mutes/mutes.service.ts`, lines 38-48
- **Severity:** P2
- **Category:** API design
- **Description:** `unmute()` throws `NotFoundException('Mute not found')` when `deleted.count === 0`. Should return idempotent success for consistency with unblock/unfollow.

### 21. Users service has duplicate getFollowers/getFollowing implementations
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 670-754 AND `apps/api/src/modules/follows/follows.service.ts`, lines 180-264
- **Severity:** P2
- **Category:** Code duplication
- **Description:** Both `UsersService` and `FollowsService` implement `getFollowers()` and `getFollowing()` with identical logic but different entry points (users controller uses username, follows controller uses userId). This is maintenance burden and divergence risk.

### 22. Circles: No validation that members being added actually exist
- **File:** `apps/api/src/modules/circles/circles.service.ts`, lines 88-104
- **Severity:** P2
- **Category:** Data integrity
- **Description:** `addMembers()` uses `createMany` with `skipDuplicates` but does NOT verify that the user IDs in `memberIds` actually exist. A caller can add nonexistent user IDs to a circle, creating CircleMember records with invalid foreign keys. The DB FK constraint will catch this, but the error message will be a raw Prisma error rather than a clean 404.

### 23. Circles: No limit on number of circles a user can create
- **File:** `apps/api/src/modules/circles/circles.service.ts`, line 29
- **Severity:** P2
- **Category:** Abuse vector
- **Description:** No check on total number of circles a user owns. An attacker can create thousands of circles. The controller has `@Throttle({ default: { limit: 10, ttl: 60000 } })` which limits to 10/minute but still allows unlimited total circles over time.

### 24. Circles: No block check when adding members
- **File:** `apps/api/src/modules/circles/circles.service.ts`, lines 88-104
- **Severity:** P2
- **Category:** Privacy / Harassment
- **Description:** `addMembers()` does not check if any of the members have blocked the circle owner (or vice versa). A user who blocked you can be added to your circle, and they will appear in your circle's content scope.

### 25. Circles: Members are not notified when added to a circle
- **File:** `apps/api/src/modules/circles/circles.service.ts`, lines 88-104
- **Severity:** P2
- **Category:** Feature gap
- **Description:** When a user is added to a circle, they are not notified. They have no way to know they've been added or to opt out. On Instagram, close friends at least have an indicator on stories.

### 26. Circle slug generation has weak collision handling
- **File:** `apps/api/src/modules/circles/circles.service.ts`, lines 5-13, 50-71
- **Severity:** P2
- **Category:** Logic bug
- **Description:** The slug uses `Math.random().toString(36).slice(2, 7)` — only 5 characters of base-36 (~60M possibilities). On P2002 collision, it retries ONCE with a new slug. If the second attempt also collides, it throws a raw Prisma error. Should use a UUID suffix or retry loop.

### 27. User profile cache not invalidated on block
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 218-234 (getProfile cache)
- **Severity:** P2
- **Category:** Logic bug
- **Description:** `getProfile()` caches user data in Redis for 5 minutes. When user A blocks user B, B's profile cache is not invalidated. For up to 5 minutes, user A could still see B's cached profile data before the block check kicks in (the block check at line 238-248 happens AFTER the cache hit at line 221).

### 28. Exported data includes messages but marks all as "[encrypted]"
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 180-181
- **Severity:** P2
- **Category:** GDPR compliance
- **Description:** `exportData()` returns all messages but replaces content with `'[encrypted]'` (line 180). Under GDPR, the user has a right to access their actual data. If messages are encrypted at rest, the export should decrypt them for the data subject.
- **Code:**
  ```ts
  messages: messages.map(m => ({ ...m, content: m.content ? '[encrypted]' : null })),
  ```

### 29. getUserPosts/getUserThreads don't check block status
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 279-320, 322-362
- **Severity:** P2
- **Category:** Privacy
- **Description:** `getUserPosts()` and `getUserThreads()` check follow status for visibility filtering but do NOT check if the viewer has been blocked by the profile owner. A blocked user can view the profile owner's posts/threads if they know the username.

### 30. Report reason mapping loses information
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 756-768
- **Severity:** P2
- **Category:** Logic bug
- **Description:** The `report()` method maps string reasons to `ReportReason` enum values (line 758-762). The mapping is incomplete — only 'spam', 'impersonation', and 'inappropriate' are mapped. Any other reason string defaults to 'SPAM'. If the mobile app sends reasons like 'hate_speech', 'terrorism', 'self_harm', they all become 'SPAM', losing critical safety information. Also, the `ReportDto` has `@MinLength(3) @MaxLength(500)` suggesting freetext, but the service treats it as a category key.

---

## LOW (P3) — Polish / Best Practices

### 31. Follows controller throttle is 30/min, blocks/restricts/mutes are 60/min
- **File:** Various controllers
- **Severity:** P3
- **Category:** Inconsistency
- **Description:** Rate limits are inconsistent across similar social graph actions. Follow is 30/min, block/restrict/mute are all 60/min. Follow should probably be lower (to prevent follow/unfollow spam), but the discrepancy suggests these weren't coordinated.

### 32. No Throttle decorator on users controller at class level
- **File:** `apps/api/src/modules/users/users.controller.ts`
- **Severity:** P3
- **Category:** Missing rate limit
- **Description:** The users controller has `@Throttle` only on specific endpoints (updateProfile at 10/min, exportData at 1/day, report at 10/min). The class-level default of 100/min (global) applies to all other endpoints. This means follower enumeration endpoints can be hit 100/min without specific throttling.

### 33. nasheedMode uses inline type instead of DTO
- **File:** `apps/api/src/modules/users/users.controller.ts`, lines 243-252
- **Severity:** P3
- **Category:** Validation bypass
- **Description:** The `updateNasheedMode()` endpoint uses `@Body() body: { nasheedMode: boolean }` — an inline type that bypasses class-validator. Any request body will be accepted. This is one of the 26 endpoints flagged in the DTO validation audit for using inline types.

### 34. getOwnRequests returns max 50 items without pagination
- **File:** `apps/api/src/modules/follows/follows.service.ts`, lines 266-283
- **Severity:** P3
- **Category:** UX limitation
- **Description:** `getOwnRequests()` uses `take: 50` with no cursor pagination. A popular user with 100+ pending follow requests would only see the first 50.

### 35. getSuggestions depends on first 50 followings only
- **File:** `apps/api/src/modules/follows/follows.service.ts`, lines 379-407
- **Severity:** P3
- **Category:** Algorithm limitation
- **Description:** `getSuggestions()` fetches `take: 50` followings and then suggests friends-of-friends from only those 50. A user following 500 people only gets suggestions based on 10% of their graph.

### 36. Missing removeFollower functionality
- **File:** N/A (missing feature)
- **Severity:** P3
- **Category:** Feature gap
- **Description:** There is no way for a user to remove a follower without blocking them. Instagram has "Remove Follower" which severs the follow without blocking. This is important for private accounts that accidentally approved someone.

### 37. Block does not remove from circles
- **File:** `apps/api/src/modules/blocks/blocks.service.ts`
- **Severity:** P3
- **Category:** Incomplete block cascade
- **Description:** When user A blocks user B, the block service removes follows and follow requests but does NOT remove circle memberships. If B was in A's circle, they remain. This could expose circle-restricted content to the blocked user.

### 38. Block does not remove from conversations
- **File:** `apps/api/src/modules/blocks/blocks.service.ts`
- **Severity:** P3
- **Category:** Incomplete block cascade
- **Description:** When blocking, the service does not remove the blocked user from shared group conversations or update conversation memberships. The blocked user can still see and participate in shared groups.

### 39. getRestrictedList returns users in wrong order
- **File:** `apps/api/src/modules/restricts/restricts.service.ts`, lines 47-87
- **Severity:** P3
- **Category:** Bug
- **Description:** `getRestrictedList()` fetches restricts ordered by `createdAt: 'desc'`, then separately fetches users with `id: { in: userIds }`. The second query does NOT preserve the order from the first query — Prisma `findMany` with `{ id: { in: [...] } }` returns results in arbitrary order. The returned list will not match the chronological restrict order.

### 40. getUserPosts visibility check makes N+1 query for follow check
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 284-286
- **Severity:** P3
- **Category:** Performance
- **Description:** `getUserPosts()` and `getUserThreads()` do an `await prisma.follow.findUnique()` for each call to check if the viewer is a follower. This is 1 extra query per page load. Could be cached or batched.

### 41. Circles createCircleDto allows @IsUUID('4') but IDs are cuid()
- **File:** `apps/api/src/modules/circles/dto/create-circle.dto.ts`, line 13
- **Severity:** P3
- **Category:** Validation mismatch
- **Description:** `memberIds` is validated with `@IsUUID('4', { each: true })`, but user IDs are `cuid()` (not UUID v4). CUIDs are alphanumeric strings like `clxyz123abc` that will FAIL the UUID v4 validation regex. This means the `memberIds` field on circle creation will reject all valid user IDs.
- **Code:**
  ```ts
  @IsUUID('4', { each: true }) // Rejects cuid() format IDs
  memberIds?: string[];
  ```

### 42. ManageMembersDto has same UUID validation issue
- **File:** `apps/api/src/modules/circles/dto/manage-members.dto.ts`, line 7
- **Severity:** P3
- **Category:** Validation mismatch
- **Description:** Same as #41 — `@IsUUID('4', { each: true })` will reject cuid() user IDs.

### 43. UpdateProfileDto allows setting avatarUrl and coverUrl directly
- **File:** `apps/api/src/modules/users/dto/update-profile.dto.ts`, lines 18-25
- **Severity:** P3
- **Category:** Security
- **Description:** `avatarUrl` and `coverUrl` accept any valid URL via `@IsUrl()`. A user can set their avatar/cover to any arbitrary URL (including tracking pixels, offensive content hosted elsewhere, or SSRF targets). These should only accept URLs from the app's own R2 domain.

### 44. deactivate and deleteAccount are both available without confirmation
- **File:** `apps/api/src/modules/users/users.controller.ts`, lines 59-75
- **Severity:** P3
- **Category:** UX safety
- **Description:** Both `DELETE /users/me/deactivate` and `DELETE /users/me` can be called without any confirmation token, password re-entry, or 2FA check. A stolen session token can permanently delete an account.

### 45. requestAccountDeletion and deleteAccount are redundant
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 188-215, 825-831
- **Severity:** P3
- **Category:** Code confusion
- **Description:** There are two account deletion paths: `deleteAccount()` (soft delete, immediate) and `requestAccountDeletion()` (sets deletedAt + deactivates). The controller exposes both as separate endpoints (`DELETE /users/me` and `POST /users/me/delete-account`). They behave differently — `deleteAccount` anonymizes data, `requestAccountDeletion` just sets a date. Neither has a 30-day grace period job to actually delete.

### 46. GDPR export does not include blocks, mutes, restricts, circles
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 115-186
- **Severity:** P3
- **Category:** GDPR compliance
- **Description:** `exportData()` exports profile, posts, comments, messages, follows, likes, bookmarks, threads, reels, and videos. But it does NOT export: blocks, mutes, restricts, circle memberships, notification history, search history, or feed interactions. GDPR requires ALL personal data to be exportable.

### 47. getFollowRequests in users controller duplicates follows controller endpoint
- **File:** `apps/api/src/modules/users/users.controller.ts`, line 121-130 AND `apps/api/src/modules/follows/follows.controller.ts`, line 28-32
- **Severity:** P3
- **Category:** API duplication
- **Description:** Follow requests can be fetched via both `GET /users/me/follow-requests` and `GET /follows/requests/incoming`. They use different service implementations (one paginated, one not). This causes confusion for mobile devs about which endpoint to use.

### 48. Circles: No pagination on getMembers
- **File:** `apps/api/src/modules/circles/circles.service.ts`, lines 129-138
- **Severity:** P3
- **Category:** Scalability
- **Description:** `getMembers()` returns up to 50 members with no cursor pagination. A circle with 100+ members would not display all of them.

### 49. Circles: No throttle at class level
- **File:** `apps/api/src/modules/circles/circles.controller.ts`
- **Severity:** P3
- **Category:** Missing rate limit
- **Description:** Only the `create` endpoint has `@Throttle`. All other circle endpoints use the global 100/min default, including member management which could be abused.

### 50. Contact sync uploads raw phone numbers
- **File:** `apps/api/src/modules/users/users.service.ts`, lines 849-862
- **Severity:** P3
- **Category:** Privacy
- **Description:** Phone numbers are sent from the client and stored in the `phone` field query. The normalization at line 850 strips non-digits and takes last 10 characters, which loses country codes and may match wrong numbers. Phone numbers should be hashed before transmission/querying for privacy.

### 51. getFeedStories does not filter blocked/muted users' stories
- **File:** `apps/api/src/modules/stories/stories.service.ts`, lines 51-100
- **Severity:** P2
- **Category:** Privacy
- **Description:** `getFeedStories()` fetches stories from followed users but does NOT cross-reference blocks or mutes. While follows are cleaned on block, if there's any timing gap (block happens right after story was fetched from follows list), blocked users' stories could appear. Also, muted users' stories should be hidden or deprioritized, but they are shown normally.

### 52. Limit parameter on getMutualFollowers not validated
- **File:** `apps/api/src/modules/users/users.controller.ts`, lines 305-315
- **Severity:** P3
- **Category:** Validation
- **Description:** The `@Query('limit') limit?: number` parameter is not validated with `@IsInt()`, `@Min(1)`, or `@Max()`. A malicious user can pass `limit=999999` causing an unbounded raw SQL query. The `$queryRaw` at line 783 passes this directly to `LIMIT ${limit}`.

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| P0 (Ship Blocker) | 6 | Restrict feature non-functional, personalized/trending feeds ignore blocks, blocked users can message, notifications ignore blocks |
| P1 (Security) | 8 | Followers list exposed for private accounts, unidirectional block enforcement, SQL column case bug, contact sync DoS, declined users can re-request |
| P2 (Data Integrity) | 16 | Counter race conditions, inconsistent idempotency, missing cascade cleanup, cache stale after block, GDPR export gaps |
| P3 (Polish) | 22 | Rate limit inconsistencies, UUID vs cuid mismatch, missing features, code duplication, validation gaps |

---

## Cross-Module Enforcement Matrix

This matrix shows which modules check blocks/mutes/restricts before serving content:

| Module | Checks Blocks? | Checks Mutes? | Checks Restricts? |
|--------|---------------|---------------|-------------------|
| `follows.service` (follow) | YES (bidirectional) | No | No |
| `follows.service` (acceptRequest) | YES (bidirectional) | No | No |
| `blocks.service` (block) | N/A | No | No |
| `users.service` (getProfile) | YES (bidirectional) | No | No |
| `users.service` (getUserPosts) | No | No | No |
| `users.service` (getFollowers/Following) | No | No | No |
| `users.service` (getMutualFollowers) | No | No | No |
| `posts.service` (for you feed) | ONE-WAY only | YES | No |
| `posts.service` (following feed) | ONE-WAY only | YES | No |
| `personalized-feed.service` | No | No | No |
| `feed.service` (trending) | No | No | No |
| `feed.service` (suggestedUsers) | No | No | No |
| `messages.service` (createDM) | YES (bidirectional) | No | No |
| `messages.service` (sendMessage) | No | No | No |
| `stories.service` (getFeedStories) | No | No | No |
| `stories.service` (replyToStory) | YES (bidirectional) | No | No |
| `notifications.service` (create) | No | No | No |
| `notifications.service` (get) | No | No | No |
| `search.service` (all) | No | No | No |
| `threads.service` (feed) | YES (bidirectional) | No | No |
| `threads.service` (reply) | YES (bidirectional) | No | No |
| `channels.service` (feed) | ONE-WAY only | YES | No |
| `videos.service` (feed) | ONE-WAY only | YES | No |
| `reels.service` (feed) | ONE-WAY only | No | No |
| `recommendations.service` | ONE-WAY only | No | No |

**Overall: Restricts are NEVER enforced. Blocks are frequently one-directional. Mutes are only checked in 4 modules.**
