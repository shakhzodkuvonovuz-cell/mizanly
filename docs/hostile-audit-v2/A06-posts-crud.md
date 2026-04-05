# A06: Posts CRUD Audit

**Scope:** `posts.controller.ts`, `posts.service.ts` (create/update/delete focus), `create-post.dto.ts`, `update-post.dto.ts`  
**Auditor:** Hostile code audit, line-by-line  
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] F01 -- Update/Delete endpoints missing rate limiting

**File:** `apps/api/src/modules/posts/posts.controller.ts`, lines 125-143  
**Evidence:**  
```ts
// line 125-134 — PATCH :id — no @Throttle
@Patch(':id')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Edit post content' })
update(...)

// line 137-143 — DELETE :id — no @Throttle
@Delete(':id')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Delete (soft-remove) a post' })
delete(...)
```
**Impact:** An authenticated attacker can spam update/delete requests at unlimited rate. Update triggers content moderation (`moderateText`) and Prisma queries per call -- CPU exhaustion. Delete triggers transaction + search index removal + feed cache invalidation per call. No rate limit means thousands of writes/second against the DB.  
**Checklist item:** 3 (Missing rate limit)

---

### [CRITICAL] F02 -- View count inflation: no deduplication, no rate limit, no auth required

**File:** `posts.controller.ts` line 102-122, `posts.service.ts` lines 791-796  
**Evidence:**  
```ts
// controller line 102-103: OptionalClerkAuthGuard — anonymous requests allowed
@Get(':id')
@UseGuards(OptionalClerkAuthGuard)

// controller line 112: fire-and-forget view increment on EVERY GET request
this.postsService.recordView(id);

// service line 791-796: raw increment, no dedup
async recordView(postId: string): Promise<void> {
  await this.prisma.post.update({
    where: { id: postId },
    data: { viewsCount: { increment: 1 } },
  }).catch(...);
}
```
**Impact:** Any anonymous user (or bot) can call `GET /posts/:id` in a loop to inflate `viewsCount` to arbitrary values. There is no per-user dedup (unlike `trackImpression` which uses HyperLogLog), no rate limit on the GET endpoint, and no auth required. This corrupts the engagement metrics used by the for-you feed scoring algorithm (`post.viewsCount * 0.1` at service line 142), allowing an attacker to manipulate feed rankings.  
**Checklist item:** 3, 4 (Missing rate limit, Race conditions)

---

### [HIGH] F03 -- Update method accepts Partial<CreatePostDto> but controller passes UpdatePostDto (only content)

**File:** `posts.service.ts` line 798, `posts.controller.ts` line 129-134  
**Evidence:**  
```ts
// service line 798 — accepts Partial<CreatePostDto> which includes ALL creation fields
async update(postId: string, userId: string, data: Partial<CreatePostDto>) {

// service lines 821-835 — blindly spreads fields from data, including:
data: {
  content: data.content ? sanitizeText(data.content) : data.content,
  hideLikesCount: data.hideLikesCount,    // from CreatePostDto
  commentsDisabled: data.commentsDisabled, // from CreatePostDto
  isSensitive: data.isSensitive,           // from CreatePostDto
  altText: data.altText,                   // from CreatePostDto
  ...
}
```
The `UpdatePostDto` only validates `content` (line 1-8 of update-post.dto.ts). But the service method signature accepts `Partial<CreatePostDto>`. This means the controller's DTO validation gates content only, but the service method internally passes through `hideLikesCount`, `commentsDisabled`, `isSensitive`, and `altText` from `data` -- these would be `undefined` from the UpdatePostDto, but the service trusts whatever is in the `data` parameter. If another internal caller uses this method with a wider object, those fields would be written without validation.  

**More critically:** The 15-minute edit window check (line 807) only guards `data.content !== undefined`. Fields like `hideLikesCount`, `commentsDisabled`, `isSensitive`, and `altText` can be changed at ANY time after post creation, bypassing the edit window entirely. This is likely intentional for settings-type fields but is undocumented and the mixed typing is confusing.  
**Checklist item:** 6 (DTO validation)

---

### [HIGH] F04 -- Soft-delete does NOT cascade to related records (comments, reactions, saves, tags, reports)

**File:** `posts.service.ts` lines 862-897  
**Evidence:**  
```ts
async delete(postId: string, userId: string) {
  // ...
  await this.prisma.$transaction([
    this.prisma.post.update({
      where: { id: postId },
      data: { isRemoved: true, removedAt: new Date(), removedById: userId },
    }),
    this.prisma.$executeRaw`UPDATE "users" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${userId}`,
  ]);
  // Hashtag decrement follows...
}
```
**Missing cascades:**
- `PostReaction` records remain -- `likesCount` on deleted posts still referenced
- `Comment` records remain with `isRemoved: false` -- comments on deleted posts are orphaned
- `SavedPost` records remain -- users see "saved" posts that no longer exist
- `PostTaggedUser` records remain -- tagged users have dangling references
- `Report` records remain -- but this is arguably correct for moderation audit
- `CollabInvite` records remain

While feed queries filter `isRemoved: false`, the `getComments` query (line 1249) only checks `postId` and `isRemoved: false` on the comment itself -- if someone directly accesses comments of a deleted post via `GET /posts/:id/comments`, the `getById` call would 404 first, but `getComments` does NOT check if the parent post is removed. The comments are still fetched from DB and occupy storage indefinitely.  
**Checklist item:** 5 (Cascade)

---

### [HIGH] F05 -- `mediaTypes` array accepts arbitrary strings without validation

**File:** `apps/api/src/modules/posts/dto/create-post.dto.ts` lines 36-41  
**Evidence:**  
```ts
@IsOptional()
@IsArray()
@IsString({ each: true })
@ArrayMaxSize(10)
mediaTypes?: string[];
```
No `@IsEnum`, `@Matches`, or `@IsIn` validation on media type values. The service code checks `mediaTypes?.[idx]?.startsWith('image')` (line 667, 677, 679) for image moderation routing. An attacker can pass `mediaTypes: ['ximage/png']` to bypass image moderation entirely while still uploading an image to `mediaUrls`. This defeats the NSFW/content moderation pipeline for images.  
**Checklist item:** 6 (DTO validation)

---

### [HIGH] F06 -- `hashtags` array entries have no MaxLength or pattern validation

**File:** `apps/api/src/modules/posts/dto/create-post.dto.ts` lines 69-74  
**Evidence:**  
```ts
@IsOptional()
@IsArray()
@IsString({ each: true })
@ArrayMaxSize(20)
hashtags?: string[];
```
No `@MaxLength({ each: true })` on individual hashtag strings, and no `@Matches` for valid hashtag characters. An attacker can submit hashtag strings of arbitrary length (megabytes per string, 20 strings) to:
1. Bloat the PostgreSQL `hashtags` text array column
2. Cause the `extractHashtags` utility and hashtag upsert query to process extremely long strings
3. Pollute the `hashtags` table with garbage entries via the `createMany` at service line 458-461
4. The raw SQL `UPDATE hashtags SET "postsCount"...WHERE name = ANY(${hashtagNames}::text[])` processes these unbounded strings  
**Checklist item:** 6 (DTO validation)

---

### [MEDIUM] F07 -- Race condition on reaction count: react/unreact has TOCTOU gap

**File:** `posts.service.ts` lines 899-998  
**Evidence:**  
```ts
// react() — line 935-937: check-then-act with gap between check and create
const existing = await this.prisma.postReaction.findUnique({
  where: { userId_postId: { userId, postId } },
});

if (existing) {
  // Update reaction type — line 941
  await this.prisma.postReaction.update(...);
} else {
  // Create + increment — line 947-955 (in transaction)
  try {
    await this.prisma.$transaction([
      this.prisma.postReaction.create(...),
      this.prisma.post.update({ data: { likesCount: { increment: 1 } } }),
    ]);
```
Two concurrent `react()` calls for the same user+post: both `findUnique` return null, both enter the `else` branch, both attempt `$transaction`. The P2002 catch (line 968) handles the duplicate reaction gracefully, BUT the second request's transaction still increments `likesCount` before the unique constraint fires on the create. Prisma transactions with `$transaction([...])` (batch mode) do NOT guarantee atomicity of the array -- each statement runs sequentially but the unique constraint violation on `postReaction.create` would roll back the entire batch. So the count is actually safe due to transaction rollback. However, the `redis.publish` at line 976 fires OUTSIDE the transaction with a stale `likesCount` value (`post.likesCount + (existing ? 0 : 1)`) -- this publishes an incorrect real-time count on race conditions.

The `unreact()` method (line 985-998) has a similar TOCTOU: two concurrent unreact calls could both find `existing`, both enter the transaction. The delete would fail for the second (record already deleted), but the raw SQL `GREATEST("likesCount" - 1, 0)` would double-decrement.  
**Checklist item:** 4 (Race conditions)

---

### [MEDIUM] F08 -- `scheduledAt` accepts past dates without validation

**File:** `apps/api/src/modules/posts/dto/create-post.dto.ts` lines 174-177  
**Evidence:**  
```ts
@IsOptional()
@IsDateString()
scheduledAt?: string;
```
No `@MinDate` or custom validator ensuring `scheduledAt` is in the future. A user can submit `scheduledAt: "2020-01-01T00:00:00Z"` (past date). The service (line 503) stores it as-is: `scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null`. Feed queries filter with `scheduledAt: { lte: new Date() }` so the post would be visible, but the "scheduled" post flag (`isScheduled` at line 452) would be `true`, causing side effects to be skipped: no mention notifications, no tag notifications, no gamification XP, no analytics tracking (lines 567-656). The post would also skip `publishWorkflow.onPublish` (line 689), meaning it would never be indexed in search.  
**Checklist item:** 6 (DTO validation)

---

### [MEDIUM] F09 -- Comment delete double-decrements `commentsCount` when post author deletes

**File:** `posts.service.ts` lines 1475-1492  
**Evidence:**  
```ts
async deleteComment(commentId: string, userId: string) {
  const comment = await this.prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: { select: { userId: true } } },
  });
  if (!comment) throw new NotFoundException('Comment not found');
  // Allow both comment author AND post owner to delete
  if (comment.userId !== userId && comment.post?.userId !== userId) throw new ForbiddenException();

  await this.prisma.$transaction([
    this.prisma.comment.update({
      where: { id: commentId },
      data: { isRemoved: true },
    }),
    this.prisma.$executeRaw`UPDATE "posts" SET "commentsCount" = GREATEST("commentsCount" - 1, 0) WHERE id = ${comment.postId}`,
  ]);
```
If the comment author and the post owner both call `deleteComment` concurrently: comment author's call sets `isRemoved: true` and decrements count. Post owner's call finds the comment (it still exists, just soft-deleted), passes the ownership check (they're the post owner), sets `isRemoved: true` again (no-op), and decrements `commentsCount` AGAIN. The `isRemoved` check is missing -- the method does not verify `comment.isRemoved === false` before proceeding.  
**Checklist item:** 4 (Race conditions)

---

### [MEDIUM] F10 -- `update` method passes `undefined` fields to Prisma causing no-op overwrites

**File:** `posts.service.ts` lines 821-837  
**Evidence:**  
```ts
const updated = await this.prisma.post.update({
  where: { id: postId },
  data: {
    content: data.content ? sanitizeText(data.content) : data.content,
    hideLikesCount: data.hideLikesCount,      // undefined if not in DTO
    commentsDisabled: data.commentsDisabled,   // undefined if not in DTO
    isSensitive: data.isSensitive,             // undefined if not in DTO
    altText: data.altText,                     // undefined if not in DTO
    editedAt: new Date(),  // ALWAYS set, even if nothing changed
    editHistory: [
      ...((post.editHistory as Array<...>) ?? []),
      { content: post.content, editedAt: new Date().toISOString() },
    ].slice(-10),  // ALWAYS appends, even if content unchanged
  },
```
1. `editedAt` is always set to `new Date()` even when only settings fields change (not content). This misleads users into thinking content was edited.
2. `editHistory` always appends the current content as a snapshot even when `data.content` is undefined (no actual content change). This fills up the 10-slot edit history with duplicate snapshots.
3. When `data.content` is empty string `""`, the ternary `data.content ? sanitizeText(data.content) : data.content` evaluates to `data.content` (falsy), writing the raw empty string without sanitization. This is a minor inconsistency -- empty string bypasses `sanitizeText`.  
**Checklist item:** 4, 6 (Race conditions, DTO validation)

---

### [MEDIUM] F11 -- `getCommentReplies` does not check excluded users (blocks/mutes)

**File:** `posts.service.ts` lines 1279-1304, `posts.controller.ts` lines 231-239  
**Evidence:**  
```ts
// controller line 231-239 — no userId passed to getCommentReplies
@Get(':id/comments/:commentId/replies')
@UseGuards(OptionalClerkAuthGuard)
getCommentReplies(
  @Param('commentId') commentId: string,
  @Query('cursor') cursor?: string,
) {
  return this.postsService.getCommentReplies(commentId, cursor);
}

// service line 1279-1304 — no viewer filtering for blocks/mutes
async getCommentReplies(commentId: string, cursor?: string, limit = 20) {
  const replies = await this.prisma.comment.findMany({
    where: { parentId: commentId, isRemoved: false, isHidden: false, 
             user: { isBanned: false, isDeactivated: false, isDeleted: false } },
```
Compare with `getComments` (line 1247-1252) which receives `viewerId` and calls `getExcludedUserIds` to filter out blocked/muted users. `getCommentReplies` has no such filtering -- blocked users' replies are visible. The controller doesn't even pass the viewer's ID.  
**Checklist item:** 7 (Error exposure / privacy leak)

---

### [MEDIUM] F12 -- Hashtag counter decrement outside transaction on delete

**File:** `posts.service.ts` lines 876-878  
**Evidence:**  
```ts
// Inside delete() — the main transaction ends at line 873
await this.prisma.$transaction([
  this.prisma.post.update({ where: { id: postId }, data: { isRemoved: true, ... } }),
  this.prisma.$executeRaw`UPDATE "users" SET "postsCount" = GREATEST("postsCount" - 1, 0) ...`,
]);

// Hashtag decrement runs AFTER the transaction — line 876-878
if (post.hashtags && post.hashtags.length > 0) {
  await this.prisma.$executeRaw`UPDATE "hashtags" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE name = ANY(${post.hashtags}::text[])`;
}
```
If the hashtag decrement fails (DB error, connection drop), the post is already soft-deleted but hashtag counters remain inflated. This should be inside the transaction. Also, no `.catch()` on this await -- an unhandled error here would propagate as a 500 to the caller even though the delete itself succeeded.  
**Checklist item:** 4, 5 (Race conditions, Cascade)

---

### [MEDIUM] F13 -- `crossPost` does not validate `space` field existence on original post

**File:** `posts.service.ts` lines 1731-1777  
**Evidence:**  
```ts
// line 1745: filters targets that don't match current space
const targets = dto.targetSpaces.filter(s => validSpaces.includes(s) && s !== post.space);
```
The `post.space` field is read from the original post, but the `findFirst` query at line 1732 does `select` all fields (no explicit select). If `post.space` is null/undefined (e.g., for posts created before the `space` column was added), then `s !== post.space` is always true, allowing cross-posting to ALL 4 spaces including potentially the post's own space (if it was implicitly SAF). This creates duplicate content.  
**Checklist item:** 6 (DTO validation)

---

### [LOW] F14 -- `editComment` has no edit window (unlike post editing which has 15-minute limit)

**File:** `posts.service.ts` lines 1451-1473  
**Evidence:**  
```ts
async editComment(commentId: string, userId: string, content: string) {
  const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.isRemoved) throw new NotFoundException('Comment not found');
  if (comment.userId !== userId) throw new ForbiddenException();
  // No age check — comments can be edited indefinitely
```
Posts have a 15-minute edit window to prevent bait-and-switch (line 804-809). Comments have no such restriction. A user can post an innocuous comment, get likes/engagement, then edit it to say anything -- including harmful content that now appears endorsed by the likers.  
**Checklist item:** 4 (Race conditions -- bait-and-switch)

---

### [LOW] F15 -- `archive` and `pin` endpoints missing rate limiting

**File:** `posts.controller.ts` lines 316-332, 334-358  
**Evidence:**  
```ts
// line 316-322 — POST :id/archive — no @Throttle
@Post(':id/archive')
@UseGuards(ClerkAuthGuard)

// line 325-332 — DELETE :id/archive — no @Throttle
@Delete(':id/archive')
@UseGuards(ClerkAuthGuard)

// line 334-345 — POST :id/comments/:commentId/pin — no @Throttle
@Post(':id/comments/:commentId/pin')
@UseGuards(ClerkAuthGuard)

// line 347-358 — DELETE :id/comments/:commentId/pin — no @Throttle
@Delete(':id/comments/:commentId/pin')
@UseGuards(ClerkAuthGuard)
```
Also missing on: `hide`/`unhide` comment (lines 361-385), `getShareLink` (line 387-393), `getRelatedPosts` (line 448-452), `getPostAnalytics` (line 470-479), `getRepurposeSuggestions` (line 482-491).

**Impact:** Lower severity since these are auth-required and mostly read-heavy, but `archive`/`unarchive` trigger transactions. `getPostAnalytics` triggers a `findMany` with `take: 50` on every call -- could be used for DB load amplification.  
**Checklist item:** 3 (Missing rate limit)

---

### [LOW] F16 -- `postType` stored as raw string cast, not validated against Prisma enum values

**File:** `posts.service.ts` line 478  
**Evidence:**  
```ts
postType: dto.postType as PostType,
```
The DTO validates `@IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'])` which matches the Prisma `PostType` enum. However, the cast `as PostType` is a TypeScript compile-time assertion only. If the Prisma enum is ever extended (e.g., `POLL`, `AUDIO`) without updating the DTO, the DTO would reject valid types. Conversely, if the DTO array is extended without updating the Prisma enum, Prisma would throw a runtime error. The DTO and Prisma enum are not linked -- they can drift.  
**Checklist item:** 6 (DTO validation)

---

### [LOW] F17 -- `visibility` cast without validation against Prisma enum

**File:** `posts.service.ts` line 480  
**Evidence:**  
```ts
visibility: (dto.visibility as PostVisibility) ?? PostVisibility.PUBLIC,
```
Same issue as F16. The DTO `@IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE'])` is a parallel definition to `PostVisibility`. If Prisma adds a new visibility level, the DTO won't know about it.  
**Checklist item:** 6 (DTO validation)

---

### [LOW] F18 -- `getById` leaks `isRemoved` field in response

**File:** `posts.service.ts` lines 721-724  
**Evidence:**  
```ts
select: {
  ...POST_SELECT,
  isRemoved: true,  // Explicitly included in the select
  sharedPost: { ... },
},
```
The `POST_SELECT` constant does not include `isRemoved`, but the `getById` query explicitly adds it. While the query filters `isRemoved: false`, the field value (`false`) is still returned to the client. This is a minor information leak -- it tells the client that the `isRemoved` field exists, aiding reconnaissance.  
**Checklist item:** 7 (Error exposure)

---

### [INFO] F19 -- `UpdatePostDto` is extremely thin compared to updatable fields

**File:** `apps/api/src/modules/posts/dto/update-post.dto.ts` (entire file)  
**Evidence:**  
```ts
export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}
```
The service's `update` method (line 821-835) writes `hideLikesCount`, `commentsDisabled`, `isSensitive`, and `altText` from the data parameter. But the DTO only validates `content`. If these settings-toggle fields are meant to be updatable via the API, they need validation decorators in `UpdatePostDto`. If they are NOT meant to be updatable via this endpoint, the service should not reference them. Current state: the controller's DTO validation strips unknown fields (if `whitelist: true` is set in the global validation pipe), so these fields are likely always `undefined`. But this depends on global pipe configuration -- if `whitelist` is not enabled, arbitrary fields pass through.  
**Checklist item:** 6 (DTO validation)

---

### [INFO] F20 -- Duplicate `actorUsername` fetch in post creation side effects

**File:** `posts.service.ts` lines 570-597  
**Evidence:**  
```ts
// line 570-574: Fetches actor username for mention notifications
const [mentionedUsers, actor] = await Promise.all([
  this.prisma.user.findMany({ where: { username: { in: dto.mentions } }, ... }),
  this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
]);

// line 594-597: Fetches actor username AGAIN for tag/collab notifications
const actorUsername = needsActor
  ? (await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }))?.username ?? 'Someone'
  : undefined;
```
The actor's username is fetched twice from the database. Not a security bug but a performance issue on every post creation.  
**Checklist item:** N/A (code quality)

---

## Checklist Verification

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | **BOLA** -- Can user A edit/delete user B's post? | **PASS** | `update()` line 801: `if (post.userId !== userId) throw new ForbiddenException()`. `delete()` line 865: same check. `pinPost()` line 1811: same. `archivePost()` line 1579: same. `pinComment()` line 1640: same. `hideComment()` line 1683: checks `comment.post.userId !== userId`. `respondToTag()` line 1835: checks `postTag.userId !== userId`. All ownership checks present. |
| 2 | **Missing pagination** -- Any findMany without take? | **PASS** | All `findMany` calls have `take` limits. Feed: `take: 500` (scored cache), `take: limit + 1` (paginated). Comments: `take: limit + 1`. Collections: `take: 21`. Follows: `take: 5000`. Analytics: `take: 50`. Related posts: `take: limit` (default 5). |
| 3 | **Missing rate limit** | **FAIL** | F01: `PATCH :id` (update) and `DELETE :id` (delete) have no `@Throttle`. F15: archive, unarchive, pin/unpin comment, hide/unhide comment, getShareLink, getRelatedPosts, getPostAnalytics, getRepurposeSuggestions all missing `@Throttle`. F02: `GET :id` has no rate limit and increments view counter. |
| 4 | **Race conditions** | **FAIL** | F07: react/unreact TOCTOU gap. F09: deleteComment double-decrement when called concurrently. F10: editHistory always appends even without content change. F12: hashtag decrement outside transaction. |
| 5 | **Cascade** -- Post delete cleans up? | **FAIL** | F04: Soft-delete sets `isRemoved: true` and decrements user.postsCount + hashtag.postsCount, but does NOT cascade to PostReaction, Comment, SavedPost, PostTaggedUser, CollabInvite. F12: hashtag decrement is outside the transaction. |
| 6 | **DTO validation** | **FAIL** | F03: UpdatePostDto only validates content but service accepts wider type. F05: mediaTypes has no enum/pattern validation. F06: hashtags entries have no MaxLength. F08: scheduledAt allows past dates. F16/F17: postType/visibility use parallel enum definitions. F19: UpdatePostDto missing fields the service writes. |
| 7 | **Error exposure** | **PARTIAL PASS** | F18: `isRemoved` field leaked in getById response. No stack traces or internal IDs exposed in error messages. All auth failures return generic 403/404. |
| 8 | **Soft delete** | **PASS (with caveats)** | Delete uses soft-delete (`isRemoved: true`). All feed/list queries filter `isRemoved: false`. getById filters `isRemoved: false`. BUT: related records (comments, reactions, saves) remain accessible if queried directly. |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 4 |
| MEDIUM | 7 |
| LOW | 5 |
| INFO | 2 |
| **Total** | **20** |
