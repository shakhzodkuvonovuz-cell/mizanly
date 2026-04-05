# A24 — Hostile Audit: Communities Module

**Scope:** `apps/api/src/modules/communities/` — controller, service, DTOs
**Auditor:** Opus 4.6 | **Date:** 2026-04-05
**Files read:** `communities.controller.ts` (175 lines), `communities.service.ts` (476 lines), 3 DTOs, 3 spec files, Prisma schema (Circle, CircleMember, CommunityRole models)

---

## Findings Summary

| # | Severity | Category | Title | Line(s) |
|---|----------|----------|-------|---------|
| 1 | **CRITICAL** | SQL Bug | Raw SQL uses wrong table name `"Circle"` — will fail at runtime | service:334 |
| 2 | **HIGH** | BOLA | Moderators can update community settings (name, privacy, rules) — overpermission | service:78-85, 215-221 |
| 3 | **HIGH** | Auth Gap | `listRoles` endpoint has no community existence check and no privacy gate | service:450-456, controller:128-133 |
| 4 | **HIGH** | Missing Feature | No kick/ban/remove-member endpoint — roles define `canKick`/`canBan` permissions but no code uses them | service (entire file) |
| 5 | **HIGH** | Missing Feature | No ownership transfer endpoint — `leave()` tells owner to "transfer ownership first" but no endpoint exists | service:320 |
| 6 | **HIGH** | Blocked Users | `join()` does not check if the joining user is blocked by the community owner or any admin | service:271-307 |
| 7 | **MEDIUM** | BOLA | `updateRole`/`deleteRole` controller ignores community ID from URL path — path parameter `_id` is discarded | controller:154, 169 |
| 8 | **MEDIUM** | Race Condition | `join()` has TOCTOU between "check existing member" and "create member" — concurrent joins can create duplicates | service:281-305 |
| 9 | **MEDIUM** | Race Condition | `leave()` has TOCTOU between "check member exists" and "delete member" — concurrent leaves can undercount | service:323-337 |
| 10 | **MEDIUM** | Inconsistency | `leave()` uses `GREATEST(membersCount - 1, 0)` but `join()` increments unconditionally — count can drift | service:301-304 vs 334 |
| 11 | **MEDIUM** | Privacy Leak | `list()` caps private community membership lookup at `take: 50` — user in 51+ private communities won't see all of them | service:148 |
| 12 | **MEDIUM** | Missing Validation | `create()` slug generation is deterministic from name — two users creating "Test" simultaneously both pass the uniqueness pre-check, then one gets P2002 | service:98-101 |
| 13 | **MEDIUM** | Auth Gap | `requireAdmin()` only checks ADMIN role, excludes MODERATOR — inconsistent with `checkUserPermission()` which includes MODERATOR | service:458-475 vs 79-85 |
| 14 | **LOW** | Rate Limit | `listRoles` and `listMembers` have no rate limit — can be scraped freely | controller:128-133, 113-124 |
| 15 | **LOW** | Pagination | `listRoles` has no cursor pagination — returns up to 50 roles in a single query with no `cursor`/`hasMore` | service:450-456 |
| 16 | **LOW** | Missing Feature | No invite system for PRIVATE/INVITE_ONLY communities — `CircleInvite` model exists in schema but no endpoints in this module | service (entire file) |
| 17 | **LOW** | Cascade | Community delete (`prisma.circle.delete`) relies solely on Prisma cascade — no explicit cleanup of Posts (SetNull), Threads (SetNull), Events (SetNull) | service:266 |
| 18 | **LOW** | Data Integrity | `membersCount` on Circle is manually managed (increment/decrement) and can drift from actual member count — no reconciliation | service:293-305, 330-337 |
| 19 | **LOW** | Input Validation | `generateSlug` allows Arabic Unicode in slugs (`\u0600-\u06FF`) but the slug is used in URLs — may cause encoding issues | service:65 |
| 20 | **INFO** | Naming | Module is called "communities" but operates on `Circle` Prisma model — confusing dual identity | Entire module |
| 21 | **INFO** | Cache | `getById` sets `Cache-Control: public, max-age=60` — stale after settings change for up to 60s | controller:53 |

---

## Detailed Analysis

### F1 — CRITICAL: Raw SQL uses wrong table name (service:334)

```typescript
// Line 334
this.prisma.$executeRaw`UPDATE "Circle" SET "membersCount" = GREATEST("membersCount" - 1, 0) WHERE id = ${id}`,
```

The Prisma schema maps `Circle` to the actual PostgreSQL table `circles` via `@@map("circles")`. Raw SQL bypasses Prisma's mapping layer and hits PostgreSQL directly. The table `"Circle"` does not exist — the real table is `circles`. This query will throw a `relation "Circle" does not exist` error on every community leave.

Compare with `circles.service.ts` line 154 which correctly uses `UPDATE circles SET ...`.

**Impact:** Every `leave()` call will fail with a Postgres error at runtime. Members cannot leave communities.

---

### F2 — HIGH: Moderators can update community settings (service:78-85, 215-221)

```typescript
// Line 79-85 — checkUserPermission helper
private async checkUserPermission(circleId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.circleMember.findUnique({...});
    return member?.role === 'OWNER' || member?.role === 'ADMIN' || member?.role === 'MODERATOR';
}

// Line 215-221 — used in update()
if (circle.ownerId !== userId) {
    const hasPermission = await this.checkUserPermission(id, userId);
    if (!hasPermission) {
        throw new ForbiddenException('Only owner or admins can update community');
    }
}
```

`checkUserPermission()` grants MODERATOR the same update privileges as OWNER and ADMIN. A moderator can change the community name, description, privacy level (public to private or vice versa), cover URL, and rules. The error message says "owner or admins" but the code also allows moderators.

This is a privilege escalation: moderators should not be able to change privacy settings or rename the community.

---

### F3 — HIGH: `listRoles` has no existence or privacy check (service:450-456)

```typescript
async listRoles(communityId: string) {
    return this.prisma.communityRole.findMany({
        where: { communityId },
        orderBy: { position: 'asc' },
        take: 50,
    });
}
```

No check that the community exists or is not banned. No privacy check — anyone (even unauthenticated, since controller uses `OptionalClerkAuthGuard`) can enumerate roles of private communities by guessing the community ID.

Role names and permission flags (canKick, canBan, canManageRoles) are organizational metadata that should not be exposed to non-members of private communities.

---

### F4 — HIGH: No kick/ban/remove-member endpoints

The `CommunityRole` model defines `canKick` and `canBan` permissions, and the DTO allows setting them. But there are zero endpoints that actually kick or ban a member from a community. The role permissions are dead configuration.

An admin with `canKick: true` has no API to exercise that permission. Community moderation is non-functional.

---

### F5 — HIGH: No ownership transfer endpoint

```typescript
// Line 320
if (circle.ownerId === userId) {
    throw new BadRequestException('Owner cannot leave community; transfer ownership first');
}
```

The `leave()` method tells the owner to "transfer ownership first" but no `transferOwnership` endpoint exists anywhere in the module. This is a dead end — community owners are permanently trapped.

---

### F6 — HIGH: `join()` does not check block relationships (service:271-307)

The circles module (`circles.service.ts:129-143`) explicitly checks the Block model before adding members. The communities module's `join()` does no such check. A user who is blocked by (or has blocked) the community owner can freely join the community.

---

### F7 — MEDIUM: Controller ignores community ID for role routes (controller:154, 169)

```typescript
// Line 154
@Param('id') _id: string,  // underscore = explicitly unused
```

For `PATCH /communities/:id/roles/:roleId` and `DELETE /communities/:id/roles/:roleId`, the `:id` path parameter is captured but discarded. The service finds the role by `roleId` alone and validates its actual `communityId` internally. While not a direct security bypass (the role's real community is checked), it means:

1. `PATCH /communities/FAKE_ID/roles/REAL_ROLE_ID` succeeds — misleading API behavior
2. No early-exit for nonexistent community IDs in the path
3. API documentation/swagger will show a path param that does nothing

---

### F8 — MEDIUM: `join()` TOCTOU race (service:281-305)

```typescript
// Line 281 — Check
const existing = await this.prisma.circleMember.findUnique({...});
if (existing) throw new ConflictException('Already a member');

// Line 293 — Create (separate call, not in same transaction as check)
await this.prisma.$transaction([
    this.prisma.circleMember.create({...}),
    this.prisma.circle.update({...}),  // increment membersCount
]);
```

Between the check and the create, a concurrent request can also pass the check. The `$transaction` wraps the create and the increment together, but not the existence check. If `CircleMember` has a unique constraint on `(circleId, userId)` (it does — `@@id([circleId, userId])`), one request will get a P2002 error that is not caught, causing a 500 Internal Server Error instead of a clean 409 Conflict.

---

### F9 — MEDIUM: `leave()` TOCTOU race (service:323-337)

Same pattern as F8. The member existence check is outside the transaction. Two concurrent leave requests could both pass the "member exists" check, then the first deletes successfully, and the second gets a Prisma "record not found" error (unhandled).

---

### F10 — MEDIUM: Inconsistent `membersCount` floor values

`join()` (line 301-304) increments `membersCount` via Prisma's `{ increment: 1 }` with no floor.
`leave()` (line 334) uses `GREATEST("membersCount" - 1, 0)` with floor 0.
`circles.service.ts` (line 207) uses `GREATEST("membersCount" - ${result.count}, 1)` with floor 1.

The community can reach `membersCount = 0` even though the owner is always a member (owner cannot leave per F5 check). The circles service correctly uses floor 1 since the owner always remains.

---

### F11 — MEDIUM: `list()` caps private community lookup at 50 (service:148)

```typescript
const memberCircleIds = await this.prisma.circleMember
    .findMany({
        where: { userId: viewerId },
        select: { circleId: true },
    take: 50,     // <-- hard limit
})
```

If a user is a member of more than 50 communities, only the first 50 are included in the OR clause. Private communities beyond the 50th will be invisible to the user in the list, even though they are a member.

---

### F13 — MEDIUM: `requireAdmin` vs `checkUserPermission` inconsistency (service:458-475 vs 79-85)

`checkUserPermission()` grants access to OWNER, ADMIN, and MODERATOR.
`requireAdmin()` grants access to OWNER and ADMIN only (correctly excludes MODERATOR for role management).

The problem: `update()` uses `checkUserPermission()`, meaning moderators can change community settings. But role management uses `requireAdmin()`, correctly excluding moderators. The permission model is inconsistent — a moderator can rename the community but cannot create a role. The authorization model needs a clear decision: what can moderators do?

---

### F14 — LOW: No rate limit on `listRoles` and `listMembers`

Both `listRoles` (controller:128-133) and `listMembers` (controller:113-124) use `OptionalClerkAuthGuard` with no `@Throttle()` decorator. Unauthenticated users can call these endpoints at full speed to enumerate community structure.

---

### F15 — LOW: `listRoles` has no pagination

Returns up to 50 roles in a single response with no cursor-based pagination. While 50 roles is a reasonable limit, the response format breaks the `{ data, meta: { cursor, hasMore } }` convention used by all other list endpoints.

---

### F16 — LOW: No invite system endpoints

The Prisma schema defines `CircleInvite` with `code`, `maxUses`, `useCount`, `expiresAt`, and the `circles.service.ts` has a cron job that cleans up expired invites. But the communities module has zero endpoints for creating, listing, accepting, or revoking invites. Private/invite-only communities are a dead end — nobody can actually be invited.

---

### F17 — LOW: Community delete cascade behavior

`prisma.circle.delete({ where: { id } })` at line 266 relies on Prisma schema cascades. Post and Thread relations use `onDelete: SetNull` (not Cascade), meaning posts/threads survive community deletion with their `circleId` set to null. This is arguably correct behavior (preserve user content) but means:

1. Posts formerly in a private community become orphaned with null circleId — their visibility should be re-evaluated
2. No cleanup of R2 media assets (cover images, etc.)
3. `postsCount` on the deleted circle is lost

---

### F18 — LOW: `membersCount` drift with no reconciliation

`membersCount` is maintained via manual increment/decrement in join/leave operations. There is no periodic reconciliation cron job (like `SELECT count(*) FROM circle_members WHERE circleId = ?`). Over time, race conditions (F8, F9) and edge cases will cause `membersCount` to drift from the actual member count.

---

### F19 — LOW: Arabic Unicode in slugs

```typescript
.replace(/[^a-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g, '-')
```

Allowing Arabic characters in URL slugs can cause issues with URL encoding, browser address bar display, and link sharing. URLs with Unicode characters must be percent-encoded, making them unwieldy.

---

### F20 — INFO: Confusing dual identity

The controller is `CommunitiesController` at `/communities`, the service is `CommunitiesService`, but internally everything operates on the `Circle` Prisma model. The `CommunityRole` model references Circle via `communityId`. This naming confusion (communities vs circles) will cause developer mistakes.

---

### F21 — INFO: Cache-Control on mutable resource

```typescript
@Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
```

After an admin updates community settings (name, privacy, rules), the old data is served from HTTP caches for up to 60 seconds. For privacy changes (public to private), this means the community detail remains publicly visible from caches for up to a minute after going private.

---

## Score

| Category | Score | Notes |
|----------|-------|-------|
| BOLA / Authorization | 4/10 | Moderators overpermissioned, no member removal, no block check on join |
| Rate Limiting | 6/10 | Mutations throttled, but reads (listRoles, listMembers) are open |
| Privacy | 5/10 | Private community detail protected, but roles leaked, member list has 50-cap bug |
| Data Integrity | 4/10 | Critical SQL table name bug, TOCTOU races, membersCount drift |
| Feature Completeness | 3/10 | Roles defined but no kick/ban, no invites, no ownership transfer |
| **Overall** | **4/10** | F1 alone makes leave() broken at runtime |
