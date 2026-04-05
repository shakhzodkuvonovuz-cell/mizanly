# A18: Blocks & Mutes Audit

**Files audited:**
- `apps/api/src/modules/blocks/blocks.controller.ts` (53 lines)
- `apps/api/src/modules/blocks/blocks.service.ts` (253 lines)
- `apps/api/src/modules/mutes/mutes.controller.ts` (53 lines)
- `apps/api/src/modules/mutes/mutes.service.ts` (91 lines)

**Supporting files checked for enforcement:**
- `apps/api/src/common/utils/excluded-users.ts` (75 lines)
- `apps/api/src/gateways/chat.gateway.ts` (block/mute grep)
- `apps/api/src/modules/messages/messages.service.ts` (block grep)
- `apps/api/src/modules/follows/follows.service.ts` (block grep)
- `apps/api/src/modules/stories/stories.service.ts` (block grep)
- `apps/api/src/modules/notifications/notifications.service.ts` (block/mute grep)
- `apps/api/src/modules/search/search.service.ts` (block grep)
- `apps/api/src/modules/users/users.service.ts` (block grep)
- `apps/api/src/modules/feed/feed.service.ts` + `personalized-feed.service.ts` (excluded users grep)
- `apps/api/prisma/schema.prisma` (Block + Mute models)

---

## Findings

### [CRITICAL] A18-1 — `unblock` does not invalidate any cache (Redis profile + excluded-users)

**File:** `blocks.service.ts`, lines 174-185
**Issue:** The `block()` method (lines 97-108) correctly invalidates both the blocked user's profile cache (`user:<username>`) and the blocker's profile cache after blocking. However, `unblock()` (lines 174-185) performs **zero cache invalidation** -- no `user:<username>` deletion, no `excluded:users:<userId>` deletion for either party.

**Impact:** After unblocking, the `excluded:users:<userId>` cache (TTL 60s, `excluded-users.ts` line 4) continues to include the unblocked user. For up to 60 seconds, the unblocked user's content remains hidden in feeds, search, and stories. More importantly, the **profile cache** (`user:<username>`) is never invalidated, so the blocker's follower counts may remain stale indefinitely (profiles are cached with no TTL visible in this code).

**Severity justification:** User-facing bug that causes confusion ("I unblocked them but I still can't see their posts"). In a messaging app, this is trust-breaking.

---

### [CRITICAL] A18-2 — `block()` does not invalidate the `excluded:users:<userId>` cache for either party

**File:** `blocks.service.ts`, lines 97-108; `excluded-users.ts`, lines 22-68
**Issue:** When a block is created, the `excluded:users:<blockerId>` and `excluded:users:<blockedId>` Redis keys are NOT deleted. The `excluded-users.ts` utility caches the exclusion list for 60 seconds (line 4). So after blocking, for up to 60 seconds, the blocked user's content continues to appear in the blocker's feed, search results, and story tray because the stale cache does not include the new block.

**Impact:** A blocked user's content is visible to the blocker for up to 60 seconds post-block. In an abuse scenario, the victim blocks their harasser but still sees their content briefly. The `block()` method only invalidates `user:<username>` profile caches (lines 98-108), not the `excluded:users:` feed-filtering cache.

---

### [CRITICAL] A18-3 — `mute()` and `unmute()` do not invalidate the `excluded:users:<userId>` cache

**File:** `mutes.service.ts`, lines 14-46; `excluded-users.ts`
**Issue:** The MutesService does not inject Redis at all (no `@Inject('REDIS')`). When a user mutes or unmutes someone, the `excluded:users:<userId>` cache (which includes muted users per `excluded-users.ts` line 55-57) is never invalidated. The muted user's content continues to appear in feeds for up to 60 seconds after muting, and after unmuting the user stays hidden for up to 60 seconds.

**Impact:** Same as A18-2 but for mutes. The user presses "Mute" and keeps seeing the muted person's content in their feed.

---

### [HIGH] A18-4 — Blocking does not remove blocked user from shared group conversations

**File:** `blocks.service.ts`, lines 124-172 (`cleanupAfterBlock`)
**Issue:** The cleanup handles two things: (1) removing the blocked user from blocker's **circles** (lines 127-141), and (2) **archiving** shared 1:1 DM conversations (lines 147-171). But there is **no removal from shared group conversations**. If blocker and blocked are in the same group chat, both remain members. The message-level block check in `messages.service.ts` (line 325-336) prevents sending to a group where anyone has blocked the sender, but the blocked user can still see messages from the blocker that were sent before the block, and the blocker's messages continue to be visible to the blocked user in group history.

**Impact:** Blocking someone in a group chat does not actually separate them. The blocked user remains in the group, can see new messages from other members, and historic messages from the blocker. This is inconsistent with the expectation that blocking = complete separation.

---

### [HIGH] A18-5 — WebSocket/chat gateway does not enforce blocks on real-time message delivery

**File:** `chat.gateway.ts`, lines 105-108, 525-528
**Issue:** When a message is broadcast via Redis pub/sub (`new_message` channel, line 108) or via Socket.io room emit (line 528), it is sent to ALL sockets in the `conversation:<id>` room with zero block checking. If two users are in the same group conversation and one has blocked the other, the blocked user's messages still arrive in real-time to the blocker via WebSocket. The block only prevents **sending** (via `messages.service.ts` line 325-336), not **receiving**.

Similarly, typing indicators (line 701+) are broadcast to the entire conversation room without filtering out blocked users. A blocked user can see that the blocker is typing.

**Impact:** The blocker receives real-time messages and typing indicators from the blocked user in group conversations. This defeats the purpose of blocking.

---

### [HIGH] A18-6 — Circle cleanup `take: 50` silently drops circles beyond 50

**File:** `blocks.service.ts`, line 130
**Issue:** `cleanupAfterBlock` fetches the blocker's circles with `take: 50`. If the blocker owns more than 50 circles, the blocked user is NOT removed from circles 51+. There is no pagination or warning. The same `take: 50` pattern appears on line 54 for follows (though that is inside the transaction and less concerning because follows are bilateral, limited to 2 max).

**Impact:** Power users or creators with many circles will have incomplete block enforcement. The blocked user remains in some circles silently.

---

### [HIGH] A18-7 — DM archive `take: 50` silently drops conversations beyond 50

**File:** `blocks.service.ts`, line 158
**Issue:** The DM archival query uses `take: 50`. If two users share more than 50 1:1 conversations (unlikely but possible with conversation recreation), conversations beyond 50 are not archived. More importantly, this is a silent failure with no logging or pagination.

---

### [MEDIUM] A18-8 — Circle `membersCount` decrement is wrong for multiple affected circles

**File:** `blocks.service.ts`, line 139
**Issue:** The SQL `UPDATE circles SET "membersCount" = GREATEST("membersCount" - 1, 1) WHERE id = ANY(${circleIds}::text[])` decrements ALL circles in `circleIds` by 1, even if the blocked user is only a member of some of them. The `deleteMany` on line 134 deletes the blocked user from whichever circles they were in, and `result.count` tells us how many were actually affected. But the SQL decrements ALL blocker's circles (up to 50), not just the ones where the blocked user was actually a member.

Additionally, `GREATEST("membersCount" - 1, 1)` uses a floor of 1, meaning a circle with 0 members would show 1 member. The floor should be 0, not 1.

**Impact:** Over-decrementing circle member counts. If the blocker has 30 circles but the blocked user was in only 2, all 30 circles get their count decremented.

---

### [MEDIUM] A18-9 — No mute granularity: muting hides both content AND notifications

**File:** `mutes.service.ts` (entire file); `excluded-users.ts`, line 55-57
**Issue:** The Mute model has only `userId` + `mutedId` + `createdAt` (schema lines 2415-2426). There is no `muteType` field (e.g., "notifications_only" vs "content_and_notifications"). Muting a user adds them to `excluded:users:` which filters them from feeds, search, stories, AND notifications (`notifications.service.ts` line 272). Users cannot mute just notifications while still seeing content, or mute content but still receive notifications.

Instagram/Twitter both offer separate "mute posts" and "mute notifications" controls.

**Impact:** Feature gap. Users who want to reduce notification noise from a specific user must accept complete content hiding.

---

### [MEDIUM] A18-10 — `cleanupAfterBlock` is fire-and-forget: failures leave orphaned data

**File:** `blocks.service.ts`, lines 112-115
**Issue:** The block is created and returned as success (line 117) BEFORE `cleanupAfterBlock` runs. If cleanup fails (circles, DM archival), the errors are logged and sent to Sentry (line 114), but there is no retry mechanism. Orphaned circle memberships and unarchived DMs remain permanently until manually fixed.

**Impact:** If Prisma/DB has a transient error during cleanup, the blocked user stays in the blocker's circles and DMs are not archived. No automatic retry.

---

### [MEDIUM] A18-11 — Unblock does not un-archive DM conversations

**File:** `blocks.service.ts`, lines 174-185
**Issue:** When blocking, `cleanupAfterBlock` archives shared DM conversations (line 161). When unblocking, nothing reverses this. The archived conversations remain archived. The user must manually un-archive them. This may be intentional design, but there is no documentation or comment explaining the decision.

**Impact:** After unblocking someone, the user may not realize their old DM conversations are still archived and hidden. They may think unblocking is broken.

---

### [MEDIUM] A18-12 — `getBlockedIds` returns up to 10,000 IDs but has no pagination for callers

**File:** `blocks.service.ts`, lines 235-252
**Issue:** `getBlockedIds` has a hard cap of `take: 10000` (line 245). If a user has more than 10,000 blocks (bidirectional), the list is truncated silently. Blocked users beyond 10,000 would leak through to feeds and search. The comment on line 233 acknowledges this was raised from 1,000 to 10,000, but there is no mechanism to handle the case where it overflows.

Same issue exists in `getMutedIds` (`mutes.service.ts` line 88, `take: 10000`).

**Impact:** Edge case but safety-critical: if a user is involved in 10,001+ block relationships, some blocked content leaks through.

---

### [LOW] A18-13 — Mute does not validate that the target user is not already blocked

**File:** `mutes.service.ts`, lines 14-37
**Issue:** A user can mute someone they have already blocked. The mute record is created redundantly. This is harmless (both block and mute are enforced separately), but it creates unnecessary DB records and could confuse the user's muted list (showing a user they have also blocked).

---

### [LOW] A18-14 — `unblock` has a TOCTOU race between `findUnique` and `delete`

**File:** `blocks.service.ts`, lines 176-183
**Issue:** `unblock()` first checks if the block exists (line 176), then deletes it (line 181). Between these two queries, a concurrent request could delete the same block. The `delete` would then throw a P2025 ("Record not found") error which is not caught. The `block()` method handles its equivalent race (P2002 on concurrent create, line 91), but `unblock()` does not handle P2025.

**Impact:** Rare race condition. Concurrent unblock requests for the same pair would cause a 500 error for one of them.

---

### [LOW] A18-15 — Block/unblock rate limit (30/min) allows rapid block-spam against many users

**File:** `blocks.controller.ts`, line 19
**Issue:** The throttle is 30 requests per 60 seconds. This means a user can block 30 different users per minute. Over time, a malicious user could systematically block thousands of users. Combined with the fact that blocking triggers `cleanupAfterBlock` (DB writes for circles + DMs), this could be used as a low-rate DB amplification attack: each block triggers 3-5 DB writes (transaction + circle query + circle delete + DM query + DM update).

**Impact:** 30 blocks/min = 150+ DB writes/min from a single user. Not catastrophic, but the rate limit could be tighter for mutation endpoints (10/min would be more appropriate).

---

### [LOW] A18-16 — Blocked user receives no signal about being blocked (intentional but undocumented)

**File:** `blocks.service.ts`, lines 21-117
**Issue:** When user A blocks user B, no WebSocket event, push notification, or any signal is sent to user B. User B discovers they are blocked only when they try to view A's profile (403), send a message (403), or follow (403). This is consistent with Instagram/Twitter behavior but is undocumented as a design decision.

**Impact:** Design decision, not a bug. But should be documented.

---

### [INFO] A18-17 — BlocksService is exported but only used via direct Prisma queries elsewhere

**File:** `blocks.module.ts` line 8 (exports BlocksService)
**Issue:** `BlocksService` is exported, but no other module imports it. Every other service that checks blocks (users, messages, stories, feed, notifications, search) uses direct `prisma.block.findFirst/findMany` queries instead of calling `BlocksService.isBlocked()` or `BlocksService.getBlockedIds()`. This means:
1. The bidirectional block check logic is duplicated across ~8 services
2. If the block enforcement logic changes (e.g., soft-delete instead of hard-delete), every service must be updated independently
3. The `isBlocked()` helper (line 221) and `getBlockedIds()` helper (line 235) exist but are apparently unused outside the module

**Impact:** Maintenance risk. Logic duplication means block enforcement is inconsistent if one service is missed during a change.

---

### [INFO] A18-18 — MutesService has no `isMuted(userA, userB)` helper

**File:** `mutes.service.ts` (entire file)
**Issue:** `BlocksService` provides `isBlocked(userA, userB)` (line 221) for point checks. `MutesService` has no equivalent `isMuted()` method. Any service that needs a point check on mute status must query Prisma directly. This is inconsistent API design between the two closely related modules.

---

## Checklist Verification

### 1. Self-block -- Can user block themselves?
**PASS.** `blocks.service.ts` line 22: `if (blockerId === blockedId) throw new BadRequestException('Cannot block yourself')`. `mutes.service.ts` line 15: `if (userId === mutedId) throw new BadRequestException('Cannot mute yourself')`.

### 2. Cascade -- Does blocking also unfollow? Remove from groups? Hide messages?
**PARTIAL PASS.**
- Unfollow: YES (lines 64-87, inside transaction, bidirectional)
- Follow requests: YES (lines 72-79, both directions)
- Circles: YES (lines 127-141, blocker's circles only)
- DM archive: YES (lines 147-171, 1:1 only)
- Group conversations: **NO** -- blocked user stays in shared groups (A18-4)
- Likes/reactions/bookmarks: **NO** -- not cleaned up
- Story views: **NO** -- existing views not cleaned up

### 3. Race conditions -- Concurrent block/unblock?
**PARTIAL PASS.**
- Concurrent block: HANDLED (P2002 caught at line 91, idempotent return)
- Concurrent unblock: **NOT HANDLED** (P2025 not caught, A18-14)
- Block + cleanup race: cleanup is fire-and-forget (A18-10)

### 4. Bidirectional -- Does blocking work both ways?
**PASS.** `isBlocked()` (line 222-231) checks both directions with OR. `getBlockedIds()` (line 235-252) collects IDs from both sides. `excluded-users.ts` (line 33-34) queries both `blockerId` and `blockedId`. Profile, feed, stories, search, messages, follow, notification services all check bidirectional.

### 5. Rate limit -- Block/mute spam?
**PARTIAL PASS.** Both controllers have `@Throttle({ default: { limit: 30, ttl: 60000 } })`. This is reasonable but on the high side for mutation endpoints (A18-15).

### 6. Mute granularity -- Can you mute notifications without muting content?
**FAIL.** No granularity. Muting hides content AND blocks notifications. No `muteType` or separate notification mute (A18-9).

### 7. Leak -- Does the blocked user know they've been blocked?
**PASS (by design).** No notification or signal is sent to the blocked user. They discover it passively via 403 errors. This matches industry standard (Instagram, Twitter). Not documented as a decision (A18-16).

### 8. Persistence -- Are blocks/mutes cached in Redis? Can cache go stale?
**FAIL.**
- `excluded:users:<userId>` cache (60s TTL) is used by feeds, search, stories -- but is **never invalidated** on block, unblock, mute, or unmute (A18-2, A18-3)
- Profile cache (`user:<username>`) is invalidated on block but NOT on unblock (A18-1)
- Staleness window: up to 60 seconds for feed caches, potentially indefinite for profile caches on unblock

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 3 | A18-1, A18-2, A18-3 |
| HIGH | 4 | A18-4, A18-5, A18-6, A18-7 |
| MEDIUM | 5 | A18-8, A18-9, A18-10, A18-11, A18-12 |
| LOW | 4 | A18-13, A18-14, A18-15, A18-16 |
| INFO | 2 | A18-17, A18-18 |
| **Total** | **18** | |
