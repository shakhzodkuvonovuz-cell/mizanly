# A33 — Live + Broadcast Module Hostile Audit

**Auditor:** Opus 4.6 | **Date:** 2026-04-05 | **Scope:** `apps/api/src/modules/live/` + `apps/api/src/modules/broadcast/`

---

## Files Audited

| File | Lines | Read |
|------|-------|------|
| `live/live.controller.ts` | 270 | ALL |
| `live/live.service.ts` | 630 | ALL |
| `live/dto/create-live.dto.ts` | 34 | ALL |
| `broadcast/broadcast.controller.ts` | 187 | ALL |
| `broadcast/broadcast.service.ts` | 368 | ALL |
| `broadcast/dto/create-channel.dto.ts` | 28 | ALL |
| `broadcast/dto/update-channel.dto.ts` | (referenced) | N/A |
| `broadcast/dto/send-broadcast.dto.ts` | 26 | ALL |

---

## CRITICAL Findings

### C1: Live `getById` exposes `recordingUrl` to ALL users, including unauthenticated
**File:** `live.service.ts` lines 67-106
**Lines:**
```typescript
select: {
    // ...
    recordingUrl: true,
    // ...
}
```
**Issue:** The `getById` method uses `OptionalClerkAuthGuard` (controller line 77) and includes `recordingUrl` in the select. This means ANY unauthenticated user can access the recording URL of any live session. Recording URLs are typically Cloudflare Stream URLs that grant access to the video content.
**Severity:** HIGH — Recording content accessible without authentication or authorization. Should check if the session is public and if the user has permission to view recordings.

### C2: Live `sendChat` does not verify user is a participant
**File:** `live.service.ts` lines 577-613
**Issue:** The `sendChat` method only checks that the session exists and is LIVE. It does NOT check whether the calling user is actually a participant (or the host) of the live session. Any authenticated user can spam chat messages into any live session.
**Severity:** MEDIUM — No participant check for chat. Should verify user has joined the session.

### C3: Live `inviteGuest` parameter order is swapped
**File:** `live.controller.ts` lines 199-205
**Lines:**
```typescript
async inviteGuest(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: InviteGuestDto) {
    return this.live.inviteGuest(id, dto.guestUserId, userId);
}
```
vs. `live.service.ts` line 419:
```typescript
async inviteGuest(liveId: string, userId: string, hostId: string) {
```
**Issue:** The controller passes `(id, dto.guestUserId, userId)` to service `inviteGuest(liveId, userId, hostId)`. So `dto.guestUserId` maps to the service's `userId` parameter and the calling user's ID maps to `hostId`. This is CORRECT behavior despite the confusing parameter naming. The `requireHost` check at line 420 uses `hostId` which is the caller. BUT the `upsert` at line 429 creates a guest record for `userId` (the guest). So the logic is correct, just poorly named.
**Severity:** INFO — Confusing parameter names but correct behavior.

### C4: Live `promoteToSpeaker` / `demoteToViewer` does not validate target exists
**File:** `live.service.ts` lines 330-344
**Lines:**
```typescript
async promoteToSpeaker(sessionId: string, hostId: string, targetUserId: string) {
    await this.requireHost(sessionId, hostId);
    return this.prisma.liveParticipant.update({
        where: { sessionId_userId: { sessionId, userId: targetUserId } },
        data: { role: 'SPEAKER' },
    });
}
```
**Issue:** If `targetUserId` is not a participant, Prisma will throw a `P2025` (Record not found) error, which will bubble as an unhandled 500 Internal Server Error. Should catch and return 404.
**Severity:** LOW — Error handling gap, not a security issue.

### C5: Live session has no blocked-user filtering
**File:** `live.service.ts` lines 236-290 (join method)
**Issue:** When a user joins a live session, there is no check for:
1. Whether the host has blocked the joining user
2. Whether the joining user has blocked the host
3. Whether the user is banned from the platform (`isBanned`)
The `getActive` method filters out banned/deactivated/deleted hosts (line 112-113), but `join` does not check the joining user's ban status.
**Severity:** MEDIUM — Banned/blocked users can join live sessions.

### C6: Broadcast `getBySlug` returns full channel record including potentially sensitive fields
**File:** `broadcast.service.ts` lines 40-44
**Lines:**
```typescript
async getBySlug(slug: string) {
    const channel = await this.prisma.broadcastChannel.findUnique({ where: { slug } });
    // No select — returns ALL fields
```
**Issue:** No `select` clause means ALL columns are returned, including any internal fields. Should use explicit select to prevent future column additions from leaking.
**Severity:** LOW

### C7: Broadcast `sendMessage` notification fan-out is unbounded
**File:** `broadcast.service.ts` lines 179-224
**Lines:**
```typescript
this.prisma.channelMember.findMany({
    where: { channelId, userId: { not: userId }, isMuted: false },
    select: { userId: true },
    take: 10000,
```
**Issue:** The `take: 10000` cap means a channel with 10K+ subscribers will silently NOT notify the rest. Additionally, the entire 10K subscriber list is loaded into memory at once. For very large channels, this could cause memory spikes.
**Severity:** LOW — Silent notification truncation at 10K subscribers.

### C8: Broadcast `getMessages` uses id-based cursor but sorts by `createdAt`
**File:** `broadcast.service.ts` lines 229-243
**Lines:**
```typescript
const where: Prisma.BroadcastMessageWhereInput = { channelId };
if (cursor) {
    where.id = { lt: cursor };
}
const messages = await this.prisma.broadcastMessage.findMany({
    where,
    // ...
    orderBy: { createdAt: 'desc' },
```
**Issue:** Using `id < cursor` filter with `createdAt` ordering is incorrect if IDs are not ordered the same as `createdAt`. With CUID/UUID IDs, the lexicographic ordering of IDs does not correlate with creation time. This causes pagination to skip or duplicate messages.
**Severity:** MEDIUM — Broken pagination. Messages may be skipped or duplicated.

### C9: Broadcast `discover` uses id-based Prisma cursor but sorts by `subscribersCount`
**File:** `broadcast.service.ts` lines 304-313
**Lines:**
```typescript
async discover(cursor?: string, limit = 20) {
    const channels = await this.prisma.broadcastChannel.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { subscribersCount: 'desc' },
```
**Issue:** Prisma cursor pagination uses the cursor position in the SORTED result set. When sorted by `subscribersCount` (not unique), Prisma's cursor behavior with non-unique sort keys can produce duplicates. If two channels have the same subscribersCount, cursor pagination may skip one.
**Severity:** LOW — Edge case pagination issue.

### C10: Live `getChatMessages` returns messages in REVERSE order without documentation
**File:** `live.service.ts` lines 616-622
**Lines:**
```typescript
async getChatMessages(sessionId: string, limit = 50) {
    const key = this.chatKey(sessionId);
    const raw = await this.redis.lrange(key, 0, limit - 1);
```
**Issue:** `lpush` + `lrange(0, N)` returns newest messages first. The client needs to reverse the array or the UI shows messages upside down. Not a bug per se, but the API doesn't document the ordering.
**Severity:** INFO

### C11: Live `startLive` returns RTMPS key in response body
**File:** `live.service.ts` lines 200-207
**Lines:**
```typescript
return {
    ...updated,
    rtmpsUrl,
    rtmpsKey,
    playbackUrl,
};
```
**Issue:** The RTMPS key is a streaming credential. While only the host receives this response, the key is transmitted over HTTPS in the response body. If logged by any intermediate proxy, load balancer, or Sentry breadcrumb, the stream key leaks. The comment at line 45 says "Return streamKey only to host via separate field" but the `startLive` also returns `rtmpsKey` in the response.
**Severity:** LOW — Acceptable for HTTPS, but should ensure no response logging.

### C12: Broadcast `deleteMessage` does not verify message belongs to the channel
**File:** `broadcast.service.ts` lines 260-267
**Issue:** The delete operation fetches the message, checks role on the message's `channelId`, then deletes. This is correct — the `requireRole` check uses `msg.channelId` from the database, not a user-supplied channelId. No BOLA issue here.
**Severity:** PASS

### C13: Broadcast route ordering — `:slug` wildcard may capture static routes
**File:** `broadcast.controller.ts` lines 79-82
**Lines:** `@Get(':slug')` declared AFTER `@Get('discover')` and `@Get('my')`.
**Issue:** NestJS processes routes in declaration order. Since `discover` and `my` are declared BEFORE `:slug`, they will be matched first. However, `messages/:messageId/pin` is declared BEFORE `:slug` too. This is CORRECT — the code comment at line 23 confirms awareness of this issue.
**Severity:** PASS

### C14: Live `join` increments `totalViews` only on first join, not re-join
**File:** `live.service.ts` lines 260-284
**Issue:** This is CORRECT behavior — re-joining should not inflate view counts. The comment at line 261 documents the intent. This is well-designed.
**Severity:** PASS

### C15: Broadcast `removeSubscriber` allows admin to remove other admins
**File:** `broadcast.service.ts` lines 343-356
**Lines:**
```typescript
async removeSubscriber(channelId: string, userId: string, targetUserId: string) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    // ...
    if (target.role === ChannelRole.OWNER) throw new ForbiddenException('Cannot remove channel owner');
```
**Issue:** An ADMIN can remove another ADMIN. Only the OWNER is protected. This may be intentional, but it creates a privilege escalation vector where Admin A removes Admin B without owner approval.
**Severity:** LOW — Debatable design choice. Most platforms require owner to remove admins.

### C16: Live `updateRecording` accepts arbitrary URL without validation
**File:** `live.controller.ts` lines 170-176, `live.service.ts` lines 346-353
**Issue:** The `SetRecordingDto` validates with `@IsUrl()` (line 23 of controller), which prevents obviously malformed URLs. However, there is no domain whitelist — an attacker who is a host could set the recording URL to a phishing site or malicious URL. Users who click "Watch Recording" would be redirected to the attacker's URL.
**Severity:** MEDIUM — SSRF/phishing vector via recording URL.

### C17: Broadcast service has no check for banned/deactivated channel owners
**File:** `broadcast.service.ts`
**Issue:** When discovering channels or fetching by slug, there is no filter for `isDeleted`, `isBanned`, or `isDeactivated` on the channel owner. A banned user's channel remains discoverable and functional.
**Severity:** MEDIUM — Banned users' channels remain active.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | - |
| HIGH | 1 | C1 |
| MEDIUM | 5 | C2, C5, C8, C16, C17 |
| LOW | 5 | C4, C6, C7, C9, C15 |
| INFO | 2 | C3, C10 |
| PASS | 3 | C12, C13, C14 |

### What's Done Well
- Stream key excluded from list/detail views via `LIVE_SESSION_LIST_SELECT` (only returned on create/start)
- Host-only enforcement via `requireHost()` for all privileged operations
- Guest acceptance uses serializable transaction to prevent race condition (line 440-457)
- Subscribers-only mode properly enforced on join (checks follow relationship)
- Broadcast role system (OWNER > ADMIN > SUBSCRIBER) with proper hierarchy checks
- Slug immutability enforced on update (line 56-59)
- Subscriber count uses GREATEST for decrement (prevents negative counts)
- Comprehensive rate limiting on all mutation endpoints
