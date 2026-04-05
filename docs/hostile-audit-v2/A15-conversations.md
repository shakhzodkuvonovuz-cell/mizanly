# A15: Conversations Audit

**Scope:** Conversation creation (1:1 and group), membership management (add/remove members), conversation settings (mute, archive, pin, lock, wallpaper, tone, disappearing timer, message expiry), group admin actions (promote/demote/ban/role change), invite links, group topics.

**Files reviewed:**
- `apps/api/src/modules/messages/messages.service.ts` (1928 lines, every line read)
- `apps/api/src/modules/messages/messages.controller.ts` (771 lines)
- `apps/api/src/gateways/chat.gateway.ts` (800+ lines)
- `apps/api/src/modules/messages/dto/create-dm.dto.ts`
- `apps/api/src/modules/messages/dto/mute-conversation.dto.ts`
- `apps/api/src/modules/messages/dto/archive-conversation.dto.ts`
- `apps/api/src/modules/telegram-features/telegram-features.service.ts` (slow mode)
- `apps/api/src/modules/blocks/blocks.service.ts`
- `apps/api/src/modules/chat-export/chat-export.service.ts`
- `apps/api/prisma/schema.prisma` (Conversation, ConversationMember, Message models)

---

## Findings

### [CRITICAL] A15-01 -- addGroupMembers gated on createdById only, admins cannot add members

**File:** `messages.service.ts` line 767
**Code:** `if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can add members');`

The `addGroupMembers` method only allows the **original creator** (`createdById`) to add members. Admins and owners (the `owner` role from ConversationRole enum) cannot add members. This is inconsistent with every other messaging platform (WhatsApp, Telegram, Signal) where admins can add members. More critically, it is inconsistent with the `updateGroup` method (line 750) which checks `member.role !== 'admin' && member.role !== 'owner' && convo.createdById !== userId` -- a 3-way check. The `addGroupMembers` only checks `createdById`, meaning if the creator's Clerk account is deleted and `createdById` becomes null (schema has `onDelete: SetNull`), **nobody can ever add members again**.

**Impact:** Group becomes permanently unable to add members if creator's account is deleted.

---

### [CRITICAL] A15-02 -- removeGroupMember gated on createdById only, admins cannot remove members

**File:** `messages.service.ts` line 812
**Code:** `if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can remove members');`

Same issue as A15-01. Only the original creator can remove members. Admins and owners cannot. If the creator account is deleted (`createdById` becomes null), nobody can remove members. The `banMember` method (line 1563) correctly checks `actor.role !== 'owner' && actor.role !== 'admin'`, making the inconsistency even worse: an admin can **ban** but cannot **remove** a member.

**Impact:** Privilege escalation gap -- admin can ban (soft) but not remove (hard), and if creator leaves, the group becomes unmanageable.

---

### [CRITICAL] A15-03 -- No ownership transfer mechanism exists

**File:** `messages.service.ts` line 981
**Code:** `throw new BadRequestException('Group owner cannot leave. Transfer ownership first.');`

The `leaveGroup` method tells the owner to "Transfer ownership first" but **no transfer ownership endpoint or service method exists anywhere in the codebase**. Grep for `transferOwnership` across all API source code returns zero results. The owner is permanently trapped in the group with no way to leave. If the owner wants to delete their account, the group becomes orphaned with a null `createdById`, breaking add/remove/changeRole/setHistoryCount which all gate on `createdById`.

**Impact:** Owner lock-in; account deletion creates permanently unmanageable groups.

---

### [HIGH] A15-04 -- banMember allows admin to ban another admin (privilege escalation)

**File:** `messages.service.ts` lines 1559-1576
**Code:**
```typescript
if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
  throw new ForbiddenException('Only owner or admin can ban members');
}
// ...
if (target.role === 'owner') throw new ForbiddenException('Cannot ban the owner');
```

The method protects the owner from being banned but does NOT protect admins from other admins. An admin can ban another admin, effectively removing them from the group. This is a privilege escalation -- two admins can wage a ban war. Contrast with `changeGroupRole` (line 834) which correctly requires `createdById` to change roles. Most platforms (WhatsApp, Telegram) do not allow admins to ban each other -- only the owner/superadmin can.

**Impact:** Admin-on-admin attacks; rogue admin can ban all other admins.

---

### [HIGH] A15-05 -- setDisappearingTimer has no admin/owner gate for group conversations

**File:** `messages.service.ts` lines 1232-1244
**Code:**
```typescript
async setDisappearingTimer(conversationId: string, userId: string, duration: number | null) {
  await this.requireMembership(conversationId, userId);
  // ... no role check
  await this.prisma.conversation.update({
    where: { id: conversationId },
    data: { disappearingDuration: duration },
  });
}
```

Any member (including regular members with no admin privileges) can set the disappearing timer on a **group** conversation. This modifies a conversation-level setting that affects all members. Compare with `setMessageExpiry` (line 1911) which correctly gates on `member.role !== 'admin' && member.role !== 'owner'` for groups. The `setDisappearingTimer` method has no such check.

**Impact:** Regular group member can force all messages to auto-delete, griefing the entire group.

---

### [HIGH] A15-06 -- lockCode is set on the Conversation model, not per-member

**File:** `messages.service.ts` lines 919-932, Prisma schema line 1925
**Code:** `lockCode String? // Secret code to unlock this conversation` (on Conversation model)

The `setLockCode` method updates `conversation.lockCode`, meaning any member who sets a lock code **changes the lock for all members**. One member can lock a conversation for everyone. In a 1:1 DM, this means the other party's lock code gets overwritten. The lock code should be per-member (on `ConversationMember`) not per-conversation. Additionally, there is no admin/owner gate -- any regular member can set the lock code on a group.

**Impact:** Member A sets lock code "1234", Member B sets lock code "5678" -- Member A's code is overwritten and they can no longer unlock.

---

### [HIGH] A15-07 -- joinViaInviteLink does not check group size limit

**File:** `messages.service.ts` lines 886-917

The `addGroupMembers` method correctly checks the 1024-member limit (line 771), but `joinViaInviteLink` does not check the member count at all before creating the membership. An attacker with the invite code could programmatically join thousands of accounts, bypassing the 1024-member limit entirely.

**Impact:** Group size limit bypass; potential resource exhaustion with unlimited members.

---

### [MEDIUM] A15-08 -- pinMessage and unpinMessage have no admin gate for groups

**File:** `messages.service.ts` lines 1389-1431

Both `pinMessage` and `unpinMessage` only call `requireMembership` -- any member can pin or unpin messages in a group. In most messaging platforms, pinning is an admin/owner privilege in groups. A regular member could pin their own messages or unpin admin-pinned announcements.

**Impact:** Griefing -- member can unpin important admin announcements and pin spam.

---

### [MEDIUM] A15-09 -- starMessage has no conversation membership check

**File:** `messages.service.ts` lines 1335-1348
**Code:**
```typescript
async starMessage(userId: string, messageId: string) {
  const message = await this.prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true },
  });
  if (!message) throw new NotFoundException('Message not found');
  return this.prisma.starredMessage.upsert({ ... });
}
```

The `starMessage` method checks that the message exists but does NOT verify that the user is a member of the message's conversation. Any authenticated user who knows or guesses a valid `messageId` (CUIDs are not cryptographically random) can star a message they have no access to. The `unstarMessage` method has the same issue. While starring doesn't leak message content (no content is returned), it confirms message existence (oracle) and creates a cross-conversation reference in the `StarredMessage` table.

**Impact:** Information leak (message existence oracle); cross-conversation data pollution.

---

### [MEDIUM] A15-10 -- addGroupMembers only checks blocks between adder and added users, not between added users and existing members

**File:** `messages.service.ts` lines 787-797
**Code:**
```typescript
const blocks = await this.prisma.block.findMany({
  where: {
    OR: [
      { blockerId: userId, blockedId: { in: memberIds } },
      { blockedId: userId, blockerId: { in: memberIds } },
    ],
  },
});
```

The block check only verifies blocks between the adder (`userId`) and the new members (`memberIds`). It does NOT check if any of the new members have blocked existing group members, or if existing group members have blocked any of the new members. User A blocks User B. Admin C adds User B to a group where User A is a member. Now A and B are in the same group despite the block. The `createGroup` method (line 704) has the same limitation.

**Impact:** Block bypass -- blocked users can end up in the same group conversation.

---

### [MEDIUM] A15-11 -- joinViaInviteLink does not check if joining user is blocked by any group member

**File:** `messages.service.ts` lines 886-917

When a user joins via invite link, there is no block check at all. The method only checks for ban status and existing membership. A user who has been blocked by group members can freely join via the invite link and interact with them.

**Impact:** Block bypass via invite link.

---

### [MEDIUM] A15-12 -- Race condition in addGroupMembers: member count check is not atomic with createMany

**File:** `messages.service.ts` lines 770-802

The member count is checked with `prisma.conversationMember.count()` at line 770, then members are created with `prisma.conversationMember.createMany()` at line 799 -- these are separate queries with no transaction wrapping them. Two concurrent `addGroupMembers` calls could both pass the count check and both succeed, resulting in more than 1024 members. The `createGroup` method wraps its logic in a transaction but `addGroupMembers` does not.

**Impact:** 1024-member limit can be bypassed via concurrent requests.

---

### [MEDIUM] A15-13 -- No conversation deletion endpoint exists

**File:** `messages.controller.ts` (entire file reviewed)

There is no endpoint to delete a conversation. Members can leave groups (`DELETE /groups/:id/members/me`) and messages can be individually deleted, but there is no way for an owner to delete an entire group conversation or for a DM participant to delete a DM. The Prisma schema has `onDelete: Cascade` on `ConversationMember` and `Message` (so a conversation delete would cascade correctly), but no code path exists to trigger it.

**Impact:** Conversations persist forever; no GDPR right-to-erasure path for conversation data.

---

### [MEDIUM] A15-14 -- DM creation transaction uses SERIALIZABLE-unsafe findFirst

**File:** `messages.service.ts` lines 660-683
**Code:**
```typescript
return this.prisma.$transaction(async (tx) => {
  const existing = await tx.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { members: { some: { userId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
  });
  if (existing) return existing;
  return tx.conversation.create({ ... });
});
```

The `$transaction` uses an interactive transaction, which in Prisma defaults to `READ COMMITTED` isolation (not `SERIALIZABLE`). Two concurrent `createDM` calls between the same two users could both pass the `findFirst` check (both see no existing conversation) and both create a new conversation, resulting in **duplicate 1:1 DM conversations**. The `skipDuplicates` approach used in `addGroupMembers` doesn't apply here since there's no unique constraint on the 2-user combination for DMs. The transaction prevents SOME races but not all at the default isolation level.

**Impact:** Duplicate DM conversations between same users under concurrent requests.

---

### [LOW] A15-15 -- verifyLockCode has no brute-force protection beyond rate limiting

**File:** `messages.controller.ts` line 416, `messages.service.ts` lines 934-946

The controller has `@Throttle({ default: { limit: 5, ttl: 300000 } })` (5 attempts per 5 minutes) which is good. However, the service itself has no exponential backoff, account lockout, or failed-attempt counter. After 5 minutes, the attacker can try 5 more codes. For a 4-digit PIN (10,000 possibilities), an attacker needs at most 10,000/5 * 5 minutes = ~16,667 minutes (~11.5 days) to brute-force the code. The `@Throttle` is per-user, so the attacker could rotate through compromised accounts to parallelize.

**Impact:** Lock codes are brute-forceable in days; 4-digit PINs are inherently weak against persistent attackers.

---

### [LOW] A15-16 -- CreateGroupDto allows ArrayMaxSize(100) but addGroupMembers allows 1024 via invite

**File:** `messages.controller.ts` line 138: `@ArrayMaxSize(100) memberIds: string[];`
**File:** `messages.service.ts` line 771: `if (memberCount + memberIds.length > 1024)`

The DTO limits initial group creation to 100 members, and addMembers also limits to 100 per call (same DTO). But the database limit is 1024. This is not a bug -- just a UX inconsistency. However, the invite link path (`joinViaInviteLink`) has no limit at all (see A15-07), creating an asymmetry where the REST API is limited but the invite path is unlimited.

**Impact:** Inconsistent limits; invite path is the least restricted.

---

### [LOW] A15-17 -- changeGroupRole, setHistoryCount use createdById which can be null

**File:** `messages.service.ts` lines 834, 954
**Code:**
```typescript
if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can change roles');
// ...
if (convo.createdById !== userId) throw new ForbiddenException('Only group owner can set this');
```

If the creator deletes their account, `createdById` becomes null (schema: `onDelete: SetNull`). The check `null !== userId` is always true, so these methods become permanently locked -- nobody can change roles or set history count. This is the same root cause as A15-01/A15-02/A15-03 but affects different methods.

**Impact:** Group management features become permanently inaccessible after creator account deletion.

---

### [LOW] A15-18 -- removeGroupMember does not check if target is the creator/owner

**File:** `messages.service.ts` lines 806-818

The `removeGroupMember` method checks that the caller is the creator but does NOT prevent the creator from removing themselves (if `userId === targetUserId`). While the route `/groups/:id/members/:userId` has a separate `/groups/:id/members/me` route for leaving, a creator could call the remove endpoint with their own userId as the `:userId` param. The `leaveGroup` method would block this, but the `removeGroupMember` path doesn't. This would orphan the group since the creator's membership is deleted but `createdById` still points to them.

**Impact:** Creator can orphan their own group through the remove endpoint.

---

### [LOW] A15-19 -- Duplicate promote/demote and changeGroupRole endpoints

**File:** `messages.controller.ts` lines 608-626 (`promoteToAdmin`, `demoteFromAdmin`) and lines 706-716 (`changeGroupRole`)

There are two separate sets of endpoints that do the same thing:
1. `POST /:conversationId/members/:targetUserId/promote` and `/demote` -- check `member.role !== 'owner'`
2. `PATCH /:conversationId/members/:targetUserId/role` -- check `convo.createdById !== userId`

These use **different authorization checks**: promote/demote requires role=owner, while changeGroupRole requires createdById match. A user who is `owner` but not `createdById` (impossible in current code, but the inconsistency is a maintenance trap) would have different permissions across the two paths.

**Impact:** Authorization logic divergence; maintenance hazard as the codebase evolves.

---

### [INFO] A15-20 -- getConversations excludes banned members but getConversation does not filter banned status from member list

**File:** `messages.service.ts` line 134 vs line 151-158

The `getConversations` list endpoint filters `isBanned: false` (line 134), so banned members don't see the conversation in their list. However, `getConversation` (line 151) calls `requireMembership` which throws for banned members, so this is correctly gated. No issue, just noting the defense-in-depth approach.

---

## Checklist Verification

### 1. BOLA -- Can non-members modify conversation settings?
**Verdict: PASS (mostly).** All setting methods (`muteConversation`, `archiveConversation`, `setLockCode`, `verifyLockCode`, `setMemberTag`, `setConversationWallpaper`, `pinConversation`, `setCustomTone`) call `requireMembership` which checks both membership existence and ban status. **Exception:** `starMessage` (A15-09) does not check membership.

### 2. Group admin -- Are group admin actions properly gated?
**Verdict: FAIL.** Multiple inconsistencies:
- `addGroupMembers` and `removeGroupMember` only check `createdById`, not admin/owner role (A15-01, A15-02)
- `banMember` allows admin-on-admin attacks (A15-04)
- `setDisappearingTimer` has no admin gate for groups (A15-05)
- `pinMessage`/`unpinMessage` have no admin gate for groups (A15-08)
- `setLockCode` has no admin gate for groups (A15-06)

### 3. Race conditions -- Concurrent member add/remove?
**Verdict: PARTIAL.** DM creation uses a transaction but at default isolation level which is insufficient (A15-14). `addGroupMembers` has a TOCTOU race on member count (A15-12). `createMany` with `skipDuplicates` prevents duplicate members but not size limit bypass.

### 4. Duplicate conversations -- Can two 1:1 conversations exist between same users?
**Verdict: FAIL.** The DM creation transaction at `READ COMMITTED` isolation can allow duplicate DM conversations under concurrent requests (A15-14). There is no unique constraint in the schema that prevents two non-group conversations between the same pair of users.

### 5. Member limits -- Is group size bounded?
**Verdict: PARTIAL.** `addGroupMembers` checks the 1024 limit but `joinViaInviteLink` does not (A15-07). The member count check in `addGroupMembers` is not atomic (A15-12).

### 6. Leave -- Can the last admin leave? What happens to the group?
**Verdict: FAIL.** The owner cannot leave at all (told to transfer ownership but no transfer mechanism exists -- A15-03). Non-owner admins CAN leave via `leaveGroup` with no check for whether they're the last admin. If the only admin leaves, the group has no admins. The owner is permanently trapped.

### 7. Privacy -- Can users be added to groups by people they've blocked?
**Verdict: FAIL.** Block checks only cover blocks between the adder and the added users, not between added users and existing group members (A15-10). Invite links have no block check at all (A15-11).

### 8. Cascade -- Conversation delete cleans up all messages, members, settings?
**Verdict: N/A (no delete endpoint).** The Prisma schema correctly has `onDelete: Cascade` on ConversationMember and Message relations to Conversation. If a conversation were deleted at the DB level, members, messages, notifications, admin logs, group topics, key envelopes, and checklists would cascade-delete. However, no code path exists to delete a conversation (A15-13).
