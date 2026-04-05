# A08: Threads Module Audit

**Scope:** `threads.controller.ts` (368 lines), `threads.service.ts` (1291 lines), 6 DTO files  
**Auditor:** Hostile code audit  
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] A08-01 — getUserThreads leaks FOLLOWERS and CIRCLE visibility threads to any viewer

**File:** `threads.service.ts`, lines 1070-1077  
**Code:**
```typescript
const threads = await this.prisma.thread.findMany({
  where: { userId: user.id, isRemoved: false, isChainHead: true,
    ...(isOwn ? {} : { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }) },
  ...
});
```
**Problem:** When `isOwn` is false, the query only filters out future-scheduled threads. It does NOT filter by `visibility`. A non-follower, non-circle-member can call `GET /threads/user/:username` and see all threads with `visibility: 'FOLLOWERS'` and `visibility: 'CIRCLE'`. The `getById` method has correct visibility enforcement (lines 500-517), but `getUserThreads` skips it entirely.

**Impact:** Complete visibility bypass. Private threads intended only for followers or circle members are exposed to any authenticated or anonymous user browsing a profile.

**Fix:** Add `visibility` filtering for non-owners: `visibility: 'PUBLIC'` for anonymous, add follower/circle check for authenticated viewers, or at minimum add `visibility: 'PUBLIC'` when `!isOwn`.

---

### [HIGH] A08-02 — addReply does not check block status between replier and thread author

**File:** `threads.service.ts`, lines 927-990  
**Code:** The `addReply` method checks thread existence, moderation, and reply permissions, but never checks if the replier is blocked by the thread author or vice versa.

**Problem:** A blocked user can still reply to threads authored by the user who blocked them. The `getById` method (line 523-532) correctly checks blocks, and `getReplies` (line 848) filters replies from blocked/muted users in the viewer's list, but the actual creation path has no block guard.

**Impact:** Blocked users can harass thread authors by posting replies. The replies would be invisible to the author (filtered by `getExcludedUserIds` on read), but visible to all other users, creating the perception that the blocked user is still engaging with the author's content.

---

### [HIGH] A08-03 — like, repost, bookmark operations do not check block status

**File:** `threads.service.ts`, lines 685-843  
**Problem:** The `like` (line 685), `repost` (line 745), and `bookmark` (line 810) methods fetch the thread and check for existence/removal but never check if the acting user is blocked by the thread author or vice versa. A blocked user can:
1. Like threads of the person who blocked them (triggering a notification to the blocker at line 713)
2. Repost their content (triggering a notification at line 783)
3. Bookmark their content

**Impact:** Blocked users can still interact with and amplify content from users who blocked them. Notifications from blocked users reach the blocker, defeating the purpose of blocking. The repost is particularly severe: it creates a new thread visible in feeds that references the blocked user's content.

---

### [HIGH] A08-04 — deleteReply is a soft-delete that preserves userId, enabling re-identification

**File:** `threads.service.ts`, lines 992-1002  
**Code:**
```typescript
await this.prisma.$transaction([
  this.prisma.threadReply.update({ where: { id: replyId }, data: { content: '[deleted]' } }),
  this.prisma.$executeRaw`UPDATE "threads" SET "repliesCount" = GREATEST("repliesCount" - 1, 0) WHERE id = ${reply.threadId}`,
]);
```
**Problem:** The soft-delete replaces content with `[deleted]` but leaves the `userId` intact. The reply row still has `userId`, `createdAt`, and `mediaUrls` fields populated. The `REPLY_SELECT` (line 83-100) always includes `user` with `username`, `displayName`, `avatarUrl`. When replies are fetched via `getReplies`, the "deleted" reply still appears with full author info and `content: '[deleted]'`.

Wait -- actually checking: the deleted reply is not filtered out from `getReplies` because there is no `isRemoved` check on replies. Let me re-read...

The `getReplies` query (line 849-862) does NOT filter `isRemoved: false`. The `ThreadReply` model has `isRemoved Boolean @default(false)` (schema line 1622), but `deleteReply` sets `content: '[deleted]'` instead of setting `isRemoved: true`. So "deleted" replies are still returned in reply lists with the author's full identity visible.

**Impact:** Users who delete replies expect removal. Instead, their identity remains visible attached to a `[deleted]` marker. This is a privacy violation. Additionally, `mediaUrls` on the reply (if any) are not cleared.

---

### [MEDIUM] A08-05 — votePoll has no @Throttle decorator

**File:** `threads.controller.ts`, lines 77-86  
**Code:**
```typescript
@Post('polls/:optionId/vote')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Vote on a poll option' })
votePoll(...)
```
**Problem:** No `@Throttle` decorator. While the service has a duplicate vote check (ConflictException), an attacker can send thousands of vote requests per minute to different polls, wasting DB resources and potentially causing lock contention on the poll/option rows.

---

### [MEDIUM] A08-06 — dismiss endpoint has no @Throttle decorator

**File:** `threads.controller.ts`, lines 257-267  
**Code:**
```typescript
@Post(':id/dismiss')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Dismiss a thread from feed (not interested)' })
dismiss(...)
```
**Problem:** No rate limiting. An attacker can call dismiss on thousands of thread IDs per minute, causing massive upsert operations against the `feedDismissal` table.

---

### [MEDIUM] A08-07 — getFeed has no @Throttle decorator and allows anonymous access

**File:** `threads.controller.ts`, lines 41-51  
**Code:**
```typescript
@Get('feed')
@UseGuards(OptionalClerkAuthGuard)
// No @Throttle
getFeed(...)
```
**Problem:** The feed endpoint is the most expensive query in the module (500-row fetch + scoring + Redis cache population). It uses `OptionalClerkAuthGuard` (allows anonymous), and has no rate limit. An attacker can hammer this endpoint to force repeated cache misses (e.g., by varying the cursor) and exhaust DB connections.

---

### [MEDIUM] A08-08 — recordView has no deduplication, enabling artificial view inflation

**File:** `threads.service.ts`, lines 553-558  
**Code:**
```typescript
async recordView(threadId: string): Promise<void> {
  await this.prisma.thread.update({
    where: { id: threadId },
    data: { viewsCount: { increment: 1 } },
  }).catch(...);
}
```
**Problem:** Every `GET /threads/:id` request increments `viewsCount` by 1 with no deduplication by user or IP. The comment on line 551 says "no dedup -- matches Instagram behavior" but Instagram actually uses probabilistic counting (HyperLogLog) and deduplicates by account. The endpoint uses `OptionalClerkAuthGuard` (anonymous allowed) and has no rate limit.

**Impact:** Any user (or bot) can inflate any thread's view count by repeatedly hitting `GET /threads/:id`. Since view counts are included in feed scoring (`viewsCount` is selected in `THREAD_SELECT`), this can manipulate feed ranking. At scale, automated bots could inflate views for paid promotion or competitive sabotage.

---

### [MEDIUM] A08-09 — createContinuation has race condition on chainPosition

**File:** `threads.service.ts`, lines 631-644  
**Code:**
```typescript
const chainCount = await this.prisma.thread.count({ where: { chainId } });

const continuation = await this.prisma.thread.create({
  data: {
    ...
    chainPosition: chainCount + 1,
    ...
  },
});
```
**Problem:** The `count` and `create` are not in a transaction. Two concurrent continuation requests can read the same `chainCount` and both create threads with the same `chainPosition`. There is no unique constraint on `(chainId, chainPosition)` in the schema.

**Impact:** Duplicate chain positions cause undefined ordering in unroll views. The unroll query (line 1237-1242) orders by `chainPosition: 'asc'`, so duplicates appear in arbitrary order.

---

### [MEDIUM] A08-10 — ReplyPermission enum case mismatch between DTO and Prisma

**File:** `dto/set-reply-permission.dto.ts` lines 1-6, `threads.service.ts` lines 1120-1134  
**DTO validation:**
```typescript
@IsEnum(['everyone', 'following', 'mentioned', 'none'])
permission: 'everyone' | 'following' | 'mentioned' | 'none';
```
**Prisma enum:**
```prisma
enum ReplyPermission {
  EVERYONE
  FOLLOWING
  MENTIONED
  NONE
}
```
**Service code (line 1132):**
```typescript
data: { replyPermission: permission as ReplyPermission },
```

**Problem:** The DTO accepts lowercase (`'everyone'`), but Prisma's `ReplyPermission` enum is uppercase (`'EVERYONE'`). The service casts with `as ReplyPermission` (line 1132), bypassing type checking. When Prisma receives `'everyone'` (lowercase), it will throw a runtime error because the enum value doesn't match.

Meanwhile, the `canReply` method (line 1148) compares against uppercase: `permission === 'NONE'`, `permission === 'EVERYONE'`, etc. So even if lowercase values somehow persisted, the permission checks would fail silently (falling through to the `return { canReply: false, reason: 'unknown' }` at line 1171), locking everyone out of replying.

And `addReply` (line 941) compares against uppercase too: `thread.replyPermission !== 'EVERYONE'`, `thread.replyPermission === 'FOLLOWING'`, etc.

**Impact:** `PUT /threads/:id/reply-permission` likely throws a Prisma runtime error on every call, making reply permissions completely non-functional.

---

### [MEDIUM] A08-11 — getThreadUnroll has no pagination, fetches up to 50 chain parts in one response

**File:** `threads.service.ts`, lines 1237-1242  
**Code:**
```typescript
const chain = await this.prisma.thread.findMany({
  where: { chainId: thread.chainId, isRemoved: false },
  select: THREAD_SELECT,
  orderBy: { chainPosition: 'asc' },
  take: 50,
});
```
**Problem:** Returns up to 50 full thread objects (each with user, poll, circle, repostOf relations) in a single response with no cursor pagination. `THREAD_SELECT` is a heavy select with 6 nested includes. 50 threads with all includes can produce a response body of 100KB+. The endpoint uses `OptionalClerkAuthGuard` (anonymous) and has no `@Throttle`.

---

### [MEDIUM] A08-12 — mediaTypes in CreateThreadDto accepts arbitrary strings with no whitelist

**File:** `dto/create-thread.dto.ts`, lines 63-67  
**Code:**
```typescript
@IsOptional()
@IsArray()
@IsString({ each: true })
@ArrayMaxSize(4)
mediaTypes?: string[];
```
**Problem:** `mediaTypes` accepts any string. There is no validation against a whitelist of acceptable MIME types (e.g., `image/jpeg`, `image/png`, `video/mp4`). The service uses `mediaTypes` to decide which media to moderate (line 347: `t.startsWith('image')`) and which to queue for processing (line 418). An attacker can bypass image moderation by submitting an image URL with `mediaTypes: ['application/octet-stream']` instead of `'image/jpeg'`.

**Impact:** Content moderation bypass. Harmful images can be attached to threads without triggering the AI moderation check.

---

### [MEDIUM] A08-13 — mediaUrls accepts any URL, not restricted to Mizanly's R2 bucket

**File:** `dto/create-thread.dto.ts`, lines 55-60  
**Code:**
```typescript
@IsUrl({}, { each: true })
@ArrayMaxSize(4)
mediaUrls?: string[];
```
**Problem:** `@IsUrl({})` accepts any valid URL. A user can submit `mediaUrls: ['https://evil.com/malware.exe']` or `mediaUrls: ['http://internal-service:3000/admin']`. The URL is stored in the DB and returned to all clients who view the thread. It's also passed to `this.ai.moderateImage(url)` (line 350) and `this.queueService.addMediaProcessingJob` (line 421), both of which will fetch the URL server-side, creating an SSRF vector.

**Impact:** 
1. SSRF: Server-side image moderation fetches attacker-controlled URLs, potentially reaching internal services.
2. Stored XSS potential if clients render URLs without validation.
3. Phishing: Threads can contain links to malware/phishing sites disguised as media.

---

### [LOW] A08-14 — report() silently returns success on duplicate report without notifying user

**File:** `threads.service.ts`, lines 1091-1095  
**Code:**
```typescript
const existing = await this.prisma.report.findFirst({
  where: { reporterId: userId, reportedThreadId: threadId },
});
if (existing) return { reported: true };
```
**Problem:** If a user reports the same thread twice, the endpoint returns `{ reported: true }` without indicating it was a duplicate. The `reason` field in the second report is silently discarded. If a user reported for "SPAM" initially but wants to add "HATE_SPEECH", they can't update or add reasons.

---

### [LOW] A08-15 — report() maps free-text `reason` string to enum but ReportDto accepts any string

**File:** `dto/report.dto.ts` and `threads.service.ts` lines 1097-1107  
**DTO:**
```typescript
@IsString()
@MinLength(3)
@MaxLength(500)
reason: string;
```
**Service:**
```typescript
const reasonMap: Record<string, ReportReason> = {
  SPAM: 'SPAM', MISINFORMATION: 'MISINFORMATION',
  INAPPROPRIATE: 'OTHER', HATE_SPEECH: 'HATE_SPEECH',
};
await this.prisma.report.create({
  data: { reason: reasonMap[reason] ?? 'OTHER', ... },
});
```
**Problem:** The DTO accepts any string 3-500 chars as a "reason", but the service maps it to an enum with only 4 keys. Any free-text reason like "This person is threatening me" maps to `'OTHER'`, losing all context. The user's actual reason text is never stored. If the intent is for users to select from predefined reasons, the DTO should use `@IsEnum`. If the intent is free-text, the text should be stored (perhaps in a separate `description` field).

---

### [LOW] A08-16 — blendedThreadFeed does not filter by visibility for non-public threads

**File:** `threads.service.ts`, lines 293-332  
**Code (line 298-310):**
```typescript
const followingThreads = await this.prisma.thread.findMany({
  where: {
    isRemoved: false,
    isChainHead: true,
    OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    userId: { in: allowedUserIds },
    user: { isDeactivated: false, isBanned: false, isDeleted: false },
    ...(cursor ? { id: { lt: cursor } } : {}),
  },
  ...
});
```
**Problem:** This query fetches threads from followed users but does NOT filter by visibility. It returns `CIRCLE` visibility threads to followers who may not be in the circle. Compare to the main `following` feed (lines 202-211) which does have a visibility check: `AND: [{ OR: [{ visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS' }, { userId }] }]`. The blended feed path (triggered when user has < 10 follows) omits this check.

**Impact:** `CIRCLE`-visibility threads leak into the blended feed for users with few follows.

---

### [LOW] A08-17 — thread delete is soft-delete (isRemoved: true) but chain continuations are not cleaned up

**File:** `threads.service.ts`, lines 649-683  
**Problem:** When a thread is deleted (soft-deleted via `isRemoved: true`), the method does NOT handle chain continuations. If the deleted thread is a chain head (`isChainHead: true`), the continuation threads (same `chainId`) become orphaned -- they still reference the deleted thread's `chainId` but the head is removed. The `getThreadUnroll` method (line 1237) filters `isRemoved: false`, so the chain head disappears but continuations remain, creating a headless chain.

Additionally, if a non-head continuation is deleted, the `chainPosition` values have a gap, though this is cosmetic since ordering still works.

---

### [LOW] A08-18 — forYou feed scoring uses per-user Redis cache key but excludedIds are baked into the cache

**File:** `threads.service.ts`, lines 142-176  
**Code:**
```typescript
const sfeedKey = `sfeed:majlis:foryou:${userId}`;
// ...TTL 120s...
async (): Promise<ScoredItem[]> => {
  // excludedIds applied inside scoreFn
  if (excludedIds.length) where.userId = { notIn: excludedIds };
  // ...
}
```
**Problem:** The `scoreFn` (cache miss handler) filters out `excludedIds`. But the cache is keyed only by `userId`. If a user blocks someone, the cache is stale for up to 120 seconds, showing threads from the newly-blocked user. The `getExcludedUserIds` utility also has its own 60-second Redis cache. Worst case: a user blocks someone and continues seeing their threads for up to 180 seconds (60s excluded cache + 120s feed cache).

This is an acceptable UX tradeoff for performance, but should be documented.

---

### [INFO] A08-19 — PollOptionDto has no minimum length validation

**File:** `dto/create-thread.dto.ts`, lines 8-13  
**Code:**
```typescript
class PollOptionDto {
  @IsString()
  @MaxLength(100)
  text: string;
}
```
**Problem:** A user can create poll options with empty string `""` as text. Should have `@MinLength(1)` or `@IsNotEmpty()`.

---

### [INFO] A08-20 — CreatePollDto allows 0 or 1 options

**File:** `dto/create-thread.dto.ts`, lines 15-37  
**Code:**
```typescript
@IsArray()
@ValidateNested({ each: true })
@Type(() => PollOptionDto)
@ArrayMaxSize(4)
options: PollOptionDto[];
```
**Problem:** No `@ArrayMinSize(2)`. A poll can be created with 0 or 1 option, which is semantically invalid.

---

### [INFO] A08-21 — shareToStory does not check blocked status

**File:** `threads.service.ts`, lines 1188-1216  
**Problem:** `shareToStory` checks visibility (non-public threads can't be shared by non-owners) but does not check if the viewer is blocked by the thread author. A blocked user can get thread content formatted for story sharing via `GET /threads/:id/share-story`.

---

### [INFO] A08-22 — getThreadUnroll does not check blocked status

**File:** `threads.service.ts`, lines 1219-1248  
**Problem:** `getThreadUnroll` returns thread chain data to any user (including anonymous) without checking if the requesting user is blocked by the chain author. Only checks `visibility !== 'PUBLIC'` (line 1227). Since all returned threads must be PUBLIC, blocked-user visibility isn't strictly a security issue here, but it's inconsistent with `getById` which does check blocks.

---

## Checklist Verification

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | **BOLA** — Can user A edit/delete user B's thread? | **PASS** | `updateThread` (line 563) and `delete` (line 652) both check `thread.userId !== userId` and throw `ForbiddenException`. `setReplyPermission` (line 1123) also checks ownership. `createContinuation` (line 609) checks ownership. `deleteReply` (line 995) checks `reply.userId !== userId`. |
| 2 | **Pagination** — Unbounded queries? | **PARTIAL FAIL** | Feed queries are bounded: `take: 500` for scoring, `take: limit + 1` for pagination. However, `getThreadUnroll` returns up to 50 items with no cursor pagination (A08-11). The `follows` query in `getFeed` has `take: 5000` (line 133) which is large. |
| 3 | **Rate limit** — Thread creation/reply without @Throttle? | **PARTIAL FAIL** | Thread creation (10/min) and replies (30/min) are throttled. However, `getFeed` (A08-07), `votePoll` (A08-05), `dismiss` (A08-06), `getById`, `getReplies`, `getUserThreads`, `canReply`, `getShareLink`, `isBookmarked`, `shareToStory`, `getThreadUnroll`, `getThreadAnalytics` all lack `@Throttle`. |
| 4 | **Race conditions** — Concurrent reply counts? | **PARTIAL FAIL** | Like/unlike use `$transaction` with counter increment (good). But `createContinuation` has a TOCTOU race on `chainPosition` (A08-09). `recordView` has no atomicity concerns (single increment) but has dedup issues (A08-08). |
| 5 | **Cascade** — Thread delete cleans up replies, likes, reports? | **PARTIAL PASS** | Thread delete is a soft-delete (`isRemoved: true`), not a hard delete, so Prisma cascades don't fire. Replies, reactions, bookmarks, and reports all remain in the DB. The soft-delete approach means replies to removed threads are still returned by `getReplies` (no `isRemoved` check on parent thread in replies query). Chain continuations are orphaned (A08-17). Hashtag counts are decremented (good). User thread count is decremented (good). |
| 6 | **DTO validation** — Content length, media URLs validated? | **PARTIAL FAIL** | Content `@MaxLength(500)` (good). `mediaUrls` uses `@IsUrl({})` but accepts any domain (A08-13). `mediaTypes` accepts any string (A08-12). Poll options have no min length (A08-19), poll has no min options count (A08-20). Report reason is free-text when it should be enum (A08-15). ReplyPermission DTO/Prisma case mismatch (A08-10). |
| 7 | **Blocked users** — Thread replies from blocked users visible? | **PARTIAL FAIL** | `getReplies` correctly filters blocked/muted users via `getExcludedUserIds` (line 848). However, `addReply` does NOT check blocks before creating the reply (A08-02). `like`, `repost`, `bookmark` don't check blocks (A08-03). `getUserThreads` doesn't check blocks for anonymous viewers. `shareToStory` and `getThreadUnroll` don't check blocks (A08-21, A08-22). |
| 8 | **Moderation** — Is thread content moderated on create/update? | **PASS** | `create` (line 336), `updateThread` (line 567), `addReply` (line 933), and `createContinuation` (line 613) all call `contentSafety.moderateText()`. Image moderation runs on create (line 347). However, image moderation can be bypassed via `mediaTypes` spoofing (A08-12). |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 3 |
| MEDIUM | 9 |
| LOW | 5 |
| INFO | 4 |
| **Total** | **22** |
