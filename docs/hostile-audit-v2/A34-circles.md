# A34 — Hostile Audit: Circles Module

**Scope:** `apps/api/src/modules/circles/` — controller, service, DTOs
**Auditor:** Opus 4.6 | **Date:** 2026-04-05
**Files read:** `circles.controller.ts` (61 lines), `circles.service.ts` (274 lines), 3 DTOs, 2 spec files, Prisma schema (Circle, CircleMember, CircleInvite, Block models)

---

## Findings Summary

| # | Severity | Category | Title | Line(s) |
|---|----------|----------|-------|---------|
| 1 | **CRITICAL** | Data Integrity | `addMembers` and `removeMembers` count updates are NOT in a transaction — crash between createMany/deleteMany and $executeRaw leaves membersCount permanently wrong | service:147-154, 201-207 |
| 2 | **HIGH** | Blocked Users | Blocked users already in a circle remain visible as members — no eviction on block | service (entire file), blocks.service.ts:139 |
| 3 | **HIGH** | Privacy | `addMembers` adds users to a circle WITHOUT their consent — any circle owner can force any user into their circle | service:108-183 |
| 4 | **HIGH** | Missing Feature | No `leave` endpoint — members added to a circle have no way to remove themselves | controller (entire file) |
| 5 | **MEDIUM** | Auth Gap | `getMembers` is owner-only but circle members cannot see who else is in the circle they were added to | service:226-232 |
| 6 | **MEDIUM** | Rate Limit | Controller-level `@Throttle` at 60 req/min is too generous for mutations (create, addMembers, removeMembers all inherit it) | controller:12 |
| 7 | **MEDIUM** | Race Condition | `create()` slug collision retry loop can still exhaust all 3 attempts under heavy load — `randomBytes(4)` gives only 4 billion possibilities but P2002 check is catch-all | service:50-79 |
| 8 | **MEDIUM** | Data Integrity | `addMembers` validates user existence but does not validate that memberIds are unique within the request array — duplicates are silently skipped by `skipDuplicates` but `membersCount` could be wrong | service:147-153 |
| 9 | **MEDIUM** | Missing Feature | No pagination on `getMyCircles` — returns up to 50 circles with no cursor/hasMore metadata | service:31-38 |
| 10 | **MEDIUM** | Notification Spam | `addMembers` sends both CIRCLE_INVITE (to added member) and CIRCLE_JOIN (to owner) for each member — owner gets N notifications when adding N members they just added themselves | service:157-180 |
| 11 | **LOW** | Input Validation | `ManageMembersDto` allows up to 100 memberIds — `addMembers` then queries blocks for all 100 IDs with `take: 50` — if >50 block relationships exist, some are missed | service:130-138 |
| 12 | **LOW** | Consistency | `removeMembers` uses `GREATEST(membersCount - N, 1)` (floor 1) but if the only remaining member is removed (non-owner), the count stays at 1 even with 0 actual non-owner members | service:207 |
| 13 | **LOW** | Missing Feature | No circle member count limit — owner can add up to 100 members per request with no total cap | service:108-183 |
| 14 | **LOW** | Naming Conflict | Both circles and communities modules operate on the `Circle` Prisma model — `circles.service` uses `ownerId` semantics, `communities.service` uses membership semantics on the SAME table | Both modules |
| 15 | **LOW** | Data Integrity | `create()` sets `membersCount: totalMembers` on circle creation but doesn't account for potential skipDuplicates on the member create (though unlikely on fresh circle) | service:54-67 |
| 16 | **INFO** | Cron | `cleanupExpiredCircleInvites` cron runs daily but no invite creation endpoints exist in this module — cleaning up invites that can never be created here | service:254-273 |
| 17 | **INFO** | Missing Feature | `update()` only supports name change — no avatar, description, privacy, or other fields | service:96-99, dto/update-circle.dto.ts |

---

## Detailed Analysis

### F1 — CRITICAL: Count updates not in a transaction (service:147-154, 201-207)

```typescript
// addMembers — line 147-154
const result = await this.prisma.circleMember.createMany({
    data: safeMemberIds.map(id => ({ circleId, userId: id })),
    skipDuplicates: true,
});

// Atomic increment by actual number of rows inserted
if (result.count > 0) {
    await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = "membersCount" + ${result.count} WHERE id = ${circleId}`;
```

The `createMany` and the `$executeRaw` are two separate operations — NOT wrapped in a `$transaction`. If the process crashes, the network drops, or the second query fails after the first succeeds:

- `addMembers`: Members are added but `membersCount` is never incremented. Count is permanently low.
- `removeMembers`: Members are removed but `membersCount` is never decremented. Count is permanently high.

Compare with `communities.service.ts` `join()` which correctly wraps both operations in `$transaction`.

**Impact:** Under normal operation this works, but any failure between the two queries permanently corrupts the count. There is no reconciliation mechanism to fix drifted counts.

---

### F2 — HIGH: Blocked users remain as circle members (service + blocks.service.ts)

The blocks service (line 139) does decrement `membersCount` on circles when a block occurs:
```typescript
await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = GREATEST("membersCount" - 1, 1) WHERE id = ANY(${circleIds}::text[])`;
```

But this only decrements the count — it does NOT actually remove the `CircleMember` record. The blocked user remains a member of the circle in the database. When `getMembers` is called, the blocked user still appears in the member list. The count says they were removed, but the membership record persists.

To properly evict blocked users, `blocks.service.ts` would need to also call `circleMember.deleteMany` for the blocked user across all shared circles.

---

### F3 — HIGH: Users added to circles without consent (service:108-183)

```typescript
async addMembers(circleId: string, userId: string, memberIds: string[]) {
    // ... owner check, user existence check, block check ...
    const result = await this.prisma.circleMember.createMany({
        data: safeMemberIds.map(id => ({ circleId, userId: id })),
        skipDuplicates: true,
    });
```

Any circle owner can add ANY valid, non-blocked user to their circle. The added user has no ability to:
1. Decline being added
2. Know they were added (notification exists but no accept/reject flow)
3. Leave the circle (no leave endpoint — see F4)
4. Block being added by a specific user

This is a harassment vector: a malicious user creates a circle, adds a victim, then posts content visible only to circle members. The victim is involuntarily subscribed to content they didn't choose to see.

In context: Circles are meant for audience selection (like Instagram Close Friends), and the owner controls who is in their circle. The conceptual model is that circle membership is about what the OWNER shares with those people, not about what those people want. However, the lack of F4 (leave endpoint) means users have no escape.

---

### F4 — HIGH: No leave/self-remove endpoint for circle members

The `CirclesController` has these endpoints:
- `GET /circles` — list my circles (as owner)
- `POST /circles` — create
- `PUT /circles/:id` — update name
- `DELETE /circles/:id` — delete (owner only)
- `GET /circles/:id/members` — list members (owner only)
- `POST /circles/:id/members` — add members (owner only)
- `DELETE /circles/:id/members` — remove members (owner only)

There is no endpoint for a member to remove themselves from a circle they were added to. Combined with F3, this means users can be forcibly added to circles with no recourse.

---

### F5 — MEDIUM: `getMembers` is owner-only (service:226-232)

```typescript
async getMembers(circleId: string, userId: string, cursor?: string, limit = 20) {
    const circle = await this.prisma.circle.findUnique({...});
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can view members');
```

Only the circle owner can view the member list. This is conceptually correct (circles are private lists), but it means:

1. A user added to a circle has no way to see who else is in the circle
2. A user has no way to even confirm they ARE in a circle (no "my circles I'm a member of" endpoint)
3. The `getMyCircles` endpoint only returns circles where the user is the OWNER, not circles where they are a MEMBER

Members are essentially invisible participants with no self-awareness of their membership.

---

### F6 — MEDIUM: Controller-level throttle too generous for mutations (controller:12)

```typescript
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('circles')
```

The controller-level throttle allows 60 requests per minute for ALL endpoints. While `create` overrides to 10/min, `addMembers` and `removeMembers` inherit the 60/min limit. An attacker could:

- Call `POST /circles/:id/members` 60 times per minute, each with 100 member IDs = 6,000 forced circle additions per minute
- Call `DELETE /circles/:id/members` 60 times per minute = 6,000 member removals per minute

---

### F8 — MEDIUM: Duplicate memberIds in request can corrupt count (service:147-153)

```typescript
const result = await this.prisma.circleMember.createMany({
    data: safeMemberIds.map(id => ({ circleId, userId: id })),
    skipDuplicates: true,
});

if (result.count > 0) {
    await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = "membersCount" + ${result.count} WHERE id = ${circleId}`;
```

If `memberIds` contains `["user-1", "user-1", "user-2"]`, the `data` array will have two entries for `user-1`. `skipDuplicates` silently drops the second one, so `result.count` is 2 (not 3). In this specific scenario, the count is actually correct because `result.count` reflects actual inserts.

However, if `user-1` is ALREADY a member, `skipDuplicates` drops that entry too, making `result.count = 1` (only `user-2`). The count increment is still correct. So the `skipDuplicates` approach is actually safe for count accuracy.

**Revised severity: This is actually fine.** The `result.count` from `createMany` with `skipDuplicates` accurately reflects net new rows. However, the `ManageMembersDto` should still deduplicate the input array to avoid unnecessary DB work.

---

### F10 — MEDIUM: Owner gets self-notifications when adding members (service:157-180)

```typescript
// Line 168-180 — Notify circle owner that members joined
for (const memberId of safeMemberIds.slice(0, 50)) {
    if (memberId !== userId) {
        this.eventEmitter.emit(NOTIFICATION_REQUESTED, new NotificationRequestedEvent({
            userId,        // <-- notify the owner
            actorId: memberId,
            type: 'CIRCLE_JOIN',
            ...
        }));
    }
}
```

When the owner adds 20 members to their own circle, the owner receives 20 CIRCLE_JOIN notifications about members they just added themselves. This is spammy and confusing — the owner already knows they added those people because they just did it.

The CIRCLE_JOIN notification makes sense when someone joins voluntarily (like communities), but circles have no self-join — all additions are by the owner. These notifications are always useless.

---

### F11 — LOW: Block query capped at 50 (service:130-138)

```typescript
const blocks = await this.prisma.block.findMany({
    where: {
        OR: [
            { blockerId: userId, blockedId: { in: validMemberIds } },
            { blockedId: userId, blockerId: { in: validMemberIds } },
        ],
    },
    select: { blockerId: true, blockedId: true },
    take: 50,   // <-- only first 50 blocks
});
```

If the circle owner has blocked (or been blocked by) more than 50 of the 100 provided member IDs, the block check misses some. Blocked users beyond the 50th can be added to the circle.

In practice: highly unlikely that 50+ block relationships exist with the provided member list, but the `take: 50` is an unnecessary safety limit that could be removed since the input is already capped at 100 member IDs.

---

### F12 — LOW: membersCount floor at 1 even when owner is only member (service:207)

```typescript
await this.prisma.$executeRaw`UPDATE circles SET "membersCount" = GREATEST("membersCount" - ${result.count}, 1) WHERE id = ${circleId}`;
```

The floor of 1 is correct (owner always remains), but it means if you try to remove the owner (which is caught by `safeIds = memberIds.filter(id => id !== circle.ownerId)` at line 196), or if you remove more members than actually exist, the count clamps at 1. This is correct defensive behavior.

However, it masks data corruption: if `membersCount` was already wrong (per F1), the GREATEST clamp hides the evidence.

---

### F13 — LOW: No total member count limit on circles

A circle can accumulate unlimited members through repeated `addMembers` calls (100 per request, 60 requests/minute = 6000 new members/minute). There is no cap like "a circle can have at most 500 members." Extremely large circles would degrade database performance on member list queries.

---

### F14 — LOW: Naming conflict with communities module

Both `circles.service.ts` and `communities.service.ts` operate on the same `Circle` Prisma model. The circles module treats circles as private audience lists (like Instagram Close Friends). The communities module treats circles as public/private groups (like Facebook Groups/Reddit subreddits).

This dual personality means:
- `getMyCircles` returns circles where `ownerId = userId` (circles module semantics)
- `list` in communities returns circles filtered by privacy and membership (communities module semantics)
- The same Circle record can be accessed via both `/circles/:id` and `/communities/:id` endpoints

A circle created via `/circles` (no privacy, no description) shows up in the communities list. A community created via `/communities` (with privacy, description, rules) shows up in "my circles" if the user is the owner.

There is no field to distinguish "this is a personal audience circle" from "this is a public community."

---

### F16 — INFO: Cleaning up invites that cannot be created

```typescript
@Cron('0 3 * * *')
async cleanupExpiredCircleInvites(): Promise<number> {
    const result = await this.prisma.circleInvite.deleteMany({
        where: { expiresAt: { not: null, lt: new Date() } },
    });
```

The `CircleInvite` model exists and this cron cleans expired invites, but neither the circles module nor the communities module has endpoints to CREATE invites. This cron is cleaning up records that can only be created via direct database access.

---

### F17 — INFO: `update()` only supports name change

```typescript
async update(circleId: string, userId: string, name?: string) {
    await this.verifyCircleOwnership(circleId, userId);
    return this.prisma.circle.update({ where: { id: circleId }, data: { ...(name && { name }) } });
}
```

The `UpdateCircleDto` only has a `name` field. No ability to update avatar, description, or any other field. This is very limited but may be intentional since circles are simple audience lists.

---

## Score

| Category | Score | Notes |
|----------|-------|-------|
| BOLA / Authorization | 7/10 | Owner-only checks are consistent and correct |
| Rate Limiting | 5/10 | Mutations inherit generous 60/min controller throttle |
| Privacy | 4/10 | Users forcibly added without consent, no self-awareness of membership |
| Data Integrity | 4/10 | Critical non-transactional count updates, block eviction incomplete |
| Feature Completeness | 4/10 | No leave, no invite, no member self-view, limited update |
| Blocked Users | 6/10 | Block check on add is good, but stale memberships persist after block |
| **Overall** | **5/10** | Correct ownership model, but serious gaps in consent, transactions, and blocked user handling |
